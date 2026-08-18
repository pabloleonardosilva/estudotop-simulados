import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { logStudentActivity, logSystemError } from "@/app/lib/server/auditLogger";
import { isHelpContactReason } from "@/lib/help-tickets";
import { verifyRecaptchaToken } from "@/lib/server/recaptcha";

const MAX_MESSAGE_LENGTH = 2000;
const RECAPTCHA_ACTION = "help_ticket_submit";

function getTechnicalContext(value: unknown, request: Request) {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const text = (key: string, max: number) => typeof input[key] === "string" ? input[key].slice(0, max) : null;
  const dimension = (key: string) => {
    const number = Number(input[key]);
    return Number.isInteger(number) && number > 0 && number <= 20000 ? number : null;
  };
  return {
    route: text("route", 500), occurred_at: text("occurred_at", 64),
    user_agent: request.headers.get("user-agent")?.slice(0, 512) || null,
    viewport_width: dimension("viewport_width"), viewport_height: dimension("viewport_height"),
    screen_width: dimension("screen_width"), screen_height: dimension("screen_height"),
    build: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 64) || null,
    environment: process.env.VERCEL_ENV?.slice(0, 32) || process.env.NODE_ENV,
  };
}

export async function GET(request: Request) {
  const student = await getStudentFromRequest(request);
  if (!student) return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("student_help_messages")
    .select("id, ticket_number, contact_reason, status, student_seen_reply_at, created_at, updated_at, closed_at")
    .eq("student_id", student.id).order("updated_at", { ascending: false });
  if (error) {
    void logSystemError({ source: "api.student.help_messages.list", error, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar seus tickets." }, { status: 500 });
  }
  const ticketIds = (data || []).map((item) => item.id);
  const latestResult = ticketIds.length
    ? await supabase.from("student_help_ticket_messages").select("ticket_id, author_type, message, created_at").in("ticket_id", ticketIds).order("created_at", { ascending: false })
    : { data: [], error: null };
  if (latestResult.error) {
    void logSystemError({ source: "api.student.help_messages.latest", error: latestResult.error, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar seus tickets." }, { status: 500 });
  }
  const latestByTicket = new Map<string, { ticket_id: string; author_type: string; message: string; created_at: string }>();
  for (const item of latestResult.data || []) if (!latestByTicket.has(item.ticket_id)) latestByTicket.set(item.ticket_id, item);
  return NextResponse.json({ ok: true, message: "Tickets carregados com sucesso.", messages: (data || []).map((ticket) => ({ ...ticket, latest_message: latestByTicket.get(ticket.id) || null })) });
}

export async function POST(request: Request) {
  const student = await getStudentFromRequest(request);
  if (!student) return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const contactReason = body?.contact_reason;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const captchaToken = typeof body?.captcha_token === "string" ? body.captcha_token.trim() : "";
  if (!isHelpContactReason(contactReason)) return NextResponse.json({ ok: false, message: "Selecione o motivo do contato." }, { status: 400 });
  if (!message) return NextResponse.json({ ok: false, message: "Digite sua mensagem antes de enviar." }, { status: 400 });
  if (message.length > MAX_MESSAGE_LENGTH) return NextResponse.json({ ok: false, message: `A mensagem pode ter no máximo ${MAX_MESSAGE_LENGTH} caracteres.` }, { status: 400 });
  if (!captchaToken) return NextResponse.json({ ok: false, message: "Não foi possível validar o envio. Tente novamente." }, { status: 400 });
  const captcha = await verifyRecaptchaToken(captchaToken, RECAPTCHA_ACTION);
  if (!captcha.ok) {
    void logSystemError({ source: "api.student.help_messages.recaptcha", error: new Error(captcha.reason), severity: "warning", metadata: { student_id: student.id }, request });
    return NextResponse.json({ ok: false, message: "Não foi possível validar o envio. Tente novamente." }, { status: 400 });
  }
  const supabase = createSupabaseAdminClient();
  const technicalContext = contactReason === "system_malfunction" ? getTechnicalContext(body?.technical_context, request) : null;
  const { data: ticket, error } = await supabase.from("student_help_messages")
    .insert({ student_id: student.id, contact_reason: contactReason, message, status: "open", student_seen_reply_at: null, admin_seen_at: null, technical_context: technicalContext })
    .select("id, ticket_number, contact_reason, status, created_at, updated_at").single();
  if (error) {
    void logSystemError({ source: "api.student.help_messages.create", error, request });
    return NextResponse.json({ ok: false, message: "Não foi possível enviar sua mensagem agora. Tente novamente em instantes." }, { status: 500 });
  }
  const now = new Date().toISOString();
  const [messageResult, eventResult] = await Promise.all([
    supabase.from("student_help_ticket_messages").insert({ ticket_id: ticket.id, author_type: "student", author_id: student.id, message, created_at: now }),
    supabase.from("student_help_ticket_events").insert({ ticket_id: ticket.id, event_type: "created", actor_type: "student", actor_id: student.id, created_at: now }),
  ]);
  if (messageResult.error || eventResult.error) {
    await supabase.from("student_help_messages").delete().eq("id", ticket.id);
    void logSystemError({ source: "api.student.help_messages.create_children", error: messageResult.error || eventResult.error, request });
    return NextResponse.json({ ok: false, message: "Não foi possível concluir a abertura do ticket." }, { status: 500 });
  }
  void logStudentActivity({ studentId: student.id, action: "student.help_ticket.created", description: `Ticket ${ticket.ticket_number} criado`, entityType: "student_help_message", entityId: ticket.id, metadata: { ticket_number: ticket.ticket_number, contact_reason: contactReason }, request });
  return NextResponse.json({ ok: true, message: `Ticket ${ticket.ticket_number} aberto com sucesso.`, item: ticket }, { status: 201 });
}
