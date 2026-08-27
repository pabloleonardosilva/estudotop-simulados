import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { calculateEarnedTopCoins } from "@/app/lib/gamification/topcoins";

type AttemptWithResult = {
  id: string;
  created_at: string;
  attempt_context: string;
  event_participant_id: string | null;
  student_jornada_simulado_id: string | null;
  simulado_event_participants: { result_released_at: string | null } | { result_released_at: string | null }[] | null;
  student_jornada_simulados: { student_jornadas: { jornada_id: string } | { jornada_id: string }[] | null } | { student_jornadas: { jornada_id: string } | { jornada_id: string }[] | null }[] | null;
  simulado_results: { correct_count: number } | { correct_count: number }[] | null;
};

function correctCountOf(value: AttemptWithResult["simulado_results"]): number {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.correct_count ?? 0;
}

/**
 * Recalcula do zero o extrato de TopCoins de um aluno num simulado, a partir
 * das tentativas que hoje contam para o limite (counts_toward_limit = true).
 * Tentativas que deixaram de contar (reset de tentativas pelo admin) perdem
 * as moedas ganhas; se voltarem a contar depois, as moedas são recalculadas
 * de novo. É por isso que "tentativa" no extrato nunca passa de max_attempts.
 */
export async function resyncTopCoinEarnings(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  studentId: string,
  simuladoId: string,
): Promise<void> {
  const { data: attempts } = await supabase
    .from("simulado_attempts")
    .select("id, created_at, attempt_context, event_participant_id, student_jornada_simulado_id, simulado_event_participants:event_participant_id(result_released_at), student_jornada_simulados:student_jornada_simulado_id(student_jornadas:student_jornada_id(jornada_id)), simulado_results ( correct_count )")
    .eq("student_id", studentId)
    .eq("simulado_id", simuladoId)
    .eq("status", "completed")
    .eq("counts_toward_limit", true)
    .order("created_at", { ascending: true });

  await supabase
    .from("topcoin_earnings")
    .delete()
    .eq("student_id", studentId)
    .eq("simulado_id", simuladoId);

  const rows = ((attempts || []) as unknown as AttemptWithResult[]).filter((attempt) => {
    if (!attempt.event_participant_id) return true;
    const participant = Array.isArray(attempt.simulado_event_participants) ? attempt.simulado_event_participants[0] : attempt.simulado_event_participants;
    return Boolean(participant?.result_released_at);
  });
  if (rows.length === 0) return;

  const contextAttemptNumbers = new Map<string, number>();
  const inserts = rows.map((row) => {
    const contextKey = row.event_participant_id
      ? `event:${row.event_participant_id}`
      : row.student_jornada_simulado_id
        ? `jornada:${row.student_jornada_simulado_id}`
        : "standalone";
    const attemptNumber = (contextAttemptNumbers.get(contextKey) || 0) + 1;
    contextAttemptNumbers.set(contextKey, attemptNumber);
    const scheduleItem = Array.isArray(row.student_jornada_simulados)
      ? row.student_jornada_simulados[0] || null
      : row.student_jornada_simulados;
    const enrollment = Array.isArray(scheduleItem?.student_jornadas)
      ? scheduleItem.student_jornadas[0] || null
      : scheduleItem?.student_jornadas || null;
    return {
      student_id: studentId,
      simulado_id: simuladoId,
      attempt_id: row.id,
      jornada_id: enrollment?.jornada_id || null,
      attempt_number: attemptNumber,
      amount: calculateEarnedTopCoins({
        correctAnswers: correctCountOf(row.simulado_results),
        attemptNumber,
      }),
    };
  });

  await supabase.from("topcoin_earnings").insert(inserts);
}
