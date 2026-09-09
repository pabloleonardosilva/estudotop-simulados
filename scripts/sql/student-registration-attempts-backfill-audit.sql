-- SOMENTE LEITURA. Não faz nenhuma escrita. Não substitui revisão manual.
--
-- Lista candidatos a backfill de public.student_registration_attempts a
-- partir de confirmações legadas de cadastro público que nunca viraram
-- conta (mesma fonte já usada por public.student_registration_orphans_admin,
-- supabase/migrations/20260713090000_student_account_integrity.sql).
--
-- NÃO cria nenhuma linha. Se, após revisão manual, o backfill for
-- considerado seguro, um script de importação SEPARADO deve ser escrito e
-- aprovado explicitamente — nunca a partir deste SELECT diretamente.
--
-- Exclui deliberadamente:
--   - confirmações já rastreadas em student_registration_attempts
--     (mesmo email_normalized);
--   - qualquer e-mail que já corresponda a uma identidade não-aluno
--     (profiles.role <> 'student') — nunca tratar admin/professor como lead.
select
  o.confirmation_id,
  o.email,
  o.full_name,
  o.phone,
  o.purpose,
  o.created_at,
  o.expires_at,
  o.classification,
  exists (
    select 1 from public.student_registration_attempts a
    where a.email_normalized = o.email
  ) as already_tracked,
  exists (
    select 1
    from auth.users au
    join public.profiles p on p.id = au.id
    where lower(btrim(au.email)) = o.email and p.role <> 'student'
  ) as belongs_to_non_student_identity
from public.student_registration_orphans_admin o
where o.purpose = 'public_signup'
order by o.created_at desc;
