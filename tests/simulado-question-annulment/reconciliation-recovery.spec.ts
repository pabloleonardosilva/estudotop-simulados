import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import ts from "typescript";

// Teste de EXECUÇÃO REAL (não simulação, não leitura de código) do motor de
// reconciliação real (lib/server/simuladoQuestionReprocessing.ts),
// transpilado de TypeScript para CommonJS e rodado num contexto vm com um
// Supabase falso em memória — mesmo padrão de precisão já usado por
// notification-revision.spec.ts, elevado aqui para cobrir o mecanismo de
// recuperação de falha parcial pedido nas seções 21/34/35 do pedido:
// injeção determinística de falha no meio de um reprocessamento de 100
// tentativas, detecção de pendência, retomada, e prova de que o estado
// final é idêntico a uma execução sem falhas.
//
// Por que transpilar e rodar em vez de só ler código: lib/server/simuladoQuestionReprocessing.ts
// importa "server-only" (não resolvível fora do bundler do Next — mesma
// limitação documentada em concurrency.spec.ts/notification-revision.spec.ts).
// resyncTopCoinEarnings() e logActivity() são substituídos por stubs que só
// REGISTRAM chamadas (para assertar idempotência de TopCoins) — a lógica
// real deles não é duplicada nem teria como ser exercitada aqui sem um
// banco real, o que esta tarefa proíbe.

const root = process.cwd();

function transpile(relativePath: string): string {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
}

function loadCjsModule(relativePath: string, requireShim: (id: string) => unknown): Record<string, unknown> {
  const compiled = transpile(relativePath);
  const moduleObj: { exports: Record<string, unknown> } = { exports: {} };
  const context = vm.createContext({
    module: moduleObj,
    exports: moduleObj.exports,
    require: requireShim,
    process: { env: {} },
    console,
  });
  new vm.Script(compiled, { filename: relativePath }).runInContext(context);
  return moduleObj.exports;
}

// ------------------------------------------------------------------
// Fake Supabase: mesmo princípio de concurrency.spec.ts (semântica de
// UPDATE ... WHERE do Postgres reproduzida fielmente) generalizado para
// select/update/insert/upsert encadeados com eq/in/not/maybeSingle, com o
// builder sendo "thenable" como o do supabase-js real. select() não
// projeta colunas (retorna a linha inteira) — as fixtures abaixo já são
// montadas com exatamente o formato que cada consulta real espera
// (inclusive o embed aninhado `questions:question_id(...)`).
// ------------------------------------------------------------------
type Row = Record<string, unknown>;

