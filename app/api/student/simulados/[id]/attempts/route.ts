import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { assertStudentCanStartSimulado } from "@/lib/server/studentAssertions";
import { logActivity } from "@/lib/logging/activity-log";

function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

type SimuladoQuestionRow = {
  id: string;
  question_id: string;
  order_number: number;
  points: number;
  status: string;
  questions: {
    id: string;
    statement: string | null;
    explanation_text: string | null;
    question_type: string | null;
    correct_alternative_label: string | null;
    exam_boards: { id: string; name: string } | null;
    subjects: { id: string; name: string; disciplines: { id: string; name: string } | null } | null;
    question_alternatives: {
      id: string;
      label: string;
      text: string;
      is_correct: boolean;
      order_number: number | null;
    }[];
  } | null;
};

type OrderedQuestionPayload = {
  simulado_question_id: string;
  question_id: string;
  order_number: number;
  points: number;
  status: string;
  statement: string | null;
  explanation_text: string | null;
  question_type: string | null;
  exam_board: string | null;
  subject: string | null;
  discipline: string | null;
  alternatives: { id: string; label: string; text: string }[];
};

type QuestionOrderEntry = {
  simulado_question_id: string;
  question_id: string;
  alternative_order: string[];
};

function getFeedbackMode(simulado: { feedback_mode?: unknown; instant_feedback_enabled?: unknown }) {
  return typeof simulado.feedback_mode === "string"
    ? simulado.feedback_mode
    : (simulado.instant_feedback_enabled ? "instant" : "final_only");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const student = await getStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  }

  const { id: simuladoId } = await params;
  const supabase = createSupabaseAdminClient();

  const { data: simulado, error: simuladoError } = await supabase
    .from("simulados")
    .select(
      `
        id,
        title,
        status,
        question_count,
        time_limit_minutes,
        max_attempts,
        attempt_count_threshold_percent,
        show_result_on_finish,
        show_answer_key_on_finish,
        instant_feedback_enabled,
        feedback_mode,
        show_teacher_comment,
        correction_video_url,
        shuffle_questions,
        shuffle_alternatives,
        allow_blank_answers,
        scoring_model
      `,
    )
    .eq("id", simuladoId)
    .single();

  if (simuladoError || !simulado) {
    return NextResponse.json(
      { ok: false, message: "Simulado não encontrado" },
      { status: 404 },
    );
  }

  if (simulado.status !== "published") {
    return NextResponse.json(
      { ok: false, message: "Simulado indisponível no momento" },
      { status: 403 },
    );
  }

  const accessError = await assertStudentCanStartSimulado(student.id, simuladoId, supabase, request);
  if (accessError) return accessError;

  const jornadaId = new URL(request.url).searchParams.get("jornada");
  if (jornadaId) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: studentJornada } = await supabase
      .from("student_jornadas")
      .select("id, status, expires_at")
      .eq("id", jornadaId)
      .eq("student_id", student.id)
      .maybeSingle();

    if (!studentJornada || studentJornada.status !== "active" || studentJornada.expires_at <= today) {
      return NextResponse.json(
        { ok: false, message: "Esta Jornada não permite iniciar ou retomar simulados no momento." },
        { status: 403 },
      );
    }

    const { data: jornadaSimulado } = await supabase
      .from("student_jornada_simulados")
      .select("id, status")
      .eq("student_jornada_id", jornadaId)
      .eq("simulado_id", simuladoId)
      .maybeSingle();

    if (!jornadaSimulado || !["available", "in_progress", "completed"].includes(jornadaSimulado.status)) {
      return NextResponse.json(
        { ok: false, message: "Este simulado ainda não está liberado nesta Jornada." },
        { status: 403 },
      );
    }
  }

  // Verifica tentativa em andamento já existente
  const { data: existing, error: existingError } = await supabase
    .from("simulado_attempts")
    .select("*")
    .eq("simulado_id", simuladoId)
    .eq("student_id", student.id)
    .eq("status", "in_progress")
    .maybeSingle();

  if (existingError) {
    return NextResponse.json(
      { ok: false, message: existingError.message },
      { status: 500 },
    );
  }

  if (existing) {
    await logActivity({
      request,
      actorType: "student",
      actorId: student.id,
      actorName: student.name,
      actorEmail: student.email,
      action: "simulado_attempt_resumed",
      entityType: "simulado_attempt",
      entityId: existing.id,
      metadata: { simulado_id: simuladoId, simulado_title: simulado.title, jornada_id: jornadaId },
    });
    return buildAttemptResponse(supabase, existing, simulado);
  }

  // Validação de tentativas restantes
  const { data: history, error: historyError } = await supabase
    .from("simulado_attempts")
    .select("id, counts_toward_limit, status")
    .eq("simulado_id", simuladoId)
    .eq("student_id", student.id);

  if (historyError) {
    return NextResponse.json(
      { ok: false, message: historyError.message },
      { status: 500 },
    );
  }

  const used = (history || []).filter((row) => row.counts_toward_limit).length;
  const totalCompleted = (history || []).filter(
    (row) => row.status === "completed" || row.status === "disqualified" || row.status === "expired",
  ).length;

  if (simulado.max_attempts && used >= simulado.max_attempts) {
    return NextResponse.json(
      { ok: false, message: "Você atingiu o limite de tentativas para este simulado." },
      { status: 403 },
    );
  }

  const attemptNumber = (history?.length || 0) + 1;

  // Carrega questões do simulado com alternativas
  const { data: simuladoQuestions, error: sqError } = await supabase
    .from("simulado_questions")
    .select(
      `
        id,
        question_id,
        order_number,
        points,
        status,
        questions:question_id (
          id,
          statement,
          explanation_text,
          question_type,
          correct_alternative_label,
          exam_boards:exam_board_id ( id, name ),
          subjects:subject_id (
            id,
            name,
            disciplines:discipline_id ( id, name )
          ),
          question_alternatives ( id, label, text, is_correct, order_number )
        )
      `,
    )
    .eq("simulado_id", simuladoId)
    .order("order_number", { ascending: true });

  if (sqError) {
    return NextResponse.json(
      { ok: false, message: sqError.message },
      { status: 500 },
    );
  }

  const rows = (simuladoQuestions || []) as unknown as SimuladoQuestionRow[];

  if (rows.length === 0) {
    return NextResponse.json(
      { ok: false, message: "Simulado sem questões cadastradas." },
      { status: 400 },
    );
  }

  const orderedRows = simulado.shuffle_questions ? shuffle(rows) : rows;

  const questionOrder: QuestionOrderEntry[] = [];
  const orderedPayload: OrderedQuestionPayload[] = [];

  for (let index = 0; index < orderedRows.length; index += 1) {
    const row = orderedRows[index];
    const q = row.questions;
    const alternatives = q?.question_alternatives || [];
    const sortedAlternatives = [...alternatives].sort(
      (a, b) => (a.order_number ?? 0) - (b.order_number ?? 0),
    );
    const isTrueFalse = (q?.question_type || "").toLowerCase().includes("certo")
      || alternatives.some((alt) => /^(certo|errado)$/i.test(alt.label));
    const finalAlternatives = simulado.shuffle_alternatives && !isTrueFalse
      ? shuffle(sortedAlternatives)
      : sortedAlternatives;

    questionOrder.push({
      simulado_question_id: row.id,
      question_id: row.question_id,
      alternative_order: finalAlternatives.map((alt) => alt.id),
    });

    orderedPayload.push({
      simulado_question_id: row.id,
      question_id: row.question_id,
      order_number: index + 1,
      points: row.points,
      status: row.status,
      statement: q?.statement || null,
      explanation_text: q?.explanation_text || null,
      question_type: q?.question_type || null,
      exam_board: q?.exam_boards?.name || null,
      subject: q?.subjects?.name || null,
      discipline: q?.subjects?.disciplines?.name || null,
      alternatives: finalAlternatives.map((alt) => ({
        id: alt.id,
        label: alt.label,
        text: alt.text,
      })),
    });
  }

  const startedAt = new Date();
  const expiresAt = simulado.time_limit_minutes
    ? new Date(startedAt.getTime() + simulado.time_limit_minutes * 60_000)
    : null;

  const feedbackMode = getFeedbackMode(simulado);
  const settingsSnapshot = {
    time_limit_minutes: simulado.time_limit_minutes,
    max_attempts: simulado.max_attempts,
    attempt_count_threshold_percent: simulado.attempt_count_threshold_percent,
    show_result_on_finish: simulado.show_result_on_finish,
    show_answer_key_on_finish: simulado.show_answer_key_on_finish,
    instant_feedback_enabled: feedbackMode === "instant" || Boolean(simulado.instant_feedback_enabled),
    feedback_mode: feedbackMode,
    show_teacher_comment: simulado.show_teacher_comment,
    correction_video_url: simulado.correction_video_url,
    shuffle_questions: simulado.shuffle_questions,
    shuffle_alternatives: simulado.shuffle_alternatives,
    allow_blank_answers: simulado.allow_blank_answers,
    scoring_model: simulado.scoring_model,
  };

  const { data: created, error: createError } = await supabase
    .from("simulado_attempts")
    .insert({
      simulado_id: simuladoId,
      student_id: student.id,
      attempt_number: attemptNumber,
      status: "in_progress",
      started_at: startedAt.toISOString(),
      last_activity_at: startedAt.toISOString(),
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      total_questions: orderedRows.length,
      question_order: questionOrder,
      settings_snapshot: settingsSnapshot,
      rules_accepted_at: startedAt.toISOString(),
    })
    .select("*")
    .single();

  if (createError || !created) {
    return NextResponse.json(
      { ok: false, message: createError?.message || "Não foi possível iniciar a tentativa." },
      { status: 500 },
    );
  }

  await logActivity({
    request,
    actorType: "student",
    actorId: student.id,
    actorName: student.name,
    actorEmail: student.email,
    action: "simulado_attempt_started",
    entityType: "simulado_attempt",
    entityId: created.id,
    metadata: {
      simulado_id: simuladoId,
      simulado_title: simulado.title,
      attempt_number: attemptNumber,
      total_questions: orderedRows.length,
      jornada_id: jornadaId,
    },
  });

  // Sanitiza payload retornado (sem dados sensíveis de gabarito)
  return NextResponse.json({
    ok: true,
    attempt: sanitizeAttempt(created),
    questions: orderedPayload,
    simulado: buildSimuladoSnapshot(simulado),
    totalAttemptsUsed: used,
    totalAttempted: totalCompleted,
  });
}

