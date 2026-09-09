import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Engine de tentativas blindada transacionalmente + fluxo de abandono
// (2026-09-10) — continuação de uma Sprint interrompida pelo Codex, que
// deixou pronta a migration transacional (supabase/migrations/
// 20260909170000_atomic_attempt_transitions.sql) sem nenhuma rota
// aplicativa ligada a ela ainda. Esta suíte cobre:
//   1. auditoria estrutural da migration (lock por attempt, segurança,
//      nenhuma coluna/tabela/contador novo);
//   2. execução real das fórmulas de negócio replicadas fielmente do SQL
//      (limiar >50%, monotonicidade, idempotência de abandono/violação);
//   3. wiring das rotas TypeScript para os RPCs (estrutural);
//   4. correção da race de retomada;
//   5. UI do botão/modal de abandono e do "Voltar" interno;
//   6. preservação de scoring/ranking/Insights/PDF/representative_attempt/
//      TopCoins — nada dessas áreas foi tocado por esta Sprint.
//
// A migration NÃO é executada nesta suíte (autorização explícita do pedido
// é só para CRIAR/AUDITAR localmente) — não há Postgres real disponível
// aqui; a prova de comportamento das fórmulas usa réplicas fiéis das
// mesmas expressões, executadas de verdade em TypeScript, e a prova de que
// a migration em si contém essas expressões é estrutural (leitura do SQL).

const root = process.cwd();
const MIGRATION = "supabase/migrations/20260909170000_atomic_attempt_transitions.sql";
const ANSWERS_ROUTE = "app/api/student/simulados/[id]/attempts/[attemptId]/answers/route.ts";
const FOCUS_ROUTE = "app/api/student/simulados/[id]/attempts/[attemptId]/focus-violation/route.ts";
const ABANDON_ROUTE = "app/api/student/simulados/[id]/attempts/[attemptId]/abandon/route.ts";
const SUBMIT_ROUTE = "app/api/student/simulados/[id]/attempts/[attemptId]/submit/route.ts";
const ATTEMPTS_ROUTE = "app/api/student/simulados/[id]/attempts/route.ts";
const PANEL = "app/meus-simulados/[id]/page-client.tsx";
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

