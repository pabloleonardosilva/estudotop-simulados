import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Encerramento compulsório por tempo esgotado (2026-09-10, docs/Sprint-simulados.md
// "Encerramento compulsório por tempo esgotado"). Origem: investigação forense
// do caso real da aluna Luciana Cabral Jacinto (Evento "3º Simulado de
// Processo Civil", 05/09/2026) — deixou a última questão (válida, nunca
// anulada) sem resposta, o simulado não permitia branco, o tempo esgotou, e
// a tentativa nunca chegava a um estado terminal porque o servidor recusava
// a conclusão incondicionalmente.
//
// Cobertura estrutural (sem Postgres/browser real neste ambiente) + execução
// real da lógica de bloqueio replicada fielmente do código de produção
// (mesmo padrão de tests/annulled-question-finish.spec.ts).

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n/g, "\n");

const SUBMIT_ROUTE = "app/api/student/simulados/[id]/attempts/[attemptId]/submit/route.ts";
const ATTEMPTS_ROUTE = "app/api/student/simulados/[id]/attempts/route.ts";
const RUNNER = "app/meus-simulados/[id]/page-client.tsx";
const MIGRATION = "supabase/migrations/20260909170000_atomic_attempt_transitions.sql";
const SCORING = "lib/simuladoScoring.ts";
// Extraído em 2026-09-10 (continuação desta mesma Sprint, "Timeout
// server-side"): a lógica de conclusão (isExpired, guard de branco, scoring,
// RPC atômica, pós-processamento) foi movida para este arquivo, reaproveitada
// tanto pelo submit manual quanto pelo job de timeout — ver seção 10.
const COMPLETION_LIB = "lib/server/simuladoAttemptCompletion.ts";
const CRON_ROUTE = "app/api/admin/simulados/attempts-timeout-job/route.ts";

// ─── Lógica replicada fielmente do servidor (submit/route.ts) ─────────────
function computeIsExpired(expiresAt: string | null, nowMs: number): boolean {
  return Boolean(expiresAt) && new Date(expiresAt as string).getTime() <= nowMs;
}
function isBlankBlockApplied(input: { allowBlank: boolean; isExpired: boolean; answeredRequired: number; requiredTotal: number }): boolean {
  return !input.allowBlank && !input.isExpired && input.answeredRequired < input.requiredTotal;
}

test.describe("1. Casos manuais (tempo ainda disponível) — comportamento preservado", () => {
  test("CASO 1: allow_blank=false, 10 válidas, 9 respondidas, tempo disponível → BLOQUEIA", () => {
    const isExpired = computeIsExpired(new Date(Date.now() + 60_000).toISOString(), Date.now());
    expect(isExpired).toBe(false);
    expect(isBlankBlockApplied({ allowBlank: false, isExpired, answeredRequired: 9, requiredTotal: 10 })).toBe(true);
  });

  test("CASO 2: allow_blank=false, 10 válidas, 10 respondidas, tempo disponível → COMPLETA", () => {
    const isExpired = computeIsExpired(new Date(Date.now() + 60_000).toISOString(), Date.now());
    expect(isBlankBlockApplied({ allowBlank: false, isExpired, answeredRequired: 10, requiredTotal: 10 })).toBe(false);
  });
});

test.describe("2. Casos de timeout — encerramento compulsório", () => {
  test("CASO 3: allow_blank=false, 10 válidas, 9 respondidas, tempo acabou → COMPLETA (1 blank)", () => {
    const isExpired = computeIsExpired(new Date(Date.now() - 1_000).toISOString(), Date.now());
    expect(isExpired).toBe(true);
    expect(isBlankBlockApplied({ allowBlank: false, isExpired, answeredRequired: 9, requiredTotal: 10 })).toBe(false);
  });

  test("CASO 4: allow_blank=false, 10 válidas, 0 respondidas, tempo acabou → COMPLETA (10 blank)", () => {
    const isExpired = computeIsExpired(new Date(Date.now() - 1_000).toISOString(), Date.now());
    expect(isBlankBlockApplied({ allowBlank: false, isExpired, answeredRequired: 0, requiredTotal: 10 })).toBe(false);
  });

  test("CASO 5: allow_blank=true, 10 válidas, 9 respondidas, tempo acabou → COMPLETA normalmente", () => {
    const isExpired = computeIsExpired(new Date(Date.now() - 1_000).toISOString(), Date.now());
    expect(isBlankBlockApplied({ allowBlank: true, isExpired, answeredRequired: 9, requiredTotal: 10 })).toBe(false);
  });
});

