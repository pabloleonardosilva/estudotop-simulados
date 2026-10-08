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
          discipline:discipline_id (
            id,
            name
          ),
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
  const [{ data: links, error: linksError }, { data: events, error: eventsError }] = await Promise.all([
    supabase.from("jornada_simulados").select("id,owl_help_enabled_override,owl_help_limit_override,jornadas:jornada_id(id,title,feedback_mode,navigation_override,owl_help_enabled,owl_help_limit,result_policy)").eq("simulado_id", id),
    supabase.from("simulado_events").select("id,name,feedback_mode,navigation_override,owl_help_enabled,owl_help_limit,result_policy").eq("simulado_id", id),
  ]);
  if (linksError || eventsError) throw new Error("Falha ao carregar contextos do preview.");
  const preview_contexts = [
    ...(links || []).map((link) => { const jornada = link.jornadas as unknown as { title: string; feedback_mode: string; navigation_override: string | null; owl_help_enabled: boolean; owl_help_limit: number | null; result_policy: string }; return { ...jornada, id: "jornada:" + link.id, name: "Jornada: " + jornada.title, owl_help_enabled: link.owl_help_enabled_override ?? jornada.owl_help_enabled, owl_help_limit: link.owl_help_enabled_override !== null ? link.owl_help_limit_override : jornada.owl_help_limit }; }),
    ...(events || []).map((event) => ({ ...event, id: "event:" + event.id, name: "Evento: " + event.name })),
  ];
  return { ...simulado, preview_contexts };
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
