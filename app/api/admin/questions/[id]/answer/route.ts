import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdmin } from "@/lib/server/authGuard";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await params;
    const body = await request.json();
    const alternativeId = String(body.alternative_id || "").trim();

    if (!id || !alternativeId) {
      return NextResponse.json(
        { ok: false, message: "Informe a questão e a alternativa correta." },
        { status: 400 },
      );
    }

    const supabase = createSupabaseAdminClient();

    const { data: alternative, error: alternativeError } = await supabase
      .from("question_alternatives")
      .select("id, question_id, label")
      .eq("id", alternativeId)
      .eq("question_id", id)
      .single();

    if (alternativeError || !alternative) {
      return NextResponse.json(
        { ok: false, message: "Alternativa não encontrada para esta questão." },
        { status: 404 },
      );
    }

    const { error: clearError } = await supabase
      .from("question_alternatives")
      .update({ is_correct: false })
      .eq("question_id", id);

    if (clearError) {
      return NextResponse.json({ ok: false, message: clearError.message }, { status: 400 });
    }

    const { error: setError } = await supabase
      .from("question_alternatives")
      .update({ is_correct: true })
      .eq("id", alternativeId)
      .eq("question_id", id);

    if (setError) {
      return NextResponse.json({ ok: false, message: setError.message }, { status: 400 });
    }

    const { error: questionError } = await supabase
      .from("questions")
      .update({ correct_alternative_label: alternative.label || null })
      .eq("id", id);

    if (questionError) {
      return NextResponse.json({ ok: false, message: questionError.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message: "Gabarito atualizado com sucesso.",
      correct_alternative_id: alternativeId,
      correct_alternative_label: alternative.label || null,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro inesperado ao atualizar gabarito." },
      { status: 500 },
    );
  }
}
