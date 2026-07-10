import type { SupabaseClient } from "@supabase/supabase-js";

type SubjectIdInput = {
  subject_id?: string | null;
  subject_ids?: unknown;
};

function clean(value?: string | null) {
  return String(value || "").trim();
}

export function normalizeSubjectIds(input: SubjectIdInput) {
  const values = Array.isArray(input.subject_ids) ? input.subject_ids : [];
  const ids = values
    .map((value) => clean(String(value || "")))
    .filter(Boolean);

  const fallback = clean(input.subject_id);
  if (fallback) ids.push(fallback);

  return Array.from(new Set(ids));
}

export function primarySubjectId(subjectIds: string[]) {
  return subjectIds[0] || null;
}

export async function syncQuestionSubjects({
  supabase,
  questionId,
  subjectIds,
}: {
  supabase: SupabaseClient;
  questionId: string;
  subjectIds: string[];
}) {
  await supabase.from("question_subjects").delete().eq("question_id", questionId);

  if (!subjectIds.length) return;

  const { error } = await supabase.from("question_subjects").insert(
    subjectIds.map((subjectId) => ({
      question_id: questionId,
      subject_id: subjectId,
    })),
  );

  if (error) throw new Error(error.message);
}

type QuestionSubject = {
  id?: string;
  name?: string;
  discipline_id?: string | null;
  disciplines?: {
    id?: string;
    name?: string;
  } | null;
};

type QuestionLike = {
  subject_id?: string | null;
  subjects?: QuestionSubject | null;
  question_subjects?: Array<{
    subjects?: QuestionSubject | null;
    subject?: QuestionSubject | null;
  }> | null;
};

export function extractQuestionSubjects(question: QuestionLike): QuestionSubject[] {
  const linked = Array.isArray(question?.question_subjects)
    ? question.question_subjects
        .map((item) => item?.subjects || item?.subject)
        .filter((subject): subject is QuestionSubject => Boolean(subject))
    : [];

  if (linked.length) return linked;
  return question?.subjects ? [question.subjects] : [];
}

export function extractQuestionSubjectIds(question: QuestionLike) {
  const ids = extractQuestionSubjects(question)
    .map((subject) => subject?.id)
    .filter((id): id is string => Boolean(id));

  if (question?.subject_id) ids.push(question.subject_id);
  return Array.from(new Set(ids));
}

export function formatQuestionSubjects(question: QuestionLike) {
  const subjects = extractQuestionSubjects(question);
  return subjects.map((subject) => subject?.name).filter(Boolean).join(", ") || "Sem assunto";
}

export function getQuestionDisciplineIds(question: QuestionLike) {
  return Array.from(
    new Set(
      extractQuestionSubjects(question)
        .map((subject) => subject?.disciplines?.id || subject?.discipline_id || "")
        .filter((id): id is string => Boolean(id)),
    ),
  );
}
