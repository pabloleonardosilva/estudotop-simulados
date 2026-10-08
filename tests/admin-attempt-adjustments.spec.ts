/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Rotas reais carregadas com Supabase em memória: reset do Evento preserva a
// liberação e ajustes de consumo nunca trocam o resultado oficial.

function load(path: string, modules: Record<string, unknown>) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: (name: string) => modules[name] || {}, Request, Response, URL, console });
  return exports as any;
}

type Row = Record<string, any>;

function createDb(tables: Record<string, Row[]>) {
  let seq = 0;
  const get = (row: Row, key: string) => key.split(".").reduce((value, part) => value?.[part], row);
  const enrich = (row: Row) => ({
    ...row,
    simulado_results: (tables.simulado_results || []).find((result) => result.attempt_id === row.id) || null,
    simulado_event_participants: (tables.simulado_event_participants || []).find((participant) => participant.id === row.event_participant_id) || null,
    student_jornada_simulados: row.student_jornada_simulado_id ? { student_jornadas: { jornada_id: "jornada-1" } } : null,
  });
  function from(table: string) {
    tables[table] ||= [];
    let op = "select";
    let payload: any = null;
    let head = false;
    let returning = false;
    const filters: Array<(row: Row) => boolean> = [];
    const run = () => {
      const match = (row: Row) => filters.every((filter) => filter(row));
      if (op === "insert") {
        const created = payload.map((row: Row) => ({ id: `${table}-new-${++seq}`, created_at: new Date(Date.UTC(2026, 5, 1) + seq).toISOString(), ...row }));
        tables[table].push(...created);
        return { data: created, error: null };
      }
      if (op === "upsert") {
        for (const row of payload) {
          const index = tables[table].findIndex((existing) => existing.attempt_id === row.attempt_id);
          if (index >= 0) tables[table][index] = { ...tables[table][index], ...row };
          else tables[table].push({ ...row });
        }
        return { data: null, error: null };
      }
      if (op === "update") {
        const hit = tables[table].filter(match);
        hit.forEach((row) => Object.assign(row, payload));
        return { data: returning ? hit.map((row) => ({ ...row })) : null, error: null };
      }
      if (op === "delete") {
        tables[table] = tables[table].filter((row) => !match(row));
        if (table === "simulado_attempts") {
          const alive = new Set(tables.simulado_attempts.map((row) => row.id));
          for (const child of ["simulado_answers", "simulado_results", "topcoin_earnings"]) {
            tables[child] = (tables[child] || []).filter((row) => alive.has(row.attempt_id));
          }
          for (const participant of tables.simulado_event_participants || []) {
            if (participant.representative_attempt_id && !alive.has(participant.representative_attempt_id)) participant.representative_attempt_id = null;
          }
        }
        return { data: null, error: null };
      }
      const data = tables[table].filter(match).map((row) => (table === "simulado_attempts" ? enrich(row) : { ...row }));
      return head ? { data: null, count: data.length, error: null } : { data, error: null };
    };
    const q: any = {
      select(_columns?: string, options?: { head?: boolean }) { if (op === "select") head = Boolean(options?.head); else returning = true; return q; },
      eq(key: string, value: unknown) { filters.push((row) => get(row, key) === value); return q; },
      is(key: string, value: unknown) { filters.push((row) => (get(row, key) ?? null) === value); return q; },
      in(key: string, values: unknown[]) { filters.push((row) => values.includes(row[key])); return q; },
      not(key: string, _operator: string, list: string) { const ids = list.slice(1, -1).split(","); filters.push((row) => !ids.includes(row[key])); return q; },
      order() { return q; },
      limit() { return q; },
      insert(rows: Row | Row[]) { op = "insert"; payload = Array.isArray(rows) ? rows : [rows]; return q; },
      upsert(rows: Row[]) { op = "upsert"; payload = rows; return q; },
      update(values: Row) { op = "update"; payload = values; return q; },
      delete() { op = "delete"; return q; },
      maybeSingle: async () => { const result = run(); return { data: Array.isArray(result.data) ? result.data[0] ?? null : result.data, error: null }; },
      single: async () => { const result = run(); return { data: Array.isArray(result.data) ? result.data[0] ?? null : result.data, error: null }; },
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve().then(run).then(resolve, reject),
    };
    return q;
  }
  return { tables, from };
}

const STUDENT = "student-1";
const SIMULADO = "simulado-1";
const jornadaContext = { attempt_context: "jornada", student_jornada_simulado_id: "schedule-1", event_id: null, event_participant_id: null };
const eventContext = { attempt_context: "event", student_jornada_simulado_id: null, event_id: "event-1", event_participant_id: "participant-1" };

