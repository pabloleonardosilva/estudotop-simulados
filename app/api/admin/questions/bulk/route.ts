import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { EVALUATED_TOPICS_PUBLISH_MESSAGE, hasEvaluatedTopics } from "@/lib/questions/evaluated-topics";
import { requireAdmin } from "@/lib/server/authGuard";
import { resolveQuestionDiscipline } from "@/lib/questions/question-subjects";
import { logAdminAction, logSystemError } from "@/app/lib/server/auditLogger";

export async function PATCH(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await request.json();
    const ids: string[] = Array.isArray(body.ids) ? body.ids : [];

    if (ids.length === 0) {
      return NextResponse.json({ ok: false, message: "Nenhuma questao selecionada." }, { status: 400 });
    }

    // Metadata bulk update path (banca, assunto, ano, dificuldade)
    if (body.metadata && typeof body.metadata === "object") {
      const supabase = createSupabaseAdminClient();
      const updates: Record<string, unknown> = {};

      if (body.metadata.exam_board_id !== undefined) {
        updates.exam_board_id = body.metadata.exam_board_id || null;
      }
      if (body.metadata.year !== undefined) {
        const y = Number(body.metadata.year);
        updates.year = Number.isInteger(y) && y >= 1990 && y <= 2100 ? y : null;
      }
      if (body.metadata.difficulty_level !== undefined) {
        const d = Number(body.metadata.difficulty_level);
        updates.difficulty_level = Number.isInteger(d) && d >= 1 && d <= 5 ? d : null;
      }

      // Mudança de Assunto principal ou de Disciplina invalida os tópicos da classificação anterior:
      // eles são limpos (nunca remapeados por nome) somente nas questões cuja classificação muda.
      let topicsClearedIds: string[] = [];
      const subjectIds = Array.isArray(body.metadata.subject_ids) ? (body.metadata.subject_ids as string[]) : null;
      const disciplineId = typeof body.metadata.discipline_id === "string" ? body.metadata.discipline_id.trim() : "";
      const classification = (subjectIds && subjectIds.length > 0) || disciplineId
        ? await resolveQuestionDiscipline({
            supabase,
            disciplineId: disciplineId || null,
            subjectIds: subjectIds && subjectIds.length > 0 ? Array.from(new Set(subjectIds)) : [],
          })
        : null;
      if (classification && !classification.ok) return NextResponse.json({ ok: false, message: classification.message }, { status: 400 });

      if (Object.keys(updates).length > 0) {
        const { error } = await supabase.from("questions").update(updates).in("id", ids);
        if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
      }

      if (classification?.ok) {

        const { data: currentRows, error: currentError } = await supabase
          .from("questions")
          .select("id, subject_id, discipline_id")
          .in("id", ids);
        if (currentError) return NextResponse.json({ ok: false, message: currentError.message }, { status: 400 });

        const nextPrimarySubjectId = subjectIds && subjectIds.length > 0 ? subjectIds[0] : null;
        const changedIds = (currentRows || [])
          .filter((row) => nextPrimarySubjectId
            ? row.subject_id !== nextPrimarySubjectId
            : row.discipline_id !== classification.disciplineId)
          .map((row) => row.id);

        if (nextPrimarySubjectId && subjectIds) {
          if (changedIds.length > 0) {
            const { error: changedError } = await supabase
              .from("questions")
              .update({ subject_id: nextPrimarySubjectId, discipline_id: classification.disciplineId, evaluated_topics: [] })
              .in("id", changedIds);
            if (changedError) return NextResponse.json({ ok: false, message: changedError.message }, { status: 400 });
          }

          const { error: deleteError } = await supabase.from("question_subjects").delete().in("question_id", ids);
          if (deleteError) return NextResponse.json({ ok: false, message: deleteError.message }, { status: 400 });

          const inserts = ids.flatMap((id: string) => subjectIds.map((sid: string) => ({ question_id: id, subject_id: sid })));
          const { error: insertError } = await supabase.from("question_subjects").insert(inserts);
          if (insertError) return NextResponse.json({ ok: false, message: insertError.message }, { status: 400 });
          topicsClearedIds = changedIds;
        } else if (changedIds.length > 0) {
          const { error: changedError } = await supabase
            .from("questions")
            .update({ subject_id: null, discipline_id: classification.disciplineId, evaluated_topics: [] })
            .in("id", changedIds);
          if (changedError) return NextResponse.json({ ok: false, message: changedError.message }, { status: 400 });

          const { error: deleteError } = await supabase.from("question_subjects").delete().in("question_id", changedIds);
          if (deleteError) return NextResponse.json({ ok: false, message: deleteError.message }, { status: 400 });
          topicsClearedIds = changedIds;
        }
      }

      void logAdminAction({ adminUserId: admin.id, action: "admin.question.bulk_updated", entityType: "question", request, metadata: { question_ids: ids, fields: Object.keys(body.metadata), topics_cleared_ids: topicsClearedIds } });

      return NextResponse.json({
        ok: true,
        message: topicsClearedIds.length > 0
          ? `${ids.length} questão(ões) atualizada(s). Os tópicos avaliados de ${topicsClearedIds.length} questão(ões) foram limpos e precisam ser informados novamente.`
          : `${ids.length} questão(ões) atualizada(s) com sucesso.`,
        updatedIds: ids,
        topicsClearedIds,
      });
    }

    const status = String(body.status || "").trim();

    if (!["draft", "pending_review", "ready_to_publish", "published", "active", "archived", "annulled"].includes(status)) {
      return NextResponse.json({ ok: false, message: "Status invalido." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    let idsToUpdate = ids;
    const blockedIds: string[] = [];
    const blockedSubjectIds: string[] = [];
    const blockedTopicIds: string[] = [];

    if (["ready_to_publish", "published", "active"].includes(status)) {
      const { data: questionSubjects, error: questionSubjectsError } = await supabase
        .from("questions")
        .select("id, discipline_id, evaluated_topics")
        .in("id", ids);

      if (questionSubjectsError) {
        return NextResponse.json({ ok: false, message: questionSubjectsError.message }, { status: 400 });
      }

      // Assunto é opcional; a publicação exige Disciplina e tópicos avaliados.
      for (const question of questionSubjects || []) {
        if (!question.discipline_id) {
          blockedSubjectIds.push(question.id);
        }
        if (!hasEvaluatedTopics(question.evaluated_topics)) {
          blockedTopicIds.push(question.id);
        }
      }

      const { data: alternatives, error: alternativesError } = await supabase
        .from("question_alternatives")
        .select("question_id, is_correct")
        .in("question_id", ids);

      if (alternativesError) {
        return NextResponse.json({ ok: false, message: alternativesError.message }, { status: 400 });
      }

      const counts = new Map<string, number>();
      for (const alternative of alternatives || []) {
        if (alternative.is_correct) counts.set(alternative.question_id, (counts.get(alternative.question_id) || 0) + 1);
      }

      for (const id of ids) {
        const count = counts.get(id) || 0;
        if (count !== 1) blockedIds.push(id);
      }

      if (blockedSubjectIds.length > 0) {
        await supabase.from("questions").update({ status: "pending_review" }).in("id", blockedSubjectIds);
      }

      if (blockedTopicIds.length > 0) {
        await supabase.from("questions").update({ status: "pending_review" }).in("id", blockedTopicIds);
      }

      if (blockedIds.length > 0) {
        await supabase.from("question_alternatives").update({ is_correct: false }).in("question_id", blockedIds);
        await supabase.from("questions").update({ status: "pending_review", correct_alternative_label: null }).in("id", blockedIds);
      }

      const blockedSet = new Set([...blockedIds, ...blockedSubjectIds, ...blockedTopicIds]);
      idsToUpdate = ids.filter((id) => !blockedSet.has(id));
    }

    if (idsToUpdate.length === 0) {
      return NextResponse.json({
        ok: true,
        message: blockedTopicIds.length > 0
          ? EVALUATED_TOPICS_PUBLISH_MESSAGE
          : blockedSubjectIds.length > 0
          ? "Nenhuma questão válida para atualizar. Questões sem disciplina permaneceram em revisão."
          : "Nenhuma questão válida para atualizar. Questões sem gabarito único voltaram para revisão.",
        updatedIds: [],
        updatedCount: 0,
        blockedIds,
        blockedSubjectIds,
        blockedTopicIds,
      });
    }

    const { data, error } = await supabase.from("questions").update({ status }).in("id", idsToUpdate).select("id");

    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });

    const updatedIds = (data || []).map((question) => question.id);

    void logAdminAction({ adminUserId: admin.id, action: "admin.question.bulk_status_updated", entityType: "question", request, metadata: { question_ids: updatedIds, status } });

    return NextResponse.json({
      ok: true,
      message: `${updatedIds.length} questao(oes) atualizada(s) com sucesso.`,
      updatedIds,
      updatedCount: updatedIds.length,
      blockedIds,
      blockedSubjectIds,
      blockedTopicIds,
    });
  } catch (error) {
    void logSystemError({ source: "api.admin.questions.bulk_update", error, request });
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Erro inesperado." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await request.json();
    const ids = Array.isArray(body.ids) ? body.ids : [];

    if (ids.length === 0) {
      return NextResponse.json({ ok: false, message: "Nenhuma questao selecionada." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("questions").delete().in("id", ids);

    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });

    void logAdminAction({ adminUserId: admin.id, action: "admin.question.bulk_deleted", entityType: "question", severity: "warning", request, metadata: { question_ids: ids } });

    return NextResponse.json({ ok: true, message: `${ids.length} questao(oes) excluida(s) com sucesso.` });
  } catch (error) {
    void logSystemError({ source: "api.admin.questions.bulk_delete", error, request });
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Erro inesperado." }, { status: 500 });
  }
}
