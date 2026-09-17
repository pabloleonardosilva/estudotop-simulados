/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { NextResponse } = require("next/server");
const { createClient } = require("@supabase/supabase-js");
const { readTestAdminConfig, getTestAdminAuthHeaders } = require("../tests/helpers/test-admin-auth.cjs");
const { assertSafeSupabaseTestEnvironment } = require("../tests/helpers/supabase-test-environment.cjs");

async function smokeTestAdmin() {
  const config = readTestAdminConfig();
  const headers = await getTestAdminAuthHeaders();
  assertSafeSupabaseTestEnvironment();
  let auditEvents = 0;
  const client = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => {
      assertSafeSupabaseTestEnvironment();
      const target = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const method = init?.method || (input instanceof Request ? input.method : "GET");
      if (target.origin !== config.url || method !== "GET" ||
          !["/auth/v1/user", "/rest/v1/profiles", "/rest/v1/exam_boards"].includes(target.pathname)) {
        throw new Error("Auth smoke permits only the selected test-project reads.");
      }
      return fetch(input, { ...init, redirect: "error" });
    } },
  });
  const modules = {
    "next/server": { NextResponse },
    "next/navigation": { redirect() { throw new Error("Browser auth is outside this smoke."); } },
    "@/lib/server/supabaseAdmin": { createSupabaseAdminClient() { assertSafeSupabaseTestEnvironment(); return client; } },
    "@/lib/supabase/server": { createSupabaseBrowserServerClient() { throw new Error("Browser auth is outside this smoke."); } },
    // The real guard logs its 401s. Keep audit events in memory to avoid writing
    // security_event_logs, which is explicitly outside this phase's permission.
    "@/app/lib/server/auditLogger": { async logSecurityEvent() { auditEvents += 1; } },
  };
  function load(relativePath) {
    const source = fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const loaded = { exports: {} };
    vm.runInNewContext(code, { module: loaded, exports: loaded.exports, URL, Request, Response, require(name) {
      if (!(name in modules)) throw new Error("Unexpected auth smoke dependency.");
      return modules[name];
    } }, { filename: relativePath });
    return loaded.exports;
  }
  modules["@/lib/server/authGuard"] = load("lib/server/authGuard.ts");
  modules["@/lib/utils/text"] = load("lib/utils/text.ts");
  const route = load("app/api/admin/exam-boards/search/route.ts");
  const statuses = [];
  for (const auth of [{}, { Authorization: "Bearer invalid-synthetic-token" }, headers]) {
    const response = await route.GET(new Request("http://127.0.0.1/api/admin/exam-boards/search", { headers: auth }));
    statuses.push(response.status);
  }
  if (statuses[0] !== 401 || statuses[1] !== 401 || statuses[2] !== 200 || auditEvents !== 2) {
    throw new Error("Auth smoke failed; HTTP statuses: " + statuses.join(", ") + ". Response bodies are omitted.");
  }
  return { withoutBearer: statuses[0], invalidBearer: statuses[1], validBearer: statuses[2], auditEventsInMemory: auditEvents, domainWrites: 0, transport: "real route handler in process; real test Supabase Auth/SELECT" };
}
if (require.main === module) {
  smokeTestAdmin().then((summary) => console.log(JSON.stringify(summary))).catch(() => {
    console.error("Synthetic admin smoke failed. Check the guarded test environment and provisioning; no credentials or response bodies are logged.");
    process.exitCode = 1;
  });
}
module.exports = { smokeTestAdmin };
