-- Assunto opcional: Tópico e Questão passam a pertencer diretamente à Disciplina.
--
-- Modelos suportados após esta migration:
--   Disciplina -> Assunto -> Tópicos   (topics.subject_id preenchido)
--   Disciplina -> Tópicos              (topics.subject_id NULL, topics.discipline_id obrigatório)
--
-- Quando há Assunto, a Disciplina é sempre derivada dele por trigger (não pode divergir).
-- Compatível com o código anterior: quem grava apenas subject_id recebe discipline_id derivado.
-- questions.discipline_id permanece nullable: registros históricos sem Assunto não recebem
-- Disciplina inferida; a obrigatoriedade para novos salvamentos fica na API.
--
-- Estado: PREPARADA, NÃO EXECUTADA. Pré-flight, pós-flight e rollback ao final (comentados).

begin;

-- ---------------------------------------------------------------------------
-- 1. topics.discipline_id
-- ---------------------------------------------------------------------------

alter table public.topics
  add column if not exists discipline_id uuid references public.disciplines(id) on delete restrict;

do $$
begin
  if exists (
    select 1
    from public.topics t
    join public.subjects s on s.id = t.subject_id
    where s.discipline_id is null
  ) then
    raise exception 'Backfill de topics.discipline_id abortado: existem tópicos cujo assunto não possui disciplina.';
  end if;
end;
$$;

-- Backfill sem alterar updated_at dos registros existentes.
alter table public.topics disable trigger trg_topics_updated_at;

update public.topics t
set discipline_id = s.discipline_id
from public.subjects s
where s.id = t.subject_id
  and t.discipline_id is null;

alter table public.topics enable trigger trg_topics_updated_at;

do $$
begin
  if exists (select 1 from public.topics where discipline_id is null) then
    raise exception 'Backfill de topics.discipline_id incompleto.';
  end if;
end;
$$;

alter table public.topics alter column discipline_id set not null;
alter table public.topics alter column subject_id drop not null;

-- unique_topics_subject_normalized_name (subject_id, normalized_name) é preservado:
-- continua servindo aos ON CONFLICT (subject_id, normalized_name) existentes.
create unique index if not exists unique_topics_discipline_normalized_name
  on public.topics (discipline_id, normalized_name)
  where subject_id is null;

create index if not exists idx_topics_discipline_id
  on public.topics (discipline_id);

create or replace function public.set_topic_discipline_from_subject()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  subject_discipline_id uuid;
begin
  if new.subject_id is null then
    return new;
  end if;

  select s.discipline_id into subject_discipline_id
  from public.subjects s
  where s.id = new.subject_id;

  if not found then
    return new;
  end if;

  if subject_discipline_id is null then
    raise exception 'O assunto do tópico precisa pertencer a uma disciplina.'
      using errcode = '23514';
  end if;

  if new.discipline_id is not null
    and new.discipline_id is distinct from subject_discipline_id
    and (tg_op = 'INSERT' or new.discipline_id is distinct from old.discipline_id) then
    raise exception 'A disciplina do tópico diverge da disciplina do assunto.'
      using errcode = '23514';
  end if;

  new.discipline_id := subject_discipline_id;
  return new;
end;
$$;

revoke all on function public.set_topic_discipline_from_subject() from public, anon, authenticated;

drop trigger if exists trg_topics_set_discipline on public.topics;
create trigger trg_topics_set_discipline
  before insert or update of subject_id, discipline_id on public.topics
  for each row execute function public.set_topic_discipline_from_subject();

-- ---------------------------------------------------------------------------
-- 2. questions.discipline_id
-- ---------------------------------------------------------------------------

alter table public.questions
  add column if not exists discipline_id uuid references public.disciplines(id) on delete restrict;

-- Backfill sem alterar updated_at e sem disparar sincronização de tópicos.
alter table public.questions disable trigger set_questions_updated_at;

update public.questions q
set discipline_id = s.discipline_id
from public.subjects s
where s.id = q.subject_id
  and q.discipline_id is null
  and s.discipline_id is not null;

