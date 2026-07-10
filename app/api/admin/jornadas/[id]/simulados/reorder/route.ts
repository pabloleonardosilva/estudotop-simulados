import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  try {
    const body = await request.json();
    const orderedIds: string[] = body.ordered_ids;

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return NextResponse.json(
        { ok: false, message: "Informe a lista ordenada de IDs." },
        { status: 400 },
      );
    }

    const supabase = createSupabaseAdminClient();

    const { data: currentLinks, error: currentError } = await supabase
      .from("jornada_simulados")
      .select("id, order_number")
      .eq("jornada_id", id);

    if (currentError) throw new Error(currentError.message);

    const currentIds = new Set((currentLinks || []).map((link) => link.id));
    const uniqueOrderedIds = Array.from(new Set(orderedIds));

    if (uniqueOrderedIds.length !== orderedIds.length) {
      return NextResponse.json(
        { ok: false, message: "A lista de ordenação contém simulados repetidos." },
        { status: 400 },
      );
    }

    const hasForeignId = uniqueOrderedIds.some((linkId) => !currentIds.has(linkId));
    if (hasForeignId || uniqueOrderedIds.length !== currentIds.size) {
      return NextResponse.json(
        { ok: false, message: "A lista de ordenação não corresponde aos simulados desta Jornada." },
        { status: 400 },
      );
    }

    const offset = Math.max(
      10000,
      ...((currentLinks || []).map((link) => Number(link.order_number) || 0)),
    ) + uniqueOrderedIds.length + 100;

    // A tabela possui UNIQUE(jornada_id, order_number). Ao trocar posições
    // diretamente (1 -> 2 e 2 -> 1), o banco pode rejeitar por conflito
    // temporário. Por isso, primeiro movemos todos para uma faixa provisória
    // positiva e única, depois gravamos a ordem final.
    for (const [index, linkId] of uniqueOrderedIds.entries()) {
      const { error } = await supabase
        .from("jornada_simulados")
        .update({ order_number: offset + index })
        .eq("id", linkId)
        .eq("jornada_id", id);

      if (error) throw new Error(error.message);
    }

    for (const [index, linkId] of uniqueOrderedIds.entries()) {
      const { error } = await supabase
        .from("jornada_simulados")
        .update({ order_number: index + 1 })
        .eq("id", linkId)
        .eq("jornada_id", id);

      if (error) throw new Error(error.message);
    }

    return NextResponse.json({ ok: true, message: "Ordem atualizada com sucesso." });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro inesperado." },
      { status: 500 },
    );
  }
}
