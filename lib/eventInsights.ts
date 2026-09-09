// Análise pedagógica coletiva da guia "Insights" do painel do Professor —
// "em quais tópicos os alunos tiveram maior dificuldade neste Simulado?".
// Funções puras, testáveis isoladamente; a rota que consome este módulo
// (GET /api/professor/events/[id]) é responsável por carregar os dados
// (reaproveitando o mesmo `questionStats` já calculado ali — nenhuma query
// nova) e passar aqui só o necessário para o cálculo.
//
// Reaproveita a canonicalização de tópicos já usada na tela de resultados do
// aluno (lib/topicDifficulty.ts) — mesma regra de normalização/deduplicação,
// importada, nunca duplicada.
//
// Escala interna: todas as taxas/dificuldades são frações 0..1 (não 0..100).
// Arredondamento para exibição (0 ou 1 casa decimal) é responsabilidade da
// camada de UI — este módulo nunca arredonda.
//
// Regra central (não é simplesmente "erros absolutos por tópico", o que
// seria injusto com tópicos que aparecem em mais questões):
//   1) dificuldade por QUESTÃO:      D_q = wrong / (correct + wrong)
//      (branco não entra no denominador principal; anulada nunca entra)
//   2) dificuldade bruta do TÓPICO:  D_t = média(D_q) das questões válidas
//      associadas ao tópico (peso igual por questão — 5 questões não pesam
//      mais que 1 só por somar mais oportunidades de erro)
//   3) dificuldade global do Simulado: D_global = média(D_q) de todas as
//      questões válidas (peso igual por questão, nunca total de erros/total
//      de respostas, que daria peso desproporcional a questões mais
//      respondidas)
//   4) dificuldade AJUSTADA (suavização estatística, evita que 1 questão
//      "muito difícil" pareça tão confiável quanto 5 questões consistentes):
//      D_adjusted = (n * D_t + k * D_global) / (n + k), k = 2 (oficial desta
//      Sprint). O ranking de tópicos usa D_adjusted; D_t (observado/bruto)
//      continua calculado e disponível em TopicInsight.observedDifficulty
//      para uso futuro, mas a UI da guia Insights (2026-09-10) passou a
//      exibir só a dificuldade ajustada — a duplicidade "observada vs.
//      ajustada" foi identificada como confusa para o professor e removida
//      da interface visível; a matemática em si não mudou.
//
// Questão "válida" = não anulada (status contextual do Simulado, nunca
// questions.status) E com pelo menos uma resposta correta ou errada
// (correct+wrong > 0) — sem isso não há sinal nenhum de dificuldade para
// aquela questão, e ela é excluída de D_q/D_t/D_global (mas isso não afeta
// scoring/resultado oficial, é só a análise coletiva).
//
// Múltiplos tópicos por questão: a questão contribui INTEGRALMENTE (o
// próprio D_q, não dividido) para cada tópico associado — dividir por
// quantidade de tópicos não faz sentido pedagógico (ver Sprint, seção 10).
import { canonicalizeTopicLabel } from "@/lib/topicDifficulty";

export const TOPIC_DIFFICULTY_SMOOTHING_K = 2;

export type QuestionDifficultyInput = {
  simulado_question_id: string;
  order_number: number;
  annulled: boolean;
  topics: string[];
  correct: number;
  wrong: number;
  blank: number;
};

export type QuestionInsight = {
  simulado_question_id: string;
  order_number: number;
  code: string | null;
  topics: string[];
  correct: number;
  wrong: number;
  blank: number;
  validResponses: number;
  totalConsidered: number;
  difficulty: number;
  blankRate: number | null;
};

export type TopicConfidence = "initial" | "moderate" | "high";
export type TopicDifficultyBand = "low" | "medium" | "high" | "extreme";

export type TopicInsight = {
  key: string;
  label: string;
  questionCount: number;
  responsesAnalyzed: number;
  observedDifficulty: number;
  adjustedDifficulty: number;
  blankRate: number | null;
  confidence: TopicConfidence;
  band: TopicDifficultyBand;
};

export type EventInsightsSummary = {
  globalDifficulty: number | null;
  validQuestionCount: number;
  topics: TopicInsight[];
  hardestQuestions: QuestionInsight[];
  teachingReviewSummary: string;
};

