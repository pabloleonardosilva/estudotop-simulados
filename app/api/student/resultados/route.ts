import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { logSystemError } from "@/app/lib/server/auditLogger";

type JornadaRow = {
  jornada_id: string;
  started_at: string | null;
  jornadas: { title: string | null } | { title: string | null }[] | null;
  student_jornada_simulados: { simulado_id: string; order_number: number | null }[] | null;
};

type AttemptRow = {
  id: string;
  simulado_id: string;
  submitted_at: string | null;
  created_at: string | null;
  simulados: { id: string; title: string | null; published_at: string | null } | { id: string; title: string | null; published_at: string | null }[] | null;
};

type SimuladoMeta = {
  jornada_id: string;
  jornada_title: string;
  jornada_started_at: string | null;
  order_number: number | null;
};

function simuladoRef(value: AttemptRow["simulados"]) {
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
        jornada_id,
        started_at,
        jornadas:jornada_id ( title ),
        student_jornada_simulados ( simulado_id, order_number )
      `,
    )
    .eq("student_id", student.id);

  if (jornadasError) {
    void logSystemError({ source: "api.student.resultados.jornadas", error: jornadasError, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar seus resultados." }, { status: 500 });
  }

  const metaBySimulado = new Map<string, SimuladoMeta>();
  for (const row of (rawJornadas || []) as JornadaRow[]) {
    const jornadaTitle = (Array.isArray(row.jornadas) ? row.jornadas[0]?.title : row.jornadas?.title) || "Jornada";
    for (const item of row.student_jornada_simulados || []) {
      if (!item?.simulado_id) continue;
      metaBySimulado.set(item.simulado_id, {
        jornada_id: row.jornada_id,
        jornada_title: jornadaTitle,
        jornada_started_at: row.started_at,
        order_number: item.order_number,
      });
    }
  }

  const { data: attempts, error: attemptsError } = await supabase
    .from("simulado_attempts")
    .select(
      `
        id,
        simulado_id,
        submitted_at,
        created_at,
        simulados:simulado_id ( id, title, published_at )
      `,
    )
    .eq("student_id", student.id)
    .eq("status", "completed")
    .order("submitted_at", { ascending: false, nullsFirst: false });

  if (attemptsError) {
    void logSystemError({ source: "api.student.resultados.attempts", error: attemptsError, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar seus resultados." }, { status: 500 });
  }

  const seen = new Set<string>();
  const results: Array<{
    simulado_id: string;
    simulado_title: string;
    jornada_title: string | null;
    submitted_at: string | null;
    _jornada_id: string | null;
    _jornada_started_at: string | null;
    _order_number: number | null;
    _published_at: string | null;
  }> = [];

  for (const row of (attempts || []) as AttemptRow[]) {
    if (seen.has(row.simulado_id)) continue;
    seen.add(row.simulado_id);

    const simulado = simuladoRef(row.simulados);
    const meta = metaBySimulado.get(row.simulado_id) || null;

    results.push({
      simulado_id: row.simulado_id,
      simulado_title: simulado?.title || "Simulado",
      jornada_title: meta?.jornada_title || null,
      submitted_at: row.submitted_at || row.created_at,
      _jornada_id: meta?.jornada_id || null,
      _jornada_started_at: meta?.jornada_started_at || null,
      _order_number: meta?.order_number ?? null,
      _published_at: simulado?.published_at || null,
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
    results: results.map(({ simulado_id, simulado_title, jornada_title, submitted_at }) => ({
      simulado_id,
      simulado_title,
      jornada_title,
      submitted_at,
    })),
  });
}
