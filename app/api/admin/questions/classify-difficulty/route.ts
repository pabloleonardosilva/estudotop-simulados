import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { predictDifficultyAIBatch } from "@/lib/utils/question-difficulty-ai";
import { requireAdmin } from "@/lib/server/authGuard";

const BATCH_SIZE = 5;

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const supabase = createSupabaseAdminClient();

    const { data: unclassified, error: unclassifiedError } = await supabase
      .from("questions")
      .select("id, statement, question_type, question_alternatives(label, text, order_number)")
      .eq("status", "pending_review")
      .or("difficulty_level.is.null,difficulty_level.eq.0")
      .limit(1000);

    if (unclassifiedError) throw new Error(unclassifiedError.message);

    const totalCount = (unclassified || []).length;

    if (totalCount === 0) {
      return NextResponse.json({
        ok: true,
        total_count: 0,
        classified_count: 0,
        error_count: 0,
        message: "Nenhuma questão em revisão sem estrelinhas encontrada.",
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const questions = (unclassified || []) as any[];
    const grouped = new Map<number, string[]>();
    let errorCount = 0;

    for (let i = 0; i < questions.length; i += BATCH_SIZE) {
      const batch = questions.slice(i, i + BATCH_SIZE);

      try {
        const levels = await predictDifficultyAIBatch(
          batch.map((q) => ({
            statement: q.statement || "",
            alternatives: q.question_alternatives || [],
            question_type: q.question_type,
          })),
        );

        for (let j = 0; j < batch.length; j++) {
          const ids = grouped.get(levels[j]) || [];
          ids.push(batch[j].id);
          grouped.set(levels[j], ids);
        }
      } catch {
        errorCount += batch.length;
      }
    }

    let classifiedCount = 0;

    for (const [difficulty, ids] of grouped.entries()) {
      const { error: updateError } = await supabase
        .from("questions")
        .update({ difficulty_level: difficulty })
        .in("id", ids);

      if (updateError) {
        errorCount += ids.length;
      } else {
        classifiedCount += ids.length;
      }
    }

    return NextResponse.json({
      ok: true,
      total_count: totalCount,
      classified_count: classifiedCount,
      error_count: errorCount,
      message:
        errorCount > 0
          ? `${classifiedCount} questão(ões) classificada(s). ${errorCount} erro(s).`
          : `${classifiedCount} questão(ões) classificada(s) automaticamente.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Erro interno.",
      },
      { status: 500 },
    );
  }
}
