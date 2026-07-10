-- ============================================================
-- 006_students.sql
-- Redesign completo da tabela students conforme
-- docs/simulados-arquitetura-mestre.md seção 4.1.
-- ATENÇÃO: remove a tabela students anterior (schema incompatível).
-- ============================================================

begin;

drop table if exists public.students cascade;

create table public.students (
  id            uuid        primary key references auth.users(id) on delete cascade,
  name          text        not null,
  email         text        not null,
  password_hash text,
  google_id     text,
  avatar_url    text,
  phone         text,
  cpf           text,
  status        text        not null default 'pending',
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint students_email_unique unique (email),
  constraint students_status_check check (status in ('pending', 'active', 'blocked', 'inactive'))
);

-- Partial unique index: google_id único apenas quando preenchido
create unique index if not exists students_google_id_unique
  on public.students (google_id)
  where google_id is not null;

create index if not exists idx_students_email
  on public.students (email);

create index if not exists idx_students_status
  on public.students (status);

create index if not exists idx_students_google_id
  on public.students (google_id);

drop trigger if exists trg_students_updated_at on public.students;

create trigger trg_students_updated_at
  before update on public.students
  for each row execute function public.set_updated_at();

commit;
