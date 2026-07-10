import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { logSystemError } from "@/app/lib/server/auditLogger";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const adminReply = typeof body?.admin_reply === "string" ? body.admin_reply.trim() : "";

  if (!adminReply) {
    return NextResponse.json({ ok: false, message: "Escreva uma resposta antes de enviar." }, { status: 400 });
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
    .select("id, message, status, admin_reply, replied_at, created_at, student_id")
    .single();

  if (error || !data) {
    void logSystemError({ source: "api.admin.help_messages.reply", error: error || new Error("not_found"), request });
    return NextResponse.json({ ok: false, message: "Não foi possível responder esta mensagem." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Resposta enviada com sucesso.", item: data });
}
