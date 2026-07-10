import NovoSimuladoClient from "./page-client";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdminPage } from "@/lib/server/authGuard";

async function getData() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("disciplines")
    .select("id, name")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

export default async function NovoSimuladoPage() {
  await requireAdminPage();
  const disciplines = await getData();
  return <NovoSimuladoClient disciplines={disciplines} />;
}
