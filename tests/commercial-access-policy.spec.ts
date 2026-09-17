import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Política comercial de bloqueio Hotmart em tentativas de simulado (Fase 4B,
// fechada por decisão registrada em conversa — sem doc dedicado ainda; ver
// docs/Sprint-integracao-hotmart.md seções 5.2/9.2/17/18 para as regras de
// bloqueio em si). Resumo da política:
//
//   A. Bloqueio comercial impede NOVAS ações interativas do aluno.
//   B. Bloqueio comercial NÃO impede o sistema de finalizar deterministicamente
//      uma tentativa já existente (timeout cron / reconciliação histórica).
//   C/D. Timeout cron e reconciliação histórica continuam funcionando durante
//      o bloqueio — nenhum dos dois chama o guard comercial.
//   E. simuladoAttemptCompletion.ts (motor central) nunca recebe guard
//      comercial genérico.
//   I. owl-help e behavior permanecem bloqueados durante acesso inativo.
//   J. abandon é ação interativa e é bloqueada.
//   K. Anti-cheat (violação de foco) continua registrando e desclassificando
//      mesmo durante bloqueio — a rota NUNCA recebe o guard comercial,
//      tanto na dedicada (focus-violation/route.ts) quanto no endpoint
//      legado duplicado ([attemptId]/route.ts), para não deixar os dois
//      comportamentos divergentes.
//
// Cobertura estrutural (assinaturas de código-fonte), mesmo padrão de
// tests/attempt-timeout-completion.spec.ts — sem Postgres/browser real.

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n/g, "\n");

const GUARD_LIB = "lib/server/studentAssertions.ts";
const GUARD_NAME = "assertAttemptCommercialAccess";

const ANSWERS_ROUTE = "app/api/student/simulados/[id]/attempts/[attemptId]/answers/route.ts";
const BEHAVIOR_ROUTE = "app/api/student/simulados/[id]/attempts/[attemptId]/behavior/route.ts";
const OWL_HELP_ROUTE = "app/api/student/simulados/[id]/attempts/[attemptId]/owl-help/route.ts";
const SUBMIT_ROUTE = "app/api/student/simulados/[id]/attempts/[attemptId]/submit/route.ts";
const ABANDON_ROUTE = "app/api/student/simulados/[id]/attempts/[attemptId]/abandon/route.ts";
const FOCUS_VIOLATION_ROUTE = "app/api/student/simulados/[id]/attempts/[attemptId]/focus-violation/route.ts";
const LEGACY_ATTEMPT_ROUTE = "app/api/student/simulados/[id]/attempts/[attemptId]/route.ts";
const ATTEMPTS_ROUTE = "app/api/student/simulados/[id]/attempts/route.ts";
const RESULTADO_ROUTE = "app/api/student/simulados/[id]/resultado/route.ts";
const COMPLETION_LIB = "lib/server/simuladoAttemptCompletion.ts";
const CRON_ROUTE = "app/api/admin/simulados/attempts-timeout-job/route.ts";
const RECONCILE_SCRIPT = "scripts/reconcile-expired-attempts.ts";

test.describe("1/2/3/4. Helper central — assertAttemptCommercialAccess", () => {
  const source = read(GUARD_LIB);

  test(`${GUARD_LIB} exporta ${GUARD_NAME}`, () => {
    expect(source).toContain(`export async function ${GUARD_NAME}(`);
  });

  test("bloqueia por Evento via simulado_event_participants.access_status", () => {
    expect(source).toContain('.from("simulado_event_participants")');
    expect(source).toContain("access_status");
    expect(source).toContain('code: "EVENT_ACCESS_BLOCKED"');
  });

  test("bloqueia por Jornada via student_jornadas.status/expires_at", () => {
    expect(source).toContain('.from("student_jornada_simulados")');
    expect(source).toContain('code: "JORNADA_ACCESS_BLOCKED"');
    expect(source).toContain("enrollment.expires_at <= today");
  });

  test("standalone (nem event_participant_id nem student_jornada_simulado_id) nunca é bloqueado — nenhum dos dois ifs se aplica, função retorna null", () => {
    const guardBody = source.slice(source.indexOf(`export async function ${GUARD_NAME}(`));
    const returnNullIndex = guardBody.indexOf("return null;");
    const secondIfIndex = guardBody.indexOf("if (attempt.student_jornada_simulado_id)");
    expect(returnNullIndex).toBeGreaterThan(secondIfIndex);
  });
});

test.describe("5/6/7. Rotas interativas bloqueadas durante acesso comercial inativo (answer/behavior/owl-help)", () => {
  for (const routePath of [ANSWERS_ROUTE, BEHAVIOR_ROUTE, OWL_HELP_ROUTE]) {
    test(`${routePath} chama o guard comercial antes de processar a ação`, () => {
      const source = read(routePath);
      expect(source).toContain(`import { ${GUARD_NAME} } from "@/lib/server/studentAssertions";`);
      expect(source).toContain(`await ${GUARD_NAME}(student.id, attemptId, supabase)`);
      expect(source).toContain("if (commercialAccessError) return commercialAccessError;");
    });
  }
});

