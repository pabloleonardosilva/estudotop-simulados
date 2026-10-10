import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  BANK_QUESTION_STATUSES,
  PENDING_REVIEW_STATUS,
  READY_TO_PUBLISH_STATUS,
  SIMULADO_ANNULLED_FILTER_VALUE,
  bankStatusLoadPlan,
  bankStatusMatches,
  bankStatusSelectionCovered,
  isOnlyStatus,
  parseReviewStatusParams,
  parseStatusParams,
  reviewStatusMatches,
  reviewStatusParams,
} from "@/lib/questions/status-filter";

// Sprint de filtros e seleção (2026-10-10):
// A) "Selecionar questões exibidas" em Revisar questões, igual ao Banco;
// B) filtro de Status com multisseleção (OU) no Banco e no Revisar.

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n/g, "\n");
const BANK_PAGE = "app/questoes/page-client.tsx";
const BANK_SERVER = "app/questoes/page.tsx";
const REVIEW_PAGE = "app/questoes/revisar/page-client.tsx";
const REVIEW_SERVER = "app/questoes/revisar/page.tsx";
const DROPDOWN = "app/components/questions/StatusFilterDropdown.tsx";

const QUESTION_STATUSES_IN_DB = ["draft", "published", "active", "archived", "annulled", PENDING_REVIEW_STATUS, READY_TO_PUBLISH_STATUS, null];
const BANK_OPTIONS = ["draft", "published", "archived", "annulled", SIMULADO_ANNULLED_FILTER_VALUE, READY_TO_PUBLISH_STATUS];

// Cópia literal do predicado de status do Banco antes desta Sprint (status único; "" = Todos).
function oldBankMatch(questionStatus: string | null, annulledInSimulado: boolean, fStatus: string) {
  const qStatus = questionStatus || "draft";
  if (!fStatus && (qStatus === "pending_review" || qStatus === "ready_to_publish")) return false;
  return !fStatus || qStatus === fStatus || (fStatus === "published" && ["published", "active"].includes(qStatus)) || (fStatus === SIMULADO_ANNULLED_FILTER_VALUE && annulledInSimulado);
}

function functionBody(source: string, signature: string, closing: string) {
  const start = source.indexOf(signature);
  expect(start).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf(closing, start));
}

