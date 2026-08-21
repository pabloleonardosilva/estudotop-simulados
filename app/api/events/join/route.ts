import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { hashEmailActionToken } from "@/lib/security/registrationTokens";
import { effectiveEventStatus } from "@/lib/server/simuladoEvents";

export async function POST(request: Request) {
  const student = await getStudentFromRequest(request);
  if (!student) return NextResponse.json({ ok: false, message: "Autentique-se para confirmar a participação." }, { status: 401 });
  const cookieStore = await cookies();
  const token = cookieStore.get("estudotop_event_intent")?.value;
  if (!token) return NextResponse.json({ ok: false, message: "Intenção de ingresso ausente ou expirada." }, { status: 400 });
  const supabase = createSupabaseAdminClient();
  const { data: intent } = await supabase.from("simulado_event_join_intents").select("*,simulado_events:event_id(*)").eq("token_hash", hashEmailActionToken(token)).is("consumed_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  const event = intent?.simulado_events as Record<string, string> | null;
  if (!intent || !event || intent.email.toLowerCase() !== (student.email || "").toLowerCase()) return NextResponse.json({ ok: false, message: "Não foi possível validar o ingresso para esta conta." }, { status: 403 });
  const status = effectiveEventStatus(event as { status: string; starts_at: string; ends_at: string; started_at?: string | null });
  if (status === "closed" || status === "archived") return NextResponse.json({ ok: false, message: "Este Evento já foi encerrado." }, { status: 409 });
  const { data: participant, error } = await supabase.from("simulado_event_participants").upsert({ event_id: intent.event_id, student_id: student.id, source: "public_link" }, { onConflict: "event_id,student_id", ignoreDuplicates: true }).select("id,event_id").maybeSingle();
  if (error) return NextResponse.json({ ok: false, message: "Não foi possível confirmar sua participação." }, { status: 500 });
  await supabase.from("simulado_event_join_intents").update({ consumed_at: new Date().toISOString() }).eq("id", intent.id);
  const response = NextResponse.json({ ok: true, message: "Participação confirmada.", participant, event_id: intent.event_id });
  response.cookies.delete("estudotop_event_intent");
  return response;
}
