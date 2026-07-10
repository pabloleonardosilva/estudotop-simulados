begin;

create or replace function public.sync_topics_from_question_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'pending_review' or new.subject_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status = new.status
      and old.subject_id is not distinct from new.subject_id
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

drop trigger if exists trg_questions_sync_topics_on_review on public.questions;
create trigger trg_questions_sync_topics_on_review
  after insert or update of status, subject_id, evaluated_topics on public.questions
  for each row execute function public.sync_topics_from_question_review();

create or replace function public.rename_topic_and_question_references(
  p_topic_id uuid,
  p_new_name text
)
returns table (affected_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_topic public.topics%rowtype;
  normalized_new_name text;
  normalized_new_key text;
  updated_questions integer := 0;
begin
  select * into current_topic
  from public.topics
  where id = p_topic_id
  for update;

  if not found then
    raise exception 'Tópico não encontrado.';
  end if;

  normalized_new_name := public.normalize_topic_name(p_new_name);
  normalized_new_key := public.normalize_topic_key(normalized_new_name);

  if char_length(normalized_new_name) < 2 then
    raise exception 'Informe um tópico válido.';
  end if;

  if exists (
    select 1
    from public.topics
    where subject_id = current_topic.subject_id
      and normalized_name = normalized_new_key
      and id <> current_topic.id
  ) then
    raise exception 'Já existe um tópico com esse nome neste assunto.';
  end if;

  update public.topics
  set name = normalized_new_name
  where id = current_topic.id;

  update public.questions q
  set evaluated_topics = (
    select coalesce(array_agg(deduplicated.topic_name order by deduplicated.first_position), '{}'::text[])
    from (
      select
        min(mapped.position) as first_position,
        (array_agg(mapped.topic_name order by mapped.position))[1] as topic_name
      from (
        select
          case
            when public.normalize_topic_key(item.topic_name) = current_topic.normalized_name then normalized_new_name
            else item.topic_name
          end as topic_name,
          item.position
        from unnest(q.evaluated_topics) with ordinality as item(topic_name, position)
      ) mapped
      group by public.normalize_topic_key(mapped.topic_name)
    ) deduplicated
  )
  where q.subject_id = current_topic.subject_id
    and exists (
      select 1
      from unnest(q.evaluated_topics) as existing_topic
      where public.normalize_topic_key(existing_topic) = current_topic.normalized_name
    );

  get diagnostics updated_questions = row_count;

  return query select updated_questions;
end;
$$;

revoke all on function public.rename_topic_and_question_references(uuid, text) from public;
revoke all on function public.rename_topic_and_question_references(uuid, text) from anon;
revoke all on function public.rename_topic_and_question_references(uuid, text) from authenticated;
grant execute on function public.rename_topic_and_question_references(uuid, text) to service_role;

commit;
