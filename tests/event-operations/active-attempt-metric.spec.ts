import { isActiveEventAttempt } from "@/lib/eventQuestionStats";
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Correção cirúrgica (2026-09-10) do card "Realizando" (Visão geral do
// Evento, painel do Professor): antes contava `representativeAttemptIds`
// (tentativas representativas) com status "in_progress" — mas, por
// invariante arquitetural, representative_attempt_id só deveria apontar
// para tentativas completed (lib/server/simuladoEvents.ts,
// consolidateEventRepresentativeAttempt); um in_progress ali é sempre dado
// histórico/legado inconsistente (mesma classe de corrupção já encontrada
// e tratada nos Insights). Por isso "Realizando: 3" aparecia mesmo com
// "Online agora: 0" — os 3 eram tentativas in_progress abandonadas há dias,
// indevidamente registradas como representativas.
//
// Correção: "Realizando" agora usa `attempts` (todas as tentativas do
// Evento, já carregadas — zero query nova) filtradas por
// status === "in_progress" E `last_activity_at` dentro de uma janela de 10
// minutos, deduplicadas por aluno. `last_activity_at` é atualizado em toda
// interação real da tentativa (resposta salva, violação de foco, evento de
// inatividade ≥60s) — nunca por um heartbeat genérico de presença
// (mecanismo separado, `user_sessions`, que alimenta "Online agora").

const root = process.cwd();
const API_ROUTE = "app/api/professor/events/[id]/route.ts";
const PANEL = "app/professor/eventos/[id]/page-client.tsx";
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");



// Réplica FIEL da expressão usada em route.ts (conferida estruturalmente no
// bloco 5 abaixo) — só para alimentar cenários com execução real.
function computeActiveAttemptParticipantIds(
  attempts: { status: string; student_id: string; last_activity_at: string | null; started_at: string | null }[],
  nowMs: number,
): Set<string> {
  return new Set(
    attempts
      .filter((attempt) => isActiveEventAttempt(attempt, nowMs))
      .map((attempt) => attempt.student_id),
  );
}

const NOW = Date.parse("2026-09-10T12:00:00.000Z");
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

test.describe("1. Cenário do pedido — A ativo entra, B parado não entra, C completed não entra, D disqualified não entra", () => {
  test("execução real do filtro com os 4 participantes exatos do pedido", () => {
    const attempts = [
      { status: "in_progress", student_id: "A", last_activity_at: minutesAgo(1), started_at: minutesAgo(20) }, // atividade recente
      { status: "in_progress", student_id: "B", last_activity_at: minutesAgo(180), started_at: minutesAgo(200) }, // parado há 3h
      { status: "completed", student_id: "C", last_activity_at: minutesAgo(1), started_at: minutesAgo(30) },
      { status: "disqualified", student_id: "D", last_activity_at: minutesAgo(1), started_at: minutesAgo(30) },
    ];
    const active = computeActiveAttemptParticipantIds(attempts, NOW);
    expect(active.has("A")).toBe(true);
    expect(active.has("B")).toBe(false);
    expect(active.has("C")).toBe(false);
    expect(active.has("D")).toBe(false);
    expect(active.size).toBe(1);
  });
});

test.describe("2. Online ≠ Realizando — métricas independentes", () => {
  test("2 online + 3 tentativas ativas → Online=2, Realizando=3 (nenhuma métrica força a outra)", () => {
    const onlineStudentIds = new Set(["S1", "S2"]); // presença — mecanismo separado (user_sessions)
    const attempts = [
      { status: "in_progress", student_id: "S1", last_activity_at: minutesAgo(1), started_at: minutesAgo(10) },
      { status: "in_progress", student_id: "S2", last_activity_at: minutesAgo(1), started_at: minutesAgo(10) },
      { status: "in_progress", student_id: "S3", last_activity_at: minutesAgo(2), started_at: minutesAgo(10) }, // ativo mas offline no momento
    ];
    const active = computeActiveAttemptParticipantIds(attempts, NOW);
    expect(onlineStudentIds.size).toBe(2);
    expect(active.size).toBe(3);
    expect(active.has("S3")).toBe(true); // legítimo: tentativa ativa mesmo sem presença "online" agora
  });

  test("cenário do pedido — Online=0, Realizando=3 por horas/dias após abandono NÃO deve permanecer indefinidamente", () => {
    const attempts = [
      { status: "in_progress", student_id: "X1", last_activity_at: minutesAgo(60 * 24), started_at: minutesAgo(60 * 24) }, // 1 dia atrás
      { status: "in_progress", student_id: "X2", last_activity_at: minutesAgo(60 * 48), started_at: minutesAgo(60 * 48) }, // 2 dias atrás
      { status: "in_progress", student_id: "X3", last_activity_at: minutesAgo(300), started_at: minutesAgo(300) }, // 5h atrás
    ];
    const active = computeActiveAttemptParticipantIds(attempts, NOW);
    expect(active.size).toBe(0); // nenhuma das 3 conta — exatamente o bug relatado, corrigido
  });
});

test.describe("3. Tentativa órfã (in_progress, última atividade muito antiga)", () => {
  test("in_progress com last_activity_at de dias atrás não aparece como Realizando", () => {
    const attempts = [{ status: "in_progress", student_id: "ORFA", last_activity_at: minutesAgo(60 * 24 * 5), started_at: minutesAgo(60 * 24 * 5) }];
    expect(computeActiveAttemptParticipantIds(attempts, NOW).size).toBe(0);
  });

  test("limite exato da janela: 10min01s atrás não conta, 9min59s atrás conta", () => {
    const juntoDoLimite = [{ status: "in_progress", student_id: "P", last_activity_at: new Date(NOW - (10 * 60_000 + 1000)).toISOString(), started_at: minutesAgo(20) }];
    const dentroDoLimite = [{ status: "in_progress", student_id: "P", last_activity_at: new Date(NOW - (10 * 60_000 - 1000)).toISOString(), started_at: minutesAgo(20) }];
    expect(computeActiveAttemptParticipantIds(juntoDoLimite, NOW).size).toBe(0);
    expect(computeActiveAttemptParticipantIds(dentroDoLimite, NOW).size).toBe(1);
  });
});

test.describe("4. Retomada — tentativa parada volta a contar assim que há atividade real de novo", () => {
  test("mesma tentativa: antes da retomada (stale) não conta; depois de uma interação real (last_activity_at atualizado) volta a contar", () => {
    const staleAttempt = [{ status: "in_progress", student_id: "RESUMIDOR", last_activity_at: minutesAgo(120), started_at: minutesAgo(180) }];
    expect(computeActiveAttemptParticipantIds(staleAttempt, NOW).size).toBe(0);

    const afterResume = [{ status: "in_progress", student_id: "RESUMIDOR", last_activity_at: minutesAgo(0.5), started_at: minutesAgo(180) }]; // respondeu uma questão ao retomar
    expect(computeActiveAttemptParticipantIds(afterResume, NOW).size).toBe(1);
    expect(computeActiveAttemptParticipantIds(afterResume, NOW).has("RESUMIDOR")).toBe(true);
  });
});

test.describe("5. Duplicidade — participante nunca conta duas vezes", () => {
  test("duas linhas in_progress ativas para o mesmo student_id (inconsistência histórica hipotética) → conta 1, não 2", () => {
    const attempts = [
      { status: "in_progress", student_id: "DUP", last_activity_at: minutesAgo(1), started_at: minutesAgo(10) },
      { status: "in_progress", student_id: "DUP", last_activity_at: minutesAgo(2), started_at: minutesAgo(15) },
    ];
    const active = computeActiveAttemptParticipantIds(attempts, NOW);
    expect(active.size).toBe(1);
  });
});

test.describe("6. Estrutural — route.ts implementa exatamente esta regra", () => {
  test("taking usa activeAttemptParticipantIds.size, não mais representativeAttemptIds filtrado por in_progress", () => {
    const route = read(API_ROUTE);
    expect(route).toContain("taking: activeAttemptParticipantIds.size,");
    expect(route).not.toContain('taking: representativeAttemptIds.filter((attemptId) => attemptsById.get(attemptId)?.status === "in_progress").length,');
  });

  test("activeAttemptParticipantIds é derivado de `attempts` (todas as tentativas do Evento), não de representativeAttemptIds", () => {
    const route = read(API_ROUTE).replace(/\r\n/g, "\n");
    const index = route.indexOf("const activeAttemptParticipantIds = new Set(");
    expect(index).toBeGreaterThan(-1);
    const block = route.slice(index, index + 300);
    expect(block).toContain('attempts\n      .filter((attempt) => isActiveEventAttempt(attempt, activityNow))');
    expect(block).not.toContain("representativeAttemptIds");
  });

  test("janela de atividade é de 10 minutos, documentada em constante nomeada (não um número mágico solto)", () => {
    const route = read(API_ROUTE);
    expect(read("lib/eventQuestionStats.ts")).toContain("const ACTIVE_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;");
    expect(route).toContain("const activityNow = Date.now();");
  });

  test("last_activity_at foi adicionado ao select existente de simulado_attempts — nenhuma query nova (mesma contagem de .from(): 9)", () => {
    const route = read(API_ROUTE);
    expect(route).toMatch(/simulado_attempts"\)\.select\("[^"]*last_activity_at[^"]*"\)/);
    const fromCount = (route.match(/supabase\.from\(/g) || []).length;
    expect(fromCount).toBe(9);
  });

  test("desempate/dedup por student_id (Set) — nunca dois attempt_id do mesmo aluno contam duas vezes", () => {
    const route = read(API_ROUTE);
    const index = route.indexOf("const activeAttemptParticipantIds = new Set(");
    const block = route.slice(index, index + 300);
    expect(block).toContain(".map((attempt) => attempt.student_id),");
  });

  test("regra de acesso 60s de inatividade (anti-cheat) não foi reaproveitada sem distinção — comentário explica a diferença de semântica", () => {
    const route = read(API_ROUTE);
    const commentIndex = route.indexOf("// \"Realizando\" (Visão geral)");
    expect(commentIndex).toBeGreaterThan(-1);
    const comment = route.slice(commentIndex, route.indexOf("const ACTIVE_ATTEMPT_WINDOW_MS", commentIndex));
    expect(comment).toContain("60s");
    expect(comment).toMatch(/sinaliza|semântica diferente|comportamental/);
  });
});

test.describe("7. Estrutural — 'Online agora' preservado sem alteração", () => {
  test("online: onlineStudentIds.size continua exatamente como antes", () => {
    const route = read(API_ROUTE);
    expect(route).toContain("online: onlineStudentIds.size,");
    expect(route).toContain('const onlineCutoff = new Date(Date.now() - 90_000).toISOString();');
  });
});

test.describe("8. Estrutural — Insights, ranking, scoring, PDF, representative_attempt e Modo Aula (questionStats) intocados por esta correção", () => {
  test("lib/eventInsights.ts, lib/eventRanking.ts, lib/simuladoScoring.ts não referenciam a nova métrica/constante", () => {
    expect(read("lib/eventInsights.ts")).not.toContain("ACTIVE_ATTEMPT_WINDOW_MS");
    expect(read("lib/eventRanking.ts")).not.toContain("ACTIVE_ATTEMPT_WINDOW_MS");
    expect(read("lib/simuladoScoring.ts")).not.toContain("ACTIVE_ATTEMPT_WINDOW_MS");
  });

  test("completedRepresentativeAttemptIds (Insights) e completedQuestionStats permanecem exatamente como na correção anterior — não tocados", () => {
    const route = read(API_ROUTE);
    expect(route).toContain('const completedRepresentativeAttemptIds = new Set(');
    expect(route).toContain("const completedQuestionStats = questions.map((relation) => {");
  });

  test("questionStats (Modo Aula) preserva a mesma expressão de blank/correct/wrong de antes — esta correção não tocou o cálculo ao vivo", () => {
    const route = read(API_ROUTE);
    expect(route).toContain("const questionStats = questions.map((relation) => {");
    expect(route).toContain("const rows = operationalAnswers.filter((answer) => answer.simulado_question_id === relation.id);");
  });

  test("representative_attempt_id: único ponto de escrita continua em lib/server/simuladoEvents.ts — esta correção não escreve no banco", () => {
    const source = read("lib/server/simuladoEvents.ts");
    expect(source).toContain(".update({ representative_attempt_id: attemptId })");
    const route = read(API_ROUTE);
    expect(route).not.toMatch(/\.update\(\s*\{[^}]*representative_attempt_id/);
    expect(route).not.toMatch(/\.update\(\s*\{[^}]*status:\s*["']expired["']/);
    expect(route).not.toMatch(/\.update\(\s*\{[^}]*status:\s*["']abandoned["']/);
  });
});

test.describe("9. Estrutural — polling (AbortController) preservado, sem reintroduzir race", () => {
  test("load() no painel continua com AbortController intacto após esta correção", () => {
    const panel = read(PANEL);
    expect(panel).toContain("const loadAbortRef = useRef<AbortController | null>(null);");
    expect(panel).toContain("loadAbortRef.current?.abort();");
    expect(panel).toContain("if (loadAbortRef.current !== controller) return;");
  });
});

test.describe("10. UI — rótulo preservado, tooltip curto opcional adicionado", () => {
  test("rótulo continua 'Realizando'; tooltip explica 'atividade recente' sem poluir a UI", () => {
    const panel = read(PANEL);
    expect(panel).toContain('label="Realizando"');
    expect(panel).toContain('title="Tentativas em andamento com atividade recente"');
  });

  test("CompactMetric aceita title opcional sem quebrar os demais 7+ usos existentes (prop opcional, retrocompatível)", () => {
    const panel = read(PANEL);
    const defIndex = panel.indexOf("function CompactMetric(");
    const defBlock = panel.slice(defIndex, defIndex + 400);
    expect(defBlock).toContain("title?: string");
    // Nenhum outro uso de CompactMetric foi obrigado a passar title.
    const usageCount = (panel.match(/<CompactMetric /g) || []).length;
    const titleUsageCount = (panel.match(/<CompactMetric[^/]*title=/g) || []).length;
    expect(usageCount).toBeGreaterThan(titleUsageCount);
  });
});
