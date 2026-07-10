import DisciplinasClient from "./page-client";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdminPage } from "@/lib/server/authGuard";

async function getDisciplines() {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("disciplines")
    .select(`
      id,
      name,
      description,
      is_active,
      subjects(count)
    `)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  const { data: questionRows, error: questionsError } = await supabase
    .from("questions")
    .select(`
      id,
      subjects:subject_id (
        discipline_id
      )
    `);

  if (questionsError) throw new Error(questionsError.message);

  const questionCountByDiscipline = new Map<string, number>();

  for (const row of questionRows || []) {
    const subject = Array.isArray(row.subjects) ? row.subjects[0] : row.subjects;
    const disciplineId = subject?.discipline_id;

    if (!disciplineId) continue;

    questionCountByDiscipline.set(
      disciplineId,
      (questionCountByDiscipline.get(disciplineId) || 0) + 1,
    );
  }

  return (data || []).map((discipline) => ({
    ...discipline,
    question_count: questionCountByDiscipline.get(discipline.id) || 0,
  }));
}

export default async function DisciplinasPage() {
  await requireAdminPage();
  const disciplines = await getDisciplines();
  return <DisciplinasClient initialData={disciplines} />;
}
