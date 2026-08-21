import { NextResponse } from "next/server";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { logSystemError } from "@/app/lib/server/auditLogger";

export async function GET(request: Request) {
  const student = await getStudentFromRequest(request);
  if (!student) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });

  const supabase = createSupabaseAdminClient();
  const [studentResult, jornadasResult] = await Promise.all([
    supabase.from("students").select("origin_event_id").eq("id", student.id).single(),
    supabase.from("student_jornadas").select("id", { count: "exact", head: true }).eq("student_id", student.id).neq("status", "cancelled"),
  ]);

  if (studentResult.error || jornadasResult.error) {
    void logSystemError({ source: "api.student.nav_access", error: studentResult.error || jornadasResult.error, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar o menu." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    has_jornadas: (jornadasResult.count ?? 0) > 0,
    has_event_origin: Boolean(studentResult.data?.origin_event_id),
  });
}
