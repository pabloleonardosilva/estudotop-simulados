import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { logSystemError } from "@/app/lib/server/auditLogger";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const student = await getStudentFromRequest(request);
  if (!student) return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const action = body?.action;
  if (action !== "read" && action !== "dismiss") return NextResponse.json({ ok: false, message: "Ação inválida." }, { status: 400 });
  const { id } = await params;
  const now = new Date().toISOString();
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("student_notifications")
    .update(action === "read" ? { read_at: now } : { dismissed_at: now })
    .eq("id", id).eq("student_id", student.id).is("read_at", null).is("dismissed_at", null)
    .select("id").maybeSingle();
  if (error) {
    void logSystemError({ source: "api.student.notifications.update", error, request, metadata: { student_id: student.id, notification_id: id, action } });
    return NextResponse.json({ ok: false, message: "Não foi possível concluir esta ação." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ ok: false, message: "Notificação não encontrada ou já tratada." }, { status: 404 });
  return NextResponse.json({ ok: true, message: "Notificação tratada com sucesso." });
}