function attempt(id: string, attemptNumber: number, status: string, counts: boolean, submittedDay: number | null, context: Row) {
  return {
    id, attempt_number: attemptNumber, status, counts_toward_limit: counts,
    student_id: STUDENT, simulado_id: SIMULADO,
    created_at: `2026-03-0${attemptNumber}T10:00:00.000Z`,
    submitted_at: submittedDay ? `2026-03-${String(submittedDay).padStart(2, "0")}T12:00:00.000Z` : null,
    result_released_at: context.student_jornada_simulado_id && status === "completed" ? "2026-03-20T00:00:00.000Z" : null,
    ...context,
  };
}

function baseTables(attempts: Row[], participant: Partial<Row> = {}) {
  return {
    simulado_attempts: attempts,
    simulado_results: attempts.filter((row) => row.status === "completed").map((row) => ({ attempt_id: row.id, correct_count: 10 })),
    topcoin_earnings: [] as Row[],
    student_notifications: [{ id: "notification-1", student_id: STUDENT, type: "event_result_released", reference_id: "participant-1" }],
    simulado_questions: Array.from({ length: 20 }, (_, index) => ({ id: `question-${index}`, simulado_id: SIMULADO })),
    simulado_events: [{ id: "event-1", name: "Evento", simulado_id: SIMULADO }],
    simulado_event_participants: [
      { id: "participant-1", event_id: "event-1", student_id: STUDENT, representative_attempt_id: null, result_released_at: null, ...participant },
      { id: "participant-2", event_id: "event-1", student_id: "student-2", representative_attempt_id: null, result_released_at: null },
    ],
    student_jornada_simulados: [{
      id: "schedule-1", student_jornada_id: "enrollment-1", simulado_id: SIMULADO, order_number: 1, status: "completed",
      scheduled_release_at: "2026-03-01", released_at: "2026-03-01", completed_at: "2026-03-02", release_email_sent_at: null,
      student_jornadas: { id: "enrollment-1", student_id: STUDENT, jornada_id: "jornada-1", expires_at: "2099-01-01", status: "active" },
    }],
  } as Record<string, Row[]>;
}

function routes(db: ReturnType<typeof createDb>) {
  const errors: unknown[] = [];
  const auditLogger = { logAdminAction: async () => {}, logSystemError: async (entry: unknown) => { errors.push(entry); } };
  const topcoins = load("app/lib/server/topcoinsSync.ts", { "@/app/lib/gamification/topcoins": load("app/lib/gamification/topcoins.ts", {}) });
  const common = {
    "next/server": { NextResponse: Response },
    "@/lib/server/supabaseAdmin": { createSupabaseAdminClient: () => db },
    "@/lib/server/authGuard": { requireAdmin: async () => ({ id: "admin-1", full_name: "Admin" }) },
    "@/app/lib/server/auditLogger": auditLogger,
  };
  const jornada = load("app/api/admin/student-jornadas/[studentJornadaId]/simulados/[studentJornadaSimuladoId]/route.ts", {
    ...common, "@/app/lib/server/topcoinsSync": topcoins, "@/lib/server/publicAppUrl": { getPublicAppUrl: () => "http://localhost" }, resend: { Resend: class {} },
  });
  const event = load("app/api/admin/events/[id]/participants/[studentId]/route.ts", { ...common, "@/lib/logging/activity-log": { logActivity: async () => {} } });
  const events = load("lib/server/simuladoEvents.ts", { ...common, "@/app/lib/server/topcoinsSync": topcoins, resend: { Resend: class {} } });
  const settings = load("lib/server/contextualSimuladoSettings.ts", {});
  return {
    errors,
    topcoins,
    events,
    settings,
    setJornada: (attempts: number) => jornada.PATCH(
      new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify({ action: "set_attempts", attempts }) }),
      { params: Promise.resolve({ studentJornadaId: "enrollment-1", studentJornadaSimuladoId: "schedule-1" }) },
    ),
    setEvent: (attempts: number, studentId = STUDENT) => event.PATCH(
      new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify({ action: "set_attempts", attempts }) }),
      { params: Promise.resolve({ id: "event-1", studentId }) },
    ),
  };
}

