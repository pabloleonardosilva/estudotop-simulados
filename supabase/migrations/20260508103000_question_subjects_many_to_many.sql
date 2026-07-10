begin;

create table if not exists public.question_subjects (
  question_id uuid not null references public.questions(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (question_id, subject_id)
);

create index if not exists question_subjects_subject_id_idx
  on public.question_subjects (subject_id);

insert into public.question_subjects (question_id, subject_id)
select id, subject_id
from public.questions
where subject_id is not null
on conflict (question_id, subject_id) do nothing;

commit;
