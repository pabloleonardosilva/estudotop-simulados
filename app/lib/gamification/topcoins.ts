/**
 * TopCoins são uma moeda de gamificação totalmente separada da nota
 * pedagógica do simulado (não altera score, percentual, ranking ou resultado
 * acadêmico). Regra oficial:
 * O aluno parte de zero e cada acerto vale:
 * 1ª tentativa: 4 TopCoins.
 * 2ª tentativa: 2 TopCoins.
 * 3ª tentativa em diante: 1 TopCoin.
 */
export function getTopCoinMultiplier(attemptNumber: number): number {
  const safeAttempt = Math.max(1, Number(attemptNumber) || 1);

  if (safeAttempt === 1) return 4;
  if (safeAttempt === 2) return 2;
  return 1;
}

export function getTopCoinMaxValue(totalQuestions: number, attemptNumber: number): number {
  const safeTotal = Math.max(0, Number(totalQuestions) || 0);
  return safeTotal * getTopCoinMultiplier(attemptNumber);
}

export function getTopCoinBaseValue(totalQuestions: number, attemptNumber: number): number {
  return getTopCoinMaxValue(totalQuestions, attemptNumber);
}

export function calculateEarnedTopCoins(params: {
  correctAnswers: number;
  attemptNumber: number;
}): number {
  const correctAnswers = Math.max(0, Number(params.correctAnswers) || 0);
  return correctAnswers * getTopCoinMultiplier(params.attemptNumber);
}

export function formatTopCoinsLabel(amount: number): string {
  const isSingular = amount === 0 || amount === 1;
  return `${amount} TopCoin${isSingular ? "" : "s"}`;
}
