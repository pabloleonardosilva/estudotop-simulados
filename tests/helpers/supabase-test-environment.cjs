/* eslint-disable @typescript-eslint/no-require-imports */
const { createHash, timingSafeEqual } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { parseEnv } = require("node:util");

const MESSAGE = "Refusing to run integration tests: Supabase test environment is not explicitly authorized.";
const ENV_NAMES = [
  "TEST_SUPABASE_URL", "TEST_SUPABASE_ANON_KEY", "TEST_SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
];
const FILE_ENV_NAMES = [...ENV_NAMES, "TEST_ADMIN_EMAIL", "TEST_ADMIN_PASSWORD"];

/** @returns {never} */
function refuse() { throw new Error(MESSAGE); }

/** @param {string | undefined} value */
function required(value) {
  if (!value || value.trim() !== value || /^(replace-me|your[-_]|<)/i.test(value)) refuse();
  return value;
}

/** @param {string | undefined} value */
function normalizeUrl(value) {
  const normalized = required(value).replace(/\/+$/, "");
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port ||
        parsed.search || parsed.hash || parsed.pathname !== "/" ||
        normalized !== parsed.origin || /project-ref/i.test(parsed.hostname)) refuse();
  } catch { refuse(); }
  return normalized;
}

/** @param {string} left @param {string} right */
function sameSecret(left, right) {
  return timingSafeEqual(createHash("sha256").update(left).digest(), createHash("sha256").update(right).digest());
}

/** @param {NodeJS.ProcessEnv} [env] */
function assertSafeSupabaseTestEnvironment(env = process.env) {
  if (env.PLAYWRIGHT_LOCAL_ONLY === "1") refuse();
  const url = normalizeUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  const allowedUrl = normalizeUrl(env.TEST_SUPABASE_URL);
  const anonKey = required(env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceRoleKey = required(env.SUPABASE_SERVICE_ROLE_KEY);
  if (url !== allowedUrl ||
      !sameSecret(anonKey, required(env.TEST_SUPABASE_ANON_KEY)) ||
      !sameSecret(serviceRoleKey, required(env.TEST_SUPABASE_SERVICE_ROLE_KEY))) refuse();
  return { url, anonKey, serviceRoleKey };
}

/** @param {NodeJS.ProcessEnv} [env] @param {string} [directory] */
function loadSafeSupabaseTestEnvironment(env = process.env, directory = process.cwd()) {
  const candidate = { ...env };
  const filename = path.join(directory, ".env.test.local");
  if (fs.existsSync(filename)) {
    let parsed;
    try { parsed = parseEnv(fs.readFileSync(filename, "utf8")); } catch { refuse(); }
    for (const [name, value] of Object.entries(parsed)) {
      if (!FILE_ENV_NAMES.includes(name)) refuse();
      if (candidate[name] !== undefined) {
        const matches = name.endsWith("_URL")
          ? normalizeUrl(candidate[name]) === normalizeUrl(value)
          : sameSecret(candidate[name], value);
        if (!matches) refuse();
      }
      candidate[name] = value;
    }
  }
  const validated = assertSafeSupabaseTestEnvironment(candidate);
  for (const name of FILE_ENV_NAMES) {
    if (candidate[name] !== undefined) env[name] = candidate[name];
  }
  env.NEXT_PUBLIC_SUPABASE_URL = validated.url;
  env.TEST_SUPABASE_URL = validated.url;
  return validated;
}

/** @param {NodeJS.ProcessEnv} [env] */
function createNextTestEnvironment(env = process.env) {
  assertSafeSupabaseTestEnvironment(env);
  /** @type {Record<string, string>} */
  const child = {};
  const systemNames = /^(path|systemroot|windir|comspec|pathext|temp|tmp|tmpdir|home|userprofile|appdata|localappdata|number_of_processors|processor_architecture|systemdrive)$/i;
  for (const [name, value] of Object.entries(env)) {
    // Playwright merges webServer.env with process.env: explicitly clear everything else.
    child[name] = value !== undefined && (systemNames.test(name) || ENV_NAMES.includes(name)) ? value : "";
  }
  child.NODE_ENV = "development";
  child.NEXT_TELEMETRY_DISABLED = "1";
  child.NODE_OPTIONS = '--require "' + path.join(__dirname, "next-test-env.cjs").replace(/\\/g, "/") + '"';
  return child;
}

module.exports = { assertSafeSupabaseTestEnvironment, loadSafeSupabaseTestEnvironment, createNextTestEnvironment };
