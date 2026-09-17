/* eslint-disable @typescript-eslint/no-require-imports */
const { createHash } = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");
const { loadSafeSupabaseTestEnvironment, assertSafeSupabaseTestEnvironment } = require("./supabase-test-environment.cjs");

/** @type {{ fingerprint: string, token: string, expiresAt: number } | null} */
let cached = null;

function readTestAdminConfig() {
  const environment = loadSafeSupabaseTestEnvironment();
  assertSafeSupabaseTestEnvironment();
  const email = process.env.TEST_ADMIN_EMAIL;
  const password = process.env.TEST_ADMIN_PASSWORD;
  if (!email || !/^[a-z0-9._+-]+@example\.invalid$/.test(email)) {
    throw new Error("TEST_ADMIN_EMAIL must be a synthetic address at example.invalid.");
  }
  if (!password || password.trim() !== password || password.length < 12 || /^replace-me/i.test(password)) {
    throw new Error("TEST_ADMIN_PASSWORD must contain a non-placeholder test password of at least 12 characters.");
  }
  return { ...environment, email, password };
}

async function getTestAdminAccessToken() {
  const config = readTestAdminConfig();
  const fingerprint = createHash("sha256").update(JSON.stringify(config)).digest("hex");
  if (cached?.fingerprint === fingerprint && cached.expiresAt > Date.now() + 60_000) return cached.token;
  cached = null;
  try {
    const client = createClient(config.url, config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await client.auth.signInWithPassword({ email: config.email, password: config.password });
    const session = data?.session;
    if (error || !session?.access_token || !session.expires_at ||
        session.user?.email !== config.email ||
        session.access_token === config.serviceRoleKey || session.access_token === config.anonKey ||
        !Number.isFinite(session.expires_at) || session.expires_at * 1000 <= Date.now() + 60_000) {
      throw new Error("Invalid test session");
    }
    cached = { fingerprint, token: session.access_token, expiresAt: session.expires_at * 1000 };
    return cached.token;
  } catch {
    throw new Error("Synthetic test admin login failed. Run explicit setup and check test credentials locally.");
  }
}

async function getTestAdminAuthHeaders() {
  return { Authorization: "Bearer " + await getTestAdminAccessToken() };
}

module.exports = { readTestAdminConfig, getTestAdminAccessToken, getTestAdminAuthHeaders };
