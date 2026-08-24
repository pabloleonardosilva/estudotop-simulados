import { NextResponse } from "next/server";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { effectiveEventStatus } from "@/lib/server/simuladoEvents";

export async function GET(request: Request) {
  const student = await getStudentFromRequest(request);
  if (!student) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("simulado_event_participants").select("id,joined_at,representative_attempt_id,result_released_at,simulado_events:event_id(id,name,status,starts_at,ends_at,simulado_id,result_policy,cover_key,simulados:simulado_id(title,max_attempts),simulado_event_professors(professors:professor_id(name)))").eq("student_id", student.id).order("joined_at", { ascending: false });
  if (error) return NextResponse.json({ ok: false, message: "Não foi possível carregar seus Eventos." }, { status: 500 });
  const eventIds = (data || []).map((row) => (row.simulado_events as unknown as { id: string }).id);
  const { data: attempts } = eventIds.length ? await supabase.from("simulado_attempts").select("id,event_id,status,counts_toward_limit").eq("student_id", student.id).eq("is_preview", false).in("event_id", eventIds) : { data: [] };
  const events = (data || []).map((row) => { const event = row.simulado_events as unknown as Record<string, unknown> & { id: string; status: string; starts_at: string; ends_at: string; simulado_id: string | null }; return { ...row, attempts: (attempts || []).filter((attempt) => attempt.event_id === event.id), simulado_events: { ...event, effective_status: effectiveEventStatus(event) } }; });
  return NextResponse.json({ ok: true, message: "Eventos carregados.", events });
}
