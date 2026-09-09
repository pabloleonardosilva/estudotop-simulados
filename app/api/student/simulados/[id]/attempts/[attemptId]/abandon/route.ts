import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { logActivity } from "@/lib/logging/activity-log";
import { logSystemError } from "@/app/lib/server/auditLogger";

// Abandono explícito de uma tentativa in_progress (botão "Abandonar
// Simulado" e o botão "Voltar" interno, que aciona o mesmo fluxo — ver
// app/meus-simulados/[id]/page-client.tsx). NUNCA disparado por refresh,
// unmount, beforeunload, visibilitychange ou queda de conexão — só por ação
// explícita confirmada em modal.
//
// Operação transacional (supabase/migrations/20260909170000_atomic_attempt_transitions.sql,
// abandon_student_attempt): lock por linha da attempt, recalcula
// counts_toward_limit a partir das respostas persistidas (>50% consome,
// nunca confia em contagem enviada pelo client), marca status=abandoned.
// Idempotente: abandonar uma attempt já abandoned retorna ok sem
// reprocessar (duplo clique/retry não duplica nem altera o consumo já
// decidido). Nunca gera simulado_results, representative_attempt_id ou
// TopCoins — isso é exclusivo de completed via .../submit.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; attemptId: string }> },
) {
  const student = await getStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  }

  const { id: simuladoId, attemptId } = await params;
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase.rpc("abandon_student_attempt", {
    p_attempt_id: attemptId,
    p_student_id: student.id,
    p_simulado_id: simuladoId,
  });

  if (error) {
    if (error.message?.includes("ATTEMPT_NOT_FOUND")) return NextResponse.json({ ok: false, message: "Tentativa não encontrada." }, { status: 404 });
    if (error.message?.includes("ATTEMPT_FORBIDDEN") || error.message?.includes("ATTEMPT_CONTEXT_INVALID")) return NextResponse.json({ ok: false, message: "Acesso negado." }, { status: 403 });
    void logSystemError({ source: "api.student.attempt_abandon", error, request, metadata: { attempt_id: attemptId } });
    return NextResponse.json({ ok: false, message: "Não foi possível encerrar a tentativa." }, { status: 500 });
  }

  const result = data as { ok: boolean; http_status?: number; message: string; status?: string; counts_toward_limit?: boolean };

  if (result.ok) {
    await logActivity({
      request,
      actorType: "student",
      actorId: student.id,
      actorName: student.name,
      actorEmail: student.email,
      action: "simulado_attempt_abandoned",
      entityType: "simulado_attempt",
      entityId: attemptId,
      metadata: { simulado_id: simuladoId, counts_toward_limit: Boolean(result.counts_toward_limit) },
    });
  }

  return NextResponse.json(
    { ok: result.ok, message: result.message, status: result.status, counts_toward_limit: result.counts_toward_limit },
    { status: result.ok ? 200 : (result.http_status || 409) },
  );
}
