import { notFound } from "next/navigation";
import RelatorioClient from "./page-client";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdminPage } from "@/lib/server/authGuard";

async function getAnalysis(id: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("exam_analyses")
    .select("id,title,contest_name,position_name,exam_year,board_name,discipline_name,status,final_summary_text,summary_text,dashboard,modules_summary,teacher_notes,ai_adjustment_prompt,updated_at")
    .eq("id", id)
    .single();
  if (error || !data) notFound();
  return data;
}

function numericQuestionOrder(value: unknown, fallback: number) {
  const n = Number(String(value || "").replace(/\D+/g, ""));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function getQuestionsWithSubjects(analysisId: string) {
  const supabase = createSupabaseAdminClient();

  const { data: questions } = await supabase
    .from("exam_analysis_questions")
    .select("*")
    .eq("exam_analysis_id", analysisId)
    .is("parent_question_id", null)
    .neq("status", "discarded")
    .order("created_at", { ascending: true });

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

  const preparedQuestions = active
    .map((q: any, index: number) => {
      const primaryId = (Array.isArray(q.subject_ids) ? q.subject_ids[0] : null) || q.subject_id || null;
      const subjectName = primaryId && subjectMap[primaryId] ? subjectMap[primaryId] : (q.module_name || "Não classificado");
      const subtopicName = q.subtopic_name || null;
      const knowledge = Array.isArray(q.knowledge_points) ? q.knowledge_points.filter(Boolean) : [];
      const tags = Array.from(new Set([subjectName, subtopicName, ...knowledge].filter(Boolean)));
      return {
        ...q,
        subject_name: subjectName,
        subtopic_name: subtopicName,
        tags,
        _order: numericQuestionOrder(q.original_number, index + 1),
      };
    })
    .sort((a: any, b: any) => a._order - b._order)
    .map(({ _order, ...q }: any) => q);

  type GroupData = {
    count: number;
    totalDiff: number;
    diffCount: number;
    points: string[];
    tags: string[];
    questionNumbers: string[];
  };

  const groups: Record<string, GroupData> = {};
  for (const q of preparedQuestions) {
    const groupName = q.subject_name || q.module_name || "Não classificado";
    if (!groups[groupName]) groups[groupName] = { count: 0, totalDiff: 0, diffCount: 0, points: [], tags: [], questionNumbers: [] };
    groups[groupName].count++;
    if (q.difficulty_level) {
      groups[groupName].totalDiff += Number(q.difficulty_level) || 0;
      groups[groupName].diffCount++;
    }
    if (q.original_number) groups[groupName].questionNumbers.push(String(q.original_number));
    for (const pt of Array.isArray(q.knowledge_points) ? q.knowledge_points : []) {
      if (pt && !groups[groupName].points.includes(pt)) groups[groupName].points.push(pt);
      if (pt && !groups[groupName].tags.includes(pt)) groups[groupName].tags.push(pt);
    }
    if (q.subtopic_name && !groups[groupName].tags.includes(q.subtopic_name)) groups[groupName].tags.push(q.subtopic_name);
    if (groupName && !groups[groupName].tags.includes(groupName)) groups[groupName].tags.unshift(groupName);
  }

  const total = preparedQuestions.length;
  const withImage = preparedQuestions.filter((q: any) => q.has_image).length;
  const avgDiff = total > 0 ? preparedQuestions.reduce((s: number, q: any) => s + (Number(q.difficulty_level) || 0), 0) / total : 0;

  const effectiveModules = Object.entries(groups)
    .map(([module, d]) => ({
      module,
      question_count: d.count,
      percentage: total > 0 ? Math.round((d.count / total) * 100) : 0,
      average_difficulty: d.diffCount > 0 ? d.totalDiff / d.diffCount : null,
      knowledge_points: d.points.slice(0, 12),
      tags: d.tags.slice(0, 14),
      question_numbers: d.questionNumbers,
      subtopics: [],
      charging_profile: null,
    }))
    .sort((a, b) => b.question_count - a.question_count || a.module.localeCompare(b.module, "pt-BR"));

  return { effectiveModules, totalQuestions: total, withImage, avgDiff, questions: preparedQuestions };
}

export default async function RelatorioPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const [analysis, questionsData] = await Promise.all([
    getAnalysis(id),
    getQuestionsWithSubjects(id),
  ]);
  return (
    <RelatorioClient
      analysis={analysis}
      effectiveModules={questionsData.effectiveModules}
      totalQuestions={questionsData.totalQuestions}
      withImage={questionsData.withImage}
      avgDiff={questionsData.avgDiff}
      questions={questionsData.questions}
    />
  );
}
