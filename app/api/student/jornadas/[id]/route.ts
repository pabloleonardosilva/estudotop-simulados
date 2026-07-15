import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { logStudentActivity } from "@/app/lib/server/auditLogger";

type AttemptRow = {
  id: string;
  simulado_id: string;
  status: string;
  submitted_at: string | null;
  created_at: string | null;
  time_spent_seconds: number | null;
  progress_percent: number | null;
  counts_toward_limit?: boolean | null;
};

type ResultRow = {
  attempt_id: string;
  simulado_id: string;
  correct_count: number | null;
  total_questions: number | null;
  display_percentage: number | null;
  percentage: number | null;
  time_spent_seconds: number | null;
  finished_at: string | null;
};

const MINI_IMAGES = [
  "/images/mini_simulados/simulado-mini1.png",
  "/images/mini_simulados/simulado-mini2.png",
  "/images/mini_simulados/simulado-mini3.png",
  "/images/mini_simulados/simulado-mini4.png",
  "/images/mini_simulados/simulado-mini5.png",
  "/images/mini_simulados/simulado-mini7.png",
  "/images/mini_simulados/simulado-mini8.png",
];

function todayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeStatus(rawStatus: string, scheduledReleaseAt: string, previousCompleted: boolean, jornadaExpired: boolean) {
  if (jornadaExpired && rawStatus !== "completed") return "expired";
  if (rawStatus === "completed") return "completed";
  if (rawStatus === "in_progress") return "in_progress";
  if (rawStatus === "available") return "available";
  if (scheduledReleaseAt <= todayDateOnly() && !previousCompleted) return "locked_late";
  return "locked";
}

