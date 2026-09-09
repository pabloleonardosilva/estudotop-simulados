import { expect, test } from "@playwright/test";
import { isActiveEventAttempt, selectEventQuestionAttempts } from "@/lib/eventQuestionStats";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const now = Date.parse("2026-09-09T12:00:00Z");
const recent = new Date(now - 120_000).toISOString();
const participant = { id: "p", student_id: "s", representative_attempt_id: "a" };
const attempt = { id: "a", student_id: "s", event_participant_id: "p", status: "completed", counts_toward_limit: true, submitted_at: recent, started_at: recent, last_activity_at: recent, attempt_number: 1 };
const select = (rows: typeof attempt[], representative: string | null = "a") => selectEventQuestionAttempts([{ ...participant, representative_attempt_id: representative }], rows, now).map((row) => row.id);

test("valid official completed attempt is included", () => expect(select([attempt])).toEqual(["a"]));
test("live attempt two minutes ago is included without a representative", () => expect(select([{ ...attempt, status: "in_progress" }], null)).toEqual(["a"]));
for (const stale of [new Date(now - 7_200_000).toISOString(), "2026-09-05T12:00:00Z"]) {
  test(`stale attempt ${stale} is excluded even when referenced`, () => expect(select([{ ...attempt, status: "in_progress", last_activity_at: stale }])).toEqual([]));
}
for (const status of ["disqualified", "expired", "abandoned"]) {
  test(`${status} is excluded despite saved answers and a legacy reference`, () => expect(select([{ ...attempt, status }])).toEqual([]));
}
test("official completed wins over completed extra", () => expect(select([attempt, { ...attempt, id: "extra", attempt_number: 2 }])).toEqual(["a"]));
test("official completed wins over active extra", () => expect(select([{ ...attempt, id: "extra", status: "in_progress", attempt_number: 2 }, attempt])).toEqual(["a"]));
test("missing reference falls back to first valid conclusion, never an extra", () => expect(select([{ ...attempt, id: "extra", submitted_at: "2026-09-09T12:00:00Z", attempt_number: 2 }, attempt], "missing")).toEqual(["a"]));
test("multiple inconsistent live attempts have a stable choice regardless of input order", () => {
  const rows = [{ ...attempt, status: "in_progress" }, { ...attempt, id: "b", status: "in_progress" }];
  expect(select(rows)).toEqual(["a"]);
  expect(select([...rows].reverse())).toEqual(["a"]);
});
test("wrong participant or student and non-counting completed are excluded", () => {
  expect(select([{ ...attempt, event_participant_id: "other" }])).toEqual([]);
  expect(select([{ ...attempt, student_id: "other" }])).toEqual([]);
  expect(select([{ ...attempt, counts_toward_limit: false }])).toEqual([]);
});
test("resuming a stale attempt restores activity", () => {
  expect(isActiveEventAttempt({ ...attempt, status: "in_progress", last_activity_at: "2026-09-05T12:00:00Z" }, now)).toBe(false);
  expect(isActiveEventAttempt({ ...attempt, status: "in_progress" }, now)).toBe(true);
});

