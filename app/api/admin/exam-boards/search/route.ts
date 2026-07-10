import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { normalizeBoardComparableName } from "@/lib/utils/text";
import { requireAdmin } from "@/lib/server/authGuard";

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const { searchParams } = new URL(request.url);
    const q = String(searchParams.get("q") || "").trim();

    const supabase = createSupabaseAdminClient();

    const query = supabase
      .from("exam_boards")
      .select("id, name")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(q ? 200 : 30);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }

    const boards = q
      ? (data || []).filter((board) =>
          normalizeBoardComparableName(board.name).includes(normalizeBoardComparableName(q))
        )
      : data || [];

    return NextResponse.json({ ok: true, boards: boards.slice(0, 30) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro ao pesquisar bancas." },
      { status: 500 }
    );
  }
}
