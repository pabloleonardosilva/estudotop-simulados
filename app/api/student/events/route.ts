import { NextResponse } from "next/server";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { effectiveEventStatus } from "@/lib/server/simuladoEvents";
import { systemImageUrl } from "@/lib/system-images";
import { eventCoverImage } from "@/app/admin/eventos/utils";

export async function GET(request: Request) {
  const student = await getStudentFromRequest(request);
  if (!student) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("simulado_event_participants").select("id,joined_at,representative_attempt_id,result_released_at,simulado_events:event_id(id,name,status,starts_at,ends_at,simulado_id,result_policy,cover_key,card_image:card_image_id(storage_path),simulados:simulado_id(title,max_attempts),simulado_event_professors(professors:professor_id(name)))").eq("student_id", student.id).order("joined_at", { ascending: false });
  if (error) return NextResponse.json({ ok: false, message: "Não foi possível carregar seus Eventos." }, { status: 500 });
  const eventIds = (data || []).map((row) => (row.simulado_events as unknown as { id: string }).id);
  const { data: attempts } = eventIds.length ? await supabase.from("simulado_attempts").select("id,event_id,simulado_id,status,counts_toward_limit").eq("student_id", student.id).eq("is_preview", false).in("event_id", eventIds) : { data: [] };
  // Escopado pelo Simulado atualmente vinculado a cada Evento: tentativas do
  // Simulado anterior a uma troca administrativa não aparecem mais no card.
  const events = (data || []).map((row) => { const event = row.simulado_events as unknown as Record<string, unknown> & { id: string; status: string; starts_at: string; ends_at: string; simulado_id: string | null; cover_key?: string | null; card_image?: { storage_path?: string } | null }; return { ...row, attempts: (attempts || []).filter((attempt) => attempt.event_id === event.id && attempt.simulado_id === event.simulado_id), simulado_events: { ...event, card_image_url: systemImageUrl(event.card_image?.storage_path) || eventCoverImage(event.cover_key), effective_status: effectiveEventStatus(event) } }; });
  return NextResponse.json({ ok: true, message: "Eventos carregados.", events });
}
