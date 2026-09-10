import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Nota metodológica: `lib/server/simuladoEvents.ts` importa "server-only",
// pacote resolvido apenas pelo bundler do Next (não existe em node_modules,
// não é dependência declarada em package.json — confirmado por auditoria).
// Por isso estes testes seguem o mesmo padrão já usado por
// tests/event-operations/event-operations.spec.ts: leem o código-fonte real
// e verificam a estrutura de decisão exata, em vez de importar o módulo.
// Cada teste mapeia para um cenário funcional concreto da regra "tentativa
// representativa = primeira tentativa concluída válida".

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const HELPER_PATH = "lib/server/simuladoEvents.ts";
const ATTEMPTS_ROUTE = "app/api/student/simulados/[id]/attempts/route.ts";
// Extraído em 2026-09-10 (Sprint "Timeout server-side"): a chamada ao RPC e
// a consolidação do representative saíram de submit/route.ts para esta
// função compartilhada (reaproveitada também pelo job de timeout server-side).
const COMPLETION_LIB = "lib/server/simuladoAttemptCompletion.ts";
const PROFESSOR_ROUTE = "app/api/professor/events/[id]/route.ts";
const ADMIN_PARTICIPANT_ROUTE = "app/api/admin/events/[id]/participants/[studentId]/route.ts";

