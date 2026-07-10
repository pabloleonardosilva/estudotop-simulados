import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { logSystemError } from "@/app/lib/server/auditLogger";

type SimuladoRef = { id: string; title: string; description: string | null };
type JornadaRef = { id: string; title: string; description: string | null; status: string | null };
type StudentJornadaSimuladoRef = { simulado_id: string | null };
type StudentJornadaRow = {
  id: string;
  jornada_id: string;
  status: string;
  jornadas: JornadaRef | JornadaRef[] | null;
  student_jornada_simulados: StudentJornadaSimuladoRef[] | null;
};

type NoteRow = {
  id: string;
  content: string | null;
  created_at: string;
  updated_at: string;
  simulado_id: string;
  simulados: SimuladoRef | SimuladoRef[] | null;
};

function getSimuladoRef(value: NoteRow["simulados"]): SimuladoRef | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function getJornadaRef(value: StudentJornadaRow["jornadas"]): JornadaRef | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

export async function GET(request: Request) {
  const student = await getStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("student_simulado_notes")
    .select(
      `
        id,
        content,
        created_at,
        updated_at,
        simulado_id,
        simulados (
          id,
          title,
          description
        )
      `,
    )
    .eq("student_id", student.id)
    .order("updated_at", { ascending: false });

  if (error) {
    void logSystemError({ source: "api.student.notes.list", error, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar as anotações." }, { status: 500 });
  }

  const noteRows = ((data || []) as NoteRow[]).filter((row) => String(row.content || "").trim().length > 0);
  const simuladoIds = Array.from(new Set(noteRows.map((row) => row.simulado_id).filter(Boolean)));

  const { data: jornadaRows, error: jornadasError } = simuladoIds.length
    ? await supabase
        .from("student_jornadas")
        .select(
          `
            id,
            jornada_id,
            status,
            jornadas:jornada_id (
              id,
              title,
              description,
              status
            ),
            student_jornada_simulados (
              simulado_id
            )
          `,
        )
        .eq("student_id", student.id)
        .neq("status", "cancelled")
    : { data: [] as StudentJornadaRow[], error: null };

  if (jornadasError) {
    void logSystemError({ source: "api.student.notes.jornadas", error: jornadasError, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar as jornadas das anotações." }, { status: 500 });
  }

  const jornadasBySimulado = new Map<string, Array<{ id: string; jornada_id: string; title: string; description: string | null }>>();
  for (const row of ((jornadaRows || []) as StudentJornadaRow[])) {
    const jornada = getJornadaRef(row.jornadas);
    const studentJornada = {
      id: row.id,
      jornada_id: row.jornada_id,
      title: jornada?.title || "Jornada",
      description: jornada?.description || null,
    };

    for (const item of row.student_jornada_simulados || []) {
      if (!item.simulado_id || !simuladoIds.includes(item.simulado_id)) continue;
      const list = jornadasBySimulado.get(item.simulado_id) || [];
      if (!list.some((existing) => existing.id === studentJornada.id)) list.push(studentJornada);
      jornadasBySimulado.set(item.simulado_id, list);
    }
  }

  const notes = noteRows.map((row) => {
    const simulado = getSimuladoRef(row.simulados);
    return {
      id: row.id,
      simulado_id: row.simulado_id,
      simulado_title: simulado?.title || "Simulado sem título",
      simulado_description: simulado?.description || null,
      jornadas: jornadasBySimulado.get(row.simulado_id) || [],
      content: row.content || "",
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });

  return NextResponse.json({ ok: true, notes });
}
