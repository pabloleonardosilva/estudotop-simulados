import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { logSystemError } from "@/app/lib/server/auditLogger";

type AttemptRow = {
  id: string;
  simulado_id: string;
  status: string;
  answered_count: number | null;
  total_questions: number | null;
  progress_percent: number | null;
  started_at: string | null;
  submitted_at: string | null;
  last_activity_at: string | null;
  created_at: string | null;
  time_spent_seconds: number | null;
  counts_toward_limit: boolean | null;
};

type ResultRow = {
  attempt_id: string;
  simulado_id: string;
  correct_count: number | null;
  wrong_count: number | null;
  blank_count: number | null;
  total_questions: number | null;
  display_percentage: number | null;
  percentage: number | null;
  time_spent_seconds: number | null;
  finished_at: string | null;
};

type StudentJornadaSimuladoRow = {
  id: string;
  simulado_id: string;
  status: string;
  order_number: number | null;
  scheduled_release_at: string | null;
  released_at: string | null;
  completed_at: string | null;
  simulados?: {
    id: string;
    title: string | null;
    question_count: number | null;
    time_limit_minutes: number | null;
  } | null;
};

function todayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

function computeStudentJornadaStatus(status: string | null, expiresAt: string | null) {
  if (status === "cancelled") return "cancelled";
  if (expiresAt && expiresAt <= todayDateOnly()) return "expired";
  return status || "active";
}

function mostRecentAttempt(attempts: AttemptRow[]) {
  return [...attempts].sort((a, b) => {
    const aDate = new Date(a.last_activity_at || a.submitted_at || a.started_at || a.created_at || 0).getTime();
    const bDate = new Date(b.last_activity_at || b.submitted_at || b.started_at || b.created_at || 0).getTime();
    return bDate - aDate;
  })[0] || null;
}

function sum(values: Array<number | null | undefined>) {
  return values.reduce<number>((acc, value) => acc + Number(value || 0), 0);
}

function average(values: number[]) {
  if (!values.length) return null;
  return Math.round((values.reduce((acc, value) => acc + value, 0) / values.length) * 10) / 10;
}

