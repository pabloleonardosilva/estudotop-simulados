/* eslint-disable @typescript-eslint/no-require-imports */
// Fase 6B.6-E: prova, sem rede, que scripts/smoke-test-ai-fake.cjs limpa a fixture mesmo
// quando a falha ocorre DEPOIS da criação da fixture e DURANTE a fase de load() dos
// módulos reais (import quebrado / erro de compilação) — o bug corrigido nesta fase.
// Carrega o script real (sem modificá-lo) em um contexto vm isolado, com um require()
// falso que intercepta as dependências externas e injeta uma falha controlada dentro
// do próprio load() do script (fs.readFileSync lançando para um alvo específico).
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SCRIPT_PATH = path.resolve(__dirname, "../../scripts/smoke-test-ai-fake.cjs");

function loadSmokeScript(requireShim) {
  const source = fs.readFileSync(SCRIPT_PATH, "utf8");
  const wrapped = "(function (module, exports, require, __dirname) {\n" + source + "\n})";
  const sandbox = vm.createContext({ console, URL, Request, Response, fetch });
  const factory = vm.runInContext(wrapped, sandbox, { filename: SCRIPT_PATH });
  const loaded = { exports: {} };
  factory(loaded, loaded.exports, requireShim, path.dirname(SCRIPT_PATH));
  return loaded.exports;
}

// Constrói o require() falso. `failReadingPath` (se fornecido) faz fs.readFileSync
// lançar quando o caminho lido contiver esse trecho — usado para simular uma falha
// real durante load() (que internamente chama fs.readFileSync + ts.transpileModule).
function buildHarness({ failReadingPath } = {}) {
  let createCalled = false;
  let cleanupCalled = 0;
  const fakeFs = {
    ...fs,
    readFileSync(target, ...args) {
      // path.join usa separador do SO (barra invertida no Windows); normaliza antes
      // de comparar para o alvo funcionar em qualquer plataforma.
      if (failReadingPath && String(target).replace(/\\/g, "/").includes(failReadingPath)) {
        throw new Error("Simulated load() failure for test (broken import)");
      }
      return fs.readFileSync(target, ...args);
    },
  };
  const modules = {
    "node:fs": fakeFs,
    "node:path": path,
    "node:vm": vm,
    "typescript": require("typescript"),
    "node:crypto": require("node:crypto"),
    "next/server": { NextResponse: {} },
    "@supabase/supabase-js": { createClient: () => ({}) },
    "../tests/helpers/test-admin-auth.cjs": {
      getTestAdminAuthHeaders: async () => ({ Authorization: "Bearer fixture-token-not-real" }),
    },
    "../tests/helpers/supabase-test-environment.cjs": {
      assertSafeSupabaseTestEnvironment: () => ({ url: "https://fixture.invalid", anonKey: "fixture-anon", serviceRoleKey: "fixture-service" }),
      loadSafeSupabaseTestEnvironment: () => ({ url: "https://fixture.invalid", anonKey: "fixture-anon", serviceRoleKey: "fixture-service" }),
    },
    "../tests/helpers/test-domain-fixtures.cjs": {
      createTestDomainFixtures: (runId) => ({
        runId,
        create: async () => {
          createCalled = true;
          return { runId, ids: {}, names: { board: "Fixture Board" } };
        },
        cleanup: async () => {
          cleanupCalled += 1;
          return { domainResidues: 0, runId };
        },
      }),
    },
  };
  const requireShim = (name) => {
    if (!(name in modules)) throw new Error("Unexpected dependency in smoke cleanup test: " + name);
    return modules[name];
  };
  return {
    requireShim,
    wasCreateCalled: () => createCalled,
    cleanupCallCount: () => cleanupCalled,
  };
}

