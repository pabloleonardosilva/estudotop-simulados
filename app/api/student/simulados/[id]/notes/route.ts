import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { assertStudentCanAccessSimulado } from "@/lib/server/studentAssertions";
import { logStudentActivity, logSystemError } from "@/app/lib/server/auditLogger";

type NotesPayload = {
  content?: string | null;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const student = await getStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  }

  const { id: simuladoId } = await params;
  const supabase = createSupabaseAdminClient();

  // Valida acesso real ao simulado antes de retornar qualquer metadado
  const accessError = await assertStudentCanAccessSimulado(student.id, simuladoId, supabase, request);
  if (accessError) return accessError;

  const { data: simulado } = await supabase
    .from("simulados")
    .select("id, title")
    .eq("id", simuladoId)
    .maybeSingle();

  if (!simulado) {
    return NextResponse.json(
      { ok: false, message: "Simulado não encontrado." },
      { status: 404 },
    );
  }

  const { data: note, error } = await supabase
    .from("student_simulado_notes")
    .select("id, content, created_at, updated_at")
    .eq("student_id", student.id)
    .eq("simulado_id", simuladoId)
    .maybeSingle();

  if (error) {
    void logSystemError({ source: "api.student.notes", error, request, metadata: { simulado_id: simuladoId } });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar a anotação." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, simulado, note: note || null });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const student = await getStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  }

  const { id: simuladoId } = await params;
  const body = (await request.json().catch(() => ({}))) as NotesPayload;
  const content = String(body.content || "").slice(0, 12000);
  const supabase = createSupabaseAdminClient();

  const accessError = await assertStudentCanAccessSimulado(student.id, simuladoId, supabase, request);
  if (accessError) return accessError;

  const { data: note, error } = await supabase
    .from("student_simulado_notes")
    .upsert(
      {
        student_id: student.id,
        simulado_id: simuladoId,
        content,
      },
      { onConflict: "student_id,simulado_id" },
    )
    .select("id, content, created_at, updated_at")
    .single();

  if (error) {
    void logSystemError({ source: "api.student.notes", error, request, metadata: { simulado_id: simuladoId } });
    return NextResponse.json({ ok: false, message: "Não foi possível salvar a anotação." }, { status: 500 });
  }

  void logStudentActivity({ studentId: student.id, action: "student.notes.updated", entityType: "simulado", entityId: simuladoId, request, metadata: { content_length: content.length } });

  return NextResponse.json({ ok: true, note });
}
