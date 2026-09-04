import { NextResponse } from "next/server";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { effectiveEventStatus } from "@/lib/server/simuladoEvents";
import { logSystemError } from "@/app/lib/server/auditLogger";

export async function GET(request: Request) {
  const student = await getStudentFromRequest(request);
  if (!student) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });

  const supabase = createSupabaseAdminClient();
  const [studentResult, jornadasResult, eventsResult, relevantEventsResult] = await Promise.all([
    supabase.from("students").select("origin_event_id").eq("id", student.id).single(),
    supabase.from("student_jornadas").select("id", { count: "exact", head: true }).eq("student_id", student.id).neq("status", "cancelled"),
    // Participação real em Evento — nunca a origem de cadastro (origin_event_id):
    // um aluno cadastrado fora de Evento e depois adicionado a um também precisa
    // ver "Meus Eventos".
    supabase.from("simulado_event_participants").select("id", { count: "exact", head: true }).eq("student_id", student.id),
    // Destino inicial priorizado: só considera Eventos com status efetivo
    // active/scheduled (closed/archived nunca contam), calculado pelo relógio
    // real do servidor — nunca pela coluna status persistida isoladamente.
    supabase.from("simulado_event_participants").select("event_id,simulado_events:event_id(id,status,starts_at,ends_at,started_at,simulado_id)").eq("student_id", student.id),
  ]);

  if (studentResult.error || jornadasResult.error || eventsResult.error || relevantEventsResult.error) {
    void logSystemError({ source: "api.student.nav_access", error: studentResult.error || jornadasResult.error || eventsResult.error || relevantEventsResult.error, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar o menu." }, { status: 500 });
  }

  const relevantEvents = (relevantEventsResult.data || [])
    .map((row) => row.simulado_events as unknown as { id: string; status: string; starts_at: string; ends_at: string; started_at: string | null; simulado_id: string | null } | null)
    .filter((event): event is NonNullable<typeof event> => Boolean(event))
    .map((event) => ({ id: event.id, effective_status: effectiveEventStatus(event) }))
    .filter((event) => event.effective_status === "active" || event.effective_status === "scheduled");

  const eventDestination = relevantEvents.length === 0
    ? { type: "none" as const }
    : relevantEvents.length === 1
      ? { type: "single" as const, event_id: relevantEvents[0].id }
      : { type: "multiple" as const };

  return NextResponse.json({
    ok: true,
    has_jornadas: (jornadasResult.count ?? 0) > 0,
    has_event_origin: Boolean(studentResult.data?.origin_event_id),
    has_events: (eventsResult.count ?? 0) > 0,
    event_destination: eventDestination,
  });
}
