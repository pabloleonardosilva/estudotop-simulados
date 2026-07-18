begin;

alter table public.simulados
  add column if not exists owl_help_limit integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'simulados_owl_help_limit_positive'
      and conrelid = 'public.simulados'::regclass
  ) then
    alter table public.simulados
      add constraint simulados_owl_help_limit_positive
      check (owl_help_limit is null or owl_help_limit > 0);
  end if;
end
$$;

comment on column public.simulados.owl_help_limit is
  'Limite manual de usos da Ajuda da Coruja; nulo usa a sugestao legada para compatibilidade.';

commit;
