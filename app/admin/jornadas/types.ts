export type JornadaStatus = "draft" | "published" | "archived";
export type JornadaScopeType = "general" | "contest";
export type JornadaCategory = "saude" | "policial" | "tribunais" | "administrativo";
export type StudentJornadaStatus = "active" | "expired" | "cancelled" | "paused";
export type SJSStatus = "locked" | "available" | "in_progress" | "completed";

export type Jornada = {
  id: string;
  title: string;
  description: string | null;
  status: JornadaStatus;
  scope_type: JornadaScopeType;
  category: JornadaCategory | null;
  contest_name: string | null;
  exam_name?: string | null;
  exam_position?: string | null;
  exam_board?: string | null;
  welcome_title?: string | null;
  welcome_message?: string | null;
  study_strategy?: string | null;
  important_guidelines?: string | null;
  journey_highlights?: string[] | null;
  planned_simulados_count: number;
  duration_days: number | null;
  duration_months: number;
  exam_date: string | null;
  effective_end_date: string | null;
  created_by: string | null;
  published_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  simulado_count?: number;
  student_count?: number;
};

export type JornadaSimulado = {
  id: string;
  jornada_id: string;
  simulado_id: string;
  order_number: number;
  created_at: string;
  simulados?: {
    id: string;
    title: string;
    status: string;
    question_count: number | null;
  } | null;
};

export type StudentJornada = {
  id: string;
  student_id: string;
  jornada_id: string;
  started_at: string;
  expires_at: string;
  status: StudentJornadaStatus;
  assigned_by: string | null;
  created_at: string;
  students?: {
    id: string;
    name: string;
    email: string;
  } | null;
  progress?: {
    completed: number;
    total: number;
  };
};

export type StudentJornadaSimulado = {
  id: string;
  student_jornada_id: string;
  jornada_simulado_id: string;
  simulado_id: string;
  order_number: number;
  scheduled_release_at: string;
  released_at: string | null;
  status: SJSStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AvailableStudent = {
  id: string;
  name: string;
  email: string;
  status: string;
};

export type AvailableSimulado = {
  id: string;
  title: string;
  status: string;
  question_count: number | null;
};
