import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { normalizeBoardComparableName, normalizeBoardName } from "@/lib/utils/text";
import { requireAdmin } from "@/lib/server/authGuard";

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await request.json();
    const rawText = String(body.text || "").trim();

    if (!rawText) {
      return NextResponse.json({ ok: false, message: "Informe pelo menos uma banca." }, { status: 400 });
    }

    const names = Array.from(new Set(rawText.split(/\r?\n/).map(normalizeBoardName).filter(Boolean)));
    const supabase = createSupabaseAdminClient();

    const { data: existingBoards, error: listError } = await supabase
      .from("exam_boards")
      .select("id, name");

    if (listError) throw new Error(listError.message);

    const existingKeys = new Set((existingBoards || []).map((item) => normalizeBoardComparableName(item.name)));

    let createdCount = 0;
    let ignoredCount = 0;
    const created: string[] = [];
    const ignored: string[] = [];

    for (const name of names) {
      const comparable = normalizeBoardComparableName(name);

      if (existingKeys.has(comparable)) {
        ignoredCount += 1;
        ignored.push(name);
        continue;
      }

      const { error } = await supabase.from("exam_boards").insert({ name, is_active: true });
      if (error) throw new Error(error.message);

      createdCount += 1;
      created.push(name);
      existingKeys.add(comparable);
    }

    return NextResponse.json({
      ok: true,
      message: `${createdCount} banca(s) cadastrada(s). ${ignoredCount} ignorada(s) por ja existir(em).`,
      createdCount,
      ignoredCount,
      created,
      ignored,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro inesperado ao cadastrar bancas." },
      { status: 500 }
    );
  }
}
