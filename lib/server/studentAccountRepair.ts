import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

const LIST_USERS_PER_PAGE = 200;
const LIST_USERS_MAX_PAGES = 25;

/**
 * Localiza um usuário no Supabase Auth pelo e-mail (case-insensitive).
 * O GoTrue Admin API não filtra por e-mail, então a busca pagina listUsers.
 * Retorna null quando não existe.
 */
export async function findAuthUserByEmail(
  supabase: SupabaseClient,
  email: string
): Promise<User | null> {
  const target = email.trim().toLowerCase();
  if (!target) return null;

  for (let page = 1; page <= LIST_USERS_MAX_PAGES; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: LIST_USERS_PER_PAGE });
    if (error) {
      throw new Error(`Falha ao consultar usuários do Supabase Auth: ${error.message}`);
    }
    const match = data.users.find((user) => (user.email || "").toLowerCase() === target);
    if (match) return match;
    if (data.users.length < LIST_USERS_PER_PAGE) return null;
  }
  return null;
}

/** Verifica se existe usuário no Supabase Auth para o UUID informado. */
export async function authUserExists(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase.auth.admin.getUserById(userId);
  return Boolean(data?.user);
}

export type ReconcileStudentAccountParams = {
  supabase: SupabaseClient;
  /** Usuário Auth já existente (conta incompleta) que será reaproveitado. */
  authUser: User;
  fullName: string;
  email: string;
  cpf: string | null;
  phone: string | null;
  desiredContests: string | null;
  /** Campos extras específicos do fluxo (origin, notes, welcome_email_status...). */
  extraStudentFields?: Record<string, string | null>;
  /** Nova senha temporária — invalida qualquer senha antiga da conta órfã. */
  temporaryPassword: string;
  studentStatus: "pending" | "active";
};

export type ReconcileStudentAccountResult =
  | { ok: true; userId: string }
  | { ok: false; code: "NOT_STUDENT_ACCOUNT" | "REPAIR_FAILED"; message: string };

/**
 * Reconcilia uma conta incompleta (usuário existente em auth.users e/ou
 * profiles, sem linha em students), reutilizando o MESMO UUID:
 * - nunca converte contas com role diferente de "student";
 * - redefine a senha para uma temporária nova (invalida senha antiga);
 * - cria/atualiza profiles com must_change_password = true e is_active = false;
 * - cria a linha ausente em students (idempotente via upsert por id).
 *
 * A checagem de conflito de e-mail/CPF em `students` é responsabilidade do
 * chamador, ANTES de invocar esta função.
 */
export async function reconcileIncompleteStudentAccount(
  params: ReconcileStudentAccountParams
): Promise<ReconcileStudentAccountResult> {
  const { supabase, authUser, fullName, email, cpf, phone, desiredContests, extraStudentFields, temporaryPassword, studentStatus } = params;
  const userId = authUser.id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();

  if (profile && profile.role !== "student") {
    return {
      ok: false,
      code: "NOT_STUDENT_ACCOUNT",
      message: "Este e-mail já está vinculado a uma conta que não é de aluno.",
    };
  }

  // Idempotência: se a linha de students já existe para este UUID, a conta
  // está completa e não há o que reconciliar.
  const { data: existingStudent } = await supabase
    .from("students")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (existingStudent) {
    return { ok: true, userId };
  }

  const { error: authUpdateError } = await supabase.auth.admin.updateUserById(userId, {
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { ...(authUser.user_metadata || {}), full_name: fullName },
  });

  if (authUpdateError) {
    return {
      ok: false,
      code: "REPAIR_FAILED",
      message: "Não foi possível preparar a conta existente para reativação do cadastro.",
    };
  }

  if (profile) {
    const { error: profileUpdateError } = await supabase
      .from("profiles")
      .update({ full_name: fullName, is_active: false, must_change_password: true })
      .eq("id", userId);
    if (profileUpdateError) {
      return { ok: false, code: "REPAIR_FAILED", message: "Não foi possível atualizar o perfil da conta existente." };
    }
  } else {
    const { error: profileInsertError } = await supabase.from("profiles").insert({
      id: userId,
      full_name: fullName,
      role: "student",
      is_active: false,
      must_change_password: true,
    });
    if (profileInsertError) {
      return { ok: false, code: "REPAIR_FAILED", message: "Não foi possível criar o perfil da conta existente." };
    }
  }

  const { error: studentInsertError } = await supabase.from("students").upsert(
    {
      id: userId,
      name: fullName,
      email,
      cpf,
      phone,
      status: studentStatus,
      desired_contests: desiredContests,
      ...(extraStudentFields || {}),
    },
    { onConflict: "id" }
  );

  if (studentInsertError) {
    return { ok: false, code: "REPAIR_FAILED", message: "Não foi possível concluir o cadastro do aluno." };
  }

  return { ok: true, userId };
}
