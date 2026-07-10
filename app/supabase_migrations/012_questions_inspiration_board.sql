-- Registra a banca que inspirou uma questão autoral da Estudo TOP.
-- Campo administrativo: não altera a banca oficial da questão e não é exibido ao aluno.

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS inspiration_board_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'questions_inspiration_board_id_fkey'
  ) THEN
    ALTER TABLE public.questions
      ADD CONSTRAINT questions_inspiration_board_id_fkey
      FOREIGN KEY (inspiration_board_id)
      REFERENCES public.exam_boards(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_questions_inspiration_board_id
  ON public.questions(inspiration_board_id)
  WHERE inspiration_board_id IS NOT NULL;

COMMENT ON COLUMN public.questions.inspiration_board_id IS
  'Banca cujo estilo inspirou uma questão autoral da Estudo TOP. Uso exclusivamente administrativo.';
