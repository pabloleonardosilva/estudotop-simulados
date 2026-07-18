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

export type StudentEmailHistoryItem = {
  id: string;
  category: "welcome" | "jornada" | "simulado" | "password";
  title: string;
  description: string;
  status: "sent" | "failed";
  source: string;
  occurred_at: string;
};

type AdminEmailAudit = {
  id: string;
  action: string;
  entity_id: string | null;
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

  const [
    studentRes,
    logsRes,
    jornadasRes,
    availableJornadasRes,
    sessionsRes,
    systemActivitiesRes,
    emailActivitiesRes,
    directEmailAuditsRes,
    relatedEmailAuditsRes,
  ] = await Promise.all([
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
    supabase
      .from("student_activity_log")
      .select("id, event_type, description, details, entity_type, entity_id, performed_by_name, created_at")
      .eq("student_id", id)
      .in("event_type", [
        "welcome_email_sent",
        "welcome_email_resent",
        "welcome_email_failed",
        "approval_jornada_email_sent",
        "jornada_welcome_email_sent",
        "password_reset",
      ])
      .order("created_at", { ascending: false }),
    supabase
      .from("admin_audit_logs")
      .select("id, action, entity_id, metadata, created_at")
      .eq("entity_type", "student")
      .eq("entity_id", id)
      .eq("action", "admin.student.jornada_email_resent")
      .order("created_at", { ascending: false }),
    supabase
      .from("admin_audit_logs")
      .select("id, action, entity_id, metadata, created_at")
      .eq("action", "admin.student.simulado_release_email_resent")
      .contains("metadata", { student_id: id })
      .order("created_at", { ascending: false }),
  ]);

  if (studentRes.error) throw new Error(studentRes.error.message);
  if (!studentRes.data) return null;

  const student = studentRes.data as StudentDetail;
  const activityLog = (logsRes.data || []) as ActivityLog[];
  const usageSessions = sessionsRes.error ? [] : ((sessionsRes.data || []) as StudentUsageSession[]);
  const systemActivities = systemActivitiesRes.error ? [] : ((systemActivitiesRes.data || []) as StudentSystemActivity[]);
  const emailActivities = emailActivitiesRes.error ? [] : ((emailActivitiesRes.data || []) as ActivityLog[]);
  const directEmailAudits = directEmailAuditsRes.error ? [] : ((directEmailAuditsRes.data || []) as AdminEmailAudit[]);
  const relatedEmailAudits = relatedEmailAuditsRes.error ? [] : ((relatedEmailAuditsRes.data || []) as AdminEmailAudit[]);

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
        const countedAttempts = attempts.filter((attempt: any) => Boolean(attempt.counts_toward_limit));
        const visibleAttempts = attempts.filter((attempt: any) => Boolean(attempt.counts_toward_limit) || String(attempt.status) === "in_progress");
        const sortedAttempts = [...visibleAttempts].sort((a: any, b: any) => {
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
        const hasValidCompletion = Boolean(realResultEntry);
        const effectiveStatus = item.status === "completed" && !hasValidCompletion
          ? (item.released_at ? "available" : "locked")
          : item.status;
        const manuallyReleased = item.status === "available" && Boolean(item.released_at) && scheduledDate !== null && scheduledDate.getTime() > today.getTime();
        const canUnrelease = effectiveStatus === "available" && Boolean(item.released_at) && attemptsCounting === 0 && attemptsTotal === 0;

        return {
          id: item.id,
          simulado_id: item.simulado_id,
          order_number: Number(item.order_number || 0),
          scheduled_release_at: item.scheduled_release_at,
          released_at: item.released_at,
          release_email_sent_at: item.release_email_sent_at,
          release_email_error: item.release_email_error,
          completed_at: hasValidCompletion ? item.completed_at : null,
          status: effectiveStatus,
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
          can_unrelease: canUnrelease,
          manually_released: manuallyReleased,
        };
      });

    return {
      ...sj,
      schedule,
      progress: {
        completed: schedule.filter((s: any) => s.status === "completed" && s.attempts_counting > 0).length,
        total: schedule.length,
      },
    };
  });
  const availableJornadas = (availableJornadasRes.data || []) as AvailableJornada[];
  const jornadaTitleById = new Map(jornadas.map((item) => [item.jornada_id, String(item.jornadas?.title || "Jornada")]));
  const scheduleById = new Map(
    jornadas.flatMap((item) => item.schedule.map((schedule) => [
      schedule.id,
      { title: schedule.title, jornadaTitle: String(item.jornadas?.title || "Jornada") },
    ] as const)),
  );
  const emailHistory: StudentEmailHistoryItem[] = [];
  const coveredReleaseIds = new Set<string>();
  const loggedStudentJornadaIds = new Set<string>();
  const manuallyResentJornadaIds = new Set<string>();
  const manuallyResentSimuladoIds = new Set<string>();
  let hasWelcomeActivity = false;

  for (const log of emailActivities) {
    const details = log.details || {};
    const jornadaId = typeof details.jornada_id === "string" ? details.jornada_id : "";
    const studentJornadaId = typeof details.student_jornada_id === "string" ? details.student_jornada_id : "";
    if (studentJornadaId) loggedStudentJornadaIds.add(studentJornadaId);
    if (Array.isArray(details.covered_release_ids)) {
      for (const releaseId of details.covered_release_ids) {
        if (typeof releaseId === "string") coveredReleaseIds.add(releaseId);
      }
    }

    if (log.event_type.startsWith("welcome_email_")) {
      hasWelcomeActivity = true;
      emailHistory.push({
        id: `activity-${log.id}`,
        category: "welcome",
        title: log.event_type === "welcome_email_resent" ? "Boas-vindas reenviadas" : "Boas-vindas ao sistema",
        description: log.description,
        status: log.event_type === "welcome_email_failed" ? "failed" : "sent",
        source: log.event_type === "welcome_email_resent" ? "Reenvio manual" : "Cadastro e aprovação",
        occurred_at: log.created_at,
      });
      continue;
    }

    if (log.event_type === "password_reset") {
      emailHistory.push({
        id: `activity-${log.id}`,
        category: "password",
        title: "Redefinição de senha",
        description: log.description,
        status: details.email_sent === false ? "failed" : "sent",
        source: "Ação administrativa",
        occurred_at: log.created_at,
      });
      continue;
    }

    emailHistory.push({
      id: `activity-${log.id}`,
      category: "jornada",
      title: jornadaTitleById.get(jornadaId) || "Entrada em Jornada",
      description: log.description,
      status: "sent",
      source: log.event_type === "approval_jornada_email_sent" ? "Aprovação e Jornada" : "Matrícula em Jornada",
      occurred_at: log.created_at,
    });
  }

  for (const audit of directEmailAudits) {
    const jornadaId = typeof audit.metadata?.jornada_id === "string" ? audit.metadata.jornada_id : "";
    if (jornadaId) manuallyResentJornadaIds.add(jornadaId);
    emailHistory.push({
      id: `audit-${audit.id}`,
      category: "jornada",
      title: jornadaTitleById.get(jornadaId) || "Entrada em Jornada",
      description: "E-mail de entrada na Jornada reenviado manualmente.",
      status: "sent",
      source: "Reenvio manual",
      occurred_at: audit.created_at,
    });
  }

  for (const audit of relatedEmailAudits) {
    const scheduleId = audit.entity_id || "";
    if (scheduleId) manuallyResentSimuladoIds.add(scheduleId);
    const schedule = scheduleById.get(scheduleId);
    emailHistory.push({
      id: `audit-${audit.id}`,
      category: "simulado",
      title: schedule?.title || "Simulado liberado",
      description: `E-mail de liberação reenviado manualmente${schedule?.jornadaTitle ? ` · ${schedule.jornadaTitle}` : ""}.`,
      status: "sent",
      source: "Reenvio manual",
      occurred_at: audit.created_at,
    });
  }

  if (!hasWelcomeActivity) {
    if (student.welcome_email_sent_at) {
      emailHistory.push({
        id: "student-welcome-sent",
        category: "welcome",
        title: "Boas-vindas ao sistema",
        description: "Primeiro envio de boas-vindas registrado no cadastro do aluno.",
        status: "sent",
        source: "Cadastro do aluno",
        occurred_at: student.welcome_email_sent_at,
      });
    } else if (student.welcome_email_attempted_at && student.welcome_email_error) {
      emailHistory.push({
        id: "student-welcome-failed",
        category: "welcome",
        title: "Boas-vindas ao sistema",
        description: "A tentativa de envio do e-mail de boas-vindas falhou.",
        status: "failed",
        source: "Cadastro do aluno",
        occurred_at: student.welcome_email_attempted_at,
      });
    }
  }

  for (const jornada of jornadas) {
    if (
      jornada.welcome_email_sent_at
      && !loggedStudentJornadaIds.has(jornada.id)
      && !manuallyResentJornadaIds.has(jornada.jornada_id)
    ) {
      emailHistory.push({
        id: `jornada-${jornada.id}`,
        category: "jornada",
        title: String(jornada.jornadas?.title || "Entrada em Jornada"),
        description: "Envio de entrada na Jornada registrado na matrícula.",
        status: "sent",
        source: "Matrícula em Jornada",
        occurred_at: jornada.welcome_email_sent_at,
      });
    }

    for (const item of jornada.schedule) {
      if (
        item.release_email_sent_at
        && !coveredReleaseIds.has(item.id)
        && !manuallyResentSimuladoIds.has(item.id)
      ) {
        emailHistory.push({
          id: `simulado-${item.id}`,
          category: "simulado",
          title: item.title,
          description: `E-mail de liberação enviado · ${String(jornada.jornadas?.title || "Jornada")}.`,
          status: "sent",
          source: "Liberação de simulado",
          occurred_at: item.release_email_sent_at,
        });
      }
    }
  }

  emailHistory.sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());

  return { student, activityLog, jornadas, availableJornadas, usageSessions, systemActivities, emailHistory };
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
      emailHistory={data.emailHistory}
    />
  );
}
