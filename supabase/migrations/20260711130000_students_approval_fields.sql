-- Migration: students_approval_fields
-- Sprint Cadastro (2026-07-11) — aprovação explícita do cadastro do aluno.
--
-- Contexto: a aprovação inicial (pending → active) passa a ser uma ação
-- administrativa própria (POST /api/admin/students/[id]/approve) que dispara
-- o e-mail de boas-vindas. Estes campos registram a aprovação e a tentativa
-- de envio. Campos já existentes reutilizados (não recriados):
-- welcome_email_status, welcome_email_sent_at (primeiro envio bem-sucedido)
-- e welcome_email_error (último erro sanitizado).
--
-- approved_at: preenchido somente na primeira aprovação; nunca limpo por
--   desativação, bloqueio ou reativação.
-- approved_by: administrador responsável (FK para profiles, tabela estável;
--   ON DELETE SET NULL preserva o histórico do aluno).
-- welcome_email_attempted_at: última tentativa de envio (automática ou manual).
--
-- Sem alteração de dados; sem índices (não há consulta por esses campos).

begin;

alter table public.students
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists welcome_email_attempted_at timestamptz;

commit;
