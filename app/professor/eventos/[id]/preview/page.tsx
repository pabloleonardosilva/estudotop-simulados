import { notFound } from "next/navigation";
import { requireProfessorPage } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import PreviewSimuladoClient from "@/app/simulados/[id]/preview/page-client";

export default async function ProfessorEventPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const professor = await requireProfessorPage();
  const { id } = await params;
  const supabase = createSupabaseAdminClient();
  const { data: assignment } = await supabase.from("simulado_event_professors").select("simulado_events:event_id(simulado_id)").eq("event_id", id).eq("professor_id", professor.id).maybeSingle();
  const event = assignment?.simulado_events as unknown as { simulado_id: string | null } | null;
  if (!event?.simulado_id) notFound();
  const { data: simulado } = await supabase.from("simulados").select("*,simulado_questions(id,simulado_id,question_id,order_number,points,status,questions:question_id(id,code,statement,explanation_text,difficulty_level,year,question_type,correct_alternative_label,exam_boards:exam_board_id(id,name),subjects:subject_id(id,name,disciplines:discipline_id(id,name)),question_alternatives(id,label,text,image_url,is_correct,order_number)))").eq("id", event.simulado_id).single();
  if (!simulado) notFound();
  return <PreviewSimuladoClient simulado={simulado} />;
}
