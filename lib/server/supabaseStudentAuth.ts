import "server-only";

import { createSupabaseAdminClient } from "./supabaseAdmin";
import { logSecurityEvent } from "@/app/lib/server/auditLogger";

export type AuthenticatedStudent = {
  id: string;
  email: string | null;
  name: string | null;
  status: string | null;
  user_metadata?: {
    full_name?: string | null;
    name?: string | null;
  };
};

/**
 * Valida o token JWT enviado pelo aluno no header Authorization, confirma que
 * existe uma linha ativa na tabela `students` (status diferente de "blocked") e
 * retorna o usuário correspondente. Retorna null em qualquer falha.
 */
export async function getStudentFromRequest(request: Request): Promise<AuthenticatedStudent | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    void logSecurityEvent({ event: "auth.unauthorized", actorType: "student", request, metadata: { reason: "missing_token" } });
    return null;
  }

  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const supabase = createSupabaseAdminClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    void logSecurityEvent({ event: "auth.unauthorized", actorType: "student", request, metadata: { reason: "invalid_token" } });
    return null;
  }

  const { data: studentRow } = await supabase
    .from("students")
    .select("id, email, name, status")
    .eq("id", user.id)
    .maybeSingle();

  if (!studentRow || studentRow.status === "blocked" || studentRow.status === "pending" || studentRow.status === "inactive") {
    void logSecurityEvent({
      event: studentRow?.status === "blocked" ? "student.blocked_access" : "student.forbidden",
      actorType: "student",
      actorId: user.id,
      actorEmail: user.email,
      request,
      metadata: { reason: !studentRow ? "student_missing" : studentRow.status },
    });
    return null;
  }

  return {
    id: studentRow.id,
    email: studentRow.email ?? user.email ?? null,
    name: studentRow.name ?? null,
    status: studentRow.status ?? null,
    user_metadata: user.user_metadata,
  };
}
