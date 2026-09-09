/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(path: string, modules: Record<string, unknown>) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: (name: string) => modules[name] || {}, Request, Response, URL, console });
  return exports as any;
}
function database(rows: Record<string, any[]>) {
  const writes: string[] = [];
  const db = { writes, from(table: string) {
    let values = rows[table] || [];
    const q: any = {
      select() { return q; }, order() { return q; },
      eq(key: string, value: unknown) { values = values.filter(row => key.split(".").reduce((o, k) => o?.[k], row) === value); return q; },
      is(key: string, value: unknown) { return q.eq(key, value); },
      in(key: string, allowed: unknown[]) { values = values.filter(row => allowed.includes(row[key])); return q; },
      limit(n: number) { values = values.slice(0, n); return q; },
      insert(row: any) { writes.push(table); values = [{ id: "new-attempt", ...row }]; return q; },
      single: async () => ({ data: values[0] || null, error: null }),
      maybeSingle: async () => ({ data: values[0] || null, error: null }),
      then: (resolve: (value: unknown) => void) => Promise.resolve({ data: values, error: null }).then(resolve),
    };
    return q;
  }};
  return db;
}
const resolver = load("lib/server/attemptLimit.ts", {});
const assertions = load("lib/server/studentAssertions.ts", { "next/server": { NextResponse: Response } });
const contextA = { type: "jornada", studentJornadaSimuladoId: "ja" };
const contextB = { type: "jornada", studentJornadaSimuladoId: "jb" };
const eventContext = { type: "event", eventId: "e", eventParticipantId: "ep" };
function rows() {
  return {
    simulados: [{ id: "sim", status: "published", title: "Example", question_count: 1 }],
    student_jornadas: [{ id: "enrollment", student_id: "student", status: "active", expires_at: "2099-01-01" }],
    student_jornada_simulados: [
      { id: "ja", student_jornada_id: "enrollment", simulado_id: "sim", status: "available", released_at: "2026-01-01", student_jornadas: { student_id: "student", jornadas: { max_attempts: 3 } } },
      { id: "jb", simulado_id: "sim", student_jornadas: { student_id: "student", jornadas: { max_attempts: 4 } } },
      { id: "ja-other", simulado_id: "other", student_jornadas: { student_id: "student", jornadas: { max_attempts: 3 } } },
    ],
    simulado_event_participants: [{ id: "ep", student_id: "student", event_id: "e", simulado_events: { id: "e", simulado_id: "sim", status: "active", result_policy: "released", max_attempts: 1 } }],
    simulado_attempts: [
      { id: "a1", student_id: "student", simulado_id: "sim", attempt_context: "jornada", student_jornada_simulado_id: "ja", status: "completed", counts_toward_limit: true },
      { id: "a2", student_id: "student", simulado_id: "sim", attempt_context: "jornada", student_jornada_simulado_id: "ja", status: "expired", counts_toward_limit: true },
      { id: "a3", student_id: "student", simulado_id: "sim", attempt_context: "jornada", student_jornada_simulado_id: "ja", status: "abandoned", counts_toward_limit: false },
    ],
  };
}
test("limits belong to each context, including two journeys and a second simulado", async () => {
  const db = database(rows());
  expect(await resolver.resolveAttemptLimit(db, "student", "sim", contextA)).toBe(3);
  expect(await resolver.resolveAttemptLimit(db, "student", "sim", contextB)).toBe(4);
  expect(await resolver.resolveAttemptLimit(db, "student", "sim", eventContext)).toBe(1);
  expect(await resolver.resolveAttemptLimit(db, "student", "other", { ...contextA, studentJornadaSimuladoId: "ja-other" })).toBe(3);
  for (const context of [contextA, contextB, eventContext]) {
    const { attempts } = await assertions.getContextualSimuladoAttempts(db, "student", "sim", context);
    expect(attempts.filter((a: any) => a.counts_toward_limit).length).toBe(context === contextA ? 2 : 0);
  }
  expect(db.writes).toEqual([]);
});
for (const context of [contextA, eventContext]) test("resolver refuses another owner or simulado: " + context.type, async () => {
  const db = database(rows());
  expect(await resolver.resolveAttemptLimit(db, "another-student", "sim", context)).toBeNull();
  expect(await resolver.resolveAttemptLimit(db, "student", "wrong-simulado", context)).toBeNull();
});
function post(db: any, authenticated = true) {
  return load("app/api/student/simulados/[id]/attempts/route.ts", {
    "next/server": { NextResponse: Response },
    "@/lib/server/supabaseAdmin": { createSupabaseAdminClient: () => db },
    "@/lib/server/supabaseStudentAuth": { getStudentFromRequest: async () => authenticated ? { id: "student" } : null },
    "@/lib/server/studentAssertions": { ...assertions, assertStudentCanStartSimulado: async () => null },
    "@/lib/server/attemptLimit": resolver,
    "@/lib/server/simuladoEvents": { effectiveEventStatus: () => "active" },
    "@/lib/logging/activity-log": { logActivity: async () => {} },
  }).POST;
}
for (const max of [1, 2, 4]) test("current journey limit " + max + " applies without changing historical attempts", async () => {
  const data = rows(); data.student_jornada_simulados[0].student_jornadas.jornadas.max_attempts = max;
  const db = database(data);
  const response = await post(db)(new Request("http://localhost/api?jornada=enrollment", { method: "POST" }), { params: Promise.resolve({ id: "sim" }) });
  const body = await response.json();
  if (max <= 2) { expect(response.status).toBe(403); expect(body.message).toContain("limite"); }
  else { expect(body.message).not.toContain("atingiu o limite"); }
  expect(data.simulado_attempts).toHaveLength(3);
  expect(db.writes).toEqual([]);
});
test("standalone creation is rejected without writes", async () => {
  const db = database(rows());
  const response = await post(db)(new Request("http://localhost/api", { method: "POST" }), { params: Promise.resolve({ id: "sim" }) });
  expect(response.status).toBe(400);
  expect((await response.json()).message).toContain("Jornada ou Evento");
  expect(db.writes).toEqual([]);
});
test("unauthenticated creation is rejected", async () => {
  const db = database(rows());
  const response = await post(db, false)(new Request("http://localhost/api?event=e", { method: "POST" }), { params: Promise.resolve({ id: "sim" }) });
  expect(response.status).toBe(401); expect(db.writes).toEqual([]);
});
for (const value of [null, 0, -1, 1.5, "3", 2147483648]) {
  test("event API rejects invalid max_attempts " + JSON.stringify(value), async () => {
    const db = database({});
    const route = load("app/api/admin/events/route.ts", { "next/server": { NextResponse: Response }, "@/lib/server/authGuard": { requireAdmin: async () => ({ id: "admin" }) }, "@/lib/server/supabaseAdmin": { createSupabaseAdminClient: () => db } });
    const response = await route.POST(new Request("http://localhost/api", { method: "POST", body: JSON.stringify({ max_attempts: value }) }));
    expect(response.status).toBe(400); expect((await response.json()).message).toContain("Tentativas"); expect(db.writes).toEqual([]);
  });
}
test("migration fills both contexts before dropping content limit and never rewrites attempts", () => {
  const sql = fs.readFileSync("supabase/migrations/20260909160000_move_attempt_limits_to_contexts.sql", "utf8");
  expect(sql.trim().startsWith("begin;")).toBeTruthy(); expect(sql.trim().endsWith("commit;")).toBeTruthy();
  expect(sql).toContain("update public.jornadas set max_attempts = 3");
  expect(sql).toContain("update public.simulado_events set max_attempts = 3");
  expect(sql.indexOf("drop column")).toBeGreaterThan(sql.lastIndexOf("check (max_attempts >= 1)"));
  expect(sql).not.toMatch(/(?:update|delete from) public.simulado_attempts/i);
  expect(sql).not.toContain("jornada_simulados");
});

