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
const hotmartProducts = loadTypeScript("app/lib/server/hotmart/products.ts");
const hotmartProductionCatalog = loadTypeScript("app/lib/server/hotmart/productionCatalog.ts");

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

for (const event of ["PURCHASE_APPROVED", "PURCHASE_COMPLETE", "PURCHASE_PROTEST", "PURCHASE_REFUNDED", "PURCHASE_CHARGEBACK", "PURCHASE_DELAYED", "PURCHASE_CANCELED", "PURCHASE_EXPIRED"]) {
  const result = normalize.normalizeHotmartPayload(payload(event));
  assert.equal(result.event, event);
  assert.equal(result.product.ucode, "UCODE-1");
  assert.equal(result.buyer.email, "aluno@example.com");
}

const protestPayload = payload("PURCHASE_PROTEST");
protestPayload.data.purchase.status = "DISPUTE";
assert.equal(normalize.normalizeHotmartPayload(protestPayload).purchase.status, "DISPUTE");

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
const pageClientSource = fs.readFileSync("app/admin/configuracoes/hotmart/page-client.tsx", "utf8");
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
assert.equal(hotmartProcessor.shouldRegisterHotmartProtest(null, null), true);
assert.equal(hotmartProcessor.shouldRegisterHotmartProtest(null, "reconciliation_required"), false);
assert.equal(hotmartProcessor.shouldRegisterHotmartProtest("confirmed", "confirmed"), false);
assert.equal(hotmartProcessor.getHotmartCommercialProcessingDecision("received"), "process");
const contemporaryDates = hotmartProcessor.evaluateHotmartJornadaCommercialDates("2026-09-01T12:00:00Z", 15, new Date("2026-09-02T12:00:00Z"));
assert.equal(contemporaryDates.ok, true);
assert.equal(contemporaryDates.expiresAt, "2026-09-16T12:00:00.000Z");
const expiredDates = hotmartProcessor.evaluateHotmartJornadaCommercialDates("2017-11-27T11:49:06Z", 15, new Date("2026-09-02T12:00:00Z"));
assert.deepEqual(expiredDates, { ok: false, reason: "expired", approvedAt: "2017-11-27T11:49:06.000Z", expiresAt: "2017-12-12T11:49:06.000Z" });
assert.equal(hotmartProcessor.evaluateHotmartJornadaCommercialDates(null, 15).reason, "missing_approved_at");
assert.equal(processorSource.includes('action: "commercial_date_requires_review"'), true);
assert.equal(processorSource.includes('errorCode: "COMMERCIAL_DATE_REQUIRES_REVIEW"'), true);
// Precedência comercial (Fase 5B.0.1): a validação de datas precisa ocorrer ANTES da checagem de
// matrícula duplicada (`existing?.access_origin === "hotmart"`) — uma compra com approved_at
// ausente/inválido/já expirado não deve ser classificada como pending_duplicate_purchase antes de
// sabermos se ela própria tem dados comerciais válidos. Restaurado o desenho original de e254e37,
// corrigindo uma inversão introduzida na integração da Fase 5A (achado reportado na Fase 5B.0).
assert.equal(processorSource.indexOf("const commercialDates = evaluateHotmartJornadaCommercialDates") < processorSource.indexOf('from("student_jornadas")'), true);

const productLookupRouteSource = fs.readFileSync("app/api/admin/hotmart/products/lookup/route.ts", "utf8");
const hotmartAdminRouteSource = fs.readFileSync("app/api/admin/hotmart/route.ts", "utf8");
assert.equal(productLookupRouteSource.includes("requireAdmin(request)"), true);
assert.equal(productLookupRouteSource.includes("lookupHotmartProductByUcode"), true);
assert.equal(hotmartAdminRouteSource.includes("verify_product_with_hotmart"), true);
assert.equal(hotmartAdminRouteSource.includes("name = (await lookupHotmartProductByUcode(ucode)).name"), true);