function createFakeSupabase(tables: Record<string, Row[]>, hooks: { onUpdate?: (table: string, payload: Row, matched: Row[]) => void } = {}) {
  let nextId = 1;

  function matches(row: Row, filters: { type: string; col: string; val?: unknown }[]): boolean {
    return filters.every((f) => {
      if (f.type === "eq") return row[f.col] === f.val;
      if (f.type === "in") return Array.isArray(f.val) && (f.val as unknown[]).includes(row[f.col]);
      if (f.type === "not_null") return row[f.col] !== null && row[f.col] !== undefined;
      return true;
    });
  }

  function from(table: string) {
    if (!tables[table]) tables[table] = [];
    const filters: { type: string; col: string; val?: unknown }[] = [];
    let mode: "select" | "update" | "insert" | "upsert" | null = null;
    let updatePayload: Row | null = null;
    let insertPayload: Row | Row[] | null = null;
    let upsertOptions: { onConflict?: string } | null = null;
    let single = false;
    let wantCount = false;
    let orderCol: string | null = null;
    let rangeFrom: number | null = null;
    let rangeTo: number | null = null;

    function execute(): { data: unknown; error: { message: string } | null; count?: number } {
      const rows = tables[table];

      if (mode === "upsert") {
        const conflictCols = (upsertOptions?.onConflict || "").split(",").map((c) => c.trim()).filter(Boolean);
        const payload = insertPayload as Row;
        const existingIndex = conflictCols.length
          ? rows.findIndex((row) => conflictCols.every((col) => row[col] === payload[col]))
          : -1;
        if (existingIndex >= 0) {
          rows[existingIndex] = { ...rows[existingIndex], ...payload };
          return { data: [rows[existingIndex]], error: null };
        }
        const inserted: Row = { id: `row_${nextId++}`, ...payload };
        rows.push(inserted);
        return { data: [inserted], error: null };
      }

      if (mode === "insert") {
        const items = Array.isArray(insertPayload) ? insertPayload : [insertPayload as Row];
        const inserted = items.map((item) => {
          const row: Row = { id: `row_${nextId++}`, ...item };
          rows.push(row);
          return row;
        });
        return { data: inserted, error: null };
      }

      if (mode === "update") {
        const matched = rows.filter((row) => matches(row, filters));
        hooks.onUpdate?.(table, updatePayload as Row, matched);
        for (const row of matched) Object.assign(row, updatePayload);
        if (single) return { data: matched[0] || null, error: null };
        return { data: matched, error: null };
      }

      // select (default) — aplica filtro + ordenação determinística, então
      // pagina: com .range(), retorna a fatia pedida; sem .range(), reproduz
      // o comportamento real do PostgREST/Supabase (corta no limite padrão
      // de 1000 linhas, silenciosamente) — é esse corte, sem o .range() que
      // o motor agora sempre usa, que causou o incidente real (ver
      // large-answer-set.spec.ts para a reprodução dedicada em escala).
      let matched = rows.filter((row) => matches(row, filters));
      if (orderCol) matched = [...matched].sort((a, b) => String(a[orderCol!]).localeCompare(String(b[orderCol!])));
      const total = matched.length;
      const page = rangeFrom !== null && rangeTo !== null ? matched.slice(rangeFrom, rangeTo + 1) : matched.slice(0, 1000);

      if (single) return { data: page[0] || null, error: null };
      return wantCount ? { data: page, error: null, count: total } : { data: page, error: null };
    }

    const builder = {
      select(_cols?: string, opts?: { count?: "exact" }) {
        if (!mode) mode = "select";
        if (opts?.count === "exact") wantCount = true;
        return builder;
      },
      update(payload: Row) {
        mode = "update";
        updatePayload = payload;
        return builder;
      },
      insert(payload: Row | Row[]) {
        mode = "insert";
        insertPayload = payload;
        return builder;
      },
      upsert(payload: Row, options?: { onConflict?: string }) {
        mode = "upsert";
        insertPayload = payload;
        upsertOptions = options || null;
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.push({ type: "eq", col, val });
        return builder;
      },
      in(col: string, val: unknown[]) {
        filters.push({ type: "in", col, val });
        return builder;
      },
      not(col: string) {
        filters.push({ type: "not_null", col });
        return builder;
      },
      order(col: string) {
        orderCol = col;
        return builder;
      },
      range(from: number, to: number) {
        rangeFrom = from;
        rangeTo = to;
        return builder;
      },
      maybeSingle() {
        single = true;
        return builder;
      },
      then(onFulfilled: (v: unknown) => void, onRejected?: (e: unknown) => void) {
        try {
          onFulfilled(execute());
        } catch (err) {
          if (onRejected) onRejected(err);
          else throw err;
        }
      },
    };

    return builder;
  }

  return { from };
}

// ------------------------------------------------------------------
// Módulos carregados uma vez — reais, transpilados, executados.
// ------------------------------------------------------------------
const simuladoScoringModule = loadCjsModule("lib/simuladoScoring.ts", () => {
  throw new Error("import inesperado dentro de lib/simuladoScoring.ts");
});

type EngineModule = {
  setSimuladoQuestionAnnulment: (
    supabase: unknown,
    params: { simuladoQuestionId: string; targetStatus: "active" | "annulled"; reason: string | null; actorId: string; actorName: string | null; actorType: "admin" | "professor" },
  ) => Promise<{ ok: boolean; pendingReconciliation?: boolean; message?: string; simuladoId?: string; resultsChanged?: number }>;
  processPendingReconciliationForSimulado: (supabase: unknown, simuladoId: string) => Promise<{ reconciled: number; stillPending: number }>;
  getPendingReconciliationSummary: (
    supabase: unknown,
    simuladoId?: string,
  ) => Promise<{ pendingCount: number; oldestPendingAt: string | null; relations: { id: string; statusRevisionId: string | null }[] }>;
};

