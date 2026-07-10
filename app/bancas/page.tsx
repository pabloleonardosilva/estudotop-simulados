import BancasClient from "./page-client";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdminPage } from "@/lib/server/authGuard";

export const dynamic = "force-dynamic";

async function getData() {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("exam_boards")
    .select("id, name, is_active, created_at")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  const { data: questionRows, error: questionsError } = await supabase
    .from("questions")
    .select("id, exam_board_id");

  if (questionsError) throw new Error(questionsError.message);

  const questionCountByBoard = new Map<string, number>();

  for (const question of questionRows || []) {
    if (!question.exam_board_id) continue;
    questionCountByBoard.set(
      question.exam_board_id,
      (questionCountByBoard.get(question.exam_board_id) || 0) + 1,
    );
  }

  return (data || []).map((board) => ({
    ...board,
    question_count: questionCountByBoard.get(board.id) || 0,
  }));
}

export default async function BancasPage() {
  await requireAdminPage();
  const boards = await getData();

  return <BancasClient boards={boards} />;
}
