import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { findOrCreateEstudoTopBoard } from "@/lib/questions/estudo-top-board";
import { findBlockingDuplicate } from "@/lib/questions/duplicate-service";
import { normalizeEvaluatedTopics } from "@/lib/questions/evaluated-topics";
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
  evaluated_topics?: string[] | null;
};

type GenerateRequestBody = {
  subject_id?: string | null;
  exam_board_id?: string | null;
  question_type?: QuestionType | string | null;
  difficulty_level?: number | string | null;
  quantity?: number | string | null;
  include_explanations?: boolean | null;
  additional_instructions?: string | null;
};

type OpenAITextContent = {
  text?: string;
};

type OpenAIOutputItem = {
  content?: OpenAITextContent[];
};

type OpenAIResponse = {
  output_text?: string;
  output?: OpenAIOutputItem[];
  error?: {
    message?: string;
  };
};

type SubjectRow = {
  id: string;
  name: string;
  disciplines:
    | {
        id: string;
        name: string;
      }
    | {
        id: string;
        name: string;
      }[]
    | null;
};

function clean(value?: string | null) {
  return (value || "").trim();
}

function normalizeQuestionType(value?: string | null): QuestionType {
  return value === "true_false" ? "true_false" : "multiple_choice";
}

function normalizeDifficulty(value: unknown) {
  const parsed = Number(value || 0);
  return parsed >= 1 && parsed <= 5 ? parsed : null;
}

function distributedDifficulty(index: number) {
  return (index % 5) + 1;
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
    throw new Error("A IA nao retornou uma lista JSON valida.");
  }

  const parsed = JSON.parse(cleaned.slice(start, end + 1));

  if (!Array.isArray(parsed)) {
    throw new Error("A resposta da IA nao esta no formato esperado.");
  }

  return parsed;
}

function validateGeneratedQuestion(
  question: GeneratedQuestion,
  index: number,
  questionType: QuestionType
) {
  const statement = clean(question.statement);

  if (!statement || statement.length < 20) {
    throw new Error(`A questao ${index + 1} veio sem enunciado valido.`);
  }

  const alternatives = question.alternatives || [];

  if (!Array.isArray(alternatives)) {
    throw new Error(`A questao ${index + 1} precisa ter respostas validas.`);
  }

  if (questionType === "true_false") {
    if (alternatives.length !== 2) {
      throw new Error(`A questao ${index + 1} precisa ter apenas Certo e Errado.`);
    }
  } else if (alternatives.length < 4 || alternatives.length > 5) {
    throw new Error(`A questao ${index + 1} precisa ter 4 ou 5 alternativas.`);
  }

  const expectedLabels =
    questionType === "true_false"
      ? ["CERTO", "ERRADO"]
      : alternatives.length === 5
        ? ["A", "B", "C", "D", "E"]
        : ["A", "B", "C", "D"];

  for (const label of expectedLabels) {
    const found = alternatives.find((alt) => clean(alt.label).toUpperCase() === label);

    if (!found || !clean(found.text)) {
      throw new Error(
        questionType === "true_false"
          ? `A questao ${index + 1} precisa conter ${label === "CERTO" ? "Certo" : "Errado"}.`
          : `A questao ${index + 1} esta sem alternativa ${label}.`
      );
    }
  }

  const correct = alternatives.filter((alt) => Boolean(alt.is_correct));

  if (correct.length !== 1) {
    throw new Error(`A questao ${index + 1} precisa ter exatamente uma resposta correta.`);
  }
}

function buildQuestionTypeInstruction(questionType: QuestionType) {
  if (questionType === "true_false") {
    return `Gere questoes de assertiva para julgamento Certo ou Errado.
- O enunciado deve ser uma assertiva clara, tecnica e julgavel.
- Nao use letras C/E visualmente no texto.
- Retorne exatamente duas alternativas:
  { "label": "CERTO", "text": "Certo", "is_correct": true ou false }
  { "label": "ERRADO", "text": "Errado", "is_correct": true ou false }
- Exatamente uma delas deve estar correta.`;
  }

  return `Gere questoes objetivas de multipla escolha.
- Use 4 alternativas A, B, C, D ou 5 alternativas A, B, C, D, E quando fizer sentido para o padrao da banca inspiradora.
- Exatamente uma alternativa deve estar correta.
- As alternativas erradas devem ser plausiveis.`;
}

