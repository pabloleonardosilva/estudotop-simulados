import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  TXT_EXPORT_BOM,
  TXT_EXPORT_NO_FILTERS_LINE,
  TXT_EXPORT_QUESTION_SEPARATOR,
  buildQuestionsTxtContent,
  buildTxtExportFilterLine,
  downloadQuestionsTxt,
  formatQuestionForTxtExport,
  txtExportQuestionNumber,
  type TxtExportQuestion,
} from "@/lib/questions/txt-export";

// Adendo (2026-10-10): seleção de todas as questões filtradas (todas as páginas),
// linha de identificação com os filtros e numeração sequencial no TXT.

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n/g, "\n");
const BANK_PAGE = "app/questoes/page-client.tsx";
const REVIEW_PAGE = "app/questoes/revisar/page-client.tsx";
const BULK_API = "app/api/admin/questions/bulk/route.ts";

function makeQuestions(count: number): TxtExportQuestion[] {
  return Array.from({ length: count }, (_, i) => ({
    statement: `<p>Questão única número ${i + 1} — ação</p>`,
    status: i % 97 === 5 ? "annulled" : "published",
    question_alternatives: ["A", "B", "C", "D"].map((label, j) => ({ label, text: `Alt ${label} da ${i + 1}`, is_correct: i % 97 !== 5 && j === i % 4, order_number: j + 1 })),
  }));
}

// Lê o arquivo de volta: linha de identificação + blocos numerados.
function parseTxt(content: string) {
  const headerEnd = content.indexOf("\n\n");
  return { header: content.slice(0, headerEnd), blocks: content.slice(headerEnd + 2).split(TXT_EXPORT_QUESTION_SEPARATOR) };
}

function functionBody(source: string, signature: string, closing: string) {
  const start = source.indexOf(signature);
  expect(start).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf(closing, start));
}

test.describe("TXT — numeração sequencial e volume", () => {
  for (const count of [1, 20, 100, 2000]) {
    test(`${count} questão(ões): numeradas de 01 a ${String(count).padStart(2, "0")}, sem duplicar nem omitir, texto e gabarito preservados`, () => {
      const questions = makeQuestions(count);
      const { header, blocks } = parseTxt(buildQuestionsTxtContent(questions, "Informática - FGV"));
      expect(header).toBe("Informática - FGV");
      expect(blocks).toHaveLength(count);
      blocks.forEach((block, index) => {
        const prefix = `${String(index + 1).padStart(2, "0")}) `;
        expect(block.startsWith(prefix)).toBe(true);
        expect(block.slice(prefix.length)).toBe(formatQuestionForTxtExport(questions[index]));
      });
      const statements = blocks.map((block) => block.split("\n")[0]);
      expect(new Set(statements).size).toBe(count);
    });
  }

  test("formato do número: mínimo dois dígitos, sem truncar acima de 99 e de 999", () => {
    expect([0, 8, 9, 98, 99, 998, 999, 1999].map(txtExportQuestionNumber)).toEqual(["01)", "09)", "10)", "99)", "100)", "999)", "1000)", "2000)"]);
  });

  test("numeração não depende do código da questão e não reinicia (2.000 questões em ordem)", () => {
    const { blocks } = parseTxt(buildQuestionsTxtContent(makeQuestions(2000)));
    expect(blocks[0].startsWith("01) Questão única número 1 ")).toBe(true);
    expect(blocks[99].startsWith("100) Questão única número 100 ")).toBe(true);
    expect(blocks[999].startsWith("1000) Questão única número 1000 ")).toBe(true);
    expect(blocks[1999].startsWith("2000) Questão única número 2000 ")).toBe(true);
  });

  test("anulada e gabarito preservados no bloco numerado", () => {
    const [annulled] = makeQuestions(6).slice(5);
    const block = buildQuestionsTxtContent([annulled]).split("\n\n").slice(1).join("\n\n");
    expect(block).toBe(`01) ${formatQuestionForTxtExport(annulled)}`);
    expect(block).toContain("[QUESTÃO ANULADA]");
    expect(block).not.toContain("*");
  });
});

