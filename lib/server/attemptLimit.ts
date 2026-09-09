import "server-only";
import type { createSupabaseAdminClient } from "./supabaseAdmin";
import type { AttemptExecutionContext } from "./studentAssertions";

export async function resolveAttemptLimit(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  studentId: string,
  simuladoId: string,
  context: Exclude<AttemptExecutionContext, { type: "standalone" }>,
): Promise<number | null> {
  if (context.type === "event") {
    const { data, error } = await supabase.from("simulado_event_participants")
      .select("simulado_events:event_id(simulado_id,max_attempts)")
      .eq("id", context.eventParticipantId).eq("event_id", context.eventId).eq("student_id", studentId).maybeSingle();
    const event = data?.simulado_events as unknown as { simulado_id: string; max_attempts: number } | null;
    return !error && event?.simulado_id === simuladoId ? event.max_attempts : null;
  }
  const { data, error } = await supabase.from("student_jornada_simulados")
    .select("student_jornadas:student_jornada_id!inner(student_id,jornadas:jornada_id(max_attempts))")
    .eq("id", context.studentJornadaSimuladoId).eq("simulado_id", simuladoId)
    .eq("student_jornadas.student_id", studentId).maybeSingle();
  const enrollment = data?.student_jornadas as unknown as { jornadas: { max_attempts: number } } | null;
  return !error && enrollment?.jornadas ? enrollment.jornadas.max_attempts : null;
}
