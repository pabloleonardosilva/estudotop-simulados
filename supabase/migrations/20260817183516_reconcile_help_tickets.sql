begin;

create table if not exists public.student_help_messages (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  contact_reason text,
  message text not null,
  status text not null default 'open',
  admin_reply text,
  replied_at timestamptz,
  replied_by uuid references public.profiles(id),
  student_seen_reply_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.student_help_messages
  add column if not exists contact_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.student_help_messages'::regclass
      and conname = 'student_help_messages_status_check'
  ) then
    alter table public.student_help_messages
      add constraint student_help_messages_status_check
      check (status in ('open', 'answered'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.student_help_messages'::regclass
      and conname = 'student_help_messages_contact_reason_check'
  ) then
    alter table public.student_help_messages
      add constraint student_help_messages_contact_reason_check
      check (
        contact_reason is null
        or contact_reason in ('system_usage_question', 'system_malfunction', 'praise_or_suggestion')
      );
  end if;
end
$$;

create index if not exists idx_student_help_messages_student_id
  on public.student_help_messages (student_id);
create index if not exists idx_student_help_messages_status
  on public.student_help_messages (status);
create index if not exists idx_student_help_messages_contact_reason
  on public.student_help_messages (contact_reason);
create index if not exists idx_student_help_messages_created_at
  on public.student_help_messages (created_at desc);

drop trigger if exists trg_student_help_messages_updated_at on public.student_help_messages;
create trigger trg_student_help_messages_updated_at
  before update on public.student_help_messages
  for each row execute function public.set_updated_at();

alter table public.student_help_messages enable row level security;
revoke all on table public.student_help_messages from anon, authenticated;

comment on table public.student_help_messages is 'Tickets de ajuda enviados pelos alunos e respondidos por administradores.';
comment on column public.student_help_messages.contact_reason is 'Motivo estável do contato; nulo apenas para tickets históricos anteriores à classificação.';

commit;
