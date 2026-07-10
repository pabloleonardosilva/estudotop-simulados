import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdmin } from "@/lib/server/authGuard";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await params;
    let requestedTitle: string | null = null;
    try {
      const body = await request.json();
      if (typeof body?.title === "string") requestedTitle = body.title.trim();
    } catch {
      requestedTitle = null;
    }

    const supabase = createSupabaseAdminClient();

    const { data: original, error: originalError } = await supabase
      .from("simulados")
      .select("*")
      .eq("id", id)
      .single();

    if (originalError || !original) {
      return NextResponse.json(
        { ok: false, message: originalError?.message || "Simulado original não encontrado." },
        { status: 404 },
      );
    }

    const { data: relations, error: relationsError } = await supabase
      .from("simulado_questions")
      .select("question_id, order_number, points, status, is_required")
      .eq("simulado_id", id)
      .order("order_number", { ascending: true });

    if (relationsError) {
      return NextResponse.json({ ok: false, message: relationsError.message }, { status: 400 });
    }

    const now = new Date().toISOString();
    const copyTitle = requestedTitle || `${original.title || "Simulado"} — Cópia`;

    if (!copyTitle.trim()) {
      return NextResponse.json(
        { ok: false, message: "Informe um nome para a cópia do simulado." },
        { status: 400 },
      );
    }

    const copyPayload = {
      title: copyTitle,
      description: original.description,
      discipline_id: original.discipline_id,
      status: "draft",
      question_count: original.question_count,
      time_limit_minutes: original.time_limit_minutes,
      max_attempts: original.max_attempts,
      attempt_count_threshold_percent: original.attempt_count_threshold_percent,
      show_result_on_finish: original.show_result_on_finish,
      show_answer_key_on_finish: original.show_answer_key_on_finish,
      instant_feedback_enabled: original.instant_feedback_enabled,
      feedback_mode: original.feedback_mode,
      show_teacher_comment: original.show_teacher_comment,
      correction_video_url: original.correction_video_url,
      shuffle_questions: original.shuffle_questions,
      shuffle_alternatives: original.shuffle_alternatives,
      allow_blank_answers: original.allow_blank_answers,
      scoring_model: original.scoring_model,
      owl_help_enabled: Boolean(original.owl_help_enabled),
      published_at: null,
      archived_at: null,
      created_at: now,
      updated_at: now,
    };

    const { data: created, error: createError } = await supabase
      .from("simulados")
      .insert(copyPayload)
      .select("id")
      .single();

    if (createError || !created) {
      return NextResponse.json(
        { ok: false, message: createError?.message || "Erro ao criar cópia do simulado." },
        { status: 400 },
      );
    }

    const rows = (relations || []).map((relation) => ({
      simulado_id: created.id,
      question_id: relation.question_id,
      order_number: relation.order_number,
      points: relation.points ?? 1,
      status: relation.status || "active",
      is_required: relation.is_required ?? true,
    }));

    if (rows.length > 0) {
      const { error: insertRelationsError } = await supabase.from("simulado_questions").insert(rows);
      if (insertRelationsError) {
        await supabase.from("simulados").delete().eq("id", created.id);
        return NextResponse.json({ ok: false, message: insertRelationsError.message }, { status: 400 });
      }
    }

    return NextResponse.json({
      ok: true,
      id: created.id,
      message: `Simulado duplicado como rascunho com ${rows.length} questão(ões).`,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro inesperado ao duplicar simulado." },
      { status: 500 },
    );
  }
}
