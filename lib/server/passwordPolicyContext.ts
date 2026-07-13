import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PasswordPolicyContext } from "@/lib/auth/passwordPolicy";

export async function getPasswordPolicyContext(supabase: SupabaseClient, userId: string, fallbackEmail?: string | null): Promise<PasswordPolicyContext> {
  const [{ data: student }, { data: profile }] = await Promise.all([
    supabase.from("students").select("name, email, cpf, phone").eq("id", userId).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
  ]);
  return {
    fullName: student?.name || profile?.full_name || null,
    email: student?.email || fallbackEmail || null,
    cpf: student?.cpf || null,
    phone: student?.phone || null,
  };
}
