import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdminPage } from "@/lib/server/authGuard";
import EditarSimuladoClient from "./page-client";

const QUESTION_SELECT = `
  id,
  code,
  statement,
  explanation_text,
  status,
  difficulty_level,
  evaluated_topics,
  year,
  question_type,
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
    id,
    label,
    text,
    is_correct,
    order_number
  ),
  simulado_questions (
    id,
    simulados:simulado_id (
      id,
      title,
      status
    )
  )
`;

async function fetchAllPublishedQuestions(supabase: ReturnType<typeof createSupabaseAdminClient>) {
  const PAGE_SIZE = 1000;
  const all: Record<string, unknown>[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("questions")
      .select(QUESTION_SELECT)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) return { data: null, error };

    const rows = (data || []) as Record<string, unknown>[];
    all.push(...rows);

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { data: all, error: null };
}

async function getJornadaQuestionIds(supabase: ReturnType<typeof createSupabaseAdminClient>) {
  const { data: jornadaSimulados, error: jornadaSimuladosError } = await supabase
    .from("jornada_simulados")
    .select("jornada_id, simulado_id");

  if (jornadaSimuladosError) throw new Error(jornadaSimuladosError.message);

  const linkedSimuladoIds = Array.from(new Set((jornadaSimulados || []).map((link) => link.simulado_id).filter(Boolean)));

  const { data: simuladoQuestions, error: simuladoQuestionsError } = linkedSimuladoIds.length
    ? await supabase
        .from("simulado_questions")
        .select("simulado_id, question_id")
        .in("simulado_id", linkedSimuladoIds)
    : { data: [], error: null };

  if (simuladoQuestionsError) throw new Error(simuladoQuestionsError.message);

  const questionIdsBySimulado = new Map<string, Set<string>>();
  for (const link of simuladoQuestions || []) {
    const set = questionIdsBySimulado.get(link.simulado_id) || new Set<string>();
    set.add(link.question_id);
    questionIdsBySimulado.set(link.simulado_id, set);
  }

  const questionIdsByJornada = new Map<string, Set<string>>();
  for (const link of jornadaSimulados || []) {
    const simuladoQuestionIds = questionIdsBySimulado.get(link.simulado_id);
    if (!simuladoQuestionIds) continue;
    const set = questionIdsByJornada.get(link.jornada_id) || new Set<string>();
    simuladoQuestionIds.forEach((questionId) => set.add(questionId));
    questionIdsByJornada.set(link.jornada_id, set);
  }

  const result: Record<string, string[]> = {};
  for (const [jornadaId, set] of questionIdsByJornada.entries()) {
    result[jornadaId] = Array.from(set);
  }
  return result;
}

