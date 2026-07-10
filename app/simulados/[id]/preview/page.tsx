import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdminPage } from "@/lib/server/authGuard";
import PreviewSimuladoClient from "./page-client";

async function getData(id: string) {
  const supabase = createSupabaseAdminClient();

  const { data: simulado, error } = await supabase
    .from("simulados")
    .select(`
      *,
      simulado_questions (
        id,
        simulado_id,
        question_id,
        order_number,
        points,
        status,
        questions:question_id (
          id,
          code,
          statement,
          explanation_text,
          difficulty_level,
          year,
          question_type,
          correct_alternative_label,
          exam_boards:exam_board_id (
            id,
            name
          ),
          subjects:subject_id (
            id,
            name,
            disciplines:discipline_id (
              id,
              name
            )
          ),
          question_alternatives (
            id,
            label,
            text,
            image_url,
            is_correct,
            order_number
          )
        )
      )
    `)
    .eq("id", id)
    .single();

  if (error || !simulado) return null;
  return simulado;
}

export default async function PreviewSimuladoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage();
  const { id } = await params;
  const simulado = await getData(id);

  if (!simulado) notFound();

  return <PreviewSimuladoClient simulado={simulado} />;
}
