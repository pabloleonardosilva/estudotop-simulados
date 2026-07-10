begin;

create or replace function public.normalize_topic_name(value text)
returns text
language plpgsql
immutable
as $$
declare
  cleaned text;
  token text;
  result text := '';
  position integer := 0;
begin
  cleaned := regexp_replace(btrim(coalesce(value, ''), E' \t\n\r.,:;-'), '[[:space:]]+', ' ', 'g');

  if cleaned = '' then
    return '';
  end if;

  foreach token in array regexp_split_to_array(lower(cleaned), ' ') loop
    position := position + 1;

    token := case token
      when '/etc' then '/etc'
      when 'api' then 'API'
      when 'cpu' then 'CPU'
      when 'css' then 'CSS'
      when 'dns' then 'DNS'
      when 'ftp' then 'FTP'
      when 'hd' then 'HD'
      when 'hdd' then 'HDD'
      when 'html' then 'HTML'
      when 'http' then 'HTTP'
      when 'https' then 'HTTPS'
      when 'ia' then 'IA'
      when 'iaas' then 'IaaS'
      when 'imap' then 'IMAP'
      when 'ip' then 'IP'
      when 'ipv4' then 'IPv4'
      when 'ipv6' then 'IPv6'
      when 'paas' then 'PaaS'
      when 'pdf' then 'PDF'
      when 'pop3' then 'POP3'
      when 'ram' then 'RAM'
      when 'rom' then 'ROM'
      when 'saas' then 'SaaS'
      when 'smtp' then 'SMTP'
      when 'ssd' then 'SSD'
      when 'ssh' then 'SSH'
      when 'ssl' then 'SSL'
      when 'tcp' then 'TCP'
      when 'tcp/ip' then 'TCP/IP'
      when 'ti' then 'TI'
      when 'url' then 'URL'
      when 'usb' then 'USB'
      when 'vpn' then 'VPN'
      when 'wi-fi' then 'Wi-Fi'
      when 'wifi' then 'Wi-Fi'
      when 'widows' then 'Windows'
      when 'onedrive' then 'OneDrive'
      when 'powerpoint' then 'PowerPoint'
      when 'macos' then 'macOS'
      else
        case
          when position > 1 and token in ('a', 'as', 'o', 'os', 'e', 'em', 'no', 'na', 'nos', 'nas', 'de', 'da', 'das', 'do', 'dos', 'para', 'por', 'com', 'sem', 'sob', 'sobre', 'entre') then token
          else initcap(token)
        end
    end;

    result := result || case when result = '' then '' else ' ' end || token;
  end loop;

  return result;
end;
$$;

create or replace function public.normalize_topic_key(value text)
returns text
language sql
immutable
as $$
  select translate(
    lower(public.normalize_topic_name(value)),
    'áàâãäéèêëíìîïóòôõöúùûüç',
    'aaaaaeeeeiiiiooooouuuuc'
  );
$$;

create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint topics_name_check check (char_length(btrim(name)) between 2 and 120),
  constraint topics_normalized_name_check check (char_length(btrim(normalized_name)) between 2 and 120)
);

create unique index if not exists unique_topics_subject_normalized_name
  on public.topics (subject_id, normalized_name);

create index if not exists idx_topics_subject_id
  on public.topics (subject_id);

create index if not exists idx_topics_is_active
  on public.topics (is_active);

create or replace function public.set_topic_normalized_name()
returns trigger
language plpgsql
as $$
begin
  new.name := public.normalize_topic_name(new.name);
  new.normalized_name := public.normalize_topic_key(new.name);
  return new;
end;
$$;

drop trigger if exists trg_topics_normalize_name on public.topics;
create trigger trg_topics_normalize_name
  before insert or update of name on public.topics
  for each row execute function public.set_topic_normalized_name();

drop trigger if exists trg_topics_updated_at on public.topics;
create trigger trg_topics_updated_at
  before update on public.topics
  for each row execute function public.set_updated_at();

with topic_source as (
  select
    q.subject_id,
    public.normalize_topic_name(topic_name) as name,
    public.normalize_topic_key(topic_name) as normalized_name
  from public.questions q
  cross join lateral unnest(coalesce(q.evaluated_topics, '{}'::text[])) as topic_name
  where q.subject_id is not null
),
topic_variants as (
  select subject_id, normalized_name, name, count(*) as usage_count
  from topic_source
  where name <> '' and normalized_name <> ''
  group by subject_id, normalized_name, name
),
canonical_topics as (
  select distinct on (subject_id, normalized_name)
    subject_id,
    name,
    normalized_name
  from topic_variants
  order by subject_id, normalized_name, usage_count desc, char_length(name), name
)
insert into public.topics (subject_id, name, normalized_name, is_active)
select subject_id, name, normalized_name, true
from canonical_topics
on conflict (subject_id, normalized_name)
do update set
  name = excluded.name,
  is_active = true,
  updated_at = now();

alter table public.topics enable row level security;

commit;
