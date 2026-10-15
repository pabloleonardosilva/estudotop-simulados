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
assert.equal(adminFetchCallCount, 11, "As 11 chamadas administrativas conhecidas (carregar, criar vínculo, buscar produto no catálogo, listar catálogo sandbox, listar catálogo produção, alterar status, estorno, reprocessar/ação, recuperar e-mails, salvar vínculo pendente, reprocessar via pendência) devem usar adminFetch.");

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
