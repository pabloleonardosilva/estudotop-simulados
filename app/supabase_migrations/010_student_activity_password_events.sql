-- Libera eventos de senha no histórico do aluno.
-- Rode no Supabase SQL Editor se o seu banco antigo tiver CHECK restritivo em student_activity_log.event_type.

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE rel.relname = 'student_activity_log'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%event_type%'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE student_activity_log DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE student_activity_log
ADD CONSTRAINT student_activity_log_event_type_check
CHECK (event_type IN (
  'field_update',
  'status_change',
  'jornada_assigned',
  'jornada_cancelled',
  'access_extended',
  'simulado_completed',
  'simulado_started',
  'simulado_abandoned',
  'password_reset',
  'password_changed'
));
