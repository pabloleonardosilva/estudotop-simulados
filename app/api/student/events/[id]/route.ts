import { NextResponse } from "next/server";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { effectiveEventStatus } from "@/lib/server/simuladoEvents";
import { logSystemError } from "@/app/lib/server/auditLogger";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const student = await getStudentFromRequest(request);
  if (!student) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  const supabase = createSupabaseAdminClient();
  const { data: participant, error } = await supabase.from("simulado_event_participants").select("id,representative_attempt_id,result_released_at,simulado_events:event_id(id,name,status,starts_at,ends_at,started_at,simulado_id,result_policy,simulados:simulado_id(id,title,max_attempts,time_limit_minutes,anti_tab_switch_enabled,anti_window_blur_enabled),simulado_event_professors(professors:professor_id(name)))").eq("event_id", id).eq("student_id", student.id).maybeSingle();
  if (error) {
    void logSystemError({ source: "api.student.events.detail", error, request, metadata: { event_id: id, student_id: student.id } });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar o Evento agora." }, { status: 500 });
  }
  if (!participant) return NextResponse.json({ ok: false, message: "Evento não encontrado para sua conta." }, { status: 404 });
  const event = participant.simulado_events as unknown as { id: string; status: string; starts_at: string; ends_at: string; started_at: string | null; simulado_id: string | null } & Record<string, unknown>;
  // Escopado pelo Simulado atualmente vinculado ao Evento: se o Admin trocar
  // o Simulado do Evento, tentativas do Simulado anterior não devem mais
  // contar tentativas/CTA "Continuar" deste Evento.
  const { data: attempts } = event.simulado_id
    ? await supabase.from("simulado_attempts").select("id,status,attempt_number,counts_toward_limit,started_at,submitted_at").eq("event_id", id).eq("student_id", student.id).eq("simulado_id", event.simulado_id).order("created_at")
    : { data: [] };
  return NextResponse.json({ ok: true, message: "Evento carregado.", participant: { ...participant, simulado_events: { ...event, effective_status: effectiveEventStatus(event) } }, attempts: attempts || [] });
}