alter table public.questions enable trigger set_questions_updated_at;

do $$
begin
  if exists (
    select 1
    from public.questions q
    join public.subjects s on s.id = q.subject_id
    where q.discipline_id is distinct from s.discipline_id
  ) then
    raise exception 'Backfill de questions.discipline_id divergente da disciplina do assunto.';
  end if;
end;
$$;

create index if not exists idx_questions_discipline_id
  on public.questions (discipline_id);

create or replace function public.set_question_discipline_from_subject()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  subject_discipline_id uuid;
begin
  if new.subject_id is null then
    return new;
  end if;

  select s.discipline_id into subject_discipline_id
  from public.subjects s
  where s.id = new.subject_id;

  if not found then
    return new;
  end if;

  if new.discipline_id is not null
    and subject_discipline_id is not null
    and new.discipline_id is distinct from subject_discipline_id
    and (tg_op = 'INSERT' or new.discipline_id is distinct from old.discipline_id) then
    raise exception 'A disciplina da questão diverge da disciplina do assunto.'
      using errcode = '23514';
  end if;

  new.discipline_id := subject_discipline_id;
  return new;
end;
$$;

revoke all on function public.set_question_discipline_from_subject() from public, anon, authenticated;

drop trigger if exists trg_questions_set_discipline on public.questions;
create trigger trg_questions_set_discipline
  before insert or update of subject_id, discipline_id on public.questions
  for each row execute function public.set_question_discipline_from_subject();

-- ---------------------------------------------------------------------------
-- 3. Assunto movido de Disciplina: tópicos e questões acompanham
-- ---------------------------------------------------------------------------

create or replace function public.propagate_subject_discipline_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.discipline_id is not distinct from old.discipline_id then
    return new;
  end if;

  update public.topics
  set discipline_id = new.discipline_id
  where subject_id = new.id;

  update public.questions
  set discipline_id = new.discipline_id
  where subject_id = new.id;

  return new;
end;
$$;

revoke all on function public.propagate_subject_discipline_change() from public, anon, authenticated;

drop trigger if exists trg_subjects_propagate_discipline on public.subjects;
create trigger trg_subjects_propagate_discipline
  after update of discipline_id on public.subjects
  for each row execute function public.propagate_subject_discipline_change();

-- ---------------------------------------------------------------------------
-- 4. Sincronização do catálogo a partir de questions.evaluated_topics
-- ---------------------------------------------------------------------------

create or replace function public.sync_topics_from_question_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.subject_id is not null then
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
  end if;

  if new.discipline_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.subject_id is not distinct from new.subject_id
      and old.discipline_id is not distinct from new.discipline_id
      and old.evaluated_topics is not distinct from new.evaluated_topics then
      return new;
    end if;
  end if;

  insert into public.topics (discipline_id, subject_id, name, normalized_name, is_active)
  select distinct on (public.normalize_topic_key(topic_name))
    new.discipline_id,
    null::uuid,
    public.normalize_topic_name(topic_name),
    public.normalize_topic_key(topic_name),
    true
  from unnest(coalesce(new.evaluated_topics, '{}'::text[])) with ordinality as item(topic_name, position)
  where public.normalize_topic_name(topic_name) <> ''
  order by public.normalize_topic_key(topic_name), position
  on conflict (discipline_id, normalized_name) where subject_id is null
  do update set
    name = excluded.name,
    is_active = true,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_questions_sync_topics_on_review on public.questions;
create trigger trg_questions_sync_topics_on_review
  after insert or update of status, subject_id, discipline_id, evaluated_topics on public.questions
  for each row execute function public.sync_topics_from_question_review();

