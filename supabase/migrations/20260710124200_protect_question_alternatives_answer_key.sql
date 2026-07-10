-- Migration: protect_question_alternatives_answer_key
-- Bloqueador crítico de segurança nº 4 (Sprint Segurança do Banco, 2026-07-10).
--
-- Contexto: public.question_alternatives possui RLS habilitado, porém com a
-- policy "Students can read question alternatives" (SELECT para {public},
-- USING true) e grants completos para anon/authenticated. Isso expõe a
-- coluna is_correct (gabarito) diretamente via PostgREST a qualquer portador
-- da anon key, comprometendo a integridade dos simulados.
--
-- Consumidores reais auditados no código (2026-07-10): todos server-side —
-- rotas /api/admin/questions/** e /api/student/simulados/** (service role),
-- lib/questions/duplicate-service.ts e páginas server component com
-- createSupabaseAdminClient. Nenhum arquivo "use client" consulta a tabela
-- (nem via select aninhado). O aluno recebe as alternativas exclusivamente
-- pelas APIs autorizadas, que decidem quando revelar o gabarito. Portanto
-- não é necessária view segura nem alteração de código: basta remover o
-- acesso direto público.
--
-- A policy "Admins can manage question alternatives" (is_admin()) é mantida
-- intacta; sem grants para authenticated ela não concede acesso via
-- PostgREST, mas preserva o comportamento caso uma policy administrativa
-- volte a ser necessária no futuro.
--
-- Estado final esperado:
--   - RLS habilitado;
--   - policy pública de SELECT removida;
--   - policy administrativa is_admin() preservada (sem efeito prático via
--     PostgREST enquanto não houver grants);
--   - anon/authenticated sem qualquer privilégio direto na tabela;
--   - service_role com privilégios integrais (inalterados).
--
-- Nenhum dado é modificado; nenhuma coluna é alterada; nenhum backfill.

begin;

alter table public.question_alternatives enable row level security;

drop policy if exists "Students can read question alternatives" on public.question_alternatives;

revoke all on table public.question_alternatives from anon, authenticated;

commit;