// 1-5: guard aprovado, fixture criada, falha proposital durante load(), cleanup
// executado apesar da falha, erro original continua observável.
test("cleanup runs even when a load() failure happens after the fixture was created", async () => {
  const harness = buildHarness({ failReadingPath: "lib/server/authGuard.ts" });
  const { smokeTestAiFake } = loadSmokeScript(harness.requireShim);

  await assert.rejects(smokeTestAiFake(), (error) => {
    assert.equal(error instanceof Error, true);
    assert.equal(error.message, "Simulated load() failure for test (broken import)");
    return true;
  });

  assert.equal(harness.wasCreateCalled(), true, "fixture creation must have run before the injected failure");
  assert.equal(harness.cleanupCallCount(), 1, "cleanup must run exactly once despite the load() failure");
});

// Cleanup nunca deve mascarar o erro original: se create() nunca é chamado com sucesso
// (falha antes da fixture existir), cleanup não deve ser chamado — nada para limpar.
test("cleanup is not attempted when fixture creation itself never succeeds", async () => {
  const harness = buildHarness({ failReadingPath: "this-path-is-never-read" });
  const modulesOverride = harness.requireShim("../tests/helpers/test-domain-fixtures.cjs");
  modulesOverride.createTestDomainFixtures = (runId) => ({
    runId,
    create: async () => { throw new Error("Simulated fixture creation failure"); },
    cleanup: async () => { throw new Error("cleanup should never be called in this scenario"); },
  });
  const { smokeTestAiFake } = loadSmokeScript(harness.requireShim);

  await assert.rejects(smokeTestAiFake(), { message: "Simulated fixture creation failure" });
});

// Erro de cleanup não deve mascarar o erro original do smoke (nem travar o processo):
// ambos ficam visíveis, o erro original continua sendo o que se propaga.
test("a cleanup failure never replaces or hides the original smoke error", async () => {
  const harness = buildHarness({ failReadingPath: "lib/server/authGuard.ts" });
  const modulesOverride = harness.requireShim("../tests/helpers/test-domain-fixtures.cjs");
  let cleanupAttempted = false;
  modulesOverride.createTestDomainFixtures = (runId) => ({
    runId,
    create: async () => ({ runId, ids: {}, names: { board: "Fixture Board" } }),
    cleanup: async () => {
      cleanupAttempted = true;
      throw new Error("Simulated cleanup failure (e.g. transient network issue)");
    },
  });
  const originalConsoleError = console.error;
  const loggedMessages = [];
  console.error = (...args) => { loggedMessages.push(args.join(" ")); };
  try {
    const { smokeTestAiFake } = loadSmokeScript(harness.requireShim);
    await assert.rejects(smokeTestAiFake(), { message: "Simulated load() failure for test (broken import)" });
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(cleanupAttempted, true, "cleanup must still be attempted");
  assert.equal(loggedMessages.some((line) => line.includes("Simulated cleanup failure")), true, "cleanup failure must be visible");
});

// Cobre também uma falha tardia, na última linha de load() (a própria rota
// analyze-batch), não apenas a primeira (authGuard) — prova que a cobertura do
// try/finally alcança QUALQUER ponto da fase de load(), não só o seu início.
test("cleanup also runs when the failure happens at the very last load() call", async () => {
  const harness = buildHarness({ failReadingPath: "app/api/admin/questions/import/analyze-batch/route.ts" });
  const { smokeTestAiFake } = loadSmokeScript(harness.requireShim);
  await assert.rejects(smokeTestAiFake(), { message: "Simulated load() failure for test (broken import)" });
  assert.equal(harness.wasCreateCalled(), true);
  assert.equal(harness.cleanupCallCount(), 1);
});

// O caminho feliz completo (fixture criada, todos os load() bem-sucedidos, rota real
// respondendo, cleanup executado e resultado retornado normalmente) exige Auth/SELECT
// reais contra o Supabase de teste — coberto pelo smoke real (npm run test:ai-fake:smoke,
// seção 7/8 desta fase), não por este teste local sem rede.
