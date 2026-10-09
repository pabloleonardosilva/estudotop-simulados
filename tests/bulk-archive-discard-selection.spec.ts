import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Seleção em massa — "Arquivar selecionadas" (Banco de Questões, /questoes) e
// "Descartar selecionadas" (Revisar Questões, /questoes/revisar).
//
// Ambas reutilizam a regra individual existente: PATCH /api/admin/questions/bulk
// com status "archived" (o "Descartar" individual do QuestionEditor e o
// "Arquivar" do card do Banco persistem exatamente isso). Nunca exclusão física.
// Testes de contrato do código-fonte, sem banco nem servidor.

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n/g, "\n");

const BANK_PAGE = "app/questoes/page-client.tsx";
const REVIEW_PAGE = "app/questoes/revisar/page-client.tsx";
const EDITOR = "app/components/questions/QuestionEditor.tsx";
const BULK_API = "app/api/admin/questions/bulk/route.ts";

function functionBody(source: string, signature: string, end = "\n  }\n") {
  const start = source.indexOf(signature);
  expect(start, `assinatura não encontrada: ${signature}`).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf(end, start) + end.length);
}

function callbackBody(source: string, declaration: string) {
  const start = source.indexOf(declaration);
  expect(start, `declaração não encontrada: ${declaration}`).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf("\n  );\n", start));
}

test.describe("Regra reutilizada", () => {
  test("Descartar individual do QuestionEditor arquiva via PATCH bulk (mesma regra usada em massa)", () => {
    const body = callbackBody(read(EDITOR), "const archiveQuestion = useCallback(");
    expect(body).toContain('method: "PATCH"');
    expect(body).toContain('status: "archived"');
  });

  test("API bulk exige Admin no servidor, aceita 'archived' e rejeita lista vazia", () => {
    const source = read(BULK_API);
    const patch = source.slice(source.indexOf("export async function PATCH"), source.indexOf("export async function DELETE"));
    expect(patch.indexOf("requireAdmin(request)")).toBeLessThan(patch.indexOf("request.json()"));
    expect(patch).toContain('"archived"');
    expect(patch).toContain("Nenhuma questao selecionada.");
    expect(patch).toContain("updatedIds");
  });
});

test.describe("Banco de Questões — Arquivar selecionadas", () => {
  test("botão na barra, guardado por selectedIds, com estado de processamento", () => {
    const source = read(BANK_PAGE);
    const btn = source.indexOf('{ label: "Arquivar selecionadas"');
    expect(btn).toBeGreaterThan(-1);
    expect(source.slice(btn, source.indexOf("\n", btn))).toContain("onClick: archiveSelected");
    expect(source.slice(btn, source.indexOf("\n", btn))).toContain("disabled: archivingSelected");
    // Fica no ramo de seleção do Banco (fora da fila de publicação), antes de "Enviar para rascunho".
    const branchStart = source.lastIndexOf("status === READY_TO_PUBLISH_STATUS", btn);
    expect(source.slice(branchStart, btn)).toContain('label: "Limpar seleção"');
    expect(btn).toBeLessThan(source.indexOf('{ label: "Enviar para rascunho"', btn));
  });

  test("demais comandos da barra preservados", () => {
    const source = read(BANK_PAGE);
    for (const label of ["Exportar TXT", "Publicar questão", "Publicar fila", "Edição em massa", "Rascunho", "Adicionar ao simulado", "Editar em massa", "Enviar para rascunho", "Limpar seleção", "Excluir", "Formar fila de publicação", "Limpar fila marcada", "Publicar essa fila"]) {
      expect(source, label).toContain(`label: "${label}"`);
    }
    expect(source).toContain('{ label: "Excluir", icon: <Trash2 size={14} />, onClick: deleteSelected, variant: "danger" as const }');
  });

  test("confirma antes de arquivar; opera só em selecionadas carregadas e ainda não arquivadas", () => {
    const body = functionBody(read(BANK_PAGE), "function archiveSelected() {");
    expect(body).toContain("questions.filter((question) => selectedIds.includes(question.id))");
    expect(body).toContain('question.status !== "archived"');
    expect(body).toContain("As questões selecionadas já estão arquivadas.");
    expect(body).toContain("Selecione pelo menos uma questão.");
    // Nenhuma chamada de API antes da confirmação; Cancelar apenas fecha.
    expect(body).not.toContain("adminFetch");
    expect(body).toContain("onSecondary: () => setActionModal(null)");
    expect(body).toContain("await runArchiveSelected(idsToArchive)");
    // Vínculos com Simulados informados e preservados.
    expect(body).toContain("simulado_questions");
  });

  test("execução: PATCH archived (nunca DELETE), reconcilia por updatedIds e trata falha", () => {
    const body = functionBody(read(BANK_PAGE), "async function runArchiveSelected(idsToArchive: string[]) {");
    expect(body).toContain('method: "PATCH"');
    expect(body).toContain('body: JSON.stringify({ ids: idsToArchive, status: "archived" })');
    expect(body).not.toContain('"DELETE"');
    expect(body).toContain("if (!response.ok || !result.ok) throw new Error");
    expect(body).toContain("result.updatedIds");
    // Só as efetivamente arquivadas mudam; as não processadas continuam selecionadas.
    expect(body).toContain('archivedIds.has(question.id) ? { ...question, status: "archived" } : question');
    expect(body).toContain("setSelectedIds(notArchivedIds)");
    expect(body).toContain("router.refresh()");
    expect(body).toContain('type: "error"');
    expect(body).toContain("setArchivingSelected(false)");
  });
});

