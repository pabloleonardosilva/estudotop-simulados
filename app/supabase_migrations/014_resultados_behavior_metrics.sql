-- Sprint Resultados — métricas comportamentais da tentativa
-- Adiciona campos leves em simulado_attempts para alimentar o Parecer da Coruja.

ALTER TABLE simulado_attempts
  ADD COLUMN IF NOT EXISTS inactivity_event_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scissors_used_question_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'simulado_attempts_inactivity_event_count_check'
  ) THEN
    ALTER TABLE simulado_attempts
      ADD CONSTRAINT simulado_attempts_inactivity_event_count_check
      CHECK (inactivity_event_count >= 0);
  END IF;
END $$;
