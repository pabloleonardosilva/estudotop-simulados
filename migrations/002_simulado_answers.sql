-- ============================================================
-- 002_simulado_answers.sql
-- Respostas do aluno em cada questão de uma tentativa.
-- ============================================================

begin;

create extension if not exists pgcrypto;

create table if not exists public.simulado_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.simulado_attempts(id) on delete cascade,
  simulado_question_id uuid not null references public.simulado_questions(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
  selected_alternative_id uuid,
  selected_alternative_label text,
  is_correct boolean,
  is_locked boolean not null default false,
  answered_at timestamptz not null default now(),
  response_time_seconds integer not null default 0,
  changed_count integer not null default 0,
  alternative_order jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint simulado_answers_response_time_check check (response_time_seconds >= 0),
  constraint simulado_answers_changed_count_check check (changed_count >= 0)
);

create unique index if not exists unique_simulado_answers_attempt_question
  on public.simulado_answers (attempt_id, simulado_question_id);

create index if not exists idx_simulado_answers_attempt
  on public.simulado_answers (attempt_id);

create index if not exists idx_simulado_answers_question
  on public.simulado_answers (question_id);

create index if not exists idx_simulado_answers_simulado_question
  on public.simulado_answers (simulado_question_id);

create index if not exists idx_simulado_answers_is_correct
  on public.simulado_answers (is_correct);

drop trigger if exists trg_simulado_answers_updated_at on public.simulado_answers;

create trigger trg_simulado_answers_updated_at
before update on public.simulado_answers
for each row
execute function public.set_updated_at();

commit;