// D_q = wrong / (correct + wrong). Retorna null quando não há nenhuma
// resposta graduada (correct+wrong === 0) — questão sem sinal de dificuldade.
export function calculateQuestionDifficulty(correct: number, wrong: number): number | null {
  const validResponses = correct + wrong;
  if (validResponses <= 0) return null;
  return wrong / validResponses;
}

// D_t = média aritmética simples (peso igual por questão) das dificuldades
// das questões válidas do tópico.
export function calculateTopicDifficulty(questionDifficulties: number[]): number {
  if (questionDifficulties.length === 0) return 0;
  return questionDifficulties.reduce((sum, value) => sum + value, 0) / questionDifficulties.length;
}

// D_global = média aritmética simples (peso igual por questão) de todas as
// questões válidas do Simulado — nunca total de erros / total de respostas
// (isso daria peso desproporcional a questões mais respondidas).
export function calculateGlobalDifficulty(questionDifficulties: number[]): number | null {
  if (questionDifficulties.length === 0) return null;
  return questionDifficulties.reduce((sum, value) => sum + value, 0) / questionDifficulties.length;
}

// D_adjusted = (n*D_t + k*D_global) / (n+k) — suavização estatística
// (shrinkage bayesiano simples) que puxa tópicos com poucas questões em
// direção à média global, evitando falsa confiança em amostras pequenas.
export function calculateAdjustedTopicDifficulty(
  questionCount: number,
  observedDifficulty: number,
  globalDifficulty: number,
  k: number = TOPIC_DIFFICULTY_SMOOTHING_K,
): number {
  if (questionCount + k <= 0) return globalDifficulty;
  return (questionCount * observedDifficulty + k * globalDifficulty) / (questionCount + k);
}

// 1 questão → evidência inicial; 2-3 → confiança moderada; 4+ → confiança
// alta. Nunca "certeza" — linguagem deliberadamente modesta (ver Sprint,
// seção 18).
export function classifyTopicConfidence(questionCount: number): TopicConfidence {
  if (questionCount >= 4) return "high";
  if (questionCount >= 2) return "moderate";
  return "initial";
}

// Faixas sobre a dificuldade AJUSTADA (a mesma usada para ordenar) —
// nomenclatura e limiares definidos no refinamento de UX desta guia
// (2026-09-10), centralizados aqui (única fonte, nunca espalhados pela UI):
//   >= 75%          → "extreme" (Extrema)
//   >= 50% e < 75%  → "high"    (Alta)
//   >= 25% e < 50%  → "medium"  (Média)
//   < 25%           → "low"     (Baixa)
// A dificuldade bruta (observada) segue calculada e disponível em
// TopicInsight.observedDifficulty, mas deixou de ser exibida ao professor
// nesta guia — a interface mostra só a ajustada, a métrica pedagógica
// principal.
export function classifyTopicDifficultyBand(adjustedDifficulty: number): TopicDifficultyBand {
  if (adjustedDifficulty >= 0.75) return "extreme";
  if (adjustedDifficulty >= 0.5) return "high";
  if (adjustedDifficulty >= 0.25) return "medium";
  return "low";
}

function joinTopicLabels(labels: string[]): string {
  const unique = Array.from(new Set(labels.filter(Boolean)));
  if (unique.length === 0) return "";
  if (unique.length === 1) return unique[0];
  if (unique.length === 2) return `${unique[0]} e ${unique[1]}`;
  return `${unique.slice(0, -1).join(", ")} e ${unique[unique.length - 1]}`;
}

// Resumo determinístico — NUNCA usa IA/API externa. Usa só os três tópicos
// de maior D_adjusted (entre os que já saem da faixa "Baixa") e a confiança
// do primeiro colocado para uma segunda frase de contexto.
export function buildTeachingReviewSummary(topics: TopicInsight[]): string {
  const relevant = topics.filter((topic) => topic.band !== "low");
  if (relevant.length === 0) {
    return "Não foram identificados tópicos com dificuldade relevante neste simulado.";
  }
  const top = relevant.slice(0, 3);
  const base = `Os maiores sinais de dificuldade concentraram-se em ${joinTopicLabels(top.map((topic) => topic.label))}.`;
  const leader = top[0];
  if (leader.confidence === "high") {
    return `${base} ${leader.label} apresentou dificuldade elevada em várias questões, tornando o diagnóstico mais consistente.`;
  }
  if (leader.confidence === "initial") {
    return `${base} ${leader.label} apresentou taxa alta, mas foi avaliada por apenas uma questão e deve ser interpretada com cautela.`;
  }
  return base;
}