test.describe("8. Submit manual bloqueado, mas sem tocar o motor de conclusão", () => {
  const source = read(SUBMIT_ROUTE);

  test("submit/route.ts chama o guard comercial antes de completeSimuladoAttempt", () => {
    expect(source).toContain(`import { ${GUARD_NAME} } from "@/lib/server/studentAssertions";`);
    const guardIndex = source.indexOf(`await ${GUARD_NAME}(`);
    const completionIndex = source.indexOf("await completeSimuladoAttempt(");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(completionIndex).toBeGreaterThan(guardIndex);
  });

  test("origin continua sendo \"manual\" — guard não altera a assinatura da chamada ao motor", () => {
    expect(source).toContain('origin: "manual"');
  });
});

test.describe("9. Abandon (ação interativa explícita) bloqueado", () => {
  test(`${ABANDON_ROUTE} chama o guard comercial antes do RPC de abandono`, () => {
    const source = read(ABANDON_ROUTE);
    expect(source).toContain(`import { ${GUARD_NAME} } from "@/lib/server/studentAssertions";`);
    const guardIndex = source.indexOf(`await ${GUARD_NAME}(`);
    const rpcIndex = source.indexOf('supabase.rpc("abandon_student_attempt"');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(rpcIndex).toBeGreaterThan(guardIndex);
  });
});

test.describe("10/11. Timeout cron e reconciliação histórica continuam encerrando durante bloqueio", () => {
  test(`${CRON_ROUTE} nunca importa nem chama o guard comercial`, () => {
    const source = read(CRON_ROUTE);
    expect(source).not.toContain(GUARD_NAME);
    expect(source).toContain('origin: "timeout_cron"');
  });

  test(`${RECONCILE_SCRIPT} nunca importa nem chama o guard comercial`, () => {
    const source = read(RECONCILE_SCRIPT);
    expect(source).not.toContain(GUARD_NAME);
  });

  test(`${COMPLETION_LIB} (motor central) nunca importa nem chama o guard comercial — regra E da política`, () => {
    const source = read(COMPLETION_LIB);
    expect(source).not.toContain(GUARD_NAME);
    expect(source).not.toContain('from "@/lib/server/studentAssertions"');
  });
});

test.describe("12/13. Anti-cheat (violação de foco) nunca é bloqueado pelo guard comercial", () => {
  for (const routePath of [FOCUS_VIOLATION_ROUTE, LEGACY_ATTEMPT_ROUTE]) {
    test(`${routePath} nunca importa nem chama o guard comercial — desclassificação deve ocorrer mesmo durante bloqueio`, () => {
      const source = read(routePath);
      expect(source).not.toContain(GUARD_NAME);
    });
  }

  test("os dois endpoints de violação de foco têm o mesmo comportamento comercial (nenhum guarda, nenhum diverge do outro)", () => {
    const dedicated = read(FOCUS_VIOLATION_ROUTE);
    const legacy = read(LEGACY_ATTEMPT_ROUTE);
    expect(dedicated.includes(GUARD_NAME)).toBe(legacy.includes(GUARD_NAME));
  });
});

test.describe("16/17. Criação e retomada de tentativa bloqueadas por contexto", () => {
  test(`${ATTEMPTS_ROUTE} rejeita criação/retomada de Evento com access_status inativo (checagem ocorre antes de existing/resume)`, () => {
    const source = read(ATTEMPTS_ROUTE);
    expect(source).toContain('participant.access_status !== "active"');
    const eventCheckIndex = source.indexOf('participant.access_status !== "active"');
    const resumeIndex = source.indexOf("if (existing) {");
    expect(eventCheckIndex).toBeGreaterThan(-1);
    expect(resumeIndex).toBeGreaterThan(eventCheckIndex);
  });

  test(`${ATTEMPTS_ROUTE} já valida Jornada por status/expires_at (preservado, não introduzido por esta política)`, () => {
    const source = read(ATTEMPTS_ROUTE);
    expect(source).toContain('studentJornada.status !== "active" || studentJornada.expires_at <= today');
  });
});

test.describe("14/18/19. Resultado permanece oculto durante bloqueio; histórico nunca é apagado", () => {
  const source = read(RESULTADO_ROUTE);

  test(`${RESULTADO_ROUTE} bloqueia visualização por Evento (código EVENT_ACCESS_BLOCKED) e por Jornada (JORNADA_ACCESS_BLOCKED)`, () => {
    expect(source).toContain('code: "EVENT_ACCESS_BLOCKED"');
    expect(source).toContain('code: "JORNADA_ACCESS_BLOCKED"');
  });

  test("nenhuma chamada de delete/apagar em simulado_results ou simulado_attempts nesta rota", () => {
    expect(source).not.toMatch(/\.from\("simulado_results"\)[\s\S]{0,40}\.delete\(/);
    expect(source).not.toMatch(/\.from\("simulado_attempts"\)[\s\S]{0,40}\.delete\(/);
  });

  test(`${COMPLETION_LIB} nunca apaga simulado_attempts/simulado_results — apenas insere/atualiza`, () => {
    const completionSource = read(COMPLETION_LIB);
    expect(completionSource).not.toMatch(/\.delete\(/);
  });
});