test.describe("Revisar Questões — Descartar selecionadas", () => {
  test("botão aparece com qualquer seleção (inclusive 1), como ação danger", () => {
    const source = read(REVIEW_PAGE);
    const btn = source.indexOf('{ label: "Descartar selecionadas"');
    expect(btn).toBeGreaterThan(-1);
    const line = source.slice(btn, source.indexOf("\n", btn));
    expect(source.slice(btn - 60, btn)).toContain("...(selectedIds.length > 0");
    expect(line).toContain("onClick: confirmDiscardSelected");
    expect(line).toContain('variant: "danger" as const');
    expect(line).toContain("disabled: discardingSelected");
    // Não há botão "Arquivar selecionadas" redundante nesta tela.
    expect(source).not.toContain('label: "Arquivar selecionadas"');
  });

  test("contagem da barra preserva as regras anteriores e só acrescenta a seleção única como último caso", () => {
    const source = read(REVIEW_PAGE);
    expect(source).toContain(
      "const ghostCount = selectedIds.length >= 2\n    ? selectedIds.length\n    : publicationQueueCount > 0\n      ? publicationQueueCount\n      : isReadyToPublishView ? filteredQueue.length : selectedIds.length;",
    );
    for (const label of ["Edições em massa", "Limpar seleção", "Formar fila", "Limpar fila"]) {
      expect(source, label).toContain(`label: "${label}"`);
    }
  });

  test("confirma antes e restringe às selecionadas presentes na fila de revisão", () => {
    const body = callbackBody(read(REVIEW_PAGE), "const confirmDiscardSelected = useCallback(");
    expect(body).toContain("const queueIds = new Set(queue.map((question) => question.id))");
    expect(body).toContain("selectedIds.filter((id) => queueIds.has(id))");
    expect(body).not.toContain("adminFetch");
    expect(body).toContain("onSecondary: () => setActionFeedback(null)");
    expect(body).toContain("await runDiscardSelected(idsToDiscard)");
  });

  test("execução: PATCH archived, remove da fila só as descartadas e trata falha parcial/total", () => {
    const body = callbackBody(read(REVIEW_PAGE), "const runDiscardSelected = useCallback(");
    expect(body).toContain('body: JSON.stringify({ ids: idsToDiscard, status: "archived" })');
    expect(body).not.toContain('"DELETE"');
    expect(body).toContain("if (!response.ok || !result.ok) throw new Error");
    expect(body).toContain("result.updatedIds");
    expect(body).toContain("setQueue((current) => current.filter((question) => !discardedIds.has(question.id)))");
    expect(body).toContain("setPublicationQueueIds((current) => current.filter((id) => !discardedIds.has(id)))");
    expect(body).toContain("setArchivedCount((current) => current + discardedIds.size)");
    expect(body).toContain("setSelectedIds((current) => current.filter((id) => !discardedIds.has(id)))");
    expect(body).toContain('"Descarte parcial"');
    expect(body).toContain('tone: "error"');
    expect(body).toContain("setDiscardingSelected(false)");
  });
});