// Monta o panorama completo a partir das questões do Simulado já com as
// contagens correct/wrong/blank consolidadas (mesma fonte que já alimenta a
// aba Questões/revisão — reaproveitada, não recalculada) e os tópicos
// (evaluated_topics) de cada uma. O chamador decide o que é "válido" quanto
// a anulação (annulled: true exclui a questão inteiramente).
export function buildEventInsights(
  questions: QuestionDifficultyInput[],
  questionMeta: Map<string, { code: string | null }> = new Map(),
): EventInsightsSummary {
  const validQuestions = questions.filter((question) => !question.annulled && question.correct + question.wrong > 0);

  const questionInsights: QuestionInsight[] = validQuestions.map((question) => {
    const validResponses = question.correct + question.wrong;
    const totalConsidered = validResponses + question.blank;
    return {
      simulado_question_id: question.simulado_question_id,
      order_number: question.order_number,
      code: questionMeta.get(question.simulado_question_id)?.code ?? null,
      topics: question.topics.length > 0 ? question.topics : ["Tópico não informado"],
      correct: question.correct,
      wrong: question.wrong,
      blank: question.blank,
      validResponses,
      totalConsidered,
      difficulty: calculateQuestionDifficulty(question.correct, question.wrong) as number,
      blankRate: totalConsidered > 0 ? question.blank / totalConsidered : null,
    };
  });

  const globalDifficulty = calculateGlobalDifficulty(questionInsights.map((question) => question.difficulty));

  const topicMap = new Map<string, {
    label: string;
    difficulties: number[];
    validResponses: number;
    blankSum: number;
    totalConsideredSum: number;
  }>();

  for (const question of questionInsights) {
    for (const rawTopic of question.topics) {
      const canonical = canonicalizeTopicLabel(rawTopic);
      if (!canonical.key) continue;
      if (!topicMap.has(canonical.key)) {
        topicMap.set(canonical.key, { label: canonical.label, difficulties: [], validResponses: 0, blankSum: 0, totalConsideredSum: 0 });
      }
      const entry = topicMap.get(canonical.key)!;
      entry.difficulties.push(question.difficulty);
      entry.validResponses += question.validResponses;
      entry.blankSum += question.blank;
      entry.totalConsideredSum += question.totalConsidered;
    }
  }

  const topics: TopicInsight[] = Array.from(topicMap.entries()).map(([key, entry]) => {
    const observedDifficulty = calculateTopicDifficulty(entry.difficulties);
    const adjustedDifficulty = globalDifficulty === null
      ? observedDifficulty
      : calculateAdjustedTopicDifficulty(entry.difficulties.length, observedDifficulty, globalDifficulty);
    return {
      key,
      label: entry.label,
      questionCount: entry.difficulties.length,
      responsesAnalyzed: entry.validResponses,
      observedDifficulty,
      adjustedDifficulty,
      blankRate: entry.totalConsideredSum > 0 ? entry.blankSum / entry.totalConsideredSum : null,
      confidence: classifyTopicConfidence(entry.difficulties.length),
      band: classifyTopicDifficultyBand(adjustedDifficulty),
    };
  }).sort((a, b) =>
    b.adjustedDifficulty - a.adjustedDifficulty
    || b.questionCount - a.questionCount
    || b.observedDifficulty - a.observedDifficulty
    || a.label.localeCompare(b.label, "pt-BR"),
  );

  const hardestQuestions = [...questionInsights].sort((a, b) =>
    b.difficulty - a.difficulty
    || b.validResponses - a.validResponses
    || a.simulado_question_id.localeCompare(b.simulado_question_id),
  );

  return {
    globalDifficulty,
    validQuestionCount: questionInsights.length,
    topics,
    hardestQuestions,
    teachingReviewSummary: buildTeachingReviewSummary(topics),
  };
}
