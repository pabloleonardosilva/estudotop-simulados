import { expect, test } from "@playwright/test";
import { rankedParticipants, type RankableParticipant } from "@/lib/eventRanking";

// Teste real (execução, não leitura de código) da reordenação de ranking
// causada por anulação/desanulação de questão. rankedParticipants() é a
// mesma função usada por app/professor/eventos/[id]/page-client.tsx —
// extraída para lib/eventRanking.ts (lógica idêntica, só movida) para
// poder ser executada diretamente aqui.
//
// Critério real do sistema (auditado em código antes de extrair): acertos
// decrescentes → tempo total crescente → nome (pt-BR) → ranking
// competitivo (1º, 2º, 2º, 4º) quando há empate exato em acertos+tempo.

function participant(id: string, name: string, correct_count: number, time_spent_ms: number): RankableParticipant {
  return { id, name, result: { correct_count, time_spent_ms } };
}

test.describe("ranking do Professor reflete anulação/desanulação (ponto 4)", () => {
  test("cenário do pedido: aluno A=8, aluno B=7 → questão anulada eleva B para 8 → ranking reordena; desanular reverte", () => {
    const before = [
      participant("A", "Ana", 8, 100_000),
      participant("B", "Beatriz", 7, 90_000),
    ];
    const rankedBefore = rankedParticipants(before);
    const aBefore = rankedBefore.find((p) => p.id === "A")!;
    const bBefore = rankedBefore.find((p) => p.id === "B")!;
    expect(aBefore.rank).toBe(1);
    expect(bBefore.rank).toBe(2);
    expect(aBefore.rank_tied).toBe(false);
    expect(bBefore.rank_tied).toBe(false);

    // Anulação de uma questão que B errava eleva correct_count de B para 8
    // (mesmo efeito de uma tentativa reprocessada) — tempo não muda (a
    // anulação não altera resposta nem tempo de resposta).
    const afterAnnul = [
      participant("A", "Ana", 8, 100_000),
      participant("B", "Beatriz", 8, 90_000),
    ];
    const rankedAfterAnnul = rankedParticipants(afterAnnul);
    const aAfter = rankedAfterAnnul.find((p) => p.id === "A")!;
    const bAfter = rankedAfterAnnul.find((p) => p.id === "B")!;
    // Empate em acertos (8=8); desempate real é por tempo crescente — B tem
    // menos tempo (90.000 < 100.000), então B assume o 1º lugar sozinho.
    expect(bAfter.rank).toBe(1);
    expect(aAfter.rank).toBe(2);
    expect(bAfter.rank_tied).toBe(false);
    expect(aAfter.rank_tied).toBe(false);

    // Desanulação reverte B para 7 acertos — ranking volta ao estado original.
    const afterDeannul = rankedParticipants(before);
    expect(afterDeannul.find((p) => p.id === "A")!.rank).toBe(1);
    expect(afterDeannul.find((p) => p.id === "B")!.rank).toBe(2);
  });

  test("desempate real: mesmo acertos e mesmo tempo → ranking competitivo (1º, 1º, 3º), rank_tied=true para ambos", () => {
    const participants = [
      participant("A", "Ana", 8, 100_000),
      participant("B", "Bruno", 8, 100_000),
      participant("C", "Carla", 6, 50_000),
    ];
    const ranked = rankedParticipants(participants);
    const a = ranked.find((p) => p.id === "A")!;
    const b = ranked.find((p) => p.id === "B")!;
    const c = ranked.find((p) => p.id === "C")!;
    expect(a.rank).toBe(1);
    expect(b.rank).toBe(1);
    expect(a.rank_tied).toBe(true);
    expect(b.rank_tied).toBe(true);
    expect(c.rank).toBe(3); // ranking competitivo: pula o 2º, não vira "2º" para C
    expect(c.rank_tied).toBe(false);
    // Desempate final de exibição entre empatados reais: ordem alfabética (pt-BR).
    expect(ranked.findIndex((p) => p.id === "A")).toBeLessThan(ranked.findIndex((p) => p.id === "B"));
  });

  test("empate em acertos mas tempos diferentes não é tratado como empate — tempo crescente desempata de verdade", () => {
    const participants = [participant("A", "Ana", 5, 200_000), participant("B", "Bruno", 5, 100_000)];
    const ranked = rankedParticipants(participants);
    expect(ranked.find((p) => p.id === "B")!.rank).toBe(1);
    expect(ranked.find((p) => p.id === "A")!.rank).toBe(2);
    expect(ranked.find((p) => p.id === "B")!.rank_tied).toBe(false);
  });

  test("participante sem resultado (result: null) não recebe rank e não quebra o ranking dos demais", () => {
    const participants = [participant("A", "Ana", 8, 100_000), { id: "B", name: "Bruno", result: null }];
    const ranked = rankedParticipants(participants);
    expect(ranked.find((p) => p.id === "A")!.rank).toBe(1);
    expect(ranked.find((p) => p.id === "B")!.rank).toBeNull();
  });

  test("chamar rankedParticipants duas vezes com os mesmos dados produz o mesmo resultado (determinístico/idempotente)", () => {
    const participants = [participant("A", "Ana", 8, 100_000), participant("B", "Beatriz", 8, 90_000), participant("C", "Carla", 6, 50_000)];
    const first = rankedParticipants(participants);
    const second = rankedParticipants(participants);
    expect(second).toEqual(first);
  });
});
