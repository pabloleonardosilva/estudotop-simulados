begin;

alter table public.hotmart_transactions
  add column if not exists processing_attempt_count integer not null default 0,
  add column if not exists last_processing_attempt_at timestamptz,
  add column if not exists possible_duplicate_student_id uuid,
  add column if not exists duplicate_match_reason text,
  add column if not exists resolution_type text,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid,
  add column if not exists extension_applied_at timestamptz,
  add column if not exists extension_applied_by uuid,
  add column if not exists access_email_claimed_at timestamptz,
  add column if not exists access_email_attempt_count integer not null default 0,
  add column if not exists pending_email_claimed_at timestamptz,
  add column if not exists pending_email_sent_at timestamptz,
  add column if not exists pending_email_error text,
  add column if not exists pending_email_attempt_count integer not null default 0,
  add column if not exists refund_request_state text,
  add column if not exists refund_request_started_at timestamptz,
  add column if not exists refund_external_accepted_at timestamptz;

alter table public.hotmart_transactions
  drop constraint if exists hotmart_transactions_possible_duplicate_student_id_fkey,
  add constraint hotmart_transactions_possible_duplicate_student_id_fkey foreign key (possible_duplicate_student_id) references public.students(id) on delete restrict,
  drop constraint if exists hotmart_transactions_resolved_by_fkey,
  add constraint hotmart_transactions_resolved_by_fkey foreign key (resolved_by) references public.profiles(id) on delete restrict,
  drop constraint if exists hotmart_transactions_extension_applied_by_fkey,
  add constraint hotmart_transactions_extension_applied_by_fkey foreign key (extension_applied_by) references public.profiles(id) on delete restrict;

alter table public.hotmart_transactions
  drop constraint if exists hotmart_transactions_resolution_type_check,
  drop constraint if exists hotmart_transactions_processing_attempt_count_check,
  drop constraint if exists hotmart_transactions_resolution_check,
  add constraint hotmart_transactions_resolution_check check (
    (resolution_type is null and resolved_at is null and resolved_by is null)
    or (resolution_type in ('extended', 'refund_requested', 'manual_refund', 'kept_separate') and resolved_at is not null and resolved_by is not null)
  ),
  drop constraint if exists hotmart_transactions_extension_resolution_check,
  add constraint hotmart_transactions_extension_resolution_check check (
    (extension_applied_at is null and extension_applied_by is null)
    or (extension_applied_at is not null and extension_applied_by is not null and resolution_type = 'extended')
  ),
  drop constraint if exists hotmart_transactions_duplicate_match_reason_check,
  add constraint hotmart_transactions_duplicate_match_reason_check check (duplicate_match_reason is null or duplicate_match_reason in ('cpf', 'phone', 'cpf_and_phone')),
  drop constraint if exists hotmart_transactions_attempt_counts_check,
  add constraint hotmart_transactions_attempt_counts_check check (processing_attempt_count >= 0 and access_email_attempt_count >= 0 and pending_email_attempt_count >= 0),
  drop constraint if exists hotmart_transactions_refund_request_state_check,
  add constraint hotmart_transactions_refund_request_state_check check (
    refund_request_state is null or refund_request_state in ('requesting', 'accepted', 'manual_required', 'reconciliation_required', 'confirmed')
  );

create index if not exists idx_hotmart_transactions_possible_duplicate
  on public.hotmart_transactions (possible_duplicate_student_id, created_at desc)
  where possible_duplicate_student_id is not null and resolved_at is null;

