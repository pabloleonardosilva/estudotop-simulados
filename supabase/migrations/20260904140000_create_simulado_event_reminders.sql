begin;

-- Ledger de lembretes de Evento. Lembrete é EXCLUSIVAMENTE manual (decisão
-- de produto de 2026-09-04, sem agendamento automático) — uma linha por
-- OPERAÇÃO/LOTE disparado pelo Admin em "Enviar lembrete agora". O cooldown
-- global de 6h é lido a partir de max(completed_at) where status = 'sent'.
-- O índice único parcial abaixo garante no máximo uma operação "sending" por
-- Evento por vez, protegendo contra duplo clique, retry HTTP e duas abas
-- concorrentes — mesmo padrão de concorrência otimista já usado no restante
-- do módulo de Evento (UPDATE/INSERT condicional + confirmação por linha).
create table if not exists public.simulado_event_reminders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.simulado_events(id) on delete cascade,
  status text not null,
  reason text,
  recipients_total integer not null default 0,
  recipients_sent integer not null default 0,
  recipients_failed integer not null default 0,
  triggered_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint simulado_event_reminders_status_check check (status in ('sending', 'sent', 'failed'))
);

-- Registro individual por destinatário — auditoria e possível retry pontual,
-- sem afetar o cooldown (que é sempre do lote/Evento, nunca por aluno).
create table if not exists public.simulado_event_reminder_recipients (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references public.simulado_event_reminders(id) on delete cascade,
  event_id uuid not null references public.simulado_events(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  status text not null,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint simulado_event_reminder_recipients_status_check check (status in ('sent', 'failed'))
);

create index if not exists idx_simulado_event_reminders_event_id
  on public.simulado_event_reminders (event_id, created_at desc);
create index if not exists idx_simulado_event_reminders_event_status_completed
  on public.simulado_event_reminders (event_id, status, completed_at desc);
create unique index if not exists unique_simulado_event_reminders_inflight
  on public.simulado_event_reminders (event_id)
  where status = 'sending';

create index if not exists idx_simulado_event_reminder_recipients_reminder_id
  on public.simulado_event_reminder_recipients (reminder_id);
create index if not exists idx_simulado_event_reminder_recipients_event_id
  on public.simulado_event_reminder_recipients (event_id, created_at desc);

drop trigger if exists trg_simulado_event_reminders_updated_at on public.simulado_event_reminders;
create trigger trg_simulado_event_reminders_updated_at
before update on public.simulado_event_reminders
for each row execute function public.set_updated_at();

alter table public.simulado_event_reminders enable row level security;
alter table public.simulado_event_reminder_recipients enable row level security;
revoke all on table public.simulado_event_reminders from public, anon, authenticated;
revoke all on table public.simulado_event_reminder_recipients from public, anon, authenticated;
grant select, insert, update on table public.simulado_event_reminders to service_role;
grant select, insert on table public.simulado_event_reminder_recipients to service_role;

commit;
