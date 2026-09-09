import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { logSystemError } from "@/app/lib/server/auditLogger";

type AnswerPayload = {
  simulado_question_id?: string;
  question_id?: string;
  selected_alternative_id?: string | null;
  selected_alternative_label?: string | null;
  response_time_seconds?: number;
};

// Operação transacional (supabase/migrations/20260909170000_atomic_attempt_transitions.sql,
// save_student_attempt_answer): lock por linha da própria attempt (SELECT
// ... FOR UPDATE), valida status/expiração/questão/alternativa, faz upsert
// da resposta e recalcula answered_count/counts_toward_limit (>50%) na MESMA
// transação — nunca dois passos separados como antes. Erro na contagem de
// respostas propaga e desfaz a transação inteira; nunca vira "zero
// respostas" silenciosamente (bug real corrigido nesta Sprint).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; attemptId: string }> },
) {
  const student = await getStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  }

  const { id: simuladoId, attemptId } = await params;
  const body = (await request.json().catch(() => null)) as AnswerPayload | null;

  if (!body || !body.simulado_question_id || !body.question_id || !body.selected_alternative_id) {
    return NextResponse.json(
      { ok: false, message: "Dados da resposta incompletos." },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase.rpc("save_student_attempt_answer", {
    p_attempt_id: attemptId,
    p_student_id: student.id,
    p_simulado_id: simuladoId,
    p_simulado_question_id: body.simulado_question_id,
    p_question_id: body.question_id,
    p_alternative_id: body.selected_alternative_id,
    p_response_time_seconds: Math.max(0, Math.floor(body.response_time_seconds || 0)),
  });

  if (error) {
    if (error.message?.includes("ATTEMPT_NOT_FOUND")) return NextResponse.json({ ok: false, message: "Tentativa não encontrada." }, { status: 404 });
    if (error.message?.includes("ATTEMPT_FORBIDDEN") || error.message?.includes("ATTEMPT_CONTEXT_INVALID")) return NextResponse.json({ ok: false, message: "Acesso negado." }, { status: 403 });
    if (error.message?.includes("INVALID_ALTERNATIVE")) return NextResponse.json({ ok: false, message: "Alternativa inválida para esta questão." }, { status: 400 });
    void logSystemError({ source: "api.student.attempt_answers", error, request, metadata: { attempt_id: attemptId } });
    return NextResponse.json({ ok: false, message: "Não foi possível salvar a resposta." }, { status: 500 });
  }

  const result = data as { ok: boolean; http_status?: number; message: string; is_correct?: boolean | null; is_locked?: boolean; answered_count?: number; progress_percent?: number };
  return NextResponse.json(
    { ok: result.ok, message: result.message, is_correct: result.is_correct ?? null, is_locked: Boolean(result.is_locked), answered_count: result.answered_count, progress_percent: result.progress_percent },
    { status: result.ok ? 200 : (result.http_status || 409) },
  );
}
