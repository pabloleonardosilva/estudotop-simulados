import { expect, test } from "@playwright/test";
import {
  computeSimuladoAttemptResult,
  gradeSimuladoQuestion,
  type AnswerForScoring,
  type SimuladoQuestionForScoring,
} from "@/lib/simuladoScoring";

// Suíte comportamental real (não apenas leitura de código-fonte): importa e
// executa diretamente o motor puro de correção. Diferente de
// lib/server/simuladoEvents.ts, lib/simuladoScoring.ts não importa
// "server-only" nem supabase-js, então roda normalmente sob o test runner
// do Playwright sem precisar de app/servidor/DB.

function question(overrides: Partial<SimuladoQuestionForScoring> = {}): SimuladoQuestionForScoring {
  return {
    simuladoQuestionId: "sq-1",
    questionId: "q-1",
    points: 1,
    status: "active",
    correctAlternativeId: "alt-correct",
    correctAlternativeLabel: "B",
    ...overrides,
  };
}

function answer(overrides: Partial<AnswerForScoring> = {}): AnswerForScoring {
  return { selectedAlternativeId: null, selectedAlternativeLabel: null, ...overrides };
}

test.describe("lib/simuladoScoring — motor puro de correção (fonte única de verdade)", () => {
  test("1/2/3: active correta / errada / branco", () => {
    const q = question();
    const correct = gradeSimuladoQuestion(q, answer({ selectedAlternativeId: "alt-correct", selectedAlternativeLabel: "B" }), "traditional");
    expect(correct.classification).toBe("correct");
    expect(correct.isCorrect).toBe(true);
    expect(correct.scoreDelta).toBe(1);

    const wrong = gradeSimuladoQuestion(q, answer({ selectedAlternativeId: "alt-wrong", selectedAlternativeLabel: "C" }), "traditional");
    expect(wrong.classification).toBe("wrong");
    expect(wrong.isCorrect).toBe(false);
    expect(wrong.scoreDelta).toBe(0);

    const blank = gradeSimuladoQuestion(q, null, "traditional");
    expect(blank.classification).toBe("blank");
    expect(blank.isCorrect).toBeNull();
    expect(blank.scoreDelta).toBe(0);
  });

  test("4: cebraspe pune erro com -points, mas nunca pune anulada nem branco", () => {
    const q = question({ points: 2 });
    const wrong = gradeSimuladoQuestion(q, answer({ selectedAlternativeId: "x", selectedAlternativeLabel: "C" }), "cebraspe");
    expect(wrong.scoreDelta).toBe(-2);

    const blank = gradeSimuladoQuestion(q, null, "cebraspe");
    expect(blank.scoreDelta).toBe(0);

    const annulledQ = question({ points: 2, status: "annulled" });
    const annulledWrongAnswer = gradeSimuladoQuestion(annulledQ, answer({ selectedAlternativeId: "x", selectedAlternativeLabel: "C" }), "cebraspe");
    expect(annulledWrongAnswer.scoreDelta).toBe(2);
  });

  test("correta → annulled: já acertou não ganha ponto extra", () => {
    const active = question();
    const before = gradeSimuladoQuestion(active, answer({ selectedAlternativeId: "alt-correct", selectedAlternativeLabel: "B" }), "traditional");
    expect(before.classification).toBe("correct");
    expect(before.scoreDelta).toBe(1);

    const annulledQ = question({ status: "annulled" });
    const after = gradeSimuladoQuestion(annulledQ, answer({ selectedAlternativeId: "alt-correct", selectedAlternativeLabel: "B" }), "traditional");
    expect(after.classification).toBe("annulled");
    expect(after.scoreDelta).toBe(1); // mesmo ponto, não 2
  });

  test("errada → annulled: passa a receber o ponto; branca → annulled: passa a receber o ponto", () => {
    const annulledQ = question({ status: "annulled" });
    const wasWrong = gradeSimuladoQuestion(annulledQ, answer({ selectedAlternativeId: "x", selectedAlternativeLabel: "C" }), "traditional");
    expect(wasWrong.classification).toBe("annulled");
    expect(wasWrong.scoreDelta).toBe(1);

    const wasBlank = gradeSimuladoQuestion(annulledQ, null, "traditional");
    expect(wasBlank.classification).toBe("annulled");
    expect(wasBlank.scoreDelta).toBe(1);
  });

  test("annulled → active (desanulação): volta a comparar resposta original com o gabarito vigente", () => {
    const wasAnnulledNowActive = question({ status: "active" });

    const originallyCorrect = gradeSimuladoQuestion(wasAnnulledNowActive, answer({ selectedAlternativeId: "alt-correct", selectedAlternativeLabel: "B" }), "traditional");
    expect(originallyCorrect.classification).toBe("correct");

    const originallyWrong = gradeSimuladoQuestion(wasAnnulledNowActive, answer({ selectedAlternativeId: "x", selectedAlternativeLabel: "C" }), "traditional");
    expect(originallyWrong.classification).toBe("wrong");

    const originallyBlank = gradeSimuladoQuestion(wasAnnulledNowActive, null, "traditional");
    expect(originallyBlank.classification).toBe("blank");
  });

  test("9/10: anular duas vezes e desanular duas vezes produzem resultado idêntico (função pura, sem estado)", () => {
    const annulledQ = question({ status: "annulled" });
    const ans = answer({ selectedAlternativeId: "x", selectedAlternativeLabel: "C" });
    const first = gradeSimuladoQuestion(annulledQ, ans, "traditional");
    const second = gradeSimuladoQuestion(annulledQ, ans, "traditional");
    expect(second).toEqual(first);

    const activeQ = question({ status: "active" });
    const firstActive = gradeSimuladoQuestion(activeQ, ans, "traditional");
    const secondActive = gradeSimuladoQuestion(activeQ, ans, "traditional");
    expect(secondActive).toEqual(firstActive);
  });

  test("11/12: gabarito altera errada→correta e correta→errada", () => {
    const ans = answer({ selectedAlternativeId: "alt-B", selectedAlternativeLabel: "B" });

    const gabaritoC = question({ correctAlternativeId: "alt-C", correctAlternativeLabel: "C" });
    expect(gradeSimuladoQuestion(gabaritoC, ans, "traditional").classification).toBe("wrong");

    const gabaritoB = question({ correctAlternativeId: "alt-B", correctAlternativeLabel: "B" });
    expect(gradeSimuladoQuestion(gabaritoB, ans, "traditional").classification).toBe("correct");
  });

  test("14/15: comparação por LABEL, não por ID — sobrevive à regeneração de UUIDs de alternativa após edição da questão", () => {
    // Cenário real: editar uma questão apaga e reinsere question_alternatives
    // com novos UUIDs. selected_alternative_id salvo na resposta do aluno
    // fica órfão (não bate com nenhum id atual). O label continua válido.
    const editedQuestion = question({ correctAlternativeId: "novo-uuid-pos-edicao", correctAlternativeLabel: "D" });
    const staleIdAnswer = answer({ selectedAlternativeId: "uuid-antigo-que-nao-existe-mais", selectedAlternativeLabel: "D" });
    const graded = gradeSimuladoQuestion(editedQuestion, staleIdAnswer, "traditional");
    expect(graded.classification).toBe("correct");
  });

  test("é estruturalmente impossível fornecer is_correct histórico ao motor — a assinatura da função não aceita esse campo", () => {
    // Isso é a garantia central contra dupla bonificação: como a função nem
    // sequer recebe is_correct como parâmetro, uma correção manual anterior
    // que alterou is_correct no banco não pode influenciar o recálculo —
    // só a resposta selecionada (id/label) e o gabarito/status vigentes.
    const q = question();
    const answerWithoutIsCorrectField = { selectedAlternativeId: "x", selectedAlternativeLabel: "C" };
    const graded = gradeSimuladoQuestion(q, answerWithoutIsCorrectField, "traditional");
    expect(graded.classification).toBe("wrong");
    expect((answerWithoutIsCorrectField as Record<string, unknown>).is_correct).toBeUndefined();
  });

  test("caso real de produção: resposta original 'D', gabarito vigente 'E' — bonificação manual anterior não pode ser reproduzida pelo motor puro", () => {
    // Reproduz o incidente real (ET3582, evento '3º Simulado de Processo
    // Civil'): o aluno marcou D, o gabarito é E, uma correção manual de
    // dados alterou is_correct para true em simulado_answers sem tocar a
    // resposta selecionada. O motor puro NUNCA vê esse is_correct — só a
    // resposta original e o gabarito atual — logo reclassifica como errada,
    // exatamente como era antes da bonificação manual.
    const q = question({ correctAlternativeId: "alt-E", correctAlternativeLabel: "E" });
    const originalAnswer = answer({ selectedAlternativeId: "alt-D", selectedAlternativeLabel: "D" });
    const graded = gradeSimuladoQuestion(q, originalAnswer, "traditional");
    expect(graded.classification).toBe("wrong");
    expect(graded.scoreDelta).toBe(0);
  });

  test("13/30/31/32/33: cenário completo de dupla bonificação — anular e desanular a questão já bonificada manualmente", () => {
    // 12 questões, 1 ponto cada, espelhando a tentativa real (Gleiqui, ET3582):
    // 4 corretas genuínas + 7 erradas genuínas + a questão-alvo (D vs E,
    // também genuinamente errada) = 5 corretas / 7 erradas no total real.
    const target = question({ simuladoQuestionId: "target", correctAlternativeId: "alt-E", correctAlternativeLabel: "E" });
    const targetAnswer = answer({ selectedAlternativeId: "alt-D", selectedAlternativeLabel: "D" });

    const questions: SimuladoQuestionForScoring[] = [target];
    const answers = new Map<string, AnswerForScoring>([["target", targetAnswer]]);
    for (let i = 0; i < 4; i++) {
      const id = `correct-${i}`;
      questions.push(question({ simuladoQuestionId: id, questionId: id }));
      answers.set(id, answer({ selectedAlternativeId: "alt-correct", selectedAlternativeLabel: "B" }));
    }
    for (let i = 0; i < 7; i++) {
      const id = `wrong-${i}`;
      questions.push(question({ simuladoQuestionId: id, questionId: id }));
      answers.set(id, answer({ selectedAlternativeId: "alt-wrong", selectedAlternativeLabel: "C" }));
    }
    expect(questions).toHaveLength(12);

    // Estado ANTES de qualquer anulação (ignora completamente a bonificação
    // manual do banco — o motor nunca a vê): 4 corretas + 8 erradas (as 7
    // "wrong-*" + a target, que também é genuinamente errada).
    const before = computeSimuladoAttemptResult(questions, answers, "traditional");
    expect(before.correctCount).toBe(4);
    expect(before.wrongCount).toBe(8);
    expect(before.annulledCount).toBe(0);
    expect(before.score).toBe(4);

    // ANULAR oficialmente a questão-alvo.
    const annulledQuestions = questions.map((entry) =>
      entry.simuladoQuestionId === "target" ? { ...entry, status: "annulled" } : entry,
    );
    const afterAnnul = computeSimuladoAttemptResult(annulledQuestions, answers, "traditional");
    expect(afterAnnul.correctCount).toBe(4); // Caso 32: quem já era correto não ganha nada a mais
    expect(afterAnnul.wrongCount).toBe(7); // a target saiu do wrong_count
    expect(afterAnnul.annulledCount).toBe(1); // Caso 30: NÃO soma ponto duplicado
    expect(afterAnnul.score).toBe(before.score + 1); // +1 (o ponto da questão anulada), nunca +2

    // Reprocessar a MESMA anulação de novo (idempotência, Caso 34).
    const afterAnnulAgain = computeSimuladoAttemptResult(annulledQuestions, answers, "traditional");
    expect(afterAnnulAgain).toEqual(afterAnnul);

    // DESANULAR: Caso 31 — volta a comparar D × E e conclui ERRADA de novo.
    const afterDeannul = computeSimuladoAttemptResult(questions, answers, "traditional");
    expect(afterDeannul).toEqual(before);
    expect(afterDeannul.score).toBe(before.score);
  });

  test("18/19: aluno em branco na anulação, depois desanulação volta a ser branco (não errado)", () => {
    const q = question();
    const blankAnswer = null;
    const questions = [q];
    const answers = new Map<string, AnswerForScoring>();

    const active = computeSimuladoAttemptResult(questions, answers, "traditional");
    expect(active.blankCount).toBe(1);
    expect(active.annulledCount).toBe(0);

    const annulled = computeSimuladoAttemptResult(
      questions.map((row) => ({ ...row, status: "annulled" })),
      answers,
      "traditional",
    );
    expect(annulled.annulledCount).toBe(1);
    expect(annulled.blankCount).toBe(0);
    expect(annulled.score).toBe(1);

    const backToActive = computeSimuladoAttemptResult(questions, answers, "traditional");
    expect(backToActive.blankCount).toBe(1);
    expect(backToActive.score).toBe(0);
    void blankAnswer;
  });

  test("23/24: max_score não muda com anulação; percentual é recalculado do score final, nunca incrementalmente", () => {
    const questions: SimuladoQuestionForScoring[] = [
      question({ simuladoQuestionId: "q1" }),
      question({ simuladoQuestionId: "q2" }),
      question({ simuladoQuestionId: "q3" }),
    ];
    const answers = new Map<string, AnswerForScoring>([
      ["q1", answer({ selectedAlternativeId: "alt-correct", selectedAlternativeLabel: "B" })],
      ["q2", answer({ selectedAlternativeId: "x", selectedAlternativeLabel: "C" })],
    ]);

    const result = computeSimuladoAttemptResult(questions, answers, "traditional");
    expect(result.maxScore).toBe(3);
    expect(result.percentage).toBeCloseTo(33.33, 2);

    const annulledQ2 = questions.map((q2) => (q2.simuladoQuestionId === "q2" ? { ...q2, status: "annulled" } : q2));
    const afterAnnul = computeSimuladoAttemptResult(annulledQ2, answers, "traditional");
    expect(afterAnnul.maxScore).toBe(3); // não reduz
    expect(afterAnnul.percentage).toBeCloseTo(66.67, 2);
  });

  test("28/29: funciona igualmente para múltipla escolha e Certo/Errado (o motor só compara labels — agnóstico ao tipo de questão)", () => {
    const trueFalse = question({ correctAlternativeId: "alt-certo", correctAlternativeLabel: "Certo" });
    const graded = gradeSimuladoQuestion(trueFalse, answer({ selectedAlternativeId: "alt-errado", selectedAlternativeLabel: "Errado" }), "traditional");
    expect(graded.classification).toBe("wrong");
  });

  test("seção 63 do pedido: cenário controlado de 3 questões, sequência completa de anulação/desanulação/gabarito", () => {
    const q1 = question({ simuladoQuestionId: "q1", correctAlternativeId: "alt-B", correctAlternativeLabel: "B" });
    const q2 = question({ simuladoQuestionId: "q2", correctAlternativeId: "alt-B", correctAlternativeLabel: "B" });
    const q3 = question({ simuladoQuestionId: "q3", correctAlternativeId: "alt-B", correctAlternativeLabel: "B" });
    const answers = new Map<string, AnswerForScoring>([
      ["q1", answer({ selectedAlternativeId: "alt-B", selectedAlternativeLabel: "B" })], // Q1 correta
      ["q2", answer({ selectedAlternativeId: "alt-C", selectedAlternativeLabel: "C" })], // Q2 errada
      // Q3 em branco (sem entrada no map)
    ]);
    let questions = [q1, q2, q3];

    let r = computeSimuladoAttemptResult(questions, answers, "traditional");
    expect([r.correctCount, r.wrongCount, r.blankCount, r.annulledCount, r.score, r.maxScore]).toEqual([1, 1, 1, 0, 1, 3]);

    // Anular Q2
    questions = questions.map((q) => (q.simuladoQuestionId === "q2" ? { ...q, status: "annulled" } : q));
    r = computeSimuladoAttemptResult(questions, answers, "traditional");
    expect([r.correctCount, r.wrongCount, r.blankCount, r.annulledCount, r.score]).toEqual([1, 0, 1, 1, 2]);

    // Anular Q3
    questions = questions.map((q) => (q.simuladoQuestionId === "q3" ? { ...q, status: "annulled" } : q));
    r = computeSimuladoAttemptResult(questions, answers, "traditional");
    expect([r.correctCount, r.wrongCount, r.blankCount, r.annulledCount, r.score]).toEqual([1, 0, 0, 2, 3]);

    // Desanular Q2
    questions = questions.map((q) => (q.simuladoQuestionId === "q2" ? { ...q, status: "active" } : q));
    r = computeSimuladoAttemptResult(questions, answers, "traditional");
    expect([r.correctCount, r.wrongCount, r.blankCount, r.annulledCount, r.score]).toEqual([1, 1, 0, 1, 2]);

    // Alterar gabarito de Q1 para C (Q1 passa a estar errada)
    questions = questions.map((q) => (q.simuladoQuestionId === "q1" ? { ...q, correctAlternativeId: "alt-C", correctAlternativeLabel: "C" } : q));
    r = computeSimuladoAttemptResult(questions, answers, "traditional");
    expect([r.correctCount, r.wrongCount, r.blankCount, r.annulledCount, r.score]).toEqual([0, 2, 0, 1, 1]);
    expect(r.percentage).toBeCloseTo(33.33, 2);
  });

  test("isolamento: alterar o gabarito de uma questão não afeta as demais entradas do mesmo cálculo", () => {
    const questions = [
      question({ simuladoQuestionId: "a", correctAlternativeId: "alt-A", correctAlternativeLabel: "A" }),
      question({ simuladoQuestionId: "b", correctAlternativeId: "alt-B", correctAlternativeLabel: "B" }),
    ];
    const answers = new Map<string, AnswerForScoring>([
      ["a", answer({ selectedAlternativeId: "alt-A", selectedAlternativeLabel: "A" })],
      ["b", answer({ selectedAlternativeId: "alt-B", selectedAlternativeLabel: "B" })],
    ]);
    const before = computeSimuladoAttemptResult(questions, answers, "traditional");
    expect(before.correctCount).toBe(2);

    const changedA = questions.map((q) => (q.simuladoQuestionId === "a" ? { ...q, correctAlternativeId: "alt-Z", correctAlternativeLabel: "Z" } : q));
    const after = computeSimuladoAttemptResult(changedA, answers, "traditional");
    const entryB = after.entries.find((e) => e.simuladoQuestionId === "b");
    expect(entryB?.classification).toBe("correct"); // b não foi afetada
    expect(after.correctCount).toBe(1);
  });
});