test.describe("TXT — linha de identificação dos filtros", () => {
  test("sem filtros: linha neutra", () => {
    expect(buildTxtExportFilterLine([])).toBe(TXT_EXPORT_NO_FILTERS_LINE);
    expect(buildTxtExportFilterLine(["", null, undefined, "   "])).toBe("Todas as questões");
    expect(parseTxt(buildQuestionsTxtContent(makeQuestions(2))).header).toBe("Todas as questões");
  });

  test("um filtro, vários filtros (ordem preservada) e vários valores no mesmo filtro", () => {
    expect(buildTxtExportFilterLine(["Informática"])).toBe("Informática");
    expect(buildTxtExportFilterLine(["Informática", "Hardware", "FGV"])).toBe("Informática - Hardware - FGV");
    expect(buildTxtExportFilterLine(["Informática", "Hardware, Redes", "", "Status: Publicada, Arquivada"])).toBe("Informática - Hardware, Redes - Status: Publicada, Arquivada");
  });

  test("sempre uma única linha, uma única vez, logo após o BOM", () => {
    const line = buildTxtExportFilterLine(['Busca: "termo\ncom quebra"', "FGV"]);
    expect(line).toBe('Busca: "termo com quebra" - FGV');
    const file = TXT_EXPORT_BOM + buildQuestionsTxtContent(makeQuestions(150), line);
    expect(file.startsWith(`﻿${line}\n\n01) `)).toBe(true);
    expect(file.split(line).length - 1).toBe(1);
  });

  for (const [page, order] of [
    [BANK_PAGE, ["Busca:", "disciplines.find", "namesInListOrder(subjects", "namesInListOrder(topics", "namesInListOrder(boards, boardIds)", "Inspiração:", "orgaoFilters", "Ano:", "Dificuldade:", "Status:", "Sem tópicos avaliados"]],
    [REVIEW_PAGE, ["Busca:", "disciplines.find", "namesInListOrder(subjects", "namesInListOrder(topics", "namesInListOrder(boards, filterBoardIds)", "filterOrgaos", "Ano:", "Dificuldade:", "Status:", "Sem tópicos avaliados"]],
  ] as const) {
    test(`${page}: filtros com nomes legíveis, na ordem da tela, omitindo os que estão em Todos`, () => {
      const source = read(page);
      const signature = page === BANK_PAGE ? "function buildTxtFilterLine() {" : "const buildTxtFilterLine = useCallback(() => {";
      const body = functionBody(source, signature, "\n  }");
      let last = -1;
      for (const marker of order) {
        const at = body.indexOf(marker, last + 1);
        expect(at, marker).toBeGreaterThan(last);
        last = at;
      }
      expect(body).toContain("list.filter((item) => ids.includes(item.id)).map((item) => item.name)"); // nomes, não ids
      for (const forbidden of ["adminFetch", "fetch(", "email", "cpf"]) expect(body).not.toContain(forbidden);
      expect(source).toContain(", buildTxtFilterLine());");
    });
  }
});

test.describe("TXT — falhas na exportação", () => {
  test("erro ao gerar o arquivo não dispara download parcial; seleção vazia não gera nada", () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const originalDocument = g.document;
    const originalCreate = URL.createObjectURL;
    const clicks: string[] = [];
    try {
      g.document = { createElement: () => ({ click: () => clicks.push("click") }), body: { appendChild() {}, removeChild() {} } };
      URL.createObjectURL = () => { throw new Error("sem memória"); };
      expect(() => downloadQuestionsTxt(makeQuestions(3), "x.txt", "FGV")).toThrow("sem memória");
      expect(clicks).toEqual([]);
      expect(() => downloadQuestionsTxt([], "x.txt", "FGV")).not.toThrow();
      expect(clicks).toEqual([]);
    } finally {
      g.document = originalDocument;
      URL.createObjectURL = originalCreate;
    }
  });
});

