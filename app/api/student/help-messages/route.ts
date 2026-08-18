import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { logStudentActivity, logSystemError } from "@/app/lib/server/auditLogger";
import { isHelpContactReason } from "@/lib/help-tickets";
import { verifyRecaptchaToken } from "@/lib/server/recaptcha";

const MAX_MESSAGE_LENGTH = 2000;
const RECAPTCHA_ACTION = "help_ticket_submit";

export async function GET(request: Request) {
  const student = await getStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("student_help_messages")
    .select("id, contact_reason, message, status, admin_reply, replied_at, student_seen_reply_at, created_at, updated_at")
    .eq("student_id", student.id)
    .order("created_at", { ascending: false });

  if (error) {
    void logSystemError({ source: "api.student.help_messages.list", error, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar suas mensagens." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, messages: data || [] });
}

export async function POST(request: Request) {
  const student = await getStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const contactReason = body?.contact_reason;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const captchaToken = typeof body?.captcha_token === "string" ? body.captcha_token.trim() : "";

  if (!isHelpContactReason(contactReason)) {
    return NextResponse.json({ ok: false, message: "Selecione o motivo do contato." }, { status: 400 });
  }

  if (!message) {
    return NextResponse.json({ ok: false, message: "Digite sua mensagem antes de enviar." }, { status: 400 });
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `A mensagem pode ter no máximo ${MAX_MESSAGE_LENGTH} caracteres.` },
      { status: 400 },
    );
  }

  if (!captchaToken) {
    return NextResponse.json({ ok: false, message: "Não foi possível validar o envio. Tente novamente." }, { status: 400 });
  }

  const captcha = await verifyRecaptchaToken(captchaToken, RECAPTCHA_ACTION);
  if (!captcha.ok) {
    void logSystemError({
      source: "api.student.help_messages.recaptcha",
      error: new Error(captcha.reason),
      severity: "warning",
      metadata: { student_id: student.id },
      request,
    });
    return NextResponse.json({ ok: false, message: "Não foi possível validar o envio. Tente novamente." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("student_help_messages")
    .insert({
      student_id: student.id,
      contact_reason: contactReason,
      message,
      status: "open",
      admin_reply: null,
      replied_at: null,
      replied_by: null,
      student_seen_reply_at: null,
    })
    .select("id, contact_reason, message, status, admin_reply, replied_at, student_seen_reply_at, created_at, updated_at")
    .single();

  if (error) {
    void logSystemError({ source: "api.student.help_messages.create", error, request });
    return NextResponse.json({ ok: false, message: "Não foi possível enviar sua mensagem agora. Tente novamente em instantes." }, { status: 500 });
  }

  void logStudentActivity({
    studentId: student.id,
    action: "student.help_ticket.created",
    description: "Ticket de ajuda criado",
    entityType: "student_help_message",
    entityId: data.id,
    metadata: { contact_reason: contactReason },
    request,
  });

  return NextResponse.json({
    ok: true,
    message: "Mensagem enviada com sucesso. Nossa equipe já recebeu o seu ticket.",
    item: data,
  });
}