test("new attempt uses current journey limit and preserves its context", async () => {
  const data: any = rows();
  data.simulado_questions = [{ id: "sq", simulado_id: "sim", question_id: "q", status: "active", points: 1, questions: { question_alternatives: [] } }];
  const db = database(data);
  const response = await post(db)(new Request("http://localhost/api?jornada=enrollment", { method: "POST" }), { params: Promise.resolve({ id: "sim" }) });
  const body = await response.json();
  expect(response.status).toBe(200); expect(body.ok).toBe(true);
  expect(body.simulado.attempt_limit).toBe(3);
  expect(db.writes).toEqual(["simulado_attempts"]);
});
test("lowering the limit preserves an existing in-progress attempt", async () => {
  const data: any = rows();
  data.student_jornada_simulados[0].student_jornadas.jornadas.max_attempts = 1;
  data.simulado_attempts.push({ id: "running", student_id: "student", simulado_id: "sim", attempt_context: "jornada", student_jornada_simulado_id: "ja", status: "in_progress", counts_toward_limit: true, question_order: [] });
  const db = database(data);
  const response = await post(db)(new Request("http://localhost/api?jornada=enrollment", { method: "POST" }), { params: Promise.resolve({ id: "sim" }) });
  const body = await response.json();
  expect(response.status).toBe(200); expect(body.attempt.id).toBe("running");
  expect(body.simulado.attempt_limit).toBe(1); expect(db.writes).toEqual([]);
});
