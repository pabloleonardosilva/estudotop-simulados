-- Categoria visual das Jornadas
-- Execute no Supabase antes de usar a criação/edição com categoria.

ALTER TABLE public.jornadas
  ADD COLUMN IF NOT EXISTS category text;

UPDATE public.jornadas
SET category = 'administrativo'
WHERE category IS NULL;

ALTER TABLE public.jornadas
  DROP CONSTRAINT IF EXISTS jornadas_category_check;

ALTER TABLE public.jornadas
  ADD CONSTRAINT jornadas_category_check
  CHECK (category IN ('saude', 'policial', 'tribunais', 'administrativo'));

ALTER TABLE public.jornadas
  ALTER COLUMN category SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jornadas_category
  ON public.jornadas(category);
