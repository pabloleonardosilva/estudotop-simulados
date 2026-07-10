import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdmin } from "@/lib/server/authGuard";

export async function PATCH(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await request.json();
    const id = String(body.id || "").trim();
    const reviewComment = String(body.review_comment || "").trim();

    if (!id) {
      return NextResponse.json(
        { ok: false, message: "ID da questão não informado." },
        { status: 400 },
      );
    }

    const supabase = createSupabaseAdminClient();

    const { error } = await supabase
      .from("questions")
      .update({ review_comment: reviewComment })
      .eq("id", id);

    if (error) {
      const message = error.message || "Erro ao salvar comentário.";

      if (message.toLowerCase().includes("review_comment")) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "A coluna review_comment ainda não existe no Supabase. Execute o SQL enviado neste pacote para habilitar comentários internos.",
          },
          { status: 400 },
        );
      }

      return NextResponse.json({ ok: false, message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, message: "Comentário interno salvo." });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Erro inesperado ao salvar comentário.",
      },
      { status: 500 },
    );
  }
}
