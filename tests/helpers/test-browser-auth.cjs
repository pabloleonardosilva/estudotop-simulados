/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createServerClient } = require("@supabase/ssr");
const { readTestAdminConfig } = require("./test-admin-auth.cjs");
const { assertSafeSupabaseTestEnvironment } = require("./supabase-test-environment.cjs");

async function prepareTestBrowserState() {
  const config = readTestAdminConfig();
  assertSafeSupabaseTestEnvironment();
  const cookies = new Map();
  const client = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => [...cookies.values()],
      setAll: (items) => { for (const cookie of items) {
        if (!cookie.value) cookies.delete(cookie.name);
        else cookies.set(cookie.name, { name: cookie.name, value: cookie.value, domain: "127.0.0.1", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" });
      } },
    },
  });
  try {
    const { data, error } = await client.auth.signInWithPassword({ email: config.email, password: config.password });
    if (error || !data.session || data.session.user.email !== config.email ||
        data.session.access_token === config.serviceRoleKey || data.session.access_token === config.anonKey) throw new Error();
    assertSafeSupabaseTestEnvironment();
    const user = await client.auth.getUser();
    if (user.error || user.data.user?.id !== data.session.user.id) throw new Error();
    const profile = await client.from("profiles").select("role,is_active,must_change_password").eq("id", user.data.user.id).single();
    if (profile.error || profile.data?.role !== "admin" || !profile.data.is_active || profile.data.must_change_password) throw new Error();
    const storageState = { cookies: [...cookies.values()], origins: [] };
    const serialized = JSON.stringify(storageState);
    if (!storageState.cookies.length || serialized.includes(config.serviceRoleKey) || serialized.includes(config.password)) throw new Error();
    const filename = path.resolve("test-results/browser-auth/admin.json");
    const ignored = execFileSync("git", ["-c", "safe.directory=" + process.cwd().replace(/\\/g, "/"), "check-ignore", "--", filename], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (!ignored.trim()) throw new Error();
    assertSafeSupabaseTestEnvironment();
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, serialized, { mode: 0o600 });
    return storageState;
  } catch {
    throw new Error("Synthetic browser session preparation failed; sensitive details omitted.");
  }
}
module.exports = { prepareTestBrowserState };
