import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";

export const maxDuration = 120;

function extractJson(text: string) {
  const cleaned = text.trim();
  if (cleaned.startsWith("{")) return cleaned;
  const match = cleaned.match(/\{[\s\S]*\}/);
  return match?.[0] || cleaned;
}


export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await request.json();
    const statement = String(body.statement || "").trim();
    const alternatives: Array<{ label: string; text: string; is_correct: boolean }> = Array.isArray(body.alternatives) ? body.alternatives : [];
    const moduleName = String(body.module_name || "Informática").trim();
    const difficultyLevel = Math.max(1, Math.min(5, Number(body.difficulty_level ?? 3)));
    const boardName = String(body.board_name || "Estudo TOP").trim();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, message: "Chave OpenAI não configurada." }, { status: 500 });
    }

    const isNewQuestion = !statement;
    const altsCount = alternatives.length || 5;

    let prompt: string;

    if (isNewQuestion) {
      prompt = `Você é especialista em questões de concursos de Informática/TI.

MISSÃO: Crie 1 questão ORIGINAL sobre o assunto abaixo.

BANCA ORGANIZADORA: ${boardName}
ASSUNTO: ${moduleName}
NÍVEL DE DIFICULDADE: ${difficultyLevel}/5
NÚMERO DE ALTERNATIVAS: ${altsCount}

REGRAS:
• Mantenha o vocabulário técnico e estilo da banca ${boardName}
• Use EXATAMENTE ${altsCount} alternativas
• Gere UMA única alternativa correta
• Se precisar de imagem, escreva: [IMAGEM: descrição detalhada]

Retorne SOMENTE JSON:
{
  "statement": "Enunciado completo...",
  "question_type": "multiple_choice",
  "alternatives": [{"label":"A","text":"...","is_correct":false},...],
  "module_name": "${moduleName}",
  "difficulty_level": ${difficultyLevel},
  "explanation_text": "Explicação da resposta correta"
}`;
    } else {
      prompt = `Você é especialista em questões de concursos de Informática/TI da banca ${boardName}.

MISSÃO: Crie 1 questão 100% original sobre o tema abaixo. Siga este raciocínio:
  1. Pense no tema "${moduleName}" — quais aspectos existem? (definições, comparações, funcionamento, casos de uso, erros comuns, versões, configurações, comandos, segurança, exemplos práticos…)
  2. Escolha um ângulo de cobrança que seja diferente do mais óbvio
  3. Crie enunciado e alternativas COMPLETAMENTE NOVOS a partir desse ângulo — como se estivesse criando do zero, sem nenhuma inspiração prévia

BANCA: ${boardName}
TEMA: ${moduleName}
NÍVEL DE DIFICULDADE: ${difficultyLevel}/5
NÚMERO DE ALTERNATIVAS: ${altsCount}

REGRAS:
• Enunciado original — sem parafrasear questões conhecidas sobre o tema
• Alternativas originais — não use os distratores clássicos mais comuns
• UMA única alternativa correta
• Se precisar de imagem, escreva: [IMAGEM: descrição detalhada]

Retorne SOMENTE JSON:
{
  "statement": "Enunciado completo...",
  "question_type": "multiple_choice",
  "alternatives": [{"label":"A","text":"...","is_correct":false},...],
  "module_name": "${moduleName}",
  "difficulty_level": ${difficultyLevel},
  "explanation_text": "Justificativa da resposta correta"
}`;
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_IMPORT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.9,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Você cria questões de concurso originais. Nunca parafraseia nem copia enunciados conhecidos. A cada tema recebido, você raciocina sobre ângulos de cobrança variados e inventa uma questão completamente nova. Responde somente com JSON válido." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json({ ok: false, message: `Erro OpenAI: ${response.status} — ${errText.slice(0, 200)}` }, { status: 500 });
    }

    const data = await response.json();
    const result = JSON.parse(extractJson(data?.choices?.[0]?.message?.content || "{}"));

    if (!result.statement) {
      return NextResponse.json({ ok: false, message: "A IA não retornou uma questão válida. Tente novamente." }, { status: 500 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const alts: Array<{ label: string; text: string; is_correct: boolean }> = (Array.isArray(result.alternatives) ? result.alternatives : []).map((a: any, i: number) => ({
      label: String(a.label || String.fromCharCode(65 + i)).toUpperCase().slice(0, 2),
      text: String(a.text || ""),
      is_correct: Boolean(a.is_correct),
    })).filter((a: { text: string }) => a.text);

    if (!alts.length) {
      return NextResponse.json({ ok: false, message: "Alternativas geradas são inválidas." }, { status: 500 });
    }

    if (!alts.some((a) => a.is_correct)) alts[0].is_correct = true;

    return NextResponse.json({
      ok: true,
      question: {
        statement: String(result.statement).trim(),
        question_type: result.question_type === "true_false" ? "true_false" : "multiple_choice",
        alternatives: alts,
        module_name: String(result.module_name || moduleName),
        difficulty_level: Math.max(1, Math.min(5, Number(result.difficulty_level || difficultyLevel))),
        explanation_text: String(result.explanation_text || "").trim() || null,
        subject_id: null,
        subject_ids: [],
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Erro inesperado." },
      { status: 500 },
    );
  }
}
