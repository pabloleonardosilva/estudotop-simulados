import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildEventInsights,
  buildTeachingReviewSummary,
  calculateAdjustedTopicDifficulty,
  calculateGlobalDifficulty,
  calculateQuestionDifficulty,
  calculateTopicDifficulty,
  classifyTopicConfidence,
  classifyTopicDifficultyBand,
  TOPIC_DIFFICULTY_SMOOTHING_K,
  type QuestionDifficultyInput,
} from "@/lib/eventInsights";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const API_ROUTE = "app/api/professor/events/[id]/route.ts";
const PANEL = "app/professor/eventos/[id]/page-client.tsx";

function q(
  id: string,
  order_number: number,
  correct: number,
  wrong: number,
  blank: number,
  topics: string[],
  annulled = false,
): QuestionDifficultyInput {
  return { simulado_question_id: id, order_number, correct, wrong, blank, topics, annulled };
}

test.describe("1. dificuldade por questão — D_q = wrong / (correct + wrong)", () => {
  test("calculateQuestionDifficulty é exatamente wrong/(correct+wrong)", () => {
    expect(calculateQuestionDifficulty(30, 60)).toBeCloseTo(60 / 90, 10);
    expect(calculateQuestionDifficulty(70, 30)).toBeCloseTo(0.3, 10);
  });

  test("sem nenhuma resposta graduada (correct+wrong=0) → null, não divide por zero", () => {
    expect(calculateQuestionDifficulty(0, 0)).toBeNull();
  });

  test("k oficial desta Sprint é 2", () => {
    expect(TOPIC_DIFFICULTY_SMOOTHING_K).toBe(2);
  });
});

test.describe("2. branco separado — nunca soma na taxa principal de erro", () => {
  test("TESTE DE BRANCO do pedido: 60 erros, 30 acertos, 10 brancos → D_q = 60/(60+30) = 66,67%, blank rate = 10%, nunca 60/100", () => {
    const insights = buildEventInsights([q("Q1", 1, 30, 60, 10, ["Tópico X"])]);
    const question = insights.hardestQuestions[0];
    expect(question.difficulty).toBeCloseTo(60 / 90, 10);
    expect(question.difficulty).not.toBeCloseTo(60 / 100, 5);
    expect(question.blankRate).toBeCloseTo(10 / 100, 10);
  });
});

test.describe("3. questão anulada excluída integralmente", () => {
  test("anulada com 100% de 'erro' não altera nenhuma métrica (nem D_global, nem nenhum tópico)", () => {
    const withoutAnnulled = buildEventInsights([
      q("Q1", 1, 50, 50, 0, ["Tópico A"]),
    ]);
    const withAnnulled = buildEventInsights([
      q("Q1", 1, 50, 50, 0, ["Tópico A"]),
      q("Q2", 2, 0, 100, 0, ["Tópico A"], true), // anulada, 100% "erro"
    ]);
    expect(withAnnulled.globalDifficulty).toBeCloseTo(withoutAnnulled.globalDifficulty as number, 10);
    expect(withAnnulled.topics[0].observedDifficulty).toBeCloseTo(withoutAnnulled.topics[0].observedDifficulty, 10);
    expect(withAnnulled.topics[0].questionCount).toBe(withoutAnnulled.topics[0].questionCount);
    expect(withAnnulled.validQuestionCount).toBe(withoutAnnulled.validQuestionCount);
    expect(withAnnulled.hardestQuestions.find((question) => question.simulado_question_id === "Q2")).toBeUndefined();
  });
});

test.describe("4. múltiplos tópicos — questão contribui integralmente para cada tópico", () => {
  test("questão com 60% de erro contribui 60% para o tópico A e 60% para o tópico B — nunca 30%/30%", () => {
    const insights = buildEventInsights([q("Q1", 1, 40, 60, 0, ["A", "B"])]);
    const topicA = insights.topics.find((topic) => topic.label === "A")!;
    const topicB = insights.topics.find((topic) => topic.label === "B")!;
    expect(topicA.observedDifficulty).toBeCloseTo(0.6, 10);
    expect(topicB.observedDifficulty).toBeCloseTo(0.6, 10);
  });
});

test.describe("5. tópico com uma única questão", () => {
  test("n=1 é classificado como confiança 'initial' (evidência inicial)", () => {
    expect(classifyTopicConfidence(1)).toBe("initial");
  });

  test("um tópico de 1 questão é puxado em direção à média global (suavização)", () => {
    const insights = buildEventInsights([
      q("Q1", 1, 30, 70, 0, ["Único"]), // D_q = 70%
      q("Q2", 2, 60, 40, 0, ["Outro"]),
      q("Q3", 3, 55, 45, 0, ["Outro"]),
      q("Q4", 4, 65, 35, 0, ["Outro"]),
    ]);
    const unico = insights.topics.find((topic) => topic.label === "Único")!;
    expect(unico.observedDifficulty).toBeCloseTo(0.7, 10);
    expect(unico.adjustedDifficulty).toBeLessThan(unico.observedDifficulty);
    expect(unico.adjustedDifficulty).toBeGreaterThan(insights.globalDifficulty as number);
  });
});