async function getData(id: string) {
  const supabase = createSupabaseAdminClient();

  const [
    { data: simulado, error: simuladoError },
    { data: relations, error: relationsError },
    { data: questions, error: questionsError },
    { data: disciplines, error: disciplinesError },
    { data: subjects, error: subjectsError },
    { data: boards, error: boardsError },
    { data: jornadas, error: jornadasError },
    jornadaQuestionIds,
  ] = await Promise.all([
    supabase.from("simulados").select("*").eq("id", id).single(),
    supabase
      .from("simulado_questions")
      .select(`
        id,
        simulado_id,
        question_id,
        order_number,
        points,
        status,
        questions:question_id (
          id,
          code,
          statement,
          explanation_text,
          status,
          difficulty_level,
          evaluated_topics,
          year,
          question_type,
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
            id,
            label,
            text,
            is_correct,
            order_number
          ),
          simulado_questions (
            id,
            simulados:simulado_id (
              id,
              title,
              status
            )
          )
        )
      `)
      .eq("simulado_id", id)
      .order("order_number", { ascending: true }),
    fetchAllPublishedQuestions(supabase),
    supabase.from("disciplines").select("id, name").eq("is_active", true).order("name", { ascending: true }),
    supabase.from("subjects").select("id, name, discipline_id").eq("is_active", true).order("name", { ascending: true }),
    supabase.from("exam_boards").select("id, name").eq("is_active", true).order("name", { ascending: true }),
    supabase.from("jornadas").select("id, title").order("title", { ascending: true }),
    getJornadaQuestionIds(supabase),
  ]);

  if (simuladoError || !simulado) return null;
  if (relationsError) throw new Error(relationsError.message);
  if (questionsError) throw new Error(questionsError.message);
  if (disciplinesError) throw new Error(disciplinesError.message);
  if (subjectsError) throw new Error(subjectsError.message);
  if (boardsError) throw new Error(boardsError.message);
  if (jornadasError) throw new Error(jornadasError.message);

  const questionIds = Array.from(
    new Set([
      ...(questions || []).map((question) => question.id).filter(Boolean),
      ...(relations || []).map((relation) => relation.question_id).filter(Boolean),
    ]),
  );

  const accuracyByQuestionId = new Map<
    string,
    { correct_count: number; wrong_count: number; total_answered_count: number; accuracy_rate: number | null }
  >();

  if (questionIds.length > 0) {
    const BATCH_SIZE = 80;
    const batches: string[][] = [];
    for (let i = 0; i < questionIds.length; i += BATCH_SIZE) {
      batches.push(questionIds.slice(i, i + BATCH_SIZE));
    }

    for (const batch of batches) {
      let from = 0;
      const PAGE_SIZE = 1000;

      for (;;) {
        const { data: answers, error: answersError } = await supabase
          .from("simulado_answers")
          .select("question_id, is_correct")
          .in("question_id", batch)
          .not("is_correct", "is", null)
          .range(from, from + PAGE_SIZE - 1);

        if (answersError) throw new Error(answersError.message);

        const rows = answers || [];
        rows.forEach((answer) => {
          if (!answer.question_id) return;

          const current = accuracyByQuestionId.get(answer.question_id) || {
            correct_count: 0,
            wrong_count: 0,
            total_answered_count: 0,
            accuracy_rate: null,
          };

          if (answer.is_correct) {
            current.correct_count += 1;
          } else {
            current.wrong_count += 1;
          }

          current.total_answered_count += 1;
          current.accuracy_rate = Math.round((current.correct_count / current.total_answered_count) * 100);
          accuracyByQuestionId.set(answer.question_id, current);
        });

        if (rows.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
    }
  }

  function withAccuracy(question: Record<string, unknown>) {
    const questionId = typeof question.id === "string" ? question.id : "";
    if (!questionId) return question;
    const stats = accuracyByQuestionId.get(questionId);

    return {
      ...question,
      correct_count: stats?.correct_count || 0,
      wrong_count: stats?.wrong_count || 0,
      total_answered_count: stats?.total_answered_count || 0,
      accuracy_rate: stats?.accuracy_rate ?? null,
    };
  }

  const relationsWithAccuracy = (relations || []).map((relation) => ({
    ...relation,
    questions: relation.questions ? withAccuracy(relation.questions as unknown as Record<string, unknown>) : relation.questions,
  }));

  return {
    simulado,
    relations: relationsWithAccuracy,
    questions: (questions || []).map((question) => withAccuracy(question as unknown as Record<string, unknown>)),
    disciplines: disciplines || [],
    subjects: subjects || [],
    boards: boards || [],
    jornadas: jornadas || [],
    jornadaQuestionIds,
  };
}

export default async function EditarSimuladoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage();
  const { id } = await params;
  const sp = await searchParams;
  const rawRetorno = typeof sp.retorno === "string" ? sp.retorno : "";
  const retorno = rawRetorno.startsWith("/simulados") ? rawRetorno : "";
  const data = await getData(id);

  if (!data) notFound();

  return (
    <EditarSimuladoClient
      simulado={data.simulado}
      initialRelations={data.relations as unknown as Parameters<typeof EditarSimuladoClient>[0]["initialRelations"]}
      bankQuestions={data.questions as unknown as Parameters<typeof EditarSimuladoClient>[0]["bankQuestions"]}
      disciplines={data.disciplines}
      subjects={data.subjects}
      boards={data.boards}
      jornadas={data.jornadas}
      jornadaQuestionIds={data.jornadaQuestionIds}
      retorno={retorno}
    />
  );
}
