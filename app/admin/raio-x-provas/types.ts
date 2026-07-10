export type RaioXStatus = "draft" | "processing" | "review_pending" | "reviewed" | "archived" | "failed";

export type RaioXAnalysis = {
  id: string;
  title: string;
  contest_name: string;
  position_name: string;
  exam_year: number;
  board_id?: string | null;
  board_name: string;
  discipline_id?: string | null;
  discipline_name: string;
  status: RaioXStatus;
  summary_text?: string | null;
  ai_summary_text?: string | null;
  teacher_notes?: string | null;
  ai_adjustment_prompt?: string | null;
  final_summary_text?: string | null;
  dashboard: Record<string, unknown>;
  modules_summary: unknown[];
  raw_content?: string | null;
  created_at: string;
  updated_at: string;
};

export type QuestionDuplicateInfo = {
  id?: string;
  temp_id?: string;
  statement?: string | null;
  status?: string | null;
  similarity?: number | null;
  statement_similarity?: number | null;
  alternatives_similarity?: number | null;
  matched_metadata?: string[] | null;
};

export type RaioXQuestion = {
  id: string;
  exam_analysis_id: string;
  parent_question_id?: string | null;
  original_number?: string | null;
  statement: string;
  question_type: "multiple_choice" | "true_false";
  alternatives: { label: string; text: string; is_correct: boolean; image_url?: string | null }[];
  answer_key?: string | null;
  is_annulled: boolean;
  board_name?: string | null;
  year?: number | null;
  discipline_id?: string | null;
  discipline_name: string;
  subject_id?: string | null;
  subject_ids?: string[] | null;
  module_name?: string | null;
  subtopic_name?: string | null;
  knowledge_points: string[];
  difficulty_level?: number | null;
  difficulty_reason?: string | null;
  charging_profile?: string | null;
  explanation_text?: string | null;
  teacher_opinion?: string | null;
  has_image: boolean;
  visual_analysis_status: "none" | "pending" | "applied" | "review_required" | "failed";
  ai_confidence?: number | null;
  status: string;
  source_origin: string;
  created_question_id?: string | null;
  is_duplicate?: boolean | null;
  duplicate_type?: "batch" | "database" | "possible" | null;
  duplicate_message?: string | null;
  duplicate_of?: QuestionDuplicateInfo | null;
  created_at: string;
};

export type DisciplineOption = { id: string; name: string };
export type BoardOption = { id: string; name: string };
export type EntityOption = { id: string; name: string };
export type SubjectOption = { id: string; name: string; discipline_id: string };
