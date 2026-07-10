import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdmin } from "@/lib/server/authGuard";

const OPENAI_MODEL = "gpt-4.1-mini";

type QuestionType = "multiple_choice" | "true_false";

type GeneratedAlternative = {
  label: string;
  text: string;
  is_correct: boolean;
};

type GeneratedQuestion = {
  statement: string;
  difficulty_level?: number | string | null;
  alternatives: GeneratedAlternative[];
  explanation_text?: string | null;
};

type VariationRequestBody = {
  quantity?: number | string | null;
  difficulty_level?: number | string | null;
  include_explanations?: boolean | null;
  additional_instructions?: string | null;
};

type OpenAITextContent = { text?: string };
type OpenAIOutputItem = { content?: OpenAITextContent[] };
type OpenAIResponse = {
  output_text?: string;
  output?: OpenAIOutputItem[];
  error?: { message?: string };
};

type SourceQuestionRow = {
  id: string;
  code?: string | null;
  statement: string;
  status?: string | null;
  question_type?: string | null;
  difficulty_level?: number | null;
  year?: number | null;
  explanation_text?: string | null;
  exam_boards?: { id: string; name: string } | null;
  subjects?: {
    id: string;
    name: string;
    discipline_id?: string | null;
    disciplines?: { id: string; name: string } | null;
  } | null;
  question_subjects?: Array<{
    subjects?: {
      id: string;
      name: string;
      discipline_id?: string | null;
      disciplines?: { id: string; name: string } | null;
    } | null;
  }>;
  question_alternatives?: Array<{
    label?: string | null;
    text?: string | null;
    is_correct?: boolean | null;
    order_number?: number | null;
  }>;
};

function clean(value?: string | null) {
  return (value || "").trim();
}

