import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeSimuladoAttemptResult, type AnswerForScoring, type SimuladoQuestionForScoring } from "@/lib/simuladoScoring";
import { resyncTopCoinEarnings } from "@/app/lib/server/topcoinsSync";
import { logActivity } from "@/lib/logging/activity-log";

// Motor central de reprocessamento — único ponto do sistema que recalcula
// simulado_results/simulado_answers.is_correct depois de:
//   - anular ou desanular uma questão dentro de um Simulado (simulado_questions.status);
//   - alterar o gabarito de uma questão no Banco (questions.correct_alternative_label).
//
// Nunca soma/subtrai em cima do resultado anterior: para cada tentativa
// completed + counts_toward_limit=true do Simulado afetado, reconstrói o
// resultado inteiro a partir da resposta originalmente selecionada pelo
// aluno + gabarito e status VIGENTES (lib/simuladoScoring.ts), e só então
// grava a diferença. Isso é o que garante, por construção, que uma
// bonificação manual anterior (que alterou is_correct sem alterar a
// resposta selecionada) nunca é duplicada: o motor nem lê is_correct.

export type ReprocessReasonCode = "question_annulled" | "question_reactivated" | "answer_key_changed";

type ActorContext = {
  actorId: string | null;
  actorName: string | null;
  actorType: "admin" | "professor";
  reasonText: string;
  reasonCode: ReprocessReasonCode;
  // Identidade estável da revisão que disparou este reprocessamento —
  // persistida em simulado_questions.status_revision_id (anular/desanular)
  // ou questions.answer_key_revision_id (gabarito), gerada uma única vez no
  // momento da transição real e reaproveitada em qualquer retry da MESMA
  // revisão. Nunca um timestamp/UUID gerado a cada tentativa de
  // reprocessamento — é o que garante que um retry não duplica a
  // notificação, mas uma revisão futura distinta (mesmo type) gera uma nova.
  revisionId: string;
};

type QuestionAlternativeRow = { id: string; label: string; is_correct: boolean };
type SimuladoQuestionDbRow = {
  id: string;
  simulado_id: string;
  question_id: string;
  points: number;
  status: string;
  questions: {
    id: string;
    correct_alternative_label: string | null;
    question_alternatives: QuestionAlternativeRow[];
  } | null;
};
type SimuladoAttemptDbRow = {
  id: string;
  student_id: string;
  simulado_id: string;
  attempt_context: string;
  event_id: string | null;
  event_participant_id: string | null;
  student_jornada_simulado_id: string | null;
  settings_snapshot: { scoring_model?: "traditional" | "cebraspe" } | null;
};
type SimuladoAnswerDbRow = {
  id: string;
  simulado_question_id: string;
  selected_alternative_id: string | null;
  selected_alternative_label: string | null;
  is_correct: boolean | null;
};
type SimuladoResultDbRow = {
  id: string;
  attempt_id: string;
  correct_count: number;
  wrong_count: number;
  blank_count: number;
  annulled_count: number;
  score: number;
  display_score: number;
  percentage: number;
  display_percentage: number;
};

// PostgREST/Supabase corta silenciosamente qualquer resposta de .select()
// no limite padrão de linhas do projeto (max_rows, tipicamente 1000) — sem
// erro, sem aviso. Um Simulado com muitas tentativas oficiais facilmente
// ultrapassa isso em simulado_answers (tentativas × questões): 135
// tentativas × 12 questões já são ~1620 linhas. Uma consulta truncada aqui
// não falha — ela silenciosamente "esquece" respostas reais, que o motor
// então interpreta como questão em branco (incidente real: ver
// docs/Sprint-resultados.md, "Incidente de truncamento").
//
// fetchAllPages() pagina de forma determinística (.order("id") — chave
// primária, garante que nenhuma linha seja pulada nem duplicada entre
// páginas) até a página voltar com menos que PAGE_SIZE linhas, e confere o
// total acumulado contra o `count` exato que o Postgres relata na mesma
// consulta — se algo ainda assim divergir (não deveria, mas é a rede de
// segurança pedida), lança erro em vez de seguir com dado incompleto. Não é
// "aumentar o limite": funciona para 100 linhas, 1.000, 20.000 ou qualquer
// volume futuro, porque sempre pagina até esgotar.
const PAGE_SIZE = 1000;

