import { isAttemptResultReleased } from "@/lib/server/contextualSimuladoSettings";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { logSystemError } from "@/app/lib/server/auditLogger";

export async function GET(request: Request) {
  const student = await getStudentFromRequest(request);
  if (!student) return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("student_notifications")
    .select("id,type,title,body,action_url,metadata,created_at,reference_type,reference_id")
    .eq("student_id", student.id).is("read_at", null).is("dismissed_at", null)
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (error) {
    void logSystemError({ source: "api.student.notifications.list", error, request, metadata: { student_id: student.id } });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar suas notificações." }, { status: 500 });
  }
  if (data?.reference_type === "simulado_attempt" && data.reference_id && !await isAttemptResultReleased(supabase, data.reference_id, student.id)) {
    data.metadata = null;
    data.action_url = null;
  }
  return NextResponse.json({ ok: true, message: "Notificações carregadas com sucesso.", notification: data || null });
}