function stripHtml(value: string) {
  return clean(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "e")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeComparable(value?: string | null) {
  return stripHtml(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textSimilarity(a?: string | null, b?: string | null) {
  const wordsA = new Set(
    normalizeComparable(a)
      .split(" ")
      .filter((word) => word.length > 2),
  );
  const wordsB = new Set(
    normalizeComparable(b)
      .split(" ")
      .filter((word) => word.length > 2),
  );

  if (!wordsA.size || !wordsB.size) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  return union ? intersection / union : 0;
}

function normalizeDifficulty(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 5 ? parsed : null;
}

function distributedDifficulty(index: number, sourceDifficulty: number | null) {
  if (sourceDifficulty) {
    const options = Array.from(
      new Set([
        Math.max(1, sourceDifficulty - 1),
        sourceDifficulty,
        Math.min(5, sourceDifficulty + 1),
        ((index + 2) % 5) + 1,
      ]),
    );
    return options[index % options.length];
  }

  return (index % 5) + 1;
}

function normalizeQuestionType(value?: string | null): QuestionType {
  return value === "true_false" ? "true_false" : "multiple_choice";
}

function extractOpenAIText(result: OpenAIResponse): string {
  if (!result) return "";

  if (typeof result.output_text === "string" && result.output_text.trim()) {
    return result.output_text.trim();
  }

  if (Array.isArray(result.output)) {
    const text = result.output
      .flatMap((item) => item.content || [])
      .map((content) => content.text || "")
      .join("\n")
      .trim();

    if (text) return text;
  }

  return "";
}

function extractJsonArray(text: string): GeneratedQuestion[] {
  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("A IA não retornou uma lista JSON válida.");
  }

  const parsed = JSON.parse(cleaned.slice(start, end + 1));

  if (!Array.isArray(parsed)) {
    throw new Error("A resposta da IA não está no formato esperado.");
  }

  return parsed;
}

function expectedLabels(
  questionType: QuestionType,
  alternativesLength: number,
) {
  if (questionType === "true_false") return ["CERTO", "ERRADO"];
  return alternativesLength === 5
    ? ["A", "B", "C", "D", "E"]
    : ["A", "B", "C", "D"];
}

function validateGeneratedQuestion(
  question: GeneratedQuestion,
  index: number,
  questionType: QuestionType,
) {
  const statement = clean(question.statement);

  if (!statement || stripHtml(statement).length < 25) {
    throw new Error(`A variação ${index + 1} veio sem enunciado válido.`);
  }

  const alternatives = question.alternatives || [];

  if (!Array.isArray(alternatives)) {
    throw new Error(
      `A variação ${index + 1} precisa ter alternativas válidas.`,
    );
  }

  if (questionType === "true_false") {
    if (alternatives.length !== 2) {
      throw new Error(
        `A variação ${index + 1} precisa ter apenas Certo e Errado.`,
      );
    }
  } else if (alternatives.length < 4 || alternatives.length > 5) {
    throw new Error(`A variação ${index + 1} precisa ter 4 ou 5 alternativas.`);
  }

  for (const label of expectedLabels(questionType, alternatives.length)) {
    const found = alternatives.find(
      (alt) => clean(alt.label).toUpperCase() === label,
    );

    if (!found || !stripHtml(found.text)) {
      throw new Error(
        questionType === "true_false"
          ? `A variação ${index + 1} precisa conter ${label === "CERTO" ? "Certo" : "Errado"}.`
          : `A variação ${index + 1} está sem alternativa ${label}.`,
      );
    }
  }

  const correct = alternatives.filter((alt) => Boolean(alt.is_correct));

  if (correct.length !== 1) {
    throw new Error(
      `A variação ${index + 1} precisa ter exatamente uma resposta correta.`,
    );
  }

  const normalizedAlternatives = alternatives.map((alt) =>
    normalizeComparable(alt.text),
  );
  const uniqueAlternatives = new Set(normalizedAlternatives.filter(Boolean));

  if (
    uniqueAlternatives.size !== normalizedAlternatives.filter(Boolean).length
  ) {
    throw new Error(`A variação ${index + 1} possui alternativas repetidas.`);
  }
}

function buildQuestionTypeInstruction(questionType: QuestionType) {
  if (questionType === "true_false") {
    return `Mantenha o tipo assertiva para julgamento Certo ou Errado.
- O enunciado deve ser uma assertiva técnica, clara e julgável.
- Retorne exatamente duas alternativas:
  { "label": "CERTO", "text": "Certo", "is_correct": true ou false }
  { "label": "ERRADO", "text": "Errado", "is_correct": true ou false }
- Exatamente uma delas deve estar correta.`;
  }

  return `Mantenha o tipo questão objetiva de múltipla escolha.
- Use 4 alternativas A, B, C, D ou 5 alternativas A, B, C, D, E quando fizer sentido.
- Exatamente uma alternativa deve estar correta.
- As alternativas erradas devem ser plausíveis e diferentes entre si.`;
}

function buildPrompt({
  quantity,
  sourceQuestion,
  sourceAlternatives,
  disciplineName,
  subjectNames,
  inspiringBoardName,
  questionType,
  selectedDifficulty,
  includeExplanations,
  additionalInstructions,
}: {
  quantity: number;
  sourceQuestion: SourceQuestionRow;
  sourceAlternatives: Array<{
    label: string;
    text: string;
    is_correct: boolean;
  }>;
  disciplineName: string;
  subjectNames: string[];
  inspiringBoardName: string;
  questionType: QuestionType;
  selectedDifficulty: number | null;
  includeExplanations: boolean;
  additionalInstructions: string;
}) {
  const difficultyInstruction = selectedDifficulty
    ? `Todas as variações devem ter dificuldade ${selectedDifficulty} em uma escala de 1 a 5. Retorne difficulty_level: ${selectedDifficulty} em cada questão.`
    : "A dificuldade não foi fixada. Gere variações com níveis diferentes, distribuindo difficulty_level entre 1 e 5 conforme fizer sentido.";

  const sourceCorrect = sourceAlternatives.find((alt) => alt.is_correct);
  const sourceAlternativesText = sourceAlternatives
    .map(
      (alt) =>
        `${alt.label}) ${stripHtml(alt.text)}${alt.is_correct ? " [correta]" : ""}`,
    )
    .join("\n");

  const sampleAlternatives =
    questionType === "true_false"
      ? '{ "label": "CERTO", "text": "Certo", "is_correct": true },\n      { "label": "ERRADO", "text": "Errado", "is_correct": false }'
      : '{ "label": "A", "text": "Texto da alternativa A", "is_correct": false },\n      { "label": "B", "text": "Texto da alternativa B", "is_correct": true },\n      { "label": "C", "text": "Texto da alternativa C", "is_correct": false },\n      { "label": "D", "text": "Texto da alternativa D", "is_correct": false }';

  return `Você é um professor especialista em concursos públicos brasileiros.

Crie ${quantity} variação(ões) INÉDITA(S) a partir da questão-modelo abaixo.

DISCIPLINA: ${disciplineName}
ASSUNTO(S): ${subjectNames.join(", ") || "Não informado"}
BANCA INSPIRADORA: ${inspiringBoardName}
TIPO: ${questionType === "true_false" ? "Assertiva / Certo ou Errado" : "Questão com alternativas"}

QUESTÃO-MODELO — use apenas como referência temática, não como texto a reescrever:
ENUNCIADO ORIGINAL:
${stripHtml(sourceQuestion.statement)}

ALTERNATIVAS ORIGINAIS:
${sourceAlternativesText}

GABARITO ORIGINAL: ${sourceCorrect ? sourceCorrect.label : "não identificado"}

OBJETIVO:
- As novas questões devem tratar do mesmo tópico/conteúdo central da questão-modelo.
- Não copie frases, estrutura, cenário, ordem lógica, exemplos ou alternativas da questão-modelo.
- Varie tamanho, formato, abordagem, nível de dificuldade, caso prático e tipo de pegadinha.
- A questão precisa parecer nova para revisão humana, não uma paráfrase do original.
- Não cite que é uma variação.

${buildQuestionTypeInstruction(questionType)}

DIFICULDADE:
${difficultyInstruction}

ORIENTAÇÕES ADICIONAIS DO PROFESSOR:
${additionalInstructions || "Nenhuma orientação adicional foi informada."}

REVISÃO OBRIGATÓRIA ANTES DE RESPONDER:
Faça 3 revisões internas, nesta ordem, antes de retornar o JSON:
1. Revisão de gabarito: confirme que existe exatamente uma resposta correta.
2. Revisão de plausibilidade: confirme que não há duas respostas possíveis, resposta ambígua ou nenhuma resposta correta.
3. Revisão de originalidade: confirme que o enunciado e as alternativas não são cópias nem paráfrases próximas da questão-modelo.

REGRAS IMPORTANTES:
- Retorne apenas JSON válido.
- Não use markdown.
- Não escreva comentários fora do JSON.
- Escreva em português do Brasil.
- O enunciado deve ser claro, completo e adequado para concursos.
- Não invente lei, norma, prazo, artigo, súmula ou entendimento jurisprudencial quando não houver base suficiente.
- A resposta correta deve vir com is_correct: true.
- Todas as demais alternativas devem vir com is_correct: false.
- ${includeExplanations ? "Inclua explanation_text com uma explicação curta e didática." : "Defina explanation_text como null."}
- Inclua difficulty_level em cada questão, com número inteiro de 1 a 5.

RETORNE APENAS UM JSON ARRAY no formato abaixo:

[
  {
    "statement": "Enunciado da nova questão...",
    "difficulty_level": ${selectedDifficulty || 3},
    "alternatives": [
      ${sampleAlternatives}
    ],
    "explanation_text": ${includeExplanations ? '"Explicação curta..."' : "null"}
  }
]`;
}

async function findOrCreateEstudoTopBoard(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
) {
  const { data: existing, error: existingError } = await supabase
    .from("exam_boards")
    .select("id, name")
    .ilike("name", "Estudo TOP")
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing?.id) return existing;

  const { data, error } = await supabase
    .from("exam_boards")
    .insert({ name: "Estudo TOP", is_active: true })
    .select("id, name")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

function getSubjectRows(question: SourceQuestionRow) {
  const rows = (question.question_subjects || [])
    .map((item) => item.subjects)
    .filter(Boolean) as NonNullable<SourceQuestionRow["subjects"]>[];

  if (rows.length > 0) return rows;
  return question.subjects ? [question.subjects] : [];
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
        { status: 500 },
      );
    }

    const { id } = await params;
    const body = (await request.json()) as VariationRequestBody;
    const quantity = Number(body.quantity || 0);
    const selectedDifficulty = normalizeDifficulty(body.difficulty_level);
    const includeExplanations = body.include_explanations !== false;
    const additionalInstructions = clean(body.additional_instructions);

    if (!quantity || quantity < 1 || quantity > 20) {
      return NextResponse.json(
        { ok: false, message: "Informe uma quantidade entre 1 e 20 questões." },
        { status: 400 },
      );
    }

    const supabase = createSupabaseAdminClient();

    const { data: sourceQuestion, error: sourceError } = await supabase
      .from("questions")
      .select(
        `
        id,
        code,
        statement,
        status,
        question_type,
        difficulty_level,
        year,
        explanation_text,
        exam_boards:exam_board_id (
          id,
          name
        ),
        subjects:subject_id (
          id,
          name,
          discipline_id,
          disciplines:discipline_id (
            id,
            name
          )
        ),
        question_subjects (
          subjects (
            id,
            name,
            discipline_id,
            disciplines:discipline_id (
              id,
              name
            )
          )
        ),
        question_alternatives (
          label,
          text,
          is_correct,
          order_number
        )
      `,
      )
      .eq("id", id)
      .single();

    if (sourceError || !sourceQuestion) {
      return NextResponse.json(
        {
          ok: false,
          message: sourceError?.message || "Questão-modelo não encontrada.",
        },
        { status: 404 },
      );
    }

    const typedSource = sourceQuestion as unknown as SourceQuestionRow;

    if (typedSource.status !== "published" && typedSource.status !== "active") {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Só é possível gerar variações a partir de questões publicadas.",
        },
        { status: 400 },
      );
    }

    const questionType = normalizeQuestionType(typedSource.question_type);
    const sourceAlternatives = [...(typedSource.question_alternatives || [])]
      .sort((a, b) => Number(a.order_number || 0) - Number(b.order_number || 0))
      .map((alt, index) => ({
        label:
          questionType === "true_false"
            ? index === 0
              ? "CERTO"
              : "ERRADO"
            : clean(alt.label).toUpperCase() || String.fromCharCode(65 + index),
        text: clean(alt.text),
        is_correct: Boolean(alt.is_correct),
      }));

    validateGeneratedQuestion(
      {
        statement: typedSource.statement,
        alternatives: sourceAlternatives,
      },
      -1,
      questionType,
    );

    const subjectRows = getSubjectRows(typedSource);
    const subjectIds = subjectRows.map((subject) => subject.id).filter(Boolean);
    const primarySubject = subjectRows[0] || typedSource.subjects;
    const discipline = primarySubject?.disciplines;

    if (!primarySubject?.id) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "A questão-modelo precisa ter pelo menos um assunto vinculado.",
        },
        { status: 400 },
      );
    }

    const finalBoard = await findOrCreateEstudoTopBoard(supabase);

    const prompt = buildPrompt({
      quantity,
      sourceQuestion: typedSource,
      sourceAlternatives,
      disciplineName: discipline?.name || "Não informada",
      subjectNames: subjectRows.map((subject) => subject.name),
      inspiringBoardName: typedSource.exam_boards?.name || "Estudo TOP",
      questionType,
      selectedDifficulty,
      includeExplanations,
      additionalInstructions,
    });

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: prompt,
        temperature: selectedDifficulty ? 0.42 : 0.55,
        max_output_tokens: Math.min(9000, 1200 * quantity),
      }),
    });

    const result = (await response.json()) as OpenAIResponse;

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: result?.error?.message || "Falha ao gerar variações com IA.",
          raw: process.env.NODE_ENV === "development" ? result : undefined,
        },
        { status: 400 },
      );
    }

    const text = extractOpenAIText(result);

    if (!text) {
      return NextResponse.json(
        {
          ok: false,
          message: "A IA respondeu, mas não retornou texto utilizável.",
          raw: process.env.NODE_ENV === "development" ? result : undefined,
        },
        { status: 400 },
      );
    }

    const generatedQuestions = extractJsonArray(text).slice(0, quantity);

    if (generatedQuestions.length === 0) {
      return NextResponse.json(
        { ok: false, message: "A IA não retornou nenhuma variação." },
        { status: 400 },
      );
    }

    generatedQuestions.forEach((question, index) =>
      validateGeneratedQuestion(question, index, questionType),
    );

    const seenStatements = new Set<string>();
    const normalized = [];

    for (let index = 0; index < generatedQuestions.length; index++) {
      const generated = generatedQuestions[index];
      const statement = clean(generated.statement);
      const statementKey = normalizeComparable(statement);
      const similarityToSource = textSimilarity(
        statement,
        typedSource.statement,
      );
      const isTooCloseToSource =
        similarityToSource >= 0.72 ||
        statementKey === normalizeComparable(typedSource.statement);
      const repeatedInBatch = seenStatements.has(statementKey);

      seenStatements.add(statementKey);

      const difficultyLevel =
        selectedDifficulty ||
        normalizeDifficulty(generated.difficulty_level) ||
        distributedDifficulty(index, typedSource.difficulty_level || null);

      const alternatives = generated.alternatives.map(
        (alternative, altIndex) => ({
          label:
            questionType === "true_false"
              ? altIndex === 0
                ? "CERTO"
                : "ERRADO"
              : clean(alternative.label).toUpperCase() ||
                String.fromCharCode(65 + altIndex),
          text:
            questionType === "true_false"
              ? altIndex === 0
                ? "Certo"
                : "Errado"
              : clean(alternative.text),
          is_correct: Boolean(alternative.is_correct),
        }),
      );

      const isDuplicate = isTooCloseToSource || repeatedInBatch;

      normalized.push({
        temp_id: `variation-${Date.now()}-${index + 1}`,
        statement,
        question_type: questionType,
        board_name: finalBoard.name,
        exam_board_id: finalBoard.id,
        inspiring_board_name: typedSource.exam_boards?.name || "Questão-modelo",
        inspiring_exam_board_id: typedSource.exam_boards?.id || "",
        source_question_id: typedSource.id,
        source_question_code: typedSource.code || null,
        discipline_id: discipline?.id || primarySubject.discipline_id || "",
        discipline_name: discipline?.name || "Não informada",
        subject_id: primarySubject.id,
        subject_ids: subjectIds.length ? subjectIds : [primarySubject.id],
        subject_name:
          subjectRows.map((subject) => subject.name).join(", ") ||
          primarySubject.name,
        difficulty_level: difficultyLevel,
        explanation_text: includeExplanations
          ? clean(generated.explanation_text || "")
          : "",
        alternatives,
        is_duplicate: isDuplicate,
        duplicate_of: isDuplicate
          ? {
              id: typedSource.id,
              code: typedSource.code,
              similarity: similarityToSource,
            }
          : null,
        duplicate_message: isTooCloseToSource
          ? `Variação muito parecida com a questão-modelo (${Math.round(similarityToSource * 100)}% de similaridade).`
          : repeatedInBatch
            ? "Variação repetida dentro deste próprio lote."
            : "",
        source_origin: "generate_ai",
      });
    }

    return NextResponse.json({
      ok: true,
      message: `${normalized.length} variação(ões) gerada(s). Revise antes de enviar para revisão.`,
      questions: normalized,
      count: normalized.length,
      final_board: finalBoard,
      source_question: {
        id: typedSource.id,
        code: typedSource.code,
      },
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
            : "Erro inesperado ao gerar variações com IA.",
      },
      { status: 500 },
    );
  }
}