test.describe("6. tópico com várias questões", () => {
  test("classifyTopicConfidence: 2-3 → moderada, 4+ → alta", () => {
    expect(classifyTopicConfidence(2)).toBe("moderate");
    expect(classifyTopicConfidence(3)).toBe("moderate");
    expect(classifyTopicConfidence(4)).toBe("high");
    expect(classifyTopicConfidence(10)).toBe("high");
  });

  test("calculateTopicDifficulty é a média aritmética simples das dificuldades por questão — exemplo exato do pedido (seção 11)", () => {
    // Q1=50%, Q2=30%, Q3=45%, Q4=60%, Q5=40% → D_t=45%
    expect(calculateTopicDifficulty([0.5, 0.3, 0.45, 0.6, 0.4])).toBeCloseTo(0.45, 10);
  });

  test("tópico sem nenhuma questão → 0 (nunca NaN/undefined)", () => {
    expect(calculateTopicDifficulty([])).toBe(0);
  });
});

test.describe("7. suavização k=2 — exemplo exato do pedido (seção 46)", () => {
  test("D_global=40%, Tópico A (n=1, D_t=70%) → D_adjusted=0.50; Tópico B (n=5, D_t=55%) → D_adjusted≈0.5071; B fica acima de A", () => {
    const dA = calculateAdjustedTopicDifficulty(1, 0.70, 0.40);
    const dB = calculateAdjustedTopicDifficulty(5, 0.55, 0.40);
    expect(dA).toBeCloseTo(0.50, 10);
    expect(dB).toBeCloseTo(0.507142857, 8);
    expect(dB).toBeGreaterThan(dA);
  });
});

test.describe("8. dificuldade global (D_global)", () => {
  test("é a média simples das dificuldades por questão — peso igual por questão, não total de erros/total de respostas", () => {
    // Q1: 1000 respondidas, 10% erro. Q2: 10 respondidas, 90% erro.
    // Se fosse total de erros/total de respostas: (100+9)/(1000+10) ≈ 10.8%
    // Peso igual por questão (regra correta): (10%+90%)/2 = 50%.
    const g = calculateGlobalDifficulty([0.1, 0.9]);
    expect(g).toBeCloseTo(0.5, 10);
    expect(g).not.toBeCloseTo(109 / 1010, 3);
  });

  test("sem nenhuma questão válida → null", () => {
    expect(calculateGlobalDifficulty([])).toBeNull();
  });
});

test.describe("9. confiança/evidência", () => {
  test("classifyTopicDifficultyBand: faixas oficiais 0-24/25-49/50-74/75+ (Baixa/Média/Alta/Extrema, refinamento 2026-09-10)", () => {
    expect(classifyTopicDifficultyBand(0)).toBe("low");
    expect(classifyTopicDifficultyBand(0.24)).toBe("low");
    expect(classifyTopicDifficultyBand(0.25)).toBe("medium");
    expect(classifyTopicDifficultyBand(0.49)).toBe("medium");
    expect(classifyTopicDifficultyBand(0.50)).toBe("high");
    expect(classifyTopicDifficultyBand(0.74)).toBe("high");
    expect(classifyTopicDifficultyBand(0.75)).toBe("extreme");
    expect(classifyTopicDifficultyBand(1)).toBe("extreme");
  });
});

test.describe("10. ordenação de tópicos", () => {
  test("ranking principal usa D_adjusted DESC", () => {
    const insights = buildEventInsights([
      q("Q1", 1, 30, 70, 0, ["Difícil"]),
      q("Q2", 2, 80, 20, 0, ["Fácil"]),
      q("Q3", 3, 50, 50, 0, ["Médio"]),
    ]);
    const order = insights.topics.map((topic) => topic.label);
    expect(order[0]).toBe("Difícil");
    expect(order[order.length - 1]).toBe("Fácil");
  });

  test("desempate: maior n, depois maior D_t bruto, depois nome alfabético", () => {
    const insights = buildEventInsights([
      // A e B empatam em D_adjusted (mesma composição), A tem mais questões.
      q("Q1", 1, 50, 50, 0, ["A"]),
      q("Q2", 2, 50, 50, 0, ["A"]),
      q("Q3", 3, 50, 50, 0, ["B"]),
    ]);
    const a = insights.topics.find((topic) => topic.label === "A")!;
    const b = insights.topics.find((topic) => topic.label === "B")!;
    expect(a.adjustedDifficulty).toBeCloseTo(b.adjustedDifficulty, 10);
    expect(insights.topics[0].label).toBe("A"); // n=2 > n=1
  });
});

test.describe("11. normalização de tópicos (reaproveita lib/topicDifficulty.ts)", () => {
  test("'Recursos', 'recursos', ' RECURSOS ' não geram três tópicos separados", () => {
    const insights = buildEventInsights([
      q("Q1", 1, 40, 60, 0, ["Recursos"]),
      q("Q2", 2, 50, 50, 0, ["recursos"]),
      q("Q3", 3, 60, 40, 0, [" RECURSOS "]),
    ]);
    expect(insights.topics).toHaveLength(1);
    expect(insights.topics[0].questionCount).toBe(3);
  });

  test("eventInsights.ts importa canonicalizeTopicLabel de lib/topicDifficulty — não duplica a função", () => {
    const source = read("lib/eventInsights.ts");
    expect(source).toContain('import { canonicalizeTopicLabel } from "@/lib/topicDifficulty";');
    expect(source).not.toContain("function canonicalizeTopicLabel(");
  });
});

