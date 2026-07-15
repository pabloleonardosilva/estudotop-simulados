import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { logSystemError } from "@/app/lib/server/auditLogger";

type StudentJornadaSimuladoRow = {
  id: string;
  simulado_id: string;
  status: string;
  released_at: string | null;
  completed_at: string | null;
};

function todayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

function computeStudentJornadaStatus(status: string, expiresAt: string) {
  if (status === "cancelled") return "cancelled";
  if (expiresAt <= todayDateOnly()) return "expired";
  return status || "active";
}

export async function GET(request: Request) {
  const student = await getStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
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
        status,
        duration_days,
        duration_months,
        planned_simulados_count,
        scope_type,
        category,
        contest_name,
        exam_date,
        effective_end_date
      ),
      student_jornada_simulados(
        id,
        simulado_id,
        status,
        released_at,
        completed_at
      )
    `)
    .eq("student_id", student.id)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });

  if (error) {
    void logSystemError({ source: "api.student.jornadas", error, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar as jornadas." }, { status: 500 });
  }

  const simuladoIds = Array.from(new Set((data || []).flatMap((row: any) =>
    ((row.student_jornada_simulados || []) as StudentJornadaSimuladoRow[]).map((item) => item.simulado_id),
  ).filter(Boolean)));
  const { data: completedAttempts, error: attemptsError } = simuladoIds.length
    ? await supabase
        .from("simulado_attempts")
        .select("simulado_id")
        .eq("student_id", student.id)
        .eq("status", "completed")
        .eq("counts_toward_limit", true)
        .in("simulado_id", simuladoIds)
    : { data: [], error: null };

  if (attemptsError) {
    void logSystemError({ source: "api.student.jornadas.attempts", error: attemptsError, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar as jornadas." }, { status: 500 });
  }

  const completedSimuladoIds = new Set((completedAttempts || []).map((attempt) => attempt.simulado_id));
  const jornadas = (data || []).map((row: any) => {
    const itens = (row.student_jornada_simulados || []) as StudentJornadaSimuladoRow[];
    const linkedTotal = itens.length;
    const total = row.jornadas?.planned_simulados_count || linkedTotal;
    const completed = itens.filter((item) => completedSimuladoIds.has(item.simulado_id)).length;
    const available = itens.filter((item) => item.status === "available" || item.status === "in_progress").length;
    const progress_percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      id: row.id,
      jornada_id: row.jornada_id,
      started_at: row.started_at,
      expires_at: row.expires_at,
      created_at: row.created_at || null,
      status: computeStudentJornadaStatus(row.status, row.expires_at),
      title: row.jornadas?.title || "Jornada",
      description: row.jornadas?.description || null,
      scope_type: row.jornadas?.scope_type || "general",
      category: row.jornadas?.category || "administrativo",
      contest_name: row.jornadas?.contest_name || null,
      duration_days: row.jornadas?.duration_days || null,
      duration_months: row.jornadas?.duration_months || 0,
      planned_simulados_count: row.jornadas?.planned_simulados_count || total,
      exam_date: row.jornadas?.exam_date || null,
      effective_end_date: row.jornadas?.effective_end_date || null,
      total_simulados: total,
      completed_simulados: completed,
      available_simulados: available,
      progress_percent,
    };
  });

  return NextResponse.json({ ok: true, jornadas });
}
