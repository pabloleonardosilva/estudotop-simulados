import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { logStudentActivity } from "@/app/lib/server/auditLogger";

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

  const { data: studentIdentity } = await supabase
    .from("students")
    .select("name, email, cpf")
    .eq("id", student.id)
    .maybeSingle();

  const attemptColumns =
    "id, status, time_spent_seconds, submitted_at, disqualified_at, disqualification_reason, tab_switch_count, focus_violation_count, inactivity_event_count, scissors_used_question_ids, owl_help_used_count";

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
      requestedAttempt.simulado_id !== simuladoId ||
      requestedAttempt.status !== "completed"
    ) {
      return NextResponse.json(
        { ok: false, message: "Resultado não encontrado para esta tentativa." },
        { status: 404 },
      );
    }
    attempt = requestedAttempt;
  } else {
    // Resultado oficial: primeira tentativa concluída que ainda conta no limite.
    const { data: firstAttempt } = await supabase
      .from("simulado_attempts")
      .select(attemptColumns)
      .eq("simulado_id", simuladoId)
      .eq("student_id", student.id)
      .eq("status", "completed")
      .eq("counts_toward_limit", true)
      .order("submitted_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    attempt = (firstAttempt || null) as AttemptSummary | null;
  }

  if (!attempt) {
    return NextResponse.json(
      { ok: false, message: "Nenhum resultado disponível." },
      { status: 404 },
    );
  }

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
    .eq("id", simuladoId)
    .single();

  if (simuladoError || !simulado) {
    return NextResponse.json(
      { ok: false, message: "Simulado não encontrado." },
      { status: 404 },
    );
  }

  const { data: result } = await supabase
    .from("simulado_results")
    .select("*")
    .eq("attempt_id", attempt.id)
    .maybeSingle();

  const { data: answerChangesData } = await supabase
    .from("simulado_answers")
    .select("changed_count")
    .eq("attempt_id", attempt.id);

  const totalAnswerChanges = (answerChangesData || []).reduce(
    (acc, row) => acc + Number(row.changed_count || 0),
    0,
  );

  // Média geral
  const { data: averageData } = await supabase
    .from("simulado_results")
    .select("display_percentage")
    .eq("simulado_id", simuladoId);

  const percentages = (averageData || []).map((row) => Number(row.display_percentage || 0));
  const average =
    percentages.length > 0
      ? percentages.reduce((acc, value) => acc + value, 0) / percentages.length
      : null;

  // Subjects revisados
  const { data: simuladoQuestions } = await supabase
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
    .eq("simulado_id", simuladoId)
    .order("order_number", { ascending: true });

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

  const showAnswerKey = Boolean(simulado.show_answer_key_on_finish);

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
  }>).filter((row) => (row.student_jornada_simulados || []).some((item) => item.simulado_id === simuladoId));

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

  void logStudentActivity({ studentId: student.id, action: "student.result.viewed", entityType: "attempt", entityId: attempt.id, request, metadata: { simulado_id: simuladoId, attempt_id: attempt.id, requested_attempt: Boolean(requestedAttemptId) } });

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
      show_answer_key_on_finish: simulado.show_answer_key_on_finish,
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
    average_display_percentage: average,
    total_results: percentages.length,
    subjects: Array.from(subjectsMap.values()).sort((a, b) => a.localeCompare(b)),
    gabarito,
    jornada: jornadaContext,
  });
}
