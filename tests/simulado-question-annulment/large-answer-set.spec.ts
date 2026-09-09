import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import ts from "typescript";

// Reproduz o incidente real de produção (3º Simulado de Processo Civil,
// anulação da questão ET3582, 2026-09-07 — documentado em
// docs/Sprint-resultados.md): reprocessSimulado() buscava simulado_answers
// de todas as tentativas do Simulado numa única consulta sem paginação. Com
// 135 tentativas × 12 questões (~1620 linhas), o PostgREST/Supabase cortou
// a resposta no limite padrão (max_rows, tipicamente 1000) SEM erro — o
// motor interpretou respostas reais ausentes como questão em branco,
// reduzindo a nota de 113 dos 135 alunos.
//
// Este arquivo prova, por execução real do motor transpilado (mesma
// limitação de "server-only" documentada em concurrency.spec.ts):
//   1. o padrão antigo (uma única página, sem .range()) de fato trunca em
//      1000 linhas quando há mais que isso — reprodução controlada do bug;
//   2. o motor ATUAL (com fetchAllPages()) carrega as ~1620 linhas
//      completas, na mesma escala exata do incidente;
//   3. nenhuma resposta real vira "branco" artificial;
//   4. tentativas específicas que atravessam a fronteira da página (~83/84
//      de 135, onde 1000 linhas de resposta se esgotam) são conferidas
//      individualmente;
//   5. bonificação histórica (ET3582-equivalente) continua protegida.

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
// Fake Supabase com PAGE_CAP fiel ao comportamento real do PostgREST: sem
// `.range()`, a resposta é cortada em PAGE_CAP linhas — SEM erro, SEM
// aviso (exatamente o comportamento que causou o incidente). `count`
// (quando `{count:"exact"}` é pedido) sempre reporta o total real do
// filtro, independente do corte — também fiel ao Postgres real (o
// Content-Range é calculado à parte do LIMIT aplicado à resposta).
// `.range(from,to)` retorna a fatia pedida do conjunto completo, ordenado
// deterministicamente por `.order(col)`.
// ------------------------------------------------------------------
type Row = Record<string, unknown>;
const POSTGREST_DEFAULT_PAGE_CAP = 1000;

