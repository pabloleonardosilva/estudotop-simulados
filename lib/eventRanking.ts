// Extraído de app/professor/eventos/[id]/page-client.tsx para ser testável
// por execução real (o arquivo original é "use client" com imports pesados
// de UI, inseguro para importar direto num teste). Lógica IDÊNTICA, não
// alterada — só movida. Critério de desempate real do sistema: acertos
// decrescentes, depois tempo total crescente, depois nome (pt-BR); ranking
// competitivo (1º, 2º, 2º, 4º) quando há empate exato.

export type RankableParticipant = {
  id: string;
  name: string;
  result: { correct_count: number; time_spent_ms: number } | null;
};

export function rankedParticipants<T extends RankableParticipant>(
  participants: T[],
): (T & { rank: number | null; rank_tied: boolean })[] {
  const ranked = participants.filter((item) => item.result).sort((a, b) => Number(b.result?.correct_count || 0) - Number(a.result?.correct_count || 0) || Number(a.result?.time_spent_ms || 0) - Number(b.result?.time_spent_ms || 0) || a.name.localeCompare(b.name, "pt-BR"));
  const tieCount = new Map<string, number>();
  ranked.forEach((item) => { const key = `${item.result?.correct_count}:${item.result?.time_spent_ms}`; tieCount.set(key, (tieCount.get(key) || 0) + 1); });
  const ranks = new Map<string, { rank: number; tied: boolean }>();
  let lastKey = "";
  let rank = 0;
  ranked.forEach((item, index) => { const key = `${item.result?.correct_count}:${item.result?.time_spent_ms}`; if (key !== lastKey) rank = index + 1; ranks.set(item.id, { rank, tied: (tieCount.get(key) || 0) > 1 }); lastKey = key; });
  return participants.map((item) => ({ ...item, rank: ranks.get(item.id)?.rank || null, rank_tied: ranks.get(item.id)?.tied || false })).sort((a, b) => a.rank !== null && b.rank !== null ? a.rank - b.rank || a.name.localeCompare(b.name, "pt-BR") : a.rank !== null ? -1 : b.rank !== null ? 1 : a.name.localeCompare(b.name, "pt-BR"));
}
