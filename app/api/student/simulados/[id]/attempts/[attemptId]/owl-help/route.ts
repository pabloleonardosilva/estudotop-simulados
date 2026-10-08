import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { logSystemError } from "@/app/lib/server/auditLogger";
import { assertAttemptCommercialAccess } from "@/lib/server/studentAssertions";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; attemptId: string }> },
) {
  const student = await getStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  }

  const { id: simuladoId, attemptId } = await params;
  const body = await request.json().catch(() => ({}));
  const simuladoQuestionId = String(body.simulado_question_id || "").trim();

  if (!simuladoQuestionId) {
    return NextResponse.json({ ok: false, message: "Questão não informada." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const commercialAccessError = await assertAttemptCommercialAccess(student.id, attemptId, supabase);
  if (commercialAccessError) return commercialAccessError;

  const { data, error } = await supabase.rpc("consume_student_owl_help", {
    p_attempt_id: attemptId, p_student_id: student.id, p_simulado_id: simuladoId, p_simulado_question_id: simuladoQuestionId,
  });
  if (error) {
    if (error.message?.includes("ATTEMPT_NOT_FOUND")) return NextResponse.json({ ok: false, message: "Tentativa inexistente." }, { status: 404 });
    if (error.message?.includes("ATTEMPT_FORBIDDEN") || error.message?.includes("ATTEMPT_CONTEXT_INVALID")) return NextResponse.json({ ok: false, message: "Acesso negado." }, { status: 403 });
    void logSystemError({ source: "api.student.owl_help", error, request, metadata: { attempt_id: attemptId } });
    return NextResponse.json({ ok: false, message: "Falha ao utilizar ajuda." }, { status: 500 });
  }
  return NextResponse.json(data, { status: data.ok ? 200 : data.http_status || 409 });
}