function buildEngine(resyncCalls: { studentId: string; simuladoId: string }[], activityCalls: unknown[]): EngineModule {
  return loadCjsModule("lib/server/simuladoQuestionReprocessing.ts", (id: string) => {
    if (id === "server-only") return {};
    if (id === "node:crypto") return crypto;
    if (id === "@/lib/simuladoScoring") return simuladoScoringModule;
    if (id === "@/app/lib/server/topcoinsSync") {
      return {
        resyncTopCoinEarnings: async (_supabase: unknown, studentId: string, simuladoId: string) => {
          resyncCalls.push({ studentId, simuladoId });
        },
      };
    }
    if (id === "@/lib/logging/activity-log") {
      return { logActivity: async (payload: unknown) => { activityCalls.push(payload); } };
    }
    throw new Error(`Unexpected import: ${id}`);
  }) as unknown as EngineModule;
}

// ------------------------------------------------------------------
// Fixture: 1 Simulado, 2 questões (SQ1 será anulada; SQ2 fica intacta),
// N tentativas concluídas — cada uma respondeu SQ1 errado (garante que
// TODAS as 100 mudam ao anular SQ1: erro vira crédito integral).
// ------------------------------------------------------------------
const TOTAL_ATTEMPTS = 100;

function buildFixture() {
  const tables: Record<string, Row[]> = {
    simulado_questions: [
      {
        id: "SQ1",
        simulado_id: "SIM1",
        question_id: "Q1",
        points: 1,
        status: "active",
        status_revision_id: null,
        pending_reconciliation_at: null,
        annulled_at: null,
        annulled_by: null,
        annulment_reason: null,
        questions: { id: "Q1", correct_alternative_label: "A", question_alternatives: [{ id: "ALT-Q1-A", label: "A", is_correct: true }] },
      },
      {
        id: "SQ2",
        simulado_id: "SIM1",
        question_id: "Q2",
        points: 1,
        status: "active",
        status_revision_id: null,
        pending_reconciliation_at: null,
        questions: { id: "Q2", correct_alternative_label: "A", question_alternatives: [{ id: "ALT-Q2-A", label: "A", is_correct: true }] },
      },
    ],
    simulado_attempts: [],
    simulado_answers: [],
    simulado_results: [],
    simulado_result_change_logs: [],
    student_notifications: [],
  };

  for (let i = 1; i <= TOTAL_ATTEMPTS; i++) {
    const attemptId = `A${i}`;
    const studentId = `S${i}`;
    tables.simulado_attempts.push({
      id: attemptId,
      student_id: studentId,
      simulado_id: "SIM1",
      attempt_context: "standalone",
      event_id: null,
      event_participant_id: null,
      student_jornada_simulado_id: null,
      settings_snapshot: { scoring_model: "traditional" },
      status: "completed",
      counts_toward_limit: true,
      is_preview: false,
    });
    tables.simulado_answers.push(
      { id: `ans-${attemptId}-SQ1`, attempt_id: attemptId, simulado_question_id: "SQ1", selected_alternative_id: "wrong-alt", selected_alternative_label: "B", is_correct: false },
      { id: `ans-${attemptId}-SQ2`, attempt_id: attemptId, simulado_question_id: "SQ2", selected_alternative_id: "ALT-Q2-A", selected_alternative_label: "A", is_correct: true },
    );
    tables.simulado_results.push({
      id: `R${i}`,
      attempt_id: attemptId,
      simulado_id: "SIM1",
      student_id: studentId,
      correct_count: 1,
      wrong_count: 1,
      blank_count: 0,
      annulled_count: 0,
      score: 1,
      display_score: 1,
      max_score: 2,
      percentage: 50,
      display_percentage: 50,
      last_reprocessed_at: null,
      reprocess_reason: null,
    });
  }

  return tables;
}

