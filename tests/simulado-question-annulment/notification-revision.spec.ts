import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Teste REAL de execução (não só leitura de código) da chave de idempotência
// da notificação de reconciliação: (student_id, type, reference_id,
// revision_id). Mesma limitação de "server-only" documentada em
// concurrency.spec.ts — lib/server/simuladoQuestionReprocessing.ts não é
// importável num teste standalone, então a simulação abaixo reimplementa
// fielmente — e só — a semântica de `.upsert(row, { onConflict:
// "student_id,type,reference_id,revision_id" })` sobre o índice único real
// (supabase/migrations/20260907140000_notification_revision_identity.sql):
// mesma chave completa → UPDATE da linha existente; qualquer coluna da
// chave diferente → INSERT de uma linha nova. A correspondência com o
// código real (mesma string de onConflict, revision_id vindo de
// context.revisionId) é conferida em simulado-question-annulment.spec.ts.

type NotificationRow = {
  student_id: string;
  type: string;
  reference_id: string;
  revision_id: string;
  read_at: string | null;
  dismissed_at: string | null;
  metadata: Record<string, unknown>;
};

class FakeStudentNotificationsTable {
  rows: NotificationRow[] = [];

  /** Espelha exatamente `.upsert(row, { onConflict: "student_id,type,reference_id,revision_id" })`. */
  upsert(row: NotificationRow): { inserted: boolean } {
    const index = this.rows.findIndex(
      (existing) =>
        existing.student_id === row.student_id &&
        existing.type === row.type &&
        existing.reference_id === row.reference_id &&
        existing.revision_id === row.revision_id,
    );
    if (index >= 0) {
      this.rows[index] = { ...row };
      return { inserted: false };
    }
    this.rows.push({ ...row });
    return { inserted: true };
  }

  countFor(studentId: string, referenceId: string): number {
    return this.rows.filter((r) => r.student_id === studentId && r.reference_id === referenceId).length;
  }
}

function baseNotification(overrides: Partial<NotificationRow>): NotificationRow {
  return {
    student_id: "student-1",
    type: "question_annulled_result_changed",
    reference_id: "attempt-1",
    revision_id: "00000000-0000-0000-0000-000000000000",
    read_at: null,
    dismissed_at: null,
    metadata: {},
    ...overrides,
  };
}

