import "server-only";

import { after } from "next/server";
import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logActivity } from "@/lib/logging/activity-log";
import { resyncTopCoinEarnings } from "@/app/lib/server/topcoinsSync";
import { logSystemError } from "@/app/lib/server/auditLogger";
import {
  simuladoReleasedPlainText,
  simuladoReleasedTemplate,
} from "@/app/lib/email/jornadaEmailTemplates";
import { getPublicAppUrl } from "@/lib/server/publicAppUrl";
import { consolidateEventRepresentativeAttempt, releasePendingEventResults } from "@/lib/server/simuladoEvents";
import { computeSimuladoAttemptResult, type AnswerForScoring, type SimuladoQuestionForScoring } from "@/lib/simuladoScoring";

// Fonte única de conclusão de uma tentativa (submit manual do aluno, timeout
// com a página aberta, retomada de tentativa vencida e o job de fechamento
// server-side — ver app/api/admin/simulados/attempts-timeout-job/route.ts —
// TODOS chamam esta mesma função). Nunca duplicar scoring/orquestração
// pós-conclusão em outro arquivo. Extraído verbatim de
// app/api/student/simulados/[id]/attempts/[attemptId]/submit/route.ts em
// 2026-09-10 (Sprint "Timeout server-side") — comportamento idêntico ao
// anterior, sem nenhuma mudança de regra.
//
// Esta função NUNCA valida autenticação/ownership — isso é responsabilidade
// exclusiva de quem a chama: o endpoint do aluno (sessão + ownership da
// tentativa) ou o job de cron (service role, mas só sobre tentativas já
// filtradas por critérios estritos: in_progress + expires_at vencido +
// contexto elegível + marco de ativação — ver o job). `studentId` aqui é
// sempre lido de `attempt.student_id` (nunca de um input externo não
// verificado) pelos dois chamadores.

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SimuladoAttemptRow = any;

// "manual" cobre tanto um clique explícito em "Finalizar" quanto o
// auto-submit disparado pelo client com a página ainda aberta — em ambos os
// casos a requisição chega pela sessão real do aluno. "timeout_cron" é
// exclusivo do job de fechamento server-side (nenhuma sessão de aluno
// envolvida). SubmitPayload não carrega (nem nunca carregou) uma flag de
// "sou automático" enviada pelo client — a distinção não é usada para
// nenhuma decisão de segurança, só para rotular a origem no log de
// auditoria (metadata.completion_origin).
export type CompletionOrigin = "manual" | "timeout_cron";

export type CompleteSimuladoAttemptParams = {
  attempt: SimuladoAttemptRow;
  studentId: string;
  studentName: string | null;
  studentEmail: string | null;
  simuladoId: string;
  timeSpentSeconds: number;
  origin: CompletionOrigin;
  request?: Request;
};

export type CompleteSimuladoAttemptResult =
  | {
      ok: true;
      resultId: string;
      earnedTopcoins: number | null;
      resultReleased: boolean;
      resultAccess: "available" | "blocked_by_event";
      eventId: string | null;
    }
  | { ok: false; httpStatus: number; message: string; resultId: string | null };