async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null; count?: number | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  let expectedTotal: number | null = null;
  let from = 0;

  for (;;) {
    const { data, error, count } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (expectedTotal === null && typeof count === "number") expectedTotal = count;

    const page = data || [];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  if (expectedTotal !== null && rows.length !== expectedTotal) {
    throw new Error(
      `Paginação incompleta ao carregar dados de reprocessamento: esperava ${expectedTotal} linha(s), carregou ${rows.length}. Reconciliação não aplicada com dado parcial — retry seguro.`,
    );
  }

  return rows;
}

async function loadSimuladoQuestions(supabase: SupabaseClient, simuladoId: string): Promise<SimuladoQuestionForScoring[]> {
  const { data, error } = await supabase
    .from("simulado_questions")
    .select(
      `
        id, simulado_id, question_id, points, status,
        questions:question_id ( id, correct_alternative_label, question_alternatives ( id, label, is_correct ) )
      `,
    )
    .eq("simulado_id", simuladoId);
  if (error) throw new Error(error.message);

  return ((data || []) as unknown as SimuladoQuestionDbRow[]).map((row) => {
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
}

/**
 * Reprocessa todas as tentativas completed + counts_toward_limit=true de UM
 * Simulado (qualquer contexto — Evento, Jornada ou avulso). Retorna
 * métricas para auditoria/relatório. Nunca toca em tentativas
 * in_progress/disqualified/expired/abandoned, nem em representative_attempt_id.
 */
export async function reprocessSimulado(
  supabase: SupabaseClient,
  simuladoId: string,
  context: ActorContext,
): Promise<{ attemptsReprocessed: number; resultsChanged: number; notificationsCreated: number; topcoinsResynced: number }> {
  const questions = await loadSimuladoQuestions(supabase, simuladoId);
  if (questions.length === 0) return { attemptsReprocessed: 0, resultsChanged: 0, notificationsCreated: 0, topcoinsResynced: 0 };

  const attempts = await fetchAllPages<SimuladoAttemptDbRow>((from, to) =>
    supabase
      .from("simulado_attempts")
      .select("id, student_id, simulado_id, attempt_context, event_id, event_participant_id, student_jornada_simulado_id, settings_snapshot", { count: "exact" })
      .eq("simulado_id", simuladoId)
      .eq("status", "completed")
      .eq("counts_toward_limit", true)
      .eq("is_preview", false)
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (attempts.length === 0) return { attemptsReprocessed: 0, resultsChanged: 0, notificationsCreated: 0, topcoinsResynced: 0 };

  const attemptIds = attempts.map((row) => row.id);

  const answersRows = await fetchAllPages<SimuladoAnswerDbRow & { attempt_id: string }>((from, to) =>
    supabase
      .from("simulado_answers")
      .select("id, attempt_id, simulado_question_id, selected_alternative_id, selected_alternative_label, is_correct", { count: "exact" })
      .in("attempt_id", attemptIds)
      .order("id", { ascending: true })
      .range(from, to),
  );
  const answersByAttempt = new Map<string, (SimuladoAnswerDbRow & { attempt_id: string })[]>();
  for (const row of answersRows) {
    const list = answersByAttempt.get(row.attempt_id) || [];
    list.push(row);
    answersByAttempt.set(row.attempt_id, list);
  }

  const resultsRows = await fetchAllPages<SimuladoResultDbRow>((from, to) =>
    supabase
      .from("simulado_results")
      .select("id, attempt_id, correct_count, wrong_count, blank_count, annulled_count, score, display_score, percentage, display_percentage", { count: "exact" })
      .in("attempt_id", attemptIds)
      .order("id", { ascending: true })
      .range(from, to),
  );
  const resultByAttempt = new Map<string, SimuladoResultDbRow>();
  for (const row of resultsRows) resultByAttempt.set(row.attempt_id, row);

  const nowIso = new Date().toISOString();
  let resultsChanged = 0;
  let notificationsCreated = 0;
  let topcoinsResynced = 0;
  const resyncedStudentIds = new Set<string>();

  for (const attempt of attempts) {
    const oldResult = resultByAttempt.get(attempt.id);
    if (!oldResult) continue;
    const answers = answersByAttempt.get(attempt.id) || [];
    const answersMap = new Map<string, AnswerForScoring>();
    for (const ans of answers) {
      answersMap.set(ans.simulado_question_id, {
        selectedAlternativeId: ans.selected_alternative_id,
        selectedAlternativeLabel: ans.selected_alternative_label,
      });
    }
    const scoringModel = (attempt.settings_snapshot?.scoring_model || "traditional") as "traditional" | "cebraspe";
    const fresh = computeSimuladoAttemptResult(questions, answersMap, scoringModel);

    // TopCoins são resincronizados aqui — para TODO aluno cuja tentativa é
    // examinada nesta passagem, não só quando esta tentativa específica
    // muda — e nunca num loop separado ao final. Isso fecha, por
    // construção, a janela entre "resultado corrigido" e "TopCoins
    // resincronizados": se o processo cair logo depois deste ponto para
    // esta tentativa, ela já está garantidamente coberta antes da queda; se
    // cair antes, o retry reprocessa a tentativa (e resincroniza) de novo
    // — resyncTopCoinEarnings() é idempotente (recompõe do zero a partir de
    // correct_count vigente), então chamá-la de novo nunca duplica saldo.
    if (!resyncedStudentIds.has(attempt.student_id)) {
      resyncedStudentIds.add(attempt.student_id);
      await resyncTopCoinEarnings(supabase, attempt.student_id, simuladoId);
      topcoinsResynced += 1;
    }

    const scoreChanged =
      fresh.correctCount !== oldResult.correct_count ||
      fresh.wrongCount !== oldResult.wrong_count ||
      fresh.blankCount !== oldResult.blank_count ||
      fresh.annulledCount !== oldResult.annulled_count ||
      fresh.score !== Number(oldResult.score);

    // Corrige simulado_answers.is_correct só onde a resposta original
    // (nunca alterada aqui) hoje classifica diferente do que está
    // gravado — nunca reescreve selected_alternative_id/label.
    for (const entry of fresh.entries) {
      const existingAnswer = answers.find((a) => a.simulado_question_id === entry.simuladoQuestionId);
      if (!existingAnswer) continue;
      const newIsCorrect = entry.classification === "blank" ? null : entry.isCorrect;
      if (existingAnswer.is_correct !== newIsCorrect) {
        const { error: updateAnswerError } = await supabase
          .from("simulado_answers")
          .update({ is_correct: newIsCorrect })
          .eq("id", existingAnswer.id);
        if (updateAnswerError) throw new Error(updateAnswerError.message);
      }
    }

    if (!scoreChanged) continue;

    const { error: updateResultError } = await supabase
      .from("simulado_results")
      .update({
        correct_count: fresh.correctCount,
        wrong_count: fresh.wrongCount,
        blank_count: fresh.blankCount,
        annulled_count: fresh.annulledCount,
        score: fresh.score,
        display_score: fresh.displayScore,
        max_score: fresh.maxScore,
        percentage: fresh.percentage,
        display_percentage: fresh.displayPercentage,
        result_snapshot: {
          entries: fresh.entries.map((entry) => ({
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
          })),
        },
        last_reprocessed_at: nowIso,
        reprocess_reason: context.reasonText,
      })
      .eq("id", oldResult.id);
    if (updateResultError) throw new Error(updateResultError.message);
    resultsChanged += 1;

    await supabase.from("simulado_result_change_logs").insert({
      student_id: attempt.student_id,
      simulado_id: simuladoId,
      attempt_id: attempt.id,
      question_id: null,
      old_score: Number(oldResult.display_score),
      new_score: fresh.displayScore,
      score_delta: Math.round((fresh.displayScore - Number(oldResult.display_score)) * 100) / 100,
      reason: context.reasonText,
      changed_by: context.actorId,
      changed_by_name: context.actorName,
      visible_to_student: true,
    }).then(({ error }) => { if (error) throw new Error(error.message); });

    const actionUrl = attempt.event_id
      ? `/meus-simulados/${simuladoId}/resultado?event=${attempt.event_id}`
      : attempt.student_jornada_simulado_id
        ? `/meus-simulados/${simuladoId}/resultado?jornada=${attempt.student_jornada_simulado_id}`
        : `/meus-simulados/${simuladoId}/resultado`;

    const notificationType =
      context.reasonCode === "question_annulled" ? "question_annulled_result_changed"
      : context.reasonCode === "question_reactivated" ? "question_reactivated_result_changed"
      : "answer_key_changed_result_changed";
    const notificationTitle =
      context.reasonCode === "question_annulled" ? "Uma questão do seu Simulado foi anulada"
      : context.reasonCode === "question_reactivated" ? "Uma questão do seu Simulado foi desanulada"
      : "O gabarito de uma questão foi corrigido";
    const notificationBody =
      context.reasonCode === "question_annulled" ? "Uma questão deste Simulado foi anulada. Seu resultado foi atualizado."
      : context.reasonCode === "question_reactivated" ? "Uma questão deste Simulado foi desanulada. Seu resultado foi recalculado."
      : "O gabarito de uma questão deste Simulado foi corrigido. Seu resultado foi atualizado.";

    const { error: notificationError } = await supabase.from("student_notifications").upsert({
      student_id: attempt.student_id,
      type: notificationType,
      title: notificationTitle,
      body: notificationBody,
      action_url: actionUrl,
      reference_type: "simulado_attempt",
      reference_id: attempt.id,
      // revision_id é o que distingue um RETRY da mesma revisão (mesmo
      // valor → upsert colide → 1 linha só) de uma revisão FUTURA distinta
      // sobre a mesma tentativa, mesmo com o mesmo `type` (ex.: anular a
      // questão X e, depois, anular a questão Y no mesmo Simulado — dois
      // eventos reais, duas notificações; ver context.revisionId).
      revision_id: context.revisionId,
      metadata: {
        simulado_id: simuladoId,
        previous_score: Number(oldResult.display_score),
        new_score: fresh.displayScore,
        previous_percentage: Number(oldResult.display_percentage),
        new_percentage: fresh.displayPercentage,
      },
      read_at: null,
      dismissed_at: null,
      created_at: nowIso,
    }, { onConflict: "student_id,type,reference_id,revision_id" });
    if (notificationError) throw new Error(notificationError.message);
    notificationsCreated += 1;
  }

  await logActivity({
    actorType: context.actorType,
    actorId: context.actorId || undefined,
    actorName: context.actorName || undefined,
    action:
      context.reasonCode === "question_annulled" ? "simulado_question_annulled"
      : context.reasonCode === "question_reactivated" ? "simulado_question_reactivated"
      : "simulado_answer_key_changed",
    entityType: "simulado",
    entityId: simuladoId,
    metadata: {
      simulado_id: simuladoId,
      reason: context.reasonText,
      attempts_reprocessed: attempts.length,
      results_changed: resultsChanged,
      notifications_created: notificationsCreated,
      topcoins_resynced: topcoinsResynced,
    },
  });

  return { attemptsReprocessed: attempts.length, resultsChanged, notificationsCreated, topcoinsResynced };
}

type PendingRelationRow = {
  id: string;
  simulado_id: string;
  status: string;
  status_revision_id: string | null;
  annulment_reason: string | null;
  pending_reconciliation_at: string;
};

/**
 * Retoma a reconciliação de todas as transições de simulado_questions.status
 * que ficaram pendentes (`pending_reconciliation_at is not null`) para um
 * Simulado — inclusive após uma queda de processo/conexão no meio de
 * reprocessSimulado(). Idempotente e seguro para reexecução: reaproveita o
 * MESMO status_revision_id já persistido (nunca gera um novo aqui), e só
 * limpa o marcador com um compare-and-swap pelo valor exato lido — se outra
 * execução concorrente já reivindicou aquela revisão, ou se uma revisão
 * nova nasceu no meio do caminho, esta chamada perde a corrida com
 * segurança e não reprocessa/limpa por cima dela (ver seção 20 do pedido).
 *
 * Reexecutar tudo (todas as tentativas elegíveis do Simulado) é aceitável e
 * deliberado: o motor é determinístico e idempotente, então não há
 * necessidade de rastrear item a item quais tentativas já foram
 * recalculadas — só se a revisão como um todo já terminou ou não.
 */
export async function processPendingReconciliationForSimulado(
  supabase: SupabaseClient,
  simuladoId: string,
): Promise<{ reconciled: number; stillPending: number }> {
  const { data: pendingRows, error } = await supabase
    .from("simulado_questions")
    .select("id, simulado_id, status, status_revision_id, annulment_reason, pending_reconciliation_at")
    .eq("simulado_id", simuladoId)
    .not("pending_reconciliation_at", "is", null);
  if (error) throw new Error(error.message);

  const pending = (pendingRows || []) as PendingRelationRow[];
  if (pending.length === 0) return { reconciled: 0, stillPending: 0 };

  let reconciled = 0;
  let stillPending = 0;

  for (const relation of pending) {
    // Reivindica esta reconciliação por compare-and-swap pelo valor EXATO
    // de pending_reconciliation_at lido acima (não só "não nulo") — a mesma
    // ideia do CAS de status, aplicada ao marcador de pendência: só uma
    // execução concorrente (duas chamadas de retry simultâneas, ou um
    // retry correndo junto com o self-heal automático de uma nova ação)
    // consegue mudar o valor; a outra, ao reavaliar o WHERE contra o valor
    // já commitado, não encontra a linha e desiste sem reprocessar de novo.
    const claimToken = new Date().toISOString();
    const { data: claimed, error: claimError } = await supabase
      .from("simulado_questions")
      .update({ pending_reconciliation_at: claimToken })
      .eq("id", relation.id)
      .eq("status_revision_id", relation.status_revision_id)
      .eq("pending_reconciliation_at", relation.pending_reconciliation_at)
      .select("id")
      .maybeSingle();
    if (claimError) throw new Error(claimError.message);
    if (!claimed) {
      stillPending += 1;
      continue;
    }

    // Dado legado sem revisão associada não deveria ocorrer sob o gate
    // atual (toda transição gera status_revision_id), mas se ocorrer, gera
    // uma revisão nova só para conseguir identificar/agrupar esta
    // reconciliação — nunca deixa a revisão vazia.
    const revisionId = relation.status_revision_id || randomUUID();
    const reasonCode: ReprocessReasonCode = relation.status === "annulled" ? "question_annulled" : "question_reactivated";
    const reasonText =
      relation.annulment_reason ||
      (relation.status === "annulled" ? "Retomada de reconciliação pendente (anulação)." : "Retomada de reconciliação pendente (desanulação).");

    try {
      await reprocessSimulado(supabase, simuladoId, {
        actorId: null,
        actorName: null,
        actorType: "admin",
        reasonCode,
        reasonText,
        revisionId,
      });
    } catch {
      // reprocessSimulado falhou de novo: o marcador continua preenchido
      // (com o claimToken desta tentativa) — ainda identificável e
      // retomável na próxima chamada, sem perder a revisão original.
      stillPending += 1;
      continue;
    }

    // Sucesso integral desta revisão: limpa o marcador, ainda por CAS pelo
    // claimToken desta execução (não pelo valor original) — garante que só
    // esta execução, que de fato concluiu o reprocessamento, apaga a
    // pendência; nunca uma revisão mais nova que tenha nascido no meio.
    const { error: clearError } = await supabase
      .from("simulado_questions")
      .update({ pending_reconciliation_at: null })
      .eq("id", relation.id)
      .eq("status_revision_id", relation.status_revision_id)
      .eq("pending_reconciliation_at", claimToken);
    if (clearError) throw new Error(clearError.message);
    reconciled += 1;
  }

  return { reconciled, stillPending };
}

/**
 * Resumo de reconciliação pendente — o que a auditoria/UI/endpoint GET
 * precisam para responder "existe pendência? quantas? quais questões? desde
 * quando? qual revisão?" com um único SELECT, sem depender de memória, log
 * ou o Admin lembrar de agir.
 */
export async function getPendingReconciliationSummary(
  supabase: SupabaseClient,
  simuladoId?: string,
): Promise<{
  pendingCount: number;
  oldestPendingAt: string | null;
  relations: { id: string; simuladoId: string; questionId: string; status: string; statusRevisionId: string | null; pendingSince: string }[];
}> {
  let query = supabase
    .from("simulado_questions")
    .select("id, simulado_id, question_id, status, status_revision_id, pending_reconciliation_at")
    .not("pending_reconciliation_at", "is", null);
  if (simuladoId) query = query.eq("simulado_id", simuladoId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data || []) as { id: string; simulado_id: string; question_id: string; status: string; status_revision_id: string | null; pending_reconciliation_at: string }[];
  const relations = rows.map((row) => ({
    id: row.id,
    simuladoId: row.simulado_id,
    questionId: row.question_id,
    status: row.status,
    statusRevisionId: row.status_revision_id,
    pendingSince: row.pending_reconciliation_at,
  }));
  const oldestPendingAt = relations.reduce<string | null>((oldest, r) => (!oldest || r.pendingSince < oldest ? r.pendingSince : oldest), null);

  return { pendingCount: relations.length, oldestPendingAt, relations };
}

/**
 * Reprocessa a revisão VIGENTE de um vínculo (`simulado_questions`) sob
 * demanda — para o caso raro em que `pending_reconciliation_at` já está
 * `null` (a revisão "terminou"), mas há motivo concreto para suspeitar que
 * os dados produzidos por aquela execução estavam incorretos (ex.: um
 * incidente de carregamento incompleto já corrigido no código). Não é o
 * caminho normal de recuperação — esse é `processPendingReconciliationForSimulado`,
 * para quando a pendência ainda está marcada. Este aqui existe
 * especificamente para reconciliar uma revisão que já se marcou como
 * concluída, mas com dado errado.
 *
 * Nunca gera uma revisão nova, nunca muda `status`: só reexecuta
 * `reprocessSimulado()` reaproveitando o `status_revision_id` informado —
 * a mesma notificação/changelog/TopCoin idempotentes de sempre, porque a
 * chave de dedupe é a revisão, não a execução.
 *
 * Segurança: `expectedRevisionId` precisa bater EXATAMENTE com
 * `simulado_questions.status_revision_id` vigente no banco no momento da
 * chamada — se uma transição nova já aconteceu depois (nova revisão), a
 * chamada é rejeitada em vez de reprocessar por engano uma revisão que já
 * não é mais a atual.
 */
export async function reconcileCurrentRevision(
  supabase: SupabaseClient,
  params: {
    simuladoId: string;
    simuladoQuestionId: string;
    expectedRevisionId: string;
    actorId: string;
    actorName: string | null;
    reasonText?: string;
  },
): Promise<
  | { ok: true; simuladoId: string; attemptsReprocessed: number; resultsChanged: number; notificationsCreated: number }
  | { ok: false; message: string }
> {
  const { data: relation, error } = await supabase
    .from("simulado_questions")
    .select("id, simulado_id, status, status_revision_id")
    .eq("id", params.simuladoQuestionId)
    .maybeSingle();
  if (error) return { ok: false, message: error.message };
  if (!relation) return { ok: false, message: "Questão não encontrada." };
  if (relation.simulado_id !== params.simuladoId) {
    return { ok: false, message: "Esta questão não pertence ao Simulado informado." };
  }
  if (relation.status_revision_id !== params.expectedRevisionId) {
    return {
      ok: false,
      message: `A revisão informada (${params.expectedRevisionId}) não é mais a vigente para este vínculo (atual: ${relation.status_revision_id || "nenhuma"}). Uma transição nova já aconteceu — recarregue o estado atual antes de reprocessar. Reprocessar uma revisão superada por engano é bloqueado de propósito.`,
    };
  }

  const reasonCode: ReprocessReasonCode = relation.status === "annulled" ? "question_annulled" : "question_reactivated";
  const reasonText = params.reasonText || "Reprocessamento manual da revisão vigente (correção de incidente de carregamento incompleto de respostas).";

  const summary = await reprocessSimulado(supabase, relation.simulado_id, {
    actorId: params.actorId,
    actorName: params.actorName,
    actorType: "admin",
    reasonCode,
    reasonText,
    revisionId: params.expectedRevisionId,
  });

  return { ok: true, simuladoId: relation.simulado_id, ...summary };
}

/**
 * Anula ou desanula uma questão dentro de UM Simulado específico
 * (simulado_questions), depois reprocessa esse Simulado. Nunca toca em
 * questions.status (Banco de Questões) nem em outro Simulado que também
 * referencie a mesma question_id — anulação é sempre por vínculo, nunca
 * global.
 *
 * Garantia de recuperação de falha parcial: a transição de status e a
 * marcação de pendência (`pending_reconciliation_at`) são gravadas no MESMO
 * UPDATE que já faz o compare-and-swap do status — nunca duas escritas
 * separadas. Se `reprocessSimulado` falhar (queda de conexão/processo) no
 * meio do reprocessamento, o status já mudou mas a pendência fica
 * detectável por SELECT (`getPendingReconciliationSummary`) e retomável
 * (`processPendingReconciliationForSimulado`, chamado automaticamente aqui
 * mesmo antes de qualquer NOVA transição — ver seção 18/19 do pedido: uma
 * revisão pendente é sempre resolvida antes de uma revisão contraditória
 * ser aceita, nunca empilhada).
 */
export async function setSimuladoQuestionAnnulment(
  supabase: SupabaseClient,
  params: {
    simuladoQuestionId: string;
    targetStatus: "active" | "annulled";
    reason: string | null;
    actorId: string;
    actorName: string | null;
    actorType: "admin" | "professor";
  },
): Promise<
  | { ok: true; pendingReconciliation: false; simuladoId: string; attemptsReprocessed: number; resultsChanged: number; notificationsCreated: number }
  | { ok: true; pendingReconciliation: true; simuladoId: string }
  | { ok: false; message: string }
> {
  const { data: relation, error: relationError } = await supabase
    .from("simulado_questions")
    .select("id, simulado_id, status, pending_reconciliation_at")
    .eq("id", params.simuladoQuestionId)
    .maybeSingle();
  if (relationError) return { ok: false, message: relationError.message };
  if (!relation) return { ok: false, message: "Questão não encontrada neste Simulado." };

  if (relation.pending_reconciliation_at) {
    // Recovery automático: qualquer nova ação relevante sobre esta questão
    // primeiro tenta concluir a reconciliação pendente de uma transição
    // anterior — nunca aceita uma revisão nova em cima de uma antiga ainda
    // inconclusa.
    try {
      await processPendingReconciliationForSimulado(supabase, relation.simulado_id);
    } catch {
      // Segue para a releitura abaixo — se continuar pendente, bloqueia.
    }
    const { data: recheck } = await supabase
      .from("simulado_questions")
      .select("pending_reconciliation_at")
      .eq("id", params.simuladoQuestionId)
      .maybeSingle();
    if (recheck?.pending_reconciliation_at) {
      return {
        ok: false,
        message:
          "Esta questão tem uma reconciliação pendente de uma alteração anterior que não foi concluída automaticamente agora. Tente novamente em instantes, ou peça para um Admin retomar em /api/admin/simulados/[id]/reconciliation.",
      };
    }
  }

  if (relation.status === params.targetStatus) {
    return { ok: false, message: params.targetStatus === "annulled" ? "Esta questão já está anulada." : "Esta questão já está ativa." };
  }

  const nowIso = new Date().toISOString();
  // Gerado uma única vez, no momento exato desta transição — nunca a cada
  // tentativa de reprocessamento — e persistido na própria linha para que
  // um retry (reprocessSimulado chamado de novo para esta MESMA transição,
  // sem que ela tenha mudado de novo) releia o mesmo valor em vez de gerar
  // um novo (o que duplicaria a notificação do aluno).
  const revisionId = randomUUID();
  const updatePayload =
    params.targetStatus === "annulled"
      ? { status: "annulled", annulled_at: nowIso, annulled_by: params.actorId, annulment_reason: params.reason || null, status_revision_id: revisionId, pending_reconciliation_at: nowIso }
      : { status: "active", status_revision_id: revisionId, pending_reconciliation_at: nowIso };

  // Compare-and-swap real: a condição .eq("status", relation.status) faz o
  // Postgres serializar duas requisições concorrentes nativamente — a
  // primeira a commitar "vence"; a segunda, ao reavaliar o WHERE contra o
  // valor já commitado, não encontra a linha e não atualiza nada. .select()
  // é o que permite distinguir "0 linhas afetadas" (corrida perdida) de
  // sucesso — sem isso, a requisição perdedora acreditaria erroneamente
  // que aplicou a transição e reprocessaria o Simulado de novo, sem
  // necessidade (redundante, mas não incorreto: o motor é idempotente).
  const { data: updated, error: updateError } = await supabase
    .from("simulado_questions")
    .update(updatePayload)
    .eq("id", params.simuladoQuestionId)
    .eq("status", relation.status)
    .select("id")
    .maybeSingle();
  if (updateError) return { ok: false, message: updateError.message };
  if (!updated) {
    return {
      ok: false,
      message: "Esta questão já foi alterada por outra ação simultânea. Recarregue a página para ver o estado atual antes de tentar de novo.",
    };
  }

  const reasonCode: ReprocessReasonCode = params.targetStatus === "annulled" ? "question_annulled" : "question_reactivated";
  const reasonText =
    params.reason ||
    (params.targetStatus === "annulled" ? "Questão anulada no Simulado." : "Questão reativada (desanulada) no Simulado.");

  let summary: { attemptsReprocessed: number; resultsChanged: number; notificationsCreated: number; topcoinsResynced: number };
  try {
    summary = await reprocessSimulado(supabase, relation.simulado_id, {
      actorId: params.actorId,
      actorName: params.actorName,
      actorType: params.actorType,
      reasonCode,
      reasonText,
      revisionId,
    });
  } catch {
    // Falha parcial/total do reprocessamento: o status já mudou (CAS
    // confirmado acima) mas pending_reconciliation_at continua preenchido
    // com este mesmo revisionId — detectável por getPendingReconciliationSummary
    // e retomável por processPendingReconciliationForSimulado (chamado
    // automaticamente na próxima ação relevante sobre esta questão, ou
    // manualmente via POST /api/admin/simulados/[id]/reconciliation).
    return { ok: true, pendingReconciliation: true, simuladoId: relation.simulado_id };
  }

  // Sucesso integral: limpa a pendência com CAS pela MESMA revisão — se por
  // algum motivo ela já tiver sido limpa por uma execução concorrente
  // (ex.: o self-heal automático de outra chamada correu em paralelo e
  // também terminou com sucesso), este UPDATE simplesmente não encontra
  // linha e é ignorado, sem erro.
  const { error: clearError } = await supabase
    .from("simulado_questions")
    .update({ pending_reconciliation_at: null })
    .eq("id", params.simuladoQuestionId)
    .eq("status_revision_id", revisionId);
  if (clearError) throw new Error(clearError.message);

  return { ok: true, pendingReconciliation: false, simuladoId: relation.simulado_id, ...summary };
}

/**
 * Propaga uma mudança de gabarito (questions.correct_alternative_label) a
 * TODOS os Simulados que usam essa question_id, reprocessando cada um.
 * Vínculos annulled permanecem annulled — o novo gabarito só volta a valer
 * se a questão for desanulada depois.
 */
export async function reprocessAfterAnswerKeyChange(
  supabase: SupabaseClient,
  params: {
    questionId: string;
    actorId: string | null;
    actorName: string | null;
    reasonText: string;
    // Identidade estável desta mudança de gabarito — gerada pelo chamador
    // (app/api/admin/questions/[id]/answer/route.ts ou .../[id]/route.ts) no
    // mesmo momento em que grava questions.answer_key_revision_id, só quando
    // o gabarito de fato mudou. Compartilhada por todos os Simulados afetados
    // por ESTA mudança (é a mesma revisão, propagada); um retry desta mesma
    // chamada (gabarito não muda de novo no meio) deve reusar o mesmo valor
    // — nunca gerar um novo aqui dentro.
    revisionId: string;
  },
): Promise<{ simuladoIds: string[]; attemptsReprocessed: number; resultsChanged: number; notificationsCreated: number }> {
  const { data: relations, error } = await supabase
    .from("simulado_questions")
    .select("simulado_id")
    .eq("question_id", params.questionId);
  if (error) throw new Error(error.message);

  const simuladoIds = Array.from(new Set((relations || []).map((row: { simulado_id: string }) => row.simulado_id)));
  let attemptsReprocessed = 0;
  let resultsChanged = 0;
  let notificationsCreated = 0;
  for (const simuladoId of simuladoIds) {
    const summary = await reprocessSimulado(supabase, simuladoId, {
      actorId: params.actorId,
      actorName: params.actorName,
      actorType: "admin",
      reasonCode: "answer_key_changed",
      reasonText: params.reasonText,
      revisionId: params.revisionId,
    });
    attemptsReprocessed += summary.attemptsReprocessed;
    resultsChanged += summary.resultsChanged;
    notificationsCreated += summary.notificationsCreated;
  }
  return { simuladoIds, attemptsReprocessed, resultsChanged, notificationsCreated };
}
