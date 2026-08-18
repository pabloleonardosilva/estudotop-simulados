import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { logStudentActivity, logSystemError } from "@/app/lib/server/auditLogger";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MESSAGE_LENGTH = 2000;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const student = await getStudentFromRequest(request);
  if (!student) return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ ok: false, message: "Ticket inválido." }, { status: 400 });
  const supabase = createSupabaseAdminClient();
  const { data: ticket, error } = await supabase.from("student_help_messages")
    .select("id, ticket_number, contact_reason, status, student_seen_reply_at, created_at, updated_at, closed_at")
    .eq("id", id).eq("student_id", student.id).maybeSingle();
  if (error) {
    void logSystemError({ source: "api.student.help_messages.detail", error, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar este ticket." }, { status: 500 });
  }
  if (!ticket) return NextResponse.json({ ok: false, message: "Ticket não encontrado." }, { status: 404 });
  const { data: messages, error: messagesError } = await supabase.from("student_help_ticket_messages")
    .select("id, author_type, message, created_at, edited_at").eq("ticket_id", id).order("created_at");
  if (messagesError) {
    void logSystemError({ source: "api.student.help_messages.detail_messages", error: messagesError, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar a conversa." }, { status: 500 });
  }
  const hasUnseenAdminReply = !ticket.student_seen_reply_at && (messages || []).some((item) => item.author_type === "admin");
  if (hasUnseenAdminReply) {
    const now = new Date().toISOString();
    await Promise.all([
      supabase.from("student_help_messages").update({ student_seen_reply_at: now }).eq("id", id).eq("student_id", student.id),
      supabase.from("student_help_ticket_events").insert({ ticket_id: id, event_type: "student_viewed", actor_type: "student", actor_id: student.id, created_at: now }),
    ]);
  }
  return NextResponse.json({ ok: true, message: "Ticket carregado com sucesso.", ticket: { ...ticket, messages: messages || [] } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const student = await getStudentFromRequest(request);
  if (!student) return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ ok: false, message: "Ticket inválido." }, { status: 400 });
  const body = await request.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) return NextResponse.json({ ok: false, message: "Digite sua mensagem antes de enviar." }, { status: 400 });
  if (message.length > MAX_MESSAGE_LENGTH) return NextResponse.json({ ok: false, message: `A mensagem pode ter no máximo ${MAX_MESSAGE_LENGTH} caracteres.` }, { status: 400 });
  const supabase = createSupabaseAdminClient();
  const { data: ticket, error } = await supabase.from("student_help_messages").select("id, ticket_number, status")
    .eq("id", id).eq("student_id", student.id).maybeSingle();
  if (error) {
    void logSystemError({ source: "api.student.help_messages.continue_lookup", error, request });
    return NextResponse.json({ ok: false, message: "Não foi possível responder este ticket." }, { status: 500 });
  }
  if (!ticket) return NextResponse.json({ ok: false, message: "Ticket não encontrado." }, { status: 404 });
  if (ticket.status === "closed") return NextResponse.json({ ok: false, message: "Este atendimento está encerrado e não aceita novas mensagens." }, { status: 409 });
  if (ticket.status !== "answered") return NextResponse.json({ ok: false, message: "Aguarde a resposta da equipe antes de enviar uma nova mensagem." }, { status: 409 });
  const now = new Date().toISOString();
  const { data: created, error: createError } = await supabase.from("student_help_ticket_messages")
    .insert({ ticket_id: id, author_type: "student", author_id: student.id, message, created_at: now })
    .select("id, author_type, message, created_at, edited_at").single();
  if (createError) {
    void logSystemError({ source: "api.student.help_messages.continue", error: createError, request });
    return NextResponse.json({ ok: false, message: "Não foi possível enviar sua mensagem." }, { status: 500 });
  }
  const [updateResult, eventResult] = await Promise.all([
    supabase.from("student_help_messages").update({ status: "open", admin_seen_at: null }).eq("id", id).eq("student_id", student.id).eq("status", "answered"),
    supabase.from("student_help_ticket_events").insert({ ticket_id: id, event_type: "student_replied", actor_type: "student", actor_id: student.id, created_at: now }),
  ]);
  if (updateResult.error || eventResult.error) {
    await supabase.from("student_help_ticket_messages").delete().eq("id", created.id);
    void logSystemError({ source: "api.student.help_messages.continue_state", error: updateResult.error || eventResult.error, request });
    return NextResponse.json({ ok: false, message: "Não foi possível concluir o envio." }, { status: 500 });
  }
  void logStudentActivity({ studentId: student.id, action: "student.help_ticket.replied", description: `Aluno respondeu ao ticket ${ticket.ticket_number}`, entityType: "student_help_message", entityId: id, metadata: { ticket_number: ticket.ticket_number }, request });
  return NextResponse.json({ ok: true, message: "Mensagem enviada com sucesso.", item: created }, { status: 201 });
}
