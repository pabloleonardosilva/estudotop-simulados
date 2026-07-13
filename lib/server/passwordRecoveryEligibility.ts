import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isApprovedStudentForPasswordRecovery } from "@/lib/auth/passwordRecoveryPolicy";

type RecoveryLookup = { userId: string; email?: never } | { userId?: never; email: string };

export async function getApprovedStudentForPasswordRecovery(supabase: SupabaseClient, lookup: RecoveryLookup) {
  let studentQuery = supabase.from("students").select("id, email, status, approved_at");
  studentQuery = lookup.userId
    ? studentQuery.eq("id", lookup.userId)
    : studentQuery.eq("email", lookup.email!.trim().toLowerCase());
  const { data: student, error: studentError } = await studentQuery.maybeSingle();
  if (studentError || !student) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", student.id)
    .maybeSingle();
  if (profileError || !isApprovedStudentForPasswordRecovery(student, profile)) return null;

  return student;
}
