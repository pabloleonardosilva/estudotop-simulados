import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdminPage } from "@/lib/server/authGuard";
import AlunosAdminClient from "./page-client";

export type StudentRow = {
  id: string;
  email: string | null;
  cpf: string | null;
  phone: string | null;
  origin: string | null;
  status: "pending" | "active" | "blocked" | "inactive";
  name: string | null;
  created_at: string;
  welcome_email_status: "pending" | "sending" | "sent" | "failed";
  welcome_email_sent_at: string | null;
};

async function getStudents(): Promise<StudentRow[]> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("students")
    .select(`
      id,
      email,
      cpf,
      phone,
      origin,
      name,
      status,
      created_at,
      welcome_email_status,
      welcome_email_sent_at
    `)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []) as unknown as StudentRow[];
}

export default async function AlunosAdminPage() {
  await requireAdminPage();
  const students = await getStudents();
  return <AlunosAdminClient students={students} />;
}
