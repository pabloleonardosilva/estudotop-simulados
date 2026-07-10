import type { ScoringModel, SimuladoStatus } from "./types";

export function formatDateTime(value?: string | null) {
  if (!value) return "Nao informado";

  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "Nao informado";
  }
}

export function statusLabel(status?: string | null) {
  const labels: Record<SimuladoStatus, string> = {
    draft: "Rascunho",
    published: "Publicado",
    archived: "Arquivado",
  };

  return labels[(status || "draft") as SimuladoStatus] || "Rascunho";
}

export function statusClass(status?: string | null) {
  if (status === "published") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  }

  if (status === "archived") {
    return "border-slate-400/30 bg-slate-400/10 text-slate-300";
  }

  return "border-amber-400/30 bg-amber-400/10 text-amber-200";
}

export function scoringLabel(model?: string | null) {
  const labels: Record<ScoringModel, string> = {
    traditional: "Tradicional",
    cebraspe: "CEBRASPE",
  };

  return labels[(model || "traditional") as ScoringModel] || "Tradicional";
}

export function timeLimitLabel(value?: number | null) {
  return value ? `${value} min` : "Sem limite";
}

export function attemptsLabel(value?: number | null) {
  return value ? `${value} tentativa${value > 1 ? "s" : ""}` : "Ilimitado";
}

export function stripHtml(value?: string | null) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function difficultyStars(value?: number | null) {
  const level = Number(value || 0);
  if (!Number.isInteger(level) || level < 1 || level > 5) return "☆☆☆☆☆";
  return `${"★".repeat(level)}${"☆".repeat(5 - level)}`;
}

export function difficultyLabel(value?: number | null) {
  return difficultyStars(value);
}
