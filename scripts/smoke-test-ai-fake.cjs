/* eslint-disable @typescript-eslint/no-require-imports */
// Fase 6B.4 — smoke minimo autorizado: exercita a rota real de importacao/analise
// (app/api/admin/questions/import/analyze-batch/route.ts) com TEST_AI_MODE=fake, em
// processo (mesmo padrao de scripts/smoke-test-admin.cjs), contra o Supabase de TESTE.
// Objetivo: provar que a resposta fake percorre o fluxo real (requireAdmin real, leitura
// real de exam_boards) e que nenhuma chamada de rede a OpenAI ocorre.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { randomUUID } = require("node:crypto");
const { NextResponse } = require("next/server");
const { createClient } = require("@supabase/supabase-js");
const { getTestAdminAuthHeaders } = require("../tests/helpers/test-admin-auth.cjs");
const { assertSafeSupabaseTestEnvironment, loadSafeSupabaseTestEnvironment } = require("../tests/helpers/supabase-test-environment.cjs");
const { createTestDomainFixtures } = require("../tests/helpers/test-domain-fixtures.cjs");

async function smokeTestAiFake() {
  const config = loadSafeSupabaseTestEnvironment();
  const headers = await getTestAdminAuthHeaders();
  assertSafeSupabaseTestEnvironment(); // guard: continua rodando antes de qualquer fixture

  // Fase 6B.6-E: a criação da fixture (linha abaixo) e TUDO que roda depois dela —
  // carregamento dos módulos reais, montagem do handler, execução do smoke e suas
  // asserções — precisam ficar dentro do MESMO try/finally. Antes desta fase, apenas
  // a chamada da rota (após os load()) tinha finally; uma exceção durante load()
  // (import quebrado, erro de compilação TS, dependência inesperada) deixava a
  // fixture já criada órfã no Supabase de teste.
  const fixtures = createTestDomainFixtures("6b4aifake" + randomUUID().replace(/-/g, "").slice(0, 20));
  let fixturesCreated = false;
  try {
    const created = await fixtures.create();
    fixturesCreated = true;
    return await runSmokeAgainstFixtures(config, headers, created.names);
  } finally {
    if (fixturesCreated) {
      try {
        await fixtures.cleanup();
      } catch (cleanupError) {
        // Não relança: um erro de cleanup aqui nunca deve mascarar uma falha real do
        // smoke que esteja se propagando pelo try acima. Fica visível no console.
        console.error("AI fake smoke cleanup failed (fixtures may remain in the test project):", cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
      }
    }
  }
}

async function runSmokeAgainstFixtures(config, headers, names) {
  let auditEvents = 0;
  const allowedReads = new Set(["/auth/v1/user", "/rest/v1/profiles", "/rest/v1/exam_boards", "/rest/v1/questions", "/rest/v1/question_alternatives"]);
  const client = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => {
        assertSafeSupabaseTestEnvironment();
        const target = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        const method = init?.method || (input instanceof Request ? input.method : "GET");
        if (target.origin !== config.url || method !== "GET" || !allowedReads.has(target.pathname)) {
          throw new Error("AI fake smoke permits only the selected test-project reads.");
        }
        return fetch(input, { ...init, redirect: "error" });
      },
    },
  });

  // Único contexto vm compartilhado por todos os arquivos carregados abaixo, para que
  // globalThis.__ET_TEST_SUPABASE_ENV_APPROVED__ (lido por lib/server/ai/aiProvider.ts)
  // seja visível entre eles — replica, no smoke em processo, o que
  // tests/helpers/next-test-env.cjs faz no processo real do servidor Next.
  const sandbox = vm.createContext({ URL, Request, Response, fetch, process: { env: { TEST_AI_MODE: "fake" } } });
  sandbox.__ET_TEST_SUPABASE_ENV_APPROVED__ = true;

  const modules = {
    "next/server": { NextResponse },
    "next/navigation": { redirect() { throw new Error("Browser auth is outside this smoke."); } },
    "@/lib/server/supabaseAdmin": { createSupabaseAdminClient() { assertSafeSupabaseTestEnvironment(); return client; } },
    "@/lib/supabase/server": { createSupabaseBrowserServerClient() { throw new Error("Browser auth is outside this smoke."); } },
    "@/app/lib/server/auditLogger": { async logSecurityEvent() { auditEvents += 1; } },
  };
  // Cada arquivo é executado dentro de uma função-wrapper (como o próprio module wrapper
  // do Node) no MESMO contexto vm, para que `globalThis` seja compartilhado (necessário
  // para lib/server/ai/aiProvider.ts enxergar a flag do guard) sem que os `const`
  // top-level gerados pelo TypeScript (ex.: `server_1`) colidam entre arquivos — colisão
  // que ocorreria se o código de cada arquivo rodasse direto no escopo léxico do contexto.
  function load(relativePath) {
    const source = fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const wrapped = "(function (module, exports, require, process, fetch, URL, Request, Response) {\n" + code + "\n})";
    const loaded = { exports: {} };
    const factory = vm.runInContext(wrapped, sandbox, { filename: relativePath });
    const localRequire = (name) => {
      if (!(name in modules)) throw new Error("Unexpected AI fake smoke dependency: " + name);
      return modules[name];
    };
    factory(loaded, loaded.exports, localRequire, sandbox.process, fetch, URL, Request, Response);
    return loaded.exports;
  }

  modules["@/lib/server/authGuard"] = load("lib/server/authGuard.ts");
  modules["@/app/lib/utils/question-splitter"] = load("app/lib/utils/question-splitter.ts");
  modules["@/lib/questions/duplicate-service"] = load("lib/questions/duplicate-service.ts");
  modules["@/lib/server/ai/aiProvider"] = load("lib/server/ai/aiProvider.ts");
  const route = load("app/api/admin/questions/import/analyze-batch/route.ts");

  const text = [
    "Ano: 2025 Banca: " + names.board,
    "Enunciado de teste do smoke 6B.4, sem relacao com nenhuma questao real do banco.",
    "A) Alternativa A",
    "B) Alternativa B",
    "C) Alternativa C",
    "Gabarito: C",
  ].join("\n");

  const request = new Request("http://127.0.0.1/api/admin/questions/import/analyze-batch", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ text, subject_id: null, year: 2025, batch_index: 0 }),
  });

  // Fase 6B.6-E: o cleanup das fixtures agora é responsabilidade exclusiva do
  // try/finally em smokeTestAiFake, que envolve esta função inteira — nenhum
  // try/finally próprio aqui, para não duplicar nem mascarar essa responsabilidade.
  const response = await route.POST(request);
  const body = await response.json();
  if (response.status !== 200 || body.ok !== true) {
    throw new Error("Unexpected response: status=" + response.status + " ok=" + body.ok + " message=" + body.message);
  }
  if (!Array.isArray(body.questions) || body.questions.length < 1) {
    throw new Error("Fake response did not produce the expected questions array.");
  }
  const fakeMarkerPresent = body.questions.every((q) => typeof q.difficulty_level === "number" || q.difficulty_level === null);
  if (!fakeMarkerPresent) throw new Error("Unexpected question shape from fake AI path.");
  return {
    status: response.status,
    ok: body.ok,
    questionCount: body.questions.length,
    boardResolved: Boolean(body.questions[0]?.exam_board_id),
    auditEventsInMemory: auditEvents,
    transport: "real route handler in process; TEST_AI_MODE=fake; real Supabase Auth/SELECT restricted to exam_boards/profiles/auth.user",
  };
}

if (require.main === module) {
  smokeTestAiFake().then((summary) => console.log(JSON.stringify(summary))).catch((error) => {
    console.error("AI fake smoke failed:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
module.exports = { smokeTestAiFake };
