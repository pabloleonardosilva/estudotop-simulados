import "server-only";

import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { effectiveEventStatus } from "@/lib/server/simuladoEvents";
import { getPublicAppUrl } from "@/lib/server/publicAppUrl";
import { eventReminderPlainText, eventReminderTemplate } from "@/lib/email/studentRegistrationTemplates";
import { logSecurityEvent, logSystemError } from "@/app/lib/server/auditLogger";

// Lembrete de Evento é exclusivamente manual (decisão de produto de
// 2026-09-04): não existe mais nenhum agendamento automático, cron de
// lembrete ou janela de disparo por horário. A única origem possível de um
// lembrete é o Admin clicando em "Enviar lembrete agora".
export const REMINDER_COOLDOWN_HOURS = 6;

// Um lote de ~90-100 destinatários enviados em série via Resend leva, na
// pior hipótese observada, dezenas de segundos — bem abaixo de 5 minutos em
// qualquer cenário realista de rede. Um registro "sending" mais velho que
// isso não pode mais representar um envio genuinamente ativo: o processo que
// o criou morreu (crash, timeout de função serverless, restart) e nunca vai
// terminar de escrever o status final. Não existe cron para isso (decisão de
// produto): a reconciliação acontece sob demanda, sempre que o estado do
// lembrete é consultado ou um novo envio é tentado.
export const STALE_SENDING_MINUTES = 5;

const POSTGRES_UNIQUE_VIOLATION = "23505";

type EventRow = { id: string; name: string; starts_at: string; ends_at: string; started_at: string | null; simulado_id: string | null; status: string };

export type ReminderStatusInfo = {
  state: "available" | "cooldown" | "sending";
  lastSentAt: string | null;
  nextAvailableAt: string | null;
};

// Reconcilia um "sending" abandonado (processo morto sem terminar de gravar
// o status final) antes de qualquer decisão de disponibilidade. Idempotente:
// só afeta a linha se ela ainda estiver 'sending' E mais velha que o lease —
// nunca toca um envio genuinamente em andamento, e nunca reprocessa um envio
// que outra chamada concorrente já reconciliou (confirmado por presença de
// linha, mesmo padrão de concorrência otimista já usado no resto do módulo).
// Preserva recipients já enviados por esse lote — nunca é apagado, só o lote
// vira 'failed'.
async function reconcileStaleSending(supabase: SupabaseClient, eventId: string): Promise<{ excludeStudentIds: string[] }> {
  const { data: sendingRow } = await supabase
    .from("simulado_event_reminders")
    .select("id,created_at")
    .eq("event_id", eventId)
    .eq("status", "sending")
    .maybeSingle();

  if (!sendingRow) return { excludeStudentIds: [] };

  const ageMinutes = (Date.now() - new Date(sendingRow.created_at).getTime()) / 60_000;
  if (ageMinutes < STALE_SENDING_MINUTES) return { excludeStudentIds: [] };

  const { data: reconciled } = await supabase
    .from("simulado_event_reminders")
    .update({ status: "failed", reason: "stale_sending_recovered", completed_at: new Date().toISOString() })
    .eq("id", sendingRow.id)
    .eq("status", "sending")
    .select("id")
    .maybeSingle();

  if (!reconciled) return { excludeStudentIds: [] };

  void logSecurityEvent({ event: "event_reminder_stale_recovered", actorType: "system", severity: "warning", resourceType: "simulado_events", resourceId: eventId, metadata: { operation_id: sendingRow.id, age_minutes: Math.round(ageMinutes) } });

  // Quem esse lote abandonado já enviou não pode receber de novo no próximo
  // lote — só quem ficou pendente/falhou é reprocessado.
  const { data: alreadySent } = await supabase
    .from("simulado_event_reminder_recipients")
    .select("student_id")
    .eq("reminder_id", sendingRow.id)
    .eq("status", "sent");

  return { excludeStudentIds: (alreadySent || []).map((row) => row.student_id as string) };
}

export async function getReminderStatusInfo(supabase: SupabaseClient, eventId: string): Promise<ReminderStatusInfo> {
  await reconcileStaleSending(supabase, eventId);

  const { data: activeSending } = await supabase
    .from("simulado_event_reminders")
    .select("id")
    .eq("event_id", eventId)
    .eq("status", "sending")
    .maybeSingle();
  if (activeSending) return { state: "sending", lastSentAt: null, nextAvailableAt: null };

  const { data } = await supabase
    .from("simulado_event_reminders")
    .select("completed_at")
    .eq("event_id", eventId)
    .eq("status", "sent")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.completed_at) return { state: "available", lastSentAt: null, nextAvailableAt: null };

  const nextAvailableAt = new Date(new Date(data.completed_at).getTime() + REMINDER_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
  const blocked = new Date(nextAvailableAt).getTime() > Date.now();
  return { state: blocked ? "cooldown" : "available", lastSentAt: data.completed_at, nextAvailableAt: blocked ? nextAvailableAt : null };
}

