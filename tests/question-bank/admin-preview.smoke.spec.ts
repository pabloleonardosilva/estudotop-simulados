import { test, expect } from "@playwright/test";
import { createTestDomainFixtures } from "../helpers/test-domain-fixtures.cjs";
import { prepareTestBrowserState } from "../helpers/test-browser-auth.cjs";
import { assertSafeSupabaseTestEnvironment } from "../helpers/supabase-test-environment.cjs";

test("synthetic admin browser session and question preview", async ({ browser, baseURL }) => {
  const target = new URL(baseURL || "");
  if (target.protocol !== "http:" || target.hostname !== "127.0.0.1") throw new Error("Preview requires the local guarded server.");
  const origin = target.origin;
  const config = assertSafeSupabaseTestEnvironment();
  const fixtures = createTestDomainFixtures();
  let context;
  let unexpectedRequests = 0;
  try {
    const storageState = await prepareTestBrowserState();
    context = await browser.newContext({ storageState, serviceWorkers: "block" });
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const containsServiceKey = JSON.stringify(request.headers()).includes(config.serviceRoleKey) || (request.postData() || "").includes(config.serviceRoleKey);
      if (containsServiceKey || ![origin, config.url].includes(url.origin)) {
        unexpectedRequests += 1;
        await route.abort();
      } else await route.continue();
    });
    await fixtures.create();
    await fixtures.create();
    const page = await context.newPage();
    const list = await page.goto(origin + "/disciplinas");
    expect(list?.status()).toBe(200);
    await expect(page.getByText(fixtures.names.discipline, { exact: true })).toBeVisible({ timeout: 60_000 });
    const previewPath = "/questoes/" + fixtures.ids.question + "/preview";
    const preview = await page.goto(origin + previewPath);
    expect(preview?.status()).toBe(200);
    await expect(page.getByText(fixtures.names.statement, { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Uma proposicao ou sua negacao e verdadeira.", { exact: true })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(previewPath);
    await context.clearCookies();
    await page.goto(origin + previewPath);
    await expect(page).toHaveURL(origin + "/login", { timeout: 30_000 });
    expect(unexpectedRequests).toBe(0);
  } finally {
    try { await context?.close(); } finally {
      const cleanup = await fixtures.cleanup();
      expect(cleanup.domainResidues).toBe(0);
      expect((await fixtures.cleanup()).domainResidues).toBe(0);
      console.log("6B3 runId=" + fixtures.runId + "; fixture cleanup verified; admin retained.");
    }
  }
});