function snapshotResults(tables: Record<string, Row[]>) {
  return tables.simulado_results
    .map((r) => ({ attempt_id: r.attempt_id, score: r.score, display_score: r.display_score, correct_count: r.correct_count, annulled_count: r.annulled_count }))
    .sort((a, b) => String(a.attempt_id).localeCompare(String(b.attempt_id)));
}

async function runBaselineNoFailure() {
  const resyncCalls: { studentId: string; simuladoId: string }[] = [];
  const activityCalls: unknown[] = [];
  const engine = buildEngine(resyncCalls, activityCalls);
  const tables = buildFixture();
  const supabase = createFakeSupabase(tables);

  const outcome = await engine.setSimuladoQuestionAnnulment(supabase, {
    simuladoQuestionId: "SQ1",
    targetStatus: "annulled",
    reason: "teste baseline",
    actorId: "admin-1",
    actorName: "Admin",
    actorType: "admin",
  });

  return { outcome, tables, resyncCalls };
}

test.describe("recuperação de falha parcial — execução real do motor (lib/server/simuladoQuestionReprocessing.ts)", () => {
  test("A: execução completa sem falha processa os 100, não deixa pendência, TopCoins/notificações 1x por aluno", async () => {
    const { outcome, tables, resyncCalls } = await runBaselineNoFailure();

    expect(outcome.ok).toBe(true);
    expect(outcome.pendingReconciliation).toBe(false);
    expect(outcome.resultsChanged).toBe(TOTAL_ATTEMPTS);

    const sq1 = tables.simulado_questions.find((r) => r.id === "SQ1")!;
    expect(sq1.status).toBe("annulled");
    expect(sq1.pending_reconciliation_at).toBeNull();
    expect(resyncCalls.length).toBe(TOTAL_ATTEMPTS);
    expect(new Set(resyncCalls.map((c) => c.studentId)).size).toBe(TOTAL_ATTEMPTS);
    expect(tables.student_notifications.length).toBe(TOTAL_ATTEMPTS);
    expect(tables.simulado_result_change_logs.length).toBe(TOTAL_ATTEMPTS);
  });

  test("B/C/D/E/F/G/H/I/L/M/N/O/P: 100 resultados, falha determinística após o 37º — pending detectável, retry completa, estado final == baseline, nada duplica", async () => {
    const { tables: baselineTables } = await runBaselineNoFailure();
    const baseline = snapshotResults(baselineTables);

    const resyncCalls: { studentId: string; simuladoId: string }[] = [];
    const activityCalls: unknown[] = [];
    const engine = buildEngine(resyncCalls, activityCalls);
    const tables = buildFixture();

    let resultUpdateCount = 0;
    const FAIL_AFTER = 37;
    const supabase = createFakeSupabase(tables, {
      onUpdate(table, payload) {
        if (table === "simulado_results" && Object.prototype.hasOwnProperty.call(payload, "correct_count")) {
          resultUpdateCount += 1;
          if (resultUpdateCount === FAIL_AFTER + 1) {
            throw new Error("queda de conexão simulada (falha determinística após o 37º resultado)");
          }
        }
      },
    });

    // B: falha após processamento parcial.
    const outcome = await engine.setSimuladoQuestionAnnulment(supabase, {
      simuladoQuestionId: "SQ1",
      targetStatus: "annulled",
      reason: "teste de falha parcial",
      actorId: "admin-1",
      actorName: "Admin",
      actorType: "admin",
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.pendingReconciliation).toBe(true); // status mudou, reconciliação ficou pendente

    const sq1AfterFailure = tables.simulado_questions.find((r) => r.id === "SQ1")!;
    expect(sq1AfterFailure.status).toBe("annulled"); // CAS já comitou antes da falha
    // C: pending detectado.
    expect(sq1AfterFailure.pending_reconciliation_at).not.toBeNull();
    const revisionIdAfterFailure = sq1AfterFailure.status_revision_id;
    expect(typeof revisionIdAfterFailure).toBe("string");

    // M: quantos ficaram pendentes após a falha.
    const processedAfterFailure = tables.simulado_results.filter((r) => r.last_reprocessed_at !== null).length;
    const stillStaleAfterFailure = tables.simulado_results.filter((r) => r.last_reprocessed_at === null).length;
    expect(processedAfterFailure).toBe(FAIL_AFTER);
    expect(stillStaleAfterFailure).toBe(TOTAL_ATTEMPTS - FAIL_AFTER); // = 63

    // getPendingReconciliationSummary: detecção objetiva por SELECT.
    const summaryAfterFailure = await engine.getPendingReconciliationSummary(supabase, "SIM1");
    expect(summaryAfterFailure.pendingCount).toBe(1);
    expect(summaryAfterFailure.relations[0].id).toBe("SQ1");
    expect(summaryAfterFailure.relations[0].statusRevisionId).toBe(revisionIdAfterFailure);

    const notificationsAfterFailure = tables.student_notifications.length;
    const changeLogsAfterFailure = tables.simulado_result_change_logs.length;
    expect(notificationsAfterFailure).toBe(FAIL_AFTER);
    expect(changeLogsAfterFailure).toBe(FAIL_AFTER);
    // resyncTopCoinEarnings roda DENTRO do loop, por tentativa (deduplicado
    // por aluno), ANTES do UPDATE de simulado_results que falha — não num
    // loop separado ao final. Por isso, quando a falha interrompe a
    // tentativa 38, o resync da tentativa 38 (e das 1-37) já aconteceu:
    // nenhum aluno cujo resultado foi corrigido fica com TopCoins
    // desatualizado para sempre (era exatamente esse o gap: antes desta
    // correção, o resync só rodava ao final do loop inteiro, então uma
    // falha no meio deixava os alunos já corrigidos SEM resync, e o retry
    // nunca mais tentava de novo para eles, porque scoreChanged já dava
    // false). A tentativa 38 é resincronizada mesmo tendo falhado depois —
    // resync não depende de a tentativa ter sido processada com sucesso.
    expect(resyncCalls.length).toBe(FAIL_AFTER + 1); // 1..38
    const resyncedStudentIdsAfterFailure = new Set(resyncCalls.map((c) => c.studentId));
    const processedStudentIdsAfterFailure = new Set(
      tables.simulado_results.filter((r) => r.last_reprocessed_at !== null).map((r) => r.student_id as string),
    );
    // Invariante central da correção: todo aluno cujo resultado já foi
    // corrigido nesta passagem também já foi resincronizado nela — nunca o
    // contrário.
    for (const studentId of processedStudentIdsAfterFailure) {
      expect(resyncedStudentIdsAfterFailure.has(studentId)).toBe(true);
    }

    // Remove a falha injetada — simula a conexão/processo voltando ao normal.
    resultUpdateCount = -1_000_000; // nunca mais bate com FAIL_AFTER + 1

    // D: retry (endpoint manual / recovery).
    const retryOutcome = await engine.processPendingReconciliationForSimulado(supabase, "SIM1");
    expect(retryOutcome.reconciled).toBe(1);
    expect(retryOutcome.stillPending).toBe(0);

    // E: pending limpo após sucesso.
    const sq1AfterRetry = tables.simulado_questions.find((r) => r.id === "SQ1")!;
    expect(sq1AfterRetry.pending_reconciliation_at).toBeNull();
    // U: mesma revisão foi reutilizada (retry não gera revisão nova).
    expect(sq1AfterRetry.status_revision_id).toBe(revisionIdAfterFailure);

    // Todos os 100 resultados corretos agora.
    expect(tables.simulado_results.every((r) => r.last_reprocessed_at !== null)).toBe(true);

    // F: estado final == baseline (comparação byte-a-byte dos valores de score/contadores).
    expect(snapshotResults(tables)).toEqual(baseline);

    // G: score não duplicou — cada resultado tem display_score=2 (crédito
    // integral de SQ1 + acerto normal de SQ2), nunca somado duas vezes por
    // ter sido tocado em duas passagens (falha + retry).
    expect(tables.simulado_results.every((r) => r.display_score === 2)).toBe(true);

    // H: TopCoins não duplicaram — resyncTopCoinEarnings() é idempotente
    // (recompõe do zero a cada chamada, nunca soma), então o número exato
    // de chamadas não é o que importa (a correção acima até torna re-chamar
    // mais vezes intencional, para fechar a janela de crash) — o que
    // importa é que TODO aluno acabou coberto pelo menos uma vez ao final
    // (falha + retry), sem exceção.
    expect(new Set(resyncCalls.map((c) => c.studentId)).size).toBe(TOTAL_ATTEMPTS);

    // I: notification não duplicou — 1 por aluno/tentativa no total, mesma revisionId em todas.
    expect(tables.student_notifications.length).toBe(TOTAL_ATTEMPTS);
    expect(new Set(tables.student_notifications.map((n) => n.revision_id)).size).toBe(1);
    expect(tables.student_notifications[0].revision_id).toBe(revisionIdAfterFailure);
    // Nenhum (student_id, reference_id) duplicado.
    const notifKeys = tables.student_notifications.map((n) => `${n.student_id}:${n.reference_id}`);
    expect(new Set(notifKeys).size).toBe(notifKeys.length);

    // change_logs: os 37 da 1ª passagem não são reprocessados de novo no
    // retry (scoreChanged já é false para eles na 2ª passagem) — só os 63
    // restantes geram log novo. 37 + 63 = 100, nunca mais.
    expect(tables.simulado_result_change_logs.length).toBe(TOTAL_ATTEMPTS);
  });

  test("J: nova revisão (desanulação) depois da recuperação ainda gera notificação nova, distinta da primeira", async () => {
    const resyncCalls: { studentId: string; simuladoId: string }[] = [];
    const activityCalls: unknown[] = [];
    const engine = buildEngine(resyncCalls, activityCalls);
    const tables = buildFixture();
    const supabase = createFakeSupabase(tables);

    await engine.setSimuladoQuestionAnnulment(supabase, {
      simuladoQuestionId: "SQ1",
      targetStatus: "annulled",
      reason: null,
      actorId: "admin-1",
      actorName: "Admin",
      actorType: "admin",
    });
    const notificationsAfterAnnul = tables.student_notifications.length;
    const revisionAfterAnnul = tables.simulado_questions.find((r) => r.id === "SQ1")!.status_revision_id;

    const restoreOutcome = await engine.setSimuladoQuestionAnnulment(supabase, {
      simuladoQuestionId: "SQ1",
      targetStatus: "active",
      reason: null,
      actorId: "admin-1",
      actorName: "Admin",
      actorType: "admin",
    });
    expect(restoreOutcome.ok).toBe(true);
    expect(restoreOutcome.pendingReconciliation).toBe(false);

    const revisionAfterRestore = tables.simulado_questions.find((r) => r.id === "SQ1")!.status_revision_id;
    expect(revisionAfterRestore).not.toBe(revisionAfterAnnul);

    // Desanular volta a errar SQ1 (crédito integral vira erro de novo) — novo
    // grupo de notificações, tipo diferente, revisão diferente.
    expect(tables.student_notifications.length).toBeGreaterThan(notificationsAfterAnnul);
    const restoreNotifications = tables.student_notifications.filter((n) => n.revision_id === revisionAfterRestore);
    expect(restoreNotifications.length).toBe(TOTAL_ATTEMPTS);
    expect(restoreNotifications.every((n) => n.type === "question_reactivated_result_changed")).toBe(true);
  });

  test("K: nova alteração contraditória é bloqueada enquanto a reconciliação anterior está pendente; self-heal automático destrava assim que possível", async () => {
    const resyncCalls: { studentId: string; simuladoId: string }[] = [];
    const activityCalls: unknown[] = [];
    const engine = buildEngine(resyncCalls, activityCalls);
    const tables = buildFixture();

    let shouldFail = true;
    const supabase = createFakeSupabase(tables, {
      onUpdate(table, payload) {
        if (shouldFail && table === "simulado_results" && Object.prototype.hasOwnProperty.call(payload, "correct_count")) {
          throw new Error("falha imediata simulada — nenhum resultado processado");
        }
      },
    });

    const annulOutcome = await engine.setSimuladoQuestionAnnulment(supabase, {
      simuladoQuestionId: "SQ1",
      targetStatus: "annulled",
      reason: null,
      actorId: "admin-1",
      actorName: "Admin",
      actorType: "admin",
    });
    expect(annulOutcome.ok).toBe(true);
    expect(annulOutcome.pendingReconciliation).toBe(true);
    expect(tables.simulado_results.filter((r) => r.last_reprocessed_at !== null).length).toBe(0);

    // Tenta desanular (transição contraditória) enquanto ainda está pendente
    // e a falha continua ativa — self-heal tenta e falha de novo, bloqueia.
    const blockedRestore = await engine.setSimuladoQuestionAnnulment(supabase, {
      simuladoQuestionId: "SQ1",
      targetStatus: "active",
      reason: null,
      actorId: "admin-2",
      actorName: "Admin 2",
      actorType: "admin",
    });
    expect(blockedRestore.ok).toBe(false);
    expect(blockedRestore.message).toMatch(/reconciliação pendente/i);
    // Status NÃO mudou para active — a transição contraditória foi rejeitada.
    expect(tables.simulado_questions.find((r) => r.id === "SQ1")!.status).toBe("annulled");

    // Remove a falha — a PRÓXIMA ação relevante deve destravar sozinha (self-heal).
    shouldFail = false;
    const restoreAfterHealing = await engine.setSimuladoQuestionAnnulment(supabase, {
      simuladoQuestionId: "SQ1",
      targetStatus: "active",
      reason: null,
      actorId: "admin-2",
      actorName: "Admin 2",
      actorType: "admin",
    });
    expect(restoreAfterHealing.ok).toBe(true);
    expect(restoreAfterHealing.pendingReconciliation).toBe(false);
    expect(tables.simulado_questions.find((r) => r.id === "SQ1")!.status).toBe("active");
    expect(tables.simulado_questions.find((r) => r.id === "SQ1")!.pending_reconciliation_at).toBeNull();
  });

  test("X: duas chamadas concorrentes de recovery para o mesmo Simulado — só uma reconcilia de fato, nenhuma inconsistência", async () => {
    const resyncCalls: { studentId: string; simuladoId: string }[] = [];
    const activityCalls: unknown[] = [];
    const engine = buildEngine(resyncCalls, activityCalls);
    const tables = buildFixture();

    // Deixa SQ1 pendente sem passar pelo reprocessamento normal, simulando
    // o estado exato de uma falha parcial anterior já resolvida na CAS de
    // status, mas ainda pendente de reconciliação.
    const sq1 = tables.simulado_questions.find((r) => r.id === "SQ1")!;
    sq1.status = "annulled";
    sq1.status_revision_id = "revision-fixture";
    sq1.pending_reconciliation_at = "2026-01-01T00:00:00.000Z";

    const supabase = createFakeSupabase(tables);

    const [first, second] = await Promise.all([
      engine.processPendingReconciliationForSimulado(supabase, "SIM1"),
      engine.processPendingReconciliationForSimulado(supabase, "SIM1"),
    ]);

    const outcomes = [first, second];
    const winners = outcomes.filter((o) => o.reconciled === 1);
    const losers = outcomes.filter((o) => o.reconciled === 0);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0].stillPending).toBe(1);

    // Estado final consistente: pending limpo, resultados corretos, sem duplicação.
    expect(tables.simulado_questions.find((r) => r.id === "SQ1")!.pending_reconciliation_at).toBeNull();
    expect(tables.simulado_results.every((r) => r.last_reprocessed_at !== null)).toBe(true);
    expect(tables.student_notifications.length).toBe(TOTAL_ATTEMPTS); // nunca 200
    expect(resyncCalls.length).toBe(TOTAL_ATTEMPTS); // nunca 200
  });
});
