import { requireAdminPage } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import HotmartPageClient from "./page-client";

export default async function HotmartPage() {
  await requireAdminPage();
  const supabase = createSupabaseAdminClient();
  const [{ data: jornadas }, { data: events }] = await Promise.all([
    supabase.from("jornadas").select("id,title,status").order("title"),
    supabase.from("simulado_events").select("id,name,status").order("name"),
  ]);
  return <HotmartPageClient jornadas={jornadas || []} events={events || []} />;
}
