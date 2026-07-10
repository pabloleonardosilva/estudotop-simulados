import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { findOrCreateEstudoTopBoard } from "@/lib/questions/estudo-top-board";
import { requireAdmin } from "@/lib/server/authGuard";

export const maxDuration = 300;

function extractJson(text: string) {
  const cleaned = text.trim();
  if (cleaned.startsWith("{")) return cleaned;
  const match = cleaned.match(/\{[\s\S]*\}/);
  return match?.[0] || cleaned;
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

function normalizeAlternatives(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const alt = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return {
        label: String(alt.label || String.fromCharCode(65 + index)).trim().toUpperCase().slice(0, 2),
        text: String(alt.text || "").trim(),
        is_correct: Boolean(alt.is_correct),
      };
    })
    .filter((alt) => alt.text);
}

function buildSuggestedTitle(analysis: { title?: string | null; contest_name?: string | null; position_name?: string | null; exam_year?: number | null }): string {
  const parts: string[] = ["Simulado - Clone"];
  if (analysis.contest_name) parts.push(`(${analysis.contest_name})`);
  if (analysis.position_name) parts.push(analysis.position_name);
  if (analysis.exam_year) parts.push(String(analysis.exam_year));
  return parts.join(" - ");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateClones(originals: any[], boardName: string, similarityLevel: string, difficultyAdj: number): Promise<any[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return [];

  const similarityDesc: Record<string, string> = {
    "100": "Máxima (100%) — mesmo assunto e tópico de cobrança, varie apenas o enunciado e os dados",
    "75": "Alta (75%) — mantenha o núcleo temático, varie a abordagem e o contexto",
    "50": "Média (50%) — mantenha os assuntos, varie o tópico de cobrança",
    "25": "Livre (25%) — use a prova como inspiração temática ampla",
  };
  const difficultyDesc: Record<string, string> = {
    "-2": "Muito mais fácil — reduza significativamente a complexidade",
    "-1": "Mais fácil — reduza levemente a complexidade",
    "0": "Mesma dificuldade da prova original",
    "1": "Mais difícil — aumente a complexidade",
    "2": "Muito mais difícil — alto nível de abstração",
  };

  const questionsText = originals
    .map((q, i) => {
      const tipo = q.question_type === "true_false" ? "certo/errado" : "múltipla escolha";
      const altsCount = Array.isArray(q.alternatives) ? q.alternatives.length : 5;
      return `Q${i + 1}: Tema="${q.module_name || "Informática"}" | Tópico="${q.subtopic_name || "Geral"}" | Dif.${q.difficulty_level || 3} | Tipo=${tipo} | Alternativas=${altsCount}`;
    })
    .join("\n");

  const n = originals.length;
  const defaultAltsCount = Math.max(...originals.map((q) => (Array.isArray(q.alternatives) ? q.alternatives.length : 5)));

  const prompt = `Você é especialista em questões de concursos de Informática/TI da banca ${boardName}.

MISSÃO: Crie ${n} questões 100% originais. Para cada questão, siga este raciocínio:
  1. Identifique o tema central (ex: "Mensageiros Eletrônicos", "Planilhas", "Segurança")
  2. Pense em diferentes ângulos de cobrança desse tema (definições, comparações, funcionamento, casos de uso, erros comuns, versões, configurações, comandos…)
  3. Escolha um ângulo que NÃO seja o mais óbvio — seja criativo
  4. Crie enunciado e alternativas COMPLETAMENTE NOVOS a partir desse ângulo — como se estivesse criando do zero, sem nenhuma referência ao texto da questão original

PARÂMETROS:
BANCA: ${boardName}
SIMILARIDADE TEMÁTICA: ${similarityDesc[similarityLevel] ?? similarityDesc["75"]}
NÍVEL DE DIFICULDADE: ${difficultyDesc[String(difficultyAdj)] ?? difficultyDesc["0"]}

LISTA DE TEMAS E FORMATOS (use apenas tema, tópico e formato — NÃO use o conteúdo da questão original):
${questionsText}

REGRAS:
• Enunciado totalmente diferente de qualquer questão conhecida sobre o tema
• Alternativas originais — não use os mesmos distratores clássicos
• Use EXATAMENTE o número de alternativas indicado para cada questão (padrão: ${defaultAltsCount})
• UMA única alternativa correta
• Preserve o tipo (múltipla escolha ou certo/errado) indicado
• Inclua explanation_text com a justificativa da resposta correta

Retorne SOMENTE JSON:
{
  "questions": [
    {
      "original_index": 0,
      "statement": "Enunciado completo...",
      "question_type": "multiple_choice",
      "alternatives": [{"label":"A","text":"...","is_correct":false},...],
      "module_name": "Nome do assunto",
      "difficulty_level": 3,
      "explanation_text": "Justificativa da resposta correta"
    }
  ]
}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_IMPORT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.9,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Você cria questões de concurso originais. Nunca parafraseia nem copia enunciados conhecidos. A cada questão, raciocina sobre o tema e inventa um ângulo de cobrança novo. Responde somente com JSON válido." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) throw new Error(`OpenAI error: ${response.status} ${await response.text()}`);
  const data = await response.json();
  const result = JSON.parse(extractJson(data?.choices?.[0]?.message?.content || "{}"));
  return Array.isArray(result?.questions) ? result.questions : [];
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await params;
    const body = await request.json();
    const similarityLevel = String(body.similarity_level ?? "75");
    const difficultyAdj = Math.max(-2, Math.min(2, Number(body.difficulty_adjustment ?? 0)));

    const supabase = createSupabaseAdminClient();

    const { data: analysis, error: analysisError } = await supabase
      .from("exam_analyses")
      .select("id, title, board_name, exam_year, discipline_id, contest_name, position_name")
      .eq("id", id)
      .single();

    if (analysisError || !analysis) {
      return NextResponse.json({ ok: false, message: "Análise não encontrada." }, { status: 404 });
    }

    const { data: originals, error: questionsError } = await supabase
      .from("exam_analysis_questions")
      .select("id, statement, question_type, alternatives, module_name, subtopic_name, difficulty_level, discipline_id, has_image")
      .eq("exam_analysis_id", id)
      .not("status", "in", '("discarded","variation")')
      .order("created_at", { ascending: true });

    if (questionsError || !originals?.length) {
      return NextResponse.json({ ok: false, message: "Nenhuma questão encontrada nesta análise." }, { status: 400 });
    }

    // Fetch subjects for subject_id matching
    const disciplineIds = [...new Set(originals.map((q) => q.discipline_id).filter(Boolean))];
    const { data: allSubjects } = await supabase
      .from("subjects")
      .select("id, name, discipline_id")
      .in("discipline_id", disciplineIds.length ? disciplineIds : ["00000000-0000-0000-0000-000000000000"])
      .eq("is_active", true);

    const subjectsByDiscipline: Record<string, { id: string; name: string }[]> = {};
    for (const s of allSubjects ?? []) {
      if (!s.discipline_id) continue;
      if (!subjectsByDiscipline[s.discipline_id]) subjectsByDiscipline[s.discipline_id] = [];
      subjectsByDiscipline[s.discipline_id].push({ id: s.id, name: s.name });
    }

    function findSubjectId(disciplineId: string | null, moduleName: string | null): string | null {
      if (!disciplineId) return null;
      const list = subjectsByDiscipline[disciplineId] ?? [];
      if (!list.length) return null;
      if (moduleName) {
        const lower = moduleName.toLowerCase();
        const exact = list.find((s) => s.name.toLowerCase() === lower);
        if (exact) return exact.id;
        const includes = list.find((s) => s.name.toLowerCase().includes(lower) || lower.includes(s.name.toLowerCase()));
        if (includes) return includes.id;
      }
      return list[0].id;
    }

    // Get Estudo TOP board ID
    const board = await findOrCreateEstudoTopBoard(supabase);
    const examBoardId = board.id;
    const examYear = analysis.exam_year ? Number(analysis.exam_year) : new Date().getFullYear();

    // Generate clones via OpenAI
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let generated: any[] = [];
    try {
      generated = await generateClones(originals, analysis.board_name || "Banca", similarityLevel, difficultyAdj);
    } catch (err) {
      return NextResponse.json(
        { ok: false, message: err instanceof Error ? err.message : "Erro ao gerar questões com IA." },
        { status: 500 },
      );
    }

    if (!generated.length) {
      return NextResponse.json({ ok: false, message: "A IA não retornou questões. Tente novamente." }, { status: 500 });
    }

    // Build question list for review (NOT saved to DB yet)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const questions = generated.map((q: any, i: number) => {
      const originalIdx = Number(q.original_index ?? i);
      const original = originals[originalIdx] ?? originals[i] ?? originals[0];
      const qType = q.question_type === "true_false" ? "true_false" : "multiple_choice";
      const alts = normalizeAlternatives(q.alternatives);
      if (!alts.length) {
        alts.push(
          { label: "A", text: "...", is_correct: true },
          { label: "B", text: "...", is_correct: false },
          { label: "C", text: "...", is_correct: false },
          { label: "D", text: "...", is_correct: false },
          { label: "E", text: "...", is_correct: false },
        );
      }
      if (!alts.some((a) => a.is_correct)) alts[0].is_correct = true;
      const subjectId = findSubjectId(original?.discipline_id ?? analysis.discipline_id, q.module_name || original?.module_name);

      return {
        statement: String(q.statement || `[Questão clone ${i + 1}]`).trim(),
        question_type: qType,
        alternatives: alts,
        subject_id: subjectId,
        subject_ids: subjectId ? [subjectId] : [],
        exam_board_id: examBoardId,
        year: examYear,
        difficulty_level: Math.max(1, Math.min(5, Number(q.difficulty_level || 3))),
        explanation_text: String(q.explanation_text || "").trim() || null,
        module_name: String(q.module_name || original?.module_name || "Informática"),
      };
    });

    return NextResponse.json({
      ok: true,
      questions,
      exam_board_id: examBoardId,
      suggested_title: buildSuggestedTitle(analysis),
      question_count: questions.length,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Erro inesperado." },
      { status: 500 },
    );
  }
}