test.describe("chave de idempotência da notificação de reconciliação (execução real)", () => {
  test("A: mesma revisão reprocessada 2x (retry) → 1 notificação, não duplica", () => {
    const table = new FakeStudentNotificationsTable();
    const revisionId = "revision-annul-x";
    const first = table.upsert(baseNotification({ revision_id: revisionId }));
    const second = table.upsert(baseNotification({ revision_id: revisionId, metadata: { retry: true } }));
    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
    expect(table.countFor("student-1", "attempt-1")).toBe(1);
  });

  test("B: anulação gera 1 aviso; desanulação depois gera um NOVO aviso distinto (type e revision diferentes)", () => {
    const table = new FakeStudentNotificationsTable();
    table.upsert(baseNotification({ type: "question_annulled_result_changed", revision_id: "revision-annul" }));
    const restoreResult = table.upsert(
      baseNotification({ type: "question_reactivated_result_changed", revision_id: "revision-restore" }),
    );
    expect(restoreResult.inserted).toBe(true);
    expect(table.countFor("student-1", "attempt-1")).toBe(2);
  });

  test("C: anulação da questão X + anulação da questão Y (mesmo type, revisões diferentes) → 2 notificações distintas — o gap original", () => {
    // Antes da correção, reference_id (attempt.id) + type eram a chave
    // inteira: anular X e depois anular Y no MESMO Simulado/tentativa
    // colidiam no mesmo par (student_id, type, reference_id) e a segunda
    // sobrescrevia a primeira silenciosamente — só 1 notificação para 2
    // eventos reais. revision_id resolve isso.
    const table = new FakeStudentNotificationsTable();
    const annulX = table.upsert(baseNotification({ revision_id: "revision-question-x" }));
    const annulY = table.upsert(baseNotification({ revision_id: "revision-question-y" }));
    expect(annulX.inserted).toBe(true);
    expect(annulY.inserted).toBe(true);
    expect(table.countFor("student-1", "attempt-1")).toBe(2);
  });

  test("D: gabarito alterado depois da anulação → novo aviso (type e revision diferentes dos anteriores)", () => {
    const table = new FakeStudentNotificationsTable();
    table.upsert(baseNotification({ type: "question_annulled_result_changed", revision_id: "revision-annul" }));
    const answerKeyResult = table.upsert(
      baseNotification({ type: "answer_key_changed_result_changed", revision_id: "revision-answer-key" }),
    );
    expect(answerKeyResult.inserted).toBe(true);
    expect(table.countFor("student-1", "attempt-1")).toBe(2);
  });

  test("E: retry após falha parcial (reprocessSimulado interrompido no meio, reexecutado com a mesma revisionId) não duplica notificação", () => {
    const table = new FakeStudentNotificationsTable();
    const revisionId = "revision-annul-x";
    // 1ª tentativa: processa o aluno 1 com sucesso, "cai" antes de processar o aluno 2.
    table.upsert(baseNotification({ student_id: "student-1", revision_id: revisionId }));
    // Retry de reprocessSimulado: relê simulado_questions.status_revision_id
    // (inalterado desde a 1ª tentativa) e reprocessa os dois alunos de novo.
    const retryStudent1 = table.upsert(baseNotification({ student_id: "student-1", revision_id: revisionId }));
    const retryStudent2 = table.upsert(baseNotification({ student_id: "student-2", reference_id: "attempt-2", revision_id: revisionId }));
    expect(retryStudent1.inserted).toBe(false); // já existia — não duplica
    expect(retryStudent2.inserted).toBe(true); // faltava — processado agora
    expect(table.countFor("student-1", "attempt-1")).toBe(1);
    expect(table.countFor("student-2", "attempt-2")).toBe(1);
  });

  test("revision_id sentinela (evento sem conceito de revisão, ex.: event_result_released) preserva a idempotência anterior por (student_id, type, reference_id)", () => {
    const table = new FakeStudentNotificationsTable();
    const SENTINEL = "00000000-0000-0000-0000-000000000000";
    const first = table.upsert(
      baseNotification({ type: "event_result_released", reference_id: "participant-1", revision_id: SENTINEL }),
    );
    const second = table.upsert(
      baseNotification({ type: "event_result_released", reference_id: "participant-1", revision_id: SENTINEL }),
    );
    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
    expect(table.countFor("student-1", "participant-1")).toBe(1);
  });
});

test.describe("correspondência com a implementação real", () => {
  const root = process.cwd();
  const read = (path: string) => readFileSync(resolve(root, path), "utf8");
  const ENGINE = "lib/server/simuladoQuestionReprocessing.ts";
  const EVENTS_LIB = "lib/server/simuladoEvents.ts";
  const MIGRATION = "supabase/migrations/20260907140000_notification_revision_identity.sql";

  test("a migration cria revision_id NOT NULL com sentinela e o índice único de 4 colunas usado pelo motor", () => {
    const migration = read(MIGRATION);
    expect(migration).toContain("add column if not exists revision_id uuid not null default '00000000-0000-0000-0000-000000000000'::uuid");
    expect(migration).toContain("(student_id, type, reference_id, revision_id)");
    expect(migration).toContain("add column if not exists status_revision_id uuid");
    expect(migration).toContain("add column if not exists answer_key_revision_id uuid");
  });

  test("o motor real usa a mesma chave de 4 colunas simulada acima", () => {
    const engine = read(ENGINE);
    expect(engine).toContain('onConflict: "student_id,type,reference_id,revision_id"');
    expect(engine).toContain("revision_id: context.revisionId,");
  });

  test("event_result_released (simuladoEvents.ts) foi atualizado para a nova chave e continua sem passar revision_id — usa a sentinela do banco, comportamento antigo preservado", () => {
    const eventsLib = read(EVENTS_LIB);
    expect(eventsLib).toContain('onConflict: "student_id,type,reference_id,revision_id"');
    expect(eventsLib).not.toContain("revision_id:");
  });
});