// Painel Hotmart: as chamadas administrativas (/api/admin/hotmart/**) exigem Authorization: Bearer
// (requireAdmin) — precisam de adminFetch (app/lib/supabase/adminFetch.ts), nunca fetch() puro, que
// nunca anexa o header e faria a rota responder 401/403 na prática (bug real corrigido nesta Sprint).
assert.equal(pageClientSource.includes('import { adminFetch } from "@/lib/supabase/adminFetch";'), true);
const rawFetchCallCount = (pageClientSource.match(/\bfetch\(/g) || []).length;
assert.equal(rawFetchCallCount, 0, "Nenhuma chamada deste painel deve usar fetch() puro contra rota requireAdmin — use adminFetch().");
// Fase 5B.3: a UI final acrescenta busca/listagem de catálogo Sandbox e Produção e o fluxo de
// vínculo por pendência (savePendingMapping + reprocessar), elevando de 6 para 11 chamadas — todas
// via adminFetch, nenhuma via fetch() puro (checado acima).
const adminFetchCallCount = (pageClientSource.match(/adminFetch\(/g) || []).length;
// Reconciliação de compradores (15/10/2026): +3 chamadas — resumo após salvar o vínculo, prévia do
// modal de compradores e importação em lote.
assert.equal(adminFetchCallCount, 14, "As 14 chamadas administrativas conhecidas (as 11 anteriores + resumo de compradores, prévia do modal e importação em lote) devem usar adminFetch.");

assert.equal(hotmartProcessor.getHotmartCommercialProcessingDecision("pending_mapping"), "process");
assert.equal(hotmartProcessor.getHotmartCommercialProcessingDecision("refund_reconciliation_required"), "process");
assert.equal(hotmartProcessor.getHotmartCommercialProcessingDecision("processing"), "wait");
assert.equal(hotmartProcessor.getHotmartCommercialProcessingDecision("processed"), "complete");
assert.equal(hotmartProcessor.getHotmartCommercialProcessingDecision("blocked_financial"), "preserve");
let commercialState = "received";
assert.equal(hotmartProcessor.getHotmartCommercialProcessingDecision(commercialState), "process");
commercialState = "processed";
assert.equal(hotmartProcessor.getHotmartCommercialProcessingDecision(commercialState), "complete");
assert.equal(hotmartProcessor.getHotmartCommercialProcessingDecision("received"), "process");
assert.equal(processorSource.includes('action: "refund_request_received"'), true);
assert.equal(processorSource.includes('refund_request_state: "reconciliation_required"'), true);
assert.equal(processorSource.includes('processing_status: "processing"'), true);
assert.equal(processorSource.includes('.in("processing_status", HOTMART_COMMERCIAL_PROCESSING_ELIGIBLE)'), true);

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

const hotmartProductionEnvNames = ["HOTMART_PRODUCTION_CLIENT_ID", "HOTMART_PRODUCTION_CLIENT_SECRET", "HOTMART_PRODUCTION_BASIC_TOKEN"];
const previousHotmartProductionEnv = Object.fromEntries(hotmartProductionEnvNames.map((name) => [name, process.env[name]]));
function restoreHotmartProductionEnv() {
  for (const name of hotmartProductionEnvNames) {
    if (previousHotmartProductionEnv[name] === undefined) delete process.env[name]; else process.env[name] = previousHotmartProductionEnv[name];
  }
}
function configureHotmartProduction() {
  process.env.HOTMART_PRODUCTION_CLIENT_ID = "prod-client-id";
  process.env.HOTMART_PRODUCTION_CLIENT_SECRET = "prod-client-secret";
  process.env.HOTMART_PRODUCTION_BASIC_TOKEN = "prod-basic-token";
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

    configureHotmart("sandbox");
    const lookupRequests = [];
    global.fetch = async (input) => {
      lookupRequests.push(String(input));
      if (String(input).includes("oauth/token")) return new Response(JSON.stringify({ access_token: "mock-product", token_type: "bearer", expires_in: 3600 }), { status: 200 });
      return new Response(JSON.stringify({ items: [{ ucode: "fb056612-bcc6-4217-9e6d-2a5d1110ac2f", name: "Produto test postback2" }], page_info: {} }), { status: 200 });
    };
    refund.resetHotmartAccessTokenCache();
    assert.deepEqual(await hotmartProducts.lookupHotmartProductByUcode("fb056612-bcc6-4217-9e6d-2a5d1110ac2f"), { ucode: "fb056612-bcc6-4217-9e6d-2a5d1110ac2f", name: "Produto test postback2" });
    assert.equal(lookupRequests.some((url) => url.startsWith("https://sandbox.hotmart.com/products/api/v1/products")), true);

    configureHotmart("production");
    let productionLookupUrl = "";
    global.fetch = async (input) => {
      if (String(input).includes("oauth/token")) return new Response(JSON.stringify({ access_token: "mock-product-production", token_type: "bearer", expires_in: 3600 }), { status: 200 });
      productionLookupUrl = String(input);
      return new Response(JSON.stringify({ items: [], page_info: {} }), { status: 200 });
    };
    refund.resetHotmartAccessTokenCache();
    await assert.rejects(() => hotmartProducts.lookupHotmartProductByUcode("fb056612-bcc6-4217-9e6d-2a5d1110ac2f"), (error) => error.code === "not_found");
    assert.equal(productionLookupUrl.startsWith("https://developers.hotmart.com/products/api/v1/products"), true);

    configureHotmart("sandbox");
    delete process.env.HOTMART_CLIENT_SECRET;
    calls = 0;
    global.fetch = async () => { calls += 1; throw new Error("unexpected fetch"); };
    refund.resetHotmartAccessTokenCache();
    await assert.rejects(() => hotmartProducts.lookupHotmartProductByUcode("fb056612-bcc6-4217-9e6d-2a5d1110ac2f"), (error) => error.code === "not_configured");
    assert.equal(calls, 0);

    configureHotmart("sandbox");
    global.fetch = async (input) => String(input).includes("oauth/token")
      ? new Response(null, { status: 401 })
      : new Response(JSON.stringify({ items: [] }), { status: 200 });
    refund.resetHotmartAccessTokenCache();
    await assert.rejects(() => hotmartProducts.lookupHotmartProductByUcode("fb056612-bcc6-4217-9e6d-2a5d1110ac2f"), (error) => error.code === "not_configured");

    const adminProductsRouteSource = fs.readFileSync("app/api/admin/hotmart/products/route.ts", "utf8");
    assert.equal(adminProductsRouteSource.includes("requireAdmin(request)"), true);
    assert.equal(adminProductsRouteSource.includes("listHotmartSandboxProducts"), true);
    assert.equal(adminProductsRouteSource.includes("A integração Hotmart não está configurada corretamente."), true);
    assert.equal(/access_token|client_secret|client_id|basicAuthorization|Authorization/i.test(adminProductsRouteSource), false);

    configureHotmart("sandbox");
    const listRequests = [];
    global.fetch = async (input) => {
      listRequests.push(String(input));
      if (String(input).includes("oauth/token")) return new Response(JSON.stringify({ access_token: "mock-list", token_type: "bearer", expires_in: 3600 }), { status: 200 });
      if (String(input).includes("page_token=next")) return new Response(JSON.stringify({ items: [{ ucode: "UCODE-B", name: "Produto B" }], page_info: {} }), { status: 200 });
      return new Response(JSON.stringify({ items: [{ ucode: "UCODE-A", name: "Produto A", internal_id: 999 }], page_info: { next_page_token: "next" } }), { status: 200 });
    };
    refund.resetHotmartAccessTokenCache();
    const sandboxList = await hotmartProducts.listHotmartSandboxProducts();
    assert.deepEqual(sandboxList, [{ ucode: "UCODE-A", name: "Produto A" }, { ucode: "UCODE-B", name: "Produto B" }]);
    for (const product of sandboxList) assert.deepEqual(Object.keys(product).sort(), ["name", "ucode"]);
    assert.equal(listRequests.some((url) => url.startsWith("https://sandbox.hotmart.com/products/api/v1/products")), true);
    assert.equal(listRequests.every((url) => !url.startsWith("https://developers.hotmart.com")), true);

    configureHotmart("production");
    let productionListUrl = "";
    global.fetch = async (input) => {
      if (String(input).includes("oauth/token")) return new Response(JSON.stringify({ access_token: "mock-list-production", token_type: "bearer", expires_in: 3600 }), { status: 200 });
      productionListUrl = String(input);
      return new Response(JSON.stringify({ items: [], page_info: {} }), { status: 200 });
    };
    refund.resetHotmartAccessTokenCache();
    assert.deepEqual(await hotmartProducts.listHotmartSandboxProducts(), []);
    assert.equal(productionListUrl.startsWith("https://developers.hotmart.com/products/api/v1/products"), true);

    configureHotmart("sandbox");
    delete process.env.HOTMART_CLIENT_SECRET;
    calls = 0;
    global.fetch = async () => { calls += 1; throw new Error("unexpected fetch"); };
    refund.resetHotmartAccessTokenCache();
    await assert.rejects(() => hotmartProducts.listHotmartSandboxProducts(), (error) => error.code === "not_configured");
    assert.equal(calls, 0);

    // A/B: UCODE real retornado pela Hotmart (fora do nibble de versão/variante RFC 4122) é aceito, em qualquer caixa.
    assert.equal(hotmartProducts.HOTMART_UCODE_PATTERN.test("57912595-BA4B-02E0-8C72-71CB71E13136"), true);
    assert.equal(hotmartProducts.HOTMART_UCODE_PATTERN.test("57912595-ba4b-02e0-8c72-71cb71e13136"), true);
    // E: UCODE sintético anterior continua válido.
    assert.equal(hotmartProducts.HOTMART_UCODE_PATTERN.test("fb056612-bcc6-4217-9e6d-2a5d1110ac2f"), true);
    // F: fora da estrutura 8-4-4-4-12 hexadecimal é inválido.
    for (const invalid of ["not-a-ucode", "57912595-BA4B-02E0-8C72-71CB71E1313", "57912595-BA4B-02E0-8C72-71CB71E131366", "57912595_BA4B_02E0_8C72_71CB71E13136", ""]) {
      assert.equal(hotmartProducts.HOTMART_UCODE_PATTERN.test(invalid), false);
    }

    // C: input em minúsculas casa com item retornado pela API em maiúsculas; resultado normalizado em minúsculas.
    configureHotmart("sandbox");
    global.fetch = async (input) => String(input).includes("oauth/token")
      ? new Response(JSON.stringify({ access_token: "mock-marketing", token_type: "bearer", expires_in: 3600 }), { status: 200 })
      : new Response(JSON.stringify({ items: [{ ucode: "57912595-BA4B-02E0-8C72-71CB71E13136", name: "Marketing Digital do Zero" }], page_info: {} }), { status: 200 });
    refund.resetHotmartAccessTokenCache();
    assert.deepEqual(
      await hotmartProducts.lookupHotmartProductByUcode("57912595-ba4b-02e0-8c72-71cb71e13136"),
      { ucode: "57912595-ba4b-02e0-8c72-71cb71e13136", name: "Marketing Digital do Zero" },
    );

    // D: input em maiúsculas casa com item retornado pela API em minúsculas.
    configureHotmart("sandbox");
    global.fetch = async (input) => String(input).includes("oauth/token")
      ? new Response(JSON.stringify({ access_token: "mock-marketing-2", token_type: "bearer", expires_in: 3600 }), { status: 200 })
      : new Response(JSON.stringify({ items: [{ ucode: "57912595-ba4b-02e0-8c72-71cb71e13136", name: "Marketing Digital do Zero" }], page_info: {} }), { status: 200 });
    refund.resetHotmartAccessTokenCache();
    assert.deepEqual(
      await hotmartProducts.lookupHotmartProductByUcode("57912595-BA4B-02E0-8C72-71CB71E13136"),
      { ucode: "57912595-ba4b-02e0-8c72-71cb71e13136", name: "Marketing Digital do Zero" },
    );

    // G: rota de lookup e rota de criação de mapping usam exatamente a mesma regra (mesma constante importada), sem divergência.
    const productLookupRouteSourceUcode = fs.readFileSync("app/api/admin/hotmart/products/lookup/route.ts", "utf8");
    assert.equal(productLookupRouteSourceUcode.includes("HOTMART_UCODE_PATTERN"), true);
    assert.equal(productLookupRouteSourceUcode.includes('from "@/app/lib/server/hotmart/products"'), true);
    assert.equal(hotmartAdminRouteSource.includes("HOTMART_UCODE_PATTERN"), true);
    assert.equal(hotmartAdminRouteSource.includes('from "@/app/lib/server/hotmart/products"'), true);
    assert.equal(hotmartAdminRouteSource.includes("Informe um Product UCODE válido."), true);

    // H: normalização para minúsculas ocorre antes de qualquer comparação/gravação de ucode nas duas rotas
    // e na busca de mapping durante o webhook — evita que só a caixa produza um vínculo duplicado.
    assert.equal(productLookupRouteSourceUcode.includes("rawUcode.toLowerCase()"), true);
    assert.equal(hotmartAdminRouteSource.includes("body.hotmart_product_ucode.trim().toLowerCase()"), true);
    assert.equal(processorSource.includes('.eq("hotmart_product_ucode", event.product.ucode.toLowerCase())'), true);

    const productionRouteSource = fs.readFileSync("app/api/admin/hotmart/products/production/route.ts", "utf8");
    const productionCatalogSource = fs.readFileSync("app/lib/server/hotmart/productionCatalog.ts", "utf8");

    // A: rota de produção exige admin.
    assert.equal(productionRouteSource.includes("requireAdmin(request)"), true);

    // B: usa somente credenciais HOTMART_PRODUCTION_*.
    assert.equal(productionCatalogSource.includes('requiredProductionEnv("HOTMART_PRODUCTION_CLIENT_ID")'), true);
    assert.equal(productionCatalogSource.includes('requiredProductionEnv("HOTMART_PRODUCTION_CLIENT_SECRET")'), true);
    assert.equal(productionCatalogSource.includes('requiredProductionEnv("HOTMART_PRODUCTION_BASIC_TOKEN")'), true);

    // C: nunca usa a credencial/cache Sandbox — módulo isolado, sem importar refund.ts nem HOTMART_BASIC_TOKEN Sandbox.
    assert.equal(productionCatalogSource.includes("HOTMART_BASIC_TOKEN"), false);
    assert.equal(productionCatalogSource.includes('from "./refund"'), false);
    assert.equal(productionCatalogSource.includes("getHotmartAccessToken"), false);
    assert.equal(productionCatalogSource.includes("HOTMART_ENVIRONMENT"), false);

    // D/E: usa developers.hotmart.com (host de produção), nunca sandbox.hotmart.com.
    assert.equal(productionCatalogSource.includes("https://developers.hotmart.com/products/api/v1/products"), true);
    assert.equal(productionCatalogSource.includes("sandbox.hotmart.com"), false);

    // G: nenhum secret/token/header é devolvido na resposta da rota.
    assert.equal(/access_token|client_secret|client_id|basicAuthorization|Authorization/i.test(productionRouteSource), false);
    assert.equal(productionRouteSource.includes("A credencial de produção da Hotmart não está configurada corretamente."), true);

    // I: ausência de credenciais de produção falha fechado, sem nenhuma chamada de rede.
    restoreHotmartProductionEnv();
    for (const name of hotmartProductionEnvNames) delete process.env[name];
    let productionCalls = 0;
    global.fetch = async () => { productionCalls += 1; throw new Error("unexpected fetch"); };
    hotmartProductionCatalog.resetHotmartProductionAccessTokenCache();
    await assert.rejects(() => hotmartProductionCatalog.listHotmartProductionProducts(), (error) => error.code === "not_configured");
    assert.equal(productionCalls, 0);

    // F: resposta contém somente name + ucode; H: 401 no OAuth de produção é sanitizado (unauthorized).
    configureHotmartProduction();
    global.fetch = async (input) => String(input).includes("oauth/token")
      ? new Response(null, { status: 401 })
      : new Response(JSON.stringify({ items: [] }), { status: 200 });
    hotmartProductionCatalog.resetHotmartProductionAccessTokenCache();
    await assert.rejects(() => hotmartProductionCatalog.listHotmartProductionProducts(), (error) => error.code === "unauthorized");

    configureHotmartProduction();
    const productionRequests = [];
    global.fetch = async (input) => {
      productionRequests.push(String(input));
      if (String(input).includes("oauth/token")) return new Response(JSON.stringify({ access_token: "mock-production-catalog", token_type: "bearer", expires_in: 3600 }), { status: 200 });
      return new Response(JSON.stringify({ items: [{ ucode: "REAL1234-BA4B-02E0-8C72-71CB71E13136", name: "Marketing Digital do Zero", price: 997, sales_page: "https://x" }], page_info: {} }), { status: 200 });
    };
    hotmartProductionCatalog.resetHotmartProductionAccessTokenCache();
    const productionList = await hotmartProductionCatalog.listHotmartProductionProducts();
    assert.deepEqual(productionList, [{ ucode: "real1234-ba4b-02e0-8c72-71cb71e13136", name: "Marketing Digital do Zero" }]);
    for (const product of productionList) assert.deepEqual(Object.keys(product).sort(), ["name", "ucode"]);
    assert.equal(productionRequests.some((url) => url.startsWith("https://developers.hotmart.com/products/api/v1/products")), true);
    assert.equal(productionRequests.every((url) => !url.startsWith("https://sandbox.hotmart.com")), true);

    // J: fluxo Sandbox existente continua funcionando sem interferência do token/cache de produção.
    configureHotmart("sandbox");
    const sandboxAfterProductionRequests = [];
    global.fetch = async (input) => {
      sandboxAfterProductionRequests.push(String(input));
      if (String(input).includes("oauth/token")) return new Response(JSON.stringify({ access_token: "mock-sandbox-after-production", token_type: "bearer", expires_in: 3600 }), { status: 200 });
      return new Response(JSON.stringify({ items: [{ ucode: "fb056612-bcc6-4217-9e6d-2a5d1110ac2f", name: "Produto test postback2" }], page_info: {} }), { status: 200 });
    };
    refund.resetHotmartAccessTokenCache();
    assert.deepEqual(
      await hotmartProducts.lookupHotmartProductByUcode("fb056612-bcc6-4217-9e6d-2a5d1110ac2f"),
      { ucode: "fb056612-bcc6-4217-9e6d-2a5d1110ac2f", name: "Produto test postback2" },
    );
    assert.equal(sandboxAfterProductionRequests.some((url) => url.startsWith("https://sandbox.hotmart.com/products/api/v1/products")), true);

    // --- lookup dividido por ambiente (Sandbox x Produção) ---

    const productionLookupRouteSource = fs.readFileSync("app/api/admin/hotmart/products/production/lookup/route.ts", "utf8");

    // C: lookup de produção usa somente HOTMART_PRODUCTION_* (via productionCatalog.ts) — nunca Sandbox.
    assert.equal(productionLookupRouteSource.includes('from "@/app/lib/server/hotmart/productionCatalog"'), true);
    assert.equal(productionLookupRouteSource.includes("lookupHotmartProductionProductByUcode"), true);
    assert.equal(productionLookupRouteSource.includes("HOTMART_BASIC_TOKEN"), false);
    assert.equal(/access_token|client_secret|client_id|basicAuthorization|Authorization/i.test(productionLookupRouteSource), false);

    // D: lookup Sandbox segue usando só a infra Sandbox — não referencia nada de produção.
    assert.equal(productLookupRouteSourceUcode.includes("productionCatalog"), false);
    assert.equal(productLookupRouteSourceUcode.includes("PRODUCTION"), false);

    // I: mensagens de erro por ambiente são distintas (produção não pode virar mensagem Sandbox).
    assert.equal(productionLookupRouteSource.includes("A credencial de produção da Hotmart não está configurada corretamente."), true);
    assert.equal(productLookupRouteSourceUcode.includes("A integração Hotmart não está configurada corretamente."), true);
    assert.notEqual(
      productionLookupRouteSource.includes("A integração Hotmart não está configurada corretamente."),
      true,
    );

    // J: nenhuma escrita — só GET à Hotmart (OAuth + catálogo) e só SELECT no Supabase, sem insert/update/delete.
    assert.equal(productionLookupRouteSource.includes(".insert("), false);
    assert.equal(productionLookupRouteSource.includes(".update("), false);
    assert.equal(productionLookupRouteSource.includes(".delete("), false);
    assert.equal(productionCatalogSource.includes('method: "PUT"'), false);
    assert.equal(productionCatalogSource.includes('method: "DELETE"'), false);

    // B/E: lookup de produção encontra produto real por UCODE, case-insensitive nos dois sentidos.
    configureHotmartProduction();
    global.fetch = async (input) => String(input).includes("oauth/token")
      ? new Response(JSON.stringify({ access_token: "mock-lookup-prod-1", token_type: "bearer", expires_in: 3600 }), { status: 200 })
      : new Response(JSON.stringify({ items: [{ ucode: "57912595-BA4B-02E0-8C72-71CB71E13136", name: "Marketing Digital do Zero" }], page_info: {} }), { status: 200 });
    hotmartProductionCatalog.resetHotmartProductionAccessTokenCache();
    assert.deepEqual(
      await hotmartProductionCatalog.lookupHotmartProductionProductByUcode("57912595-ba4b-02e0-8c72-71cb71e13136"),
      { ucode: "57912595-ba4b-02e0-8c72-71cb71e13136", name: "Marketing Digital do Zero" },
    );

    configureHotmartProduction();
    global.fetch = async (input) => String(input).includes("oauth/token")
      ? new Response(JSON.stringify({ access_token: "mock-lookup-prod-2", token_type: "bearer", expires_in: 3600 }), { status: 200 })
      : new Response(JSON.stringify({ items: [{ ucode: "57912595-ba4b-02e0-8c72-71cb71e13136", name: "Marketing Digital do Zero" }], page_info: {} }), { status: 200 });
    hotmartProductionCatalog.resetHotmartProductionAccessTokenCache();
    assert.deepEqual(
      await hotmartProductionCatalog.lookupHotmartProductionProductByUcode("57912595-BA4B-02E0-8C72-71CB71E13136"),
      { ucode: "57912595-ba4b-02e0-8c72-71cb71e13136", name: "Marketing Digital do Zero" },
    );

    // B: produto ausente no catálogo real → not_found (nunca confundido com not_configured).
    configureHotmartProduction();
    global.fetch = async (input) => String(input).includes("oauth/token")
      ? new Response(JSON.stringify({ access_token: "mock-lookup-prod-3", token_type: "bearer", expires_in: 3600 }), { status: 200 })
      : new Response(JSON.stringify({ items: [], page_info: {} }), { status: 200 });
    hotmartProductionCatalog.resetHotmartProductionAccessTokenCache();
    await assert.rejects(() => hotmartProductionCatalog.lookupHotmartProductionProductByUcode("57912595-ba4b-02e0-8c72-71cb71e13136"), (error) => error.code === "not_found");

    // A: lookup Sandbox continua funcionando após todo o uso do lookup de produção (sem contaminação de token/cache).
    configureHotmart("sandbox");
    global.fetch = async (input) => String(input).includes("oauth/token")
      ? new Response(JSON.stringify({ access_token: "mock-sandbox-lookup-final", token_type: "bearer", expires_in: 3600 }), { status: 200 })
      : new Response(JSON.stringify({ items: [{ ucode: "fb056612-bcc6-4217-9e6d-2a5d1110ac2f", name: "Produto test postback2" }], page_info: {} }), { status: 200 });
    refund.resetHotmartAccessTokenCache();
    assert.deepEqual(
      await hotmartProducts.lookupHotmartProductByUcode("fb056612-bcc6-4217-9e6d-2a5d1110ac2f"),
      { ucode: "fb056612-bcc6-4217-9e6d-2a5d1110ac2f", name: "Produto test postback2" },
    );

    // F/G: "Usar este produto" define a origem correta em cada listagem.
    assert.equal(pageClientSource.includes('fillProductFromCatalog(product, "production")'), true);
    assert.equal(pageClientSource.includes('fillProductFromCatalog(product, "sandbox")'), true);
    assert.equal(pageClientSource.includes('function fillProductFromCatalog(product: { name: string; ucode: string }, source: "sandbox" | "production")'), true);
    assert.equal(pageClientSource.includes("setProductSource(source)"), true);

    // H: o botão "Buscar produto" escolhe o endpoint conforme a origem selecionada.
    assert.equal(pageClientSource.includes('productSource === "production" ? "/api/admin/hotmart/products/production/lookup" : "/api/admin/hotmart/products/lookup"'), true);

    // Seletor de origem visível na UI (item 13).
    assert.equal(pageClientSource.includes("Origem do produto Hotmart"), true);
    assert.equal(pageClientSource.includes("Produção — meus produtos reais"), true);
    assert.equal(pageClientSource.includes("Sandbox — produtos fictícios de homologação"), true);

    // --- Card premium de Transações (Sprint redesign) ---

    // G: nome do produto ausente cai no fallback.
    assert.equal(pageClientSource.includes('item.product_name_snapshot || "Produto não identificado"'), true);
    // D/B: produto sem vínculo mostra "Produto não vinculado" / "Nenhum" / botão Vincular (gated por canLink).
    assert.equal(pageClientSource.includes("Produto não vinculado"), true);
    assert.equal(pageClientSource.includes("Destino: Nenhum"), true);
    assert.equal(pageClientSource.includes(`{canLink ? <PremiumButton variant="dark-primary" icon={<Link2 size={16} />} onClick={() => openMappingModal(item)}>Vincular</PremiumButton> : null}`), true);
    // C: condição FINAL de "Vincular" depende só do estado do mapping (linkState "unlinked"), nunca de processing_status.
    assert.equal(pageClientSource.includes('const canLink = linkState === "unlinked";'), true);
    assert.equal(pageClientSource.includes("canLink = item.processing_status"), false);
    // A: vinculado mostra tipo (Jornada padrão, Evento quando destination_type === "event") + nome do destino.
    assert.equal(pageClientSource.includes('activeMapping?.destination_type === "event" ? "Evento" : "Jornada"'), true);
    assert.equal(pageClientSource.includes('et-admin-dark-badge-success">Vinculado</span>'), true);
    assert.equal(pageClientSource.includes('linkState === "linked" ?'), true);
    // D: mapping ativo com destino não resolvido não finge "Vinculado" — mostra "Destino indisponível" distinto de mapping inativo.
    assert.equal(pageClientSource.includes('linkState === "destination_unavailable" ?'), true);
    assert.equal(pageClientSource.includes("Destino indisponível"), true);
    // C (mapping inexistente/inativo): mapping existente porém inativo é estado próprio, nunca tratado como vínculo operacional.
    assert.equal(pageClientSource.includes('linkState === "mapping_inactive" ?'), true);
    assert.equal(pageClientSource.includes("Vínculo inativo"), true);
    // linkState é derivado só do mapping — nunca mistura os 4 estados na mesma condição.
    assert.equal(pageClientSource.includes('activeMapping && destinationName ? "linked"'), true);
    assert.equal(pageClientSource.includes('activeMapping ? "destination_unavailable"'), true);
    assert.equal(pageClientSource.includes('anyMapping ? "mapping_inactive"'), true);
    // Simulado direto: não é um destination_type tratado — só "event" é distinguido, resto cai em "Jornada"; nenhuma opção Simulado no modal.
    assert.equal(pageClientSource.includes('"simulado"'), false);
    assert.equal(pageClientSource.includes("simulado_id"), false);
    assert.equal((pageClientSource.match(/options=\{\[\{ value: "jornada", label: "Jornada" \}, \{ value: "event", label: "Evento" \}\]\}/g) || []).length >= 2, true);
    // M: mapping é por UCODE do produto (não por transaction_code) — mesma classificação vale para toda transação desse UCODE.
    assert.equal(pageClientSource.includes("candidate.hotmart_product_ucode === item.hotmart_product_ucode && candidate.status"), true);
    assert.equal(pageClientSource.includes("candidate.transaction_code"), false);
    // I: "Vincular e reprocessar" só é oferecido quando o processing_status atual é elegível para reprocessamento
    // (mesma lista de app/lib/server/hotmart/processor.ts::HOTMART_COMMERCIAL_PROCESSING_ELIGIBLE); nunca automático.
    assert.equal(pageClientSource.includes("const HOTMART_REPROCESS_ELIGIBLE_STATUSES ="), true);
    assert.equal(pageClientSource.includes('"received", "pending_mapping", "pending_destination", "processing_error", "refund_reconciliation_required"'), true);
    assert.equal(pageClientSource.includes(`HOTMART_REPROCESS_ELIGIBLE_STATUSES.includes(mappingTarget.processing_status) ? <PremiumButton variant="dark-primary"`), true);
    // E: "Vincular" reaproveita o mesmo modal já usado em Pendências (openMappingModal/PremiumModal existentes); nenhuma lógica server-side nova.
    assert.equal(pageClientSource.includes("function openMappingModal(item: Transaction)"), true);
    assert.equal((pageClientSource.match(/openMappingModal\(item\)/g) || []).length, 1);
    assert.equal(pageClientSource.includes("async function savePendingMapping"), true);
    assert.equal((pageClientSource.match(/async function savePendingMapping/g) || []).length, 1);
    // F: "Copiar UCODE" do card reaproveita copyUcode/copiedUcode já usados em Produtos vinculados.
    assert.equal(pageClientSource.includes("onClick={() => void copyUcode(item.hotmart_product_ucode)}"), true);
    // H/I: comprador com/sem nome.
    assert.equal(pageClientSource.includes("{item.students?.name || item.buyer_email}"), true);
    assert.equal(pageClientSource.includes('{item.students?.name ? <p className="mt-1 text-xs text-slate-500">{item.buyer_email}</p> : null}'), true);
    // J-Q: situação da compra e situação EstudoTOP reaproveitam as funções de tradução já existentes (não duplicadas).
    assert.equal(pageClientSource.includes("purchaseStatusLabel(item.purchase_status)"), true);
    assert.equal(pageClientSource.includes("processingStatusLabel(item.processing_status, item.refund_request_state, item.processing_error_code)"), true);
    assert.equal((pageClientSource.match(/function purchaseStatusLabel/g) || []).length, 1);
    assert.equal((pageClientSource.match(/function processingStatusLabel/g) || []).length, 1);
    // T: datas de acesso só aparecem quando existem (sem inventar/forçar campo vazio).
    assert.equal(pageClientSource.includes("{accessStarted ? <p"), true);
    assert.equal(pageClientSource.includes("{accessExpires ? <p"), true);
    // U: responsividade — empilha em telas estreitas, duas colunas a partir de lg.
    assert.equal(pageClientSource.includes("flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between"), true);
    assert.equal(pageClientSource.includes("w-full space-y-5 lg:w-80 lg:flex-shrink-0"), true);
    // L: BRL não é mais presumido quando currency está ausente.
    assert.equal(pageClientSource.includes('currency: currency || "BRL"'), false);
    assert.equal(pageClientSource.includes("moeda não informada"), true);
    assert.equal(pageClientSource.includes("function formatPlainAmount("), true);

    // --- Salvar vínculo (POST /api/admin/hotmart) — rota executada com requireAdmin/Supabase stubados ---
    // Causa do "Salvar vínculo" sem efeito: o POST revalidava todo produto com HOTMART_CLIENT_* /
    // HOTMART_ENVIRONMENT, inclusive o escolhido no catálogo Produção (HOTMART_PRODUCTION_*), e a
    // resposta só aparecia no banner do topo da página. Agora a revalidação segue a origem.
    const mappingState = { existing: false, destinationFound: true, inserted: [] };
    cache.set(path.resolve("lib/server/authGuard.ts"), { exports: { requireAdmin: async () => ({ id: "admin-unit" }) } });
    cache.set(path.resolve("lib/server/supabaseAdmin.ts"), { exports: { createSupabaseAdminClient: () => ({
      from(table) {
        const builder = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: async () => table === "hotmart_product_mappings"
            ? { data: mappingState.existing ? { id: "mapping-existing" } : null, error: null }
            : { data: mappingState.destinationFound ? { id: "jornada-1" } : null, error: null },
          insert: (row) => { mappingState.inserted.push(row); return { select: () => ({ single: async () => ({ data: { id: "mapping-new" }, error: null }) }) }; },
        };
        return builder;
      },
    }) } });
    const hotmartAdminRoute = loadTypeScript("app/api/admin/hotmart/route.ts");
    const postMapping = (body) => hotmartAdminRoute.POST(new Request("http://localhost/api/admin/hotmart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    const realUcode = "57912595-ba4b-02e0-8c72-71cb71e13136";
    const mappingBody = { hotmart_product_ucode: realUcode, hotmart_product_name: "Marketing Digital do Zero", hotmart_product_id: "", destination_type: "jornada", destination_id: "jornada-1", verify_product_with_hotmart: true };

    // A/F/M: produto do catálogo Produção é revalidado só com HOTMART_PRODUCTION_*, nunca com HOTMART_CLIENT_*.
    configureHotmart("sandbox");
    configureHotmartProduction();
    const productionMappingRequests = [];
    global.fetch = async (input, init) => {
      productionMappingRequests.push({ url: String(input), init });
      return String(input).includes("oauth/token")
        ? new Response(JSON.stringify({ access_token: "mock-mapping-prod", token_type: "bearer", expires_in: 3600 }), { status: 200 })
        : new Response(JSON.stringify({ items: [{ ucode: realUcode, name: "Marketing Digital do Zero" }], page_info: {} }), { status: 200 });
    };
    refund.resetHotmartAccessTokenCache();
    hotmartProductionCatalog.resetHotmartProductionAccessTokenCache();
    let mappingResponse = await postMapping({ ...mappingBody, product_source: "production" });
    let mappingJson = await mappingResponse.json();
    assert.equal(mappingResponse.status, 201);
    assert.equal(mappingJson.ok, true);
    assert.equal(mappingState.inserted.length, 1);
    assert.deepEqual(
      { ucode: mappingState.inserted[0].hotmart_product_ucode, name: mappingState.inserted[0].hotmart_product_name, type: mappingState.inserted[0].destination_type, jornada: mappingState.inserted[0].jornada_id, event: mappingState.inserted[0].event_id, status: mappingState.inserted[0].status },
      { ucode: realUcode, name: "Marketing Digital do Zero", type: "jornada", jornada: "jornada-1", event: null, status: "active" },
    );
    assert.equal(productionMappingRequests[0].init.headers.Authorization, "Basic prod-basic-token");
    assert.equal(productionMappingRequests.some((request) => request.url.includes("client_id=test-client-id") || request.url.startsWith("https://sandbox.hotmart.com")), false);
    assert.equal(productionMappingRequests.some((request) => request.url.startsWith("https://developers.hotmart.com/products/api/v1/products")), true);

    // E/M: sem product_source (ou sandbox), a revalidação continua com a infra Sandbox, sem tocar HOTMART_PRODUCTION_*.
    const sandboxMappingRequests = [];
    global.fetch = async (input, init) => {
      sandboxMappingRequests.push({ url: String(input), init });
      return String(input).includes("oauth/token")
        ? new Response(JSON.stringify({ access_token: "mock-mapping-sandbox", token_type: "bearer", expires_in: 3600 }), { status: 200 })
        : new Response(JSON.stringify({ items: [{ ucode: "fb056612-bcc6-4217-9e6d-2a5d1110ac2f", name: "Produto test postback2" }], page_info: {} }), { status: 200 });
    };
    refund.resetHotmartAccessTokenCache();
    hotmartProductionCatalog.resetHotmartProductionAccessTokenCache();
    mappingResponse = await postMapping({ ...mappingBody, hotmart_product_ucode: "fb056612-bcc6-4217-9e6d-2a5d1110ac2f" });
    assert.equal(mappingResponse.status, 201);
    assert.equal(mappingState.inserted[1].hotmart_product_name, "Produto test postback2");
    assert.equal(sandboxMappingRequests[0].init.headers.Authorization, "Basic test-basic-token");
    assert.equal(sandboxMappingRequests.some((request) => request.url.includes("prod-client-id")), false);
    assert.equal(sandboxMappingRequests.some((request) => request.url.startsWith("https://sandbox.hotmart.com/products/api/v1/products")), true);

    // B: erros da API chegam com mensagem específica e status correto (o painel exibe json.message).
    global.fetch = async (input) => String(input).includes("oauth/token")
      ? new Response(JSON.stringify({ access_token: "mock-mapping-prod-404", token_type: "bearer", expires_in: 3600 }), { status: 200 })
      : new Response(JSON.stringify({ items: [], page_info: {} }), { status: 200 });
    hotmartProductionCatalog.resetHotmartProductionAccessTokenCache();
    mappingResponse = await postMapping({ ...mappingBody, product_source: "production" });
    assert.equal(mappingResponse.status, 404);
    assert.equal((await mappingResponse.json()).message, "Produto não encontrado no catálogo de produção da Hotmart.");
    restoreHotmartProductionEnv();
    hotmartProductionCatalog.resetHotmartProductionAccessTokenCache();
    mappingResponse = await postMapping({ ...mappingBody, product_source: "production" });
    assert.equal(mappingResponse.status, 503);
    assert.equal((await mappingResponse.json()).message, "A credencial de produção da Hotmart não está configurada corretamente.");
    configureHotmartProduction();
    // Duplicidade: regra existente preservada (409, nenhuma inserção nova, nenhuma chamada à Hotmart).
    mappingState.existing = true;
    let duplicateFetchCalls = 0;
    global.fetch = async () => { duplicateFetchCalls += 1; throw new Error("unexpected fetch"); };
    const insertedBeforeDuplicate = mappingState.inserted.length;
    mappingResponse = await postMapping({ ...mappingBody, product_source: "production" });
    assert.equal(mappingResponse.status, 409);
    assert.equal((await mappingResponse.json()).message, "Este produto já possui um vínculo.");
    assert.equal(mappingState.inserted.length, insertedBeforeDuplicate);
    assert.equal(duplicateFetchCalls, 0);
    mappingState.existing = false;
    // Destino inválido.
    mappingState.destinationFound = false;
    mappingResponse = await postMapping({ ...mappingBody, verify_product_with_hotmart: false });
    assert.equal(mappingResponse.status, 404);
    assert.equal((await mappingResponse.json()).message, "Destino não encontrado.");
    mappingState.destinationFound = true;
    mappingResponse = await postMapping({ ...mappingBody, destination_id: "" });
    assert.equal(mappingResponse.status, 400);
    cache.delete(path.resolve("lib/server/authGuard.ts"));
    cache.delete(path.resolve("lib/server/supabaseAdmin.ts"));
    cache.delete(path.resolve("app/api/admin/hotmart/route.ts"));

    // A/B/C/D: contrato do painel — origem enviada, guard contra POST concorrente, loading, feedback e lista.
    const createMappingSource = pageClientSource.slice(pageClientSource.indexOf("async function createMapping()"), pageClientSource.indexOf("async function lookupProduct()"));
    assert.equal(createMappingSource.includes("body: JSON.stringify({ ...form, product_source: productSource, verify_product_with_hotmart: true })"), true);
    assert.equal(createMappingSource.indexOf("if (savingMappingRef.current) return;") < createMappingSource.indexOf("savingMappingRef.current = true;"), true);
    assert.equal(createMappingSource.indexOf("savingMappingRef.current = true;") < createMappingSource.indexOf("adminFetch("), true);
    assert.equal(createMappingSource.includes("finally {\n      savingMappingRef.current = false;\n      setSavingMapping(false);"), true);
    assert.equal(createMappingSource.includes("await response.json().catch(() => null)"), true);
    assert.equal(createMappingSource.includes("json?.message ||"), true);
    assert.equal(createMappingSource.includes("Sua sessão expirou. Entre novamente para salvar o vínculo."), true);
    assert.equal(createMappingSource.includes('"Selecione a Jornada de destino."'), true);
    assert.equal(createMappingSource.includes('setMappingFeedback({ tone: "success", text: "Produto vinculado com sucesso." });'), true);
    assert.equal(createMappingSource.includes("await load(true);"), true);
    assert.equal(createMappingSource.includes("setMessage("), false, "O feedback do vínculo não pode depender do banner do topo da página.");
    assert.equal(pageClientSource.includes('disabled={savingMapping || lookingUpProduct} onClick={() => void createMapping()}>{savingMapping ? "Salvando..." : "Salvar vínculo"}'), true);
    assert.equal(pageClientSource.includes('role={mappingFeedback.tone === "error" ? "alert" : "status"}'), true);
    assert.equal(pageClientSource.includes("if (!silent) setLoading(true);"), true);

    // G/K/L: modal do catálogo — abre pelo botão, acessível, fecha por X, Fechar, Escape e backdrop.
    assert.equal(pageClientSource.includes('onClick={openSandboxCatalog}>{loadingSandboxProducts ? "Buscando produtos..." : "Listar produtos Sandbox"}'), true);
    assert.equal(pageClientSource.includes('onClick={openProductionCatalog}>{loadingProductionProducts ? "Buscando produtos..." : "Listar meus produtos Hotmart"}'), true);
    assert.equal(pageClientSource.includes('role="dialog" aria-modal="true" aria-labelledby={titleId}'), true);
    assert.equal(pageClientSource.includes('{isProduction ? "Meus produtos Hotmart" : "Produtos Hotmart — Sandbox"}'), true);
    assert.equal(pageClientSource.includes('aria-label="Fechar catálogo"'), true);
    assert.equal(pageClientSource.includes('<PremiumButton variant="dark" onClick={onClose}>Fechar</PremiumButton>'), true);
    assert.equal(pageClientSource.includes('if (event.key === "Escape") onClose();'), true);
    assert.equal(pageClientSource.includes("if (event.target === event.currentTarget) onClose();"), true);
    assert.equal(pageClientSource.includes('document.body.style.overflow = "hidden";'), true);
    assert.equal(pageClientSource.includes("max-h-[calc(100dvh-2rem)]"), true);
    assert.equal(pageClientSource.includes("min-h-0 flex-1 overflow-y-auto"), true);
    // Catálogo não fica mais renderizado em linha na página.
    assert.equal(pageClientSource.includes("{sandboxProducts.map("), false);
    assert.equal(pageClientSource.includes("{productionProducts.map("), false);
    // J: "Usar este produto" preenche e fecha o modal, sem salvar vínculo automaticamente.
    const fillSource = pageClientSource.slice(pageClientSource.indexOf("function fillProductFromCatalog("), pageClientSource.indexOf("const closeCatalog"));
    assert.equal(fillSource.includes("hotmart_product_ucode: product.ucode, hotmart_product_name: product.name"), true);
    assert.equal(fillSource.includes("setCatalogSource(null);"), true);
    assert.equal(fillSource.includes("createMapping"), false);
    assert.equal(fillSource.includes("adminFetch"), false);
    // M: cada modal recebe somente o estado da própria origem.
    assert.equal(pageClientSource.includes('<HotmartCatalogModal source="sandbox" products={sandboxProducts} loading={loadingSandboxProducts} error={sandboxProductsError}'), true);
    assert.equal(pageClientSource.includes('<HotmartCatalogModal source="production" products={productionProducts} loading={loadingProductionProducts} error={productionProductsError}'), true);

    // H/I: busca local por nome (espelho exato de normalizeCatalogSearch + filtro do modal).
    function normalizeCatalogSearchMirror(value) {
      return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
    }
    assert.equal(pageClientSource.includes('return value.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").replace(/\\s+/g, " ").trim().toLowerCase();'), true);
    assert.equal(pageClientSource.includes("(products || []).filter((product) => !term || normalizeCatalogSearch(product.name).includes(term) || product.ucode.toLowerCase().includes(term))"), true);
    assert.equal(pageClientSource.includes("Nenhum produto encontrado para esta busca."), true);
    const catalogFixture = [{ name: "Marketing Digital do Zero", ucode: realUcode }, { name: "Jornada PCMG — Informática", ucode: "fb056612-bcc6-4217-9e6d-2a5d1110ac2f" }];
    const filterCatalogMirror = (search) => {
      const term = normalizeCatalogSearchMirror(search);
      return catalogFixture.filter((product) => !term || normalizeCatalogSearchMirror(product.name).includes(term) || product.ucode.toLowerCase().includes(term)).map((product) => product.name);
    };
    assert.deepEqual(filterCatalogMirror(""), ["Marketing Digital do Zero", "Jornada PCMG — Informática"]);
    assert.deepEqual(filterCatalogMirror("  MARKETING   digital "), ["Marketing Digital do Zero"]);
    assert.deepEqual(filterCatalogMirror("informatica"), ["Jornada PCMG — Informática"]);
    assert.deepEqual(filterCatalogMirror("FB056612"), ["Jornada PCMG — Informática"]);
    assert.deepEqual(filterCatalogMirror("produto inexistente"), []);

    // --- Reconciliação de compradores históricos (Sales API real, somente HOTMART_PRODUCTION_*) ---
    const { NextResponse } = require("next/server");
    const DAY = 86_400_000;
    const nowMs = Date.now();
    const PRODUCT_ID = 1234567;
    const PRODUCT_UCODE = "57912595-ba4b-02e0-8c72-71cb71e13136";
    const saleItem = ({ transaction, status = "APPROVED", email, name = "Comprador", approvedDaysAgo = 10, productId = PRODUCT_ID }) => ({
      product: { id: productId, name: "Marketing Digital do Zero" },
      buyer: { name, email, ucode: "BUYER-UCODE" },
      purchase: { transaction, status, approved_date: nowMs - approvedDaysAgo * DAY, order_date: nowMs - approvedDaysAgo * DAY, price: { value: 97, currency_code: "BRL" }, payment: { type: "PIX", installments_number: 1 } },
    });
    const oauthResponse = (token) => new Response(JSON.stringify({ access_token: token, token_type: "bearer", expires_in: 3600 }), { status: 200 });

    // Paginação: percorre todas as páginas por next_page_token, com janela de datas explícita.
    configureHotmartProduction();
    hotmartProductionCatalog.resetHotmartProductionAccessTokenCache();
    const salesRequests = [];
    global.fetch = async (input, init) => {
      const url = new URL(String(input));
      salesRequests.push({ url, init });
      if (url.pathname.includes("oauth/token")) return oauthResponse("mock-sales-1");
      const token = url.searchParams.get("page_token");
      const pages = { "": { items: [saleItem({ transaction: "HP0001", email: "a@x.com" })], page_info: { next_page_token: "T2" } }, T2: { items: [saleItem({ transaction: "HP0002", email: "b@x.com" })], page_info: { next_page_token: "T3" } }, T3: { items: [saleItem({ transaction: "HP0003", email: "C@X.COM" }), saleItem({ transaction: "HP0001", email: "a@x.com" })], page_info: {} } };
      return new Response(JSON.stringify(pages[token || ""]), { status: 200 });
    };
    const pagedSales = await hotmartProductionCatalog.listHotmartProductionSales({ productId: PRODUCT_ID, now: nowMs });
    assert.deepEqual(pagedSales.map((sale) => sale.transaction), ["HP0001", "HP0002", "HP0003"], "todas as páginas, sem duplicar transação repetida");
    assert.equal(pagedSales[2].buyerEmail, "c@x.com");
    assert.equal(pagedSales[0].approvedAt, new Date(nowMs - 10 * DAY).toISOString());
    const historyRequests = salesRequests.filter((request) => request.url.pathname === "/payments/api/v1/sales/history");
    assert.equal(historyRequests.length, 3);
    assert.equal(historyRequests.every((request) => request.url.origin === "https://developers.hotmart.com" && request.url.searchParams.get("product_id") === String(PRODUCT_ID)), true);
    assert.equal(historyRequests.every((request) => request.url.searchParams.get("start_date") === String(hotmartProductionCatalog.HOTMART_SALES_HISTORY_START) && request.url.searchParams.get("end_date") === String(nowMs)), true);
    assert.deepEqual(historyRequests.map((request) => request.url.searchParams.get("page_token")), [null, "T2", "T3"]);
    assert.equal(salesRequests[0].init.headers.Authorization, "Basic prod-basic-token");
    assert.equal(salesRequests.some((request) => String(request.url).includes("sandbox.hotmart.com") || String(request.url).includes("test-client-id")), false);
    // Erro intermediário: falha na 2ª página interrompe tudo (nunca devolve lista parcial).
    global.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname.includes("oauth/token")) return oauthResponse("mock-sales-2");
      return url.searchParams.get("page_token") ? new Response("{}", { status: 500 }) : new Response(JSON.stringify({ items: [saleItem({ transaction: "HP0001", email: "a@x.com" })], page_info: { next_page_token: "T2" } }), { status: 200 });
    };
    hotmartProductionCatalog.resetHotmartProductionAccessTokenCache();
    await assert.rejects(() => hotmartProductionCatalog.listHotmartProductionSales({ productId: PRODUCT_ID, retryDelayMs: 0 }), (error) => error.code === "remote_unavailable" && error.details.status === 500 && error.details.page === 1 && error.details.phase === "sales_request");

    // Correção 15/10/2026: cada falha remota preserva etapa + status HTTP (antes tudo virava "unavailable" sem log).
    const salesWith = (handler) => {
      const calls = [];
      global.fetch = async (input, init) => {
        const url = new URL(String(input));
        if (url.pathname.includes("oauth/token")) return oauthResponse("mock-sales-status");
        calls.push({ url, init });
        return handler(calls.length, url);
      };
      hotmartProductionCatalog.resetHotmartProductionAccessTokenCache();
      return calls;
    };
    for (const [status, code] of [[403, "unauthorized"], [404, "remote_rejected"], [400, "remote_rejected"], [422, "remote_rejected"]]) {
      const calls = salesWith(() => new Response("{}", { status }));
      await assert.rejects(() => hotmartProductionCatalog.listHotmartProductionSales({ productId: PRODUCT_ID, retryDelayMs: 0 }), (error) => error.code === code && error.details.status === status, "HTTP " + status);
      assert.equal(calls.length, 1, "HTTP " + status + " não é repetido");
    }
    // 401 persistente: renova o token uma vez e então falha como credencial.
    let statusCalls = salesWith(() => new Response("{}", { status: 401 }));
    await assert.rejects(() => hotmartProductionCatalog.listHotmartProductionSales({ productId: PRODUCT_ID, retryDelayMs: 0 }), (error) => error.code === "unauthorized" && error.details.status === 401);
    assert.equal(statusCalls.length, 2);
    // 429 e 5xx: uma nova tentativa; se persistir, erro específico.
    statusCalls = salesWith(() => new Response("{}", { status: 429 }));
    await assert.rejects(() => hotmartProductionCatalog.listHotmartProductionSales({ productId: PRODUCT_ID, retryDelayMs: 0 }), (error) => error.code === "rate_limited" && error.details.status === 429);
    assert.equal(statusCalls.length, 2);
    statusCalls = salesWith((count) => count === 1 ? new Response("{}", { status: 503 }) : new Response(JSON.stringify({ items: [saleItem({ transaction: "HPRETRY", email: "retry@x.com" })], page_info: {} }), { status: 200 }));
    assert.deepEqual((await hotmartProductionCatalog.listHotmartProductionSales({ productId: PRODUCT_ID, retryDelayMs: 0 })).map((sale) => sale.transaction), ["HPRETRY"]);
    assert.equal(statusCalls.length, 2);
    // Corpo vazio (200/204) = nenhuma venda; JSON inválido ou items fora do formato = invalid_response.
    salesWith(() => new Response(null, { status: 204 }));
    assert.deepEqual(await hotmartProductionCatalog.listHotmartProductionSales({ productId: PRODUCT_ID, retryDelayMs: 0 }), []);
    salesWith(() => new Response("", { status: 200 }));
    assert.deepEqual(await hotmartProductionCatalog.listHotmartProductionSales({ productId: PRODUCT_ID, retryDelayMs: 0 }), []);
    salesWith(() => new Response("<html>gateway</html>", { status: 200 }));
    await assert.rejects(() => hotmartProductionCatalog.listHotmartProductionSales({ productId: PRODUCT_ID, retryDelayMs: 0 }), (error) => error.code === "invalid_response" && error.details.phase === "parsing");
    salesWith(() => new Response(JSON.stringify({ items: { unexpected: true } }), { status: 200 }));
    await assert.rejects(() => hotmartProductionCatalog.listHotmartProductionSales({ productId: PRODUCT_ID, retryDelayMs: 0 }), (error) => error.code === "invalid_response");
    statusCalls = salesWith(() => new Response(JSON.stringify({ items: [null, { purchase: {} }, saleItem({ transaction: "HPOK", email: "ok@x.com" })], page_info: {} }), { status: 200 }));
    assert.deepEqual((await hotmartProductionCatalog.listHotmartProductionSales({ productId: PRODUCT_ID, retryDelayMs: 0 })).map((sale) => sale.transaction), ["HPOK"], "itens nulos ou sem transação são ignorados");
    assert.equal(statusCalls[0].init.headers["Content-Type"], "application/json", "mesmo cabeçalho do exemplo oficial");
    assert.equal(statusCalls[0].url.searchParams.get("product_id"), String(PRODUCT_ID), "product_id numérico, nunca o UCODE");
    assert.equal(/[a-f0-9]{8}-/.test(statusCalls[0].url.searchParams.get("product_id")), false);
    // Falha de OAuth de produção é identificada na etapa oauth.
    global.fetch = async () => new Response("{}", { status: 401 });
    hotmartProductionCatalog.resetHotmartProductionAccessTokenCache();
    await assert.rejects(() => hotmartProductionCatalog.listHotmartProductionSales({ productId: PRODUCT_ID, retryDelayMs: 0 }), (error) => error.code === "unauthorized" && error.details.phase === "oauth");
    // Proteção contra loop: token repetido.
    global.fetch = async (input) => String(input).includes("oauth/token") ? oauthResponse("mock-sales-3") : new Response(JSON.stringify({ items: [], page_info: { next_page_token: "SAME" } }), { status: 200 });
    hotmartProductionCatalog.resetHotmartProductionAccessTokenCache();
    await assert.rejects(() => hotmartProductionCatalog.listHotmartProductionSales({ productId: PRODUCT_ID }), (error) => error.code === "pagination_loop");
    // Limite de páginas: tokens sempre novos param no limite defensivo.
    let endlessPage = 0;
    global.fetch = async (input) => String(input).includes("oauth/token") ? oauthResponse("mock-sales-4") : new Response(JSON.stringify({ items: [], page_info: { next_page_token: `N${++endlessPage}` } }), { status: 200 });
    hotmartProductionCatalog.resetHotmartProductionAccessTokenCache();
    await assert.rejects(() => hotmartProductionCatalog.listHotmartProductionSales({ productId: PRODUCT_ID }), (error) => error.code === "pagination_limit");
    assert.equal(endlessPage, hotmartProductionCatalog.HOTMART_SALES_MAX_PAGES);
    // Revalidação por transação: sem janela de datas, com o código informado.
    let transactionLookupUrl = null;
    global.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname.includes("oauth/token")) return oauthResponse("mock-sales-5");
      transactionLookupUrl = url;
      return new Response(JSON.stringify({ items: [saleItem({ transaction: "HP0009", status: "REFUNDED", email: "z@x.com" })], page_info: {} }), { status: 200 });
    };
    hotmartProductionCatalog.resetHotmartProductionAccessTokenCache();
    const singleSale = await hotmartProductionCatalog.listHotmartProductionSales({ productId: PRODUCT_ID, transaction: "HP0009" });
    assert.equal(singleSale[0].status, "REFUNDED");
    assert.equal(transactionLookupUrl.searchParams.get("transaction"), "HP0009");
    assert.equal(transactionLookupUrl.searchParams.get("start_date"), null);
    // UCODE → product_id numérico vem do catálogo de produção; lookup antigo continua devolvendo só {ucode,name}.
    global.fetch = async (input) => String(input).includes("oauth/token") ? oauthResponse("mock-sales-6") : new Response(JSON.stringify({ items: [{ ucode: PRODUCT_UCODE.toUpperCase(), name: "Marketing Digital do Zero", id: PRODUCT_ID }], page_info: {} }), { status: 200 });
    hotmartProductionCatalog.resetHotmartProductionAccessTokenCache();
    assert.deepEqual(await hotmartProductionCatalog.findHotmartProductionProduct(PRODUCT_UCODE), { ucode: PRODUCT_UCODE, name: "Marketing Digital do Zero", id: PRODUCT_ID });
    assert.deepEqual(await hotmartProductionCatalog.lookupHotmartProductionProductByUcode(PRODUCT_UCODE), { ucode: PRODUCT_UCODE, name: "Marketing Digital do Zero" });
    const salesCatalogSource = fs.readFileSync("app/lib/server/hotmart/productionCatalog.ts", "utf8");
    assert.equal(salesCatalogSource.includes("https://developers.hotmart.com/payments/api/v1/sales/history"), true);
    assert.equal(/HOTMART_CLIENT_ID|HOTMART_HOTTOK|sandbox\.hotmart/.test(salesCatalogSource), false);

    // Banco em memória (somente o subconjunto do PostgREST usado pela reconciliação).
    function createMemorySupabase(seed) {
      const db = seed;
      let sequence = 0;
      function from(table) {
        db[table] = db[table] || [];
        const filters = [];
        let mode = "select";
        let payload = null;
        const run = () => {
          if (mode === "insert") return payload;
          const rows = db[table].filter((row) => filters.every((filter) => filter(row)));
          if (mode === "update") rows.forEach((row) => Object.assign(row, payload));
          return rows;
        };
        const builder = {
          select: () => builder,
          eq: (column, value) => { filters.push((row) => row[column] === value); return builder; },
          in: (column, values) => { filters.push((row) => values.includes(row[column])); return builder; },
          ilike: (column, value) => { filters.push((row) => String(row[column] || "").toLowerCase() === String(value).toLowerCase()); return builder; },
          or: (expression) => { const values = [...expression.matchAll(/email\.ilike\."([^"]*)"/g)].map((match) => match[1].toLowerCase()); filters.push((row) => values.includes(String(row.email || "").toLowerCase())); return builder; },
          is: (column, value) => { filters.push((row) => (row[column] ?? null) === value); return builder; },
          order: () => builder,
          limit: () => builder,
          insert: (rows) => { mode = "insert"; payload = (Array.isArray(rows) ? rows : [rows]).map((row) => ({ id: `${table}-${++sequence}`, ...row })); db[table].push(...payload); return builder; },
          update: (values) => { mode = "update"; payload = values; return builder; },
          maybeSingle: async () => ({ data: run()[0] || null, error: null }),
          single: async () => { const rows = run(); return { data: rows[0] || null, error: rows[0] ? null : { message: "not found" } }; },
          then: (resolve, reject) => Promise.resolve({ data: run(), error: null }).then(resolve, reject),
        };
        return builder;
      }
      return { from, rpc: async () => ({ data: null, error: null }), db };
    }

    let memory = createMemorySupabase({});
    let currentAdmin = { id: "admin-unit", email: "admin@example.invalid" };
    cache.set(path.resolve("lib/server/supabaseAdmin.ts"), { exports: { createSupabaseAdminClient: () => memory } });
    cache.set(path.resolve("lib/server/authGuard.ts"), { exports: { requireAdmin: async () => currentAdmin || NextResponse.json({ ok: false, message: "Não autorizado." }, { status: 401 }) } });
    for (const modulePath of ["app/lib/server/hotmart/buyerReconciliation.ts", "app/api/admin/hotmart/mappings/[id]/buyers/route.ts", "app/api/admin/hotmart/mappings/[id]/buyers/import/route.ts"]) cache.delete(path.resolve(modulePath));
    const reconciliation = loadTypeScript("app/lib/server/hotmart/buyerReconciliation.ts");
    const buyersRoute = loadTypeScript("app/api/admin/hotmart/mappings/[id]/buyers/route.ts");
    const buyersImportRoute = loadTypeScript("app/api/admin/hotmart/mappings/[id]/buyers/import/route.ts");

    const MAPPING = { id: "mapping-1", hotmart_product_ucode: PRODUCT_UCODE, hotmart_product_name: "Marketing Digital do Zero", destination_type: "jornada", jornada_id: "jornada-1", event_id: null, status: "active" };
    const seedDatabase = () => ({
      hotmart_product_mappings: [{ ...MAPPING }],
      jornadas: [{ id: "jornada-1", title: "Jornada PCMG", status: "published", duration_days: 90, duration_months: null }],
      students: [
        { id: "st-enrolled", email: "enrolled@x.com", status: "active" },
        { id: "st-existing", email: "existing@x.com", status: "active" },
        { id: "st-dup-1", email: "dup@x.com", status: "active" },
        { id: "st-dup-2", email: "DUP@x.com", status: "active" },
        { id: "st-other", email: "outro@x.com", status: "active" },
      ],
      student_jornadas: [{ id: "sj-1", student_id: "st-enrolled", jornada_id: "jornada-1", status: "active", started_at: "2026-01-10", expires_at: "2026-04-10", access_origin: "manual" }],
      hotmart_transactions: [
        { id: "tx-linked", transaction_code: "HPLINKED", hotmart_product_ucode: PRODUCT_UCODE, student_id: null, processing_status: "processed", refund_status: null, refund_request_state: null, possible_duplicate_student_id: null, resolved_at: null },
        { id: "tx-pending", transaction_code: "HPPENDING", hotmart_product_ucode: PRODUCT_UCODE, student_id: null, processing_status: "pending_mapping", refund_status: null, refund_request_state: null, possible_duplicate_student_id: null, resolved_at: null },
        { id: "tx-refund", transaction_code: "HPREFUND", hotmart_product_ucode: PRODUCT_UCODE, student_id: null, processing_status: "blocked_financial", refund_status: "confirmed", refund_request_state: "confirmed", possible_duplicate_student_id: null, resolved_at: null },
        { id: "tx-otherprod", transaction_code: "HPOTHERPROD", hotmart_product_ucode: "fb056612-bcc6-4217-9e6d-2a5d1110ac2f", student_id: null, processing_status: "processed", refund_status: null, refund_request_state: null, possible_duplicate_student_id: null, resolved_at: null },
        { id: "tx-mismatch", transaction_code: "HPMISMATCH", hotmart_product_ucode: PRODUCT_UCODE, student_id: "st-other", processing_status: "pending_mapping", refund_status: null, refund_request_state: null, possible_duplicate_student_id: null, resolved_at: null },
        { id: "tx-possibledup", transaction_code: "HPPOSSIBLEDUP", hotmart_product_ucode: PRODUCT_UCODE, student_id: null, processing_status: "pending_mapping", refund_status: null, refund_request_state: null, possible_duplicate_student_id: "st-other", resolved_at: null },
      ],
      hotmart_access_links: [{ id: "link-1", hotmart_transaction_id: "tx-linked", student_id: "st-other" }],
      hotmart_history: [],
      student_jornada_simulados: [{ id: "sjs-1", student_jornada_id: "sj-1", status: "available" }],
      simulado_attempts: [{ id: "attempt-1", student_id: "st-enrolled" }],
    });
    const parse = (item) => hotmartProductionCatalog.parseHotmartProductionSale(item);
    const fixtureSales = [
      parse(saleItem({ transaction: "HPNEW", email: "novo@x.com", name: "Aluno Novo" })),
      parse(saleItem({ transaction: "HPEXISTING", status: "COMPLETE", email: "EXISTING@x.com" })),
      parse(saleItem({ transaction: "HPENROLLED", email: "enrolled@x.com" })),
      parse(saleItem({ transaction: "HPLINKED", email: "linked@x.com" })),
      parse(saleItem({ transaction: "HPPENDING", email: "pending@x.com" })),
      parse(saleItem({ transaction: "HPREFUND", email: "refund@x.com" })),
      parse(saleItem({ transaction: "HPSTATUS", status: "REFUNDED", email: "status@x.com" })),
      parse(saleItem({ transaction: "HPOTHERPROD", email: "otherprod@x.com" })),
      parse(saleItem({ transaction: "HPMISMATCH", email: "mismatch@x.com" })),
      parse(saleItem({ transaction: "HPPOSSIBLEDUP", email: "possibledup@x.com" })),
      parse(saleItem({ transaction: "HPDUPACCOUNTS", email: "dup@x.com" })),
      parse(saleItem({ transaction: "HPEXPIRED", email: "expired@x.com", approvedDaysAgo: 400 })),
      parse(saleItem({ transaction: "HPREPEAT-OLD", email: "repeat@x.com", approvedDaysAgo: 30 })),
      parse(saleItem({ transaction: "HPREPEAT-NEW", email: "repeat@x.com", approvedDaysAgo: 5 })),
      parse(saleItem({ transaction: "HPNOMAIL", email: null })),
    ];

    // Elegibilidade + classificação.
    assert.deepEqual(reconciliation.HOTMART_RECONCILIATION_ELIGIBLE_STATUSES, ["APPROVED", "COMPLETE"]);
    memory = createMemorySupabase(seedDatabase());
    const context = await reconciliation.loadHotmartReconciliationContext(memory, { ...MAPPING }, fixtureSales);
    const classified = Object.fromEntries(reconciliation.classifyHotmartSales(fixtureSales, context, new Date(nowMs)).map((row) => [row.transaction, row]));
    const categoryOf = (code) => classified[code].category;
    assert.equal(categoryOf("HPNEW"), "ready");
    assert.equal(classified.HPNEW.situation, "Pronto para inserir (nova conta)");
    assert.equal(classified.HPNEW.access_start, new Date(nowMs - 10 * DAY).toISOString(), "acesso começa na data ORIGINAL da compra");
    assert.equal(classified.HPNEW.access_end, new Date(nowMs + 80 * DAY).toISOString());
    assert.equal(categoryOf("HPEXISTING"), "ready", "COMPLETE é elegível e e-mail casa sem diferenciar maiúsculas");
    assert.equal(classified.HPEXISTING.situation, "Pronto para inserir (conta existente)");
    assert.equal(categoryOf("HPENROLLED"), "already_inserted");
    assert.equal(categoryOf("HPLINKED"), "already_inserted");
    assert.equal(categoryOf("HPPENDING"), "ready", "transação já registrada sem acesso é recuperável");
    assert.equal(classified.HPPENDING.transaction_registered, true);
    assert.equal(categoryOf("HPREFUND"), "not_eligible");
    assert.equal(categoryOf("HPSTATUS"), "not_eligible");
    for (const code of ["HPOTHERPROD", "HPMISMATCH", "HPPOSSIBLEDUP", "HPDUPACCOUNTS", "HPNOMAIL"]) assert.equal(categoryOf(code), "review", `${code} exige revisão`);
    assert.equal(categoryOf("HPEXPIRED"), "expired");
    assert.equal(classified.HPEXPIRED.access_end, new Date(nowMs - 310 * DAY).toISOString(), "expiração calculada da data original, sem novo prazo");
    assert.equal(categoryOf("HPREPEAT-NEW"), "ready");
    assert.equal(categoryOf("HPREPEAT-OLD"), "review");
    for (const status of ["CANCELLED", "CHARGEBACK", "BLOCKED", "EXPIRED", "OVERDUE", "PARTIALLY_REFUNDED", "WAITING_PAYMENT", "STARTED", "PROCESSING_TRANSACTION", "PROTESTED", "UNDER_ANALISYS"]) {
      assert.equal(reconciliation.classifyHotmartSale({ ...fixtureSales[0], status }, context, new Date(nowMs)).category, "not_eligible", status);
    }
    assert.deepEqual(reconciliation.summarizeReconciliationRows(Object.values(classified)), { eligible: 13, already_inserted: 2, not_inserted: 4, review: 6, expired: 1, not_eligible: 2 });
    assert.equal(reconciliation.getImportBlockedReason({ mapping: MAPPING, destination: { type: "jornada", status: "draft" } }) !== null, true);
    assert.equal(reconciliation.getImportBlockedReason({ mapping: { ...MAPPING, status: "inactive" }, destination: context.destination }) !== null, true);
    assert.equal(reconciliation.getImportBlockedReason(context), null);

    // Importação reutiliza o processor (stub) — sem alterar processor, webhook ou refund.
    const originalProcess = hotmartProcessor.processHotmartEvent;
    const originalReprocess = hotmartProcessor.reprocessHotmartTransaction;
    const originalSendEmail = hotmartEmail.sendHotmartTransactionEmail;
    const processorCalls = [];
    const reprocessCalls = [];
    const emailCalls = [];
    hotmartProcessor.processHotmartEvent = async (supabase, event) => {
      processorCalls.push(event);
      let student = supabase.db.students.find((row) => row.email.toLowerCase() === event.buyer.email);
      if (!student) { student = { id: `st-${event.transactionCode}`, email: event.buyer.email, status: "active" }; supabase.db.students.push(student); }
      const tx = { id: `tx-${event.transactionCode}`, transaction_code: event.transactionCode, hotmart_product_ucode: event.product.ucode, student_id: student.id, processing_status: "processed", refund_status: null, refund_request_state: null, possible_duplicate_student_id: null, resolved_at: null };
      supabase.db.hotmart_transactions.push(tx);
      supabase.db.student_jornadas.push({ id: `sj-${event.transactionCode}`, student_id: student.id, jornada_id: "jornada-1", status: "active", started_at: event.purchase.approvedAt.slice(0, 10) });
      supabase.db.hotmart_access_links.push({ id: `link-${event.transactionCode}`, hotmart_transaction_id: tx.id, student_id: student.id });
      return "processed";
    };
    hotmartProcessor.reprocessHotmartTransaction = async (supabase, transactionId) => {
      reprocessCalls.push(transactionId);
      const tx = supabase.db.hotmart_transactions.find((row) => row.id === transactionId);
      tx.processing_status = "processed";
      supabase.db.students.push({ id: "st-pending", email: "pending@x.com", status: "active" });
      tx.student_id = "st-pending";
      supabase.db.student_jornadas.push({ id: `sj-${transactionId}`, student_id: "st-pending", jornada_id: "jornada-1", status: "active" });
      supabase.db.hotmart_access_links.push({ id: `link-${transactionId}`, hotmart_transaction_id: transactionId, student_id: "st-pending" });
      return "processed";
    };
    hotmartEmail.sendHotmartTransactionEmail = async (supabase, transactionId, pending) => { emailCalls.push({ transactionId, pending }); return true; };
    try {
      memory = createMemorySupabase(seedDatabase());
      const preservedEnrollment = JSON.stringify(memory.db.student_jornadas[0]);
      const saleByCode = Object.fromEntries(fixtureSales.map((sale) => [sale.transaction, sale]));
      const importSale = (code, extra = {}) => reconciliation.importHotmartHistoricalSale(memory, { sale: saleByCode[code], mapping: { ...MAPPING }, productId: PRODUCT_ID, adminId: "admin-unit", sendAccessEmail: false, ...extra });

      let imported = await importSale("HPNEW");
      assert.equal(imported.outcome, "inserted");
      assert.equal(processorCalls.length, 1);
      assert.equal(processorCalls[0].externalEventId, "historical-reconciliation:HPNEW");
      assert.equal(processorCalls[0].event, "PURCHASE_APPROVED");
      assert.equal(processorCalls[0].purchase.approvedAt, new Date(nowMs - 10 * DAY).toISOString(), "processor recebe a data original da compra");
      assert.equal(processorCalls[0].product.ucode, PRODUCT_UCODE);
      assert.equal(memory.db.hotmart_webhook_events, undefined, "nenhum webhook fictício é registrado");
      const historyEntry = memory.db.hotmart_history.find((row) => row.action === "historical_buyer_reconciled");
      assert.equal(historyEntry.actor_type, "admin");
      assert.equal(historyEntry.actor_id, "admin-unit");
      assert.equal(historyEntry.mapping_id, MAPPING.id);
      assert.equal(historyEntry.metadata.source, "hotmart_sales_history");
      assert.equal(historyEntry.metadata.transaction_registered_before, false);
      assert.equal(emailCalls.length, 0, "sem envio de e-mail por padrão");
      // Idempotência: repetir a mesma venda não chama o processor nem duplica nada.
      const rowCounts = () => ["hotmart_transactions", "student_jornadas", "hotmart_access_links", "students"].map((table) => memory.db[table].length).join(",");
      const countsAfterFirst = rowCounts();
      imported = await importSale("HPNEW");
      assert.equal(imported.outcome, "already_inserted");
      assert.equal(processorCalls.length, 1);
      assert.equal(rowCounts(), countsAfterFirst);
      // Transação já registrada: reprocessa a partir do próprio registro, sem novo upsert.
      imported = await importSale("HPPENDING");
      assert.equal(imported.outcome, "inserted");
      assert.deepEqual(reprocessCalls, ["tx-pending"]);
      assert.equal(processorCalls.length, 1);
      // Já matriculado / não elegível / revisão / expirado: nada é escrito, matrícula e progresso preservados.
      for (const [code, outcome] of [["HPENROLLED", "already_inserted"], ["HPREFUND", "not_eligible"], ["HPSTATUS", "not_eligible"], ["HPMISMATCH", "review"], ["HPEXPIRED", "expired"], ["HPDUPACCOUNTS", "review"]]) {
        assert.equal((await importSale(code)).outcome, outcome, code);
      }
      assert.equal(processorCalls.length, 1);
      assert.equal(reprocessCalls.length, 1);
      assert.equal(JSON.stringify(memory.db.student_jornadas[0]), preservedEnrollment, "matrícula existente intacta");
      assert.equal(memory.db.student_jornada_simulados.length, 1);
      assert.equal(memory.db.simulado_attempts.length, 1);
      // E-mail opcional, somente para inseridos agora.
      imported = await importSale("HPEXISTING", { sendAccessEmail: true });
      assert.equal(imported.outcome, "inserted");
      assert.equal(processorCalls[1].event, "PURCHASE_COMPLETE");
      assert.deepEqual(emailCalls, [{ transactionId: "tx-HPEXISTING", pending: false }]);
      assert.equal((await importSale("HPEXISTING", { sendAccessEmail: true })).outcome, "already_inserted");
      assert.equal(emailCalls.length, 1, "quem já está inserido nunca recebe e-mail novamente");
      // Destino indisponível bloqueia a escrita.
      memory = createMemorySupabase(seedDatabase());
      memory.db.jornadas[0].status = "draft";
      assert.equal((await importSale("HPNEW")).outcome, "review");
      assert.equal(processorCalls.length, 2);

      // Rotas: requireAdmin, mapping, revalidação na Hotmart e manipulação do corpo.
      memory = createMemorySupabase(seedDatabase());
      const remoteSales = { HPNEW: saleItem({ transaction: "HPNEW", email: "novo@x.com" }), HPWRONGPROD: saleItem({ transaction: "HPWRONGPROD", email: "x@x.com", productId: 7654321 }), HPREFUNDNOW: saleItem({ transaction: "HPREFUNDNOW", status: "REFUNDED", email: "r@x.com" }), HPENROLLED: saleItem({ transaction: "HPENROLLED", email: "enrolled@x.com" }) };
      const routeRequests = [];
      global.fetch = async (input) => {
        const url = new URL(String(input));
        routeRequests.push(url);
        if (url.pathname.includes("oauth/token")) return oauthResponse("mock-route");
        if (url.pathname === "/products/api/v1/products") return new Response(JSON.stringify({ items: [{ ucode: PRODUCT_UCODE, name: "Marketing Digital do Zero", id: PRODUCT_ID }], page_info: {} }), { status: 200 });
        const code = url.searchParams.get("transaction");
        if (code) return new Response(JSON.stringify({ items: remoteSales[code] ? [remoteSales[code]] : [], page_info: {} }), { status: 200 });
        return new Response(JSON.stringify({ items: Object.values(remoteSales).filter((item) => item.purchase.status === "APPROVED"), page_info: {} }), { status: 200 });
      };
      hotmartProductionCatalog.resetHotmartProductionAccessTokenCache();
      const routeParams = (id) => ({ params: Promise.resolve({ id }) });
      const postImport = (id, body) => buyersImportRoute.POST(new Request("http://localhost/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), routeParams(id));

      currentAdmin = null;
      assert.equal((await buyersRoute.GET(new Request("http://localhost/api"), routeParams("mapping-1"))).status, 401);
      assert.equal((await postImport("mapping-1", { transaction_codes: ["HPNEW"] })).status, 401);
      currentAdmin = { id: "admin-unit", email: "admin@example.invalid" };
      assert.equal((await buyersRoute.GET(new Request("http://localhost/api"), routeParams("missing"))).status, 404);
      assert.equal((await postImport("missing", { transaction_codes: ["HPNEW"] })).status, 404);
      assert.equal((await postImport("mapping-1", { transaction_codes: ["HP'; drop table"] })).status, 400);
      assert.equal((await postImport("mapping-1", { transaction_codes: Array.from({ length: 11 }, (_, index) => `HPX${index}0`) })).status, 400);
      assert.equal((await postImport("mapping-1", { transaction_codes: [] })).status, 400);

      const getResponse = await buyersRoute.GET(new Request("http://localhost/api"), routeParams("mapping-1"));
      const getJson = await getResponse.json();
      assert.equal(getResponse.status, 200);
      assert.equal(getJson.summary.not_inserted, 1);
      assert.equal(getJson.summary.already_inserted, 1);
      assert.equal(getJson.rows[0].transaction, "HPNEW", "não inseridos primeiro");
      assert.equal(JSON.stringify(getJson).includes("prod-client-secret") || JSON.stringify(getJson).includes("mock-route"), false, "nenhum segredo/token na resposta");
      assert.equal(memory.db.hotmart_history.length, 0, "GET é somente leitura");

      const callsBeforeRoute = processorCalls.length;
      const postResponse = await postImport("mapping-1", { transaction_codes: ["HPNEW", "HPWRONGPROD", "HPREFUNDNOW", "HPENROLLED", "HPMISSING"], destination_id: "jornada-forjada", hotmart_product_ucode: "fb056612-bcc6-4217-9e6d-2a5d1110ac2f", purchase_status: "APPROVED" });
      const postJson = await postResponse.json();
      assert.equal(postResponse.status, 200);
      assert.deepEqual(postJson.results.map((item) => [item.transaction, item.outcome]), [["HPNEW", "inserted"], ["HPWRONGPROD", "not_eligible"], ["HPREFUNDNOW", "not_eligible"], ["HPENROLLED", "already_inserted"], ["HPMISSING", "not_found"]]);
      assert.equal(processorCalls.length, callsBeforeRoute + 1, "só a venda revalidada e pronta chega ao processor");
      assert.equal(processorCalls.at(-1).product.ucode, PRODUCT_UCODE, "produto/destino vêm do mapping salvo, nunca do corpo");
      assert.equal(memory.db.student_jornadas.some((row) => row.jornada_id === "jornada-forjada"), false);
      assert.deepEqual(postJson.summary, { inserted: 1, already_inserted: 1, review: 3, errors: 0 });
      assert.equal(memory.db.hotmart_history.some((row) => row.action === "historical_reconciliation_batch" && row.actor_id === "admin-unit" && row.metadata.inserted === 1), true);
      assert.equal(routeRequests.some((url) => url.hostname === "sandbox.hotmart.com"), false);
      // Diagnóstico: Sales API recusando (HTTP 400) registra etapa/status sem segredo e informa o status ao Admin.
      const originalConsoleError = console.error;
      const diagnostics = [];
      console.error = (...args) => { diagnostics.push(args.map(String).join(" ")); };
      try {
        global.fetch = async (input) => {
          const url = new URL(String(input));
          if (url.pathname.includes("oauth/token")) return oauthResponse("mock-route-secret-token");
          if (url.pathname === "/products/api/v1/products") return new Response(JSON.stringify({ items: [{ ucode: PRODUCT_UCODE, name: "Marketing Digital do Zero", id: PRODUCT_ID }], page_info: {} }), { status: 200 });
          return new Response(JSON.stringify({ error: "invalid_parameter", buyer: "pessoa@x.com" }), { status: 400 });
        };
        hotmartProductionCatalog.resetHotmartProductionAccessTokenCache();
        const rejected = await buyersRoute.GET(new Request("http://localhost/api"), routeParams("mapping-1"));
        const rejectedJson = await rejected.json();
        assert.equal(rejected.status, 502);
        assert.equal(rejectedJson.message, "A Hotmart recusou a consulta de vendas (HTTP 400). Nenhum dado foi alterado.");
        assert.equal(JSON.stringify(rejectedJson).includes("invalid_parameter"), false, "erro bruto da Hotmart não vai ao navegador");
        const diagnostic = diagnostics.find((line) => line.startsWith("[HOTMART_SALES_DIAGNOSTIC]"));
        assert.ok(diagnostic, "falha registrada no log do servidor");
        assert.deepEqual(JSON.parse(diagnostic.slice("[HOTMART_SALES_DIAGNOSTIC] ".length)), { phase: "sales_request", code: "remote_rejected", remote_status: 400, page: 0, mapping_id: "mapping-1", product_ucode: PRODUCT_UCODE, product_id: PRODUCT_ID });
        assert.equal(/mock-route-secret-token|prod-client-secret|prod-basic-token|pessoa@x\.com/.test(diagnostics.join(" ")), false, "log sem token, credencial ou dado de comprador");
        // Produto ausente no catálogo: falha na etapa de resolução do produto.
        global.fetch = async (input) => String(input).includes("oauth/token") ? oauthResponse("mock-route-2") : new Response(JSON.stringify({ items: [], page_info: {} }), { status: 200 });
        hotmartProductionCatalog.resetHotmartProductionAccessTokenCache();
        const missingProduct = await buyersRoute.GET(new Request("http://localhost/api"), routeParams("mapping-1"));
        assert.equal(missingProduct.status, 404);
        assert.equal(diagnostics.some((line) => line.includes("\"phase\":\"product_resolution\"") && line.includes("\"code\":\"not_found\"")), true);
      } finally {
        console.error = originalConsoleError;
      }
      // Mapping inativo bloqueia a importação.
      memory.db.hotmart_product_mappings[0].status = "inactive";
      assert.equal((await postImport("mapping-1", { transaction_codes: ["HPNEW"] })).status, 409);
    } finally {
      hotmartProcessor.processHotmartEvent = originalProcess;
      hotmartProcessor.reprocessHotmartTransaction = originalReprocess;
      hotmartEmail.sendHotmartTransactionEmail = originalSendEmail;
      cache.delete(path.resolve("lib/server/authGuard.ts"));
      cache.delete(path.resolve("lib/server/supabaseAdmin.ts"));
    }

    // Arquivos comerciais preservados: webhook, processor e refund não referenciam a reconciliação.
    for (const preserved of ["app/api/webhooks/hotmart/route.ts", "app/lib/server/hotmart/processor.ts", "app/lib/server/hotmart/refund.ts"]) {
      assert.equal(fs.readFileSync(preserved, "utf8").includes("buyerReconciliation"), false, preserved);
    }

    // UI: botão permanente, modal, métricas, busca, filtros, seleção, confirmação, progresso e resultado.
    for (const contract of [
      'onClick={() => setBuyersTarget({ id: item.id, name: item.hotmart_product_name })}>Ver compradores não inseridos</PremiumButton>',
      ">Compradores Hotmart</h2>",
      "Confira quem comprou este produto e ainda não possui acesso ao destino vinculado.",
      '["Compradores elegíveis", summary.eligible',
      '["Já inseridos", summary.already_inserted',
      '["Não inseridos", summary.not_inserted',
      '["Revisão necessária", summary.review',
      "Acesso expirado: {summary.expired}",
      'placeholder="Buscar por nome ou e-mail..."',
      '["ready", "Não inseridos", summary.not_inserted]',
      '["expired", "Expirados", summary.expired]',
      'useState<"all" | BuyerCategory>("ready")',
      "Selecionar todos os elegíveis visíveis",
      "Limpar seleção",
      "const selectable = row.category === \"ready\" && !importBlocked;",
      "disabled={!selectable || processing}",
      "`Inserir ${selectedRows.length} selecionado${selectedRows.length === 1 ? \"\" : \"s\"}`",
      "Os acessos serão calculados a partir da data original de cada compra.",
      "Enviar e-mail de acesso aos novos alunos inseridos",
      "const [sendAccessEmail, setSendAccessEmail] = useState(false);",
      "const BUYER_IMPORT_BATCH_SIZE = 5;",
      "Processando {progress.done} de {progress.total}...",
      "inseridos com sucesso",
      "Ver somente pendentes",
      "if (processingRef.current || !selectedRows.length || importBlocked) return;",
      'role="dialog" aria-modal="true" aria-labelledby={titleId} className="et-admin-dark-panel relative flex max-h-[calc(100dvh-1.5rem)]',
      'if (event.key === "Escape") requestClose();',
      "if (event.target === event.currentTarget) requestClose();",
      'if (json.mapping?.id && productSource === "production") void previewBuyers(json.mapping.id, savedName);',
      "Verificando compradores anteriores de",
    ]) assert.equal(pageClientSource.includes(contract), true, `Contrato de UI ausente: ${contract}`);
    const runImportSource = pageClientSource.slice(pageClientSource.indexOf("async function runImport()"), pageClientSource.indexOf("const metrics:"));
    assert.equal(runImportSource.includes("body: JSON.stringify({ transaction_codes: batch, send_access_email: sendAccessEmail })"), true, "o navegador envia só códigos selecionados");
    assert.equal(/destination_id|purchase_status|product_ucode/.test(runImportSource.split("body: JSON.stringify")[1].split(")")[0]), false);

    // --- Mirrors funcionais (funções puras copiadas do arquivo para teste isolado sem parser JSX) ---
    function formatCurrencyAmountMirror(amount, currency) {
      if (amount === null || amount === undefined || Number.isNaN(Number(amount)) || !currency) return null;
      try {
        return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(Number(amount));
      } catch {
        return amount + " " + currency;
      }
    }
    function formatPlainAmountMirror(amount) {
      if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return null;
      return Number(amount).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function formatDateTimeMirror(value) {
      if (!value) return null;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return null;
      const datePart = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date);
      const timePart = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" }).format(date);
      return datePart + " às " + timePart;
    }
    function computeLinkStateMirror(hasActiveMapping, hasDestinationName, hasAnyMapping) {
      return hasActiveMapping && hasDestinationName ? "linked"
        : hasActiveMapping ? "destination_unavailable"
        : hasAnyMapping ? "mapping_inactive"
        : "unlinked";
    }

    const normalizeSpace = (s) => s.replace(/\s/g, " ");
    // 8: amount + BRL -> R$ formatado.
    assert.equal(normalizeSpace(formatCurrencyAmountMirror(97, "BRL")), "R$ 97,00");
    // 9: amount + USD -> USD formatado corretamente.
    assert.equal(normalizeSpace(formatCurrencyAmountMirror(150.5, "USD")), "US$ 150,50");
    // 10: amount + currency nula/ausente -> NÃO assume BRL.
    assert.equal(formatCurrencyAmountMirror(97, null), null);
    assert.equal(formatCurrencyAmountMirror(97, ""), null);
    assert.equal(normalizeSpace(formatPlainAmountMirror(97)), "97,00");
    // 11: amount nulo/indefinido -> não inventa valor, mesmo com moeda presente.
    assert.equal(formatCurrencyAmountMirror(null, "BRL"), null);
    assert.equal(formatCurrencyAmountMirror(undefined, "USD"), null);
    assert.equal(formatPlainAmountMirror(null), null);
    assert.equal(formatDateTimeMirror(null), null);
    assert.equal(formatDateTimeMirror("2026-09-14T15:32:00.000Z"), "14/09/2026 às 15:32");

    // 1/2/3: canLink independe de processing_status — só depende de existir mapping para o UCODE.
    assert.equal(computeLinkStateMirror(false, null, false), "unlinked"); // pending_mapping + sem mapping
    assert.equal(computeLinkStateMirror(false, null, false), "unlinked"); // processing_error + sem mapping
    assert.equal(computeLinkStateMirror(false, null, false), "unlinked"); // outro processing_status + sem mapping
    // 4: mapping ativo + Jornada válida -> linked (Vinculado, sem Vincular).
    assert.equal(computeLinkStateMirror(true, "Jornada PCMG 2026", true), "linked");
    // 5: mapping ativo + Evento válido -> linked (rótulo "Evento" vem de destination_type, testado via source acima).
    assert.equal(computeLinkStateMirror(true, "Evento Revisão Final PCMG", true), "linked");
    // 6: mapping inativo -> mapping_inactive, nunca tratado como Vinculado operacional.
    assert.equal(computeLinkStateMirror(false, null, true), "mapping_inactive");
    // 7: mapping ativo + destino não resolvido -> destination_unavailable (alerta), nunca falso "linked".
    assert.equal(computeLinkStateMirror(true, null, true), "destination_unavailable");
  } finally {
    global.fetch = originalFetch;
    restoreHotmartEnv();
    restoreHotmartProductionEnv();
    refund.resetHotmartAccessTokenCache();
    hotmartProductionCatalog.resetHotmartProductionAccessTokenCache();
  }
}

testHotmartExternalClient().then(() => console.log("Hotmart unit tests: PASS")).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
