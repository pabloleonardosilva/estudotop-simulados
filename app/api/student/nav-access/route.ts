import { NextResponse } from "next/server";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { logSystemError } from "@/app/lib/server/auditLogger";

export async function GET(request: Request) {
  const student = await getStudentFromRequest(request);
  if (!student) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });

  const supabase = createSupabaseAdminClient();
  const [studentResult, jornadasResult, eventsResult] = await Promise.all([
    supabase.from("students").select("origin_event_id").eq("id", student.id).single(),
    supabase.from("student_jornadas").select("id", { count: "exact", head: true }).eq("student_id", student.id).neq("status", "cancelled"),
    // Participação real em Evento — nunca a origem de cadastro (origin_event_id):
    // um aluno cadastrado fora de Evento e depois adicionado a um também precisa
    // ver "Meus Eventos".
    supabase.from("simulado_event_participants").select("id", { count: "exact", head: true }).eq("student_id", student.id),
  ]);

  if (studentResult.error || jornadasResult.error || eventsResult.error) {
    void logSystemError({ source: "api.student.nav_access", error: studentResult.error || jornadasResult.error || eventsResult.error, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar o menu." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    has_jornadas: (jornadasResult.count ?? 0) > 0,
    has_event_origin: Boolean(studentResult.data?.origin_event_id),
    has_events: (eventsResult.count ?? 0) > 0,
  });
}
