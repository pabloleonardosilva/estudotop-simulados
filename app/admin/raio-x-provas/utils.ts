import type { RaioXStatus } from "./types";

export function statusLabel(status: RaioXStatus | string) {
  const map: Record<string, string> = {
    draft: "Rascunho",
    processing: "Analisando",
    review_pending: "Aguardando revisão",
    reviewed: "Revisada",
    archived: "Arquivada",
    failed: "Erro",
  };
  return map[status] || status;
}

export function statusClass(status: RaioXStatus | string) {
  if (status === "review_pending") return "border-orange-400/35 bg-orange-500/10 text-orange-200";
  if (status === "reviewed") return "border-emerald-300/35 bg-emerald-400/10 text-emerald-200";
  if (status === "processing") return "border-sky-300/35 bg-sky-400/10 text-sky-200";
  if (status === "failed") return "border-red-300/35 bg-red-400/10 text-red-200";
  if (status === "archived") return "border-slate-400/25 bg-slate-500/10 text-slate-300";
  return "border-white/10 bg-white/[0.04] text-slate-300";
}

export function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export function formatDateOnly(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date);
}

export function difficultyLabel(value?: number | null) {
  if (!value) return "Sem nível";
  if (value <= 1) return "Muito fácil";
  if (value === 2) return "Fácil";
  if (value === 3) return "Média";
  if (value === 4) return "Difícil";
  return "Muito difícil";
}
