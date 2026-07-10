-- ============================================================
-- 005_simulado_navigation_type.sql
-- Adiciona o tipo de navegação ao simulado.
-- open: aluno navega livremente e envia tudo ao final.
-- closed: aluno confirma cada resposta antes de avançar.
-- ============================================================

begin;

alter table public.simulados
  add column if not exists navigation_type text not null default 'open'
    constraint simulados_navigation_type_check check (navigation_type in ('open', 'closed'));

commit;
