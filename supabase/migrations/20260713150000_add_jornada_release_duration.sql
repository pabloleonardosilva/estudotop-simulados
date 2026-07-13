-- Migration: add_jornada_release_duration
-- Sprint Jornadas — separa "duração da matrícula" (duration_days) da
-- "janela de liberação dos simulados" (release_duration_days).
--
-- Antes: duration_days controlava tanto a expiração da matrícula quanto a
-- distribuição dos simulados. Agora:
--   - duration_days          → validade/expiração da matrícula (inalterado);
--   - release_duration_days  → janela em que todos os simulados são liberados
--                              (quando NÃO há data da prova). Com exam_date, a
--                              distribuição usa exam_date - 7 e este campo é ignorado.
--
-- Backfill: ambiente de testes — todas as jornadas recebem
-- release_duration_days = coalesce(duration_days, duration_months*30).
-- Coluna passa a NOT NULL com check > 0.

begin;

alter table public.jornadas
  add column if not exists release_duration_days integer;

update public.jornadas
   set release_duration_days = greatest(1, coalesce(duration_days, duration_months * 30))
 where release_duration_days is null;

alter table public.jornadas
  alter column release_duration_days set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.jornadas'::regclass
      and conname = 'jornadas_release_duration_days_positive'
  ) then
    alter table public.jornadas
      add constraint jornadas_release_duration_days_positive
      check (release_duration_days > 0);
  end if;
end;
$$;

commit;
