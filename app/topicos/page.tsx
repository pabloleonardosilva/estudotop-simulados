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
  code: string | null;
  status: string | null;
  subject_id: string | null;
  evaluated_topics: string[] | null;
};

type TopicQuestion = {
  id: string;
  code: string;
  status: string;
};

async function fetchAllQuestions() {
  const supabase = createSupabaseAdminClient();
  const questions: QuestionRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("questions")
      .select("id, code, status, subject_id, evaluated_topics")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);

    const rows = (data || []) as QuestionRow[];
    questions.push(...rows);
    if (rows.length < pageSize) break;
  }

  return questions;
}

async function getData() {
  const supabase = createSupabaseAdminClient();
  const [disciplinesResult, subjectsResult, topicsResult, questions] = await Promise.all([
    supabase.from("disciplines").select("id, name, is_active").order("name", { ascending: true }),
    supabase.from("subjects").select("id, name, discipline_id, is_active").order("name", { ascending: true }),
    supabase.from("topics").select("id, name, normalized_name, subject_id, is_active, created_at, updated_at").order("name", { ascending: true }),
    fetchAllQuestions(),
  ]);

  if (disciplinesResult.error) throw new Error(disciplinesResult.error.message);
  if (subjectsResult.error) throw new Error(subjectsResult.error.message);
  if (topicsResult.error) throw new Error(topicsResult.error.message);
  const questionsByTopic = new Map<string, Map<string, TopicQuestion>>();
  for (const question of questions) {
    if (!question.subject_id || !Array.isArray(question.evaluated_topics)) continue;

    for (const name of question.evaluated_topics) {
      const key = `${question.subject_id}:${normalizeTopicComparableName(name)}`;
      const topicQuestions = questionsByTopic.get(key) || new Map<string, TopicQuestion>();
      topicQuestions.set(question.id, {
        id: question.id,
        code: question.code || question.id.slice(0, 8),
        status: question.status || "draft",
      });
      questionsByTopic.set(key, topicQuestions);
    }
  }

  const topics = ((topicsResult.data || []) as TopicRow[]).map((topic) => {
    const topicQuestions = Array.from(
      questionsByTopic.get(`${topic.subject_id}:${normalizeTopicComparableName(topic.name)}`)?.values() || [],
    ).sort((left, right) => left.code.localeCompare(right.code, "pt-BR", { numeric: true }));

    return {
      ...topic,
      usage_count: topicQuestions.length,
      questions: topicQuestions,
    };
  });

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
