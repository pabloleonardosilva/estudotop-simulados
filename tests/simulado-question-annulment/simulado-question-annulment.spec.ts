import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Padrão já usado por tests/event-representative-attempt: leitura de
// código-fonte real com asserções sobre a estrutura exata, porque
// lib/server/simuladoQuestionReprocessing.ts (como lib/server/simuladoEvents.ts)
// importa "server-only", não resolvível fora do bundler do Next em teste
// standalone. O comportamento numérico do motor de correção em si já é
// coberto por execução real em tests/simulado-scoring/simulado-scoring.spec.ts
// (esse SIM importa e executa lib/simuladoScoring.ts diretamente, sem
// "server-only").

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const ENGINE = "lib/server/simuladoQuestionReprocessing.ts";
const ADMIN_ANNUL_ROUTE = "app/api/admin/simulados/[id]/questions/[relationId]/annul/route.ts";
const PROFESSOR_ANNUL_ROUTE = "app/api/professor/events/[id]/questions/[relationId]/annul/route.ts";
const ANSWER_KEY_QUICK_ROUTE = "app/api/admin/questions/[id]/answer/route.ts";
const QUESTION_EDIT_ROUTE = "app/api/admin/questions/[id]/route.ts";
const ANSWERS_ROUTE = "app/api/student/simulados/[id]/attempts/[attemptId]/answers/route.ts";
const SUBMIT_ROUTE = "app/api/student/simulados/[id]/attempts/[attemptId]/submit/route.ts";
const SIMULADO_QUESTIONS_ROUTE = "app/api/admin/simulados/[id]/questions/route.ts";
const QUESTION_BANK_LOADER = "app/questoes/page.tsx";
const QUESTION_BANK_LIST = "app/questoes/page-client.tsx";

