import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { normalizeSubjectIds, primarySubjectId, syncQuestionSubjects } from "@/lib/questions/question-subjects";
import { EVALUATED_TOPICS_REQUIRED_MESSAGE, normalizeEvaluatedTopics } from "@/lib/questions/evaluated-topics";
import { richTextToPlainText } from "@/lib/utils/rich-text";
import { predictDifficultyAI } from "@/lib/utils/question-difficulty-ai";
import { requireAdmin } from "@/lib/server/authGuard";
import { logAdminAction, logSystemError } from "@/app/lib/server/auditLogger";

type AlternativeInput = {
  label?: string | null;
  text?: string | null;
  image_url?: string | null;
  is_correct?: boolean | null;
};

type NormalizedAlternative = ReturnType<typeof normalizeAlternativeForInsert>;

type QuestionDuplicateCandidate = {
  id: string;
  statement: string | null;
  status: string | null;
  exam_board_id: string | null;
};

type CandidateAlternative = AlternativeInput & {
  question_id: string;
};

const SIMULADO_EDITOR_QUESTION_SELECT = `
  id, code, statement, explanation_text, status, difficulty_level,
  evaluated_topics, year, question_type,
  exam_boards:exam_board_id (id, name),
  subjects:subject_id (id, name, discipline_id, disciplines:discipline_id (id, name)),
  question_subjects (subjects (id, name, discipline_id, disciplines:discipline_id (id, name))),
  question_alternatives (id, label, text, is_correct, order_number),
  simulado_questions (id, simulados:simulado_id (id, title, status))
`;

async function fetchPublishedQuestions(supabase: SupabaseClient) {
  const pageSize = 1000;
  const questions: Record<string, unknown>[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("questions")
      .select(SIMULADO_EDITOR_QUESTION_SELECT)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    const rows = (data || []) as Record<string, unknown>[];
    questions.push(...rows);
    if (rows.length < pageSize) break;
  }

  return questions;
}

async function fetchJornadaQuestionIds(supabase: SupabaseClient) {
  const { data: jornadaSimulados, error } = await supabase
    .from("jornada_simulados")
    .select("jornada_id, simulado_id");
  if (error) throw new Error(error.message);

  const simuladoIds = Array.from(new Set((jornadaSimulados || []).map((link) => link.simulado_id).filter(Boolean)));
  const { data: simuladoQuestions, error: questionsError } = simuladoIds.length
    ? await supabase.from("simulado_questions").select("simulado_id, question_id").in("simulado_id", simuladoIds)
    : { data: [], error: null };
  if (questionsError) throw new Error(questionsError.message);

  const bySimulado = new Map<string, Set<string>>();
  for (const link of simuladoQuestions || []) {
    const ids = bySimulado.get(link.simulado_id) || new Set<string>();
    ids.add(link.question_id);
    bySimulado.set(link.simulado_id, ids);
  }

  const byJornada = new Map<string, Set<string>>();
  for (const link of jornadaSimulados || []) {
    const ids = byJornada.get(link.jornada_id) || new Set<string>();
    bySimulado.get(link.simulado_id)?.forEach((questionId) => ids.add(questionId));
    byJornada.set(link.jornada_id, ids);
  }

  return Object.fromEntries(Array.from(byJornada, ([jornadaId, ids]) => [jornadaId, Array.from(ids)]));
}

