import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import PublicRaioXClient from "./page-client";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getAnalysisByToken(token: string): Promise<any> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("exam_analyses")
    .select("id,title,contest_name,position_name,exam_year,board_name,discipline_name,final_summary_text,summary_text,modules_summary,updated_at")
    .eq("public_token", token)
    .single();
  if (error || !data) notFound();
  return data;
}

async function getQuestionsData(analysisId: string) {
  const supabase = createSupabaseAdminClient();

  const { data: questions } = await supabase
    .from("exam_analysis_questions")
    .select("id,module_name,subject_id,subject_ids,difficulty_level,has_image,knowledge_points,status")
    .eq("exam_analysis_id", analysisId)
    .is("parent_question_id", null)
    .neq("status", "discarded");

  const active = questions || [];

  const subjectIds = [
    ...new Set(active.flatMap((q: any) => [
      ...(Array.isArray(q.subject_ids) ? q.subject_ids : []),
      ...(q.subject_id ? [q.subject_id] : []),
    ])),
  ].filter(Boolean) as string[];

  const subjectMap: Record<string, string> = {};
  if (subjectIds.length > 0) {
    const { data: subjects } = await supabase
      .from("subjects")
      .select("id,name")
      .in("id", subjectIds);
    for (const s of subjects || []) subjectMap[s.id] = s.name;
  }

  const groups: Record<string, { count: number; totalDiff: number; diffCount: number; points: string[] }> = {};
  for (const q of active) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const primaryId = (Array.isArray((q as any).subject_ids) ? (q as any).subject_ids[0] : null) || (q as any).subject_id || null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const groupName = (primaryId && subjectMap[primaryId]) ? subjectMap[primaryId] : ((q as any).module_name || "Não classificado");
    if (!groups[groupName]) groups[groupName] = { count: 0, totalDiff: 0, diffCount: 0, points: [] };
    groups[groupName].count++;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((q as any).difficulty_level) { groups[groupName].totalDiff += (q as any).difficulty_level; groups[groupName].diffCount++; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (Array.isArray((q as any).knowledge_points)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const pt of (q as any).knowledge_points) {
        if (pt && !groups[groupName].points.includes(pt)) groups[groupName].points.push(pt);
      }
    }
  }

  const total = active.length;
  const withImage = active.filter((q: any) => q.has_image).length;
  const avgDiff = total > 0
    ? active.reduce((s: number, q: any) => s + (Number(q.difficulty_level) || 0), 0) / total
    : 0;

  const effectiveModules = Object.entries(groups)
    .map(([module, d]) => ({
      module,
      question_count: d.count,
      percentage: total > 0 ? Math.round((d.count / total) * 100) : 0,
      average_difficulty: d.diffCount > 0 ? d.totalDiff / d.diffCount : null,
      knowledge_points: d.points.slice(0, 8),
      subtopics: [],
      charging_profile: null,
    }))
    .sort((a, b) => b.question_count - a.question_count);

  return { effectiveModules, totalQuestions: total, withImage, avgDiff };
}

export default async function PublicRaioXPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const analysis = await getAnalysisByToken(token);
  const questionsData = await getQuestionsData(analysis.id);

  return (
    <PublicRaioXClient
      analysis={analysis}
      effectiveModules={questionsData.effectiveModules}
      totalQuestions={questionsData.totalQuestions}
      withImage={questionsData.withImage}
      avgDiff={questionsData.avgDiff}
    />
  );
}
