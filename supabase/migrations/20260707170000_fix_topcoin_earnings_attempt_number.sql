-- ============================================================
-- 20260707170000_fix_topcoin_earnings_attempt_number.sql
-- Corrige o backfill de 20260707160000: aquele backfill usava
-- simulado_attempts.attempt_number (contador bruto de toda linha
-- já criada, inclusive tentativas abandonadas/desclassificadas e
-- linhas extras inseridas por reset de admin) como se fosse "a
-- tentativa" para efeito de TopCoins — o que pode chegar a 10/11
-- num simulado que só permite 3 tentativas.
--
-- A tentativa real, pra TopCoins, é a posição da tentativa entre
-- as CONCLUÍDAS daquele aluno naquele simulado (1ª, 2ª, 3ª...).
-- Esta migration apaga os registros gerados pelo backfill anterior
-- e regrava tudo com o número de tentativa correto (mesma lógica
-- já usada agora em app/api/student/simulados/[id]/attempts/
-- [attemptId]/submit/route.ts para tentativas novas).
-- ============================================================

begin;

delete from public.topcoin_earnings;

with ranked as (
  select
    id,
    row_number() over (
      partition by student_id, simulado_id
      order by created_at
    ) as real_attempt_number
  from public.simulado_attempts
  where status = 'completed'
)
insert into public.topcoin_earnings (student_id, simulado_id, attempt_id, jornada_id, attempt_number, amount, created_at)
select
  sa.student_id,
  sa.simulado_id,
  sa.id,
  jm.jornada_id,
  r.real_attempt_number,
  greatest(0, (
    case
      when r.real_attempt_number = 1 then sa.total_questions
      when r.real_attempt_number = 2 then ceil(sa.total_questions::numeric / 2)
      else ceil(sa.total_questions::numeric / 3)
    end
  )::integer - coalesce(sr.wrong_count, 0)) as amount,
  coalesce(sa.submitted_at, sa.last_activity_at, now())
from public.simulado_attempts sa
join ranked r on r.id = sa.id
join public.simulado_results sr on sr.attempt_id = sa.id
left join lateral (
  select sj.jornada_id
  from public.student_jornada_simulados sjs
  join public.student_jornadas sj on sj.id = sjs.student_jornada_id
  where sjs.simulado_id = sa.simulado_id and sj.student_id = sa.student_id
  limit 1
) jm on true
where sa.status = 'completed'
on conflict (attempt_id) do nothing;

commit;
