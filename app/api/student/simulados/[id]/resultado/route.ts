import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { logStudentActivity, logSystemError } from "@/app/lib/server/auditLogger";

type ResultSnapshotEntry = {
  simulado_question_id: string;
  question_id: string;
  points: number;
  status: string;
  selected_alternative_id: string | null;
  selected_alternative_label: string | null;
  is_correct: boolean | null;
  correct_alternative_id: string | null;
  correct_alternative_label: string | null;
  score_delta: number;
};

type AttemptSummary = {
  id: string;
  simulado_id: string;
  status: string;
  time_spent_seconds: number | null;
  submitted_at: string | null;
  disqualified_at: string | null;
  disqualification_reason: string | null;
  tab_switch_count: number | null;
  focus_violation_count: number | null;
  inactivity_event_count: number | null;
  scissors_used_question_ids: string[] | null;
  owl_help_used_count: number | null;
  event_participant_id: string | null;
  student_jornada_simulado_id: string | null;
  attempt_context: string;
};

type QuestionDetail = {
  id: string;
  statement: string | null;
  explanation_text: string | null;
  question_type: string | null;
  evaluated_topics?: string[] | null;
  question_alternatives: { id: string; label: string; text: string; is_correct: boolean }[];
  subjects: { id: string; name: string; disciplines: { id: string; name: string } | null } | null;
  exam_boards: { id: string; name: string } | null;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const student = await getStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  }

  const { id: simuladoId } = await params;
  const supabase = createSupabaseAdminClient();

  const url = new URL(request.url);
  const requestedAttemptId = url.searchParams.get("attemptId");
  const requestedStudentJornadaId = url.searchParams.get("jornada");
  const requestedEventId = url.searchParams.get("event");
  if (requestedStudentJornadaId && requestedEventId) {
    return NextResponse.json({ ok: false, message: "Informe apenas um contexto de execução." }, { status: 400 });
  }
  let requestedStudentJornadaSimuladoId: string | null = null;
  let requestedEventParticipantId: string | null = null;
  let representativeEventAttemptId: string | null = null;
  let eventResultReleased = false;

  if (requestedStudentJornadaId) {
    const { data: scheduleItem } = await supabase
      .from("student_jornada_simulados")
      .select("id,student_jornadas:student_jornada_id(student_id,status,expires_at)")
      .eq("student_jornada_id", requestedStudentJornadaId)
      .eq("simulado_id", simuladoId)
      .maybeSingle();
    const enrollment = scheduleItem?.student_jornadas as unknown as { student_id: string; status: string; expires_at: string | null } | { student_id: string; status: string; expires_at: string | null }[] | null;
    const enrollmentData = Array.isArray(enrollment) ? enrollment[0] : enrollment;
    const ownerId = enrollmentData?.student_id;
    if (!scheduleItem || ownerId !== student.id) {
      return NextResponse.json({ ok: false, message: "Resultado não encontrado nesta Jornada." }, { status: 404 });
    }
    if (!enrollmentData || enrollmentData.status !== "active" || (enrollmentData.expires_at && enrollmentData.expires_at <= new Date().toISOString().slice(0, 10))) {
      return NextResponse.json({ ok: false, code: "JORNADA_ACCESS_BLOCKED", message: "Seu acesso a esta Jornada está bloqueado." }, { status: 403 });
    }
    requestedStudentJornadaSimuladoId = scheduleItem.id;
  }

  if (requestedEventId) {
    const { data: participant, error: participantError } = await supabase
      .from("simulado_event_participants")
      .select("id,representative_attempt_id,result_released_at,access_status")
      .eq("event_id", requestedEventId)
      .eq("student_id", student.id)
      .maybeSingle();
    if (participantError) {
      void logSystemError({ source: "api.student.simulado_result.event_participant", error: participantError, request, metadata: { event_id: requestedEventId, student_id: student.id } });
      return NextResponse.json({ ok: false, message: "Não foi possível carregar os detalhes do resultado." }, { status: 500 });
    }
    if (!participant) {
      return NextResponse.json({ ok: false, message: "Resultado não encontrado neste Evento." }, { status: 404 });
    }
    if (participant.access_status !== "active") {
      return NextResponse.json({ ok: false, code: "EVENT_ACCESS_BLOCKED", message: "Seu acesso a este Evento está bloqueado." }, { status: 403 });
    }
    requestedEventParticipantId = participant.id;
    representativeEventAttemptId = participant.representative_attempt_id;
    eventResultReleased = Boolean(participant.result_released_at);
  }

  const { data: studentIdentity } = await supabase
    .from("students")
    .select("name, email, cpf")
    .eq("id", student.id)
    .maybeSingle();

  const attemptColumns =
    "id, simulado_id, status, time_spent_seconds, submitted_at, disqualified_at, disqualification_reason, tab_switch_count, focus_violation_count, inactivity_event_count, scissors_used_question_ids, owl_help_used_count, event_participant_id, student_jornada_simulado_id, attempt_context";

  let attempt: AttemptSummary | null = null;

  if (requestedAttemptId) {
    // Resultado imediato: tentativa específica recém-finalizada. A tentativa
    // precisa pertencer ao aluno autenticado, ao simulado da rota e estar
    // concluída — caso contrário, nenhum dado é retornado (sem fallback
    // silencioso para outra tentativa).
    const { data: requestedAttemptData } = await supabase
      .from("simulado_attempts")
      .select(`${attemptColumns}, student_id, simulado_id`)
      .eq("id", requestedAttemptId)
      .maybeSingle();

    const requestedAttempt = (requestedAttemptData || null) as
      | (AttemptSummary & { student_id: string; simulado_id: string })
      | null;

    if (
      !requestedAttempt ||
      requestedAttempt.student_id !== student.id ||
      (!requestedEventParticipantId && requestedAttempt.simulado_id !== simuladoId) ||
      requestedAttempt.status !== "completed" ||
      (requestedStudentJornadaSimuladoId && requestedAttempt.student_jornada_simulado_id !== requestedStudentJornadaSimuladoId) ||
      (requestedEventParticipantId && requestedAttempt.event_participant_id !== requestedEventParticipantId)
    ) {
      return NextResponse.json(
        { ok: false, message: "Resultado não encontrado para esta tentativa." },
        { status: 404 },
      );
    }
    attempt = requestedAttempt;
  } else {
    // Resultado oficial: primeira tentativa concluída que ainda conta no limite.
    let firstAttemptQuery = supabase
      .from("simulado_attempts")
      .select(attemptColumns)
      .eq("student_id", student.id)
      .eq("status", "completed")
      .eq("counts_toward_limit", true);
    if (requestedStudentJornadaSimuladoId) {
      firstAttemptQuery = firstAttemptQuery
        .eq("simulado_id", simuladoId)
        .eq("student_jornada_simulado_id", requestedStudentJornadaSimuladoId);
    } else if (requestedEventParticipantId) {
      firstAttemptQuery = firstAttemptQuery.eq("event_participant_id", requestedEventParticipantId);
    } else {
      firstAttemptQuery = firstAttemptQuery
        .eq("simulado_id", simuladoId)
        .eq("attempt_context", "standalone")
        .is("event_participant_id", null)
        .is("student_jornada_simulado_id", null);
    }
    const { data: firstAttempt } = await firstAttemptQuery
      .order("submitted_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    attempt = (firstAttempt || null) as AttemptSummary | null;

    if (requestedEventParticipantId && representativeEventAttemptId) {
      const { data: representativeAttempt } = await supabase
        .from("simulado_attempts")
        .select(attemptColumns)
        .eq("id", representativeEventAttemptId)
        .eq("student_id", student.id)
        .eq("event_participant_id", requestedEventParticipantId)
        .eq("status", "completed")
        .eq("counts_toward_limit", true)
        .maybeSingle();
      if (representativeAttempt) attempt = representativeAttempt as AttemptSummary;
    }
  }

  if (!attempt) {
    return NextResponse.json(
      { ok: false, message: "Nenhum resultado disponível." },
      { status: 404 },
    );
  }

  if (attempt.event_participant_id) {
    if (!requestedEventParticipantId) {
      const { data: participant } = await supabase.from("simulado_event_participants").select("result_released_at,access_status").eq("id", attempt.event_participant_id).eq("student_id", student.id).maybeSingle();
      if (participant?.access_status !== "active") return NextResponse.json({ ok: false, code: "EVENT_ACCESS_BLOCKED", message: "Seu acesso a este Evento está bloqueado." }, { status: 403 });
      eventResultReleased = Boolean(participant?.result_released_at);
    }
    if (!eventResultReleased) {
      return NextResponse.json({ ok: false, code: "EVENT_RESULT_BLOCKED", message: "Seu resultado foi calculado e aguarda liberação pelo professor." }, { status: 403 });
    }
  }

  const resultSimuladoId = attempt.simulado_id;

  const { data: simulado, error: simuladoError } = await supabase
    .from("simulados")
    .select(
      `
        id,
        title,
        description,
        scoring_model,
        show_answer_key_on_finish,
        show_teacher_comment,
        correction_video_url,
        instant_feedback_enabled,
        feedback_mode,
        owl_help_enabled
      `,
    )
    .eq("id", resultSimuladoId)
    .single();

  if (simuladoError) {
    void logSystemError({ source: "api.student.simulado_result.simulado", error: simuladoError, request, metadata: { attempt_id: attempt.id, simulado_id: resultSimuladoId } });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar os detalhes do resultado." }, { status: 500 });
  }

  if (!simulado) {
    return NextResponse.json(
      { ok: false, message: "Simulado não encontrado." },
      { status: 404 },
    );
  }

  const { data: result, error: resultError } = await supabase
    .from("simulado_results")
    .select("*")
    .eq("attempt_id", attempt.id)
    .maybeSingle();

  if (resultError || !result) {
    void logSystemError({ source: "api.student.simulado_result.result", error: resultError || new Error("Resultado persistido não encontrado."), request, metadata: { attempt_id: attempt.id, simulado_id: resultSimuladoId } });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar os detalhes do resultado." }, { status: 500 });
  }

  const { data: topcoinEarning, error: topcoinEarningError } = await supabase
    .from("topcoin_earnings")
    .select("amount")
    .eq("attempt_id", attempt.id)
    .eq("student_id", student.id)
    .maybeSingle();
  if (topcoinEarningError) {
    void logSystemError({ source: "api.student.simulado_result.topcoins", error: topcoinEarningError, request, metadata: { attempt_id: attempt.id, student_id: student.id } });
  }

  const { data: answerChangesData, error: answerChangesError } = await supabase
    .from("simulado_answers")
    .select("changed_count")
    .eq("attempt_id", attempt.id);

  if (answerChangesError) {
    void logSystemError({ source: "api.student.simulado_result.answers", error: answerChangesError, request, metadata: { attempt_id: attempt.id, simulado_id: resultSimuladoId } });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar os detalhes do resultado." }, { status: 500 });
  }

  const totalAnswerChanges = (answerChangesData || []).reduce(
    (acc, row) => acc + Number(row.changed_count || 0),
    0,
  );

  // Média geral
  const { data: averageData } = await supabase
    .from("simulado_results")
    .select("display_percentage")
    .eq("simulado_id", resultSimuladoId);

  const percentages = (averageData || []).map((row) => Number(row.display_percentage || 0));
  const average =
    percentages.length > 0
      ? percentages.reduce((acc, value) => acc + value, 0) / percentages.length
      : null;

  // Subjects revisados
  const { data: simuladoQuestions, error: simuladoQuestionsError } = await supabase
    .from("simulado_questions")
    .select(
      `
        id,
        order_number,
        status,
        points,
        question_id,
        questions:question_id (
          id,
          statement,
          explanation_text,
          question_type,
          evaluated_topics,
          subjects:subject_id (
            id,
            name,
            disciplines:discipline_id ( id, name )
          ),
          exam_boards:exam_board_id ( id, name ),
          question_alternatives ( id, label, text, is_correct )
        )
      `,
    )
    .eq("simulado_id", resultSimuladoId)
    .order("order_number", { ascending: true });

  if (simuladoQuestionsError) {
    void logSystemError({ source: "api.student.simulado_result.questions", error: simuladoQuestionsError, request, metadata: { attempt_id: attempt.id, simulado_id: resultSimuladoId } });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar os detalhes do resultado." }, { status: 500 });
  }

  const sqRows = (simuladoQuestions || []) as unknown as Array<{
    id: string;
    order_number: number;
    status: string;
    points: number;
    question_id: string;
    questions: QuestionDetail | null;
  }>;

  const subjectsMap = new Map<string, string>();
  for (const row of sqRows) {
    const subj = row.questions?.subjects;
    if (subj && subj.id) subjectsMap.set(subj.id, subj.name);
  }

  const snapshot = (result?.result_snapshot || {}) as { entries?: ResultSnapshotEntry[] };
  const snapshotBySQ = new Map<string, ResultSnapshotEntry>();
  for (const entry of snapshot.entries || []) {
    snapshotBySQ.set(entry.simulado_question_id, entry);
  }

  const showAnswerKey = Boolean(simulado.show_answer_key_on_finish) || Boolean(attempt.event_participant_id && eventResultReleased);

  const gabarito = showAnswerKey
    ? sqRows.map((row) => {
        const entry = snapshotBySQ.get(row.id);
        const question = row.questions;
        return {
          simulado_question_id: row.id,
          order_number: row.order_number,
          status: row.status,
          points: row.points,
          statement: question?.statement || null,
          explanation_text: simulado.show_teacher_comment ? question?.explanation_text || null : null,
          question_type: question?.question_type || null,
          evaluated_topics: Array.isArray(question?.evaluated_topics) ? question.evaluated_topics : [],
          subject: question?.subjects?.name || null,
          discipline: question?.subjects?.disciplines?.name || null,
          exam_board: question?.exam_boards?.name || null,
          alternatives: (question?.question_alternatives || []).map((alt) => ({
            id: alt.id,
            label: alt.label,
            text: alt.text,
            is_correct: alt.is_correct,
            selected: entry?.selected_alternative_id === alt.id,
          })),
          selected_alternative_id: entry?.selected_alternative_id || null,
          selected_alternative_label: entry?.selected_alternative_label || null,
          correct_alternative_id: entry?.correct_alternative_id || null,
          correct_alternative_label: entry?.correct_alternative_label || null,
          is_correct: entry?.is_correct ?? null,
        };
      })
    : [];

  // Contexto de Jornada para o botão de retorno: usa o vínculo explícito da
  // navegação (?jornada=) quando ele pertence ao aluno e contém este simulado;
  // sem contexto explícito, só resolve quando o vínculo é inequívoco (o
  // simulado aparece em exatamente uma Jornada do aluno). Nunca escolhe uma
  // Jornada arbitrária.
  const { data: jornadaRows } = await supabase
    .from("student_jornadas")
    .select("id, jornadas:jornada_id ( title ), student_jornada_simulados ( simulado_id )")
    .eq("student_id", student.id);

  const jornadaLinks = ((jornadaRows || []) as unknown as Array<{
    id: string;
    jornadas: { title: string | null } | null;
    student_jornada_simulados: { simulado_id: string }[] | null;
  }>).filter((row) => (row.student_jornada_simulados || []).some((item) => item.simulado_id === resultSimuladoId));

  let jornadaContext: { student_jornada_id: string; title: string } | null = null;
  const explicitLink = requestedStudentJornadaId
    ? jornadaLinks.find((row) => row.id === requestedStudentJornadaId) || null
    : null;
  const resolvedLink = explicitLink || (jornadaLinks.length === 1 ? jornadaLinks[0] : null);
  if (resolvedLink) {
    jornadaContext = {
      student_jornada_id: resolvedLink.id,
      title: resolvedLink.jornadas?.title || "Jornada",
    };
  }

  void logStudentActivity({ studentId: student.id, action: "student.result.viewed", entityType: "attempt", entityId: attempt.id, request, metadata: { simulado_id: resultSimuladoId, attempt_id: attempt.id, requested_attempt: Boolean(requestedAttemptId), event_id: requestedEventId } });

  return NextResponse.json({
    ok: true,
    message: "Resultado carregado com sucesso.",
    student: {
      name: studentIdentity?.name ?? student.user_metadata?.full_name ?? student.user_metadata?.name ?? null,
      email: studentIdentity?.email ?? student.email,
      cpf: studentIdentity?.cpf ?? null,
    },
    simulado: {
      id: simulado.id,
      title: simulado.title,
      description: simulado.description,
      scoring_model: simulado.scoring_model,
      show_answer_key_on_finish: showAnswerKey,
      show_teacher_comment: simulado.show_teacher_comment,
      correction_video_url: simulado.correction_video_url,
      owl_help_enabled: Boolean(simulado.owl_help_enabled),
    },
    attempt: {
      id: attempt.id,
      status: attempt.status,
      time_spent_seconds: attempt.time_spent_seconds,
      submitted_at: attempt.submitted_at,
      disqualified_at: attempt.disqualified_at,
      disqualification_reason: attempt.disqualification_reason,
    },
    behavior_metrics: {
      tab_switch_count: Number(attempt.tab_switch_count || 0),
      focus_violation_count: Number(attempt.focus_violation_count || 0),
      inactivity_event_count: Number(attempt.inactivity_event_count || 0),
      total_answer_changes: totalAnswerChanges,
      decision_index: result?.total_questions ? Math.round((totalAnswerChanges / Number(result.total_questions || 1)) * 100) / 100 : 0,
      scissors_question_count: Array.isArray(attempt.scissors_used_question_ids) ? attempt.scissors_used_question_ids.length : 0,
      scissors_usage_percent: result?.total_questions && Array.isArray(attempt.scissors_used_question_ids)
        ? Math.round((attempt.scissors_used_question_ids.length / Number(result.total_questions || 1)) * 10000) / 100
        : 0,
      owl_help_enabled: Boolean(simulado.owl_help_enabled),
      owl_help_used_count: Number(attempt.owl_help_used_count || 0),
    },
    result: result
      ? {
          id: result.id,
          total_questions: result.total_questions,
          answered_questions: result.answered_questions,
          correct_count: result.correct_count,
          wrong_count: result.wrong_count,
          blank_count: result.blank_count,
          annulled_count: result.annulled_count,
          score: result.score,
          display_score: result.display_score,
          max_score: result.max_score,
          percentage: result.percentage,
          display_percentage: result.display_percentage,
          scoring_model: result.scoring_model,
          time_spent_seconds: result.time_spent_seconds,
          finished_at: result.finished_at,
        }
      : null,
    earned_topcoins: topcoinEarningError ? null : Number(topcoinEarning?.amount || 0),
    average_display_percentage: average,
    total_results: percentages.length,
    subjects: Array.from(subjectsMap.values()).sort((a, b) => a.localeCompare(b)),
    gabarito,
    jornada: jornadaContext,
  });
}
