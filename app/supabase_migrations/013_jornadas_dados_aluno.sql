-- Adiciona campos estruturados para a aba "Dados da Jornada" na área do aluno.
-- Execute no Supabase antes de validar a criação/edição de Jornadas com os novos campos.

ALTER TABLE jornadas
  ADD COLUMN IF NOT EXISTS exam_name text,
  ADD COLUMN IF NOT EXISTS exam_position text,
  ADD COLUMN IF NOT EXISTS exam_board text,
  ADD COLUMN IF NOT EXISTS welcome_title text,
  ADD COLUMN IF NOT EXISTS welcome_message text,
  ADD COLUMN IF NOT EXISTS study_strategy text,
  ADD COLUMN IF NOT EXISTS important_guidelines text,
  ADD COLUMN IF NOT EXISTS journey_highlights jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE jornadas
SET journey_highlights = '[]'::jsonb
WHERE journey_highlights IS NULL;

ALTER TABLE jornadas
  DROP CONSTRAINT IF EXISTS jornadas_journey_highlights_array_check;

ALTER TABLE jornadas
  ADD CONSTRAINT jornadas_journey_highlights_array_check
  CHECK (jsonb_typeof(journey_highlights) = 'array');
