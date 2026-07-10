/**
 * TopCoins são uma moeda de gamificação totalmente separada da nota
 * pedagógica do simulado (não altera score, percentual, ranking ou resultado
 * acadêmico). Regra oficial:
 * 1ª tentativa: valor base = total de questões.
 * 2ª tentativa: valor base = ceil(total / 2).
 * 3ª tentativa em diante: valor base = ceil(total / 3).
 * Ganho final = valor base - erros, nunca negativo.
 */
export function getTopCoinBaseValue(totalQuestions: number, attemptNumber: number): number {
  const safeTotal = Math.max(0, Number(totalQuestions) || 0);
  const safeAttempt = Math.max(1, Number(attemptNumber) || 1);

  if (safeAttempt === 1) {
    return safeTotal;
  }

  if (safeAttempt === 2) {
    return Math.ceil(safeTotal / 2);
  }

  return Math.ceil(safeTotal / 3);
}

export function calculateEarnedTopCoins(params: {
  totalQuestions: number;
  attemptNumber: number;
  wrongAnswers: number;
}): number {
  const baseValue = getTopCoinBaseValue(params.totalQuestions, params.attemptNumber);
  const wrongAnswers = Math.max(0, Number(params.wrongAnswers) || 0);

  return Math.max(0, baseValue - wrongAnswers);
}

export function formatTopCoinsLabel(amount: number): string {
  const isSingular = amount === 0 || amount === 1;
  return `${amount} TopCoin${isSingular ? "" : "s"}`;
}
