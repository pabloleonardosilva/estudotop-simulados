import QuestoesClient from "./page-client";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdminPage } from "@/lib/server/authGuard";

type InitialFilters = {
  search: string;
  disciplineId: string;
  subjectIds: string[];
  boardIds: string[];
  inspirationBoardIds: string[];
  orgaos: string[];
  difficultyLevels: string[];
  status: string;
  yearFilters: string[];
  missingTopics?: boolean;
};

// pending_review is managed in /questoes/revisar — not shown by default
// ready_to_publish is accessible via ?status=ready_to_publish URL param (sidebar link) but hidden from dropdown
const QUESTION_STATUSES = ["draft", "published", "active", "archived", "ready_to_publish"];

async function getData(initialFilters: InitialFilters) {
  const supabase = createSupabaseAdminClient();

  let questionsQuery = supabase
    .from("questions")
    .select(
      `
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
        disciplines:discipline_id (
          id,
          name
        )
      ),
      exam_boards:exam_board_id (
        id,
        name
      ),
      inspiration_board:inspiration_board_id (
        id,
        name
      ),
      question_alternatives (
        id,
        label,
        text,
        is_correct,
        order_number
      ),
      simulado_questions (
        id,
        status,
        order_number,
        simulados:simulado_id (
          id,
          title,
          status
        )
      )
    `,
    )
    .order("created_at", { ascending: false });

  if (initialFilters.status && QUESTION_STATUSES.includes(initialFilters.status)) {
    if (initialFilters.status === "published") {
      questionsQuery = questionsQuery.in("status", ["published", "active"]);
    } else {
      questionsQuery = questionsQuery.eq("status", initialFilters.status);
    }
  } else {
    questionsQuery = questionsQuery
      .neq("status", "pending_review")
      .neq("status", "ready_to_publish");
  }

  // A busca textual fica 100% no client para evitar carregar apenas um subconjunto
  // quando o usuario troca o termo sem dar refresh. Os demais filtros continuam
  // trabalhando sobre a lista completa carregada abaixo.

  async function fetchAllQuestionPages() {
    const PAGE_SIZE = 1000;
    const allQuestions: any[] = [];
    let from = 0;

    for (;;) {
      const { data, error } = await questionsQuery.range(
        from,
        from + PAGE_SIZE - 1,
      );

      if (error) throw new Error(error.message);

      const rows = data || [];
      allQuestions.push(...rows);

      if (rows.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    return allQuestions;
  }

  const questions = await fetchAllQuestionPages();

  const { data: disciplines } = await supabase
    .from("disciplines")
    .select("id, name")
    .order("name");

  const { data: subjects } = await supabase
    .from("subjects")
    .select("id, name, discipline_id")
    .order("name");

  const { data: boards } = await supabase
    .from("exam_boards")
    .select("id, name")
    .order("name");

  const statusCounts: Record<string, number> = {};

  const { count: allVisibleStatusCount } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .neq("status", "pending_review")
    .neq("status", "ready_to_publish");

  statusCounts.all = allVisibleStatusCount || 0;

  for (const itemStatus of QUESTION_STATUSES) {
    const { count } = await supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("status", itemStatus);

    statusCounts[itemStatus] = count || 0;
  }

  statusCounts.published =
    (statusCounts.published || 0) + (statusCounts.active || 0);

  return {
    questions,
    disciplines: disciplines || [],
    subjects: subjects || [],
    boards: boards || [],
    statusCounts,
  };
}

export default async function QuestoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage();
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

  const rawStatus = str("status");
  const initialFilters = {
    search: str("q"),
    disciplineId: str("disciplina"),
    subjectIds: arr("assunto"),
    boardIds: arr("banca"),
    inspirationBoardIds: arr("inspirada"),
    orgaos: arr("orgao"),
    difficultyLevels: arr("dificuldade"),
    status: QUESTION_STATUSES.includes(rawStatus) ? rawStatus : "",
    yearFilters: arr("ano"),
    missingTopics: str("topicos") === "sem",
  };

  const data = await getData(initialFilters);

  return (
    <QuestoesClient
      initialQuestions={data.questions}
      disciplines={data.disciplines}
      subjects={data.subjects}
      boards={data.boards}
      initialFilters={initialFilters}
      initialStatusCounts={data.statusCounts}
    />
  );
}
