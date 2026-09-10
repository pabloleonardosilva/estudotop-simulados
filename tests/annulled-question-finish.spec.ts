import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Questões anuladas — finalização obrigatória + selo visual
// (docs/Sprint-simulados.md, "Questões anuladas não bloqueiam a
// finalização", 2026-09-10). Cobertura estrutural (sem Postgres/browser
// real neste ambiente) + execução real da lógica de bloqueio replicada
// fielmente do código de produção (mesmo padrão de
// tests/registration-attempts-cleanup.spec.ts, seção 5).

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n/g, "\n");

const RUNNER = "app/meus-simulados/[id]/page-client.tsx";
const PREVIEW = "app/simulados/[id]/preview/page-client.tsx";
const SUBMIT_ROUTE = "app/api/student/simulados/[id]/attempts/[attemptId]/submit/route.ts";
// Extraído em 2026-09-10 (Sprint "Timeout server-side"): a lógica de
// conclusão (guard de branco, scoring, RPC atômica, pós-processamento) mora
// agora em lib/server/simuladoAttemptCompletion.ts — reaproveitada também
// pelo job de timeout server-side. submit/route.ts virou um wrapper fino
// (auth/ownership) que delega a ela.
const COMPLETION_LIB = "lib/server/simuladoAttemptCompletion.ts";

// ─── Lógica replicada fielmente (mesma fórmula usada nos 3 pontos reais:
// FinishConfirm do runner, FinishConfirm do preview, e o guard de blank do
// submit/route.ts) ───────────────────────────────────────────────────────
function isFinalizationBlocked(input: { totalQuestions: number; annulledCount: number; answeredRequired: number; allowBlank: boolean }) {
  const requiredCount = input.totalQuestions - input.annulledCount;
  return !input.allowBlank && input.answeredRequired < requiredCount;
}

test.describe("1. Casos obrigatórios (execução real da regra replicada)", () => {
  test("CASO A: 10 questões, 0 anuladas, não permite branco, 9 respondidas → bloqueia", () => {
    expect(isFinalizationBlocked({ totalQuestions: 10, annulledCount: 0, answeredRequired: 9, allowBlank: false })).toBe(true);
  });

  test("CASO B: 10 questões, 0 anuladas, não permite branco, 10 respondidas → permite", () => {
    expect(isFinalizationBlocked({ totalQuestions: 10, annulledCount: 0, answeredRequired: 10, allowBlank: false })).toBe(false);
  });

  test("CASO C: 10 questões, 1 anulada, não permite branco, 8 das 9 respondíveis → bloqueia", () => {
    expect(isFinalizationBlocked({ totalQuestions: 10, annulledCount: 1, answeredRequired: 8, allowBlank: false })).toBe(true);
  });

  test("CASO D: 10 questões, 1 anulada, não permite branco, 9 das 9 respondíveis → permite (o bug original)", () => {
    expect(isFinalizationBlocked({ totalQuestions: 10, annulledCount: 1, answeredRequired: 9, allowBlank: false })).toBe(false);
  });

  test("CASO E: 10 questões, 2 anuladas, não permite branco, 8 das 8 respondíveis → permite", () => {
    expect(isFinalizationBlocked({ totalQuestions: 10, annulledCount: 2, answeredRequired: 8, allowBlank: false })).toBe(false);
  });

  test("CASO F: 10 questões, 2 anuladas, não permite branco, 7 das 8 respondíveis → bloqueia", () => {
    expect(isFinalizationBlocked({ totalQuestions: 10, annulledCount: 2, answeredRequired: 7, allowBlank: false })).toBe(true);
  });

  test("edge: 10 questões, 10 anuladas, não permite branco, 0 respondidas → permite (nenhuma pendência respondível)", () => {
    expect(isFinalizationBlocked({ totalQuestions: 10, annulledCount: 10, answeredRequired: 0, allowBlank: false })).toBe(false);
  });

  test("permitir branco continua permitindo finalização independente de pendências (regra 15 preservada)", () => {
    expect(isFinalizationBlocked({ totalQuestions: 10, annulledCount: 1, answeredRequired: 0, allowBlank: true })).toBe(false);
    expect(isFinalizationBlocked({ totalQuestions: 10, annulledCount: 0, answeredRequired: 3, allowBlank: true })).toBe(false);
  });
});

