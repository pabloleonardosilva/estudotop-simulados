import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdmin } from "@/lib/server/authGuard";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await params;
    const body = await request.json();

    const items = Array.isArray(body.items) ? body.items : [];

    if (items.length === 0) {
      return NextResponse.json(
        { ok: false, message: "Nenhuma questão informada para reordenar." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();

    for (const item of items) {
      const relationId = String(item.id || "").trim();
      const orderNumber = Number(item.order_number || 0);

      if (!relationId || !orderNumber) continue;

      const { error } = await supabase
        .from("simulated_test_questions")
        .update({ order_number: orderNumber })
        .eq("id", relationId)
        .eq("simulated_test_id", id);

      if (error) {
        return NextResponse.json(
          { ok: false, message: error.message },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Ordem das questões atualizada.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "Erro inesperado ao reordenar.",
      },
      { status: 500 }
    );
  }
}
