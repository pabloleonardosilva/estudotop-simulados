-- Migration: protect_exam_contests_and_positions
-- Bloqueadores críticos de segurança nº 2 e nº 3 (Sprint Segurança do Banco, 2026-07-10).
--
-- Contexto: as tabelas public.exam_contests e public.exam_positions possuem
-- RLS habilitado, porém com policies "Admin full access to exam_contests" /
-- "Admin full access to exam_positions" definidas como ALL para {public}
-- com USING true e WITH CHECK true, além de grants completos para anon e
-- authenticated. Na prática, qualquer portador da anon key pode ler e
-- gravar diretamente nessas tabelas via PostgREST.
--
-- Consumidores reais auditados no código (2026-07-10):
--   - /api/admin/exam-contests e /api/admin/exam-positions (requireAdmin +
--     service role);
--   - páginas server-side do Raio-X (createSupabaseAdminClient).
-- Nenhum cliente browser acessa essas tabelas diretamente. O service role
-- bypassa RLS e grants, portanto a solução mais simples e segura é: RLS
-- habilitado, nenhuma policy e nenhum grant para anon/authenticated
-- (mesmo padrão da migration 20260702140000_protect_simulado_data_tables).
--
-- Estado final esperado:
--   - RLS habilitado em ambas as tabelas;
--   - nenhuma policy;
--   - anon/authenticated sem qualquer privilégio;
--   - service_role com privilégios integrais (inalterados).
--
-- Nenhum dado é modificado; nenhuma estrutura funcional é alterada.

begin;

alter table public.exam_contests enable row level security;
alter table public.exam_positions enable row level security;

drop policy if exists "Admin full access to exam_contests" on public.exam_contests;
drop policy if exists "Admin full access to exam_positions" on public.exam_positions;

revoke all on table public.exam_contests from anon, authenticated;
revoke all on table public.exam_positions from anon, authenticated;

commit;
