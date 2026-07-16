import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireStudentPage } from "@/lib/server/authGuard";
import { assertStudentCanAccessSimulado } from "@/lib/server/studentAssertions";
import SimuladoExperience from "./page-client";

export const dynamic = "force-dynamic";

export default async function MeusSimuladosDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const student = await requireStudentPage();
  const { id } = await params;
  const supabase = createSupabaseAdminClient();

  const accessError = await assertStudentCanAccessSimulado(student.id, id, supabase);
  if (accessError) notFound();

  // 3. Acesso validado — carrega dados completos do simulado
  const { data: simulado } = await supabase
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
        simulado_questions ( id )
      `,
    )
    .eq("id", id)
    .single();

  if (!simulado || simulado.status !== "published") notFound();

  const questionsCount =
    simulado.question_count ?? (simulado.simulado_questions || []).length;

  return (
    <SimuladoExperience
      simuladoId={simulado.id}
      initialSimulado={{
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
      }}
    />
  );
}
