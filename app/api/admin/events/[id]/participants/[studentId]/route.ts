import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { logActivity } from "@/lib/logging/activity-log";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; studentId: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const { id: eventId, studentId } = await params;

  const supabase = createSupabaseAdminClient();

  const { data: participant, error: participantError } = await supabase
    .from("simulado_event_participants")
    .select("id,student_id,event_id")
    .eq("event_id", eventId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (participantError || !participant) return NextResponse.json({ ok: false, message: "Participação não encontrada." }, { status: 404 });

  const { data: event } = await supabase.from("simulado_events").select("id,name").eq("id", eventId).maybeSingle();
  const eventName = event?.name ?? eventId;

  const { count: attemptsCount, error: attemptsError } = await supabase
    .from("simulado_attempts")
    .select("id", { count: "exact", head: true })
    .eq("event_participant_id", participant.id);
  if (attemptsError) return NextResponse.json({ ok: false, message: "Não foi possível verificar o histórico deste participante." }, { status: 500 });

  if (attemptsCount && attemptsCount > 0) {
    return NextResponse.json({
      ok: false,
      message: "Este aluno já possui tentativa registrada neste Evento. O histórico é preservado e a participação não pode ser removida.",
    }, { status: 409 });
  }

  const { error: deleteError } = await supabase.from("simulado_event_participants").delete().eq("id", participant.id);
  if (deleteError) {
    if (deleteError.code === "23503") {
      return NextResponse.json({
        ok: false,
        message: "Este aluno já possui tentativa registrada neste Evento. O histórico é preservado e a participação não pode ser removida.",
      }, { status: 409 });
    }
    return NextResponse.json({ ok: false, message: "Não foi possível remover a participação." }, { status: 500 });
  }

  await supabase.from("student_activity_log").insert({
    student_id: studentId,
    event_type: "event_participant_removed",
    description: `Removido do Evento "${eventName}" pelo administrador`,
    details: { event_id: eventId, event_name: eventName },
    performed_by_name: admin.full_name || "Admin",
  });

  await logActivity({
    request,
    actorType: "admin",
    actorId: admin.id,
    actorName: admin.full_name || "Admin",
    action: "event_participant_removed",
    entityType: "simulado_event_participant",
    entityId: participant.id,
    metadata: { event_id: eventId, event_name: eventName, student_id: studentId },
  });

  return NextResponse.json({ ok: true, message: "A participação do aluno foi removida com sucesso." });
}
