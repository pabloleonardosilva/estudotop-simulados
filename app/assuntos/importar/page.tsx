import ImportarAssuntosClient from "./page-client";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdminPage } from "@/lib/server/authGuard";

export default async function ImportarAssuntosPage() {
  await requireAdminPage();
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("disciplines")
    .select("id, name")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  return <ImportarAssuntosClient disciplines={data || []} />;
}