async function buildAttemptResponse(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  attempt: Record<string, unknown>,
  simulado: Record<string, unknown>,
) {
  const order = (attempt.question_order as QuestionOrderEntry[]) || [];
  const simuladoQuestionIds = order.map((entry) => entry.simulado_question_id);

  const { data: simuladoQuestions, error } = await supabase
    .from("simulado_questions")
    .select(
      `
        id,
        question_id,
        order_number,
        points,
        status,
        questions:question_id (
          id,
          statement,
          explanation_text,
          question_type,
          exam_boards:exam_board_id ( id, name ),
          subjects:subject_id (
            id,
            name,
            disciplines:discipline_id ( id, name )
          ),
          question_alternatives ( id, label, text, order_number )
        )
      `,
    )
    .in("id", simuladoQuestionIds.length ? simuladoQuestionIds : ["00000000-0000-0000-0000-000000000000"]);

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  const rowsById = new Map<string, SimuladoQuestionRow>();
  for (const row of (simuladoQuestions || []) as unknown as SimuladoQuestionRow[]) {
    rowsById.set(row.id, row);
  }

  const orderedPayload: OrderedQuestionPayload[] = order.map((entry, index) => {
    const row = rowsById.get(entry.simulado_question_id);
    const q = row?.questions;
    const altById = new Map(
      (q?.question_alternatives || []).map((alt) => [alt.id, alt]),
    );
    const alternatives = entry.alternative_order
      .map((altId) => altById.get(altId))
      .filter((alt): alt is NonNullable<typeof alt> => Boolean(alt))
      .map((alt) => ({ id: alt.id, label: alt.label, text: alt.text }));

    return {
      simulado_question_id: entry.simulado_question_id,
      question_id: entry.question_id,
      order_number: index + 1,
      points: row?.points || 1,
      status: row?.status || "active",
      statement: q?.statement || null,
      explanation_text: q?.explanation_text || null,
      question_type: q?.question_type || null,
      exam_board: q?.exam_boards?.name || null,
      subject: q?.subjects?.name || null,
      discipline: q?.subjects?.disciplines?.name || null,
      alternatives,
    };
  });

  // Recupera respostas já dadas
  const { data: answers } = await supabase
    .from("simulado_answers")
    .select(
      "simulado_question_id, selected_alternative_id, selected_alternative_label, is_correct, is_locked",
    )
    .eq("attempt_id", attempt.id as string);

  return NextResponse.json({
    ok: true,
    attempt: sanitizeAttempt(attempt),
    questions: orderedPayload,
    answers: answers || [],
    simulado: buildSimuladoSnapshot(simulado),
  });
}

