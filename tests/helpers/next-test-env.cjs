/* eslint-disable @typescript-eslint/no-require-imports */
const { assertSafeSupabaseTestEnvironment } = require("./supabase-test-environment.cjs");
assertSafeSupabaseTestEnvironment();

// Next reloads env files in its CLI and workers. Intercept the installed loader
// before Next is imported so neither startup nor reload can read operational files.
const envPath = require.resolve("@next/env");
const nextEnv = require(envPath);
require.cache[envPath].exports = {
  ...nextEnv,
  loadEnvConfig() {
    assertSafeSupabaseTestEnvironment();
    return { combinedEnv: process.env, parsedEnv: {}, loadedEnvFiles: [] };
  },
};
