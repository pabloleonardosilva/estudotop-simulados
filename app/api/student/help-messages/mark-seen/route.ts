import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { logStudentActivity, logSystemError } from "@/app/lib/server/auditLogger";

export async function POST(request: Request) {
  const student = await getStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const ticketId = typeof body?.ticket_id === "string" ? body.ticket_id : "";
  if (!ticketId) {
    return NextResponse.json({ ok: false, message: "Ticket inválido." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("student_help_messages")
    .update({ student_seen_reply_at: now })
    .eq("id", ticketId)
    .eq("student_id", student.id)
    .eq("status", "answered")
    .is("student_seen_reply_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    void logSystemError({ source: "api.student.help_messages.mark_seen", error, request });
    return NextResponse.json({ ok: false, message: "Não foi possível atualizar suas mensagens." }, { status: 500 });
  }

  if (!updated) {
    return NextResponse.json({ ok: false, message: "Ticket não encontrado ou já reconhecido." }, { status: 404 });
  }

  await supabase.from("student_help_ticket_events").insert({
    ticket_id: ticketId,
    event_type: "student_viewed",
    actor_type: "student",
    actor_id: student.id,
    created_at: now,
  });

  void logStudentActivity({
    studentId: student.id,
    action: "student.help_ticket.reply_seen",
    description: "Resposta de ticket de ajuda reconhecida",
    entityType: "student_help_message",
    entityId: ticketId,
    request,
  });

  return NextResponse.json({ ok: true, message: "Mensagens marcadas como vistas." });
}
