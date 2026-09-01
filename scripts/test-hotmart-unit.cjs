/* eslint-disable @typescript-eslint/no-require-imports, @next/next/no-assign-module-variable */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const cache = new Map();
function loadTypeScript(filePath) {
  const absolute = path.resolve(filePath);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const module = { exports: {} };
  cache.set(absolute, module);
  const source = fs.readFileSync(absolute, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const localRequire = (request) => {
    if (request === "server-only") return {};
    if (request.startsWith("./")) return loadTypeScript(path.resolve(path.dirname(absolute), `${request}.ts`));
    if (request.startsWith("@/")) return loadTypeScript(path.resolve(request.slice(2) + ".ts"));
    return require(request);
  };
  new Function("require", "module", "exports", "__filename", "__dirname", output)(localRequire, module, module.exports, absolute, path.dirname(absolute));
  return module.exports;
}

const auth = loadTypeScript("app/lib/server/hotmart/auth.ts");
const normalize = loadTypeScript("app/lib/server/hotmart/normalize.ts");
const registrationTokens = loadTypeScript("lib/security/registrationTokens.ts");
const refund = loadTypeScript("app/lib/server/hotmart/refund.ts");
const hotmartConfig = loadTypeScript("app/lib/server/hotmart/config.ts");
const hotmartEmail = loadTypeScript("app/lib/server/hotmart/email.ts");
const hotmartProcessor = loadTypeScript("app/lib/server/hotmart/processor.ts");

const previousSecret = process.env.HOTMART_HOTTOK;
delete process.env.HOTMART_HOTTOK;
assert.deepEqual(auth.validateHotmartHottok("value"), { ok: false, code: "missing_server_secret" });
process.env.HOTMART_HOTTOK = "valid-secret";
assert.deepEqual(auth.validateHotmartHottok(null), { ok: false, code: "missing_header" });
assert.deepEqual(auth.validateHotmartHottok("invalid"), { ok: false, code: "invalid_header" });
assert.deepEqual(auth.validateHotmartHottok("different-length-secret"), { ok: false, code: "invalid_header" });
assert.deepEqual(auth.validateHotmartHottok("valid-secret"), { ok: true });
if (previousSecret === undefined) delete process.env.HOTMART_HOTTOK; else process.env.HOTMART_HOTTOK = previousSecret;

function payload(event) {
  return {
    id: `evt-${event}`,
    event,
    version: "2.0.0",
    creation_date: "2026-08-30T12:00:00Z",
    authorization: "must-not-persist",
    data: {
      product: { id: 10, ucode: "UCODE-1", name: "Jornada Teste" },
      buyer: { name: "Aluno", email: "ALUNO@EXAMPLE.COM", document: { value: "123", type: "CPF" }, phone: { number: "11999999999" } },
      purchase: { transaction: "TX-1", status: event.replace("PURCHASE_", ""), approved_date: "2026-08-30T12:00:00Z", price: { value: 100, currency_code: "BRL" }, payment: { type: "CREDIT_CARD", installments_number: 2 } },
      card: { number: "must-not-persist" },
    },
  };
}

for (const event of ["PURCHASE_APPROVED", "PURCHASE_REFUNDED", "PURCHASE_CHARGEBACK", "PURCHASE_DELAYED", "PURCHASE_CANCELED"]) {
  const result = normalize.normalizeHotmartPayload(payload(event));
  assert.equal(result.event, event);
  assert.equal(result.product.ucode, "UCODE-1");
  assert.equal(result.buyer.email, "aluno@example.com");
}

const optional = payload("PURCHASE_APPROVED");
delete optional.data.buyer.phone;
delete optional.data.purchase.payment;
assert.equal(normalize.normalizeHotmartPayload(optional).buyer.phone, null);
assert.equal(normalize.normalizeHotmartDate(1632411406874), "2021-09-23T15:36:46.874Z");
assert.equal(normalize.normalizeHotmartDate("2026-08-30T12:00:00Z"), "2026-08-30T12:00:00.000Z");
assert.equal(normalize.normalizeHotmartDate(Number.NaN), null);
assert.equal(normalize.normalizeHotmartDate(Number.POSITIVE_INFINITY), null);
assert.equal(normalize.normalizeHotmartDate(-1), null);
assert.equal(normalize.normalizeHotmartDate(null), null);
const webhookV2Payload = payload("PURCHASE_APPROVED");
webhookV2Payload.creation_date = 1632411406874;
webhookV2Payload.data.purchase.approved_date = 1622948400000;
webhookV2Payload.data.purchase.order_date = 1622948300000;
const webhookV2Normalized = normalize.normalizeHotmartPayload(webhookV2Payload);
assert.equal(webhookV2Normalized.creationDate, "2021-09-23T15:36:46.874Z");
assert.equal(webhookV2Normalized.purchase.approvedAt, "2021-06-06T03:00:00.000Z");
assert.equal(webhookV2Normalized.purchase.createdAt, "2021-06-06T02:58:20.000Z");
assert.throws(() => normalize.normalizeHotmartPayload({}), /sem id/);
const noUcode = payload("PURCHASE_APPROVED"); delete noUcode.data.product.ucode;
assert.throws(() => normalize.normalizeHotmartPayload(noUcode), /sem ucode/);
const sanitized = JSON.stringify(normalize.sanitizeHotmartPayload(normalize.normalizeHotmartPayload(payload("PURCHASE_APPROVED"))));
for (const forbidden of ["authorization", "must-not-persist", "hottok", "secret", "access_token"]) assert.equal(sanitized.toLowerCase().includes(forbidden), false);

const migration = fs.readFileSync("supabase/migrations/20260830120000_complete_hotmart_admin_workflows.sql", "utf8");
const processorSource = fs.readFileSync("app/lib/server/hotmart/processor.ts", "utf8");
const emailSource = fs.readFileSync("app/lib/server/hotmart/email.ts", "utf8");
const actionsSource = fs.readFileSync("app/api/admin/hotmart/transactions/[id]/actions/route.ts", "utf8");
for (const contract of [
  "increment_hotmart_processing_attempt", "claim_hotmart_transaction_email", "complete_hotmart_transaction_email",
  "resolve_hotmart_duplicate_student_separate", "HOTMART_ENROLLMENT_NOT_ELIGIBLE", "for update",
  "access_email_claimed_at", "pending_email_claimed_at", "p_lease_seconds", "role = 'admin' and is_active = true",
]) assert.equal(migration.toLowerCase().includes(contract.toLowerCase()), true, `Contrato ausente: ${contract}`);
assert.equal(processorSource.includes("processing_attempt_count: 1"), false);
assert.equal(processorSource.includes('rpc("increment_hotmart_processing_attempt"'), true);
assert.equal(emailSource.includes('rpc("claim_hotmart_transaction_email"'), true);
assert.equal(emailSource.includes('rpc("complete_hotmart_transaction_email"'), true);
assert.equal(emailSource.includes("idempotencyKey"), true);
assert.equal(actionsSource.includes('rpc("resolve_hotmart_duplicate_student_separate"'), true);
assert.equal(actionsSource.includes("HOTMART_ENROLLMENT_NOT_ELIGIBLE"), true);

const previousRegistrationSecret = process.env.REGISTRATION_TOKEN_SECRET;
process.env.REGISTRATION_TOKEN_SECRET = "unit-test-registration-secret";
const stableToken1 = registrationTokens.deriveHotmartFirstAccessToken("tx-1", "student-1");
const stableToken2 = registrationTokens.deriveHotmartFirstAccessToken("tx-1", "student-1");
assert.equal(stableToken1, stableToken2);
assert.notEqual(stableToken1, registrationTokens.deriveHotmartFirstAccessToken("tx-2", "student-1"));
const firstDelivery = hotmartEmail.resolveHotmartAccessEmailDelivery(true, null);
assert.equal(firstDelivery, "first_access");
const originalIdentity = hotmartEmail.buildHotmartAccessEmailIdentity("https://app.example.com", "tx-1", stableToken1);
const unusedRetryDelivery = hotmartEmail.resolveHotmartAccessEmailDelivery(true, { used_at: null, expires_at: "2026-09-02T12:00:00Z" });
const unusedRetryIdentity = hotmartEmail.buildHotmartAccessEmailIdentity("https://app.example.com", "tx-1", stableToken1);
assert.equal(unusedRetryDelivery, "first_access");
assert.deepEqual(unusedRetryIdentity, originalIdentity);
const usedRecoveryDelivery = hotmartEmail.resolveHotmartAccessEmailDelivery(false, { used_at: "2026-08-30T12:10:00Z", expires_at: "2026-09-02T12:00:00Z" });
assert.equal(usedRecoveryDelivery, "reconcile_used");
assert.notEqual(usedRecoveryDelivery, "login");
const failedLookupDelivery = hotmartEmail.resolveHotmartAccessEmailDelivery(false, null, new Error("database unavailable"));
assert.equal(failedLookupDelivery, "lookup_failed");
assert.notEqual(failedLookupDelivery, "login");
const confirmedMissingDelivery = hotmartEmail.resolveHotmartAccessEmailDelivery(false, null, null);
assert.equal(confirmedMissingDelivery, "login");
const previousResendKey = process.env.RESEND_API_KEY;
delete process.env.RESEND_API_KEY;
assert.equal(hotmartEmail.resolveHotmartAccessEmailDelivery(false, { used_at: "2026-08-30T12:10:00Z", expires_at: "2026-09-02T12:00:00Z" }), "reconcile_used");
if (previousResendKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = previousResendKey;
if (previousRegistrationSecret === undefined) delete process.env.REGISTRATION_TOKEN_SECRET; else process.env.REGISTRATION_TOKEN_SECRET = previousRegistrationSecret;

const refundSource = fs.readFileSync("app/api/admin/hotmart/transactions/[id]/refund/route.ts", "utf8");
const recoverySource = fs.readFileSync("app/api/admin/hotmart/recover-emails/route.ts", "utf8");
assert.equal(emailSource.includes("generateSecureToken"), false);
assert.equal(emailSource.includes("deriveHotmartFirstAccessToken"), true);
assert.equal(emailSource.includes("MAX_EMAIL_ATTEMPTS"), true);
assert.equal(recoverySource.includes("recoverHotmartTransactionEmails"), true);
assert.equal(refundSource.includes('rpc("begin_hotmart_refund_request"'), true);
assert.equal(refundSource.includes('rpc("finalize_hotmart_refund_request"'), true);
assert.equal(migration.includes("refund_reconciliation_required"), true);
assert.equal(migration.includes("refund_request_state in ('requesting', 'accepted', 'manual_required', 'reconciliation_required', 'confirmed')"), true);

const now = Date.parse("2026-08-30T12:30:00Z");
const leaseMs = 15 * 60 * 1000;
const eligibleForRecovery = (sentAt, claimedAt, attempts) => !sentAt && attempts < 5 && (!claimedAt || Date.parse(claimedAt) <= now - leaseMs);
assert.equal(eligibleForRecovery(null, "2026-08-30T12:20:00Z", 1), false);
assert.equal(eligibleForRecovery(null, "2026-08-30T12:00:00Z", 1), true);
assert.equal(eligibleForRecovery("2026-08-30T12:01:00Z", null, 1), false);
assert.equal(eligibleForRecovery(null, null, 5), false);
assert.equal(refund.classifyHotmartRefundHttpStatus(202), "accepted");
assert.equal(refund.classifyHotmartRefundHttpStatus(422), "rejected");
assert.equal(refund.classifyHotmartRefundHttpStatus(408), "uncertain");
assert.equal(refund.classifyHotmartRefundHttpStatus(409), "uncertain");
assert.equal(refund.classifyHotmartRefundHttpStatus(429), "uncertain");
assert.equal(refund.classifyHotmartRefundHttpStatus(503), "uncertain");
assert.equal(hotmartProcessor.shouldApplyHotmartFinancialTransition("hotmart", "active", null, "cancelled", "hotmart_refund"), true);
assert.equal(hotmartProcessor.shouldApplyHotmartFinancialTransition("hotmart", "cancelled", "hotmart_refund", "cancelled", "hotmart_refund"), false);
assert.equal(hotmartProcessor.shouldApplyHotmartFinancialTransition("hotmart", "active", null, "paused", "hotmart_overdue"), true);
assert.equal(hotmartProcessor.shouldApplyHotmartFinancialTransition("hotmart", "paused", "hotmart_overdue", "paused", "hotmart_overdue"), false);
assert.equal(hotmartProcessor.shouldApplyHotmartFinancialTransition("hotmart", "cancelled", "hotmart_chargeback", "cancelled", "hotmart_chargeback"), false);
assert.equal(hotmartProcessor.shouldApplyHotmartFinancialTransition("hotmart", "cancelled", "hotmart_cancelled", "cancelled", "hotmart_cancelled"), false);
assert.equal(hotmartProcessor.isHotmartRefundAlreadyConfirmed(null, null), false);
assert.equal(hotmartProcessor.isHotmartRefundAlreadyConfirmed("confirmed", "confirmed"), true);

const hotmartEnvNames = ["HOTMART_ENVIRONMENT", "HOTMART_CLIENT_ID", "HOTMART_CLIENT_SECRET", "HOTMART_BASIC_TOKEN"];
const previousHotmartEnv = Object.fromEntries(hotmartEnvNames.map((name) => [name, process.env[name]]));
function restoreHotmartEnv() {
  for (const name of hotmartEnvNames) {
    if (previousHotmartEnv[name] === undefined) delete process.env[name]; else process.env[name] = previousHotmartEnv[name];
  }
}
function configureHotmart(environment = "sandbox") {
  process.env.HOTMART_ENVIRONMENT = environment;
  process.env.HOTMART_CLIENT_ID = "test-client-id";
  process.env.HOTMART_CLIENT_SECRET = "test-client-secret";
  process.env.HOTMART_BASIC_TOKEN = "test-basic-token";
}

async function testHotmartExternalClient() {
  const originalFetch = global.fetch;
  try {
    configureHotmart("sandbox");
    assert.equal(hotmartConfig.getHotmartExternalConfig().apiBaseUrl, "https://sandbox.hotmart.com");
    configureHotmart("production");
    assert.equal(hotmartConfig.getHotmartExternalConfig().apiBaseUrl, "https://developers.hotmart.com");
    assert.throws(() => hotmartConfig.assertHotmartHomologationFinancialEnvironment(), /REQUIRES_SANDBOX/);
    delete process.env.HOTMART_ENVIRONMENT;
    assert.throws(() => hotmartConfig.getHotmartEnvironment(), /ENVIRONMENT_INVALID/);
    process.env.HOTMART_ENVIRONMENT = "staging";
    assert.throws(() => hotmartConfig.getHotmartEnvironment(), /ENVIRONMENT_INVALID/);

    configureHotmart("sandbox");
    delete process.env.HOTMART_BASIC_TOKEN;
    let calls = 0;
    global.fetch = async () => { calls += 1; throw new Error("unexpected fetch"); };
    refund.resetHotmartAccessTokenCache();
    await assert.rejects(() => refund.requestHotmartRefund("TX-NO-BASIC"), /HOTMART_OAUTH_NOT_CONFIGURED/);
    assert.equal(calls, 0);

    for (const missing of ["HOTMART_CLIENT_ID", "HOTMART_CLIENT_SECRET"]) {
      configureHotmart("sandbox");
      delete process.env[missing];
      calls = 0;
      refund.resetHotmartAccessTokenCache();
      await assert.rejects(() => refund.requestHotmartRefund("TX-MISSING"), /HOTMART_OAUTH_NOT_CONFIGURED/);
      assert.equal(calls, 0);
    }

    configureHotmart("sandbox");
    const requests = [];
    global.fetch = async (input, init) => {
      requests.push({ url: String(input), init });
      if (requests.length === 1) return new Response(JSON.stringify({ access_token: "mock-access", token_type: "bearer", expires_in: 3600 }), { status: 200 });
      return new Response(null, { status: 202 });
    };
    refund.resetHotmartAccessTokenCache();
    assert.deepEqual(await refund.requestHotmartRefund("TX-SANDBOX"), { outcome: "accepted", status: 202 });
    assert.equal(requests[0].init.headers.Authorization, "Basic test-basic-token");
    assert.equal(requests[0].url.includes("grant_type=client_credentials"), true);
    assert.equal(requests[0].url.includes("client_id=test-client-id"), true);
    assert.equal(requests[0].url.includes("client_secret=test-client-secret"), true);
    assert.equal(requests[1].url.startsWith("https://sandbox.hotmart.com/payments/api/v1/sales/"), true);

    configureHotmart("production");
    let productionRefundUrl = "";
    global.fetch = async (input) => {
      if (String(input).includes("oauth/token")) return new Response(JSON.stringify({ access_token: "mock-production", token_type: "bearer", expires_in: 3600 }), { status: 200 });
      productionRefundUrl = String(input);
      return new Response(null, { status: 200 });
    };
    refund.resetHotmartAccessTokenCache();
    assert.equal((await refund.requestHotmartRefund("TX-PRODUCTION")).outcome, "accepted");
    assert.equal(productionRefundUrl.startsWith("https://developers.hotmart.com/payments/api/v1/sales/"), true);

    configureHotmart("sandbox");
    calls = 0;
    global.fetch = async (input) => {
      calls += 1;
      if (String(input).includes("oauth/token")) return new Response(JSON.stringify({ access_token: `mock-${calls}`, token_type: "bearer", expires_in: 3600 }), { status: 200 });
      return new Response(null, { status: calls === 2 ? 401 : 202 });
    };
    refund.resetHotmartAccessTokenCache();
    assert.equal((await refund.requestHotmartRefund("TX-RENEW")).outcome, "accepted");
    assert.equal(calls, 4);

    configureHotmart("sandbox");
    global.fetch = async (input) => {
      if (String(input).includes("oauth/token")) return new Response(JSON.stringify({ access_token: "mock-timeout", token_type: "bearer", expires_in: 3600 }), { status: 200 });
      throw new Error("mock timeout");
    };
    refund.resetHotmartAccessTokenCache();
    await assert.rejects(() => refund.requestHotmartRefund("TX-TIMEOUT"), (error) => error.certainty === "uncertain");

    delete process.env.HOTMART_ENVIRONMENT;
    calls = 0;
    global.fetch = async () => { calls += 1; throw new Error("unexpected fetch"); };
    refund.resetHotmartAccessTokenCache();
    await assert.rejects(() => refund.requestHotmartRefund("TX-NO-ENV"), /HOTMART_ENVIRONMENT_NOT_CONFIGURED/);
    assert.equal(calls, 0);
  } finally {
    global.fetch = originalFetch;
    restoreHotmartEnv();
    refund.resetHotmartAccessTokenCache();
  }
}

testHotmartExternalClient().then(() => console.log("Hotmart unit tests: PASS")).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
