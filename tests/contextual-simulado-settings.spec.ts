/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(file: string, modules: Record<string, unknown> = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: (name: string) => modules[name] || {}, Request, Response, URL, console });
  return exports as any;
}
const settings = load("lib/server/contextualSimuladoSettings.ts");
const base = { feedback_mode: "final_only", navigation_override: null, owl_help_enabled: false, owl_help_limit: null };
function database(rows: Record<string, any[]>) {
  const earnings = new Map<string, any>();
  const db: any = { earnings, from(table: string) {
    let values = [...(rows[table] || [])];
    const query: any = {
      select() { return query; }, order() { return query; },
      eq(key: string, value: unknown) { values = values.filter((row) => key.split(".").reduce((item, part) => item?.[part], row) === value); return query; },
      in(key: string, ids: unknown[]) { values = values.filter((row) => ids.includes(row[key])); return query; },
      delete() { return query; }, not() { return query; },
      upsert(items: any[]) { for (const item of items) earnings.set(item.attempt_id, item); return query; },
      maybeSingle: async () => ({ data: values[0] || null, error: null }),
      then(resolve: any) { return Promise.resolve({ data: values, error: null }).then(resolve); },
    };
    return query;
  } };
  return db;
}

test("new context starts final, original navigation and no owl", () => expect(settings.parseContextualSettings({})).toEqual(base));
for (const navigation of [null, "closed"]) test("immediate closes only its context: " + navigation, () => {
  const original = { ...base };
  expect(settings.parseContextualSettings({ feedback_mode: "instant", navigation_override: navigation }, original).navigation_override).toBe("closed");
  expect(original).toEqual(base);
});
test("immediate plus explicit open is rejected server-side", () => expect(() => settings.parseContextualSettings({ feedback_mode: "instant", navigation_override: "open" })).toThrow());
for (const navigation of [null, "open", "closed"]) test("final accepts original/open/closed: " + navigation, () => expect(settings.parseContextualSettings({ navigation_override: navigation }).navigation_override).toBe(navigation));
for (const limit of [null, 0, -1, 1.5, "2", 2147483648]) test("invalid enabled owl limit: " + limit, () => expect(() => settings.parseContextualSettings({ owl_help_enabled: true, owl_help_limit: limit })).toThrow());
test("disabled owl clears its limit", () => expect(settings.parseContextualSettings({ owl_help_enabled: false, owl_help_limit: 3 }).owl_help_limit).toBeNull());

