import SimuladosClient from "./page-client";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdminPage } from "@/lib/server/authGuard";

async function getData() {
  const supabase = createSupabaseAdminClient();

  const [{ data: simulados, error: simuladosError }, { data: disciplines, error: disciplinesError }, { data: jornadasList, error: jornadasError }] =
    await Promise.all([
      supabase
        .from("simulados")
        .select(`
          id,
          title,
          description,
          discipline_id,
          status,
          time_limit_minutes,
          max_attempts,
          show_result_on_finish,
          show_answer_key_on_finish,
          instant_feedback_enabled,
          show_teacher_comment,
          correction_video_url,
          shuffle_questions,
          shuffle_alternatives,
          allow_blank_answers,
          scoring_model,
          owl_help_enabled,
          question_count,
          updated_at,
          created_at,
          disciplines:discipline_id (
            id,
            name
          ),
          simulado_questions (
            id
          )
        `)
        .order("updated_at", { ascending: false }),
      supabase
        .from("disciplines")
        .select("id, name")
        .eq("is_active", true)
        .order("name", { ascending: true }),
      supabase
        .from("jornadas")
        .select("id, title, status")
        .order("title", { ascending: true }),
    ]);

  if (simuladosError) throw new Error(simuladosError.message);
  if (disciplinesError) throw new Error(disciplinesError.message);
  if (jornadasError) throw new Error(jornadasError.message);

  const simuladoIds = (simulados || []).map((simulado) => simulado.id);

  const [{ data: results }, { data: jornadaLinks }] = simuladoIds.length
    ? await Promise.all([
        supabase
          .from("simulado_results")
          .select("simulado_id, display_score, display_percentage, percentage")
          .in("simulado_id", simuladoIds),
        supabase
          .from("jornada_simulados")
          .select("id, simulado_id, order_number, jornadas(id, title, status)")
          .in("simulado_id", simuladoIds),
      ])
    : [{ data: [] }, { data: [] }];

  const resultsBySimulado = new Map<string, { count: number; averageScore: number | null; averagePercentage: number | null }>();
  for (const simuladoId of simuladoIds) {
    const rows = ((results || []) as any[]).filter((row) => row.simulado_id === simuladoId);
    const scores = rows
      .map((row) => row.display_score)
      .filter((value) => value !== null && value !== undefined)
      .map(Number)
      .filter((value) => Number.isFinite(value));
    const percentages = rows
      .map((row) => row.display_percentage ?? row.percentage)
      .filter((value) => value !== null && value !== undefined)
      .map(Number)
      .filter((value) => Number.isFinite(value));

    resultsBySimulado.set(simuladoId, {
      count: rows.length,
      averageScore: scores.length
        ? Math.round((scores.reduce((acc, value) => acc + value, 0) / scores.length) * 100) / 100
        : null,
      averagePercentage: percentages.length
        ? Math.round((percentages.reduce((acc, value) => acc + value, 0) / percentages.length) * 100) / 100
        : null,
    });
  }

  const jornadasBySimulado = new Map<string, { id: string; title: string; status: string; order_number: number; link_id: string }[]>();
  for (const link of ((jornadaLinks || []) as any[])) {
    const jornada = Array.isArray(link.jornadas) ? link.jornadas[0] : link.jornadas;
    if (!jornada?.id || !jornada?.title) continue;

    const list = jornadasBySimulado.get(link.simulado_id) || [];
    list.push({ id: jornada.id, title: jornada.title, status: jornada.status, order_number: link.order_number, link_id: link.id });
    jornadasBySimulado.set(link.simulado_id, list);
  }

  return {
    simulados: (simulados || []).map((simulado) => {
      const stats = resultsBySimulado.get(simulado.id) || { count: 0, averageScore: null, averagePercentage: null };
      const jornadas = jornadasBySimulado.get(simulado.id) || [];

      return {
        ...simulado,
        execution_count: stats.count,
        average_score: stats.averageScore,
        average_percentage: stats.averagePercentage,
        jornadas_titles: jornadas.map((j) => j.title),
        jornadas_count: jornadas.length,
        jornadas,
      };
    }),
    disciplines: disciplines || [],
    jornadas: jornadasList || [],
  };
}

export default async function SimuladosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage();
  const sp = await searchParams;

  function str(key: string) {
    const v = sp[key];
    return typeof v === "string" ? v : "";
  }

  const initialFilters = {
    search: str("q"),
    status: str("status"),
    disciplineId: str("disciplina"),
    jornadaFilterId: str("jornada"),
    sortMode: str("ordenar"),
  };

  const data = await getData();
  return (
    <SimuladosClient
      simulados={data.simulados as unknown as Parameters<typeof SimuladosClient>[0]["simulados"]}
      disciplines={data.disciplines}
      jornadas={data.jornadas}
      initialFilters={initialFilters}
    />
  );
}
