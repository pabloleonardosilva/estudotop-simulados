import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdmin } from "@/lib/server/authGuard";
import { reprocessAfterAnswerKeyChange } from "@/lib/server/simuladoQuestionReprocessing";
import { logSystemError } from "@/app/lib/server/auditLogger";

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

    const { data: previousQuestion } = await supabase
      .from("questions")
      .select("id, code, correct_alternative_label")
      .eq("id", id)
      .maybeSingle();
    const previousCorrectLabel = previousQuestion?.correct_alternative_label || null;

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

    const labelChanged = previousCorrectLabel !== (alternative.label || null);
    // Gerado só quando o gabarito de fato muda — identidade estável desta
    // revisão, persistida junto com o próprio gabarito (nunca um timestamp
    // gerado a cada tentativa). Um retry desta mesma mudança (gabarito não
    // muda de novo) reaproveita o valor já salvo em vez de gerar outro.
    const answerKeyRevisionId = labelChanged ? randomUUID() : null;
    const questionsUpdatePayload: { correct_alternative_label: string | null; answer_key_revision_id?: string } = {
      correct_alternative_label: alternative.label || null,
    };
    if (labelChanged) questionsUpdatePayload.answer_key_revision_id = answerKeyRevisionId!;

    const { error: questionError } = await supabase
      .from("questions")
      .update(questionsUpdatePayload)
      .eq("id", id);

    if (questionError) {
      return NextResponse.json({ ok: false, message: questionError.message }, { status: 400 });
    }

    // Gabarito é a exceção retroativa: toda mudança real propaga e
    // recalcula os resultados de todos os Simulados que usam esta questão
    // (ver lib/server/simuladoQuestionReprocessing.ts — fonte única do
    // reprocessamento, nunca soma/subtrai em cima do resultado anterior).
    if (labelChanged) {
      try {
        await reprocessAfterAnswerKeyChange(supabase, {
          questionId: id,
          actorId: admin.id,
          actorName: admin.full_name || "Admin",
          reasonText: `Gabarito da questão ${previousQuestion?.code || id} corrigido pela equipe EstudoTOP.`,
          revisionId: answerKeyRevisionId!,
        });
      } catch (reprocessError) {
        void logSystemError({ source: "api.admin.questions.answer.reprocess", error: reprocessError, request, metadata: { question_id: id } });
        return NextResponse.json(
          { ok: false, message: "Gabarito foi salvo, mas não foi possível reprocessar os resultados afetados. Contate o suporte técnico." },
          { status: 500 },
        );
      }
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
