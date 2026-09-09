import { isActiveEventAttempt, selectEventQuestionAttempts } from "@/lib/eventQuestionStats";
import { NextResponse } from "next/server";
import { requireEventManager } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { closeSimuladoEvent, effectiveEventStatus, releasePendingEventResults, reopenSimuladoEvent, updateSimuladoEventResultPolicy } from "@/lib/server/simuladoEvents";
import { systemImageUrl } from "@/lib/system-images";
import { buildDifficultyTopics } from "@/lib/topicDifficulty";
import { buildEventInsights, type QuestionDifficultyInput } from "@/lib/eventInsights";
import { fetchAllPages } from "@/lib/server/supabasePagination";

type ParticipantRow = { id: string; student_id: string; joined_at: string; representative_attempt_id: string | null; result_released_at: string | null; students?: { name?: string; email?: string } | { name?: string; email?: string }[] };
type AttemptRow = { event_participant_id: string | null; counts_toward_limit: boolean; id: string; student_id: string; status: string; disqualification_reason: string | null; started_at: string | null; submitted_at: string | null; time_spent_seconds: number | null; attempt_number: number; owl_help_used_count: number | null; focus_violation_count: number | null; last_activity_at: string | null };
type AnswerRow = { attempt_id: string; simulado_question_id: string; selected_alternative_id: string | null; is_correct: boolean | null; response_time_seconds: number | null };
type ResultRow = { attempt_id: string; display_score: number | null; display_percentage: number | null; percentage: number | null; correct_count: number; wrong_count: number; blank_count: number; total_questions: number; time_spent_seconds: number | null };
type AlternativeRow = { id: string; label: string | null; text: string | null; image_url: string | null; is_correct: boolean; order_number: number | null };
type QuestionRow = {
  id: string;
  order_number: number;
  status: string;
  questions: { id: string; code: string | null; statement: string | null; image_url: string | null; year: number | null; question_type: string | null; evaluated_topics: string[] | null; question_alternatives: AlternativeRow[] } | null;
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const manager = await requireEventManager(request, id);
  if (manager instanceof NextResponse) return manager;
  const supabase = createSupabaseAdminClient();
  const { data: event, error: eventError } = await supabase.from("simulado_events").select("*,professor_banner:professor_banner_image_id(storage_path),simulados:simulado_id(id,title)").eq("id", id).maybeSingle();
  if (eventError) return NextResponse.json({ ok: false, message: "Não foi possível carregar o Evento." }, { status: 500 });
  if (!event) return NextResponse.json({ ok: false, message: "Evento não encontrado." }, { status: 404 });

  const [{ data: participantData, error: participantsError }, { data: attemptData, error: attemptsError }, { data: questionData, error: questionsError }] = await Promise.all([
    supabase.from("simulado_event_participants").select("id,student_id,joined_at,representative_attempt_id,result_released_at,students:student_id(name,email)").eq("event_id", id),
    supabase.from("simulado_attempts").select("id,student_id,status,disqualification_reason,started_at,submitted_at,time_spent_seconds,attempt_number,owl_help_used_count,focus_violation_count,last_activity_at,event_participant_id,counts_toward_limit").eq("event_id", id).eq("is_preview", false),
    event.simulado_id
      ? supabase.from("simulado_questions").select("id,order_number,status,questions:question_id(id,code,statement,image_url,year,question_type,evaluated_topics,question_alternatives(id,label,text,image_url,is_correct,order_number))").eq("simulado_id", event.simulado_id).order("order_number")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (participantsError || attemptsError || questionsError) return NextResponse.json({ ok: false, message: "Não foi possível carregar a dashboard do Evento." }, { status: 500 });

  const participants = (participantData || []) as unknown as ParticipantRow[];
  const attempts = (attemptData || []) as AttemptRow[];
  const questions = (questionData || []) as unknown as QuestionRow[];
  const representativeAttemptIds = participants.map((participant) => participant.representative_attempt_id).filter((attemptId): attemptId is string => Boolean(attemptId));
  const activityNow = Date.now();
  const questionAttempts = selectEventQuestionAttempts(participants, attempts, activityNow);
  const questionAttemptIds = new Set(questionAttempts.map((attempt) => attempt.id));
  const answerAttemptIds = [...new Set([...representativeAttemptIds, ...questionAttemptIds])].sort();
  let answers: AnswerRow[] = [];
  let results: ResultRow[] = [];
  const onlineCutoff = new Date(Date.now() - 90_000).toISOString();
  const { data: onlineSessions } = participants.length
    ? await supabase.from("user_sessions").select("actor_id").eq("actor_type", "student").eq("is_active", true).gte("last_seen_at", onlineCutoff).in("actor_id", participants.map((participant) => participant.student_id))
    : { data: [] };
  const onlineStudentIds = new Set((onlineSessions || []).map((session) => session.actor_id));
  if (answerAttemptIds.length > 0) {
    // Paginação completa e determinística — sem isso, o PostgREST corta
    // silenciosamente em max_rows (tipicamente 1000) sem erro. Um Evento
    // com muitas tentativas oficiais × questões ultrapassa isso facilmente
    // (incidente real documentado em docs/Sprint-resultados.md, "Incidente
    // de truncamento silencioso" — a mesma classe de bug, comprovada nesta
    // própria rota em auditoria: 1587 respostas reais, só 1000 retornadas
    // sem paginação). `.order("id")` garante que nenhuma linha seja pulada
    // nem duplicada entre páginas; fetchAllPages() confere o total
    // acumulado contra o `count` exato e lança erro em vez de seguir com
    // dado incompleto — uma ausência de linha nunca deve virar "aluno não
    // respondeu" por corte silencioso.
    try {
      answers = await fetchAllPages<AnswerRow>(
        (from, to) => supabase.from("simulado_answers").select("attempt_id,simulado_question_id,selected_alternative_id,is_correct,response_time_seconds", { count: "exact" }).in("attempt_id", answerAttemptIds).order("id", { ascending: true }).range(from, to),
        "Não foi possível carregar todas as respostas do Evento com segurança.",
      );
      results = await fetchAllPages<ResultRow>(
        (from, to) => supabase.from("simulado_results").select("attempt_id,display_score,display_percentage,percentage,correct_count,wrong_count,blank_count,total_questions,time_spent_seconds", { count: "exact" }).in("attempt_id", representativeAttemptIds).order("id", { ascending: true }).range(from, to),
        "Não foi possível carregar todos os resultados do Evento com segurança.",
      );
    } catch {
      return NextResponse.json({ ok: false, message: "Não foi possível carregar as estatísticas do Evento." }, { status: 500 });
    }
  }

  const attemptsById = new Map(attempts.map((attempt) => [attempt.id, attempt]));
  const resultsByAttemptId = new Map(results.map((result) => [result.attempt_id, result]));
  // Reaproveita o mesmo array `answers` (já buscado acima, sem query nova)
  // para montar, por tentativa oficial, os "Tópicos de maior dificuldade"
  // exibidos no modal "Ver" do Ranking — mesma lógica de
  // lib/topicDifficulty.ts (extraída da tela de resultados do aluno, ver
  // app/meus-simulados/[id]/resultado/page-client.tsx): questão anulada
  // nunca conta como erro; status blank/correct/wrong decidido do mesmo
  // jeito; tópicos ordenados por incidência de erro.
  const answersByAttemptId = new Map<string, Map<string, AnswerRow>>();
  for (const answer of answers) {
    if (!answersByAttemptId.has(answer.attempt_id)) answersByAttemptId.set(answer.attempt_id, new Map());
    answersByAttemptId.get(answer.attempt_id)!.set(answer.simulado_question_id, answer);
  }
  function difficultyTopicsForAttempt(attemptId: string): string[] {
    const attemptAnswers = answersByAttemptId.get(attemptId);
    const entries = questions
      .filter((relation) => relation.status !== "annulled")
      .map((relation) => {
        const answer = attemptAnswers?.get(relation.id);
        const status: "correct" | "wrong" | "blank" = !answer?.selected_alternative_id ? "blank" : answer.is_correct ? "correct" : "wrong";
        const topics = relation.questions?.evaluated_topics?.length ? relation.questions.evaluated_topics : ["Tópico não informado"];
        return { topics, status };
      });
    return buildDifficultyTopics(entries).map((topic) => topic.label);
  }
  const eventEffectiveStatus = effectiveEventStatus(event);
  const completedOperationalIds = new Set(questionAttempts.filter((attempt) => attempt.status === "completed").map((attempt) => attempt.id));
  const operationalAnswers = answers.filter((answer) => questionAttemptIds.has(answer.attempt_id));
  const questionStats = questions.map((relation) => {
    const rows = operationalAnswers.filter((answer) => answer.simulado_question_id === relation.id);
    const answeredRows = rows.filter((answer) => Boolean(answer.selected_alternative_id));
    const answeredAttemptIds = new Set(answeredRows.map((answer) => answer.attempt_id));
    const blank = [...completedOperationalIds].filter((attemptId) => !answeredAttemptIds.has(attemptId)).length;
    const alternativeCounts = new Map<string, number>();
    for (const answer of answeredRows) if (answer.selected_alternative_id) alternativeCounts.set(answer.selected_alternative_id, (alternativeCounts.get(answer.selected_alternative_id) || 0) + 1);
    const answered = answeredRows.length;
    const annulled = relation.status === "annulled";
    const correct = annulled ? 0 : answeredRows.filter((answer) => answer.is_correct === true).length;
    const wrong = annulled ? 0 : answeredRows.filter((answer) => answer.is_correct === false).length;
    const averageTimeSeconds = answeredRows.length ? Math.round(answeredRows.reduce((sum, answer) => sum + Number(answer.response_time_seconds || 0), 0) / answeredRows.length) : 0;
    return {
      ...relation,
      answered,
      total_considered: answered + blank,
      correct,
      wrong,
      blank,
      accuracy_percent: annulled || answered === 0 ? null : Math.round((correct / answered) * 10_000) / 100,
      error_percent: annulled || answered === 0 ? null : Math.round((wrong / answered) * 10_000) / 100,
      average_time_seconds: averageTimeSeconds,
      alternative_counts: Object.fromEntries(alternativeCounts),
    };
  });
  // Guia "Insights" (painel do Professor) — análise pedagógica CONSOLIDADA,
  // base separada de `questionStats` (aba Questões/revisão, ao vivo, acima).
  // Regra oficial: só entra tentativa que seja simultaneamente (1)
  // representative_attempt_id do participante e (2) status === "completed"
  // — nunca in_progress, disqualified, expired ou abandoned.
  //
  // Defesa em profundidade: mesmo que `consolidateEventRepresentativeAttempt`
  // (lib/server/simuladoEvents.ts) só grave representative_attempt_id para
  // tentativas completed, esta rota NÃO confia cegamente nisso — revalida o
  // status aqui mesmo, direto do `attemptsById` já carregado (nenhuma
  // consulta nova). Isso protege contra dado histórico/legado inconsistente
  // (auditoria real encontrou 3 in_progress + 9 disqualified como
  // representative_attempt_id de participantes neste ambiente — sem essa
  // revalidação, as respostas dessas tentativas entrariam nos Insights).
  const completedRepresentativeAttemptIds = new Set(
    representativeAttemptIds.filter((attemptId) => attemptsById.get(attemptId)?.status === "completed"),
  );
  const completedAnswers = answers.filter((answer) => completedRepresentativeAttemptIds.has(answer.attempt_id));
  const completedQuestionStats = questions.map((relation) => {
    const rows = completedAnswers.filter((answer) => answer.simulado_question_id === relation.id);
    const answeredRows = rows.filter((answer) => Boolean(answer.selected_alternative_id));
    const answeredAttemptIds = new Set(answeredRows.map((answer) => answer.attempt_id));
    const blank = [...completedRepresentativeAttemptIds].filter((attemptId) => !answeredAttemptIds.has(attemptId)).length;
    const annulled = relation.status === "annulled";
    const correct = annulled ? 0 : answeredRows.filter((answer) => answer.is_correct === true).length;
    const wrong = annulled ? 0 : answeredRows.filter((answer) => answer.is_correct === false).length;
    return { id: relation.id, order_number: relation.order_number, code: relation.questions?.code ?? null, evaluated_topics: relation.questions?.evaluated_topics || [], annulled, correct, wrong, blank };
  });
  // Independe de `result_released_at`: o Professor já tem acesso operacional
  // a essa dashboard inteira, liberar resultado ao aluno é uma decisão
  // separada que não bloqueia analytics do Professor.
  const insightsInput: QuestionDifficultyInput[] = completedQuestionStats.map((stat) => ({
    simulado_question_id: stat.id,
    order_number: stat.order_number,
    annulled: stat.annulled,
    topics: stat.evaluated_topics,
    correct: stat.correct,
    wrong: stat.wrong,
    blank: stat.blank,
  }));
  const questionCodeByRelationId = new Map(completedQuestionStats.map((stat) => [stat.id, { code: stat.code }]));
  const insights = buildEventInsights(insightsInput, questionCodeByRelationId);
  const participantRows = participants.map((participant) => {
    const student = Array.isArray(participant.students) ? participant.students[0] : participant.students;
    const participantAttempts = attempts.filter((attempt) => attempt.student_id === participant.student_id);
    const representativeAttempt = participant.representative_attempt_id ? attemptsById.get(participant.representative_attempt_id) || null : null;
    const activeAttempt = participantAttempts.find((attempt) => attempt.status === "in_progress") || null;
    // representative_attempt_id só existe quando há uma conclusão válida
    // (completed + counts_toward_limit) — ver consolidateEventRepresentativeAttempt.
    // Quando não há representativa nem tentativa em andamento (ex.: todas as
    // tentativas terminaram desclassificadas/expiradas/abandonadas), a mais
    // recente é usada só para exibir a situação real; isso nunca grava nem
    // altera representative_attempt_id, reservado à primeira conclusão válida.
    const latestNonRepresentativeAttempt = !representativeAttempt && !activeAttempt
      ? [...participantAttempts].sort((a, b) => new Date(b.submitted_at || b.started_at || 0).getTime() - new Date(a.submitted_at || a.started_at || 0).getTime())[0] || null
      : null;
    const displayedAttempt = activeAttempt || representativeAttempt || latestNonRepresentativeAttempt;
    const result = representativeAttempt ? resultsByAttemptId.get(representativeAttempt.id) || null : null;
    let status: "not_started" | "not_completed" | "in_progress" | "completed" | "disqualified" | "admin_terminated" | "expired" = "not_started";
    if (displayedAttempt?.status === "in_progress") status = "in_progress";
    else if (displayedAttempt?.status === "completed") status = "completed";
    // Encerramento administrativo excepcional (ver PATCH .../events/[id],
    // action "terminate_active_attempts") nunca deve aparecer como
    // "Desclassificado" — motivo distinto para não sugerir violação de regras.
    else if (displayedAttempt?.status === "disqualified" && displayedAttempt.disqualification_reason === "admin_terminated") status = "admin_terminated";
    else if (displayedAttempt?.status === "disqualified") status = "disqualified";
    else if (displayedAttempt?.status === "expired") status = "expired";
    else if (["closed", "archived"].includes(eventEffectiveStatus)) status = "not_completed";
    const resultStatus = result ? (participant.result_released_at ? "available" : "pending") : "not_available";
    return {
      id: participant.id,
      name: student?.name || "Aluno",
      email: student?.email || "",
      joined_at: participant.joined_at,
      is_online: onlineStudentIds.has(participant.student_id),
      status,
      attempt_count: participantAttempts.length,
      representative_attempt_id: participant.representative_attempt_id,
      representative_attempt_number: representativeAttempt?.attempt_number || null,
      attempt: displayedAttempt ? {
        id: displayedAttempt.id,
        status: displayedAttempt.status,
        attempt_number: displayedAttempt.attempt_number,
        started_at: displayedAttempt.started_at,
        submitted_at: displayedAttempt.submitted_at,
        time_spent_seconds: displayedAttempt.time_spent_seconds,
        is_representative: displayedAttempt.id === participant.representative_attempt_id,
      } : null,
      result: result ? {
        display_score: result.display_score,
        percentage: result.display_percentage ?? result.percentage,
        correct_count: result.correct_count,
        wrong_count: result.wrong_count,
        blank_count: result.blank_count,
        total_questions: result.total_questions,
        time_spent_ms: representativeAttempt?.started_at && representativeAttempt.submitted_at
          ? Math.max(0, new Date(representativeAttempt.submitted_at).getTime() - new Date(representativeAttempt.started_at).getTime())
          : Math.max(0, Number(result.time_spent_seconds || 0) * 1000),
        owl_help_used_count: Number(representativeAttempt?.owl_help_used_count || 0),
        focus_violation_count: Number(representativeAttempt?.focus_violation_count || 0),
        // Defesa em profundidade: só calcula a partir da tentativa
        // representativa se ela realmente estiver completed — nunca
        // in_progress/disqualified, mesmo que representative_attempt_id
        // aponte para uma (dado legado inconsistente).
        difficulty_topics: representativeAttempt && representativeAttempt.status === "completed" ? difficultyTopicsForAttempt(representativeAttempt.id) : [],
      } : null,
      result_status: resultStatus,
      result_released_at: participant.result_released_at,
    };
  }).sort((left, right) => {
    const priority = { in_progress: 0, completed: 1, disqualified: 2, admin_terminated: 2, expired: 3, not_started: 4, not_completed: 5 };
    return priority[left.status] - priority[right.status] || left.name.localeCompare(right.name, "pt-BR");
  });
  // "Realizando" (Visão geral) — participantes com uma tentativa realmente
  // ativa agora, não qualquer in_progress esquecido no banco. Auditoria
  // real: `representativeAttemptIds` (usado até aqui só para essa métrica)
  // só deveria conter tentativas completed por invariante arquitetural —
  // um in_progress ali é sempre dado histórico/legado inconsistente (o
  // mesmo tipo de registro já tratado como defesa em profundidade nos
  // Insights), nunca um aluno realmente em prova. A métrica correta usa
  // `attempts` (já carregado, sem query nova) — TODAS as tentativas do
  // Evento, não só as representativas — filtradas por status in_progress E
  // `last_activity_at` dentro da janela abaixo, deduplicadas por aluno
  // (nunca duas tentativas do mesmo participante contam duas vezes; o
  // índice único parcial `unique_simulado_attempts_in_progress`
  // (simulado_id, student_id) já garante isso na prática).
  //
  // `last_activity_at` (simulado_attempts, not null, default now()) é
  // atualizado em toda interação real da própria tentativa — resposta
  // salva (.../answers), violação de foco/troca de aba (.../route.ts,
  // POST) e o evento comportamental de inatividade ≥60s (.../behavior) —
  // nunca por um heartbeat genérico de presença (esse é outro mecanismo,
  // `user_sessions`/`onlineStudentIds` acima, que alimenta "Online agora";
  // POST .../events/[id]/heartbeat a cada 30s NÃO toca last_activity_at).
  // Não existe heartbeat periódico dedicado à tentativa em si — por isso a
  // janela é deliberadamente generosa (10 minutos), maior que qualquer
  // intervalo típico entre respostas salvas (a cada questão) e bem acima
  // do gatilho de inatividade de 60s (que tem semântica diferente: sinaliza
  // "aluno parado" para fins comportamentais/anti-cheat, não "sessão
  // abandonada" — nunca reaproveitado aqui sem essa distinção). Suficiente
  // para não contar tentativas de dias atrás (o caso relatado) sem gerar
  // falso-negativo por um intervalo normal de leitura/reflexão entre
  // respostas. Retomar uma tentativa parada volta a contar assim que
  // qualquer interação real (ex.: a próxima resposta) atualizar
  // last_activity_at de novo — nenhum bloqueio de retomada.
  const activeAttemptParticipantIds = new Set(
    attempts
      .filter((attempt) => isActiveEventAttempt(attempt, activityNow))
      .map((attempt) => attempt.student_id),
  );
  const resultTotals = results.reduce((total, result) => ({
    correct: total.correct + Number(result.correct_count || 0),
    wrong: total.wrong + Number(result.wrong_count || 0),
    blank: total.blank + Number(result.blank_count || 0),
    questions: total.questions + Number(result.total_questions || 0),
    time: total.time + Number(result.time_spent_seconds || 0),
  }), { correct: 0, wrong: 0, blank: 0, questions: 0, time: 0 });
  const officialScores = results
    .map((result) => result.display_score)
    .filter((score): score is number => score !== null && Number.isFinite(score));

  return NextResponse.json({
    ok: true,
    message: "Dashboard carregada.",
    event: { ...event, professor_banner_url: systemImageUrl((event.professor_banner as unknown as { storage_path?: string } | null)?.storage_path), professor_banner_position_x: Number(event.professor_banner_position_x ?? 50), professor_banner_position_y: Number(event.professor_banner_position_y ?? 50), effective_status: eventEffectiveStatus },
    summary: {
      registered: participants.length,
      online: onlineStudentIds.size,
      not_started: participantRows.filter((participant) => participant.status === "not_started").length,
      taking: activeAttemptParticipantIds.size,
      completed: representativeAttemptIds.filter((attemptId) => attemptsById.get(attemptId)?.status === "completed").length,
      pending_results: participants.filter((participant) => participant.representative_attempt_id && !participant.result_released_at).length,
      accuracy_percent: resultTotals.questions ? Math.round((resultTotals.correct / resultTotals.questions) * 10_000) / 100 : null,
      error_percent: resultTotals.questions ? Math.round((resultTotals.wrong / resultTotals.questions) * 10_000) / 100 : null,
      blank_answers: resultTotals.blank,
      average_time_seconds: results.length ? Math.round(resultTotals.time / results.length) : 0,
      highest_score: officialScores.length ? Math.max(...officialScores) : null,
      lowest_score: officialScores.length ? Math.min(...officialScores) : null,
      average_score: officialScores.length ? officialScores.reduce((sum, score) => sum + score, 0) / officialScores.length : null,
    },
    participants: participantRows,
    questions: questionStats,
    insights,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const manager = await requireEventManager(request, id);
  if (manager instanceof NextResponse) return manager;
  const body = await request.json().catch(() => null) as { action?: unknown; result_policy?: unknown; ends_at?: unknown } | null;
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data: event } = await supabase.from("simulado_events").select("*").eq("id", id).maybeSingle();
  if (!event) return NextResponse.json({ ok: false, message: "Evento não encontrado." }, { status: 404 });
  if (body?.action === "start") {
    if (!event.simulado_id) return NextResponse.json({ ok: false, message: "Vincule um Simulado antes de iniciar o Evento." }, { status: 409 });
    if (new Date(event.ends_at) <= new Date() || event.status === "archived") return NextResponse.json({ ok: false, message: "Evento não pode ser iniciado." }, { status: 409 });
    await supabase.from("simulado_events").update({ status: "active", started_at: event.started_at || now }).eq("id", id);
    return NextResponse.json({ ok: true, message: "Evento iniciado." });
  }
  if (body?.action === "release_results") {
    if (event.status === "archived") return NextResponse.json({ ok: false, message: "Eventos arquivados são somente leitura." }, { status: 409 });
    const released = await releasePendingEventResults(supabase, id, request);
    return NextResponse.json({ ok: true, message: "Resultados liberados.", released_count: released.releasedCount });
  }
  if (body?.action === "set_result_policy") {
    if (event.status === "archived") return NextResponse.json({ ok: false, message: "Eventos arquivados são somente leitura." }, { status: 409 });
    if (body.result_policy !== "blocked" && body.result_policy !== "released") return NextResponse.json({ ok: false, message: "Política de resultados inválida." }, { status: 400 });
    const released = await updateSimuladoEventResultPolicy(supabase, id, body.result_policy, request);
    return NextResponse.json({ ok: true, message: body.result_policy === "released" ? "Liberação imediata ativada." : "Liberação manual ativada.", released_count: released.releasedCount });
  }
  if (body?.action === "close") {
    if (effectiveEventStatus(event) !== "active") return NextResponse.json({ ok: false, message: "Somente Eventos em andamento podem ser encerrados." }, { status: 409 });
    await closeSimuladoEvent(supabase, id);
    return NextResponse.json({ ok: true, message: "Evento encerrado. Tentativas em andamento foram preservadas." });
  }
  if (body?.action === "reopen") {
    if (effectiveEventStatus(event) !== "closed") return NextResponse.json({ ok: false, message: "Somente Eventos encerrados podem ser reabertos." }, { status: 409 });
    const result = await reopenSimuladoEvent(supabase, event, typeof body.ends_at === "string" ? body.ends_at : "");
    if (!result.ok) return NextResponse.json({ ok: false, message: result.message }, { status: 400 });
    return NextResponse.json({ ok: true, message: "Evento reaberto." });
  }
  return NextResponse.json({ ok: false, message: "Ação não permitida ao professor." }, { status: 403 });
}
