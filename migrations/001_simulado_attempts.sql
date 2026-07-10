-- ============================================================
-- 001_simulado_attempts.sql
-- Tabela que armazena cada tentativa de aluno em um simulado.
-- ============================================================

begin;

create extension if not exists pgcrypto;

create table if not exists public.simulado_attempts (
  id uuid primary key default gen_random_uuid(),
  simulado_id uuid not null references public.simulados(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  attempt_number integer not null default 1,
  status text not null default 'in_progress',
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  submitted_at timestamptz,
  expires_at timestamptz,
  counted_at timestamptz,
  counts_toward_limit boolean not null default false,
  answered_count integer not null default 0,
  total_questions integer not null default 0,
  progress_percent numeric(5, 2) not null default 0,
  time_spent_seconds integer not null default 0,
  question_order jsonb not null default '[]'::jsonb,
  settings_snapshot jsonb not null default '{}'::jsonb,
  tab_switch_count integer not null default 0,
  focus_violation_count integer not null default 0,
  disqualified_at timestamptz,
  disqualification_reason text,
  rules_accepted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint simulado_attempts_status_check check (
    status in ('in_progress', 'completed', 'disqualified', 'expired', 'abandoned')
  ),
  constraint simulado_attempts_attempt_number_check check (attempt_number > 0),
  constraint simulado_attempts_answered_count_check check (answered_count >= 0),
  constraint simulado_attempts_total_questions_check check (total_questions >= 0),
  constraint simulado_attempts_progress_percent_check check (
    progress_percent >= 0 and progress_percent <= 100
  ),
  constraint simulado_attempts_time_spent_check check (time_spent_seconds >= 0),
  constraint simulado_attempts_violation_check check (
    tab_switch_count >= 0 and focus_violation_count >= 0
  ),
  constraint simulado_attempts_disqualified_consistency check (
    (status = 'disqualified' and disqualified_at is not null)
    or status <> 'disqualified'
  )
);

-- Apenas uma tentativa em andamento por aluno + simulado
create unique index if not exists unique_simulado_attempts_in_progress
  on public.simulado_attempts (simulado_id, student_id)
  where status = 'in_progress';

create index if not exists idx_simulado_attempts_student
  on public.simulado_attempts (student_id);

create index if not exists idx_simulado_attempts_simulado
  on public.simulado_attempts (simulado_id);

create index if not exists idx_simulado_attempts_status
  on public.simulado_attempts (status);

create index if not exists idx_simulado_attempts_student_simulado
  on public.simulado_attempts (student_id, simulado_id);

create index if not exists idx_simulado_attempts_submitted_at
  on public.simulado_attempts (submitted_at);

drop trigger if exists trg_simulado_attempts_updated_at on public.simulado_attempts;

create trigger trg_simulado_attempts_updated_at
before update on public.simulado_attempts
for each row
execute function public.set_updated_at();

commit;
