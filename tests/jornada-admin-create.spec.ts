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
function database() {
  const writes: string[] = [];
  let lastInsert: any = null;
  const db = { writes, get lastInsert() { return lastInsert; }, from(table: string) {
    const q: any = {
      select() { return q; }, eq() { return q; },
      insert(row: any) { writes.push(table); lastInsert = { id: "new-jornada", ...row }; return q; },
      single: async () => ({ data: lastInsert, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
    };
    return q;
  }};
  return db;
}
function post(db: any, adminActions: string[]) {
  return load("app/api/admin/jornadas/route.ts", {
    "next/server": { NextResponse: Response },
    "@/lib/server/authGuard": { requireAdmin: async () => ({ id: "admin-id" }) },
    "@/lib/server/supabaseAdmin": { createSupabaseAdminClient: () => db },
    "@/app/lib/server/auditLogger": {
      logAdminAction: async (payload: any) => { adminActions.push(JSON.stringify(payload)); },
      logSystemError: async () => {},
    },
  }).POST;
}
function minimalPayload() {
  return {
    title: "[QA] Jornada de teste",
    category: "administrativo",
    duration_days: 30,
    release_duration_days: 20,
    planned_simulados_count: 1,
  };
}

test("creating a jornada succeeds and returns the id (no ReferenceError from the audit call)", async () => {
  const db = database();
  const adminActions: string[] = [];
  const response = await post(db, adminActions)(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(minimalPayload()) }));
  const body = await response.json();
  expect(response.status).toBe(201);
  expect(body.ok).toBe(true);
  expect(body.id).toBe("new-jornada");
  expect(db.writes).toEqual(["jornadas"]);
  expect(db.lastInsert.status).toBe("draft");
});

test("audit log metadata reflects the real persisted status instead of throwing", async () => {
  const db = database();
  const adminActions: string[] = [];
  const response = await post(db, adminActions)(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(minimalPayload()) }));
  expect(response.status).toBe(201);
  expect(adminActions).toHaveLength(1);
  const action = JSON.parse(adminActions[0]);
  expect(action.action).toBe("admin.jornada.created");
  expect(action.entityType).toBe("jornada");
  expect(action.entityId).toBe("new-jornada");
  expect(action.metadata).toEqual({ status: "draft" });
});
