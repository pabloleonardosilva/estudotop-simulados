begin;

create table if not exists public.student_notifications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  action_url text,
  reference_type text,
  reference_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_student_notifications_student_pending
  on public.student_notifications (student_id, created_at)
  where read_at is null and dismissed_at is null;

create unique index if not exists unique_student_notifications_reference
  on public.student_notifications (student_id, type, reference_id);

drop trigger if exists trg_student_notifications_updated_at on public.student_notifications;
create trigger trg_student_notifications_updated_at
before update on public.student_notifications
for each row execute function public.set_updated_at();

alter table public.student_notifications enable row level security;
revoke all on table public.student_notifications from anon, authenticated;

comment on table public.student_notifications is
  'Notificações internas privadas do aluno, criadas e tratadas exclusivamente por APIs server-side.';
comment on column public.student_notifications.reference_id is
  'Em event_result_released referencia simulado_event_participants.id para idempotência individual.';

commit;
