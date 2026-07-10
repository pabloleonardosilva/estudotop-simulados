import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { normalizeEvaluatedTopics } from "@/lib/questions/evaluated-topics";
import { requireAdmin } from "@/lib/server/authGuard";

type SimuladoQuestionPutItem = {
  question_id?: string | null;
  points?: number | string | null;
  status?: string | null;
};

type SimuladoQuestionRelationRow = {
  id: string;
  question_id: string;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await params;
    const body = await request.json();
    const questionIds = Array.isArray(body.question_ids) ? body.question_ids.map(String).filter(Boolean) : [];

    if (questionIds.length === 0) {
      return NextResponse.json({ ok: false, message: "Selecione pelo menos uma questão." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const providedTopics = normalizeEvaluatedTopics(body.evaluated_topics);

    if (questionIds.length === 1 && providedTopics.length > 0) {
      const { error: topicsError } = await supabase
        .from("questions")
        .update({ evaluated_topics: providedTopics })
        .eq("id", questionIds[0]);

      if (topicsError) {
        return NextResponse.json({ ok: false, message: topicsError.message }, { status: 400 });
      }
    }

    const { data: questionStatuses } = await supabase
      .from("questions")
      .select("id, code, status, evaluated_topics")
      .in("id", questionIds);

    const annulledIds = (questionStatuses || []).filter((q) => q.status === "annulled").map((q) => q.id);
    if (annulledIds.length > 0) {
      return NextResponse.json({ ok: false, message: "Questões anuladas não podem ser adicionadas a simulados." }, { status: 400 });
    }

    const archivedIds = (questionStatuses || []).filter((q) => q.status === "archived").map((q) => q.id);
    if (archivedIds.length > 0) {
      return NextResponse.json({ ok: false, message: "Questões arquivadas não podem ser adicionadas a simulados." }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabase
      .from("simulado_questions")
      .select("question_id, order_number")
      .eq("simulado_id", id)
      .order("order_number", { ascending: false });

    if (existingError) {
      return NextResponse.json({ ok: false, message: existingError.message }, { status: 400 });
    }

    const existingIds = new Set((existing || []).map((item: { question_id: string }) => item.question_id));
    const maxOrder = existing?.[0]?.order_number || 0;
    const rows = questionIds
      .filter((questionId: string) => !existingIds.has(questionId))
      .map((questionId: string, index: number) => ({
        simulado_id: id,
        question_id: questionId,
        order_number: maxOrder + index + 1,
        points: 1,
        status: "active",
        is_required: true,
      }));

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, message: "As questões selecionadas já estavam no simulado." });
    }

    const { error } = await supabase.from("simulado_questions").insert(rows);

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, message: `${rows.length} questão(ões) adicionada(s) ao simulado.` });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro inesperado ao adicionar questões." },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await params;
    const body = await request.json();
    const items = Array.isArray(body.items) ? body.items : [];

    const normalized = items
      .map((item: SimuladoQuestionPutItem, index: number) => ({
        question_id: String(item.question_id || "").trim(),
        order_number: index + 1,
        points: Number(item.points || 1),
        status: String(item.status || "active"),
      }))
      .filter((item: { question_id: string }) => Boolean(item.question_id));

    const supabase = createSupabaseAdminClient();
    const desiredIds = normalized.map((item: { question_id: string }) => item.question_id);

    if (desiredIds.length > 0) {
      const { data: questionStatuses, error: statusError } = await supabase
        .from("questions")
        .select("id, status, evaluated_topics")
        .in("id", desiredIds);

      if (statusError) {
        return NextResponse.json({ ok: false, message: statusError.message }, { status: 400 });
      }

      const blocked = (questionStatuses || []).filter((question) => ["annulled", "archived"].includes(question.status));
      if (blocked.length > 0) {
        return NextResponse.json({ ok: false, message: "Questões anuladas ou arquivadas não podem permanecer no simulado." }, { status: 400 });
      }
    }

    const { data: existing, error: existingError } = await supabase
      .from("simulado_questions")
      .select("id, question_id")
      .eq("simulado_id", id);

    if (existingError) {
      return NextResponse.json({ ok: false, message: existingError.message }, { status: 400 });
    }

    const desiredSet = new Set(desiredIds);
    const removeIds = (existing || [])
      .filter((relation: { question_id: string }) => !desiredSet.has(relation.question_id))
      .map((relation: { id: string }) => relation.id);

    if (removeIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("simulado_questions")
        .delete()
        .in("id", removeIds)
        .eq("simulado_id", id);
      if (deleteError) {
        return NextResponse.json({ ok: false, message: deleteError.message }, { status: 400 });
      }
    }

    const existingByQuestion = new Map((existing || []).map((relation: { id: string; question_id: string }) => [relation.question_id, relation.id]));

    for (const relation of existing || []) {
      if (!desiredSet.has(relation.question_id)) continue;
      const { error } = await supabase
        .from("simulado_questions")
        .update({ order_number: 10000 + (normalized.findIndex((item: { question_id: string }) => item.question_id === relation.question_id) + 1) })
        .eq("id", relation.id)
        .eq("simulado_id", id);
      if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    const newRows = normalized
      .filter((item: { question_id: string }) => !existingByQuestion.has(item.question_id))
      .map((item: { question_id: string; order_number: number; points: number; status: string }) => ({
        simulado_id: id,
        question_id: item.question_id,
        order_number: 20000 + item.order_number,
        points: item.points,
        status: item.status,
        is_required: true,
      }));

    if (newRows.length > 0) {
      const { error: insertError } = await supabase.from("simulado_questions").insert(newRows);
      if (insertError) return NextResponse.json({ ok: false, message: insertError.message }, { status: 400 });
    }

    const { data: allRelations, error: refetchError } = await supabase
      .from("simulado_questions")
      .select("id, simulado_id, question_id, order_number, points, status")
      .eq("simulado_id", id);

    if (refetchError) return NextResponse.json({ ok: false, message: refetchError.message }, { status: 400 });

    const relationByQuestion = new Map((allRelations || []).map((relation: SimuladoQuestionRelationRow) => [relation.question_id, relation]));
    for (const item of normalized) {
      const relation = relationByQuestion.get(item.question_id);
      if (!relation) continue;
      const { error } = await supabase
        .from("simulado_questions")
        .update({ order_number: item.order_number, points: item.points, status: item.status })
        .eq("id", relation.id)
        .eq("simulado_id", id);
      if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    const { data: saved, error: savedError } = await supabase
      .from("simulado_questions")
      .select("id, simulado_id, question_id, order_number, points, status")
      .eq("simulado_id", id)
      .order("order_number", { ascending: true });

    if (savedError) return NextResponse.json({ ok: false, message: savedError.message }, { status: 400 });

    return NextResponse.json({ ok: true, message: "Questões e numeração atualizadas.", relations: saved || [] });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro inesperado ao salvar questões." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await params;
    const body = await request.json();
    const relationId = String(body.relation_id || "").trim();

    if (!relationId) {
      return NextResponse.json({ ok: false, message: "Relação da questão não informada." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("simulado_questions")
      .delete()
      .eq("id", relationId)
      .eq("simulado_id", id);

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, message: "Questão removida do simulado." });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro inesperado ao remover questão." },
      { status: 500 },
    );
  }
}