// Mesma consulta da rota de resultado sem attemptId: primeira completed +
// counts_toward_limit por submitted_at; no Evento, o representante válido vence.
function officialOf(db: ReturnType<typeof createDb>, context: "jornada" | "event") {
  const valid = db.tables.simulado_attempts
    .filter((row) => (context === "jornada" ? row.student_jornada_simulado_id === "schedule-1" : row.event_participant_id === "participant-1"))
    .filter((row) => row.status === "completed" && row.counts_toward_limit)
    .sort((a, b) => String(a.submitted_at).localeCompare(String(b.submitted_at)));
  if (context === "event") {
    const representative = db.tables.simulado_event_participants.find((row) => row.id === "participant-1")?.representative_attempt_id;
    return valid.find((row) => row.id === representative)?.id ?? valid[0]?.id ?? null;
  }
  return valid[0]?.id ?? null;
}

const counting = (db: ReturnType<typeof createDb>, context: Row) => db.tables.simulado_attempts
  .filter((row) => (context.event_participant_id ? row.event_participant_id === context.event_participant_id : row.student_jornada_simulado_id === context.student_jornada_simulado_id))
  .filter((row) => row.counts_toward_limit)
  .map((row) => row.id);

test.describe("Evento: reset preserva a liberação definitiva de resultados", () => {
  test("liberar e depois resetar preserva result_released_at, apaga tentativas/resultados e limpa a referência oficial", async () => {
    const db = createDb(baseTables([
      attempt("e1", 1, "abandoned", true, 1, eventContext),
      attempt("e2", 2, "completed", true, 2, eventContext),
    ], { representative_attempt_id: "e2", result_released_at: "2026-03-10T00:00:00.000Z" }));
    const route = routes(db);
    const response = await route.setEvent(0);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.event_participation).toMatchObject({ attempts_total: 0, representative_attempt_id: null, result_released_at: "2026-03-10T00:00:00.000Z" });
    const participant = db.tables.simulado_event_participants.find((row) => row.id === "participant-1")!;
    expect(participant).toMatchObject({ representative_attempt_id: null, result_released_at: "2026-03-10T00:00:00.000Z" });
    expect(db.tables.simulado_attempts.filter((row) => row.event_participant_id === "participant-1")).toHaveLength(0);
    expect(db.tables.simulado_results.map((row) => row.attempt_id)).not.toContain("e2");
    expect(db.tables.student_notifications).toHaveLength(0);
    expect(route.errors).toEqual([]);
  });

  test("nova tentativa válida após o reset respeita a autorização já concedida; quem nunca foi liberado continua bloqueado", async () => {
    const db = createDb(baseTables([attempt("e1", 1, "completed", true, 1, eventContext)], { representative_attempt_id: "e1", result_released_at: "2026-03-10T00:00:00.000Z" }));
    const route = routes(db);
    expect((await route.setEvent(0)).status).toBe(200);

    db.tables.simulado_attempts.push(attempt("e9", 1, "completed", true, 15, eventContext));
    await route.events.consolidateEventRepresentativeAttempt(db, { eventParticipantId: "participant-1", attemptId: "e9" });
    expect(db.tables.simulado_event_participants.find((row) => row.id === "participant-1")!.representative_attempt_id).toBe("e9");
    expect(await route.settings.isAttemptResultReleased(db, "e9", STUDENT)).toBe(true);

    db.tables.simulado_attempts.push({ ...attempt("other", 1, "completed", true, 15, eventContext), student_id: "student-2", event_participant_id: "participant-2" });
    expect(await route.settings.isAttemptResultReleased(db, "other", "student-2")).toBe(false);
    expect((await route.setEvent(0, "student-2")).status).toBe(200);
    expect(db.tables.simulado_event_participants.find((row) => row.id === "participant-2")!.result_released_at).toBeNull();
  });
});