for (const override of [null, false, true]) test("journey owl override precedence: " + override, async () => {
  const db = database({ student_jornada_simulados: [{ id: "schedule", simulado_id: "sim", student_jornadas: { student_id: "student", jornadas: { ...base, owl_help_enabled: true, owl_help_limit: 2 } }, jornada_simulados: { owl_help_enabled_override: override, owl_help_limit_override: override === true ? 1 : null } }] });
  const resolved = await settings.resolveContextualSettings(db, "student", "sim", { type: "jornada", studentJornadaSimuladoId: "schedule" }, "open");
  expect(resolved.owl_help_enabled).toBe(override ?? true);
  expect(resolved.owl_help_limit).toBe(override === null ? 2 : override ? 1 : null);
});
test("shared simulado resolves separate contextual navigation and owl", async () => {
  const db = database({ simulado_event_participants: [
    { id: "a", event_id: "ea", student_id: "student", simulado_events: { ...base, simulado_id: "sim", feedback_mode: "instant", owl_help_enabled: true, owl_help_limit: 1 } },
    { id: "b", event_id: "eb", student_id: "student", simulado_events: { ...base, simulado_id: "sim" } },
  ] });
  const a = await settings.resolveContextualSettings(db, "student", "sim", { type: "event", eventId: "ea", eventParticipantId: "a" }, "open");
  const b = await settings.resolveContextualSettings(db, "student", "sim", { type: "event", eventId: "eb", eventParticipantId: "b" }, "open");
  expect(a.navigation_type).toBe("closed"); expect(b.navigation_type).toBe("open");
  expect(a.owl_help_enabled).toBe(true); expect(b.owl_help_enabled).toBe(false);
});
test("settings resolution rejects another student's context", async () => {
  const db = database({ simulado_event_participants: [{ id: "a", event_id: "ea", student_id: "other", simulado_events: { ...base, simulado_id: "sim" } }] });
  await expect(settings.resolveContextualSettings(db, "student", "sim", { type: "event", eventId: "ea", eventParticipantId: "a" }, "open")).rejects.toThrow();
});
for (const release of [null, "2026-10-02"]) test("journey release access: " + release, async () => {
  const db = database({ simulado_attempts: [{ id: "a", student_id: "student", status: "completed", student_jornada_simulado_id: "schedule", result_released_at: release }] });
  expect(await settings.isAttemptResultReleased(db, "a", "student")).toBe(Boolean(release));
  expect(await settings.isAttemptResultReleased(db, "a", "other")).toBe(false);
});
test("event release remains individual and historical standalone remains readable", async () => {
  const db = database({ simulado_attempts: [
    { id: "event", student_id: "student", status: "completed", event_participant_id: "p", result_released_at: "irrelevant", simulado_event_participants: { result_released_at: null } },
    { id: "legacy", student_id: "student", status: "completed", student_jornada_simulado_id: null },
  ] });
  expect(await settings.isAttemptResultReleased(db, "event", "student")).toBe(false);
  expect(await settings.isAttemptResultReleased(db, "legacy", "student")).toBe(true);
  expect([...await settings.releasedAttemptIds(db, "student", ["event", "legacy"])]).toEqual(["legacy"]);
});
test("TopCoins wait for release and upsert does not duplicate credits", async () => {
  const rows = { simulado_attempts: [
    { id: "a", student_id: "student", simulado_id: "sim", status: "completed", counts_toward_limit: true, student_jornada_simulado_id: "schedule", result_released_at: null, simulado_results: { correct_count: 10 } },
  ] };
  const db = database(rows);
  const coins = load("app/lib/server/topcoinsSync.ts", { "@/app/lib/gamification/topcoins": { calculateEarnedTopCoins: ({ correctAnswers, attemptNumber }: any) => correctAnswers / attemptNumber } });
  await coins.resyncTopCoinEarnings(db, "student", "sim"); expect(db.earnings.size).toBe(0);
  rows.simulado_attempts[0].result_released_at = "2026-10-02" as any;
  await coins.resyncTopCoinEarnings(db, "student", "sim");
  await coins.resyncTopCoinEarnings(db, "student", "sim");
  expect(db.earnings.size).toBe(1); expect(db.earnings.get("a").amount).toBe(10);
});
test("owl endpoint delegates simultaneous requests to the transactional RPC", async () => {
  const calls: any[] = [];
  let used = 0;
  const db = { rpc: async (name: string, args: any) => {
    calls.push({ name, args });
    // RPC contract double; PostgreSQL locking itself is not executed by this test.
    if (used) return { data: { ok: false, http_status: 403, message: "Limite" }, error: null };
    used++; return { data: { ok: true, message: "Ajuda", hiddenAlternativeIds: ["x", "y"], used, limit: 1 }, error: null };
  } };
  const route = load("app/api/student/simulados/[id]/attempts/[attemptId]/owl-help/route.ts", {
    "next/server": { NextResponse: Response }, "@/lib/server/supabaseAdmin": { createSupabaseAdminClient: () => db },
    "@/lib/server/supabaseStudentAuth": { getStudentFromRequest: async () => ({ id: "student" }) },
    "@/lib/server/studentAssertions": { assertAttemptCommercialAccess: async () => null },
  });
  const request = (question: string) => route.POST(new Request("http://local", { method: "POST", body: JSON.stringify({ simulado_question_id: question }) }), { params: Promise.resolve({ id: "sim", attemptId: "a" }) });
  const responses = await Promise.all([request("q1"), request("q2")]);
  expect(responses.map((response) => response.status)).toEqual([200, 403]);
  expect(calls.every((call) => call.name === "consume_student_owl_help" && call.args.p_student_id === "student")).toBe(true);
});
test("prepared SQL protects sequence, immediate-only correction, owl reuse and permanent release", () => {
  const sql = fs.readFileSync("supabase/migrations/20261002120000_contextual_simulado_settings.sql", "utf8");
  expect(sql.match(/\$\$/g)).toHaveLength(10);
  expect(sql).not.toMatch(/^\$(?:;)?$/m);
  expect(sql).toContain("public.lock_student_attempt(p_attempt_id, p_student_id, p_simulado_id)");
  expect(sql).toContain("next_question is distinct from p_simulado_question_id");
  expect(sql).toContain("case when immediate then alternative.is_correct else null end");
  expect(sql.indexOf("if a.owl_help_data ?")).toBeLessThan(sql.indexOf("if a.owl_help_used_count>=help_limit"));
  expect(sql).toContain("new.result_released_at := old.result_released_at");
  expect(sql).not.toMatch(/drop column|update public\.simulado_results|set settings_snapshot/i);
});

