/* eslint-disable @typescript-eslint/no-require-imports */
// Fase 6B.4: testes locais, sem rede, do isolamento de IA (TEST_AI_MODE) — cobre
// lib/server/ai/aiProvider.ts diretamente, via transpile + vm (mesmo padrão já usado por
// tests/helpers/supabase-test-environment.test.cjs e scripts/smoke-test-admin.cjs).
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// vm contexts have their own Array/Object realm, so node:assert/strict's deepEqual
// (cross-realm aware for prototypes) can report "same structure but not reference-equal"
// for values that are genuinely identical. Round-trip through this process's own JSON to
// compare plain data regardless of which realm produced it.
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadAiProvider({ env = {}, approved = false, fetchImpl } = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, "../../lib/server/ai/aiProvider.ts"), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  const calls = [];
  const fetchSpy = async (...args) => {
    calls.push(args);
    if (fetchImpl) return fetchImpl(...args);
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "{}" } }] }) };
  };
  const sandbox = {
    module: loaded,
    exports: loaded.exports,
    process: { env },
    fetch: fetchSpy,
    require(name) {
      throw new Error("Unexpected dependency for aiProvider.ts: " + name);
    },
  };
  if (approved) sandbox.__ET_TEST_SUPABASE_ENV_APPROVED__ = true;
  vm.runInNewContext(compiled, sandbox, { filename: "lib/server/ai/aiProvider.ts" });
  return { module: loaded.exports, calls, sandbox };
}

// 1. Modo fake só funciona em ambiente de teste autorizado (guard aprovado).
test("TEST_AI_MODE=fake is ignored without the Supabase test-environment guard", () => {
  const { module } = loadAiProvider({ env: { TEST_AI_MODE: "fake" }, approved: false });
  assert.equal(module.getAiTestMode(), "off");
  assert.equal(module.isAiFakeModeActive(), false);
});

// 2. Produção/default nunca ativa o fake por acidente.
test("default process (no TEST_AI_MODE, no guard) behaves exactly like production", () => {
  const { module } = loadAiProvider({ env: {}, approved: false });
  assert.equal(module.getAiTestMode(), "off");
  assert.equal(module.isAiFakeModeActive(), false);
});
test("guard approved alone, without TEST_AI_MODE, never activates the fake", () => {
  const { module } = loadAiProvider({ env: {}, approved: true });
  assert.equal(module.getAiTestMode(), "off");
});
test("unrecognized TEST_AI_MODE values never activate the fake, even when approved", () => {
  const { module } = loadAiProvider({ env: { TEST_AI_MODE: "yes-please" }, approved: true });
  assert.equal(module.getAiTestMode(), "off");
});

// 10. O guard roda antes de cada ativação do fake — não é decidido uma única vez no import.
test("re-evaluates the guard on every call instead of caching the decision at load time", () => {
  const { module, sandbox } = loadAiProvider({ env: { TEST_AI_MODE: "fake" }, approved: false });
  assert.equal(module.getAiTestMode(), "off");
  sandbox.__ET_TEST_SUPABASE_ENV_APPROVED__ = true;
  assert.equal(module.getAiTestMode(), "fake");
  sandbox.__ET_TEST_SUPABASE_ENV_APPROVED__ = false;
  assert.equal(module.getAiTestMode(), "off");
});

// 3. Fake de importação retorna estrutura válida (uma ou mais questões sintéticas, tipo
// suportado, alternativas com gabarito, metadados mínimos).
test("fake chat completion returns a valid, parseable questions payload with a gabarito", async () => {
  const { module, calls } = loadAiProvider({ env: { TEST_AI_MODE: "fake" }, approved: true });
  const result = await module.requestChatCompletion({ model: "gpt-4o-mini", messages: [{ role: "user", content: "qualquer texto" }] });
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  const content = result.json.choices[0].message.content;
  const parsed = JSON.parse(content);
  assert.equal(Array.isArray(parsed.questions), true);
  assert.equal(parsed.questions.length >= 1, true);
  const [question] = parsed.questions;
  assert.equal(typeof question.statement, "string");
  assert.equal(question.statement.length > 0, true);
  assert.equal(["multiple_choice", "true_false"].includes(question.question_type), true);
  assert.equal(Array.isArray(question.alternatives), true);
  assert.equal(question.alternatives.length >= 2, true);
  assert.equal(question.alternatives.some((alt) => alt.is_correct === true), true);
  assert.equal(question.difficulty_level >= 1 && question.difficulty_level <= 5, true);
  assert.equal(calls.length, 0, "fake mode must never touch fetch");
});

