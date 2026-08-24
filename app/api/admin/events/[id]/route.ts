import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { effectiveEventStatus, releasePendingEventResults } from "@/lib/server/simuladoEvents";
import { getPublicAppUrl } from "@/lib/server/publicAppUrl";

type Payload = { action?: unknown; name?: unknown; simulado_id?: unknown; starts_at?: unknown; ends_at?: unknown; duration_minutes?: unknown; result_policy?: unknown; professor_ids?: unknown; cover_key?: unknown };

// Catálogo oficial de capas do Evento (ver app/admin/eventos/utils.ts, fonte
// de verdade da apresentação). Aqui só a lista de chaves válidas — nunca
// aceitar caminho/URL arbitrário vindo do cliente.
const EVENT_COVER_KEYS = ["saude", "policial", "tribunais", "administrativo"] as const;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("simulado_events").select("*,simulados:simulado_id(id,title),simulado_event_professors(professor_id,professors:professor_id(id,name,email)),simulado_event_participants(id,student_id,joined_at,representative_attempt_id,result_released_at,students:student_id(name,email))").eq("id", id).maybeSingle();
  if (error || !data) return NextResponse.json({ ok: false, message: "Evento não encontrado." }, { status: 404 });
  let registrationUrl: string | null = null;
  try { registrationUrl = `${getPublicAppUrl()}/evento/${data.public_slug}`; } catch { registrationUrl = null; }
  return NextResponse.json({ ok: true, message: "Evento carregado.", event: { ...data, effective_status: effectiveEventStatus(data), registration_url: registrationUrl } });
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
    await supabase.from("simulado_events").update({ status: "closed", closed_at: now }).eq("id", id);
    return NextResponse.json({ ok: true, message: "Evento encerrado. Tentativas em andamento foram preservadas." });
  }
  if (body.action === "reopen") {
    const endsAt = typeof body.ends_at === "string" ? body.ends_at : "";
    const endsTime = new Date(endsAt).getTime();
    const startsTime = new Date(current.starts_at).getTime();
    const durationMinutes = Math.round((endsTime - startsTime) / 60_000);
    if (!Number.isFinite(endsTime) || endsTime <= Date.now() || durationMinutes <= 0) return NextResponse.json({ ok: false, message: "Informe um novo término futuro e posterior ao início." }, { status: 400 });
    await supabase.from("simulado_events").update({ status: "active", ends_at: endsAt, duration_minutes: durationMinutes, closed_at: null, archived_at: null }).eq("id", id);
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
    const { data: duplicated, error } = await supabase.from("simulado_events").insert({ name: `${current.name} — cópia`, simulado_id: null, status: "scheduled", starts_at: current.starts_at, ends_at: current.ends_at, duration_minutes: current.duration_minutes, result_policy: current.result_policy, cover_key: current.cover_key, code: `ES-${Math.floor(1000 + Math.random() * 9000)}`, created_by: admin.id }).select("*").single();
    if (error || !duplicated) return NextResponse.json({ ok: false, message: "Não foi possível duplicar o Evento." }, { status: 500 });
    const { data: assignments } = await supabase.from("simulado_event_professors").select("professor_id").eq("event_id", id);
    if (assignments?.length) await supabase.from("simulado_event_professors").insert(assignments.map((item) => ({ event_id: duplicated.id, professor_id: item.professor_id })));
    return NextResponse.json({ ok: true, message: "Evento duplicado sem Simulado e sem participantes.", event: duplicated }, { status: 201 });
  }

  const hasEditableFields = ["name", "simulado_id", "starts_at", "ends_at", "duration_minutes", "result_policy", "professor_ids", "cover_key"]
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

  if (body.cover_key !== undefined && body.cover_key !== null && body.cover_key !== "" && !(EVENT_COVER_KEYS as readonly unknown[]).includes(body.cover_key)) {
    return NextResponse.json({ ok: false, message: "Selecione uma imagem de capa válida para o Evento." }, { status: 400 });
  }

  const professorIds = Array.isArray(body.professor_ids) ? [...new Set(body.professor_ids.filter((value): value is string => typeof value === "string"))] : null;
  if (body.professor_ids !== undefined && !professorIds) return NextResponse.json({ ok: false, message: "Seleção de professores inválida." }, { status: 400 });
  if (professorIds?.length) {
    const { data: validProfessors, error: professorError } = await supabase.from("professors").select("id").in("id", professorIds);
    if (professorError || (validProfessors || []).length !== professorIds.length) return NextResponse.json({ ok: false, message: "Um ou mais professores selecionados são inválidos." }, { status: 400 });
  }

  if (body.simulado_id !== undefined && body.simulado_id !== current.simulado_id) {
    const { count: running } = await supabase.from("simulado_attempts").select("id", { count: "exact", head: true }).eq("event_id", id).eq("is_preview", false).eq("status", "in_progress");
    const { count: completed } = await supabase.from("simulado_attempts").select("id", { count: "exact", head: true }).eq("event_id", id).eq("is_preview", false).eq("status", "completed");
    if (running) return NextResponse.json({ ok: false, message: "Há aluno realizando o Simulado. Aguarde a conclusão para trocar." }, { status: 409 });
    if (completed) return NextResponse.json({ ok: false, message: "O Simulado não pode ser trocado após a primeira conclusão real." }, { status: 409 });
  }

  const updates: Record<string, string | number | null> = {};
  if (typeof body.name === "string" && body.name.trim().length >= 3) updates.name = body.name.trim();
  if (body.simulado_id === null || typeof body.simulado_id === "string") updates.simulado_id = body.simulado_id;
  if (typeof body.starts_at === "string") updates.starts_at = body.starts_at;
  if (typeof body.ends_at === "string") updates.ends_at = body.ends_at;
  if (Number.isInteger(body.duration_minutes) && Number(body.duration_minutes) > 0) updates.duration_minutes = Number(body.duration_minutes);
  if (body.result_policy === "blocked" || body.result_policy === "released") updates.result_policy = body.result_policy;
  if (body.cover_key === null || body.cover_key === "") updates.cover_key = null;
  else if (typeof body.cover_key === "string" && (EVENT_COVER_KEYS as readonly string[]).includes(body.cover_key)) updates.cover_key = body.cover_key;
  const { error } = await supabase.from("simulado_events").update(updates).eq("id", id);
  if (error) return NextResponse.json({ ok: false, message: "Não foi possível atualizar o Evento." }, { status: 500 });
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
  return NextResponse.json({ ok: true, message: "Evento atualizado." });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return PATCH(new Request(request.url, { method: "PATCH", headers: request.headers, body: JSON.stringify({ action: "archive" }) }), context);
}
