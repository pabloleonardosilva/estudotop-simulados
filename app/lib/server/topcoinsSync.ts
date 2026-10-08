import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { calculateEarnedTopCoins } from "@/app/lib/gamification/topcoins";

type AttemptWithResult = {
  id: string;
  created_at: string;
  result_released_at: string | null;
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
  const { data: attempts, error: attemptsError } = await supabase
    .from("simulado_attempts")
    .select("id, created_at, result_released_at, attempt_context, event_participant_id, student_jornada_simulado_id, simulado_event_participants:event_participant_id(result_released_at), student_jornada_simulados:student_jornada_simulado_id(student_jornadas:student_jornada_id(jornada_id)), simulado_results ( correct_count )")
    .eq("student_id", studentId)
    .eq("simulado_id", simuladoId)
    .eq("status", "completed")
    .eq("counts_toward_limit", true)
    .order("created_at", { ascending: true });

  if (attemptsError) throw attemptsError;
  const rows = (attempts || []) as unknown as AttemptWithResult[];
  const eligibleIds = rows.map((row) => row.id);
  // Blocking a result must not remove a previously granted credit.
  const { error: deletionError } = await supabase.from("topcoin_earnings").delete()
    .eq("student_id", studentId).eq("simulado_id", simuladoId)
    .not("attempt_id", "in", "(" + (eligibleIds.length ? eligibleIds.join(",") : "00000000-0000-0000-0000-000000000000") + ")");
  if (deletionError) throw deletionError;
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
    const participant = Array.isArray(row.simulado_event_participants) ? row.simulado_event_participants[0] : row.simulado_event_participants;
    const released = row.event_participant_id ? Boolean(participant?.result_released_at) : !row.student_jornada_simulado_id || Boolean(row.result_released_at);
    if (!released) return null;
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

  const available = inserts.filter((row) => row !== null);
  if (!available.length) return;
  const { error } = await supabase.from("topcoin_earnings").upsert(available, { onConflict: "attempt_id" });
  if (error) throw error;
}