test.describe("anulação/desanulação de questão — Banco ≠ Simulado, propagação de gabarito, sem dupla bonificação", () => {
  test("D/E: anular no Banco não propaga para o Simulado, e vice-versa — nenhum código escreve simulado_questions.status a partir de questions.status ou o inverso", () => {
    const bankRoute = read(SIMULADO_QUESTIONS_ROUTE);
    // O único efeito de questions.status = annulled sobre simulado_questions
    // é BLOQUEAR a adição de uma questão anulada a um novo simulado — nunca
    // alterar o status de vínculos já existentes.
    expect(bankRoute).toContain('.filter((q) => q.status === "annulled")');
    expect(bankRoute).not.toMatch(/simulado_questions[\s\S]{0,200}\.update\(\s*\{\s*status:/);

    const engine = read(ENGINE);
    // O motor de anulação por Simulado nunca escreve em "questions" (Banco).
    expect(engine).not.toMatch(/\.from\("questions"\)\s*\n?\s*\.update/);
  });

  test("único ponto de escrita de simulado_questions.status/annulled_at/annulled_by/annulment_reason é setSimuladoQuestionAnnulment", () => {
    const engine = read(ENGINE);
    expect(engine).toContain("export async function setSimuladoQuestionAnnulment(");
    expect(engine).toContain('annulled_at: nowIso, annulled_by: params.actorId, annulment_reason: params.reason || null');
    // Compare-and-swap: o UPDATE é condicionado ao status antigo lido — evita
    // corrida entre dois cliques/dois atores simultâneos.
    expect(engine).toContain('.eq("status", relation.status)');
  });

  test("F/G: alteração de gabarito propaga e recalcula em TODOS os Simulados que usam a questão (não só um)", () => {
    const engine = read(ENGINE);
    expect(engine).toContain("export async function reprocessAfterAnswerKeyChange(");
    expect(engine).toContain('.eq("question_id", params.questionId)');
    expect(engine).toContain("const simuladoIds = Array.from(new Set(");
    expect(engine).toContain("for (const simuladoId of simuladoIds)");
  });

  test("o endpoint rápido de gabarito (.../answer) e o editor completo de questão (.../route.ts) chamam o reprocessamento — nenhuma rota altera gabarito sem recalcular", () => {
    const quick = read(ANSWER_KEY_QUICK_ROUTE);
    expect(quick).toContain('import { reprocessAfterAnswerKeyChange } from "@/lib/server/simuladoQuestionReprocessing";');
    expect(quick).toContain("await reprocessAfterAnswerKeyChange(supabase,");
    // Só reprocessa quando o gabarito de fato mudou (idempotência: reenviar
    // o mesmo gabarito não deve gerar reprocessamento nem notificação).
    expect(quick).toContain("const labelChanged = previousCorrectLabel !== (alternative.label || null);");
    expect(quick).toContain("if (labelChanged) {");
    // Identidade de revisão gerada só quando o gabarito de fato muda, e
    // persistida na mesma linha/UPDATE do gabarito — nunca a cada tentativa
    // de reprocessamento.
    expect(quick).toContain("const answerKeyRevisionId = labelChanged ? randomUUID() : null;");
    expect(quick).toContain("revisionId: answerKeyRevisionId!");

    const fullEdit = read(QUESTION_EDIT_ROUTE);
    expect(fullEdit).toContain('import { reprocessAfterAnswerKeyChange } from "@/lib/server/simuladoQuestionReprocessing";');
    expect(fullEdit).toContain("await reprocessAfterAnswerKeyChange(supabase,");
    expect(fullEdit).toContain("const labelChanged = previousCorrectLabel !== (finalCorrect?.label || null);");
    expect(fullEdit).toContain("const answerKeyRevisionId = labelChanged ? randomUUID() : null;");
    expect(fullEdit).toContain("revisionId: answerKeyRevisionId!");
    // A função antiga e falha (não recalculava simulado_answers.is_correct,
    // usava snapshot cacheado como fonte) foi removida, não apenas deixada
    // sem uso.
    expect(fullEdit).not.toContain("recalculateResultsForQuestionGabaritoChange");
  });

  test("H/I: setSimuladoQuestionAnnulment sempre chama reprocessSimulado (anular e desanular recalculam igualmente)", () => {
    const engine = read(ENGINE);
    const setterIndex = engine.indexOf("export async function setSimuladoQuestionAnnulment(");
    const setterBody = engine.slice(setterIndex);
    expect(setterBody).toContain("await reprocessSimulado(supabase, relation.simulado_id,");
    expect(setterBody).toContain('params.targetStatus === "annulled" ? "question_annulled" : "question_reactivated"');
  });

  test("regra absoluta: o motor nunca lê nem soma em cima de score/correct_count antigos — só usa lib/simuladoScoring (fonte determinística) e compara para decidir se algo mudou", () => {
    const engine = read(ENGINE);
    // Nunca existe "oldResult.score +" nem "correct_count +" no motor —
    // toda vez que um valor é escrito, é o valor FRESCO vindo do motor puro.
    expect(engine).not.toMatch(/oldResult\.\w+\s*\+/);
    expect(engine).not.toMatch(/old_score\s*\+/);
    expect(engine).toContain("const fresh = computeSimuladoAttemptResult(questions, answersMap, scoringModel);");
    expect(engine).toContain("correct_count: fresh.correctCount,");
    // A comparação com o resultado antigo serve só para decidir se algo
    // mudou (para notificar/auditar) — nunca para calcular o novo valor.
    expect(engine).toContain("const scoreChanged =");
  });

  test("J/K/L: is_correct nunca é lido do banco para decidir a nova classificação — só selected_alternative_id/label", () => {
    const engine = read(ENGINE);
    // O motor lê simulado_answers, mas monta o AnswerForScoring só com os
    // dois campos de resposta original — nunca inclui is_correct no objeto
    // passado ao motor puro.
    const answersMapBuild = engine.slice(engine.indexOf("answersMap.set(ans.simulado_question_id"), engine.indexOf("answersMap.set(ans.simulado_question_id") + 200);
    expect(answersMapBuild).toContain("selectedAlternativeId: ans.selected_alternative_id");
    expect(answersMapBuild).toContain("selectedAlternativeLabel: ans.selected_alternative_label");
    expect(answersMapBuild).not.toContain("is_correct");
  });

  test("submit usa a mesma fonte única de verdade do reprocessamento (lib/simuladoScoring) — não existe mais loop de correção duplicado no submit", () => {
    const submit = read(SUBMIT_ROUTE);
    expect(submit).toContain('import { computeSimuladoAttemptResult, type AnswerForScoring, type SimuladoQuestionForScoring } from "@/lib/simuladoScoring";');
    expect(submit).toContain("computeSimuladoAttemptResult(scoringQuestions, scoringAnswers, scoringModel)");
    // O atalho antigo que confiava em answer.is_correct armazenado (risco:
    // gabarito podia mudar entre a resposta e o submit) foi removido.
    expect(submit).not.toContain("let correct = answer.is_correct;");
  });

  test("38: backend é autoritativo — resposta a questão anulada é rejeitada no servidor, não só escondida no client", () => {
    const answersRoute = read(ANSWERS_ROUTE);
    expect(answersRoute).toContain('.select("id, question_id, status")');
    expect(answersRoute).toContain('if (sqValidation.status === "annulled")');
    expect(answersRoute).toMatch(/status:\s*409/);
  });

  test("33/AL: Admin pode anular/desanular em qualquer Simulado (guard requireAdmin); professor só no Simulado do seu Evento (requireEventManager)", () => {
    const adminRoute = read(ADMIN_ANNUL_ROUTE);
    expect(adminRoute).toContain('import { requireAdmin } from "@/lib/server/authGuard";');
    expect(adminRoute).toContain("const admin = await requireAdmin(request);");

    const professorRoute = read(PROFESSOR_ANNUL_ROUTE);
    expect(professorRoute).toContain('import { requireEventManager } from "@/lib/server/authGuard";');
    expect(professorRoute).toContain("const manager = await requireEventManager(request, eventId);");
    // Professor nunca altera o gabarito global nem a questão do Banco — só
    // chama o mesmo setSimuladoQuestionAnnulment do Admin, escopado ao
    // simulado_id do Evento que ele gerencia.
    expect(professorRoute).not.toContain('.from("questions")');
    expect(professorRoute).not.toContain('.from("question_alternatives")');
    expect(professorRoute).toContain('.eq("simulado_id", event.simulado_id)');
  });

  test("55/56: isolamento por Simulado é intencional — o mesmo Simulado usado por dois Eventos é afetado nos dois; anulação nunca é escopada por event_id", () => {
    const engine = read(ENGINE);
    // reprocessSimulado busca tentativas por simulado_id (todos os
    // contextos: Evento, Jornada, avulso), nunca filtra por event_id.
    const reprocessFn = engine.slice(engine.indexOf("export async function reprocessSimulado("), engine.indexOf("export async function setSimuladoQuestionAnnulment("));
    expect(reprocessFn).toContain('.eq("simulado_id", simuladoId)');
    expect(reprocessFn).not.toContain(".eq(\"event_id\"");
  });

  test("59: representative_attempt_id nunca é tocado pelo reprocessamento", () => {
    const engine = read(ENGINE);
    // A string só pode aparecer no comentário que documenta essa garantia —
    // nunca numa chamada real a .from("simulado_event_participants") ou
    // numa escrita do campo.
    expect(engine).not.toContain('.from("simulado_event_participants")');
    expect(engine).not.toMatch(/representative_attempt_id\s*[:=]/);
  });

  test("TopCoins: reconciliação reaproveita resyncTopCoinEarnings existente (idempotente, delete+insert do zero) — nenhuma lógica de soma de moedas foi criada", () => {
    const engine = read(ENGINE);
    expect(engine).toContain('import { resyncTopCoinEarnings } from "@/app/lib/server/topcoinsSync";');
    expect(engine).toContain("await resyncTopCoinEarnings(supabase, attempt.student_id, simuladoId);");
    expect(engine).not.toMatch(/topcoin_earnings["']\)\s*\n?\s*\.(insert|update)/);
    // Chamado DENTRO do loop por tentativa (deduplicado por resyncedStudentIds),
    // nunca só num loop separado ao final — fecha a janela entre "resultado
    // corrigido" e "TopCoins resincronizados" numa falha parcial no meio do
    // reprocessamento (ver tests/simulado-question-annulment/reconciliation-recovery.spec.ts).
    const reprocessBody = engine.slice(engine.indexOf("export async function reprocessSimulado("), engine.indexOf("export async function processPendingReconciliationForSimulado("));
    const loopStart = reprocessBody.indexOf("for (const attempt of attempts)");
    const resyncCallIndex = reprocessBody.indexOf("await resyncTopCoinEarnings(");
    const logActivityIndex = reprocessBody.indexOf("await logActivity(");
    expect(loopStart).toBeGreaterThan(-1);
    expect(resyncCallIndex).toBeGreaterThan(loopStart);
    expect(resyncCallIndex).toBeLessThan(logActivityIndex);
    // Só uma chamada de resync por aluno por passagem (deduplicada), não uma
    // por tentativa mudada — evita recomputar o extrato inteiro do aluno
    // repetidamente quando ele tem mais de uma tentativa afetada.
    expect(reprocessBody).toContain("resyncedStudentIds.has(attempt.student_id)");
    expect(reprocessBody).toContain("resyncedStudentIds.add(attempt.student_id)");
  });

  test("notificação reaproveita a tabela/mecanismo já existente (student_notifications) — nenhuma tabela paralela foi criada", () => {
    const engine = read(ENGINE);
    expect(engine).toContain('.from("student_notifications").upsert(');
    // A chave de idempotência inclui revision_id (não só reference_id): um
    // retry da MESMA revisão colide (1 notificação), mas uma revisão futura
    // distinta sobre a mesma tentativa (mesmo type) gera uma linha nova.
    expect(engine).toContain('onConflict: "student_id,type,reference_id,revision_id"');
    expect(engine).toContain("revision_id: context.revisionId,");
    // Reabre o aviso (read_at/dismissed_at voltam a null) mesmo se o
    // participante já tinha descartado um aviso anterior da mesma tentativa
    // — instrução: "nova alteração posterior gera novo aviso".
    expect(engine).toContain("read_at: null,");
    expect(engine).toContain("dismissed_at: null,");
  });

  test("identidade de revisão é persistida no momento exato da transição/mudança real, não gerada a cada tentativa de reprocessamento", () => {
    const engine = read(ENGINE);
    // Anular/desanular: revisionId gerado uma vez, no mesmo UPDATE condicional
    // (compare-and-swap) que muda o status — nunca dentro do loop de
    // reprocessSimulado, que só CONSOME context.revisionId.
    const setterIndex = engine.indexOf("export async function setSimuladoQuestionAnnulment(");
    const setterBody = engine.slice(setterIndex, engine.indexOf("export async function reprocessAfterAnswerKeyChange("));
    expect(setterBody).toContain("const revisionId = randomUUID();");
    expect(setterBody).toContain("status_revision_id: revisionId");
    expect(setterBody).toContain("revisionId,");
    // randomUUID() só é chamado UMA vez por transição (não uma vez por
    // branch active/annulled) — a mesma constante `revisionId` é reaproveitada
    // nos dois ramos do ternário do updatePayload.
    expect((setterBody.match(/randomUUID\(\)/g) || []).length).toBe(1);

    const reprocessFn = engine.slice(engine.indexOf("export async function reprocessSimulado("), engine.indexOf("export async function processPendingReconciliationForSimulado("));
    // reprocessSimulado nunca gera um revisionId novo — só usa o que veio no context.
    expect(reprocessFn).not.toContain("randomUUID()");

    // Gabarito: reprocessAfterAnswerKeyChange também nunca gera — recebe
    // pronto (o chamador gera no mesmo UPDATE que grava o gabarito).
    const answerKeyFnIndex = engine.indexOf("export async function reprocessAfterAnswerKeyChange(");
    const answerKeyFn = engine.slice(answerKeyFnIndex);
    expect(answerKeyFn).not.toContain("randomUUID()");
    expect(answerKeyFn).toContain("revisionId: params.revisionId,");

    const quick = read(ANSWER_KEY_QUICK_ROUTE);
    expect(quick).toContain("import { randomUUID } from \"node:crypto\";");
    const fullEdit = read(QUESTION_EDIT_ROUTE);
    expect(fullEdit).toContain("import { randomUUID } from \"node:crypto\";");
  });

  test("resultado liberado nunca é alterado pelo reprocessamento (result_released_at nunca é escrito pelo motor)", () => {
    const engine = read(ENGINE);
    expect(engine).not.toContain("result_released_at");
  });

  test("auditoria: toda anulação/desanulação/mudança de gabarito é registrada via logActivity (actor, ação, entidade, metadata)", () => {
    const engine = read(ENGINE);
    expect(engine).toContain('import { logActivity } from "@/lib/logging/activity-log";');
    expect(engine).toContain("await logActivity({");
    expect(engine).toContain("attempts_reprocessed: attempts.length,");
    expect(engine).toContain("results_changed: resultsChanged,");
  });

  test("AppShell reconhece os 3 novos tipos de notificação, além do já existente, sem criar um segundo sistema de notificação", () => {
    const shell = read("app/components/AppShell.tsx");
    expect(shell).toContain('"question_annulled_result_changed"');
    expect(shell).toContain('"question_reactivated_result_changed"');
    expect(shell).toContain('"answer_key_changed_result_changed"');
    expect(shell).toContain("RESULT_NOTIFICATION_TYPES.includes(");
  });

  test("resultado do aluno: questão anulada não é exibida como certa/errada, mas mantém a resposta originalmente marcada visível", () => {
    const resultado = read("app/meus-simulados/[id]/resultado/page-client.tsx");
    expect(resultado).toContain('const isAnnulled = question.status === "annulled";');
    expect(resultado).toContain("QUESTÃO ANULADA");
    expect(resultado).toContain('value={isAnnulled ? "Anulada" :');
  });

  test("Ponto 3 — alerta no Banco de Questões: contagem real de vínculos anulados, sem N+1, sem alterar/misturar com o status editorial global", () => {
    // A listagem principal (Server Component) já traz simulado_questions.status
    // no mesmo select que carrega as questões — nenhuma query extra por
    // questão é necessária para o alerta.
    const loader = read(QUESTION_BANK_LOADER);
    expect(loader).toContain("simulado_questions (");
    expect(loader).toContain("status,");

    const list = read(QUESTION_BANK_LIST);
    // O alerta é derivado do array já carregado (simuladoLinks), nunca de
    // uma nova consulta.
    expect(list).toContain('const annulledLinksCount = simuladoLinks.filter((simulado) => simulado.relationStatus === "annulled").length;');
    expect(list).toContain("Anulada em {annulledLinksCount} simulado");
    // O selo de status editorial global (questions.status === "annulled",
    // já existente antes desta Sprint) permanece um elemento visual
    // totalmente separado — a mesma renderização não confunde os dois
    // conceitos (Banco × Simulado).
    expect(list).toContain('question.status === "annulled"');
    expect(list).toContain(">ANULADA<");
  });
});
