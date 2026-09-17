/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { test, mock } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { assertSafeSupabaseTestEnvironment: guard } = require("./supabase-test-environment.cjs");

function fixture() {
  const env = {
    TEST_SUPABASE_URL: "https://auth-fixture.invalid", NEXT_PUBLIC_SUPABASE_URL: "https://auth-fixture.invalid",
    TEST_SUPABASE_ANON_KEY: "fixture-anon", NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-anon",
    TEST_SUPABASE_SERVICE_ROLE_KEY: "fixture-service", SUPABASE_SERVICE_ROLE_KEY: "fixture-service",
    TEST_ADMIN_EMAIL: "admin-unit@example.invalid", TEST_ADMIN_PASSWORD: "Fixture-only-password-123!",
  };
  const state = { now: 1_800_000_000_000, clients: [], logins: 0, logs: [], token: "fixture-user-token", users: [], profile: null, creates: 0, confirmations: 0, profileWrites: 0, failLogin: false };
  const client = {
    auth: {
      async signInWithPassword(credentials) {
        assert.equal(credentials.email, env.TEST_ADMIN_EMAIL); assert.equal(credentials.password, env.TEST_ADMIN_PASSWORD);
        state.logins += 1;
        if (state.failLogin) throw new Error(env.TEST_ADMIN_PASSWORD + " " + state.token);
        return { data: { session: { access_token: state.token, expires_at: Math.floor(state.now / 1000) + 3600, user: { email: env.TEST_ADMIN_EMAIL } } }, error: null };
      },
      async getUser(token) { return token === "invalid-synthetic-token" ? { data: { user: null }, error: {} } : { data: { user: state.users[0] }, error: null }; },
      admin: {
        async listUsers() { return { data: { users: state.users }, error: null }; },
        async createUser(input) {
          assert.equal(input.email, env.TEST_ADMIN_EMAIL); assert.equal(input.email_confirm, true);
          state.creates += 1;
          const user = { id: "fixture-user-id", email: input.email, email_confirmed_at: "fixture-confirmed" };
          state.users.push(user); return { data: { user }, error: null };
        },
        async updateUserById(id, changes) {
          assert.equal(id, state.users[0].id); assert.equal(changes.email_confirm, true);
          state.confirmations += 1; state.users[0].email_confirmed_at = "fixture-confirmed";
          return { error: null };
        },
      },
    },
    from(table) {
      if (table === "exam_boards") { const read = { select() { return read; }, eq() { return read; }, order() { return read; }, async limit() { return { data: [], error: null }; } }; return read; }
      assert.equal(table, "profiles", "only profiles may be touched");
      const query = {
        select() { return query; }, eq() { return query; },
        async maybeSingle() { return { data: state.profile, error: null }; },
        async single() { return { data: state.profile, error: null }; },
        async insert(value) { state.profileWrites += 1; state.profile = value; return { error: null }; },
        update(value) { return { async eq() { state.profileWrites += 1; state.profile = { ...state.profile, ...value }; return { error: null }; } }; },
      }; return query;
    },
  };
  const sdk = { createClient(url, key, options) { state.clients.push({ url, key, options }); return client; } };
  const safe = { loadSafeSupabaseTestEnvironment: () => guard(env), assertSafeSupabaseTestEnvironment: () => guard(env) };
  function load(file, extra = {}) {
    let code = fs.readFileSync(path.resolve(file), "utf8");
    if (file.endsWith(".ts")) code = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    const loaded = { exports: {} };
    vm.runInNewContext(code, { module: loaded, exports: loaded.exports, process: { env }, __dirname: path.dirname(path.resolve(file)), Request, Response, Date: { now: () => state.now }, URL, Headers, console: { log: (...args) => state.logs.push(args), error: (...args) => state.logs.push(args) }, require(name) {
      if (name in extra) return extra[name];
      if (name === "@supabase/supabase-js") return sdk;
      if (name.includes("supabase-test-environment.cjs")) return safe;
      return require(name);
    } });
    return loaded.exports;
  }
  const auth = load("tests/helpers/test-admin-auth.cjs");
  const setup = load("scripts/setup-test-admin.cjs", { "../tests/helpers/test-admin-auth.cjs": auth });
  const http = load("tests/master-registrations/helpers.ts", { "../helpers/test-admin-auth.cjs": auth });
  return { env, state, auth, setup, http, load };
}

