/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { test, mock } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const vm = require("node:vm");
const ts = require("typescript");
const { assertSafeSupabaseTestEnvironment: guard, loadSafeSupabaseTestEnvironment: load, createNextTestEnvironment } = require("./supabase-test-environment.cjs");
const MESSAGE = "Refusing to run integration tests: Supabase test environment is not explicitly authorized.";

function authorized() {
  return {
    TEST_SUPABASE_URL: "https://supabase-fixture.invalid",
    NEXT_PUBLIC_SUPABASE_URL: "https://supabase-fixture.invalid",
    TEST_SUPABASE_ANON_KEY: "fixture-anon-opaque",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-anon-opaque",
    TEST_SUPABASE_SERVICE_ROLE_KEY: "fixture-service-opaque",
    SUPABASE_SERVICE_ROLE_KEY: "fixture-service-opaque",
  };
}
function rejected(env) { assert.throws(() => guard(env), { message: MESSAGE }); }
function withFile(content, callback) {
  const filename = path.resolve(".env.test.local");
  const exists = mock.method(fs, "existsSync", (name) => { assert.equal(name, filename); return content !== null; });
  const read = mock.method(fs, "readFileSync", (name) => { assert.equal(name, filename); return content; });
  try { callback(); } finally { read.mock.restore(); exists.mock.restore(); }
}
function dotenv(env) { return Object.entries(env).map(([key, value]) => key + "=" + value).join("\n"); }

