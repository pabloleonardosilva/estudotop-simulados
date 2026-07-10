import EditarQuestaoClient from "./page-client";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdminPage } from "@/lib/server/authGuard";

async function getData(id: string, queueStatusFromUrl?: string, queueDisciplineFromUrl?: string) {
  const supabase = createSupabaseAdminClient();

  const { data: question, error: questionError } = await supabase
    .from("questions")
    .select(`
      id,
      code,
      statement,
      status,
      question_type,
      year,
      difficulty_level,
      evaluated_topics,
      image_url,
      explanation_text,
      review_comment,
      subject_id,
      exam_board_id,
      orgao,
      created_at,
      exam_boards:exam_board_id (
        id,
        name
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
      subjects:subject_id (
        id,
        discipline_id,
        disciplines:discipline_id (
          id,
          name
        )
      ),
      question_alternatives (
        id,
        label,
        text,
        image_url,
        is_correct,
        order_number
      )
    `)
    .eq("id", id)
    .single();

  if (questionError) throw new Error(questionError.message);

  const validStatuses = ["draft", "pending_review", "published", "active", "archived"];
  const currentQuestionStatus = question.status || "draft";
  const queueStatus = queueStatusFromUrl && validStatuses.includes(queueStatusFromUrl)
    ? queueStatusFromUrl
    : currentQuestionStatus;

  const { data: sameStatusQuestions, error: navError } = await supabase
    .from("questions")
    .select(`
      id,
      code,
      created_at,
      status,
      subjects:subject_id (
        discipline_id,
        disciplines:discipline_id (
          id,
          name
        )
      )
    `)
    .eq("status", queueStatus)
    .order("created_at", { ascending: true });

  if (navError) throw new Error(navError.message);

  const questionRow = question as any;
  const currentQuestionDisciplineId = questionRow.subjects?.discipline_id || "";
  const queueDisciplineId = queueDisciplineFromUrl || currentQuestionDisciplineId;

  const fullNavList = sameStatusQuestions || [];
  const navList = fullNavList.filter((item: any) => {
    return item.subjects?.discipline_id === queueDisciplineId;
  });

  const currentIndex = navList.findIndex((item) => item.id === id);

  const currentNavDiscipline = navList.find((item: any) => item.subjects?.discipline_id === queueDisciplineId) as any;
  const queueDisciplineName =
    currentNavDiscipline?.subjects?.disciplines?.name ||
    questionRow.subjects?.disciplines?.name ||
    "Disciplina não identificada";

  const previousQuestionId = currentIndex > 0 ? navList[currentIndex - 1]?.id || null : null;
  const nextQuestionId = currentIndex >= 0 && currentIndex < navList.length - 1 ? navList[currentIndex + 1]?.id || null : null;

  const { data: disciplines, error: disciplinesError } = await supabase
    .from("disciplines")
    .select("id, name, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (disciplinesError) throw new Error(disciplinesError.message);

  const { data: subjects, error: subjectsError } = await supabase
    .from("subjects")
    .select("id, name, is_active, discipline_id")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (subjectsError) throw new Error(subjectsError.message);

  const { data: boards, error: boardsError } = await supabase
    .from("exam_boards")
    .select("id, name, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (boardsError) throw new Error(boardsError.message);

  return {
    question,
    disciplines: disciplines || [],
    subjects: subjects || [],
    boards: boards || [],
    navigation: {
      previousQuestionId,
      nextQuestionId,
      currentIndex: currentIndex >= 0 ? currentIndex + 1 : null,
      totalSameStatus: navList.length,
      queueStatus,
      queueDisciplineId,
      queueDisciplineName,
      currentQuestionStatus,
      currentQuestionDisciplineId,
    },
  };
}

export default async function EditarQuestaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ fila?: string; disciplina?: string; retorno?: string }>;
}) {
  await requireAdminPage();
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const data = await getData(id, query?.fila, query?.disciplina);
  const backUrl = query?.retorno || null;

  return (
    <EditarQuestaoClient
      question={data.question}
      disciplines={data.disciplines}
      subjects={data.subjects}
      boards={data.boards}
      navigation={data.navigation}
      backUrl={backUrl}
    />
  );
}
