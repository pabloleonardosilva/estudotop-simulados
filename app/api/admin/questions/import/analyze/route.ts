import { NextResponse } from "next/server";
import { normalizeEvaluatedTopics } from "@/lib/questions/evaluated-topics";
import { requireAdmin } from "@/lib/server/authGuard";

function extractJson(text: string) {
  const cleaned = text.trim();

  if (cleaned.startsWith("{")) return cleaned;

  const match = cleaned.match(/\{[\s\S]*\}/);
  return match?.[0] || cleaned;
}

function clean(value?: string | null) {
  return String(value || "").trim();
}

function extractAgencyNameFromText(text: string): string {
  const patterns = [
    /\b(?:Órgão|Orgao)\s*:\s*([^\n\r]+?)(?=\s+(?:Provas?|Banca|Ano|Disciplina|Assunto)\s*:|$)/i,
    /\b(?:Órgão|Orgao)\s*:\s*([^\n\r]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;

    const agencyName = match[1]
      .replace(/\s+/g, " ")
      .replace(/[.,;:\-]+$/g, "")
      .trim();

    if (agencyName) return agencyName;
  }

  return "";
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

    const rawText = String(body.text || "").trim();

    if (!rawText) {
      return NextResponse.json(
        { ok: false, message: "Cole o texto com as questões antes de analisar." },
        { status: 400 }
      );
    }

    if (rawText.length < 40) {
      return NextResponse.json(
        { ok: false, message: "O texto está curto demais para identificar questões." },
        { status: 400 }
      );
    }

    const prompt = `Você é um importador inteligente de questões para concursos públicos.

Sua tarefa é transformar o texto bruto colado pelo usuário em uma estrutura JSON válida.

Regras:
- Identifique uma ou mais questões.
- Para cada questão, extraia:
  - statement: enunciado completo
  - question_type: "multiple_choice" ou "true_false"
  - alternatives: array com label, text e is_correct
  - explanation_text: se houver explicação no texto, inclua; se não houver, deixe vazio
  - board_name: banca, se aparecer; se não aparecer, deixe vazio
  - orgao: órgão do concurso/prova, se aparecer em "Órgão:" ou "Orgao:"; se não aparecer, deixe vazio
  - discipline_name: disciplina, se aparecer; se não aparecer, deixe vazio
  - subject_name: assunto, se aparecer; se não aparecer, deixe vazio
  - evaluated_topics: lista com 1 a 4 tópicos específicos efetivamente avaliados; não repita o assunto genérico se houver tópico mais específico
  - difficulty_level: número de 1 a 5 se for possível inferir; se não, null
  - year: ano da questão se aparecer; se não aparecer, null
- Se houver gabarito, marque a alternativa correta.
- Se não houver gabarito, mantenha todas is_correct=false.
- Se for questão Certo/Errado, crie alternativas:
  C) Certo
  E) Errado
- Não invente banca, disciplina, assunto ou ano.
- Não invente explicação se ela não estiver no texto.
- Retorne SOMENTE JSON, sem markdown.

Formato obrigatório:
{
  "questions": [
    {
      "statement": "texto do enunciado",
      "question_type": "multiple_choice",
      "board_name": "",
      "orgao": "",
      "discipline_name": "",
      "subject_name": "",
      "evaluated_topics": ["Tópico específico"],
      "difficulty_level": null,
      "year": null,
      "explanation_text": "",
      "alternatives": [
        { "label": "A", "text": "texto", "is_correct": false },
        { "label": "B", "text": "texto", "is_correct": true }
      ]
    }
  ]
}

Texto bruto:
${rawText}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_IMPORT_MODEL || "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Você transforma textos de questões de concursos em JSON estruturado válido.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          message:
            result?.error?.message ||
            "Erro ao analisar questões com a OpenAI.",
          raw: process.env.NODE_ENV === "development" ? result : undefined,
        },
        { status: 400 }
      );
    }

    const content = result?.choices?.[0]?.message?.content || "";

    if (!content) {
      return NextResponse.json(
        { ok: false, message: "A IA não retornou conteúdo." },
        { status: 400 }
      );
    }

    let parsed: any;

    try {
      parsed = JSON.parse(extractJson(content));
    } catch {
      return NextResponse.json(
        {
          ok: false,
          message: "A IA retornou um formato inválido. Tente novamente com um texto mais organizado.",
          raw: process.env.NODE_ENV === "development" ? content : undefined,
        },
        { status: 400 }
      );
    }

    const questions = Array.isArray(parsed.questions) ? parsed.questions : [];

    if (questions.length === 0) {
      return NextResponse.json(
        { ok: false, message: "Nenhuma questão foi identificada no texto." },
        { status: 400 }
      );
    }

    const normalized = questions.map((question: any, index: number) => {
      const alternatives = Array.isArray(question.alternatives)
        ? question.alternatives
        : [];

      return {
        temp_id: `import-${index + 1}`,
        statement: String(question.statement || "").trim(),
        question_type:
          question.question_type === "true_false" || alternatives.length === 2
            ? "true_false"
            : "multiple_choice",
        board_name: String(question.board_name || "").trim(),
        orgao: clean(extractAgencyNameFromText(rawText) || question.orgao || question.agency_name || ""),
        discipline_name: String(question.discipline_name || "").trim(),
        subject_name: String(question.subject_name || "").trim(),
        evaluated_topics: normalizeEvaluatedTopics(question.evaluated_topics),
        difficulty_level: question.difficulty_level ? Number(question.difficulty_level) : null,
        year: question.year ? Number(question.year) : new Date().getFullYear(),
        explanation_text: String(question.explanation_text || "").trim(),
        alternatives: alternatives.map((alternative: any, altIndex: number) => ({
          label:
            String(alternative.label || "").trim().toUpperCase() ||
            String.fromCharCode(65 + altIndex),
          text: String(alternative.text || "").trim(),
          is_correct: Boolean(alternative.is_correct),
        })),
      };
    });

    return NextResponse.json({
      ok: true,
      questions: normalized,
      count: normalized.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Erro inesperado ao analisar questões com IA.",
      },
      { status: 500 }
    );
  }
}
