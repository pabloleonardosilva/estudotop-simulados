import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeBoardComparableName, normalizeBoardName } from "@/lib/utils/text";

export const ESTUDO_TOP_BOARD_NAME = "Estudo TOP";

export async function findOrCreateEstudoTopBoard(supabase: SupabaseClient) {
  const normalizedName = normalizeBoardName(ESTUDO_TOP_BOARD_NAME);

  const { data: existingBoards, error: existingError } = await supabase
    .from("exam_boards")
    .select("id, name");

  if (existingError) {
    throw new Error(existingError.message);
  }

  const comparable = normalizeBoardComparableName(normalizedName);
  const existingBoard = (existingBoards || []).find(
    (item) => normalizeBoardComparableName(item.name) === comparable,
  );

  if (existingBoard?.id) {
    return {
      id: existingBoard.id as string,
      name: existingBoard.name as string,
      created: false,
    };
  }

  const { data: createdBoard, error: createError } = await supabase
    .from("exam_boards")
    .insert({ name: ESTUDO_TOP_BOARD_NAME, is_active: true })
    .select("id, name")
    .single();

  if (createError || !createdBoard) {
    throw new Error(createError?.message || "Nao foi possivel criar a banca Estudo TOP.");
  }

  return {
    id: createdBoard.id as string,
    name: createdBoard.name as string,
    created: true,
  };
}
