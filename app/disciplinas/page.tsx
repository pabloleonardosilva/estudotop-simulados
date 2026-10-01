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
      subjects(count),
      questions(count)
    `)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  // Contagem pela Disciplina própria da questão (inclui questões sem Assunto).
  return (data || []).map(({ questions, ...discipline }) => ({
    ...discipline,
    question_count: questions?.[0]?.count || 0,
  }));
}

export default async function DisciplinasPage() {
  await requireAdminPage();
  const disciplines = await getDisciplines();
  return <DisciplinasClient initialData={disciplines} />;
}
