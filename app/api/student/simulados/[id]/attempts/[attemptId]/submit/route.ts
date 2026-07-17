import { after, NextResponse } from "next/server";
import { Resend } from "resend";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { logActivity } from "@/lib/logging/activity-log";
import { resyncTopCoinEarnings } from "@/app/lib/server/topcoinsSync";
import { logSystemError } from "@/app/lib/server/auditLogger";
import {
  simuladoReleasedPlainText,
  simuladoReleasedTemplate,
} from "@/app/lib/email/jornadaEmailTemplates";
import { getPublicAppUrl } from "@/lib/server/publicAppUrl";

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

type ActiveJornadaRow = {
  id: string;
  expires_at: string;
  jornadas: {
    title: string;
    planned_simulados_count: number | null;
  } | null;
};

type CompletedJourneyItem = {
  student_jornada_id: string;
  order_number: number;
};

type ReleasedJourneyItem = {
  id: string;
  student_jornada_id: string;
  simulado_id: string;
  order_number: number;
  released_at: string;
};

type JourneyScheduleRow = {
  id: string;
  order_number: number;
  scheduled_release_at: string;
  released_at: string | null;
  status: string;
  simulados: { title: string } | null;
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
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(finishedAt));
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
    .select("id, expires_at, jornadas:jornada_id(title, planned_simulados_count)")
    .eq("student_id", student.id)
    .eq("status", "active")
    .gt("expires_at", today);

  if (activeJornadasError) {
    void logSystemError({ source: "api.student.simulado_submit.jornada_lookup", error: activeJornadasError, request, metadata: { student_id: student.id, simulado_id: simuladoId } });
  } else if (activeJornadas?.length) {
    const activeJourneyRows = activeJornadas as unknown as ActiveJornadaRow[];
    const { data: completedJourneyItems, error: jornadaProgressError } = await supabase
      .from("student_jornada_simulados")
      .update({ status: "completed", completed_at: finishedAt })
      .eq("simulado_id", simuladoId)
      .in("student_jornada_id", activeJourneyRows.map((row) => row.id))
      .in("status", ["available", "in_progress"])
      .select("student_jornada_id, order_number");

    if (jornadaProgressError) {
      void logSystemError({ source: "api.student.simulado_submit.jornada_progress", error: jornadaProgressError, request, metadata: { student_id: student.id, simulado_id: simuladoId } });
    } else if (completedJourneyItems?.length) {
      const releasedItems: ReleasedJourneyItem[] = [];

      for (const completedItem of completedJourneyItems as CompletedJourneyItem[]) {
        const { data: nextItem, error: nextItemError } = await supabase
          .from("student_jornada_simulados")
          .select("id")
          .eq("student_jornada_id", completedItem.student_jornada_id)
          .eq("order_number", completedItem.order_number + 1)
          .eq("status", "locked")
          .lte("scheduled_release_at", today)
          .maybeSingle();

        if (nextItemError) {
          void logSystemError({ source: "api.student.simulado_submit.next_jornada_lookup", error: nextItemError, request, metadata: { student_id: student.id, student_jornada_id: completedItem.student_jornada_id } });
          continue;
        }
        if (!nextItem) continue;

        const releaseTimestamp = new Date().toISOString();
        const { data: releasedItem, error: releaseError } = await supabase
          .from("student_jornada_simulados")
          .update({ status: "available", released_at: releaseTimestamp })
          .eq("id", nextItem.id)
          .eq("status", "locked")
          .select("id, student_jornada_id, simulado_id, order_number, released_at")
          .maybeSingle();

        if (releaseError) {
          void logSystemError({ source: "api.student.simulado_submit.next_jornada_release", error: releaseError, request, metadata: { student_id: student.id, student_jornada_simulado_id: nextItem.id } });
          continue;
        }
        if (releasedItem) releasedItems.push(releasedItem as ReleasedJourneyItem);
      }

      if (releasedItems.length) {
        after(async () => {
          const resendApiKey = process.env.RESEND_API_KEY;
          if (!resendApiKey || !student.email) return;

          const resend = new Resend(resendApiKey);
          const appUrl = getPublicAppUrl();
          const journeyById = new Map(activeJourneyRows.map((row) => [row.id, row]));

          for (const releasedItem of releasedItems) {
            try {
              const journey = journeyById.get(releasedItem.student_jornada_id);
              if (!journey?.jornadas) continue;

              const [{ data: releasedSimulado }, { data: scheduleRows }] = await Promise.all([
                supabase.from("simulados").select("title").eq("id", releasedItem.simulado_id).single(),
                supabase
                  .from("student_jornada_simulados")
                  .select("id, order_number, scheduled_release_at, released_at, status, simulados:simulado_id(title)")
                  .eq("student_jornada_id", releasedItem.student_jornada_id)
                  .order("order_number", { ascending: true }),
              ]);
              if (!releasedSimulado) continue;

              const schedule = ((scheduleRows || []) as unknown as JourneyScheduleRow[]).map((row) => ({
                order: row.order_number,
                title: row.simulados?.title || `Simulado ${row.order_number}`,
                scheduledReleaseAt: row.scheduled_release_at,
                releasedAt: row.released_at,
                status: row.status,
                highlight: row.id === releasedItem.id,
              }));
              const emailParams = {
                studentName: student.name || "Aluno",
                simuladoTitle: releasedSimulado.title,
                jornadaTitle: journey.jornadas.title,
                position: releasedItem.order_number,
                total: journey.jornadas.planned_simulados_count || schedule.length,
                expiresAt: journey.expires_at,
                simuladoUrl: `${appUrl}/meus-simulados/${releasedItem.simulado_id}`,
                schedule,
              };
              const { error: emailError } = await resend.emails.send({
                from: "EstudoTOP <estudotop@estudotop.com.br>",
                replyTo: "estudotop@estudotop.com.br",
                to: student.email,
                subject: `Novo simulado liberado — ${journey.jornadas.title}`,
                html: simuladoReleasedTemplate(emailParams),
                text: simuladoReleasedPlainText(emailParams),
              });
              if (emailError) throw emailError;

              await supabase
                .from("student_jornada_simulados")
                .update({ release_email_sent_at: new Date().toISOString(), release_email_error: null })
                .eq("id", releasedItem.id)
                .is("release_email_sent_at", null);
            } catch (emailError) {
              const message = emailError instanceof Error ? emailError.message : "Falha ao enviar e-mail de liberação.";
              await supabase
                .from("student_jornada_simulados")
                .update({ release_email_error: message.slice(0, 500) })
                .eq("id", releasedItem.id);
              void logSystemError({ source: "api.student.simulado_submit.release_email", error: emailError, metadata: { student_id: student.id, student_jornada_simulado_id: releasedItem.id } });
            }
          }
        });
      }
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
