// Filtro de Status com multisseleção das listagens administrativas de questões
// (Banco /questoes e Revisar /questoes/revisar). Regras puras, sem React.
//
// Lista vazia = "Todos" (sem restrição de status). Vários status = OU.
// Nada aqui grava ou altera status: é só filtro de listagem.

export const READY_TO_PUBLISH_STATUS = "ready_to_publish";
export const PENDING_REVIEW_STATUS = "pending_review";
// "Anuladas em Simulados" não é valor de questions.status: deriva de
// simulado_questions.status = "annulled" em pelo menos um vínculo.
export const SIMULADO_ANNULLED_FILTER_VALUE = "annulled_in_simulados";

// Status aceitos no Banco (URL/servidor). pending_review fica em /questoes/revisar.
export const BANK_QUESTION_STATUSES = ["draft", "published", "active", "archived", READY_TO_PUBLISH_STATUS, "annulled"];

// Lê os valores de ?status= (um ou vários), descartando inválidos e repetidos.
export function parseStatusParams(values: string[], allowed: string[]) {
  const result: string[] = [];
  for (const value of values) {
    if (allowed.includes(value) && !result.includes(value)) result.push(value);
  }
  return result;
}

export function isOnlyStatus(selected: string[], status: string) {
  return selected.length === 1 && selected[0] === status;
}

// ─── Banco de Questões ──────────────────────────────────────────────────────

// Mesmo predicado de antes, aplicado a cada status selecionado (OU).
export function bankStatusMatches(questionStatus: string | null | undefined, annulledInAnySimulado: boolean, selected: string[]) {
  const qStatus = questionStatus || "draft";
  if (selected.length === 0) return qStatus !== PENDING_REVIEW_STATUS && qStatus !== READY_TO_PUBLISH_STATUS;
  return selected.some((status) =>
    qStatus === status ||
    (status === "published" && ["published", "active"].includes(qStatus)) ||
    (status === SIMULADO_ANNULLED_FILTER_VALUE && annulledInAnySimulado),
  );
}

// O que o servidor precisa carregar para a seleção.
// - "default": tudo exceto pending_review e ready_to_publish (comportamento de "Todos");
// - "in": exatamente os status listados (um status = mesma consulta de antes);
// "Anuladas em Simulados" é derivado, então exige a carga padrão (mais a fila, se marcada).
export type BankStatusLoadPlan = { mode: "default"; includeReadyToPublish: boolean } | { mode: "in"; statuses: string[] };

export function bankStatusLoadPlan(selected: string[]): BankStatusLoadPlan {
  if (selected.length === 0) return { mode: "default", includeReadyToPublish: false };
  if (selected.includes(SIMULADO_ANNULLED_FILTER_VALUE)) {
    return { mode: "default", includeReadyToPublish: selected.includes(READY_TO_PUBLISH_STATUS) };
  }
  const statuses: string[] = [];
  for (const status of selected) {
    for (const value of status === "published" ? ["published", "active"] : [status]) {
      if (!statuses.includes(value)) statuses.push(value);
    }
  }
  return { mode: "in", statuses };
}

// Os dados já carregados (plano de `loaded`) bastam para filtrar `next` no cliente?
// Se não, a tela recarrega do servidor com a nova seleção.
export function bankStatusSelectionCovered(loaded: string[], next: string[]) {
  const loadedPlan = bankStatusLoadPlan(loaded);
  const nextPlan = bankStatusLoadPlan(next);
  if (loadedPlan.mode === "default") {
    if (nextPlan.mode === "default") return loadedPlan.includeReadyToPublish || !nextPlan.includeReadyToPublish;
    return nextPlan.statuses.every((status) => status !== PENDING_REVIEW_STATUS && (status !== READY_TO_PUBLISH_STATUS || loadedPlan.includeReadyToPublish));
  }
  if (nextPlan.mode === "default") return false;
  return nextPlan.statuses.every((status) => loadedPlan.statuses.includes(status));
}

// ─── Revisar questões ───────────────────────────────────────────────────────

// Lista vazia = Todos (a fila só contém pending_review e ready_to_publish).
export function reviewStatusMatches(questionStatus: string | null | undefined, selected: string[]) {
  return selected.length === 0 || selected.includes(String(questionStatus || ""));
}

// URL do Revisar: sem parâmetro = padrão (pending_review); "todos" = sem restrição.
export const REVIEW_ALL_STATUSES_PARAM = "todos";

export function parseReviewStatusParams(values: string[]) {
  if (values.includes(REVIEW_ALL_STATUSES_PARAM)) return [];
  const statuses = values.filter((value, index) => value && values.indexOf(value) === index);
  return statuses.length > 0 ? statuses : [PENDING_REVIEW_STATUS];
}

export function reviewStatusParams(selected: string[]) {
  if (selected.length === 0) return [REVIEW_ALL_STATUSES_PARAM];
  if (isOnlyStatus(selected, PENDING_REVIEW_STATUS)) return [];
  return selected;
}
