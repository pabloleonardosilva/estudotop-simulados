import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { assertStudentHasAttemptedSimulado } from "@/lib/server/studentAssertions";
import { logSecurityEvent, logStudentActivity, logSystemError } from "@/app/lib/server/auditLogger";

type FeedbackPayload = {
  rating?: number;
  comment?: string | null;
  attempt_id?: string | null;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const student = await getStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  }

  const { id: simuladoId } = await params;
  const body = (await request.json().catch(() => ({}))) as FeedbackPayload;
  const rating = Math.floor(Number(body.rating || 0));

  if (!rating || rating < 1 || rating > 5) {
    return NextResponse.json(
      { ok: false, message: "Avaliação deve ser entre 1 e 5 estrelas." },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdminClient();

  const { data: simulado } = await supabase
    .from("simulados")
    .select("id, status")
    .eq("id", simuladoId)
    .maybeSingle();

  if (!simulado) {
    return NextResponse.json(
      { ok: false, message: "Simulado não encontrado." },
      { status: 404 },
    );
  }

  const attemptError = await assertStudentHasAttemptedSimulado(student.id, simuladoId, supabase, request);
  if (attemptError) return attemptError;

  // Valida attempt_id se fornecido no body — deve pertencer ao aluno e ao simulado
  let validatedAttemptId: string | null = null;
  if (body.attempt_id) {
    const { data: attemptRow } = await supabase
      .from("simulado_attempts")
      .select("id, student_id, simulado_id, status")
      .eq("id", body.attempt_id)
      .maybeSingle();

    if (
      !attemptRow
      || attemptRow.student_id !== student.id
      || attemptRow.simulado_id !== simuladoId
      || !["completed", "disqualified", "expired"].includes(attemptRow.status)
    ) {
      void logSecurityEvent({ event: "student.invalid_attempt_access", actorType: "student", actorId: student.id, resourceType: "attempt", resourceId: body.attempt_id, request, metadata: { simulado_id: simuladoId, source: "feedback" } });
      return NextResponse.json({ ok: false, message: "Tentativa inválida." }, { status: 403 });
    }
    validatedAttemptId = attemptRow.id;
  }

  const payload = {
    simulado_id: simuladoId,
    student_id: student.id,
    attempt_id: validatedAttemptId,
    rating,
    comment: body.comment ? String(body.comment).slice(0, 2000) : null,
  };

  const { error } = await supabase
    .from("simulado_feedbacks")
    .upsert(payload, { onConflict: "simulado_id,student_id,attempt_id" });

  if (error) {
    void logSystemError({ source: "api.student.feedback", error, request, metadata: { simulado_id: simuladoId } });
    return NextResponse.json(
      { ok: false, message: "Não foi possível enviar a avaliação." },
      { status: 500 },
    );
  }

  void logStudentActivity({ studentId: student.id, action: "student.feedback.sent", entityType: "simulado", entityId: simuladoId, request, metadata: { attempt_id: validatedAttemptId, rating } });

  return NextResponse.json({ ok: true });
}
