import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import ts from "typescript";
import {
  TXT_EXPORT_BOM,
  TXT_EXPORT_QUESTION_SEPARATOR,
  buildQuestionsTxtContent,
  buildTxtExportFileName,
  downloadQuestionsTxt,
  formatQuestionForTxtExport,
  type TxtExportQuestion,
} from "@/lib/questions/txt-export";

// Exportação TXT em lote — Banco de Questões (/questoes, inclusive a fila
// /questoes?status=ready_to_publish) e Revisar questões (/questoes/revisar).
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
// ATUALIZAÇÃO (2026-10-10): o exportador foi extraído sem alteração de
// app/questoes/page-client.tsx para lib/questions/txt-export.ts, para ser
// reutilizado por Revisar questões. As duas auditorias que comparavam o
// trecho do Banco com HEAD (que reprovariam qualquer extração) foram
// substituídas por uma prova mais forte: o formatador ORIGINAL, lido do
// commit versionado ORIGINAL_REF, é executado e comparado byte a byte com o
// módulo compartilhado (seção 4).

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n/g, "\n");

const BANK_PAGE = "app/questoes/page-client.tsx";
const REVIEW_PAGE = "app/questoes/revisar/page-client.tsx";
const TXT_MODULE = "lib/questions/txt-export.ts";
// Último commit em que o exportador estava inline no Banco de Questões.
const ORIGINAL_REF = "52eb355";

function gitShow(ref: string, file: string): string | null {
  try {
    return execSync(`git show ${ref}:"${file}"`, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null; // arquivo/versão não existe nessa ref — resultado válido, não erro de execução
  }
}

function functionBody(source: string, signature: string, closing = "\n  }") {
  const start = source.indexOf(signature);
  expect(start).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf(closing, start));
}

