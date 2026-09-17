import { defineConfig } from "@playwright/test";
import path from "node:path";
import base from "./playwright.config";
import { createNextTestEnvironment, loadSafeSupabaseTestEnvironment } from "./tests/helpers/supabase-test-environment.cjs";
loadSafeSupabaseTestEnvironment();
const env = createNextTestEnvironment();
env.NODE_OPTIONS = '--require "' + path.resolve("tests/helpers/preview-test-env.cjs").replace(/\\/g, "/") + '"';
export default defineConfig({
  ...base,
  testMatch: "**/admin-preview.smoke.spec.ts",
  retries: 0,
  timeout: 180_000,
  reporter: [["list"]],
  use: { ...base.use, baseURL: "http://127.0.0.1:3103", trace: "off", screenshot: "off", video: "off" },
  webServer: { ...(base.webServer as NonNullable<typeof base.webServer>),
    command: "npm run dev -- --hostname 127.0.0.1 --port 3103",
    url: "http://127.0.0.1:3103/login", env, reuseExistingServer: false, timeout: 180_000,
  },
});