-- ---------------------------------------------------------------------------
-- 5. Renomear tópico e referências nas questões
-- ---------------------------------------------------------------------------

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

  if current_topic.subject_id is not null then
    if exists (
      select 1
      from public.topics
      where subject_id = current_topic.subject_id
        and normalized_name = normalized_new_key
        and id <> current_topic.id
    ) then
      raise exception 'Já existe um tópico com esse nome neste assunto.';
    end if;
  else
    if exists (
      select 1
      from public.topics
      where subject_id is null
        and discipline_id = current_topic.discipline_id
        and normalized_name = normalized_new_key
        and id <> current_topic.id
    ) then
      raise exception 'Já existe um tópico com esse nome nesta disciplina.';
    end if;
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
  where (
      (current_topic.subject_id is not null and q.subject_id = current_topic.subject_id)
      or (current_topic.subject_id is null and q.subject_id is null and q.discipline_id = current_topic.discipline_id)
    )
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

-- ===========================================================================
-- PRÉ-FLIGHT (somente leitura; executar imediatamente antes desta migration)
-- ===========================================================================
-- select
--   (select count(*) from public.disciplines)                                  as disciplines,
--   (select count(*) from public.subjects)                                     as subjects,
--   (select count(*) from public.subjects where discipline_id is null)         as subjects_sem_disciplina,        -- esperado 0
--   (select count(*) from public.topics)                                       as topics,
--   (select count(*) from public.topics t where not exists
--      (select 1 from public.subjects s where s.id = t.subject_id))            as topics_subject_invalido,        -- esperado 0
--   (select count(*) from public.topics t join public.subjects s on s.id = t.subject_id
--      where s.discipline_id is not null)                                      as topics_backfill_esperado,       -- esperado = topics
--   (select count(*) from public.questions)                                    as questions,
--   (select count(*) from public.questions where subject_id is null)           as questions_sem_assunto,
--   (select count(*) from public.questions q where q.subject_id is not null and not exists
--      (select 1 from public.subjects s where s.id = q.subject_id))            as questions_subject_invalido,     -- esperado 0
--   (select count(*) from public.questions q join public.subjects s on s.id = q.subject_id
--      where s.discipline_id is not null)                                      as questions_backfill_esperado,
--   (select count(*) from (select qs.question_id from public.question_subjects qs
--      join public.subjects s on s.id = qs.subject_id group by 1
--      having count(distinct s.discipline_id) > 1) x)                          as questions_multidisciplina,      -- esperado 0
--   (select count(*) from information_schema.columns where table_schema = 'public'
--      and table_name in ('topics','questions') and column_name = 'discipline_id') as colunas_ja_existentes;    -- esperado 0
--
-- select conrelid::regclass, conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid in ('public.topics'::regclass, 'public.questions'::regclass) order by 1, 2;
-- select c.relname, t.tgname, pg_get_triggerdef(t.oid) from pg_trigger t join pg_class c on c.oid = t.tgrelid
--  where not t.tgisinternal and c.relname in ('topics','questions','subjects') and c.relnamespace = 'public'::regnamespace;
-- select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename in ('topics','questions');
-- select p.proname, md5(pg_get_functiondef(p.oid)) from pg_proc p where p.pronamespace = 'public'::regnamespace
--  and p.proname in ('sync_topics_from_question_review','rename_topic_and_question_references');
-- select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname in ('topics','questions');
-- select tablename, policyname, cmd, qual from pg_policies where schemaname = 'public' and tablename in ('topics','questions');
-- select md5(string_agg(id::text || ':' || coalesce(subject_id::text,'') || ':' || coalesce(array_to_string(evaluated_topics, '|'), '') || ':' || updated_at::text, ',' order by id))
--   from public.questions;                                                     -- guardar para comparação
-- select md5(string_agg(id::text || ':' || subject_id::text || ':' || normalized_name || ':' || is_active::text || ':' || updated_at::text, ',' order by id))
--   from public.topics;                                                        -- guardar para comparação

