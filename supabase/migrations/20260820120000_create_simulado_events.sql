begin;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'profiles'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'student', 'professor'));

create table if not exists public.professors (
  id uuid primary key references auth.users(id) on delete restrict,
  name text not null,
  email text not null,
  phone text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint professors_status_check check (status in ('active', 'inactive'))
);

create unique index if not exists unique_professors_email_lower
  on public.professors (lower(email));

create table if not exists public.simulado_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  simulado_id uuid references public.simulados(id) on delete restrict,
  status text not null default 'scheduled',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  duration_minutes integer not null,
  result_policy text not null default 'blocked',
  code text not null,
  public_slug text not null default encode(gen_random_bytes(18), 'hex'),
  started_at timestamptz,
  closed_at timestamptz,
  archived_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint simulado_events_status_check check (status in ('scheduled', 'active', 'closed', 'archived')),
  constraint simulado_events_result_policy_check check (result_policy in ('blocked', 'released')),
  constraint simulado_events_duration_check check (duration_minutes > 0),
  constraint simulado_events_dates_check check (ends_at > starts_at)
);

create unique index if not exists unique_simulado_events_code on public.simulado_events (code);
create unique index if not exists unique_simulado_events_public_slug on public.simulado_events (public_slug);
create index if not exists idx_simulado_events_simulado on public.simulado_events (simulado_id);
create index if not exists idx_simulado_events_status_dates on public.simulado_events (status, starts_at, ends_at);

create table if not exists public.simulado_event_professors (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.simulado_events(id) on delete restrict,
  professor_id uuid not null references public.professors(id) on delete restrict,
  created_at timestamptz not null default now()
);

create unique index if not exists unique_simulado_event_professors
  on public.simulado_event_professors (event_id, professor_id);
create index if not exists idx_simulado_event_professors_professor
  on public.simulado_event_professors (professor_id);

create table if not exists public.simulado_event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.simulado_events(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  joined_at timestamptz not null default now(),
  source text not null default 'public_link',
  representative_attempt_id uuid references public.simulado_attempts(id) on delete set null,
  result_released_at timestamptz,
  result_release_email_sent_at timestamptz,
  result_release_email_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint simulado_event_participants_source_check check (source in ('public_link', 'admin', 'registration'))
);

create unique index if not exists unique_simulado_event_participants
  on public.simulado_event_participants (event_id, student_id);
create index if not exists idx_simulado_event_participants_student
  on public.simulado_event_participants (student_id);

create table if not exists public.simulado_event_join_intents (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.simulado_events(id) on delete cascade,
  email text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists unique_simulado_event_join_intents_token
  on public.simulado_event_join_intents (token_hash);
create index if not exists idx_simulado_event_join_intents_expiry
  on public.simulado_event_join_intents (expires_at);

alter table public.simulado_attempts
  add column if not exists attempt_context text not null default 'standalone',
  add column if not exists event_id uuid references public.simulado_events(id) on delete restrict,
  add column if not exists event_participant_id uuid references public.simulado_event_participants(id) on delete restrict,
  add column if not exists is_preview boolean not null default false;

alter table public.simulado_attempts
  drop constraint if exists simulado_attempts_context_check;
alter table public.simulado_attempts
  add constraint simulado_attempts_context_check
  check (attempt_context in ('standalone', 'jornada', 'event', 'professor_preview'));

create index if not exists idx_simulado_attempts_event on public.simulado_attempts (event_id, status);
create index if not exists idx_simulado_attempts_event_participant on public.simulado_attempts (event_participant_id);

alter table public.students
  add column if not exists origin_event_id uuid references public.simulado_events(id) on delete set null,
  add column if not exists origin_registered_at timestamptz;

drop trigger if exists trg_professors_updated_at on public.professors;
create trigger trg_professors_updated_at before update on public.professors
for each row execute function public.set_updated_at();

drop trigger if exists trg_simulado_events_updated_at on public.simulado_events;
create trigger trg_simulado_events_updated_at before update on public.simulado_events
for each row execute function public.set_updated_at();

drop trigger if exists trg_simulado_event_participants_updated_at on public.simulado_event_participants;
create trigger trg_simulado_event_participants_updated_at before update on public.simulado_event_participants
for each row execute function public.set_updated_at();

alter table public.professors enable row level security;
alter table public.simulado_events enable row level security;
alter table public.simulado_event_professors enable row level security;
alter table public.simulado_event_participants enable row level security;
alter table public.simulado_event_join_intents enable row level security;

revoke all on table public.professors from anon, authenticated;
revoke all on table public.simulado_events from anon, authenticated;
revoke all on table public.simulado_event_professors from anon, authenticated;
revoke all on table public.simulado_event_participants from anon, authenticated;
revoke all on table public.simulado_event_join_intents from anon, authenticated;

commit;
