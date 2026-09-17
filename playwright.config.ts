import { defineConfig, devices } from "@playwright/test";

import { createNextTestEnvironment, loadSafeSupabaseTestEnvironment } from "./tests/helpers/supabase-test-environment.cjs";

const localOnly = process.env.PLAYWRIGHT_LOCAL_ONLY === "1";
if (!localOnly) loadSafeSupabaseTestEnvironment();

const port = Number(process.env.PLAYWRIGHT_PORT || 3000);

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  testIgnore: localOnly ? [
    "**/master-registrations/master-registrations.spec.ts",
    "**/question-bank/**", "**/import-ai/**",
    "**/password-policy/**", "**/student-account-integrity/**",
  ] : [],
  timeout: 60_000,
  workers: 1,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: localOnly ? undefined : {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    env: createNextTestEnvironment(),
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
