begin;

create table if not exists public.password_recovery_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null,
  request_fingerprint_hash text not null,
  status text not null default 'pending',
  claimed_at timestamptz,
  claim_id uuid,
  expires_at timestamptz not null,
  email_sent_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint password_recovery_requests_token_hash_unique unique (token_hash),
  constraint password_recovery_requests_status_check check (status in ('pending', 'processing', 'used', 'failed')),
  constraint password_recovery_requests_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint password_recovery_requests_fingerprint_hash_check check (request_fingerprint_hash ~ '^[0-9a-f]{64}$'),
  constraint password_recovery_requests_state_check check (
    (status = 'pending' and claimed_at is null and claim_id is null and used_at is null)
    or (status = 'processing' and claimed_at is not null and claim_id is not null and used_at is null)
    or (status = 'used' and claimed_at is null and claim_id is null and used_at is not null)
    or (status = 'failed' and claimed_at is null and claim_id is null and used_at is null)
  ),
  constraint password_recovery_requests_expiry_check check (expires_at > created_at)
);

create index if not exists idx_password_recovery_requests_user_created
  on public.password_recovery_requests (user_id, created_at desc);
create index if not exists idx_password_recovery_requests_fingerprint_created
  on public.password_recovery_requests (request_fingerprint_hash, created_at desc);
create index if not exists idx_password_recovery_requests_status_expires
  on public.password_recovery_requests (status, expires_at);
create index if not exists idx_password_recovery_requests_created_at
  on public.password_recovery_requests (created_at desc);
create unique index if not exists unique_password_recovery_requests_active_user
  on public.password_recovery_requests (user_id)
  where status in ('pending', 'processing');

drop trigger if exists trg_password_recovery_requests_updated_at on public.password_recovery_requests;
create trigger trg_password_recovery_requests_updated_at
before update on public.password_recovery_requests
for each row execute function public.set_updated_at();

alter table public.password_recovery_requests enable row level security;
revoke all on table public.password_recovery_requests from public, anon, authenticated;
grant select, insert, update on table public.password_recovery_requests to service_role;

create or replace function public.create_password_recovery_request(
  p_user_id uuid,
  p_token_hash text,
  p_request_fingerprint_hash text,
  p_expires_at timestamptz
)
returns table (request_id uuid, outcome text)
language plpgsql
security definer
set search_path = public, pg_temp
as $create_password_recovery_request$
declare
  new_request_id uuid;
begin
  if p_user_id is null
     or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_request_fingerprint_hash is null or p_request_fingerprint_hash !~ '^[0-9a-f]{64}$'
     or p_expires_at is null
     or p_expires_at <= clock_timestamp() + interval '5 minutes'
     or p_expires_at > clock_timestamp() + interval '60 minutes' then
    raise exception 'PASSWORD_RECOVERY_REQUEST_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('password-recovery-user:' || p_user_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('password-recovery-fingerprint:' || p_request_fingerprint_hash, 0));

  update public.password_recovery_requests
  set status = 'failed', claimed_at = null, claim_id = null
  where user_id = p_user_id
    and status = 'processing'
    and claimed_at <= clock_timestamp() - interval '5 minutes';

  if exists (
    select 1 from public.password_recovery_requests
    where user_id = p_user_id and status = 'processing'
  ) then
    return query select null::uuid, 'busy'::text;
    return;
  end if;

  if exists (
    select 1 from public.password_recovery_requests
    where (user_id = p_user_id or request_fingerprint_hash = p_request_fingerprint_hash)
      and created_at > clock_timestamp() - interval '60 seconds'
  ) then
    return query select null::uuid, 'cooldown'::text;
    return;
  end if;

  if (select count(*) from public.password_recovery_requests
      where user_id = p_user_id and created_at > clock_timestamp() - interval '1 hour') >= 5
     or (select count(*) from public.password_recovery_requests
         where request_fingerprint_hash = p_request_fingerprint_hash
           and created_at > clock_timestamp() - interval '1 hour') >= 5 then
    return query select null::uuid, 'rate_limited'::text;
    return;
  end if;

  update public.password_recovery_requests
  set status = 'failed', claimed_at = null, claim_id = null
  where user_id = p_user_id and status = 'pending';

  insert into public.password_recovery_requests (
    user_id, token_hash, request_fingerprint_hash, status, expires_at
  ) values (
    p_user_id, p_token_hash, p_request_fingerprint_hash, 'pending', p_expires_at
  )
  returning id into new_request_id;

  return query select new_request_id, 'created'::text;
end;
$create_password_recovery_request$;

