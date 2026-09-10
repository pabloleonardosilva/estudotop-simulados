import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { findAuthUserByEmail, reconcileIncompleteStudentAccount } from "@/lib/server/studentAccountRepair";
import { removeRegistrationAttemptByEmail } from "@/lib/server/studentRegistrationAttemptService";

export type StudentAccountErrorCode =
  | "STUDENT_NAME_REQUIRED"
  | "STUDENT_EMAIL_REQUIRED"
  | "STUDENT_EMAIL_INVALID"
  | "STUDENT_EMAIL_ALREADY_EXISTS"
  | "STUDENT_EMAIL_USED_BY_ADMIN"
  | "STUDENT_CPF_INVALID"
  | "STUDENT_CPF_ALREADY_EXISTS"
  | "STUDENT_PHONE_INVALID"
  | "STUDENT_PASSWORD_INVALID"
  | "STUDENT_AUTH_CREATION_FAILED"
  | "STUDENT_PROFILE_CREATION_FAILED"
  | "STUDENT_RECORD_CREATION_FAILED"
  | "STUDENT_CONFIRMATION_CREATION_FAILED"
  | "STUDENT_ACCOUNT_INCOMPLETE"
  | "STUDENT_ACCOUNT_CONFLICT"
  | "STUDENT_EMAIL_UPDATE_FAILED"
  | "STUDENT_UPDATE_ROLLBACK_FAILED"
  | "STUDENT_REGISTRATION_FAILED"
  | "INTERNAL_ERROR";

const ERROR_MESSAGES: Record<StudentAccountErrorCode, string> = {
  STUDENT_NAME_REQUIRED: "Informe o nome completo do aluno.",
  STUDENT_EMAIL_REQUIRED: "Informe o e-mail do aluno.",
  STUDENT_EMAIL_INVALID: "O e-mail informado não é válido.",
  STUDENT_EMAIL_ALREADY_EXISTS: "Já existe uma conta cadastrada com este e-mail.",
  STUDENT_EMAIL_USED_BY_ADMIN: "Este e-mail pertence a uma conta administrativa e não pode ser usado para cadastrar um aluno.",
  STUDENT_CPF_INVALID: "O CPF informado não é válido.",
  STUDENT_CPF_ALREADY_EXISTS: "Já existe um aluno cadastrado com este CPF.",
  STUDENT_PHONE_INVALID: "O telefone informado não é válido.",
  STUDENT_PASSWORD_INVALID: "A senha não atende aos requisitos mínimos de segurança.",
  STUDENT_AUTH_CREATION_FAILED: "Não foi possível criar a conta de acesso do aluno. Nenhum cadastro incompleto foi mantido.",
  STUDENT_PROFILE_CREATION_FAILED: "Não foi possível criar o perfil do aluno. A operação foi desfeita.",
  STUDENT_RECORD_CREATION_FAILED: "Não foi possível concluir o cadastro do aluno. A operação foi desfeita.",
  STUDENT_CONFIRMATION_CREATION_FAILED: "Não foi possível preparar a confirmação do cadastro. A operação foi desfeita.",
  STUDENT_ACCOUNT_INCOMPLETE: "Foi encontrada uma conta incompleta com este e-mail. O cadastro não foi duplicado e precisa ser regularizado.",
  STUDENT_ACCOUNT_CONFLICT: "Os dados informados estão vinculados a outra conta. Verifique o e-mail, CPF e telefone.",
  STUDENT_EMAIL_UPDATE_FAILED: "Não foi possível atualizar o e-mail de acesso. Os dados anteriores foram preservados.",
  STUDENT_UPDATE_ROLLBACK_FAILED: "Não foi possível concluir a atualização com segurança. Nenhuma confirmação de sucesso foi emitida. O administrador deve verificar a integridade da conta.",
  STUDENT_REGISTRATION_FAILED: "Não foi possível concluir o cadastro. Revise os dados informados e tente novamente.",
  INTERNAL_ERROR: "Ocorreu um erro interno ao processar o cadastro. Nenhum cadastro incompleto deve permanecer.",
};

export class StudentAccountError extends Error {
  constructor(public readonly code: StudentAccountErrorCode, public readonly field?: string) {
    super(ERROR_MESSAGES[code]);
  }
}

