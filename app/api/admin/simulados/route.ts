import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdmin } from "@/lib/server/authGuard";
import { logAdminAction, logSystemError } from "@/app/lib/server/auditLogger";
import { getDefaultOwlHelpLimit } from "@/app/simulados/utils";

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

function parseOwlHelpLimit(enabled: boolean, value: unknown, questionCount: number) {
  if (!enabled) return null;
  if (value === null || value === undefined || value === "") {
    return getDefaultOwlHelpLimit(questionCount);
  }
  const limit = Number(value);
  return Number.isInteger(limit) && limit > 0 ? limit : undefined;
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

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const supabase = createSupabaseAdminClient();

    const { data: simulados, error } = await supabase
      .from("simulados")
      .select(`
        id,
        title,
        status,
        question_count,
        created_at,
        updated_at,
        simulado_questions(id),
        jornada_simulados(
          jornadas(id, title, status)
        )
      `)
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    const mapped = (simulados || []).map((simulado: any) => {
      const jornadas = (simulado.jornada_simulados || [])
        .map((link: any) => Array.isArray(link.jornadas) ? link.jornadas[0] : link.jornadas)
        .filter(Boolean);

      return {
        id: simulado.id,
        title: simulado.title,
        status: simulado.status,
        question_count: simulado.question_count,
        linked_questions_count: simulado.simulado_questions?.length || 0,
        jornadas_titles: jornadas.map((jornada: any) => jornada.title).filter(Boolean),
        jornadas: jornadas.map((jornada: any) => ({
          id: jornada.id,
          title: jornada.title,
          status: jornada.status,
        })),
      };
    });

    return NextResponse.json({ ok: true, simulados: mapped });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro inesperado ao listar simulados." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await request.json();
    const title = clean(body.title);
    const status = parseStatus(body.status);
    const questionCount = parseQuestionCount(body.question_count);
    const owlHelpEnabled = body.owl_help_enabled === true;
    const owlHelpLimit = questionCount === undefined
      ? undefined
      : parseOwlHelpLimit(owlHelpEnabled, body.owl_help_limit, questionCount);
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

    if (owlHelpLimit === undefined) {
      return NextResponse.json({ ok: false, message: "A quantidade de ajudas da Coruja deve ser um número inteiro maior que zero." }, { status: 400 });
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
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("simulados")
      .insert({
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
        owl_help_enabled: owlHelpEnabled,
        owl_help_limit: owlHelpLimit,
        published_at: status === "published" ? now : null,
        archived_at: status === "archived" ? now : null,
      })
      .select("id")
      .single();

    if (error || !data) {
      return NextResponse.json({ ok: false, message: error?.message || "Erro ao criar simulado." }, { status: 400 });
    }

    void logAdminAction({ adminUserId: admin.id, action: "admin.simulado.created", entityType: "simulado", entityId: data.id, request, metadata: { status } });
    return NextResponse.json({ ok: true, id: data.id, message: "Simulado criado com sucesso." });
  } catch (error) {
    void logSystemError({ source: "api.admin.simulados.create", error, request });
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro inesperado ao criar simulado." },
      { status: 500 },
    );
  }
}