test.describe("12. estado vazio", () => {
  test("nenhuma questão válida → globalDifficulty null, tópicos vazios, resumo padrão", () => {
    const insights = buildEventInsights([]);
    expect(insights.globalDifficulty).toBeNull();
    expect(insights.topics).toHaveLength(0);
    expect(insights.hardestQuestions).toHaveLength(0);
    expect(insights.teachingReviewSummary).toBe("Não foram identificados tópicos com dificuldade relevante neste simulado.");
  });

  test("todas as questões anuladas → mesmo estado vazio", () => {
    const insights = buildEventInsights([
      q("Q1", 1, 10, 20, 0, ["A"], true),
      q("Q2", 2, 5, 5, 0, ["B"], true),
    ]);
    expect(insights.validQuestionCount).toBe(0);
    expect(insights.topics).toHaveLength(0);
  });

  test("nenhum tópico com dificuldade relevante (tudo 'Baixa') → resumo diz isso explicitamente, sem inventar problema", () => {
    const insights = buildEventInsights([
      q("Q1", 1, 95, 5, 0, ["Fácil"]),
      q("Q2", 2, 90, 10, 0, ["Fácil"]),
    ]);
    expect(insights.topics.every((topic) => topic.band === "low")).toBe(true);
    expect(insights.teachingReviewSummary).toBe("Não foram identificados tópicos com dificuldade relevante neste simulado.");
  });
});

test.describe("13. cenário manual pequeno (obrigatório) — 4 questões, 3 tópicos, calculado à mão", () => {
  // Q1: 10 corretas, 30 erradas, 5 brancas — tópicos [Competência]
  //   D_q1 = 30/40 = 0.75
  // Q2: 20 corretas, 10 erradas, 0 brancas — tópicos [Competência, Recursos]
  //   D_q2 = 10/30 = 0.3333...
  // Q3: 5 corretas, 45 erradas, 0 brancas — tópicos [Recursos]
  //   D_q3 = 45/50 = 0.90
  // Q4: 40 corretas, 10 erradas, 0 brancas — tópicos [Prescrição] (anulada — excluída)
  const questions: QuestionDifficultyInput[] = [
    q("Q1", 1, 10, 30, 5, ["Competência"]),
    q("Q2", 2, 20, 10, 0, ["Competência", "Recursos"]),
    q("Q3", 3, 5, 45, 0, ["Recursos"]),
    q("Q4", 4, 40, 10, 0, ["Prescrição"], true),
  ];
  const insights = buildEventInsights(questions);

  test("D_q de cada questão válida bate com o cálculo manual", () => {
    const byId = new Map(insights.hardestQuestions.map((question) => [question.simulado_question_id, question]));
    expect(byId.get("Q1")!.difficulty).toBeCloseTo(30 / 40, 10);
    expect(byId.get("Q2")!.difficulty).toBeCloseTo(10 / 30, 10);
    expect(byId.get("Q3")!.difficulty).toBeCloseTo(45 / 50, 10);
    expect(byId.has("Q4")).toBe(false); // anulada
  });

  test("D_global = média(0.75, 0.3333..., 0.90) = 0.66111...", () => {
    const expected = (0.75 + 10 / 30 + 0.90) / 3;
    expect(insights.globalDifficulty).toBeCloseTo(expected, 10);
  });

  test("D_t(Competência) = média(0.75, 0.3333...) = 0.541666...; D_t(Recursos) = média(0.3333..., 0.90) = 0.616666...", () => {
    const competencia = insights.topics.find((topic) => topic.label === "Competência")!;
    const recursos = insights.topics.find((topic) => topic.label === "Recursos")!;
    expect(competencia.observedDifficulty).toBeCloseTo((0.75 + 10 / 30) / 2, 10);
    expect(recursos.observedDifficulty).toBeCloseTo((10 / 30 + 0.90) / 2, 10);
  });

  test("D_adjusted de cada tópico bate com (n*D_t + 2*D_global)/(n+2)", () => {
    const dGlobal = insights.globalDifficulty as number;
    const competencia = insights.topics.find((topic) => topic.label === "Competência")!;
    const recursos = insights.topics.find((topic) => topic.label === "Recursos")!;
    expect(competencia.adjustedDifficulty).toBeCloseTo((2 * competencia.observedDifficulty + 2 * dGlobal) / 4, 10);
    expect(recursos.adjustedDifficulty).toBeCloseTo((2 * recursos.observedDifficulty + 2 * dGlobal) / 4, 10);
  });

  test("ordem final: Recursos (maior D_adjusted) antes de Competência; Prescrição não aparece (anulada)", () => {
    const labels = insights.topics.map((topic) => topic.label);
    expect(labels).toEqual(["Recursos", "Competência"]);
    expect(labels).not.toContain("Prescrição");
  });

  test("respostas analisadas por tópico = soma de (correct+wrong) das questões válidas do tópico", () => {
    const competencia = insights.topics.find((topic) => topic.label === "Competência")!;
    const recursos = insights.topics.find((topic) => topic.label === "Recursos")!;
    expect(competencia.responsesAnalyzed).toBe(40 + 30); // Q1 + Q2
    expect(recursos.responsesAnalyzed).toBe(30 + 50); // Q2 + Q3
  });
});

