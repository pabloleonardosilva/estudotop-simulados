begin;

alter table public.questions
  add column if not exists code text;

create sequence if not exists public.question_public_code_seq;

update public.questions
set code = upper(trim(code))
where code is not null
  and code <> upper(trim(code));

with ranked_codes as (
  select
    id,
    code,
    row_number() over (
      partition by code
      order by created_at asc nulls first, id asc
    ) as code_rank
  from public.questions
  where nullif(trim(coalesce(code, '')), '') is not null
)
update public.questions q
set code = null
from ranked_codes r
where q.id = r.id
  and (
    r.code !~ '^ET[0-9]{4,}$'
    or r.code_rank > 1
  );

with existing_max as (
  select coalesce(
    max(substring(code from '^ET([0-9]+)$')::bigint),
    0
  ) as value
  from public.questions
  where code ~ '^ET[0-9]+$'
)
select setval(
  'public.question_public_code_seq',
  greatest((select value from existing_max), 1),
  (select value from existing_max) > 0
);

with ordered_questions as (
  select
    id,
    nextval('public.question_public_code_seq') as next_code_number
  from public.questions
  where nullif(trim(coalesce(code, '')), '') is null
  order by created_at asc nulls first, id asc
)
update public.questions q
set code =
  'ET' ||
  case
    when ordered_questions.next_code_number < 10000
      then lpad(ordered_questions.next_code_number::text, 4, '0')
    else ordered_questions.next_code_number::text
  end
from ordered_questions
where q.id = ordered_questions.id;

with all_codes_max as (
  select coalesce(
    max(substring(code from '^ET([0-9]+)$')::bigint),
    0
  ) as value
  from public.questions
  where code ~ '^ET[0-9]+$'
)
select setval(
  'public.question_public_code_seq',
  greatest((select value from all_codes_max), 1),
  (select value from all_codes_max) > 0
);

create unique index if not exists questions_code_unique_idx
  on public.questions (code)
  where code is not null;

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

create trigger trg_set_question_public_code
before insert on public.questions
for each row
execute function public.set_question_public_code();

commit;
