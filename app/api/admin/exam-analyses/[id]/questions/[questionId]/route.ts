import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdmin } from "@/lib/server/authGuard";

function cleanArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; questionId: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const { id, questionId } = await params;
    const body = await request.json();
    const payload: Record<string, unknown> = {};

    for (const key of [
      "statement",
      "question_type",
      "alternatives",
      "answer_key",
      "is_annulled",
      "module_name",
      "subtopic_name",
      "difficulty_level",
      "difficulty_reason",
      "charging_profile",
      "explanation_text",
      "teacher_opinion",
      "status",
      "subject_id",
      "subject_ids",
    ]) {
      if (Object.prototype.hasOwnProperty.call(body, key)) payload[key] = key === "subject_ids" ? cleanArray(body[key]) : body[key];
    }

    if (body.status === "discarded") payload.status = "discarded";
    if (body.status === "confirmed") payload.status = "confirmed";

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("exam_analysis_questions")
      .update(payload)
      .eq("id", questionId)
      .eq("exam_analysis_id", id);

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Erro ao atualizar questão." }, { status: 500 });
  }
}
