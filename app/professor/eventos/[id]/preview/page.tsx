import { notFound } from "next/navigation";
import { requireEventManagerPage } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import PreviewSimuladoClient from "@/app/simulados/[id]/preview/page-client";

export default async function ProfessorEventPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireEventManagerPage(id);
  const supabase = createSupabaseAdminClient();
  const { data: eventRow } = await supabase.from("simulado_events").select("id,name,simulado_id,feedback_mode,navigation_override,owl_help_enabled,owl_help_limit,result_policy").eq("id", id).maybeSingle();
  if (!eventRow?.simulado_id) notFound();
  const event = eventRow;
  const { data: simulado } = await supabase.from("simulados").select("*,simulado_questions(id,simulado_id,question_id,order_number,points,status,questions:question_id(id,code,statement,explanation_text,difficulty_level,year,question_type,correct_alternative_label,discipline:discipline_id(id,name),exam_boards:exam_board_id(id,name),subjects:subject_id(id,name,disciplines:discipline_id(id,name)),question_alternatives(id,label,text,image_url,is_correct,order_number)))").eq("id", event.simulado_id).single();
  if (!simulado) notFound();
  return <PreviewSimuladoClient simulado={{ ...simulado, preview_contexts: [event] }} />;
}
