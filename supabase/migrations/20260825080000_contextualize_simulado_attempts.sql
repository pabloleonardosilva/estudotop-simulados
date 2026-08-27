begin;

alter table public.simulado_attempts
  add column if not exists student_jornada_simulado_id uuid null
    references public.student_jornada_simulados(id) on delete restrict;

comment on column public.simulado_attempts.student_jornada_simulado_id is
  'Identifica a vida operacional da tentativa dentro de uma Jornada. Nulo para execucoes avulsas, Eventos, previews e tentativas legadas de Jornada sem associacao inequivoca.';

update public.simulado_attempts as attempt
set student_jornada_simulado_id = candidate.student_jornada_simulado_id
from (
  select
    sj.student_id,
    sjs.simulado_id,
    min(sjs.id::text)::uuid as student_jornada_simulado_id
  from public.student_jornada_simulados as sjs
  join public.student_jornadas as sj on sj.id = sjs.student_jornada_id
  group by sj.student_id, sjs.simulado_id
  having count(*) = 1
) as candidate
where attempt.student_id = candidate.student_id
  and attempt.simulado_id = candidate.simulado_id
  and attempt.attempt_context = 'jornada'
  and attempt.event_id is null
  and attempt.event_participant_id is null
  and attempt.student_jornada_simulado_id is null;

drop index if exists public.unique_simulado_attempts_in_progress;

create unique index if not exists unique_simulado_attempts_in_progress_standalone
  on public.simulado_attempts (simulado_id, student_id)
  where status = 'in_progress'
    and attempt_context = 'standalone'
    and event_id is null
    and event_participant_id is null
    and student_jornada_simulado_id is null;

create unique index if not exists unique_simulado_attempts_in_progress_jornada
  on public.simulado_attempts (student_id, student_jornada_simulado_id)
  where status = 'in_progress'
    and attempt_context = 'jornada'
    and student_jornada_simulado_id is not null;

create unique index if not exists unique_simulado_attempts_in_progress_jornada_legacy
  on public.simulado_attempts (simulado_id, student_id)
  where status = 'in_progress'
    and attempt_context = 'jornada'
    and student_jornada_simulado_id is null;

create unique index if not exists unique_simulado_attempts_in_progress_event
  on public.simulado_attempts (student_id, event_participant_id)
  where status = 'in_progress'
    and attempt_context = 'event'
    and event_participant_id is not null;

create unique index if not exists unique_simulado_attempts_in_progress_preview
  on public.simulado_attempts (simulado_id, student_id)
  where status = 'in_progress'
    and attempt_context = 'professor_preview';

create index if not exists idx_simulado_attempts_student_jornada_simulado
  on public.simulado_attempts (student_jornada_simulado_id, status);

alter table public.simulado_attempts
  drop constraint if exists simulado_attempts_context_identity_check;

alter table public.simulado_attempts
  add constraint simulado_attempts_context_identity_check check (
    (attempt_context = 'standalone'
      and event_id is null
      and event_participant_id is null
      and student_jornada_simulado_id is null)
    or
    (attempt_context = 'jornada'
      and event_id is null
      and event_participant_id is null)
    or
    (attempt_context = 'event'
      and event_id is not null
      and event_participant_id is not null
      and student_jornada_simulado_id is null)
    or
    (attempt_context = 'professor_preview'
      and student_jornada_simulado_id is null)
  );

commit;
