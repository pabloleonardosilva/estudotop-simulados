import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { logActivity } from "@/lib/logging/activity-log";
import { resyncTopCoinEarnings } from "@/app/lib/server/topcoinsSync";
import { logSystemError } from "@/app/lib/server/auditLogger";

type SubmitPayload = {
  time_spent_seconds?: number;
};

type SimuladoQuestionRow = {
  id: string;
  question_id: string;
  order_number: number;
  points: number;
  status: string;
  questions: {
    id: string;
    correct_alternative_label: string | null;
    question_alternatives: {
      id: string;
      label: string;
      is_correct: boolean;
    }[];
  } | null;
};

type AnswerRow = {
  simulado_question_id: string;
  selected_alternative_id: string | null;
  selected_alternative_label: string | null;
  is_correct: boolean | null;
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
  const body = (await request.json().catch(() => ({}))) as SubmitPayload;

  const supabase = createSupabaseAdminClient();

  const { data: attempt, error: attemptError } = await supabase
    .from("simulado_attempts")
    .select("*")
    .eq("id", attemptId)
    .single();

  if (attemptError || !attempt) {
    return NextResponse.json(
      { ok: false, message: "Tentativa não encontrada." },
      { status: 404 },
    );
  }

  if (attempt.student_id !== student.id) {
    return NextResponse.json({ ok: false, message: "Acesso negado." }, { status: 403 });
  }

  if (attempt.simulado_id !== simuladoId) {
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

  // Carrega questões do simulado para corrigir
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
          correct_alternative_label,
          question_alternatives ( id, label, is_correct )
        )
      `,
    )
    .eq("simulado_id", simuladoId);

  if (sqError) {
    return NextResponse.json(
      { ok: false, message: sqError.message },
      { status: 500 },
    );
  }

  const questionRows = (simuladoQuestions || []) as unknown as SimuladoQuestionRow[];

  const { data: answersData, error: answersError } = await supabase
    .from("simulado_answers")
    .select(
      "simulado_question_id, selected_alternative_id, selected_alternative_label, is_correct",
    )
    .eq("attempt_id", attemptId);

  if (answersError) {
    return NextResponse.json(
      { ok: false, message: answersError.message },
      { status: 500 },
    );
  }

  const answers = (answersData || []) as AnswerRow[];
  const answersBySQ = new Map<string, AnswerRow>();
  for (const ans of answers) {
    answersBySQ.set(ans.simulado_question_id, ans);
  }

  const settings = (attempt.settings_snapshot || {}) as {
    allow_blank_answers?: boolean;
    scoring_model?: "traditional" | "cebraspe";
    show_answer_key_on_finish?: boolean;
  };
  const scoringModel = settings.scoring_model || "traditional";
  const allowBlank = Boolean(settings.allow_blank_answers);

  const answeredQuestions = answers.filter((row) => row.selected_alternative_id).length;

  if (!allowBlank && answeredQuestions < questionRows.length) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Existem questões em branco. Responda todas as questões antes de finalizar.",
        unanswered: questionRows.length - answeredQuestions,
      },
      { status: 400 },
    );
  }

  let totalScore = 0;
  let maxScore = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let blankCount = 0;
  let annulledCount = 0;

  const snapshotEntries: Array<{
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
  }> = [];

  for (const row of questionRows) {
    const points = Number(row.points || 0);
    maxScore += points;

    const answer = answersBySQ.get(row.id) || null;
    const correctAlt = (row.questions?.question_alternatives || []).find(
      (alt) => alt.is_correct,
    );
    const correctLabel =
      row.questions?.correct_alternative_label || correctAlt?.label || null;
    const correctId = correctAlt?.id || null;

    let delta = 0;
    let isCorrect: boolean | null = null;

    if (row.status === "annulled") {
      annulledCount += 1;
      delta = points;
      totalScore += points;
      isCorrect = true;
    } else if (!answer || !answer.selected_alternative_id) {
      blankCount += 1;
      delta = 0;
    } else {
      let correct = answer.is_correct;
      if (correct === null || correct === undefined) {
        if (correctId && answer.selected_alternative_id === correctId) correct = true;
        else if (correctLabel && answer.selected_alternative_label)
          correct = answer.selected_alternative_label.trim().toLowerCase() ===
            correctLabel.trim().toLowerCase();
      }
      isCorrect = Boolean(correct);
      if (correct) {
        correctCount += 1;
        delta = points;
        totalScore += points;
      } else {
        wrongCount += 1;
        if (scoringModel === "cebraspe") {
          delta = -points;
          totalScore -= points;
        }
      }
    }

    snapshotEntries.push({
      simulado_question_id: row.id,
      question_id: row.question_id,
      points,
      status: row.status,
      selected_alternative_id: answer?.selected_alternative_id || null,
      selected_alternative_label: answer?.selected_alternative_label || null,
      is_correct: isCorrect,
      correct_alternative_id: correctId,
      correct_alternative_label: correctLabel,
      score_delta: delta,
    });
  }

  const displayScore = Math.max(totalScore, 0);
  const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
  const displayPercentage = Math.max(0, Math.min(100, percentage));

  const finishedAt = new Date().toISOString();
  const timeSpent = Math.max(0, Math.floor(body.time_spent_seconds || 0));

  const { data: resultRow, error: resultError } = await supabase
    .from("simulado_results")
    .insert({
      attempt_id: attemptId,
      simulado_id: simuladoId,
      student_id: student.id,
      total_questions: questionRows.length,
      answered_questions: answeredQuestions,
      correct_count: correctCount,
      wrong_count: wrongCount,
      blank_count: blankCount,
      annulled_count: annulledCount,
      score: Math.round(totalScore * 100) / 100,
      display_score: Math.round(displayScore * 100) / 100,
      max_score: Math.round(maxScore * 100) / 100,
      percentage: Math.round(percentage * 100) / 100,
      display_percentage: Math.round(displayPercentage * 100) / 100,
      scoring_model: scoringModel,
      time_spent_seconds: timeSpent,
      finished_at: finishedAt,
      result_snapshot: { entries: snapshotEntries },
    })
    .select("id")
    .single();

  if (resultError || !resultRow) {
    return NextResponse.json(
      { ok: false, message: resultError?.message || "Erro ao gravar resultado." },
      { status: 500 },
    );
  }

  const { error: updateError } = await supabase
    .from("simulado_attempts")
    .update({
      status: "completed",
      submitted_at: finishedAt,
      time_spent_seconds: timeSpent,
      counts_toward_limit: true,
      counted_at: finishedAt,
      answered_count: answeredQuestions,
      progress_percent:
        questionRows.length > 0
          ? Math.round((answeredQuestions / questionRows.length) * 100 * 100) / 100
          : 0,
      last_activity_at: finishedAt,
    })
    .eq("id", attemptId);

  if (updateError) {
    return NextResponse.json(
      { ok: false, message: updateError.message },
      { status: 500 },
    );
  }

  const { data: activeJornadas, error: activeJornadasError } = await supabase
    .from("student_jornadas")
    .select("id")
    .eq("student_id", student.id)
    .eq("status", "active")
    .gt("expires_at", finishedAt.slice(0, 10));

  if (activeJornadasError) {
    void logSystemError({ source: "api.student.simulado_submit.jornada_lookup", error: activeJornadasError, request, metadata: { student_id: student.id, simulado_id: simuladoId } });
  } else if (activeJornadas?.length) {
    const { error: jornadaProgressError } = await supabase
      .from("student_jornada_simulados")
      .update({ status: "completed", completed_at: finishedAt })
      .eq("simulado_id", simuladoId)
      .in("student_jornada_id", activeJornadas.map((row) => row.id))
      .in("status", ["available", "in_progress"]);

    if (jornadaProgressError) {
      void logSystemError({ source: "api.student.simulado_submit.jornada_progress", error: jornadaProgressError, request, metadata: { student_id: student.id, simulado_id: simuladoId } });
    }
  }

  // TopCoins: recalcula do zero o extrato deste aluno neste simulado, a
  // partir das tentativas que hoje contam para o limite (counts_toward_limit
  // = true) — isso garante que "tentativa" nunca passe de max_attempts e que
  // um reset de tentativas pelo admin (que zera counts_toward_limit) já
  // remova as moedas daquela tentativa (ver app/lib/server/topcoinsSync.ts).
  let persistedTopCoins: number | null = null;
  try {
    await resyncTopCoinEarnings(supabase, student.id, simuladoId);
    const { data: earningRow } = await supabase
      .from("topcoin_earnings")
      .select("amount")
      .eq("attempt_id", attemptId)
      .maybeSingle();
    persistedTopCoins = earningRow?.amount ?? null;
  } catch {
    // Não trava o fluxo pedagógico (já salvo acima) se o TopCoins falhar.
  }

  const { data: simuladoMeta } = await supabase
    .from("simulados")
    .select("title")
    .eq("id", simuladoId)
    .single();

  void supabase.from("student_activity_log").insert({
    student_id: student.id,
    event_type: "simulado_completed",
    description: `Simulado "${simuladoMeta?.title || simuladoId}" concluído`,
    details: {
      simulado_id: simuladoId,
      simulado_title: simuladoMeta?.title ?? null,
      attempt_id: attemptId,
      correct_count: correctCount,
      wrong_count: wrongCount,
      blank_count: blankCount,
      total_questions: questionRows.length,
      score: Math.round(displayScore * 100) / 100,
      max_score: Math.round(maxScore * 100) / 100,
      percentage: Math.round(displayPercentage * 100) / 100,
      scoring_model: scoringModel,
      time_spent_seconds: timeSpent,
    },
    performed_by_name: null,
  });

  await logActivity({
    request,
    actorType: "student",
    actorId: student.id,
    actorName: student.name,
    actorEmail: student.email,
    action: "simulado_completed",
    entityType: "simulado_attempt",
    entityId: attemptId,
    metadata: {
      simulado_id: simuladoId,
      simulado_title: simuladoMeta?.title ?? null,
      result_id: resultRow.id,
      correct_count: correctCount,
      wrong_count: wrongCount,
      blank_count: blankCount,
      total_questions: questionRows.length,
      percentage: Math.round(displayPercentage * 100) / 100,
      time_spent_seconds: timeSpent,
    },
  });

  return NextResponse.json({ ok: true, result_id: resultRow.id, earned_topcoins: persistedTopCoins });
}
