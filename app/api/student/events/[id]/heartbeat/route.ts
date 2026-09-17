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
    .select("id,access_status")
    .eq("event_id", id)
    .eq("student_id", student.id)
    .maybeSingle();
  if (!participant || participant.access_status !== "active") return NextResponse.json({ ok: false, message: "Acesso negado a este Evento." }, { status: 403 });

  await touchUserSession({
    request,
    actorType: "student",
    actorId: student.id,
    actorName: student.name,
    actorEmail: student.email,
    lastRoute: `/meus-eventos/${id}`,
    metadata: { event_id: id, source: "event_heartbeat" },
  });

  // Reaproveita este batimento (já chamado a cada 30s durante a execução do
  // Simulado em contexto de Evento) para o aluno detectar encerramento
  // administrativo da própria tentativa sem exigir WebSocket/subscription
  // nova. attempt_id é opcional e sempre revalidado por ownership
  // (student_id + event_id) — nunca aceito de forma solta.
  const body = await request.json().catch(() => ({}) as { attempt_id?: unknown });
  let attemptStatus: string | null = null;
  let disqualificationReason: string | null = null;
  if (typeof body.attempt_id === "string" && body.attempt_id) {
    const { data: attempt } = await supabase
      .from("simulado_attempts")
      .select("status, disqualification_reason")
      .eq("id", body.attempt_id)
      .eq("student_id", student.id)
      .eq("event_id", id)
      .maybeSingle();
    if (attempt) {
      attemptStatus = attempt.status;
      disqualificationReason = attempt.disqualification_reason;
    }
  }

  return NextResponse.json({ ok: true, message: "Presença atualizada.", attempt_status: attemptStatus, disqualification_reason: disqualificationReason });
}
