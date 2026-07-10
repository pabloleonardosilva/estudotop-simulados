-- ============================================================
-- 20260707180000_fix_topcoin_earnings_counts_toward_limit.sql
-- Corrige de novo o backfill de TopCoins: a versão anterior
-- (20260707170000) numerava a tentativa pela posição entre TODAS
-- as tentativas concluídas, sem olhar counts_toward_limit — o que
-- ainda permitia aparecer "4ª tentativa" num simulado que só
-- permite 3, sempre que o admin já tivesse resetado tentativas
-- daquele aluno (reset = tentativas antigas viram
-- counts_toward_limit = false, mas continuavam entrando na conta).
--
-- Regra correta (confirmada com o usuário): só conta pra
-- numeração — e só mantém as moedas — a tentativa que HOJE tem
-- counts_toward_limit = true. Resetar tentativas remove as moedas
-- daquelas que saíram da contagem; aumentar de novo as devolve.
-- Esta migration recalcula tudo com essa regra (mesma lógica de
-- app/lib/server/topcoinsSync.ts, usada a partir de agora em
-- toda gravação/ajuste de tentativas).
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
    and counts_toward_limit = true
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
  and sa.counts_toward_limit = true
on conflict (attempt_id) do nothing;

commit;