test("module imports do not provision, log in, or construct clients", () => {
  const { state } = fixture(); assert.equal(state.clients.length, 0); assert.equal(state.creates, 0); assert.equal(state.logins, 0);
});
test("normal login uses anon key and returns Bearer user token, never service role", async () => {
  const { auth, state, env } = fixture(); const headers = await auth.getTestAdminAuthHeaders();
  assert.equal(headers.Authorization, "Bearer " + state.token); assert.equal(state.clients[0].key, env.TEST_SUPABASE_ANON_KEY);
  assert.notEqual(headers.Authorization, "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY); assert.equal(state.logs.length, 0);
});
for (const name of ["TEST_ADMIN_EMAIL", "TEST_ADMIN_PASSWORD"]) test("missing " + name + " fails before creating a client", async () => {
  const { auth, state, env } = fixture(); delete env[name]; await assert.rejects(auth.getTestAdminAccessToken(), new RegExp(name)); assert.equal(state.clients.length, 0);
});
test("rejects non-synthetic email", async () => {
  const { auth, state, env } = fixture(); env.TEST_ADMIN_EMAIL = "someone@example.com"; await assert.rejects(auth.getTestAdminAccessToken(), /synthetic/); assert.equal(state.clients.length, 0);
});
test("guard is mandatory before login and provisioning", async () => {
  const { auth, setup, state, env } = fixture(); env.NEXT_PUBLIC_SUPABASE_URL = "https://unapproved.invalid";
  await assert.rejects(auth.getTestAdminAccessToken(), /Refusing/); await assert.rejects(setup.setupTestAdmin(), /Refusing/); assert.equal(state.clients.length, 0);
});
test("guard is rechecked even when a token is cached", async () => {
  const { auth, state, env } = fixture(); await auth.getTestAdminAccessToken(); env.SUPABASE_SERVICE_ROLE_KEY = "different";
  await assert.rejects(auth.getTestAdminAccessToken(), /Refusing/); assert.equal(state.logins, 1);
});
test("cache is process-local and relogs near expiry", async () => {
  const { auth, state } = fixture(); await auth.getTestAdminAccessToken(); await auth.getTestAdminAccessToken(); assert.equal(state.logins, 1);
  state.now += 3_590_000; await auth.getTestAdminAccessToken(); assert.equal(state.logins, 2);
});
test("credential changes invalidate the cache", async () => {
  const { auth, state, env } = fixture(); await auth.getTestAdminAccessToken(); env.TEST_ADMIN_PASSWORD = "Changed-fixture-password!";
  await auth.getTestAdminAccessToken(); assert.equal(state.logins, 2);
});
test("refuses an SDK response containing the service role as its token", async () => {
  const { auth, state, env } = fixture(); state.token = env.SUPABASE_SERVICE_ROLE_KEY;
  await assert.rejects(auth.getTestAdminAccessToken(), /login failed/); assert.equal(state.logs.length, 0);
});
test("login errors neither log nor expose secrets or tokens", async () => {
  const { auth, state, env } = fixture(); state.failLogin = true;
  await assert.rejects(auth.getTestAdminAccessToken(), error => !error.message.includes(env.TEST_ADMIN_PASSWORD) && !error.message.includes(state.token)); assert.equal(state.logs.length, 0);
});
for (const method of ["GET", "POST", "PATCH", "DELETE"]) test(method + " uses the central authenticated request with redirects disabled", async () => {
  const { http, state } = fixture(); let called = false;
  await http.adminRequest({ async fetch(url, options) {
    called = true; assert.equal(url, "/api/admin/exam-boards/search"); assert.equal(options.method, method);
    assert.equal(options.headers.authorization, "Bearer " + state.token); assert.equal(options.maxRedirects, 0);
  } }, method, "/api/admin/exam-boards/search", { headers: { authorization: "discard-me" } });
  assert.equal(called, true);
});
test("HTTP rejects external URLs before login and redacts request errors", async () => {
  const { http, state } = fixture(); const request = { async fetch() { throw new Error(state.token); } };
  await assert.rejects(http.adminRequest(request, "GET", "https://external.invalid/api/admin/test"), /relative/); assert.equal(state.logins, 0);
  await assert.rejects(http.adminRequest(request, "GET", "/api/admin/test"), error => error.message.includes("omitted") && !error.message.includes(state.token)); assert.equal(state.logs.length, 0);
});
test("postJson retains the response contract and supplies authentication", async () => {
  const { http, state } = fixture(); const response = await http.postJson({ async fetch(url, options) {
    assert.equal(options.method, "POST"); assert.equal(options.headers.authorization, "Bearer " + state.token); assert.equal(options.data.name, "fixture");
    return { status: () => 201, json: async () => ({ ok: true, message: "created" }) };
  } }, "/api/admin/fixture", { name: "fixture" }); assert.equal(response.status, 201); assert.equal(response.ok, true);
});
test("explicit setup creates exactly one persistent admin/profile and is idempotent", async () => {
  const { setup, state } = fixture(); const first = await setup.setupTestAdmin(); const second = await setup.setupTestAdmin();
  assert.equal(first.authUser, "created"); assert.equal(second.authUser, "reused"); assert.equal(second.profile, "unchanged");
  assert.equal(state.creates, 1); assert.equal(state.profileWrites, 1); assert.equal(state.profile.role, "admin"); assert.equal(state.profile.is_active, true);
  assert.equal(state.profile.full_name, "Synthetic Test Admin"); assert.equal(state.profile.id, state.users[0].id); assert.equal(state.logs.length, 0);
});
test("setup confirms and reuses an existing synthetic user and fixes only its profile", async () => {
  const { setup, state, env } = fixture(); state.users.push({ id: "existing-fixture", email: env.TEST_ADMIN_EMAIL }); state.profile = { id: "existing-fixture", role: "admin", is_active: false };
  const result = await setup.setupTestAdmin(); assert.equal(result.authUser, "reused"); assert.equal(state.creates, 0); assert.equal(state.confirmations, 1); assert.equal(state.profile.is_active, true);
});


test("auth env file accepts only the two additional admin variables and does not pass them to Next", () => {
  const { env } = fixture();
  const filename = path.resolve(".env.test.local");
  const exists = mock.method(fs, "existsSync", name => { assert.equal(name, filename); return true; });
  const read = mock.method(fs, "readFileSync", name => { assert.equal(name, filename); return Object.entries(env).map(([key, value]) => key + "=" + value).join("\n"); });
  try {
    const guardModule = require("./supabase-test-environment.cjs"); const loaded = {};
    guardModule.loadSafeSupabaseTestEnvironment(loaded);
    assert.equal(loaded.TEST_ADMIN_EMAIL, env.TEST_ADMIN_EMAIL); assert.equal(loaded.TEST_ADMIN_PASSWORD, env.TEST_ADMIN_PASSWORD);
    const child = guardModule.createNextTestEnvironment(loaded);
    assert.equal(child.TEST_ADMIN_EMAIL, ""); assert.equal(child.TEST_ADMIN_PASSWORD, "");
  } finally { read.mock.restore(); exists.mock.restore(); }
});

test("real route and guard smoke returns 401/401/200 using mocked Auth/SELECT and in-memory audit", async () => {
  const context = fixture(); await context.setup.setupTestAdmin();
  const smoke = context.load("scripts/smoke-test-admin.cjs", { "../tests/helpers/test-admin-auth.cjs": context.auth, "next/server": { NextResponse: Response } });
  const writesBefore = context.state.profileWrites;
  const result = await smoke.smokeTestAdmin();
  assert.equal(result.withoutBearer, 401); assert.equal(result.invalidBearer, 401); assert.equal(result.validBearer, 200);
  assert.equal(result.auditEventsInMemory, 2); assert.equal(context.state.profileWrites, writesBefore); assert.equal(context.state.logs.length, 0);
});
