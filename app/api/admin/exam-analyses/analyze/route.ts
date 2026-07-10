import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { applyImageMarkerToHtml } from "@/app/lib/utils/image-marker";
import { splitIntoQuestionBlocks } from "@/app/lib/utils/question-splitter";
import { requireAdmin } from "@/lib/server/authGuard";

const DEFAULT_DISCIPLINE = "Informática/TI";

function buildAnalysisTitle(contestName: string, positionName: string, examYear: number, boardName: string) {
  return `RaioX - Prova - ${contestName.trim()} - ${positionName.trim()} - ${examYear} - ${boardName.trim()}`;
}

function extractJson(text: string) {
  const cleaned = text.trim();
  if (cleaned.startsWith("{")) return cleaned;
  const match = cleaned.match(/\{[\s\S]*\}/);
  return match?.[0] || cleaned;
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasImage(html: string) {
  return /<img\b/i.test(html) || /imagem\s+associada\s+para\s+resolu/i.test(html);
}

/**
 * Normaliza visual_analysis_status para valores aceitos pelo banco atual.
 * Suporta tanto a constraint antiga (not_required/needs_review/applied/failed)
 * quanto a nova (none/pending/review_required/applied/failed — após migration 014).
 * Usa try-with-fallback: tenta inserir o valor novo; se rejeitado pelo DB, o ORM retorna erro na inserção.
 */
function normalizeVisualStatus(value: unknown, hasQuestionImage: boolean): string {
  if (!hasQuestionImage) return "none";
  const v = String(value || "").trim().toLowerCase();
  if (["applied", "done", "visual_applied"].includes(v)) return "applied";
  if (["failed", "error"].includes(v)) return "failed";
  if (["review_required", "needs_review", "need_review"].includes(v)) return "review_required";
  if (["pending", "image_detected", "has_image"].includes(v)) return "pending";
  return "review_required";
}

function formatQuestionTextForDisplay(value: string) {
  if (!value) return value;
  // Usa o utilitário centralizado — vermelho #dc2626, 1.3em, negrito
  return applyImageMarkerToHtml(String(value));
}

function normalizeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function normalizeAlternatives(value: unknown, questionType: string) {
  if (!Array.isArray(value)) {
    if (questionType === "true_false") {
      return [
        { label: "C", text: "Certo", is_correct: false },
        { label: "E", text: "Errado", is_correct: false },
      ];
    }
    return [];
  }

  return value
    .map((item, index) => {
      const alt = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const fallbackLabel = String.fromCharCode(65 + index);
      return {
        label: String(alt.label || fallbackLabel).trim().toUpperCase().slice(0, 2),
        text: String(alt.text || "").trim(),
        is_correct: Boolean(alt.is_correct),
      };
    })
    .filter((alt) => alt.text || alt.label);
}

function safeDifficulty(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(5, Math.max(1, Math.round(n)));
}

function calculateDashboard(questions: any[]) {
  const total = questions.length;
  const withImage = questions.filter((q) => q.has_image).length;
  const modules = new Map<string, { count: number; difficultySum: number; difficultyCount: number; subtopics: Map<string, Set<string>>; profiles: Map<string, number> }>();
  const difficulty = new Map<number, number>();
  const profiles = new Map<string, number>();

  for (const q of questions) {
    const moduleName = q.module_name || "Não classificado";
    const current = modules.get(moduleName) || {
      count: 0,
      difficultySum: 0,
      difficultyCount: 0,
      subtopics: new Map<string, Set<string>>(),
      profiles: new Map<string, number>(),
    };
    current.count += 1;
    if (q.difficulty_level) {
      current.difficultySum += q.difficulty_level;
      current.difficultyCount += 1;
      difficulty.set(q.difficulty_level, (difficulty.get(q.difficulty_level) || 0) + 1);
    }
    const subtopic = q.subtopic_name || "Geral";
    const points = current.subtopics.get(subtopic) || new Set<string>();
    for (const point of q.knowledge_points || []) points.add(point);
    current.subtopics.set(subtopic, points);

    const profile = q.charging_profile || "Não classificado";
    current.profiles.set(profile, (current.profiles.get(profile) || 0) + 1);
    profiles.set(profile, (profiles.get(profile) || 0) + 1);
    modules.set(moduleName, current);
  }

  const modulesSummary = Array.from(modules.entries())
    .map(([module, data]) => ({
      module,
      question_count: data.count,
      percentage: total ? Math.round((data.count / total) * 100) : 0,
      average_difficulty: data.difficultyCount ? Number((data.difficultySum / data.difficultyCount).toFixed(1)) : null,
      charging_profile: Array.from(data.profiles.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "Não classificado",
      subtopics: Array.from(data.subtopics.entries()).map(([name, points]) => ({
        name,
        knowledge_points: Array.from(points),
      })),
    }))
    .sort((a, b) => b.question_count - a.question_count || a.module.localeCompare(b.module));

  return {
    dashboard: {
      total_questions_detected: total,
      total_it_questions: total,
      ignored_questions: 0,
      total_images: withImage,
      visual_analysis_applied: questions.filter((q) => q.has_image && q.visual_analysis_status === "applied").length,
      top_module: modulesSummary[0]?.module || null,
      average_difficulty: questions.some((q) => q.difficulty_level)
        ? Number((questions.reduce((sum, q) => sum + Number(q.difficulty_level || 0), 0) / questions.filter((q) => q.difficulty_level).length).toFixed(1))
        : null,
      difficulty_distribution: Array.from(difficulty.entries()).map(([level, count]) => ({ level, count })),
      charging_profile_distribution: Array.from(profiles.entries()).map(([profile, count]) => ({ profile, count })),
    },
    modulesSummary,
  };
}

function fallbackParseQuestions(rawContent: string, boardName: string, examYear: number, disciplineName: string) {
  const plain = stripHtml(rawContent) || rawContent;
  const chunks = plain
    .split(/(?=\b(?:Quest[aã]o|Q\.)\s*\d+|^\s*\d+[\).\-]\s+)/gi)
    .map((item) => item.trim())
    .filter((item) => item.length > 30);

  const sourceChunks = chunks.length ? chunks : [plain];

  return sourceChunks.map((chunk, index) => {
    const alts = Array.from(chunk.matchAll(/(?:^|\s)([A-E])\)\s*([^A-E]{8,}?)(?=\s+[A-E]\)|$)/g)).map((m) => ({
      label: m[1],
      text: m[2].trim(),
      is_correct: false,
    }));
    const moduleGuess = /excel|planilha|c[eé]lula|f[oó]rmula/i.test(chunk)
      ? "Microsoft Excel"
      : /word|documento|par[aá]grafo|mala direta/i.test(chunk)
      ? "Microsoft Word"
      : /seguran|phishing|v[ií]rus|worm|malware|backup/i.test(chunk)
      ? "Segurança da Informação"
      : /windows|explorador|pasta|arquivo|atalho/i.test(chunk)
      ? "Microsoft Windows"
      : /e-mail|email|correio/i.test(chunk)
      ? "Correio Eletrônico"
      : "Informática";

    return {
      original_number: String(index + 1),
      statement: chunk,
      question_type: alts.length ? "multiple_choice" : "true_false",
      alternatives: alts.length ? alts : [
        { label: "C", text: "Certo", is_correct: false },
        { label: "E", text: "Errado", is_correct: false },
      ],
      answer_key: null,
      is_annulled: false,
      board_name: boardName,
      year: examYear,
      discipline_name: disciplineName,
      module_name: moduleGuess,
      subtopic_name: "Classificação pendente",
      knowledge_points: ["Conhecimento a revisar pelo professor"],
      difficulty_level: 3,
      difficulty_reason: "Classificação automática provisória gerada sem retorno estruturado da IA.",
      charging_profile: "A revisar",
      explanation_text: "",
      has_image: hasImage(chunk),
      visual_analysis_status: hasImage(chunk) ? "review_required" : "none",
      ai_confidence: 0.35,
    };
  });
}

