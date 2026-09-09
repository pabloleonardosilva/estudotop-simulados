import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemError } from "@/app/lib/server/auditLogger";

export type RegistrationAttemptSource = "public_signup" | "event_signup";

// Rastreamento de tentativas incompletas de cadastro público de aluno
// (supabase/migrations/20260910100000_student_registration_attempts.sql).
// Cada função chama exatamente uma transição de estado via RPC (funções
// SECURITY INVOKER, só executáveis por service_role — nunca chamadas do
// client). O tracking é SECUNDÁRIO ao cadastro real: qualquer falha aqui é
// registrada em system_error_logs e absorvida — nunca lança, nunca impede
// o envio do código, a confirmação ou a criação da conta.
async function safeRpc(
  supabase: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
  source: string,
) {
  try {
    const { error } = await supabase.rpc(fn, args);
    if (error) void logSystemError({ source, error, metadata: { fn } });
  } catch (error) {
    void logSystemError({ source, error, metadata: { fn } });
  }
}

/**
 * POST /api/auth/register aceitou o cadastro (código gerado e e-mail
 * efetivamente enviado). Cria a tentativa ou atualiza a existente em aberto
 * para o mesmo e-mail normalizado (dedupe — nunca duplica).
 */
export async function startOrTouchRegistrationAttempt(
  supabase: SupabaseClient,
  input: {
    email: string;
    fullName: string;
    phone: string | null;
    source: RegistrationAttemptSource;
    sourceContextId?: string | null;
  },
) {
  await safeRpc(
    supabase,
    "upsert_student_registration_attempt",
    {
      p_email: input.email,
      p_full_name: input.fullName,
      p_phone: input.phone,
      p_source: input.source,
      p_source_context_id: input.sourceContextId ?? null,
    },
    "lib.studentRegistrationAttemptService.start",
  );
}

/** Reenvio automático de código por código incorreto (confirm-registration). */
export async function touchRegistrationAttemptResend(supabase: SupabaseClient, email: string) {
  await safeRpc(
    supabase,
    "touch_student_registration_attempt_resend",
    { p_email: email },
    "lib.studentRegistrationAttemptService.resend",
  );
}

/** Código confirmado com sucesso, antes de tentar criar a conta. */
export async function markRegistrationAttemptConfirmed(supabase: SupabaseClient, email: string) {
  await safeRpc(
    supabase,
    "mark_student_registration_attempt_confirmed",
    { p_email: email },
    "lib.studentRegistrationAttemptService.confirmed",
  );
}

/** Conta constituída com sucesso (auth.users + profiles + students). */
export async function completeRegistrationAttempt(supabase: SupabaseClient, email: string) {
  await safeRpc(
    supabase,
    "complete_student_registration_attempt",
    { p_email: email },
    "lib.studentRegistrationAttemptService.complete",
  );
}

/** createStudentAccount falhou (rollback já aplicado pelo próprio serviço). */
export async function markRegistrationAttemptFailed(
  supabase: SupabaseClient,
  email: string,
  failureCode: string,
  failureMessage: string,
) {
  await safeRpc(
    supabase,
    "mark_student_registration_attempt_failed",
    { p_email: email, p_failure_code: failureCode, p_failure_message: failureMessage },
    "lib.studentRegistrationAttemptService.failed",
  );
}
