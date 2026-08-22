import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { eventAcceptsEntries, getEventBySlug, effectiveEventStatus } from "@/lib/server/simuladoEvents";
import { generateSecureToken, hashEmailActionToken } from "@/lib/security/registrationTokens";
import { verifyRecaptchaToken } from "@/lib/server/recaptcha";
import { getPublicAppUrl } from "@/lib/server/publicAppUrl";
import { Resend } from "resend";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { logSecurityEvent } from "@/lib/logging/security-log";
import { eventContinueRegistrationPlainText, eventContinueRegistrationTemplate } from "@/lib/email/studentRegistrationTemplates";

const RECAPTCHA_ACTION = "event_join_request";
const RESEND_COOLDOWN_MS = 60_000;

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data: event } = await getEventBySlug(slug);
  if (!event) return NextResponse.json({ ok: false, message: "Evento não encontrado." }, { status: 404 });
  const supabase = createSupabaseAdminClient();
  const { data: teachers } = await supabase.from("simulado_event_professors").select("professors:professor_id(name)").eq("event_id", event.id);
  return NextResponse.json({ ok: true, message: "Evento carregado.", event: { id: event.id, name: event.name, status: effectiveEventStatus(event), starts_at: event.starts_at, ends_at: event.ends_at, teachers: (teachers || []).map((row) => row.professors).filter(Boolean) } });
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await request.json().catch(() => null) as { email?: unknown; captcha_token?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ ok: false, message: "Informe um e-mail válido." }, { status: 400 });
  const captchaToken = typeof body?.captcha_token === "string" ? body.captcha_token : "";
  const captcha = await verifyRecaptchaToken(captchaToken, RECAPTCHA_ACTION);
  if (!captcha.ok) {
    void logSecurityEvent({ request, eventType: "event_join_recaptcha_rejected", actorType: "system", riskLevel: "medium", blocked: true, reason: captcha.reason, metadata: { event_slug: slug } });
    return NextResponse.json({ ok: false, message: "Não foi possível validar o envio. Tente novamente." }, { status: 400 });
  }
  const { data: event } = await getEventBySlug(slug);
  if (!event) return NextResponse.json({ ok: false, message: "Evento não encontrado." }, { status: 404 });
  if (!eventAcceptsEntries(event) && effectiveEventStatus(event) !== "scheduled") return NextResponse.json({ ok: false, message: "Este Evento não aceita novas participações." }, { status: 409 });
  const supabase = createSupabaseAdminClient();
  // O cooldown usa created_at da intent como prova de envio real. Só existe
  // intent com expires_at no futuro quando o Resend de fato confirmou sucesso
  // para ela (ver mais abaixo: falha de envio invalida a intent no mesmo
  // instante, via UPDATE de expires_at para o passado, em vez de deixá-la
  // "fantasma" bloqueando novas tentativas por até 60s).
  const { data: recentIntent } = await supabase.from("simulado_event_join_intents").select("created_at").eq("event_id", event.id).eq("email", email).is("consumed_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (recentIntent) {
    const elapsedMs = Date.now() - new Date(recentIntent.created_at).getTime();
    if (elapsedMs < RESEND_COOLDOWN_MS) {
      const secondsRemaining = Math.max(1, Math.ceil((RESEND_COOLDOWN_MS - elapsedMs) / 1000));
      return NextResponse.json({ ok: true, message: `Já enviamos um e-mail para este endereço há poucos instantes. Aguarde ${secondsRemaining} segundo(s) e confira sua caixa de entrada antes de solicitar outro.` });
    }
  }
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) return NextResponse.json({ ok: false, message: "Não foi possível enviar a confirmação agora." }, { status: 503 });
  let publicAppUrl = "";
  try { publicAppUrl = getPublicAppUrl(); } catch { return NextResponse.json({ ok: false, message: "Não foi possível enviar a confirmação agora." }, { status: 503 }); }
  const token = generateSecureToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const confirmationUrl = `${publicAppUrl}/evento/${encodeURIComponent(slug)}?token=${encodeURIComponent(token)}`;
  // A intent é gravada ANTES do envio — nunca depois. Se o token só existisse
  // no banco após a resposta do Resend, um e-mail entregue muito rápido
  // (ou verificado automaticamente por um scanner de segurança do provedor de
  // e-mail do destinatário) poderia levar o destinatário a clicar no link
  // antes do INSERT terminar, fazendo /confirm rejeitar um token válido como
  // "inválido ou expirado". Gravar antes elimina essa corrida.
  await supabase.from("simulado_event_join_intents").delete().eq("event_id", event.id).eq("email", email).is("consumed_at", null);
  const { data: intent, error } = await supabase.from("simulado_event_join_intents").insert({ event_id: event.id, email, token_hash: hashEmailActionToken(token), expires_at: expiresAt }).select("id").single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ ok: true, message: "Confira seu e-mail para continuar." });
    return NextResponse.json({ ok: false, message: "Não foi possível preservar seu ingresso no Evento." }, { status: 500 });
  }
  const { error: emailError } = await new Resend(resendApiKey).emails.send({
    from: "EstudoTOP <estudotop@estudotop.com.br>", replyTo: "estudotop@estudotop.com.br", to: email,
    subject: `Continue sua inscrição — ${event.name}`,
    html: eventContinueRegistrationTemplate({ eventName: event.name, continueUrl: confirmationUrl }),
    text: eventContinueRegistrationPlainText({ eventName: event.name, continueUrl: confirmationUrl }),
  });
  if (emailError) {
    // Invalida imediatamente em vez de depender de DELETE (que também poderia
    // falhar sem verificação): com expires_at no passado, esta intent nunca
    // mais aparece no cooldown check acima nem é aceita por /confirm — e o
    // índice único parcial (consumed_at is null) é liberado da mesma forma,
    // pois o filtro é só por consumed_at, não por expires_at.
    await supabase.from("simulado_event_join_intents").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", intent.id);
    return NextResponse.json({ ok: false, message: "Não foi possível enviar a confirmação agora. Tente novamente em instantes." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, message: "Confira seu e-mail para continuar." });
}

export async function PUT(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const student = await getStudentFromRequest(request);
  if (!student) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });
  const { slug } = await params;
  const { data: event } = await getEventBySlug(slug);
  if (!event) return NextResponse.json({ ok: false, message: "Evento não encontrado." }, { status: 404 });
  const status = effectiveEventStatus(event);
  if (status === "closed" || status === "archived") return NextResponse.json({ ok: false, message: "Este Evento não aceita novas participações." }, { status: 409 });
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("simulado_event_participants").upsert({ event_id: event.id, student_id: student.id, source: "public_link" }, { onConflict: "event_id,student_id", ignoreDuplicates: true });
  if (error) return NextResponse.json({ ok: false, message: "Não foi possível confirmar sua participação." }, { status: 500 });
  return NextResponse.json({ ok: true, message: "Participação confirmada.", event_id: event.id });
}
