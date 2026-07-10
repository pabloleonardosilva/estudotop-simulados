import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdmin } from "@/lib/server/authGuard";

function parseDifficulty(value: unknown) {
  const level = Number(value);
  return Number.isInteger(level) && level >= 1 && level <= 5 ? level : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await params;
    const body = await request.json();
    const difficulty = parseDifficulty(body.difficulty_level);

    if (!id || !difficulty) {
      return NextResponse.json(
        { ok: false, message: "Informe uma dificuldade válida de 1 a 5." },
        { status: 400 },
      );
    }

    const supabase = createSupabaseAdminClient();

    const { error } = await supabase
      .from("questions")
      .update({ difficulty_level: difficulty })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message: "Classificação atualizada com sucesso.",
      difficulty_level: difficulty,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro inesperado ao atualizar classificação." },
      { status: 500 },
    );
  }
}
