import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { logSystemError } from "@/app/lib/server/auditLogger";

type JornadaRow = {
  id: string;
  jornada_id: string;
  started_at: string | null;
  jornadas: { title: string | null } | { title: string | null }[] | null;
  student_jornada_simulados: { id: string; simulado_id: string; order_number: number | null }[] | null;
};

type AttemptRow = {
  id: string;
  simulado_id: string;
  submitted_at: string | null;
  created_at: string | null;
  attempt_context: string;
  student_jornada_simulado_id: string | null;
  simulados: { id: string; title: string | null; published_at: string | null } | { id: string; title: string | null; published_at: string | null }[] | null;
};

type EventParticipantRow = {
  id: string;
  result_released_at: string | null;
  simulado_events: { id: string; name: string; simulado_id: string | null } | { id: string; name: string; simulado_id: string | null }[] | null;
};

type SimuladoMeta = {
  student_jornada_id: string;
  jornada_id: string;
  jornada_title: string;
  jornada_started_at: string | null;
  order_number: number | null;
};

function simuladoRef(value: AttemptRow["simulados"]) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function eventRef(value: EventParticipantRow["simulado_events"]) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

export async function GET(request: Request) {
  const student = await getStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();

  const { data: rawJornadas, error: jornadasError } = await supabase
    .from("student_jornadas")
    .select(
      `
        id,
        jornada_id,
        started_at,
        jornadas:jornada_id ( title ),
        student_jornada_simulados ( id, simulado_id, order_number )
      `,
    )
    .eq("student_id", student.id);

  if (jornadasError) {
    void logSystemError({ source: "api.student.resultados.jornadas", error: jornadasError, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar seus resultados." }, { status: 500 });
  }

  const metaByScheduleItem = new Map<string, SimuladoMeta>();
  for (const row of (rawJornadas || []) as JornadaRow[]) {
    const jornadaTitle = (Array.isArray(row.jornadas) ? row.jornadas[0]?.title : row.jornadas?.title) || "Jornada";
    for (const item of row.student_jornada_simulados || []) {
      if (!item?.simulado_id) continue;
      metaByScheduleItem.set(item.id, {
        student_jornada_id: row.id,
        jornada_id: row.jornada_id,
        jornada_title: jornadaTitle,
        jornada_started_at: row.started_at,
        order_number: item.order_number,
      });
    }
  }

  // Simulados de Jornada/avulso: comportamento já existente, preservado
  // integralmente. Tentativas de Evento (event_participant_id preenchido)
  // são tratadas à parte, abaixo.
  const { data: attempts, error: attemptsError } = await supabase
    .from("simulado_attempts")
    .select(
      `
        id,
        simulado_id,
        submitted_at,
        created_at,
        attempt_context,
        student_jornada_simulado_id,
        simulados:simulado_id ( id, title, published_at )
      `,
    )
    .eq("student_id", student.id)
    .eq("status", "completed")
    .eq("counts_toward_limit", true)
    .is("event_participant_id", null)
    .order("submitted_at", { ascending: false, nullsFirst: false });

  if (attemptsError) {
    void logSystemError({ source: "api.student.resultados.attempts", error: attemptsError, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar seus resultados." }, { status: 500 });
  }

  // Simulados de Evento: "concluído" usa a MESMA fonte de verdade já usada
  // por `/api/student/simulados/[id]/resultado` quando aberta sem
  // `attemptId` — primeira tentativa `completed` com `counts_toward_limit
  // = true`, ordenada por `submitted_at` crescente (nunca "melhor
  // tentativa") — só que escopada por `event_participant_id`, nunca
  // vazando de Jornada/avulso/outro Evento. Deliberadamente não usa
  // `representative_attempt_id` isoladamente: quando a tentativa
  // representativa é desclassificada (ex.: foco, encerramento
  // administrativo) e uma tentativa seguinte é concluída, essa é a mesma
  // tentativa que a rota de resultado já exibiria — usar apenas
  // `representative_attempt_id` faria o Evento sumir de "Meus Resultados"
  // mesmo com resultado real acessível via URL direta quando liberado.
  // Resultado bloqueado (result_released_at = null) continua aparecendo —
  // apenas sem nota, sem link de resultado e sem vazar nenhum dado
  // sensível: esta rota nunca retornou nota/percentual/gabarito, e a rota
  // de resultado já valida `result_released_at` no servidor antes de
  // entregar qualquer dado.
  const { data: eventParticipants, error: eventParticipantsError } = await supabase
    .from("simulado_event_participants")
    .select(
      `
        id,
        result_released_at,
        simulado_events:event_id ( id, name, simulado_id )
      `,
    )
    .eq("student_id", student.id);

  if (eventParticipantsError) {
    void logSystemError({ source: "api.student.resultados.event_participants", error: eventParticipantsError, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar seus resultados." }, { status: 500 });
  }

  const eventParticipantIds = (eventParticipants || []).map((row) => row.id);

  const { data: eventAttempts, error: eventAttemptsError } = eventParticipantIds.length
    ? await supabase
      .from("simulado_attempts")
      .select("id, event_participant_id, submitted_at, created_at")
      .in("event_participant_id", eventParticipantIds)
      .eq("status", "completed")
      .eq("counts_toward_limit", true)
      .order("submitted_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
    : { data: [], error: null };

  if (eventAttemptsError) {
    void logSystemError({ source: "api.student.resultados.event_attempts", error: eventAttemptsError, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar seus resultados." }, { status: 500 });
  }

  // Já ordenado por submitted_at/created_at ascendente: a primeira
  // ocorrência por event_participant_id é a tentativa oficial.
  const firstCompletedByParticipantId = new Map<string, { id: string; submitted_at: string | null; created_at: string | null }>();
  for (const row of eventAttempts || []) {
    const key = row.event_participant_id;
    if (!key || firstCompletedByParticipantId.has(key)) continue;
    firstCompletedByParticipantId.set(key, row);
  }

  const eventSimuladoIds = [...new Set(
    ((eventParticipants || []) as EventParticipantRow[])
      .map((row) => eventRef(row.simulado_events)?.simulado_id)
      .filter((value): value is string => Boolean(value)),
  )];

  const { data: eventSimulados } = eventSimuladoIds.length
    ? await supabase.from("simulados").select("id, title").in("id", eventSimuladoIds)
    : { data: [] };
  const eventSimuladoTitleById = new Map((eventSimulados || []).map((row) => [row.id, row.title]));

  const seen = new Set<string>();
  const results: Array<{
    simulado_id: string;
    simulado_title: string;
    jornada_title: string | null;
    submitted_at: string | null;
    source: "jornada" | "standalone" | "event";
    event_id: string | null;
    event_name: string | null;
    result_status: "available" | "pending_release";
    can_view: boolean;
    _jornada_id: string | null;
    _jornada_started_at: string | null;
    _order_number: number | null;
    _published_at: string | null;
    jornada_context_id: string | null;
  }> = [];

  for (const row of (attempts || []) as AttemptRow[]) {
    const meta = row.student_jornada_simulado_id ? metaByScheduleItem.get(row.student_jornada_simulado_id) || null : null;
    const contextKey = meta ? `jornada:${row.student_jornada_simulado_id}` : `standalone:${row.simulado_id}`;
    if (seen.has(contextKey)) continue;
    seen.add(contextKey);

    const simulado = simuladoRef(row.simulados);

    results.push({
      simulado_id: row.simulado_id,
      simulado_title: simulado?.title || "Simulado",
      jornada_title: meta?.jornada_title || null,
      submitted_at: row.submitted_at || row.created_at,
      source: meta ? "jornada" : "standalone",
      event_id: null,
      event_name: null,
      result_status: "available",
      can_view: true,
      _jornada_id: meta?.jornada_id || null,
      _jornada_started_at: meta?.jornada_started_at || null,
      _order_number: meta?.order_number ?? null,
      _published_at: simulado?.published_at || null,
      jornada_context_id: meta?.student_jornada_id || null,
    });
  }

  for (const participant of (eventParticipants || []) as EventParticipantRow[]) {
    const attempt = firstCompletedByParticipantId.get(participant.id);
    if (!attempt) continue; // nenhuma tentativa concluída ainda neste Evento — nada a exibir
    const event = eventRef(participant.simulado_events);
    if (!event?.simulado_id) continue;
    const contextKey = `event:${participant.id}`;
    if (seen.has(contextKey)) continue;
    seen.add(contextKey);

    const submittedAt = attempt.submitted_at || attempt.created_at;
    results.push({
      simulado_id: event.simulado_id,
      simulado_title: eventSimuladoTitleById.get(event.simulado_id) || "Simulado",
      jornada_title: null,
      submitted_at: submittedAt,
      source: "event",
      event_id: event.id,
      event_name: event.name,
      result_status: participant.result_released_at ? "available" : "pending_release",
      can_view: Boolean(participant.result_released_at),
      _jornada_id: null,
      _jornada_started_at: null,
      _order_number: null,
      _published_at: submittedAt,
      jornada_context_id: null,
    });
  }

  // Agrupado por Jornada (jornadas mais antigas primeiro), com os simulados de
  // cada Jornada em ordem cronológica de liberação (order_number crescente).
  // Simulados avulsos (sem Jornada) vêm depois, ordenados pela data de publicação.
  results.sort((a, b) => {
    const aAvulso = a._jornada_id === null;
    const bAvulso = b._jornada_id === null;
    if (aAvulso !== bAvulso) return aAvulso ? 1 : -1;

    if (!aAvulso) {
      const startCompare = String(a._jornada_started_at || "").localeCompare(String(b._jornada_started_at || ""));
      if (startCompare !== 0) return startCompare;
      if (a._jornada_id !== b._jornada_id) return String(a._jornada_id).localeCompare(String(b._jornada_id));
      return Number(a._order_number ?? 0) - Number(b._order_number ?? 0);
    }

    return String(a._published_at || "").localeCompare(String(b._published_at || ""));
  });

  return NextResponse.json({
    ok: true,
    results: results.map(({ simulado_id, simulado_title, jornada_title, submitted_at, source, event_id, event_name, result_status, can_view, jornada_context_id }) => ({
      simulado_id,
      simulado_title,
      jornada_title,
      submitted_at,
      source,
      event_id,
      event_name,
      result_status,
      can_view,
      jornada_context_id,
    })),
  });
}
