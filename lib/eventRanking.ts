// Extraído de app/professor/eventos/[id]/page-client.tsx para ser testável
// por execução real (o arquivo original é "use client" com imports pesados
// de UI, inseguro para importar direto num teste). Fonte única da regra de
// classificação: tela e PDF do Ranking (app/lib/pdf/event-ranking-pdf.ts)
// consomem esta mesma função — nenhum sort() paralelo em nenhum dos dois.
//
// REGRA OFICIAL DE CLASSIFICAÇÃO (2026-09-09), hierárquica — para no primeiro
// critério que diferenciar os participantes:
//   1. maior pontuação (score oficial já consolidado)
//   2. menor uso da Ajuda da Coruja
//   3. menor número de advertências por troca/saída de tela
//   4. menor tempo de realização da prova
// Pontuação continua soberana: nenhum dos critérios 2-4 pode fazer alguém
// com nota inferior ultrapassar alguém com nota superior.
//
// Fonte de cada critério (auditada em código antes desta mudança):
//   - pontuação: simulado_results.display_score (o mesmo valor já exibido
//     como "Nota" na tela — não é correct_count/"acertos", que é um número
//     diferente sob modelos de pontuação como Cebraspe). Se display_score não
//     vier (compatibilidade com chamadores/fixtures de teste antigos que só
//     passam correct_count), cai para correct_count — preserva o
//     comportamento anterior a esta mudança sem quebrar nada existente.
//   - coruja: simulado_attempts.owl_help_used_count (contador oficial da
//     tentativa, incrementado em POST .../attempts/[attemptId]/owl-help).
//   - advertências: simulado_attempts.focus_violation_count — não
//     tab_switch_count (que é um contador bruto de eventos de troca de aba);
//     focus_violation_count é a "fonte de verdade" documentada em
//     lib/simulado-focus-violation.ts, o mesmo contador usado pela regra
//     anti-cheat real (desclassificação na 3ª violação).
//   - tempo: result.time_spent_ms, o mesmo já usado antes desta mudança.
// Todos os três campos novos (display_score/owl_help_used_count/
// focus_violation_count) pertencem à tentativa oficial/representativa —
// mesma fonte já usada pelo restante do ranking, nunca somados entre
// tentativas descartadas.
//
// Ausência de dado: as três colunas novas (display_score, owl_help_used_count,
// focus_violation_count) são `integer not null default 0` no banco
// (migrations/001_simulado_attempts.sql para focus_violation_count; mesmo
// padrão já usado pelo próprio endpoint de ajuda da coruja,
// `Number(attempt.owl_help_used_count || 0)`) — ausência/null é tratada como
// 0 porque semanticamente significa "nenhuma advertência"/"nenhuma ajuda
// usada", nunca "desconhecido".
//
// Desempate técnico final (quando os quatro critérios pedagógicos empatam
// exatamente): nome (pt-BR) — não é critério pedagógico, existe só para
// estabilidade determinística — seguido do id como último recurso caso até o
// nome coincida. Ranking competitivo (1º, 1º, 3º) preservado: dois
// participantes só dividem a mesma posição quando os QUATRO critérios
// oficiais são idênticos.
export type RankableParticipant = {
  id: string;
  name: string;
  result: {
    correct_count: number;
    time_spent_ms: number;
    display_score?: number | null;
    owl_help_used_count?: number | null;
    focus_violation_count?: number | null;
  } | null;
};

function scoreOf(item: RankableParticipant): number {
  const displayScore = item.result?.display_score;
  return Number(displayScore ?? item.result?.correct_count ?? 0);
}
function owlHelpOf(item: RankableParticipant): number {
  return Number(item.result?.owl_help_used_count ?? 0);
}
function warningsOf(item: RankableParticipant): number {
  return Number(item.result?.focus_violation_count ?? 0);
}
function timeOf(item: RankableParticipant): number {
  return Number(item.result?.time_spent_ms ?? 0);
}

export function rankedParticipants<T extends RankableParticipant>(
  participants: T[],
): (T & { rank: number | null; rank_tied: boolean })[] {
  const ranked = participants
    .filter((item) => item.result)
    .sort(
      (a, b) =>
        scoreOf(b) - scoreOf(a) ||
        owlHelpOf(a) - owlHelpOf(b) ||
        warningsOf(a) - warningsOf(b) ||
        timeOf(a) - timeOf(b) ||
        a.name.localeCompare(b.name, "pt-BR") ||
        a.id.localeCompare(b.id),
    );
  const tieKey = (item: T) => `${scoreOf(item)}:${owlHelpOf(item)}:${warningsOf(item)}:${timeOf(item)}`;
  const tieCount = new Map<string, number>();
  ranked.forEach((item) => { const key = tieKey(item); tieCount.set(key, (tieCount.get(key) || 0) + 1); });
  const ranks = new Map<string, { rank: number; tied: boolean }>();
  let lastKey = "";
  let rank = 0;
  ranked.forEach((item, index) => { const key = tieKey(item); if (key !== lastKey) rank = index + 1; ranks.set(item.id, { rank, tied: (tieCount.get(key) || 0) > 1 }); lastKey = key; });
  return participants
    .map((item) => ({ ...item, rank: ranks.get(item.id)?.rank || null, rank_tied: ranks.get(item.id)?.tied || false }))
    .sort((a, b) => a.rank !== null && b.rank !== null ? a.rank - b.rank || a.name.localeCompare(b.name, "pt-BR") || a.id.localeCompare(b.id) : a.rank !== null ? -1 : b.rank !== null ? 1 : a.name.localeCompare(b.name, "pt-BR"));
}
