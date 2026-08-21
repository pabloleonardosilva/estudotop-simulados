import { NextResponse } from "next/server";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { touchUserSession } from "@/lib/logging/session-log";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const student = await getStudentFromRequest(request);
  if (!student) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  const supabase = createSupabaseAdminClient();
  const { data: participant } = await supabase
    .from("simulado_event_participants")
    .select("id")
    .eq("event_id", id)
    .eq("student_id", student.id)
    .maybeSingle();
  if (!participant) return NextResponse.json({ ok: false, message: "Acesso negado a este Evento." }, { status: 403 });

  await touchUserSession({
    request,
    actorType: "student",
    actorId: student.id,
    actorName: student.name,
    actorEmail: student.email,
    lastRoute: `/meus-eventos/${id}`,
    metadata: { event_id: id, source: "event_heartbeat" },
  });
  return NextResponse.json({ ok: true, message: "Presença atualizada." });
}