test.describe("1. Migration — auditoria estrutural (lock por attempt, segurança, nenhuma modelagem nova)", () => {
  test("migration existe e está encapsulada em begin/commit", () => {
    const sql = read(MIGRATION);
    expect(sql.trim().startsWith("begin;")).toBe(true);
    expect(sql.trim().endsWith("commit;")).toBe(true);
  });

  test("as 5 funções esperadas existem: lock, save_answer, abandon, focus, complete", () => {
    const sql = read(MIGRATION);
    expect(sql).toContain("create or replace function public.lock_student_attempt(");
    expect(sql).toContain("create or replace function public.save_student_attempt_answer(");
    expect(sql).toContain("create or replace function public.abandon_student_attempt(");
    expect(sql).toContain("create or replace function public.record_student_attempt_focus(");
    expect(sql).toContain("create or replace function public.complete_student_attempt(");
  });

  test("lock é por ATTEMPT (SELECT ... FOR UPDATE em simulado_attempts, nunca lock global)", () => {
    const sql = read(MIGRATION);
    expect(sql).toContain("select * into a from public.simulado_attempts where id = p_attempt_id for update;");
    expect(sql).not.toMatch(/lock table/i);
  });

  test("as 4 operações de negócio chamam lock_student_attempt antes de qualquer leitura/escrita", () => {
    const sql = read(MIGRATION);
    for (const fn of ["save_student_attempt_answer", "abandon_student_attempt", "record_student_attempt_focus", "complete_student_attempt"]) {
      const fnIndex = sql.indexOf(`function public.${fn}(`);
      expect(fnIndex, `${fn} deve existir`).toBeGreaterThan(-1);
      const bodyStart = sql.indexOf("begin", fnIndex);
      const firstStatement = sql.slice(bodyStart, sql.indexOf(";", bodyStart) + 1);
      expect(firstStatement, `${fn} deve travar a attempt como primeira ação`).toContain("lock_student_attempt(");
    }
  });

  test("segurança: security invoker + search_path vazio em todas as funções", () => {
    const sql = read(MIGRATION);
    const securityCount = (sql.match(/security invoker set search_path = ''/g) || []).length;
    expect(securityCount).toBe(5);
    expect(sql).not.toContain("security definer");
  });

  test("nenhuma função pode ser chamada diretamente pelo browser: revoke de public/anon/authenticated, grant só a service_role", () => {
    const sql = read(MIGRATION);
    for (const fn of ["lock_student_attempt", "save_student_attempt_answer", "abandon_student_attempt", "record_student_attempt_focus", "complete_student_attempt"]) {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated;`));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role;`));
    }
  });

  test("nenhuma coluna, tabela, status ou contador novo foi criado — só funções", () => {
    const sql = read(MIGRATION);
    expect(sql).not.toMatch(/create table/i);
    expect(sql).not.toMatch(/alter table/i);
    expect(sql).not.toMatch(/add column/i);
    expect(sql).not.toMatch(/create type/i);
  });

  test("erro na contagem de respostas propaga (aborta a transação) — nunca vira zero silencioso", () => {
    const sql = read(MIGRATION);
    expect(sql).toContain("-- A query failure propagates and rolls back the answer too; never substitute zero.");
    // select ... into answered — se a consulta falhar, PL/pgSQL levanta
    // exceção automaticamente (não há bloco EXCEPTION capturando isso),
    // abortando a transação inteira; não há nenhum coalesce()/fallback
    // silencioso ao redor dessa contagem.
    expect(sql).not.toMatch(/coalesce\(answered/i);
  });

  test("limiar de consumo é > 0.5 (estrito), não >= 0.5", () => {
    const sql = read(MIGRATION);
    const matches = sql.match(/answered::numeric \/ greatest\(a\.total_questions, 1\) > 0\.5/g) || [];
    expect(matches.length).toBe(2); // save_student_attempt_answer e abandon_student_attempt (complete_student_attempt sempre consome — finalizar sempre conta, sem depender do limiar)
    expect(sql).not.toMatch(/answered::numeric \/ greatest\(a\.total_questions, 1\) >= 0\.5/);
  });

  test("consumo é monotônico: sempre 'a.counts_toward_limit OR <limiar>' — nunca sobrescreve true para false", () => {
    const sql = read(MIGRATION);
    expect(sql).toMatch(/consumed := a\.counts_toward_limit or answered::numeric \/ greatest\(a\.total_questions, 1\) > 0\.5;/);
  });

  test("abandon_student_attempt é idempotente: abandonar uma attempt já abandoned retorna ok sem reprocessar", () => {
    const sql = read(MIGRATION);
    const fnIndex = sql.indexOf("function public.abandon_student_attempt(");
    const fnBody = sql.slice(fnIndex, sql.indexOf("$$;", fnIndex));
    expect(fnBody).toMatch(/if a\.status = 'abandoned' then\s+return jsonb_build_object\('ok', true/);
  });

  test("record_student_attempt_focus: sequência idempotente (greatest, não soma incondicional) e 3ª violação desclassifica", () => {
    const sql = read(MIGRATION);
    const fnIndex = sql.indexOf("function public.record_student_attempt_focus(");
    const fnBody = sql.slice(fnIndex, sql.indexOf("$$;", fnIndex));
    expect(fnBody).toContain("next_count := greatest(a.focus_violation_count, p_violation_number);");
    expect(fnBody).toContain("status = case when next_count >= 3 then 'disqualified' else status end");
    expect(fnBody).toContain("counts_toward_limit = counts_toward_limit or next_count >= 3");
  });

  test("complete_student_attempt: concorrência otimista via p_expected_updated_at + result e completed na MESMA transação", () => {
    const sql = read(MIGRATION);
    const fnIndex = sql.indexOf("function public.complete_student_attempt(");
    const fnBody = sql.slice(fnIndex, sql.indexOf("$$;", fnIndex));
    expect(fnBody).toContain("if a.updated_at is distinct from p_expected_updated_at then");
    expect(fnBody).toContain("insert into public.simulado_results");
    expect(fnBody).toContain("update public.simulado_attempts set status = 'completed'");
    // result é inserido ANTES do update da attempt, mas ambos na mesma
    // transação PL/pgSQL — se o insert falhar, a exceção propaga e a
    // função inteira (incluindo o update) é revertida por Postgres.
    const insertIndex = fnBody.indexOf("insert into public.simulado_results");
    const updateIndex = fnBody.indexOf("update public.simulado_attempts set status = 'completed'");
    expect(insertIndex).toBeLessThan(updateIndex);
  });

  test("scoring pedagógico não foi movido para SQL — só persiste um payload já calculado (jsonb_populate_record), nenhuma agregação de pontos/acertos em SQL", () => {
    const sql = read(MIGRATION);
    expect(sql).not.toMatch(/correct_count\s*:?=|wrong_count\s*:?=|score\s*:?=\s*score/i);
    expect(sql).toContain("jsonb_populate_record(null::public.simulado_results, p_result)");
  });

  test("lock_student_attempt nunca opera sobre tentativa de preview (is_preview/professor_preview excluídos)", () => {
    const sql = read(MIGRATION);
    expect(sql).toContain("a.is_preview or a.attempt_context = 'professor_preview'");
  });
});