// Formatador original (constantes + stripHtml + formatQuestionForTxtExport),
// extraído do Banco de Questões em ORIGINAL_REF e executado de verdade.
function loadOriginalExporter() {
  const source = gitShow(ORIGINAL_REF, BANK_PAGE);
  expect(source).not.toBeNull();
  const normalized = source!.replace(/\r\n/g, "\n");
  const start = normalized.indexOf("const TXT_EXPORT_QUESTION_SEPARATOR");
  const endMarker = '  return lines.join("\\n");\n}\n';
  const end = normalized.indexOf(endMarker, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const js = ts.transpileModule(normalized.slice(start, end + endMarker.length), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(`${js}\nreturn { TXT_EXPORT_QUESTION_SEPARATOR, TXT_EXPORT_BOM, formatQuestionForTxtExport };`)() as {
    TXT_EXPORT_QUESTION_SEPARATOR: string;
    TXT_EXPORT_BOM: string;
    formatQuestionForTxtExport: (question: TxtExportQuestion) => string;
  };
}

const alternatives = (correct: string | null, labels = ["A", "B", "C", "D", "E"]) =>
  labels.map((label, index) => ({ label, text: `<p>Alternativa ${label} — ação &amp; reação</p>`, is_correct: label === correct, order_number: index + 1 }));

// Uma questão de cada status administrativo, além de anulada, Certo/Errado e HTML.
const FIXTURES: Record<string, TxtExportQuestion> = {
  published: { statement: "<p>Questão publicada: acentuação ç ã é.</p>", status: "published", question_alternatives: alternatives("B") },
  draft: { statement: "Rascunho<br>com quebra", status: "draft", question_alternatives: alternatives("A") },
  archived: { statement: "<p>Arquivada</p><ul><li>item 1</li><li>item 2</li></ul>", status: "archived", question_alternatives: alternatives("E") },
  pending_review: { statement: "Pendente de revisão &quot;aspas&quot; &#39;simples&#39;", status: "pending_review", question_alternatives: alternatives("C") },
  ready_to_publish: { statement: "Aguardando publicação &lt;tag&gt;", status: "ready_to_publish", question_alternatives: [...alternatives("D")].reverse() },
  annulled: { statement: "Anulada sem gabarito", status: "annulled", question_alternatives: alternatives(null) },
  certo_errado: { statement: "Julgue o item.", status: "published", question_alternatives: alternatives("E", ["C", "E"]) },
  sem_alternativas: { statement: null, status: "draft", question_alternatives: null },
};

test.describe("1. Banco de Questões — botão e handler", () => {
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

  test("o botão vale para todos os status, inclusive a fila ready_to_publish (vem antes da ramificação por status)", () => {
    const source = read(BANK_PAGE);
    const btnIndex = source.indexOf('{ label: "Exportar TXT"');
    const branchIndex = source.indexOf("? status === READY_TO_PUBLISH_STATUS", btnIndex);
    expect(branchIndex).toBeGreaterThan(btnIndex);
    // Checkbox "Selecionar" renderizado sem condição de status.
    expect(source).toContain("checked={selectedIds.includes(question.id)}");
  });

  test("handler filtra filteredQuestions por selectedIds.includes, preserva a ordem visual e trata seleção vazia", () => {
    const fnBody = functionBody(read(BANK_PAGE), "function exportSelectedQuestionsAsTxt() {");
    expect(fnBody).toContain("filteredQuestions.filter((question) => selectedIds.includes(question.id));");
    expect(fnBody).not.toContain(".sort(");
    expect(fnBody).toContain("if (selectedQuestions.length === 0) return;");
    expect(fnBody).not.toContain("publicationQueueIds");
  });

  test("handler delega ao exportador compartilhado com a convenção de nome (1 assunto filtrado)", () => {
    const source = read(BANK_PAGE);
    expect(source).toContain('import { buildTxtExportFileName, buildTxtExportFilterLine, downloadQuestionsTxt } from "@/lib/questions/txt-export";');
    const fnBody = functionBody(source, "function exportSelectedQuestionsAsTxt() {");
    expect(fnBody).toContain("subjectIds.length === 1 ? subjects.find((s) => s.id === subjectIds[0])?.name : null");
    // 2026-10-10: + linha de identificação com os filtros aplicados (buildTxtFilterLine).
    expect(fnBody).toContain("downloadQuestionsTxt(selectedQuestions, buildTxtExportFileName(singleSubjectName), buildTxtFilterLine());");
  });

  test("nenhuma chamada de API ou mutação na exportação", () => {
    const fnBody = functionBody(read(BANK_PAGE), "function exportSelectedQuestionsAsTxt() {");
    for (const forbidden of ["fetch(", "adminFetch", "await ", "setQuestions", "setPublicationQueueIds", "setSelectedIds", "status:"]) {
      expect(fnBody).not.toContain(forbidden);
    }
    expect(read(BANK_PAGE)).not.toMatch(/fetch\(\s*["'`]\/api\/admin\/questions\/export/);
  });
});

test.describe("2. Revisar questões — botão e handler", () => {
  test("'Exportar TXT' na barra de seleção com 1+ selecionadas (selectedIds, nunca publicationQueueIds), antes de 'Descartar selecionadas'", () => {
    const source = read(REVIEW_PAGE);
    const btnIndex = source.indexOf('{ label: "Exportar TXT"');
    expect(btnIndex).toBeGreaterThan(-1);
    const precedingCode = source.slice(Math.max(0, btnIndex - 60), btnIndex);
    expect(precedingCode).toContain("...(selectedIds.length > 0");
    expect(precedingCode).not.toContain("publicationQueueIds");
    expect(source.indexOf('label: "Descartar selecionadas"')).toBeGreaterThan(btnIndex);
    expect(source.slice(btnIndex, source.indexOf("\n", btnIndex))).toContain('icon: <Download size={14} />, onClick: exportSelectedQuestionsAsTxt, variant: "secondary" as const');
  });

  test("demais ações da barra preservadas", () => {
    const source = read(REVIEW_PAGE);
    for (const action of ['label: "Edições em massa"', 'label: "Limpar seleção"', 'label: "Descartar selecionadas"', 'label: "Formar fila"', 'label: "Limpar fila"', "label: `Publicar ${filteredQueue.length} questão(ões)`"]) {
      expect(source).toContain(action);
    }
  });

  test("handler: selecionadas presentes na lista filtrada, na ordem visual; seleção vazia não exporta; só leitura", () => {
    const fnBody = functionBody(read(REVIEW_PAGE), "const exportSelectedQuestionsAsTxt = useCallback(() => {", "\n  }, [");
    expect(fnBody).toContain("filteredQueue.filter((question) => selectedIds.includes(question.id));");
    expect(fnBody).toContain("if (selectedQuestions.length === 0) return;");
    expect(fnBody).toContain("downloadQuestionsTxt(selectedQuestions, buildTxtExportFileName(singleSubjectName), buildTxtFilterLine());");
    expect(fnBody).not.toContain(".sort(");
    for (const forbidden of ["publicationQueueIds", "setPublicationQueueIds", "setQueue", "setSelectedIds", "adminFetch", "fetch(", "await ", "status:"]) {
      expect(fnBody).not.toContain(forbidden);
    }
  });
});

test.describe("3. Módulo compartilhado — fonte única do formato", () => {
  test("nenhuma tela redefine o formatador, o BOM ou o separador", () => {
    for (const page of [BANK_PAGE, REVIEW_PAGE]) {
      const source = read(page);
      expect(source).not.toContain("function formatQuestionForTxtExport(");
      expect(source).not.toContain("TXT_EXPORT_BOM =");
      expect(source).not.toContain("TXT_EXPORT_QUESTION_SEPARATOR =");
    }
  });

  test("MIME text/plain;charset=utf-8 + BOM (0xfeff); Blob + <a download> + revokeObjectURL; sem API", () => {
    const source = read(TXT_MODULE);
    expect(source).toContain("export const TXT_EXPORT_BOM = String.fromCharCode(0xfeff);");
    expect(source).toContain('const blob = new Blob([TXT_EXPORT_BOM + content], { type: "text/plain;charset=utf-8" });');
    expect(source).toContain("URL.createObjectURL(blob)");
    expect(source).toContain('document.createElement("a")');
    expect(source).toContain("URL.revokeObjectURL(url)");
    for (const forbidden of ["fetch(", "adminFetch", "await ", "supabase"]) expect(source).not.toContain(forbidden);
  });

  test("formatador: anulada marcada, asterisco só de is_correct, nenhum tratamento por question_type", () => {
    const formatterBody = functionBody(read(TXT_MODULE), "export function formatQuestionForTxtExport(", "\n}");
    expect(formatterBody).toContain('question.status === "annulled"');
    expect(formatterBody).toContain('lines.push("[QUESTÃO ANULADA]")');
    expect(formatterBody).toContain("alt.is_correct ? `*${alt.label})` : `${alt.label})`");
    expect(formatterBody).not.toContain("question_type");
  });

  test("tipos exportados (alternativa e questão)", () => {
    const source = read(TXT_MODULE);
    expect(source).toContain("export type TxtExportAlternative = { label?: string | null; text?: string | null; is_correct?: boolean | null; order_number?: number | null };");
    expect(source).toContain("export type TxtExportQuestion = { statement?: string | null; status?: string | null; question_alternatives?: TxtExportAlternative[] | null };");
  });
});

test.describe("4. Formato idêntico ao original (execução real)", () => {
  test(`constantes idênticas às do formatador original (${ORIGINAL_REF})`, () => {
    const original = loadOriginalExporter();
    expect(TXT_EXPORT_BOM).toBe(original.TXT_EXPORT_BOM);
    expect(TXT_EXPORT_BOM).toBe("\uFEFF");
    expect(TXT_EXPORT_QUESTION_SEPARATOR).toBe(original.TXT_EXPORT_QUESTION_SEPARATOR);
    expect(TXT_EXPORT_QUESTION_SEPARATOR).toBe("\n\n\n\n\n");
  });

  for (const [name, question] of Object.entries(FIXTURES)) {
    test(`uma questão (${name}): saída byte a byte igual à original`, () => {
      const original = loadOriginalExporter();
      expect(formatQuestionForTxtExport(question)).toBe(original.formatQuestionForTxtExport(question));
    });
  }

  // 2026-10-10: o arquivo ganhou a linha de identificação (filtros) e a numeração
  // 01), 02)... O texto de cada questão continua byte a byte igual ao original.
  test("várias questões de status diferentes: cada questão igual à original, numerada, com separador e BOM originais", () => {
    const original = loadOriginalExporter();
    const questions = Object.values(FIXTURES);
    const expected =
      original.TXT_EXPORT_BOM +
      "Banca X - Status: Publicada\n\n" +
      questions.map((question, index) => `${String(index + 1).padStart(2, "0")}) ${original.formatQuestionForTxtExport(question)}`).join(original.TXT_EXPORT_QUESTION_SEPARATOR);
    expect(TXT_EXPORT_BOM + buildQuestionsTxtContent(questions, "Banca X - Status: Publicada")).toBe(expected);
  });

  test("conteúdo esperado de referência (gabarito, anulada, HTML, ordem das alternativas)", () => {
    expect(formatQuestionForTxtExport(FIXTURES.published)).toBe(
      ["Questão publicada: acentuação ç ã é.", "", "A) Alternativa A — ação & reação", "*B) Alternativa B — ação & reação", "C) Alternativa C — ação & reação", "D) Alternativa D — ação & reação", "E) Alternativa E — ação & reação"].join("\n"),
    );
    expect(formatQuestionForTxtExport(FIXTURES.annulled)).toContain("Anulada sem gabarito\n[QUESTÃO ANULADA]\n\nA) ");
    expect(formatQuestionForTxtExport(FIXTURES.annulled)).not.toContain("*");
    expect(formatQuestionForTxtExport(FIXTURES.ready_to_publish).split("\n").slice(2, 4)).toEqual(["A) Alternativa A — ação & reação", "B) Alternativa B — ação & reação"]);
    expect(formatQuestionForTxtExport(FIXTURES.certo_errado)).toBe("Julgue o item.\n\nC) Alternativa C — ação & reação\n*E) Alternativa E — ação & reação");
  });

  test("nome do arquivo: mesma convenção (assunto único com slug sem acento; senão 'exportadas')", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(buildTxtExportFileName("Segurança da Informação")).toBe(`questoes-seguranca-da-informacao-${today}.txt`);
    expect(buildTxtExportFileName(null)).toBe(`questoes-exportadas-${today}.txt`);
    expect(buildTxtExportFileName("")).toBe(`questoes-exportadas-${today}.txt`);
    expect(buildTxtExportFileName("***")).toBe(`questoes-exportadas-${today}.txt`);
  });

  test("download: Blob com BOM + conteúdo, MIME, nome do arquivo, clique único e liberação do objectURL; seleção vazia não toca o DOM", async () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const originalDocument = g.document;
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const events: string[] = [];
    let captured: Blob | null = null;
    const anchor = { href: "", download: "", click: () => events.push("click") };
    try {
      g.document = undefined;
      // Seleção vazia: retorna antes de qualquer acesso ao DOM (document indefinido não lança).
      expect(() => downloadQuestionsTxt([], "x.txt")).not.toThrow();

      g.document = {
        createElement: (tag: string) => { events.push(`create:${tag}`); return anchor; },
        body: { appendChild: () => events.push("append"), removeChild: () => events.push("remove") },
      };
      URL.createObjectURL = (blob: Blob) => { captured = blob; return "blob:teste"; };
      URL.revokeObjectURL = (url: string) => { events.push(`revoke:${url}`); };

      const questions = [FIXTURES.published, FIXTURES.pending_review];
      downloadQuestionsTxt(questions, "questoes-exportadas-2026-10-10.txt");
      expect(anchor.href).toBe("blob:teste");
      expect(anchor.download).toBe("questoes-exportadas-2026-10-10.txt");
      expect(events).toEqual(["create:a", "append", "click", "remove"]);
      expect(captured!.type).toBe("text/plain;charset=utf-8");
      const bytes = new Uint8Array(await captured!.arrayBuffer());
      expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM UTF-8
      expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes)).toBe(TXT_EXPORT_BOM + buildQuestionsTxtContent(questions));
      await new Promise((resolve) => setTimeout(resolve, 1100));
      expect(events).toContain("revoke:blob:teste");
    } finally {
      g.document = originalDocument;
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });

  test("a exportação não altera os objetos recebidos (status, conteúdo, alternativas e ordem)", () => {
    const questions = structuredClone(Object.values(FIXTURES));
    const before = JSON.stringify(questions);
    buildQuestionsTxtContent(questions);
    expect(JSON.stringify(questions)).toBe(before);
  });
});

test.describe("5. Auditoria Git — estado do recurso versionado", () => {
  test("'Exportar TXT' está presente no Banco e no Revisar (working tree)", () => {
    expect(read(BANK_PAGE)).toContain("Exportar TXT");
    expect(read(REVIEW_PAGE)).toContain("Exportar TXT");
  });

  test(`o formatador original continua versionado em ${ORIGINAL_REF} (referência da comparação byte a byte)`, () => {
    const original = gitShow(ORIGINAL_REF, BANK_PAGE);
    expect(original).not.toBeNull();
    expect(original!).toContain("function formatQuestionForTxtExport(question: TxtExportQuestion): string {");
  });

  test("HEAD e origin/main nunca divergem sem uma causa registrada (push pendente é sempre visível, nunca a causa silenciosa de uma ausência)", () => {
    const head = execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
    const origin = execSync("git rev-parse origin/main", { cwd: root, encoding: "utf8" }).trim();
    // HEAD pode estar à frente de origin/main (commit local ainda não
    // publicado) — nunca o contrário (nunca um origin/main não integrado
    // localmente, o que indicaria um avanço remoto silenciosamente ignorado).
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
});