// 4. Fake de dificuldade retorna valor válido e compatível com o domínio (1 a 5).
test("fake difficulty level and batch are within the valid 1-5 domain", () => {
  const { module } = loadAiProvider({ env: { TEST_AI_MODE: "fake" }, approved: true });
  const single = module.fakeDifficultyLevel();
  assert.equal(Number.isInteger(single), true);
  assert.equal(single >= 1 && single <= 5, true);
  const batch = module.fakeDifficultyLevels(4);
  assert.equal(batch.length, 4);
  for (const level of batch) assert.equal(level >= 1 && level <= 5, true);
  assert.deepEqual(plain(module.fakeDifficultyLevels(0)), []);
});

// 5. Simulação de erro funciona, sem rede real.
test("TEST_AI_MODE=fake-error simulates an AI failure without any network call", async () => {
  const { module, calls } = loadAiProvider({ env: { TEST_AI_MODE: "fake-error" }, approved: true });
  const result = await module.requestChatCompletion({ model: "gpt-4o-mini", messages: [] });
  assert.equal(result.ok, false);
  assert.equal(typeof result.json.error.message, "string");
  assert.equal(result.json.error.message.length > 0, true);
  assert.equal(calls.length, 0, "fake-error mode must never touch fetch");
});

// 6. Chamada externa real é feita normalmente fora do modo fake (comportamento de produção
// preservado) — prova que o desvio só ocorre quando o modo fake está de fato ativo.
test("outside fake mode, requestChatCompletion calls fetch exactly like production", async () => {
  const { module, calls } = loadAiProvider({
    env: { OPENAI_API_KEY: "sk-fixture-not-a-real-key" },
    approved: false,
    fetchImpl: async (url) => {
      assert.equal(url, "https://api.openai.com/v1/chat/completions");
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "real-provider-response" } }] }) };
    },
  });
  const result = await module.requestChatCompletion({ model: "gpt-4o-mini", messages: [] });
  assert.equal(calls.length, 1);
  assert.equal(result.json.choices[0].message.content, "real-provider-response");
});

// 7. Nenhuma chave OpenAI real é necessária no modo fake.
test("fake mode succeeds with OPENAI_API_KEY entirely unset", async () => {
  const { module } = loadAiProvider({ env: { TEST_AI_MODE: "fake" }, approved: true });
  const result = await module.requestChatCompletion({ model: "gpt-4o-mini", messages: [] });
  assert.equal(result.ok, true);
});

// 8. Mensagens de erro do fake não expõem segredos.
test("fake-error message never echoes environment secrets", async () => {
  const secret = "sk-should-never-leak-0000000000";
  const { module } = loadAiProvider({ env: { TEST_AI_MODE: "fake-error", OPENAI_API_KEY: secret }, approved: true });
  const result = await module.requestChatCompletion({ model: "gpt-4o-mini", messages: [] });
  assert.equal(result.json.error.message.includes(secret), false);
});

// 9. Comportamento determinístico entre execuções.
test("fake outputs are deterministic across repeated calls", async () => {
  const { module: a } = loadAiProvider({ env: { TEST_AI_MODE: "fake" }, approved: true });
  const { module: b } = loadAiProvider({ env: { TEST_AI_MODE: "fake" }, approved: true });
  const resultA = await a.requestChatCompletion({ model: "gpt-4o-mini", messages: [] });
  const resultB = await b.requestChatCompletion({ model: "gpt-4o-mini", messages: [] });
  assert.deepEqual(plain(resultA.json), plain(resultB.json));
  assert.equal(a.fakeDifficultyLevel(), b.fakeDifficultyLevel());
  assert.deepEqual(plain(a.fakeDifficultyLevels(5)), plain(b.fakeDifficultyLevels(5)));
});