export function studentAccountErrorResponse(error: unknown, publicFlow = false) {
  if (error instanceof StudentAccountError) {
    const publicMessage = error.code === "STUDENT_EMAIL_ALREADY_EXISTS" || error.code === "STUDENT_EMAIL_USED_BY_ADMIN"
      ? "Este e-mail já está vinculado a uma conta. Tente entrar ou recuperar o acesso."
      : error.message;
    return { ok: false as const, code: error.code, message: publicFlow ? publicMessage : error.message, field: error.field };
  }
  return { ok: false as const, code: "INTERNAL_ERROR" as const, message: ERROR_MESSAGES.INTERNAL_ERROR };
}

export type CreateStudentAccountInput = {
  fullName: string;
  email: string;
  cpf: string | null;
  phone: string | null;
  desiredContests: string | null;
  temporaryPassword: string;
  status: "pending" | "active";
  extraStudentFields?: Record<string, string | null>;
};

async function rollbackCreatedAccount(supabase: SupabaseClient, userId: string) {
  await supabase.from("student_registration_confirmations").delete().eq("user_id", userId);
  await supabase.from("students").delete().eq("id", userId);
  await supabase.from("profiles").delete().eq("id", userId);
  await supabase.auth.admin.deleteUser(userId);
}

export async function validateStudentAccountIntegrity(supabase: SupabaseClient, userId: string) {
  const [{ data: auth }, { data: profile }, { data: student }] = await Promise.all([
    supabase.auth.admin.getUserById(userId),
    supabase.from("profiles").select("id, role").eq("id", userId).maybeSingle(),
    supabase.from("students").select("id, email").eq("id", userId).maybeSingle(),
  ]);
  return Boolean(auth?.user && profile?.role === "student" && student?.id === userId && (auth.user.email || "").toLowerCase() === (student.email || "").toLowerCase());
}

export async function createStudentAccount(supabase: SupabaseClient, input: CreateStudentAccountInput) {
  const existingAuth = await findAuthUserByEmail(supabase, input.email);
  if (existingAuth) {
    const repair = await reconcileIncompleteStudentAccount({
      supabase,
      authUser: existingAuth,
      fullName: input.fullName,
      email: input.email,
      cpf: input.cpf,
      phone: input.phone,
      desiredContests: input.desiredContests,
      extraStudentFields: input.extraStudentFields,
      temporaryPassword: input.temporaryPassword,
      studentStatus: input.status,
    });
    if (!repair.ok) {
      throw new StudentAccountError(repair.code === "NOT_STUDENT_ACCOUNT" ? "STUDENT_EMAIL_USED_BY_ADMIN" : "STUDENT_ACCOUNT_INCOMPLETE", "email");
    }
    if (!(await validateStudentAccountIntegrity(supabase, repair.userId))) throw new StudentAccountError("STUDENT_ACCOUNT_INCOMPLETE");
    // Conta constituída integralmente (reaproveitando um Auth órfão) — a
    // tentativa de cadastro incompleta correspondente deixa de existir,
    // qualquer que tenha sido o caminho até aqui (cadastro público ou
    // criação administrativa). Nunca falha o cadastro se a limpeza falhar.
    await removeRegistrationAttemptByEmail(supabase, input.email);
    return { userId: repair.userId, repaired: true };
  }

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.temporaryPassword,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });
  if (authError || !authData.user) throw new StudentAccountError("STUDENT_AUTH_CREATION_FAILED", "email");
  const userId = authData.user.id;

  const { error: profileError } = await supabase.from("profiles").insert({ id: userId, full_name: input.fullName, role: "student", is_active: false, must_change_password: true });
  if (profileError) {
    await rollbackCreatedAccount(supabase, userId);
    throw new StudentAccountError("STUDENT_PROFILE_CREATION_FAILED");
  }

  const { error: studentError } = await supabase.from("students").insert({
    id: userId,
    name: input.fullName,
    email: input.email,
    cpf: input.cpf,
    phone: input.phone,
    status: input.status,
    desired_contests: input.desiredContests,
    ...(input.extraStudentFields || {}),
  });
  if (studentError) {
    await rollbackCreatedAccount(supabase, userId);
    throw new StudentAccountError("STUDENT_RECORD_CREATION_FAILED");
  }
  if (!(await validateStudentAccountIntegrity(supabase, userId))) {
    await rollbackCreatedAccount(supabase, userId);
    throw new StudentAccountError("STUDENT_ACCOUNT_INCOMPLETE");
  }
  // Conta constituída integralmente — mesma limpeza da tentativa incompleta
  // do branch de reconciliação acima (ver comentário lá).
  await removeRegistrationAttemptByEmail(supabase, input.email);
  return { userId, repaired: false };
}

