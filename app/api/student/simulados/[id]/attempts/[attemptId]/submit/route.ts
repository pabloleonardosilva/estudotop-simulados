import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { completeSimuladoAttempt } from "@/lib/server/simuladoAttemptCompletion";
import { assertAttemptCommercialAccess } from "@/lib/server/studentAssertions";

type SubmitPayload = {
  time_spent_seconds?: number;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; attemptId: string }> },
) {
  const student = await getStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  }

  const { id: simuladoId, attemptId } = await params;
  const body = (await request.json().catch(() => ({}))) as SubmitPayload;

  const supabase = createSupabaseAdminClient();

  const { data: attempt, error: attemptError } = await supabase
    .from("simulado_attempts")
    .select("*")
    .eq("id", attemptId)
    .single();

  if (attemptError || !attempt) {
    return NextResponse.json(
      { ok: false, message: "Tentativa não encontrada." },
      { status: 404 },
    );
  }

  if (attempt.student_id !== student.id) {
    return NextResponse.json({ ok: false, message: "Acesso negado." }, { status: 403 });
  }

  if (attempt.simulado_id !== simuladoId) {
    return NextResponse.json(
      { ok: false, message: "Simulado inválido para esta tentativa." },
      { status: 400 },
    );
  }

  if (attempt.status !== "in_progress") {
    return NextResponse.json(
      { ok: false, message: "Tentativa já encerrada." },
      { status: 409 },
    );
  }

  // Bloqueio comercial (Hotmart): só se aplica aqui — origin "manual" é a
  // única chamada desta função disparada por uma requisição real do aluno.
  // NUNCA propagado para dentro de completeSimuladoAttempt: o job de
  // timeout (origin "timeout_cron") e a reconciliação histórica (origin
  // "historical_reconciliation") continuam podendo concluir a mesma
  // tentativa mesmo com o acesso comercial bloqueado — política aprovada na
  // Fase 4B, para nunca deixar uma tentativa presa em in_progress só porque
  // o aluno perdeu o acesso comercial no meio dela.
  const commercialAccessError = await assertAttemptCommercialAccess(student.id, attemptId, supabase);
  if (commercialAccessError) return commercialAccessError;

  // Ownership/contexto já validados acima (sessão do aluno + attempt.student_id
  // + attempt.simulado_id) — a partir daqui, a conclusão em si (scoring,
  // RPC atômica, representative, result release, TopCoins, e-mails, logs) é
  // a MESMA função usada pelo job de timeout server-side — nunca duplicada.
  const result = await completeSimuladoAttempt(supabase, {
    attempt,
    studentId: student.id,
    studentName: student.name,
    studentEmail: student.email,
    simuladoId,
    timeSpentSeconds: Math.max(0, Math.floor(body.time_spent_seconds || 0)),
    origin: "manual",
    request,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, message: result.message, result_id: result.resultId },
      { status: result.httpStatus },
    );
  }

  return NextResponse.json({
    ok: true,
    result_id: result.resultId,
    earned_topcoins: result.earnedTopcoins,
    result_released: result.resultReleased,
    result_access: result.resultAccess,
    event_id: result.eventId,
  });
}