function sanitizeAttempt(attempt: Record<string, unknown>) {
  return {
    id: attempt.id,
    simulado_id: attempt.simulado_id,
    attempt_number: attempt.attempt_number,
    status: attempt.status,
    started_at: attempt.started_at,
    last_activity_at: attempt.last_activity_at,
    expires_at: attempt.expires_at,
    answered_count: attempt.answered_count,
    total_questions: attempt.total_questions,
    progress_percent: attempt.progress_percent,
    time_spent_seconds: attempt.time_spent_seconds,
    tab_switch_count: attempt.tab_switch_count,
    focus_violation_count: attempt.focus_violation_count,
    rules_accepted_at: attempt.rules_accepted_at,
  };
}

function buildSimuladoSnapshot(simulado: Record<string, unknown>) {
  const feedbackMode = getFeedbackMode(simulado);
  return {
    id: simulado.id,
    title: simulado.title,
    time_limit_minutes: simulado.time_limit_minutes,
    max_attempts: simulado.max_attempts,
    show_result_on_finish: simulado.show_result_on_finish,
    show_answer_key_on_finish: simulado.show_answer_key_on_finish,
    instant_feedback_enabled: feedbackMode === "instant" || Boolean(simulado.instant_feedback_enabled),
    feedback_mode: feedbackMode,
    show_teacher_comment: simulado.show_teacher_comment,
    correction_video_url: simulado.correction_video_url,
    allow_blank_answers: simulado.allow_blank_answers,
    scoring_model: simulado.scoring_model,
  };
}