async function fetchAnswerAccuracy(supabase: SupabaseClient, questionIds: string[]) {
  const pageSize = 1000;
  const totals = new Map<string, { correct: number; total: number }>();

  const batches: string[][] = [];
  for (let index = 0; index < questionIds.length; index += 200) {
    batches.push(questionIds.slice(index, index + 200));
  }

  const answerGroups = await Promise.all(batches.map(async (batch) => {
    const answers: Array<{ question_id: string; is_correct: boolean }> = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("simulado_answers")
        .select("question_id, is_correct")
        .in("question_id", batch)
        .not("is_correct", "is", null)
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      answers.push(...(data || []));
      if ((data || []).length < pageSize) break;
    }
    return answers;
  }));

  for (const answer of answerGroups.flat()) {
    const current = totals.get(answer.question_id) || { correct: 0, total: 0 };
    current.total += 1;
    if (answer.is_correct) current.correct += 1;
    totals.set(answer.question_id, current);
  }

  return totals;
}

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { searchParams } = new URL(request.url);
  if (searchParams.get("context") !== "simulado-editor") {
    return NextResponse.json({ ok: false, message: "Contexto de consulta inválido." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const [questions, jornadaQuestionIds] = await Promise.all([
      fetchPublishedQuestions(supabase),
      fetchJornadaQuestionIds(supabase),
    ]);
    const accuracy = await fetchAnswerAccuracy(supabase, questions.map((question) => String(question.id)));
    const questionsWithAccuracy = questions.map((question) => {
      const total = accuracy.get(String(question.id));
      return {
        ...question,
        correct_count: total?.correct || 0,
        wrong_count: total ? total.total - total.correct : 0,
        total_answered_count: total?.total || 0,
        accuracy_rate: total?.total ? Math.round((total.correct / total.total) * 100) : null,
      };
    });

    return NextResponse.json({
      ok: true,
      message: "Banco de questões carregado com sucesso.",
      questions: questionsWithAccuracy,
      jornadaQuestionIds,
    });
  } catch (error) {
    void logSystemError({ source: "api.admin.questions.simulado-editor", error, request });
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar o banco de questões." },
      { status: 500 },
    );
  }
}

function clean(value?: string | null) {
  return String(value || "").trim();
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ");
}

