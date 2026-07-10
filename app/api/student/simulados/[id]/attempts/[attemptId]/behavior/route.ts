import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { logSecurityEvent, logSystemError } from "@/app/lib/server/auditLogger";

type BehaviorPayload =
  | { type?: "inactivity_event" }
  | { type?: "scissors_used"; simulado_question_id?: string };

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; attemptId: string }> },
) {
  const student = await getStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  }

  const { id: simuladoId, attemptId } = await params;
  const body = (await request.json().catch(() => null)) as BehaviorPayload | null;

  if (!body?.type) {
    return NextResponse.json({ ok: false, message: "Evento comportamental inválido." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  const { data: attempt, error: attemptError } = await supabase
    .from("simulado_attempts")
    .select("id, simulado_id, student_id, status, inactivity_event_count, scissors_used_question_ids, question_order")
    .eq("id", attemptId)
    .single();

  if (attemptError || !attempt) {
    return NextResponse.json({ ok: false, message: "Tentativa não encontrada." }, { status: 404 });
  }

  if (attempt.student_id !== student.id || attempt.simulado_id !== simuladoId) {
    void logSecurityEvent({
      event: attempt.student_id !== student.id ? "student.invalid_attempt_access" : "student.idor_attempt",
      actorType: "student",
      actorId: student.id,
      resourceType: "attempt",
      resourceId: attemptId,
      request,
      metadata: { requested_simulado_id: simuladoId },
    });
    return NextResponse.json({ ok: false, message: "Acesso negado." }, { status: 403 });
  }

  if (attempt.status !== "in_progress") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const updatePayload: Record<string, unknown> = {
    last_activity_at: new Date().toISOString(),
  };

  if (body.type === "inactivity_event") {
    updatePayload.inactivity_event_count = Number(attempt.inactivity_event_count || 0) + 1;
  }

  if (body.type === "scissors_used") {
    const questionId = String((body as { simulado_question_id?: string }).simulado_question_id || "").trim();
    if (!questionId) {
      return NextResponse.json({ ok: false, message: "Questão não informada." }, { status: 400 });
    }

    const questionOrder = Array.isArray(attempt.question_order)
      ? attempt.question_order as Array<{ simulado_question_id?: string }>
      : [];
    const belongsToAttempt = questionOrder.some((entry) => entry.simulado_question_id === questionId);
    if (!belongsToAttempt) {
      return NextResponse.json({ ok: false, message: "QuestÃ£o nÃ£o pertence a esta tentativa." }, { status: 400 });
    }

    const currentIds = Array.isArray(attempt.scissors_used_question_ids)
      ? attempt.scissors_used_question_ids.map((value) => String(value))
      : [];
    updatePayload.scissors_used_question_ids = Array.from(new Set([...currentIds, questionId]));
  }

  const { data: updated, error: updateError } = await supabase
    .from("simulado_attempts")
    .update(updatePayload)
    .eq("id", attemptId)
    .select("inactivity_event_count, scissors_used_question_ids")
    .single();

  if (updateError) {
    void logSystemError({ source: "api.student.attempt_behavior", error: updateError, request, metadata: { attempt_id: attemptId } });
    return NextResponse.json({ ok: false, message: "Não foi possível registrar o evento." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, behavior: updated });
}
