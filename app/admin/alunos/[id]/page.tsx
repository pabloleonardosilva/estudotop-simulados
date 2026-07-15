import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdminPage } from "@/lib/server/authGuard";
import AlunoAdminDetalheClient from "./page-client";

export type StudentDetail = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  cpf: string | null;
  avatar_url: string | null;
  status: "pending" | "active" | "blocked" | "inactive";
  notes: string | null;
  desired_contests: string | null;
  origin: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  welcome_email_status: string | null;
  welcome_email_sent_at: string | null;
  welcome_email_attempted_at: string | null;
  welcome_email_error: string | null;
  approved_at: string | null;
};

export type ActivityLog = {
  id: string;
  event_type: string;
  description: string;
  details: Record<string, unknown>;
  entity_type: string | null;
  entity_id: string | null;
  performed_by_name: string | null;
  created_at: string;
};

export type StudentUsageSession = {
  id: string;
  actor_type: string;
  actor_id: string;
  actor_name: string | null;
  actor_email: string | null;
  started_at: string;
  last_seen_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  ip_address: string | null;
  user_agent: string | null;
  last_route: string | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
};

export type StudentSystemActivity = {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  route: string | null;
  method: string | null;
  severity: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type StudentJornadaScheduleItem = {
  id: string;
  simulado_id: string;
  order_number: number;
  scheduled_release_at: string;
  released_at: string | null;
  release_email_sent_at: string | null;
  release_email_error: string | null;
  completed_at: string | null;
  status: string;
  title: string;
  max_attempts: number | null;
  attempts_total: number;
  attempts_counting: number;
  attempts_in_progress: number;
  latest_attempt_id: string | null;
  latest_attempt_status: string | null;
  latest_attempt_started_at: string | null;
  latest_attempt_submitted_at: string | null;
  latest_attempt_last_activity_at: string | null;
  latest_attempt_answered_count: number | null;
  latest_attempt_total_questions: number | null;
  latest_attempt_progress_percent: number | null;
  latest_result_percentage: number | null;
  latest_result_score: number | null;
  latest_result_finished_at: string | null;
  latest_result_time_spent_seconds: number | null;
  can_unrelease: boolean;
  manually_released: boolean;
};

export type StudentJornada = {
  id: string;
  jornada_id: string;
  started_at: string;
  expires_at: string;
  status: string;
  created_at: string;
  welcome_email_sent_at: string | null;
  welcome_email_error: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jornadas: any;
  progress: { completed: number; total: number };
  schedule: StudentJornadaScheduleItem[];
};

export type AvailableJornada = {
  id: string;
  title: string;
  status: string;
  scope_type: string | null;
  contest_name: string | null;
  duration_months: number;
  planned_simulados_count: number | null;
  exam_date: string | null;
};

async function getData(id: string) {
  const supabase = createSupabaseAdminClient();

  const [studentRes, logsRes, jornadasRes, availableJornadasRes, sessionsRes, systemActivitiesRes] = await Promise.all([
    supabase
      .from("students")
      .select("id, name, email, phone, cpf, avatar_url, status, notes, desired_contests, origin, last_login_at, created_at, updated_at, welcome_email_status, welcome_email_sent_at, welcome_email_attempted_at, welcome_email_error, approved_at")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("student_activity_log")
      .select("id, event_type, description, details, entity_type, entity_id, performed_by_name, created_at")
      .eq("student_id", id)
      .order("created_at", { ascending: false })
      .limit(150),
    supabase
      .from("student_jornadas")
      .select(`
        id,
        jornada_id,
        started_at,
        expires_at,
        status,
        created_at,
        welcome_email_sent_at,
        welcome_email_error,
        jornadas:jornada_id(id, title, status),
        student_jornada_simulados(
          id,
          simulado_id,
          order_number,
          scheduled_release_at,
          released_at,
          release_email_sent_at,
          release_email_error,
          completed_at,
          status,
          simulados:simulado_id(id, title, max_attempts)
        )
      `)
      .eq("student_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("jornadas")
      .select("id, title, status, scope_type, contest_name, duration_months, planned_simulados_count, exam_date")
      .eq("status", "published")
      .order("title", { ascending: true }),
    supabase
      .from("user_sessions")
      .select("id, actor_type, actor_id, actor_name, actor_email, started_at, last_seen_at, ended_at, duration_seconds, ip_address, user_agent, last_route, is_active, metadata")
      .eq("actor_type", "student")
      .eq("actor_id", id)
      .order("last_seen_at", { ascending: false })
      .limit(80),
    supabase
      .from("system_activity_logs")
      .select("id, action, entity_type, entity_id, route, method, severity, metadata, created_at")
      .eq("actor_type", "student")
      .eq("actor_id", id)
      .order("created_at", { ascending: false })
      .limit(250),
  ]);

  if (studentRes.error) throw new Error(studentRes.error.message);
  if (!studentRes.data) return null;

  const student = studentRes.data as StudentDetail;
  const activityLog = (logsRes.data || []) as ActivityLog[];
  const usageSessions = sessionsRes.error ? [] : ((sessionsRes.data || []) as StudentUsageSession[]);
  const systemActivities = systemActivitiesRes.error ? [] : ((systemActivitiesRes.data || []) as StudentSystemActivity[]);

  const rawJornadas = (jornadasRes.data || []) as any[];
  const simuladoIds = Array.from(new Set(
    rawJornadas.flatMap((sj: any) => (sj.student_jornada_simulados || []).map((s: any) => s.simulado_id).filter(Boolean)),
  ));

  const attemptsBySimulado = new Map<string, any[]>();
  if (simuladoIds.length > 0) {
    const { data: attempts, error: attemptsError } = await supabase
      .from("simulado_attempts")
      .select("id, simulado_id, status, counts_toward_limit, created_at, started_at, submitted_at, last_activity_at, time_spent_seconds, answered_count, total_questions, progress_percent")
      .eq("student_id", id)
      .in("simulado_id", simuladoIds);

    if (attemptsError) throw new Error(attemptsError.message);

    for (const attempt of attempts || []) {
      const key = String((attempt as any).simulado_id);
      const list = attemptsBySimulado.get(key) || [];
      list.push(attempt);
      attemptsBySimulado.set(key, list);
    }
  }

  const resultsByAttempt = new Map<string, any>();
  if (simuladoIds.length > 0) {
    const { data: results, error: resultsError } = await supabase
      .from("simulado_results")
      .select("attempt_id, simulado_id, display_percentage, percentage, display_score, score, time_spent_seconds, finished_at")
      .eq("student_id", id)
      .in("simulado_id", simuladoIds);

    if (resultsError) throw new Error(resultsError.message);

    for (const result of results || []) {
      if ((result as any).attempt_id) resultsByAttempt.set(String((result as any).attempt_id), result);
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jornadas: StudentJornada[] = rawJornadas.map((sj: any) => {
    const schedule = [...(sj.student_jornada_simulados || [])]
      .sort((a: any, b: any) => Number(a.order_number || 0) - Number(b.order_number || 0))
      .map((item: any) => {
        const attempts = attemptsBySimulado.get(String(item.simulado_id)) || [];
        const scheduledDate = item.scheduled_release_at ? new Date(`${item.scheduled_release_at}T00:00:00`) : null;
        const attemptsTotal = attempts.length;
        const attemptsCounting = attempts.filter((attempt: any) => Boolean(attempt.counts_toward_limit)).length;
        const attemptsInProgress = attempts.filter((attempt: any) => String(attempt.status) === "in_progress").length;
        const sortedAttempts = [...attempts].sort((a: any, b: any) => {
          const aDate = new Date(a.last_activity_at || a.submitted_at || a.started_at || a.created_at || 0).getTime();
          const bDate = new Date(b.last_activity_at || b.submitted_at || b.started_at || b.created_at || 0).getTime();
          return bDate - aDate;
        });
        const latestAttempt = sortedAttempts[0] || null;
        // Nota/percentual exibidos usam o "resultado real": a primeira tentativa
        // concluída que conta para o limite (mesma regra da Área do Aluno), e não a
        // última tentativa. Ordena por conclusão crescente.
        const realResultEntry = attempts
          .filter((attempt: any) => Boolean(attempt.counts_toward_limit) && String(attempt.status) === "completed")
          .map((attempt: any) => ({ attempt, result: resultsByAttempt.get(String(attempt.id)) || null }))
          .filter((entry: any) => entry.result)
          .sort((a: any, b: any) => {
            const aDate = String(a.attempt.submitted_at || a.attempt.created_at || "");
            const bDate = String(b.attempt.submitted_at || b.attempt.created_at || "");
            return aDate.localeCompare(bDate);
          })[0] || null;
        const latestResult = realResultEntry?.result || null;
        const hasStartedOrCompleted = attempts.some((attempt: any) => ["in_progress", "completed", "disqualified", "expired"].includes(String(attempt.status)));
        const manuallyReleased = item.status === "available" && Boolean(item.released_at) && scheduledDate !== null && scheduledDate.getTime() > today.getTime();

        return {
          id: item.id,
          simulado_id: item.simulado_id,
          order_number: Number(item.order_number || 0),
          scheduled_release_at: item.scheduled_release_at,
          released_at: item.released_at,
          release_email_sent_at: item.release_email_sent_at,
          release_email_error: item.release_email_error,
          completed_at: item.completed_at,
          status: item.status,
          title: item.simulados?.title || `Simulado ${item.order_number || ""}`.trim(),
          max_attempts: item.simulados?.max_attempts ?? null,
          attempts_total: attemptsTotal,
          attempts_counting: attemptsCounting,
          attempts_in_progress: attemptsInProgress,
          latest_attempt_id: latestAttempt?.id || null,
          latest_attempt_status: latestAttempt?.status || null,
          latest_attempt_started_at: latestAttempt?.started_at || latestAttempt?.created_at || null,
          latest_attempt_submitted_at: latestAttempt?.submitted_at || null,
          latest_attempt_last_activity_at: latestAttempt?.last_activity_at || null,
          latest_attempt_answered_count: latestAttempt?.answered_count ?? null,
          latest_attempt_total_questions: latestAttempt?.total_questions ?? null,
          latest_attempt_progress_percent: latestAttempt?.progress_percent ?? null,
          latest_result_percentage: latestResult ? Number(latestResult.display_percentage ?? latestResult.percentage ?? 0) : null,
          latest_result_score: latestResult ? Number(latestResult.display_score ?? latestResult.score ?? 0) : null,
          latest_result_finished_at: latestResult?.finished_at || null,
          latest_result_time_spent_seconds: latestResult?.time_spent_seconds ?? null,
          can_unrelease: manuallyReleased && !hasStartedOrCompleted,
          manually_released: manuallyReleased,
        };
      });

    return {
      ...sj,
      schedule,
      progress: {
        completed: schedule.filter((s: any) => s.status === "completed").length,
        total: schedule.length,
      },
    };
  });
  const availableJornadas = (availableJornadasRes.data || []) as AvailableJornada[];

  return { student, activityLog, jornadas, availableJornadas, usageSessions, systemActivities };
}

export default async function AlunoAdminDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage();
  const { id } = await params;
  const data = await getData(id);

  if (!data) notFound();

  return (
    <AlunoAdminDetalheClient
      student={data.student}
      activityLog={data.activityLog}
      usageSessions={data.usageSessions}
      systemActivities={data.systemActivities}
      jornadas={data.jornadas}
      availableJornadas={data.availableJornadas}
    />
  );
}
