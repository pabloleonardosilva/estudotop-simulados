import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { logAdminAction, logSystemError } from "@/app/lib/server/auditLogger";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_REPLY_LENGTH = 5000;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ ok: false, message: "Ticket inválido." }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  const adminReply = typeof body?.admin_reply === "string" ? body.admin_reply.trim() : "";

  if (!adminReply) {
    return NextResponse.json({ ok: false, message: "Escreva uma resposta antes de enviar." }, { status: 400 });
  }
  if (adminReply.length > MAX_REPLY_LENGTH) {
    return NextResponse.json({ ok: false, message: `A resposta pode ter no máximo ${MAX_REPLY_LENGTH} caracteres.` }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("student_help_messages")
    .update({
      admin_reply: adminReply,
      status: "answered",
      replied_at: new Date().toISOString(),
      replied_by: admin.id,
      student_seen_reply_at: null,
    })
    .eq("id", id)
    .eq("status", "open")
    .select("id, contact_reason, message, status, admin_reply, replied_at, created_at, student_id")
    .maybeSingle();

  if (error) {
    void logSystemError({ source: "api.admin.help_messages.reply", error, request });
    return NextResponse.json({ ok: false, message: "Não foi possível responder este ticket." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, message: "Ticket não encontrado." }, { status: 404 });
  }

  void logAdminAction({
    adminUserId: admin.id,
    action: "admin.help_ticket.answered",
    entityType: "student_help_message",
    entityId: data.id,
    metadata: { student_id: data.student_id, contact_reason: data.contact_reason },
    request,
  });

  return NextResponse.json({ ok: true, message: "Resposta enviada com sucesso.", item: data });
}
