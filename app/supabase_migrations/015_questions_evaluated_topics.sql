begin;

alter table public.questions
add column if not exists evaluated_topics text[] not null default '{}';

create index if not exists idx_questions_evaluated_topics
on public.questions using gin (evaluated_topics);

commit;
