export type SimuladoStatus = "draft" | "published" | "archived";
export type ScoringModel = "traditional" | "cebraspe";
export type FeedbackMode = "instant" | "final_only";

export type Discipline = {
  id: string;
  name: string;
};

export type Subject = {
  id: string;
  name: string;
  discipline_id: string | null;
};

export type ExamBoard = {
  id: string;
  name: string;
};

export type QuestionAlternative = {
  id: string;
  label: string;
  text: string;
  is_correct: boolean;
  order_number: number | null;
};

export type BankQuestion = {
  id: string;
  code?: string | null;
  statement: string | null;
  explanation_text?: string | null;
  evaluated_topics?: string[] | null;
  status: string | null;
  difficulty_level: number | null;
  year?: number | null;
  question_type?: string | null;
  exam_boards?: ExamBoard | null;
  subjects?: (Subject & { disciplines?: Discipline | null }) | null;
  question_subjects?: {
    subjects?: (Subject & { disciplines?: Discipline | null }) | null;
  }[];
  question_alternatives?: QuestionAlternative[];
  simulado_questions?: {
    id: string;
    simulados?: { id: string; title: string | null; status: SimuladoStatus | string | null } | null;
  }[];
  correct_count?: number | null;
  wrong_count?: number | null;
  total_answered_count?: number | null;
  accuracy_rate?: number | null;
};

export type SimuladoQuestion = {
  id: string;
  simulado_id: string;
  question_id: string;
  order_number: number;
  points: number;
  status: "active" | "annulled";
  questions?: BankQuestion | null;
};

export type Simulado = {
  id: string;
  title: string;
  slug?: string | null;
  description?: string | null;
  discipline_id?: string | null;
  disciplines?: Discipline | null;
  status: SimuladoStatus;
  question_count?: number | null;
  time_limit_minutes?: number | null;
  max_attempts?: number | null;
  attempt_count_threshold_percent?: number | null;
  show_result_on_finish: boolean;
  show_answer_key_on_finish: boolean;
  instant_feedback_enabled: boolean;
  feedback_mode?: FeedbackMode | null;
  show_teacher_comment: boolean;
  correction_video_url?: string | null;
  shuffle_questions: boolean;
  shuffle_alternatives: boolean;
  allow_blank_answers: boolean;
  scoring_model: ScoringModel;
  owl_help_enabled?: boolean | null;
  owl_help_limit?: number | null;
  created_at: string;
  updated_at: string;
  published_at?: string | null;
  archived_at?: string | null;
  simulado_questions?: { id: string }[];
  execution_count?: number | null;
  average_score?: number | null;
  average_percentage?: number | null;
  jornadas_titles?: string[];
  jornadas_count?: number | null;
  jornadas?: { id: string; title: string; status: string; order_number: number; link_id: string }[];
};

export type SimuladoPayload = {
  title: string;
  description?: string | null;
  discipline_id?: string | null;
  status: SimuladoStatus;
  question_count?: number | null;
  time_limit_minutes?: number | null;
  max_attempts?: number | null;
  show_result_on_finish: boolean;
  show_answer_key_on_finish: boolean;
  instant_feedback_enabled: boolean;
  feedback_mode?: FeedbackMode | null;
  show_teacher_comment: boolean;
  correction_video_url?: string | null;
  shuffle_questions: boolean;
  shuffle_alternatives: boolean;
  allow_blank_answers: boolean;
  scoring_model: ScoringModel;
  owl_help_enabled?: boolean | null;
  owl_help_limit?: number | null;
};
