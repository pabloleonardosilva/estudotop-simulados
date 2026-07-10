import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { logSecurityEvent, logSystemError } from "@/app/lib/server/auditLogger";

type ViolationPayload = {
  violation_number?: number;
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
  const body = (await request.json().catch(() => ({}))) as ViolationPayload;
  const violationNumber = Math.max(1, Math.floor(body.violation_number || 1));

  const supabase = createSupabaseAdminClient();

  const { data: attempt, error } = await supabase
    .from("simulado_attempts")
    .select(
      "id, simulado_id, student_id, status, tab_switch_count, focus_violation_count",
    )
    .eq("id", attemptId)
    .single();

  if (error || !attempt) {
    return NextResponse.json(
      { ok: false, message: "Tentativa não encontrada." },
      { status: 404 },
    );
  }

  if (attempt.student_id !== student.id) {
    void logSecurityEvent({ event: "student.invalid_attempt_access", actorType: "student", actorId: student.id, resourceType: "attempt", resourceId: attemptId, request, metadata: { simulado_id: simuladoId } });
    return NextResponse.json({ ok: false, message: "Acesso negado." }, { status: 403 });
  }

  if (attempt.simulado_id !== simuladoId) {
    void logSecurityEvent({ event: "student.idor_attempt", actorType: "student", actorId: student.id, resourceType: "attempt", resourceId: attemptId, request, metadata: { requested_simulado_id: simuladoId } });
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

  const nextViolationCount = Math.max((attempt.focus_violation_count || 0) + 1, violationNumber);

  const updatePayload: Record<string, unknown> = {
    tab_switch_count: (attempt.tab_switch_count || 0) + 1,
    focus_violation_count: nextViolationCount,
    last_activity_at: new Date().toISOString(),
  };

  let disqualified = false;
  if (nextViolationCount >= 3) {
    disqualified = true;
    updatePayload.status = "disqualified";
    updatePayload.disqualified_at = new Date().toISOString();
    updatePayload.disqualification_reason = "focus_violation";
    updatePayload.counts_toward_limit = true;
    updatePayload.counted_at = new Date().toISOString();
  }

  const { error: updateError } = await supabase
    .from("simulado_attempts")
    .update(updatePayload)
    .eq("id", attemptId);

  if (updateError) {
    void logSystemError({ source: "api.student.focus_violation", error: updateError, request, metadata: { attempt_id: attemptId } });
    return NextResponse.json(
      { ok: false, message: "Não foi possível registrar a violação de foco." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, disqualified, violation_count: nextViolationCount });
}