function safePercent(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

export async function GET(request: Request) {
  const student = await getStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();

  const { data: rawJornadas, error: jornadasError } = await supabase
    .from("student_jornadas")
    .select(`
      id,
      student_id,
      jornada_id,
      started_at,
      expires_at,
      status,
      created_at,
      jornadas:jornada_id(
        id,
        title,
        description,
        duration_days,
        duration_months,
        planned_simulados_count,
        scope_type,
        contest_name,
        exam_date
      ),
      student_jornada_simulados(
        id,
        simulado_id,
        status,
        order_number,
        scheduled_release_at,
        released_at,
        completed_at,
        simulados:simulado_id(
          id,
          title,
          question_count,
          time_limit_minutes
        )
      )
    `)
    .eq("student_id", student.id)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });

  if (jornadasError) {
    void logSystemError({ source: "api.student.dashboard.jornadas", error: jornadasError, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar seu painel." }, { status: 500 });
  }

  const jornadaSimuladoIds = Array.from(
    new Set(
      (rawJornadas || [])
        .flatMap((row: any) => (row.student_jornada_simulados || []).map((item: any) => item.simulado_id))
        .filter(Boolean),
    ),
  );

  const { data: avulsos, error: avulsosError } = await supabase
    .from("simulados")
    .select("id, title, question_count, time_limit_minutes, published_at, status")
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false });

  if (avulsosError) {
    void logSystemError({ source: "api.student.dashboard.simulados", error: avulsosError, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar seu painel." }, { status: 500 });
  }

  const allPublishedIds = (avulsos || []).map((row: any) => row.id).filter(Boolean);

  const { data: jornadaLinks, error: jornadaLinksError } = await supabase
    .from("jornada_simulados")
    .select("simulado_id")
    .in("simulado_id", allPublishedIds.length ? allPublishedIds : ["00000000-0000-0000-0000-000000000000"]);

  if (jornadaLinksError) {
    void logSystemError({ source: "api.student.dashboard.links", error: jornadaLinksError, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar seu painel." }, { status: 500 });
  }

  const linkedToAnyJornada = new Set((jornadaLinks || []).map((row: any) => row.simulado_id));
  const avulsoIds = (avulsos || [])
    .filter((row: any) => !linkedToAnyJornada.has(row.id))
    .map((row: any) => row.id)
    .filter(Boolean);

  const accessibleSimuladoIds = Array.from(new Set([...jornadaSimuladoIds, ...avulsoIds]));

  const { data: attempts, error: attemptsError } = await supabase
    .from("simulado_attempts")
    .select(
      "id, simulado_id, status, answered_count, total_questions, progress_percent, started_at, submitted_at, last_activity_at, created_at, time_spent_seconds, counts_toward_limit",
    )
    .eq("student_id", student.id)
    .in("simulado_id", accessibleSimuladoIds.length ? accessibleSimuladoIds : ["00000000-0000-0000-0000-000000000000"])
    .order("created_at", { ascending: false });

  if (attemptsError) {
    void logSystemError({ source: "api.student.dashboard.attempts", error: attemptsError, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar seu painel." }, { status: 500 });
  }

  const completedAttemptIds = ((attempts || []) as AttemptRow[])
    .filter((attempt) => attempt.status === "completed")
    .map((attempt) => attempt.id);

  const { data: results, error: resultsError } = completedAttemptIds.length
    ? await supabase
        .from("simulado_results")
        .select(
          "attempt_id, simulado_id, correct_count, wrong_count, blank_count, total_questions, display_percentage, percentage, time_spent_seconds, finished_at",
        )
        .eq("student_id", student.id)
        .in("attempt_id", completedAttemptIds)
    : { data: [] as ResultRow[], error: null };

  if (resultsError) {
    void logSystemError({ source: "api.student.dashboard.results", error: resultsError, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar seu painel." }, { status: 500 });
  }

  const attemptsBySimulado = new Map<string, AttemptRow[]>();
  for (const attempt of ((attempts || []) as AttemptRow[])) {
    const list = attemptsBySimulado.get(attempt.simulado_id) || [];
    list.push(attempt);
    attemptsBySimulado.set(attempt.simulado_id, list);
  }

  const completedResults = ((results || []) as ResultRow[]).filter((result) => result.finished_at || result.attempt_id);
  const resultsBySimulado = new Map<string, ResultRow[]>();
  for (const result of completedResults) {
    const list = resultsBySimulado.get(result.simulado_id) || [];
    list.push(result);
    resultsBySimulado.set(result.simulado_id, list);
  }

  const today = todayDateOnly();

  const jornadas = (rawJornadas || []).map((row: any) => {
    const itens = ([...(row.student_jornada_simulados || [])] as StudentJornadaSimuladoRow[]).sort(
      (a, b) => Number(a.order_number || 0) - Number(b.order_number || 0),
    );
    const linkedTotal = itens.length;
    const total = Number(row.jornadas?.planned_simulados_count || linkedTotal || 0);
    const status = computeStudentJornadaStatus(row.status, row.expires_at);
    const completed = itens.filter((item) => {
      const itemAttempts = attemptsBySimulado.get(item.simulado_id) || [];
      return item.status === "completed" || itemAttempts.some((attempt) => attempt.status === "completed");
    }).length;
    const available = itens.filter((item) => ["available", "in_progress"].includes(item.status)).length;
    const locked = Math.max(0, total - completed - available);
    const scores = itens.flatMap((item) =>
      (resultsBySimulado.get(item.simulado_id) || [])
        .map((result) => safePercent(result.display_percentage ?? result.percentage))
        .filter((value): value is number => typeof value === "number"),
    );
    const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      id: row.id,
      jornada_id: row.jornada_id,
      title: row.jornadas?.title || "Jornada",
      description: row.jornadas?.description || null,
      contest_name: row.jornadas?.contest_name || null,
      scope_type: row.jornadas?.scope_type || "general",
      started_at: row.started_at,
      expires_at: row.expires_at,
      status,
      total_simulados: total,
      completed_simulados: completed,
      available_simulados: available,
      locked_simulados: locked,
      progress_percent: progressPercent,
      average_score: average(scores),
    };
  });

  const activeJornadas = jornadas.filter((jornada) => jornada.status === "active");
  const completedSimuladoIds = new Set(
    ((attempts || []) as AttemptRow[])
      .filter((attempt) => attempt.status === "completed")
      .map((attempt) => attempt.simulado_id),
  );
  const inProgressAttempt = mostRecentAttempt(((attempts || []) as AttemptRow[]).filter((attempt) => attempt.status === "in_progress"));
  const availableJornadaItem = (rawJornadas || [])
    .flatMap((jornada: any) =>
      ((jornada.student_jornada_simulados || []) as StudentJornadaSimuladoRow[]).map((item) => ({
        ...item,
        student_jornada_id: jornada.id,
        jornada_title: jornada.jornadas?.title || "Jornada",
      })),
    )
    .filter((item: any) => ["available", "in_progress"].includes(item.status) && !completedSimuladoIds.has(item.simulado_id))
    .sort((a: any, b: any) => Number(a.order_number || 0) - Number(b.order_number || 0))[0] || null;

  const publishedById = new Map<string, any>((avulsos || []).map((row: any) => [row.id, row]));
  const inProgressSimulado = inProgressAttempt ? publishedById.get(inProgressAttempt.simulado_id) : null;
  const inProgressJornada = (rawJornadas || []).find((row: any) =>
    (row.student_jornada_simulados || []).some((item: any) => item.simulado_id === inProgressAttempt?.simulado_id),
  );
  const inProgressJornadaData = Array.isArray(inProgressJornada?.jornadas)
    ? inProgressJornada?.jornadas[0]
    : inProgressJornada?.jornadas;
  const availableAvulso = (avulsos || [])
    .filter((row: any) => avulsoIds.includes(row.id) && !completedSimuladoIds.has(row.id))
    .sort((a: any, b: any) => String(b.published_at || "").localeCompare(String(a.published_at || "")))[0] || null;

  let nextAction = {
    type: "refazer_simulados" as "continuar" | "resolver" | "refazer_simulados" | "ver_jornadas",
    label: "Refazer simulados",
    title: "Revise seus simulados resolvidos.",
    description: "Você não tem nenhuma tentativa em andamento ou simulado novo liberado neste momento.",
    href: "/meus-simulados",
    jornada_title: null as string | null,
  };

  if (inProgressAttempt) {
    nextAction = {
      type: "continuar",
      label: "Continuar de onde parei",
      title: inProgressSimulado?.title || "Simulado em andamento",
      description: `${Math.round(Number(inProgressAttempt.progress_percent || 0))}% concluído${inProgressJornadaData?.title ? ` na ${inProgressJornadaData.title}` : ""}.`,
      href: `/meus-simulados/${inProgressAttempt.simulado_id}`,
      jornada_title: inProgressJornadaData?.title || null,
    };
  } else if (availableJornadaItem) {
    nextAction = {
      type: "resolver",
      label: "Resolver simulado",
      title: availableJornadaItem.simulados?.title || "Simulado liberado",
      description: `Disponível agora${availableJornadaItem.jornada_title ? ` na ${availableJornadaItem.jornada_title}` : ""}.`,
      href: `/meus-simulados/${availableJornadaItem.simulado_id}?jornada=${availableJornadaItem.student_jornada_id}`,
      jornada_title: availableJornadaItem.jornada_title || null,
    };
  } else if (availableAvulso) {
    nextAction = {
      type: "resolver",
      label: "Resolver simulado",
      title: availableAvulso.title || "Simulado liberado",
      description: "Há um simulado avulso disponível para resolução.",
      href: `/meus-simulados/${availableAvulso.id}`,
      jornada_title: null,
    };
  } else if (!completedResults.length && activeJornadas.length > 0) {
    nextAction = {
      type: "ver_jornadas",
      label: "Ver minhas jornadas",
      title: "Comece pela sua Jornada ativa.",
      description: "Abra sua Jornada para conferir o cronograma de liberação dos simulados.",
      href: "/minhas-jornadas",
      jornada_title: activeJornadas[0]?.title || null,
    };
  }

  const totalQuestions = sum(completedResults.map((result) => result.total_questions));
  const correctCount = sum(completedResults.map((result) => result.correct_count));
  const wrongCount = sum(completedResults.map((result) => result.wrong_count));
  const blankCount = sum(completedResults.map((result) => result.blank_count));
  const totalTimeSeconds = sum(completedResults.map((result) => result.time_spent_seconds));
  const averageScore = average(
    completedResults
      .map((result) => safePercent(result.display_percentage ?? result.percentage))
      .filter((value): value is number => typeof value === "number"),
  );

  const pendingJornadaAvailable = (rawJornadas || [])
    .flatMap((jornada: any) =>
      ((jornada.student_jornada_simulados || []) as StudentJornadaSimuladoRow[]).map((item) => ({
        ...item,
        jornada_title: jornada.jornadas?.title || "Jornada",
      })),
    )
    .filter((item: any) => ["available", "in_progress"].includes(item.status) && !completedSimuladoIds.has(item.simulado_id));
  const pendingAvulsos = (avulsos || []).filter((row: any) => avulsoIds.includes(row.id) && !completedSimuladoIds.has(row.id));
  const pendingAvailableCount = pendingJornadaAvailable.length + pendingAvulsos.length;

  const expiringJornada = activeJornadas
    .filter((jornada) => jornada.expires_at)
    .sort((a, b) => String(a.expires_at).localeCompare(String(b.expires_at)))[0] || null;

  const attention = [
    ...(pendingAvailableCount
      ? [
          {
            title: `${pendingAvailableCount} simulado${pendingAvailableCount > 1 ? "s" : ""} disponível${pendingAvailableCount > 1 ? "is" : ""}`,
            description: "Resolva primeiro o que já está liberado para manter a Jornada em movimento.",
            tone: "orange",
          },
        ]
      : []),
    ...(averageScore !== null && averageScore < 70
      ? [
          {
            title: "Aproveitamento abaixo de 70%",
            description: "Use os resultados dos simulados para revisar os pontos com maior erro.",
            tone: "blue",
          },
        ]
      : []),
    ...(expiringJornada
      ? [
          {
            title: `Acompanhe a expiração da ${expiringJornada.title}`,
            description: `Seu acesso vai até ${expiringJornada.expires_at}.`,
            tone: "slate",
          },
        ]
      : []),
  ].slice(0, 3);

  return NextResponse.json({
    ok: true,
    student: {
      id: student.id,
      name: student.name || "Aluno",
      email: student.email || null,
    },
    next_action: nextAction,
    summary: {
      active_jornadas: activeJornadas.length,
      completed_simulados: completedSimuladoIds.size,
      resolved_questions: totalQuestions,
      accuracy_percent: averageScore,
      studied_seconds: totalTimeSeconds,
      correct_count: correctCount,
      wrong_count: wrongCount,
      blank_count: blankCount,
      pending_available_simulados: pendingAvailableCount,
    },
    jornadas: jornadas.slice(0, 4),
    attention,
  });
}