function createFakePostgrest(tables: Record<string, Row[]>) {
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
        const existingIndex = conflictCols.length ? rows.findIndex((row) => conflictCols.every((col) => row[col] === payload[col])) : -1;
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
        for (const row of matched) Object.assign(row, updatePayload);
        if (single) return { data: matched[0] || null, error: null };
        return { data: matched, error: null };
      }

      // select — aplica filtro + ordenação determinística, então corta.
      let matched = rows.filter((row) => matches(row, filters));
      if (orderCol) matched = [...matched].sort((a, b) => String(a[orderCol!]).localeCompare(String(b[orderCol!])));
      const total = matched.length;

      let page: Row[];
      if (rangeFrom !== null && rangeTo !== null) {
        page = matched.slice(rangeFrom, rangeTo + 1);
      } else {
        // Sem .range(): comportamento REAL do PostgREST/Supabase — corta no
        // limite padrão do projeto, silenciosamente, sem erro. É este corte
        // que causou o incidente (padrão antigo, reproduzido aqui de propósito).
        page = matched.slice(0, POSTGREST_DEFAULT_PAGE_CAP);
      }

      if (single) return { data: page[0] || null, error: null };
      return wantCount ? { data: page, error: null, count: total } : { data: page, error: null };
    }

    const builder = {
      select(_cols: string, opts?: { count?: "exact" }) {
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

const simuladoScoringModule = loadCjsModule("lib/simuladoScoring.ts", () => {
  throw new Error("import inesperado dentro de lib/simuladoScoring.ts");
});
const supabasePaginationModule = loadCjsModule("lib/server/supabasePagination.ts", (id: string) => {
  if (id === "server-only") return {};
  throw new Error(`import inesperado dentro de lib/server/supabasePagination.ts: ${id}`);
});

type EngineModule = {
  setSimuladoQuestionAnnulment: (
    supabase: unknown,
    params: { simuladoQuestionId: string; targetStatus: "active" | "annulled"; reason: string | null; actorId: string; actorName: string | null; actorType: "admin" | "professor" },
  ) => Promise<{ ok: boolean; pendingReconciliation?: boolean; resultsChanged?: number; simuladoId?: string }>;
};

function buildEngine(resyncCalls: { studentId: string; simuladoId: string }[]): EngineModule {
  return loadCjsModule("lib/server/simuladoQuestionReprocessing.ts", (id: string) => {
    if (id === "server-only") return {};
    if (id === "node:crypto") return crypto;
    if (id === "@/lib/simuladoScoring") return simuladoScoringModule;
    if (id === "@/lib/server/supabasePagination") return supabasePaginationModule;
    if (id === "@/app/lib/server/topcoinsSync") {
      return {
        resyncTopCoinEarnings: async (_s: unknown, studentId: string, simuladoId: string) => {
          resyncCalls.push({ studentId, simuladoId });
        },
      };
    }
    if (id === "@/lib/logging/activity-log") {
      return { logActivity: async () => {} };
    }
    throw new Error(`Unexpected import: ${id}`);
  }) as unknown as EngineModule;
}

// ------------------------------------------------------------------
// Fixture na MESMA escala do incidente real: 135 tentativas × 12 questões
// = 1620 simulado_answers. Uma questão (SQE) será anulada. Um subconjunto
// de alunos tem a mesma "bonificação histórica" real (resposta original D,
// gabarito E, is_correct já true) para provar que a correção de paginação
// não interfere na regra de dupla bonificação.
// ------------------------------------------------------------------
const TOTAL_ATTEMPTS = 135;
const QUESTIONS_PER_ATTEMPT = 12;
const ANNULLED_QUESTION_INDEX = 4; // 5ª questão (order 5), como ET3582 real

function buildLargeFixture() {
  const tables: Record<string, Row[]> = {
    simulado_questions: [],
    simulado_attempts: [],
    simulado_answers: [],
    simulado_results: [],
    simulado_result_change_logs: [],
    student_notifications: [],
  };

  const questionLabels = ["A", "B", "C", "D", "E"];
  for (let q = 0; q < QUESTIONS_PER_ATTEMPT; q++) {
    tables.simulado_questions.push({
      id: `SQ${q}`,
      simulado_id: "SIM_LARGE",
      question_id: `Q${q}`,
      points: 1,
      status: "active",
      status_revision_id: null,
      pending_reconciliation_at: null,
      annulled_at: null,
      annulled_by: null,
      annulment_reason: null,
      questions: {
        id: `Q${q}`,
        correct_alternative_label: "E",
        question_alternatives: questionLabels.map((label, i) => ({ id: `ALT-Q${q}-${label}`, label, is_correct: i === 4 })),
      },
    });
  }

  // Índices de alunos com a bonificação histórica (resposta D, gabarito E,
  // já creditados antes desta rodada) na questão anulada — espalhados,
  // incluindo perto da fronteira de página (1000 respostas ÷ 12 ≈ 83.3).
  const bonifiedAttemptIndexes = new Set([2, 40, 83, 84, 90, 134]);

  for (let i = 0; i < TOTAL_ATTEMPTS; i++) {
    const attemptId = `A${i}`;
    const studentId = `S${i}`;
    tables.simulado_attempts.push({
      id: attemptId,
      student_id: studentId,
      simulado_id: "SIM_LARGE",
      attempt_context: "standalone",
      event_id: null,
      event_participant_id: null,
      student_jornada_simulado_id: null,
      settings_snapshot: { scoring_model: "traditional" },
      status: "completed",
      counts_toward_limit: true,
      is_preview: false,
    });

    let correctCount = 0;
    for (let q = 0; q < QUESTIONS_PER_ATTEMPT; q++) {
      const isAnnulledQuestion = q === ANNULLED_QUESTION_INDEX;
      const isBonified = isAnnulledQuestion && bonifiedAttemptIndexes.has(i);
      // Todo mundo responde tudo (nenhum branco real nesta fixture — a
      // defesa deve provar que 0 respostas reais viram branco artificial).
      const selectedLabel = isBonified ? "D" : "E"; // bonificado erra de propósito; os demais acertam tudo
      const selectedAltId = `ALT-Q${q}-${selectedLabel}`;
      const storedIsCorrect = isBonified ? true : selectedLabel === "E"; // bonificação já creditada antes desta rodada
      tables.simulado_answers.push({
        id: `ans-${attemptId}-Q${q}`,
        attempt_id: attemptId,
        simulado_question_id: `SQ${q}`,
        selected_alternative_id: selectedAltId,
        selected_alternative_label: selectedLabel,
        is_correct: storedIsCorrect,
      });
      if (storedIsCorrect) correctCount += 1;
    }

    tables.simulado_results.push({
      id: `R${i}`,
      attempt_id: attemptId,
      simulado_id: "SIM_LARGE",
      student_id: studentId,
      correct_count: correctCount,
      wrong_count: QUESTIONS_PER_ATTEMPT - correctCount,
      blank_count: 0,
      annulled_count: 0,
      score: correctCount,
      display_score: correctCount,
      max_score: QUESTIONS_PER_ATTEMPT,
      percentage: (correctCount / QUESTIONS_PER_ATTEMPT) * 100,
      display_percentage: (correctCount / QUESTIONS_PER_ATTEMPT) * 100,
      last_reprocessed_at: null,
      reprocess_reason: null,
    });
  }

  return { tables, bonifiedAttemptIndexes };
}

test.describe("reprodução do incidente real — >1000 simulado_answers (135 tentativas × 12 questões = 1620)", () => {
  test("1: o padrão antigo (sem .range()) de fato trunca em 1000 linhas — reprodução controlada do bug real", () => {
    const { tables } = buildLargeFixture();
    const supabase = createFakePostgrest(tables);

    return (async () => {
      const attemptIds = tables.simulado_attempts.map((a) => a.id as string);
      // Exatamente o padrão antigo de reprocessSimulado antes da correção:
      // um único .select().in("attempt_id", attemptIds), sem .range().
      const { data } = (await supabase
        .from("simulado_answers")
        .select("*", { count: "exact" })
        .in("attempt_id", attemptIds)) as { data: Row[] };

      expect(tables.simulado_answers.length).toBe(TOTAL_ATTEMPTS * QUESTIONS_PER_ATTEMPT); // 1620 linhas existem de verdade
      expect((data as Row[]).length).toBe(POSTGREST_DEFAULT_PAGE_CAP); // só 1000 chegaram — o bug, reproduzido
    })();
  });

  test("2/3/4/5: motor atual (fetchAllPages) carrega as 1620 linhas completas — nenhum branco artificial, tentativas na fronteira da página conferidas, bonificação preservada", async () => {
    const { tables, bonifiedAttemptIndexes } = buildLargeFixture();
    const supabase = createFakePostgrest(tables);
    const resyncCalls: { studentId: string; simuladoId: string }[] = [];
    const engine = buildEngine(resyncCalls);

    const outcome = await engine.setSimuladoQuestionAnnulment(supabase, {
      simuladoQuestionId: "SQ4", // questão de order_number 5 — equivalente à ET3582 real
      targetStatus: "annulled",
      reason: "teste de volume — reprodução do incidente",
      actorId: "admin-1",
      actorName: "Admin",
      actorType: "admin",
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.pendingReconciliation).toBe(false);
    expect(outcome.resultsChanged).toBe(TOTAL_ATTEMPTS);

    // 3: nenhuma resposta real virou branco artificial — todo mundo
    // respondeu as 12 questões nesta fixture, então blank_count deve ser
    // 0 para TODOS os 135, não só para quem "coube" nas primeiras 1000 linhas.
    const stillHasArtificialBlank = tables.simulado_results.filter((r) => Number(r.blank_count) > 0);
    expect(stillHasArtificialBlank).toEqual([]);

    // 2: todos os 135 têm annulled_count=1 (a questão anulada) e
    // correct_count+wrong_count+blank_count+annulled_count = 12.
    for (const result of tables.simulado_results) {
      expect(result.annulled_count).toBe(1);
      const total = Number(result.correct_count) + Number(result.wrong_count) + Number(result.blank_count) + Number(result.annulled_count);
      expect(total).toBe(QUESTIONS_PER_ATTEMPT);
    }

    // 4: tentativas específicas atravessando a fronteira de 1000 respostas
    // (~83ª/84ª tentativa: 83×12=996, 84×12=1008) — pedidas explicitamente:
    // posições 1, 50, 84, 85, 100, 135 (índices 0, 49, 83, 84, 99, 134).
    for (const index of [0, 49, 83, 84, 99, 134]) {
      const result = tables.simulado_results.find((r) => r.attempt_id === `A${index}`)!;
      expect(result).toBeTruthy();
      // 16: 12 respostas reais consideradas — nunca 8/7/2 por corte de página.
      const sumCounts = Number(result.correct_count) + Number(result.wrong_count) + Number(result.blank_count) + Number(result.annulled_count);
      expect(sumCounts).toBe(QUESTIONS_PER_ATTEMPT);
      expect(result.blank_count).toBe(0);
    }

    // 5/17: bonificação histórica preservada para os 6 alunos bonificados —
    // sem duplicar (score_delta continua 1, não 2), sem perder o crédito.
    for (const index of bonifiedAttemptIndexes) {
      const result = tables.simulado_results.find((r) => r.attempt_id === `A${index}`)!;
      // Todos os outros 11 questões acertadas (E) + a anulada com crédito
      // integral = 12/12, igual a quem já acertava a questão anulada
      // honestamente — nem mais, nem menos.
      expect(result.correct_count).toBe(11);
      expect(result.annulled_count).toBe(1);
      expect(result.display_score).toBe(12);
    }

    // 19: TopCoins resincronizados 1x por aluno, todos os 135 cobertos.
    expect(new Set(resyncCalls.map((c) => c.studentId)).size).toBe(TOTAL_ATTEMPTS);

    // 20: notificações — 1 por aluno, mesma revisão, sem duplicar.
    expect(tables.student_notifications.length).toBe(TOTAL_ATTEMPTS);
    const revisionIds = new Set(tables.student_notifications.map((n) => n.revision_id));
    expect(revisionIds.size).toBe(1);
  });

  test("retry da mesma revisão (reexecução do reprocessamento) continua idempotente na mesma escala — não duplica nada", async () => {
    const { tables } = buildLargeFixture();
    const supabase = createFakePostgrest(tables);
    const resyncCalls: { studentId: string; simuladoId: string }[] = [];
    const engine = buildEngine(resyncCalls);

    await engine.setSimuladoQuestionAnnulment(supabase, {
      simuladoQuestionId: "SQ4",
      targetStatus: "annulled",
      reason: null,
      actorId: "admin-1",
      actorName: "Admin",
      actorType: "admin",
    });

    const notificationsAfterFirst = tables.student_notifications.length;
    const revisionId = tables.simulado_questions.find((r) => r.id === "SQ4")!.status_revision_id as string;

    // Reprocessa a MESMA revisão de novo diretamente (equivalente ao force
    // reconcile de incidente, ou a um retry de pending) — mesmo volume.
    const { reconcileCurrentRevision } = loadCjsModule("lib/server/simuladoQuestionReprocessing.ts", (id: string) => {
      if (id === "server-only") return {};
      if (id === "node:crypto") return crypto;
      if (id === "@/lib/simuladoScoring") return simuladoScoringModule;
      if (id === "@/lib/server/supabasePagination") return supabasePaginationModule;
      if (id === "@/app/lib/server/topcoinsSync") return { resyncTopCoinEarnings: async (_s: unknown, studentId: string, simuladoId: string) => { resyncCalls.push({ studentId, simuladoId }); } };
      if (id === "@/lib/logging/activity-log") return { logActivity: async () => {} };
      throw new Error(`Unexpected import: ${id}`);
    }) as unknown as { reconcileCurrentRevision: (...args: unknown[]) => Promise<{ ok: boolean; resultsChanged?: number }> };

    const retry = await reconcileCurrentRevision(supabase, {
      simuladoId: "SIM_LARGE",
      simuladoQuestionId: "SQ4",
      expectedRevisionId: revisionId,
      actorId: "admin-1",
      actorName: "Admin",
    });

    expect(retry.ok).toBe(true);
    expect(retry.resultsChanged).toBe(0); // nada mudou de novo — já estava tudo correto

    expect(tables.student_notifications.length).toBe(notificationsAfterFirst); // não dobrou
    expect(tables.simulado_questions.find((r) => r.id === "SQ4")!.status).toBe("annulled"); // status intacto
    expect(tables.simulado_questions.find((r) => r.id === "SQ4")!.status_revision_id).toBe(revisionId); // revisão intacta
  });
});
