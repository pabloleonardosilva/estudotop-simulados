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
const CONFIRMATION_MESSAGE = "Enviamos um e-mail para você continuar sua inscrição neste Evento.";
const REPLACEMENT_CONFIRMATION_MESSAGE = "Enviamos um novo e-mail. Por segurança, use o link da mensagem mais recente; links anteriores deixam de funcionar.";

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
  const captcha = await verifyRecaptchaToken(captchaToken, RECAPTCHA_ACTION, { minScore: 0.3 });
  if (!captcha.ok) {
    void logSecurityEvent({
      request,
      eventType: "event_join_recaptcha_rejected",
      actorType: "system",
      riskLevel: "medium",
      blocked: true,
      reason: captcha.reason,
      metadata: captcha.reason === "recaptcha_rejected" ? captcha.diagnostics : {},
    });
    return NextResponse.json({ ok: false, message: "Não foi possível validar o envio. Tente novamente." }, { status: 400 });
  }
  void logSecurityEvent({
    request,
    eventType: "event_join_recaptcha_accepted",
    actorType: "system",
    riskLevel: "low",
    blocked: false,
    metadata: captcha.diagnostics,
  });
  const { data: event } = await getEventBySlug(slug);
  if (!event) return NextResponse.json({ ok: false, message: "Evento não encontrado." }, { status: 404 });
  if (!eventAcceptsEntries(event) && effectiveEventStatus(event) !== "scheduled") return NextResponse.json({ ok: false, message: "Este Evento não aceita novas participações." }, { status: 409 });
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data: pendingIntent, error: pendingIntentError } = await supabase.from("simulado_event_join_intents").select("id,token_hash,expires_at,created_at").eq("event_id", event.id).eq("email", email).is("consumed_at", null).maybeSingle();
  if (pendingIntentError) return NextResponse.json({ ok: false, message: "Não foi possível preparar um novo link agora. Tente novamente em instantes." }, { status: 500 });
  const recentIntent = pendingIntent && pendingIntent.expires_at > now ? pendingIntent : null;
  if (recentIntent) {
    const elapsedMs = Date.now() - new Date(recentIntent.created_at).getTime();
    if (elapsedMs < RESEND_COOLDOWN_MS) {
      const secondsRemaining = Math.max(1, Math.ceil((RESEND_COOLDOWN_MS - elapsedMs) / 1000));
      return NextResponse.json({ ok: true, state: "confirmation_pending", message: `Um e-mail foi enviado recentemente. Aguarde ${secondsRemaining} segundo(s) antes de solicitar outro e confira sua caixa de entrada.` });
    }
  }
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) return NextResponse.json({ ok: false, message: "Não foi possível enviar a confirmação agora." }, { status: 503 });
  let publicAppUrl = "";
  try { publicAppUrl = getPublicAppUrl(); } catch { return NextResponse.json({ ok: false, message: "Não foi possível enviar a confirmação agora." }, { status: 503 }); }
  const token = generateSecureToken();
  const tokenHash = hashEmailActionToken(token);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const issuedAt = new Date().toISOString();
  const confirmationUrl = `${publicAppUrl}/evento/${encodeURIComponent(slug)}?token=${encodeURIComponent(token)}`;
  // A intent é gravada ANTES do envio — nunca depois. Se o token só existisse
  // no banco após a resposta do Resend, um e-mail entregue muito rápido
  // (ou verificado automaticamente por um scanner de segurança do provedor de
  // e-mail do destinatário) poderia levar o destinatário a clicar no link
  // antes do INSERT terminar, fazendo /confirm rejeitar um token válido como
  // "inválido ou expirado". Gravar antes elimina essa corrida.
  let intentId = "";
  if (pendingIntent) {
    const { data: replacedIntent, error: replaceError } = await supabase.from("simulado_event_join_intents").update({ token_hash: tokenHash, expires_at: expiresAt, created_at: issuedAt }).eq("id", pendingIntent.id).eq("token_hash", pendingIntent.token_hash).is("consumed_at", null).select("id").maybeSingle();
    if (replaceError) {
      void logSecurityEvent({ request, eventType: "event_join_intent_replace_failed", actorType: "system", riskLevel: "medium", blocked: true, reason: "update_failed", metadata: { event_id: event.id, intent_id: pendingIntent.id } });
      return NextResponse.json({ ok: false, message: "Não foi possível preparar um novo link agora. Tente novamente em instantes." }, { status: 500 });
    }
    if (!replacedIntent) {
      void logSecurityEvent({ request, eventType: "event_join_intent_replace_conflict", actorType: "system", riskLevel: "low", blocked: true, reason: "state_changed", metadata: { event_id: event.id, intent_id: pendingIntent.id } });
      return NextResponse.json({ ok: true, state: "confirmation_pending", message: CONFIRMATION_MESSAGE });
    }
    intentId = replacedIntent.id;
    void logSecurityEvent({ request, eventType: "event_join_intent_replaced", actorType: "system", riskLevel: "low", blocked: false, metadata: { event_id: event.id, intent_id: pendingIntent.id } });
  } else {
    const { data: insertedIntent, error: insertError } = await supabase.from("simulado_event_join_intents").insert({ event_id: event.id, email, token_hash: tokenHash, expires_at: expiresAt }).select("id").single();
    if (insertError) {
      if (insertError.code === "23505") return NextResponse.json({ ok: true, state: "confirmation_pending", message: CONFIRMATION_MESSAGE });
      return NextResponse.json({ ok: false, message: "Não foi possível preservar seu ingresso no Evento." }, { status: 500 });
    }
    intentId = insertedIntent.id;
  }
  let emailError: unknown = null;
  try {
    const sendResult = await new Resend(resendApiKey).emails.send({
      from: "EstudoTOP <estudotop@estudotop.com.br>", replyTo: "estudotop@estudotop.com.br", to: email,
      subject: `Continue sua inscrição — ${event.name}`,
      html: eventContinueRegistrationTemplate({ eventName: event.name, continueUrl: confirmationUrl }),
      text: eventContinueRegistrationPlainText({ eventName: event.name, continueUrl: confirmationUrl }),
    });
    emailError = sendResult.error;
  } catch {
    void logSecurityEvent({ request, eventType: "event_join_intent_send_failed", actorType: "system", riskLevel: "high", blocked: false, reason: "ambiguous_provider_failure", metadata: { event_id: event.id, intent_id: intentId } });
    return NextResponse.json({ ok: false, message: "Não foi possível enviar a confirmação agora. Tente novamente em instantes." }, { status: 502 });
  }
  if (emailError) {
    void logSecurityEvent({ request, eventType: "event_join_intent_send_failed", actorType: "system", riskLevel: "medium", blocked: false, reason: "provider_rejected", metadata: { event_id: event.id, intent_id: intentId } });
    if (pendingIntent) {
      const { data: rolledBackIntent, error: rollbackError } = await supabase.from("simulado_event_join_intents").update({ token_hash: pendingIntent.token_hash, expires_at: pendingIntent.expires_at, created_at: pendingIntent.created_at }).eq("id", pendingIntent.id).eq("token_hash", tokenHash).is("consumed_at", null).select("id").maybeSingle();
      if (rollbackError || !rolledBackIntent) {
        void logSecurityEvent({ request, eventType: "event_join_intent_rollback_failed", actorType: "system", riskLevel: "critical", blocked: true, reason: rollbackError ? "update_failed" : "state_changed", metadata: { event_id: event.id, intent_id: pendingIntent.id } });
      } else {
        void logSecurityEvent({ request, eventType: "event_join_intent_rollback_success", actorType: "system", riskLevel: "low", blocked: false, metadata: { event_id: event.id, intent_id: pendingIntent.id } });
      }
    } else {
      const { error: invalidationError } = await supabase.from("simulado_event_join_intents").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", intentId).eq("token_hash", tokenHash).is("consumed_at", null);
      if (invalidationError) void logSecurityEvent({ request, eventType: "event_join_intent_invalidation_failed", actorType: "system", riskLevel: "high", blocked: true, reason: "email_delivery_failed", metadata: { event_id: event.id, intent_id: intentId } });
    }
    return NextResponse.json({ ok: false, message: "Não foi possível enviar a confirmação agora. Tente novamente em instantes." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, state: "confirmation_email_sent", message: pendingIntent ? REPLACEMENT_CONFIRMATION_MESSAGE : CONFIRMATION_MESSAGE });
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