function buildPrompt({
  quantity,
  subjectName,
  disciplineName,
  inspiringBoardName,
  questionType,
  selectedDifficulty,
  includeExplanations,
  additionalInstructions,
}: {
  quantity: number;
  subjectName: string;
  disciplineName: string;
  inspiringBoardName: string;
  questionType: QuestionType;
  selectedDifficulty: number | null;
  includeExplanations: boolean;
  additionalInstructions: string;
}) {
  const difficultyInstruction = selectedDifficulty
    ? `Todas as questoes devem ter dificuldade ${selectedDifficulty} em uma escala de 1 a 5. Retorne difficulty_level: ${selectedDifficulty} em cada questao.`
    : "A dificuldade nao foi fixada. Distribua as questoes entre niveis variados de 1 a 5 quando houver mais de uma questao e retorne difficulty_level preenchido em cada item.";

  const sampleAlternatives =
    questionType === "true_false"
      ? '{ "label": "CERTO", "text": "Certo", "is_correct": true },\n      { "label": "ERRADO", "text": "Errado", "is_correct": false }'
      : '{ "label": "A", "text": "Texto da alternativa A", "is_correct": false },\n      { "label": "B", "text": "Texto da alternativa B", "is_correct": true },\n      { "label": "C", "text": "Texto da alternativa C", "is_correct": false },\n      { "label": "D", "text": "Texto da alternativa D", "is_correct": false }';

  return `Voce e um professor especialista em concursos publicos brasileiros.

Crie ${quantity} questao(oes) inedita(s) para revisao humana, sobre o assunto "${subjectName}", dentro da disciplina "${disciplineName}".

Banca inspiradora: ${inspiringBoardName}.
Use a banca inspiradora apenas como referencia de estilo de cobranca: linguagem, complexidade, forma de cobrar, pegadinhas tipicas e formato. Nao cite a banca no enunciado e nao copie questoes reais.

Tipo de questao: ${questionType === "true_false" ? "Assertiva / Certo ou Errado" : "Questao com alternativas"}.
${buildQuestionTypeInstruction(questionType)}

Dificuldade:
${difficultyInstruction}

ORIENTACOES ADICIONAIS DO PROFESSOR:
${additionalInstructions || "Nenhuma orientacao adicional foi informada."}

REGRAS IMPORTANTES:
- A resposta correta deve ser marcada com is_correct: true.
- As demais devem vir com is_correct: false.
- Nao use markdown.
- Nao coloque comentarios fora do JSON.
- Nao use texto introdutorio.
- Nao use questoes copiadas literalmente de provas reais.
- Escreva em portugues do Brasil.
- O enunciado deve ser claro e completo.
- Nao invente lei, norma, prazo, artigo, sumula ou entendimento jurisprudencial quando nao houver base suficiente.
- Prefira clareza tecnica e conteudo adequado para revisao humana.
- Siga as orientacoes adicionais do professor sem contrariar as regras tecnicas do JSON.
- ${includeExplanations ? "Inclua explanation_text com uma explicacao curta e didatica." : "Defina explanation_text como null."}
- Inclua difficulty_level em cada questao, com numero inteiro de 1 a 5.
- Inclua evaluated_topics com 1 a 4 tópicos específicos efetivamente avaliados. Não repita o assunto genérico se houver tópico mais específico.

RETORNE APENAS UM JSON ARRAY no formato abaixo:

[
  {
    "statement": "Enunciado da questao...",
    "difficulty_level": ${selectedDifficulty || 3},
    "evaluated_topics": ["Tópico específico"],
    "alternatives": [
      ${sampleAlternatives}
    ],
    "explanation_text": ${includeExplanations ? '"Explicacao curta..."' : "null"}
  }
]`;
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { ok: false, message: "OPENAI_API_KEY nao foi configurada no .env.local." },
        { status: 500 }
      );
    }

    const body = (await request.json()) as GenerateRequestBody;
    const subjectId = clean(body.subject_id);
    const inspiringBoardId = clean(body.exam_board_id);
    const questionType = normalizeQuestionType(body.question_type);
    const selectedDifficulty = normalizeDifficulty(body.difficulty_level);
    const quantity = Number(body.quantity || 0);
    const includeExplanations = Boolean(body.include_explanations);
    const additionalInstructions = clean(body.additional_instructions);

    if (!subjectId) {
      return NextResponse.json({ ok: false, message: "Selecione o assunto." }, { status: 400 });
    }

    if (!inspiringBoardId) {
      return NextResponse.json(
        { ok: false, message: "Selecione a banca inspiradora." },
        { status: 400 }
      );
    }

    if (!quantity || quantity < 1 || quantity > 20) {
      return NextResponse.json(
        { ok: false, message: "Informe uma quantidade entre 1 e 20 questoes." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();

    const { data: subject, error: subjectError } = await supabase
      .from("subjects")
      .select(`
        id,
        name,
        disciplines:discipline_id (
          id,
          name
        )
      `)
      .eq("id", subjectId)
      .single();

    if (subjectError || !subject) {
      return NextResponse.json(
        { ok: false, message: subjectError?.message || "Assunto nao encontrado." },
        { status: 400 }
      );
    }

    const { data: inspiringBoard, error: inspiringBoardError } = await supabase
      .from("exam_boards")
      .select("id, name")
      .eq("id", inspiringBoardId)
      .single();

    if (inspiringBoardError || !inspiringBoard) {
      return NextResponse.json(
        { ok: false, message: inspiringBoardError?.message || "Banca inspiradora nao encontrada." },
        { status: 400 }
      );
    }

    const finalBoard = await findOrCreateEstudoTopBoard(supabase);
    const subjectRow = subject as SubjectRow;
    const discipline = Array.isArray(subjectRow.disciplines)
      ? subjectRow.disciplines[0]
      : subjectRow.disciplines;
    const disciplineName = discipline?.name || "Nao informada";
    const disciplineId = discipline?.id || "";
    const subjectName = subject.name;
    const inspiringBoardName = inspiringBoard.name;

    const prompt = buildPrompt({
      quantity,
      subjectName,
      disciplineName,
      inspiringBoardName,
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
        temperature: selectedDifficulty ? 0.35 : 0.45,
        max_output_tokens: Math.min(7000, 1000 * quantity),
      }),
    });

    const result = (await response.json()) as OpenAIResponse;

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: result?.error?.message || "Falha ao gerar questoes com IA.",
          raw: process.env.NODE_ENV === "development" ? result : undefined,
        },
        { status: 400 }
      );
    }

    const text = extractOpenAIText(result);

    if (!text) {
      return NextResponse.json(
        {
          ok: false,
          message: "A IA respondeu, mas nao retornou texto utilizavel.",
          raw: process.env.NODE_ENV === "development" ? result : undefined,
        },
        { status: 400 }
      );
    }

    const generatedQuestions = extractJsonArray(text).slice(0, quantity);

    if (generatedQuestions.length === 0) {
      return NextResponse.json(
        { ok: false, message: "A IA nao retornou nenhuma questao." },
        { status: 400 }
      );
    }

    generatedQuestions.forEach((question, index) =>
      validateGeneratedQuestion(question, index, questionType)
    );

    const normalized = [];

    for (let index = 0; index < generatedQuestions.length; index++) {
      const generated = generatedQuestions[index];
      const statement = clean(generated.statement);
      const difficultyLevel =
        selectedDifficulty || normalizeDifficulty(generated.difficulty_level) || distributedDifficulty(index);
      const evaluatedTopics = normalizeEvaluatedTopics(generated.evaluated_topics);
      const alternatives = generated.alternatives.map((alternative, altIndex) => ({
        label:
          questionType === "true_false"
            ? altIndex === 0
              ? "CERTO"
              : "ERRADO"
            : clean(alternative.label).toUpperCase() || String.fromCharCode(65 + altIndex),
        text:
          questionType === "true_false"
            ? altIndex === 0
              ? "Certo"
              : "Errado"
            : clean(alternative.text),
        is_correct: Boolean(alternative.is_correct),
      }));

      const duplicate = await findBlockingDuplicate({
        supabase,
        statement,
        alternatives,
        examBoardId: finalBoard.id,
      });

      normalized.push({
        temp_id: `generated-${Date.now()}-${index + 1}`,
        statement,
        question_type: questionType,
        board_name: finalBoard.name,
        exam_board_id: finalBoard.id,
        inspiring_board_name: inspiringBoardName,
        inspiring_exam_board_id: inspiringBoardId,
        discipline_id: disciplineId,
        discipline_name: disciplineName,
        subject_id: subjectId,
        subject_ids: [subjectId],
        subject_name: subjectName,
        difficulty_level: difficultyLevel,
        evaluated_topics: evaluatedTopics,
        explanation_text: includeExplanations ? clean(generated.explanation_text || "") : "",
        alternatives,
        is_duplicate: Boolean(duplicate),
        duplicate_of: duplicate,
        duplicate_message: duplicate
          ? `Possivel duplicidade com questao ja existente na banca Estudo TOP (${Math.round(
              Number(duplicate.similarity || 0) * 100
            )}% de similaridade).`
          : "",
      });
    }

    return NextResponse.json({
      ok: true,
      message: `${normalized.length} questao(oes) gerada(s). Revise antes de enviar para revisao.`,
      questions: normalized,
      count: normalized.length,
      final_board: finalBoard,
      inspiring_board: {
        id: inspiringBoardId,
        name: inspiringBoardName,
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
            : "Erro inesperado ao gerar questoes com IA.",
      },
      { status: 500 }
    );
  }
}