-- ===========================================================================
-- PÓS-FLIGHT (somente leitura; executar imediatamente depois)
-- ===========================================================================
-- select
--   (select count(*) from public.topics)                                        as topics,                          -- igual ao pré-flight
--   (select count(*) from public.topics where discipline_id is null)            as topics_sem_disciplina,           -- esperado 0
--   (select count(*) from public.topics where subject_id is null)               as topics_diretos,                  -- esperado 0
--   (select count(*) from public.topics t join public.subjects s on s.id = t.subject_id
--      where t.discipline_id is distinct from s.discipline_id)                  as topics_divergentes,              -- esperado 0
--   (select count(*) from public.questions)                                     as questions,                       -- igual ao pré-flight
--   (select count(*) from public.questions q join public.subjects s on s.id = q.subject_id
--      where q.discipline_id is distinct from s.discipline_id)                  as questions_divergentes,           -- esperado 0
--   (select count(*) from public.questions where discipline_id is null)         as questions_sem_disciplina,        -- esperado = questions_sem_assunto do pré-flight
--   (select count(*) from public.questions where subject_id is null and discipline_id is not null) as questions_diretas; -- esperado 0
--
-- select column_name, is_nullable, data_type from information_schema.columns
--  where table_schema = 'public' and table_name in ('topics','questions') and column_name in ('discipline_id','subject_id');
--   -- topics.discipline_id NO, topics.subject_id YES, questions.discipline_id YES, questions.subject_id YES
-- select indexname from pg_indexes where schemaname = 'public'
--  and indexname in ('unique_topics_subject_normalized_name','unique_topics_discipline_normalized_name',
--                    'idx_topics_discipline_id','idx_questions_discipline_id');       -- 4 linhas
-- select tgname from pg_trigger where tgname in ('trg_topics_set_discipline','trg_questions_set_discipline',
--   'trg_subjects_propagate_discipline','trg_questions_sync_topics_on_review','trg_topics_normalize_name',
--   'trg_topics_updated_at','set_questions_updated_at') and tgenabled = 'O';           -- 7 linhas
-- select pg_get_triggerdef(oid) from pg_trigger where tgname = 'trg_questions_sync_topics_on_review';
--   -- deve conter "UPDATE OF status, subject_id, discipline_id, evaluated_topics"
-- select proname, prosecdef, proconfig, proacl from pg_proc where pronamespace = 'public'::regnamespace
--  and proname in ('set_topic_discipline_from_subject','set_question_discipline_from_subject',
--                  'propagate_subject_discipline_change','sync_topics_from_question_review',
--                  'rename_topic_and_question_references');
--   -- rename: proacl somente postgres e service_role
-- select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname in ('topics','questions');
-- select tablename, policyname, cmd, qual from pg_policies where schemaname = 'public' and tablename in ('topics','questions');
--   -- idênticos ao pré-flight
-- Reexecutar os dois md5 do pré-flight: devem ser idênticos (nenhum subject_id, tópico,
-- evaluated_topics, is_active ou updated_at existente foi alterado).

