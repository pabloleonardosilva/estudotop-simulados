import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdmin } from "@/lib/server/authGuard";

type AlternativeInput = {
  label?: string | null;
  text?: string | null;
  image_url?: string | null;
  is_correct?: boolean | null;
};

type CandidateQuestion = {
  id: string;
  statement: string | null;
  status: string | null;
  exam_board_id: string | null;
  year?: number | null;
};

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

const GENERIC_ALT_LABELS_ROUTE = new Set(["certo", "errado", "verdadeiro", "falso"]);

function normalizeAlternatives(alternatives: AlternativeInput[]) {
  return alternatives
    .map((alternative) => normalizeText(alternative?.text || ""))
    .filter(Boolean)
    .sort();
}

function isGenericTrueFalseOnlyRoute(alts: string[]): boolean {
  return alts.length > 0 && alts.every((alt) => GENERIC_ALT_LABELS_ROUTE.has(alt));
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

function calculateDuplicateScore({
  statement,
  alternatives,
  candidateStatement,
  candidateAlternatives,
  examBoardId,
  candidateExamBoardId,
  year,
  candidateYear,
}: {
  statement: string;
  alternatives: AlternativeInput[];
  candidateStatement: string;
  candidateAlternatives: AlternativeInput[];
  examBoardId?: string | null;
  candidateExamBoardId?: string | null;
  year?: number | null;
  candidateYear?: number | null;
}) {
  const statementSimilarity = jaccardSimilarity(statement, candidateStatement);

  if (statementSimilarity < 0.70) {
    return {
      statementSimilarity,
      alternativesSimilarity: 0,
      matchingAlternatives: 0,
      score: 0,
      isBlockingDuplicate: false,
      matchedMetadata: [] as string[],
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
    isGenericTrueFalseOnlyRoute(normalizedAlternatives) &&
    isGenericTrueFalseOnlyRoute(normalizedCandidateAlternatives);

  const altWeight = bothGenericTrueFalse ? 0.02 : 0.20;
  const stmtWeight = 1 - altWeight;
  const weightedScore = statementSimilarity * stmtWeight + alternativesSimilarity * altWeight;
  const score = Math.min(weightedScore, statementSimilarity + 0.08);

  const isBlockingDuplicate =
    statementSimilarity >= 0.9 ||
    (statementSimilarity >= 0.78 && matchingAlternatives >= 3 && !bothGenericTrueFalse) ||
    (statementSimilarity >= 0.72 && alternativesCount >= 4 && alternativesSimilarity >= 0.9 && !bothGenericTrueFalse);

  const matchedMetadata: string[] = [];
  if (examBoardId && candidateExamBoardId && examBoardId === candidateExamBoardId) {
    matchedMetadata.push("banca");
  }
  if (year && candidateYear && year === candidateYear) {
    matchedMetadata.push("ano");
  }

  return {
    statementSimilarity,
    alternativesSimilarity,
    matchingAlternatives,
    score,
    isBlockingDuplicate,
    matchedMetadata,
  };
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await request.json();

    const statement = clean(body.statement);
    const examBoardId = clean(body.exam_board_id);
    const alternatives = Array.isArray(body.alternatives) ? body.alternatives : [];
    const year = typeof body.year === "number" && body.year >= 1990 && body.year <= 2100 ? body.year : null;

    if (statement.length < 25 || !examBoardId) {
      return NextResponse.json({
        ok: true,
        possibleDuplicate: null,
        duplicate_blocking: false,
        similar_warning: null,
      });
    }

    const supabase = createSupabaseAdminClient();

    const { data: candidates, error } = await supabase
      .from("questions")
      .select("id, statement, status, exam_board_id, year")
      .eq("exam_board_id", examBoardId)
      .limit(500);

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    const candidateIds = (candidates || []).map((question: CandidateQuestion) => question.id);

    let alternativesByQuestion = new Map<string, AlternativeInput[]>();

    if (candidateIds.length) {
      const { data: candidateAlternatives, error: alternativesError } = await supabase
        .from("question_alternatives")
        .select("question_id, label, text, image_url, is_correct")
        .in("question_id", candidateIds);

      if (alternativesError) {
        return NextResponse.json({ ok: false, message: alternativesError.message }, { status: 400 });
      }

      for (const alternative of candidateAlternatives || []) {
        const current = alternativesByQuestion.get(alternative.question_id) || [];
        current.push(alternative);
        alternativesByQuestion.set(alternative.question_id, current);
      }
    }

    const duplicates = (candidates || [])
      .map((candidate: CandidateQuestion) => {
        const metrics = calculateDuplicateScore({
          statement,
          alternatives,
          candidateStatement: candidate.statement || "",
          candidateAlternatives: alternativesByQuestion.get(candidate.id) || [],
          examBoardId,
          candidateExamBoardId: candidate.exam_board_id,
          year,
          candidateYear: candidate.year ?? null,
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
          matched_metadata: metrics.matchedMetadata,
          is_blocking: metrics.isBlockingDuplicate,
        };
      })
      .filter((candidate: any) => candidate.is_blocking)
      .sort((a: any, b: any) => b.similarity - a.similarity);

    return NextResponse.json({
      ok: true,
      possibleDuplicate: duplicates[0] || null,
      duplicate_blocking: Boolean(duplicates[0]),
      similar_warning: null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Erro ao verificar duplicidade.",
      },
      { status: 500 }
    );
  }
}
