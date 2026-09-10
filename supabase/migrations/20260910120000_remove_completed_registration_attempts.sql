begin;

-- Correção de regra de produto sobre a migration
-- 20260910100000_student_registration_attempts.sql, JÁ APLICADA em ambiente
-- compartilhado (confirmado antes desta migration ser escrita — a tabela já
-- tem uso real). Por isso esta é uma migration NOVA e corretiva, nunca uma
-- edição do arquivo já aplicado (política de migrations do projeto).
--
-- Regra definitiva: public.student_registration_attempts representa SOMENTE
-- cadastros ainda não concluídos. Uma vez que a conta de aluno é constituída
-- integralmente (auth.users + profiles + students), a tentativa correspondente
-- é REMOVIDA — nunca mantida com status/stage = 'completed'. Vale tanto para
-- o cadastro público quanto para a criação administrativa (mesmo serviço
-- central, lib/server/studentAccountService.ts).

-- Purga o resíduo legado gravado pela regra antiga (linhas que já chegaram a
-- ser marcadas status/stage = 'completed' antes desta correção) — idempotente
-- (WHERE vazio na segunda execução) e reaplica exatamente a mesma decisão
-- que complete_student_registration_attempt passa a tomar daqui para a
-- frente. Nunca toca auth.users/profiles/students/student_registration_confirmations.
delete from public.student_registration_attempts where status = 'completed';

-- status deixa de aceitar 'completed': o valor nunca mais é gravado (função
-- abaixo virou DELETE) e a tabela deve representar só estados operacionais
-- de uma tentativa que ainda existe. DROP + ADD (em vez de editar a
-- constraint original) porque a constraint já está em produção com esse
-- nome padrão do Postgres para um CHECK de coluna inline.
alter table public.student_registration_attempts
  drop constraint if exists student_registration_attempts_status_check;
alter table public.student_registration_attempts
  add constraint student_registration_attempts_status_check
  check (status in ('open', 'contacted', 'ignored'));

-- complete_student_registration_attempt passa a ser DELETE (idempotente,
-- nunca falha se não existir tentativa) em vez de UPDATE para completed.
-- Mesma assinatura já concedida a service_role — CREATE OR REPLACE preserva
-- os grants existentes.
create or replace function public.complete_student_registration_attempt(p_email text)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_email_normalized text := lower(btrim(p_email)); v_id uuid;
begin
  delete from public.student_registration_attempts
  where email_normalized = v_email_normalized
  returning id into v_id;
  return jsonb_build_object('ok', true, 'removed', v_id is not null, 'id', v_id);
end;
$$;

comment on function public.complete_student_registration_attempt(text) is
  'Remove (DELETE) a tentativa de cadastro do e-mail normalizado quando a conta de aluno é constituída integralmente. Idempotente: não falha se não existir tentativa. Nunca toca auth.users/profiles/students/student_registration_confirmations.';

-- upsert_student_registration_attempt ganha um parâmetro opcional
-- (p_previous_email) para o caso de "Corrigir dados" trocar o e-mail antes
-- da conclusão: renomeia a tentativa em aberto existente para o novo
-- e-mail, em vez de deixar o e-mail antigo como lead fantasma. Como isso
-- muda a assinatura (novo parâmetro), a função antiga de 5 argumentos é
-- removida e recriada com 6 (o 6º com default null, compatível com
-- qualquer chamador que ainda não o envie).
drop function if exists public.upsert_student_registration_attempt(text, text, text, text, uuid);

create or replace function public.upsert_student_registration_attempt(
  p_email text, p_full_name text, p_phone text, p_source text, p_source_context_id uuid,
  p_previous_email text default null
)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  v_email_normalized text := lower(btrim(p_email));
  v_previous_email_normalized text := nullif(lower(btrim(coalesce(p_previous_email, ''))), '');
  v_phone_normalized text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
  v_id uuid;
begin
  -- Renomeia a tentativa aberta do e-mail anterior para o novo e-mail —
  -- só quando o e-mail anterior tem tentativa em aberto E o novo e-mail
  -- ainda não tem a sua própria (nunca funde duas tentativas reais
  -- distintas; nesse caso de conflito, ignora com segurança e segue para o
  -- upsert normal abaixo pelo novo e-mail).
  if v_previous_email_normalized is not null and v_previous_email_normalized <> v_email_normalized then
    update public.student_registration_attempts
    set email = btrim(p_email),
        email_normalized = v_email_normalized,
        full_name = p_full_name,
        phone = p_phone,
        phone_normalized = v_phone_normalized,
        stage = 'confirmation_sent',
        source = p_source,
        source_context_id = p_source_context_id,
        last_activity_at = clock_timestamp(),
        confirmation_requested_at = coalesce(confirmation_requested_at, clock_timestamp()),
        attempt_count = attempt_count + 1,
        confirmation_send_count = confirmation_send_count + 1
    where email_normalized = v_previous_email_normalized
      and status <> 'completed'
      and not exists (
        select 1 from public.student_registration_attempts existing
        where existing.email_normalized = v_email_normalized and existing.status <> 'completed'
      )
    returning id into v_id;
    if v_id is not null then
      return jsonb_build_object('ok', true, 'id', v_id, 'renamed', true);
    end if;
  end if;

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

revoke all on function public.upsert_student_registration_attempt(text, text, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.upsert_student_registration_attempt(text, text, text, text, uuid, text) to service_role;

commit;
