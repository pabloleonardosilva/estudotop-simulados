begin;

alter table public.simulados
  add column if not exists question_count integer;

alter table public.simulados
  drop constraint if exists simulados_question_count_check;

alter table public.simulados
  add constraint simulados_question_count_check check (
    question_count is null
    or question_count > 0
  );

commit;
