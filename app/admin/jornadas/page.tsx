import JornadasClient from "./page-client";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdminPage } from "@/lib/server/authGuard";
import type { Jornada } from "./types";

async function getData(): Promise<Jornada[]> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("jornadas")
    .select(`
      id,
      title,
      description,
      status,
      scope_type,
      category,
      contest_name,
      planned_simulados_count,
      duration_days,
      duration_months,
      release_duration_days,
      exam_date,
      effective_end_date,
      created_by,
      published_at,
      archived_at,
      created_at,
      updated_at,
      jornada_simulados(id),
      student_jornadas(id)
    `)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data || []).map((j) => ({
    id: j.id,
    title: j.title,
    description: j.description,
    status: j.status as Jornada["status"],
    scope_type: (j.scope_type || "general") as Jornada["scope_type"],
    category: (j.category || null) as Jornada["category"],
    contest_name: j.contest_name || null,
    planned_simulados_count: j.planned_simulados_count || 0,
    duration_days: j.duration_days ?? null,
    duration_months: j.duration_months,
    release_duration_days: j.release_duration_days,
    exam_date: j.exam_date,
    effective_end_date: j.effective_end_date,
    created_by: j.created_by,
    published_at: j.published_at,
    archived_at: j.archived_at,
    created_at: j.created_at,
    updated_at: j.updated_at,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    simulado_count: ((j.jornada_simulados as any[]) || []).length,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    student_count: ((j.student_jornadas as any[]) || []).length,
  }));
}

export default async function JornadasPage() {
  await requireAdminPage();
  const jornadas = await getData();
  return <JornadasClient jornadas={jornadas} />;
}
