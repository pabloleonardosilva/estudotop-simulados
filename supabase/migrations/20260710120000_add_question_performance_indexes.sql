-- Migration: add_question_performance_indexes
-- Origem: conversão do antigo arquivo avulso `performance-indexes.sql` (raiz do projeto),
--         criado em 2026-05-15 para execução manual no SQL Editor do Supabase.
-- Finalidade: otimização de performance do módulo de questões — filtros da listagem
--             administrativa (/questoes), classificação de dificuldade em lote
--             (classify-difficulty) e detecção de duplicatas por fingerprint.
-- Contexto: migration criada durante a consolidação arquitetural (2026-07-10),
--           em conformidade com MIG-004/MIG-007 da Política de Migrations.
--           Conferência prévia em pg_indexes no banco operacional:
--           - idx_questions_status, idx_questions_difficulty_level,
--             idx_questions_exam_board_id, idx_questions_subject_id e
--             idx_question_alternatives_question_id já existem com definição
--             idêntica — mantidos aqui com IF NOT EXISTS (no-op no banco atual).
--           - os índices de question_subjects do arquivo original foram OMITIDOS:
--             o banco já possui equivalentes funcionais
--             (question_subjects_question_id_idx e question_subjects_subject_id_idx).
-- Esta migration não altera dados, tabelas, colunas, constraints, funções,
-- triggers ou policies, e não executa DROP.

begin;

-- questions: filtros usados na listagem administrativa e na classificação de dificuldade
create index if not exists idx_questions_status
  on questions (status);

create index if not exists idx_questions_difficulty_level
  on questions (difficulty_level);

create index if not exists idx_questions_exam_board_id
  on questions (exam_board_id);

create index if not exists idx_questions_subject_id
  on questions (subject_id);

create index if not exists idx_questions_year
  on questions (year);

-- composto parcial: classify-difficulty busca questões com dificuldade definida
create index if not exists idx_questions_status_difficulty
  on questions (status, difficulty_level)
  where difficulty_level is not null;

-- parcial: questões ainda sem classificação de dificuldade (null ou 0)
create index if not exists idx_questions_no_difficulty
  on questions (id)
  where difficulty_level is null or difficulty_level = 0;

-- question_alternatives: join das alternativas com a questão
create index if not exists idx_question_alternatives_question_id
  on question_alternatives (question_id);

-- detecção de duplicatas: lookup de fingerprint por banca
create index if not exists idx_questions_board_fingerprint
  on questions (exam_board_id, question_fingerprint);

commit;