async function analyzeWithOpenAI({ rawContent, contestName, positionName, examYear, boardName, disciplineName }: {
  rawContent: string;
  contestName: string;
  positionName: string;
  examYear: number;
  boardName: string;
  disciplineName: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const prompt = `Você é especialista em Informática/TI para concursos públicos e trabalha no módulo Raio-X de Provas do EstudoTOP.

Analise o conteúdo colado pelo professor. Foque apenas em questões da disciplina selecionada: ${disciplineName}. Ignore questões de outras disciplinas.

Cabeçalho informado:
- Concurso: ${contestName}
- Cargo: ${positionName}
- Ano: ${examYear}
- Banca: ${boardName}

Tarefas:
1. Identifique as questões de Informática/TI.
2. Separe enunciado e alternativas, preservando HTML e referências de imagem quando existirem.
3. Tente sugerir o gabarito. Se não tiver segurança, deixe answer_key null e alternativas com is_correct false.
4. Permita questão anulada usando is_annulled=true quando o texto indicar anulação.
5. Classifique por assunto principal, tópico de cobrança, conhecimentos cobrados, dificuldade 1-5 e perfil de cobrança.
6. Para imagens, marque has_image=true e visual_analysis_status="applied" quando a imagem tiver sido considerada, ou "needs_review" se depender de conferência.
7. Gere um resumo estratégico completo, mas objetivo. Inclua uma visão geral do concurso/prova quando houver dados confiáveis no texto ou no cabeçalho. Se não houver informação sobre data da prova, adiamento ou cancelamento, diga que essa informação não foi identificada no material analisado, sem inventar.
8. Na parte de Informática/TI, seja profundo: para cada assunto principal, explique exatamente o que foi cobrado dentro dele. Ex.: Microsoft Word → formatação, estilos, atalhos, caminho de menu; Segurança da Informação → vírus, worm, phishing, backup; Microsoft Excel → função SE, referências, filtros etc.
9. Use a nomenclatura: assunto principal e tópico de cobrança. Internamente, retorne em module_name e subtopic_name.

Assuntos principais preferenciais: Microsoft Word, Microsoft Excel, Microsoft PowerPoint, Microsoft Windows, Linux, Internet, Navegadores, Correio Eletrônico, Segurança da Informação, Redes de Computadores, Banco de Dados, Google Workspace, Microsoft 365, Hardware, Software, Sistemas Operacionais, Inteligência Artificial, LGPD e Privacidade.

Retorne SOMENTE JSON válido neste formato:
{
  "summary_text": "...",
  "questions": [
    {
      "original_number": "1",
      "statement": "HTML do enunciado",
      "question_type": "multiple_choice",
      "alternatives": [{"label":"A","text":"...","is_correct":false}],
      "answer_key": "A",
      "is_annulled": false,
      "module_name": "Microsoft Word",
      "subtopic_name": "Atalhos de teclado",
      "knowledge_points": ["Ctrl+B", "negrito"],
      "difficulty_level": 2,
      "difficulty_reason": "...",
      "charging_profile": "Conceitual / prática / interpretação / comando de interface / pegadinha terminológica",
      "explanation_text": "comentário pedagógico curto, se possível",
      "has_image": false,
      "visual_analysis_status": "none",
      "ai_confidence": 0.84
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
      temperature: 0.15,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Responda somente JSON válido. Não use markdown." },
        { role: "user", content: `${prompt}\n\nCONTEÚDO DA PROVA:\n${rawContent}` },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || "";
  return JSON.parse(extractJson(content));
}

// Analisa um único bloco (questão) individualmente — mais confiável que enviar texto completo
async function analyzeBlockWithOpenAI(block: string, opts: {
  contestName: string; positionName: string; examYear: number; boardName: string; disciplineName: string; blockNumber: number;
}): Promise<any | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const prompt = `Analise a questão abaixo de ${opts.disciplineName} (${opts.contestName || "Concurso"} — ${opts.boardName || "Banca"} — ${opts.examYear || "Ano"}).

QUESTÃO:
${block}

Se o trecho não for uma questão válida, retorne {"valid":false}.

REGRA CRÍTICA — O QUE É O STATEMENT:
O campo "statement" deve conter TODO o texto da questão até o início das alternativas com letra (A, B, C, D, E).
Isso INCLUI obrigatoriamente:
- O texto principal da questão
- Afirmativas com algarismos romanos (I. II. III. IV.) mesmo que tenham texto longo — ex: "I.Navegadores funcionam exclusivamente..." é afirmativa do enunciado, NÃO uma alternativa
- Itens numerados (1) 2) 3) ou 1. 2. 3.) que fazem parte do corpo da questão
- Frases de transição como "Analise as afirmativas:", "É CORRETO o que se afirma em:", "Assinale"
NÃO inclua no statement: as linhas que começam com A) B) C) D) E) (ou A. B. C. D.) — essas são as alternativas.

