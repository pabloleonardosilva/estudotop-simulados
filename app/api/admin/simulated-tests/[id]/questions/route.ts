import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdmin } from "@/lib/server/authGuard";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await params;
    const body = await request.json();

    const questionIds = Array.isArray(body.question_ids) ? body.question_ids : [];

    if (questionIds.length === 0) {
      return NextResponse.json(
        { ok: false, message: "Selecione pelo menos uma questão." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();

    const { data: existing, error: existingError } = await supabase
      .from("simulated_test_questions")
      .select("question_id, order_number")
      .eq("simulated_test_id", id)
      .order("order_number", { ascending: false });

    if (existingError) {
      return NextResponse.json(
        { ok: false, message: existingError.message },
        { status: 400 }
      );
    }

    const existingIds = new Set((existing || []).map((item: any) => item.question_id));
    const maxOrder = existing?.[0]?.order_number || 0;

    const rows = questionIds
      .filter((questionId: string) => !existingIds.has(questionId))
      .map((questionId: string, index: number) => ({
        simulated_test_id: id,
        question_id: questionId,
        order_number: maxOrder + index + 1,
        points: 1,
      }));

    if (rows.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "As questões selecionadas já estavam no simulado.",
      });
    }

    const { error } = await supabase
      .from("simulated_test_questions")
      .insert(rows);

    if (error) {
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: `${rows.length} questão(ões) adicionada(s) ao simulado.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Erro inesperado ao adicionar questões.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await params;
    const body = await request.json();

    const relationId = String(body.relation_id || "").trim();

    if (!relationId) {
      return NextResponse.json(
        { ok: false, message: "Relação da questão não informada." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();

    const { error } = await supabase
      .from("simulated_test_questions")
      .delete()
      .eq("id", relationId)
      .eq("simulated_test_id", id);

    if (error) {
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Questão removida do simulado.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Erro inesperado ao remover questão.",
      },
      { status: 500 }
    );
  }
}
