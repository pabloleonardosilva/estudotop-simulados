begin;

-- One-time renumbering: close existing gaps in ETxxxx codes, in creation order.
with ordered_questions as (
  select
    id,
    row_number() over (
      order by created_at asc nulls first, id asc
    ) as code_number
  from public.questions
)
update public.questions q
set code =
  'ET' ||
  case
    when ordered_questions.code_number < 10000
      then lpad(ordered_questions.code_number::text, 4, '0')
    else ordered_questions.code_number::text
  end
from ordered_questions
where q.id = ordered_questions.id;

with code_count as (
  select count(*)::bigint as value
  from public.questions
)
select setval(
  'public.question_public_code_seq',
  greatest((select value from code_count), 1),
  (select value from code_count) > 0
);

-- Pool of freed code numbers, reclaimed when a question is deleted.
create table if not exists public.question_code_pool (
  code_number bigint primary key
);

create or replace function public.reclaim_question_public_code()
returns trigger
language plpgsql
as $$
declare
  freed_number bigint;
begin
  if old.code ~ '^ET[0-9]+$' then
    freed_number := substring(old.code from '^ET([0-9]+)$')::bigint;
    insert into public.question_code_pool (code_number)
    values (freed_number)
    on conflict do nothing;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_reclaim_question_public_code on public.questions;

create trigger trg_reclaim_question_public_code
after delete on public.questions
for each row
execute function public.reclaim_question_public_code();

-- New codes consume the smallest freed number first, falling back to the sequence.
create or replace function public.generate_question_public_code()
returns text
language plpgsql
as $$
declare
  next_code_number bigint;
begin
  delete from public.question_code_pool
  where code_number = (select min(code_number) from public.question_code_pool)
  returning code_number into next_code_number;

  if next_code_number is null then
    next_code_number := nextval('public.question_public_code_seq');
  end if;

  return
    'ET' ||
    case
      when next_code_number < 10000
        then lpad(next_code_number::text, 4, '0')
      else next_code_number::text
    end;
end;
$$;

commit;
