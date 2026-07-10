import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

type AuthenticatedStudent = {
  id: string;
  email: string | null;
  name: string | null;
  status: string | null;
};

export async function getStudentFromRequest(request: Request): Promise<AuthenticatedStudent | null> {
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (!token) return null;

  const supabase = createSupabaseAdminClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData.user) return null;

  const user = userData.user;
  const { data: student } = await supabase
    .from("students")
    .select("id, email, name, status")
    .eq("id", user.id)
    .maybeSingle();

  if (!student) return null;
  if (student.status === "blocked") return null;

  return {
    id: student.id,
    email: student.email ?? user.email ?? null,
    name: student.name ?? null,
    status: student.status ?? null,
  };
}