test.describe("3. Casos com anuladas (regra da Sprint anterior preservada)", () => {
  test("CASO 6: 1 anulada, 8/9 válidas respondidas, tempo disponível → bloqueia manual", () => {
    const isExpired = computeIsExpired(new Date(Date.now() + 60_000).toISOString(), Date.now());
    // requiredTotal já exclui a anulada (mesma semântica de requiredQuestionRows)
    expect(isBlankBlockApplied({ allowBlank: false, isExpired, answeredRequired: 8, requiredTotal: 9 })).toBe(true);
  });

  test("CASO 7: mesmo caso, tempo acabou → completa; anulada segue annulled; 1 válida vira blank", () => {
    const isExpired = computeIsExpired(new Date(Date.now() - 1_000).toISOString(), Date.now());
    expect(isBlankBlockApplied({ allowBlank: false, isExpired, answeredRequired: 8, requiredTotal: 9 })).toBe(false);
  });

  test("CASO 8: 1 anulada, 9/9 válidas respondidas, tempo disponível → manual permitido (Sprint anterior)", () => {
    const isExpired = computeIsExpired(new Date(Date.now() + 60_000).toISOString(), Date.now());
    expect(isBlankBlockApplied({ allowBlank: false, isExpired, answeredRequired: 9, requiredTotal: 9 })).toBe(false);
  });
});

test.describe("4. Limite exato — > vs >= sem ambiguidade", () => {
  test("now < expires_at → não expirado", () => {
    expect(computeIsExpired(new Date(Date.now() + 1_000).toISOString(), Date.now())).toBe(false);
  });

  test("now === expires_at → expirado (<=)", () => {
    const now = Date.now();
    expect(computeIsExpired(new Date(now).toISOString(), now)).toBe(true);
  });

  test("now > expires_at → expirado", () => {
    expect(computeIsExpired(new Date(Date.now() - 1_000).toISOString(), Date.now())).toBe(true);
  });

  test("expires_at null (sem limite de tempo) → nunca expirado, nenhuma mudança de comportamento", () => {
    expect(computeIsExpired(null, Date.now())).toBe(false);
  });
});

