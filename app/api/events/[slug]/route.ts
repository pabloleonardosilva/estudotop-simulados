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
  const { data: recentIntent } = await supabase.from("simulado_event_join_intents").select("created_at").eq("event_id", event.id).eq("email", email).is("consumed_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (recentIntent && Date.now() - new Date(recentIntent.created_at).getTime() < RESEND_COOLDOWN_MS) {
    return NextResponse.json({ ok: true, message: "Confira seu e-mail para continuar." });
  }
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) return NextResponse.json({ ok: false, message: "Não foi possível enviar a confirmação agora." }, { status: 503 });
  let publicAppUrl = "";
  try { publicAppUrl = getPublicAppUrl(); } catch { return NextResponse.json({ ok: false, message: "Não foi possível enviar a confirmação agora." }, { status: 503 }); }
  const token = generateSecureToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await supabase.from("simulado_event_join_intents").delete().eq("event_id", event.id).eq("email", email).is("consumed_at", null);
  const { error } = await supabase.from("simulado_event_join_intents").insert({ event_id: event.id, email, token_hash: hashEmailActionToken(token), expires_at: expiresAt });
  if (error) {
    if (error.code === "23505") return NextResponse.json({ ok: true, message: "Confira seu e-mail para continuar." });
    return NextResponse.json({ ok: false, message: "Não foi possível preservar seu ingresso no Evento." }, { status: 500 });
  }
  const confirmationUrl = `${publicAppUrl}/evento/${encodeURIComponent(slug)}?token=${encodeURIComponent(token)}`;
  const { error: emailError } = await new Resend(resendApiKey).emails.send({
    from: "EstudoTOP <estudotop@estudotop.com.br>", replyTo: "estudotop@estudotop.com.br", to: email,
    subject: `Continue sua inscrição — ${event.name}`,
    html: eventContinueRegistrationTemplate({ eventName: event.name, continueUrl: confirmationUrl }),
    text: eventContinueRegistrationPlainText({ eventName: event.name, continueUrl: confirmationUrl }),
  });
  if (emailError) {
    await supabase.from("simulado_event_join_intents").delete().eq("token_hash", hashEmailActionToken(token));
    return NextResponse.json({ ok: false, message: "Não foi possível enviar a confirmação agora." }, { status: 502 });
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
