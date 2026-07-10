import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdminPage } from "@/lib/server/authGuard";
import AjudaAdminClient, { type HelpMessageRow } from "./page-client";

async function getHelpMessages(): Promise<HelpMessageRow[]> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("student_help_messages")
    .select(
      `
        id,
        message,
        status,
        admin_reply,
        replied_at,
        created_at,
        student_id,
        students ( name, email )
      `,
    )
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []) as unknown as HelpMessageRow[];
}

export default async function AjudaAdminPage() {
  await requireAdminPage();
  const messages = await getHelpMessages();
  return <AjudaAdminClient initialMessages={messages} />;
}
