import AssuntosClient from "./page-client";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdminPage } from "@/lib/server/authGuard";

async function getData() {
  const supabase = createSupabaseAdminClient();

  const { data: disciplines, error: disciplinesError } = await supabase
    .from("disciplines")
    .select("id, name, is_active")
    .order("name", { ascending: true });

  if (disciplinesError) {
    throw new Error(disciplinesError.message);
  }

  const { data: subjects, error: subjectsError } = await supabase
    .from("subjects")
    .select(`
      id,
      name,
      is_active,
      discipline_id,
      disciplines:discipline_id (
        id,
        name
      ),
      questions(count)
    `)
    .order("name", { ascending: true });

  if (subjectsError) {
    throw new Error(subjectsError.message);
  }

  return {
    disciplines: disciplines || [],
    subjects: subjects || [],
  };
}

export default async function AssuntosPage() {
  await requireAdminPage();
  const data = await getData();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <AssuntosClient initialDisciplines={data.disciplines} initialSubjects={data.subjects as any[]} />;
}
