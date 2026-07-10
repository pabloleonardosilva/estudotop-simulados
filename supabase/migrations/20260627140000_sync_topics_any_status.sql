begin;

create or replace function public.sync_topics_from_question_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.subject_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.subject_id is not distinct from new.subject_id
      and old.evaluated_topics is not distinct from new.evaluated_topics then
      return new;
    end if;
  end if;

  insert into public.topics (subject_id, name, normalized_name, is_active)
  select
    new.subject_id,
    public.normalize_topic_name(topic_name),
    public.normalize_topic_key(topic_name),
    true
  from unnest(coalesce(new.evaluated_topics, '{}'::text[])) as topic_name
  where public.normalize_topic_name(topic_name) <> ''
  on conflict (subject_id, normalized_name)
  do update set
    name = excluded.name,
    is_active = true,
    updated_at = now();

  return new;
end;
$$;

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

commit;
