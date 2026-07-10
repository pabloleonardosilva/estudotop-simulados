begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.simulados (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text,
  description text,
  discipline_id uuid references public.disciplines(id) on delete set null,
  status text not null default 'draft',
  question_count integer,
  time_limit_minutes integer,
  max_attempts integer,
  attempt_count_threshold_percent numeric(5,2) not null default 50.00,
  show_result_on_finish boolean not null default true,
  show_answer_key_on_finish boolean not null default false,
  instant_feedback_enabled boolean not null default false,
  show_teacher_comment boolean not null default true,
  correction_video_url text,
  shuffle_questions boolean not null default false,
  shuffle_alternatives boolean not null default false,
  allow_blank_answers boolean not null default false,
  scoring_model text not null default 'traditional',
  created_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint simulados_title_not_blank check (length(btrim(title)) > 0),
  constraint simulados_status_check check (status in ('draft', 'published', 'archived')),
  constraint simulados_question_count_check check (
    question_count is null
    or question_count > 0
  ),
  constraint simulados_time_limit_check check (
    time_limit_minutes is null
    or time_limit_minutes in (30, 60, 90, 120)
  ),
  constraint simulados_max_attempts_check check (
    max_attempts is null
    or max_attempts > 0
  ),
  constraint simulados_attempt_threshold_check check (
    attempt_count_threshold_percent >= 0
    and attempt_count_threshold_percent <= 100
  ),
  constraint simulados_scoring_model_check check (
    scoring_model in ('traditional', 'cebraspe')
  )
);

create unique index if not exists unique_simulados_slug
  on public.simulados (slug)
  where slug is not null;

create index if not exists idx_simulados_status
  on public.simulados (status);

create index if not exists idx_simulados_discipline_id
  on public.simulados (discipline_id);

create index if not exists idx_simulados_created_at
  on public.simulados (created_at);

create index if not exists idx_simulados_published_at
  on public.simulados (published_at);

drop trigger if exists trg_simulados_updated_at on public.simulados;

create trigger trg_simulados_updated_at
before update on public.simulados
for each row
execute function public.set_updated_at();

create table if not exists public.simulado_questions (
  id uuid primary key default gen_random_uuid(),
  simulado_id uuid not null references public.simulados(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
  order_number integer not null,
  points numeric(8,2) not null default 1.00,
  status text not null default 'active',
  annulled_at timestamptz,
  annulled_by uuid references public.profiles(id) on delete set null,
  annulment_reason text,
  is_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint simulado_questions_order_number_check check (order_number > 0),
  constraint simulado_questions_points_check check (points > 0),
  constraint simulado_questions_status_check check (status in ('active', 'annulled')),
  constraint simulado_questions_annulled_at_check check (
    status <> 'annulled'
    or annulled_at is not null
  )
);

create unique index if not exists unique_simulado_questions_question
  on public.simulado_questions (simulado_id, question_id);

create unique index if not exists unique_simulado_questions_order
  on public.simulado_questions (simulado_id, order_number);

create index if not exists idx_simulado_questions_simulado_id
  on public.simulado_questions (simulado_id);

create index if not exists idx_simulado_questions_question_id
  on public.simulado_questions (question_id);

create index if not exists idx_simulado_questions_order
  on public.simulado_questions (simulado_id, order_number);

create index if not exists idx_simulado_questions_status
  on public.simulado_questions (status);

drop trigger if exists trg_simulado_questions_updated_at on public.simulado_questions;

create trigger trg_simulado_questions_updated_at
before update on public.simulado_questions
for each row
execute function public.set_updated_at();

commit;
