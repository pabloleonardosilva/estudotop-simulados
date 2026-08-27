import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { effectiveEventStatus } from "@/lib/server/simuladoEvents";
import { getPublicAppUrl } from "@/lib/server/publicAppUrl";

type EventPayload = { name?: unknown; simulado_id?: unknown; starts_at?: unknown; ends_at?: unknown; duration_minutes?: unknown; result_policy?: unknown; professor_ids?: unknown; cover_key?: unknown; card_image_id?: unknown; professor_banner_image_id?: unknown };

function code() {
  return `ES-${Math.floor(1000 + Math.random() * 9000)}`;
}

// Catálogo oficial de capas do Evento (ver app/admin/eventos/utils.ts, fonte
// de verdade da apresentação). Aqui só a lista de chaves válidas, no mesmo
// padrão já usado por app/api/admin/jornadas/route.ts para categoria — nunca
// aceitar caminho/URL arbitrário vindo do cliente.
const EVENT_COVER_KEYS = ["saude", "policial", "tribunais", "administrativo"] as const;

// Ausência de capa é válida (usa fallback no frontend); chave presente mas
// fora do catálogo é rejeitada. Lança erro nesse segundo caso.
function normalizeCoverKey(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  const key = String(value);
  if (!(EVENT_COVER_KEYS as readonly string[]).includes(key)) {
    throw new Error("Selecione uma imagem de capa válida para o Evento.");
  }
  return key;
}

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("simulado_events").select("*,simulados:simulado_id(id,title),simulado_event_professors(professor_id,professors:professor_id(id,name))").order("starts_at", { ascending: false });
  if (error) return NextResponse.json({ ok: false, message: "Não foi possível carregar os Eventos." }, { status: 500 });
  let publicAppUrl: string | null = null;
  try { publicAppUrl = getPublicAppUrl(); } catch { publicAppUrl = null; }
  return NextResponse.json({ ok: true, message: "Eventos carregados.", events: (data || []).map((event) => ({ ...event, effective_status: effectiveEventStatus(event), registration_url: publicAppUrl ? `${publicAppUrl}/evento/${event.public_slug}` : null })) });
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const body = await request.json().catch(() => null) as EventPayload | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const startsAt = typeof body?.starts_at === "string" ? body.starts_at : "";
  const endsAt = typeof body?.ends_at === "string" ? body.ends_at : "";
  const duration = Number(body?.duration_minutes);
  const resultPolicy = body?.result_policy === "released" ? "released" : "blocked";
  const professorIds = Array.isArray(body?.professor_ids) ? [...new Set(body.professor_ids.filter((id): id is string => typeof id === "string"))] : [];
  if (name.length < 3 || !startsAt || !endsAt || !Number.isInteger(duration) || duration <= 0 || new Date(endsAt) <= new Date(startsAt)) {
    return NextResponse.json({ ok: false, message: "Informe nome, início, término e duração válidos." }, { status: 400 });
  }
  let coverKey: string | null;
  try {
    coverKey = normalizeCoverKey(body?.cover_key);
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Imagem de capa inválida." }, { status: 400 });
  }
  const simuladoId = typeof body?.simulado_id === "string" && body.simulado_id ? body.simulado_id : null;
  const supabase = createSupabaseAdminClient();
  const cardImageId = typeof body?.card_image_id === "string" && body.card_image_id ? body.card_image_id : null;
  const bannerImageId = typeof body?.professor_banner_image_id === "string" && body.professor_banner_image_id ? body.professor_banner_image_id : null;
  for (const [imageId, imageType] of [[cardImageId, "event_card"], [bannerImageId, "professor_event_banner"]] as const) {
    if (!imageId) continue;
    const { data: image } = await supabase.from("system_images").select("id").eq("id", imageId).eq("image_type", imageType).maybeSingle();
    if (!image) return NextResponse.json({ ok: false, message: "Selecione uma imagem válida na biblioteca correspondente." }, { status: 400 });
  }
  if (professorIds.length) {
    const { data: validProfessors, error: professorError } = await supabase.from("professors").select("id").in("id", professorIds);
    if (professorError || (validProfessors || []).length !== professorIds.length) return NextResponse.json({ ok: false, message: "Um ou mais professores selecionados são inválidos." }, { status: 400 });
  }
  let created = null;
  for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
    const result = await supabase.from("simulado_events").insert({ name, simulado_id: simuladoId, starts_at: startsAt, ends_at: endsAt, duration_minutes: duration, result_policy: resultPolicy, cover_key: coverKey, card_image_id: cardImageId, professor_banner_image_id: bannerImageId, code: code(), created_by: admin.id }).select("*").single();
    if (!result.error) created = result.data;
    else if (result.error.code !== "23505") return NextResponse.json({ ok: false, message: "Não foi possível criar o Evento." }, { status: 500 });
  }
  if (!created) return NextResponse.json({ ok: false, message: "Não foi possível gerar o código do Evento." }, { status: 500 });
  if (professorIds.length) {
    const { error } = await supabase.from("simulado_event_professors").insert(professorIds.map((professorId) => ({ event_id: created.id, professor_id: professorId })));
    if (error) {
      await supabase.from("simulado_events").delete().eq("id", created.id);
      return NextResponse.json({ ok: false, message: "Não foi possível criar o Evento com os professores selecionados." }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true, message: "Evento criado com sucesso.", event: created }, { status: 201 });
}
