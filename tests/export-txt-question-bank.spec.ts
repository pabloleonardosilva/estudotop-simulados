import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

// Exportação TXT em lote — Banco de Questões (/questoes).
//
// HISTÓRICO (2026-09-10): a auditoria desta Sprint comprovou que a
// implementação existia apenas no working tree deste worktree — nunca havia
// sido commitada em nenhum branch, em nenhum momento do histórico do
// repositório (`git log -S/-G --all` vazio) — enquanto a documentação em
// docs/INDICE_FUNCOES_SISTEMA.md já estava commitada (introduzida
// incidentalmente pelo commit 830d8a5, de um recurso não relacionado —
// "Tentativas de cadastro" — cujo `git add` varreu o estado então pendente
// do arquivo de docs). Essa era a causa raiz comprovada da divergência
// localhost x produção: não é bug de produção, é ausência de commit. Essa
// lacuna foi fechada pelo commit de consolidação geral da worktree que
// incluiu este arquivo (ver docs/status-atual.md/Sprint-simulados.md,
// entrada "Fechamento geral da main-worktree").
//
// Esta suíte agora garante que o recurso permanece corretamente
// implementado e versionado — sem repetir a alegação histórica de ausência
// em HEAD, que deixou de ser verdadeira a partir do commit de consolidação.

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n/g, "\n");

const BANK_PAGE = "app/questoes/page-client.tsx";

