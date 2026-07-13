-- SOMENTE LEITURA. Execute antes de qualquer limpeza.
select
  i.*,
  (select count(*) from public.student_jornadas x where x.student_id = i.user_id) as jornada_count,
  (select count(*) from public.simulado_attempts x where x.student_id = i.user_id) as attempt_count,
  (select count(*) from public.simulado_results x where x.student_id = i.user_id) as result_count,
  (select count(*) from public.student_activity_log x where x.student_id = i.user_id) as activity_count,
  case
    when i.classification = 'ADMIN' then false
    when i.classification in ('AUTH_WITHOUT_STUDENT', 'PROFILE_WITHOUT_STUDENT', 'CONFIRMATION_WITHOUT_ACCOUNT')
      and (select count(*) from public.student_jornadas x where x.student_id = i.user_id) = 0
      and (select count(*) from public.simulado_attempts x where x.student_id = i.user_id) = 0
      and (select count(*) from public.simulado_results x where x.student_id = i.user_id) = 0
    then true
    else false
  end as eligible_for_controlled_removal,
  case
    when i.classification = 'ADMIN' then 'BLOCKED_ADMIN'
    when (select count(*) from public.student_jornadas x where x.student_id = i.user_id) > 0
      or (select count(*) from public.simulado_attempts x where x.student_id = i.user_id) > 0
      or (select count(*) from public.simulado_results x where x.student_id = i.user_id) > 0
    then 'REPAIR_REQUIRED_ACADEMIC_HISTORY'
    when i.classification = 'COMPLETE' then 'NO_ACTION'
    else 'REVIEW_REQUIRED'
  end as decision_reason
from public.student_account_integrity_admin i
order by i.classification, i.email;
