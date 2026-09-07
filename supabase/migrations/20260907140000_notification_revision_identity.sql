-- ============================================================
-- 20260907140000_notification_revision_identity.sql
-- Dá identidade estável de "revisão" a cada evento de reprocessamento
-- (anulação, desanulação, mudança de gabarito), para que a notificação do
-- aluno em student_notifications distinga retry (mesma revisão → não
-- duplica) de uma revisão futura distinta (nova revisão → novo aviso),
-- mesmo quando o `type` é o mesmo (ex.: anular questão X depois anular
-- questão Y no mesmo Simulado/tentativa).
--
-- status_revision_id/answer_key_revision_id são gerados pela aplicação
-- (lib/server/simuladoQuestionReprocessing.ts) só no momento exato da
-- transição real (CAS de simulado_questions.status, ou mudança real de
-- questions.correct_alternative_label) — nunca um timestamp gerado a cada
-- tentativa de reprocessamento. Um retry do mesmo evento relê o mesmo
-- valor já persistido; só uma transição/mudança nova gera um valor novo.
-- ============================================================

begin;

alter table public.simulado_questions
  add column if not exists status_revision_id uuid;

alter table public.questions
  add column if not exists answer_key_revision_id uuid;

comment on column public.simulado_questions.status_revision_id is
  'Identidade estável da última transição de status (anular/desanular) deste vínculo. Gerado uma vez por transição bem-sucedida (compare-and-swap em setSimuladoQuestionAnnulment); reaproveitado, nunca regenerado, se essa mesma transição precisar ser reprocessada de novo.';

comment on column public.questions.answer_key_revision_id is
  'Identidade estável da última mudança real de correct_alternative_label. Gerado uma vez por mudança de gabarito que efetivamente propaga (reprocessAfterAnswerKeyChange); não muda em reprocessamentos que não alteram o gabarito.';

-- student_notifications.revision_id: NOT NULL com sentinela (UUID zero) para
-- que tipos sem conceito de revisão (event_result_released) preservem
-- exatamente o comportamento de unicidade anterior — se fosse nullable, duas
-- linhas com revision_id NULL nunca colidiriam entre si no índice único
-- (semântica padrão do Postgres para NULL em UNIQUE), quebrando a
-- idempotência já existente desse tipo.
alter table public.student_notifications
  add column if not exists revision_id uuid not null default '00000000-0000-0000-0000-000000000000'::uuid;

comment on column public.student_notifications.revision_id is
  'Identidade da revisão/evento que gerou esta notificação (simulado_questions.status_revision_id ou questions.answer_key_revision_id). Tipos sem conceito de revisão (event_result_released) usam o valor padrão (UUID zero) — retrocompatível com o índice único anterior de 3 colunas.';

drop index if exists public.unique_student_notifications_reference;

create unique index if not exists unique_student_notifications_reference
  on public.student_notifications (student_id, type, reference_id, revision_id);

commit;