export async function completeSimuladoAttempt(
  supabase: SupabaseClient,
  params: CompleteSimuladoAttemptParams,
): Promise<CompleteSimuladoAttemptResult> {
  const { attempt, studentId, studentName, studentEmail, simuladoId, timeSpentSeconds, origin, request } = params;
  const attemptId = attempt.id as string;

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
    return { ok: false, httpStatus: 500, message: sqError.message, resultId: null };
  }

  const questionRows = (simuladoQuestions || []) as unknown as SimuladoQuestionRow[];

  const { data: answersData, error: answersError } = await supabase
    .from("simulado_answers")
    .select(
      "simulado_question_id, selected_alternative_id, selected_alternative_label, is_correct",
    )
    .eq("attempt_id", attemptId);

  if (answersError) {
    return { ok: false, httpStatus: 500, message: answersError.message, resultId: null };
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

  // Questões anuladas nunca são respondíveis — POST .../answers já rejeita
  // (409) resposta para simulado_questions.status = "annulled" (mesma
  // definição de anulação usada no scoring abaixo, contextual a este
  // Simulado). A exigência de "nenhuma em branco" vale só para as
  // questões respondíveis: servidor é soberano aqui, nunca confia em
  // contagem enviada pelo client, sempre recalcula a partir de
  // questionRows/answersBySQ já carregados acima. Se uma questão foi
  // anulada depois de já respondida, a resposta histórica não é apagada
  // (preservada em simulado_answers) — ela só sai do denominador/numerador
  // desta validação específica, nunca da exigência das demais questões.
  const requiredQuestionRows = questionRows.filter((row) => row.status !== "annulled");
  const answeredRequiredQuestions = requiredQuestionRows.filter(
    (row) => Boolean(answersBySQ.get(row.id)?.selected_alternative_id),
  ).length;

  // Encerramento compulsório por tempo esgotado: a exigência de "nenhuma
  // questão em branco" (allow_blank_answers=false) vale só para a
  // FINALIZAÇÃO VOLUNTÁRIA, enquanto ainda há tempo — nunca para o
  // encerramento quando `expires_at` já foi atingido. Fonte de verdade:
  // `attempt.expires_at`, persistido no banco, comparado contra o relógio
  // deste servidor (nunca o relógio do navegador, nunca uma flag enviada
  // pelo client) — recomputado aqui internamente, nunca recebido como
  // parâmetro externo/confiável de quem chama esta função (nem o endpoint
  // do aluno, nem o cron, podem "se declarar" expirados sem essa checagem
  // recalcular a partir do dado persistido).
  const isExpired = Boolean(attempt.expires_at) && new Date(attempt.expires_at).getTime() <= Date.now();

  if (!allowBlank && !isExpired && answeredRequiredQuestions < requiredQuestionRows.length) {
    return {
      ok: false,
      httpStatus: 400,
      message: "Existem questões em branco. Responda todas as questões antes de finalizar.",
      resultId: null,
    };
  }

  // Fonte única de verdade da correção (lib/simuladoScoring.ts) — a mesma
  // usada pelo reprocessamento retroativo de anulação/gabarito
  // (lib/server/simuladoQuestionReprocessing.ts). Nunca confia em
  // answer.is_correct armazenado: recalcula sempre a partir da resposta
  // selecionada + gabarito/status vigentes no momento da conclusão, para
  // que uma alteração de gabarito ocorrida durante a tentativa já valha
  // aqui.
  const scoringQuestions: SimuladoQuestionForScoring[] = questionRows.map((row) => {
    const correctAlt = (row.questions?.question_alternatives || []).find((alt) => alt.is_correct);
    return {
      simuladoQuestionId: row.id,
      questionId: row.question_id,
      points: Number(row.points || 0),
      status: row.status,
      correctAlternativeId: correctAlt?.id || null,
      correctAlternativeLabel: row.questions?.correct_alternative_label || correctAlt?.label || null,
    };
  });
  const scoringAnswers = new Map<string, AnswerForScoring>();
  for (const [simuladoQuestionId, ans] of answersBySQ.entries()) {
    scoringAnswers.set(simuladoQuestionId, {
      selectedAlternativeId: ans.selected_alternative_id,
      selectedAlternativeLabel: ans.selected_alternative_label,
    });
  }

  const graded = computeSimuladoAttemptResult(scoringQuestions, scoringAnswers, scoringModel);
  const correctCount = graded.correctCount;
  const wrongCount = graded.wrongCount;
  const blankCount = graded.blankCount;
  const annulledCount = graded.annulledCount;
  const totalScore = graded.score;
  const maxScore = graded.maxScore;
  const displayScore = graded.displayScore;
  const percentage = graded.percentage;
  const displayPercentage = graded.displayPercentage;
  const snapshotEntries = graded.entries.map((entry) => ({
    simulado_question_id: entry.simuladoQuestionId,
    question_id: entry.questionId,
    points: entry.points,
    status: entry.status,
    selected_alternative_id: entry.selectedAlternativeId,
    selected_alternative_label: entry.selectedAlternativeLabel,
    is_correct: entry.isCorrect,
    correct_alternative_id: entry.correctAlternativeId,
    correct_alternative_label: entry.correctAlternativeLabel,
    score_delta: entry.scoreDelta,
  }));

  const finishedAt = new Date().toISOString();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(finishedAt));
  const timeSpent = Math.max(0, Math.floor(timeSpentSeconds || 0));

  // Operação transacional (supabase/migrations/20260909170000_atomic_attempt_transitions.sql,
  // complete_student_attempt): insere simulado_results E marca a attempt
  // completed na MESMA transação — nunca mais dois passos separados.
  // `p_expected_updated_at` é uma checagem otimista: se a attempt mudou
  // (ex.: uma resposta ou violação de foco concorrente, ou outra execução
  // do cron/client) desde a leitura que alimentou esta correção, a
  // transação rejeita em vez de gravar um resultado potencialmente
  // calculado sobre estado desatualizado — o chamador reenvia e recalcula
  // do zero. Scoring continua inteiramente em TypeScript — o RPC só
  // persiste o resultado já calculado.
  const { data: completeData, error: completeError } = await supabase.rpc("complete_student_attempt", {
    p_attempt_id: attemptId,
    p_student_id: studentId,
    p_simulado_id: simuladoId,
    p_expected_updated_at: attempt.updated_at,
    p_result: {
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
    },
  });

  if (completeError) {
    if (completeError.message?.includes("ATTEMPT_NOT_FOUND")) return { ok: false, httpStatus: 404, message: "Tentativa não encontrada.", resultId: null };
    if (completeError.message?.includes("ATTEMPT_FORBIDDEN") || completeError.message?.includes("ATTEMPT_CONTEXT_INVALID")) return { ok: false, httpStatus: 403, message: "Acesso negado.", resultId: null };
    void logSystemError({ source: "lib.server.simuladoAttemptCompletion.complete", error: completeError, request, metadata: { attempt_id: attemptId, origin } });
    return { ok: false, httpStatus: 500, message: "Não foi possível finalizar o simulado.", resultId: null };
  }

  const completeResult = completeData as { ok: boolean; http_status?: number; message: string; status?: string; id?: string };
  if (!completeResult.ok) {
    // Idempotência: se a tentativa já estava "completed" (ex.: um retry de
    // auto-submit, ou o cron correndo sobre uma tentativa que o próprio
    // aluno acabou de concluir), não deixa o chamador num beco sem saída —
    // devolve o result_id já existente. Nunca cria um segundo resultado:
    // apenas lê o que já existe.
    let existingResultId: string | null = null;
    if (completeResult.status === "completed") {
      const { data: existingResult } = await supabase
        .from("simulado_results")
        .select("id")
        .eq("attempt_id", attemptId)
        .maybeSingle();
      existingResultId = existingResult?.id || null;
    }
    return { ok: false, httpStatus: completeResult.http_status || 409, message: completeResult.message, resultId: existingResultId };
  }
  const resultId = completeResult.id as string;

  // Evento tem prioridade máxima sobre qualquer configuração do Simulado: se
  // a tentativa nasceu em Evento e o resultado ainda não está liberado
  // (result_policy = "blocked" e result_released_at = null), TopCoins,
  // nota, gabarito e feedback ficam bloqueados — calcular internamente
  // (acima) não é o mesmo que disponibilizar ao aluno. Esta decisão precisa
  // ser resolvida ANTES de qualquer lógica de TopCoins.
  const isEventAttempt = Boolean(attempt.event_participant_id && attempt.event_id);
  let eventResultReleased = true;
  if (isEventAttempt) {
    const { data: event } = await supabase.from("simulado_events").select("result_policy").eq("id", attempt.event_id).maybeSingle();
    // Resultado oficial do Evento = primeira tentativa completed +
    // counts_toward_limit; consolidada aqui (nunca na criação/retomada da
    // tentativa) e nunca sobrescrita depois de já apontar para uma conclusão
    // válida (ver consolidateEventRepresentativeAttempt). Preservado
    // integralmente — inclusive para conclusões via cron: representative só
    // ocorre depois desta chamada, nunca antes.
    await consolidateEventRepresentativeAttempt(supabase, { eventParticipantId: attempt.event_participant_id, attemptId });
    const { data: participant } = await supabase.from("simulado_event_participants").select("representative_attempt_id,result_released_at").eq("id", attempt.event_participant_id).maybeSingle();
    if (event?.result_policy === "released" && !participant?.result_released_at) {
      await releasePendingEventResults(supabase, attempt.event_id, request, { createNotifications: false });
    }
    eventResultReleased = Boolean(participant?.result_released_at || event?.result_policy === "released");
  }
  const resultAccess: "available" | "blocked_by_event" = isEventAttempt && !eventResultReleased ? "blocked_by_event" : "available";

  const { data: journeyScheduleItem, error: activeJornadasError } = attempt.student_jornada_simulado_id
    ? await supabase
      .from("student_jornada_simulados")
      .select("id,student_jornada_id,student_jornadas:student_jornada_id(id,expires_at,status,student_id,jornadas:jornada_id(title,planned_simulados_count))")
      .eq("id", attempt.student_jornada_simulado_id)
      .maybeSingle()
    : { data: null, error: null };

  const journeyEnrollmentRef = journeyScheduleItem?.student_jornadas as unknown as ActiveJornadaRow | ActiveJornadaRow[] | null;
  const journeyEnrollment = Array.isArray(journeyEnrollmentRef) ? journeyEnrollmentRef[0] || null : journeyEnrollmentRef;
  const activeJornadas = journeyEnrollment
    && journeyEnrollment.id
    && journeyEnrollment.expires_at > today
    ? [journeyEnrollment]
    : [];

  if (activeJornadasError) {
    void logSystemError({ source: "lib.server.simuladoAttemptCompletion.jornada_lookup", error: activeJornadasError, request, metadata: { student_id: studentId, simulado_id: simuladoId, origin } });
  } else if (activeJornadas?.length) {
    const activeJourneyRows = activeJornadas as unknown as ActiveJornadaRow[];
    const { data: completedJourneyItems, error: jornadaProgressError } = await supabase
      .from("student_jornada_simulados")
      .update({ status: "completed", completed_at: finishedAt })
      .eq("id", attempt.student_jornada_simulado_id)
      .eq("simulado_id", simuladoId)
      .in("status", ["available", "in_progress"])
      .select("student_jornada_id, order_number");

    if (jornadaProgressError) {
      void logSystemError({ source: "lib.server.simuladoAttemptCompletion.jornada_progress", error: jornadaProgressError, request, metadata: { student_id: studentId, simulado_id: simuladoId, origin } });
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
          void logSystemError({ source: "lib.server.simuladoAttemptCompletion.next_jornada_lookup", error: nextItemError, request, metadata: { student_id: studentId, student_jornada_id: completedItem.student_jornada_id, origin } });
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
          void logSystemError({ source: "lib.server.simuladoAttemptCompletion.next_jornada_release", error: releaseError, request, metadata: { student_id: studentId, student_jornada_simulado_id: nextItem.id, origin } });
          continue;
        }
        if (releasedItem) releasedItems.push(releasedItem as ReleasedJourneyItem);
      }

      if (releasedItems.length) {
        after(async () => {
          const resendApiKey = process.env.RESEND_API_KEY;
          if (!resendApiKey || !studentEmail) return;

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
                studentName: studentName || "Aluno",
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
                to: studentEmail,
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
              void logSystemError({ source: "lib.server.simuladoAttemptCompletion.release_email", error: emailError, metadata: { student_id: studentId, student_jornada_simulado_id: releasedItem.id, origin } });
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
  // Dupla proteção contra Evento bloqueado: (1) resync só roda quando
  // eventResultReleased; (2) mesmo que exista algum lançamento inesperado
  // em topcoin_earnings para esta tentativa, o valor só é lido/exposto ao
  // chamador quando resultAccess === "available" — nunca antes. Idêntico
  // para conclusões via cron: nenhuma recompensa paralela é criada.
  let persistedTopCoins: number | null = null;
  try {
    if (resultAccess === "available") {
      if (eventResultReleased) await resyncTopCoinEarnings(supabase, studentId, simuladoId);
      const { data: earningRow } = await supabase
        .from("topcoin_earnings")
        .select("amount")
        .eq("attempt_id", attemptId)
        .maybeSingle();
      persistedTopCoins = earningRow?.amount ?? null;
    }
  } catch {
    // Não trava o fluxo pedagógico (já salvo acima) se o TopCoins falhar.
  }

  const { data: simuladoMeta } = await supabase
    .from("simulados")
    .select("title")
    .eq("id", simuladoId)
    .single();

  void supabase.from("student_activity_log").insert({
    student_id: studentId,
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

  // `origin` diferencia, para auditoria futura, uma conclusão manual/via
  // auto-submit do client (actorType "student", request real do aluno) de
  // uma conclusão fechada pelo job de cron (actorType "system", sem sessão
  // de aluno) — sem criar tabela/coluna nova, só um valor a mais no mesmo
  // campo `metadata` JSONB já existente.
  await logActivity({
    request,
    actorType: origin === "timeout_cron" ? "system" : "student",
    actorId: studentId,
    actorName: studentName,
    actorEmail: studentEmail,
    action: "simulado_completed",
    entityType: "simulado_attempt",
    entityId: attemptId,
    metadata: {
      simulado_id: simuladoId,
      simulado_title: simuladoMeta?.title ?? null,
      result_id: resultId,
      correct_count: correctCount,
      wrong_count: wrongCount,
      blank_count: blankCount,
      total_questions: questionRows.length,
      percentage: Math.round(displayPercentage * 100) / 100,
      time_spent_seconds: timeSpent,
      completion_origin: origin,
    },
  });

  return {
    ok: true,
    resultId,
    earnedTopcoins: persistedTopCoins,
    resultReleased: eventResultReleased,
    resultAccess,
    eventId: (attempt.event_id as string | null) || null,
  };
}
