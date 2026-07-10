import { notFound } from "next/navigation";
import RaioXDetalheClient from "./page-client";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdminPage } from "@/lib/server/authGuard";
import type { BoardOption, DisciplineOption, EntityOption, RaioXAnalysis, RaioXQuestion, SubjectOption } from "../types";

export type CloneSimulado = {
  id: string;
  title: string;
  status: string;
  question_count: number;
  created_at: string;
};

async function getContests(supabase: ReturnType<typeof createSupabaseAdminClient>): Promise<EntityOption[]> {
  const { data, error } = await supabase.from("exam_contests").select("id,name").eq("is_active", true).order("name");
  if (error) {
    const { data: fallback } = await supabase.from("exam_analyses").select("contest_name");
    const names = [...new Set((fallback || []).map((d) => d.contest_name).filter(Boolean))] as string[];
    return names.map((name) => ({ id: name, name }));
  }
  return (data || []) as EntityOption[];
}

async function getData(id: string): Promise<{
  analysis: RaioXAnalysis;
  questions: RaioXQuestion[];
  disciplines: DisciplineOption[];
  subjects: SubjectOption[];
  boards: BoardOption[];
  contests: EntityOption[];
  cloneSimulados: CloneSimulado[];
}> {
  const supabase = createSupabaseAdminClient();

  const { data: analysis, error } = await supabase
    .from("exam_analyses")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !analysis) notFound();

  const [{ data: questions }, { data: disciplines }, { data: subjects }, { data: boards }, { data: cloneSimulados }, contests] = await Promise.all([
    supabase
      .from("exam_analysis_questions")
      .select("*")
      .eq("exam_analysis_id", id)
      .neq("status", "variation")
      .order("created_at", { ascending: true }),
    supabase.from("disciplines").select("id,name").eq("is_active", true).order("name", { ascending: true }),
    supabase.from("subjects").select("id,name,discipline_id").eq("is_active", true).order("name", { ascending: true }),
    supabase.from("exam_boards").select("id,name").eq("is_active", true).order("name", { ascending: true }),
    supabase
      .from("simulados")
      .select("id,title,status,question_count,created_at")
      .eq("source_exam_analysis_id", id)
      .order("created_at", { ascending: false }),
    getContests(supabase),
  ]);

  return {
    analysis: analysis as RaioXAnalysis,
    questions: (questions || []) as RaioXQuestion[],
    disciplines: (disciplines || []) as DisciplineOption[],
    subjects: (subjects || []) as SubjectOption[],
    boards: (boards || []) as BoardOption[],
    contests,
    cloneSimulados: (cloneSimulados || []) as CloneSimulado[],
  };
}

export default async function RaioXDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const data = await getData(id);
  return <RaioXDetalheClient {...data} />;
}
