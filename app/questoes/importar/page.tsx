import ImportarQuestoesClient from "./page-client";
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
    .select("id, name, discipline_id, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (subjectsError) throw new Error(subjectsError.message);

  const { data: boards, error: boardsError } = await supabase
    .from("exam_boards")
    .select("id, name")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (boardsError) throw new Error(boardsError.message);

  return {
    disciplines: disciplines || [],
    subjects: subjects || [],
    boards: boards || [],
  };
}

export default async function ImportarQuestoesPage() {
  await requireAdminPage();
  const data = await getData();

  return (
    <ImportarQuestoesClient
      disciplines={data.disciplines}
      subjects={data.subjects}
      initialBoards={data.boards}
    />
  );
}
