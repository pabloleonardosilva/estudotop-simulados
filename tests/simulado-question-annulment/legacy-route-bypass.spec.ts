import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

// Fecha o Ponto 2 do pedido: nenhuma rota pode alterar
// simulado_questions.status (active ↔ annulled) sem passar pelo serviço
// central de reconciliação (setSimuladoQuestionAnnulment). Auditoria por
// leitura de código real — mesmo padrão já usado no resto desta pasta para
// arquivos "server-only" — mais uma busca global (ripgrep) por qualquer
// outro ponto de escrita que não tenha sido migrado.

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const LEGACY_PUT_ROUTE = "app/api/admin/simulados/[id]/questions/route.ts";
const ENGINE = "lib/server/simuladoQuestionReprocessing.ts";

test.describe("Ponto 2 — rota antiga não pode contornar a reconciliação", () => {
  test("A/C: PUT .../questions delega toda mudança de status (active↔annulled) para setSimuladoQuestionAnnulment — nunca escreve status via UPDATE direto", () => {
    const route = read(LEGACY_PUT_ROUTE);
    expect(route).toContain('import { setSimuladoQuestionAnnulment } from "@/lib/server/simuladoQuestionReprocessing";');
    expect(route).toContain("await setSimuladoQuestionAnnulment(supabase, {");

    // O UPDATE que grava order_number/points (sempre legítimo, não afeta
    // pontuação) explicitamente NÃO inclui `status` no payload.
    const updateOrderPointsMatch = route.match(/\.update\(\{ order_number: item\.order_number, points: item\.points \}\)/);
    expect(updateOrderPointsMatch).not.toBeNull();

    // Nenhum .update(...) em simulado_questions neste arquivo contém a chave
    // `status:` — a única forma de status mudar num vínculo JÁ EXISTENTE é
    // via setSimuladoQuestionAnnulment.
    const updateCalls = route.match(/\.from\("simulado_questions"\)\s*\n?\s*\.update\(\{[^}]*\}\)/g) || [];
    for (const call of updateCalls) {
      expect(call).not.toMatch(/\bstatus:/);
    }
  });

  test("B/D: criação de vínculo NOVO (insert) continua podendo definir status inicial diretamente — não há resultado prévio para reconciliar contra uma linha que ainda não existia", () => {
    const route = read(LEGACY_PUT_ROUTE);
    // POST (adicionar questão ao simulado): insert com status inicial "active".
    expect(route).toContain('status: "active",');
    // PUT (linhas novas dentro do salvamento em lote): insert com o status pedido.
    const newRowsBlock = route.slice(route.indexOf("const newRows ="), route.indexOf("if (newRows.length > 0)"));
    expect(newRowsBlock).toContain("status: item.status,");
  });

  test("corrida perdida (setSimuladoQuestionAnnulment retorna !ok) não derruba o salvamento em lote inteiro — vira aviso, nunca um UPDATE direto de status por fora do serviço central", () => {
    const route = read(LEGACY_PUT_ROUTE);
    expect(route).toContain("if (!outcome.ok) statusChangeWarnings.push(");
    expect(route).toContain("status_change_warnings: statusChangeWarnings");
  });

  test("setSimuladoQuestionAnnulment continua sendo o único ponto que escreve simulado_questions.status para um vínculo já existente (Admin, Professor e a rota legada, todos delegam ao mesmo serviço)", () => {
    const engine = read(ENGINE);
    expect(engine).toContain("export async function setSimuladoQuestionAnnulment(");
    expect(engine).toContain('.eq("status", relation.status)'); // CAS — ver concurrency.spec.ts

    const adminAnnulRoute = read("app/api/admin/simulados/[id]/questions/[relationId]/annul/route.ts");
    expect(adminAnnulRoute).toContain("await setSimuladoQuestionAnnulment(supabase, {");

    const professorAnnulRoute = read("app/api/professor/events/[id]/questions/[relationId]/annul/route.ts");
    expect(professorAnnulRoute).toContain("await setSimuladoQuestionAnnulment(supabase, {");

    const legacyRoute = read(LEGACY_PUT_ROUTE);
    expect(legacyRoute).toContain("await setSimuladoQuestionAnnulment(supabase, {");
  });

  test("pré-aplicação continua barata: reprocessSimulado sai cedo (sem custo, sem N+1) quando o Simulado ainda não tem nenhuma tentativa completed — então rotear TODA mudança de status (mesmo pré-aplicação) por setSimuladoQuestionAnnulment não introduz overhead real na montagem do Simulado", () => {
    const engine = read(ENGINE);
    const reprocessFn = engine.slice(engine.indexOf("export async function reprocessSimulado("), engine.indexOf("export async function setSimuladoQuestionAnnulment("));
    expect(reprocessFn).toContain("if (questions.length === 0) return { attemptsReprocessed: 0, resultsChanged: 0, notificationsCreated: 0, topcoinsResynced: 0 };");
    expect(reprocessFn).toContain("if (attempts.length === 0) return { attemptsReprocessed: 0, resultsChanged: 0, notificationsCreated: 0, topcoinsResynced: 0 };");
  });

  test("18: busca global (varredura real do repositório, não uma lista mantida à mão) — nenhum .update() encadeado diretamente em .from(\"simulado_questions\") grava `status:`, fora do motor central", () => {
    function walk(dir: string, files: string[] = []): string[] {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full, files);
        else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) files.push(full);
      }
      return files;
    }

    const allSourceFiles = [...walk(resolve(root, "app")), ...walk(resolve(root, "lib"))];
    // Âncora real: só conta como escrita em simulado_questions um
    // `.update(...)` encadeado DIRETAMENTE depois de `.from("simulado_questions")`
    // (com no máximo uma quebra de linha entre os dois, o estilo real do
    // código deste repositório) — evita falso positivo de um `.update({status:...})`
    // de OUTRA tabela que apareça no mesmo arquivo por outro motivo.
    const chainedUpdatePattern = /\.from\("simulado_questions"\)\s*\n?\s*\.update\(\{([^}]*)\}\)/g;
    const violations: string[] = [];

    for (const absolutePath of allSourceFiles) {
      const relativePath = absolutePath.slice(root.length + 1).replace(/\\/g, "/");
      if (relativePath.includes(".spec.ts")) continue;
      if (relativePath === ENGINE) continue; // motor central — permitido, auditado nos testes acima

      const content = readFileSync(absolutePath, "utf8");
      if (!content.includes('.from("simulado_questions")')) continue;

      for (const match of content.matchAll(chainedUpdatePattern)) {
        if (/\bstatus\s*:/.test(match[1])) violations.push(`${relativePath}: ${match[0].replace(/\s+/g, " ")}`);
      }
    }

    expect(violations).toEqual([]);
  });
});