function normalizeText(value?: string | null) {
  const withImg = clean(value)
    .replace(/data:image\/[^"'\s>]*/gi, "xximagemxx")
    .replace(/<img[^>]*>/gi, "xximagemxx")
    .replace(/imagem\s+associada\s+para\s+resolu[c\u00e7][a\u00e3]o\s+da\s+quest[a\u00e3]o/gi, "xximagemxx");
  return stripHtml(withImg)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "e")
    .replace(/\b(certo|errado)\)/g, "$1 ")
    .replace(/\b([a-e])\)/g, " ")
    .replace(/\b([a-e])\./g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lightNormalizeText(value?: string | null) {
  // Light normalization: removes accents and lowercases but keeps special chars.
  // Used as secondary pass to avoid false-positive duplicate detection when
  // alternatives differ only in special characters (e.g. = * # ! ()).
  const withImg = clean(value)
    .replace(/data:image\/[^"'\s>]*/gi, "xximagemxx")
    .replace(/<img[^>]*>/gi, "xximagemxx")
    .replace(/imagem\s+associada\s+para\s+resolu[c\u00e7][a\u00e3]o\s+da\s+quest[a\u00e3]o/gi, "xximagemxx");
  return stripHtml(withImg)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value?: string | null) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 2);
}

function jaccardSimilarity(a?: string | null, b?: string | null) {
  const aTokens = new Set(tokenize(a));
  const bTokens = new Set(tokenize(b));

  if (!aTokens.size || !bTokens.size) return 0;

  let intersection = 0;

  for (const token of aTokens) {
    if (bTokens.has(token)) intersection += 1;
  }

  const union = new Set([...Array.from(aTokens), ...Array.from(bTokens)]).size;

  return union ? intersection / union : 0;
}

function normalizeAlternatives(alternatives: AlternativeInput[]) {
  return alternatives
    .map((alternative) => normalizeText(alternative?.text || ""))
    .filter(Boolean)
    .sort();
}

function countMatchingAlternatives(a: string[], b: string[]) {
  const used = new Set<number>();
  let matches = 0;

  for (const itemA of a) {
    for (let index = 0; index < b.length; index++) {
      if (used.has(index)) continue;

      const itemB = b[index];
      const score = jaccardSimilarity(itemA, itemB);
      const exact = itemA === itemB;

      if (exact || score >= 0.88) {
        used.add(index);
        matches += 1;
        break;
      }
    }
  }

  return matches;
}

const GENERIC_ALT_LABELS_ROUTE2 = new Set(["certo", "errado", "verdadeiro", "falso"]);

function isGenericTrueFalseOnlyRoute2(alts: string[]): boolean {
  return alts.length > 0 && alts.every((alt) => GENERIC_ALT_LABELS_ROUTE2.has(alt));
}

function calculateDuplicateScore({
  statement,
  alternatives,
  candidateStatement,
  candidateAlternatives,
  examBoardId,
  candidateExamBoardId,
  exactMatchOnly,
}: {
  statement: string;
  alternatives: AlternativeInput[];
  candidateStatement: string;
  candidateAlternatives: AlternativeInput[];
  examBoardId?: string | null;
  candidateExamBoardId?: string | null;
  exactMatchOnly?: boolean;
}) {
  const statementSimilarity = jaccardSimilarity(statement, candidateStatement);

  if (statementSimilarity < 0.70) {
    return {
      statementSimilarity,
      alternativesSimilarity: 0,
      matchingAlternatives: 0,
      score: 0,
      isBlockingDuplicate: false,
    };
  }

  const normalizedAlternatives = normalizeAlternatives(alternatives);
  const normalizedCandidateAlternatives = normalizeAlternatives(candidateAlternatives);
  const matchingAlternatives = countMatchingAlternatives(
    normalizedAlternatives,
    normalizedCandidateAlternatives
  );

  const alternativesCount = Math.min(
    normalizedAlternatives.length,
    normalizedCandidateAlternatives.length
  );

  const alternativesSimilarity = alternativesCount
    ? matchingAlternatives / alternativesCount
    : 0;

  const bothGenericTrueFalse =
    isGenericTrueFalseOnlyRoute2(normalizedAlternatives) &&
    isGenericTrueFalseOnlyRoute2(normalizedCandidateAlternatives);

  const altWeight = bothGenericTrueFalse ? 0.02 : 0.20;
  const stmtWeight = 1 - altWeight;
  const weightedScore = statementSimilarity * stmtWeight + alternativesSimilarity * altWeight;
  const score = Math.min(weightedScore, statementSimilarity + 0.08);

  let isBlockingDuplicate: boolean;

  if (exactMatchOnly) {
    // "Usar como modelo": só bloqueia se enunciado E todas as alternativas forem
    // 100% idênticos (após normalização) e a banca for a mesma.
    const normalizedStatement = normalizeText(statement);
    const normalizedCandidateStatement = normalizeText(candidateStatement);
    const statementExactMatch = Boolean(normalizedStatement) && normalizedStatement === normalizedCandidateStatement;

    const alternativesExactMatch =
      normalizedAlternatives.length > 0 &&
      normalizedAlternatives.length === normalizedCandidateAlternatives.length &&
      normalizedAlternatives.every((alt, index) => alt === normalizedCandidateAlternatives[index]);

    const sameExamBoard = Boolean(examBoardId) && examBoardId === candidateExamBoardId;

    isBlockingDuplicate = statementExactMatch && alternativesExactMatch && sameExamBoard;
  } else {
    // Critério padrão: bloqueia com base em forte similaridade de enunciado/alternativas.
    isBlockingDuplicate =
      statementSimilarity >= 0.9 ||
      (statementSimilarity >= 0.78 && matchingAlternatives >= 3 && !bothGenericTrueFalse) ||
      (statementSimilarity >= 0.72 && alternativesCount >= 4 && alternativesSimilarity >= 0.9 && !bothGenericTrueFalse);
  }

  return {
    statementSimilarity,
    alternativesSimilarity,
    matchingAlternatives,
    score,
    isBlockingDuplicate,
  };
}

function buildQuestionFingerprint(statement: string) {
  return normalizeText(statement).slice(0, 240);
}

function parseValidYear(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  const year = Number(value);

  if (!Number.isInteger(year) || year < 1990 || year > 2100) {
    return null;
  }

  return year;
}

function parseValidDifficulty(value: unknown) {
  const difficulty = Number(value);
  return Number.isInteger(difficulty) && difficulty >= 1 && difficulty <= 5 ? difficulty : null;
}

function parseValidStatus(value: unknown) {
  const status = clean(typeof value === "string" ? value : "");
  return ["draft", "pending_review", "ready_to_publish", "published", "archived"].includes(status) ? status : null;
}

function getDuplicateAlternativeLabelGroups(alternatives: AlternativeInput[]) {
  const byText = new Map<string, Array<{ label: string; lightNorm: string; rawHtml: string }>>();

  for (const alternative of alternatives) {
    const normalized = normalizeText(alternative.text || "");
    if (!normalized || !normalized.replace(/xximagemxx/g, "").trim()) continue;
    const lightNorm = lightNormalizeText(alternative.text);
    // Preserve inline HTML formatting in the comparison key: alternatives with the
    // same plain text but different formatting (bold, italic, underline etc.) are
    // intentionally distinct and must NOT be flagged as duplicates.
    const rawHtml = (alternative.text || "").replace(/\s+/g, " ").trim();
    const label = clean(alternative.label).toUpperCase();
    const existing = byText.get(normalized) || [];
    byText.set(normalized, [...existing, { label, lightNorm, rawHtml }]);
  }

  const result: string[][] = [];
  for (const entries of byText.values()) {
    if (entries.length <= 1) continue;
    // Sub-group by lightNorm + rawHtml. Both must be identical for a duplicate.
    const byKey = new Map<string, string[]>();
    for (const entry of entries) {
      const key = `${entry.lightNorm}__${entry.rawHtml}`;
      byKey.set(key, [...(byKey.get(key) || []), entry.label]);
    }
    for (const labels of byKey.values()) {
      if (labels.length > 1) result.push(labels);
    }
  }
  return result;
}

function formatDuplicateAlternativeMessage(groups: string[][]) {
  const details = groups.map((labels) => labels.join(" e ")).join("; ");
  return `As alternativas ${details} estão com o mesmo texto. Ajuste antes de salvar.`;
}

function normalizeAlternativeForInsert(
  alternative: AlternativeInput,
  index: number,
  questionType: string
) {
  const fallbackLabel =
    questionType === "true_false"
      ? index === 0
        ? "CERTO"
        : "ERRADO"
      : String.fromCharCode(65 + index);

  return {
    label: clean(alternative.label).toUpperCase() || fallbackLabel,
    text: clean(alternative.text),
    image_url: clean(alternative.image_url) || null,
    is_correct: Boolean(alternative.is_correct),
    order_number: index + 1,
  };
}

async function findBlockingDuplicate({
  supabase,
  statement,
  alternatives,
  examBoardId,
  exactMatchOnly,
}: {
  supabase: SupabaseClient;
  statement: string;
  alternatives: AlternativeInput[];
  examBoardId: string;
  exactMatchOnly?: boolean;
}) {
  const { data: candidates, error } = await supabase
    .from("questions")
    .select("id, statement, status, exam_board_id")
    .eq("exam_board_id", examBoardId)
    .limit(500);

  if (error) throw new Error(error.message);

  const candidateRows = (candidates || []) as QuestionDuplicateCandidate[];
  const candidateIds = candidateRows.map((question) => question.id);
  const alternativesByQuestion = new Map<string, AlternativeInput[]>();

  if (candidateIds.length) {
    const { data: candidateAlternatives, error: alternativesError } = await supabase
      .from("question_alternatives")
      .select("question_id, label, text, image_url, is_correct")
      .in("question_id", candidateIds);

    if (alternativesError) throw new Error(alternativesError.message);

    for (const alternative of (candidateAlternatives || []) as CandidateAlternative[]) {
      const current = alternativesByQuestion.get(alternative.question_id) || [];
      current.push(alternative);
      alternativesByQuestion.set(alternative.question_id, current);
    }
  }

  const duplicates = candidateRows
    .map((candidate) => {
      const metrics = calculateDuplicateScore({
        statement,
        alternatives,
        candidateStatement: candidate.statement || "",
        candidateAlternatives: alternativesByQuestion.get(candidate.id) || [],
        examBoardId,
        candidateExamBoardId: candidate.exam_board_id,
        exactMatchOnly,
      });

      return {
        id: candidate.id,
        statement: candidate.statement,
        status: candidate.status,
        exam_board_id: candidate.exam_board_id,
        similarity: metrics.score,
        statement_similarity: metrics.statementSimilarity,
        alternatives_similarity: metrics.alternativesSimilarity,
        matching_alternatives: metrics.matchingAlternatives,
        is_blocking: metrics.isBlockingDuplicate,
      };
    })
    .filter((candidate) => candidate.is_blocking)
    .sort((a, b) => b.similarity - a.similarity);

  return duplicates[0] || null;
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await request.json();
    const questionType = body.question_type || "multiple_choice";
    const statement = clean(body.statement);
    const alternatives: AlternativeInput[] = Array.isArray(body.alternatives) ? body.alternatives : [];
    const difficulty = parseValidDifficulty(body.difficulty_level);
    const year = parseValidYear(body.year);
    const requestedStatus = parseValidStatus(body.status);
    let status = requestedStatus;
    const examBoardId = clean(body.exam_board_id);
    const inspirationBoardId = clean(body.inspiration_board_id) || null;
    const subjectIds = normalizeSubjectIds(body);
    const mainSubjectId = primarySubjectId(subjectIds);
    const evaluatedTopics = normalizeEvaluatedTopics(body.evaluated_topics);

    if (!mainSubjectId) {
      return NextResponse.json(
        { ok: false, message: "Selecione o assunto da questão." },
        { status: 400 }
      );
    }

    if (!examBoardId) {
      return NextResponse.json(
        { ok: false, message: "Selecione a banca organizadora." },
        { status: 400 }
      );
    }

    if (!year) {
      return NextResponse.json(
        { ok: false, message: "Informe o ano da questão." },
        { status: 400 }
      );
    }

    if (!status) {
      return NextResponse.json(
        { ok: false, message: "Selecione o status da questão." },
        { status: 400 }
      );
    }

    if (evaluatedTopics.length === 0) {
      return NextResponse.json(
        { ok: false, message: EVALUATED_TOPICS_REQUIRED_MESSAGE },
        { status: 400 }
      );
    }

    if (richTextToPlainText(statement).length < 10) {
      return NextResponse.json(
        { ok: false, message: "Informe um enunciado válido." },
        { status: 400 }
      );
    }

    const validAlternatives = alternatives
      .map((alternative: AlternativeInput, index: number) =>
        normalizeAlternativeForInsert(alternative, index, questionType)
      )
      .filter((alternative): alternative is NormalizedAlternative => Boolean(alternative.text || alternative.image_url));

    const minimumAlternatives = questionType === "true_false" ? 2 : 4;

    if (validAlternatives.length !== alternatives.length || validAlternatives.length < minimumAlternatives) {
      return NextResponse.json(
        { ok: false, message: questionType === "true_false" ? "Preencha todas as assertivas." : "Cadastre pelo menos 4 alternativas." },
        { status: 400 }
      );
    }

    const duplicateAlternativeGroups = getDuplicateAlternativeLabelGroups(validAlternatives);

    if (duplicateAlternativeGroups.length > 0) {
      return NextResponse.json(
        { ok: false, message: formatDuplicateAlternativeMessage(duplicateAlternativeGroups), duplicateAlternatives: duplicateAlternativeGroups },
        { status: 400 }
      );
    }

    const correct = validAlternatives.filter((alternative) => alternative.is_correct);

    if (correct.length > 1) {
      validAlternatives.forEach((alternative) => { alternative.is_correct = false; });
      status = "pending_review";
    }

    if ((status === "published" || status === "active" || status === "ready_to_publish") && validAlternatives.filter((alternative) => alternative.is_correct).length !== 1) {
      return NextResponse.json(
        { ok: false, message: "Marque exatamente uma resposta correta antes de publicar ou enviar para a fila." },
        { status: 400 }
      );
    }

    const finalCorrect = validAlternatives.find((alternative) => alternative.is_correct);

    const supabase = createSupabaseAdminClient();

    const resolvedDifficulty =
      difficulty ?? await predictDifficultyAI({ statement, alternatives: validAlternatives, question_type: questionType });

    const blockingDuplicate = await findBlockingDuplicate({
      supabase,
      statement,
      alternatives: validAlternatives,
      examBoardId,
      exactMatchOnly: body.use_as_template === true,
    });

    if (blockingDuplicate) {
      return NextResponse.json(
        {
          ok: false,
          duplicate_blocking: true,
          possibleDuplicate: blockingDuplicate,
          message: "Essa questão já existe no banco para esta mesma banca.",
        },
        { status: 409 }
      );
    }

    const { data: question, error: questionError } = await supabase
      .from("questions")
      .insert({
        subject_id: mainSubjectId,
        exam_board_id: examBoardId,
        inspiration_board_id: inspirationBoardId,
        statement,
        image_url: clean(body.image_url) || null,
        explanation_text: clean(body.explanation_text) || null,
        difficulty_level: resolvedDifficulty,
        year,
        orgao: clean(body.orgao) || null,
        evaluated_topics: evaluatedTopics,
        status,
        question_type: questionType,
        correct_alternative_label: finalCorrect?.label || null,
        is_in_question_bank: body.is_in_question_bank ?? true,
        source_origin: body.source_origin || "bank",
        question_fingerprint: buildQuestionFingerprint(statement),
      })
      .select("id, code")
      .single();

    if (questionError || !question) {
      return NextResponse.json(
        { ok: false, message: questionError?.message || "Falha ao cadastrar questão." },
        { status: 400 }
      );
    }

    try {
      await syncQuestionSubjects({ supabase, questionId: question.id, subjectIds });
    } catch (error) {
      await supabase.from("questions").delete().eq("id", question.id);
      throw error;
    }

    const { error: alternativesError } = await supabase
      .from("question_alternatives")
      .insert(
        validAlternatives.map((alternative) => ({
          question_id: question.id,
          ...alternative,
        }))
      );

    if (alternativesError) {
      await supabase.from("questions").delete().eq("id", question.id);

      return NextResponse.json(
        { ok: false, message: alternativesError.message },
        { status: 400 }
      );
    }

    void logAdminAction({ adminUserId: admin.id, action: "admin.question.created", entityType: "question", entityId: question.id, request, metadata: { status } });
    return NextResponse.json({
      ok: true,
      message: "Questão cadastrada com sucesso.",
      questionId: question.id,
      questionCode: question.code,
    });
  } catch (error) {
    void logSystemError({ source: "api.admin.questions.create", error, request });
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Erro inesperado ao cadastrar questão.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { ok: false, message: "ID da questão não informado." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("questions").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    void logAdminAction({ adminUserId: admin.id, action: "admin.question.deleted", entityType: "question", entityId: id, severity: "warning", request });
    return NextResponse.json({ ok: true, message: "Questão excluída com sucesso." });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Erro inesperado ao excluir questão.",
      },
      { status: 500 }
    );
  }
}
