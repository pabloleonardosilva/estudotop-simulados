import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdmin } from "@/lib/server/authGuard";

function extractJson(text: string) {
  const cleaned = text.trim();
  if (cleaned.startsWith("{")) return cleaned;
  const match = cleaned.match(/\{[\s\S]*\}/);
  return match?.[0] || cleaned;
}

function safeCount(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(10, Math.max(1, Math.round(n)));
}

function fidelityDescription(value: string) {
  if (value === "100") return "Espelho fiel: manter mesmo assunto principal, tópico de cobrança, dificuldade e perfil de cobrança.";
  if (value === "75") return "Muito próxima: manter o núcleo e variar contexto/dados.";
  if (value === "50") return "Equilibrada: manter o assunto principal, podendo variar tópico de cobrança e abordagem.";
  return "Mais livre: usar a questão como inspiração pedagógica dentro da disciplina.";
}

function normalizeAlternatives(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const alt = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return {
      label: String(alt.label || String.fromCharCode(65 + index)).trim().toUpperCase().slice(0, 2),
      text: String(alt.text || "").trim(),
      is_correct: Boolean(alt.is_correct),
    };
  }).filter((alt) => alt.text || alt.label);
}

function stripHtml(html: string): string {
  return html
    .replace(/data:[^"';]+;base64,[^"'>\s]+/gi, "[imagem]")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s{2,}/g, " ")
    .trim();
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "…";
}

async function generateWithOpenAI(original: any, count: number, fidelity: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const cleanStatement = truncate(stripHtml(String(original.statement || "")), 3000);
  const cleanAlternatives = (Array.isArray(original.alternatives) ? original.alternatives : []).map(
    (a: any) => ({ label: a.label, text: truncate(stripHtml(String(a.text || "")), 400), is_correct: a.is_correct }),
  );

  const prompt = `Gere ${count} variações inéditas de uma questão de concurso de Informática/TI.

Grau de fidelidade: ${fidelityDescription(fidelity)}

Regras:
- Não copie literalmente a questão original.
- Preserve a correção técnica.
- Gere alternativas, gabarito sugerido e comentário.
- Retorne SOMENTE JSON válido.

Questão original:
Assunto principal: ${original.module_name || "Informática"}
Tópico de cobrança: ${original.subtopic_name || "Geral"}
Dificuldade: ${original.difficulty_level || 3}
Perfil: ${original.charging_profile || "Conceitual"}
Enunciado: ${cleanStatement}
Alternativas: ${JSON.stringify(cleanAlternatives)}

Formato:
{
  "questions": [
    {
      "statement": "...",
      "question_type": "multiple_choice",
      "alternatives": [{"label":"A","text":"...","is_correct":false}],
      "answer_key": "A",
      "module_name": "...",
      "subtopic_name": "...",
      "knowledge_points": ["..."],
      "difficulty_level": 3,
      "difficulty_reason": "...",
      "charging_profile": "...",
      "explanation_text": "..."
    }
  ]
}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_IMPORT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Responda somente JSON válido." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) throw new Error(`OpenAI: ${response.status} ${await response.text()}`);
  const data = await response.json();
  return JSON.parse(extractJson(data?.choices?.[0]?.message?.content || "{}"));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string; questionId: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const { id, questionId } = await params;
    const body = await request.json();
    const count = safeCount(body.count);
    const fidelity = String(body.fidelity || "100");

    const supabase = createSupabaseAdminClient();
    const { data: original, error } = await supabase
      .from("exam_analysis_questions")
      .select("*")
      .eq("id", questionId)
      .eq("exam_analysis_id", id)
      .single();

    if (error) throw new Error(error.message);

    let result: any = null;
    try {
      result = await generateWithOpenAI(original, count, fidelity);
    } catch (error) {
      if (process.env.OPENAI_API_KEY) throw error;
    }

    const generated = Array.isArray(result?.questions) && result.questions.length
      ? result.questions
      : Array.from({ length: count }).map((_, index) => ({
          statement: `${original.statement}\n\n[Variação ${index + 1}: ajuste o contexto e revise antes de enviar ao banco.]`,
          question_type: original.question_type,
          alternatives: original.alternatives || [],
          answer_key: original.answer_key || null,
          module_name: original.module_name,
          subtopic_name: original.subtopic_name,
          knowledge_points: original.knowledge_points || [],
          difficulty_level: original.difficulty_level,
          difficulty_reason: `Variação provisória criada no grau ${fidelity}%. Revise antes de usar.`,
          charging_profile: original.charging_profile,
          explanation_text: original.explanation_text || "",
        }));

    const rows = generated.map((q: any, index: number) => ({
      exam_analysis_id: id,
      parent_question_id: questionId,
      original_number: `${original.original_number || "Q"}.${index + 1}`,
      statement: String(q.statement || "").trim(),
      question_type: q.question_type === "true_false" ? "true_false" : "multiple_choice",
      alternatives: normalizeAlternatives(q.alternatives),
      answer_key: q.answer_key ? String(q.answer_key).trim().toUpperCase() : null,
      is_annulled: false,
      board_name: original.board_name,
      year: original.year,
      discipline_id: original.discipline_id,
      discipline_name: original.discipline_name,
      module_name: String(q.module_name || original.module_name || "Informática"),
      subtopic_name: String(q.subtopic_name || original.subtopic_name || "Geral"),
      knowledge_points: Array.isArray(q.knowledge_points) ? q.knowledge_points : original.knowledge_points || [],
      difficulty_level: Number(q.difficulty_level || original.difficulty_level || 3),
      difficulty_reason: String(q.difficulty_reason || "Variação gerada por IA."),
      charging_profile: String(q.charging_profile || original.charging_profile || "Conceitual"),
      explanation_text: String(q.explanation_text || ""),
      has_image: false,
      visual_analysis_status: "none",
      ai_confidence: null,
      status: "variation",
      source_origin: "exam_question_variation",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })).filter((row: any) => row.statement);

    if (!rows.length) {
      return NextResponse.json({ ok: false, message: "Nenhuma variação foi gerada." }, { status: 400 });
    }

    const { data: inserted, error: insertError } = await supabase
      .from("exam_analysis_questions")
      .insert(rows)
      .select();
    if (insertError) throw new Error(insertError.message);

    return NextResponse.json({ ok: true, created_count: rows.length, variations: inserted ?? [] });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Erro ao gerar variações." }, { status: 500 });
  }
}
