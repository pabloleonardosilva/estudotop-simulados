begin;

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  admin_user_id uuid,
  admin_email text,
  action text not null,
  entity_type text,
  entity_id text,
  severity text not null default 'info' check (severity in ('info', 'warning', 'error', 'critical')),
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  request_path text,
  request_method text
);

create table if not exists public.security_event_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  actor_type text,
  actor_id uuid,
  actor_email text,
  event text not null,
  severity text not null default 'warning' check (severity in ('info', 'warning', 'error', 'critical')),
  resource_type text,
  resource_id text,
  ip_address text,
  user_agent text,
  request_path text,
  request_method text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.system_error_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text not null,
  message text not null,
  stack text,
  severity text not null default 'error' check (severity in ('warning', 'error', 'critical')),
  request_path text,
  request_method text,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.student_activity_log
  add column if not exists entity_type text,
  add column if not exists entity_id text,
  add column if not exists ip_address text,
  add column if not exists user_agent text;

do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'student_activity_log'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%event_type%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.student_activity_log drop constraint %I', constraint_name);
  end if;
end $$;

create index if not exists idx_admin_audit_logs_created_at on public.admin_audit_logs(created_at desc);
create index if not exists idx_admin_audit_logs_action on public.admin_audit_logs(action);
create index if not exists idx_admin_audit_logs_severity on public.admin_audit_logs(severity);
create index if not exists idx_admin_audit_logs_admin_user_id on public.admin_audit_logs(admin_user_id);
create index if not exists idx_admin_audit_logs_entity on public.admin_audit_logs(entity_type, entity_id);

create index if not exists idx_security_event_logs_created_at on public.security_event_logs(created_at desc);
create index if not exists idx_security_event_logs_event on public.security_event_logs(event);
create index if not exists idx_security_event_logs_severity on public.security_event_logs(severity);
create index if not exists idx_security_event_logs_actor_id on public.security_event_logs(actor_id);
create index if not exists idx_security_event_logs_resource on public.security_event_logs(resource_type, resource_id);

create index if not exists idx_system_error_logs_created_at on public.system_error_logs(created_at desc);
create index if not exists idx_system_error_logs_source on public.system_error_logs(source);
create index if not exists idx_system_error_logs_severity on public.system_error_logs(severity);

create index if not exists idx_student_activity_log_event_type on public.student_activity_log(event_type);
create index if not exists idx_student_activity_log_entity on public.student_activity_log(entity_type, entity_id);

drop trigger if exists trg_admin_audit_logs_updated_at on public.admin_audit_logs;
create trigger trg_admin_audit_logs_updated_at
  before update on public.admin_audit_logs
  for each row execute function public.set_updated_at();

drop trigger if exists trg_security_event_logs_updated_at on public.security_event_logs;
create trigger trg_security_event_logs_updated_at
  before update on public.security_event_logs
  for each row execute function public.set_updated_at();

drop trigger if exists trg_system_error_logs_updated_at on public.system_error_logs;
create trigger trg_system_error_logs_updated_at
  before update on public.system_error_logs
  for each row execute function public.set_updated_at();

commit;
