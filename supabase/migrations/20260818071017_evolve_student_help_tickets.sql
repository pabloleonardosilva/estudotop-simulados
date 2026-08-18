begin;

create sequence if not exists public.student_help_ticket_number_seq;
revoke all on sequence public.student_help_ticket_number_seq from public, anon, authenticated;
grant usage, select on sequence public.student_help_ticket_number_seq to service_role;

alter table public.student_help_messages
  add column if not exists ticket_number text,
  add column if not exists admin_seen_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid references public.profiles(id) on delete set null,
  add column if not exists internal_note text,
  add column if not exists technical_context jsonb;

create or replace function public.set_student_help_ticket_number()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.ticket_number is null or btrim(new.ticket_number) = '' then
    new.ticket_number := 'AJ-' || to_char(coalesce(new.created_at, now()), 'YYYY') || '-'
      || lpad(nextval('public.student_help_ticket_number_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_student_help_messages_ticket_number on public.student_help_messages;
create trigger trg_student_help_messages_ticket_number
  before insert on public.student_help_messages
  for each row execute function public.set_student_help_ticket_number();

do $$
declare
  row_record record;
begin
  for row_record in
    select id, created_at
    from public.student_help_messages
    where ticket_number is null or btrim(ticket_number) = ''
    order by created_at, id
  loop
    update public.student_help_messages
    set ticket_number = 'AJ-' || to_char(row_record.created_at, 'YYYY') || '-'
      || lpad(nextval('public.student_help_ticket_number_seq')::text, 6, '0')
    where id = row_record.id;
  end loop;
end
$$;

alter table public.student_help_messages
  alter column ticket_number set not null;

create unique index if not exists unique_student_help_messages_ticket_number
  on public.student_help_messages (ticket_number);
create index if not exists idx_student_help_messages_admin_seen_at
  on public.student_help_messages (admin_seen_at);
create index if not exists idx_student_help_messages_updated_at
  on public.student_help_messages (updated_at desc);

alter table public.student_help_messages
  drop constraint if exists student_help_messages_status_check;
alter table public.student_help_messages
  add constraint student_help_messages_status_check
  check (status in ('open', 'answered', 'closed'));

create table if not exists public.student_help_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.student_help_messages(id) on delete cascade,
  author_type text not null,
  author_id uuid,
  message text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  edited_by uuid references public.profiles(id) on delete set null,
  constraint student_help_ticket_messages_author_type_check check (author_type in ('student', 'admin')),
  constraint student_help_ticket_messages_message_check check (char_length(btrim(message)) between 1 and 5000)
);

create index if not exists idx_student_help_ticket_messages_ticket_id
  on public.student_help_ticket_messages (ticket_id, created_at);

create table if not exists public.student_help_ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.student_help_messages(id) on delete cascade,
  event_type text not null,
  actor_type text not null,
  actor_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint student_help_ticket_events_actor_type_check check (actor_type in ('student', 'admin', 'system')),
  constraint student_help_ticket_events_event_type_check check (
    event_type in (
      'created', 'admin_viewed', 'admin_replied', 'student_viewed',
      'student_replied', 'reply_edited', 'closed', 'reopened'
    )
  )
);

create index if not exists idx_student_help_ticket_events_ticket_id
  on public.student_help_ticket_events (ticket_id, created_at);

insert into public.student_help_ticket_messages (ticket_id, author_type, author_id, message, created_at)
select ticket.id, 'student', ticket.student_id, ticket.message, ticket.created_at
from public.student_help_messages ticket
where not exists (
  select 1 from public.student_help_ticket_messages existing
  where existing.ticket_id = ticket.id and existing.author_type = 'student'
);

insert into public.student_help_ticket_messages (ticket_id, author_type, author_id, message, created_at)
select ticket.id, 'admin', ticket.replied_by, ticket.admin_reply, coalesce(ticket.replied_at, ticket.updated_at)
from public.student_help_messages ticket
where ticket.admin_reply is not null
  and ticket.replied_by is not null
  and not exists (
    select 1 from public.student_help_ticket_messages existing
    where existing.ticket_id = ticket.id and existing.author_type = 'admin'
  );

insert into public.student_help_ticket_events (ticket_id, event_type, actor_type, actor_id, created_at)
select ticket.id, 'created', 'student', ticket.student_id, ticket.created_at
from public.student_help_messages ticket
where not exists (
  select 1 from public.student_help_ticket_events event
  where event.ticket_id = ticket.id and event.event_type = 'created'
);

insert into public.student_help_ticket_events (ticket_id, event_type, actor_type, actor_id, created_at)
select ticket.id, 'admin_replied', 'admin', ticket.replied_by, coalesce(ticket.replied_at, ticket.updated_at)
from public.student_help_messages ticket
where ticket.admin_reply is not null
  and ticket.replied_by is not null
  and not exists (
    select 1 from public.student_help_ticket_events event
    where event.ticket_id = ticket.id and event.event_type = 'admin_replied'
  );

alter table public.student_help_ticket_messages enable row level security;
alter table public.student_help_ticket_events enable row level security;
revoke all on table public.student_help_ticket_messages from anon, authenticated;
revoke all on table public.student_help_ticket_events from anon, authenticated;

comment on column public.student_help_messages.ticket_number is 'Identificador público permanente e único do ticket no formato AJ-AAAA-NNNNNN.';
comment on column public.student_help_messages.admin_seen_at is 'Momento em que um administrador abriu o detalhe após a última interação do aluno.';
comment on column public.student_help_messages.technical_context is 'Contexto técnico mínimo enviado somente em relatos de mau funcionamento.';
comment on table public.student_help_ticket_messages is 'Mensagens cronológicas de alunos e administradores dentro de um ticket de ajuda.';
comment on table public.student_help_ticket_events is 'Linha do tempo operacional e auditável de cada ticket de ajuda.';

revoke all on function public.set_student_help_ticket_number() from public, anon, authenticated;
grant execute on function public.set_student_help_ticket_number() to service_role;

commit;
