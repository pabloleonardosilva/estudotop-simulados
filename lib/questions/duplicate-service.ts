import type { SupabaseClient } from "@supabase/supabase-js";

type AlternativeInput = {
  label?: string | null;
  text?: string | null;
  image_url?: string | null;
  is_correct?: boolean | null;
};

type DuplicateCandidate = {
  id: string;
  statement: string | null;
  status: string | null;
  exam_board_id: string | null;
  year?: number | null;
};

type CandidateAlternative = AlternativeInput & {
  question_id: string;
};

export type DuplicateCandidateCache = Map<
  string,
  { candidates: DuplicateCandidate[]; alternativesByQuestion: Map<string, AlternativeInput[]> }
>;

function clean(value?: string | null) {
  return String(value || "").trim();
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ");
}

export function normalizeQuestionText(value?: string | null) {
  // Collapse all image forms (base64, <img>, and the "Imagem associada..." sentinel text)
  // into one stable token BEFORE stripping HTML, so both sides get the same token.
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
  return normalizeQuestionText(value)
    .split(" ")
    .filter((token) => token.length > 2);
}

export function jaccardSimilarity(a?: string | null, b?: string | null) {
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

// Tokens that carry zero discriminative value — two questions sharing only
// these tokens do not constitute a duplicate signal.
const GENERIC_ALT_LABELS = new Set(["certo", "errado", "verdadeiro", "falso"]);

function normalizeAlternatives(alternatives: AlternativeInput[]) {
  return alternatives
    .map((alternative) => normalizeQuestionText(alternative?.text || ""))
    .filter(Boolean)
    .sort();
}

function isGenericTrueFalseOnly(alts: string[]): boolean {
  return alts.length > 0 && alts.every((alt) => GENERIC_ALT_LABELS.has(alt));
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

export function calculateDuplicateScore({
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

  // Gate: statements with less than 70 % overlap are never duplicates.
  if (statementSimilarity < 0.70) {
    return {
      statementSimilarity,
      alternativesSimilarity: 0,
      matchingAlternatives: 0,
      score: 0,
      isBlockingDuplicate: false,
      isPossibleDuplicate: false,
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

  // Generic true/false alternatives ("Certo/Errado", "Verdadeiro/Falso") carry
  // no discriminative power — reduce their weight to near-zero.
  const bothGenericTrueFalse =
    isGenericTrueFalseOnly(normalizedAlternatives) &&
    isGenericTrueFalseOnly(normalizedCandidateAlternatives);

  const altWeight = bothGenericTrueFalse ? 0.02 : 0.20;
  const stmtWeight = 1 - altWeight;

  // Weighted score: statement drives 80 %+ of the result.
  const weightedScore = statementSimilarity * stmtWeight + alternativesSimilarity * altWeight;

  // Hard cap: score cannot exceed statementSimilarity by more than 0.08.
  const score = Math.min(weightedScore, statementSimilarity + 0.08);

  // Blocking (confirmed duplicate) requires strong statement evidence.
  const isBlockingDuplicate =
    statementSimilarity >= 0.9 ||
    (statementSimilarity >= 0.78 && matchingAlternatives >= 3 && !bothGenericTrueFalse) ||
    (statementSimilarity >= 0.72 && alternativesCount >= 4 && alternativesSimilarity >= 0.9 && !bothGenericTrueFalse);

  // Metadata matching — used to qualify possible duplicates.
  const matchedMetadata: string[] = [];
  if (examBoardId && candidateExamBoardId && examBoardId === candidateExamBoardId) {
    matchedMetadata.push("banca");
  }
  if (year && candidateYear && year === candidateYear) {
    matchedMetadata.push("ano");
  }

  // Possible duplicate: stmt in [70%, blocking) with at least one metadata match.
  // When no metadata is provided the caller cannot assert context, so we allow
  // stmt >= 70% alone (preserves backward compatibility for callers without metadata).
  const hasMetadataContext = examBoardId != null || year != null;
  const isPossibleDuplicate =
    !isBlockingDuplicate &&
    statementSimilarity >= 0.70 &&
    (!hasMetadataContext || matchedMetadata.length > 0);

  return {
    statementSimilarity,
    alternativesSimilarity,
    matchingAlternatives,
    score,
    isBlockingDuplicate,
    isPossibleDuplicate,
    matchedMetadata,
  };
}

export async function findBlockingDuplicate({
  supabase,
  statement,
  alternatives,
  examBoardId,
  boardCache,
}: {
  supabase: SupabaseClient;
  statement: string;
  alternatives: AlternativeInput[];
  examBoardId: string;
  boardCache?: DuplicateCandidateCache;
}) {
  if (!clean(statement) || !clean(examBoardId)) return null;

  let candidates: DuplicateCandidate[];
  let alternativesByQuestion: Map<string, AlternativeInput[]>;

  if (boardCache?.has(examBoardId)) {
    ({ candidates, alternativesByQuestion } = boardCache.get(examBoardId)!);
  } else {
    const { data, error } = await supabase
      .from("questions")
      .select("id, statement, status, exam_board_id, year")
      .eq("exam_board_id", examBoardId)
      .limit(500);

    if (error) throw new Error(error.message);

    candidates = (data || []) as DuplicateCandidate[];
    alternativesByQuestion = new Map<string, AlternativeInput[]>();

    const candidateIds = candidates.map((q) => q.id);
    const ALT_CHUNK = 100;
    for (let i = 0; i < candidateIds.length; i += ALT_CHUNK) {
      const chunk = candidateIds.slice(i, i + ALT_CHUNK);
      const { data: altChunk, error: altError } = await supabase
        .from("question_alternatives")
        .select("question_id, label, text, image_url, is_correct")
        .in("question_id", chunk);

      if (altError) throw new Error(altError.message);

      for (const alt of (altChunk || []) as CandidateAlternative[]) {
        const current = alternativesByQuestion.get(alt.question_id) || [];
        current.push(alt);
        alternativesByQuestion.set(alt.question_id, current);
      }
    }

    boardCache?.set(examBoardId, { candidates, alternativesByQuestion });
  }

  const duplicates = (candidates || [])
    .map((candidate: DuplicateCandidate) => {
      const metrics = calculateDuplicateScore({
        statement,
        alternatives,
        candidateStatement: candidate.statement || "",
        candidateAlternatives: alternativesByQuestion.get(candidate.id) || [],
        examBoardId,
        candidateExamBoardId: candidate.exam_board_id,
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
        is_blocking: metrics.isBlockingDuplicate,
      };
    })
    .filter((candidate) => candidate.is_blocking)
    .sort((a, b) => b.similarity - a.similarity);

  return duplicates[0] || null;
}
