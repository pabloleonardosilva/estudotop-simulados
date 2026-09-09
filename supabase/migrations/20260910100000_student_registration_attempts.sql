begin;

-- Central administrativa de tentativas incompletas de cadastro público de
-- aluno (Configurações → "Tentativas de cadastro"). Rastreia a jornada de
-- quem forneceu nome/e-mail e recebeu um código de confirmação mas não
-- concluiu a criação da conta — nunca simples visitas, nunca dados digitados
-- antes do envio voluntário do formulário. NÃO substitui
-- student_registration_confirmations (que continua responsável pelo
-- código/expiração/fluxo técnico) — esta tabela tem responsabilidade
-- diferente: rastrear a jornada incompleta para recuperação administrativa.
-- Nenhuma senha, OTP, token ou segredo é armazenado aqui.
create table if not exists public.student_registration_attempts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  email text not null,
  email_normalized text not null,
  full_name text not null,
  phone text,
  phone_normalized text,

  -- status: estado administrativo (o que o admin decidiu/observou).
  -- stage: etapa técnica real do fluxo de cadastro naquele momento.
  -- Nunca misturar os dois conceitos.
  status text not null default 'open'
    check (status in ('open', 'contacted', 'ignored', 'completed')),
  stage text not null default 'confirmation_sent'
    check (stage in ('confirmation_sent', 'confirmation_confirmed', 'account_creation_failed', 'completed')),

  source text check (source in ('public_signup', 'event_signup')),
  source_context_id uuid,

  first_started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  confirmation_requested_at timestamptz,
  confirmation_confirmed_at timestamptz,
  completed_at timestamptz,
  ignored_at timestamptz,

  attempt_count integer not null default 1,
  confirmation_send_count integer not null default 1,

  -- Código interno sanitizado (StudentAccountErrorCode) + mensagem amigável
  -- já sanitizada (lib/server/studentAccountService.ts). Nunca SQL bruto,
  -- stack trace ou payload do Supabase.
  last_failure_code text,
  last_failure_message text,

  admin_contacted_at timestamptz,
  admin_contacted_by uuid,
  admin_notes text
);

comment on table public.student_registration_attempts is
  'Tentativas de cadastro público de aluno iniciadas (nome+e-mail enviados, código gerado) e ainda não concluídas em auth.users+profiles+students. Uma linha por e-mail normalizado enquanto status <> completed. Nunca contém senha, OTP ou token.';

-- Uma única tentativa NÃO concluída por e-mail normalizado — garante
-- dedupe/idempotência mesmo sob concorrência (ver funções abaixo, que usam
-- este índice como alvo do ON CONFLICT). Uma vez completed, um novo e-mail
-- igual não deve mais colidir aqui (o fluxo de cadastro já rejeita e-mail
-- de aluno existente antes de chegar a este ponto).
create unique index if not exists student_registration_attempts_open_email_unique
  on public.student_registration_attempts (email_normalized)
  where status <> 'completed';

create index if not exists idx_student_registration_attempts_email_normalized
  on public.student_registration_attempts (email_normalized);
create index if not exists idx_student_registration_attempts_status
  on public.student_registration_attempts (status);
create index if not exists idx_student_registration_attempts_stage
  on public.student_registration_attempts (stage);
create index if not exists idx_student_registration_attempts_last_activity_at
  on public.student_registration_attempts (last_activity_at desc);
create index if not exists idx_student_registration_attempts_created_at
  on public.student_registration_attempts (created_at desc);

drop trigger if exists trg_student_registration_attempts_updated_at on public.student_registration_attempts;
create trigger trg_student_registration_attempts_updated_at
  before update on public.student_registration_attempts
  for each row execute function public.set_updated_at();

alter table public.student_registration_attempts enable row level security;
revoke all on table public.student_registration_attempts from anon, authenticated;

-- ─── Funções de escrita (chamadas exclusivamente pelo backend, via
-- service_role) — cada uma faz exatamente uma transição de estado, sempre
-- monotônica quando aplicável (nunca reabre uma tentativa completed).

-- Chamada quando o servidor aceita iniciar o cadastro (POST
-- /api/auth/register, código gerado e e-mail efetivamente enviado). Faz
-- upsert por email_normalized: cria a tentativa se não existir nenhuma em
-- aberto, ou atualiza a existente (nome/telefone mais recentes,
-- attempt_count e confirmation_send_count incrementados, first_started_at
-- preservado). Nunca cria uma segunda linha para o mesmo e-mail em aberto.
create or replace function public.upsert_student_registration_attempt(
  p_email text, p_full_name text, p_phone text, p_source text, p_source_context_id uuid
)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  v_email_normalized text := lower(btrim(p_email));
  v_phone_normalized text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
  v_id uuid;
