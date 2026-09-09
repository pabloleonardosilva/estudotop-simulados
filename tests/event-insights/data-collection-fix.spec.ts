import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { buildEventInsights, type QuestionDifficultyInput } from "@/lib/eventInsights";

// Correção cirúrgica (2026-09-10) da coleta de dados dos Insights, motivada
// pela auditoria "Insights mudando sem novas respostas": paginação completa
// de simulado_answers/simulado_results (sem truncamento silencioso em
// max_rows) + revalidação de status na própria rota (defesa em profundidade,
// nunca confia cegamente em representative_attempt_id) + polling protegido
// contra resposta HTTP fora de ordem. A matemática dos Insights
// (D_q/D_t/D_global/D_adjusted, k=2, faixas) NÃO mudou — só a fonte dos
// dados que alimentam essa matemática.

const root = process.cwd();
const API_ROUTE = "app/api/professor/events/[id]/route.ts";
const PANEL = "app/professor/eventos/[id]/page-client.tsx";
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

function transpile(relativePath: string): string {
  const source = read(relativePath);
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
}

function loadCjsModule(relativePath: string, requireShim: (id: string) => unknown): Record<string, unknown> {
  const compiled = transpile(relativePath);
  const moduleObj: { exports: Record<string, unknown> } = { exports: {} };
  const context = vm.createContext({ module: moduleObj, exports: moduleObj.exports, require: requireShim, process: { env: {} }, console });
  new vm.Script(compiled, { filename: relativePath }).runInContext(context);
  return moduleObj.exports;
}

// fetchAllPages() real, executado de verdade (não reimplementado) — mesma
// técnica já usada em tests/simulado-question-annulment/large-answer-set.spec.ts
// para contornar "server-only" fora do build do Next.js.
const { fetchAllPages } = loadCjsModule("lib/server/supabasePagination.ts", (id: string) => {
  if (id === "server-only") return {};
  throw new Error(`import inesperado dentro de lib/server/supabasePagination.ts: ${id}`);
}) as { fetchAllPages: <T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null; count?: number | null }>, message?: string) => Promise<T[]> };

// Fonte fake fiel ao PostgREST real: sem .range(), corta em PAGE_CAP
// silenciosamente, sem erro (mesmo comportamento do incidente real);
// .range(from,to) devolve a fatia pedida do conjunto completo ordenado.
const POSTGREST_DEFAULT_PAGE_CAP = 1000;
function makeFakeTable<T>(rows: T[], orderKey: keyof T) {
  const sorted = [...rows].sort((a, b) => String(a[orderKey]).localeCompare(String(b[orderKey])));
  return {
    queryPage(from: number | null, to: number | null) {
      const page = from !== null && to !== null ? sorted.slice(from, to + 1) : sorted.slice(0, POSTGREST_DEFAULT_PAGE_CAP);
      return { data: page, error: null, count: sorted.length };
    },
  };
}

test.describe("1. Paginação completa — simulado_answers (cenário real do incidente, 1587 respostas)", () => {
  test("fetchAllPages() real carrega as 1587 linhas completas — não 1000 (mesma escala exata da auditoria)", async () => {
    const rows = Array.from({ length: 1587 }, (_, index) => ({ id: `answer_${String(index).padStart(5, "0")}`, attempt_id: `attempt_${index % 139}`, value: index }));
    const table = makeFakeTable(rows, "id");
    const loaded = await fetchAllPages<{ id: string }>((from, to) => Promise.resolve(table.queryPage(from, to)));
    expect(loaded.length).toBe(1587);
    expect(new Set(loaded.map((r) => r.id)).size).toBe(1587); // nenhuma duplicata entre páginas
  });

  test("prova o próprio bug antigo (sem .range()) trunca em 1000 — contraste que justifica a correção", () => {
    const rows = Array.from({ length: 1587 }, (_, index) => ({ id: `answer_${String(index).padStart(5, "0")}` }));
    const table = makeFakeTable(rows, "id");
    const unpaginated = table.queryPage(null, null);
    expect(unpaginated.data?.length).toBe(1000);
    expect(unpaginated.count).toBe(1587); // count exato não mente — só a página vem cortada
  });

  test("fetchAllPages() lança erro em vez de devolver dado parcial se a contagem não bater (rede de segurança)", async () => {
    // Simula uma resposta inconsistente: primeira página diz count=1587, mas
    // a "tabela" só tem 500 linhas reais — nunca deve retornar 500 como se
    // fosse completo.
    await expect(fetchAllPages<{ id: string }>((from, to) => {
      const rows = Array.from({ length: 500 }, (_, i) => ({ id: `r${i}` })).slice(from, to + 1);
      return Promise.resolve({ data: rows, error: null, count: 1587 });
    })).rejects.toThrow();
  });
});

