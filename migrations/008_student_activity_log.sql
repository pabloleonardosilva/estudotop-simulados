-- ============================================================
-- 008_student_activity_log.sql
-- Histórico de atividades do aluno: edições, mudanças de status,
-- atribuições de jornada, expansões de prazo e conclusões de simulado.
-- ============================================================

begin;

create table if not exists public.student_activity_log (
  id                uuid        primary key default gen_random_uuid(),
  student_id        uuid        not null references public.students(id) on delete cascade,
  event_type        text        not null,
  description       text        not null,
  details           jsonb       not null default '{}',
  performed_by_name text,
  created_at        timestamptz not null default now(),

  constraint student_activity_log_event_type_check
    check (event_type in (
      'cadastro',
      'field_update',
      'status_change',
      'jornada_assigned',
      'jornada_cancelled',
      'access_extended',
      'simulado_completed',
      'simulado_started',
      'simulado_abandoned'
    ))
);

create index if not exists idx_student_activity_log_student_id
  on public.student_activity_log (student_id);

create index if not exists idx_student_activity_log_created_at
  on public.student_activity_log (student_id, created_at desc);

commit;
