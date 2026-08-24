import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { logActivity } from "@/lib/logging/activity-log";
import { logSystemError } from "@/app/lib/server/auditLogger";

type AttemptRow = { id: string; attempt_number: number | null; counts_toward_limit: boolean | null; created_at: string };

// Ajuste administrativo de tentativas do Evento — sempre escopado por
// event_participant_id (e reforçado por event_id/student_id), nunca apenas
// por student_id + simulado_id. O mesmo Simulado pode ter tentativas em
// Jornada ou avulsas fora deste Evento, que nunca podem ser tocadas aqui.
async function setEventParticipantAttemptsCount(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  params: { studentId: string; eventId: string; eventParticipantId: string; simuladoId: string; targetCount: number },
) {
  const { studentId, eventId, eventParticipantId, simuladoId, targetCount } = params;

  const { data: attempts, error: attemptsError } = await supabase
    .from("simulado_attempts")
    .select("id, attempt_number, counts_toward_limit, created_at")
    .eq("student_id", studentId)
    .eq("simulado_id", simuladoId)
    .eq("event_id", eventId)
    .eq("event_participant_id", eventParticipantId)
    .order("attempt_number", { ascending: true })
    .order("created_at", { ascending: true });
  if (attemptsError) throw new Error(attemptsError.message);

  const existing = (attempts || []) as AttemptRow[];
  const existingCount = existing.length;

  if (targetCount > existingCount) {
    const { count: questionCount, error: questionCountError } = await supabase
      .from("simulado_questions")
      .select("id", { count: "exact", head: true })
      .eq("simulado_id", simuladoId);
    if (questionCountError) throw new Error(questionCountError.message);

    const now = new Date().toISOString();
    const maxAttemptNumber = existing.reduce((max, row) => {
      const value = Number(row.attempt_number || 0);
      return Number.isFinite(value) && value > max ? value : max;
    }, existingCount);

    const placeholders = Array.from({ length: targetCount - existingCount }, (_, index) => ({
      simulado_id: simuladoId,
      student_id: studentId,
      event_id: eventId,
      event_participant_id: eventParticipantId,
      attempt_context: "event",
      attempt_number: maxAttemptNumber + index + 1,
      status: "abandoned",
      started_at: now,
      last_activity_at: now,
      submitted_at: now,
      total_questions: questionCount || 0,
      answered_count: 0,
      progress_percent: 0,
      time_spent_seconds: 0,
      counts_toward_limit: true,
      question_order: [],
      settings_snapshot: { admin_adjusted: true, context: "event", event_id: eventId, event_participant_id: eventParticipantId },
    }));

    const { error: insertError } = await supabase.from("simulado_attempts").insert(placeholders);
    if (insertError) throw new Error(insertError.message);
  }

  const { data: freshAttempts, error: freshError } = await supabase
    .from("simulado_attempts")
    .select("id, attempt_number, created_at")
    .eq("student_id", studentId)
    .eq("simulado_id", simuladoId)
    .eq("event_id", eventId)
    .eq("event_participant_id", eventParticipantId)
    .order("attempt_number", { ascending: true })
    .order("created_at", { ascending: true });
  if (freshError) throw new Error(freshError.message);

  const fresh = (freshAttempts || []) as AttemptRow[];
  const shouldCount = new Set(fresh.slice(0, targetCount).map((row) => row.id));
  const idsToTrue = fresh.filter((row) => shouldCount.has(row.id)).map((row) => row.id);
  const idsToFalse = fresh.filter((row) => !shouldCount.has(row.id)).map((row) => row.id);

  if (idsToTrue.length > 0) {
    const { error } = await supabase.from("simulado_attempts").update({ counts_toward_limit: true }).in("id", idsToTrue);
    if (error) throw new Error(error.message);
  }
  if (idsToFalse.length > 0) {
    const { error } = await supabase.from("simulado_attempts").update({ counts_toward_limit: false }).in("id", idsToFalse);
    if (error) throw new Error(error.message);
  }

  // TopCoins: deliberadamente não recalculados aqui. A função equivalente de
  // Jornada (resyncTopCoinEarnings) opera por student_id + simulado_id em
  // TODOS os contextos (Jornada/Evento/avulso) e renumera o attempt_number
  // usado no cálculo do valor ganho — adaptá-la com segurança para escopo de
  // Evento sem afetar tentativas de Jornada/avulso do mesmo Simulado exigiria
  // nova lógica de TopCoins, fora do escopo desta entrega. Tentativas
  // apagadas removem seus próprios ganhos por FK ON DELETE CASCADE
  // (topcoin_earnings.attempt_id); tentativas criadas aqui nascem "abandoned"
  // e não geram TopCoins, então não há inconsistência introduzida.
}

