import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { logSystemError } from "@/app/lib/server/auditLogger";

type ViolationPayload = {
  violation_number?: number;
};

// Operação transacional (supabase/migrations/20260909170000_atomic_attempt_transitions.sql,
// record_student_attempt_focus): lock por linha da attempt, valida
// status=in_progress dentro da transação (não mais "ler status, depois
// escrever sem condição" — corrige a race real onde um UPDATE concorrente
// podia sobrescrever uma attempt já terminal) e aplica a regra oficial da
// 3ª violação = desclassificação. `violation_number` é tratado como
// sequência idempotente: um retry do mesmo número nunca soma duas vezes
// (bug de dupla contagem existente na versão anterior, corrigido no RPC).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; attemptId: string }> },
) {
  const student = await getStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  }

  const { id: simuladoId, attemptId } = await params;
  const body = (await request.json().catch(() => ({}))) as ViolationPayload;
  const violationNumber = Math.max(1, Math.floor(body.violation_number || 1));

  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase.rpc("record_student_attempt_focus", {
    p_attempt_id: attemptId,
    p_student_id: student.id,
    p_simulado_id: simuladoId,
    p_violation_number: violationNumber,
  });

  if (error) {
    if (error.message?.includes("ATTEMPT_NOT_FOUND")) return NextResponse.json({ ok: false, message: "Tentativa não encontrada." }, { status: 404 });
    if (error.message?.includes("ATTEMPT_FORBIDDEN") || error.message?.includes("ATTEMPT_CONTEXT_INVALID")) return NextResponse.json({ ok: false, message: "Acesso negado." }, { status: 403 });
    void logSystemError({ source: "api.student.focus_violation", error, request, metadata: { attempt_id: attemptId } });
    return NextResponse.json({ ok: false, message: "Não foi possível registrar a violação de foco." }, { status: 500 });
  }

  const result = data as { ok: boolean; http_status?: number; message: string; status?: string; disqualified?: boolean; violation_count?: number };
  return NextResponse.json(
    { ok: result.ok, disqualified: Boolean(result.disqualified), violation_count: result.violation_count },
    { status: result.ok ? 200 : (result.http_status || 409) },
  );
}