test.describe("B. Status multisseleção — regras (Banco)", () => {
  test("um status (ou Todos) filtra exatamente como antes", () => {
    for (const fStatus of ["", ...BANK_OPTIONS]) {
      for (const qStatus of QUESTION_STATUSES_IN_DB) {
        for (const annulled of [false, true]) {
          expect(bankStatusMatches(qStatus, annulled, fStatus ? [fStatus] : [])).toBe(oldBankMatch(qStatus, annulled, fStatus));
        }
      }
    }
  });

  test("dois ou mais status combinam por OU (inclui Anuladas no Banco e Anuladas em Simulados)", () => {
    for (const [a, b] of [["published", "archived"], ["published", "annulled"], ["draft", "published"], ["archived", SIMULADO_ANNULLED_FILTER_VALUE]]) {
      for (const qStatus of QUESTION_STATUSES_IN_DB) {
        for (const annulled of [false, true]) {
          expect(bankStatusMatches(qStatus, annulled, [a, b])).toBe(oldBankMatch(qStatus, annulled, a) || oldBankMatch(qStatus, annulled, b));
        }
      }
    }
    expect(bankStatusMatches("active", false, ["published", "archived"])).toBe(true);
    expect(bankStatusMatches("draft", false, ["published", "archived"])).toBe(false);
  });

  test("'Todos, exceto Arquivada' = os demais status marcados", () => {
    const allButArchived = ["draft", "published", "annulled"];
    expect(bankStatusMatches("archived", false, allButArchived)).toBe(false);
    for (const qStatus of ["draft", "published", "active", "annulled"]) expect(bankStatusMatches(qStatus, false, allButArchived)).toBe(true);
    // pending_review/ready_to_publish continuam fora, como em Todos
    expect(bankStatusMatches(PENDING_REVIEW_STATUS, false, allButArchived)).toBe(false);
    expect(bankStatusMatches(READY_TO_PUBLISH_STATUS, false, allButArchived)).toBe(false);
  });

  test("carga no servidor: um status gera a mesma consulta de antes", () => {
    expect(bankStatusLoadPlan([])).toEqual({ mode: "default", includeReadyToPublish: false });
    expect(bankStatusLoadPlan(["published"])).toEqual({ mode: "in", statuses: ["published", "active"] });
    for (const status of ["draft", "archived", "annulled", READY_TO_PUBLISH_STATUS]) expect(bankStatusLoadPlan([status])).toEqual({ mode: "in", statuses: [status] });
    expect(bankStatusLoadPlan([SIMULADO_ANNULLED_FILTER_VALUE])).toEqual({ mode: "default", includeReadyToPublish: false });
  });

  test("carga no servidor: vários status carregam a união", () => {
    expect(bankStatusLoadPlan(["published", "archived"])).toEqual({ mode: "in", statuses: ["published", "active", "archived"] });
    expect(bankStatusLoadPlan(["archived", SIMULADO_ANNULLED_FILTER_VALUE])).toEqual({ mode: "default", includeReadyToPublish: false });
    expect(bankStatusLoadPlan([READY_TO_PUBLISH_STATUS, SIMULADO_ANNULLED_FILTER_VALUE])).toEqual({ mode: "default", includeReadyToPublish: true });
  });

  test("recarrega só quando os dados carregados não cobrem a nova seleção", () => {
    // Todos carregado: qualquer combinação sem a fila é filtrada no cliente
    expect(bankStatusSelectionCovered([], ["published", "archived"])).toBe(true);
    expect(bankStatusSelectionCovered([], [SIMULADO_ANNULLED_FILTER_VALUE, "annulled"])).toBe(true);
    expect(bankStatusSelectionCovered([], [READY_TO_PUBLISH_STATUS])).toBe(false);
    // URL antiga ?status=archived: marcar Publicada exige recarregar (antes ficava vazio)
    expect(bankStatusSelectionCovered(["archived"], ["archived"])).toBe(true);
    expect(bankStatusSelectionCovered(["archived"], ["archived", "published"])).toBe(false);
    expect(bankStatusSelectionCovered(["archived"], [])).toBe(false);
    expect(bankStatusSelectionCovered(["published", "archived"], ["published"])).toBe(true);
    // fila de publicação
    expect(bankStatusSelectionCovered([READY_TO_PUBLISH_STATUS], [READY_TO_PUBLISH_STATUS])).toBe(true);
    expect(bankStatusSelectionCovered([READY_TO_PUBLISH_STATUS], [READY_TO_PUBLISH_STATUS, "published"])).toBe(false);
  });

  test("URL: aceita um status (URLs antigas, inclusive ready_to_publish) ou vários; ignora inválidos e repetidos", () => {
    const allowed = [...BANK_QUESTION_STATUSES, SIMULADO_ANNULLED_FILTER_VALUE];
    expect(parseStatusParams([], allowed)).toEqual([]);
    expect(parseStatusParams(["ready_to_publish"], allowed)).toEqual(["ready_to_publish"]);
    expect(parseStatusParams(["published", "archived", "published"], allowed)).toEqual(["published", "archived"]);
    expect(parseStatusParams(["pending_review", "xyz", "annulled_in_simulados"], allowed)).toEqual(["annulled_in_simulados"]);
  });

  test("fila de publicação só é 'a fila' quando é o único status selecionado", () => {
    expect(isOnlyStatus([READY_TO_PUBLISH_STATUS], READY_TO_PUBLISH_STATUS)).toBe(true);
    expect(isOnlyStatus([READY_TO_PUBLISH_STATUS, "published"], READY_TO_PUBLISH_STATUS)).toBe(false);
    expect(isOnlyStatus([], READY_TO_PUBLISH_STATUS)).toBe(false);
  });
});

