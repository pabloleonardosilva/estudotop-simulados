import "server-only";

import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getPublicAppUrl } from "@/lib/server/publicAppUrl";
import { resyncTopCoinEarnings } from "@/app/lib/server/topcoinsSync";
import { logSystemError } from "@/app/lib/server/auditLogger";
import { shell } from "@/app/lib/email/jornadaEmailTemplates";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export type SimuladoEventStatus = "scheduled" | "active" | "closed" | "archived";

export function effectiveEventStatus(event: { status: string; starts_at: string; ends_at: string; started_at?: string | null; simulado_id?: string | null }): SimuladoEventStatus {
  if (event.status === "archived") return "archived";
  const now = Date.now();
  if (event.status === "closed" || new Date(event.ends_at).getTime() <= now) return "closed";
  if (event.simulado_id === null) return "scheduled";
  if (event.status === "active" || event.started_at || new Date(event.starts_at).getTime() <= now) return "active";
  return "scheduled";
}

export function eventAcceptsEntries(event: { status: string; starts_at: string; ends_at: string; started_at?: string | null }) {
  return effectiveEventStatus(event) === "active";
}

export async function getEventBySlug(slug: string) {
  const supabase = createSupabaseAdminClient();
  return supabase
    .from("simulado_events")
    .select("id,name,simulado_id,status,starts_at,ends_at,duration_minutes,result_policy,code,public_slug,started_at,closed_at,archived_at")
    .eq("public_slug", slug)
    .maybeSingle();
}

export async function ensureProfessorAssigned(professorId: string, eventId: string) {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("simulado_event_professors")
    .select("id")
    .eq("professor_id", professorId)
    .eq("event_id", eventId)
    .maybeSingle();
  return Boolean(data);
}

type ReleasedParticipant = {
  id: string;
  student_id: string;
  result_release_email_sent_at: string | null;
  students: { name: string | null; email: string | null } | { name: string | null; email: string | null }[] | null;
};

function resultReleasedEmail(input: { studentName: string; eventName: string; simuladoTitle: string; resultUrl: string }) {
  const html = shell(
    "Seu resultado está disponível",
    `O resultado do Evento ${input.eventName} já pode ser consultado.`,
    `
      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#334155;">Olá, <strong style="color:#0f172a;">${escapeHtml(input.studentName)}</strong>! O resultado do Evento <strong style="color:#0f172a;">${escapeHtml(input.eventName)}</strong>, referente ao Simulado <strong style="color:#0f172a;">${escapeHtml(input.simuladoTitle)}</strong>, já pode ser consultado.</p>
      <div style="text-align:center;">
        <a href="${input.resultUrl}" style="display:inline-block;background:#ea580c;color:#fff;text-decoration:none;font-weight:800;border-radius:14px;padding:15px 22px;">Ver meus resultados</a>
      </div>
    `,
  );
  const text = `Olá, ${input.studentName}!\n\nSeu resultado está disponível.\nEvento: ${input.eventName}\nSimulado: ${input.simuladoTitle}\n\nAcesse: ${input.resultUrl}\n\nEquipe EstudoTOP`;
  return { html, text };
}

export async function releasePendingEventResults(supabase: SupabaseClient, eventId: string, request?: Request) {
  const releasedAt = new Date().toISOString();
  const { data: event, error: eventError } = await supabase
    .from("simulado_events")
    .select("id,name,simulado_id,simulados:simulado_id(title)")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError || !event) throw eventError || new Error("Evento não encontrado.");

  const { data, error } = await supabase
    .from("simulado_event_participants")
    .update({ result_released_at: releasedAt })
    .eq("event_id", eventId)
    .is("result_released_at", null)
    .not("representative_attempt_id", "is", null)
    .select("id,student_id,result_release_email_sent_at,students:student_id(name,email)");
  if (error) throw error;

  const participants = (data || []) as unknown as ReleasedParticipant[];
  for (const participant of participants) {
    if (event.simulado_id) await resyncTopCoinEarnings(supabase, participant.student_id, event.simulado_id);
    if (participant.result_release_email_sent_at) continue;
    const student = Array.isArray(participant.students) ? participant.students[0] : participant.students;
    try {
      if (!student?.email) throw new Error("Aluno sem e-mail disponível para notificação.");
      const resendApiKey = process.env.RESEND_API_KEY;
      if (!resendApiKey) throw new Error("RESEND_API_KEY não configurada.");
      const simulado = Array.isArray(event.simulados) ? event.simulados[0] : event.simulados;
      const resultUrl = `${getPublicAppUrl()}/meus-eventos/${eventId}`;
      const template = resultReleasedEmail({ studentName: student.name || "Aluno", eventName: event.name, simuladoTitle: simulado?.title || "Simulado", resultUrl });
      const { error: emailError } = await new Resend(resendApiKey).emails.send({
        from: "EstudoTOP <estudotop@estudotop.com.br>",
        replyTo: "estudotop@estudotop.com.br",
        to: student.email,
        subject: `Resultado disponível — ${event.name}`,
        html: template.html,
        text: template.text,
      });
      if (emailError) throw emailError;
      await supabase.from("simulado_event_participants").update({ result_release_email_sent_at: new Date().toISOString(), result_release_email_error: null }).eq("id", participant.id).is("result_release_email_sent_at", null);
    } catch (emailError) {
      await supabase.from("simulado_event_participants").update({ result_release_email_error: emailError instanceof Error ? emailError.message.slice(0, 1000) : "Falha desconhecida no envio." }).eq("id", participant.id).is("result_release_email_sent_at", null);
      void logSystemError({ source: "simulado_event.result_release_email", error: emailError, request, metadata: { event_id: eventId, participant_id: participant.id, student_id: participant.student_id } });
    }
  }
  return { releasedAt, releasedCount: participants.length };
}