-- ===========================================================================
-- ROLLBACK (não executar sem autorização)
-- ===========================================================================
-- Cenário A — nenhum dado no modelo simplificado foi criado: o bloco abaixo reverte tudo.
-- Cenário B — já existem tópicos diretos (topics.subject_id NULL) ou questões sem Assunto com
-- Disciplina: o bloco aborta sem alterar nada. Antes de reverter, é necessária decisão humana
-- para cada registro (atribuir Assunto real ou excluir), pois o modelo antigo não os representa.
-- Não existe rollback destrutivo automático.
--
-- begin;
-- do $$
-- begin
--   if exists (select 1 from public.topics where subject_id is null) then
--     raise exception 'Rollback bloqueado: existem tópicos diretos da disciplina (subject_id NULL).';
--   end if;
--   if exists (select 1 from public.questions where subject_id is null and discipline_id is not null) then
--     raise exception 'Rollback bloqueado: existem questões sem assunto com disciplina registrada.';
--   end if;
-- end;
-- $$;
--
-- drop trigger if exists trg_subjects_propagate_discipline on public.subjects;
-- drop trigger if exists trg_questions_set_discipline on public.questions;
-- drop trigger if exists trg_topics_set_discipline on public.topics;
--
-- drop trigger if exists trg_questions_sync_topics_on_review on public.questions;
-- create or replace function public.sync_topics_from_question_review()
-- returns trigger
-- language plpgsql
-- security definer
-- set search_path = public
-- as $$
-- begin
--   if new.subject_id is null then
--     return new;
--   end if;
--
--   if tg_op = 'UPDATE' then
--     if old.subject_id is not distinct from new.subject_id
--       and old.evaluated_topics is not distinct from new.evaluated_topics then
--       return new;
--     end if;
--   end if;
--
--   insert into public.topics (subject_id, name, normalized_name, is_active)
--   select
--     new.subject_id,
--     public.normalize_topic_name(topic_name),
--     public.normalize_topic_key(topic_name),
--     true
--   from unnest(coalesce(new.evaluated_topics, '{}'::text[])) as topic_name
--   where public.normalize_topic_name(topic_name) <> ''
--   on conflict (subject_id, normalized_name)
--   do update set
--     name = excluded.name,
--     is_active = true,
--     updated_at = now();
--
--   return new;
-- end;
-- $$;
-- create trigger trg_questions_sync_topics_on_review
--   after insert or update of status, subject_id, evaluated_topics on public.questions
--   for each row execute function public.sync_topics_from_question_review();
--
-- -- Definição anterior, idêntica a 20260627130000; create or replace preserva os grants atuais.
-- create or replace function public.rename_topic_and_question_references(
--   p_topic_id uuid,
--   p_new_name text
-- )
-- returns table (affected_count integer)
-- language plpgsql
-- security definer
-- set search_path = public
-- as $$
-- declare
--   current_topic public.topics%rowtype;
--   normalized_new_name text;
--   normalized_new_key text;
--   updated_questions integer := 0;
-- begin
--   select * into current_topic
--   from public.topics
--   where id = p_topic_id
--   for update;
--
--   if not found then
--     raise exception 'Tópico não encontrado.';
--   end if;
--
--   normalized_new_name := public.normalize_topic_name(p_new_name);
--   normalized_new_key := public.normalize_topic_key(normalized_new_name);
--
--   if char_length(normalized_new_name) < 2 then
--     raise exception 'Informe um tópico válido.';
--   end if;
--
--   if exists (
--     select 1
--     from public.topics
--     where subject_id = current_topic.subject_id
--       and normalized_name = normalized_new_key
--       and id <> current_topic.id
--   ) then
--     raise exception 'Já existe um tópico com esse nome neste assunto.';
--   end if;
--
--   update public.topics
--   set name = normalized_new_name
--   where id = current_topic.id;
--
--   update public.questions q
--   set evaluated_topics = (
--     select coalesce(array_agg(deduplicated.topic_name order by deduplicated.first_position), '{}'::text[])
--     from (
--       select
--         min(mapped.position) as first_position,
--         (array_agg(mapped.topic_name order by mapped.position))[1] as topic_name
--       from (
--         select
--           case
--             when public.normalize_topic_key(item.topic_name) = current_topic.normalized_name then normalized_new_name
--             else item.topic_name
--           end as topic_name,
--           item.position
--         from unnest(q.evaluated_topics) with ordinality as item(topic_name, position)
--       ) mapped
--       group by public.normalize_topic_key(mapped.topic_name)
--     ) deduplicated
--   )
--   where q.subject_id = current_topic.subject_id
--     and exists (
--       select 1
--       from unnest(q.evaluated_topics) as existing_topic
--       where public.normalize_topic_key(existing_topic) = current_topic.normalized_name
--     );
--
--   get diagnostics updated_questions = row_count;
--
--   return query select updated_questions;
-- end;
-- $$;
--
-- drop function if exists public.propagate_subject_discipline_change();
-- drop function if exists public.set_question_discipline_from_subject();
-- drop function if exists public.set_topic_discipline_from_subject();
--
-- drop index if exists public.idx_questions_discipline_id;
-- drop index if exists public.idx_topics_discipline_id;
-- drop index if exists public.unique_topics_discipline_normalized_name;
--
-- alter table public.questions drop column if exists discipline_id;
-- alter table public.topics alter column subject_id set not null;
-- alter table public.topics drop column if exists discipline_id;
-- commit;