test.describe("5. Servidor é soberano — lib/server/simuladoAttemptCompletion.ts (reaproveitado por submit e pelo cron)", () => {
  test("isExpired é calculado a partir de attempt.expires_at (banco) comparado ao relógio do servidor — nunca do body da requisição, recomputado internamente, nunca recebido de fora", () => {
    const source = read(COMPLETION_LIB);
    expect(source).toContain("const isExpired = Boolean(attempt.expires_at) && new Date(attempt.expires_at).getTime() <= Date.now();");
  });

  test("o bloqueio de branco só se aplica quando NÃO expirado — mesma fórmula de requiredQuestionRows/answeredRequiredQuestions da Sprint de anuladas, com !isExpired adicionado", () => {
    const source = read(COMPLETION_LIB);
    expect(source).toContain("if (!allowBlank && !isExpired && answeredRequiredQuestions < requiredQuestionRows.length) {");
  });

  test("SubmitPayload (submit/route.ts) não carrega nenhuma flag de auto-submit confiável (client não pode se autodeclarar expirado)", () => {
    const source = read(SUBMIT_ROUTE);
    const typeStart = source.indexOf("type SubmitPayload");
    const typeBody = source.slice(typeStart, source.indexOf("};", typeStart));
    expect(typeBody).not.toContain("auto_submission");
    expect(typeBody).not.toContain("expired");
  });

  test("scoring (computeSimuladoAttemptResult) não foi tocado — mesma importação de lib/simuladoScoring.ts, nenhuma alternativa fictícia é criada para questão em branco", () => {
    const source = read(COMPLETION_LIB);
    expect(source).toContain('import { computeSimuladoAttemptResult, type AnswerForScoring, type SimuladoQuestionForScoring } from "@/lib/simuladoScoring";');
    expect(source).not.toMatch(/selectedAlternativeId:\s*["'`][0-9a-f-]{36}["'`]/);
  });

  test("engine transacional (complete_student_attempt) não foi tocada — mesma chamada RPC, mesmo p_expected_updated_at", () => {
    const source = read(COMPLETION_LIB);
    expect(source).toContain('supabase.rpc("complete_student_attempt"');
    expect(source).toContain("p_expected_updated_at: attempt.updated_at");
  });

  test("idempotência: attempt já completed devolve o result_id existente (lido, nunca recriado) em vez de travar o chamador", () => {
    const source = read(COMPLETION_LIB);
    const blockIndex = source.indexOf('if (completeResult.status === "completed") {');
    expect(blockIndex).toBeGreaterThan(-1);
    const block = source.slice(blockIndex, source.indexOf("existingResultId = existingResult?.id || null;", blockIndex) + 60);
    expect(block).toContain('.from("simulado_results")');
    expect(block).toContain('.select("id")');
    expect(block).not.toContain(".insert(");
  });

  test("submit/route.ts delega para a função compartilhada — não duplica scoring/RPC", () => {
    const source = read(SUBMIT_ROUTE);
    expect(source).toContain('import { completeSimuladoAttempt } from "@/lib/server/simuladoAttemptCompletion";');
    expect(source).toContain('origin: "manual"');
    expect(source).not.toContain("computeSimuladoAttemptResult(");
    expect(source).not.toContain('supabase.rpc("complete_student_attempt"');
  });
});

test.describe("6. Retomada de attempt vencida — não é devolvida como editável", () => {
  test("attempts/route.ts calcula isExpired a partir de existing.expires_at (banco) antes de decidir o que devolver", () => {
    const source = read(ATTEMPTS_ROUTE);
    expect(source).toContain('const isExpired = Boolean(existing.expires_at) && new Date(existing.expires_at as string).getTime() <= Date.now();');
  });

  test("CASO 9: quando NÃO expirado, o fluxo normal (buildAttemptResponse, com questions/answers) continua sendo usado", () => {
    const source = read(ATTEMPTS_ROUTE);
    const ifIndex = source.indexOf("if (isExpired) {");
    const afterBlock = source.slice(ifIndex, ifIndex + 1500);
    expect(afterBlock).toContain("return buildAttemptResponse(supabase, existing, simulado, attemptLimit);");
  });

  test("CASO 10: quando expirado, a resposta não inclui questions/answers — só attempt + needs_timeout_completion", () => {
    const source = read(ATTEMPTS_ROUTE);
    const ifIndex = source.indexOf("if (isExpired) {");
    expect(ifIndex).toBeGreaterThan(-1);
    const block = source.slice(ifIndex, source.indexOf("return buildAttemptResponse", ifIndex));
    expect(block).toContain("needs_timeout_completion: true");
    expect(block).not.toContain("questions:");
    expect(block).not.toContain("answers:");
  });

  test("client: ao ver needs_timeout_completion, nunca chama bindAttempt (nunca renderiza a prova como editável) — agenda o encerramento via pendingTimeoutAttempt", () => {
    const source = read(RUNNER);
    const ifIndex = source.indexOf("if (json.needs_timeout_completion) {");
    expect(ifIndex).toBeGreaterThan(-1);
    const block = source.slice(ifIndex, source.indexOf("return;", ifIndex) + 10);
    expect(block).not.toContain("bindAttempt(json)");
    expect(block).toContain("setPendingTimeoutAttempt({");
  });

  test("efeito dedicado dispara submitAttempt(true, ...) quando pendingTimeoutAttempt é setado — declarado depois de submitAttempt (nunca referenciado antes de sua declaração, evita o erro estático de react-hooks/immutability)", () => {
    const source = read(RUNNER);
    const effectIndex = source.indexOf("if (!pendingTimeoutAttempt) return;");
    expect(effectIndex).toBeGreaterThan(-1);
    const block = source.slice(effectIndex, effectIndex + 300);
    expect(block).toContain("submitAttempt(true, {");
    // A declaração de submitAttempt (useCallback) precisa vir ANTES desta
    // posição no arquivo — nunca depois.
    const submitAttemptDeclIndex = source.indexOf("const submitAttempt = useCallback(");
    expect(submitAttemptDeclIndex).toBeGreaterThan(-1);
    expect(submitAttemptDeclIndex).toBeLessThan(effectIndex);
  });

  test("CASO 11: submitAttempt aceita overrides (attemptId/timeSpentSeconds) — não depende do estado React `attempt`, que nunca foi setado com questions/answers nesse caminho", () => {
    const source = read(RUNNER);
    expect(source).toContain("overrides?: { attemptId?: string; timeSpentSeconds?: number }");
    expect(source).toContain("const attemptId = overrides?.attemptId || attempt?.id;");
  });
});

test.describe("7. Retry controlado e idempotência no client", () => {
  test("retry é bounded (AUTO_SUBMIT_MAX_ATTEMPTS) e espaçado (AUTO_SUBMIT_RETRY_DELAY_MS) — nunca loop apertado", () => {
    const source = read(RUNNER);
    expect(source).toContain("const AUTO_SUBMIT_MAX_ATTEMPTS = 3;");
    expect(source).toContain("const AUTO_SUBMIT_RETRY_DELAY_MS = 4_000;");
    expect(source).toContain("autoSubmitAttemptsRef.current < AUTO_SUBMIT_MAX_ATTEMPTS");
  });

  test("CASO 12: retry só é agendado para submissões automáticas (auto=true) — envio manual nunca entra em retry automático", () => {
    const source = read(RUNNER);
    const failIndex = source.indexOf("if (!res.ok || !json.ok) {", source.indexOf("const submitAttempt = useCallback"));
    const block = source.slice(failIndex, failIndex + 1600);
    expect(block).toContain("if (!auto) {");
    expect(block).toContain("autoSubmitTriggeredRef.current = false;");
    expect(block).toContain("} else if (autoSubmitAttemptsRef.current < AUTO_SUBMIT_MAX_ATTEMPTS) {");
  });

  test("retry pendente é cancelado ao iniciar um novo submit e ao desmontar o componente (nenhuma corrida de timers órfãos)", () => {
    const source = read(RUNNER);
    expect(source).toContain("if (autoSubmitRetryTimeoutRef.current !== null) {");
    expect(source).toContain("window.clearTimeout(autoSubmitRetryTimeoutRef.current);");
    const cleanupIndex = source.indexOf("Cancela um retry de auto-submit ainda pendente");
    expect(cleanupIndex).toBeGreaterThan(-1);
  });

  test("mensagem de 'tempo esgotado' substitui a mensagem técnica de branco enquanto há retry pendente (nunca mostra as duas ao mesmo tempo)", () => {
    const source = read(RUNNER);
    expect(source).toContain('"Tempo esgotado. Seu simulado está sendo finalizado com as respostas registradas até este momento."');
    expect(source).toContain("{submitError && !isAutoSubmitting && (");
  });

  test("CASO 13 (idempotência): se o servidor disser que a tentativa já estava completed, o client navega até o result_id existente em vez de travar", () => {
    const source = read(RUNNER);
    expect(source).toContain("if (json.result_id) {");
    const idx = source.indexOf("if (json.result_id) {");
    const block = source.slice(idx, idx + 200);
    expect(block).toContain('setPhase("done")');
    expect(block).toContain("router.replace(buildResultUrl(attemptId))");
  });

  test("nenhum submit duplicado: submittingRef ainda guarda contra chamadas concorrentes a partir do mesmo client", () => {
    const source = read(RUNNER);
    expect(source).toContain("if (submittingRef.current) return;");
  });
});

test.describe("8. Preservado sem alteração (auditado, não tocado)", () => {
  test("save_student_attempt_answer já rejeitava (410) resposta após expires_at — migration não foi alterada", () => {
    const sql = read(MIGRATION);
    expect(sql).toContain("if a.expires_at < clock_timestamp() then");
    expect(sql).toContain("return jsonb_build_object('ok', false, 'http_status', 410, 'message', 'Tempo esgotado.');");
  });

  test("lock_student_attempt (row lock for update) preservado — já serializa os cenários de concorrência considerados", () => {
    const sql = read(MIGRATION);
    expect(sql).toContain("select * into a from public.simulado_attempts where id = p_attempt_id for update;");
  });

  test("complete_student_attempt continua atômico: insere simulado_results e marca completed na mesma transação, sem nenhuma condição de expires_at adicionada", () => {
    const sql = read(MIGRATION);
    const fnIndex = sql.indexOf("create or replace function public.complete_student_attempt(");
    const fnBody = sql.slice(fnIndex, sql.indexOf("$$;", fnIndex));
    expect(fnBody).toContain("insert into public.simulado_results");
    expect(fnBody).toContain("update public.simulado_attempts set status = 'completed'");
    expect(fnBody).not.toContain("expires_at");
  });

  test("lib/simuladoScoring.ts não foi alterado por esta Sprint — questão sem resposta continua classificada como blank pela mesma regra de sempre", () => {
    const source = read(SCORING);
    expect(source).toContain('if (!selectedAlternativeId && !selectedAlternativeLabel) {');
    expect(source).toContain('classification: "blank"');
  });

  test("nenhuma alteração de threshold >50%/counts_toward_limit neste arquivo — a regra vive só na RPC (migration), nunca recalculada aqui", () => {
    const source = read(SUBMIT_ROUTE);
    expect(source).not.toContain("counts_toward_limit =");
    expect(source).not.toMatch(/>\s*0\.5/);
  });
});

test.describe("9. Regra documental obrigatória", () => {
  test("Sprint-simulados.md distingue explicitamente finalização voluntária de encerramento por tempo", () => {
    const source = read("docs/Sprint-simulados.md");
    expect(source).toMatch(/finaliza[çc][ãa]o volunt[áa]ria/i);
    expect(source).toMatch(/encerramento (compuls[óo]rio )?por tempo/i);
  });

  test("status-atual.md registra a auditoria histórica com números reais (não estimativa)", () => {
    const source = read("docs/status-atual.md");
    expect(source).toMatch(/18 tentativas/);
    expect(source).toContain("Nenhum backfill foi feito");
  });
});

// ─── Timeout server-side (job de cron) — continuação desta mesma Sprint,
// 2026-09-10. Origem: o inventário remoto encontrou 18 attempts vencidas e
// nunca fechadas (o aluno nunca voltou à página) — timeout com página aberta
// e retomada de attempt vencida (seções 1-9 acima) resolvem quando o aluno
// volta; este job fecha as que nunca mais são revisitadas. ────────────────

test.describe("10. Cron de timeout — autenticação (mesmo padrão de release-job/status-job)", () => {
  test("reaproveita verifyCronSecret (não inventa auth própria)", () => {
    const source = read(CRON_ROUTE);
    expect(source).toContain('import { verifyCronSecret } from "@/app/lib/server/cronAuth";');
    expect(source).toContain("const cronError = verifyCronSecret(request);");
    expect(source).toContain("if (cronError) return cronError;");
  });

  test("verifyCronSecret rejeita ausência/erro de secret com timingSafeEqual (não authenticated/anon comum)", () => {
    const source = read("app/lib/server/cronAuth.ts");
    expect(source).toContain("timingSafeEqual(expectedBuffer, suppliedBuffer)");
    expect(source).toContain('{ status: 401 }');
  });
});

test.describe("11. Cron de timeout — seleção de candidatos", () => {
  test("filtra status=in_progress, is_preview=false, contexto elegível (event/jornada), expires_at não nulo e já vencido", () => {
    const source = read(CRON_ROUTE);
    expect(source).toContain('.eq("status", "in_progress")');
    expect(source).toContain('.eq("is_preview", false)');
    expect(source).toContain('.in("attempt_context", ELIGIBLE_CONTEXTS)');
    expect(source).toContain('.not("expires_at", "is", null)');
    expect(source).toContain('.lte("expires_at", nowIso)');
    expect(source).toContain('const ELIGIBLE_CONTEXTS = ["event", "jornada"];');
  });

  test("standalone não está na whitelist de contextos elegíveis (legado, decisão explícita documentada)", () => {
    const source = read(CRON_ROUTE);
    const listIndex = source.indexOf('const ELIGIBLE_CONTEXTS = ["event", "jornada"];');
    expect(listIndex).toBeGreaterThan(-1);
    expect(source).not.toMatch(/ELIGIBLE_CONTEXTS = \[[^\]]*standalone/);
  });

  test("marco de ativação (AUTO_TIMEOUT_ACTIVATION_AT) protege o backlog histórico — documentado, não escondido", () => {
    const source = read(CRON_ROUTE);
    expect(source).toContain('const AUTO_TIMEOUT_ACTIVATION_AT = "2026-09-10T18:20:00.000Z";');
    expect(source).toContain('.gte("expires_at", AUTO_TIMEOUT_ACTIVATION_AT)');
    expect(source).toMatch(/MARCO DE ATIVA[ÇC][ÃA]O/);
    expect(source).toMatch(/18 tentativas/);
  });

  test("ordenação determinística (expires_at asc, id asc) e lote limitado (BATCH_SIZE)", () => {
    const source = read(CRON_ROUTE);
    expect(source).toContain('.order("expires_at", { ascending: true })');
    expect(source).toContain('.order("id", { ascending: true })');
    expect(source).toContain(".limit(BATCH_SIZE)");
    expect(source).toContain("const BATCH_SIZE = 50;");
  });
});

test.describe("12. Cron de timeout — reaproveitamento da engine (nunca duplicada)", () => {
  test("chama completeSimuladoAttempt com origin: \"timeout_cron\" — nenhum scoring/RPC próprio no job", () => {
    const source = read(CRON_ROUTE);
    expect(source).toContain('import { completeSimuladoAttempt } from "@/lib/server/simuladoAttemptCompletion";');
    expect(source).toContain('origin: "timeout_cron"');
    expect(source).not.toContain("computeSimuladoAttemptResult(");
    expect(source).not.toContain('supabase.rpc("complete_student_attempt"');
  });

  test("origin diferencia manual/cron no log de auditoria sem criar schema novo (mesmo campo metadata JSONB já existente)", () => {
    const source = read(COMPLETION_LIB);
    expect(source).toContain('actorType: origin === "timeout_cron" ? "system" : "student"');
    expect(source).toContain("completion_origin: origin,");
  });

  test("studentId/simuladoId vêm sempre da própria linha selecionada pelo cron (attempt.student_id) — nunca de um input externo não verificado", () => {
    const source = read(CRON_ROUTE);
    expect(source).toContain("studentId: row.student_id,");
    expect(source).toContain("simuladoId: row.simulado_id,");
  });
});

test.describe("13. Cron de timeout — concorrência, idempotência, isolamento de falha", () => {
  test("409 (já terminal) é tratado como estado esperado, não como falha — mesma semântica de idempotência da engine", () => {
    const source = read(CRON_ROUTE);
    const idx = source.indexOf('} else if (result.httpStatus === 409) {');
    expect(idx).toBeGreaterThan(-1);
    const block = source.slice(idx, source.indexOf("} else {", idx));
    expect(block).toContain("alreadyTerminal++;");
    expect(block).not.toContain("failed++;");
  });

  test("falha isolada por tentativa (try/catch por item) nunca interrompe o restante do lote", () => {
    const source = read(CRON_ROUTE);
    const loopIndex = source.indexOf("for (const row of rows) {");
    expect(loopIndex).toBeGreaterThan(-1);
    const loopBody = source.slice(loopIndex, source.indexOf("\n    }\n", loopIndex));
    expect(loopBody).toContain("try {");
    expect(loopBody).toContain("} catch (attemptError) {");
    expect(loopBody).not.toContain("throw attemptError");
  });

  test("resposta final é sempre { ok, processed, completed, already_terminal, failed, message } — nunca PII (nome/e-mail/CPF)", () => {
    const source = read(CRON_ROUTE);
    const returnIndex = source.indexOf("return NextResponse.json({\n      ok: true,");
    expect(returnIndex).toBeGreaterThan(-1);
    const returnBlock = source.slice(returnIndex, returnIndex + 300);
    expect(returnBlock).not.toMatch(/student(Name|Email)/i);
    expect(returnBlock).not.toContain("row.id");
    expect(returnBlock).toContain("processed");
    expect(returnBlock).toContain("completed");
    expect(returnBlock).toContain("already_terminal");
    expect(returnBlock).toContain("failed");
  });
});

test.describe("14. Registro do job (vercel.json) e documentação", () => {
  test("vercel.json registra o cron diário (mesma limitação de frequência dos jobs existentes — plano Hobby)", () => {
    const source = read("vercel.json");
    expect(source).toContain('"path": "/api/admin/simulados/attempts-timeout-job"');
    expect(source).toMatch(/"schedule":\s*"0 9 \* \* \*"/);
  });

  test("Sprint-simulados.md documenta o job, o marco de ativação e o atraso máximo esperado", () => {
    const source = read("docs/Sprint-simulados.md");
    expect(source).toMatch(/timeout server-side/i);
    expect(source).toMatch(/marco de ativa[çc][ãa]o/i);
  });
});