export type EnsureStudentRecordInput = {
  /** UUID de uma identidade auth.users/profiles JÁ AUTENTICADA nesta requisição — nunca um e-mail informado anonimamente. */
  userId: string;
  /** E-mail real da própria identidade autenticada (auth.users.email), nunca um valor arbitrário do cliente. */
  email: string;
  fullName: string | null;
  /** Evento cujo ingresso originou a concessão da condição de aluno (registrado em students.origin_event_id). */
  eventId: string;
};

export type EnsureStudentRecordResult =
  | { ok: true; alreadyExisted: boolean }
  | { ok: false; code: StudentAccountErrorCode };

/**
 * Adiciona a condição de aluno (linha em `students`, MESMO UUID) a uma
 * identidade Auth/Profile já existente e já autenticada — nunca cria um
 * novo `auth.users`, nunca cria/atualiza `profiles`, nunca toca
 * `profiles.role`. O papel principal (ex.: professor) é preservado
 * integralmente; esta função só concede a capacidade adicional de aluno.
 *
 * Diferente de `createStudentAccount`: aqui a conta já existe de ponta a
 * ponta (Auth + Profile) — só falta a representação em `students`. O
 * chamador é responsável por autenticar o usuário e decidir se o papel
 * atual é elegível para ganhar a condição de aluno (ex.: só "professor"
 * nesta Sprint) antes de invocar esta função.
 *
 * Idempotente: se `students` já existir para este UUID, não altera nada e
 * retorna sucesso. Concorrência: uma corrida entre duas chamadas resulta
 * numa única linha (unique_violation tratado como sucesso idempotente).
 *
 * Status "active" e origem "Evento de Simulado" espelham exatamente o que
 * um cadastro público novo recebe quando concluído através de um Evento
 * (`app/api/auth/confirm-registration/route.ts`, `eventSignup: true`) —
 * nunca concede mais acesso do que um aluno normal teria na mesma situação.
 */
export async function ensureStudentRecordForExistingIdentity(
  supabase: SupabaseClient,
  input: EnsureStudentRecordInput,
): Promise<EnsureStudentRecordResult> {
  const { data: existing } = await supabase.from("students").select("id").eq("id", input.userId).maybeSingle();
  if (existing) {
    await removeRegistrationAttemptByEmail(supabase, input.email);
    return { ok: true, alreadyExisted: true };
  }

  const now = new Date().toISOString();
  const { error: insertError } = await supabase.from("students").insert({
    id: input.userId,
    name: input.fullName || input.email,
    email: input.email,
    status: "active",
    origin: "Evento de Simulado",
    origin_event_id: input.eventId,
    origin_registered_at: now,
    approved_at: now,
    email_confirmed_at: now,
  });

  if (insertError) {
    // Corrida: outra requisição criou a linha entre o SELECT e o INSERT
    // acima — idempotente, não é uma falha real.
    if (insertError.code === "23505") {
      await removeRegistrationAttemptByEmail(supabase, input.email);
      return { ok: true, alreadyExisted: true };
    }
    return { ok: false, code: "STUDENT_RECORD_CREATION_FAILED" };
  }

  // Nenhuma tentativa de cadastro incompleta deve sobreviver a uma
  // identidade que acabou de ganhar a condição de aluno (mesma limpeza
  // best-effort usada por createStudentAccount).
  await removeRegistrationAttemptByEmail(supabase, input.email);
  return { ok: true, alreadyExisted: false };
}

export async function updateStudentAccountEmail(supabase: SupabaseClient, userId: string, oldEmail: string, newEmail: string) {
  const { error: authError } = await supabase.auth.admin.updateUserById(userId, { email: newEmail, email_confirm: true, user_metadata: { email: newEmail } });
  if (authError) throw new StudentAccountError("STUDENT_EMAIL_UPDATE_FAILED", "email");
  const { error: studentError } = await supabase.from("students").update({ email: newEmail }).eq("id", userId);
  if (studentError) {
    const { error: rollbackError } = await supabase.auth.admin.updateUserById(userId, { email: oldEmail, email_confirm: true, user_metadata: { email: oldEmail } });
    if (rollbackError) throw new StudentAccountError("STUDENT_UPDATE_ROLLBACK_FAILED", "email");
    throw new StudentAccountError("STUDENT_EMAIL_UPDATE_FAILED", "email");
  }
  await supabase.from("student_registration_confirmations").delete().eq("email", oldEmail);
  if (!(await validateStudentAccountIntegrity(supabase, userId))) throw new StudentAccountError("STUDENT_UPDATE_ROLLBACK_FAILED", "email");
}

export type { User };
