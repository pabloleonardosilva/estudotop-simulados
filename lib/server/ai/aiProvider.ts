// Fase 6B.4 — ponto único de decisão para isolar chamadas de IA (OpenAI) durante testes.
//
// Produção: comportamento real, inalterado — nenhuma das funções abaixo interfere
// com uma chamada real quando TEST_AI_MODE não é "fake"/"fake-error".
//
// Teste: TEST_AI_MODE=fake (ou fake-error) só é honrado quando o processo do servidor
// Next já foi validado como o ambiente de teste Supabase autorizado — verificação feita
// por tests/helpers/next-test-env.cjs (preload carregado somente pelo webServer de teste
// via createNextTestEnvironment) ANTES de qualquer rota ser importada. Esse preload marca
// globalThis.__ET_TEST_SUPABASE_ENV_APPROVED__ = true somente após
// assertSafeSupabaseTestEnvironment() aprovar. Este arquivo nunca importa código de
// tests/: ele só lê essa flag, então um deploy de produção (que nunca carrega o preload)
// jamais pode ativar o fake por acidente, mesmo que TEST_AI_MODE esteja definida.

export type AiTestMode = "off" | "fake" | "fake-error";

function guardApproved(): boolean {
  const flagged = (globalThis as unknown as Record<string, unknown>).__ET_TEST_SUPABASE_ENV_APPROVED__;
  return flagged === true;
}

export function getAiTestMode(env: NodeJS.ProcessEnv = process.env): AiTestMode {
  const raw = env.TEST_AI_MODE;
  if (raw !== "fake" && raw !== "fake-error") return "off";
  if (!guardApproved()) return "off";
  return raw;
}

export function isAiFakeModeActive(env?: NodeJS.ProcessEnv): boolean {
  return getAiTestMode(env) !== "off";
}

// --- B) Classificação de dificuldade: fake determinístico ---

export const FAKE_DIFFICULTY_LEVEL = 3;

export function fakeDifficultyLevel(): number {
  return FAKE_DIFFICULTY_LEVEL;
}

export function fakeDifficultyLevels(count: number): number[] {
  return Array.from({ length: Math.max(0, count) }, () => FAKE_DIFFICULTY_LEVEL);
}

// --- A) Importação/análise de questões: fake determinístico ---

type FakeChatCompletion = { choices: { message: { content: string } }[] };

function buildFakeAnalyzeChatCompletion(): FakeChatCompletion {
  const payload = {
    questions: [
      {
        statement: "[TEST_AI_MODE=fake] Enunciado sintético gerado sem chamada real à OpenAI.",
        question_type: "multiple_choice",
        board_name: "",
        orgao: "",
        discipline_name: "",
        subject_name: "",
        difficulty_level: FAKE_DIFFICULTY_LEVEL,
        year: null,
        explanation_text: "",
        alternatives: [
          { label: "A", text: "Alternativa A fictícia", is_correct: false },
          { label: "B", text: "Alternativa B fictícia", is_correct: false },
          { label: "C", text: "Alternativa C fictícia (gabarito)", is_correct: true },
          { label: "D", text: "Alternativa D fictícia", is_correct: false },
        ],
      },
    ],
  };
  return { choices: [{ message: { content: JSON.stringify(payload) } }] };
}

const FAKE_ERROR_MESSAGE = "Fake AI error (TEST_AI_MODE=fake-error, nenhuma chamada de rede foi realizada).";

// --- C) Camada de transporte usada pelas rotas de importação/análise ---

export type ChatCompletionPayload = {
  model: string;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" };
  messages: { role: string; content: string }[];
};

export type ChatCompletionResult = {
  ok: boolean;
  status: number;
  json: { choices?: { message: { content: string } }[]; error?: { message: string } };
};

export async function requestChatCompletion(payload: ChatCompletionPayload): Promise<ChatCompletionResult> {
  const mode = getAiTestMode();

  if (mode === "fake-error") {
    return { ok: false, status: 502, json: { error: { message: FAKE_ERROR_MESSAGE } } };
  }

  if (mode === "fake") {
    return { ok: true, status: 200, json: buildFakeAnalyzeChatCompletion() };
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  const json = await response.json();
  return { ok: response.ok, status: response.status, json };
}
