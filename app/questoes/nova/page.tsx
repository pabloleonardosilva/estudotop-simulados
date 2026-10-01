import NovaQuestaoClient from "./page-client";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdminPage } from "@/lib/server/authGuard";

async function getData() {
  const supabase = createSupabaseAdminClient();

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

  const { data: modelQuestions, error: modelQuestionsError } = await supabase
    .from("questions")
    .select(`
      id,
      code,
      statement,
      status,
      question_type,
      year,
      difficulty_level,
      image_url,
      explanation_text,
      subject_id,
      discipline_id,
      evaluated_topics,
      exam_board_id,
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
    `)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(500);

  if (modelQuestionsError) throw new Error(modelQuestionsError.message);

  return { disciplines: disciplines || [], subjects: subjects || [], boards: boards || [], modelQuestions: modelQuestions || [] };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// "Usar como modelo" do Banco: a questão-modelo inicializa este mesmo Criador; nunca é alterada.
async function getBankTemplate(modelId: string | undefined) {
  if (!modelId || !UUID_PATTERN.test(modelId)) return null;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("questions")
    .select(`
      id,
      code,
      statement,
      question_type,
      difficulty_level,
      image_url,
      orgao,
      evaluated_topics,
      discipline_id,
      subject_id,
      exam_board_id,
      exam_boards:exam_board_id (id, name),
      inspiration_board:inspiration_board_id (id, name),
      subjects:subject_id (id, name, discipline_id),
      question_subjects (subjects (id, name, discipline_id)),
      question_alternatives (label, text, image_url, is_correct, order_number)
    `)
    .eq("id", modelId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export default async function NovaQuestaoPage({
  searchParams,
}: {
  searchParams?: Promise<{ modelo_id?: string; retorno?: string }>;
}) {
  await requireAdminPage();
  const query = searchParams ? await searchParams : {};
  const [data, bankTemplate] = await Promise.all([getData(), getBankTemplate(query.modelo_id)]);
  const returnTo = query.retorno && query.retorno.startsWith("/questoes") ? query.retorno : null;

  return (
    <NovaQuestaoClient
      disciplines={data.disciplines}
      subjects={data.subjects}
      boards={data.boards}
      modelQuestions={data.modelQuestions as unknown as Parameters<typeof NovaQuestaoClient>[0]["modelQuestions"]}
      bankTemplate={bankTemplate as unknown as Parameters<typeof NovaQuestaoClient>[0]["bankTemplate"]}
      returnTo={returnTo}
    />
  );
}
