import TopicosClient from "./page-client";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { normalizeTopicComparableName } from "@/lib/utils/text";
import { requireAdminPage } from "@/lib/server/authGuard";

export const dynamic = "force-dynamic";

type TopicRow = {
  id: string;
  name: string;
  normalized_name: string;
  subject_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type QuestionRow = {
  id: string;
  subject_id: string | null;
  evaluated_topics: string[] | null;
};

async function getData() {
  const supabase = createSupabaseAdminClient();
  const [disciplinesResult, subjectsResult, topicsResult, questionsResult] = await Promise.all([
    supabase.from("disciplines").select("id, name, is_active").order("name", { ascending: true }),
    supabase.from("subjects").select("id, name, discipline_id, is_active").order("name", { ascending: true }),
    supabase.from("topics").select("id, name, normalized_name, subject_id, is_active, created_at, updated_at").order("name", { ascending: true }),
    supabase.from("questions").select("id, subject_id, evaluated_topics"),
  ]);

  if (disciplinesResult.error) throw new Error(disciplinesResult.error.message);
  if (subjectsResult.error) throw new Error(subjectsResult.error.message);
  if (topicsResult.error) throw new Error(topicsResult.error.message);
  if (questionsResult.error) throw new Error(questionsResult.error.message);

  const usageByTopic = new Map<string, Set<string>>();
  for (const question of (questionsResult.data || []) as QuestionRow[]) {
    if (!question.subject_id || !Array.isArray(question.evaluated_topics)) continue;

    for (const name of question.evaluated_topics) {
      const key = `${question.subject_id}:${normalizeTopicComparableName(name)}`;
      const questionIds = usageByTopic.get(key) || new Set<string>();
      questionIds.add(question.id);
      usageByTopic.set(key, questionIds);
    }
  }

  const topics = ((topicsResult.data || []) as TopicRow[]).map((topic) => ({
    ...topic,
    usage_count: usageByTopic.get(`${topic.subject_id}:${normalizeTopicComparableName(topic.name)}`)?.size || 0,
  }));

  return {
    disciplines: disciplinesResult.data || [],
    subjects: subjectsResult.data || [],
    topics,
  };
}

export default async function TopicosPage() {
  await requireAdminPage();
  const data = await getData();
  return <TopicosClient initialDisciplines={data.disciplines} initialSubjects={data.subjects} initialTopics={data.topics} />;
}
