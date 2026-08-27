import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { closeSimuladoEvent, effectiveEventStatus, releasePendingEventResults, reopenSimuladoEvent } from "@/lib/server/simuladoEvents";
import { getPublicAppUrl } from "@/lib/server/publicAppUrl";
import { logActivity } from "@/lib/logging/activity-log";

type Payload = { action?: unknown; name?: unknown; simulado_id?: unknown; starts_at?: unknown; ends_at?: unknown; duration_minutes?: unknown; result_policy?: unknown; professor_ids?: unknown; card_image_id?: unknown; professor_banner_image_id?: unknown; professor_banner_position_x?: unknown; professor_banner_position_y?: unknown };

function bannerPosition(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100 ? number : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("simulado_events").select("*,simulados:simulado_id(id,title),simulado_event_professors(professor_id,professors:professor_id(id,name,email)),simulado_event_participants(id,student_id,joined_at,representative_attempt_id,result_released_at,students:student_id(name,email))").eq("id", id).maybeSingle();
  if (error || !data) return NextResponse.json({ ok: false, message: "Evento não encontrado." }, { status: 404 });
  let registrationUrl: string | null = null;
  try { registrationUrl = `${getPublicAppUrl()}/evento/${data.public_slug}`; } catch { registrationUrl = null; }
  return NextResponse.json(
    { ok: true, message: "Evento carregado.", event: { ...data, effective_status: effectiveEventStatus(data), registration_url: registrationUrl } },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  const body = await request.json().catch(() => null) as Payload | null;
  if (!body) return NextResponse.json({ ok: false, message: "Dados inválidos." }, { status: 400 });
  const supabase = createSupabaseAdminClient();
  const { data: current } = await supabase.from("simulado_events").select("*").eq("id", id).maybeSingle();
  if (!current) return NextResponse.json({ ok: false, message: "Evento não encontrado." }, { status: 404 });
  const now = new Date().toISOString();

  if (current.status === "archived" && body.action !== "duplicate") {
    return NextResponse.json({ ok: false, message: "Eventos arquivados são somente leitura. Duplique o Evento para reutilizá-lo." }, { status: 409 });
  }

  if (body.action === "start") {
    if (!current.simulado_id) return NextResponse.json({ ok: false, message: "Vincule um Simulado antes de iniciar o Evento." }, { status: 409 });
    if (current.status === "archived" || new Date(current.ends_at) <= new Date()) return NextResponse.json({ ok: false, message: "Este Evento não pode ser iniciado." }, { status: 409 });
    await supabase.from("simulado_events").update({ status: "active", started_at: current.started_at || now }).eq("id", id);
    return NextResponse.json({ ok: true, message: "Evento iniciado." });
  }
  if (body.action === "close") {
    await closeSimuladoEvent(supabase, id);
    return NextResponse.json({ ok: true, message: "Evento encerrado. Tentativas em andamento foram preservadas." });
  }
  if (body.action === "reopen") {
    const endsAt = typeof body.ends_at === "string" ? body.ends_at : "";
    const result = await reopenSimuladoEvent(supabase, current, endsAt);
    if (!result.ok) return NextResponse.json({ ok: false, message: result.message }, { status: 400 });
    return NextResponse.json({ ok: true, message: "Evento reaberto." });
  }
  if (body.action === "archive") {
    await supabase.from("simulado_events").update({ status: "archived", archived_at: now }).eq("id", id);
    return NextResponse.json({ ok: true, message: "Evento arquivado com o histórico preservado." });
  }
  if (body.action === "release_results") {
    const released = await releasePendingEventResults(supabase, id, request);
    return NextResponse.json({ ok: true, message: "Resultados pendentes liberados.", released_count: released.releasedCount });
  }
  if (body.action === "duplicate") {
    const { data: duplicated, error } = await supabase.from("simulado_events").insert({ name: `${current.name} — cópia`, simulado_id: null, status: "scheduled", starts_at: current.starts_at, ends_at: current.ends_at, duration_minutes: current.duration_minutes, result_policy: current.result_policy, card_image_id: current.card_image_id, professor_banner_image_id: current.professor_banner_image_id, professor_banner_position_x: current.professor_banner_position_x, professor_banner_position_y: current.professor_banner_position_y, code: `ES-${Math.floor(1000 + Math.random() * 9000)}`, created_by: admin.id }).select("*").single();
    if (error || !duplicated) return NextResponse.json({ ok: false, message: "Não foi possível duplicar o Evento." }, { status: 500 });
    const { data: assignments } = await supabase.from("simulado_event_professors").select("professor_id").eq("event_id", id);
    if (assignments?.length) await supabase.from("simulado_event_professors").insert(assignments.map((item) => ({ event_id: duplicated.id, professor_id: item.professor_id })));
    return NextResponse.json({ ok: true, message: "Evento duplicado sem Simulado e sem participantes.", event: duplicated }, { status: 201 });
  }

  // Encerramento administrativo excepcional: só afeta tentativas reais
  // (is_preview=false) em_andamento DESTE Evento (event_id = id). Nunca toca
  // tentativas de Jornada, avulsas ou de outro Evento — o mesmo Simulado pode
  // estar vinculado a vários contextos simultaneamente. Reaproveita o mesmo
  // status/motivo já usado pela desclassificação por foco
  // (simulado_attempts.status = 'disqualified'), mas com
  // disqualification_reason distinto ('admin_terminated') para nunca ser
  // confundido com violação de regras pelo aluno. counts_toward_limit passa a
  // true seguindo a mesma regra já aplicada em qualquer desclassificação
  // (ver app/api/student/simulados/[id]/attempts/[attemptId]/focus-violation/route.ts),
  // independentemente do progresso — a tentativa é consumida.
  if (body.action === "terminate_active_attempts") {
    const { data: activeAttempts, error: activeError } = await supabase
      .from("simulado_attempts")
      .select("id, student_id")
      .eq("event_id", id)
      .eq("is_preview", false)
      .eq("status", "in_progress");
    if (activeError) return NextResponse.json({ ok: false, message: "Não foi possível verificar as tentativas em andamento." }, { status: 500 });
    if (!activeAttempts || activeAttempts.length === 0) {
      return NextResponse.json({ ok: true, message: "Não havia tentativas em andamento para encerrar.", terminated_count: 0 });
    }
    const attemptIds = activeAttempts.map((row) => row.id);
    const { data: terminated, error: terminateError } = await supabase
      .from("simulado_attempts")
      .update({
        status: "disqualified",
        disqualified_at: now,
        disqualification_reason: "admin_terminated",
        counts_toward_limit: true,
        counted_at: now,
      })
      .eq("event_id", id)
      .eq("is_preview", false)
      .eq("status", "in_progress")
      .in("id", attemptIds)
      .select("id, student_id");
    if (terminateError) {
      return NextResponse.json({ ok: false, message: "Não foi possível encerrar todas as tentativas em andamento. O Simulado do Evento não foi alterado." }, { status: 500 });
    }
    const terminatedRows = terminated || [];
    for (const row of terminatedRows) {
      await logActivity({
        request,
        actorType: "admin",
        actorId: admin.id,
        actorName: admin.full_name || "Admin",
        action: "event_attempt_admin_terminated",
        entityType: "simulado_attempt",
        entityId: row.id,
        metadata: { event_id: id, event_name: current.name, student_id: row.student_id, previous_simulado_id: current.simulado_id },
      });
    }
    return NextResponse.json({ ok: true, message: `${terminatedRows.length} tentativa(s) em andamento encerrada(s) pelo administrador.`, terminated_count: terminatedRows.length });
  }

  const hasEditableFields = ["name", "simulado_id", "starts_at", "ends_at", "duration_minutes", "result_policy", "professor_ids", "card_image_id", "professor_banner_image_id", "professor_banner_position_x", "professor_banner_position_y"]
    .some((field) => Object.prototype.hasOwnProperty.call(body, field));
  if (!hasEditableFields) return NextResponse.json({ ok: false, message: "Nenhuma alteração válida foi informada." }, { status: 400 });

  const nextName = body.name === undefined ? current.name : typeof body.name === "string" ? body.name.trim() : "";
  const nextStartsAt = body.starts_at === undefined ? current.starts_at : typeof body.starts_at === "string" ? body.starts_at : "";
  const nextEndsAt = body.ends_at === undefined ? current.ends_at : typeof body.ends_at === "string" ? body.ends_at : "";
  const nextDuration = body.duration_minutes === undefined ? current.duration_minutes : Number(body.duration_minutes);
  const nextResultPolicy = body.result_policy === undefined ? current.result_policy : body.result_policy;
  const startsTime = new Date(nextStartsAt).getTime();
  const endsTime = new Date(nextEndsAt).getTime();
  const calculatedDuration = Math.round((endsTime - startsTime) / 60_000);
  if (
    nextName.length < 3
    || !Number.isFinite(startsTime)
    || !Number.isFinite(endsTime)
    || endsTime <= startsTime
    || !Number.isInteger(nextDuration)
    || nextDuration <= 0
    || calculatedDuration !== nextDuration
    || (nextResultPolicy !== "blocked" && nextResultPolicy !== "released")
  ) {
    return NextResponse.json({ ok: false, message: "Informe nome, início, término e duração coerentes." }, { status: 400 });
  }

  if (body.simulado_id !== undefined && body.simulado_id !== null && typeof body.simulado_id !== "string") {
    return NextResponse.json({ ok: false, message: "Simulado inválido." }, { status: 400 });
  }

  for (const [field, imageType] of [["card_image_id", "event_card"], ["professor_banner_image_id", "professor_event_banner"]] as const) {
    if (body[field] === undefined) continue;
    if (field === "card_image_id" && (body[field] === null || body[field] === "")) return NextResponse.json({ ok: false, message: "Selecione a imagem do card do Evento." }, { status: 400 });
    if (body[field] === null || body[field] === "") continue;
    if (typeof body[field] !== "string") return NextResponse.json({ ok: false, message: "Seleção de imagem inválida." }, { status: 400 });
    const { data: image } = await supabase.from("system_images").select("id").eq("id", body[field]).eq("image_type", imageType).maybeSingle();
    if (!image) return NextResponse.json({ ok: false, message: "Selecione uma imagem válida na biblioteca correspondente." }, { status: 400 });
  }

  const professorIds = Array.isArray(body.professor_ids) ? [...new Set(body.professor_ids.filter((value): value is string => typeof value === "string"))] : null;
  if (body.professor_ids !== undefined && !professorIds) return NextResponse.json({ ok: false, message: "Seleção de professores inválida." }, { status: 400 });
  if (professorIds?.length) {
    const { data: validProfessors, error: professorError } = await supabase.from("professors").select("id").in("id", professorIds);
    if (professorError || (validProfessors || []).length !== professorIds.length) return NextResponse.json({ ok: false, message: "Um ou mais professores selecionados são inválidos." }, { status: 400 });
  }

  if (body.simulado_id !== undefined && body.simulado_id !== current.simulado_id) {
    // Mesma verificação que já existia (event_id + is_preview=false +
    // status='in_progress'), sem nenhum embed. `simulado_attempts.student_id`
    // é FK para auth.users(id), não para public.students(id) — um embed
    // `students:student_id(...)` aqui não é resolvível pelo PostgREST e
    // sempre falha, com ou sem tentativa ativa. Nomes são buscados à parte.
    const { data: runningAttempts, error: runningError } = await supabase
      .from("simulado_attempts")
      .select("id, student_id, started_at")
      .eq("event_id", id)
      .eq("is_preview", false)
      .eq("status", "in_progress");
    if (runningError) return NextResponse.json({ ok: false, message: "Não foi possível verificar tentativas em andamento." }, { status: 500 });
    const { count: completed } = await supabase.from("simulado_attempts").select("id", { count: "exact", head: true }).eq("event_id", id).eq("is_preview", false).eq("status", "completed");
    if (runningAttempts && runningAttempts.length > 0) {
      const studentIds = [...new Set(runningAttempts.map((row) => row.student_id))];
      const { data: runningStudents } = await supabase.from("students").select("id, name").in("id", studentIds);
      const nameByStudentId = new Map((runningStudents || []).map((student) => [student.id, student.name]));
      return NextResponse.json({
        ok: false,
        message: "Há aluno realizando o Simulado. Encerre as tentativas em andamento ou aguarde a conclusão para trocar.",
        blocked_reason: "active_attempts",
        active_attempts: runningAttempts.map((row) => ({
          attempt_id: row.id,
          student_name: nameByStudentId.get(row.student_id) || "Aluno",
          started_at: row.started_at,
        })),
      }, { status: 409 });
    }
    if (completed) return NextResponse.json({ ok: false, message: "O Simulado não pode ser trocado após a primeira conclusão real." }, { status: 409 });
  }

  const updates: Record<string, string | number | null> = {};
  if (typeof body.name === "string" && body.name.trim().length >= 3) updates.name = body.name.trim();
  if (body.simulado_id === null || typeof body.simulado_id === "string") updates.simulado_id = body.simulado_id;
  if (typeof body.starts_at === "string") updates.starts_at = body.starts_at;
  if (typeof body.ends_at === "string") updates.ends_at = body.ends_at;
  if (Number.isInteger(body.duration_minutes) && Number(body.duration_minutes) > 0) updates.duration_minutes = Number(body.duration_minutes);
  if (body.result_policy === "blocked" || body.result_policy === "released") updates.result_policy = body.result_policy;
  if (body.card_image_id !== undefined) updates.card_image_id = typeof body.card_image_id === "string" && body.card_image_id ? body.card_image_id : null;
  if (body.professor_banner_image_id !== undefined) updates.professor_banner_image_id = typeof body.professor_banner_image_id === "string" && body.professor_banner_image_id ? body.professor_banner_image_id : null;
  if (body.professor_banner_position_x !== undefined || body.professor_banner_position_y !== undefined) {
    const x = bannerPosition(body.professor_banner_position_x);
    const y = bannerPosition(body.professor_banner_position_y);
    if (x === null || y === null) return NextResponse.json({ ok: false, message: "Posição do banner inválida." }, { status: 400 });
    updates.professor_banner_position_x = x;
    updates.professor_banner_position_y = y;
  }
  if (body.professor_banner_image_id === null || body.professor_banner_image_id === "") {
    updates.professor_banner_position_x = null;
    updates.professor_banner_position_y = null;
  }
  const { data: updatedEvent, error } = await supabase
    .from("simulado_events")
    .update(updates)
    .eq("id", id)
    .select("professor_banner_image_id,professor_banner_position_x,professor_banner_position_y")
    .single();
  if (error || !updatedEvent) return NextResponse.json({ ok: false, message: "Não foi possível atualizar o Evento." }, { status: 500 });
  if (professorIds) {
    const { data: currentAssignments } = await supabase.from("simulado_event_professors").select("professor_id").eq("event_id", id);
    const currentIds = (currentAssignments || []).map((item) => item.professor_id);
    const additions = professorIds.filter((professorId) => !currentIds.includes(professorId));
    const removals = currentIds.filter((professorId) => !professorIds.includes(professorId));
    if (additions.length) {
      const { error: additionError } = await supabase.from("simulado_event_professors").insert(additions.map((professorId) => ({ event_id: id, professor_id: professorId })));
      if (additionError) return NextResponse.json({ ok: false, message: "Não foi possível adicionar os professores selecionados." }, { status: 500 });
    }
    if (removals.length) {
      const { error: removalError } = await supabase.from("simulado_event_professors").delete().eq("event_id", id).in("professor_id", removals);
      if (removalError) return NextResponse.json({ ok: false, message: "Os novos professores foram preservados, mas não foi possível remover todos os vínculos anteriores." }, { status: 500 });
    }
  }
  if (body.result_policy === "released" && current.result_policy !== "released") {
    await releasePendingEventResults(supabase, id, request);
  }
  return NextResponse.json({ ok: true, message: "Evento atualizado.", event: updatedEvent });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return PATCH(new Request(request.url, { method: "PATCH", headers: request.headers, body: JSON.stringify({ action: "archive" }) }), context);
}
