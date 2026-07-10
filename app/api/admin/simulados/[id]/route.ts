import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { hasEvaluatedTopics } from "@/lib/questions/evaluated-topics";
import { requireAdmin } from "@/lib/server/authGuard";
import { logAdminAction, logSystemError } from "@/app/lib/server/auditLogger";

function clean(value: unknown) {
  return String(value || "").trim();
}

function nullableString(value: unknown) {
  const text = clean(value);
  return text || null;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseStatus(value: unknown) {
  const status = clean(value) || "draft";
  return ["draft", "published", "archived"].includes(status) ? status : null;
}

function parseTimeLimit(value: unknown) {
  const time = nullableNumber(value);
  return time === null || (Number.isInteger(time) && time > 0) ? time : undefined;
}

function parseMaxAttempts(value: unknown) {
  const attempts = nullableNumber(value);
  return attempts === null || attempts > 0 ? attempts : undefined;
}

function parseQuestionCount(value: unknown) {
  const count = nullableNumber(value);
  if (count === null) return 0;
  return Number.isInteger(count) && count >= 0 ? count : undefined;
}

function parseScoringModel(value: unknown) {
  const model = clean(value) || "traditional";
  return ["traditional", "cebraspe"].includes(model) ? model : null;
}

function parseFeedbackMode(value: unknown, instantFeedbackValue: unknown) {
  const fallback = instantFeedbackValue ? "instant" : "final_only";
  const mode = clean(value) || fallback;
  return ["instant", "final_only"].includes(mode) ? mode : null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await params;
    const body = await request.json();
    const title = clean(body.title);
    const status = parseStatus(body.status);
    const questionCount = parseQuestionCount(body.question_count);
    const timeLimit = parseTimeLimit(body.time_limit_minutes);
    const maxAttempts = parseMaxAttempts(body.max_attempts);
    const scoringModel = parseScoringModel(body.scoring_model);
    const feedbackMode = parseFeedbackMode(body.feedback_mode, body.instant_feedback_enabled);

    if (!title) {
      return NextResponse.json({ ok: false, message: "Informe o nome do simulado." }, { status: 400 });
    }

    if (!status) {
      return NextResponse.json({ ok: false, message: "Status inválido." }, { status: 400 });
    }

    if (timeLimit === undefined) {
      return NextResponse.json({ ok: false, message: "Tempo de prova inválido." }, { status: 400 });
    }

    if (questionCount === undefined) {
      return NextResponse.json({ ok: false, message: "Numero de questoes invalido." }, { status: 400 });
    }

    if (maxAttempts === undefined) {
      return NextResponse.json({ ok: false, message: "Número de tentativas inválido." }, { status: 400 });
    }

    if (!scoringModel) {
      return NextResponse.json({ ok: false, message: "Sistema de pontuação inválido." }, { status: 400 });
    }

    if (!feedbackMode) {
      return NextResponse.json({ ok: false, message: "Modo de feedback inválido." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    if (status === "published") {
      const { count: linkedQuestionCount, error: countError } = await supabase
        .from("simulado_questions")
        .select("id", { count: "exact", head: true })
        .eq("simulado_id", id);

      if (countError) {
        return NextResponse.json({ ok: false, message: countError.message }, { status: 400 });
      }

      if (questionCount > 0 && (linkedQuestionCount || 0) !== questionCount) {
        const actual = linkedQuestionCount || 0;
        const diff = Math.abs(actual - questionCount);
        const message = actual > questionCount
          ? `Este simulado possui ${actual} questões vinculadas, mas o número configurado é ${questionCount}. Remova ${diff} questão${diff > 1 ? "ões" : ""} para prosseguir.`
          : `Este simulado possui ${actual} questões vinculadas, mas o número configurado é ${questionCount}. Adicione mais ${diff} questão${diff > 1 ? "ões" : ""} ou ajuste o número configurado.`;
        return NextResponse.json({ ok: false, message }, { status: 400 });
      }

      const { data: linkedQuestions, error: linkedError } = await supabase
        .from("simulado_questions")
        .select("questions:question_id(evaluated_topics)")
        .eq("simulado_id", id)
        .eq("status", "active");

      if (linkedError) {
        return NextResponse.json({ ok: false, message: linkedError.message }, { status: 400 });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const missingTopicsCount = (linkedQuestions || []).filter((row: any) => !hasEvaluatedTopics(row.questions?.evaluated_topics)).length;
      if (missingTopicsCount > 0) {
        return NextResponse.json({
          ok: false,
          message: `Não é possível publicar: ${missingTopicsCount} questão${missingTopicsCount > 1 ? "ões" : ""} deste simulado ainda não ${missingTopicsCount > 1 ? "possuem" : "possui"} tópicos avaliados.`,
        }, { status: 400 });
      }
    }

    const { data: current, error: currentError } = await supabase
      .from("simulados")
      .select("status, published_at, archived_at")
      .eq("id", id)
      .single();

    if (currentError || !current) {
      return NextResponse.json({ ok: false, message: currentError?.message || "Simulado não encontrado." }, { status: 404 });
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("simulados")
      .update({
        title,
        description: nullableString(body.description),
        discipline_id: nullableString(body.discipline_id),
        status,
        question_count: questionCount,
        time_limit_minutes: timeLimit,
        max_attempts: maxAttempts,
        show_result_on_finish: body.show_result_on_finish ?? true,
        show_answer_key_on_finish: body.show_answer_key_on_finish ?? false,
        instant_feedback_enabled: feedbackMode === "instant",
        feedback_mode: feedbackMode,
        show_teacher_comment: body.show_teacher_comment ?? true,
        correction_video_url: nullableString(body.correction_video_url),
        shuffle_questions: body.shuffle_questions ?? false,
        shuffle_alternatives: body.shuffle_alternatives ?? false,
        allow_blank_answers: body.allow_blank_answers ?? false,
        scoring_model: scoringModel,
        owl_help_enabled: Boolean(body.owl_help_enabled),
        published_at: status === "published" && !current.published_at ? now : current.published_at,
        archived_at: status === "archived" && !current.archived_at ? now : status !== "archived" ? null : current.archived_at,
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    void logAdminAction({ adminUserId: admin.id, action: status === "published" ? "admin.simulado.published" : status === "archived" ? "admin.simulado.archived" : "admin.simulado.updated", entityType: "simulado", entityId: id, request, metadata: { status } });
    return NextResponse.json({ ok: true, message: "Simulado atualizado com sucesso." });
  } catch (error) {
    void logSystemError({ source: "api.admin.simulados.update", error, request });
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro inesperado ao atualizar simulado." },
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
    const supabase = createSupabaseAdminClient();

    const { data: jornadaLinks, error: jornadaLinksError } = await supabase
      .from("jornada_simulados")
      .select("jornadas:jornada_id(title)")
      .eq("simulado_id", id);

    if (jornadaLinksError) {
      return NextResponse.json({ ok: false, message: jornadaLinksError.message }, { status: 400 });
    }

    if (jornadaLinks && jornadaLinks.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const titles = jornadaLinks.map((link: any) => link.jornadas?.title).filter(Boolean);
      const titlesLabel = titles.length > 0 ? titles.join(", ") : `${jornadaLinks.length} jornada(s)`;
      return NextResponse.json(
        {
          ok: false,
          message: `Este simulado está vinculado à(s) Jornada(s) "${titlesLabel}". Desvincule-o da(s) Jornada(s) antes de excluí-lo.`,
        },
        { status: 400 },
      );
    }

    const { error } = await supabase.from("simulados").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    void logAdminAction({ adminUserId: admin.id, action: "admin.simulado.deleted", entityType: "simulado", entityId: id, severity: "warning", request });
    return NextResponse.json({ ok: true, message: "Simulado excluído com sucesso." });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro inesperado ao excluir simulado." },
      { status: 500 },
    );
  }
}