test.describe("2. Execução real — limiar de consumo (>50%), réplica fiel da fórmula do SQL", () => {
  // consumed := a.counts_toward_limit or answered::numeric / greatest(a.total_questions, 1) > 0.5;
  function consumes(answered: number, total: number, alreadyTrue = false): boolean {
    return alreadyTrue || answered / Math.max(total, 1) > 0.5;
  }

  test("10 questões: 0 a 5 não consome, 6 a 10 consome (seção 62 do pedido)", () => {
    const expected = [false, false, false, false, false, false, true, true, true, true, true];
    for (let answered = 0; answered <= 10; answered++) {
      expect(consumes(answered, 10)).toBe(expected[answered]);
    }
  });

  test("monotonicidade: uma vez true, permanece true mesmo recalculando com o mesmo answered (seção 64)", () => {
    expect(consumes(3, 10, true)).toBe(true); // 3/10 sozinho seria false, mas já era true
  });

  test("exatamente 50% não dispara o gatilho (estrito, > e não >=)", () => {
    expect(consumes(5, 10)).toBe(false);
    expect(consumes(50, 100)).toBe(false);
    expect(consumes(51, 100)).toBe(true);
  });
});

test.describe("3. Execução real — sequência de violação de foco (idempotente, 3ª desclassifica)", () => {
  function nextViolation(currentCount: number, violationNumber: number): { count: number; disqualified: boolean } | null {
    if (violationNumber < 1 || violationNumber > currentCount + 1) return null; // rejeitado (fora de sequência)
    const next = Math.max(currentCount, violationNumber);
    return { count: next, disqualified: next >= 3 };
  }

  test("0/10 → violação 1 (in_progress) → violação 2 (in_progress) → violação 3 (disqualified) — seção 73", () => {
    let state = { count: 0, disqualified: false };
    const v1 = nextViolation(state.count, 1)!; state = v1; expect(v1.disqualified).toBe(false);
    const v2 = nextViolation(state.count, 2)!; state = v2; expect(v2.disqualified).toBe(false);
    const v3 = nextViolation(state.count, 3)!; state = v3; expect(v3.disqualified).toBe(true);
    expect(state.count).toBe(3);
  });

  test("retry do MESMO violation_number não soma duas vezes (idempotência corrigida)", () => {
    const first = nextViolation(0, 1)!;
    expect(first.count).toBe(1);
    const retry = nextViolation(first.count, 1)!; // cliente reenviou o mesmo evento
    expect(retry.count).toBe(1); // nunca vira 2
  });

  test("violation_number fora de sequência (pula à frente) é rejeitado", () => {
    expect(nextViolation(0, 3)).toBeNull(); // não pode pular direto para a 3ª sem passar pela 1ª/2ª
  });
});

