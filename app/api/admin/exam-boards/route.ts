import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { normalizeBoardComparableName, normalizeBoardName } from "@/lib/utils/text";
import { requireAdmin } from "@/lib/server/authGuard";

const FALLBACK_BOARD_NAME = "ANÔNIMA";

async function findDuplicateBoard(name: string) {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("exam_boards")
    .select("id, name");

  if (error) throw new Error(error.message);

  const comparable = normalizeBoardComparableName(name);
  return (data || []).find((item) => normalizeBoardComparableName(item.name) === comparable) || null;
}

async function findOrCreateFallbackBoard(ignoreId?: string) {
  const supabase = createSupabaseAdminClient();
  const existing = await findDuplicateBoard(FALLBACK_BOARD_NAME);

  if (existing?.id && existing.id !== ignoreId) {
    return existing;
  }

  const { data, error } = await supabase
    .from("exam_boards")
    .insert({ name: FALLBACK_BOARD_NAME, is_active: true })
    .select("id, name")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await request.json();
    const name = normalizeBoardName(body.name || "");

    if (!name) {
      return NextResponse.json({ ok: false, message: "Informe o nome da banca." }, { status: 400 });
    }

    const existing = await findDuplicateBoard(name);

    if (existing?.id) {
      return NextResponse.json({ ok: true, board: existing, created: false, message: "Banca ja cadastrada." });
    }

    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("exam_boards")
      .insert({ name, is_active: true })
      .select("id, name")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, board: data, created: true, message: "Banca cadastrada com sucesso." });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro ao cadastrar banca." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ ok: false, message: "ID da banca não informado." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: board, error: boardError } = await supabase
      .from("exam_boards")
      .select("id, name")
      .eq("id", id)
      .maybeSingle();

    if (boardError) throw new Error(boardError.message);

    if (!board?.id) {
      return NextResponse.json({ ok: false, message: "Banca não encontrada." }, { status: 404 });
    }

    if (normalizeBoardComparableName(board.name) === normalizeBoardComparableName(FALLBACK_BOARD_NAME)) {
      return NextResponse.json(
        { ok: false, message: `A banca "${FALLBACK_BOARD_NAME}" é usada como destino de segurança e não pode ser excluída.` },
        { status: 400 },
      );
    }

    const fallbackBoard = await findOrCreateFallbackBoard(id);

    const { count, error: countError } = await supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("exam_board_id", id);

    if (countError) throw new Error(countError.message);

    const movedCount = count || 0;

    if (movedCount > 0) {
      const { error: moveError } = await supabase
        .from("questions")
        .update({ exam_board_id: fallbackBoard.id })
        .eq("exam_board_id", id);

      if (moveError) throw new Error(moveError.message);
    }

    const { error: deleteError } = await supabase
      .from("exam_boards")
      .delete()
      .eq("id", id);

    if (deleteError) throw new Error(deleteError.message);

    return NextResponse.json({
      ok: true,
      movedCount,
      fallbackBoard,
      message:
        movedCount > 0
          ? `Banca excluída. ${movedCount} questão(ões) foram movidas para "${fallbackBoard.name}".`
          : "Banca excluída com sucesso.",
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro ao excluir banca." },
      { status: 500 },
    );
  }
}
