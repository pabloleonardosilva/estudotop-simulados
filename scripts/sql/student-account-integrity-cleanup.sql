-- LIMPEZA CONTROLADA. NÃO EXECUTAR SEM REVISAR O RELATÓRIO DE AUDITORIA.
-- Este script não remove auth.users: essa etapa deve usar Auth Admin API/service role.
-- Ele seleciona somente candidatos sem histórico e exclui explicitamente admins.
begin;

create temporary table student_cleanup_candidates on commit drop as
select i.user_id, i.email
from public.student_account_integrity_admin i
where i.classification in ('AUTH_WITHOUT_STUDENT', 'PROFILE_WITHOUT_STUDENT', 'CONFIRMATION_WITHOUT_ACCOUNT')
  and coalesce(i.role, 'student') <> 'admin'
  and not exists (select 1 from public.student_jornadas x where x.student_id = i.user_id)
  and not exists (select 1 from public.simulado_attempts x where x.student_id = i.user_id)
  and not exists (select 1 from public.simulado_results x where x.student_id = i.user_id)
  and not exists (select 1 from public.simulado_feedbacks x where x.student_id = i.user_id);

delete from public.student_registration_confirmations c
using student_cleanup_candidates x
where c.user_id = x.user_id or lower(btrim(c.email)) = x.email;

delete from public.profiles p
using student_cleanup_candidates x
where p.id = x.user_id and p.role = 'student';

select * from student_cleanup_candidates order by email;

-- Deliberadamente não há COMMIT automático. Após revisar o SELECT acima:
-- substitua ROLLBACK por COMMIT e remova auth.users via serviço administrativo central.
rollback;