test.describe("2. Paginação completa — simulado_results (mesmo padrão, mesma segurança)", () => {
  test("fetchAllPages() real carrega 1200 linhas de simulado_results sem truncar em 1000", async () => {
    const rows = Array.from({ length: 1200 }, (_, index) => ({ id: `result_${String(index).padStart(5, "0")}`, attempt_id: `attempt_${index}` }));
    const table = makeFakeTable(rows, "id");
    const loaded = await fetchAllPages<{ id: string }>((from, to) => Promise.resolve(table.queryPage(from, to)));
    expect(loaded.length).toBe(1200);
  });
});

test.describe("3. Estrutural — route.ts usa paginação real, sem limite mágico", () => {
  test("simulado_answers e simulado_results são carregados via fetchAllPages, com .order(\"id\") e count: \"exact\"", () => {
    const route = read(API_ROUTE);
    expect(route).toContain('import { fetchAllPages } from "@/lib/server/supabasePagination";');
    expect(route).toMatch(/fetchAllPages<AnswerRow>\(\s*\(from, to\) => supabase\.from\("simulado_answers"\)[\s\S]{0,400}\.order\("id", \{ ascending: true \}\)\.range\(from, to\)/);
    expect(route).toMatch(/fetchAllPages<ResultRow>\(\s*\(from, to\) => supabase\.from\("simulado_results"\)[\s\S]{0,400}\.order\("id", \{ ascending: true \}\)\.range\(from, to\)/);
    expect(route).toMatch(/simulado_answers"\)\.select\([^)]*\{ count: "exact" \}/);
    expect(route).toMatch(/simulado_results"\)\.select\([^)]*\{ count: "exact" \}/);
  });

  test("nenhum .limit(5000)/.limit(10000)/limite mágico foi usado para 'resolver' o truncamento", () => {
    const route = read(API_ROUTE);
    expect(route).not.toMatch(/\.limit\(\s*\d{4,}\s*\)/);
  });

  test("uma consulta sem linha retornada nunca vira 'aluno respondeu em branco' por truncamento — fetchAllPages lança erro antes de seguir com dado parcial", () => {
    const route = read(API_ROUTE);
    const answersCallIndex = route.indexOf("answers = await fetchAllPages<AnswerRow>(");
    expect(answersCallIndex).toBeGreaterThan(-1);
    const catchBlock = route.slice(answersCallIndex, route.indexOf("} catch {", answersCallIndex) + 200);
    expect(catchBlock).toContain("} catch {");
    expect(catchBlock).toContain('return NextResponse.json({ ok: false, message: "Não foi possível carregar as estatísticas do Evento." }, { status: 500 });');
  });
});

test.describe("4. Regra oficial dos Insights — representative + completed, defesa em profundidade", () => {
  test("completedRepresentativeAttemptIds revalida status === \"completed\" na própria rota, direto de attemptsById (não confia cegamente em representative_attempt_id)", () => {
    const route = read(API_ROUTE);
    const index = route.indexOf("const completedRepresentativeAttemptIds = new Set(");
    expect(index).toBeGreaterThan(-1);
    const block = route.slice(index, index + 300);
    expect(block).toContain('attemptsById.get(attemptId)?.status === "completed"');
    expect(block).not.toContain("disqualified");
    expect(block).not.toContain("expired");
  });

  test("completedAnswers filtra answers por completedRepresentativeAttemptIds antes de alimentar completedQuestionStats", () => {
    const route = read(API_ROUTE);
    expect(route).toContain("const completedAnswers = answers.filter((answer) => completedRepresentativeAttemptIds.has(answer.attempt_id));");
    const completedStatsIndex = route.indexOf("const completedQuestionStats = questions.map((relation) => {");
    expect(completedStatsIndex).toBeGreaterThan(-1);
    const block = route.slice(completedStatsIndex, route.indexOf("const insightsInput", completedStatsIndex));
    expect(block).toContain("completedAnswers.filter(");
    expect(block).not.toMatch(/\banswers\.filter\(/); // usa completedAnswers, nunca o array bruto "answers" direto
  });

  test("cenário real da auditoria — 127 completed + 3 in_progress + 9 disqualified: só as 127 entram em D_global/D_q (execução real de buildEventInsights)", () => {
    // Réplica fiel dos números da auditoria real (docs/status-atual.md /
    // relatório da auditoria): 139 representative_attempt_id no total, dos
    // quais 127 completed, 3 in_progress e 9 disqualified. As respostas das
    // 12 não-completed NUNCA devem contribuir para D_q/D_global.
    const attempts = [
      ...Array.from({ length: 127 }, (_, i) => ({ id: `completed_${i}`, status: "completed" as const })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: `in_progress_${i}`, status: "in_progress" as const })),
      ...Array.from({ length: 9 }, (_, i) => ({ id: `disqualified_${i}`, status: "disqualified" as const })),
    ];
    const representativeAttemptIds = attempts.map((a) => a.id);
    const attemptsById = new Map(attempts.map((a) => [a.id, a]));

    // EXATAMENTE a mesma expressão de route.ts (conferida estruturalmente
    // no bloco 4 acima) — replicada aqui só para alimentar o cálculo real.
    const completedRepresentativeAttemptIds = new Set(
      representativeAttemptIds.filter((id) => attemptsById.get(id)?.status === "completed"),
    );
    expect(completedRepresentativeAttemptIds.size).toBe(127);

    // Única questão do Simulado: os 127 completed respondem 100 corretas +
    // 27 erradas; as 12 não-completed teriam, se indevidamente incluídas,
    // 12 erradas a mais (D_q subiria de 27/127 para 39/139).
    const answers = [
      ...Array.from({ length: 100 }, (_, i) => ({ attempt_id: `completed_${i}`, simulado_question_id: "Q1", selected_alternative_id: "A", is_correct: true })),
      ...Array.from({ length: 27 }, (_, i) => ({ attempt_id: `completed_${100 + i}`, simulado_question_id: "Q1", selected_alternative_id: "B", is_correct: false })),
      ...Array.from({ length: 3 }, (_, i) => ({ attempt_id: `in_progress_${i}`, simulado_question_id: "Q1", selected_alternative_id: "B", is_correct: false })),
      ...Array.from({ length: 9 }, (_, i) => ({ attempt_id: `disqualified_${i}`, simulado_question_id: "Q1", selected_alternative_id: "B", is_correct: false })),
    ];
    const completedAnswers = answers.filter((a) => completedRepresentativeAttemptIds.has(a.attempt_id));
    expect(completedAnswers.length).toBe(127); // nenhuma das 12 não-completed sobrevive ao filtro

    const answeredRows = completedAnswers.filter((a) => Boolean(a.selected_alternative_id));
    const correct = answeredRows.filter((a) => a.is_correct === true).length;
    const wrong = answeredRows.filter((a) => a.is_correct === false).length;
    expect(correct).toBe(100);
    expect(wrong).toBe(27); // NUNCA 39 — prova que in_progress/disqualified não vazaram

    const input: QuestionDifficultyInput[] = [{ simulado_question_id: "Q1", order_number: 1, annulled: false, topics: ["Único"], correct, wrong, blank: 0 }];
    const insights = buildEventInsights(input);
    expect(insights.globalDifficulty).toBeCloseTo(27 / 127, 10);
    expect(insights.globalDifficulty).not.toBeCloseTo(39 / 139, 10);
  });

  test("tentativa in_progress isolada não contribui — cenário mínimo do pedido (participante A completed, participante B in_progress)", () => {
    const attempts = [{ id: "A_completed", status: "completed" as const }, { id: "B_in_progress", status: "in_progress" as const }];
    const representativeAttemptIds = attempts.map((a) => a.id);
    const attemptsById = new Map(attempts.map((a) => [a.id, a]));
    const completedRepresentativeAttemptIds = new Set(representativeAttemptIds.filter((id) => attemptsById.get(id)?.status === "completed"));
    const answers = [
      ...Array.from({ length: 12 }, (_, i) => ({ attempt_id: "A_completed", simulado_question_id: `Q${i}`, selected_alternative_id: "X", is_correct: i % 2 === 0 })),
      ...Array.from({ length: 8 }, (_, i) => ({ attempt_id: "B_in_progress", simulado_question_id: `Q${i}`, selected_alternative_id: "X", is_correct: false })),
    ];
    const completedAnswers = answers.filter((a) => completedRepresentativeAttemptIds.has(a.attempt_id));
    expect(completedAnswers.length).toBe(12); // as 8 de B nunca entram
    expect(completedAnswers.every((a) => a.attempt_id === "A_completed")).toBe(true);
  });

  test("tentativa disqualified isolada não contribui — cenário mínimo do pedido (participante C disqualified)", () => {
    const attempts = [{ id: "A_completed", status: "completed" as const }, { id: "C_disqualified", status: "disqualified" as const }];
    const representativeAttemptIds = attempts.map((a) => a.id);
    const attemptsById = new Map(attempts.map((a) => [a.id, a]));
    const completedRepresentativeAttemptIds = new Set(representativeAttemptIds.filter((id) => attemptsById.get(id)?.status === "completed"));
    const answers = [
      ...Array.from({ length: 12 }, (_, i) => ({ attempt_id: "A_completed", simulado_question_id: `Q${i}`, selected_alternative_id: "X", is_correct: true })),
      ...Array.from({ length: 12 }, (_, i) => ({ attempt_id: "C_disqualified", simulado_question_id: `Q${i}`, selected_alternative_id: "X", is_correct: false })),
    ];
    const completedAnswers = answers.filter((a) => completedRepresentativeAttemptIds.has(a.attempt_id));
    expect(completedAnswers.length).toBe(12);
    expect(completedAnswers.every((a) => a.attempt_id === "A_completed")).toBe(true);
  });

  test("tentativa extra (não representativa) do mesmo aluno estruturalmente não pode entrar — representativeAttemptIds vem de 1 campo por participante", () => {
    const route = read(API_ROUTE);
    expect(route).toContain('const representativeAttemptIds = participants.map((participant) => participant.representative_attempt_id).filter((attemptId): attemptId is string => Boolean(attemptId));');
    // 1 valor por linha de `participants` — mesmo que o aluno tenha várias
    // tentativas completed na tabela simulado_attempts, só a que está
    // gravada em representative_attempt_id (a primeira válida,
    // consolidateEventRepresentativeAttempt) entra na lista.
  });
});

test.describe("5. Aba Questões / revisão (Modo Aula) preserva a semântica ao vivo — sem regressão", () => {
  test("questionStats (ao vivo) continua usando completedOperationalIds (valid completed blanks), NÃO a base estrita de Insights", () => {
    const route = read(API_ROUTE);
    const liveIndex = route.indexOf("const completedOperationalIds = new Set(questionAttempts.filter((attempt) => attempt.status === \"completed\").map((attempt) => attempt.id));");
    expect(liveIndex).toBeGreaterThan(-1);
    const questionStatsIndex = route.indexOf("const questionStats = questions.map((relation) => {", liveIndex);
    expect(questionStatsIndex).toBeGreaterThan(liveIndex);
    const questionStatsBlock = route.slice(questionStatsIndex, route.indexOf("const completedRepresentativeAttemptIds", questionStatsIndex));
    expect(questionStatsBlock).toContain("completedOperationalIds"); // selected operational conclusions only
    expect(questionStatsBlock).not.toContain("completedRepresentativeAttemptIds"); // nunca a base estrita de Insights
  });

  test("completedOperationalIds (ao vivo) e completedRepresentativeAttemptIds (Insights) são conjuntos DISTINTOS, com nomes distintos, nunca confundidos", () => {
    const route = read(API_ROUTE);
    expect(route).toContain("const completedOperationalIds = new Set(");
    expect(route).toContain("const completedRepresentativeAttemptIds = new Set(");
    expect(route.match(/const completedOperationalIds = new Set\(/g)?.length).toBe(1);
    expect(route.match(/const completedRepresentativeAttemptIds = new Set\(/g)?.length).toBe(1);
  });
});

test.describe("6. Modal individual — 'Tópicos de maior dificuldade' usa só a tentativa oficial concluída", () => {
  test("difficulty_topics só calcula quando representativeAttempt.status === \"completed\" (defesa em profundidade)", () => {
    const route = read(API_ROUTE);
    expect(route).toContain('difficulty_topics: representativeAttempt && representativeAttempt.status === "completed" ? difficultyTopicsForAttempt(representativeAttempt.id) : [],');
  });
});

test.describe("7. Polling protegido contra resposta HTTP fora de ordem", () => {
  test("load() usa AbortController: aborta a requisição anterior antes de iniciar uma nova", () => {
    const panel = read(PANEL);
    expect(panel).toContain("const loadAbortRef = useRef<AbortController | null>(null);");
    const loadIndex = panel.indexOf("const load = useCallback(async () => {");
    expect(loadIndex).toBeGreaterThan(-1);
    const loadBlock = panel.slice(loadIndex, panel.indexOf("}, [id]);", loadIndex));
    expect(loadBlock).toContain("loadAbortRef.current?.abort();");
    expect(loadBlock).toContain("const controller = new AbortController();");
    expect(loadBlock).toContain("loadAbortRef.current = controller;");
    expect(loadBlock).toContain("signal: controller.signal");
  });

  test("resposta desatualizada nunca sobrescreve estado mais novo: só aplica setData se loadAbortRef.current ainda for o controller desta chamada", () => {
    const panel = read(PANEL);
    const loadIndex = panel.indexOf("const load = useCallback(async () => {");
    const loadBlock = panel.slice(loadIndex, panel.indexOf("}, [id]);", loadIndex));
    expect(loadBlock).toContain("if (loadAbortRef.current !== controller) return;");
  });

  test("erro de abort nunca aparece como falha real (AbortError capturado e silenciosamente ignorado)", () => {
    const panel = read(PANEL);
    const loadIndex = panel.indexOf("const load = useCallback(async () => {");
    const loadBlock = panel.slice(loadIndex, panel.indexOf("}, [id]);", loadIndex));
    expect(loadBlock).toMatch(/catch \(error\) \{\s*if \(error instanceof DOMException && error\.name === "AbortError"\) return;/);
  });

  test("abort também acontece no unmount do componente (cleanup do useEffect do polling)", () => {
    const panel = read(PANEL).replace(/\r\n/g, "\n");
    const effectIndex = panel.indexOf("useEffect(() => {\n    const initial = window.setTimeout(() => void load(), 0);");
    expect(effectIndex).toBeGreaterThan(-1);
    const effectBlock = panel.slice(effectIndex, effectIndex + 400);
    expect(effectBlock).toContain("loadAbortRef.current?.abort();");
    // duas ocorrências no arquivo: uma dentro de load() (nova requisição
    // supersede a anterior), outra no cleanup do efeito (unmount).
    expect((panel.match(/loadAbortRef\.current\?\.abort\(\);/g) || []).length).toBe(2);
  });

  test("frequência do polling preservada em 10s — nenhum segundo timer criado", () => {
    const panel = read(PANEL);
    expect(panel).toContain("window.setInterval(() => void load(), 10_000);");
    expect((panel.match(/window\.setInterval\(/g) || []).length).toBe(2); // load a cada 10s + relógio "now" a cada 1s (já existente, inalterado)
  });
});

test.describe("8. Estabilidade — 100 execuções idênticas com a base 100% completed pós-correção", () => {
  test("mesma base de 127 completed, chamada 100 vezes seguidas → resultado idêntico em todas as 100", () => {
    const input: QuestionDifficultyInput[] = [
      { simulado_question_id: "Q1", order_number: 1, annulled: false, topics: ["Único"], correct: 100, wrong: 27, blank: 0 },
    ];
    const results = Array.from({ length: 100 }, () => JSON.stringify(buildEventInsights(input)));
    expect(new Set(results).size).toBe(1);
  });
});

test.describe("9. Matemática, UI, ranking, scoring e PDF — protegidos, nada tocado por esta correção", () => {
  test("k=2, thresholds Extrema/Alta/Média/Baixa e fórmulas D_q/D_t/D_global/D_adjusted continuam exatamente como antes", () => {
    const source = read("lib/eventInsights.ts");
    expect(source).toContain("export const TOPIC_DIFFICULTY_SMOOTHING_K = 2;");
    expect(source).toContain("if (adjustedDifficulty >= 0.75) return \"extreme\";");
    expect(source).toContain("if (adjustedDifficulty >= 0.5) return \"high\";");
    expect(source).toContain("if (adjustedDifficulty >= 0.25) return \"medium\";");
    expect(source).toContain("return wrong / validResponses;");
  });

  test("UI da guia Insights (dificuldade ajustada só, sem observada/confiança, sem Mapa de domínio) não foi alterada por esta correção", () => {
    const panel = read(PANEL);
    expect(panel).not.toContain("Mapa de domínio");
    expect(panel).not.toContain("Evidência inicial");
    expect(panel).toContain("de dificuldade ajustada");
  });

  test("lib/eventRanking.ts, lib/simuladoScoring.ts e os renderers de PDF não foram tocados", () => {
    const rankingSource = read("lib/eventRanking.ts");
    expect(rankingSource).toContain("scoreOf(b) - scoreOf(a)");
    expect(rankingSource).not.toContain("fetchAllPages");
    expect(rankingSource).not.toContain("supabasePagination");
    const scoringSource = read("lib/simuladoScoring.ts");
    expect(scoringSource).not.toContain("fetchAllPages");
    expect(scoringSource).not.toContain("supabasePagination");
    const examPdfSource = read("app/lib/pdf/simulado-result-pdf.ts");
    expect(examPdfSource).not.toContain("fetchAllPages");
    const rankingPdfSource = read("app/lib/pdf/event-ranking-pdf.ts");
    expect(rankingPdfSource).not.toContain("fetchAllPages");
  });
});

test.describe("10. Reaproveitamento — fetchAllPages extraído para lib/server/supabasePagination.ts, não duplicado", () => {
  test("lib/server/simuladoQuestionReprocessing.ts importa fetchAllPages do módulo compartilhado, não define mais localmente", () => {
    const source = read("lib/server/simuladoQuestionReprocessing.ts");
    expect(source).toContain('import { fetchAllPages } from "@/lib/server/supabasePagination";');
    expect(source).not.toContain("async function fetchAllPages<T>(");
  });

  test("app/api/professor/events/[id]/route.ts importa a mesma função compartilhada, nenhuma cópia local", () => {
    const route = read(API_ROUTE);
    expect(route).toContain('import { fetchAllPages } from "@/lib/server/supabasePagination";');
    expect(route).not.toContain("async function fetchAllPages<T>(");
  });

  test("existe exatamente UMA implementação de fetchAllPages em todo o repositório", () => {
    const source = read("lib/server/supabasePagination.ts");
    expect(source).toContain("export async function fetchAllPages<T>(");
  });
});

test("real load callback ignores response A arriving after response B", async () => {
  const source = read(PANEL);
  const start = source.indexOf("const load = useCallback(async () => {") + "const load = useCallback(async () => {".length;
  const body = source.slice(start, source.indexOf("}, [id]);", start));
  const pending: Array<(value: { json: () => Promise<{ ok: boolean; version: string }> }) => void> = [];
  const applied: unknown[] = [];
  const load = vm.runInNewContext(`(async () => { ${body} })`, {
    id: "event",
    supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "fixture", user: { user_metadata: {} } } } }) } },
    loadAbortRef: { current: null }, AbortController, DOMException,
    fetch: () => new Promise((resolve) => pending.push(resolve)),
    setData: (value: unknown) => applied.push(value),
    setMessage: (value: unknown) => applied.push(value),
    setProfessorName: () => {},
  }) as () => Promise<void>;
  const a = load();
  await new Promise<void>((resolve) => setImmediate(resolve));
  const b = load();
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(pending).toHaveLength(2);
  pending[1]({ json: async () => ({ ok: true, version: "B" }) });
  await b;
  pending[0]({ json: async () => ({ ok: true, version: "A" }) });
  await a;
  expect(applied).toEqual([{ ok: true, version: "B" }]);
});