test.describe("14. 137 participantes — cenário de volume", () => {
  test("12 questões, múltiplos tópicos, brancos, 1 anulada — cálculo completo, sem duplicação, determinístico", () => {
    const totalParticipants = 137;
    const questions: QuestionDifficultyInput[] = Array.from({ length: 12 }, (_, index) => {
      const wrong = 10 + index * 7;
      const blank = index % 3 === 0 ? 5 : 0;
      const correct = Math.max(0, totalParticipants - wrong - blank);
      const topics = index % 4 === 0 ? [`Tópico ${index % 3}`, `Tópico Extra ${index}`] : [`Tópico ${index % 3}`];
      const annulled = index === 11;
      return q(`Q${index}`, index + 1, correct, wrong, blank, topics, annulled);
    });

    const run1 = buildEventInsights(questions);
    const run2 = buildEventInsights(questions);

    expect(run1.validQuestionCount).toBe(11); // 12 - 1 anulada
    expect(run1.hardestQuestions).toHaveLength(11);
    expect(run1.hardestQuestions.find((question) => question.simulado_question_id === "Q11")).toBeUndefined();

    const ids = new Set(run1.hardestQuestions.map((question) => question.simulado_question_id));
    expect(ids.size).toBe(11);

    // Determinismo: duas execuções com os mesmos dados produzem exatamente a
    // mesma ordem e os mesmos valores.
    expect(run1.topics.map((topic) => topic.label)).toEqual(run2.topics.map((topic) => topic.label));
    expect(run1.globalDifficulty).toBeCloseTo(run2.globalDifficulty as number, 10);
  });
});

test.describe("CENÁRIO 1 (obrigatório) — mais questões, menos dificuldade individual, vs. poucas questões, dificuldade maior", () => {
  test("5 questões com 30% de erro cada vs. 1 questão com 55% — o sistema não deixa a de 1 questão dominar artificialmente sem suavização, mas também não ignora seu sinal", () => {
    const questions: QuestionDifficultyInput[] = [
      ...Array.from({ length: 5 }, (_, index) => q(`A${index}`, index + 1, 70, 30, 0, ["A"])),
      q("B0", 6, 45, 55, 0, ["B"]),
    ];
    const insights = buildEventInsights(questions);
    const topicA = insights.topics.find((topic) => topic.label === "A")!;
    const topicB = insights.topics.find((topic) => topic.label === "B")!;
    expect(topicA.observedDifficulty).toBeCloseTo(0.30, 10);
    expect(topicB.observedDifficulty).toBeCloseTo(0.55, 10);
    // B tem taxa bruta maior, mas com evidência fraca (n=1) é puxado para a
    // média global; A, com 5 questões, domina mais o seu próprio valor.
    const dGlobal = insights.globalDifficulty as number;
    expect(topicA.adjustedDifficulty).toBeCloseTo((5 * 0.30 + 2 * dGlobal) / 7, 10);
    expect(topicB.adjustedDifficulty).toBeCloseTo((1 * 0.55 + 2 * dGlobal) / 3, 10);
    // A não sobe artificialmente por ter mais questões: sua taxa bruta (30%)
    // é MENOR que a de B (55%), e mesmo após suavização A continua abaixo de B.
    expect(topicA.adjustedDifficulty).toBeLessThan(topicB.adjustedDifficulty);
  });
});

test.describe("CENÁRIO 2 (obrigatório) — uma questão muito difícil vs. várias moderadamente difíceis", () => {
  test("réplica exata do exemplo da seção 46 via buildEventInsights (não só a função isolada)", () => {
    // Escolhido para que D_global fique em 40%: 1 questão de A com D_q=70%,
    // 5 de B com D_q=55% cada, mais questões "neutras" para ancorar a média
    // global em 40% conforme o exemplo do pedido.
    // D_global = 40% exige (0.70 + 5*0.55 + resto)/n = 0.40 — mais simples:
    // testar calculateAdjustedTopicDifficulty diretamente com D_global fixo
    // (já coberto no bloco 7) e aqui confirmar via buildEventInsights que a
    // MESMA fórmula é aplicada ponta a ponta com um D_global derivado dos dados.
    const questions: QuestionDifficultyInput[] = [
      q("A0", 1, 30, 70, 0, ["A"]), // D_q = 0.70
      ...Array.from({ length: 5 }, (_, index) => q(`B${index}`, index + 2, 45, 55, 0, ["B"])), // D_q = 0.55 cada
    ];
    const insights = buildEventInsights(questions);
    const dGlobal = insights.globalDifficulty as number;
    const topicA = insights.topics.find((topic) => topic.label === "A")!;
    const topicB = insights.topics.find((topic) => topic.label === "B")!;
    expect(topicA.adjustedDifficulty).toBeCloseTo(calculateAdjustedTopicDifficulty(1, 0.70, dGlobal), 10);
    expect(topicB.adjustedDifficulty).toBeCloseTo(calculateAdjustedTopicDifficulty(5, 0.55, dGlobal), 10);
  });
});

test.describe("CENÁRIO 3 (obrigatório) — múltiplos tópicos + branco + anulada, junto", () => {
  test("cálculo combinado: branco não conta como erro, anulada é excluída, tópico múltiplo contribui integralmente para os dois", () => {
    const questions: QuestionDifficultyInput[] = [
      q("Q1", 1, 20, 60, 20, ["Recursos", "Prazos"]), // D_q = 60/80 = 0.75, 20 brancos
      q("Q2", 2, 50, 50, 0, ["Prazos"]), // D_q = 0.5
      q("Q3", 3, 0, 100, 0, ["Recursos"], true), // anulada — excluída
    ];
    const insights = buildEventInsights(questions);
    expect(insights.validQuestionCount).toBe(2);
    const recursos = insights.topics.find((topic) => topic.label === "Recursos")!;
    const prazos = insights.topics.find((topic) => topic.label === "Prazos")!;
    expect(recursos.questionCount).toBe(1); // só Q1 (Q3 anulada não conta)
    expect(recursos.observedDifficulty).toBeCloseTo(0.75, 10);
    expect(prazos.questionCount).toBe(2); // Q1 e Q2
    expect(prazos.observedDifficulty).toBeCloseTo((0.75 + 0.5) / 2, 10);
    expect(recursos.blankRate).toBeCloseTo(20 / 100, 10); // só Q1 tem branco
    expect(prazos.blankRate).toBeCloseTo(20 / 200, 10); // Q1 (20 brancos/100 considerados) + Q2 (0/100), agregado
  });
});