test.describe("2. Cliente — runner real (app/meus-simulados/[id]/page-client.tsx)", () => {
  test("requiredQuestions exclui status === annulled (mesma definição de simulado_questions.status usada em sendAnswer/scoring)", () => {
    const source = read(RUNNER);
    expect(source).toContain('question.status === "annulled"'); // sendAnswer já bloqueava
    expect(source).toContain('questions.filter((question) => question.status !== "annulled")');
  });

  test("FinishConfirm recebe total/answeredCount já baseados em requiredQuestions, não em questions.length bruto", () => {
    const source = read(RUNNER);
    const start = source.indexOf("<FinishConfirm");
    const body = source.slice(start, source.indexOf("/>", start));
    expect(body).toContain("answeredCount={answeredRequiredCount}");
    expect(body).toContain("total={requiredQuestions.length}");
  });

  test("QuestionSidePanel (Faltam/Respondidas) também usa os valores respondíveis", () => {
    const source = read(RUNNER);
    const start = source.indexOf("<QuestionSidePanel");
    const body = source.slice(start, source.indexOf("/>", start) > -1 ? source.indexOf("questionNumber=", start) : undefined);
    expect(body).toContain("answeredCount={answeredRequiredCount}");
    expect(body).toContain("totalQuestions={requiredQuestions.length}");
  });

  test("navegador de questões nunca rotula anulada como 'pendente'", () => {
    const source = read(RUNNER);
    const mapIndex = source.indexOf("questions.map((question, index) => {");
    const gridBlock = source.slice(mapIndex, mapIndex + 1200);
    expect(gridBlock).toContain('const isAnnulled = question.status === "annulled"');
    expect(gridBlock).toContain("`Questão ${index + 1} anulada`");
    expect(gridBlock).not.toMatch(/isAnnulled[\s\S]{0,200}pendente[\s\S]{0,50}isAnnulled/);
  });

  test("questão anulada nunca é marcada como respondida (nenhum hack answered=true)", () => {
    const source = read(RUNNER);
    expect(source).not.toMatch(/isAnnulled[^\n]*answered\s*=\s*true/);
    expect(source).not.toMatch(/annulled[^\n]*=\s*{\s*true\s*}[^\n]*answered/i);
  });
});

test.describe("3. Cliente — preview admin (app/simulados/[id]/preview/page-client.tsx)", () => {
  test("mesma correção replicada, sem divergência entre telas", () => {
    const source = read(PREVIEW);
    expect(source).toContain('questions.filter((question) => question.status !== "annulled")');
    const finishStart = source.indexOf("<FinishConfirm");
    const finishBody = source.slice(finishStart, source.indexOf("/>", finishStart));
    expect(finishBody).toContain("answeredCount={answeredRequiredCount}");
    expect(finishBody).toContain("total={requiredQuestions.length}");
  });

  test("PreviewQuestionSidePanel e grid de navegação também corrigidos", () => {
    const source = read(PREVIEW);
    expect(source).toContain("answeredCount={answeredRequiredCount}");
    expect(source).toContain("totalQuestions={requiredQuestions.length}");
    expect(source).toContain("`Questão ${index + 1} anulada`");
  });
});

