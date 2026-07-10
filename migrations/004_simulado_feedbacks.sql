-- ============================================================
-- 004_simulado_feedbacks.sql
-- Avaliações dos alunos sobre o simulado (rating + comentário).
-- ============================================================

begin;

create extension if not exists pgcrypto;

create table if not exists public.simulado_feedbacks (
  id uuid primary key default gen_random_uuid(),
  simulado_id uuid not null references public.simulados(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  attempt_id uuid references public.simulado_attempts(id) on delete set null,
  rating integer not null,
  comment text,
  created_at timestamptz not null default now(),
  constraint simulado_feedbacks_rating_check check (rating >= 1 and rating <= 5)
);

create unique index if not exists unique_simulado_feedbacks_attempt
  on public.simulado_feedbacks (simulado_id, student_id, attempt_id);

create index if not exists idx_simulado_feedbacks_simulado
  on public.simulado_feedbacks (simulado_id);

create index if not exists idx_simulado_feedbacks_student
  on public.simulado_feedbacks (student_id);

create index if not exists idx_simulado_feedbacks_rating
  on public.simulado_feedbacks (rating);

commit;