type Row = Record<string, unknown>;
function loadModule(file: string, requireShim: (id: string) => unknown): Record<string, unknown> {
  const moduleObj = { exports: {} };
  class FixedDate extends Date { static now() { return now; } }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { module: moduleObj, exports: moduleObj.exports, require: requireShim, Date: FixedDate, Map, Set, console });
  return moduleObj.exports;
}
async function dashboard(attempts: Row[], participants: Row[], answers: Row[]) {
  const queried: string[][] = [];
  const tables: Record<string, Row[]> = {
    simulado_events: [{ id: "event", simulado_id: "exam", status: "active" }],
    simulado_event_participants: participants.map((p) => ({ ...p, event_id: "event" })),
    simulado_attempts: attempts.map((a) => ({ ...a, event_id: "event", is_preview: false })),
    simulado_questions: [{ id: "q", simulado_id: "exam", status: "active", order_number: 1, questions: { code: "Q1", evaluated_topics: ["Topic"] } }],
    simulado_answers: answers, simulado_results: [], user_sessions: [],
  };
  const supabase = { from(table: string) {
    let rows = [...tables[table]];
    let range: [number, number] | null = null;
    const query = {
      select() { return query; },
      eq(key: string, value: unknown) { rows = rows.filter((row) => row[key] === value); return query; },
      in(key: string, values: unknown[]) { if (table === "simulado_answers") queried.push(values as string[]); rows = rows.filter((row) => values.includes(row[key])); return query; },
      gte() { return query; },
      order(key: string) { rows.sort((a, b) => String(a[key]).localeCompare(String(b[key]))); return query; },
      range(from: number, to: number) { range = [from, to]; return query; },
      maybeSingle() { return Promise.resolve({ data: rows[0] || null, error: null }); },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: range ? rows.slice(range[0], range[1] + 1) : rows.slice(0, 1000), count: rows.length, error: null }).then(resolve); },
    };
    return query;
  } };
  class NextResponse { static json(data: unknown) { return data; } }
  const getModule = (id: string): unknown => {
    if (id === "next/server") return { NextResponse };
    if (id === "@/lib/server/authGuard") return { requireEventManager: async () => ({ id: "manager" }) };
    if (id === "@/lib/server/supabaseAdmin") return { createSupabaseAdminClient: () => supabase };
    if (id === "@/lib/server/simuladoEvents") return { effectiveEventStatus: () => "active" };
    if (id === "@/lib/system-images") return { systemImageUrl: () => null };
    if (id === "server-only") return {};
    if (id.startsWith("@/lib/")) return loadModule(`${id.slice(2)}.ts`, getModule);
    throw new Error(`Unexpected dependency ${id}`);
  };
  const route = loadModule("app/api/professor/events/[id]/route.ts", getModule) as { GET: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<{ ok: boolean; questions: { answered: number; correct: number; wrong: number; blank: number; total_considered: number; alternative_counts: Record<string, number> }[] }> };
  return { response: await route.GET(new Request("http://localhost/event"), { params: Promise.resolve({ id: "event" }) }), queried };
}
test("real GET uses the live population without leaking stale or extra answers", async () => {
  const active = { ...attempt, id: "live", student_id: "live-s", event_participant_id: "live-p", status: "in_progress", last_activity_at: recent };
  const stale = { ...attempt, id: "stale", student_id: "stale-s", event_participant_id: "stale-p", status: "in_progress", last_activity_at: "2026-09-05T12:00:00Z" };
  const extra = { ...attempt, id: "extra", attempt_number: 2 };
  const participants = [participant, { id: "live-p", student_id: "live-s", representative_attempt_id: null }, { id: "stale-p", student_id: "stale-s", representative_attempt_id: "stale" }];
  const answers = [attempt, active, stale, extra].map((a) => ({ id: a.id, attempt_id: a.id, simulado_question_id: "q", selected_alternative_id: "B", is_correct: false }));
  const { response, queried } = await dashboard([attempt, active, stale, extra], participants, answers);
  expect(response.ok).toBe(true);
  expect(response.questions[0]).toMatchObject({ answered: 2, wrong: 2, blank: 0, total_considered: 2, alternative_counts: { B: 2 } });
  expect(queried[0]).toContain("live");
  expect(queried[0]).not.toContain("extra");
});
test("real GET separates completed blanks from unanswered live attempts", async () => {
  const live = { ...attempt, id: "live", student_id: "l", event_participant_id: "lp", status: "in_progress", last_activity_at: recent };
  const { response } = await dashboard([attempt, live], [participant, { id: "lp", student_id: "l", representative_attempt_id: null }], []);
  expect(response.questions[0]).toMatchObject({ answered: 0, blank: 1, total_considered: 1 });
});

test("real GET loads 1587 answers and retains only 127 valid students from 139 legacy references", async () => {
  const attempts = Array.from({ length: 139 }, (_, i) => ({ ...attempt, id: `a${i}`, student_id: `s${i}`, event_participant_id: `p${i}`, status: i < 127 ? "completed" : i < 130 ? "in_progress" : "disqualified", last_activity_at: "2026-09-05T12:00:00Z" }));
  const participants = attempts.map((a) => ({ id: a.event_participant_id, student_id: a.student_id, representative_attempt_id: a.id }));
  const answers = Array.from({ length: 1587 }, (_, i) => ({ id: `answer${String(i).padStart(5, "0")}`, attempt_id: `a${i % 139}`, simulado_question_id: i < 139 ? "q" : `q${Math.floor(i / 139)}`, selected_alternative_id: "B", is_correct: false }));
  const { response, queried } = await dashboard(attempts, participants, answers);
  expect(queried).toHaveLength(2);
  expect(response.questions[0]).toMatchObject({ answered: 127, wrong: 127, blank: 0, total_considered: 127 });
});