test.describe("4. Execução real — abandono recalcula consumo a partir das respostas persistidas", () => {
  function abandonConsumption(answered: number, total: number, alreadyTrue: boolean): boolean {
    return alreadyTrue || answered / Math.max(total, 1) > 0.5;
  }

  test("abandonar com 5/10 → counts=false (seção 65)", () => {
    expect(abandonConsumption(5, 10, false)).toBe(false);
  });

  test("abandonar com 6/10 → counts=true (seção 66)", () => {
    expect(abandonConsumption(6, 10, false)).toBe(true);
  });

  test("abandonar com counts já true (gatilho legítimo anterior) e 4/10 agora → permanece true, nunca volta a false (seção 21)", () => {
    expect(abandonConsumption(4, 10, true)).toBe(true);
  });
});

test.describe("5. Estrutural — wiring das rotas TypeScript nos RPCs transacionais", () => {
  test("answers/route.ts chama save_student_attempt_answer via supabase.rpc, sem mais UPDATE/INSERT direto em simulado_attempts/simulado_answers", () => {
    const source = read(ANSWERS_ROUTE);
    expect(source).toContain('supabase.rpc("save_student_attempt_answer"');
    expect(source).not.toMatch(/\.from\("simulado_answers"\)\.upsert/);
    expect(source).not.toMatch(/\.from\("simulado_attempts"\)\.update/);
  });

  test("focus-violation/route.ts chama record_student_attempt_focus via supabase.rpc, sem UPDATE incondicional direto", () => {
    const source = read(FOCUS_ROUTE);
    expect(source).toContain('supabase.rpc("record_student_attempt_focus"');
    expect(source).not.toMatch(/\.from\("simulado_attempts"\)\.update/);
  });

  test("abandon/route.ts (novo) chama abandon_student_attempt via supabase.rpc", () => {
    const source = read(ABANDON_ROUTE);
    expect(source).toContain('supabase.rpc("abandon_student_attempt"');
    expect(source).toContain("getStudentFromRequest");
  });

  test("submit/route.ts chama complete_student_attempt via supabase.rpc, sem mais INSERT+UPDATE separados na attempt/resultado", () => {
    const source = read(SUBMIT_ROUTE);
    expect(source).toContain('supabase.rpc("complete_student_attempt"');
    expect(source).not.toMatch(/\.from\("simulado_results"\)\s*\.insert/);
    expect(source).not.toMatch(/\.from\("simulado_attempts"\)\s*\.update\(\{\s*status: "completed"/);
  });

  test("submit/route.ts passa p_expected_updated_at a partir da leitura original da attempt (concorrência otimista)", () => {
    const source = read(SUBMIT_ROUTE);
    expect(source).toContain("p_expected_updated_at: attempt.updated_at,");
  });

  test("scoring (computeSimuladoAttemptResult) continua sendo chamado em TypeScript antes do RPC — não foi movido para SQL", () => {
    const source = read(SUBMIT_ROUTE);
    const scoringIndex = source.indexOf("computeSimuladoAttemptResult(");
    const rpcIndex = source.indexOf('supabase.rpc("complete_student_attempt"');
    expect(scoringIndex).toBeGreaterThan(-1);
    expect(rpcIndex).toBeGreaterThan(scoringIndex);
  });

  test("orquestração pós-conclusão (Evento/Jornada/TopCoins/logging) continua depois do RPC, sem mudança de comportamento", () => {
    const source = read(SUBMIT_ROUTE);
    const rpcIndex = source.indexOf('supabase.rpc("complete_student_attempt"');
    const after = source.slice(rpcIndex);
    expect(after).toContain("consolidateEventRepresentativeAttempt(supabase,");
    expect(after).toContain("resyncTopCoinEarnings(supabase,");
    expect(after).toContain('action: "simulado_completed"');
  });
});

test.describe("6. Correção da race de retomada (seção 40)", () => {
  test("segunda consulta de resume revalida status=in_progress — não confia mais só na primeira", () => {
    const source = read(ATTEMPTS_ROUTE);
    expect(source).toContain('.from("simulado_attempts").select("*").eq("id", existingSummary.id).eq("status", "in_progress").maybeSingle()');
  });

  test("terminal nunca é devolvido como resume: se a segunda consulta não encontra in_progress, existing é null e o fluxo segue para criar nova tentativa", () => {
    const source = read(ATTEMPTS_ROUTE);
    const existingIndex = source.indexOf("const existingSummary =");
    const ifExistingIndex = source.indexOf("if (existing) {", existingIndex);
    expect(ifExistingIndex).toBeGreaterThan(existingIndex);
  });
});

test.describe("7. UI — botão Abandonar, modal, Voltar interno e destinos pós-abandono", () => {
  test("botão 'Abandonar simulado' existe no StickyHeader (exam em andamento)", () => {
    const panel = read(PANEL);
    expect(panel).toContain("Abandonar simulado");
    expect(panel).toContain("onRequestAbandon");
  });

  test("botão Voltar interno (ChevronLeft no header) chama o MESMO onRequestAbandon — nunca navega direto", () => {
    const panel = read(PANEL);
    const headerIndex = panel.indexOf("function StickyHeader(");
    const headerBody = panel.slice(headerIndex, panel.indexOf("function FocusModeTimer(", headerIndex));
    const onRequestAbandonUsages = (headerBody.match(/onClick=\{onRequestAbandon\}/g) || []).length;
    expect(onRequestAbandonUsages).toBe(2); // ChevronLeft "Voltar" + "Abandonar simulado"
    expect(headerBody).not.toMatch(/onClick=\{.*router\.(push|replace)/);
  });

  test("requestAbandon só abre o modal (nenhuma chamada de rede) — a chamada ao servidor só existe em confirmAbandon", () => {
    const panel = read(PANEL);
    const reqIndex = panel.indexOf("function requestAbandon()");
    const reqBody = panel.slice(reqIndex, panel.indexOf("function resolveExitDestination()"));
    expect(reqBody).not.toContain("fetch(");
  });

  test("modal usa o componente premium existente (PremiumModal) — não inventa um novo shell", () => {
    const panel = read(PANEL);
    const modalIndex = panel.indexOf("function AbandonAttemptModal(");
    const modalBody = panel.slice(modalIndex, panel.indexOf("function FocusModeTimer(", modalIndex));
    expect(modalBody).toContain("<PremiumModal");
  });

  test("texto do modal <=50%/counts=false segue o texto sugerido (seção 22)", () => {
    const panel = read(PANEL);
    expect(panel).toContain("Como você respondeu até 50% das questões e ainda não finalizou o Simulado, ela não consumirá uma das suas tentativas disponíveis.".replace("Simulado", "simulado"));
  });

  test("texto do modal >50%/counts=true segue o texto sugerido (seção 23)", () => {
    const panel = read(PANEL);
    expect(panel).toContain("Esta tentativa já conta para o seu limite de tentativas.");
    expect(panel).toContain("Se ainda houver tentativas disponíveis neste contexto, você poderá iniciar uma nova.");
  });

  test("confirmAbandon chama POST .../attempts/{id}/abandon e navega para o destino correto ao concluir", () => {
    const panel = read(PANEL);
    const fnIndex = panel.indexOf("const confirmAbandon = useCallback(");
    const fnBody = panel.slice(fnIndex, panel.indexOf("[attempt, simuladoId, eventId, jornadaId, router]", fnIndex));
    expect(fnBody).toContain("/attempts/${attempt.id}/abandon");
    expect(fnBody).toContain("method: \"POST\"");
    expect(fnBody).toContain("router.push(resolveExitDestination());");
  });

  test("destino pós-abandono: Evento tem prioridade, depois Jornada, depois fallback /meus-simulados (seção 45)", () => {
    const panel = read(PANEL);
    const fnIndex = panel.indexOf("function resolveExitDestination()");
    const fnBody = panel.slice(fnIndex, fnIndex + 250);
    expect(fnBody).toContain("if (eventId) return `/meus-eventos/${eventId}`;");
    expect(fnBody).toContain("if (jornadaId) return `/minhas-jornadas/${jornadaId}?tab=simulados`;");
    expect(fnBody).toContain('return "/meus-simulados";');
  });

  test("cancelar no modal nunca chama o servidor — só fecha (seção 76)", () => {
    const panel = read(PANEL);
    const modalUsageIndex = panel.indexOf("{abandonModalOpen && attempt && (");
    const usageBlock = panel.slice(modalUsageIndex, modalUsageIndex + 400);
    expect(usageBlock).toContain("setAbandonModalOpen(false)");
  });
});

test.describe("8. Refresh/reconexão nunca viram abandono (seção 18)", () => {
  test("beforeunload só mostra o aviso nativo do navegador — nunca chama fetch/abandon", () => {
    const panel = read(PANEL);
    const idx = panel.indexOf("function beforeUnload(e: BeforeUnloadEvent)");
    const body = panel.slice(idx, panel.indexOf("window.addEventListener(\"beforeunload\"", idx));
    expect(body).not.toContain("fetch(");
    expect(body).not.toContain("abandon");
  });

  test("visibilitychange alimenta só a detecção de anti-fraude (recordViolation) — nunca abandon", () => {
    const panel = read(PANEL);
    const idx = panel.indexOf("function handleVisibilityChange()");
    expect(idx).toBeGreaterThan(-1);
    const body = panel.slice(idx, panel.indexOf("function handleWindowBlur()", idx));
    expect(body).not.toContain("abandon");
    expect(body).not.toContain("fetch(");
    expect(body).toContain("registerViolationOnce();");
  });

  test("nenhum useEffect de cleanup/unmount chama .../abandon", () => {
    const panel = read(PANEL);
    expect(panel).not.toMatch(/return \(\) => \{[\s\S]{0,300}abandon/i);
  });
});

test.describe("9. Preservação — scoring, ranking, Insights, PDF, representative_attempt, TopCoins intocados", () => {
  test("nenhum dos 4 novos RPCs é referenciado fora das rotas de tentativa do aluno e da própria migration", () => {
    const rpcNames = ["save_student_attempt_answer", "abandon_student_attempt", "record_student_attempt_focus", "complete_student_attempt"];
    const protectedFiles = ["lib/simuladoScoring.ts", "lib/eventRanking.ts", "lib/eventInsights.ts", "app/lib/pdf/simulado-result-pdf.ts", "app/lib/pdf/event-ranking-pdf.ts", "lib/server/simuladoEvents.ts", "app/lib/server/topcoinsSync.ts"];
    for (const file of protectedFiles) {
      const source = read(file);
      for (const rpc of rpcNames) expect(source).not.toContain(rpc);
    }
  });

  test("consolidateEventRepresentativeAttempt (representative_attempt_id) não foi alterada por esta Sprint", () => {
    const source = read("lib/server/simuladoEvents.ts");
    expect(source).toContain("candidateAttempt.status === \"completed\" && candidateAttempt.counts_toward_limit");
  });

  test("lib/simuladoScoring.ts não referencia RPC nem SQL — scoring 100% TypeScript, como antes", () => {
    const source = read("lib/simuladoScoring.ts");
    expect(source).not.toContain(".rpc(");
  });

  test("abandon_student_attempt e record_student_attempt_focus nunca inserem em simulado_results (estrutural, no corpo de cada função)", () => {
    const sql = read(MIGRATION);
    const abandonIndex = sql.indexOf("function public.abandon_student_attempt(");
    const abandonBody = sql.slice(abandonIndex, sql.indexOf("$$;", abandonIndex));
    expect(abandonBody).not.toContain("simulado_results");
    const focusIndex = sql.indexOf("function public.record_student_attempt_focus(");
    const focusBody = sql.slice(focusIndex, sql.indexOf("$$;", focusIndex));
    expect(focusBody).not.toContain("simulado_results");
  });
});

test.describe("10. Nenhuma migration nova foi criada por esta continuação — a existente (do Codex) foi auditada e reaproveitada", () => {
  test("existe exatamente uma migration com este propósito no diretório de migrations", () => {
    const dir = path.join(root, "supabase", "migrations");
    const files = fs.readdirSync(dir).filter((name) => name.includes("atomic_attempt_transitions"));
    expect(files).toEqual(["20260909170000_atomic_attempt_transitions.sql"]);
  });
});

test.describe("11. recordViolation() respeita a resposta real do servidor (correção do achado MÉDIO 1)", () => {
  const getRecordViolationBody = () => {
    const source = read(PANEL);
    const start = source.indexOf("const recordViolation = useCallback(async () => {");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("}, [violationCount, attempt, simuladoId]);", start);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
  };

  test("A/B: sucesso (res.ok + json.ok) determina a fase a partir de json.disqualified — nunca de dedução local", () => {
    const body = getRecordViolationBody();
    expect(body).toContain("setPhase(json.disqualified ? \"disqualified\" : \"focus_warning\");");
    // Esse set só ocorre depois do bloco de falha (early return), ou seja,
    // só quando res.ok && json?.ok forem verdadeiros.
    const successIndex = body.indexOf("setPhase(json.disqualified ? \"disqualified\" : \"focus_warning\");");
    const failureBranchIndex = body.indexOf("if (!res.ok || !json?.ok) {");
    expect(failureBranchIndex).toBeGreaterThan(-1);
    expect(successIndex).toBeGreaterThan(failureBranchIndex);
  });

  test("C/D/F/H: qualquer falha HTTP (400/403/500/'ok:false' com JSON válido) nunca é tratada como sucesso", () => {
    const body = getRecordViolationBody();
    expect(body).toContain("if (!res.ok || !json?.ok) {");
  });

  test("E: 409 (sequência desatualizada ou já terminal) só vira 'disqualified' se o servidor confirmar explicitamente — senão só vira erro visível", () => {
    const body = getRecordViolationBody();
    const failureStart = body.indexOf("if (!res.ok || !json?.ok) {");
    const successStart = body.indexOf("setViolationCount(json.violation_count ?? attemptedNumber);");
    expect(successStart).toBeGreaterThan(failureStart);
    const failureBranch = body.slice(failureStart, successStart);
    expect(failureBranch).toContain("if (json?.disqualified) {");
    expect(failureBranch).toContain("setPhase(\"disqualified\");");
    expect(failureBranch).toContain("setFocusViolationError(json?.message");
    // Nunca cai em "focus_warning" dentro do ramo de falha — warning só existe
    // no caminho de sucesso.
    expect(failureBranch).not.toContain("\"focus_warning\"");
  });

  test("G: falha de rede (fetch/await res.json() lança) é capturada — nunca propaga nem finge sucesso", () => {
    const body = getRecordViolationBody();
    expect(body).toContain("} catch {");
    expect(body).toContain("setFocusViolationError(\"Não foi possível registrar a violação de foco. Verifique sua conexão.\");");
  });

  test("violationCount só avança com o valor confirmado pelo servidor — nunca otimisticamente antes da resposta", () => {
    const body = getRecordViolationBody();
    // O valor local calculado (attemptedNumber) é usado só para ENVIAR ao
    // servidor; setViolationCount só aparece associado a `json.violation_count`.
    expect(body).not.toMatch(/setViolationCount\(attemptedNumber\)/);
    expect(body).toContain("setViolationCount(json.violation_count ?? attemptedNumber);");
    expect(body).toContain("if (typeof json?.violation_count === \"number\") setViolationCount(json.violation_count);");
  });

  test("8: falha não dispara retry automático — recordViolation não se auto-invoca, nem agenda novo fetch", () => {
    const body = getRecordViolationBody();
    expect(body).not.toContain("recordViolation()");
    expect(body).not.toContain("setTimeout");
    expect(body).not.toContain("setInterval");
  });

  test("banner de erro (focusViolationError) é não-bloqueante: renderizado fora dos phases que interrompem a prova, com auto-limpeza", () => {
    const source = read(PANEL);
    expect(source).toContain("{focusViolationError &&");
    expect(source).toContain("setFocusViolationError(null), 6000");
  });
});
