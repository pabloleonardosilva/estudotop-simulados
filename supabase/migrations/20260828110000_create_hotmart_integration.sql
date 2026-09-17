begin;

alter table public.student_jornadas
  drop constraint if exists student_jornadas_status_check;
alter table public.student_jornadas
  add constraint student_jornadas_status_check
  check (status in ('active', 'paused', 'expired', 'cancelled'));
alter table public.student_jornadas
  add column if not exists access_origin text not null default 'manual',
  add column if not exists commercial_block_reason text,
  add column if not exists commercial_blocked_at timestamptz;
alter table public.student_jornadas
  drop constraint if exists student_jornadas_access_origin_check;
alter table public.student_jornadas
  add constraint student_jornadas_access_origin_check
  check (access_origin in ('manual', 'hotmart'));

alter table public.simulado_event_participants
  add column if not exists access_status text not null default 'active',
  add column if not exists access_origin text not null default 'manual',
  add column if not exists commercial_block_reason text,
  add column if not exists commercial_blocked_at timestamptz;
alter table public.simulado_event_participants
  drop constraint if exists simulado_event_participants_access_status_check;
alter table public.simulado_event_participants
  add constraint simulado_event_participants_access_status_check
  check (access_status in ('active', 'paused', 'cancelled'));
alter table public.simulado_event_participants
  drop constraint if exists simulado_event_participants_access_origin_check;
alter table public.simulado_event_participants
  add constraint simulado_event_participants_access_origin_check
  check (access_origin in ('manual', 'hotmart'));

alter table public.simulado_event_participants
  drop constraint if exists simulado_event_participants_source_check;
alter table public.simulado_event_participants
  add constraint simulado_event_participants_source_check
  check (source in ('public_link', 'admin', 'registration', 'hotmart'));

create table if not exists public.hotmart_product_mappings (
  id uuid primary key default gen_random_uuid(),
  hotmart_product_ucode text not null,
  hotmart_product_id text,
  hotmart_product_name text not null,
  hotmart_offer_name text,
  destination_type text not null,
  jornada_id uuid references public.jornadas(id) on delete restrict,
  event_id uuid references public.simulado_events(id) on delete restrict,
  status text not null default 'active',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hotmart_product_mappings_ucode_not_blank check (length(btrim(hotmart_product_ucode)) > 0),
  constraint hotmart_product_mappings_name_not_blank check (length(btrim(hotmart_product_name)) > 0),
  constraint hotmart_product_mappings_status_check check (status in ('active', 'inactive', 'archived')),
  constraint hotmart_product_mappings_destination_check check (
    (destination_type = 'jornada' and jornada_id is not null and event_id is null)
    or (destination_type = 'event' and event_id is not null and jornada_id is null)
  )
);
create unique index if not exists unique_hotmart_product_mappings_ucode
  on public.hotmart_product_mappings (hotmart_product_ucode);
create index if not exists idx_hotmart_product_mappings_status
  on public.hotmart_product_mappings (status, created_at desc);

create table if not exists public.hotmart_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_code text not null,
  hotmart_product_ucode text not null,
  hotmart_product_id text,
  product_name_snapshot text not null,
  offer_name_snapshot text,
  student_id uuid references public.students(id) on delete restrict,
  mapping_id uuid references public.hotmart_product_mappings(id) on delete restrict,
  destination_type text,
  jornada_id uuid references public.jornadas(id) on delete restrict,
  event_id uuid references public.simulado_events(id) on delete restrict,
  buyer_name text,
  buyer_email text not null,
  buyer_document text,
  buyer_document_type text,
  buyer_phone text,
  purchase_status text not null,
  purchase_approved_at timestamptz,
  purchase_created_at timestamptz,
  currency text,
  amount numeric,
  payment_type text,
  installments integer,
  processing_status text not null default 'received',
  processing_error_code text,
  processing_error_message text,
  processed_at timestamptz,
  refund_status text,
  refund_requested_at timestamptz,
  refund_confirmed_at timestamptz,
  access_email_sent_at timestamptz,
  access_email_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hotmart_transactions_destination_check check (
    (destination_type is null and jornada_id is null and event_id is null)
    or (destination_type = 'jornada' and jornada_id is not null and event_id is null)
    or (destination_type = 'event' and event_id is not null and jornada_id is null)
  ),
  constraint hotmart_transactions_installments_check check (installments is null or installments > 0)
);
create unique index if not exists unique_hotmart_transactions_code
  on public.hotmart_transactions (transaction_code);
create index if not exists idx_hotmart_transactions_student
  on public.hotmart_transactions (student_id, created_at desc);
create index if not exists idx_hotmart_transactions_mapping
  on public.hotmart_transactions (mapping_id, created_at desc);
create index if not exists idx_hotmart_transactions_processing
  on public.hotmart_transactions (processing_status, created_at desc);
create index if not exists idx_hotmart_transactions_purchase_status
  on public.hotmart_transactions (purchase_status, created_at desc);