test("direct result URL cannot bypass a blocked journey, including with attemptId only", async () => {
  const db = database({ simulado_attempts: [{ id: "a", simulado_id: "sim", student_id: "student", status: "completed", student_jornada_simulado_id: "schedule", result_released_at: null }] });
  const route = load("app/api/student/simulados/[id]/resultado/route.ts", {
    "next/server": { NextResponse: Response }, "@/lib/server/supabaseAdmin": { createSupabaseAdminClient: () => db },
    "@/lib/server/supabaseStudentAuth": { getStudentFromRequest: async () => ({ id: "student" }) },
    "@/lib/server/contextualSimuladoSettings": settings,
  });
  const response = await route.GET(new Request("http://local?attemptId=a"), { params: Promise.resolve({ id: "sim" }) });
  const json = await response.json();
  expect(response.status).toBe(403); expect(json.code).toBe("JORNADA_RESULT_BLOCKED");
  expect(json.result).toBeUndefined(); expect(json.gabarito).toBeUndefined();
});
test("blocked reprocessing notification hides score metadata without changing stored audit data", async () => {
  const stored = { id: "n", student_id: "student", read_at: null, dismissed_at: null, reference_type: "simulado_attempt", reference_id: "a", metadata: { new_score: 10 }, action_url: "/result" };
  const db = database({ student_notifications: [{ ...stored }], simulado_attempts: [{ id: "a", student_id: "student", status: "completed", student_jornada_simulado_id: "schedule", result_released_at: null }] });
  const originalFrom = db.from;
  db.from = (table: string) => { const query = originalFrom(table); query.is = query.eq; query.limit = () => query; return query; };
  const route = load("app/api/student/notifications/route.ts", { "next/server": { NextResponse: Response }, "@/lib/server/supabaseAdmin": { createSupabaseAdminClient: () => db }, "@/lib/server/supabaseStudentAuth": { getStudentFromRequest: async () => ({ id: "student" }) }, "@/lib/server/contextualSimuladoSettings": settings });
  const json = await (await route.GET(new Request("http://local"))).json();
  expect(json.notification.metadata).toBeNull(); expect(json.notification.action_url).toBeNull();
  expect(stored.metadata.new_score).toBe(10);
});
for (const immediate of [false, true]) test("resume exposes correction only for confirmed immediate answers: " + immediate, async () => {
  const file = "app/api/student/simulados/[id]/attempts/route.ts";
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: any = {};
  vm.runInNewContext(source + "\nexports.resume = buildAttemptResponse;", { exports, require: (name: string) => name === "next/server" ? { NextResponse: Response } : {}, Request, Response, URL, console });
  const db = database({
    simulado_questions: [{ id: "sq", status: "active", questions: { statement: "Question", explanation_text: "Protected", question_alternatives: [{ id: "alt", label: "A", text: "Option" }] } }],
    simulado_answers: [{ attempt_id: "a", simulado_question_id: "sq", selected_alternative_id: "alt", is_correct: true, is_locked: true }],
  });
  const attempt = { id: "a", question_order: [{ simulado_question_id: "sq", question_id: "q", alternative_order: ["alt"] }], settings_snapshot: { feedback_mode: immediate ? "instant" : "final_only", instant_feedback_enabled: immediate, navigation_type: "closed", owl_help_enabled: false, show_teacher_comment: true } };
  const originalFrom = db.from;
  db.from = (table: string) => { const query = originalFrom(table); query.in = () => query; return query; };
  const json = await (await exports.resume(db, attempt, { feedback_mode: "instant", owl_help_enabled: true, owl_help_limit: 99 }, 3)).json();
  expect(json.answers[0].is_correct).toBe(immediate ? true : null);
  expect(json.questions[0].explanation_text).toBe(immediate ? "Protected" : null);
  expect(json.simulado.navigation_type).toBe("closed"); expect(json.simulado.owl_help_enabled).toBe(false);
});

test("journey release reconciliation delegates to the trigger and runs after completion and policy release", async () => {
  const calls: any[] = [];
  const db: any = { from(table: string) {
    const call: any = { table, filters: [] as unknown[] };
    calls.push(call);
    const query: any = {
      update(values: unknown) { call.values = values; return query; },
      in(key: string, ids: unknown[]) { call.filters.push(["in", key, ids.length]); return query; },
      eq(key: string, value: unknown) { call.filters.push(["eq", key, value]); return query; },
      is(key: string, value: unknown) { call.filters.push(["is", key, value]); return Promise.resolve({ error: null }); },
    };
    return query;
  } };
  const ids = Array.from({ length: 450 }, (_, index) => `item-${index}`);
  await settings.reconcileJornadaResultReleases(db, ids);
  expect(calls).toHaveLength(3);
  for (const call of calls) {
    expect(call).toMatchObject({ table: "simulado_attempts", values: { result_released_at: null } });
    expect(call.filters).toEqual(expect.arrayContaining([["eq", "status", "completed"], ["is", "result_released_at", null]]));
  }
  const completion = fs.readFileSync("lib/server/simuladoAttemptCompletion.ts", "utf8");
  expect(completion.indexOf("reconcileJornadaResultReleases(supabase, [attempt.student_jornada_simulado_id])")).toBeLessThan(completion.indexOf("const journeyResultReleased ="));
  const admin = fs.readFileSync("app/api/admin/jornadas/[id]/route.ts", "utf8");
  expect(admin.indexOf("await reconcileJornadaResultReleases(supabase,")).toBeLessThan(admin.indexOf("await resyncTopCoinEarnings(supabase, enrollment.student_id, item.simulado_id)"));
  expect(fs.readFileSync("supabase/migrations/20261002120000_contextual_simulado_settings.sql", "utf8")).toContain("if found then new.result_released_at:=clock_timestamp(); end if;");
});
