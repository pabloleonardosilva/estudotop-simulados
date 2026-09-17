/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
function harness() {
  const config = { url: "https://fixture.invalid", anonKey: "fixture-anon", serviceRoleKey: "fixture-service", email: "fixture@example.invalid", password: "Fixture-Password-123!" };
  const state = { refused: false, clients: 0, db: new Map(), deletes: [], inserts: [], files: [], invalid: false };
  const guard = () => { if (state.refused) throw new Error("Refusing"); return { url: config.url, anonKey: config.anonKey, serviceRoleKey: config.serviceRoleKey }; };
  const client = { from(table) {
    const filters = []; let operation = "read";
    const entries = () => [...state.db.entries()].filter(([k, v]) => k.startsWith(table + "/") && filters.every(([key, value]) => v[key] === value));
    const query = {
      select() { return query; }, eq(key, value) { filters.push([key, value]); return query; },
      async maybeSingle() { return { data: entries()[0]?.[1] || null, error: null }; },
      async insert(row) { state.inserts.push({ table, row }); state.db.set(table + "/" + row.id, { ...row }); return { error: null }; },
      delete() { operation = "delete"; return query; },
      then(resolve) { assert.equal(operation, "delete"); assert.equal(filters[0][0], "id"); assert.equal(filters.length, 2); state.deletes.push({ table, filters }); for (const [k] of entries()) state.db.delete(k); resolve({ error: null }); },
    }; return query;
  } };
  const modules = {
    "./supabase-test-environment.cjs": { loadSafeSupabaseTestEnvironment: guard, assertSafeSupabaseTestEnvironment: guard },
    "./test-admin-auth.cjs": { readTestAdminConfig() { guard(); return config; } },
    "@supabase/supabase-js": { createClient(url, key) { assert.equal(key, config.serviceRoleKey); state.clients++; return client; } },
    "@supabase/ssr": { createServerClient(url, key, options) {
      assert.equal(key, config.anonKey); state.clients++;
      return {
        auth: {
          async signInWithPassword(input) { assert.equal(input.email, config.email); if (state.invalid) return { data: { session: null }, error: new Error(config.password) }; options.cookies.setAll([{ name: "fixture-auth", value: "fixture-user-session" }]); return { data: { session: { access_token: "fixture-user-token", user: { id: "fixture-id", email: config.email } } } }; },
          async getUser() { return { data: { user: { id: "fixture-id" } } }; },
        },
        from(table) { assert.equal(table, "profiles"); const q = { select() { return q; }, eq() { return q; }, async single() { return { data: { role: "admin", is_active: true, must_change_password: false } }; } }; return q; },
      };
    } },
    "node:fs": { mkdirSync() {}, writeFileSync(filename, contents) { state.files.push({ filename, contents }); } },
    "node:child_process": { execFileSync(command, args) { assert.equal(command, "git"); assert.ok(args.includes("check-ignore")); return "ignored-file"; } },
  };
  function load(filename) { const m = { exports: {} }; vm.runInNewContext(fs.readFileSync(path.resolve(filename), "utf8"), { module: m, exports: m.exports, process, console, URL, require: (name) => modules[name] || require(name) }); return m.exports; }
  return { state, config, fixtures: load("tests/helpers/test-domain-fixtures.cjs"), browser: load("tests/helpers/test-browser-auth.cjs") };
}
test("fixture guard runs before constructing a client", () => { const h = harness(); h.state.refused = true; assert.throws(() => h.fixtures.createTestDomainFixtures(), /Refusing/); assert.equal(h.state.clients, 0); });
test("invalid runId fails before client creation", () => { const h = harness(); assert.throws(() => h.fixtures.createTestDomainFixtures("QA%"), /runId/); assert.equal(h.state.clients, 0); });
test("fixtures reuse exact run IDs and cleanup is idempotent without touching another run", async () => {
  const h = harness(); const a = h.fixtures.createTestDomainFixtures("aaaaaaaa-aaaaaaaa"); const b = h.fixtures.createTestDomainFixtures("bbbbbbbb-bbbbbbbb");
  await a.create(); await a.create(); assert.equal(h.state.inserts.length, 7); await b.create();
  await a.cleanup(); await a.cleanup(); assert.equal(h.state.db.size, 7); assert.ok(h.state.db.has("questions/" + b.ids.question));
  await b.cleanup(); assert.equal(h.state.db.size, 0);
});
test("same run can recover ownership in a fresh helper", async () => { const h = harness(); const a = h.fixtures.createTestDomainFixtures("aaaaaaaa-aaaaaaaa"); await a.create(); const b = h.fixtures.createTestDomainFixtures(a.runId); await b.create(); assert.equal(h.state.inserts.length, 7); await b.cleanup(); assert.equal(h.state.db.size, 0); });
test("cleanup refuses after guard fails", async () => { const h = harness(); const a = h.fixtures.createTestDomainFixtures(); await a.create(); h.state.refused = true; await assert.rejects(a.cleanup(), /Refusing/); assert.equal(h.state.deletes.length, 0); });
test("ownership collision cannot be deleted", async () => { const h = harness(); const a = h.fixtures.createTestDomainFixtures(); h.state.db.set("disciplines/" + a.ids.discipline, { id: a.ids.discipline, name: "Unrelated" }); await assert.rejects(a.create(), /ownership/); await a.cleanup(); assert.equal(h.state.db.size, 1); });
test("question has explicit difficulty and no evaluated topics; no AI or pool writes", async () => { const h = harness(); await h.fixtures.createTestDomainFixtures().create(); const q = h.state.inserts.find(x => x.table === "questions").row; assert.equal(q.difficulty_level, 3); assert.equal(q.evaluated_topics.length, 0); assert.ok(h.state.inserts.every(x => ["disciplines", "subjects", "exam_boards", "questions", "question_subjects", "question_alternatives"].includes(x.table))); });
test("browser auth requires guard before login", async () => { const h = harness(); h.state.refused = true; await assert.rejects(h.browser.prepareTestBrowserState(), /Refusing/); assert.equal(h.state.clients, 0); });
test("browser auth uses anon login and writes only ignored user cookies without service role", async () => { const h = harness(); const s = await h.browser.prepareTestBrowserState(); assert.equal(s.cookies[0].domain, "127.0.0.1"); assert.equal(h.state.files.length, 1); assert.equal(h.state.files[0].contents.includes(h.config.serviceRoleKey), false); assert.equal(h.state.files[0].contents.includes(h.config.password), false); });
test("invalid session never creates storageState or exposes credentials", async () => { const h = harness(); h.state.invalid = true; await assert.rejects(h.browser.prepareTestBrowserState(), e => !e.message.includes(h.config.password)); assert.equal(h.state.files.length, 0); });
