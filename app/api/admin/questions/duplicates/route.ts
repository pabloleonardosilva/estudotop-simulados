import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import {
  calculateDuplicateScore,
  normalizeQuestionText,
} from "@/lib/questions/duplicate-service";
import { requireAdmin } from "@/lib/server/authGuard";

type QuestionRow = {
  id: string;
  statement: string | null;
  exam_board_id: string | null;
  year: number | null;
  orgao: string | null;
  created_at: string | null;
  exam_boards?: {
    id: string;
    name: string;
  } | null;
};

type AlternativeRow = {
  question_id: string;
  label: string | null;
  text: string | null;
  image_url: string | null;
  is_correct: boolean | null;
};

function findRoot(parent: Map<string, string>, id: string): string {
  const p = parent.get(id);
  if (!p || p === id) return id;
  const root = findRoot(parent, p);
  parent.set(id, root);
  return root;
}

function unionNodes(
  parent: Map<string, string>,
  rank: Map<string, number>,
  a: string,
  b: string
) {
  const rootA = findRoot(parent, a);
  const rootB = findRoot(parent, b);
  if (rootA === rootB) return;
  const rankA = rank.get(rootA) ?? 0;
  const rankB = rank.get(rootB) ?? 0;
  if (rankA < rankB) {
    parent.set(rootA, rootB);
  } else if (rankA > rankB) {
    parent.set(rootB, rootA);
  } else {
    parent.set(rootB, rootA);
    rank.set(rootA, rankA + 1);
  }
}

const FETCH_PAGE_SIZE = 1000;

function metadataScore(question: QuestionRow): number {
  let score = 0;
  if (question.exam_board_id) score += 1;
  if (question.year) score += 1;
  if (question.orgao && question.orgao.trim()) score += 1;
  return score;
}

