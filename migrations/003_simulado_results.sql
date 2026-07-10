-- ============================================================
-- 003_simulado_results.sql
-- Resultado consolidado de uma tentativa finalizada.
-- ============================================================

begin;

create extension if not exists pgcrypto;

create table if not exists public.simulado_results (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.simulado_attempts(id) on delete cascade,
  simulado_id uuid not null references public.simulados(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  total_questions integer not null default 0,
  answered_questions integer not null default 0,
  correct_count integer not null default 0,
  wrong_count integer not null default 0,
  blank_count integer not null default 0,
  annulled_count integer not null default 0,
  score numeric(10, 2) not null default 0,
  display_score numeric(10, 2) not null default 0,
  max_score numeric(10, 2) not null default 0,
  percentage numeric(7, 2) not null default 0,
  display_percentage numeric(7, 2) not null default 0,
  scoring_model text not null default 'traditional',
  time_spent_seconds integer not null default 0,
  finished_at timestamptz not null default now(),
  had_live_rule_change boolean not null default false,
  last_reprocessed_at timestamptz,
  reprocess_reason text,
  result_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint simulado_results_attempt_unique unique (attempt_id),
  constraint simulado_results_scoring_model_check check (
    scoring_model in ('traditional', 'cebraspe')
  ),
  constraint simulado_results_total_questions_check check (total_questions >= 0),
  constraint simulado_results_answered_questions_check check (answered_questions >= 0),
  constraint simulado_results_correct_check check (correct_count >= 0),
  constraint simulado_results_wrong_check check (wrong_count >= 0),
  constraint simulado_results_blank_check check (blank_count >= 0),
  constraint simulado_results_annulled_check check (annulled_count >= 0),
  constraint simulado_results_max_score_check check (max_score >= 0),
  constraint simulado_results_display_score_check check (display_score >= 0),
  constraint simulado_results_percentage_check check (percentage >= -100 and percentage <= 100),
  constraint simulado_results_display_percentage_check check (
    display_percentage >= 0 and display_percentage <= 100
  ),
  constraint simulado_results_time_spent_check check (time_spent_seconds >= 0)
);

create index if not exists idx_simulado_results_simulado
  on public.simulado_results (simulado_id);

create index if not exists idx_simulado_results_student
  on public.simulado_results (student_id);

create index if not exists idx_simulado_results_simulado_student
  on public.simulado_results (simulado_id, student_id);

create index if not exists idx_simulado_results_finished_at
  on public.simulado_results (finished_at);

create index if not exists idx_simulado_results_display_percentage
  on public.simulado_results (display_percentage);

drop trigger if exists trg_simulado_results_updated_at on public.simulado_results;

create trigger trg_simulado_results_updated_at
before update on public.simulado_results
for each row
execute function public.set_updated_at();

commit;
