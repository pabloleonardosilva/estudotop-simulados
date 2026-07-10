import ImportarBancasClient from "./page-client";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdminPage } from "@/lib/server/authGuard";

async function getBoards() {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("exam_boards")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  return data || [];
}

export default async function ImportarBancasPage() {
  await requireAdminPage();
  const boards = await getBoards();
  return <ImportarBancasClient boards={boards} />;
}
