import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { calculateEarnedTopCoins } from "@/app/lib/gamification/topcoins";

type AttemptWithResult = {
  id: string;
  created_at: string;
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
    .select("id, created_at, simulado_results ( correct_count )")
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

  const rows = (attempts || []) as unknown as AttemptWithResult[];
  if (rows.length === 0) return;

  const { data: jornadaLink } = await supabase
    .from("student_jornada_simulados")
    .select("student_jornadas!inner(student_id, jornada_id)")
    .eq("simulado_id", simuladoId)
    .eq("student_jornadas.student_id", studentId)
    .maybeSingle();

  const jornadaLinkRef = jornadaLink?.student_jornadas as
    | { jornada_id: string }
    | { jornada_id: string }[]
    | null;
  const jornadaId = Array.isArray(jornadaLinkRef)
    ? jornadaLinkRef[0]?.jornada_id ?? null
    : jornadaLinkRef?.jornada_id ?? null;

  const inserts = rows.map((row, index) => {
    const attemptNumber = index + 1;
    return {
      student_id: studentId,
      simulado_id: simuladoId,
      attempt_id: row.id,
      jornada_id: jornadaId,
      attempt_number: attemptNumber,
      amount: calculateEarnedTopCoins({
        correctAnswers: correctCountOf(row.simulado_results),
        attemptNumber,
      }),
    };
  });

  await supabase.from("topcoin_earnings").insert(inserts);
}