create table if not exists public.hotmart_webhook_events (
  id uuid primary key default gen_random_uuid(),
  external_event_id text not null,
  transaction_code text,
  hotmart_event text not null,
  hotmart_version text,
  hotmart_creation_date timestamptz,
  received_at timestamptz not null default now(),
  last_received_at timestamptz not null default now(),
  delivery_count integer not null default 1,
  processing_status text not null default 'received',
  processed_at timestamptz,
  error_code text,
  error_message text,
  payload_sanitized jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hotmart_webhook_events_delivery_count_check check (delivery_count > 0)
);
create unique index if not exists unique_hotmart_webhook_events_external_id
  on public.hotmart_webhook_events (external_event_id);
create index if not exists idx_hotmart_webhook_events_processing
  on public.hotmart_webhook_events (processing_status, created_at desc);
create index if not exists idx_hotmart_webhook_events_transaction
  on public.hotmart_webhook_events (transaction_code, created_at desc);

create table if not exists public.hotmart_access_links (
  id uuid primary key default gen_random_uuid(),
  hotmart_transaction_id uuid not null references public.hotmart_transactions(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  destination_type text not null,
  student_jornada_id uuid references public.student_jornadas(id) on delete restrict,
  event_participant_id uuid references public.simulado_event_participants(id) on delete restrict,
  current_origin text not null default 'hotmart',
  access_state text not null default 'active',
  access_started_at timestamptz,
  access_expires_at timestamptz,
  blocked_at timestamptz,
  block_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hotmart_access_links_origin_check check (current_origin in ('manual', 'hotmart')),
  constraint hotmart_access_links_state_check check (access_state in ('active', 'paused', 'cancelled')),
  constraint hotmart_access_links_destination_check check (
    (destination_type = 'jornada' and student_jornada_id is not null and event_participant_id is null)
    or (destination_type = 'event' and event_participant_id is not null and student_jornada_id is null)
  )
);
create unique index if not exists unique_hotmart_access_links_transaction
  on public.hotmart_access_links (hotmart_transaction_id);
create index if not exists idx_hotmart_access_links_student
  on public.hotmart_access_links (student_id, created_at desc);

create table if not exists public.hotmart_history (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.students(id) on delete restrict,
  transaction_id uuid references public.hotmart_transactions(id) on delete restrict,
  mapping_id uuid references public.hotmart_product_mappings(id) on delete restrict,
  access_link_id uuid references public.hotmart_access_links(id) on delete restrict,
  actor_type text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  previous_data jsonb,
  new_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint hotmart_history_actor_check check (actor_type in ('system', 'admin', 'hotmart')),
  constraint hotmart_history_action_not_blank check (length(btrim(action)) > 0)
);
create index if not exists idx_hotmart_history_transaction
  on public.hotmart_history (transaction_id, created_at desc);
create index if not exists idx_hotmart_history_student
  on public.hotmart_history (student_id, created_at desc);

create or replace function public.register_hotmart_webhook_event(
  p_external_event_id text,
  p_transaction_code text,
  p_hotmart_event text,
  p_hotmart_version text,
  p_hotmart_creation_date timestamptz,
  p_payload_sanitized jsonb
)
returns table (event_id uuid, delivery_count integer, is_first_delivery boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted_id uuid;
begin
  insert into public.hotmart_webhook_events (
    external_event_id, transaction_code, hotmart_event, hotmart_version,
    hotmart_creation_date, payload_sanitized
  ) values (
    p_external_event_id, p_transaction_code, p_hotmart_event, p_hotmart_version,
    p_hotmart_creation_date, coalesce(p_payload_sanitized, '{}'::jsonb)
  )
  on conflict (external_event_id) do nothing
  returning id into inserted_id;

  if inserted_id is not null then
    return query select inserted_id, 1, true;
    return;
  end if;

  return query
  update public.hotmart_webhook_events
  set delivery_count = hotmart_webhook_events.delivery_count + 1,
      last_received_at = now()
  where external_event_id = p_external_event_id
  returning id, hotmart_webhook_events.delivery_count, false;
end;
$$;

revoke all on function public.register_hotmart_webhook_event(text, text, text, text, timestamptz, jsonb) from public, anon, authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'hotmart_product_mappings', 'hotmart_transactions', 'hotmart_webhook_events',
    'hotmart_access_links', 'hotmart_history'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
  end loop;
end $$;

drop trigger if exists trg_hotmart_product_mappings_updated_at on public.hotmart_product_mappings;
create trigger trg_hotmart_product_mappings_updated_at before update on public.hotmart_product_mappings
for each row execute function public.set_updated_at();
drop trigger if exists trg_hotmart_transactions_updated_at on public.hotmart_transactions;
create trigger trg_hotmart_transactions_updated_at before update on public.hotmart_transactions
for each row execute function public.set_updated_at();
drop trigger if exists trg_hotmart_webhook_events_updated_at on public.hotmart_webhook_events;
create trigger trg_hotmart_webhook_events_updated_at before update on public.hotmart_webhook_events
for each row execute function public.set_updated_at();
drop trigger if exists trg_hotmart_access_links_updated_at on public.hotmart_access_links;
create trigger trg_hotmart_access_links_updated_at before update on public.hotmart_access_links
for each row execute function public.set_updated_at();

commit;
