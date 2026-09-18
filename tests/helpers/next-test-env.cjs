/* eslint-disable @typescript-eslint/no-require-imports */
const { assertSafeSupabaseTestEnvironment } = require("./supabase-test-environment.cjs");
assertSafeSupabaseTestEnvironment();

// Fase 6B.4: marca este processo do servidor Next como aprovado pelo guard, para que
// lib/server/ai/aiProvider.ts (código de produção, nunca importa nada de tests/) possa
// ativar TEST_AI_MODE=fake sem depender de nenhum arquivo de teste em tempo de execução.
globalThis.__ET_TEST_SUPABASE_ENV_APPROVED__ = true;

// Next reloads env files in its CLI and workers. Intercept the installed loader
// before Next is imported so neither startup nor reload can read operational files.
const envPath = require.resolve("@next/env");
const nextEnv = require(envPath);
require.cache[envPath].exports = {
  ...nextEnv,
  loadEnvConfig() {
    assertSafeSupabaseTestEnvironment();
    return { combinedEnv: process.env, parsedEnv: {}, loadedEnvFiles: [] };
  },
};

// Fase 6B.4: quando um modo fake de IA foi explicitamente pedido para este processo já
// aprovado pelo guard acima, bloqueia qualquer tentativa real de rede para a OpenAI.
// Não depende de page.route() (que não intercepta fetch feito pelo servidor Next) — atua
// diretamente no fetch global do processo do servidor, antes de qualquer rota carregar.
if (process.env.TEST_AI_MODE === "fake" || process.env.TEST_AI_MODE === "fake-error") {
  const realFetch = globalThis.fetch;
  globalThis.fetch = function guardedFetch(input, init) {
    let hostname = "";
    try {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      hostname = new URL(url).hostname;
    } catch {
      hostname = "";
    }
    if (/(^|\.)openai\.com$/i.test(hostname)) {
      throw new Error("Refusing real network call to OpenAI: TEST_AI_MODE is active for this authorized test process.");
    }
    return realFetch.call(this, input, init);
  };
}