create or replace function public.increment_hotmart_processing_attempt(p_transaction_id uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp as $increment_attempt$
declare next_count integer;
begin
  update public.hotmart_transactions
  set processing_attempt_count = processing_attempt_count + 1, last_processing_attempt_at = now(), processing_error_code = null, processing_error_message = null
  where id = p_transaction_id returning processing_attempt_count into next_count;
  if next_count is null then raise exception 'HOTMART_TRANSACTION_NOT_FOUND'; end if;
  return next_count;
end;
$increment_attempt$;

create or replace function public.claim_hotmart_transaction_email(p_transaction_id uuid, p_email_type text, p_lease_seconds integer default 900)
returns table (claimed boolean, claimed_at timestamptz, attempt_count integer)
language plpgsql security definer set search_path = public, pg_temp as $claim_email$
declare
  transaction_row public.hotmart_transactions%rowtype;
  claim_time timestamptz := clock_timestamp();
  lease_interval interval := make_interval(secs => greatest(60, least(coalesce(p_lease_seconds, 900), 3600)));
begin
  if p_email_type is null or p_email_type not in ('access', 'pending') then raise exception 'HOTMART_EMAIL_TYPE_INVALID'; end if;
  select * into transaction_row from public.hotmart_transactions where id = p_transaction_id for update;
  if transaction_row.id is null then raise exception 'HOTMART_TRANSACTION_NOT_FOUND'; end if;
  if p_email_type = 'access' then
    if transaction_row.access_email_sent_at is not null or (transaction_row.access_email_claimed_at is not null and transaction_row.access_email_claimed_at > claim_time - lease_interval) then
      return query select false, transaction_row.access_email_claimed_at, transaction_row.access_email_attempt_count; return;
    end if;
    update public.hotmart_transactions set access_email_claimed_at = claim_time, access_email_attempt_count = access_email_attempt_count + 1, access_email_error = null
    where id = p_transaction_id returning access_email_attempt_count into transaction_row.access_email_attempt_count;
    return query select true, claim_time, transaction_row.access_email_attempt_count; return;
  end if;
  if transaction_row.pending_email_sent_at is not null or (transaction_row.pending_email_claimed_at is not null and transaction_row.pending_email_claimed_at > claim_time - lease_interval) then
    return query select false, transaction_row.pending_email_claimed_at, transaction_row.pending_email_attempt_count; return;
  end if;
  update public.hotmart_transactions set pending_email_claimed_at = claim_time, pending_email_attempt_count = pending_email_attempt_count + 1, pending_email_error = null
  where id = p_transaction_id returning pending_email_attempt_count into transaction_row.pending_email_attempt_count;
  return query select true, claim_time, transaction_row.pending_email_attempt_count;
end;
$claim_email$;

create or replace function public.complete_hotmart_transaction_email(p_transaction_id uuid, p_email_type text, p_claimed_at timestamptz, p_success boolean, p_error text default null)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $complete_email$
declare affected_count integer;
begin
  if p_email_type is null or p_email_type not in ('access', 'pending') then raise exception 'HOTMART_EMAIL_TYPE_INVALID'; end if;
  if p_success is null then raise exception 'HOTMART_EMAIL_RESULT_INVALID'; end if;
  if p_email_type = 'access' then
    update public.hotmart_transactions set access_email_claimed_at = null,
      access_email_sent_at = case when p_success then now() else access_email_sent_at end,
      access_email_error = case when p_success then null else left(coalesce(p_error, 'Falha no envio.'), 500) end
    where id = p_transaction_id and access_email_claimed_at = p_claimed_at and access_email_sent_at is null;
  else
    update public.hotmart_transactions set pending_email_claimed_at = null,
      pending_email_sent_at = case when p_success then now() else pending_email_sent_at end,
      pending_email_error = case when p_success then null else left(coalesce(p_error, 'Falha no envio.'), 500) end
    where id = p_transaction_id and pending_email_claimed_at = p_claimed_at and pending_email_sent_at is null;
  end if;
  get diagnostics affected_count = row_count;
  return affected_count = 1;
end;
$complete_email$;

create or replace function public.begin_hotmart_refund_request(p_transaction_id uuid, p_admin_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $begin_refund$
declare transaction_row public.hotmart_transactions%rowtype;
begin
  if p_admin_id is null or not exists (select 1 from public.profiles where id = p_admin_id and role = 'admin' and is_active = true) then raise exception 'HOTMART_ADMIN_INVALID'; end if;
  select * into transaction_row from public.hotmart_transactions where id = p_transaction_id for update;
  if transaction_row.id is null then raise exception 'HOTMART_TRANSACTION_NOT_FOUND'; end if;
  if transaction_row.refund_status in ('requested', 'confirmed')
     or transaction_row.refund_request_state in ('requesting', 'accepted', 'manual_required', 'reconciliation_required', 'confirmed') then
    return false;
  end if;
  if transaction_row.resolution_type is not null then raise exception 'HOTMART_REFUND_NOT_ELIGIBLE'; end if;
  update public.hotmart_transactions
  set refund_request_state = 'requesting', refund_request_started_at = now(), processing_status = 'refund_reconciliation_required'
  where id = p_transaction_id;
  return true;
end;
$begin_refund$;

create or replace function public.finalize_hotmart_refund_request(p_transaction_id uuid, p_admin_id uuid, p_outcome text)
returns text language plpgsql security definer set search_path = public, pg_temp as $finalize_refund$
declare transaction_row public.hotmart_transactions%rowtype;
begin
  if p_admin_id is null or not exists (select 1 from public.profiles where id = p_admin_id and role = 'admin' and is_active = true) then raise exception 'HOTMART_ADMIN_INVALID'; end if;
  if p_outcome not in ('accepted', 'rejected', 'uncertain') then raise exception 'HOTMART_REFUND_OUTCOME_INVALID'; end if;
  select * into transaction_row from public.hotmart_transactions where id = p_transaction_id for update;
  if transaction_row.id is null then raise exception 'HOTMART_TRANSACTION_NOT_FOUND'; end if;
  if transaction_row.refund_request_state <> 'requesting' then raise exception 'HOTMART_REFUND_NOT_IN_PROGRESS'; end if;
  if p_outcome = 'accepted' then
    update public.hotmart_transactions set refund_request_state = 'accepted', refund_external_accepted_at = now(),
      refund_status = 'requested', refund_requested_at = now(), processing_status = 'refund_requested',
      resolution_type = 'refund_requested', resolved_at = now(), resolved_by = p_admin_id
    where id = p_transaction_id;
  elsif p_outcome = 'rejected' then
    update public.hotmart_transactions set refund_request_state = 'manual_required', processing_status = 'manual_refund_required',
      resolution_type = 'manual_refund', resolved_at = now(), resolved_by = p_admin_id
    where id = p_transaction_id;
  else
    update public.hotmart_transactions set refund_request_state = 'reconciliation_required', processing_status = 'refund_reconciliation_required'
    where id = p_transaction_id;
  end if;
  return p_outcome;
end;
$finalize_refund$;

create or replace function public.resolve_hotmart_duplicate_student_separate(p_transaction_id uuid, p_admin_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $resolve_separate$
declare transaction_row public.hotmart_transactions%rowtype;
begin
  if p_admin_id is null or not exists (select 1 from public.profiles where id = p_admin_id and role = 'admin' and is_active = true) then raise exception 'HOTMART_ADMIN_INVALID'; end if;
  select * into transaction_row from public.hotmart_transactions where id = p_transaction_id for update;
  if transaction_row.id is null then raise exception 'HOTMART_TRANSACTION_NOT_FOUND'; end if;
  if transaction_row.resolution_type = 'kept_separate' then return false; end if;
  if transaction_row.possible_duplicate_student_id is null or transaction_row.resolution_type is not null then raise exception 'HOTMART_DUPLICATE_STUDENT_NOT_RESOLVABLE'; end if;
  update public.hotmart_transactions set resolution_type = 'kept_separate', resolved_at = now(), resolved_by = p_admin_id where id = p_transaction_id;
  insert into public.hotmart_history (student_id, transaction_id, mapping_id, actor_type, actor_id, action, metadata)
  values (transaction_row.student_id, transaction_row.id, transaction_row.mapping_id, 'admin', p_admin_id, 'duplicate_students_kept_separate', jsonb_build_object('possible_duplicate_student_id', transaction_row.possible_duplicate_student_id));
  return true;
end;
$resolve_separate$;

create or replace function public.extend_hotmart_duplicate_jornada(p_transaction_id uuid, p_admin_id uuid)
returns table (student_jornada_id uuid, previous_expires_at date, new_expires_at date, applied boolean)
language plpgsql security definer set search_path = public, pg_temp as $extend_jornada$
declare
  transaction_row public.hotmart_transactions%rowtype;
  enrollment_row public.student_jornadas%rowtype;
  duration_days_value integer;
  next_expires_at date;
begin
  if p_admin_id is null or not exists (select 1 from public.profiles where id = p_admin_id and role = 'admin' and is_active = true) then raise exception 'HOTMART_ADMIN_INVALID'; end if;
  select * into transaction_row from public.hotmart_transactions where id = p_transaction_id for update;
  if transaction_row.id is null then raise exception 'HOTMART_TRANSACTION_NOT_FOUND'; end if;
  if transaction_row.extension_applied_at is not null then
    select * into enrollment_row from public.student_jornadas where student_id = transaction_row.student_id and jornada_id = transaction_row.jornada_id;
    return query select enrollment_row.id, enrollment_row.expires_at, enrollment_row.expires_at, false; return;
  end if;
  if transaction_row.processing_status <> 'pending_duplicate_purchase' or transaction_row.destination_type <> 'jornada'
    or transaction_row.student_id is null or transaction_row.jornada_id is null or transaction_row.mapping_id is null
    or transaction_row.purchase_status is null or upper(transaction_row.purchase_status) not in ('APPROVED', 'COMPLETE') then raise exception 'HOTMART_TRANSACTION_NOT_EXTENDABLE'; end if;
  if not exists (select 1 from public.hotmart_product_mappings where id = transaction_row.mapping_id and status = 'active' and destination_type = 'jornada' and jornada_id = transaction_row.jornada_id and event_id is null) then
    raise exception 'HOTMART_MAPPING_DESTINATION_MISMATCH';
  end if;
  select * into enrollment_row from public.student_jornadas where student_id = transaction_row.student_id and jornada_id = transaction_row.jornada_id for update;
  if enrollment_row.id is null then raise exception 'HOTMART_ENROLLMENT_NOT_FOUND'; end if;
  if enrollment_row.status <> 'active' or enrollment_row.expires_at <= current_date or enrollment_row.access_origin <> 'hotmart'
    or enrollment_row.commercial_block_reason is not null or enrollment_row.commercial_blocked_at is not null then raise exception 'HOTMART_ENROLLMENT_NOT_ELIGIBLE'; end if;
  select greatest(1, coalesce(j.duration_days, j.duration_months * 30)) into duration_days_value from public.jornadas j where j.id = transaction_row.jornada_id;
  if duration_days_value is null then raise exception 'HOTMART_JORNADA_DURATION_NOT_FOUND'; end if;
  next_expires_at := enrollment_row.expires_at + duration_days_value;
  update public.student_jornadas set expires_at = next_expires_at where id = enrollment_row.id;
  update public.hotmart_transactions set processing_status = 'resolved', resolution_type = 'extended', resolved_at = now(), resolved_by = p_admin_id,
    extension_applied_at = now(), extension_applied_by = p_admin_id, processed_at = now() where id = transaction_row.id;
  insert into public.hotmart_access_links (hotmart_transaction_id, student_id, destination_type, student_jornada_id, current_origin, access_state, access_started_at, access_expires_at)
  values (transaction_row.id, transaction_row.student_id, 'jornada', enrollment_row.id, 'hotmart', 'active',
    enrollment_row.started_at::timestamp at time zone 'America/Sao_Paulo', next_expires_at::timestamp at time zone 'America/Sao_Paulo')
  on conflict (hotmart_transaction_id) do update set student_id = excluded.student_id, destination_type = excluded.destination_type,
    student_jornada_id = excluded.student_jornada_id, event_participant_id = null, current_origin = excluded.current_origin,
    access_state = excluded.access_state, access_started_at = excluded.access_started_at, access_expires_at = excluded.access_expires_at,
    blocked_at = null, block_reason = null, updated_at = now();
  insert into public.hotmart_history (student_id, transaction_id, mapping_id, actor_type, actor_id, action, previous_data, new_data, metadata)
  values (transaction_row.student_id, transaction_row.id, transaction_row.mapping_id, 'admin', p_admin_id, 'duplicate_purchase_extended',
    jsonb_build_object('expires_at', enrollment_row.expires_at), jsonb_build_object('expires_at', next_expires_at), jsonb_build_object('duration_days', duration_days_value));
  return query select enrollment_row.id, enrollment_row.expires_at, next_expires_at, true;
end;
$extend_jornada$;

revoke all on function public.increment_hotmart_processing_attempt(uuid) from public, anon, authenticated;
revoke all on function public.claim_hotmart_transaction_email(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.complete_hotmart_transaction_email(uuid, text, timestamptz, boolean, text) from public, anon, authenticated;
revoke all on function public.begin_hotmart_refund_request(uuid, uuid) from public, anon, authenticated;
revoke all on function public.finalize_hotmart_refund_request(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.resolve_hotmart_duplicate_student_separate(uuid, uuid) from public, anon, authenticated;
revoke all on function public.extend_hotmart_duplicate_jornada(uuid, uuid) from public, anon, authenticated;
grant execute on function public.increment_hotmart_processing_attempt(uuid) to service_role;
grant execute on function public.claim_hotmart_transaction_email(uuid, text, integer) to service_role;
grant execute on function public.complete_hotmart_transaction_email(uuid, text, timestamptz, boolean, text) to service_role;
grant execute on function public.begin_hotmart_refund_request(uuid, uuid) to service_role;
grant execute on function public.finalize_hotmart_refund_request(uuid, uuid, text) to service_role;
grant execute on function public.resolve_hotmart_duplicate_student_separate(uuid, uuid) to service_role;
grant execute on function public.extend_hotmart_duplicate_jornada(uuid, uuid) to service_role;

commit;
