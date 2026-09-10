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
    /**
     * E-mail submetido na tentativa anterior desta MESMA sessão de
     * cadastro (rastreado pelo próprio client, nunca adivinhado por
     * nome/telefone) — usado quando "Corrigir dados" troca o e-mail antes
     * da conclusão, para renomear a tentativa em aberto em vez de deixar o
     * e-mail antigo como lead fantasma. Se o novo e-mail já tiver sua
     * própria tentativa aberta (conflito real), a renomeação é ignorada
     * com segurança pelo RPC.
     */
    previousEmail?: string | null;
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
      p_previous_email: input.previousEmail ?? null,
    },
    "lib.studentRegistrationAttemptService.start",
  );
}

/**
 * Primeira etapa pública de ingresso em um Evento (POST
 * /api/events/[slug]/route.ts) aceitou um e-mail válido e enviou o e-mail
 * de confirmação — cria ou toca a tentativa de cadastro incompleta para
 * aquele e-mail, sem exigir nome/telefone (ainda não coletados nesta
 * etapa). O chamador já garantiu que o e-mail não pertence a um aluno
 * existente antes de invocar esta função. Preserva nome/telefone já
 * conhecidos de uma tentativa anterior para o mesmo e-mail (ex.: pessoa já
 * passou pelo cadastro geral e voltou a um Evento diferente com o mesmo
 * e-mail) — nunca sobrescreve dados reais já coletados com os valores
 * vazios desta etapa. Nunca lança: falha aqui é registrada e absorvida,
 * nunca bloqueia o ingresso no Evento.
 */
export async function startOrTouchEventRegistrationAttempt(
  supabase: SupabaseClient,
  input: { email: string; eventId: string },
) {
  try {
    const emailNormalized = input.email.trim().toLowerCase();
    const { data: existing } = await supabase
      .from("student_registration_attempts")
      .select("full_name, phone")
      .eq("email_normalized", emailNormalized)
      .neq("status", "completed")
      .maybeSingle();
    await startOrTouchRegistrationAttempt(supabase, {
      email: input.email,
      fullName: existing?.full_name || "",
      phone: existing?.phone ?? null,
      source: "event_signup",
      sourceContextId: input.eventId,
    });
  } catch (error) {
    void logSystemError({ source: "lib.studentRegistrationAttemptService.eventStart", error, metadata: { event_id: input.eventId } });
  }
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

/**
 * Conta constituída com sucesso (auth.users + profiles + students) — a
 * tabela representa só cadastros ainda não concluídos, então a tentativa
 * correspondente é removida (nunca mantida como "completed"). Chamada
 * centralizada dentro de `createStudentAccount` (lib/server/studentAccountService.ts)
 * — cobre cadastro público e criação administrativa sem lógica duplicada.
 * Idempotente: se não existir tentativa para o e-mail, não faz nada e não
 * lança. Nunca remove auth.users/profiles/students/student_registration_confirmations.
 */
export async function removeRegistrationAttemptByEmail(supabase: SupabaseClient, email: string) {
  await safeRpc(
    supabase,
    "complete_student_registration_attempt",
    { p_email: email },
    "lib.studentRegistrationAttemptService.remove",
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
