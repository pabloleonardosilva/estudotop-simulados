begin;

update public.questions
set correct_alternative_label = case
  when lower(trim(coalesce(correct_alternative_label, ''))) in ('c', 'certo') then 'Certo'
  when lower(trim(coalesce(correct_alternative_label, ''))) in ('e', 'errado') then 'Errado'
  else correct_alternative_label
end
where question_type = 'true_false';

with classified as (
  select
    qa.id,
    case
      when lower(trim(coalesce(qa.label, ''))) in ('c', 'certo')
        or lower(trim(regexp_replace(coalesce(qa.text, ''), '<[^>]*>', ' ', 'g'))) = 'certo'
        or qa.order_number = 1
        then 'Certo'
      when lower(trim(coalesce(qa.label, ''))) in ('e', 'errado')
        or lower(trim(regexp_replace(coalesce(qa.text, ''), '<[^>]*>', ' ', 'g'))) = 'errado'
        or qa.order_number = 2
        then 'Errado'
      else null
    end as normalized_label
  from public.question_alternatives qa
  inner join public.questions q on q.id = qa.question_id
  where q.question_type = 'true_false'
)
update public.question_alternatives qa
set
  label = classified.normalized_label,
  text = classified.normalized_label,
  order_number = case classified.normalized_label
    when 'Certo' then 1
    when 'Errado' then 2
    else qa.order_number
  end
from classified
where qa.id = classified.id
  and classified.normalized_label is not null;

insert into public.question_alternatives (
  question_id,
  label,
  text,
  image_url,
  is_correct,
  order_number
)
select
  q.id,
  'Certo',
  'Certo',
  null,
  false,
  1
from public.questions q
where q.question_type = 'true_false'
  and not exists (
    select 1
    from public.question_alternatives qa
    where qa.question_id = q.id
      and lower(trim(coalesce(qa.label, ''))) = 'certo'
  );

insert into public.question_alternatives (
  question_id,
  label,
  text,
  image_url,
  is_correct,
  order_number
)
select
  q.id,
  'Errado',
  'Errado',
  null,
  false,
  2
from public.questions q
where q.question_type = 'true_false'
  and not exists (
    select 1
    from public.question_alternatives qa
    where qa.question_id = q.id
      and lower(trim(coalesce(qa.label, ''))) = 'errado'
  );

commit;
