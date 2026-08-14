import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

const DRAFT_KEY = "questions-import-ai";
const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024;

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("admin_drafts")
    .select("payload, updated_at")
    .eq("admin_id", admin.id)
    .eq("draft_key", DRAFT_KEY)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, message: "Não foi possível carregar o rascunho sincronizado." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Rascunho consultado com sucesso.", draft: data || null });
}

export async function PUT(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  let body: { payload?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Payload inválido." }, { status: 400 });
  }

  if (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) {
    return NextResponse.json({ ok: false, message: "Rascunho inválido." }, { status: 400 });
  }

  const payloadSize = new TextEncoder().encode(JSON.stringify(body.payload)).byteLength;
  if (payloadSize > MAX_PAYLOAD_BYTES) {
    return NextResponse.json({ ok: false, message: "O rascunho excede o limite de 5 MB." }, { status: 413 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("admin_drafts")
    .upsert(
      { admin_id: admin.id, draft_key: DRAFT_KEY, payload: body.payload },
      { onConflict: "admin_id,draft_key" },
    )
    .select("updated_at")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, message: "Não foi possível sincronizar o rascunho." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Rascunho sincronizado com sucesso.", updated_at: data.updated_at });
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("admin_drafts")
    .delete()
    .eq("admin_id", admin.id)
    .eq("draft_key", DRAFT_KEY);

  if (error) {
    return NextResponse.json({ ok: false, message: "Não foi possível remover o rascunho sincronizado." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Rascunho removido com sucesso." });
}
