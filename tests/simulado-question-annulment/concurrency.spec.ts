import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Teste REAL de concorrência — execução genuína (Promise.all com interleaving
// controlado), não apenas leitura de código.
//
// Por que uma simulação e não o banco real: lib/server/simuladoQuestionReprocessing.ts
// importa "server-only" (não resolvível fora do bundler do Next em teste
// standalone — mesma limitação já documentada em
// tests/event-representative-attempt); testar contra o Supabase real
// exigiria tocar o projeto de produção (não há banco de teste/homologação
// configurado neste ambiente), o que esta tarefa proíbe explicitamente.
//
// A simulação abaixo reimplementa fielmente — e só — a regra de
// serialização que protege a concorrência real: um UPDATE condicional
// (`.eq("status", valorLido)`) só é aceito pelo Postgres se o valor atual
// da linha, NO MOMENTO DO COMMIT da escrita, ainda for igual ao valor lido;
// duas escritas concorrentes contra a mesma linha são sempre serializadas
// pelo MVCC — a segunda, ao reavaliar o WHERE, não encontra a linha e falha
// com "0 linhas afetadas". O teste "único ponto de escrita..." em
// simulado-question-annulment.spec.ts confirma que o código real usa
// exatamente essa mesma condição (`.eq("status", relation.status)` +
// `.select().maybeSingle()` + rejeição explícita quando `!updated`).

type FakeRow = { status: "active" | "annulled" };

class FakeSimuladoQuestionsTable {
  private row: FakeRow;
  constructor(initialStatus: "active" | "annulled") {
    this.row = { status: initialStatus };
  }
  /** Simula um SELECT fresco — sempre lê o estado JÁ COMMITADO no momento da chamada. */
  async read(): Promise<FakeRow> {
    return { ...this.row };
  }
  /**
   * Simula exatamente `.update({status:newStatus}).eq("status", expectedStatus).select().maybeSingle()`:
   * só aplica se o estado atual (no momento desta chamada, não da leitura
   * anterior) ainda bate com o valor esperado. Retorna `updated:false`
   * quando outra escrita já mudou o valor entre a leitura e esta chamada —
   * a mesma semântica do Postgres MVCC para um UPDATE condicional.
   */
  async conditionalUpdate(newStatus: "active" | "annulled", expectedStatus: "active" | "annulled"): Promise<{ updated: boolean }> {
    if (this.row.status !== expectedStatus) return { updated: false };
    this.row.status = newStatus;
    return { updated: true };
  }
  currentStatus() {
    return this.row.status;
  }
}

/**
 * Réplica fiel, só da parte de decisão/CAS, de setSimuladoQuestionAnnulment
 * (lib/server/simuladoQuestionReprocessing.ts) — mesma ordem de operações:
 * ler → checar "já está nesse estado" → UPDATE condicional pelo valor lido →
 * checar se realmente afetou uma linha.
 */
async function attemptTransition(
  table: FakeSimuladoQuestionsTable,
  targetStatus: "active" | "annulled",
  forceInterleave: () => Promise<void>,
): Promise<{ ok: true } | { ok: false; reason: "already_in_state" | "lost_race" }> {
  const current = await table.read();
  if (current.status === targetStatus) return { ok: false, reason: "already_in_state" };
  // Ponto de interleaving controlado: força as DUAS chamadas concorrentes a
  // já terem lido o estado ANTES de qualquer uma escrever — o pior caso
  // real de corrida (duas requisições HTTP quase simultâneas, cada uma já
  // com sua própria leitura em mãos).
  await forceInterleave();
  const result = await table.conditionalUpdate(targetStatus, current.status);
  if (!result.updated) return { ok: false, reason: "lost_race" };
  return { ok: true };
}

function makeBarrier(count: number) {
  let arrived = 0;
  let resolveAll: () => void;
  const gate = new Promise<void>((resolve) => { resolveAll = resolve; });
  return async () => {
    arrived += 1;
    if (arrived >= count) resolveAll();
    await gate;
  };
}

test.describe("concorrência real — duas requisições simultâneas de anulação/desanulação", () => {
  test("A: duas anulações simultâneas — exatamente uma vence, estado final único, nenhuma dupla aplicação", async () => {
    const table = new FakeSimuladoQuestionsTable("active");
    const barrier = makeBarrier(2);
    const [resultA, resultB] = await Promise.all([
      attemptTransition(table, "annulled", barrier),
      attemptTransition(table, "annulled", barrier),
    ]);
    const outcomes = [resultA, resultB];
    const winners = outcomes.filter((r) => r.ok);
    const losers = outcomes.filter((r) => !r.ok);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect((losers[0] as { reason: string }).reason).toBe("lost_race");
    expect(table.currentStatus()).toBe("annulled");
  });

  test("B: duas desanulações simultâneas — mesma garantia, direção oposta", async () => {
    const table = new FakeSimuladoQuestionsTable("annulled");
    const barrier = makeBarrier(2);
    const [resultA, resultB] = await Promise.all([
      attemptTransition(table, "active", barrier),
      attemptTransition(table, "active", barrier),
    ]);
    const winners = [resultA, resultB].filter((r) => r.ok);
    expect(winners).toHaveLength(1);
    expect(table.currentStatus()).toBe("active");
  });

  test("C: anular × desanular quase simultâneos a partir do mesmo estado lido — resultado determinístico, nunca corrompido", async () => {
    // As duas requisições leem o MESMO snapshot ("annulled"). Uma quer ir
    // para "active" (transição válida), a outra pede "annulled" — que já É
    // o estado lido, logo é rejeitada como no-op ANTES de sequer tentar
    // escrever (não há disputa real possível entre alvos opostos a partir
    // do mesmo snapshot: um dos dois, por definição, já pede o estado
    // atual). Isso é uma propriedade de design, não coincidência — provada
    // aqui por execução real.
    const table = new FakeSimuladoQuestionsTable("annulled");
    // Sem barreira aqui: a chamada que pede "annulled" (já o estado lido)
    // retorna como no-op ANTES de chegar a qualquer ponto de escrita — não
    // há disputa de escrita real para forçar interleaving contra.
    const noInterleave = async () => {};
    const [toActive, toAnnulledAgain] = await Promise.all([
      attemptTransition(table, "active", noInterleave),
      attemptTransition(table, "annulled", noInterleave),
    ]);
    expect(toActive.ok).toBe(true);
    expect(toAnnulledAgain.ok).toBe(false);
    expect((toAnnulledAgain as { reason: string }).reason).toBe("already_in_state");
    expect(table.currentStatus()).toBe("active");
  });

  test("10 execuções repetidas da corrida A não produzem nenhuma vez dois vencedores nem estado inconsistente (determinismo sob repetição)", async () => {
    for (let i = 0; i < 10; i++) {
      const table = new FakeSimuladoQuestionsTable("active");
      const barrier = makeBarrier(2);
      const [a, b] = await Promise.all([
        attemptTransition(table, "annulled", barrier),
        attemptTransition(table, "annulled", barrier),
      ]);
      const winners = [a, b].filter((r) => r.ok);
      expect(winners).toHaveLength(1);
      expect(table.currentStatus()).toBe("annulled");
    }
  });
});

test.describe("correspondência com a implementação real (a simulação acima reflete o código de produção)", () => {
  const ENGINE_PATH = "lib/server/simuladoQuestionReprocessing.ts";
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

  test("o código real usa a mesma condição de CAS e detecta explicitamente '0 linhas afetadas' como corrida perdida", () => {
    const engine = read(ENGINE_PATH);
    expect(engine).toContain('.eq("status", relation.status)');
    expect(engine).toContain('.select("id")');
    expect(engine).toContain("if (!updated) {");
    expect(engine).toContain("Esta questão já foi alterada por outra ação simultânea");
    // A checagem "já está nesse estado" acontece ANTES do UPDATE, na mesma
    // ordem simulada acima (ler → checar no-op → escrever condicional →
    // checar se realmente afetou uma linha).
    const noopCheckIndex = engine.indexOf("if (relation.status === params.targetStatus)");
    const updateIndex = engine.indexOf('.update(updatePayload)');
    const affectedCheckIndex = engine.indexOf("if (!updated) {");
    expect(noopCheckIndex).toBeGreaterThan(-1);
    expect(noopCheckIndex).toBeLessThan(updateIndex);
    expect(updateIndex).toBeLessThan(affectedCheckIndex);
  });

  test("reprocessSimulado só é chamado quando a transição realmente venceu a corrida (depois da checagem de linhas afetadas)", () => {
    const engine = read(ENGINE_PATH);
    // Escopado ao corpo de setSimuladoQuestionAnnulment: reconcileCurrentRevision()
    // (reprocessamento manual de uma revisão já concluída, sem CAS de status)
    // também chama "await reprocessSimulado(supabase, relation.simulado_id,"
    // — um indexOf() global pegaria essa outra ocorrência por engano.
    const setterIndex = engine.indexOf("export async function setSimuladoQuestionAnnulment(");
    const setterBody = engine.slice(setterIndex, engine.indexOf("export async function reprocessAfterAnswerKeyChange("));
    const affectedCheckIndex = setterBody.indexOf("if (!updated) {");
    const reprocessCallIndex = setterBody.indexOf("await reprocessSimulado(supabase, relation.simulado_id,");
    expect(affectedCheckIndex).toBeGreaterThan(-1);
    expect(reprocessCallIndex).toBeGreaterThan(affectedCheckIndex);
  });
});