test.describe("4. Servidor é soberano — lib/server/simuladoAttemptCompletion.ts (reaproveitado pelo submit e pelo job de timeout)", () => {
  test("guard de branco recalculado a partir de questionRows/answersBySQ, nunca confia em contagem do client", () => {
    const source = read(COMPLETION_LIB);
    expect(source).toContain('const requiredQuestionRows = questionRows.filter((row) => row.status !== "annulled");');
    expect(source).toContain("const answeredRequiredQuestions = requiredQuestionRows.filter(");
    expect(source).toContain("answersBySQ.get(row.id)?.selected_alternative_id");
    // Atualizado em 2026-09-10 (Sprint "Encerramento compulsório por tempo
    // esgotado"): o guard ganhou !isExpired — quando o tempo da tentativa já
    // acabou, o bloqueio de branco cede (ver tests/attempt-timeout-completion.spec.ts).
    // A exigência para anuladas (nunca respondíveis, nunca pendência) permanece
    // idêntica quando ainda há tempo.
    expect(source).toContain("if (!allowBlank && !isExpired && answeredRequiredQuestions < requiredQuestionRows.length) {");
  });

  test("o body enviado pelo client (SubmitPayload) não carrega answeredCount/blankCount — servidor não confia nele", () => {
    const source = read(SUBMIT_ROUTE);
    const typeStart = source.indexOf("type SubmitPayload");
    const typeBody = source.slice(typeStart, source.indexOf("};", typeStart));
    expect(typeBody).not.toContain("answered");
    expect(typeBody).not.toContain("blank");
    expect(typeBody).not.toContain("unanswered");
  });

  test("answeredQuestions original (snapshot de total_questions/answered_questions) permanece intocado — total_questions continua questionRows.length", () => {
    const source = read(COMPLETION_LIB);
    expect(source).toContain("const answeredQuestions = answers.filter((row) => row.selected_alternative_id).length;");
    expect(source).toContain("total_questions: questionRows.length,");
    expect(source).toContain("answered_questions: answeredQuestions,");
  });

  test("engine transacional (complete_student_attempt) não foi tocada — mesma chamada RPC de antes", () => {
    const source = read(COMPLETION_LIB);
    expect(source).toContain('supabase.rpc("complete_student_attempt"');
    expect(source).toContain("p_expected_updated_at: attempt.updated_at");
  });

  test("scoring (computeSimuladoAttemptResult) não foi tocado — mesma importação/uso de lib/simuladoScoring.ts", () => {
    const source = read(COMPLETION_LIB);
    expect(source).toContain('import { computeSimuladoAttemptResult, type AnswerForScoring, type SimuladoQuestionForScoring } from "@/lib/simuladoScoring";');
  });

  test("submit/route.ts delega para a função compartilhada em vez de duplicar a lógica — só valida ownership/contexto antes", () => {
    const source = read(SUBMIT_ROUTE);
    expect(source).toContain('import { completeSimuladoAttempt } from "@/lib/server/simuladoAttemptCompletion";');
    expect(source).toContain("const result = await completeSimuladoAttempt(supabase, {");
    expect(source).not.toContain('supabase.rpc("complete_student_attempt"');
    expect(source).not.toContain("computeSimuladoAttemptResult(");
  });
});

