import type { JornadaCategory, JornadaScopeType, JornadaStatus, StudentJornadaStatus } from "./types";

export const JORNADA_CATEGORIES: Array<{ value: JornadaCategory; label: string; description: string; image: string }> = [
  { value: "saude", label: "Área da Saúde", description: "Jornadas para concursos e carreiras da saúde.", image: "/jornadas/categories/saude.webp" },
  { value: "policial", label: "Policial", description: "Jornadas para carreiras policiais e de segurança pública.", image: "/jornadas/categories/policial.webp" },
  { value: "tribunais", label: "Tribunais", description: "Jornadas voltadas a tribunais e carreiras jurídicas.", image: "/jornadas/categories/tribunais.webp" },
  { value: "administrativo", label: "Administrativo", description: "Jornadas para prefeituras e carreiras administrativas.", image: "/jornadas/categories/administrativo.webp" },
];

export function jornadaCategoryLabel(category: JornadaCategory | string | null | undefined): string {
  return JORNADA_CATEGORIES.find((item) => item.value === category)?.label || "Categoria não definida";
}

export function jornadaCategoryImage(category: JornadaCategory | string | null | undefined): string {
  return JORNADA_CATEGORIES.find((item) => item.value === category)?.image || "/jornadas/categories/administrativo.webp";
}

function parseDateValue(value: string | null | undefined, dateOnly = false): Date | null {
  if (!value) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = dateOnly && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw;
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function formatDate(value: string | null | undefined): string {
  const date = parseDateValue(value, true);
  if (!date) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  const date = parseDateValue(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function statusLabel(status: JornadaStatus | string | null | undefined): string {
  if (status === "published") return "Publicada";
  if (status === "archived") return "Arquivada";
  return "Rascunho";
}

export function statusBadgeClass(status: JornadaStatus | string | null | undefined): string {
  if (status === "published") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "archived") return "border-red-200 bg-red-50 text-red-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

export function scopeLabel(scopeType: JornadaScopeType | string | null | undefined, contestName?: string | null): string {
  if (scopeType === "contest") return contestName?.trim() || "Concurso específico";
  return "Geral";
}

export function scopeBadgeClass(scopeType: JornadaScopeType | string | null | undefined): string {
  if (scopeType === "contest") return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export function enrollmentStatusLabel(status: StudentJornadaStatus | string): string {
  if (status === "expired") return "Expirada";
  if (status === "cancelled") return "Cancelada";
  if (status === "paused") return "Pausada";
  return "Ativa";
}

export function enrollmentStatusClass(status: StudentJornadaStatus | string): string {
  if (status === "expired") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "cancelled") return "border-red-200 bg-red-50 text-red-700";
  if (status === "paused") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}


export function jornadaDurationDays(jornada: { duration_days?: number | null; duration_months?: number | null }): number {
  const explicitDays = Number(jornada.duration_days || 0);
  if (Number.isFinite(explicitDays) && explicitDays > 0) return explicitDays;
  return Math.max(0, Number(jornada.duration_months || 0) * 30);
}

export function daysRemaining(expiresAt: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = parseDateValue(expiresAt, true);
  if (!exp) return "—";
  exp.setHours(0, 0, 0, 0);
  const diff = Math.round((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return "Expirada";
  if (diff === 0) return "Expira hoje";
  if (diff === 1) return "1 dia restante";
  return `${diff} dias restantes`;
}

export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function isWithinFinalExamWindow(startedAt: Date, examDate: Date | null): boolean {
  if (!examDate) return false;
  const effectiveEnd = new Date(examDate);
  effectiveEnd.setDate(effectiveEnd.getDate() - 7);
  effectiveEnd.setHours(0, 0, 0, 0);
  const start = new Date(startedAt);
  start.setHours(0, 0, 0, 0);
  return start >= effectiveEnd;
}

export function calcReleaseSchedule(
  startedAt: Date,
  linkedSimuladoCount: number,
  durationMonths: number,
  examDate: Date | null,
  plannedSimuladosCount = linkedSimuladoCount,
): Date[] {
  if (linkedSimuladoCount === 0) return [];

  const calculationBase = Math.max(1, plannedSimuladosCount || linkedSimuladoCount);

  if (isWithinFinalExamWindow(startedAt, examDate)) {
    return Array.from({ length: linkedSimuladoCount }, () => new Date(startedAt));
  }

  let intervalDays: number;

  if (examDate) {
    const effectiveEnd = new Date(examDate);
    effectiveEnd.setDate(effectiveEnd.getDate() - 7);
    const availableDays = Math.round(
      (effectiveEnd.getTime() - startedAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (availableDays <= 0) {
      return Array.from({ length: linkedSimuladoCount }, () => new Date(startedAt));
    }
    intervalDays = availableDays / calculationBase;
  } else {
    intervalDays = (durationMonths * 30) / calculationBase;
  }

  return Array.from({ length: linkedSimuladoCount }, (_, i) => {
    const ms = startedAt.getTime() + Math.floor(i * intervalDays) * 24 * 60 * 60 * 1000;
    return new Date(ms);
  });
}
