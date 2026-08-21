import { NextResponse } from "next/server";
import { requireEventManager } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { effectiveEventStatus, releasePendingEventResults } from "@/lib/server/simuladoEvents";

type ParticipantRow = { id: string; student_id: string; joined_at: string; representative_attempt_id: string | null; result_released_at: string | null; students?: { name?: string; email?: string } | { name?: string; email?: string }[] };
type AttemptRow = { id: string; student_id: string; status: string; started_at: string | null; submitted_at: string | null; time_spent_seconds: number | null; attempt_number: number };
type AnswerRow = { attempt_id: string; simulado_question_id: string; selected_alternative_id: string | null; is_correct: boolean | null; response_time_seconds: number | null };
type ResultRow = { attempt_id: string; display_score: number | null; display_percentage: number | null; percentage: number | null; correct_count: number; wrong_count: number; blank_count: number; total_questions: number; time_spent_seconds: number | null };
type AlternativeRow = { id: string; label: string | null; text: string | null; image_url: string | null; is_correct: boolean; order_number: number | null };
type QuestionRow = {
  id: string;
  order_number: number;
  status: string;
  questions: { id: string; code: string | null; statement: string | null; image_url: string | null; year: number | null; question_type: string | null; question_alternatives: AlternativeRow[] } | null;
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const manager = await requireEventManager(request, id);
  if (manager instanceof NextResponse) return manager;
  const supabase = createSupabaseAdminClient();
  const { data: event, error: eventError } = await supabase.from("simulado_events").select("*,simulados:simulado_id(id,title)").eq("id", id).maybeSingle();
  if (eventError) return NextResponse.json({ ok: false, message: "Não foi possível carregar o Evento." }, { status: 500 });
  if (!event) return NextResponse.json({ ok: false, message: "Evento não encontrado." }, { status: 404 });

  const [{ data: participantData, error: participantsError }, { data: attemptData, error: attemptsError }, { data: questionData, error: questionsError }] = await Promise.all([
    supabase.from("simulado_event_participants").select("id,student_id,joined_at,representative_attempt_id,result_released_at,students:student_id(name,email)").eq("event_id", id),
    supabase.from("simulado_attempts").select("id,student_id,status,started_at,submitted_at,time_spent_seconds,attempt_number").eq("event_id", id).eq("is_preview", false),
    event.simulado_id
      ? supabase.from("simulado_questions").select("id,order_number,status,questions:question_id(id,code,statement,image_url,year,question_type,question_alternatives(id,label,text,image_url,is_correct,order_number))").eq("simulado_id", event.simulado_id).order("order_number")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (participantsError || attemptsError || questionsError) return NextResponse.json({ ok: false, message: "Não foi possível carregar a dashboard do Evento." }, { status: 500 });

  const participants = (participantData || []) as unknown as ParticipantRow[];
  const attempts = (attemptData || []) as AttemptRow[];
  const questions = (questionData || []) as unknown as QuestionRow[];
  const representativeAttemptIds = participants.map((participant) => participant.representative_attempt_id).filter((attemptId): attemptId is string => Boolean(attemptId));
  let answers: AnswerRow[] = [];
  let results: ResultRow[] = [];
  const onlineCutoff = new Date(Date.now() - 90_000).toISOString();
  const { data: onlineSessions } = participants.length
    ? await supabase.from("user_sessions").select("actor_id").eq("actor_type", "student").eq("is_active", true).gte("last_seen_at", onlineCutoff).in("actor_id", participants.map((participant) => participant.student_id))
    : { data: [] };
  const onlineStudentIds = new Set((onlineSessions || []).map((session) => session.actor_id));
  if (representativeAttemptIds.length > 0) {
    const [{ data: answerData, error: answersError }, { data: resultData, error: resultsError }] = await Promise.all([
      supabase.from("simulado_answers").select("attempt_id,simulado_question_id,selected_alternative_id,is_correct,response_time_seconds").in("attempt_id", representativeAttemptIds),
      supabase.from("simulado_results").select("attempt_id,display_score,display_percentage,percentage,correct_count,wrong_count,blank_count,total_questions,time_spent_seconds").in("attempt_id", representativeAttemptIds),
    ]);
    if (answersError || resultsError) return NextResponse.json({ ok: false, message: "Não foi possível carregar as estatísticas do Evento." }, { status: 500 });
    answers = (answerData || []) as AnswerRow[];
    results = (resultData || []) as ResultRow[];
  }

  const attemptsById = new Map(attempts.map((attempt) => [attempt.id, attempt]));
  const resultsByAttemptId = new Map(results.map((result) => [result.attempt_id, result]));
  const eventEffectiveStatus = effectiveEventStatus(event);
  const completedRepresentativeIds = new Set(representativeAttemptIds.filter((attemptId) => ["completed", "disqualified", "expired"].includes(attemptsById.get(attemptId)?.status || "")));
  const questionStats = questions.map((relation) => {
    const rows = answers.filter((answer) => answer.simulado_question_id === relation.id);
    const answeredRows = rows.filter((answer) => Boolean(answer.selected_alternative_id));
    const answeredAttemptIds = new Set(answeredRows.map((answer) => answer.attempt_id));
    const blank = [...completedRepresentativeIds].filter((attemptId) => !answeredAttemptIds.has(attemptId)).length;
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
  const participantRows = participants.map((participant) => {
    const student = Array.isArray(participant.students) ? participant.students[0] : participant.students;
    const participantAttempts = attempts.filter((attempt) => attempt.student_id === participant.student_id);
    const representativeAttempt = participant.representative_attempt_id ? attemptsById.get(participant.representative_attempt_id) || null : null;
    const activeAttempt = participantAttempts.find((attempt) => attempt.status === "in_progress") || null;
    const displayedAttempt = activeAttempt || representativeAttempt;
    const result = representativeAttempt ? resultsByAttemptId.get(representativeAttempt.id) || null : null;
    let status: "not_started" | "not_completed" | "in_progress" | "completed" | "disqualified" | "expired" = "not_started";
    if (displayedAttempt?.status === "in_progress") status = "in_progress";
    else if (representativeAttempt?.status === "completed") status = "completed";
    else if (representativeAttempt?.status === "disqualified") status = "disqualified";
    else if (representativeAttempt?.status === "expired") status = "expired";
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
      } : null,
      result_status: resultStatus,
      result_released_at: participant.result_released_at,
    };
  }).sort((left, right) => {
    const priority = { in_progress: 0, completed: 1, disqualified: 2, expired: 3, not_started: 4, not_completed: 5 };
    return priority[left.status] - priority[right.status] || left.name.localeCompare(right.name, "pt-BR");
  });
  const resultTotals = results.reduce((total, result) => ({
    correct: total.correct + Number(result.correct_count || 0),
    wrong: total.wrong + Number(result.wrong_count || 0),
    blank: total.blank + Number(result.blank_count || 0),
    questions: total.questions + Number(result.total_questions || 0),
    time: total.time + Number(result.time_spent_seconds || 0),
  }), { correct: 0, wrong: 0, blank: 0, questions: 0, time: 0 });

  return NextResponse.json({
    ok: true,
    message: "Dashboard carregada.",
    event: { ...event, effective_status: eventEffectiveStatus },
    summary: {
      registered: participants.length,
      online: onlineStudentIds.size,
      not_started: participantRows.filter((participant) => participant.status === "not_started").length,
      taking: representativeAttemptIds.filter((attemptId) => attemptsById.get(attemptId)?.status === "in_progress").length,
      completed: representativeAttemptIds.filter((attemptId) => attemptsById.get(attemptId)?.status === "completed").length,
      pending_results: participants.filter((participant) => participant.representative_attempt_id && !participant.result_released_at).length,
      accuracy_percent: resultTotals.questions ? Math.round((resultTotals.correct / resultTotals.questions) * 10_000) / 100 : null,
      error_percent: resultTotals.questions ? Math.round((resultTotals.wrong / resultTotals.questions) * 10_000) / 100 : null,
      blank_answers: resultTotals.blank,
      average_time_seconds: results.length ? Math.round(resultTotals.time / results.length) : 0,
    },
    participants: participantRows,
    questions: questionStats,
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const manager = await requireEventManager(request, id);
  if (manager instanceof NextResponse) return manager;
  const body = await request.json().catch(() => null) as { action?: unknown } | null;
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
  return NextResponse.json({ ok: false, message: "Ação não permitida ao professor." }, { status: 403 });
}
