import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { assertStudentCanAccessSimulado } from "@/lib/server/studentAssertions";
import { logStudentActivity, logSystemError } from "@/app/lib/server/auditLogger";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const student = await getStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createSupabaseAdminClient();

  const accessError = await assertStudentCanAccessSimulado(student.id, id, supabase, request);
  if (accessError) return accessError;

  const { data: simulado, error } = await supabase
    .from("simulados")
    .select(
      `
        id,
        title,
        description,
        status,
        question_count,
        time_limit_minutes,
        max_attempts,
        show_result_on_finish,
        show_answer_key_on_finish,
        instant_feedback_enabled,
        feedback_mode,
        show_teacher_comment,
        correction_video_url,
        shuffle_questions,
        shuffle_alternatives,
        allow_blank_answers,
        scoring_model,
        navigation_type,
        owl_help_enabled,
        owl_help_limit,
        simulado_questions ( id )
      `,
    )
    .eq("id", id)
    .single();

  if (error || !simulado) {
    return NextResponse.json(
      { ok: false, message: "Simulado não encontrado" },
      { status: 404 },
    );
  }

  if (simulado.status !== "published") {
    return NextResponse.json(
      { ok: false, message: "Simulado indisponível no momento" },
      { status: 403 },
    );
  }

  const jornadaId = new URL(request.url).searchParams.get("jornada");

  if (!jornadaId) {
    const { data: jornadaLink } = await supabase
      .from("jornada_simulados")
      .select("id")
      .eq("simulado_id", id)
      .limit(1)
      .maybeSingle();

    if (jornadaLink) {
      const { data: studentJornadas } = await supabase
        .from("student_jornadas")
        .select("id")
        .eq("student_id", student.id);
      const studentJornadaIds = (studentJornadas || []).map((row) => row.id);

      const { data: releaseRows } = await supabase
        .from("student_jornada_simulados")
        .select("status, scheduled_release_at")
        .eq("simulado_id", id)
        .in("student_jornada_id", studentJornadaIds.length ? studentJornadaIds : ["00000000-0000-0000-0000-000000000000"]);

      const released = (releaseRows || []).some((row) =>
        ["available", "in_progress", "completed"].includes(row.status),
      );

      if (!released) {
        const nextReleaseDate = (releaseRows || [])
          .map((row) => row.scheduled_release_at)
          .filter(Boolean)
          .sort()[0] || null;
        return NextResponse.json(
          {
            ok: false,
            message: nextReleaseDate
              ? `Este simulado ainda não foi liberado na sua Jornada. Disponível em ${nextReleaseDate}.`
              : "Este simulado ainda não foi liberado na sua Jornada.",
          },
          { status: 403 },
        );
      }
    }
  }

  if (jornadaId) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: studentJornada } = await supabase
      .from("student_jornadas")
      .select("id, status, expires_at")
      .eq("id", jornadaId)
      .eq("student_id", student.id)
      .maybeSingle();

    if (!studentJornada || studentJornada.status !== "active" || studentJornada.expires_at <= today) {
      return NextResponse.json(
        { ok: false, message: "Esta Jornada não permite acesso ao simulado no momento." },
        { status: 403 },
      );
    }

    const { data: jornadaSimulado } = await supabase
      .from("student_jornada_simulados")
      .select("id, status")
      .eq("student_jornada_id", jornadaId)
      .eq("simulado_id", id)
      .maybeSingle();

    if (!jornadaSimulado || !["available", "in_progress", "completed"].includes(jornadaSimulado.status)) {
      return NextResponse.json(
        { ok: false, message: "Este simulado ainda não está liberado nesta Jornada." },
        { status: 403 },
      );
    }
  }

  const { data: attempts, error: attemptsError } = await supabase
    .from("simulado_attempts")
    .select(
      "id, status, attempt_number, answered_count, total_questions, progress_percent, started_at, submitted_at, expires_at, counts_toward_limit, time_spent_seconds",
    )
    .eq("simulado_id", id)
    .eq("student_id", student.id)
    .order("created_at", { ascending: false });

  if (attemptsError) {
    void logSystemError({ source: "api.student.simulado_detail", error: attemptsError, request, metadata: { simulado_id: id } });
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar as tentativas." },
      { status: 500 },
    );
  }

  const inProgress = (attempts || []).find((row) => row.status === "in_progress") || null;
  const completed = (attempts || []).filter((row) => row.status === "completed" && row.counts_toward_limit);
  const used = (attempts || []).filter((row) => row.counts_toward_limit).length;
  const total = simulado.max_attempts ?? null;
  const remaining = total === null ? null : Math.max(total - used, 0);
  const questionsCount = simulado.question_count ?? (simulado.simulado_questions || []).length;

  void logStudentActivity({ studentId: student.id, action: "student.simulado.opened", entityType: "simulado", entityId: id, request });

  return NextResponse.json({
    ok: true,
    simulado: {
      id: simulado.id,
      title: simulado.title,
      description: simulado.description,
      question_count: questionsCount,
      time_limit_minutes: simulado.time_limit_minutes,
      max_attempts: simulado.max_attempts,
      show_result_on_finish: simulado.show_result_on_finish,
      show_answer_key_on_finish: simulado.show_answer_key_on_finish,
      instant_feedback_enabled: simulado.feedback_mode === "instant" || simulado.instant_feedback_enabled,
      feedback_mode: simulado.feedback_mode || (simulado.instant_feedback_enabled ? "instant" : "final_only"),
      show_teacher_comment: simulado.show_teacher_comment,
      correction_video_url: simulado.correction_video_url,
      shuffle_questions: simulado.shuffle_questions,
      shuffle_alternatives: simulado.shuffle_alternatives,
      allow_blank_answers: simulado.allow_blank_answers,
      scoring_model: simulado.scoring_model,
      navigation_type: simulado.navigation_type || "open",
      owl_help_enabled: Boolean(simulado.owl_help_enabled),
      owl_help_limit: simulado.owl_help_limit ?? null,
    },
    attempts: {
      in_progress: inProgress,
      last_completed: completed[0] || null,
      used,
      remaining,
      total,
    },
  });
}
