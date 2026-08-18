import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { logAdminAction, logSystemError } from "@/app/lib/server/auditLogger";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_REPLY_LENGTH = 5000;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const { id, messageId } = await params;
  if (!UUID_PATTERN.test(id) || !UUID_PATTERN.test(messageId)) return NextResponse.json({ ok: false, message: "Mensagem inválida." }, { status: 400 });
  const body = await request.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) return NextResponse.json({ ok: false, message: "A resposta não pode ficar vazia." }, { status: 400 });
  if (message.length > MAX_REPLY_LENGTH) return NextResponse.json({ ok: false, message: `A resposta pode ter no máximo ${MAX_REPLY_LENGTH} caracteres.` }, { status: 400 });
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("student_help_ticket_messages")
    .update({ message, edited_at: now, edited_by: admin.id })
    .eq("id", messageId).eq("ticket_id", id).eq("author_type", "admin")
    .select("id").maybeSingle();
  if (error) {
    void logSystemError({ source: "api.admin.help_messages.edit_reply", error, request });
    return NextResponse.json({ ok: false, message: "Não foi possível editar a resposta." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ ok: false, message: "Resposta administrativa não encontrada." }, { status: 404 });
  await supabase.from("student_help_ticket_events").insert({ ticket_id: id, event_type: "reply_edited", actor_type: "admin", actor_id: admin.id, metadata: { message_id: messageId }, created_at: now });
  void logAdminAction({ adminUserId: admin.id, action: "admin.help_ticket.reply_edited", entityType: "student_help_message", entityId: id, metadata: { message_id: messageId }, request });
  return NextResponse.json({ ok: true, message: "Resposta editada com sucesso." });
}
