-- ============================================================
-- 20260707160000_create_topcoin_earnings.sql
-- Registro persistente de cada ganho de TopCoins (saldo + extrato
-- do aluno). A Sprint TopCoins original era só visual/cálculo,
-- sem gravar nada; esta migration passa a gravar um registro por
-- tentativa concluída, e faz o backfill de tentativas já
-- concluídas antes desta mudança.
-- ============================================================

begin;

create table if not exists public.topcoin_earnings (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  simulado_id uuid not null references public.simulados(id) on delete cascade,
  attempt_id uuid not null references public.simulado_attempts(id) on delete cascade,
  jornada_id uuid references public.jornadas(id) on delete set null,
  attempt_number integer not null,
  amount integer not null,
  created_at timestamptz not null default now(),
  constraint topcoin_earnings_amount_check check (amount >= 0)
);

create unique index if not exists unique_topcoin_earnings_attempt
  on public.topcoin_earnings (attempt_id);

create index if not exists idx_topcoin_earnings_student
  on public.topcoin_earnings (student_id);

create index if not exists idx_topcoin_earnings_jornada
  on public.topcoin_earnings (jornada_id);

-- Backfill: recalcula o ganho de toda tentativa já concluída, usando a mesma
-- fórmula de app/lib/gamification/topcoins.ts (1ª tentativa = total de
-- questões; 2ª = ceil(total/2); 3ª em diante = ceil(total/3); menos os
-- erros, piso zero). Idempotente via "on conflict do nothing" (unique em
-- attempt_id) — seguro rodar de novo sem duplicar.
insert into public.topcoin_earnings (student_id, simulado_id, attempt_id, jornada_id, attempt_number, amount, created_at)
select
  sa.student_id,
  sa.simulado_id,
  sa.id,
  jm.jornada_id,
  sa.attempt_number,
  greatest(0, (
    case
      when sa.attempt_number = 1 then sa.total_questions
      when sa.attempt_number = 2 then ceil(sa.total_questions::numeric / 2)
      else ceil(sa.total_questions::numeric / 3)
    end
  )::integer - coalesce(sr.wrong_count, 0)) as amount,
  coalesce(sa.submitted_at, sa.last_activity_at, now())
from public.simulado_attempts sa
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
