import RevisarQuestoesClient from "./page-client";
import type { Board, Discipline, Question, Subject } from "./page-client";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdminPage } from "@/lib/server/authGuard";

export const dynamic = "force-dynamic";

type ReviewPageData = {
  questions: Question[];
  disciplines: Discipline[];
  subjects: Subject[];
  boards: Board[];
};

async function getData(): Promise<ReviewPageData> {
  const supabase = createSupabaseAdminClient();

  const questionsSelect = `
    id,
    code,
    statement,
    status,
    question_type,
    year,
    difficulty_level,
    evaluated_topics,
    orgao,
    image_url,
    explanation_text,
    created_at,
    review_comment,
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
    subjects:subject_id (
      id,
      name,
      discipline_id,
      disciplines:discipline_id (
        id,
        name
      )
    ),
    exam_boards:exam_board_id (
      id,
      name
    ),
    question_alternatives (
      id,
      label,
      text,
      image_url,
      is_correct,
      order_number
    )
  `;

  const questionsFallbackSelect = `
    id,
    code,
    statement,
    status,
    question_type,
    year,
    difficulty_level,
    evaluated_topics,
    orgao,
    image_url,
    explanation_text,
    created_at,
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
    subjects:subject_id (
      id,
      name,
      discipline_id,
      disciplines:discipline_id (
        id,
        name
      )
    ),
    exam_boards:exam_board_id (
      id,
      name
    ),
    question_alternatives (
      id,
      label,
      text,
      image_url,
      is_correct,
      order_number
    )
  `;

  const { data: disciplines, error: disciplinesError } = await supabase
    .from("disciplines")
    .select("id, name")
    .order("name", { ascending: true });

  if (disciplinesError) throw new Error(disciplinesError.message);

  const { data: subjects, error: subjectsError } = await supabase
    .from("subjects")
    .select("id, name, discipline_id")
    .order("name", { ascending: true });

  if (subjectsError) throw new Error(subjectsError.message);

  const { data: boards, error: boardsError } = await supabase
    .from("exam_boards")
    .select("id, name")
    .order("name", { ascending: true });

  if (boardsError) throw new Error(boardsError.message);

  async function fetchAllPages(select: string, withReviewComment: boolean) {
    const PAGE = 1000;
    const all: unknown[] = [];
    let from = 0;

    for (;;) {
      const { data, error } = await supabase
        .from("questions")
        .select(select)
        .in("status", ["pending_review", "ready_to_publish"])
        .order("created_at", { ascending: true })
        .range(from, from + PAGE - 1);

      if (error) throw error;

      const rows = data || [];
      all.push(...rows);
      if (rows.length < PAGE) break;
      from += PAGE;
    }

    return withReviewComment
      ? all
      : all.map((q) => ({ ...(q as object), review_comment: "" }));
  }

  let questions: unknown[];

  try {
    questions = await fetchAllPages(questionsSelect, true);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.toLowerCase().includes("review_comment")) {
      questions = await fetchAllPages(questionsFallbackSelect, false);
    } else {
      throw new Error(message);
    }
  }

  return {
    questions: (questions as unknown) as Question[],
    disciplines: ((disciplines || []) as unknown) as Discipline[],
    subjects: ((subjects || []) as unknown) as Subject[],
    boards: ((boards || []) as unknown) as Board[],
  };
}

export default async function RevisarQuestoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage();
  const data = await getData();
  const sp = await searchParams;

  function str(key: string) {
    const v = sp[key];
    return typeof v === "string" ? v : "";
  }
  function arr(key: string) {
    const v = sp[key];
    if (Array.isArray(v)) return v;
    if (typeof v === "string") return [v];
    return [];
  }

  const initialFilters = {
    boardIds: arr("banca"),
    subjectIds: arr("assunto"),
    disciplineId: str("disciplina"),
    difficultyLevels: arr("dificuldade"),
    orgaos: arr("orgao"),
    status: str("status") || "pending_review",
    years: arr("ano"),
    q: str("q"),
    missingTopics: str("topicos") === "sem",
  };

  return (
    <RevisarQuestoesClient
      initialQuestions={data.questions}
      disciplines={data.disciplines}
      subjects={data.subjects}
      boards={data.boards}
      initialFilters={initialFilters}
    />
  );
}