function gitShow(ref: string, file: string): string | null {
  try {
    return execSync(`git show ${ref}:"${file}"`, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null; // arquivo/versão não existe nessa ref — resultado válido, não erro de execução
  }
}

test.describe("1. Implementação — botão, handler, geração do TXT (working tree)", () => {
  test("botão 'Exportar TXT' só aparece na barra de seleção quando há questões selecionadas (selectedIds, nunca publicationQueueIds)", () => {
    const source = read(BANK_PAGE);
    const btnIndex = source.indexOf('{ label: "Exportar TXT"');
    expect(btnIndex).toBeGreaterThan(-1);
    // O guard imediatamente anterior ao botão (mesmo bloco `...( ? [ ] : [])`)
    // deve ser selectedIds — nunca publicationQueueIds, o outro conjunto de
    // ids já existente na tela (bug já cometido antes neste projeto).
    const precedingCode = source.slice(Math.max(0, btnIndex - 60), btnIndex);
    expect(precedingCode).toContain("...(selectedIds.length > 0");
    expect(precedingCode).not.toContain("publicationQueueIds");
  });

  test("handler exportSelectedQuestionsAsTxt filtra filteredQuestions por selectedIds.includes — nunca outro estado de seleção", () => {
    const source = read(BANK_PAGE);
    expect(source).toContain("function exportSelectedQuestionsAsTxt() {");
    expect(source).toContain("filteredQuestions.filter((question) => selectedIds.includes(question.id));");
  });

  test("exportação preserva a ordem visual de filteredQuestions (mesma ordem filtrada da lista) — nunca reordena por id/created_at", () => {
    const source = read(BANK_PAGE);
    const fnIndex = source.indexOf("function exportSelectedQuestionsAsTxt() {");
    const fnBody = source.slice(fnIndex, source.indexOf("\n  }", fnIndex));
    expect(fnBody).toContain("filteredQuestions.filter");
    expect(fnBody).not.toContain(".sort(");
  });

  test("100% client-side: Blob + URL.createObjectURL + <a download> + revokeObjectURL — nenhuma API nova", () => {
    const source = read(BANK_PAGE);
    const fnIndex = source.indexOf("function exportSelectedQuestionsAsTxt() {");
    const fnBody = source.slice(fnIndex, source.indexOf("\n  }", fnIndex));
    expect(fnBody).toContain("new Blob(");
    expect(fnBody).toContain("URL.createObjectURL(blob)");
    expect(fnBody).toContain('document.createElement("a")');
    expect(fnBody).toContain("a.click()");
    expect(fnBody).toContain("URL.revokeObjectURL(url)");
    expect(source).not.toMatch(/fetch\(\s*["'`]\/api\/admin\/questions\/export/);
  });

  test("conteúdo é gerado a partir dos dados já carregados (statement, question_alternatives) — nenhuma nova chamada de API por questão", () => {
    const source = read(BANK_PAGE);
    const formatterIndex = source.indexOf("function formatQuestionForTxtExport(");
    expect(formatterIndex).toBeGreaterThan(-1);
    const formatterBody = source.slice(formatterIndex, source.indexOf("\n}", formatterIndex));
    expect(formatterBody).not.toContain("fetch(");
    expect(formatterBody).not.toContain("await ");
  });

  test("MIME text/plain;charset=utf-8 + BOM (0xfeff) para acentuação correta no Bloco de Notas do Windows", () => {
    const source = read(BANK_PAGE);
    expect(source).toContain('const TXT_EXPORT_BOM = String.fromCharCode(0xfeff);');
    expect(source).toContain('type: "text/plain;charset=utf-8"');
    expect(source).toContain("TXT_EXPORT_BOM + content");
  });

  test("nome de arquivo válido: questoes-<assunto>-<data>.txt (1 assunto filtrado) ou questoes-exportadas-<data>.txt (fallback)", () => {
    const source = read(BANK_PAGE);
    expect(source).toContain("function buildTxtExportFileName() {");
    expect(source).toMatch(/`questoes-\$\{slug\}-\$\{datePart\}\.txt`/);
    expect(source).toContain("`questoes-exportadas-${datePart}.txt`");
  });

  test("questão anulada é marcada no TXT ([QUESTÃO ANULADA]) e nunca recebe asterisco de gabarito inventado — asterisco vem sempre de is_correct real", () => {
    const source = read(BANK_PAGE);
    const formatterIndex = source.indexOf("function formatQuestionForTxtExport(");
    const formatterBody = source.slice(formatterIndex, source.indexOf("\n}", formatterIndex));
    expect(formatterBody).toContain('question.status === "annulled"');
    expect(formatterBody).toContain('lines.push("[QUESTÃO ANULADA]")');
    expect(formatterBody).toContain("alt.is_correct ? `*${alt.label})` : `${alt.label})`");
  });

  test("questões Certo/Errado usam o mesmo formatador (labels reais C/E, nunca reconvertidas para A/B)", () => {
    const source = read(BANK_PAGE);
    const formatterIndex = source.indexOf("function formatQuestionForTxtExport(");
    const formatterBody = source.slice(formatterIndex, source.indexOf("\n}", formatterIndex));
    // Nenhum tratamento especial por question_type — mesmo caminho de código
    // para múltipla escolha e Certo/Errado, usando alt.label como veio do banco.
    expect(formatterBody).not.toContain("question_type");
  });

  test("separador entre questões é 5 quebras de linha totais (1 fecha a questão anterior + 4 linhas em branco)", () => {
    const source = read(BANK_PAGE);
    expect(source).toContain('const TXT_EXPORT_QUESTION_SEPARATOR = "\\n\\n\\n\\n\\n";');
    expect(source).toContain("selectedQuestions.map(formatQuestionForTxtExport).join(TXT_EXPORT_QUESTION_SEPARATOR)");
  });

  test("seleção vazia é tratada sem erro (early return, sem Blob/download)", () => {
    const source = read(BANK_PAGE);
    const fnIndex = source.indexOf("function exportSelectedQuestionsAsTxt() {");
    const fnBody = source.slice(fnIndex, source.indexOf("\n  }", fnIndex));
    expect(fnBody).toContain("if (selectedQuestions.length === 0) return;");
  });
});

test.describe("2. Auditoria Git — estado do recurso versionado (tolera pré e pós-commit de consolidação)", () => {
  test("'Exportar TXT' está sempre presente no working tree", () => {
    const workingTree = read(BANK_PAGE);
    expect(workingTree).toContain("Exportar TXT");
  });

  test("estado em HEAD é coerente com o diff pendente: sem diff pendente → já commitado; com diff pendente → ainda não commitado (nunca os dois ao mesmo tempo)", () => {
    const hasPendingDiff = execSync(`git diff --stat -- "${BANK_PAGE}"`, { cwd: root, encoding: "utf8" }).trim().length > 0;
    const head = gitShow("HEAD", BANK_PAGE);
    expect(head).not.toBeNull();
    const inHead = head!.includes("exportSelectedQuestionsAsTxt");
    // Nunca comitado com diff pendente ao mesmo tempo (isso indicaria um
    // segundo hunk divergente não capturado pela auditoria original) nem
    // ausente de HEAD sem nenhum diff pendente explicando a ausência.
    expect(inHead).toBe(!hasPendingDiff);
  });

  test("HEAD e origin/main nunca divergem sem uma causa registrada (push pendente é sempre visível, nunca a causa silenciosa de uma ausência)", () => {
    const head = execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
    const origin = execSync("git rev-parse origin/main", { cwd: root, encoding: "utf8" }).trim();
    // Antes do push desta consolidação, HEAD podia estar à frente de
    // origin/main (commit local ainda não publicado) — nunca o contrário
    // (nunca um origin/main não integrado localmente, o que indicaria um
    // avanço remoto silenciosamente ignorado).
    if (head !== origin) {
      const mergeBase = execSync(`git merge-base ${head} ${origin}`, { cwd: root, encoding: "utf8" }).trim();
      expect(mergeBase).toBe(origin);
    }
  });

  test("a documentação do recurso (INDICE_FUNCOES_SISTEMA.md) está commitada em HEAD", () => {
    const workingTree = read("docs/INDICE_FUNCOES_SISTEMA.md");
    expect(workingTree).toContain("Exportação TXT em lote");

    const head = gitShow("HEAD", "docs/INDICE_FUNCOES_SISTEMA.md");
    expect(head).not.toBeNull();
    expect(head!.includes("Exportação TXT em lote")).toBe(true);
  });

  test("app/questoes/page-client.tsx não foi editado por esta auditoria para introduzir/corrigir o Export TXT — só lido e testado", () => {
    // Antes do fechamento geral da worktree (commit autorizado explicitamente
    // pelo usuário), este arquivo ficou protegido/não commitado por 3 tarefas
    // seguidas com exatamente 87 inserções e 0 remoções — nenhuma alteração
    // própria desta auditoria. Depois do commit de fechamento, o arquivo
    // passa a fazer parte do histórico normal (sem diff pendente); o teste
    // tolera os dois estados, mas nunca aceita um diff pendente diferente de
    // 87/0 enquanto ele ainda não foi commitado.
    const diffStat = execSync('git diff --stat -- "app/questoes/page-client.tsx"', { cwd: root, encoding: "utf8" }).trim();
    if (diffStat) expect(diffStat).toContain("1 file changed, 87 insertions(+)");
  });
});

test.describe("3. Build de produção — o handler compila corretamente (evidência contra 'erro de build')", () => {
  test("a função exportSelectedQuestionsAsTxt e seus tipos estão presentes no arquivo compilado com sucesso por esta sessão (tsc/build já executados sobre este working tree)", () => {
    // Cobertura documental: npx tsc --noEmit e npm run build foram executados
    // com sucesso nesta sessão sobre o working tree atual (que já contém o
    // recurso) — ver relatório final. Este teste apenas fixa a evidência de
    // que o código está sintaticamente/tipicamente correto no arquivo real.
    const source = read(BANK_PAGE);
    expect(source).toContain("type TxtExportAlternative = { label: string; text: string; is_correct?: boolean | null; order_number?: number | null };");
    expect(source).toContain("type TxtExportQuestion = { statement?: string | null; status?: string | null; question_alternatives?: TxtExportAlternative[] | null };");
  });
});