test.describe("Ajuste de consumo preserva o resultado oficial", () => {
  for (const context of ["jornada", "event"] as const) {
    const ctx = context === "jornada" ? jornadaContext : eventContext;
    const representative = context === "event" ? { representative_attempt_id: "a2" } : {};
    const set = (route: ReturnType<typeof routes>, value: number) => (context === "jornada" ? route.setJornada(value) : route.setEvent(value));

    test(`${context}: ajuste para baixo mantém a oficial e a contagem exata`, async () => {
      const db = createDb(baseTables([
        attempt("a1", 1, "abandoned", true, 1, ctx),
        attempt("a2", 2, "completed", true, 2, ctx),
        attempt("a3", 3, "completed", true, 3, ctx),
      ], representative));
      expect(officialOf(db, context)).toBe("a2");
      expect((await set(routes(db), 1)).status).toBe(200);
      expect(officialOf(db, context)).toBe("a2");
      expect(counting(db, ctx)).toEqual(["a2"]);
      expect((await set(routes(db), 2)).status).toBe(200);
      expect(officialOf(db, context)).toBe("a2");
      expect(counting(db, ctx)).toEqual(["a1", "a2"]);
    });

    test(`${context}: ajuste para cima mantém a oficial, mesmo com conclusão anterior fora da contagem`, async () => {
      const db = createDb(baseTables([
        attempt("a1", 1, "completed", false, 1, ctx),
        attempt("a2", 2, "abandoned", true, 2, ctx),
        attempt("a3", 3, "completed", true, 3, ctx),
      ], context === "event" ? { representative_attempt_id: "a3" } : {}));
      expect(officialOf(db, context)).toBe("a3");
      const response = await set(routes(db), 3);
      expect(response.status).toBe(200);
      expect(officialOf(db, context)).toBe("a3");
      const counted = counting(db, ctx);
      expect(counted).toHaveLength(3);
      expect(counted).not.toContain("a1");
      expect(counted).toEqual(expect.arrayContaining(["a2", "a3"]));
      const placeholders = db.tables.simulado_attempts.filter((row) => row.id.startsWith("simulado_attempts-new-"));
      expect(placeholders).toHaveLength(1);
      expect(placeholders[0]).toMatchObject({ status: "abandoned", counts_toward_limit: true });
      if (context === "event") expect((await response.json()).event_participation).toMatchObject({ attempts_total: 4, attempts_counting: 3 });
    });

    test(`${context}: tentativas incompletas nunca assumem o resultado oficial`, async () => {
      const db = createDb(baseTables([
        attempt("a1", 1, "abandoned", true, 1, ctx),
        attempt("a2", 2, "disqualified", true, 2, ctx),
        attempt("a3", 3, "expired", false, 3, ctx),
      ]));
      expect((await set(routes(db), 2)).status).toBe(200);
      expect(counting(db, ctx)).toEqual(["a1", "a2"]);
      expect((await set(routes(db), 5)).status).toBe(200);
      expect(counting(db, ctx)).toHaveLength(5);
      expect(officialOf(db, context)).toBeNull();
    });
  }

  test("Jornada e Evento permanecem isolados", async () => {
    const db = createDb(baseTables([
      attempt("j1", 1, "completed", true, 1, jornadaContext),
      attempt("j2", 2, "completed", true, 2, jornadaContext),
      attempt("e1", 1, "abandoned", true, 3, eventContext),
      attempt("e2", 2, "completed", true, 4, eventContext),
    ], { representative_attempt_id: "e2" }));
    const route = routes(db);
    expect((await route.setJornada(1)).status).toBe(200);
    expect(counting(db, jornadaContext)).toEqual(["j1"]);
    expect(counting(db, eventContext)).toEqual(["e1", "e2"]);
    expect((await route.setEvent(1)).status).toBe(200);
    expect(counting(db, eventContext)).toEqual(["e2"]);
    expect(counting(db, jornadaContext)).toEqual(["j1"]);
    expect(officialOf(db, "jornada")).toBe("j1");
    expect(officialOf(db, "event")).toBe("e2");
  });

  test("reset explícito para zero continua excluindo o histórico da Jornada sem tocar o Evento", async () => {
    const db = createDb(baseTables([
      attempt("j1", 1, "completed", true, 1, jornadaContext),
      attempt("e1", 1, "completed", true, 2, eventContext),
    ], { representative_attempt_id: "e1" }));
    const response = await routes(db).setJornada(0);
    expect(response.status).toBe(200);
    expect((await response.json()).schedule_item).toMatchObject({ status: "available", attempts_total: 0, attempts_counting: 0 });
    expect(db.tables.simulado_attempts.map((row) => row.id)).toEqual(["e1"]);
    expect(db.tables.simulado_results.map((row) => row.attempt_id)).toEqual(["e1"]);
  });

  test("TopCoins da oficial são preservados após ajuste para baixo na Jornada", async () => {
    const db = createDb(baseTables([
      attempt("a1", 1, "abandoned", true, 1, jornadaContext),
      attempt("a2", 2, "completed", true, 2, jornadaContext),
      attempt("a3", 3, "completed", true, 3, jornadaContext),
    ]));
    const route = routes(db);
    await route.topcoins.resyncTopCoinEarnings(db, STUDENT, SIMULADO);
    const before = db.tables.topcoin_earnings.find((row) => row.attempt_id === "a2");
    expect(before).toMatchObject({ attempt_number: 1 });
    expect((await route.setJornada(1)).status).toBe(200);
    expect(db.tables.topcoin_earnings.map((row) => row.attempt_id)).toEqual(["a2"]);
    expect(db.tables.topcoin_earnings[0]).toMatchObject({ attempt_number: 1, amount: before!.amount });
  });
});
