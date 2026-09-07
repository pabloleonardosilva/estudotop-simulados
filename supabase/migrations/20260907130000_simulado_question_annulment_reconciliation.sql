-- ============================================================
-- 20260907130000_simulado_question_annulment_reconciliation.sql
-- Marcador objetivo, consultável por SELECT, de reconciliação pendente
-- para anulação/desanulação de questão dentro de um Simulado.
--
-- pending_reconciliation_at é o único campo estrutural novo: marcado (now())
-- no MESMO UPDATE que aplica a transição de status (junto com
-- status_revision_id, já existente desde 20260907140000), e limpo (null)
-- somente depois que lib/server/simuladoQuestionReprocessing.ts concluir
-- com sucesso o reprocessamento daquela revisão. Uma falha parcial (queda
-- de conexão/processo no meio de reprocessSimulado) deixa este campo
-- preenchido — detectável e retomável, sem depender de memória, log ou o
-- Admin lembrar de agir.
--
-- As demais colunas abaixo (annulled_at/annulled_by/annulment_reason em
-- simulado_questions; had_live_rule_change/last_reprocessed_at/
-- reprocess_reason em simulado_results) já existem desde a migration
-- original das tabelas (20260511183000_create_simulados_admin_core.sql).
-- Os "add column if not exists" aqui são só normalização defensiva —
-- não devem adicionar nada num ambiente já migrado corretamente — e
-- confirmam por escrito, nesta migration rastreada, que nenhum campo de
-- Hotmart ou qualquer outra feature está envolvido.
-- ============================================================

begin;

alter table public.simulado_questions
  add column if not exists pending_reconciliation_at timestamptz;

comment on column public.simulado_questions.pending_reconciliation_at is
  'Marcado (now()) no mesmo UPDATE que aplica uma transição de status (active/annulled) bem-sucedida, junto com status_revision_id. Limpo (null) somente após reprocessSimulado() concluir com sucesso a reconciliação daquela revisão. Uma linha com este campo não-nulo identifica, por SELECT direto, uma reconciliação pendente — inclusive após falha parcial do processo anterior. Ver lib/server/simuladoQuestionReprocessing.ts e docs/Sprint-resultados.md.';

create index if not exists idx_simulado_questions_pending_reconciliation
  on public.simulado_questions (simulado_id, pending_reconciliation_at)
  where pending_reconciliation_at is not null;

alter table public.simulado_questions
  add column if not exists annulled_at timestamptz,
  add column if not exists annulled_by uuid,
  add column if not exists annulment_reason text;

alter table public.simulado_results
  add column if not exists had_live_rule_change boolean not null default false,
  add column if not exists last_reprocessed_at timestamptz,
  add column if not exists reprocess_reason text;

commit;