test.describe("regra: tentativa representativa = primeira tentativa concluída válida", () => {
  test("helper único existe e centraliza a regra em lib/server/simuladoEvents.ts", () => {
    const source = read(HELPER_PATH);
    expect(source).toContain("export async function consolidateEventRepresentativeAttempt(");
    // A regra final é sobre a tentativa em si (completed + counts_toward_limit),
    // nunca sobre "criada primeiro" ou "mais recente".
    expect(source).toContain('candidateAttempt.status === "completed" && candidateAttempt.counts_toward_limit');
    expect(source).toContain('currentAttempt.status === "completed" && currentAttempt.counts_toward_limit');
  });

  test("cenário: candidato disqualified/expired/abandoned/in_progress nunca é gravado — a função valida a própria tentativa recebida, não confia apenas no chamador", () => {
    const source = read(HELPER_PATH);
    // A função busca o status do PRÓPRIO attemptId recebido antes de decidir
    // qualquer coisa, e sai sem escrever se ele não for completed+counts_toward_limit.
    const candidateCheckIndex = source.indexOf("candidateIsValid");
    const earlyReturnIndex = source.indexOf("if (!candidateIsValid) return;");
    expect(candidateCheckIndex).toBeGreaterThan(-1);
    expect(earlyReturnIndex).toBeGreaterThan(candidateCheckIndex);
    // Essa validação acontece ANTES de qualquer leitura/escrita em
    // simulado_event_participants (ou seja, antes do "único ponto de
    // consolidação" decidir sequer se há um representante para comparar).
    const participantSelectIndex = source.indexOf('.select("representative_attempt_id")');
    expect(participantSelectIndex).toBeGreaterThan(-1);
    expect(earlyReturnIndex).toBeLessThan(participantSelectIndex);
  });

  test("cenário 8 / 11: representante atual já válido (completed+counts_toward_limit) nunca é substituído — primeira tentativa válida permanece", () => {
    const source = read(HELPER_PATH);
    const currentValidCheck = source.indexOf("const currentIsValid = Boolean(currentAttempt");
    const earlyReturn = source.indexOf("if (currentIsValid) return;");
    expect(currentValidCheck).toBeGreaterThan(-1);
    expect(earlyReturn).toBeGreaterThan(currentValidCheck);
    // O early return acontece ANTES do UPDATE — nenhuma escrita ocorre quando
    // já existe uma representativa válida.
    const updateIndex = source.indexOf('.update({ representative_attempt_id: attemptId })');
    expect(earlyReturn).toBeLessThan(updateIndex);
  });

  test("cenário 2/3/4/7/12: representante atual inválido (disqualified/expired/abandoned/inexistente) é substituído por uma completed válida, via CAS pelo valor antigo", () => {
    const source = read(HELPER_PATH);
    // O guard de escrita usa o valor LIDO anteriormente (currentRepresentativeId),
    // nunca um valor recalculado depois — isso é o que torna a substituição
    // segura mesmo com o representante atual sendo qualquer status inválido
    // (a função não filtra por status específico do atual: só checa se ele
    // NÃO é completed+counts_toward_limit, cobrindo disqualified, expired,
    // abandoned, in_progress ou um id inexistente/nulo).
    expect(source).toContain(
      'query = currentRepresentativeId ? query.eq("representative_attempt_id", currentRepresentativeId) : query.is("representative_attempt_id", null);',
    );
  });

  test("cenário 9: independência por Evento é garantida estruturalmente pelo schema, não por lógica de aplicação", () => {
    const migration = read("supabase/migrations/20260820120000_create_simulado_events.sql");
    // Um aluno tem no máximo uma linha (e portanto um representative_attempt_id
    // próprio) por Evento — dois Eventos para o mesmo aluno nunca compartilham
    // a mesma linha/campo.
    expect(migration).toContain("create unique index if not exists unique_simulado_event_participants");
    expect(migration).toContain("on public.simulado_event_participants (event_id, student_id);");
  });

  test("D/E: não há escrita prematura na criação nem na retomada de tentativa em app/api/student/simulados/[id]/attempts/route.ts", () => {
    const source = read(ATTEMPTS_ROUTE);
    expect(source).not.toContain('.update({ representative_attempt_id: existing.id })');
    expect(source).not.toContain('.update({ representative_attempt_id: created.id })');
    expect(source).not.toMatch(/representative_attempt_id:\s*(existing|created)\.id/);
    // O comentário explicando a decisão precisa continuar presente nos dois
    // pontos (criação e retomada), documentando por que não se grava mais ali.
    expect(source.match(/consolidateEventRepresentativeAttempt/g)?.length).toBeGreaterThanOrEqual(2);
  });

  test("F: submit só chama o helper DEPOIS de persistir status=completed e counts_toward_limit=true — em nenhum outro estado (atualizado 2026-09-10: persistência transacional via RPC, extraída para lib/server/simuladoAttemptCompletion.ts, reaproveitada pelo job de timeout server-side)", () => {
    const source = read(COMPLETION_LIB);
    expect(source).toContain('import { consolidateEventRepresentativeAttempt, releasePendingEventResults } from "@/lib/server/simuladoEvents";');
    // status=completed + counts_toward_limit=true agora são persistidos
    // atomicamente dentro da transação SQL de complete_student_attempt
    // (supabase/migrations/20260909170000_atomic_attempt_transitions.sql),
    // não mais em dois passos TypeScript separados. O helper só pode ser
    // chamado depois que a chamada ao RPC retornar e o resultado for
    // confirmado ok (completeResult.ok) — nunca antes, e nunca se a
    // persistência falhar/for rejeitada (ex.: concorrência otimista).
    const rpcCallIndex = source.indexOf('supabase.rpc("complete_student_attempt"');
    const okCheckIndex = source.indexOf("if (!completeResult.ok)");
    const consolidateCallIndex = source.indexOf("await consolidateEventRepresentativeAttempt(supabase,");
    expect(rpcCallIndex).toBeGreaterThan(-1);
    expect(okCheckIndex).toBeGreaterThan(rpcCallIndex);
    expect(consolidateCallIndex).toBeGreaterThan(okCheckIndex);
    const migration = read("supabase/migrations/20260909170000_atomic_attempt_transitions.sql");
    expect(migration).toContain("update public.simulado_attempts set status = 'completed', submitted_at = r.finished_at,");
    expect(migration).toContain("time_spent_seconds = r.time_spent_seconds, counts_toward_limit = true, counted_at = coalesce(counted_at, r.finished_at),");
    // Só existe UMA chamada ao helper neste arquivo (não há um segundo
    // caminho paralelo de consolidação).
    expect(source.match(/consolidateEventRepresentativeAttempt\(/g)?.length).toBe(1);
  });

  test("dashboard do Professor: quando não há representante válido nem tentativa em andamento, usa a mais recente só para EXIBIR a situação real — nunca escreve representative_attempt_id", () => {
    const source = read(PROFESSOR_ROUTE);
    expect(source).not.toMatch(/\.update\(\s*\{\s*representative_attempt_id/);
    expect(source).toContain("const latestNonRepresentativeAttempt = !representativeAttempt && !activeAttempt");
    expect(source).toContain("const displayedAttempt = activeAttempt || representativeAttempt || latestNonRepresentativeAttempt;");
    // Cenário #1 disqualified + #2 completed: representativeAttempt já é a #2
    // (helper garante isso), então displayedAttempt === representativeAttempt
    // e o status cai no branco "completed" — a #1 desclassificada nunca é
    // usada para status nem para resultado quando existe uma válida.
    expect(source).toContain('if (displayedAttempt?.status === "in_progress") status = "in_progress";');
    expect(source).toContain('else if (displayedAttempt?.status === "completed") status = "completed";');
  });

  test("reset administrativo continua sendo a única escrita fora do helper, e é uma limpeza explícita (null), não uma atribuição de tentativa", () => {
    const source = read(ADMIN_PARTICIPANT_ROUTE);
    expect(source).toContain('.update({ representative_attempt_id: null, result_released_at: null })');
    expect(source).not.toMatch(/representative_attempt_id:\s*[a-zA-Z_.]+\.id/);
  });

  test("único ponto de escrita não-nula de representative_attempt_id em todo o repositório é o helper", () => {
    const glob = execSync('grep -rn "representative_attempt_id:" --include=*.ts app lib', {
      cwd: root,
      encoding: "utf8",
    });
    const writeLines = glob
      .split("\n")
      .filter((line) => line.length > 0)
      .filter((line) => !line.includes("representative_attempt_id: participant.representative_attempt_id")) // leitura/passagem de dados, não escrita
      .filter((line) => !line.includes("representative_attempt_id: null")); // reset administrativo, já coberto acima
    // Restam apenas linhas de tipos (`representative_attempt_id: string | null`)
    // e a escrita real dentro do helper.
    const realWrites = writeLines.filter((line) => !/representative_attempt_id:\s*string/.test(line));
    for (const line of realWrites) {
      expect(line).toContain("lib/server/simuladoEvents.ts");
    }
  });

  test("consumo de tentativa é preservado sem alteração: qualquer status com counts_toward_limit conta no limite, independentemente de virar resultado oficial", () => {
    const source = read(ATTEMPTS_ROUTE);
    // A contagem de tentativas usadas para o limite (max_attempts) continua
    // filtrando só por counts_toward_limit, sem exigir status === "completed"
    // — disqualified/expired/abandoned continuam consumindo tentativa.
    expect(source).toContain("const used = contextualAttempts.filter((row) => row.counts_toward_limit).length;");
  });
});