test.describe("5. Selo visual 'Questão anulada' — causa raiz corrigida (stacking, não hack)", () => {
  for (const [label, file] of [["runner real", RUNNER], ["preview admin", PREVIEW]] as const) {
    test(`${label}: section vira stacking context isolado (isolate) e o overlay ganha z-index explícito acima dos elementos internos (z-20 do botão eliminar)`, () => {
      const source = read(file);
      const sectionIndex = source.indexOf('className="relative isolate overflow-hidden rounded-[2rem]');
      expect(sectionIndex).toBeGreaterThan(-1);
      const overlayIndex = source.indexOf('absolute inset-0 z-30 flex items-center justify-center', sectionIndex);
      expect(overlayIndex).toBeGreaterThan(sectionIndex);
      // O overlay do selo continua antes do conteúdo real no DOM (mesma
      // ordem de antes) — a correção é de camada (isolate + z-index), não
      // de reordenação estrutural.
      const contentIndex = source.indexOf('className="relative flex items-start justify-between gap-4"', sectionIndex);
      expect(contentIndex).toBeGreaterThan(overlayIndex);
    });

    test(`${label}: overlay continua pointer-events-none (não introduz clique/scroll/teclado estranho)`, () => {
      const source = read(file);
      const overlayIndex = source.indexOf("z-30 flex items-center justify-center");
      const overlayLineStart = source.lastIndexOf("<div", overlayIndex);
      const overlayTag = source.slice(overlayLineStart, overlayIndex + 40);
      expect(overlayTag).toContain("pointer-events-none");
    });

    test(`${label}: nenhum z-index arbitrariamente alto (ex.: 999999) foi usado`, () => {
      const source = read(file);
      expect(source).not.toMatch(/z-\[?9{3,}/);
    });

    test(`${label}: teclado da alternativa continua desabilitado quando anulada (locked inclui isAnnulled)`, () => {
      // Runner e preview têm fórmulas de `locked` distintas (o runner usa
      // answer?.isLocked, o preview usa showFeedback — cada um com seus
      // próprios conceitos de bloqueio) — em ambos os arquivos, porém,
      // isAnnulled é sempre um dos termos que compõem `locked`.
      const source = read(file);
      const lockedLineIndex = source.indexOf("const locked = ");
      expect(lockedLineIndex).toBeGreaterThan(-1);
      const lockedLine = source.slice(lockedLineIndex, source.indexOf(";", lockedLineIndex));
      expect(lockedLine).toContain("isAnnulled");
      expect(source).toContain("tabIndex={!locked ? 0 : undefined}");
    });
  }
});

test.describe("6. Regra documental obrigatória", () => {
  test("Sprint-simulados.md registra a regra correta (respondíveis/não anuladas), não a versão simplificada errada", () => {
    const source = read("docs/Sprint-simulados.md");
    // "questões" em português não compartilha o prefixo "question" do inglês
    // (usa "õ", não "io") — regex anterior nunca casava com o texto real.
    expect(source).toMatch(/quest(ão|ões) respond[íi]ve(l|is)/i);
  });
});

// ─── PDF de resultado do aluno — anulada não pode aparecer como questão
// normal (2026-09-10, continuação da Sprint) ────────────────────────────────
const PDF_RENDERER = "app/lib/pdf/simulado-result-pdf.ts";
const RESULTADO_PAGE = "app/meus-simulados/[id]/resultado/page-client.tsx";

test.describe("7. PDF de resultado do aluno — renderer real identificado por auditoria de import", () => {
  test("app/lib/pdf/simulado-result-pdf.ts é o único importado em produção (lib/pdf/simulado-result-pdf.ts, sem app/, é código morto)", () => {
    const resultado = read(RESULTADO_PAGE);
    expect(resultado).toContain('await import("@/app/lib/pdf/simulado-result-pdf")');
    expect(resultado).not.toContain('await import("@/lib/pdf/simulado-result-pdf")');
  });

  test("PdfQuestion.status é opcional — PDF neutro do Professor/Admin (sem status) preserva comportamento anterior", () => {
    const renderer = read(PDF_RENDERER);
    expect(renderer).toContain("status?: string | null;");
  });

  test("questions.map calcula isAnnulled a partir de question.status === 'annulled' (mesma fonte canônica usada em toda a Sprint)", () => {
    const renderer = read(PDF_RENDERER);
    expect(renderer).toContain('const isAnnulled = question.status === "annulled";');
  });

  test("anulada nunca destaca alternativa correta, mesmo com showAnswerKey=true (gabarito não é apresentado como válido)", () => {
    const renderer = read(PDF_RENDERER);
    expect(renderer).toContain("const highlightCorrect = showAnswerKey && !isAnnulled && Boolean(alternative.is_correct);");
  });

  test("anulada recebe chip 'Questão anulada' no cabeçalho do card", () => {
    const renderer = read(PDF_RENDERER);
    expect(renderer).toContain('React.createElement(Text, { style: s.annulledChip }, "Questão anulada")');
  });

  test("anulada recebe selo/carimbo posicionado por cima do card (position absolute + card vira position relative — stacking correto, sem z-index arbitrário)", () => {
    const renderer = read(PDF_RENDERER);
    const cardStyleIndex = renderer.indexOf("questionCard: {");
    const cardStyleBlock = renderer.slice(cardStyleIndex, renderer.indexOf("},", cardStyleIndex));
    expect(cardStyleBlock).toContain('position: "relative"');

    const stampStyleIndex = renderer.indexOf("annulledStamp: {");
    const stampStyleBlock = renderer.slice(stampStyleIndex, renderer.indexOf("},", stampStyleIndex));
    expect(stampStyleBlock).toContain('position: "absolute"');

    // O selo é o último filho renderizado do card anulado — pintado por cima
    // do conteúdo normal (cabeçalho/enunciado/alternativas/aviso), nunca
    // atrás dele.
    const stampRenderIndex = renderer.indexOf("style: s.annulledStamp");
    const alternativesBlockIndex = renderer.indexOf("style: s.alternatives");
    expect(stampRenderIndex).toBeGreaterThan(alternativesBlockIndex);
    expect(renderer).not.toMatch(/z-\[?9{3,}/);
  });

  test("resposta histórica do aluno nunca é destacada no PDF (nem para anulada, nem para questão normal — comportamento preexistente preservado)", () => {
    const renderer = read(PDF_RENDERER);
    // O parâmetro `answers` é aceito pela assinatura (compatibilidade), mas o
    // corpo de SimuladoQuestionsPdf nunca lê `alternativeId`/`selected` — não
    // existe marcação de resposta do aluno em nenhuma alternativa, anulada ou
    // não. Único destaque possível é `highlightCorrect` (gabarito).
    expect(renderer).not.toContain("answer.alternativeId");
    expect(renderer).not.toContain("answer.selected");
  });

  test("aviso textual de anulação nunca usa a palavra 'branco' (não confundir anulada sem resposta com questão deixada em branco)", () => {
    const renderer = read(PDF_RENDERER);
    const noticeIndex = renderer.indexOf("annulledNotice: {");
    const chipTextIndex = renderer.indexOf('"QUESTÃO ANULADA —');
    expect(noticeIndex).toBeGreaterThan(-1);
    expect(chipTextIndex).toBeGreaterThan(-1);
    const noticeText = renderer.slice(chipTextIndex, chipTextIndex + 200);
    expect(noticeText.toLowerCase()).not.toContain("branco");
  });
});

test.describe("8. PDF — página do resultado propaga status para o exportador (causa raiz do bug corrigida)", () => {
  test("payload.gabarito.map inclui status ao montar as questões enviadas ao PDF (antes: campo omitido, causa raiz do bug)", () => {
    const resultado = read(RESULTADO_PAGE);
    const callIndex = resultado.indexOf("downloadSimuladoResultPdf({");
    const questionsIndex = resultado.indexOf("questions: payload.gabarito.map((question) => ({", callIndex);
    expect(questionsIndex).toBeGreaterThan(callIndex);
    const mapBlock = resultado.slice(questionsIndex, resultado.indexOf("})),", questionsIndex));
    expect(mapBlock).toContain("status: question.status,");
  });

  test("ResultQuestions (tela HTML) já tratava anulada corretamente antes desta correção — não foi tocada", () => {
    const resultado = read(RESULTADO_PAGE);
    expect(resultado).toContain('isAnnulled ? "QUESTÃO ANULADA — todos os alunos recebem a pontuação integral desta questão."');
  });
});

test.describe("9. Scoring canônico (lib/simuladoScoring.ts) — auditado, correto, não alterado", () => {
  test("gradeSimuladoQuestion trata annulled ANTES de checar resposta em branco (nunca cai em blank por acidente)", () => {
    const source = read("lib/simuladoScoring.ts");
    const annulledCheckIndex = source.indexOf('if (question.status === "annulled")');
    const blankCheckIndex = source.indexOf("if (!selectedAlternativeId && !selectedAlternativeLabel)");
    expect(annulledCheckIndex).toBeGreaterThan(-1);
    expect(blankCheckIndex).toBeGreaterThan(annulledCheckIndex);
  });

  test("annulled sempre recebe classification 'annulled' e pontuação integral (scoreDelta = points) — nunca correct/wrong/blank", () => {
    const source = read("lib/simuladoScoring.ts");
    const annulledIndex = source.indexOf('if (question.status === "annulled")');
    const block = source.slice(annulledIndex, source.indexOf('if (!selectedAlternativeId && !selectedAlternativeLabel)', annulledIndex));
    expect(block).toContain('classification: "annulled"');
    expect(block).toContain("scoreDelta: points");
  });

  test("computeSimuladoAttemptResult conta annulledCount separadamente — nunca soma em blankCount/correctCount/wrongCount", () => {
    const source = read("lib/simuladoScoring.ts");
    expect(source).toContain('if (graded.classification === "annulled") annulledCount += 1;');
    expect(source).toContain('else if (graded.classification === "blank") blankCount += 1;');
  });
});

test.describe("10. Insights/Ranking/TopCoins — auditados, não alterados (consomem resultado consolidado)", () => {
  test("lib/eventInsights.ts já exclui annulled dos cálculos pedagógicos de dificuldade", () => {
    const source = read("lib/eventInsights.ts");
    expect(source).toContain("!question.annulled && question.correct + question.wrong > 0");
  });

  test("lib/eventRanking.ts nunca recalcula annulled/blank/correct a partir de respostas — só consome display_score/correct_count já consolidados", () => {
    const source = read("lib/eventRanking.ts");
    expect(source).not.toContain("annulled");
    expect(source).not.toMatch(/selected_alternative_id/);
  });

  test("app/lib/server/topcoinsSync.ts só lê correct_count de simulado_results (já consolidado) — nenhum recálculo próprio de anulação", () => {
    const source = read("app/lib/server/topcoinsSync.ts");
    expect(source).not.toContain("annulled");
    expect(source).not.toMatch(/selected_alternative_id/);
  });

  test("dashboard do Evento (QuestionStats/Modo Aula) já trata annulled corretamente: exclui do denominador de acerto/erro (accuracy/error percent nulos)", () => {
    const source = read("app/api/professor/events/[id]/route.ts");
    expect(source).toContain('const annulled = relation.status === "annulled";');
    expect(source).toContain("accuracy_percent: annulled || answered === 0 ? null :");
  });
});