begin
  insert into public.student_registration_attempts (
    email, email_normalized, full_name, phone, phone_normalized,
    status, stage, source, source_context_id,
    first_started_at, last_activity_at, confirmation_requested_at,
    attempt_count, confirmation_send_count
  ) values (
    btrim(p_email), v_email_normalized, p_full_name, p_phone, v_phone_normalized,
    'open', 'confirmation_sent', p_source, p_source_context_id,
    clock_timestamp(), clock_timestamp(), clock_timestamp(),
    1, 1
  )
  on conflict (email_normalized) where status <> 'completed' do update set
    full_name = excluded.full_name,
    phone = excluded.phone,
    phone_normalized = excluded.phone_normalized,
    stage = 'confirmation_sent',
    source = excluded.source,
    source_context_id = excluded.source_context_id,
    last_activity_at = clock_timestamp(),
    confirmation_requested_at = coalesce(public.student_registration_attempts.confirmation_requested_at, clock_timestamp()),
    attempt_count = public.student_registration_attempts.attempt_count + 1,
    confirmation_send_count = public.student_registration_attempts.confirmation_send_count + 1
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- Reenvio automático de novo código por código incorreto
-- (confirm-registration): só toca contadores/atividade, nunca conta como
-- nova tentativa voluntária (attempt_count) e nunca muda stage.
create or replace function public.touch_student_registration_attempt_resend(p_email text)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_email_normalized text := lower(btrim(p_email)); v_id uuid;
begin
  update public.student_registration_attempts
  set confirmation_send_count = confirmation_send_count + 1,
      last_activity_at = clock_timestamp()
  where email_normalized = v_email_normalized and status <> 'completed'
  returning id into v_id;
  return jsonb_build_object('ok', v_id is not null, 'id', v_id);
end;
$$;

-- Código confirmado com sucesso (antes de tentar criar a conta).
create or replace function public.mark_student_registration_attempt_confirmed(p_email text)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_email_normalized text := lower(btrim(p_email)); v_id uuid;
begin
  update public.student_registration_attempts
  set stage = 'confirmation_confirmed',
      confirmation_confirmed_at = clock_timestamp(),
      last_activity_at = clock_timestamp()
  where email_normalized = v_email_normalized and status <> 'completed'
  returning id into v_id;
  return jsonb_build_object('ok', v_id is not null, 'id', v_id);
end;
$$;

-- Conta constituída com sucesso (auth.users + profiles + students) via
-- createStudentAccount — o único ponto que marca completed. status vira
-- completed de forma incondicional (nunca reaberto depois: ver seção 13).
create or replace function public.complete_student_registration_attempt(p_email text)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_email_normalized text := lower(btrim(p_email)); v_id uuid;
begin
  update public.student_registration_attempts
  set status = 'completed',
      stage = 'completed',
      completed_at = clock_timestamp(),
      last_activity_at = clock_timestamp()
  where email_normalized = v_email_normalized and status <> 'completed'
  returning id into v_id;
  return jsonb_build_object('ok', v_id is not null, 'id', v_id);
end;
$$;

-- createStudentAccount falhou (com rollback interno já aplicado pelo
-- próprio serviço) — a tentativa permanece recuperável, nunca completed.
-- status (open/contacted/ignored) não é tocado aqui: é decisão
-- administrativa, independente de uma falha técnica pontual.
create or replace function public.mark_student_registration_attempt_failed(
  p_email text, p_failure_code text, p_failure_message text
)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_email_normalized text := lower(btrim(p_email)); v_id uuid;
begin
  update public.student_registration_attempts
  set stage = 'account_creation_failed',
      last_failure_code = p_failure_code,
      last_failure_message = p_failure_message,
      last_activity_at = clock_timestamp()
  where email_normalized = v_email_normalized and status <> 'completed'
  returning id into v_id;
  return jsonb_build_object('ok', v_id is not null, 'id', v_id);
end;
$$;

revoke all on function public.upsert_student_registration_attempt(text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.touch_student_registration_attempt_resend(text) from public, anon, authenticated;
revoke all on function public.mark_student_registration_attempt_confirmed(text) from public, anon, authenticated;
revoke all on function public.complete_student_registration_attempt(text) from public, anon, authenticated;
revoke all on function public.mark_student_registration_attempt_failed(text, text, text) from public, anon, authenticated;

grant execute on function public.upsert_student_registration_attempt(text, text, text, text, uuid) to service_role;
grant execute on function public.touch_student_registration_attempt_resend(text) to service_role;
grant execute on function public.mark_student_registration_attempt_confirmed(text) to service_role;
grant execute on function public.complete_student_registration_attempt(text) to service_role;
grant execute on function public.mark_student_registration_attempt_failed(text, text, text) to service_role;

commit;
