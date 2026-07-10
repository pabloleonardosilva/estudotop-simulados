import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";

const OPENAI_MODEL = "gpt-4.1-mini";

function extractOpenAIText(result: any): string {
  if (!result) return "";

  // Responses API
  if (
    typeof result.output_text === "string" &&
    result.output_text.trim()
  ) {
    return result.output_text.trim();
  }

  // fallback
  if (Array.isArray(result.output)) {
    const text = result.output
      .flatMap((item: any) => item?.content || [])
      .map((content: any) => content?.text || "")
      .join("\n")
      .trim();

    if (text) return text;
  }

  return "";
}

function getFriendlyOpenAIError(result: any) {
  const message = result?.error?.message || "";

  if (message.toLowerCase().includes("quota")) {
    return "Sua conta da OpenAI está sem créditos ou atingiu limite de uso.";
  }

  if (message.toLowerCase().includes("api key")) {
    return "A chave da OpenAI está inválida ou mal configurada.";
  }

  if (message.toLowerCase().includes("model")) {
    return "O modelo configurado não está disponível.";
  }

  return message || "Falha ao gerar explicação com IA.";
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          message: "OPENAI_API_KEY não foi configurada no .env.local.",
        },
        { status: 500 }
      );
    }

    const body = await request.json();

    const statement = String(body.statement || "").trim();
    const alternatives = body.alternatives || [];
    const correct = alternatives.find((item: any) => item.is_correct);

    if (!statement) {
      return NextResponse.json(
        {
          ok: false,
          message: "Digite o enunciado antes de gerar a explicação.",
        },
        { status: 400 }
      );
    }

    if (!correct) {
      return NextResponse.json(
        {
          ok: false,
          message: "Marque a resposta correta antes de gerar a explicação.",
        },
        { status: 400 }
      );
    }

    const alternativesText = alternatives
      .map(
        (alt: any) =>
          `${alt.label}) ${alt.text}${
            alt.is_correct ? " [CORRETA]" : ""
          }`
      )
      .join("\\n");

    const prompt = `Você é um professor especialista em concursos públicos.

Gere uma explicação rápida, clara e didática para a questão abaixo.

REGRAS:
- máximo de 2 parágrafos curtos;
- explique por que a resposta correta está correta;
- aponte a pegadinha, se houver;
- não use markdown;
- seja direto;
- responda em português do Brasil.

Disciplina: ${body.discipline || "Não informada"}
Assunto: ${body.subject || "Não informado"}
Banca: ${body.board || "Não informada"}

Enunciado:
${statement}

Alternativas/assertivas:
${alternativesText}`;

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          input: prompt,
          temperature: 0.2,
          max_output_tokens: 350,
        }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: getFriendlyOpenAIError(result),
          raw:
            process.env.NODE_ENV === "development"
              ? result
              : undefined,
        },
        { status: 400 }
      );
    }

    const explanation = extractOpenAIText(result);

    if (!explanation) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "A IA respondeu, mas não retornou texto de explicação.",
          raw:
            process.env.NODE_ENV === "development"
              ? result
              : undefined,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      explanation,
      provider: "openai",
      model: OPENAI_MODEL,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Erro inesperado ao gerar explicação.",
      },
      { status: 500 }
    );
  }
}