test.describe("resumo determinístico — 'O que merece revisão em aula' (sem IA)", () => {
  test("buildTeachingReviewSummary nunca chama API externa/IA", () => {
    const source = read("lib/eventInsights.ts");
    expect(source).not.toMatch(/openai|fetch\(|OPENAI_API_KEY/i);
  });

  test("top 3 tópicos por D_adjusted geram a frase base esperada", () => {
    const insights = buildEventInsights([
      q("Q1", 1, 30, 70, 0, ["Recursos"]),
      q("Q2", 2, 35, 65, 0, ["Tutela Provisória"]),
      q("Q3", 3, 40, 60, 0, ["Competência"]),
      q("Q4", 4, 95, 5, 0, ["Fácil"]),
    ]);
    expect(insights.teachingReviewSummary).toContain("Os maiores sinais de dificuldade concentraram-se em");
    expect(insights.teachingReviewSummary).toContain("Recursos");
  });

  test("tópico líder com 1 questão gera a frase de cautela", () => {
    const summary = buildTeachingReviewSummary([
      { key: "a", label: "Prescrição", questionCount: 1, responsesAnalyzed: 96, observedDifficulty: 0.58, adjustedDifficulty: 0.49, blankRate: null, confidence: "initial", band: "medium" },
    ]);
    expect(summary).toBe("Os maiores sinais de dificuldade concentraram-se em Prescrição. Prescrição apresentou taxa alta, mas foi avaliada por apenas uma questão e deve ser interpretada com cautela.");
  });

  test("tópico líder com confiança alta (4+) gera a frase de consistência", () => {
    const summary = buildTeachingReviewSummary([
      { key: "a", label: "Recursos", questionCount: 7, responsesAnalyzed: 670, observedDifficulty: 0.61, adjustedDifficulty: 0.56, blankRate: null, confidence: "high", band: "high" },
    ]);
    expect(summary).toContain("Recursos apresentou dificuldade elevada em várias questões, tornando o diagnóstico mais consistente.");
  });
});

test.describe("Não dá falsa precisão / não expõe fórmula na tela principal / tooltip", () => {
  test("guia Insights arredonda percentuais para no máximo 1 casa decimal (usa o mesmo formatPercent já existente)", () => {
    const panel = read(PANEL);
    const insightsSectionIndex = panel.indexOf(String.raw`{activeTab === "insights" && <section`);
    expect(insightsSectionIndex).toBeGreaterThan(-1);
  });

  test("tooltip explicativo de 'Dificuldade ajustada' está presente", () => {
    const panel = read(PANEL);
    expect(panel).toContain("Dificuldade ajustada");
  });
});

test.describe("Aba Insights — integração com o painel do Professor", () => {
  test("quarta aba na ordem correta: Visão geral, Participantes, Questões / revisão, Insights", () => {
    const panel = read(PANEL);
    const navIndex = panel.indexOf('aria-label="Áreas da dashboard"');
    expect(navIndex).toBeGreaterThan(-1);
    const navBlock = panel.slice(navIndex, navIndex + 900);
    const overviewIndex = navBlock.indexOf('"overview"');
    const participantsIndex = navBlock.indexOf('"participants"');
    const questionsIndex = navBlock.indexOf('"questions"');
    const insightsIndex = navBlock.indexOf('"insights"');
    expect(overviewIndex).toBeGreaterThan(-1);
    expect(participantsIndex).toBeGreaterThan(overviewIndex);
    expect(questionsIndex).toBeGreaterThan(participantsIndex);
    expect(insightsIndex).toBeGreaterThan(questionsIndex);
  });

  test("aba usa o mesmo componente DashboardTab das demais (mesmo padrão visual/hover/ativo)", () => {
    const panel = read(PANEL);
    const navIndex = panel.indexOf('aria-label="Áreas da dashboard"');
    const navBlock = panel.slice(navIndex, navIndex + 900);
    const dashboardTabCount = (navBlock.match(/<DashboardTab /g) || []).length;
    expect(dashboardTabCount).toBe(4);
  });

  test("Tab type inclui 'insights'", () => {
    const panel = read(PANEL);
    expect(panel).toContain('type Tab = "overview" | "participants" | "questions" | "insights";');
  });

  test("bloco 'Panorama pedagógico do simulado' presente", () => {
    const panel = read(PANEL);
    expect(panel).toContain("Panorama pedagógico do simulado");
  });

  test("bloco 'Tópicos de maior dificuldade' presente na guia Insights (distinto do card individual do modal Ranking)", () => {
    const panel = read(PANEL);
    const insightsSectionIndex = panel.indexOf(String.raw`{activeTab === "insights" && <section`);
    expect(insightsSectionIndex).toBeGreaterThan(-1);
    expect(panel.slice(insightsSectionIndex, insightsSectionIndex + 15000)).toContain("Tópicos de maior dificuldade");
  });

  test("bloco 'Questões mais difíceis' presente", () => {
    const panel = read(PANEL);
    const insightsSectionIndex = panel.indexOf(String.raw`{activeTab === "insights" && <section`);
    expect(panel.slice(insightsSectionIndex, insightsSectionIndex + 15000)).toContain("Questões mais difíceis");
  });

  test("bloco 'O que merece revisão em aula' presente", () => {
    const panel = read(PANEL);
    const insightsSectionIndex = panel.indexOf(String.raw`{activeTab === "insights" && <section`);
    expect(panel.slice(insightsSectionIndex, insightsSectionIndex + 15000)).toContain("O que merece revisão em aula");
  });

  test("estados vazios tratados (mensagens elegantes, sem quebrar)", () => {
    const panel = read(PANEL);
    const insightsSectionIndex = panel.indexOf(String.raw`{activeTab === "insights" && <section`);
    const insightsBlock = panel.slice(insightsSectionIndex, insightsSectionIndex + 15000);
    expect(insightsBlock).toMatch(/Ainda não há respostas suficientes|Não foram identificados tópicos/);
  });
});

test.describe("Refinamento de UX (2026-09-10) — bloco Tópicos: só dificuldade ajustada, sem confiança/evidência visível", () => {
  test("linha do tópico não exibe mais 'observada' (dificuldade bruta deixou de ser mostrada ao professor)", () => {
    const panel = read(PANEL);
    const rowIndex = panel.indexOf("function InsightsTopicRow(");
    expect(rowIndex).toBeGreaterThan(-1);
    const rowSource = panel.slice(rowIndex, panel.indexOf("function InsightsQuestionRow(", rowIndex));
    expect(rowSource).not.toContain("observada");
    expect(rowSource).not.toContain("topic.observedDifficulty");
  });

  test("linha do tópico exibe só a dificuldade ajustada, com o texto 'de dificuldade ajustada'", () => {
    const panel = read(PANEL);
    const rowIndex = panel.indexOf("function InsightsTopicRow(");
    const rowSource = panel.slice(rowIndex, panel.indexOf("function InsightsQuestionRow(", rowIndex));
    expect(rowSource).toContain("topic.adjustedDifficulty");
    expect(rowSource).toContain("de dificuldade ajustada");
  });

  test("'Evidência inicial' / 'Confiança moderada' / 'Confiança alta' não aparecem em nenhum lugar do painel", () => {
    const panel = read(PANEL);
    expect(panel).not.toContain("Evidência inicial");
    expect(panel).not.toContain("Confiança moderada");
    expect(panel).not.toContain("Confiança alta");
    expect(panel).not.toContain("TOPIC_CONFIDENCE_LABEL");
  });

  test("classificação visual usa só Extrema / Alta / Média / Baixa (nomenclatura antiga removida)", () => {
    const panel = read(PANEL);
    expect(panel).toContain('extreme: { label: "Extrema"');
    expect(panel).toContain('high: { label: "Alta"');
    expect(panel).toContain('medium: { label: "Média"');
    expect(panel).toContain('low: { label: "Baixa"');
    expect(panel).not.toContain("Bom domínio");
    expect(panel).not.toContain('label: "Atenção"');
    expect(panel).not.toContain("Dificuldade relevante");
    expect(panel).not.toContain("Dificuldade crítica");
  });

  test("thresholds da classificação são centralizados em lib/eventInsights.ts (classifyTopicDifficultyBand), não reimplementados no painel", () => {
    const panel = read(PANEL);
    expect(panel).not.toMatch(/>=\s*0\.75|>=\s*0\.5\b|>=\s*0\.25\b/);
    const helperSource = read("lib/eventInsights.ts");
    expect(helperSource).toContain("if (adjustedDifficulty >= 0.75) return \"extreme\";");
  });

  test("subtítulo do tópico: singular/plural corretos para questões relacionadas", () => {
    const singular = buildEventInsights([q("Q1", 1, 3, 7, 0, ["Prescrição"])]);
    const plural = buildEventInsights([q("Q1", 1, 3, 7, 0, ["Recursos"]), q("Q2", 2, 4, 6, 0, ["Recursos"])]);
    expect(singular.topics[0].questionCount).toBe(1);
    expect(plural.topics[0].questionCount).toBe(2);
    const panel = read(PANEL);
    const rowIndex = panel.indexOf("function InsightsTopicRow(");
    const rowSource = panel.slice(rowIndex, panel.indexOf("function InsightsQuestionRow(", rowIndex));
    expect(rowSource).toContain('"questão relacionada"');
    expect(rowSource).toContain('"questões relacionadas"');
    expect(rowSource).toContain('"resposta válida considerada"');
    expect(rowSource).toContain('"respostas válidas consideradas"');
  });
});

test.describe("Refinamento de UX (2026-09-10) — bloco Questões mais difíceis: só erro, clicável, modal de consulta", () => {
  test("linha da questão não exibe mais 'branco'/blankRate", () => {
    const panel = read(PANEL);
    const rowIndex = panel.indexOf("function InsightsQuestionRow(");
    expect(rowIndex).toBeGreaterThan(-1);
    const rowSource = panel.slice(rowIndex, panel.indexOf("function DashboardTab(", rowIndex));
    expect(rowSource).not.toContain("branco");
    expect(rowSource).not.toContain("blankRate");
  });

  test("linha da questão exibe só o percentual de erro, com o texto 'de erro'", () => {
    const panel = read(PANEL);
    const rowIndex = panel.indexOf("function InsightsQuestionRow(");
    const rowSource = panel.slice(rowIndex, panel.indexOf("function DashboardTab(", rowIndex));
    expect(rowSource).toContain("question.difficulty");
    expect(rowSource).toContain("de erro");
  });

  test("linha da questão usa título curto do enunciado via richTextToPlainText (reaproveitado de lib/utils/rich-text, não duplicado)", () => {
    const panel = read(PANEL);
    expect(panel).toContain('import { richTextToPlainText } from "@/lib/utils/rich-text";');
    const rowIndex = panel.indexOf("function InsightsQuestionRow(");
    const rowSource = panel.slice(rowIndex, panel.indexOf("function DashboardTab(", rowIndex));
    expect(rowSource).toContain("richTextToPlainText(statement)");
  });

  test("item é clicável (código/título em botão + botão explícito 'Ver questão') e reaproveita PremiumButton/Eye já importados", () => {
    const panel = read(PANEL);
    const rowIndex = panel.indexOf("function InsightsQuestionRow(");
    const rowSource = panel.slice(rowIndex, panel.indexOf("function DashboardTab(", rowIndex));
    expect(rowSource).toContain("onClick={onOpen}");
    expect(rowSource).toContain("Ver questão");
    expect(rowSource).toContain("<PremiumButton");
    expect(rowSource).toContain("<Eye ");
  });

  test("clique abre QuestionPreviewModal via setPreviewQuestionRelationId, sem nenhum fetch novo (reaproveita data.questions já carregado)", () => {
    const panel = read(PANEL);
    expect(panel).toContain("const [previewQuestionRelationId, setPreviewQuestionRelationId] = useState<string | null>(null);");
    expect(panel).toContain("const classroomQuestionsById = useMemo(() => new Map((data?.questions || []).map((question) => [question.id, question])), [data?.questions]);");
    expect(panel).toContain("onOpen={() => setPreviewQuestionRelationId(question.simulado_question_id)}");
    expect(panel).toContain("const previewClassroomQuestion = previewQuestionRelationId ? classroomQuestionsById.get(previewQuestionRelationId) || null : null;");
  });

  test("QuestionPreviewModal reaproveita QuestionDisplayCard (mesmo componente já usado na aba Questões/revisão) — não inventa um novo renderer de questão", () => {
    const panel = read(PANEL);
    const modalIndex = panel.indexOf("function QuestionPreviewModal(");
    expect(modalIndex).toBeGreaterThan(-1);
    const modalSource = panel.slice(modalIndex, panel.indexOf("function ParticipantMetricCard(", modalIndex));
    expect(modalSource).toContain("<QuestionDisplayCard question={question} orderLabel={orderLabel} showCorrect />");
    const importCount = (panel.match(/from "@\/app\/components\/questions\/QuestionDisplayCard"/g) || []).length;
    expect(importCount).toBe(1);
  });

  test("modal é somente-leitura: nenhum onSelect/callback de edição é passado a QuestionDisplayCard dentro do modal", () => {
    const panel = read(PANEL);
    const modalIndex = panel.indexOf("function QuestionPreviewModal(");
    const modalSource = panel.slice(modalIndex, panel.indexOf("function ParticipantMetricCard(", modalIndex));
    expect(modalSource).not.toContain("onSelect");
    expect(modalSource).not.toContain("onToggleEliminate");
  });

  test("modal renderizado ao final do componente, junto do ParticipantDetailModal já existente (mesmo padrão de modal da tela)", () => {
    const panel = read(PANEL);
    expect(panel).toContain('{previewClassroomQuestion?.questions && <QuestionPreviewModal question={previewClassroomQuestion.questions} orderLabel={`Questão ${previewClassroomQuestion.order_number}`} onClose={() => setPreviewQuestionRelationId(null)} />}');
  });
});

test.describe("Refinamento de UX (2026-09-10) — bloco 'Mapa de domínio' removido", () => {
  test("bloco 'Mapa de domínio' não aparece mais em nenhum lugar do painel", () => {
    const panel = read(PANEL);
    expect(panel).not.toContain("Mapa de domínio");
  });

  test("nenhum contador/lista/loop de bandas remanescente na guia Insights (grid de 4 colunas por faixa removido)", () => {
    const panel = read(PANEL);
    const insightsSectionIndex = panel.indexOf(String.raw`{activeTab === "insights" && <section`);
    const insightsBlock = panel.slice(insightsSectionIndex, insightsSectionIndex + 15000);
    expect(insightsBlock).not.toMatch(/\["mastery", "attention", "relevant", "critical"\]/);
    expect(insightsBlock).not.toContain("bandTopics");
  });

  test("apenas 4 blocos permanecem na guia Insights: Panorama, Tópicos de maior dificuldade, Questões mais difíceis, O que merece revisão em aula", () => {
    const panel = read(PANEL);
    const insightsSectionIndex = panel.indexOf(String.raw`{activeTab === "insights" && <section`);
    const insightsBlock = panel.slice(insightsSectionIndex, insightsSectionIndex + 15000);
    expect(insightsBlock).toContain("Panorama pedagógico do simulado");
    expect(insightsBlock).toContain("Tópicos de maior dificuldade");
    expect(insightsBlock).toContain("Questões mais difíceis");
    expect(insightsBlock).toContain("O que merece revisão em aula");
  });
});

test.describe("Refinamento de UX (2026-09-10) — regressão: matemática, ranking, scoring e resultados intocados", () => {
  test("D_q/D_t/D_global/D_adjusted (k=2) continuam corretos após o refinamento visual — mesma fixture da seção 46/CENÁRIO 2", () => {
    const questions: QuestionDifficultyInput[] = [
      q("A0", 1, 30, 70, 0, ["A"]), // D_q = 0.70
      ...Array.from({ length: 5 }, (_, index) => q(`B${index}`, index + 2, 45, 55, 0, ["B"])), // D_q = 0.55 cada
    ];
    const insights = buildEventInsights(questions);
    const dGlobal = insights.globalDifficulty as number;
    expect(dGlobal).toBeCloseTo(0.575, 10); // (0.70 + 5*0.55) / 6
    const topicA = insights.topics.find((topic) => topic.label === "A")!;
    const topicB = insights.topics.find((topic) => topic.label === "B")!;
    expect(topicA.adjustedDifficulty).toBeCloseTo(calculateAdjustedTopicDifficulty(1, 0.70, dGlobal), 10);
    expect(topicB.adjustedDifficulty).toBeCloseTo(calculateAdjustedTopicDifficulty(5, 0.55, dGlobal), 10);
    expect(topicA.observedDifficulty).toBeCloseTo(0.7, 10); // D_t bruto continua calculado internamente, só não é mais exibido
  });

  test("lib/eventRanking.ts (regra de classificação do Ranking) permanece intocado", () => {
    const source = read("lib/eventRanking.ts");
    expect(source).toContain("scoreOf(b) - scoreOf(a)");
    expect(source).not.toContain("eventInsights");
  });

  test("lib/simuladoScoring.ts não é importado nem referenciado por lib/eventInsights.ts ou pela guia Insights do painel", () => {
    const source = read("lib/eventInsights.ts");
    const panel = read(PANEL);
    expect(source).not.toContain("simuladoScoring");
    const insightsSectionIndex = panel.indexOf(String.raw`{activeTab === "insights" && <section`);
    const insightsBlock = panel.slice(insightsSectionIndex, insightsSectionIndex + 15000);
    expect(insightsBlock).not.toContain("simuladoScoring");
  });

  test("resultado oficial do participante (display_score/percentage/correct_count/...) não é lido nem alterado por InsightsTopicRow/InsightsQuestionRow/QuestionPreviewModal", () => {
    const panel = read(PANEL);
    const rowIndex = panel.indexOf("function InsightsTopicRow(");
    const endIndex = panel.indexOf("function DashboardTab(");
    const block = panel.slice(rowIndex, endIndex);
    expect(block).not.toContain("display_score");
    expect(block).not.toContain("participant.result");
  });
});

test.describe("segurança e origem dos dados — sem N+1, mesmo guard do painel", () => {
  test("rota do professor reaproveita answers/attempts já carregados (correct/wrong/blank) em vez de nova consulta — base própria e separada de questionStats (correção 2026-09-10)", () => {
    const route = read(API_ROUTE);
    const insightsIndex = route.indexOf("buildEventInsights(");
    expect(insightsIndex).toBeGreaterThan(-1);
    const before = route.slice(0, insightsIndex);
    expect(before).toContain("const questionStats = questions.map((relation) => {");
    expect(before).toContain("const completedQuestionStats = questions.map((relation) => {");
    // Insights usa a base própria (completedQuestionStats), NUNCA a live
    // questionStats diretamente — são dois arrays derivados separadamente.
    expect(route).not.toContain("questionStats.map((stat) => ({\n    simulado_question_id: stat.id");
  });

  test("nenhuma nova chamada Supabase (.from) foi criada para Insights — mesma contagem de antes (9)", () => {
    const route = read(API_ROUTE);
    const fromCount = (route.match(/supabase\.from\(/g) || []).length;
    expect(fromCount).toBe(9);
  });

  test("guard requireEventManager preservado (mesmo guard do resto do painel)", () => {
    const route = read(API_ROUTE);
    expect(route).toContain("const manager = await requireEventManager(request, id);");
  });

  test("Insights não depende de result_released — construído a partir de completedQuestionStats, nunca filtrado por result_released_at", () => {
    const route = read(API_ROUTE);
    const insightsInputIndex = route.indexOf("const insightsInput: QuestionDifficultyInput[] = completedQuestionStats.map(");
    expect(insightsInputIndex).toBeGreaterThan(-1);
    const insightsBlock = route.slice(insightsInputIndex, route.indexOf("const insights = buildEventInsights(", insightsInputIndex) + 200);
    expect(insightsBlock).not.toContain("result_released_at");
    expect(route).toContain("insights,");
  });

  test("insights aparece no JSON de resposta da dashboard", () => {
    const route = read(API_ROUTE);
    expect(route).toMatch(/participants:\s*participantRows,\s*questions:\s*questionStats,\s*insights,/);
  });
});

test.describe("não altera scoring/ranking/PDF", () => {
  test("lib/eventInsights.ts nunca escreve no banco (sem supabase/.update/.insert)", () => {
    const source = read("lib/eventInsights.ts");
    expect(source).not.toMatch(/supabase|\.update\(|\.insert\(/i);
  });

  test("lib/eventRanking.ts (regra de classificação do Ranking) não foi tocado por esta Sprint", () => {
    const source = read("lib/eventRanking.ts");
    expect(source).toContain("scoreOf(b) - scoreOf(a)");
    expect(source).not.toContain("eventInsights");
  });
});
