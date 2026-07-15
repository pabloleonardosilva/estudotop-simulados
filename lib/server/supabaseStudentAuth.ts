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

type StudentAuthRow = { id: string; email: string | null; name: string | null; status: string | null } | null;

// Lê APENAS o claim `sub` do JWT (sem verificar assinatura) para pré-buscar o
// aluno em paralelo com a verificação real (`auth.getUser`). O `sub` decodificado
// nunca é confiado por si só: só usamos o pré-fetch quando o token é validado E o
// `sub` coincide com o usuário verificado.
function decodeJwtSub(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    return typeof sub === "string" ? sub : null;
  } catch {
    return null;
  }
}

/**
 * Valida o token JWT enviado pelo aluno no header Authorization, confirma que
 * existe uma linha ativa na tabela `students` (status diferente de "blocked") e
 * retorna o usuário correspondente. Retorna null em qualquer falha.
 *
 * Performance: a verificação do token (`auth.getUser`) e a busca do aluno rodam
 * em PARALELO (antes eram sequenciais), pré-buscando o aluno pelo `sub` do JWT.
 * A segurança é preservada: o resultado só é usado após `auth.getUser` validar o
 * token e confirmar que `sub === user.id`.
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
  const decodedSub = decodeJwtSub(token);

  const [authResult, preStudentResult] = await Promise.all([
    supabase.auth.getUser(token),
    decodedSub
      ? supabase.from("students").select("id, email, name, status").eq("id", decodedSub).maybeSingle()
      : Promise.resolve({ data: null as StudentAuthRow, error: null }),
  ]);

  const user = authResult.data.user;
  if (authResult.error || !user) {
    void logSecurityEvent({ event: "auth.unauthorized", actorType: "student", request, metadata: { reason: "invalid_token" } });
    return null;
  }

  // Confia no pré-fetch apenas se o token verificado corresponde ao `sub` usado.
  // Caso contrário (sub ausente/divergente), busca pelo id realmente verificado.
  let studentRow = decodedSub === user.id && !preStudentResult.error
    ? (preStudentResult.data as StudentAuthRow)
    : null;
  if (studentRow === null && (decodedSub !== user.id || Boolean(preStudentResult.error))) {
    const { data } = await supabase
      .from("students")
      .select("id, email, name, status")
      .eq("id", user.id)
      .maybeSingle();
    studentRow = data as StudentAuthRow;
  }

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
