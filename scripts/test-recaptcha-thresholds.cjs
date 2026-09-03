const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync("lib/server/recaptcha.ts", "utf8");
const eventRoute = fs.readFileSync("app/api/events/[slug]/route.ts", "utf8");
const registrationRoute = fs.readFileSync("app/api/auth/register/route.ts", "utf8");
const registrationPage = fs.readFileSync("app/cadastro/page.tsx", "utf8");
const helpRoute = fs.readFileSync("app/api/student/help-messages/route.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function loadVerifier(result, responseOk = true) {
  const module = { exports: {} };
  const context = vm.createContext({
    module,
    exports: module.exports,
    require(id) {
      if (id === "server-only") return {};
      throw new Error(`Unexpected import: ${id}`);
    },
    process: { env: { RECAPTCHA_SECRET_KEY: "test-secret" } },
    URLSearchParams,
    fetch: async () => ({ ok: responseOk, json: async () => result }),
  });
  new vm.Script(compiled, { filename: "recaptcha.js" }).runInContext(context);
  return module.exports.verifyRecaptchaToken;
}

async function verify(result, action, minScore) {
  return loadVerifier(result)("test-token", action, minScore === undefined ? undefined : { minScore });
}

(async () => {
  assert.match(eventRoute, /RECAPTCHA_ACTION = "event_join_request"/);
  assert.match(eventRoute, /RECAPTCHA_ACTION, \{ minScore: 0\.3 \}/);
  assert.match(registrationRoute, /RECAPTCHA_ACTION = "public_registration"/);
  assert.match(registrationRoute, /RECAPTCHA_ACTION, \{ minScore: 0\.3 \}/);
  assert.match(registrationPage, /execute\(recaptchaSiteKey, \{ action: RECAPTCHA_ACTION \}\)/);
  assert.match(registrationPage, /captcha_token: captchaToken/);
  assert.match(helpRoute, /verifyRecaptchaToken\(captchaToken, RECAPTCHA_ACTION\)/);
  assert.doesNotMatch(helpRoute, /minScore: 0\.3/);
  assert.equal((await verify({ success: true, score: 0.29, action: "event_join_request" }, "event_join_request", 0.3)).ok, false);
  assert.equal((await verify({ success: true, score: 0.3, action: "event_join_request" }, "event_join_request", 0.3)).ok, true);
  assert.equal((await verify({ success: true, score: 0.5, action: "event_join_request" }, "event_join_request", 0.3)).ok, true);
  assert.equal((await verify({ success: true, score: 0.9, action: "wrong_action" }, "event_join_request", 0.3)).ok, false);
  assert.equal((await verify({ success: false, score: 0.9, action: "event_join_request" }, "event_join_request", 0.3)).ok, false);
  assert.equal((await verify({ success: true, action: "event_join_request" }, "event_join_request", 0.3)).ok, false);
  assert.equal((await verify({ success: true, score: 0.3, action: "public_registration" }, "public_registration", 0.3)).ok, true);
  assert.equal((await verify({ success: true, score: 0.29, action: "public_registration" }, "public_registration", 0.3)).ok, false);
  assert.equal((await verify({ success: true, score: 0.3, action: "help_ticket_submit" }, "help_ticket_submit")).ok, false);
  assert.equal((await verify({ success: true, score: 0.5, action: "help_ticket_submit" }, "help_ticket_submit")).ok, true);
  console.log("reCAPTCHA threshold tests: PASS");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
