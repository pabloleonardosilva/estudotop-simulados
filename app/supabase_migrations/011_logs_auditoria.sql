-- Sprint Logs A — Central de Logs, Auditoria e Segurança
-- Rodar no Supabase antes de validar a tela /admin/logs.

create table if not exists public.system_activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null default 'system' check (actor_type in ('admin', 'student', 'system')),
  actor_id uuid null,
  actor_name text null,
  actor_email text null,
  action text not null,
  entity_type text null,
  entity_id uuid null,
  route text null,
  method text null,
  ip_address text null,
  user_agent text null,
  metadata jsonb not null default '{}'::jsonb,
  severity text not null default 'info' check (severity in ('info', 'warning', 'error', 'critical')),
  created_at timestamptz not null default now()
);

create index if not exists idx_system_activity_logs_actor on public.system_activity_logs(actor_type, actor_id);
create index if not exists idx_system_activity_logs_action on public.system_activity_logs(action);
create index if not exists idx_system_activity_logs_entity on public.system_activity_logs(entity_type, entity_id);
create index if not exists idx_system_activity_logs_severity on public.system_activity_logs(severity);
create index if not exists idx_system_activity_logs_created_at on public.system_activity_logs(created_at desc);

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  actor_type text null check (actor_type in ('admin', 'student', 'system')),
  actor_id uuid null,
  actor_email text null,
  ip_address text null,
  user_agent text null,
  route text null,
  method text null,
  risk_level text not null default 'low' check (risk_level in ('low', 'medium', 'high', 'critical')),
  blocked boolean not null default false,
  reason text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_security_events_type on public.security_events(event_type);
create index if not exists idx_security_events_actor on public.security_events(actor_type, actor_id);
create index if not exists idx_security_events_email on public.security_events(actor_email);
create index if not exists idx_security_events_risk on public.security_events(risk_level);
create index if not exists idx_security_events_created_at on public.security_events(created_at desc);

create table if not exists public.system_error_logs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  route text null,
  method text null,
  actor_type text null check (actor_type in ('admin', 'student', 'system')),
  actor_id uuid null,
  error_code text null,
  error_message text not null,
  safe_details jsonb not null default '{}'::jsonb,
  severity text not null default 'error' check (severity in ('warning', 'error', 'critical')),
  resolved_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_system_error_logs_source on public.system_error_logs(source);
create index if not exists idx_system_error_logs_actor on public.system_error_logs(actor_type, actor_id);
create index if not exists idx_system_error_logs_severity on public.system_error_logs(severity);
create index if not exists idx_system_error_logs_created_at on public.system_error_logs(created_at desc);
create index if not exists idx_system_error_logs_unresolved on public.system_error_logs(resolved_at) where resolved_at is null;

create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null check (actor_type in ('admin', 'student')),
  actor_id uuid not null,
  actor_name text null,
  actor_email text null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz null,
  duration_seconds integer null,
  ip_address text null,
  user_agent text null,
  last_route text null,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_user_sessions_actor on public.user_sessions(actor_type, actor_id);
create index if not exists idx_user_sessions_active on public.user_sessions(is_active, last_seen_at desc);
create index if not exists idx_user_sessions_last_seen on public.user_sessions(last_seen_at desc);

-- Marca como inativas sessões sem heartbeat recente.
-- Pode ser executado por pg_cron futuramente.
create or replace function public.close_stale_user_sessions(max_idle_minutes integer default 30)
returns integer
language plpgsql
security definer
as $$
declare
  affected integer;
begin
  update public.user_sessions
  set
    is_active = false,
    ended_at = coalesce(ended_at, last_seen_at),
    duration_seconds = greatest(0, extract(epoch from (coalesce(ended_at, last_seen_at) - started_at))::integer)
  where is_active = true
    and last_seen_at < now() - make_interval(mins => max_idle_minutes);

  get diagnostics affected = row_count;
  return affected;
end;
$$;

comment on table public.system_activity_logs is 'Auditoria geral de ações normais de admins, alunos e sistema.';
comment on table public.security_events is 'Eventos de segurança: login falho, acesso negado, sessão inválida e atividade suspeita.';
comment on table public.system_error_logs is 'Falhas técnicas sanitizadas para observabilidade administrativa.';
comment on table public.user_sessions is 'Sessões de uso com heartbeat e duração aproximada.';