test("accepts the complete explicitly authorized set, including opaque keys", () => {
  const env = authorized();
  assert.deepEqual(guard(env), { url: env.TEST_SUPABASE_URL, anonKey: env.TEST_SUPABASE_ANON_KEY, serviceRoleKey: env.TEST_SUPABASE_SERVICE_ROLE_KEY });
});
for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
  test("rejects mismatch: " + name, () => rejected({ ...authorized(), [name]: name.endsWith("_URL") ? "https://another-project.invalid" : "different-fixture-key" }));
}
for (const name of Object.keys(authorized())) {
  test("rejects missing or blank variable: " + name, () => {
    for (const value of [undefined, "", " "]) rejected({ ...authorized(), [name]: value });
  });
}
test("errors never reveal keys, URLs, or parser input", () => {
  const env = { ...authorized(), SUPABASE_SERVICE_ROLE_KEY: "private-fixture-do-not-print" };
  try { guard(env); assert.fail("must reject"); } catch (error) {
    assert.equal(error.message, MESSAGE);
    for (const value of Object.values(env)) assert.equal(error.stack.includes(value), false);
  }
});
test("normalizes trailing slashes only", () => {
  assert.equal(guard({ ...authorized(), NEXT_PUBLIC_SUPABASE_URL: authorized().TEST_SUPABASE_URL + "///" }).url, authorized().TEST_SUPABASE_URL);
});
for (const url of ["http://supabase-fixture.invalid", "https://supabase-fixture.invalid/path", "https://supabase-fixture.invalid?x=1", "https://supabase-fixture.invalid#hash", "https://user:pass@supabase-fixture.invalid", "https://supabase-fixture.invalid/../", "https://supabase-fixture.invalid\\evil", " https://supabase-fixture.invalid", "https://PROJECT-REF.supabase.co"]) {
  test("rejects unsafe URL form: " + url, () => rejected({ ...authorized(), TEST_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_URL: url }));
}
for (const flag of [{ NODE_ENV: "test" }, { CI: "true" }, { PLAYWRIGHT: "1" }, { NEXT_PUBLIC_SUPABASE_URL: "https://contains-test.invalid" }]) {
  test("environment label cannot authorize integration: " + Object.keys(flag)[0], () => rejected(flag));
}
test("local-only mode refuses integration even with matching credentials", () => rejected({ ...authorized(), PLAYWRIGHT_LOCAL_ONLY: "1" }));
test("rejects placeholders instead of treating the example as authorization", () => rejected({ ...authorized(), TEST_SUPABASE_SERVICE_ROLE_KEY: "replace-me", SUPABASE_SERVICE_ROLE_KEY: "replace-me" }));
test("loads only .env.test.local and accepts comments and quoted values", () => {
  withFile("# test fixture\n" + dotenv(authorized()).replace("TEST_SUPABASE_ANON_KEY=fixture-anon-opaque", 'TEST_SUPABASE_ANON_KEY="fixture-anon-opaque"'), () => {
    const env = {}; load(env); assert.deepEqual(env, authorized());
  });
});
test("accepts explicit process configuration without a file", () => withFile(null, () => assert.equal(load(authorized()).url, authorized().TEST_SUPABASE_URL)));
test("never falls back to .env.local when authorization is missing", () => withFile(null, () => assert.throws(() => load({}), { message: MESSAGE })));
for (const name of Object.keys(authorized())) {
  test("rejects conflicting inherited configuration before mutation: " + name, () => {
    withFile(dotenv(authorized()), () => {
      const env = { [name]: name.endsWith("_URL") ? "https://unapproved.invalid" : "inherited-key" };
      const before = { ...env };
      assert.throws(() => load(env), { message: MESSAGE }); assert.deepEqual(env, before);
    });
  });
}
test("incomplete file cannot partially change the environment", () => withFile("TEST_SUPABASE_URL=https://supabase-fixture.invalid", () => {
  const env = {}; assert.throws(() => load(env), { message: MESSAGE }); assert.deepEqual(env, {});
}));
test("rejects unrelated variables copied into the test env file", () => withFile(dotenv(authorized()) + "\nRESEND_API_KEY=unwanted-fixture", () => assert.throws(() => load({}), { message: MESSAGE })));
test("Next child explicitly clears inherited operational secrets and NODE_OPTIONS", () => {
  const child = createNextTestEnvironment({ ...authorized(), PATH: "fixture-path", RESEND_API_KEY: "unwanted", OPENAI_API_KEY: "unwanted", NODE_OPTIONS: "--require unwanted.cjs" });
  assert.equal(child.PATH, "fixture-path"); assert.equal(child.RESEND_API_KEY, ""); assert.equal(child.OPENAI_API_KEY, "");
  assert.equal(child.NODE_OPTIONS.includes("unwanted"), false); assert.equal(child.NODE_OPTIONS.includes("next-test-env.cjs"), true);
  assert.equal(child.SUPABASE_SERVICE_ROLE_KEY, authorized().TEST_SUPABASE_SERVICE_ROLE_KEY);
});
test("Next preload prevents all dotenv reads, including forced reloads", () => {
  const code = `const fs = require('node:fs');
    const read = fs.readFileSync;
    fs.readFileSync = function(name, ...args) { if (typeof name === 'string' && name.includes('.env')) throw new Error('dotenv read forbidden'); return read.call(this, name, ...args); };
    const assert = require('node:assert/strict');
    const loader = require('@next/env');
    for (const force of [false, true]) { const result = loader.loadEnvConfig(process.cwd(), true, console, force); assert.deepEqual(result.loadedEnvFiles, []); }
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'changed-fixture';
    assert.throws(() => loader.loadEnvConfig(process.cwd()), /Refusing to run integration tests/);
  `;
  const result = spawnSync(process.execPath, ["-e", code], { cwd: path.resolve(__dirname, "../.."), env: createNextTestEnvironment(authorized()), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});
function evaluateConfig(env) {
  const source = fs.readFileSync(path.resolve("playwright.config.ts"), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const testModule = { exports: {} };
  vm.runInNewContext(compiled, { exports: testModule.exports, module: testModule, process: { env }, require(name) {
    if (name === "@playwright/test") return { defineConfig: value => value, devices: { "Desktop Chrome": {} } };
    return { loadSafeSupabaseTestEnvironment: () => guard(env), createNextTestEnvironment: () => createNextTestEnvironment(env) };
  } });
  return testModule.exports.default;
}
test("Playwright refuses missing authorization before server/HTTP setup", () => assert.throws(() => evaluateConfig({}), { message: MESSAGE }));
test("Playwright never reuses a server and passes the guarded environment", () => {
  const config = evaluateConfig(authorized()); assert.equal(config.webServer.reuseExistingServer, false);
  assert.equal(config.webServer.env.SUPABASE_SERVICE_ROLE_KEY, authorized().TEST_SUPABASE_SERVICE_ROLE_KEY);
});
test("local-only configuration has no server and excludes the five files with network/browser cases", () => {
  const config = evaluateConfig({ PLAYWRIGHT_LOCAL_ONLY: "1" }); assert.equal(config.webServer, undefined); assert.equal(config.testIgnore.length, 5);
});
test("integration helper refuses before client construction, cleanup and HTTP", async () => {
  const source = fs.readFileSync(path.resolve("tests/master-registrations/helpers.ts"), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  let created = false;
  const testModule = { exports: {} };
  vm.runInNewContext(compiled, { exports: testModule.exports, module: testModule, require(name) {
    if (name === "@supabase/supabase-js") return { createClient() { created = true; } };
    if (name.includes("supabase-test-environment")) return { loadSafeSupabaseTestEnvironment: () => guard({}), assertSafeSupabaseTestEnvironment: () => guard({}) };
    return require(name);
  } });
  assert.throws(() => testModule.exports.supabaseAdmin(), { message: MESSAGE }); assert.equal(created, false);
  const forbidden = () => { throw new Error("side effect reached"); };
  await assert.rejects(testModule.exports.cleanupMasterTestData({ from: forbidden }, "fixture"), { message: MESSAGE });
  await assert.rejects(testModule.exports.postJson({ post: forbidden }, "/fixture", {}), { message: MESSAGE });
});