Retorne SOMENTE JSON:
{
  "valid": true,
  "original_number": "${opts.blockNumber}",
  "statement": "Todo o enunciado incluindo afirmativas I. II. III. e textos de transição — exclui apenas as letras A B C D E",
  "question_type": "multiple_choice",
  "alternatives": [{"label":"A","text":"texto completo da alternativa A","is_correct":false}],
  "answer_key": null,
  "is_annulled": false,
  "module_name": "Microsoft Word",
  "subtopic_name": "Atalhos de teclado",
  "knowledge_points": ["..."],
  "difficulty_level": 2,
  "difficulty_reason": "...",
  "charging_profile": "Conceitual",
  "explanation_text": "",
  "has_image": false,
  "visual_analysis_status": "not_required",
  "ai_confidence": 0.9
}

Assuntos preferenciais: Microsoft Word, Excel, PowerPoint, Windows, Linux, Internet, Segurança da Informação, Redes de Computadores, Banco de Dados, Hardware, Software, Sistemas Operacionais, LGPD.`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_IMPORT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Responda somente JSON válido." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) return null;
  const parsed = JSON.parse(extractJson((await response.json())?.choices?.[0]?.message?.content || "{}"));
  return parsed?.valid === false ? null : parsed;
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await request.json();
    const contestName = String(body.contest_name || "").trim();
    const positionName = String(body.position_name || "").trim();
    const examYear = Number(body.exam_year);
    const boardName = String(body.board_name || "").trim();
    const title = buildAnalysisTitle(contestName, positionName, examYear, boardName);
    const disciplineId = body.discipline_id ? String(body.discipline_id) : null;
    const disciplineName = String(body.discipline_name || DEFAULT_DISCIPLINE).trim() || DEFAULT_DISCIPLINE;
    const rawContent = String(body.raw_content || "").trim();

    if (!contestName || !positionName || !boardName || !Number.isInteger(examYear)) {
      return NextResponse.json({ ok: false, message: "Preencha concurso, cargo, ano e banca." }, { status: 400 });
    }

    if (rawContent.length < 40) {
      return NextResponse.json({ ok: false, message: "Cole o texto da prova antes de analisar." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: created, error: createError } = await supabase
      .from("exam_analyses")
      .insert({
        title,
        contest_name: contestName,
        position_name: positionName,
        exam_year: examYear,
        board_name: boardName,
        discipline_id: disciplineId,
        discipline_name: disciplineName,
        source_type: "rich_text",
        raw_content: rawContent,
        status: "processing",
      })
      .select("id")
      .single();

    if (createError) throw new Error(createError.message);

    // Detecta blocos client-side style — mesma lógica usada no modal para garantir paridade
    const blocks = splitIntoQuestionBlocks(rawContent);

    type BlockPair = { question: any; originalBlock: string };
    let aiPairs: BlockPair[] = [];
    let summaryText = "";

    if (!process.env.OPENAI_API_KEY) {
      aiPairs = fallbackParseQuestions(rawContent, boardName, examYear, disciplineName)
        .map((q: any) => ({ question: q, originalBlock: "" }));
    } else {
      // Processa cada bloco individualmente (1 questão = 1 chamada) em lotes de 5 paralelos.
      // Rastreia o bloco original junto ao resultado para poder restaurar frases de imagem
      // que a IA pode ter removido do statement.
      const BATCH_SIZE = 5;
      for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
        const batch = blocks.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map((block, j) =>
            analyzeBlockWithOpenAI(block, {
              contestName, positionName, examYear, boardName, disciplineName, blockNumber: i + j + 1,
            })
              .then((q) => (q ? { question: q, originalBlock: block } : null))
              .catch(() => null)
          )
        );
        aiPairs.push(...(results.filter(Boolean) as BlockPair[]));
      }

      if (aiPairs.length === 0) {
        aiPairs = fallbackParseQuestions(rawContent, boardName, examYear, disciplineName)
          .map((q: any) => ({ question: q, originalBlock: "" }));
      }

      // Gera o resumo estratégico com o texto completo (separado da detecção)
      try {
        const summaryResult = await analyzeWithOpenAI({ rawContent, contestName, positionName, examYear, boardName, disciplineName });
        summaryText = String(summaryResult?.summary_text || "");
      } catch {
        summaryText = "";
      }
    }

    const normalizedQuestions = aiPairs.map(({ question: q, originalBlock }, index: number) => {
      const questionType = q?.question_type === "true_false" ? "true_false" : "multiple_choice";
      const alternatives = normalizeAlternatives(q?.alternatives, questionType);
      const answerKey = q?.answer_key ? String(q.answer_key).trim().toUpperCase() : alternatives.find((a) => a.is_correct)?.label || null;

      // Preserva a frase de imagem caso a IA a tenha removido do statement mas o bloco original a continha.
      const rawStatement = String(q?.statement || "").trim();
      const originalHadImagePhrase = hasImage(originalBlock) && /imagem\s+associada\s+para\s+resolu/i.test(originalBlock);
      const statementLacksPhrase = !hasImage(rawStatement);
      const finalStatement = originalHadImagePhrase && statementLacksPhrase
        ? `${rawStatement}\n\nImagem associada para resolução da questão`
        : rawStatement;

      const questionHasImage = Boolean(q?.has_image) || hasImage(finalStatement) || alternatives.some((a) => hasImage(a.text)) || originalHadImagePhrase;

      return {
        exam_analysis_id: created.id,
        // Usa sempre o índice sequencial do bloco — ignora o número retornado pelo OpenAI
        // que pode ser não-sequencial ou duplicado quando processado em lotes individuais
        original_number: String(index + 1),
        statement: formatQuestionTextForDisplay(finalStatement),
        question_type: questionType,
        alternatives: alternatives.map((alt) => ({ ...alt, text: formatQuestionTextForDisplay(alt.text) })),
        answer_key: answerKey,
        is_annulled: Boolean(q?.is_annulled),
        board_name: boardName,
        year: examYear,
        discipline_id: disciplineId,
        discipline_name: disciplineName,
        module_name: String(q?.module_name || "Informática").trim(),
        subtopic_name: String(q?.subtopic_name || "Geral").trim(),
        knowledge_points: normalizeArray(q?.knowledge_points),
        difficulty_level: safeDifficulty(q?.difficulty_level),
        difficulty_reason: String(q?.difficulty_reason || "").trim(),
        charging_profile: String(q?.charging_profile || "Conceitual").trim(),
        explanation_text: String(q?.explanation_text || "").trim(),
        has_image: questionHasImage,
        visual_analysis_status: normalizeVisualStatus(q?.visual_analysis_status, questionHasImage),
        ai_confidence: Number.isFinite(Number(q?.ai_confidence)) ? Number(q.ai_confidence) : null,
        status: "detected",
        source_origin: "exam_analysis",
      };
    }).filter((q: any) => q.statement);

    if (normalizedQuestions.length === 0) {
      await supabase
        .from("exam_analyses")
        .update({ status: "failed", error_message: "Nenhuma questão foi identificada no texto. Verifique se o texto da prova foi colado corretamente e tente novamente." })
        .eq("id", created.id);
      return NextResponse.json({ ok: false, message: "Nenhuma questão foi identificada no texto. Verifique se o texto da prova foi colado corretamente e tente novamente." }, { status: 422 });
    }

    // Remove source_origin para compatibilidade — coluna pode não existir em versões antigas
    const questionsToInsert = normalizedQuestions.map(({ source_origin: _so, ...q }: any) => q);

    const { error: questionsError } = await supabase
      .from("exam_analysis_questions")
      .insert(questionsToInsert);

    if (questionsError) {
      // Tenta sem campos opcionais para compatibilidade com esquemas antigos
      const minimal = questionsToInsert.map(({ ai_confidence: _ac, difficulty_reason: _dr, ...q }: any) => q);
      const { error: retryError } = await supabase.from("exam_analysis_questions").insert(minimal);
      if (retryError) throw new Error(retryError.message);
    }

    const { dashboard, modulesSummary } = calculateDashboard(questionsToInsert);

    const initialSummary = summaryText || "Análise gerada. Revise os módulos, gabaritos e classificações antes de publicar ou enviar para revisão.";

    await supabase
      .from("exam_analyses")
      .update({
        status: "review_pending",
        summary_text: initialSummary,
        ai_summary_text: initialSummary,
        final_summary_text: initialSummary,
        dashboard,
        modules_summary: modulesSummary,
      })
      .eq("id", created.id);

    return NextResponse.json({ ok: true, id: created.id });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro inesperado ao analisar prova." },
      { status: 500 }
    );
  }
}