function formatTime(minutes: number | null | undefined) {
  if (!minutes) return "Sem limite";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h${String(m).padStart(2, "0")}min`;
  if (h) return `${h}h00min`;
  return `${m}min`;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const student = await getStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("student_jornadas")
    .select(`
      id,
      student_id,
      jornada_id,
      started_at,
      expires_at,
      status,
      jornadas:jornada_id(
        id,
        title,
        description,
        status,
        duration_months,
        duration_days,
        planned_simulados_count,
        exam_name,
        exam_position,
        exam_board,
        welcome_title,
        welcome_message,
        study_strategy,
        important_guidelines,
        journey_highlights,
        exam_date,
        effective_end_date
      ),
      student_jornada_simulados(
        id,
        status,
        order_number,
        scheduled_release_at,
        released_at,
        completed_at,
        simulado_id,
        simulados:simulado_id(
          id,
          title,
          description,
          discipline_id,
          question_count,
          time_limit_minutes,
          max_attempts,
          owl_help_enabled,
          status,
          disciplines:discipline_id(name)
        )
      )
    `)
    .eq("id", id)
    .eq("student_id", student.id)
    .maybeSingle();

  if (error || !data || data.status === "cancelled") {
    return NextResponse.json({ ok: false, message: "Jornada não encontrada." }, { status: 404 });
  }

  const rows = [...((data as any).student_jornada_simulados || [])].sort(
    (a: any, b: any) => a.order_number - b.order_number,
  );
  const simuladoIds = rows.map((row: any) => row.simulado_id).filter(Boolean);

  const { data: attempts } = simuladoIds.length
    ? await supabase
        .from("simulado_attempts")
        .select("id, simulado_id, status, submitted_at, time_spent_seconds, progress_percent, counts_toward_limit, created_at")
        .eq("student_id", student.id)
        .in("simulado_id", simuladoIds)
        .order("created_at", { ascending: false })
    : { data: [] as AttemptRow[] };

  const completedAttemptIds = ((attempts || []) as AttemptRow[])
    .filter((attempt) => attempt.status === "completed" && attempt.counts_toward_limit)
    .map((attempt) => attempt.id);

  const { data: results } = completedAttemptIds.length
    ? await supabase
        .from("simulado_results")
        .select("attempt_id, simulado_id, correct_count, total_questions, display_percentage, percentage, time_spent_seconds, finished_at")
        .in("attempt_id", completedAttemptIds)
    : { data: [] as ResultRow[] };

  const resultsByAttempt = new Map<string, ResultRow>();
  for (const result of ((results || []) as ResultRow[])) {
    resultsByAttempt.set(result.attempt_id, result);
  }

  const attemptsBySimulado = new Map<string, AttemptRow[]>();
  for (const attempt of ((attempts || []) as AttemptRow[])) {
    const list = attemptsBySimulado.get(attempt.simulado_id) || [];
    list.push(attempt);
    attemptsBySimulado.set(attempt.simulado_id, list);
  }

  const jornadaExpired = (data as any).expires_at <= todayDateOnly();

  const simulados = rows.map((row: any, index: number) => {
    const previous = index > 0 ? rows[index - 1] : null;
    const sim = row.simulados || {};
    const simAttempts = attemptsBySimulado.get(row.simulado_id) || [];
    const inProgress = simAttempts.find((attempt) => attempt.status === "in_progress") || null;
    const anyCompleted = simAttempts.find((attempt) => attempt.status === "completed" && attempt.counts_toward_limit) || null;
    const previousAttempts = previous?.simulado_id ? attemptsBySimulado.get(previous.simulado_id) || [] : [];
    const previousCompleted =
      index === 0 || previousAttempts.some((attempt) => attempt.status === "completed" && attempt.counts_toward_limit);
    const rawStatus = row.status === "completed" && !anyCompleted
      ? (row.released_at ? "available" : "locked")
      : row.status;
    const status = anyCompleted ? "completed" : normalizeStatus(rawStatus, row.scheduled_release_at, previousCompleted, jornadaExpired);
    const limitAttempts = simAttempts.filter((attempt) => Boolean(attempt.counts_toward_limit));
    const completedAttempts = limitAttempts.filter((attempt) => attempt.status === "completed");
    const incompleteAttempts = limitAttempts.filter((attempt) => attempt.status !== "completed");
    const completedResults = completedAttempts
      .map((attempt) => ({ attempt, result: resultsByAttempt.get(attempt.id) || null }))
      .filter((item) => item.result);
    const firstCompletedResult = [...completedResults].sort((a, b) => {
      const aDate = a.attempt.submitted_at || a.attempt.created_at || "";
      const bDate = b.attempt.submitted_at || b.attempt.created_at || "";
      return aDate.localeCompare(bDate);
    })[0] || null;
    const realScorePercent = firstCompletedResult?.result?.display_percentage ?? firstCompletedResult?.result?.percentage ?? null;
    const completed = firstCompletedResult?.attempt || null;
    const result = firstCompletedResult?.result || null;
    const score = realScorePercent;
    const timeValues = completedResults
      .map((item) => item.result?.time_spent_seconds ?? item.attempt.time_spent_seconds ?? null)
      .filter((value): value is number => typeof value === "number" && value > 0);
    const averageTimeSeconds = timeValues.length
      ? Math.round(timeValues.reduce((sum, value) => sum + value, 0) / timeValues.length)
      : null;

    return {
      id: row.id,
      simulado_id: row.simulado_id,
      order_number: row.order_number,
      title: sim.title || `Simulado ${String(row.order_number).padStart(2, "0")}`,
      discipline: sim.disciplines?.name || "Simulado",
      question_count: sim.question_count ?? null,
      time_label: formatTime(sim.time_limit_minutes),
      time_limit_minutes: sim.time_limit_minutes ?? null,
      max_attempts: sim.max_attempts ?? null,
      owl_help_enabled: Boolean(sim.owl_help_enabled),
      attempts_used: limitAttempts.length,
      attempts_completed: completedAttempts.length,
      attempts_incomplete: incompleteAttempts.length,
      attempts_remaining: sim.max_attempts === null || sim.max_attempts === undefined ? null : Math.max(Number(sim.max_attempts) - limitAttempts.length, 0),
      attempts_exhausted: sim.max_attempts !== null && sim.max_attempts !== undefined && limitAttempts.length >= Number(sim.max_attempts),
      real_score_percent: realScorePercent,
      best_score_percent: realScorePercent,
      average_time_seconds: averageTimeSeconds,
      scheduled_release_at: row.scheduled_release_at,
      released_at: row.released_at,
      completed_at: completed ? (result?.finished_at || completed.submitted_at || row.completed_at || null) : null,
      status,
      raw_status: row.status,
      thumbnail_url: MINI_IMAGES[(row.order_number - 1) % MINI_IMAGES.length],
      score_percent: score,
      correct_count: result?.correct_count ?? null,
      total_questions: result?.total_questions ?? sim.question_count ?? null,
      time_spent_seconds: result?.time_spent_seconds ?? completed?.time_spent_seconds ?? inProgress?.time_spent_seconds ?? null,
      progress_percent: inProgress?.progress_percent ?? null,
      result_url: completed ? `/meus-simulados/${row.simulado_id}/resultado` : null,
      simulado_url: `/meus-simulados/${row.simulado_id}?jornada=${data.id}`,
    };
  });

  const linkedTotal = simulados.length;
  const total = (data as any).jornadas?.planned_simulados_count || linkedTotal;
  const completed = simulados.filter((item) => item.status === "completed").length;
  const available = simulados.filter((item) => item.status === "available" || item.status === "in_progress").length;
  const progress_percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const late = simulados.find((item) => item.status === "locked_late") || null;

  void logStudentActivity({ studentId: student.id, action: "student.jornada.opened", entityType: "student_jornada", entityId: id, request });

  return NextResponse.json({
    ok: true,
    jornada: {
      id: data.id,
      jornada_id: (data as any).jornada_id,
      title: (data as any).jornadas?.title || "Jornada",
      description: (data as any).jornadas?.description || null,
      exam_name: (data as any).jornadas?.exam_name || null,
      exam_position: (data as any).jornadas?.exam_position || null,
      exam_board: (data as any).jornadas?.exam_board || null,
      welcome_title: (data as any).jornadas?.welcome_title || null,
      welcome_message: (data as any).jornadas?.welcome_message || null,
      study_strategy: (data as any).jornadas?.study_strategy || null,
      important_guidelines: (data as any).jornadas?.important_guidelines || null,
      journey_highlights: Array.isArray((data as any).jornadas?.journey_highlights) ? (data as any).jornadas.journey_highlights : [],
      duration_months: (data as any).jornadas?.duration_months || 0,
      duration_days: (data as any).jornadas?.duration_days || null,
      exam_date: (data as any).jornadas?.exam_date || null,
      effective_end_date: (data as any).jornadas?.effective_end_date || null,
      started_at: (data as any).started_at,
      expires_at: (data as any).expires_at,
      status: jornadaExpired ? "expired" : (data as any).status,
      total_simulados: total,
      completed_simulados: completed,
      available_simulados: available,
      progress_percent,
      late_simulado: late,
    },
    simulados,
  });
}