test.describe("Seleção de todas as questões filtradas", () => {
  for (const [page, list, paged] of [[BANK_PAGE, "filteredQuestions", "renderedQuestions"], [REVIEW_PAGE, "filteredQueue", "paginatedQueue"]] as const) {
    test(`${page}: seleciona o conjunto filtrado inteiro (todas as páginas), informa o total e permite limpar`, () => {
      const source = read(page);
      expect(source).toContain(`setSelectedIds(${list}.map((question) => question.id));\n    setGlobalSelection(true);`);
      expect(source).toContain(`Selecionar todas as {${list}.length.toLocaleString("pt-BR")} questões filtradas`);
      expect(source).toContain('Todas as {selectedIds.length.toLocaleString("pt-BR")} questões filtradas estão selecionadas.');
      expect(source).toContain(`) : ${list}.length > ${paged}.length ? (`);
      expect(source).toContain("Limpar seleção\n");
    });

    test(`${page}: seleção parcial da página aparece como estado intermediário`, () => {
      const source = read(page);
      expect(source).toContain(`const someVisibleSelected = ${paged}.some((question) => selectedIds.includes(question.id));`);
      expect(source).toContain("ref={(input) => { if (input) input.indeterminate = someVisibleSelected && !allVisibleSelected; }}");
    });

    test(`${page}: mudar filtros desfaz a seleção global (nunca passa a valer para outro conjunto); seleção vazia encerra o modo`, () => {
      const source = read(page);
      expect(source).toMatch(/const filterSelectionKey = JSON\.stringify\(\[[^\n]*(statusFilters|filterStatus)[^\n]*\]\);/);
      const block = functionBody(source, "  if (selectionFilterKey !== filterSelectionKey) {", "\n  }\n");
      expect(block).toContain("setSelectedIds([]);");
      expect(block).toContain("setGlobalSelection(false);");
      expect(block).toContain("A seleção de todas as questões filtradas foi desfeita porque os filtros mudaram.");
      expect(source).toContain("if (selectedIds.length === 0 && globalSelection) setGlobalSelection(false);");
      // nada disso usa efeitos com setState nem chama API
      expect(source).not.toContain("previousFilterSelectionKey");
    });

    test(`${page}: exportação usa a seleção efetiva dentro do conjunto filtrado (global ou parcial)`, () => {
      expect(read(page)).toContain(`${list}.filter((question) => selectedIds.includes(question.id));`);
    });
  }

  test("simulação: 2.000 filtradas em 50 páginas — seleção global exporta 2.000; parcial exporta só as escolhidas; trocar de página não reduz a seleção", () => {
    const filtered = Array.from({ length: 2000 }, (_, i) => ({ id: `q${i}` }));
    const page = (n: number) => filtered.slice((n - 1) * 40, n * 40);
    const exportOf = (selected: string[]) => filtered.filter((question) => selected.includes(question.id));
    const global = filtered.map((question) => question.id);
    expect(exportOf(global)).toHaveLength(2000);
    expect(page(37).every((question) => global.includes(question.id))).toBe(true);
    const partial = [...page(1), ...page(50)].map((question) => question.id);
    expect(exportOf(partial).map((question) => question.id)).toEqual(partial);
  });
});

test.describe("Ações em massa na seleção global (sem ampliação)", () => {
  test("Banco: ações que alteram dados ficam desabilitadas; Exportar TXT e Limpar seleção ativos", () => {
    const source = read(BANK_PAGE);
    const blocked = ["Publicar questão", "Publicar fila", "Edição em massa", "Rascunho", "Adicionar ao simulado", "Editar em massa", "Arquivar selecionadas", "Enviar para rascunho", "Excluir"];
    // Restrição aplicada num único ponto, sobre a lista de ações da barra (objetos de ação inalterados).
    expect(source).toContain(`const GLOBAL_SELECTION_BLOCKED_ACTIONS = [${blocked.map((label) => `"${label}"`).join(", ")}];`);
    for (const label of blocked) expect(source, label).toContain(`{ label: "${label}"`);
    expect(source).toContain("        actions={blockForGlobalSelection([");
    const body = functionBody(source, "function blockForGlobalSelection<", "\n  }");
    expect(body).toContain("if (!isGlobalSelection) return actions;");
    expect(body).toContain("GLOBAL_SELECTION_BLOCKED_ACTIONS.includes(action.label) ? { ...action, disabled: true } : action");
    expect(source).toContain("disponível apenas para Exportar TXT. Arquivar, publicar, editar em massa e excluir ficam desabilitados");
  });

  test("Revisar: Edições em massa e Descartar desabilitados; Exportar TXT e Limpar seleção ativos", () => {
    const source = read(REVIEW_PAGE);
    for (const label of ["Edições em massa", "Descartar selecionadas"]) {
      const at = source.indexOf(`{ label: "${label}"`);
      expect(source.slice(at, source.indexOf("\n", at)), label).toContain("isGlobalSelection");
    }
    const exportAt = source.indexOf('{ label: "Exportar TXT"');
    expect(source.slice(exportAt, source.indexOf("\n", exportAt))).not.toContain("disabled");
    expect(source).toContain("disponível apenas para Exportar TXT. Edições em massa e descarte ficam desabilitados");
  });

  test("rota de ações em massa inalterada (nenhuma ampliação de API)", () => {
    const head = execSync(`git show HEAD:"${BULK_API}"`, { cwd: root, encoding: "utf8" }).replace(/\r\n/g, "\n");
    expect(read(BULK_API)).toBe(head);
  });
});
