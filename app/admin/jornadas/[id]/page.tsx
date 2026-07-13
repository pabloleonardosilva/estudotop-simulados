import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdminPage } from "@/lib/server/authGuard";
import JornadaDetailClient from "./page-client";
import type { Jornada, JornadaSimulado, StudentJornada, AvailableStudent } from "../types";

async function getData(id: string) {
  const supabase = createSupabaseAdminClient();

  const [jornadaRes, studentsRes] = await Promise.all([
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
        ),
        student_jornadas(
          id,
          student_id,
          started_at,
          expires_at,
          status,
          created_at,
          students:student_id(id, name, email),
          student_jornada_simulados(id, status)
        )
      `)
      .eq("id", id)
      .single(),
    supabase
      .from("students")
      .select("id, name, email, status")
      .in("status", ["pending", "active", "inactive"])
      .order("name", { ascending: true }),
  ]);

  if (jornadaRes.error || !jornadaRes.data) return null;

  const j = jornadaRes.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jornada: Jornada = {
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
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jornadaSimulados: JornadaSimulado[] = [...((j.jornada_simulados as any[]) || [])]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .sort((a: any, b: any) => a.order_number - b.order_number);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const studentJornadas: StudentJornada[] = ((j.student_jornadas as any[]) || []).map((sj: any) => ({
    ...sj,
    progress: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      completed: (sj.student_jornada_simulados || []).filter((s: any) => s.status === "completed").length,
      total: (sj.student_jornada_simulados || []).length,
    },
  }));

  const availableStudents: AvailableStudent[] = (jornadaRes.data && studentsRes.data
    ? (studentsRes.data as AvailableStudent[])
    : []);

  return { jornada, jornadaSimulados, studentJornadas, availableStudents };
}

export default async function JornadaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage();
  const { id } = await params;
  const data = await getData(id);

  if (!data) notFound();

  return (
    <JornadaDetailClient
      jornada={data.jornada}
      jornadaSimulados={data.jornadaSimulados}
      studentJornadas={data.studentJornadas}
      availableStudents={data.availableStudents}
    />
  );
}