test.describe("B. Status multisseleção — regras (Revisar)", () => {
  test("um status filtra como antes; vazio = Todos; vários = OU", () => {
    for (const fStatus of ["", PENDING_REVIEW_STATUS, READY_TO_PUBLISH_STATUS, "draft"]) {
      for (const qStatus of [PENDING_REVIEW_STATUS, READY_TO_PUBLISH_STATUS]) {
        expect(reviewStatusMatches(qStatus, fStatus ? [fStatus] : [])).toBe(!fStatus || qStatus === fStatus);
      }
    }
    expect(reviewStatusMatches(PENDING_REVIEW_STATUS, [PENDING_REVIEW_STATUS, READY_TO_PUBLISH_STATUS])).toBe(true);
    expect(reviewStatusMatches(READY_TO_PUBLISH_STATUS, [PENDING_REVIEW_STATUS, READY_TO_PUBLISH_STATUS])).toBe(true);
  });

  test("URL: sem parâmetro = Pendente revisão (padrão de antes); URL antiga com um status; vários; 'todos' = Todos", () => {
    expect(parseReviewStatusParams([])).toEqual([PENDING_REVIEW_STATUS]);
    expect(parseReviewStatusParams([READY_TO_PUBLISH_STATUS])).toEqual([READY_TO_PUBLISH_STATUS]);
    expect(parseReviewStatusParams([PENDING_REVIEW_STATUS, READY_TO_PUBLISH_STATUS])).toEqual([PENDING_REVIEW_STATUS, READY_TO_PUBLISH_STATUS]);
    expect(parseReviewStatusParams(["todos"])).toEqual([]);
    // ida e volta (atualização da página preserva a seleção)
    for (const selection of [[], [PENDING_REVIEW_STATUS], [READY_TO_PUBLISH_STATUS], [PENDING_REVIEW_STATUS, READY_TO_PUBLISH_STATUS]]) {
      expect(parseReviewStatusParams(reviewStatusParams(selection))).toEqual(selection);
    }
    expect(reviewStatusParams([PENDING_REVIEW_STATUS])).toEqual([]); // padrão: URL limpa, como antes
  });
});

test.describe("B. Status multisseleção — integração", () => {
  test("componente: checkboxes, 'Todos' limpa as seleções, Limpar/Aplicar, indicador de seleção personalizada; sem API", () => {
    const source = read(DROPDOWN);
    expect(source).toContain('aria-multiselectable="true"');
    expect(source).toContain("onClick={() => setDraft([])}"); // "Todos"
    expect(source).toContain("onClick={() => setDraft((current) => toggleStatusSelection(current, option.value))}");
    expect(source).toContain("onClick={() => { setDraft([]); onChange([]); setOpen(false); }}"); // Limpar
    expect(source).toContain("onClick={() => { onChange(draft); setOpen(false); }}"); // Aplicar
    expect(source).toContain("return `${selected.length} status selecionados`;");
    for (const forbidden of ["fetch(", "adminFetch", "supabase"]) expect(source).not.toContain(forbidden);
  });

  test("Banco: dropdown multisseleção com as mesmas opções e contadores; seletor antigo de Status removido", () => {
    const source = read(BANK_PAGE);
    expect(source).toContain("<StatusFilterDropdown\n              selected={statusFilters}\n              onChange={setStatusFilters}");
    expect(source).not.toMatch(/<SimpleSelectDropdown\s+label="Status"/);
    for (const label of ['label: "Rascunho"', 'label: "Publicada"', 'label: "Arquivada"', 'label: "Anuladas no Banco"', 'label: "Anuladas em Simulados"']) expect(source).toContain(label);
    expect(source).toContain(".map((item) => ({ ...item, count: statusFacetCounts[item.value] || 0 }))");
  });

  test("Banco: regras existentes da fila preservadas (status único derivado; mesmas expressões de antes)", () => {
    const source = read(BANK_PAGE);
    expect(source).toContain('const status = statusFilters.length === 1 ? statusFilters[0] : "";');
    expect(source).toContain("const isViewingPublicationQueue = status === READY_TO_PUBLISH_STATUS;");
    expect(source).toContain('const queueStatus = status || question.status || "draft";');
    expect(source).toContain('statusFilters.forEach((value) => params.append("status", value));');
    expect(source).toContain("if (bankStatusSelectionCovered(");
  });

  test("Banco (servidor): ?status= com um ou vários valores; consulta pelo plano de carga", () => {
    const source = read(BANK_SERVER);
    expect(source).toContain('statuses: parseStatusParams(arr("status"), [...QUESTION_STATUSES, SIMULADO_ANNULLED_FILTER_VALUE]),');
    expect(source).toContain("const loadPlan = bankStatusLoadPlan(initialFilters.statuses);");
    expect(source).toContain('questionsQuery = questionsQuery.in("status", loadPlan.statuses);');
    expect(source).toContain("await requireAdminPage();");
  });

  test("Revisar: dropdown multisseleção; fila de publicação só com ela como único status; Limpar filtros volta ao padrão", () => {
    const source = read(REVIEW_PAGE);
    expect(source).toContain("<StatusFilterDropdown\n              selected={filterStatus}\n              onChange={setFilterStatus}");
    expect(source).not.toMatch(/<SimpleSelectDropdown\s+label="Status"/);
    expect(source).toContain('const isReadyToPublishView = isOnlyStatus(filterStatus, "ready_to_publish") && filteredQueue.length > 0;');
    expect(source).toContain('setFilterStatus(["pending_review"]);');
    expect(source.match(/reviewStatusMatches\((question|q)\.status, filterStatus\)/g)?.length).toBe(6);
    expect(read(REVIEW_SERVER)).toContain('statuses: parseReviewStatusParams(arr("status")),');
  });
});

