import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { effectiveEventStatus } from "@/lib/server/simuladoEvents";
import { logActivity } from "@/lib/logging/activity-log";
import { logSystemError } from "@/lib/logging/error-log";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const { id: eventId } = await params;
  const supabase = createSupabaseAdminClient();

  const { data: event, error: eventError } = await supabase
    .from("simulado_events")
    .select("id,name,status,starts_at,ends_at,started_at,simulado_id")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError || !event) return NextResponse.json({ ok: false, message: "Evento não encontrado." }, { status: 404 });

  const { data: participants, error: participantsError } = await supabase
    .from("simulado_event_participants")
    .select("id,student_id,joined_at,source,representative_attempt_id,result_released_at,students:student_id(id,name,email,status)")
    .eq("event_id", eventId)
    .order("joined_at", { ascending: false });
  if (participantsError) return NextResponse.json({ ok: false, message: "Não foi possível carregar os participantes." }, { status: 500 });

  const participantIds = (participants || []).map((row) => row.id);
  const { data: attempts, error: attemptsError } = participantIds.length
    ? await supabase.from("simulado_attempts").select("id,event_participant_id").eq("event_id", eventId).not("event_participant_id", "is", null)
    : { data: [], error: null };
  if (attemptsError) return NextResponse.json({ ok: false, message: "Não foi possível carregar as tentativas do Evento." }, { status: 500 });

  const attemptsCountByParticipant = new Map<string, number>();
  for (const attempt of attempts || []) {
    const key = String(attempt.event_participant_id);
    attemptsCountByParticipant.set(key, (attemptsCountByParticipant.get(key) || 0) + 1);
  }

  const enrichedParticipants = (participants || []).map((participant) => ({
    ...participant,
    attempts_count: attemptsCountByParticipant.get(participant.id) || 0,
  }));

  const participantStudentIds = new Set((participants || []).map((row) => row.student_id));
  const { data: eligibleStudents, error: studentsError } = await supabase
    .from("students")
    .select("id,name,email,status")
    .eq("status", "active")
    .order("name", { ascending: true });
  if (studentsError) return NextResponse.json({ ok: false, message: "Não foi possível carregar os alunos disponíveis." }, { status: 500 });

  return NextResponse.json({
    ok: true,
    message: "Participantes carregados.",
    event: { id: event.id, effective_status: effectiveEventStatus(event) },
    participants: enrichedParticipants,
    eligible_students: (eligibleStudents || []).filter((student) => !participantStudentIds.has(student.id)),
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const { id: eventId } = await params;
  const body = await request.json().catch(() => null) as { student_id?: unknown } | null;
  const studentId = typeof body?.student_id === "string" ? body.student_id.trim() : "";
  if (!studentId) return NextResponse.json({ ok: false, message: "Informe o aluno." }, { status: 400 });

  const supabase = createSupabaseAdminClient();

  const { data: event, error: eventError } = await supabase
    .from("simulado_events")
    .select("id,name,status,starts_at,ends_at,started_at,simulado_id")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError || !event) return NextResponse.json({ ok: false, message: "Evento não encontrado." }, { status: 404 });

  const effectiveStatus = effectiveEventStatus(event);
  if (effectiveStatus !== "scheduled" && effectiveStatus !== "active") {
    await logSystemError({
      request,
      source: "admin.event_participant_add_denied",
      actorType: "admin",
      actorId: admin.id,
      errorMessage: "Tentativa de adicionar participante a Evento que não aceita novas participações.",
      safeDetails: { event_id: eventId, student_id: studentId, effective_status: effectiveStatus },
      severity: "warning",
    });
    return NextResponse.json({ ok: false, message: "Este Evento não aceita novas participações." }, { status: 409 });
  }

  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id,name,email,status")
    .eq("id", studentId)
    .maybeSingle();
  if (studentError || !student) return NextResponse.json({ ok: false, message: "Aluno não encontrado." }, { status: 404 });
  if (student.status !== "active") {
    return NextResponse.json({ ok: false, message: "Somente alunos com status Ativo podem ser adicionados a um Evento." }, { status: 409 });
  }

  const { data: existing } = await supabase
    .from("simulado_event_participants")
    .select("id")
    .eq("event_id", eventId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: false, message: "Este aluno já participa deste Evento." }, { status: 409 });
  }

  const { data: participant, error: insertError } = await supabase
    .from("simulado_event_participants")
    .insert({ event_id: eventId, student_id: studentId, source: "admin" })
    .select("id,student_id,joined_at,source,representative_attempt_id,result_released_at,students:student_id(id,name,email,status)")
    .single();

  if (insertError || !participant) {
    if (insertError?.code === "23505") return NextResponse.json({ ok: false, message: "Este aluno já participa deste Evento." }, { status: 409 });
    return NextResponse.json({ ok: false, message: "Não foi possível adicionar o aluno ao Evento." }, { status: 500 });
  }

  await supabase.from("student_activity_log").insert({
    student_id: studentId,
    event_type: "event_participant_added",
    description: `Adicionado ao Evento "${event.name}" pelo administrador`,
    details: { event_id: eventId, event_name: event.name, source: "admin" },
    performed_by_name: admin.full_name || "Admin",
  });

  await logActivity({
    request,
    actorType: "admin",
    actorId: admin.id,
    actorName: admin.full_name || "Admin",
    action: "event_participant_added",
    entityType: "simulado_event_participant",
    entityId: participant.id,
    metadata: { event_id: eventId, event_name: event.name, student_id: studentId, student_email: student.email, source: "admin" },
  });

  return NextResponse.json({ ok: true, message: "Aluno adicionado ao Evento com sucesso.", participant: { ...participant, attempts_count: 0 } }, { status: 201 });
}
