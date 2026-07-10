begin;

alter table public.questions
  add column if not exists code text;

create sequence if not exists public.question_public_code_seq;

create or replace function public.generate_question_public_code()
returns text
language plpgsql
as $$
declare
  next_code_number bigint;
begin
  next_code_number := nextval('public.question_public_code_seq');

  return
    'ET' ||
    case
      when next_code_number < 10000
        then lpad(next_code_number::text, 4, '0')
      else next_code_number::text
    end;
end;
$$;

create or replace function public.set_question_public_code()
returns trigger
language plpgsql
as $$
begin
  new.code := public.generate_question_public_code();
  return new;
end;
$$;

drop trigger if exists trg_set_question_public_code on public.questions;

update public.questions
set code = '__REN_' || id::text;

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

create unique index if not exists questions_code_unique_idx
  on public.questions (code)
  where code is not null;

with code_count as (
  select count(*)::bigint as value
  from public.questions
)
select setval(
  'public.question_public_code_seq',
  greatest((select value from code_count), 1),
  (select value from code_count) > 0
);

create trigger trg_set_question_public_code
before insert on public.questions
for each row
execute function public.set_question_public_code();

commit;
