// Fonte única de verdade da correção de um Simulado — usada tanto na
// finalização da tentativa (submit) quanto no reprocessamento retroativo
// (anulação/desanulação de questão, alteração de gabarito).
//
// Regra central (nunca violar): o resultado de uma questão NUNCA é derivado
// do estado anterior (is_correct armazenado, score anterior, snapshot
// anterior). É sempre reconstruído a partir de três fontes ao vivo:
//   1. a resposta originalmente selecionada pelo aluno (nunca alterada aqui);
//   2. o gabarito vigente da questão (correct_alternative_id/label atuais);
//   3. o status vigente do vínculo simulado_questions (active/annulled).
// Isso garante idempotência (anular duas vezes = mesmo resultado de anular
// uma vez) e impede dupla bonificação quando uma correção manual anterior
// já havia alterado is_correct sem alterar a resposta selecionada.

export type ScoringModel = "traditional" | "cebraspe";

export type SimuladoQuestionForScoring = {
  simuladoQuestionId: string;
  questionId: string;
  points: number;
  status: string; // "active" | "annulled"
  correctAlternativeId: string | null;
  correctAlternativeLabel: string | null;
};

export type AnswerForScoring = {
  selectedAlternativeId: string | null;
  selectedAlternativeLabel: string | null;
};

export type GradedQuestion = {
  simuladoQuestionId: string;
  questionId: string;
  points: number;
  status: string;
  classification: "correct" | "wrong" | "blank" | "annulled";
  isCorrect: boolean | null;
  selectedAlternativeId: string | null;
  selectedAlternativeLabel: string | null;
  correctAlternativeId: string | null;
  correctAlternativeLabel: string | null;
  scoreDelta: number;
};

function normalizeLabel(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

/**
 * Corrige uma única questão a partir da resposta original + gabarito e
 * status vigentes. Nunca recebe nem consulta um `is_correct` anterior.
 */
export function gradeSimuladoQuestion(
  question: SimuladoQuestionForScoring,
  answer: AnswerForScoring | null,
  scoringModel: ScoringModel,
): GradedQuestion {
  const points = Number(question.points || 0);
  const selectedAlternativeId = answer?.selectedAlternativeId || null;
  const selectedAlternativeLabel = answer?.selectedAlternativeLabel || null;

  if (question.status === "annulled") {
    return {
      simuladoQuestionId: question.simuladoQuestionId,
      questionId: question.questionId,
      points,
      status: question.status,
      classification: "annulled",
      isCorrect: true,
      selectedAlternativeId,
      selectedAlternativeLabel,
      correctAlternativeId: question.correctAlternativeId,
      correctAlternativeLabel: question.correctAlternativeLabel,
      scoreDelta: points,
    };
  }

  if (!selectedAlternativeId && !selectedAlternativeLabel) {
    return {
      simuladoQuestionId: question.simuladoQuestionId,
      questionId: question.questionId,
      points,
      status: question.status,
      classification: "blank",
      isCorrect: null,
      selectedAlternativeId,
      selectedAlternativeLabel,
      correctAlternativeId: question.correctAlternativeId,
      correctAlternativeLabel: question.correctAlternativeLabel,
      scoreDelta: 0,
    };
  }

  // Nunca confiar em selected_alternative_id para bater com o ID da
  // alternativa correta vigente: uma edição de questão apaga e recria as
  // linhas de question_alternatives (novos UUIDs), então o ID salvo na
  // resposta pode já não existir mais. O label (A/B/C/D/E) é o único
  // identificador estável entre edições — critério oficial de comparação
  // para fins de reprocessamento retroativo.
  let isCorrect = false;
  if (question.correctAlternativeId && selectedAlternativeId === question.correctAlternativeId) {
    isCorrect = true;
  } else if (question.correctAlternativeLabel && selectedAlternativeLabel) {
    isCorrect = normalizeLabel(selectedAlternativeLabel) === normalizeLabel(question.correctAlternativeLabel);
  }

  let scoreDelta = 0;
  if (isCorrect) scoreDelta = points;
  else if (scoringModel === "cebraspe") scoreDelta = -points;

  return {
    simuladoQuestionId: question.simuladoQuestionId,
    questionId: question.questionId,
    points,
    status: question.status,
    classification: isCorrect ? "correct" : "wrong",
    isCorrect,
    selectedAlternativeId,
    selectedAlternativeLabel,
    correctAlternativeId: question.correctAlternativeId,
    correctAlternativeLabel: question.correctAlternativeLabel,
    scoreDelta,
  };
}

export type SimuladoAttemptResult = {
  totalQuestions: number;
  answeredQuestions: number;
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  annulledCount: number;
  score: number;
  displayScore: number;
  maxScore: number;
  percentage: number;
  displayPercentage: number;
  entries: GradedQuestion[];
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Reconstrói o resultado completo de uma tentativa a partir de TODAS as
 * questões do simulado (estado vigente) e das respostas originais do
 * aluno. Determinístico: chamar duas vezes com os mesmos dados produz
 * exatamente o mesmo resultado — nunca soma/subtrai em cima do resultado
 * anterior.
 */
export function computeSimuladoAttemptResult(
  questions: SimuladoQuestionForScoring[],
  answersBySimuladoQuestionId: Map<string, AnswerForScoring>,
  scoringModel: ScoringModel,
): SimuladoAttemptResult {
  let score = 0;
  let maxScore = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let blankCount = 0;
  let annulledCount = 0;
  let answeredQuestions = 0;
  const entries: GradedQuestion[] = [];

  for (const question of questions) {
    maxScore += Number(question.points || 0);
    const answer = answersBySimuladoQuestionId.get(question.simuladoQuestionId) || null;
    const graded = gradeSimuladoQuestion(question, answer, scoringModel);
    score += graded.scoreDelta;
    entries.push(graded);

    if (graded.classification === "annulled") annulledCount += 1;
    else if (graded.classification === "blank") blankCount += 1;
    else {
      answeredQuestions += 1;
      if (graded.classification === "correct") correctCount += 1;
      else wrongCount += 1;
    }
  }

  const displayScore = Math.max(score, 0);
  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  const displayPercentage = Math.max(0, Math.min(100, percentage));

  return {
    totalQuestions: questions.length,
    answeredQuestions,
    correctCount,
    wrongCount,
    blankCount,
    annulledCount,
    score: round2(score),
    displayScore: round2(displayScore),
    maxScore: round2(maxScore),
    percentage: round2(percentage),
    displayPercentage: round2(displayPercentage),
    entries,
  };
}
