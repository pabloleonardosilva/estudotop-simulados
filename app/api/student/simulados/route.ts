import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { logSystemError } from "@/app/lib/server/auditLogger";
import { effectiveEventStatus } from "@/lib/server/simuladoEvents";

type AttemptRow = {
  id: string;
  simulado_id: string;
  status: string;
  attempt_number: number;
  answered_count: number;
  total_questions: number;
  progress_percent: number;
  started_at: string;
  submitted_at: string | null;
  expires_at: string | null;
  counts_toward_limit: boolean;
  attempt_context: string;
  event_id: string | null;
  event_participant_id: string | null;
  student_jornada_simulado_id: string | null;
};

export async function GET(request: Request) {
  const student = await getStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();

  const { data: simulados, error: simuladosError } = await supabase
    .from("simulados")
    .select(
      `
        id,
        title,
        description,
        question_count,
        time_limit_minutes,
        max_attempts,
        scoring_model,
        instant_feedback_enabled,
        feedback_mode,
        show_answer_key_on_finish,
        published_at,
        status,
        simulado_questions ( id )
      `,
    )
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false });

  if (simuladosError) {
    void logSystemError({ source: "api.student.simulados_list", error: simuladosError, request });
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar os simulados." },
      { status: 500 },
    );
  }

  const allIds = (simulados || []).map((row) => row.id);

  const { data: jornadaLinks, error: jornadaLinksError } = await supabase
    .from("jornada_simulados")
    .select("simulado_id")
    .in("simulado_id", allIds.length ? allIds : ["00000000-0000-0000-0000-000000000000"]);

  if (jornadaLinksError) {
    void logSystemError({ source: "api.student.simulados_list", error: jornadaLinksError, request });
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar os simulados." },
      { status: 500 },
    );
  }

  const linkedToJornadaIds = new Set((jornadaLinks || []).map((row) => row.simulado_id));

  const { data: studentJornadas, error: studentJornadasError } = await supabase
    .from("student_jornadas")
    .select("id, jornada_id, jornadas:jornada_id(id, title)")
    .eq("student_id", student.id)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString().slice(0, 10));

  if (studentJornadasError) {
    void logSystemError({ source: "api.student.simulados_list", error: studentJornadasError, request });
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar os simulados." },
      { status: 500 },
    );
  }

  const studentJornadaIds = (studentJornadas || []).map((row) => row.id);
  const studentJornadaMeta = new Map<string, { title: string | null }>();
  for (const row of studentJornadas || []) {
    const jornada = Array.isArray((row as any).jornadas) ? (row as any).jornadas[0] : (row as any).jornadas;
    studentJornadaMeta.set(row.id, {
      title: jornada?.title || null,
    });
  }

  const { data: releaseRows, error: releaseRowsError } = await supabase
    .from("student_jornada_simulados")
    .select("id, student_jornada_id, simulado_id, status, scheduled_release_at")
    .in("student_jornada_id", studentJornadaIds.length ? studentJornadaIds : ["00000000-0000-0000-0000-000000000000"])
    .in("simulado_id", allIds.length ? allIds : ["00000000-0000-0000-0000-000000000000"]);

  if (releaseRowsError) {
    void logSystemError({ source: "api.student.simulados_list", error: releaseRowsError, request });
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar os simulados." },
      { status: 500 },
    );
  }

  const releaseContexts = (releaseRows || []).map((row) => ({
    type: "jornada" as const,
    id: row.id,
    simuladoId: row.simulado_id,
    released: ["available", "in_progress", "completed"].includes(row.status),
    releaseDate: row.scheduled_release_at,
    studentJornadaId: row.student_jornada_id,
    jornadaTitle: studentJornadaMeta.get(row.student_jornada_id)?.title || null,
    eventId: null,
    eventName: null,
    eventResultReleased: null,
  }));

  const { data: eventParticipants, error: eventParticipantsError } = await supabase
    .from("simulado_event_participants")
    .select("id,event_id,result_released_at,simulado_events:event_id(id,name,status,starts_at,ends_at,simulado_id)")
    .eq("student_id", student.id);

  if (eventParticipantsError) {
    void logSystemError({ source: "api.student.simulados_list.events", error: eventParticipantsError, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar os simulados dos seus Eventos." }, { status: 500 });
  }

  const eventContexts = (eventParticipants || []).flatMap((participant) => {
    const event = Array.isArray(participant.simulado_events) ? participant.simulado_events[0] : participant.simulado_events;
    if (!event?.simulado_id || effectiveEventStatus(event) !== "active") return [];
    return [{
      type: "event" as const,
      id: participant.id,
      simuladoId: event.simulado_id,
      released: true,
      releaseDate: event.starts_at,
      studentJornadaId: null,
      jornadaTitle: null,
      eventId: event.id,
      eventName: event.name,
      eventResultReleased: Boolean(participant.result_released_at),
    }];
  });

  type SimuladoRow = NonNullable<typeof simulados>[number];
  type SimuladoContext = (typeof releaseContexts)[number] | (typeof eventContexts)[number];
  const visibleSimulados: Array<{ simulado: SimuladoRow; context: SimuladoContext | null }> = [];
  for (const simulado of simulados || []) {
    const matchingEventContexts = eventContexts.filter((context) => context.simuladoId === simulado.id);
    if (!linkedToJornadaIds.has(simulado.id) && matchingEventContexts.length === 0) {
      visibleSimulados.push({ simulado, context: null });
    }
    for (const release of releaseContexts) {
      if (release.simuladoId === simulado.id) visibleSimulados.push({ simulado, context: release });
    }
    for (const eventContext of matchingEventContexts) {
      visibleSimulados.push({ simulado, context: eventContext });
    }
  }

  const ids = [...new Set(visibleSimulados.map((row) => row.simulado.id))];

  const { data: attempts, error: attemptsError } = await supabase
    .from("simulado_attempts")
    .select(
      "id, simulado_id, status, attempt_number, answered_count, total_questions, progress_percent, started_at, submitted_at, expires_at, counts_toward_limit, attempt_context, event_id, event_participant_id, student_jornada_simulado_id",
    )
    .eq("student_id", student.id)
    .in("simulado_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

  if (attemptsError) {
    void logSystemError({ source: "api.student.simulados_list", error: attemptsError, request });
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar os simulados." },
      { status: 500 },
    );
  }

  const attemptsBySimulado = new Map<string, AttemptRow[]>();
  for (const row of (attempts || []) as AttemptRow[]) {
    const list = attemptsBySimulado.get(row.simulado_id) || [];
    list.push(row);
    attemptsBySimulado.set(row.simulado_id, list);
  }

  const items = visibleSimulados.map(({ simulado, context }) => {
    const allAttempts = (attemptsBySimulado.get(simulado.id) || []).filter((attempt) => context?.type === "event"
      ? attempt.attempt_context === "event" && attempt.event_id === context.eventId && attempt.event_participant_id === context.id
      : context?.type === "jornada"
        ? attempt.attempt_context === "jornada" && attempt.student_jornada_simulado_id === context.id
        : attempt.attempt_context === "standalone" && !attempt.event_id && !attempt.event_participant_id && !attempt.student_jornada_simulado_id);
    const inProgress = allAttempts.find((row) => row.status === "in_progress") || null;
    const limitAttempts = allAttempts.filter((row) => row.counts_toward_limit);
    const completed = limitAttempts.filter((row) => row.status === "completed");
    const incomplete = limitAttempts.filter((row) => row.status !== "completed");
    const disqualified = allAttempts.filter((row) => row.status === "disqualified");
    const used = limitAttempts.length;
    const total = simulado.max_attempts ?? null;
    const remaining = total === null ? null : Math.max(total - used, 0);
    const questionsCount = simulado.question_count ?? (simulado.simulado_questions || []).length;

    let studentStatus: "not_started" | "in_progress" | "completed" | "no_attempts" = "not_started";
    if (inProgress) studentStatus = "in_progress";
    else if (completed.length > 0) studentStatus = "completed";
    if (total !== null && remaining === 0 && !inProgress && completed.length === 0)
      studentStatus = "no_attempts";

    const locked = Boolean(context?.type === "jornada" && !context.released);

    return {
      id: simulado.id,
      title: simulado.title,
      description: simulado.description,
      question_count: questionsCount,
      time_limit_minutes: simulado.time_limit_minutes,
      max_attempts: simulado.max_attempts,
      scoring_model: simulado.scoring_model,
      instant_feedback_enabled: (simulado as any).feedback_mode === "instant" || simulado.instant_feedback_enabled,
      feedback_mode: (simulado as any).feedback_mode || (simulado.instant_feedback_enabled ? "instant" : "final_only"),
      published_at: simulado.published_at,
      student_status: studentStatus,
      attempts_used: used,
      attempts_completed: completed.length,
      attempts_incomplete: incomplete.length,
      attempts_remaining: remaining,
      in_progress_attempt: inProgress,
      last_completed_attempt: completed[0] || null,
      disqualified_count: disqualified.length,
      locked,
      release_date: locked ? context?.releaseDate ?? null : null,
      jornada_id: context?.studentJornadaId ?? null,
      jornada_title: context?.jornadaTitle ?? null,
      event_id: context?.eventId ?? null,
      event_name: context?.eventName ?? null,
      event_result_released: context?.eventResultReleased ?? null,
    };
  });

  return NextResponse.json({ ok: true, simulados: items });
}
