import { NextResponse } from "next/server";
import { requireProfessor } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { effectiveEventStatus } from "@/lib/server/simuladoEvents";

export async function GET(request: Request) {
  const professor = await requireProfessor(request);
  if (professor instanceof NextResponse) return professor;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("simulado_event_professors").select("event_id,simulado_events:event_id(*,simulados:simulado_id(id,title))").eq("professor_id", professor.id);
  if (error) return NextResponse.json({ ok: false, message: "Não foi possível carregar seus Eventos." }, { status: 500 });
  const events = (data || []).map((row) => { const event = row.simulado_events as unknown as { status: string; starts_at: string; ends_at: string }; return { ...event, effective_status: effectiveEventStatus(event) }; });
  return NextResponse.json({ ok: true, message: "Eventos carregados.", events });
}
