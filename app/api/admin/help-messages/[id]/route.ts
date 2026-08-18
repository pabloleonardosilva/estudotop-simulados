import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { logAdminAction, logSystemError } from "@/app/lib/server/auditLogger";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_REPLY_LENGTH = 5000;
const MAX_NOTE_LENGTH = 5000;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ ok: false, message: "Ticket inválido." }, { status: 400 });
  const supabase = createSupabaseAdminClient();
  const { data: ticket, error } = await supabase.from("student_help_messages").select(`
    id, ticket_number, contact_reason, status, internal_note, technical_context, admin_seen_at,
    created_at, updated_at, closed_at, closed_by, student_id,
    students ( id, name, email, phone, status, created_at, last_login_at )
  `).eq("id", id).maybeSingle();
  if (error) {
    void logSystemError({ source: "api.admin.help_messages.detail", error, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar este ticket." }, { status: 500 });
  }
  if (!ticket) return NextResponse.json({ ok: false, message: "Ticket não encontrado." }, { status: 404 });
  const [messagesResult, eventsResult, journeysResult, attemptsResult] = await Promise.all([
    supabase.from("student_help_ticket_messages").select("id, author_type, author_id, message, created_at, edited_at, edited_by").eq("ticket_id", id).order("created_at"),
    supabase.from("student_help_ticket_events").select("id, event_type, actor_type, actor_id, metadata, created_at").eq("ticket_id", id).order("created_at"),
    supabase.from("student_jornadas").select("id, status, jornadas(title)").eq("student_id", ticket.student_id).eq("status", "active"),
    supabase.from("simulado_attempts").select("id", { count: "exact", head: true }).eq("student_id", ticket.student_id).eq("status", "completed"),
  ]);
  const detailError = messagesResult.error || eventsResult.error || journeysResult.error || attemptsResult.error;
  if (detailError) {
    void logSystemError({ source: "api.admin.help_messages.detail_related", error: detailError, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar os detalhes do ticket." }, { status: 500 });
  }
  if (!ticket.admin_seen_at) {
    const now = new Date().toISOString();
    await Promise.all([
      supabase.from("student_help_messages").update({ admin_seen_at: now }).eq("id", id).is("admin_seen_at", null),
      supabase.from("student_help_ticket_events").insert({ ticket_id: id, event_type: "admin_viewed", actor_type: "admin", actor_id: admin.id, created_at: now }),
    ]);
  }
  return NextResponse.json({ ok: true, message: "Ticket carregado com sucesso.", ticket: { ...ticket, messages: messagesResult.data || [], events: eventsResult.data || [], student_summary: { active_journeys: journeysResult.data || [], completed_simulados: attemptsResult.count ?? 0 } } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ ok: false, message: "Ticket inválido." }, { status: 400 });
  const body = await request.json().catch(() => null);
  const action = typeof body?.action === "string" ? body.action : "reply";
  const supabase = createSupabaseAdminClient();
  const { data: ticket, error: lookupError } = await supabase.from("student_help_messages").select("id, ticket_number, status, student_id, contact_reason").eq("id", id).maybeSingle();
  if (lookupError) {
    void logSystemError({ source: "api.admin.help_messages.lookup", error: lookupError, request });
    return NextResponse.json({ ok: false, message: "Não foi possível atualizar este ticket." }, { status: 500 });
  }
  if (!ticket) return NextResponse.json({ ok: false, message: "Ticket não encontrado." }, { status: 404 });
  const now = new Date().toISOString();

  if (action === "reply") {
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!message) return NextResponse.json({ ok: false, message: "Escreva uma resposta antes de enviar." }, { status: 400 });
    if (message.length > MAX_REPLY_LENGTH) return NextResponse.json({ ok: false, message: `A resposta pode ter no máximo ${MAX_REPLY_LENGTH} caracteres.` }, { status: 400 });
    if (ticket.status === "closed") return NextResponse.json({ ok: false, message: "Reabra o ticket antes de responder." }, { status: 409 });
    if (ticket.status !== "open") return NextResponse.json({ ok: false, message: "Aguarde uma nova mensagem do aluno antes de responder novamente." }, { status: 409 });
    const { data: created, error } = await supabase.from("student_help_ticket_messages").insert({ ticket_id: id, author_type: "admin", author_id: admin.id, message, created_at: now }).select("id").single();
    if (error) return NextResponse.json({ ok: false, message: "Não foi possível enviar a resposta." }, { status: 500 });
    const [updateResult, eventResult] = await Promise.all([
      supabase.from("student_help_messages").update({ admin_reply: message, replied_at: now, replied_by: admin.id, status: "answered", student_seen_reply_at: null, admin_seen_at: now }).eq("id", id).eq("status", "open"),
      supabase.from("student_help_ticket_events").insert({ ticket_id: id, event_type: "admin_replied", actor_type: "admin", actor_id: admin.id, created_at: now }),
    ]);
    if (updateResult.error || eventResult.error) {
      await supabase.from("student_help_ticket_messages").delete().eq("id", created.id);
      void logSystemError({ source: "api.admin.help_messages.reply", error: updateResult.error || eventResult.error, request });
      return NextResponse.json({ ok: false, message: "Não foi possível concluir a resposta." }, { status: 500 });
    }
    void logAdminAction({ adminUserId: admin.id, action: "admin.help_ticket.answered", entityType: "student_help_message", entityId: id, metadata: { ticket_number: ticket.ticket_number, student_id: ticket.student_id, contact_reason: ticket.contact_reason }, request });
    return NextResponse.json({ ok: true, message: "Resposta enviada com sucesso." });
  }

  if (action === "internal_note") {
    const note = typeof body?.internal_note === "string" ? body.internal_note.trim() : "";
    if (note.length > MAX_NOTE_LENGTH) return NextResponse.json({ ok: false, message: `A nota pode ter no máximo ${MAX_NOTE_LENGTH} caracteres.` }, { status: 400 });
    const { error } = await supabase.from("student_help_messages").update({ internal_note: note || null }).eq("id", id);
    if (error) return NextResponse.json({ ok: false, message: "Não foi possível salvar a nota interna." }, { status: 500 });
    void logAdminAction({ adminUserId: admin.id, action: "admin.help_ticket.internal_note_updated", entityType: "student_help_message", entityId: id, metadata: { ticket_number: ticket.ticket_number }, request });
    return NextResponse.json({ ok: true, message: "Nota interna salva." });
  }

  if (action === "close" || action === "reopen") {
    if (action === "close" && ticket.status === "closed") return NextResponse.json({ ok: false, message: "O ticket já está encerrado." }, { status: 409 });
    if (action === "reopen" && ticket.status !== "closed") return NextResponse.json({ ok: false, message: "Somente tickets encerrados podem ser reabertos." }, { status: 409 });
    const nextStatus = action === "close" ? "closed" : "open";
    const { error } = await supabase.from("student_help_messages").update({ status: nextStatus, closed_at: action === "close" ? now : null, closed_by: action === "close" ? admin.id : null, admin_seen_at: now }).eq("id", id);
    if (error) return NextResponse.json({ ok: false, message: `Não foi possível ${action === "close" ? "encerrar" : "reabrir"} o ticket.` }, { status: 500 });
    await supabase.from("student_help_ticket_events").insert({ ticket_id: id, event_type: action === "close" ? "closed" : "reopened", actor_type: "admin", actor_id: admin.id, created_at: now });
    void logAdminAction({ adminUserId: admin.id, action: `admin.help_ticket.${action === "close" ? "closed" : "reopened"}`, entityType: "student_help_message", entityId: id, metadata: { ticket_number: ticket.ticket_number }, request });
    return NextResponse.json({ ok: true, message: `Ticket ${action === "close" ? "encerrado" : "reaberto"} com sucesso.` });
  }

  return NextResponse.json({ ok: false, message: "Ação inválida." }, { status: 400 });
}
