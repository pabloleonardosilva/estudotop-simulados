import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdmin } from "@/lib/server/authGuard";

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || "";
    const supabase = createSupabaseAdminClient();

    let query = supabase
      .from("exam_positions")
      .select("id,name")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(40);

    if (q.trim()) query = query.ilike("name", `%${q.trim()}%`);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, positions: data || [] });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Erro." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ ok: false, message: "Nome obrigatório." }, { status: 400 });

    const supabase = createSupabaseAdminClient();

    const { data: existing } = await supabase
      .from("exam_positions")
      .select("id,name")
      .ilike("name", name)
      .limit(1)
      .maybeSingle();

    if (existing) return NextResponse.json({ ok: true, position: existing, created: false, message: "Cargo já cadastrado." });

    const { data, error } = await supabase.from("exam_positions").insert({ name }).select("id,name").single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, position: data, created: true, message: "Cargo cadastrado com sucesso." }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Erro." }, { status: 500 });
  }
}