async function resetEventParticipantHistory(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  params: { studentId: string; eventId: string; eventParticipantId: string; simuladoId: string },
) {
  const { studentId, eventId, eventParticipantId, simuladoId } = params;

  const { data: attempts, error: attemptsError } = await supabase
    .from("simulado_attempts")
    .select("id")
    .eq("student_id", studentId)
    .eq("simulado_id", simuladoId)
    .eq("event_id", eventId)
    .eq("event_participant_id", eventParticipantId);
  if (attemptsError) throw new Error(attemptsError.message);

  const attemptIds = (attempts || []).map((attempt) => attempt.id);
  if (attemptIds.length > 0) {
    // simulado_answers, simulado_results e topcoin_earnings têm FK attempt_id
    // ON DELETE CASCADE — uma única exclusão evita histórico parcialmente apagado.
    const { error: deleteError } = await supabase
      .from("simulado_attempts")
      .delete()
      .eq("student_id", studentId)
      .eq("simulado_id", simuladoId)
      .eq("event_id", eventId)
      .eq("event_participant_id", eventParticipantId);
    if (deleteError) throw new Error(deleteError.message);
  }

  return attemptIds.length;
}

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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; studentId: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const { id: eventId, studentId } = await params;
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "");
  const supabase = createSupabaseAdminClient();

  try {
    if (action !== "set_attempts") {
      return NextResponse.json({ ok: false, message: "Ação inválida." }, { status: 400 });
    }

    const attempts = Number(body?.attempts);
    if (!Number.isInteger(attempts) || attempts < 0) {
      return NextResponse.json({ ok: false, message: "Informe um número inteiro e não negativo de tentativas." }, { status: 400 });
    }

    const { data: participant, error: participantError } = await supabase
      .from("simulado_event_participants")
      .select("id,event_id,student_id,representative_attempt_id,result_released_at")
      .eq("event_id", eventId)
      .eq("student_id", studentId)
      .maybeSingle();
    if (participantError) throw new Error(participantError.message);
    if (!participant) return NextResponse.json({ ok: false, message: "Participação não encontrada." }, { status: 404 });

    const { data: event, error: eventError } = await supabase
      .from("simulado_events")
      .select("id,name,simulado_id")
      .eq("id", eventId)
      .maybeSingle();
    if (eventError) throw new Error(eventError.message);
    if (!event) return NextResponse.json({ ok: false, message: "Evento não encontrado." }, { status: 404 });
    if (!event.simulado_id) return NextResponse.json({ ok: false, message: "Este Evento ainda não possui Simulado vinculado." }, { status: 400 });

    if (attempts === 0) {
      const removedAttempts = await resetEventParticipantHistory(supabase, {
        studentId,
        eventId,
        eventParticipantId: participant.id,
        simuladoId: event.simulado_id,
      });

      const { error: clearError } = await supabase
        .from("simulado_event_participants")
        .update({ representative_attempt_id: null, result_released_at: null })
        .eq("id", participant.id);
      if (clearError) throw new Error(clearError.message);

      await logActivity({
        request,
        actorType: "admin",
        actorId: admin.id,
        actorName: admin.full_name || "Admin",
        action: "event_participant_attempts_reset",
        entityType: "simulado_event_participant",
        entityId: participant.id,
        metadata: { event_id: eventId, event_name: event.name, student_id: studentId, removed_attempts: removedAttempts },
      });

      return NextResponse.json({
        ok: true,
        message: "Tentativas zeradas. O histórico deste Evento foi removido para este aluno.",
        event_participation: {
          id: participant.id,
          attempts_total: 0,
          attempts_counting: 0,
          attempts_in_progress: 0,
          latest_attempt_id: null,
          latest_attempt_status: null,
          latest_attempt_started_at: null,
          latest_attempt_submitted_at: null,
          latest_attempt_last_activity_at: null,
          latest_attempt_answered_count: null,
          latest_attempt_total_questions: null,
          latest_attempt_progress_percent: null,
          latest_result_percentage: null,
          latest_result_score: null,
          latest_result_finished_at: null,
          latest_result_time_spent_seconds: null,
          representative_attempt_id: null,
          result_released_at: null,
        },
      });
    }

    await setEventParticipantAttemptsCount(supabase, {
      studentId,
      eventId,
      eventParticipantId: participant.id,
      simuladoId: event.simulado_id,
      targetCount: attempts,
    });

    await logActivity({
      request,
      actorType: "admin",
      actorId: admin.id,
      actorName: admin.full_name || "Admin",
      action: "event_participant_attempts_adjusted",
      entityType: "simulado_event_participant",
      entityId: participant.id,
      metadata: { event_id: eventId, event_name: event.name, student_id: studentId, target_attempts: attempts },
    });

    return NextResponse.json({ ok: true, message: "Número de tentativas ajustado para este aluno neste Evento." });
  } catch (error) {
    void logSystemError({
      source: "api.admin.events.participant.set_attempts",
      error,
      request,
      metadata: { event_id: eventId, student_id: studentId, action },
    });
    return NextResponse.json({ ok: false, message: "Não foi possível ajustar as tentativas deste Evento." }, { status: 500 });
  }
}
