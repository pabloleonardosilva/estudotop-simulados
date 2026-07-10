-- ============================================================
-- 007_jornadas.sql
-- Tabelas do módulo de Jornadas: jornadas, jornada_simulados,
-- student_jornadas, student_jornada_simulados.
-- Referência: docs/sprint-b-jornadas-admin.md
-- NOTA: usa profiles(id) em vez de admins(id) — projeto não
--       possui tabela separada de admins.
-- ============================================================

begin;

-- ============================================================
-- 1. jornadas
-- ============================================================
create table if not exists public.jornadas (
  id                  uuid        primary key default gen_random_uuid(),
  title               text        not null,
  description         text,
  status              text        not null default 'draft',
  duration_months     integer     not null,
  exam_date           date,
  effective_end_date  date,
  created_by          uuid        references public.profiles(id) on delete set null,
  published_at        timestamptz,
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint jornadas_title_not_blank   check (length(btrim(title)) > 0),
  constraint jornadas_status_check      check (status in ('draft', 'published', 'archived')),
  constraint jornadas_duration_check    check (duration_months > 0)
);

create index if not exists idx_jornadas_status     on public.jornadas(status);
create index if not exists idx_jornadas_exam_date  on public.jornadas(exam_date);
create index if not exists idx_jornadas_created_at on public.jornadas(created_at);

drop trigger if exists trg_jornadas_updated_at on public.jornadas;
create trigger trg_jornadas_updated_at
  before update on public.jornadas
  for each row execute function public.set_updated_at();

-- ============================================================
-- 2. jornada_simulados
-- ============================================================
create table if not exists public.jornada_simulados (
  id           uuid    primary key default gen_random_uuid(),
  jornada_id   uuid    not null references public.jornadas(id) on delete cascade,
  simulado_id  uuid    not null references public.simulados(id),
  order_number integer not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint jornada_simulados_order_check check (order_number > 0),
  constraint unique_jornada_simulado       unique(jornada_id, simulado_id),
  constraint unique_jornada_order          unique(jornada_id, order_number)
);

create index if not exists idx_jornada_simulados_jornada_id  on public.jornada_simulados(jornada_id);
create index if not exists idx_jornada_simulados_simulado_id on public.jornada_simulados(simulado_id);
create index if not exists idx_jornada_simulados_order       on public.jornada_simulados(jornada_id, order_number);

drop trigger if exists trg_jornada_simulados_updated_at on public.jornada_simulados;
create trigger trg_jornada_simulados_updated_at
  before update on public.jornada_simulados
  for each row execute function public.set_updated_at();

-- ============================================================
-- 3. student_jornadas
-- ============================================================
create table if not exists public.student_jornadas (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id),
  jornada_id  uuid not null references public.jornadas(id),
  started_at  date not null default current_date,
  expires_at  date not null,
  status      text not null default 'active',
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint student_jornadas_status_check check (status in ('active', 'expired', 'cancelled')),
  constraint student_jornadas_dates_check  check (expires_at > started_at),
  constraint unique_student_jornada        unique(student_id, jornada_id)
);

create index if not exists idx_student_jornadas_student_id on public.student_jornadas(student_id);
create index if not exists idx_student_jornadas_jornada_id on public.student_jornadas(jornada_id);
create index if not exists idx_student_jornadas_status     on public.student_jornadas(status);
create index if not exists idx_student_jornadas_expires_at on public.student_jornadas(expires_at);

drop trigger if exists trg_student_jornadas_updated_at on public.student_jornadas;
create trigger trg_student_jornadas_updated_at
  before update on public.student_jornadas
  for each row execute function public.set_updated_at();

-- ============================================================
-- 4. student_jornada_simulados
-- ============================================================
create table if not exists public.student_jornada_simulados (
  id                   uuid    primary key default gen_random_uuid(),
  student_jornada_id   uuid    not null references public.student_jornadas(id) on delete cascade,
  jornada_simulado_id  uuid    not null references public.jornada_simulados(id),
  simulado_id          uuid    not null references public.simulados(id),
  order_number         integer not null,
  scheduled_release_at date    not null,
  released_at          timestamptz,
  status               text    not null default 'locked',
  completed_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint sjs_status_check               check (status in ('locked', 'available', 'in_progress', 'completed')),
  constraint unique_sjs_student_jornada_sim unique(student_jornada_id, jornada_simulado_id)
);

create index if not exists idx_sjs_student_jornada_id   on public.student_jornada_simulados(student_jornada_id);
create index if not exists idx_sjs_simulado_id          on public.student_jornada_simulados(simulado_id);
create index if not exists idx_sjs_status               on public.student_jornada_simulados(status);
create index if not exists idx_sjs_scheduled_release_at on public.student_jornada_simulados(scheduled_release_at);

drop trigger if exists trg_sjs_updated_at on public.student_jornada_simulados;
create trigger trg_sjs_updated_at
  before update on public.student_jornada_simulados
  for each row execute function public.set_updated_at();

commit;
