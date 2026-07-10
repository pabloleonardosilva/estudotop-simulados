begin;

-- Se a coluna ainda não existir (migration anterior não aplicada), adiciona como nullable
alter table public.simulados
  add column if not exists question_count integer;

-- Garante que linhas existentes com null recebam 0 antes do not null
update public.simulados
  set question_count = 0
  where question_count is null;

-- Torna not null e define default 0
alter table public.simulados
  alter column question_count set not null,
  alter column question_count set default 0;

-- Substitui constraint para aceitar 0 (não configurado) e rejeitar negativos
alter table public.simulados
  drop constraint if exists simulados_question_count_check;

alter table public.simulados
  add constraint simulados_question_count_check
  check (question_count >= 0);

-- Força PostgREST a recarregar o schema cache
notify pgrst, 'reload schema';

commit;