test.describe("A. Selecionar todas em Revisar questões", () => {
  const BANK_BLOCK_START = '<label className="inline-flex cursor-pointer items-center gap-3 font-bold text-white/65">';

  test("mesmo checkbox geral do Banco (marcação, classes e texto)", () => {
    const normalize = (block: string) => block.replace(/\s+/g, " ").trim();
    const blockOf = (source: string) => {
      const start = source.indexOf(BANK_BLOCK_START);
      expect(start).toBeGreaterThan(-1);
      return normalize(source.slice(start, source.indexOf("</label>", start) + "</label>".length));
    };
    expect(blockOf(read(REVIEW_PAGE))).toBe(blockOf(read(BANK_PAGE)));
    expect(read(REVIEW_PAGE)).toContain("{selectedIds.length} selecionada(s) • {paginatedQueue.length} exibida(s)");
  });

  test("mesma regra do Banco: atua nas questões exibidas da página atual (filtros e paginação)", () => {
    const review = read(REVIEW_PAGE);
    expect(review).toContain("const allVisibleSelected = paginatedQueue.length > 0 && paginatedQueue.every((question) => selectedIds.includes(question.id));");
    expect(read(BANK_PAGE)).toContain("renderedQuestions.every((question) => selectedIds.includes(question.id));");
    // paginatedQueue é a fatia da lista já filtrada
    expect(review).toContain("const paginatedQueue = filteredQueue.slice(");
  });

  test("marca/desmarca só selectedIds — nunca 'Preparar para fila', status ou API", () => {
    const body = functionBody(read(REVIEW_PAGE), "const toggleAllVisible = useCallback(() => {", "\n  }, [");
    expect(body).toContain("setSelectedIds((current) => current.filter((id) => !paginatedQueue.some((question) => question.id === id)));");
    expect(body).toContain("paginatedQueue.forEach((question) => merged.add(question.id));");
    for (const forbidden of ["publicationQueueIds", "setPublicationQueueIds", "setQueue", "adminFetch", "fetch(", "status"]) expect(body).not.toContain(forbidden);
  });

  test("barra inferior e ações em massa continuam usando selectedIds; Exportar TXT preservado", () => {
    const review = read(REVIEW_PAGE);
    expect(review).toContain("const ghostCount = selectedIds.length >= 2");
    expect(review).toContain('{ label: "Exportar TXT", icon: <Download size={14} />, onClick: exportSelectedQuestionsAsTxt, variant: "secondary" as const }');
    expect(review).toContain("filteredQueue.filter((question) => selectedIds.includes(question.id));");
  });
});
