begin;

-- Decisao explicita: todos os contextos existentes recebem 3, independentemente do limite antigo.
alter table public.jornadas add column if not exists max_attempts integer;
alter table public.simulado_events add column if not exists max_attempts integer;
update public.jornadas set max_attempts = 3;
update public.simulado_events set max_attempts = 3;

do $$
begin
  if exists (select 1 from public.jornadas where max_attempts is null or max_attempts < 1)
     or exists (select 1 from public.simulado_events where max_attempts is null or max_attempts < 1) then
    raise exception 'Limites de tentativas dos contextos invalidos';
  end if;
end $$;

alter table public.jornadas alter column max_attempts set default 3, alter column max_attempts set not null;
alter table public.simulado_events alter column max_attempts set default 3, alter column max_attempts set not null;
alter table public.jornadas add constraint jornadas_max_attempts_check check (max_attempts >= 1);
alter table public.simulado_events add constraint simulado_events_max_attempts_check check (max_attempts >= 1);
comment on column public.jornadas.max_attempts is 'Limite por aluno e por Simulado desta Jornada; independente de outros contextos.';
comment on column public.simulado_events.max_attempts is 'Limite de tentativas por aluno neste Evento.';
alter table public.simulados drop column if exists max_attempts;

commit;
