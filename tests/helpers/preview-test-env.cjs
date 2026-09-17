/* eslint-disable @typescript-eslint/no-require-imports */
require("./next-test-env.cjs");
const { assertSafeSupabaseTestEnvironment } = require("./supabase-test-environment.cjs");
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const config = assertSafeSupabaseTestEnvironment();
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.origin !== config.url && !["127.0.0.1", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("Preview smoke blocked external network access.");
  }
  return originalFetch(input, { ...init, redirect: "error" });
};
