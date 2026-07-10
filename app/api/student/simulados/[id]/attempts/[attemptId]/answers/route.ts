import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { logSecurityEvent, logSystemError } from "@/app/lib/server/auditLogger";

type AnswerPayload = {
  simulado_question_id?: string;
  question_id?: string;
  selected_alternative_id?: string | null;
  selected_alternative_label?: string | null;
  response_time_seconds?: number;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; attemptId: string }> },
) {
  const student = await getStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  }

  const { id: simuladoId, attemptId } = await params;
  const body = (await request.json().catch(() => null)) as AnswerPayload | null;

  if (!body || !body.simulado_question_id || !body.question_id || !body.selected_alternative_id) {
    return NextResponse.json(
      { ok: false, message: "Dados da resposta incompletos." },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdminClient();

  const { data: attempt, error: attemptError } = await supabase
    .from("simulado_attempts")
    .select(
      "id, simulado_id, student_id, status, total_questions, settings_snapshot, expires_at",
    )
    .eq("id", attemptId)
    .single();

  if (attemptError || !attempt) {
    return NextResponse.json(
      { ok: false, message: "Tentativa não encontrada." },
      { status: 404 },
    );
  }

  if (attempt.student_id !== student.id) {
    void logSecurityEvent({ event: "student.invalid_attempt_access", actorType: "student", actorId: student.id, resourceType: "attempt", resourceId: attemptId, request, metadata: { simulado_id: simuladoId } });
    return NextResponse.json({ ok: false, message: "Acesso negado." }, { status: 403 });
  }

  if (attempt.simulado_id !== simuladoId) {
    void logSecurityEvent({ event: "student.idor_attempt", actorType: "student", actorId: student.id, resourceType: "attempt", resourceId: attemptId, request, metadata: { requested_simulado_id: simuladoId } });
    return NextResponse.json(
      { ok: false, message: "Simulado inválido para esta tentativa." },
      { status: 400 },
    );
  }

  if (attempt.status !== "in_progress") {
    return NextResponse.json(
      { ok: false, message: "Tentativa já encerrada." },
      { status: 409 },
    );
  }

  if (attempt.expires_at && new Date(attempt.expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { ok: false, message: "Tempo esgotado." },
      { status: 410 },
    );
  }

  // Valida que simulado_question_id pertence a este simulado e que question_id é consistente
  const { data: sqValidation } = await supabase
    .from("simulado_questions")
    .select("id, question_id")
    .eq("id", body.simulado_question_id)
    .eq("simulado_id", simuladoId)
    .maybeSingle();

  if (!sqValidation) {
    return NextResponse.json(
      { ok: false, message: "Questão inválida para este simulado." },
      { status: 400 },
    );
  }

  if (sqValidation.question_id !== body.question_id) {
    return NextResponse.json(
      { ok: false, message: "Dados da resposta inválidos." },
      { status: 400 },
    );
  }

  // Carrega resposta existente
  const { data: existing } = await supabase
    .from("simulado_answers")
    .select("id, is_locked, changed_count, selected_alternative_id")
    .eq("attempt_id", attemptId)
    .eq("simulado_question_id", body.simulado_question_id)
    .maybeSingle();

  if (existing?.is_locked) {
    return NextResponse.json(
      {
        ok: false,
        message: "Resposta já confirmada. Não é possível alterar.",
        is_locked: true,
      },
      { status: 409 },
    );
  }

  const settings = (attempt.settings_snapshot || {}) as { instant_feedback_enabled?: boolean };
  const instantFeedback = Boolean(settings.instant_feedback_enabled);

  // Determina se está correta
  let isCorrect: boolean | null = null;

  const { data: alternative } = await supabase
    .from("question_alternatives")
    .select("id, label, is_correct")
    .eq("id", body.selected_alternative_id)
    .eq("question_id", sqValidation.question_id)
    .maybeSingle();

  if (!alternative) {
    return NextResponse.json(
      { ok: false, message: "Alternativa inválida para esta questão." },
      { status: 400 },
    );
  }

  isCorrect = Boolean(alternative.is_correct);

  const willLock = instantFeedback;

  const upsertPayload = {
    attempt_id: attemptId,
    simulado_question_id: body.simulado_question_id,
    question_id: body.question_id,
    selected_alternative_id: body.selected_alternative_id,
    selected_alternative_label: body.selected_alternative_label || alternative?.label || null,
    is_correct: isCorrect,
    is_locked: willLock,
    response_time_seconds: Math.max(0, Math.floor(body.response_time_seconds || 0)),
    answered_at: new Date().toISOString(),
    changed_count: existing && existing.selected_alternative_id !== body.selected_alternative_id
      ? (existing.changed_count || 0) + 1
      : (existing?.changed_count || 0),
  };

  const { error: upsertError } = await supabase
    .from("simulado_answers")
    .upsert(upsertPayload, { onConflict: "attempt_id,simulado_question_id" });

  if (upsertError) {
    void logSystemError({ source: "api.student.attempt_answers", error: upsertError, request, metadata: { attempt_id: attemptId } });
    return NextResponse.json(
      { ok: false, message: "Não foi possível salvar a resposta." },
      { status: 500 },
    );
  }

  // Recalcula contagem de respondidas
  const { count: answeredCount } = await supabase
    .from("simulado_answers")
    .select("id", { count: "exact", head: true })
    .eq("attempt_id", attemptId)
    .not("selected_alternative_id", "is", null);

  const total = attempt.total_questions || 1;
  const answered = answeredCount || 0;
  const progress = total > 0 ? Math.round((answered / total) * 100 * 100) / 100 : 0;

  // Threshold de contabilização (50%)
  const updatePayload: Record<string, unknown> = {
    answered_count: answered,
    progress_percent: progress,
    last_activity_at: new Date().toISOString(),
  };

  if (answered / total > 0.5) {
    updatePayload.counts_toward_limit = true;
    updatePayload.counted_at = new Date().toISOString();
  }

  const { error: updateError } = await supabase
    .from("simulado_attempts")
    .update(updatePayload)
    .eq("id", attemptId);

  if (updateError) {
    void logSystemError({ source: "api.student.attempt_answers", error: updateError, request, metadata: { attempt_id: attemptId } });
    return NextResponse.json(
      { ok: false, message: "Não foi possível salvar a resposta." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    is_correct: instantFeedback ? isCorrect : null,
    is_locked: willLock,
    answered_count: answered,
    progress_percent: progress,
  });
}