type SendResult =
  | { ok: true; state: "sent"; recipientsTotal: number; recipientsSent: number; recipientsFailed: number }
  | { ok: false; state: "blocked"; nextAvailableAt: string }
  | { ok: false; state: "in_progress" }
  | { ok: false; state: "no_recipients" }
  | { ok: false; state: "error"; message: string };

async function markFailed(supabase: SupabaseClient, reminderId: string, reason: string) {
  await supabase.from("simulado_event_reminders").update({ status: "failed", reason, completed_at: new Date().toISOString() }).eq("id", reminderId).eq("status", "sending");
}

// Envia um lote de lembrete manual para um Evento. Cooldown de 6h é global ao
// Evento, contado a partir do último lote MANUAL bem-sucedido. A reserva
// "sending" (índice único parcial) impede duplo clique, retry HTTP e duas
// abas concorrentes — só uma operação por Evento por vez. Um clique bloqueado
// pelo cooldown não cria nenhum registro no ledger — apenas a resposta lógica
// de bloqueio é devolvida.
export async function sendEventReminderBatch(
  supabase: SupabaseClient,
  event: EventRow,
  triggeredBy: string,
  request?: Request,
): Promise<SendResult> {
  const { excludeStudentIds } = await reconcileStaleSending(supabase, event.id);

  const { data: activeSending } = await supabase
    .from("simulado_event_reminders")
    .select("id")
    .eq("event_id", event.id)
    .eq("status", "sending")
    .maybeSingle();
  if (activeSending) return { ok: false, state: "in_progress" };

  const status = await getReminderStatusInfo(supabase, event.id);
  if (status.state === "cooldown" && status.nextAvailableAt) {
    void logSecurityEvent({ request, event: "event_reminder_cooldown_blocked", actorType: "admin", actorId: triggeredBy, severity: "info", resourceType: "simulado_events", resourceId: event.id, metadata: { next_available_at: status.nextAvailableAt } });
    return { ok: false, state: "blocked", nextAvailableAt: status.nextAvailableAt };
  }

  const { data: reservedReminder, error: reserveError } = await supabase
    .from("simulado_event_reminders")
    .insert({ event_id: event.id, status: "sending", triggered_by: triggeredBy })
    .select("id")
    .single();

  if (reserveError) {
    if (reserveError.code === POSTGRES_UNIQUE_VIOLATION) {
      // Violação real do índice único parcial (event_id) where status='sending':
      // outra requisição venceu a corrida entre a checagem acima e este insert
      // (duas abas, duplo clique ou retry HTTP verdadeiramente concorrentes).
      return { ok: false, state: "in_progress" };
    }
    // Qualquer outro erro (tabela/coluna inexistente, permissão, rede etc.)
    // NÃO é conflito de concorrência — nunca deve virar "em andamento".
    void logSystemError({ source: "api.admin.events.reminder.reserve", error: reserveError, request, metadata: { event_id: event.id } });
    return { ok: false, state: "error", message: "Não foi possível registrar o envio agora." };
  }
  const reminderId = reservedReminder.id as string;

  try {
    const { data: participants, error: participantsError } = await supabase
      .from("simulado_event_participants")
      .select("student_id,students:student_id(id,name,email,status)")
      .eq("event_id", event.id);

    if (participantsError) {
      await markFailed(supabase, reminderId, "participants_query_failed");
      return { ok: false, state: "error", message: "Não foi possível carregar os participantes." };
    }

    type StudentRow = { id: string; name: string | null; email: string | null; status: string | null };
    const eligible = (participants || [])
      .map((row) => row.students as unknown as StudentRow | StudentRow[] | null)
      .map((student) => (Array.isArray(student) ? student[0] : student))
      .filter((student): student is StudentRow => Boolean(student && student.email && student.status === "active"))
      .filter((student) => !excludeStudentIds.includes(student.id));

    if (eligible.length === 0) {
      await markFailed(supabase, reminderId, "no_eligible_participants");
      return { ok: false, state: "no_recipients" };
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      await markFailed(supabase, reminderId, "resend_not_configured");
      return { ok: false, state: "error", message: "RESEND_API_KEY não configurada." };
    }

    let publicAppUrl = "";
    try { publicAppUrl = getPublicAppUrl(); } catch {
      await markFailed(supabase, reminderId, "app_url_not_configured");
      return { ok: false, state: "error", message: "URL pública não configurada." };
    }

    const { data: professorRows } = await supabase.from("simulado_event_professors").select("professors:professor_id(name)").eq("event_id", event.id);
    const professorNames = (professorRows || []).map((row) => (row.professors as unknown as { name?: string } | null)?.name).filter((name): name is string => Boolean(name));
    const startsAtLabel = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(event.starts_at));
    const eventUrl = `${publicAppUrl}/meus-eventos/${event.id}`;
    const resend = new Resend(resendApiKey);

    let sentCount = 0;
    let failedCount = 0;
    for (const student of eligible) {
      try {
        const { error: emailError } = await resend.emails.send({
          from: "EstudoTOP <estudotop@estudotop.com.br>",
          replyTo: "estudotop@estudotop.com.br",
          to: student.email as string,
          subject: `Lembrete do Evento — ${event.name}`,
          html: eventReminderTemplate({ eventName: event.name, startsAtLabel, professorNames, eventUrl }),
          text: eventReminderPlainText({ eventName: event.name, startsAtLabel, professorNames, eventUrl }),
        });
        if (emailError) throw emailError;
        sentCount++;
        await supabase.from("simulado_event_reminder_recipients").insert({ reminder_id: reminderId, event_id: event.id, student_id: student.id, email: student.email, status: "sent", sent_at: new Date().toISOString() });
      } catch (error) {
        failedCount++;
        await supabase.from("simulado_event_reminder_recipients").insert({ reminder_id: reminderId, event_id: event.id, student_id: student.id, email: student.email, status: "failed", error: error instanceof Error ? error.message.slice(0, 500) : "Falha desconhecida" });
      }
    }

    // Ao menos um envio com sucesso já conta como "lembrete enviado" para fins
    // de cooldown — a operação é do Evento, não por aluno individual. Se TODOS
    // falharem, a operação inteira é 'failed' e não inicia cooldown (retry
    // seguro permanece disponível, sem reenviar aos que já receberam).
    const finalStatus = sentCount > 0 ? "sent" : "failed";
    const { data: closedRow } = await supabase.from("simulado_event_reminders").update({
      status: finalStatus,
      recipients_total: eligible.length,
      recipients_sent: sentCount,
      recipients_failed: failedCount,
      completed_at: new Date().toISOString(),
    }).eq("id", reminderId).eq("status", "sending").select("id").maybeSingle();

    if (!closedRow) {
      // A própria linha já não estava mais 'sending' (foi reconciliada como
      // stale por outra chamada concorrente enquanto este envio ainda
      // rodava). Os e-mails já foram enviados de verdade; só registramos o
      // ocorrido sem tentar reabrir/duplicar o fechamento do lote.
      void logSystemError({ source: "api.admin.events.reminder.close_race", error: new Error("Lote reconciliado como stale antes de terminar."), request, metadata: { event_id: event.id, operation_id: reminderId, recipients_sent: sentCount, recipients_failed: failedCount } });
    }

    if (finalStatus === "sent") {
      void logSecurityEvent({ request, event: "event_reminder_sent", actorType: "admin", actorId: triggeredBy, severity: "info", resourceType: "simulado_events", resourceId: event.id, metadata: { operation_id: reminderId, recipients_total: eligible.length, recipients_sent: sentCount, recipients_failed: failedCount } });
      return { ok: true, state: "sent", recipientsTotal: eligible.length, recipientsSent: sentCount, recipientsFailed: failedCount };
    }
    void logSecurityEvent({ request, event: "event_reminder_failed", actorType: "admin", actorId: triggeredBy, severity: "error", resourceType: "simulado_events", resourceId: event.id, metadata: { operation_id: reminderId, recipients_total: eligible.length, recipients_failed: failedCount } });
    return { ok: false, state: "error", message: "Não foi possível enviar o lembrete a nenhum participante." };
  } catch (error) {
    // Exceção inesperada depois de reservar o lote: nunca deixar 'sending'
    // parado esperando o lease expirar se ainda dá para fechar agora mesmo.
    await markFailed(supabase, reminderId, "unexpected_exception");
    void logSystemError({ source: "api.admin.events.reminder.unexpected", error, request, metadata: { event_id: event.id, operation_id: reminderId } });
    return { ok: false, state: "error", message: "Erro inesperado ao enviar o lembrete." };
  }
}

export function eventAcceptsReminder(event: EventRow): boolean {
  return effectiveEventStatus(event) === "scheduled" && Boolean(event.simulado_id);
}