create or replace function public.mark_password_recovery_email_sent(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $mark_password_recovery_email_sent$
declare
  affected_count integer;
begin
  if p_request_id is null then raise exception 'PASSWORD_RECOVERY_REQUEST_INVALID'; end if;

  update public.password_recovery_requests
  set email_sent_at = clock_timestamp()
  where id = p_request_id and status = 'pending' and email_sent_at is null and expires_at > clock_timestamp();

  get diagnostics affected_count = row_count;
  return affected_count = 1;
end;
$mark_password_recovery_email_sent$;

create or replace function public.fail_password_recovery_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fail_password_recovery_request$
declare
  affected_count integer;
begin
  if p_request_id is null then raise exception 'PASSWORD_RECOVERY_REQUEST_INVALID'; end if;

  update public.password_recovery_requests
  set status = 'failed', claimed_at = null, claim_id = null
  where id = p_request_id and status = 'pending' and used_at is null;

  get diagnostics affected_count = row_count;
  return affected_count = 1;
end;
$fail_password_recovery_request$;

create or replace function public.claim_password_recovery_request(p_token_hash text, p_claim_id uuid)
returns table (request_id uuid, user_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $claim_password_recovery_request$
declare
  target_user_id uuid;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_claim_id is null then
    raise exception 'PASSWORD_RECOVERY_CLAIM_INVALID';
  end if;

  select recovery.user_id into target_user_id
  from public.password_recovery_requests as recovery
  where recovery.token_hash = p_token_hash;

  if target_user_id is null then return; end if;

  perform pg_advisory_xact_lock(hashtextextended('password-recovery-user:' || target_user_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('password-recovery-token:' || p_token_hash, 0));

  update public.password_recovery_requests
  set status = 'failed', claimed_at = null, claim_id = null
  where token_hash = p_token_hash
    and status = 'processing'
    and claimed_at <= clock_timestamp() - interval '5 minutes';

  update public.password_recovery_requests
  set status = 'failed'
  where token_hash = p_token_hash and status = 'pending' and expires_at <= clock_timestamp();

  return query
  update public.password_recovery_requests as recovery
  set status = 'processing', claimed_at = clock_timestamp(), claim_id = p_claim_id
  where recovery.token_hash = p_token_hash
    and recovery.status = 'pending'
    and recovery.email_sent_at is not null
    and recovery.expires_at > clock_timestamp()
  returning recovery.id, recovery.user_id;
end;
$claim_password_recovery_request$;

create or replace function public.complete_password_recovery_request(p_request_id uuid, p_claim_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $complete_password_recovery_request$
declare
  affected_count integer;
begin
  if p_request_id is null or p_claim_id is null then raise exception 'PASSWORD_RECOVERY_COMPLETION_INVALID'; end if;

  update public.password_recovery_requests
  set status = 'used', used_at = clock_timestamp(), claimed_at = null, claim_id = null
  where id = p_request_id and status = 'processing' and claim_id = p_claim_id;

  get diagnostics affected_count = row_count;
  return affected_count = 1;
end;
$complete_password_recovery_request$;

create or replace function public.release_password_recovery_claim(p_request_id uuid, p_claim_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $release_password_recovery_claim$
declare
  next_status text;
begin
  if p_request_id is null or p_claim_id is null then raise exception 'PASSWORD_RECOVERY_RELEASE_INVALID'; end if;

  update public.password_recovery_requests
  set status = case when expires_at > clock_timestamp() then 'pending' else 'failed' end,
      claimed_at = null,
      claim_id = null
  where id = p_request_id and status = 'processing' and claim_id = p_claim_id
  returning status into next_status;

  return next_status;
end;
$release_password_recovery_claim$;

revoke all on function public.create_password_recovery_request(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.mark_password_recovery_email_sent(uuid) from public, anon, authenticated;
revoke all on function public.fail_password_recovery_request(uuid) from public, anon, authenticated;
revoke all on function public.claim_password_recovery_request(text, uuid) from public, anon, authenticated;
revoke all on function public.complete_password_recovery_request(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_password_recovery_claim(uuid, uuid) from public, anon, authenticated;

grant execute on function public.create_password_recovery_request(uuid, text, text, timestamptz) to service_role;
grant execute on function public.mark_password_recovery_email_sent(uuid) to service_role;
grant execute on function public.fail_password_recovery_request(uuid) to service_role;
grant execute on function public.claim_password_recovery_request(text, uuid) to service_role;
grant execute on function public.complete_password_recovery_request(uuid, uuid) to service_role;
grant execute on function public.release_password_recovery_claim(uuid, uuid) to service_role;

commit;
