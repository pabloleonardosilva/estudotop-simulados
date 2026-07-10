-- ============================================================
-- 20260707150000_add_simulados_attempt_threshold_percent.sql
-- A migration 20260511183000_create_simulados_admin_core.sql
-- define attempt_count_threshold_percent dentro de um
-- "create table if not exists public.simulados", mas a tabela
-- já existia antes dela rodar — então o if not exists pulou a
-- criação inteira e essa coluna nunca foi de fato adicionada.
-- Isso quebra o início de tentativa em todo simulado, pois
-- app/api/student/simulados/[id]/attempts/route.ts já lê essa
-- coluna. Corrige adicionando a coluna e a constraint que
-- faltaram, sem alterar a migration original.
-- ============================================================

begin;

alter table public.simulados
  add column if not exists attempt_count_threshold_percent numeric(5, 2) not null default 50.00;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'simulados_attempt_threshold_check'
  ) then
    alter table public.simulados
      add constraint simulados_attempt_threshold_check check (
        attempt_count_threshold_percent >= 0
        and attempt_count_threshold_percent <= 100
      );
  end if;
end $$;

commit;
