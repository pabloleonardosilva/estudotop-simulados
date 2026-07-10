import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdminPage } from "@/lib/server/authGuard";
import EditarJornadaClient from "./page-client";
import type { Jornada, JornadaSimulado, AvailableSimulado } from "../../types";

async function getData(id: string) {
  const supabase = createSupabaseAdminClient();

  const [jornadaRes, simuladosRes] = await Promise.all([
    supabase
      .from("jornadas")
      .select(`
        *,
        jornada_simulados(
          id,
          simulado_id,
          order_number,
          created_at,
          simulados:simulado_id(id, title, status, question_count)
        )
      `)
      .eq("id", id)
      .single(),
    supabase
      .from("simulados")
      .select("id, title, status, question_count")
      .in("status", ["draft", "published"])
      .order("title", { ascending: true }),
  ]);

  if (jornadaRes.error || !jornadaRes.data) return null;

  const j = jornadaRes.data;

  const jornada: Jornada = {
    id: j.id,
    title: j.title,
    description: j.description,
    status: j.status as Jornada["status"],
    scope_type: (j.scope_type || "general") as Jornada["scope_type"],
    category: (j.category || null) as Jornada["category"],
    contest_name: j.contest_name || null,
    exam_name: j.exam_name || null,
    exam_position: j.exam_position || null,
    exam_board: j.exam_board || null,
    welcome_title: j.welcome_title || null,
    welcome_message: j.welcome_message || null,
    study_strategy: j.study_strategy || null,
    important_guidelines: j.important_guidelines || null,
    journey_highlights: Array.isArray(j.journey_highlights) ? j.journey_highlights : [],
    planned_simulados_count: j.planned_simulados_count || 0,
    duration_days: j.duration_days ?? null,
    duration_months: j.duration_months,
    exam_date: j.exam_date,
    effective_end_date: j.effective_end_date,
    created_by: j.created_by,
    published_at: j.published_at,
    archived_at: j.archived_at,
    created_at: j.created_at,
    updated_at: j.updated_at,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jornadaSimulados: JornadaSimulado[] = [...((j.jornada_simulados as any[]) || [])]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .sort((a: any, b: any) => a.order_number - b.order_number);

  const allSimulados: AvailableSimulado[] = (simuladosRes.data || []) as AvailableSimulado[];

  return { jornada, jornadaSimulados, allSimulados };
}

export default async function EditarJornadaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage();
  const { id } = await params;
  const data = await getData(id);

  if (!data) notFound();

  return (
    <EditarJornadaClient
      jornada={data.jornada}
      initialSimulados={data.jornadaSimulados}
      allSimulados={data.allSimulados}
    />
  );
}
