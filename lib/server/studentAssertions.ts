import "server-only";

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "./supabaseAdmin";
import { logSecurityEvent } from "@/app/lib/server/auditLogger";

type Supabase = ReturnType<typeof createSupabaseAdminClient>;

const ACCESS_STATUSES = ["available", "in_progress", "completed"];
const START_STATUSES = ["available", "in_progress"];

async function assertStudentJornadaAccess(
  studentId: string,
  simuladoId: string,
  supabase: Supabase,
  allowedStatuses: string[],
  request?: Request,
): Promise<NextResponse | null> {
  const { data: jornadaLinks } = await supabase
    .from("jornada_simulados")
    .select("id, jornada_id")
    .eq("simulado_id", simuladoId);

  if (!jornadaLinks?.length) return null;

  const today = new Date().toISOString().slice(0, 10);
  const { data: studentJornadas } = await supabase
    .from("student_jornadas")
    .select("id")
    .eq("student_id", studentId)
    .eq("status", "active")
    .in("jornada_id", jornadaLinks.map((row) => row.jornada_id))
    .gt("expires_at", today);

  if (!studentJornadas?.length) {
    void logSecurityEvent({ event: "student.idor_attempt", actorType: "student", actorId: studentId, resourceType: "simulado", resourceId: simuladoId, request, metadata: { reason: "invalid_jornada_enrollment" } });
    return NextResponse.json({ ok: false, message: "Acesso negado." }, { status: 403 });
  }

  const { data: releaseRow } = await supabase
    .from("student_jornada_simulados")
    .select("id")
    .eq("simulado_id", simuladoId)
    .in("student_jornada_id", studentJornadas.map((row) => row.id))
    .in("jornada_simulado_id", jornadaLinks.map((row) => row.id))
    .in("status", allowedStatuses)
    .limit(1)
    .maybeSingle();

  if (!releaseRow) {
    void logSecurityEvent({ event: "student.forbidden", actorType: "student", actorId: studentId, resourceType: "simulado", resourceId: simuladoId, request, metadata: { reason: "simulado_locked" } });
    return NextResponse.json(
      { ok: false, message: "Este simulado ainda não está liberado para você." },
      { status: 403 },
    );
  }

  return null;
}

export async function assertStudentOwnsAttempt(
  studentId: string,
  attemptId: string,
  simuladoId: string,
  supabase: Supabase,
  request?: Request,
): Promise<{ attempt: Record<string, unknown> } | NextResponse> {
  const { data: attempt, error } = await supabase
    .from("simulado_attempts")
    .select("id, student_id, simulado_id, status")
    .eq("id", attemptId)
    .single();

  if (error || !attempt) {
    return NextResponse.json({ ok: false, message: "Tentativa não encontrada." }, { status: 404 });
  }

  if (attempt.student_id !== studentId) {
    void logSecurityEvent({ event: "student.invalid_attempt_access", actorType: "student", actorId: studentId, resourceType: "attempt", resourceId: attemptId, request, metadata: { simulado_id: simuladoId } });
    return NextResponse.json({ ok: false, message: "Acesso negado." }, { status: 403 });
  }

  if (attempt.simulado_id !== simuladoId) {
    void logSecurityEvent({ event: "student.idor_attempt", actorType: "student", actorId: studentId, resourceType: "attempt", resourceId: attemptId, request, metadata: { requested_simulado_id: simuladoId } });
    return NextResponse.json(
      { ok: false, message: "Simulado inválido para esta tentativa." },
      { status: 400 },
    );
  }

  return { attempt };
}

async function assertPublishedSimulado(
  simuladoId: string,
  supabase: Supabase,
  studentId?: string,
  request?: Request,
): Promise<NextResponse | null> {
  const { data: simulado } = await supabase
    .from("simulados")
    .select("id, status")
    .eq("id", simuladoId)
    .maybeSingle();

  if (!simulado) {
    return NextResponse.json({ ok: false, message: "Simulado não encontrado." }, { status: 404 });
  }

  if (simulado.status !== "published") {
    void logSecurityEvent({ event: "student.forbidden", actorType: "student", actorId: studentId, resourceType: "simulado", resourceId: simuladoId, request, metadata: { reason: "simulado_unpublished" } });
    return NextResponse.json(
      { ok: false, message: "Simulado indisponível no momento." },
      { status: 403 },
    );
  }

  return null;
}

export async function assertStudentCanAccessSimulado(
  studentId: string,
  simuladoId: string,
  supabase: Supabase,
  request?: Request,
): Promise<NextResponse | null> {
  const publishedError = await assertPublishedSimulado(simuladoId, supabase, studentId, request);
  if (publishedError) return publishedError;
  return assertStudentJornadaAccess(studentId, simuladoId, supabase, ACCESS_STATUSES, request);
}

export async function assertStudentCanStartSimulado(
  studentId: string,
  simuladoId: string,
  supabase: Supabase,
  request?: Request,
): Promise<NextResponse | null> {
  const publishedError = await assertPublishedSimulado(simuladoId, supabase, studentId, request);
  if (publishedError) return publishedError;
  return assertStudentJornadaAccess(studentId, simuladoId, supabase, START_STATUSES, request);
}

export async function assertStudentHasAttemptedSimulado(
  studentId: string,
  simuladoId: string,
  supabase: Supabase,
  request?: Request,
): Promise<NextResponse | null> {
  const { data: attempt } = await supabase
    .from("simulado_attempts")
    .select("id")
    .eq("student_id", studentId)
    .eq("simulado_id", simuladoId)
    .in("status", ["completed", "disqualified", "expired"])
    .limit(1)
    .maybeSingle();

  if (!attempt) {
    void logSecurityEvent({ event: "student.forbidden", actorType: "student", actorId: studentId, resourceType: "simulado", resourceId: simuladoId, request, metadata: { reason: "feedback_without_completed_attempt" } });
    return NextResponse.json(
      { ok: false, message: "Você precisa realizar o simulado antes de avaliá-lo." },
      { status: 403 },
    );
  }

  return null;
}
