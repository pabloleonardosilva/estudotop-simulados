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
function database(rows: Record<string, any[]>, errors: Record<string, any> = {}) {
  const writes: string[] = [];
  const db = { writes, from(table: string) {
    let values = rows[table] || [];
    const q: any = {
      select() { return q; }, neq(key: string, value: unknown) { values = values.filter(row => row[key] !== value); return q; }, order() { return q; },
      eq(key: string, value: unknown) { values = values.filter(row => key.split(".").reduce((o, k) => o?.[k], row) === value); return q; },
      is(key: string, value: unknown) { return q.eq(key, value); },
      in(key: string, allowed: unknown[]) { values = values.filter(row => allowed.includes(row[key])); return q; },
      limit(n: number) { values = values.slice(0, n); return q; },
      insert(row: any) { writes.push(table); values = [{ id: "new-attempt", ...row }]; return q; },
      single: async () => ({ data: values[0] || null, error: errors[table] || null }),
      maybeSingle: async () => ({ data: values[0] || null, error: errors[table] || null }),
      then: (resolve: (value: unknown) => void) => Promise.resolve({ data: values, error: errors[table] || null }).then(resolve),
    };
    return q;
  }};
  return db;
}

const enrollmentId = "cd23889d-f091-4fca-911c-cd6c789c5853";
function fixture(status = "active") {
  return {
    student_jornadas: [{ id: enrollmentId, student_id: "student-a", jornada_id: "journey-definition", status, expires_at: "2099-01-01", jornadas: { title: "Jornada de Teste", max_attempts: 3, planned_simulados_count: 2 }, student_jornada_simulados: [
      { id: "schedule-1", simulado_id: "sim-1", order_number: 1, status: "completed", released_at: "2026-01-01", scheduled_release_at: "2026-01-01", simulados: { title: "Sim 1" } },
      { id: "schedule-2", simulado_id: "sim-2", order_number: 2, status: "available", released_at: "2026-01-02", scheduled_release_at: "2026-01-02", simulados: { title: "Sim 2" } },
    ] }],
    simulado_attempts: [{ id: "attempt-1", student_id: "student-a", student_jornada_simulado_id: "schedule-1", simulado_id: "sim-1", status: "completed", counts_toward_limit: true, submitted_at: "2026-01-01" }],
    simulado_results: [{ attempt_id: "attempt-1", percentage: 80 }],
  };
}
function routes(db: any, studentId: string | null = "student-a") {
  const logs: any[] = [];
  const modules = {
    "next/server": { NextResponse: Response },
    "@/lib/server/supabaseAdmin": { createSupabaseAdminClient: () => db },
    "@/lib/server/supabaseStudentAuth": { getStudentFromRequest: async () => studentId ? { id: studentId } : null },
    "@/app/lib/server/auditLogger": { logStudentActivity: async () => {}, logSystemError: async (entry: any) => { logs.push(entry); } },
    "@/lib/system-images": { systemImageUrl: () => null },
  };
  return { logs, list: load("app/api/student/jornadas/route.ts", modules).GET, detail: load("app/api/student/jornadas/[id]/route.ts", modules).GET };
}
function detail(route: any, id = enrollmentId) { return route(new Request("http://localhost/api/student/jornadas/" + id), { params: Promise.resolve({ id }) }); }

test("list, card and detail share the enrollment identifier and preserve the schedule", async () => {
  const db = database(fixture()); const route = routes(db);
  const list = await (await route.list(new Request("http://localhost/api/student/jornadas"))).json();
  expect(list.jornadas[0].id).toBe(enrollmentId); expect(list.jornadas[0].jornada_id).toBe("journey-definition");
  const card = fs.readFileSync("app/minhas-jornadas/page-client.tsx", "utf8");
  expect(card).toContain('href={`/minhas-jornadas/${jornada.id}`}');
  const response = await detail(route.detail, list.jornadas[0].id); const body = await response.json();
  expect(response.status).toBe(200); expect(body.jornada.id).toBe(list.jornadas[0].id);
  expect(body.jornada.progress_percent).toBe(50); expect(body.simulados).toHaveLength(2);
  expect(body.simulados[0].score_percent).toBe(80);
  expect(body.simulados[1]).toMatchObject({ status: "available", scheduled_release_at: "2026-01-02", released_at: "2026-01-02", attempt_limit: 3 });
  expect(body.simulados[1].simulado_url).toContain("?jornada=" + enrollmentId);
  expect(body.simulados[0].result_url).toContain("?jornada=" + enrollmentId); expect(db.writes).toEqual([]);
});
for (const id of ["missing", "journey-definition"]) test("unknown or definition ID is not an enrollment: " + id, async () => {
  expect((await detail(routes(database(fixture())).detail, id)).status).toBe(404);
});
test("another student cannot read the enrollment", async () => {
  const r = await detail(routes(database(fixture()), "student-b").detail); expect(r.status).toBe(404); expect(JSON.stringify(await r.json())).not.toContain("Jornada de Teste");
});
test("unauthenticated request fails", async () => { expect((await detail(routes(database(fixture()), null).detail)).status).toBe(401); });
test("paused enrollment explains suspension without changing history", async () => {
  const db = database(fixture("paused")); const r = await detail(routes(db).detail); expect(r.status).toBe(403); expect((await r.json()).message).toContain("pausado"); expect(db.writes).toEqual([]);
});
test("expired enrollment preserves completed results and expires unfinished schedule", async () => {
  const r = await detail(routes(database(fixture("expired"))).detail); const body = await r.json(); expect(r.status).toBe(200); expect(body.jornada.status).toBe("expired"); expect(body.simulados[0].score_percent).toBe(80); expect(body.simulados[1].status).toBe("expired");
});
test("cancelled enrollment retains safe not-found behavior", async () => { expect((await detail(routes(database(fixture("cancelled"))).detail)).status).toBe(404); });
for(const table of ["student_jornadas", "simulado_attempts", "simulado_results"]) test("database failure is logged and returns 500: " + table, async () => {
  const route = routes(database(fixture(), { [table]: { code: "42703", message: "column removed_column does not exist" } }));
  const r = await detail(route.detail); const body = await r.json(); expect(r.status).toBe(500); expect(body.message).not.toContain("removed_column"); expect(body.message).not.toContain("encontrada"); expect(route.logs).toHaveLength(1);
});
test("missing context limit does not become unlimited", async () => {
  const data: any = fixture(); delete data.student_jornadas[0].jornadas.max_attempts; expect((await detail(routes(database(data)).detail)).status).toBe(500);
});
test("links preserve enrollment IDs and standalone entry points are removed", () => {
  expect(fs.readFileSync("app/minhas-jornadas/page-client.tsx", "utf8")).not.toContain("Ver simulados avulsos");
  expect(fs.readFileSync("app/api/student/dashboard/route.ts", "utf8")).not.toContain("availableAvulso");
  expect(fs.readFileSync("app/meus-simulados/[id]/resultado/page-client.tsx", "utf8")).toContain("payload.jornada.student_jornada_id");
  expect(fs.readFileSync("app/meus-simulados/[id]/page-client.tsx", "utf8")).toContain("/minhas-jornadas/${jornadaId}");
  const api = fs.readFileSync("app/api/student/jornadas/[id]/route.ts", "utf8");
  expect(api).toContain('.eq("student_id", student.id)'); expect(api).not.toContain('.eq("jornada_id", id)');
});