async function getDuplicatePayload() {
  const supabase = createSupabaseAdminClient();

  const rows: QuestionRow[] = [];
  for (let page = 0; ; page++) {
    const from = page * FETCH_PAGE_SIZE;
    const to = from + FETCH_PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from("questions")
      .select(
        `
        id,
        statement,
        exam_board_id,
        year,
        orgao,
        created_at,
        exam_boards:exam_board_id (
          id,
          name
        )
      `
      )
      .order("created_at", { ascending: true })
      .range(from, to);

    if (error) throw new Error(error.message);

    const chunk = (data || []) as unknown as QuestionRow[];
    rows.push(...chunk);

    if (chunk.length < FETCH_PAGE_SIZE) break;
  }

  if (rows.length === 0) {
    return { duplicates: [], groupsCount: 0, duplicateQuestionsCount: 0 };
  }

  // Fetch all alternatives in bulk to avoid N+1 queries
  const alternativesByQuestion = new Map<string, AlternativeRow[]>();
  for (let page = 0; ; page++) {
    const from = page * FETCH_PAGE_SIZE;
    const to = from + FETCH_PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from("question_alternatives")
      .select("question_id, label, text, image_url, is_correct")
      .range(from, to);

    if (error) throw new Error(error.message);

    const chunk = (data || []) as AlternativeRow[];
    for (const alt of chunk) {
      const current = alternativesByQuestion.get(alt.question_id) || [];
      current.push(alt);
      alternativesByQuestion.set(alt.question_id, current);
    }

    if (chunk.length < FETCH_PAGE_SIZE) break;
  }

  // Questions already used in a simulado must never be removed
  const usedInSimulado = new Set<string>();
  for (let page = 0; ; page++) {
    const from = page * FETCH_PAGE_SIZE;
    const to = from + FETCH_PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from("simulado_questions")
      .select("question_id")
      .range(from, to);

    if (error) throw new Error(error.message);

    const chunk = (data || []) as { question_id: string }[];
    for (const row of chunk) {
      usedInSimulado.add(row.question_id);
    }

    if (chunk.length < FETCH_PAGE_SIZE) break;
  }

  // Group questions by exam_board_id — same scope used during import
  const byBoard = new Map<string, QuestionRow[]>();
  for (const question of rows) {
    if (!question.exam_board_id) continue;
    const current = byBoard.get(question.exam_board_id) || [];
    current.push(question);
    byBoard.set(question.exam_board_id, current);
  }

  const duplicateGroups: QuestionRow[][] = [];

  for (const [, boardQuestions] of byBoard) {
    if (boardQuestions.length < 2) continue;

    // Union-Find to cluster questions that are blocking duplicates of each other
    const parent = new Map<string, string>();
    const rank = new Map<string, number>();

    for (const q of boardQuestions) {
      parent.set(q.id, q.id);
      rank.set(q.id, 0);
    }

    for (let i = 0; i < boardQuestions.length; i++) {
      for (let j = i + 1; j < boardQuestions.length; j++) {
        const a = boardQuestions[i];
        const b = boardQuestions[j];

        const metrics = calculateDuplicateScore({
          statement: a.statement || "",
          alternatives: alternativesByQuestion.get(a.id) || [],
          candidateStatement: b.statement || "",
          candidateAlternatives: alternativesByQuestion.get(b.id) || [],
          examBoardId: a.exam_board_id,
          candidateExamBoardId: b.exam_board_id,
          year: a.year,
          candidateYear: b.year,
        });

        if (metrics.isBlockingDuplicate) {
          unionNodes(parent, rank, a.id, b.id);
        }
      }
    }

    // Collect connected components
    const componentMap = new Map<string, QuestionRow[]>();
    for (const q of boardQuestions) {
      const root = findRoot(parent, q.id);
      const current = componentMap.get(root) || [];
      current.push(q);
      componentMap.set(root, current);
    }

    for (const group of componentMap.values()) {
      if (group.length > 1) {
        // Keeper selection order:
        // 1) questions already used in a simulado are never removable
        // 2) questions with more metadata filled (banca, ano, orgao) are kept
        // 3) ties are broken by the oldest question (created_at asc)
        group.sort((a, b) => {
          const usedA = usedInSimulado.has(a.id) ? 1 : 0;
          const usedB = usedInSimulado.has(b.id) ? 1 : 0;
          if (usedA !== usedB) return usedB - usedA;

          const scoreA = metadataScore(a);
          const scoreB = metadataScore(b);
          if (scoreA !== scoreB) return scoreB - scoreA;

          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateA - dateB;
        });
        duplicateGroups.push(group);
      }
    }
  }

  const duplicates = duplicateGroups.map((group) => {
    const keeper = group[0];
    const repeated = group.slice(1);
    const boardName = Array.isArray(keeper.exam_boards)
      ? (keeper.exam_boards[0] as { name: string } | undefined)?.name || "Sem banca"
      : keeper.exam_boards?.name || "Sem banca";

    const removableIds = repeated
      .filter((item) => !usedInSimulado.has(item.id))
      .map((item) => item.id);

    return {
      key: `${keeper.exam_board_id}-${normalizeQuestionText(keeper.statement).slice(0, 80)}`,
      board_id: keeper.exam_board_id,
      board_name: boardName,
      statement: keeper.statement,
      keep_question_id: keeper.id,
      duplicate_count: removableIds.length,
      total_count: group.length,
      duplicate_ids: removableIds,
      questions: group.map((item, index) => ({
        id: item.id,
        statement: item.statement,
        created_at: item.created_at,
        action: index === 0 || usedInSimulado.has(item.id) ? "manter" : "excluir",
      })),
    };
  });

  const duplicateQuestionsCount = duplicates.reduce(
    (sum, group) => sum + group.duplicate_count,
    0
  );

  return {
    duplicates,
    groupsCount: duplicates.length,
    duplicateQuestionsCount,
  };
}

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const payload = await getDuplicatePayload();

    return NextResponse.json({
      ok: true,
      ...payload,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Erro ao localizar questões duplicadas.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const supabase = createSupabaseAdminClient();
    const payload = await getDuplicatePayload();

    const idsToDelete = payload.duplicates.flatMap(
      (group) => group.duplicate_ids || []
    );

    if (idsToDelete.length === 0) {
      return NextResponse.json({
        ok: true,
        deletedCount: 0,
        message: "Nenhuma questão duplicada encontrada.",
      });
    }

    const { error } = await supabase
      .from("questions")
      .delete()
      .in("id", idsToDelete);

    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      deletedCount: idsToDelete.length,
      message: `${idsToDelete.length} questão(ões) duplicada(s) excluída(s).`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Erro ao excluir questões duplicadas.",
      },
      { status: 500 }
    );
  }
}
