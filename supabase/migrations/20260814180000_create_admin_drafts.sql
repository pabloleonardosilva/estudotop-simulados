begin;

create table if not exists public.admin_drafts (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id) on delete cascade,
  draft_key text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_drafts_draft_key_check check (char_length(btrim(draft_key)) between 2 and 100),
  constraint admin_drafts_payload_size_check check (octet_length(payload::text) <= 5242880)
);

create unique index if not exists unique_admin_drafts_admin_key
  on public.admin_drafts (admin_id, draft_key);

create index if not exists idx_admin_drafts_updated_at
  on public.admin_drafts (updated_at desc);

drop trigger if exists trg_admin_drafts_updated_at on public.admin_drafts;
create trigger trg_admin_drafts_updated_at
  before update on public.admin_drafts
  for each row execute function public.set_updated_at();

alter table public.admin_drafts enable row level security;
revoke all on table public.admin_drafts from anon, authenticated;

comment on table public.admin_drafts is 'Rascunhos administrativos sincronizados entre dispositivos, acessados somente por APIs autenticadas do servidor.';

commit;
