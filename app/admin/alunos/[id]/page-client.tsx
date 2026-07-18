"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Ban,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Edit3,
  Eye,
  FilePen,
  Filter,
  Gauge,
  History,
  KeyRound,
  Layers,
  ListChecks,
  Mail,
  MapPin,
  Search,
  Phone,
  Pencil,
  PlayCircle,
  PlusCircle,
  RotateCcw,
  Save,
  Unlock,
  Shield,
  ShieldCheck,
  ShieldOff,
  Timer,
  Trash2,
  TrendingUp,
  Trophy,
  UserRound,
  UserX,
  X,
} from "lucide-react";
import PremiumButton from "@/app/components/ui/PremiumButton";
import PremiumLoadingOverlay from "@/app/components/ui/PremiumLoadingOverlay";
import PremiumModal from "@/app/components/ui/PremiumModal";
import { adminFetch } from "@/lib/supabase/adminFetch";
import { formatCpf } from "@/lib/utils/cpf";
import type { ActivityLog, AvailableJornada, StudentDetail, StudentEmailHistoryItem, StudentJornada, StudentJornadaScheduleItem, StudentSystemActivity, StudentUsageSession } from "./page";

// ── Formatadores ─────────────────────────────────────────────────────────────

function parseDateValue(value: string | null | undefined, dateOnly = false): Date | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw || raw === "null" || raw === "undefined") return null;
  const normalized = dateOnly && !raw.includes("T") ? `${raw}T00:00:00` : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function fmtDate(value: string | null | undefined): string {
  const date = parseDateValue(value, true);
  if (!date) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function fmtDateTime(value: string | null | undefined): string {
  const date = parseDateValue(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(date);
}

function fmtSeconds(s: number | undefined): string {
  if (!s) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}min`;
  return `${m}min`;
}

function fmtCpf(value: string | null): string {
  if (!value) return "—";
  return formatCpf(value);
}

function statusLabel(status: string): string {
  if (status === "available") return "Disponível";
  if (status === "in_progress") return "Em andamento";
  if (status === "completed") return "Concluído";
  if (status === "locked") return "Bloqueado";
  return status || "—";
}

function statusClass(status: string): string {
  if (status === "available") return "border-orange-400/55 bg-[linear-gradient(180deg,rgba(255,138,0,0.18),rgba(255,98,0,0.08))] text-[#FFC45C] shadow-[0_0_18px_rgba(255,138,0,0.18),inset_0_1px_0_rgba(255,255,255,0.05)]";
  if (status === "in_progress") return "border-blue-500/25 bg-blue-500/[0.12] text-blue-300";
  if (status === "completed") return "border-emerald-500/25 bg-emerald-500/[0.12] text-emerald-300";
  return "border-white/10 bg-white/[0.05] text-white/45";
}

// ── Status config ─────────────────────────────────────────────────────────────

const DELETE_DEPENDENCY_LABELS: Record<string, string> = {
  jornadas: "Jornadas",
  tentativas: "Tentativas de simulado",
  resultados: "Resultados de simulado",
  avaliacoes: "Avaliações de simulado",
  anotacoes: "Anotações do aluno",
  topcoins: "TopCoins",
  tentativas_legado: "Tentativas (histórico antigo)",
  simulados_legado: "Simulados (histórico antigo)",
};

const STUDENT_STATUS_CFG: Record<string, { label: string; cls: string; icon: ReactNode }> = {
  pending: {
    label: "Em análise",
    cls: "border-amber-500/20 bg-amber-500/10 text-amber-400",
    icon: <Clock3 size={13} />,
  },
  active: {
    label: "Ativo",
    cls: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
    icon: <ShieldCheck size={13} />,
  },
  blocked: {
    label: "Bloqueado",
    cls: "border-red-500/20 bg-red-500/10 text-red-400",
    icon: <ShieldOff size={13} />,
  },
  inactive: {
    label: "Inativo",
    cls: "border-white/10 bg-white/[0.04] text-white/40",
    icon: <UserRound size={13} />,
  },
};

const JORNADA_STATUS_CFG: Record<string, { label: string; cls: string }> = {
  active: { label: "Ativa", cls: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" },
  expired: { label: "Expirada", cls: "border-red-500/20 bg-red-500/10 text-red-400" },
  cancelled: { label: "Cancelada", cls: "border-white/10 bg-white/[0.04] text-white/40" },
  paused: { label: "Pausada", cls: "border-amber-500/20 bg-amber-500/10 text-amber-400" },
};

// ── Activity log helpers ──────────────────────────────────────────────────────

function eventIcon(type: string) {
  const cls = "h-4 w-4";
  switch (type) {
    case "field_update":       return <FilePen className={cls} />;
    case "status_change":      return <ShieldCheck className={cls} />;
    case "jornada_assigned":   return <MapPin className={cls} />;
    case "jornada_cancelled":  return <Ban className={cls} />;
    case "access_extended":    return <PlusCircle className={cls} />;
    case "simulado_completed": return <CheckCircle2 className={cls} />;
    case "simulado_started":   return <PlayCircle className={cls} />;
    case "simulado_abandoned": return <X className={cls} />;
    default:                   return <Activity className={cls} />;
  }
}

function eventBadgeClass(type: string): string {
  switch (type) {
    case "field_update":       return "bg-white/[0.06] text-white/50";
    case "status_change":      return "bg-amber-500/15 text-amber-400";
    case "jornada_assigned":   return "bg-emerald-500/15 text-emerald-400";
    case "jornada_cancelled":  return "bg-red-500/15 text-red-400";
    case "access_extended":    return "bg-blue-500/15 text-blue-400";
    case "simulado_completed": return "bg-emerald-500/15 text-emerald-400";
    case "simulado_started":   return "bg-blue-500/15 text-blue-400";
    case "simulado_abandoned": return "bg-amber-500/15 text-amber-400";
    default:                   return "bg-white/[0.06] text-white/50";
  }
}

function renderEventDetails(log: ActivityLog) {
  const d = log.details || {};

  if (log.event_type === "field_update") {
    const from = d.from as string | null;
    const to = d.to as string | null;
    return (
      <p className="mt-0.5 text-xs text-white/35">
        {from ? `"${from}"` : <span className="italic">vazio</span>}
        {" → "}
        {to ? `"${to}"` : <span className="italic">vazio</span>}
      </p>
    );
  }

  if (log.event_type === "jornada_assigned") {
    return (
      <p className="mt-0.5 text-xs text-white/35">
        Início: {fmtDate(d.started_at as string)} · Expiração: {fmtDate(d.expires_at as string)} · {d.simulados_count as number} simulado(s)
      </p>
    );
  }

  if (log.event_type === "access_extended") {
    return (
      <p className="mt-0.5 text-xs text-white/35">
        {fmtDate(d.old_expires_at as string)} → {fmtDate(d.new_expires_at as string)} (+{d.days_added as number} dia(s))
      </p>
    );
  }

  if (log.event_type === "simulado_completed") {
    const pct = d.percentage as number;
    const correct = d.correct_count as number;
    const total = d.total_questions as number;
    const secs = d.time_spent_seconds as number;
    return (
      <p className="mt-0.5 text-xs text-white/35">
        {correct}/{total} acertos · {Math.round(pct)}% · {fmtSeconds(secs)}
      </p>
    );
  }

  return null;
}


// ── Perfil analítico do aluno ────────────────────────────────────────────────

type ActivityTab = "resumo" | "sessoes" | "atividades" | "historico" | "engajamento";
type PeriodFilter = "7d" | "30d" | "90d" | "all";

type TimelineItem = {
  id: string;
  source: "student" | "system";
  type: string;
  title: string;
  description?: string | null;
  created_at: string;
  route?: string | null;
  metadata: Record<string, unknown>;
};

function dateWithinPeriod(value: string | null | undefined, period: PeriodFilter) {
  if (period === "all") return true;
  const date = parseDateValue(value);
  if (!date) return false;
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  return date.getTime() >= Date.now() - days * 24 * 60 * 60 * 1000;
}

function shortRoute(route?: string | null) {
  if (!route) return "—";
  return route.length > 46 ? `${route.slice(0, 43)}…` : route;
}

function formatUserAgent(value?: string | null) {
  if (!value) return "Dispositivo não identificado";
  const browser = value.includes("Edg/") ? "Edge" : value.includes("Chrome/") ? "Chrome" : value.includes("Firefox/") ? "Firefox" : value.includes("Safari/") ? "Safari" : "Navegador";
  const os = value.includes("Windows") ? "Windows" : value.includes("Mac OS") ? "macOS" : value.includes("Android") ? "Android" : value.includes("iPhone") || value.includes("iPad") ? "iOS" : "Sistema não identificado";
  return `${browser} · ${os}`;
}

function daysSince(value: string | null | undefined) {
  const date = parseDateValue(value);
  if (!date) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000)));
}

function getDetailsText(details: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = details?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

type ActivityContext = {
  jornadaByStudentJornadaId: Map<string, { id: string; title: string }>;
  jornadaByJornadaId: Map<string, { id: string; title: string }>;
  simuladoById: Map<string, { id: string; title: string; jornadaId?: string; jornadaTitle?: string }>;
  attemptById: Map<string, { simuladoId: string; simuladoTitle: string; jornadaTitle?: string }>;
};

function buildActivityContext(jornadas: StudentJornada[]): ActivityContext {
  const jornadaByStudentJornadaId = new Map<string, { id: string; title: string }>();
  const jornadaByJornadaId = new Map<string, { id: string; title: string }>();
  const simuladoById = new Map<string, { id: string; title: string; jornadaId?: string; jornadaTitle?: string }>();
  const attemptById = new Map<string, { simuladoId: string; simuladoTitle: string; jornadaTitle?: string }>();

  for (const jornada of jornadas) {
    const jornadaTitle = jornada.jornadas?.title || "Jornada";
    jornadaByStudentJornadaId.set(jornada.id, { id: jornada.jornada_id, title: jornadaTitle });
    jornadaByJornadaId.set(jornada.jornada_id, { id: jornada.jornada_id, title: jornadaTitle });

    for (const item of jornada.schedule || []) {
      if (item.simulado_id) {
        simuladoById.set(item.simulado_id, {
          id: item.simulado_id,
          title: item.title || `Simulado ${item.order_number || ""}`.trim(),
          jornadaId: jornada.jornada_id,
          jornadaTitle,
        });
      }
      if (item.latest_attempt_id) {
        attemptById.set(item.latest_attempt_id, {
          simuladoId: item.simulado_id,
          simuladoTitle: item.title || `Simulado ${item.order_number || ""}`.trim(),
          jornadaTitle,
        });
      }
    }
  }

  return { jornadaByStudentJornadaId, jornadaByJornadaId, simuladoById, attemptById };
}

function routeId(route: string | null | undefined, prefix: string) {
  if (!route) return null;
  const match = route.match(new RegExp(`${prefix}/([^/?#]+)`));
  return match?.[1] || null;
}

function enrichActivityMetadata(
  metadata: Record<string, unknown>,
  entityType: string | null | undefined,
  entityId: string | null | undefined,
  context: ActivityContext,
  route?: string | null,
) {
  const next: Record<string, unknown> = { ...(metadata || {}) };
  const entity = entityId ? String(entityId) : null;

  const studentJornadaId = getDetailsText(next, ["student_jornada_id", "studentJornadaId"]) || (entityType === "student_jornada" ? entity : null);
  const jornadaId = getDetailsText(next, ["jornada_id", "jornadaId"]);
  const routeJornadaId = routeId(route, "/minhas-jornadas");
  const resolvedJornada =
    (studentJornadaId ? context.jornadaByStudentJornadaId.get(studentJornadaId) : null) ||
    (jornadaId ? context.jornadaByJornadaId.get(jornadaId) : null) ||
    (routeJornadaId ? context.jornadaByStudentJornadaId.get(routeJornadaId) || context.jornadaByJornadaId.get(routeJornadaId) : null);

  if (resolvedJornada) {
    next.jornada_id = resolvedJornada.id;
    next.jornada_title = getDetailsText(next, ["jornada_title", "jornada_name", "jornada"]) || resolvedJornada.title;
  }

  const simuladoId =
    getDetailsText(next, ["simulado_id", "simuladoId"]) ||
    (entityType === "simulado" ? entity : null) ||
    routeId(route, "/meus-simulados");
  const resolvedSimulado = simuladoId ? context.simuladoById.get(simuladoId) : null;

  if (resolvedSimulado) {
    next.simulado_id = resolvedSimulado.id;
    next.simulado_title = getDetailsText(next, ["simulado_title", "simulado_name", "simulado"]) || resolvedSimulado.title;
    if (!next.jornada_title && resolvedSimulado.jornadaTitle) next.jornada_title = resolvedSimulado.jornadaTitle;
    if (!next.jornada_id && resolvedSimulado.jornadaId) next.jornada_id = resolvedSimulado.jornadaId;
  }

  const attemptId = getDetailsText(next, ["attempt_id", "attemptId"]) || (entityType === "attempt" ? entity : null);
  const resolvedAttempt = attemptId ? context.attemptById.get(attemptId) : null;
  if (resolvedAttempt) {
    next.attempt_id = attemptId;
    next.simulado_id = resolvedAttempt.simuladoId;
    next.simulado_title = getDetailsText(next, ["simulado_title", "simulado_name", "simulado"]) || resolvedAttempt.simuladoTitle;
    if (!next.jornada_title && resolvedAttempt.jornadaTitle) next.jornada_title = resolvedAttempt.jornadaTitle;
  }

  return next;
}

function friendlyEventDescription(type: string, metadata: Record<string, unknown> = {}, route?: string | null) {
  const jornada = getDetailsText(metadata, ["jornada_title", "jornada_name", "jornada"]);
  const simulado = getDetailsText(metadata, ["simulado_title", "simulado_name", "simulado"]);

  if (jornada && simulado) return `Jornada: ${jornada} · Simulado: ${simulado}`;
  if (jornada) return `Jornada: ${jornada}`;
  if (simulado) return `Simulado: ${simulado}`;
  if (route) return `Página registrada: ${shortRoute(route)}`;
  return null;
}

function friendlyEventTitle(type: string, metadata: Record<string, unknown> = {}) {
  const jornada = getDetailsText(metadata, ["jornada_title", "jornada_name", "jornada"]);
  const simulado = getDetailsText(metadata, ["simulado_title", "simulado_name", "simulado"]);
  const map: Record<string, string> = {
    "student.jornada.opened": jornada ? `Abriu a Jornada ${jornada}` : "Abriu uma Jornada",
    "student.result.viewed": simulado ? `Visualizou o resultado de ${simulado}` : "Visualizou resultado de simulado",
    "student.simulado.opened": simulado ? `Abriu o simulado ${simulado}` : "Abriu um simulado",
    "student.feedback.sent": "Enviou avaliação do simulado",
    "student.notes.updated": "Atualizou anotações do simulado",
    student_login_success: "Entrou no sistema",
    login_success: "Entrou no sistema",
    session_touch: "Navegou pelo sistema",
    simulado_attempt_started: simulado ? `Iniciou ${simulado}` : "Iniciou uma tentativa de simulado",
    simulado_completed: simulado ? `Finalizou ${simulado}` : "Finalizou um simulado",
    jornada_assigned: jornada ? `Recebeu acesso à Jornada ${jornada}` : "Recebeu acesso a uma Jornada",
    jornada_cancelled: jornada ? `Matrícula cancelada em ${jornada}` : "Matrícula de Jornada cancelada",
    jornada_paused: jornada ? `Matrícula pausada em ${jornada}` : "Matrícula de Jornada pausada",
    jornada_resumed: jornada ? `Matrícula reativada em ${jornada}` : "Matrícula de Jornada reativada",
    jornada_access_extended: jornada ? `Prazo estendido em ${jornada}` : "Prazo de acesso estendido",
    student_created: "Cadastro do aluno criado",
    student_fields_updated: "Dados cadastrais atualizados",
    student_status_changed: "Status de acesso alterado",
    field_update: "Dados cadastrais atualizados",
    status_change: "Status de acesso alterado",
    jornada_assigned_legacy: jornada ? `Recebeu acesso à Jornada ${jornada}` : "Recebeu acesso a uma Jornada",
    access_extended: "Prazo de acesso estendido",
  };
  return map[type] || type.replaceAll("_", " ").replaceAll(".", " ");
}

function eventKind(type: string, metadata: Record<string, unknown> = {}) {
  const combined = `${type} ${JSON.stringify(metadata || {})}`.toLowerCase();
  if (combined.includes("simulado") || combined.includes("attempt") || combined.includes("result")) return "simulado";
  if (combined.includes("jornada")) return "jornada";
  if (combined.includes("login") || combined.includes("session") || combined.includes("opened") || combined.includes("viewed")) return "acesso";
  return "admin";
}

function timelineIcon(kind: string) {
  const cls = "h-4 w-4";
  if (kind === "simulado") return <PlayCircle className={cls} />;
  if (kind === "jornada") return <MapPin className={cls} />;
  if (kind === "acesso") return <Eye className={cls} />;
  return <Activity className={cls} />;
}

function timelineClass(kind: string) {
  if (kind === "simulado") return "border-blue-400/20 bg-blue-500/[0.12] text-blue-300";
  if (kind === "jornada") return "border-orange-400/20 bg-orange-500/[0.12] text-orange-300";
  if (kind === "acesso") return "border-emerald-400/20 bg-emerald-500/[0.12] text-emerald-300";
  return "border-white/[0.08] bg-white/[0.05] text-white/45";
}


const SESSION_INACTIVITY_LIMIT_MS = 30 * 60 * 1000;
const SESSION_ONLINE_LIMIT_MS = 5 * 60 * 1000;

type DisplayUsageSession = {
  id: string;
  rawSession: StudentUsageSession;
  started_at: string;
  last_activity_at: string;
  last_signal_at: string | null;
  active_seconds: number;
  is_currently_online: boolean;
  ended_by_inactivity: boolean;
  status_label: string;
  status_class: string;
  items: TimelineItem[];
};

function isTechnicalSignal(item: TimelineItem) {
  const type = String(item.type || "").toLowerCase();
  return type === "session_touch" || type === "student_session_heartbeat" || type.includes("heartbeat");
}

function calculateActiveSeconds(items: TimelineItem[]) {
  if (items.length === 0) return 0;
  const sorted = [...items].sort((a, b) => (parseDateValue(a.created_at)?.getTime() || 0) - (parseDateValue(b.created_at)?.getTime() || 0));
  if (sorted.length === 1) return 60;
  let total = 0;
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = parseDateValue(sorted[i - 1].created_at)?.getTime() || 0;
    const current = parseDateValue(sorted[i].created_at)?.getTime() || 0;
    const diff = Math.max(0, current - prev);
    total += Math.min(diff, SESSION_INACTIVITY_LIMIT_MS);
  }
  return Math.max(60, Math.round(total / 1000));
}

function buildDisplaySessions(rawSessions: StudentUsageSession[], timeline: TimelineItem[]): DisplayUsageSession[] {
  const chronologicalTimeline = [...timeline].sort((a, b) => (parseDateValue(a.created_at)?.getTime() || 0) - (parseDateValue(b.created_at)?.getTime() || 0));

  return rawSessions.flatMap((session) => {
    const start = parseDateValue(session.started_at);
    const signalEnd = parseDateValue(session.last_seen_at || session.ended_at || session.started_at);
    if (!start) return [];

    const startTs = start.getTime();
    const signalEndTs = signalEnd?.getTime() || startTs;
    const allSessionItems = chronologicalTimeline.filter((item) => {
      const ts = parseDateValue(item.created_at)?.getTime() || 0;
      return ts >= startTs && ts <= signalEndTs + 60 * 1000;
    });

    const meaningfulItems = allSessionItems.filter((item) => !isTechnicalSignal(item));
    const segments: TimelineItem[][] = [];

    for (const item of meaningfulItems) {
      const itemTs = parseDateValue(item.created_at)?.getTime() || 0;
      const current = segments[segments.length - 1];
      const previous = current?.[current.length - 1];
      const previousTs = previous ? (parseDateValue(previous.created_at)?.getTime() || 0) : null;
      if (!current || previousTs === null || itemTs - previousTs > SESSION_INACTIVITY_LIMIT_MS) {
        segments.push([item]);
      } else {
        current.push(item);
      }
    }

    const now = Date.now();
    const rawIsOnline = Boolean(session.is_active) && signalEndTs > 0 && now - signalEndTs <= SESSION_ONLINE_LIMIT_MS;

    if (segments.length === 0) {
      const activeSeconds = session.duration_seconds ? Math.min(Number(session.duration_seconds || 0), 60) : 60;
      const endedByInactivity = Boolean(signalEndTs - startTs > SESSION_INACTIVITY_LIMIT_MS && !rawIsOnline);
      return [{
        id: `${session.id}:0`,
        rawSession: session,
        started_at: session.started_at,
        last_activity_at: session.started_at,
        last_signal_at: session.last_seen_at || session.ended_at || null,
        active_seconds: activeSeconds,
        is_currently_online: rawIsOnline,
        ended_by_inactivity: endedByInactivity,
        status_label: rawIsOnline ? "Online agora" : endedByInactivity ? "Encerrada por inatividade" : "Encerrada",
        status_class: rawIsOnline ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" : endedByInactivity ? "border-amber-500/25 bg-amber-500/10 text-amber-300" : "border-white/[0.08] bg-white/[0.04] text-white/45",
        items: [],
      }];
    }

    return segments.map((items, index) => {
      const first = items[0];
      const last = items[items.length - 1];
      const firstTs = parseDateValue(first.created_at)?.getTime() || startTs;
      const lastTs = parseDateValue(last.created_at)?.getTime() || firstTs;
      const isLastSegment = index === segments.length - 1;
      const gapAfterLastActivity = signalEndTs - lastTs;
      const isOnlineNow = isLastSegment && rawIsOnline && now - lastTs <= SESSION_INACTIVITY_LIMIT_MS;
      const endedByInactivity = !isOnlineNow && (gapAfterLastActivity > SESSION_INACTIVITY_LIMIT_MS || (index < segments.length - 1));
      const lastSignal = isLastSegment ? (session.last_seen_at || session.ended_at || null) : null;

      return {
        id: `${session.id}:${index}`,
        rawSession: session,
        started_at: first.created_at,
        last_activity_at: last.created_at,
        last_signal_at: lastSignal,
        active_seconds: calculateActiveSeconds(items),
        is_currently_online: isOnlineNow,
        ended_by_inactivity: endedByInactivity,
        status_label: isOnlineNow ? "Online agora" : endedByInactivity ? "Encerrada por inatividade" : "Encerrada",
        status_class: isOnlineNow ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" : endedByInactivity ? "border-amber-500/25 bg-amber-500/10 text-amber-300" : "border-white/[0.08] bg-white/[0.04] text-white/45",
        items,
      };
    });
  }).sort((a, b) => (parseDateValue(b.started_at)?.getTime() || 0) - (parseDateValue(a.started_at)?.getTime() || 0));
}

function assignedStatus(item: StudentJornadaScheduleItem, jornadaStatus: string) {
  const scheduled = parseDateValue(item.scheduled_release_at, true);
  const now = new Date();
  if (jornadaStatus === "expired") return { label: "Expirado", cls: "border-red-500/25 bg-red-500/10 text-red-300" };
  if (item.status === "completed" || item.latest_result_finished_at || item.completed_at) return { label: "Realizado", cls: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" };
  if (item.latest_attempt_status === "in_progress" || item.attempts_in_progress > 0) return { label: "Em andamento", cls: "border-blue-500/25 bg-blue-500/10 text-blue-300" };
  if (["available", "in_progress"].includes(item.status) && item.attempts_total === 0) return { label: "Disponível", cls: "border-orange-400/35 bg-orange-500/10 text-orange-300" };
  if (item.status === "locked" && scheduled && scheduled.getTime() > now.getTime()) return { label: "Aguardando Liberação", cls: "border-white/[0.10] bg-white/[0.04] text-white/45" };
  if (item.status === "locked") return { label: "Bloqueado", cls: "border-amber-500/25 bg-amber-500/10 text-amber-300" };
  return { label: statusLabel(item.status), cls: statusClass(item.status) };
}

function metricValue(value: number, empty = "0") {
  return Number.isFinite(value) ? String(value) : empty;
}

function AlunoActivityPanel({
  student,
  activityLog,
  usageSessions,
  systemActivities,
  jornadas,
  onAssign,
  onOpenSchedule,
}: {
  student: StudentDetail;
  activityLog: ActivityLog[];
  usageSessions: StudentUsageSession[];
  systemActivities: StudentSystemActivity[];
  jornadas: StudentJornada[];
  onAssign: () => void;
  onOpenSchedule: (jornada: StudentJornada) => void;
}) {
  const [tab, setTab] = useState<ActivityTab>("resumo");
  const [period, setPeriod] = useState<PeriodFilter>("30d");
  const [kindFilter, setKindFilter] = useState("all");
  const [jornadaFilter, setJornadaFilter] = useState("all");
  const [assignedStatusFilter, setAssignedStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const activityContext = useMemo(() => buildActivityContext(jornadas), [jornadas]);

  const allTimeline = useMemo<TimelineItem[]>(() => {
    const studentItems = activityLog.map((log) => {
      const metadata = enrichActivityMetadata(
        { ...(log.details || {}), entity_type: log.entity_type, entity_id: log.entity_id },
        log.entity_type,
        log.entity_id,
        activityContext,
      );
      const shouldTranslate = !log.description || log.description === log.event_type || log.description.startsWith("student.");
      return {
        id: `student:${log.id}`,
        source: "student" as const,
        type: log.event_type,
        title: shouldTranslate ? friendlyEventTitle(log.event_type, metadata) : log.description,
        description: friendlyEventDescription(log.event_type, metadata),
        created_at: log.created_at,
        route: null,
        metadata,
      };
    });
    const systemItems = systemActivities.map((log) => {
      const metadata = enrichActivityMetadata(log.metadata || {}, log.entity_type, log.entity_id, activityContext, log.route);
      return {
        id: `system:${log.id}`,
        source: "system" as const,
        type: log.action,
        title: friendlyEventTitle(log.action, metadata),
        description: friendlyEventDescription(log.action, metadata, log.route),
        created_at: log.created_at,
        route: log.route,
        metadata,
      };
    });
    return [...studentItems, ...systemItems].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [activityLog, systemActivities, activityContext]);

  const filteredTimeline = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allTimeline.filter((item) => {
      if (!dateWithinPeriod(item.created_at, period)) return false;
      const kind = eventKind(item.type, item.metadata);
      if (kindFilter !== "all" && kind !== kindFilter) return false;
      if (jornadaFilter !== "all") {
        const meta = JSON.stringify(item.metadata || {});
        if (!meta.includes(jornadaFilter)) return false;
      }
      if (term) {
        const searchable = `${item.title} ${item.description || ""} ${item.type} ${item.route || ""} ${JSON.stringify(item.metadata || {})}`.toLowerCase();
        if (!searchable.includes(term)) return false;
      }
      return true;
    });
  }, [allTimeline, period, kindFilter, jornadaFilter, search]);

  const displaySessions = useMemo(() => buildDisplaySessions(usageSessions, allTimeline), [usageSessions, allTimeline]);
  const sessions = useMemo(() => displaySessions.filter((session) => dateWithinPeriod(session.last_signal_at || session.last_activity_at || session.started_at, period)), [displaySessions, period]);

  const assignedItems = useMemo(() => jornadas.flatMap((jornada) => jornada.schedule.map((item) => ({ jornada, item, status: assignedStatus(item, jornada.status) }))), [jornadas]);

  const filteredAssignedItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return assignedItems.filter(({ jornada, item, status }) => {
      if (jornadaFilter !== "all" && jornada.jornada_id !== jornadaFilter && jornada.id !== jornadaFilter) return false;
      if (assignedStatusFilter !== "all" && status.label !== assignedStatusFilter) return false;
      if (term) {
        const title = `${jornada.jornadas?.title || ""} ${item.title} ${status.label}`.toLowerCase();
        if (!title.includes(term)) return false;
      }
      return true;
    });
  }, [assignedItems, assignedStatusFilter, jornadaFilter, search]);

  const summary = useMemo(() => {
    const total7 = displaySessions.filter((s) => dateWithinPeriod(s.last_signal_at || s.last_activity_at || s.started_at, "7d")).reduce((acc, s) => acc + Number(s.active_seconds || 0), 0);
    const total30 = displaySessions.filter((s) => dateWithinPeriod(s.last_signal_at || s.last_activity_at || s.started_at, "30d")).reduce((acc, s) => acc + Number(s.active_seconds || 0), 0);
    const activeDays = new Set(displaySessions.filter((s) => dateWithinPeriod(s.last_signal_at || s.last_activity_at || s.started_at, "30d")).map((s) => (s.last_activity_at || s.started_at || "").slice(0, 10)).filter(Boolean)).size;
    const lastAccess = displaySessions[0]?.last_signal_at || displaySessions[0]?.last_activity_at || student.last_login_at || allTimeline[0]?.created_at || null;
    const started = assignedItems.filter(({ item }) => item.attempts_total > 0).length;
    const completed = assignedItems.filter(({ item }) => item.status === "completed" || item.latest_result_finished_at || item.completed_at).length;
    const pending = assignedItems.filter(({ status }) => status.label === "Disponível").length;
    const inProgress = assignedItems.filter(({ status }) => status.label === "Em andamento").length;
    const days = daysSince(lastAccess);
    const engagement = days === null ? "Sem atividade recente" : days <= 3 && completed + started > 0 ? "Ativo" : days <= 10 || pending > 0 || inProgress > 0 ? "Atenção" : "Inativo";
    return {
      total7,
      total30,
      activeDays,
      lastAccess,
      started,
      completed,
      pending,
      inProgress,
      sessions30: displaySessions.filter((s) => dateWithinPeriod(s.last_signal_at || s.last_activity_at || s.started_at, "30d")).length,
      jornadasAccessed: Math.max(0, new Set(jornadas.map((j) => j.jornada_id)).size),
      days,
      engagement,
    };
  }, [displaySessions, student.last_login_at, allTimeline, assignedItems, jornadas]);

  const alerts = useMemo(() => {
    const list: string[] = [];
    if (summary.days !== null && summary.days >= 7) list.push(`Aluno está há ${summary.days} dia(s) sem acessar.`);
    if (summary.pending > 0) list.push(`Há ${summary.pending} simulado(s) liberado(s) e ainda não iniciado(s).`);
    if (summary.inProgress > 0) list.push(`Há ${summary.inProgress} simulado(s) iniciado(s) e ainda não finalizado(s).`);
    if (summary.started === 0 && jornadas.length > 0) list.push("Aluno possui Jornada(s), mas ainda não iniciou simulados.");
    if (assignedItems.length > 0 && summary.completed === assignedItems.length) list.push("Aluno concluiu todos os simulados atribuídos.");
    return list;
  }, [summary, jornadas.length, assignedItems.length]);

  const tabs: Array<{ id: ActivityTab; label: string; icon: ReactNode }> = [
    { id: "resumo", label: "Resumo", icon: <BarChart3 size={15} /> },
    { id: "sessoes", label: "Sessões de uso", icon: <Timer size={15} /> },
    { id: "atividades", label: "Atividades atribuídas", icon: <ListChecks size={15} /> },
    { id: "historico", label: "Histórico detalhado", icon: <Activity size={15} /> },
    { id: "engajamento", label: "Engajamento", icon: <Gauge size={15} /> },
  ];

  return (
    <DarkCard title="Acompanhamento do aluno" description="Sessões, atividades atribuídas, histórico traduzido e sinais de engajamento.">
      <div className="space-y-5">
        <div className="grid gap-2 md:grid-cols-5">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border px-3 text-xs font-black uppercase tracking-[0.08em] transition ${tab === item.id ? "border-orange-300/55 bg-gradient-to-r from-orange-500 to-amber-400 text-[#07111F] shadow-[0_12px_28px_rgba(255,138,0,0.24)]" : "border-white/[0.08] bg-white/[0.035] text-white/45 hover:border-white/[0.14] hover:bg-white/[0.055] hover:text-white/70"}`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <ActivityFilters
          period={period}
          setPeriod={setPeriod}
          kindFilter={kindFilter}
          setKindFilter={setKindFilter}
          jornadaFilter={jornadaFilter}
          setJornadaFilter={setJornadaFilter}
          search={search}
          setSearch={setSearch}
          jornadas={jornadas}
          assignedStatusFilter={assignedStatusFilter}
          setAssignedStatusFilter={setAssignedStatusFilter}
          showKind={tab === "historico" || tab === "sessoes"}
          showJornada={tab === "atividades" || tab === "historico" || tab === "sessoes"}
          showAssignedStatus={tab === "atividades"}
        />

        {tab === "resumo" && (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard icon={<Clock3 size={18} />} label="Último acesso" value={fmtDateTime(summary.lastAccess)} tone="orange" />
              <MetricCard icon={<Timer size={18} />} label="Tempo nos 7 dias" value={fmtSeconds(summary.total7)} tone="blue" />
              <MetricCard icon={<CalendarCheck size={18} />} label="Dias ativos / 30 dias" value={metricValue(summary.activeDays)} tone="emerald" />
              <MetricCard icon={<Gauge size={18} />} label="Engajamento" value={summary.engagement} tone={summary.engagement === "Ativo" ? "emerald" : summary.engagement === "Atenção" ? "orange" : "red"} />
              <MetricCard icon={<Timer size={18} />} label="Tempo nos 30 dias" value={fmtSeconds(summary.total30)} tone="blue" />
              <MetricCard icon={<Eye size={18} />} label="Sessões / 30 dias" value={metricValue(summary.sessions30)} tone="slate" />
              <MetricCard icon={<PlayCircle size={18} />} label="Simulados iniciados" value={metricValue(summary.started)} tone="blue" />
              <MetricCard icon={<Trophy size={18} />} label="Simulados concluídos" value={metricValue(summary.completed)} tone="emerald" />
            </div>
            <AlertList alerts={alerts} />
          </div>
        )}

        {tab === "sessoes" && (
          <SessionList sessions={sessions} />
        )}

        {tab === "atividades" && (
          <AssignedActivities
            jornadas={jornadas}
            items={filteredAssignedItems}
            onAssign={onAssign}
            onOpenSchedule={onOpenSchedule}
          />
        )}

        {tab === "historico" && (
          <TimelineList items={filteredTimeline} />
        )}

        {tab === "engajamento" && (
          <EngagementPanel summary={summary} alerts={alerts} assignedItems={assignedItems} />
        )}
      </div>
    </DarkCard>
  );
}

function ActivityFilters({
  period,
  setPeriod,
  kindFilter,
  setKindFilter,
  jornadaFilter,
  setJornadaFilter,
  search,
  setSearch,
  jornadas,
  assignedStatusFilter,
  setAssignedStatusFilter,
  showKind,
  showJornada,
  showAssignedStatus,
}: {
  period: PeriodFilter;
  setPeriod: (period: PeriodFilter) => void;
  kindFilter: string;
  setKindFilter: (value: string) => void;
  jornadaFilter: string;
  setJornadaFilter: (value: string) => void;
  search: string;
  setSearch: (value: string) => void;
  jornadas: StudentJornada[];
  assignedStatusFilter: string;
  setAssignedStatusFilter: (value: string) => void;
  showKind: boolean;
  showJornada: boolean;
  showAssignedStatus: boolean;
}) {
  return (
    <div className="rounded-[1.25rem] border border-white/[0.07] bg-white/[0.025] p-3">
      <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/35">
        <Filter size={13} /> Filtros
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/32" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar atividade, simulado ou rota"
            className="h-11 w-full rounded-2xl border border-white/[0.08] bg-[#0D1926] pl-9 pr-3 text-xs font-semibold text-white/75 outline-none placeholder:text-white/25 focus:border-orange-400/40 focus:ring-4 focus:ring-orange-500/10"
          />
        </div>
        <ActivityPremiumSelect
          value={period}
          onChange={(value) => setPeriod(value as PeriodFilter)}
          options={[
            { value: "7d", label: "Últimos 7 dias" },
            { value: "30d", label: "Últimos 30 dias" },
            { value: "90d", label: "Últimos 90 dias" },
            { value: "all", label: "Todo o histórico" },
          ]}
        />
        {showKind && (
          <ActivityPremiumSelect
            value={kindFilter}
            onChange={setKindFilter}
            options={[
              { value: "all", label: "Todos os tipos" },
              { value: "acesso", label: "Acessos e navegação" },
              { value: "jornada", label: "Jornadas" },
              { value: "simulado", label: "Simulados" },
              { value: "admin", label: "Administração" },
            ]}
          />
        )}
        {showJornada && (
          <ActivityPremiumSelect
            value={jornadaFilter}
            onChange={setJornadaFilter}
            options={[
              { value: "all", label: "Todas as Jornadas" },
              ...jornadas.map((j) => ({ value: j.jornada_id, label: j.jornadas?.title || "Jornada" })),
            ]}
          />
        )}
        {showAssignedStatus && (
          <ActivityPremiumSelect
            value={assignedStatusFilter}
            onChange={setAssignedStatusFilter}
            options={[
              { value: "all", label: "Todos os status" },
              { value: "Realizado", label: "Realizado" },
              { value: "Disponível", label: "Disponível" },
              { value: "Aguardando Liberação", label: "Aguardando Liberação" },
            ]}
          />
        )}
      </div>
    </div>
  );
}

function ActivityPremiumSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  return (
    <div ref={rootRef} className="relative z-40">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`flex h-11 w-full items-center justify-between rounded-2xl border border-white/[0.08] bg-[#0D1926] px-3 text-left text-xs font-semibold text-white/75 outline-none transition duration-200 hover:border-white/[0.15] focus:border-orange-400/40 focus:ring-2 focus:ring-orange-400/[0.08] ${open ? "border-orange-400/45 text-white" : ""}`}
      >
        <span className="truncate">{selected?.label || "Selecionar"}</span>
        <ChevronDown size={15} className={`shrink-0 text-white/45 transition duration-200 ${open ? "rotate-180 text-orange-300" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-[9999] mt-2 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0D1B2E] p-2 shadow-2xl shadow-black/50 backdrop-blur-xl">
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${active ? "bg-orange-500/15 text-orange-200 ring-1 ring-orange-400/25" : "text-white/68 hover:bg-white/[0.06] hover:text-white"}`}
              >
                <span className="truncate">{option.label}</span>
                {active && <CheckCircle2 size={14} className="text-orange-300" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MetricCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: "orange" | "blue" | "emerald" | "red" | "slate" }) {
  const tones = {
    orange: "border-orange-400/20 bg-orange-500/[0.08] text-orange-300",
    blue: "border-blue-400/20 bg-blue-500/[0.08] text-blue-300",
    emerald: "border-emerald-400/20 bg-emerald-500/[0.08] text-emerald-300",
    red: "border-red-400/20 bg-red-500/[0.08] text-red-300",
    slate: "border-white/[0.08] bg-white/[0.035] text-white/65",
  };
  return (
    <div className="rounded-[1.25rem] border border-white/[0.075] bg-white/[0.035] p-4 shadow-lg shadow-black/10">
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-2xl border ${tones[tone]}`}>{icon}</div>
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/32">{label}</p>
      <p className="mt-1 text-lg font-black text-white">{value}</p>
    </div>
  );
}

function AlertList({ alerts }: { alerts: string[] }) {
  if (alerts.length === 0) {
    return (
      <div className="rounded-[1.25rem] border border-emerald-500/18 bg-emerald-500/[0.07] px-4 py-3 text-sm font-semibold text-emerald-200/80">
        Nenhum alerta relevante para este aluno no momento.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {alerts.map((alert, index) => (
        <div key={`${alert}-${index}`} className="flex gap-3 rounded-[1.25rem] border border-amber-500/20 bg-amber-500/[0.075] px-4 py-3 text-sm text-amber-100/78">
          <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-300" />
          <span>{alert}</span>
        </div>
      ))}
    </div>
  );
}

function SessionList({ sessions }: { sessions: DisplayUsageSession[] }) {
  if (sessions.length === 0) return <EmptyState icon={<Timer size={22} />} text="Nenhuma sessão encontrada para os filtros selecionados." />;
  return (
    <div className="space-y-3">
      <div className="rounded-[1.25rem] border border-blue-400/14 bg-blue-500/[0.055] px-4 py-3 text-xs leading-relaxed text-blue-100/68">
        As sessões são estimadas a partir das atividades registradas. Quando a janela fica aberta por muito tempo sem ação real, o período deixa de contar como tempo ativo e aparece como encerrado por inatividade.
      </div>
      {sessions.map((session) => {
        const showLastSignal = Boolean(session.last_signal_at && session.last_signal_at !== session.last_activity_at);
        return (
          <div key={session.id} className="rounded-[1.45rem] border border-white/[0.075] bg-white/[0.035] p-4 shadow-lg shadow-black/10">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black text-white">Sessão em {fmtDate(session.started_at)}</p>
                <p className="mt-1 text-xs text-white/40">Entrada: {fmtDateTime(session.started_at)} · Última atividade real: {fmtDateTime(session.last_activity_at)}</p>
                {showLastSignal && (
                  <p className="mt-1 text-xs text-amber-200/55">Último sinal técnico: {fmtDateTime(session.last_signal_at)} · a janela pode ter permanecido aberta sem uso real.</p>
                )}
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-bold ${session.status_class}`}>
                {session.status_label}
              </span>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-3">
              <SysMini label="Tempo ativo estimado" value={fmtSeconds(Number(session.active_seconds || 0))} />
              <SysMini label="Dispositivo detectado" value={formatUserAgent(session.rawSession.user_agent)} />
              <SysMini label="Última página registrada" value={shortRoute(session.rawSession.last_route)} />
            </div>
            <div className="mt-4 rounded-2xl border border-white/[0.06] bg-black/10 p-3">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/32">Atividades da sessão</p>
              {session.items.length === 0 ? (
                <p className="text-xs text-white/35">Sem ações detalhadas nesta sessão. Pode ter sido apenas abertura de janela, login ou sinal técnico.</p>
              ) : (
                <div className="space-y-2">
                  {session.items.slice(0, 8).map((item) => {
                    const kind = eventKind(item.type, item.metadata);
                    return (
                      <div key={item.id} className="flex items-start gap-2 text-xs text-white/62">
                        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${timelineClass(kind)}`}>{timelineIcon(kind)}</span>
                        <span>
                          <span className="block font-semibold text-white/70">{item.title}</span>
                          {item.description && <span className="mt-0.5 block text-[11px] text-white/34">{item.description}</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AssignedActivities({
  jornadas,
  items,
  onAssign,
  onOpenSchedule,
}: {
  jornadas: StudentJornada[];
  items: Array<{ jornada: StudentJornada; item: StudentJornadaScheduleItem; status: { label: string; cls: string } }>;
  onAssign: () => void;
  onOpenSchedule: (jornada: StudentJornada) => void;
}) {
  if (jornadas.length === 0) {
    return (
      <div className="flex min-h-44 flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-white/[0.08] bg-white/[0.025] text-center">
        <Layers size={26} className="mb-3 text-white/30" />
        <p className="text-sm font-semibold text-white/55">Nenhuma atividade atribuída.</p>
        <PremiumButton className="mt-4" icon={<PlusCircle size={14} />} onClick={onAssign}>Gerenciar Jornadas</PremiumButton>
      </div>
    );
  }
  const grouped = jornadas.map((jornada) => ({ jornada, items: items.filter(({ jornada: j }) => j.id === jornada.id) }));
  return (
    <div className="space-y-4">
      {grouped.map(({ jornada, items: jornadaItems }) => {
        const title = jornada.jornadas?.title || "Jornada";
        const completed = jornada.schedule.filter((item) => item.status === "completed" || item.latest_result_finished_at || item.completed_at).length;
        const released = jornada.schedule.filter((item) => ["available", "in_progress", "completed"].includes(item.status)).length;
        const pending = jornada.schedule.filter((item) => assignedStatus(item, jornada.status).label.includes("pendente")).length;
        const waiting = jornada.schedule.filter((item) => assignedStatus(item, jornada.status).label === "Aguardando Liberação").length;
        const blocked = jornada.schedule.filter((item) => assignedStatus(item, jornada.status).label === "Bloqueado").length;
        const pct = jornada.schedule.length ? Math.round((completed / jornada.schedule.length) * 100) : 0;
        const jCfg = JORNADA_STATUS_CFG[jornada.status] ?? JORNADA_STATUS_CFG.cancelled;
        return (
          <div key={jornada.id} className="rounded-[1.55rem] border border-white/[0.08] bg-gradient-to-br from-white/[0.045] to-blue-500/[0.025] p-4 shadow-lg shadow-black/10">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-black text-white">{title}</p>
                <p className="mt-1 text-xs text-white/40">Entrada: {fmtDate(jornada.started_at)} · Expira: {fmtDate(jornada.expires_at)} · {completed}/{jornada.schedule.length} concluídos</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-3 py-1 text-xs font-bold ${jCfg.cls}`}>{jCfg.label}</span>
                <PremiumButton variant="secondary" icon={<ListChecks size={13} />} className="!py-1.5 !px-3 !text-xs" onClick={() => onOpenSchedule(jornada)}>Cronograma</PremiumButton>
                <Link href={`/admin/jornadas/${jornada.jornada_id}`}><PremiumButton variant="secondary" icon={<MapPin size={13} />} className="!py-1.5 !px-3 !text-xs">Ver Jornada</PremiumButton></Link>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-5">
              <SysMini label="Liberados" value={String(released)} />
              <SysMini label="Pendentes" value={String(pending)} />
              <SysMini label="Aguardando" value={String(waiting)} />
              <SysMini label="Bloqueados" value={String(blocked)} />
              <SysMini label="Progresso" value={`${pct}%`} />
            </div>
            <div className="mt-4 space-y-2">
              {jornadaItems.length === 0 ? <p className="text-xs text-white/35">Nenhum simulado encontrado com os filtros selecionados.</p> : jornadaItems.map(({ item, status }) => (
                <div key={item.id} className="grid gap-3 rounded-[1.1rem] border border-white/[0.065] bg-black/10 p-3 md:grid-cols-[minmax(0,1fr)_180px_190px]">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white/86">{String(item.order_number).padStart(2, "0")} · {item.title}</p>
                    <p className="mt-1 text-xs text-white/38">Prevista: {fmtDate(item.scheduled_release_at)} · Liberada: {fmtDateTime(item.released_at)}</p>
                    {(item.latest_attempt_started_at || item.latest_result_finished_at) && <p className="mt-1 text-xs text-white/38">Início: {fmtDateTime(item.latest_attempt_started_at)} · Conclusão: {fmtDateTime(item.latest_result_finished_at || item.completed_at)}</p>}
                  </div>
                  <div><span className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-bold ${status.cls}`}>{status.label}</span></div>
                  <div className="text-xs text-white/45">
                    {item.latest_result_percentage !== null ? <p>Nota: <strong className="text-emerald-300">{Math.round(item.latest_result_percentage)}%</strong></p> : <p>Nota: —</p>}
                    <p>Tempo: {fmtSeconds(Number(item.latest_result_time_spent_seconds || 0))}</p>
                    {item.latest_attempt_answered_count !== null && <p>Respostas: {item.latest_attempt_answered_count}/{item.latest_attempt_total_questions ?? "—"}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TimelineList({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) return <EmptyState icon={<Activity size={22} />} text="Nenhum evento encontrado para os filtros selecionados." />;
  return (
    <div className="relative space-y-0">
      <div className="absolute left-[19px] bottom-0 top-0 w-px bg-white/[0.07]" />
      {items.map((item, i) => {
        const kind = eventKind(item.type, item.metadata);
        return (
          <div key={item.id} className={`relative flex gap-4 ${i < items.length - 1 ? "pb-5" : ""}`}>
            <div className={`relative z-10 mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${timelineClass(kind)}`}>{timelineIcon(kind)}</div>
            <div className="min-w-0 flex-1 pt-1">
              <p className="text-sm font-bold leading-snug text-white/84">{item.title}</p>
              {item.description && <p className="mt-0.5 text-xs text-white/38">{item.description}</p>}
              <p className="mt-1 text-[11px] text-white/30">{fmtDateTime(item.created_at)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EngagementPanel({ summary, alerts, assignedItems }: { summary: any; alerts: string[]; assignedItems: Array<{ item: StudentJornadaScheduleItem; status: { label: string; cls: string } }> }) {
  const scores = assignedItems.map(({ item }) => item.latest_result_percentage).filter((value): value is number => value !== null && Number.isFinite(value));
  const average = scores.length ? Math.round(scores.reduce((acc, value) => acc + value, 0) / scores.length) : null;
  const best = scores.length ? Math.round(Math.max(...scores)) : null;
  const pending = assignedItems.filter(({ status }) => status.label === "Disponível").length;
  const inProgress = assignedItems.filter(({ status }) => status.label === "Em andamento").length;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<Clock3 size={18} />} label="Dias sem acessar" value={summary.days === null ? "—" : String(summary.days)} tone={summary.days !== null && summary.days >= 7 ? "red" : "emerald"} />
        <MetricCard icon={<TrendingUp size={18} />} label="Média geral" value={average === null ? "—" : `${average}%`} tone="blue" />
        <MetricCard icon={<Trophy size={18} />} label="Melhor desempenho" value={best === null ? "—" : `${best}%`} tone="emerald" />
        <MetricCard icon={<AlertTriangle size={18} />} label="Pendências" value={String(pending + inProgress)} tone={pending + inProgress > 0 ? "orange" : "slate"} />
      </div>
      <AlertList alerts={alerts} />
    </div>
  );
}

function SysMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/28">{label}</p>
      <p className="mt-1 truncate text-xs font-bold text-white/68">{value || "—"}</p>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-white/[0.08] bg-white/[0.025] text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.05] text-white/30">{icon}</div>
      <p className="text-sm font-medium text-white/50">{text}</p>
    </div>
  );
}

// ── Dark form helpers ─────────────────────────────────────────────────────────

function DarkField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-white/40">
        {label}
      </label>
      {children}
    </div>
  );
}

function DarkInput({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="h-12 w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 text-sm font-medium text-white/80 outline-none transition duration-200 placeholder:text-white/25 hover:border-white/[0.14] focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
    />
  );
}

function DarkTextarea({
  value,
  onChange,
  placeholder,
  maxLength,
  rows = 4,
}: {
  value: string;
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
}) {
  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={rows}
        className="w-full resize-none rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 pb-7 pt-3 text-sm font-medium text-white/80 outline-none transition duration-200 placeholder:text-white/25 hover:border-white/[0.14] focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
      />
      {maxLength !== undefined && (
        <span className="pointer-events-none absolute bottom-3 right-4 text-xs text-white/25">
          {value.length}/{maxLength}
        </span>
      )}
    </div>
  );
}

function DarkSelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        className="h-12 w-full appearance-none rounded-2xl border border-white/[0.08] bg-[#132238] pl-4 pr-10 text-sm font-medium text-white outline-none transition duration-200 hover:border-white/[0.14] focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10 [color-scheme:dark] [&>option]:bg-[#0D1B2E] [&>option]:text-white"
      >
        {children}
      </select>
      <ChevronDown
        size={16}
        className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/45"
      />
    </div>
  );
}

function PremiumStatusSelect({
  value,
  onChange,
}: {
  value: StudentDetail["status"];
  onChange: (value: StudentDetail["status"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const options: Array<{ value: StudentDetail["status"]; label: string; description: string }> = [
    { value: "pending", label: "Em análise", description: "Aguardando aprovação" },
    { value: "active", label: "Ativo", description: "Acesso liberado" },
    { value: "blocked", label: "Bloqueado", description: "Acesso suspenso" },
    { value: "inactive", label: "Inativo", description: "Sem conteúdo ativo" },
  ];
  const selected = options.find((option) => option.value === value) ?? options[1];

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  return (
    <div ref={rootRef} className="relative z-30">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex h-12 w-full items-center justify-between rounded-[14px] border bg-[linear-gradient(180deg,rgba(25,45,72,0.96),rgba(15,31,52,0.96))] px-4 text-left text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_8px_20px_rgba(0,0,0,0.16)] outline-none transition duration-200 hover:border-white/20 focus:ring-4 focus:ring-orange-500/10 ${open ? "border-orange-400/55 shadow-[0_0_0_1px_rgba(255,122,0,0.18),0_0_22px_rgba(255,122,0,0.12)]" : "border-white/[0.10]"}`}
      >
        <span>{selected.label}</span>
        <ChevronDown size={16} className={`text-white/45 transition duration-200 ${open ? "rotate-180 text-orange-300" : ""}`} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+8px)] z-[999] overflow-hidden rounded-[16px] border border-white/[0.10] bg-[#0B1929]/[0.99] p-1.5 shadow-[0_22px_60px_rgba(0,0,0,0.52),0_0_30px_rgba(43,134,235,0.10)] backdrop-blur-xl"
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-[12px] px-3.5 py-3 text-left transition ${active ? "bg-[linear-gradient(90deg,rgba(255,109,0,0.20),rgba(255,168,0,0.10))] text-orange-200 ring-1 ring-orange-400/25" : "text-white/78 hover:bg-white/[0.06] hover:text-white"}`}
              >
                <span>
                  <span className="block text-sm font-semibold">{option.label}</span>
                  <span className="mt-0.5 block text-[11px] font-medium text-white/35">{option.description}</span>
                </span>
                {active && <CheckCircle2 size={16} className="text-orange-300" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Data row (view mode) ──────────────────────────────────────────────────────

function DataRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="group min-h-[60px] rounded-[14px] border border-white/[0.075] bg-white/[0.035] px-[14px] py-3 shadow-inner shadow-white/[0.015] transition duration-300 hover:border-blue-400/[0.18] hover:bg-white/[0.045]">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/32">
        {icon}
        {label}
      </div>
      <p className="text-sm font-semibold text-white/82">{value || "—"}</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type Feedback = { type: "success" | "error"; message: string } | null;

export default function AlunoAdminDetalheClient({
  student,
  activityLog,
  usageSessions,
  systemActivities,
  jornadas,
  availableJornadas,
  emailHistory,
}: {
  student: StudentDetail;
  activityLog: ActivityLog[];
  usageSessions: StudentUsageSession[];
  systemActivities: StudentSystemActivity[];
  jornadas: StudentJornada[];
  availableJornadas: AvailableJornada[];
  emailHistory: StudentEmailHistoryItem[];
}) {
  const router = useRouter();

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(student.name);
  const [editEmail, setEditEmail] = useState(student.email);
  const [editPhone, setEditPhone] = useState(student.phone ?? "");
  const [editCpf, setEditCpf] = useState(student.cpf ?? "");
  const [editNotes, setEditNotes] = useState(student.notes ?? "");
  const [editDesiredContests, setEditDesiredContests] = useState(student.desired_contests ?? "");
  const [savingFields, setSavingFields] = useState(false);

  // Status state
  const [selectedStatus, setSelectedStatus] = useState<StudentDetail["status"]>(student.status);
  const [savingStatus, setSavingStatus] = useState(false);

  const [feedback, setFeedback] = useState<Feedback>(null);

  const [assignModal, setAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState({
    jornada_id: "",
    started_at: new Date().toISOString().slice(0, 10),
  });
  const [assigning, setAssigning] = useState(false);
  const [cancelJornadaTarget, setCancelJornadaTarget] = useState<StudentJornada | null>(null);
  const [cancellingJornada, setCancellingJornada] = useState(false);

  const [scheduleModalJornada, setScheduleModalJornada] = useState<StudentJornada | null>(null);
  const [scheduleProcessingId, setScheduleProcessingId] = useState<string | null>(null);
  const [attemptDrafts, setAttemptDrafts] = useState<Record<string, string>>({});
  const [resetAttemptsTarget, setResetAttemptsTarget] = useState<{ jornada: StudentJornada; item: StudentJornadaScheduleItem } | null>(null);

  const [resendEmailModal, setResendEmailModal] = useState(false);
  const [resendEmailTab, setResendEmailTab] = useState<"emails" | "history">("emails");
  const [selectedResendOption, setSelectedResendOption] = useState("");
  const [sendingResendEmail, setSendingResendEmail] = useState(false);
  const [localJornadas, setLocalJornadas] = useState<StudentJornada[]>(jornadas);
  const [deactivateModal, setDeactivateModal] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [resetPasswordModal, setResetPasswordModal] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteDependencies, setDeleteDependencies] = useState<Array<{ type: string; count: number }> | null>(null);
  const [approveModal, setApproveModal] = useState(false);
  const [approving, setApproving] = useState(false);
  const [reactivateModal, setReactivateModal] = useState(false);
  const [reactivating, setReactivating] = useState(false);

  useEffect(() => {
    setLocalJornadas(jornadas);
    setScheduleModalJornada((current) => {
      if (!current) return current;
      return jornadas.find((sj) => sj.id === current.id) ?? current;
    });
  }, [jornadas]);

  const releasedSimuladoEmailOptions = localJornadas.flatMap((sj) =>
    sj.schedule
      .filter((item) => ["available", "in_progress", "completed"].includes(String(item.status)))
      .map((item) => ({ jornada: sj, item })),
  );

  const activeEnrollmentJornadaIds = new Set(localJornadas.filter((sj) => sj.status !== "cancelled").map((sj) => sj.jornada_id));
  const cancelledEnrollmentJornadaIds = new Set(localJornadas.filter((sj) => sj.status === "cancelled").map((sj) => sj.jornada_id));
  const assignableJornadas = availableJornadas.filter((j) => !activeEnrollmentJornadaIds.has(j.id));

  function cancelEdit() {
    setEditName(student.name);
    setEditEmail(student.email);
    setEditPhone(student.phone ?? "");
    setEditCpf(student.cpf ?? "");
    setEditNotes(student.notes ?? "");
    setEditDesiredContests(student.desired_contests ?? "");
    setEditing(false);
    setFeedback(null);
  }

  async function handleSaveFields() {
    if (!editName.trim()) {
      setFeedback({ type: "error", message: "Nome não pode ser vazio." });
      return;
    }
    const normalizedEmail = editEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      setFeedback({ type: "error", message: "E-mail não pode ser vazio." });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setFeedback({ type: "error", message: "Informe um e-mail válido." });
      return;
    }
    setSavingFields(true);
    setFeedback(null);
    const res = await adminFetch(`/api/admin/students/${student.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName.trim(),
        email: normalizedEmail,
        phone: editPhone.trim() || null,
        cpf: editCpf.trim() || null,
        notes: editNotes.trim() || null,
        desired_contests: editDesiredContests.trim() || null,
      }),
    });
    const data = (await res.json()) as { ok: boolean; message: string };
    setSavingFields(false);
    if (!data.ok) {
      setFeedback({ type: "error", message: data.message });
      return;
    }
    setEditing(false);
    setFeedback({ type: "success", message: data.message });
    router.refresh();
  }

  async function performStatusChange(status: StudentDetail["status"]): Promise<boolean> {
    const res = await adminFetch(`/api/admin/students/${student.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = (await res.json()) as { ok: boolean; message: string };
    setFeedback(data.ok
      ? { type: "success", message: data.message }
      : { type: "error", message: data.message }
    );
    if (data.ok) router.refresh();
    return data.ok;
  }

  async function handleSaveStatus() {
    if (selectedStatus === student.status) return;
    if (selectedStatus === "inactive") {
      setDeactivateModal(true);
      return;
    }
    // Aprovação inicial nunca acontece pelo controle genérico: intercepta e
    // abre o modal de aprovação (que usa a API específica /approve).
    if (selectedStatus === "active" && student.status === "pending" && !student.approved_at) {
      setApproveModal(true);
      return;
    }
    // Reativação explícita (sem e-mail de boas-vindas).
    if (selectedStatus === "active" && student.status === "inactive") {
      setReactivateModal(true);
      return;
    }
    setSavingStatus(true);
    setFeedback(null);
    await performStatusChange(selectedStatus);
    setSavingStatus(false);
  }

  async function handleConfirmApprove() {
    if (approving) return;
    setApproving(true);
    setFeedback(null);
    try {
      const res = await adminFetch(`/api/admin/students/${student.id}/approve`, { method: "POST" });
      const data = (await res.json()) as { ok: boolean; message: string; code?: string; email_sent?: boolean };
      if (!data.ok && data.code !== "STUDENT_ALREADY_APPROVED") {
        setFeedback({ type: "error", message: data.message || "Não foi possível aprovar o cadastro." });
        return;
      }
      setFeedback(
        data.code === "STUDENT_ALREADY_APPROVED"
          ? { type: "success", message: data.message }
          : data.email_sent
            ? { type: "success", message: data.message }
            : { type: "error", message: data.message }
      );
      setSelectedStatus("active");
      setApproveModal(false);
      router.refresh();
    } catch {
      setFeedback({ type: "error", message: "Erro inesperado ao aprovar o cadastro." });
    } finally {
      setApproving(false);
    }
  }

  async function handleConfirmReactivate() {
    if (reactivating) return;
    setReactivating(true);
    setFeedback(null);
    const ok = await performStatusChange("active");
    setReactivating(false);
    if (ok) {
      setSelectedStatus("active");
      setReactivateModal(false);
    }
  }

  async function handleConfirmDeactivate() {
    setDeactivating(true);
    setFeedback(null);
    const ok = await performStatusChange("inactive");
    setDeactivating(false);
    if (ok) {
      setSelectedStatus("inactive");
      setDeactivateModal(false);
      setDeleteModal(false);
      setDeleteConfirmText("");
      setDeleteError(null);
      setDeleteDependencies(null);
    }
  }

  async function handleResetPassword() {
    if (resettingPassword) return;
    setResettingPassword(true);
    setFeedback(null);
    try {
      const res = await adminFetch(`/api/admin/students/${student.id}/reset-password`, { method: "POST" });
      const data = (await res.json()) as { ok: boolean; message: string; emailSent?: boolean };
      setFeedback({
        type: data.ok && data.emailSent !== false ? "success" : "error",
        message: data.message || "Não foi possível redefinir a senha do aluno.",
      });
      if (data.ok) setResetPasswordModal(false);
    } catch {
      setFeedback({ type: "error", message: "Erro inesperado ao redefinir a senha do aluno." });
    } finally {
      setResettingPassword(false);
    }
  }

  async function handleDeleteStudent() {
    if (deleteConfirmText.trim() !== "EXCLUIR" || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    setDeleteDependencies(null);
    try {
      const res = await adminFetch(`/api/admin/students/${student.id}`, { method: "DELETE" });
      const data = (await res.json()) as {
        ok: boolean;
        message: string;
        code?: string;
        dependencies?: Array<{ type: string; count: number }>;
      };
      if (!data.ok) {
        if (data.code === "STUDENT_HAS_HISTORY") {
          setDeleteDependencies(data.dependencies || []);
        } else {
          setDeleteError(data.message || "Não foi possível excluir o aluno.");
        }
        return;
      }
      setDeleteModal(false);
      router.push("/admin/alunos");
      router.refresh();
    } catch {
      setDeleteError("Erro inesperado ao excluir o aluno. Tente novamente.");
    } finally {
      setDeleting(false);
    }
  }


  async function handleSendResendEmail() {
    if (!selectedResendOption) {
      setFeedback({ type: "error", message: "Selecione um e-mail para reenviar." });
      return;
    }
    setSendingResendEmail(true);
    setFeedback(null);
    try {
      if (selectedResendOption === "welcome") {
        const res = await adminFetch("/api/admin/students/resend-welcome", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentId: student.id }),
        });
        const data = (await res.json()) as { ok: boolean; message: string };
        if (!data.ok) throw new Error(data.message || "Erro ao reenviar e-mail de boas-vindas.");
        setFeedback({ type: "success", message: data.message || "E-mail de boas-vindas reenviado com sucesso." });
      } else if (selectedResendOption.startsWith("jornada:")) {
        const jornadaId = selectedResendOption.replace("jornada:", "");
        const res = await adminFetch(`/api/admin/students/${student.id}/resend-jornada-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jornada_id: jornadaId }),
        });
        const data = (await res.json()) as { ok: boolean; message: string };
        if (!data.ok) throw new Error(data.message || "Erro ao reenviar e-mail da Jornada.");
        setFeedback({ type: "success", message: data.message || "E-mail da Jornada reenviado com sucesso." });
      } else if (selectedResendOption.startsWith("simulado:")) {
        const [, studentJornadaId, studentJornadaSimuladoId] = selectedResendOption.split(":");
        const res = await adminFetch(`/api/admin/students/${student.id}/resend-simulado-release-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ student_jornada_id: studentJornadaId, student_jornada_simulado_id: studentJornadaSimuladoId }),
        });
        const data = (await res.json()) as { ok: boolean; message: string };
        if (!data.ok) throw new Error(data.message || "Erro ao reenviar e-mail de simulado liberado.");
        setFeedback({ type: "success", message: data.message || "E-mail de simulado liberado reenviado com sucesso." });
      }
      router.refresh();
      setResendEmailModal(false);
      setSelectedResendOption("");
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Erro inesperado ao reenviar e-mail.",
      });
    } finally {
      setSendingResendEmail(false);
    }
  }

  async function handleScheduleAction(
    jornada: StudentJornada,
    item: StudentJornadaScheduleItem,
    action: "release_now" | "unrelease",
  ) {
    setScheduleProcessingId(`${action}:${item.id}`);
    setFeedback(null);
    try {
      const res = await adminFetch(`/api/admin/student-jornadas/${jornada.id}/simulados/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (!data.ok) throw new Error(data.message || "Não foi possível atualizar o cronograma.");
      setFeedback({ type: "success", message: data.message || "Cronograma atualizado." });
      const releaseTimestamp = new Date().toISOString();
      setLocalJornadas((current) => current.map((sj) => {
        if (sj.id !== jornada.id) return sj;
        const updatedJornada = {
          ...sj,
          schedule: sj.schedule.map((scheduleItem) => {
            if (scheduleItem.id !== item.id) return scheduleItem;
            if (action === "release_now") {
              const scheduledDate = scheduleItem.scheduled_release_at ? new Date(`${scheduleItem.scheduled_release_at}T00:00:00`) : null;
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const manuallyReleased = Boolean(scheduledDate && scheduledDate.getTime() > today.getTime());
              return {
                ...scheduleItem,
                status: "available",
                released_at: releaseTimestamp,
                manually_released: manuallyReleased,
                can_unrelease: manuallyReleased,
              };
            }
            return {
              ...scheduleItem,
              status: "locked",
              released_at: null,
              manually_released: false,
              can_unrelease: false,
            };
          }),
        };
        updatedJornada.progress = {
          completed: updatedJornada.schedule.filter((s) => s.status === "completed").length,
          total: updatedJornada.schedule.length,
        };
        setScheduleModalJornada(updatedJornada);
        return updatedJornada;
      }));
      router.refresh();
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro inesperado ao atualizar cronograma." });
    } finally {
      setScheduleProcessingId(null);
    }
  }

  async function performSetAttempts(jornada: StudentJornada, item: StudentJornadaScheduleItem, attempts: number) {
    setScheduleProcessingId(`attempts:${item.id}`);
    setFeedback(null);
    try {
      const res = await adminFetch(`/api/admin/student-jornadas/${jornada.id}/simulados/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_attempts", attempts }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        message?: string;
        schedule_item?: Pick<StudentJornadaScheduleItem, "id" | "status" | "released_at" | "completed_at" | "attempts_total" | "attempts_counting">;
      };
      if (!data.ok) throw new Error(data.message || "Não foi possível ajustar as tentativas.");

      if (attempts === 0 && data.schedule_item) {
        setLocalJornadas((current) => current.map((currentJornada) => {
          if (currentJornada.id !== jornada.id) return currentJornada;
          const updatedJornada = {
            ...currentJornada,
            schedule: currentJornada.schedule.map((scheduleItem) => scheduleItem.id === item.id
              ? {
                  ...scheduleItem,
                  ...data.schedule_item,
                  attempts_in_progress: 0,
                  latest_attempt_id: null,
                  latest_attempt_status: null,
                  latest_attempt_started_at: null,
                  latest_attempt_submitted_at: null,
                  latest_attempt_last_activity_at: null,
                  latest_attempt_answered_count: null,
                  latest_attempt_total_questions: null,
                  latest_attempt_progress_percent: null,
                  latest_result_percentage: null,
                  latest_result_score: null,
                  latest_result_finished_at: null,
                  latest_result_time_spent_seconds: null,
                }
              : scheduleItem),
          };
          updatedJornada.progress = {
            completed: updatedJornada.schedule.filter((scheduleItem) => scheduleItem.status === "completed").length,
            total: updatedJornada.schedule.length,
          };
          setScheduleModalJornada(updatedJornada);
          return updatedJornada;
        }));
        setAttemptDrafts((current) => ({ ...current, [item.id]: "0" }));
      }

      setFeedback({ type: "success", message: data.message || "Tentativas ajustadas." });
      router.refresh();
      return true;
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro inesperado ao ajustar tentativas." });
      return false;
    } finally {
      setScheduleProcessingId(null);
    }
  }

  async function handleSetAttempts(jornada: StudentJornada, item: StudentJornadaScheduleItem) {
    const raw = attemptDrafts[item.id] ?? String(item.attempts_counting);
    const attempts = Number(raw);
    if (!Number.isInteger(attempts) || attempts < 0) {
      setFeedback({ type: "error", message: "Informe um número inteiro de tentativas." });
      return;
    }

    if (attempts === 0) {
      setResetAttemptsTarget({ jornada, item });
      return;
    }

    await performSetAttempts(jornada, item, attempts);
  }

  async function handleAssignJornada() {
    if (!assignForm.jornada_id) {
      setFeedback({ type: "error", message: "Selecione uma Jornada publicada para inserir o aluno." });
      return;
    }
    setAssigning(true);
    setFeedback(null);
    try {
      const res = await adminFetch(`/api/admin/jornadas/${assignForm.jornada_id}/students`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_id: student.id, started_at: assignForm.started_at }),
      });
      const data = (await res.json()) as { ok: boolean; message: string };
      if (!data.ok) throw new Error(data.message || "Erro ao inserir aluno na Jornada.");
      setAssignForm({ jornada_id: "", started_at: new Date().toISOString().slice(0, 10) });
      setFeedback({ type: "success", message: data.message || "Aluno inserido na Jornada com sucesso." });
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Erro inesperado ao inserir aluno na Jornada.",
      });
    } finally {
      setAssigning(false);
    }
  }

  async function handleCancelJornadaEnrollment() {
    if (!cancelJornadaTarget) return;
    setCancellingJornada(true);
    setFeedback(null);
    try {
      const res = await adminFetch(`/api/admin/jornadas/${cancelJornadaTarget.jornada_id}/students/${student.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const data = (await res.json()) as { ok: boolean; message: string };
      if (!data.ok) throw new Error(data.message || "Erro ao remover aluno da Jornada.");
      setLocalJornadas((current) => current.map((sj) => sj.id === cancelJornadaTarget.id ? { ...sj, status: "cancelled" } : sj));
      setFeedback({ type: "success", message: data.message || "Aluno removido da Jornada com sucesso." });
      setCancelJornadaTarget(null);
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Erro inesperado ao remover aluno da Jornada.",
      });
    } finally {
      setCancellingJornada(false);
    }
  }

  const statusChanged = selectedStatus !== student.status;
  const statusCfg = STUDENT_STATUS_CFG[student.status] ?? STUDENT_STATUS_CFG.inactive;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_18%_8%,rgba(20,94,170,0.15),transparent_28%),radial-gradient(circle_at_88%_18%,rgba(255,112,0,0.10),transparent_26%),linear-gradient(180deg,#07111F_0%,#050B14_100%)]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 top-10 h-[34rem] w-[34rem] rounded-full bg-blue-500/[0.11] blur-[120px]" />
        <div className="absolute right-[-10rem] top-[-8rem] h-[32rem] w-[32rem] rounded-full bg-orange-500/[0.13] blur-[130px]" />
        <div className="absolute inset-0 opacity-[0.10] [background-image:linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] [background-size:32px_32px]" />
      </div>
      <PremiumLoadingOverlay show={savingFields || savingStatus || sendingResendEmail} title={sendingResendEmail ? "Reenviando e-mail..." : "Salvando..."} message="" />

      {/* Page header */}
      <div className="relative z-10 mx-auto w-full max-w-[95rem] px-5 pb-4 pt-5 md:px-7 xl:px-8">
        <div className="relative px-0 py-1">
          <div className="relative flex flex-wrap items-center justify-between gap-8">
            <div className="flex min-w-0 items-center gap-4">
              <div className="relative flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full border border-orange-400/65 bg-[radial-gradient(circle_at_35%_30%,#2B3440,#111827_65%)] text-xl font-black text-orange-300 shadow-[0_0_0_4px_rgba(255,138,0,0.05),0_0_24px_rgba(255,138,0,0.24)]">
                {student.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0B1524] bg-[#00D99A] shadow-[0_0_12px_rgba(0,217,154,0.8)]" />
              </div>
              <div className="min-w-0">
                <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-orange-400">EstudoTOP <span className="px-1.5 text-white/25">›</span> Alunos <span className="px-1.5 text-white/25">›</span> Detalhes do aluno</p>
                <h1 className="truncate text-[25px] font-bold leading-[1.15] tracking-[-0.02em] text-white">{student.name}</h1>
                <p className="mt-1 truncate text-[13px] font-medium text-slate-400">{student.email}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/admin/alunos">
                <PremiumButton className="!h-[46px] !rounded-[14px] !border-white/[0.12] !bg-white/[0.035] !px-5 !text-[13px] !font-bold !text-slate-100 hover:!border-white/[0.20] hover:!bg-white/[0.07]" variant="secondary" icon={<ArrowLeft size={16} />}>Voltar</PremiumButton>
              </Link>
              <PremiumButton
                className="!h-[46px] !rounded-[14px] !border-blue-300/30 !bg-[linear-gradient(180deg,rgba(18,35,57,0.96),rgba(10,24,42,0.96))] !px-[22px] !text-[13px] !font-bold !text-slate-100 !shadow-[0_10px_26px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)] hover:!border-blue-200/45"
                variant="secondary"
                icon={<MapPin size={16} />}
                onClick={() => { setAssignModal(true); setFeedback(null); }}
              >
                Gerenciar Jornadas
              </PremiumButton>
              <PremiumButton
                className="!h-[46px] !rounded-[14px] !border-blue-300/30 !bg-[linear-gradient(180deg,rgba(18,35,57,0.96),rgba(10,24,42,0.96))] !px-[22px] !text-[13px] !font-bold !text-slate-100 !shadow-[0_10px_26px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)] hover:!border-blue-200/45"
                variant="secondary"
                icon={<Mail size={16} />}
                onClick={() => { setResendEmailModal(true); setResendEmailTab("emails"); setFeedback(null); }}
              >
                Reenvio de E-mails
              </PremiumButton>
              {!editing && (
                <PremiumButton className="!h-[46px] !rounded-[14px] !border-amber-300/70 !bg-[linear-gradient(135deg,#FF6500_0%,#FF9E00_55%,#FFC000_100%)] !px-6 !text-[13px] !font-bold !text-[#07111F] !shadow-[0_0_0_1px_rgba(255,152,0,0.22),0_8px_24px_rgba(255,105,0,0.40),0_0_34px_rgba(255,138,0,0.30),inset_0_1px_0_rgba(255,255,255,0.45)] hover:!-translate-y-0.5 hover:!brightness-105" icon={<Edit3 size={16} />} onClick={() => { setEditing(true); setFeedback(null); }}>
                  Editar dados
                </PremiumButton>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[95rem] px-5 pb-12 md:px-7 xl:px-8">
        {/* Feedback banner */}
        {feedback && (
          <div className={`mb-5 min-h-[42px] rounded-[14px] border px-[18px] py-3 text-sm font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] ${
            feedback.type === "success"
              ? "border-[#00D99A]/30 bg-[#00D99A]/[0.08] text-[#63F5C2] shadow-[0_0_28px_rgba(0,217,154,0.06)]"
              : "border-red-500/20 bg-red-500/[0.07] text-red-400"
          }`}>
            {feedback.message}
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_430px] 2xl:grid-cols-[minmax(0,1fr)_450px]">
          {/* ── Coluna principal ──────────────────────────────────────── */}
          <div className="space-y-5">

            {/* Faixa — cadastro aguardando aprovação */}
            {student.status === "pending" && !student.approved_at && (
              <div className="relative isolate overflow-hidden rounded-[1.7rem] border border-amber-400/25 bg-[linear-gradient(135deg,rgba(255,138,0,0.10),rgba(255,179,0,0.05))] p-5 shadow-[0_10px_36px_rgba(0,0,0,0.30)]">
                <div className="pointer-events-none absolute -inset-[1px] -z-10 rounded-[1.7rem] bg-gradient-to-b from-amber-400/[0.08] to-transparent blur-[16px]" />
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-500/[0.12] text-amber-300">
                      <ShieldCheck size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">Este cadastro está aguardando aprovação.</p>
                      <p className="mt-0.5 text-xs text-white/40">Aprove para ativar o acesso e enviar o e-mail de boas-vindas.</p>
                    </div>
                  </div>
                  <PremiumButton
                    icon={<CheckCircle2 size={15} />}
                    onClick={() => setApproveModal(true)}
                    className="!h-[44px] !rounded-[13px] !border-amber-300/60 !bg-[linear-gradient(135deg,#F45B00_0%,#FF8A00_52%,#FFB300_100%)] !px-5 !text-[13px] !font-bold !text-[#07111F] !shadow-[0_8px_24px_rgba(255,105,0,0.34),inset_0_1px_0_rgba(255,255,255,0.36)] hover:!-translate-y-0.5 hover:!brightness-105"
                  >
                    Aprovar cadastro
                  </PremiumButton>
                </div>
              </div>
            )}

            {/* Dados cadastrais */}
            <DarkCard
              title="Dados cadastrais"
              description={editing ? "Edite os campos abaixo e salve as alterações." : undefined}
              action={editing ? (
                <div className="flex gap-2">
                  <PremiumButton variant="secondary" onClick={cancelEdit} disabled={savingFields} icon={<X size={14} />}>
                    Cancelar
                  </PremiumButton>
                  <PremiumButton onClick={handleSaveFields} disabled={savingFields} icon={<CheckCircle2 size={14} />}>
                    {savingFields ? "Salvando…" : "Salvar"}
                  </PremiumButton>
                </div>
              ) : undefined}
            >
              {editing ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <DarkField label="Nome completo">
                      <DarkInput value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nome completo" />
                    </DarkField>
                  </div>
                  <DarkField label="E-mail de acesso">
                    <DarkInput
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      placeholder="aluno@email.com"
                    />
                  </DarkField>
                  <DarkField label="Telefone">
                    <DarkInput value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="(00) 00000-0000" />
                  </DarkField>
                  <DarkField label="CPF">
                    <DarkInput value={editCpf} onChange={(e) => setEditCpf(e.target.value)} placeholder="000.000.000-00" />
                  </DarkField>
                  <div className="sm:col-span-2">
                    <DarkField label="Concursos de interesse">
                      <DarkInput value={editDesiredContests} onChange={(e) => setEditDesiredContests(e.target.value)} placeholder="Ex: INSS, Receita Federal, PRF…" />
                    </DarkField>
                  </div>
                  <div className="sm:col-span-2">
                    <DarkField label="Observações internas">
                      <DarkTextarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        placeholder="Notas internas sobre o aluno (não visível para o aluno)…"
                        maxLength={500}
                        rows={4}
                      />
                    </DarkField>
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <DataRow icon={<UserRound size={13} />} label="Nome completo" value={student.name} />
                  <DataRow icon={<Mail size={13} />} label="E-mail" value={student.email} />
                  <DataRow icon={<Phone size={13} />} label="Telefone" value={student.phone || "—"} />
                  <DataRow icon={<Shield size={13} />} label="CPF" value={fmtCpf(student.cpf)} />
                  <DataRow icon={<Pencil size={13} />} label="Concursos de interesse" value={student.desired_contests || "—"} />
                  <DataRow icon={<UserRound size={13} />} label="Origem" value={student.origin || "Manual"} />
                  {student.notes && (
                    <div className="sm:col-span-2 rounded-2xl border border-amber-500/20 bg-amber-500/[0.07] px-4 py-3">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-amber-400">Observações</p>
                      <p className="text-sm text-white/70 whitespace-pre-line">{student.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </DarkCard>

            <AlunoActivityPanel
              student={student}
              activityLog={activityLog}
              usageSessions={usageSessions}
              systemActivities={systemActivities}
              jornadas={localJornadas}
              onAssign={() => setAssignModal(true)}
              onOpenSchedule={(sj) => {
                setScheduleModalJornada(sj);
                setAttemptDrafts(Object.fromEntries(sj.schedule.map((item) => [item.id, String(item.attempts_counting)])));
              }}
            />
          </div>

          {/* ── Sidebar ────────────────────────────────────────────────── */}
          <div className="space-y-5 xl:sticky xl:top-6 xl:self-start">

            {/* Status de acesso */}
            <DarkCard title="Status de acesso">
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/30">Status atual</p>
                  <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${statusCfg.cls}`}>
                    {statusCfg.icon}
                    {statusCfg.label}
                  </span>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/30">Alterar status</p>
                  <PremiumStatusSelect value={selectedStatus} onChange={setSelectedStatus} />
                </div>

                <PremiumButton
                  onClick={handleSaveStatus}
                  disabled={!statusChanged || savingStatus}
                  className="!h-[48px] w-full justify-center !rounded-[14px] !border-amber-300/60 !bg-[linear-gradient(135deg,#F45B00_0%,#FF8A00_52%,#FFB300_100%)] !text-[13px] !font-bold !text-[#07111F] !shadow-[0_8px_24px_rgba(255,105,0,0.34),0_0_26px_rgba(255,138,0,0.24),inset_0_1px_0_rgba(255,255,255,0.36)] hover:!-translate-y-0.5 hover:!brightness-105"
                >
                  {savingStatus ? "Salvando…" : "Salvar status"}
                </PremiumButton>

                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-xs text-white/35 leading-5 space-y-1">
                  <p><span className="font-semibold text-white/60">Em análise</span> — aguardando aprovação. Use a ação <span className="font-semibold text-amber-300">Aprovar cadastro</span> para ativar este aluno.</p>
                  <p><span className="font-semibold text-white/60">Ativo</span> — acesso liberado.</p>
                  <p><span className="font-semibold text-white/60">Bloqueado</span> — acesso suspenso (administrativo).</p>
                  <p><span className="font-semibold text-white/60">Inativo</span> — conta desativada; login bloqueado, histórico preservado.</p>
                </div>
              </div>
            </DarkCard>

            {/* Zona de perigo */}
            <div className="relative isolate overflow-hidden rounded-[1.7rem] border border-red-500/[0.16] bg-[#0B1929]/80 p-5 shadow-[0_10px_36px_rgba(0,0,0,0.34)]">
              <div className="pointer-events-none absolute -inset-[1px] -z-10 rounded-[1.7rem] bg-gradient-to-b from-red-500/[0.05] to-transparent" />
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-300/80">Zona de perigo</p>
              <p className="mt-2 text-xs leading-5 text-white/35">
                Ações sensíveis sobre a conta do aluno. Desativar é reversível e preserva o histórico; a exclusão definitiva é irreversível.
              </p>
              <div className="mt-4 space-y-2.5">
                <PremiumButton
                  variant="dark-primary"
                  full
                  icon={<KeyRound size={15} />}
                  onClick={() => setResetPasswordModal(true)}
                >
                  Resetar senha
                </PremiumButton>
                <PremiumButton
                  variant="dark-warning"
                  full
                  icon={<UserX size={15} />}
                  onClick={() => setDeactivateModal(true)}
                  disabled={student.status === "inactive"}
                >
                  {student.status === "inactive" ? "Aluno já desativado" : "Desativar aluno"}
                </PremiumButton>
                <PremiumButton
                  variant="dark-danger"
                  full
                  icon={<Trash2 size={15} />}
                  onClick={() => {
                    setDeleteConfirmText("");
                    setDeleteError(null);
                    setDeleteDependencies(null);
                    setDeleteModal(true);
                  }}
                >
                  Excluir definitivamente
                </PremiumButton>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal — Gerenciar Jornadas */}
      {assignModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
          <div className="relative isolate max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] border border-white/[0.09] bg-[#0B1929] p-7 shadow-2xl">
            <div className="pointer-events-none absolute -inset-[1px] -z-10 rounded-[2rem] bg-gradient-to-b from-orange-400/[0.06] to-transparent blur-[20px]" />

            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-400">Jornadas</p>
                <h2 className="mt-1 text-xl font-semibold text-white">Gerenciar Jornadas do aluno</h2>
                <p className="mt-1 text-sm text-white/40">
                  Veja onde {student.name} está inserido, remova matrículas com confirmação ou inclua em novas Jornadas publicadas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAssignModal(false)}
                className="rounded-xl p-2 text-white/30 transition hover:bg-white/[0.06] hover:text-white/60"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
              <section className="rounded-[1.5rem] border border-white/[0.07] bg-white/[0.025] p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white">Jornadas atuais</h3>
                    <p className="mt-1 text-xs text-white/35">Matrículas ativas, pausadas, expiradas ou canceladas deste aluno.</p>
                  </div>
                  <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs font-bold text-white/55">{localJornadas.length}</span>
                </div>

                {localJornadas.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/[0.08] bg-black/10 p-5 text-center text-sm text-white/38">
                    Este aluno ainda não está inserido em nenhuma Jornada.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {localJornadas.map((sj) => {
                      const cfg = JORNADA_STATUS_CFG[sj.status] ?? JORNADA_STATUS_CFG.cancelled;
                      const title = sj.jornadas?.title || "Jornada";
                      const completed = sj.progress?.completed ?? 0;
                      const total = sj.progress?.total ?? sj.schedule?.length ?? 0;
                      return (
                        <div key={sj.id} className="rounded-2xl border border-white/[0.07] bg-black/15 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-white">{title}</p>
                              <p className="mt-1 text-xs text-white/38">Entrada: {fmtDate(sj.started_at)} · Expira: {fmtDate(sj.expires_at)}</p>
                              <p className="mt-1 text-xs text-white/32">Progresso: {completed}/{total}</p>
                            </div>
                            <span className={`rounded-full border px-3 py-1 text-xs font-bold ${cfg.cls}`}>{cfg.label}</span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <PremiumButton variant="secondary" icon={<ListChecks size={13} />} className="!px-3 !py-1.5 !text-xs" onClick={() => {
                              setScheduleModalJornada(sj);
                              setAttemptDrafts(Object.fromEntries(sj.schedule.map((item) => [item.id, String(item.attempts_counting)])));
                            }}>
                              Cronograma
                            </PremiumButton>
                            <Link href={`/admin/jornadas/${sj.jornada_id}`}>
                              <PremiumButton variant="secondary" icon={<MapPin size={13} />} className="!px-3 !py-1.5 !text-xs">Ver Jornada</PremiumButton>
                            </Link>
                            {sj.status !== "cancelled" ? (
                              <PremiumButton
                                variant="danger"
                                icon={<Ban size={13} />}
                                className="!px-3 !py-1.5 !text-xs"
                                onClick={() => setCancelJornadaTarget(sj)}
                              >
                                Remover
                              </PremiumButton>
                            ) : (
                              <span className="inline-flex items-center rounded-xl border border-red-500/20 bg-red-500/[0.07] px-3 py-1.5 text-xs font-bold text-red-300">Cancelada — pode reinserir abaixo</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="rounded-[1.5rem] border border-orange-500/15 bg-orange-500/[0.035] p-4">
                <div className="mb-4">
                  <h3 className="text-sm font-bold text-white">Inserir em Jornada</h3>
                  <p className="mt-1 text-xs text-orange-200/55">Jornadas canceladas ficam disponíveis para reinserção.</p>
                </div>

                {assignableJornadas.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.03] p-6 text-center text-sm text-white/40">
                    Não há Jornada publicada disponível para este aluno.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <DarkField label="Jornada">
                      <DarkSelect
                        value={assignForm.jornada_id}
                        onChange={(e) => setAssignForm((p) => ({ ...p, jornada_id: e.target.value }))}
                      >
                        <option value="">Selecione a Jornada…</option>
                        {assignableJornadas.map((j) => (
                          <option key={j.id} value={j.id}>
                            {j.title}
                            {j.scope_type === "contest" && j.contest_name ? ` — ${j.contest_name}` : " — Geral"}
                            {cancelledEnrollmentJornadaIds.has(j.id) ? " — reinserir" : ""}
                          </option>
                        ))}
                      </DarkSelect>
                    </DarkField>

                    <DarkField label="Data de entrada">
                      <input
                        type="date"
                        value={assignForm.started_at}
                        onChange={(e) => setAssignForm((p) => ({ ...p, started_at: e.target.value }))}
                        className="h-12 w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 text-sm font-medium text-white/80 outline-none transition duration-200 hover:border-white/[0.14] focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10 [color-scheme:dark]"
                      />
                    </DarkField>

                    <div className="rounded-2xl border border-orange-500/20 bg-orange-500/[0.06] px-4 py-3 text-xs leading-5 text-orange-300/80">
                      Ao inserir ou reinserir, o sistema calcula o vencimento, recria o cronograma individual e envia o e-mail de boas-vindas da Jornada.
                    </div>
                  </div>
                )}

                <div className="mt-5 flex gap-3">
                  <PremiumButton variant="secondary" full onClick={() => setAssignModal(false)} disabled={assigning}>
                    Fechar
                  </PremiumButton>
                  <PremiumButton
                    full
                    icon={<CheckCircle2 size={16} />}
                    onClick={handleAssignJornada}
                    disabled={assigning || assignableJornadas.length === 0}
                  >
                    {assigning ? "Inserindo…" : cancelledEnrollmentJornadaIds.has(assignForm.jornada_id) ? "Reinserir" : "Inserir"}
                  </PremiumButton>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* Modal — Confirmar remoção de Jornada */}
      {cancelJornadaTarget && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/75 px-4 backdrop-blur-sm">
          <div className="relative isolate w-full max-w-lg rounded-[2rem] border border-red-500/20 bg-[#0B1929] p-7 shadow-2xl">
            <div className="pointer-events-none absolute -inset-[1px] -z-10 rounded-[2rem] bg-gradient-to-b from-red-500/[0.10] to-transparent blur-[20px]" />
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-red-500/25 bg-red-500/[0.10] text-red-300">
                <AlertTriangle size={22} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-300">Confirmar remoção</p>
                <h2 className="mt-1 text-xl font-semibold text-white">Remover aluno da Jornada?</h2>
                <p className="mt-2 text-sm leading-6 text-white/45">
                  A matrícula de {student.name} em <span className="font-semibold text-white/75">{cancelJornadaTarget.jornadas?.title || "Jornada"}</span> será marcada como cancelada. Depois, o aluno poderá ser reinserido nesta mesma Jornada.
                </p>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <PremiumButton variant="secondary" full onClick={() => setCancelJornadaTarget(null)} disabled={cancellingJornada}>
                Voltar
              </PremiumButton>
              <PremiumButton variant="danger" full icon={<Ban size={15} />} onClick={handleCancelJornadaEnrollment} disabled={cancellingJornada}>
                {cancellingJornada ? "Removendo…" : "Remover da Jornada"}
              </PremiumButton>
            </div>
          </div>
        </div>
      )}

      {/* Modal — Resetar senha */}
      {resetPasswordModal && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
          <div className="relative isolate w-full max-w-lg rounded-[2rem] border border-orange-400/25 bg-[#0B1929] p-7 shadow-2xl">
            <div className="pointer-events-none absolute -inset-[1px] -z-10 rounded-[2rem] bg-gradient-to-b from-orange-400/[0.10] to-transparent blur-[20px]" />
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-orange-400/25 bg-orange-500/[0.10] text-orange-300">
                  <KeyRound size={22} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">Ação de segurança</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">Resetar senha do aluno?</h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { if (!resettingPassword) setResetPasswordModal(false); }}
                disabled={resettingPassword}
                className="rounded-xl p-2 text-white/30 transition hover:bg-white/[0.06] hover:text-white/60 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mt-4 text-sm leading-6 text-white/50">
              A senha atual de <span className="font-semibold text-white/80">{student.name}</span> deixará de funcionar. O aluno receberá um e-mail avisando sobre o reset e um link válido por 24 horas para criar uma nova senha.
            </p>
            <div className="mt-4 rounded-2xl border border-orange-400/15 bg-orange-500/[0.06] px-4 py-3 text-xs leading-5 text-orange-100/65">
              O status da conta não será alterado. Alunos bloqueados ou inativos continuarão sem acesso até uma ação administrativa específica.
            </div>
            <div className="mt-6 flex gap-3">
              <PremiumButton variant="secondary" full onClick={() => setResetPasswordModal(false)} disabled={resettingPassword}>
                Cancelar
              </PremiumButton>
              <PremiumButton variant="dark-primary" full icon={<KeyRound size={15} />} onClick={handleResetPassword} disabled={resettingPassword}>
                {resettingPassword ? "Resetando…" : "Resetar e enviar e-mail"}
              </PremiumButton>
            </div>
          </div>
        </div>
      )}

      {/* Modal — Excluir definitivamente */}
      {deleteModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
          <div className="relative isolate max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[2rem] border border-red-500/25 bg-[#0B1929] p-7 shadow-2xl">
            <div className="pointer-events-none absolute -inset-[1px] -z-10 rounded-[2rem] bg-gradient-to-b from-red-500/[0.12] to-transparent blur-[20px]" />

            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-red-500/25 bg-red-500/[0.10] text-red-300">
                  <Trash2 size={22} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-300">Ação irreversível</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">Excluir aluno definitivamente?</h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { if (!deleting) setDeleteModal(false); }}
                disabled={deleting}
                className="rounded-xl p-2 text-white/30 transition hover:bg-white/[0.06] hover:text-white/60 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <X size={18} />
              </button>
            </div>

            <p className="mt-4 text-sm leading-6 text-white/50">
              Esta ação removerá permanentemente a conta de <span className="font-semibold text-white/80">{student.name}</span> do EstudoTOP e do sistema de autenticação.
            </p>

            <ul className="mt-4 space-y-1.5 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 text-xs leading-5 text-white/45">
              <li>• A exclusão é <span className="font-semibold text-red-300">irreversível</span>.</li>
              <li>• O e-mail será liberado para um novo cadastro.</li>
              <li>• O usuário será removido do Supabase Auth (sessões invalidadas).</li>
              <li>• A ação só continuará se não existir histórico vinculado ao aluno.</li>
              <li>• Com histórico, a opção recomendada é <span className="font-semibold text-amber-300">Desativar aluno</span>.</li>
            </ul>

            {deleteDependencies && (
              <div className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/[0.08] px-4 py-3.5">
                <p className="flex items-center gap-2 text-sm font-semibold text-amber-300">
                  <AlertTriangle size={15} />
                  Este aluno possui histórico e não pode ser excluído
                </p>
                <ul className="mt-2 space-y-1 text-xs leading-5 text-amber-200/80">
                  {deleteDependencies.map((dep) => (
                    <li key={dep.type}>
                      • {DELETE_DEPENDENCY_LABELS[dep.type] || dep.type}: <span className="font-semibold">{dep.count}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs leading-5 text-amber-200/60">
                  Nenhum dado foi alterado. Desative a conta para suspender o acesso preservando todo o histórico.
                </p>
                <PremiumButton
                  variant="secondary"
                  full
                  icon={<UserX size={15} />}
                  onClick={() => setDeactivateModal(true)}
                  disabled={deleting || student.status === "inactive"}
                  className="mt-3 !border-amber-400/30 !text-amber-200 hover:!border-amber-400/50 hover:!bg-amber-500/[0.10]"
                >
                  {student.status === "inactive" ? "Aluno já desativado" : "Desativar em vez disso"}
                </PremiumButton>
              </div>
            )}

            {deleteError && (
              <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {deleteError}
              </div>
            )}

            {!deleteDependencies && (
              <div className="mt-5">
                <label htmlFor="delete-confirm-input" className="text-xs font-semibold uppercase tracking-widest text-white/35">
                  Digite <span className="text-red-300">EXCLUIR</span> para confirmar
                </label>
                <input
                  id="delete-confirm-input"
                  type="text"
                  value={deleteConfirmText}
                  onChange={(event) => setDeleteConfirmText(event.target.value)}
                  disabled={deleting}
                  placeholder="EXCLUIR"
                  autoComplete="off"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none placeholder:text-white/20 focus:border-red-400/60 disabled:opacity-50"
                />
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <PremiumButton variant="secondary" full onClick={() => setDeleteModal(false)} disabled={deleting}>
                Cancelar
              </PremiumButton>
              {!deleteDependencies && (
                <PremiumButton
                  variant="danger"
                  full
                  icon={<Trash2 size={15} />}
                  onClick={handleDeleteStudent}
                  disabled={deleting || deleteConfirmText.trim() !== "EXCLUIR"}
                >
                  {deleting ? "Excluindo…" : "Excluir definitivamente"}
                </PremiumButton>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal — Desativar aluno */}
      {deactivateModal && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
          <div className="relative isolate w-full max-w-lg rounded-[2rem] border border-amber-500/25 bg-[#0B1929] p-7 shadow-2xl">
            <div className="pointer-events-none absolute -inset-[1px] -z-10 rounded-[2rem] bg-gradient-to-b from-amber-500/[0.10] to-transparent blur-[20px]" />

            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-500/25 bg-amber-500/[0.10] text-amber-300">
                  <UserX size={22} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Ação reversível</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">Desativar aluno?</h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { if (!deactivating) setDeactivateModal(false); }}
                disabled={deactivating}
                className="rounded-xl p-2 text-white/30 transition hover:bg-white/[0.06] hover:text-white/60 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <X size={18} />
              </button>
            </div>

            <p className="mt-4 text-sm leading-6 text-white/50">
              O acesso de <span className="font-semibold text-white/80">{student.name}</span> será suspenso, mas todo o histórico, Jornadas, tentativas e resultados serão preservados.
            </p>

            <ul className="mt-4 space-y-1.5 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 text-xs leading-5 text-white/45">
              <li>• Ação <span className="font-semibold text-emerald-300">reversível</span> — a conta pode ser reativada depois.</li>
              <li>• O login será bloqueado imediatamente.</li>
              <li>• Todo o histórico será mantido.</li>
              <li>• O e-mail continuará vinculado a esta conta.</li>
            </ul>

            <div className="mt-6 flex gap-3">
              <PremiumButton variant="secondary" full onClick={() => setDeactivateModal(false)} disabled={deactivating}>
                Cancelar
              </PremiumButton>
              <PremiumButton
                variant="secondary"
                full
                icon={<UserX size={15} />}
                onClick={handleConfirmDeactivate}
                disabled={deactivating}
                className="!border-amber-400/50 !bg-amber-500/[0.14] !text-amber-200 hover:!border-amber-400/70 hover:!bg-amber-500/[0.20]"
              >
                {deactivating ? "Desativando…" : "Desativar aluno"}
              </PremiumButton>
            </div>
          </div>
        </div>
      )}

      {/* Modal — Aprovar cadastro */}
      {approveModal && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
          <div className="relative isolate w-full max-w-lg rounded-[2rem] border border-amber-400/30 bg-[#0B1929] p-7 shadow-2xl">
            <div className="pointer-events-none absolute -inset-[1px] -z-10 rounded-[2rem] bg-gradient-to-b from-amber-400/[0.12] to-transparent blur-[20px]" />

            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-500/[0.12] text-amber-300">
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Aprovação inicial</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">Aprovar cadastro?</h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { if (!approving) setApproveModal(false); }}
                disabled={approving}
                className="rounded-xl p-2 text-white/30 transition hover:bg-white/[0.06] hover:text-white/60 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <X size={18} />
              </button>
            </div>

            <p className="mt-4 text-sm leading-6 text-white/50">
              Ao aprovar o cadastro de <span className="font-semibold text-white/80">{student.name}</span>, o acesso será ativado e o e-mail de boas-vindas será enviado para <span className="font-semibold text-white/80">{student.email}</span>.
            </p>

            <ul className="mt-4 space-y-1.5 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 text-xs leading-5 text-white/45">
              <li>• O status passará de <span className="font-semibold text-white/70">Em análise</span> para <span className="font-semibold text-emerald-300">Ativo</span>.</li>
              <li>• O acesso do aluno será liberado.</li>
              <li>• O e-mail de boas-vindas será enviado.</li>
              <li>• Esta é a <span className="font-semibold text-amber-300">aprovação inicial</span> do cadastro.</li>
              <li>• Reativações futuras não reenviarão automaticamente esse e-mail.</li>
            </ul>

            <div className="mt-6 flex gap-3">
              <PremiumButton variant="secondary" full onClick={() => setApproveModal(false)} disabled={approving}>
                Cancelar
              </PremiumButton>
              <PremiumButton
                full
                icon={<CheckCircle2 size={15} />}
                onClick={handleConfirmApprove}
                disabled={approving}
                className="!border-amber-300/60 !bg-[linear-gradient(135deg,#F45B00_0%,#FF8A00_52%,#FFB300_100%)] !text-[13px] !font-bold !text-[#07111F] !shadow-[0_8px_24px_rgba(255,105,0,0.34),inset_0_1px_0_rgba(255,255,255,0.36)] hover:!brightness-105"
              >
                {approving ? "Aprovando…" : "Aprovar e enviar e-mail"}
              </PremiumButton>
            </div>
          </div>
        </div>
      )}

      {/* Modal — Reativar aluno */}
      {reactivateModal && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
          <div className="relative isolate w-full max-w-lg rounded-[2rem] border border-emerald-500/25 bg-[#0B1929] p-7 shadow-2xl">
            <div className="pointer-events-none absolute -inset-[1px] -z-10 rounded-[2rem] bg-gradient-to-b from-emerald-500/[0.10] to-transparent blur-[20px]" />

            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.10] text-emerald-300">
                  <Unlock size={22} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Reativação</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">Reativar aluno?</h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { if (!reactivating) setReactivateModal(false); }}
                disabled={reactivating}
                className="rounded-xl p-2 text-white/30 transition hover:bg-white/[0.06] hover:text-white/60 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <X size={18} />
              </button>
            </div>

            <p className="mt-4 text-sm leading-6 text-white/50">
              O acesso de <span className="font-semibold text-white/80">{student.name}</span> será restabelecido. O e-mail inicial de boas-vindas não será enviado novamente.
            </p>

            <div className="mt-6 flex gap-3">
              <PremiumButton variant="secondary" full onClick={() => setReactivateModal(false)} disabled={reactivating}>
                Cancelar
              </PremiumButton>
              <PremiumButton
                variant="secondary"
                full
                icon={<Unlock size={15} />}
                onClick={handleConfirmReactivate}
                disabled={reactivating}
                className="!border-emerald-400/50 !bg-emerald-500/[0.14] !text-emerald-200 hover:!border-emerald-400/70 hover:!bg-emerald-500/[0.20]"
              >
                {reactivating ? "Reativando…" : "Reativar aluno"}
              </PremiumButton>
            </div>
          </div>
        </div>
      )}

      <PremiumModal
        open={Boolean(resetAttemptsTarget)}
        tone="warning"
        title="Zerar tentativas deste simulado?"
        message="Zerar as tentativas deste simulado irá apagar as tentativas, respostas, notas, resultados e TopCoins deste aluno neste simulado. O aluno voltará a vê-lo como não realizado. As anotações do caderno serão preservadas. Deseja continuar?"
        onClose={() => setResetAttemptsTarget(null)}
        dismissible={!scheduleProcessingId}
        actions={resetAttemptsTarget ? (
          <div className="flex w-full flex-col-reverse gap-3 sm:flex-row">
            <PremiumButton
              variant="secondary"
              full
              onClick={() => setResetAttemptsTarget(null)}
              disabled={Boolean(scheduleProcessingId)}
            >
              Cancelar
            </PremiumButton>
            <PremiumButton
              variant="dark-warning"
              full
              icon={<AlertTriangle size={16} />}
              disabled={Boolean(scheduleProcessingId)}
              onClick={async () => {
                const target = resetAttemptsTarget;
                if (!target) return;
                const resetCompleted = await performSetAttempts(target.jornada, target.item, 0);
                if (resetCompleted) setResetAttemptsTarget(null);
              }}
            >
              {scheduleProcessingId ? "Zerando…" : "Sim, zerar tentativas"}
            </PremiumButton>
          </div>
        ) : undefined}
      />

      {/* Modal — Cronograma da Jornada */}
      {scheduleModalJornada && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[radial-gradient(circle_at_25%_15%,rgba(32,132,255,0.10),transparent_34%),radial-gradient(circle_at_80%_88%,rgba(255,111,0,0.12),transparent_30%),rgba(1,5,12,0.78)] px-4 py-6 backdrop-blur-[14px]">
          <div className="relative isolate flex h-[min(860px,calc(100vh-54px))] w-[min(1460px,calc(100vw-64px))] max-w-none flex-col overflow-hidden rounded-[26px] border border-blue-300/35 bg-[linear-gradient(145deg,rgba(8,22,40,0.98),rgba(5,15,28,0.98))] shadow-[0_30px_100px_rgba(0,0,0,0.62),0_0_52px_rgba(28,123,235,0.14),0_0_42px_rgba(255,122,0,0.08),inset_0_1px_0_rgba(255,255,255,0.045)]">
            <div className="pointer-events-none absolute inset-0 -z-10">
              <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-blue-500/[0.10] blur-[100px]" />
              <div className="absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-orange-500/[0.10] blur-[110px]" />
              <div className="absolute inset-x-8 top-0 h-[2px] bg-[linear-gradient(90deg,transparent_0%,#258EFF_26%,transparent_50%,#FF7A00_75%,transparent_100%)]" />
              <div className="absolute inset-x-24 bottom-0 h-px bg-gradient-to-r from-transparent via-blue-400/35 to-orange-400/55" />
            </div>

            <div className="flex min-h-[150px] items-start justify-between gap-6 border-b border-white/[0.08] bg-gradient-to-r from-white/[0.025] to-transparent px-8 py-[30px] lg:px-10">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-orange-400">Cronograma individual</p>
                <h2 className="mt-2 text-[30px] font-bold leading-tight tracking-[-0.02em] text-white">
                  {scheduleModalJornada.jornadas?.title ?? "Jornada"}
                </h2>
                <p className="mt-2 text-sm font-medium text-[#A9B8C9]">
                  Liberações programadas, ações manuais e tentativas deste aluno em cada simulado.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setScheduleModalJornada(null)}
                className="flex h-[54px] w-[54px] items-center justify-center rounded-[14px] border border-blue-200/25 bg-white/[0.025] text-white/70 shadow-lg shadow-black/20 transition hover:rotate-[3deg] hover:scale-[1.02] hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-white"
                aria-label="Fechar cronograma da jornada"
              >
                <X size={21} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-7 py-[26px] [scrollbar-color:rgba(96,165,250,0.55)_rgba(255,255,255,0.04)] [scrollbar-width:thin]">
              {scheduleModalJornada.schedule.length === 0 ? (
                <div className="rounded-[1.75rem] border border-dashed border-white/[0.10] bg-white/[0.025] p-10 text-center text-sm text-white/45">
                  Esta matrícula ainda não possui simulados programados.
                </div>
              ) : (
                <div className="space-y-3">
                  {scheduleModalJornada.schedule.map((item) => {
                    const isProcessingRelease = scheduleProcessingId === `release_now:${item.id}`;
                    const isProcessingUnrelease = scheduleProcessingId === `unrelease:${item.id}`;
                    const isProcessingAttempts = scheduleProcessingId === `attempts:${item.id}`;
                    const canReleaseNow = item.status === "locked";
                    const canUnrelease = item.can_unrelease;
                    const isStartedOrCompleted = ["in_progress", "completed"].includes(item.status);
                    const isAvailable = item.status === "available";

                    return (
                      <div
                        key={item.id}
                        className={`group relative isolate min-h-[145px] overflow-hidden rounded-[18px] border p-5 shadow-[0_12px_34px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.025)] transition duration-300 hover:-translate-y-0.5 ${
                          isAvailable
                            ? "border-blue-300/28 bg-[linear-gradient(135deg,rgba(17,38,65,0.84),rgba(8,26,48,0.80))] hover:border-blue-300/42"
                            : "border-blue-300/20 bg-[linear-gradient(135deg,rgba(14,32,55,0.80),rgba(7,23,43,0.82))] hover:border-blue-300/34"
                        }`}
                      >
                        <div className={`pointer-events-none absolute inset-y-0 left-0 w-px ${isAvailable ? "bg-orange-400/65" : "bg-blue-300/35"}`} />
                        <div className={`pointer-events-none absolute -left-16 top-1/2 h-36 w-36 -translate-y-1/2 rounded-full blur-[70px] ${isAvailable ? "bg-orange-500/[0.11]" : "bg-blue-500/[0.08]"}`} />

                        <div className="grid gap-5 xl:grid-cols-[minmax(420px,1.7fr)_160px_340px_270px] xl:items-center">
                          <div className="min-w-0">
                            <div className="flex items-center gap-4">
                              <div className={`relative flex h-[66px] w-[66px] shrink-0 items-center justify-center rounded-full border text-[18px] font-black shadow-lg ${
                                isAvailable
                                  ? "border-orange-400/80 bg-[radial-gradient(circle,rgba(255,138,0,0.16),rgba(10,21,37,0.80))] text-white shadow-[0_0_0_4px_rgba(255,138,0,0.035),0_0_24px_rgba(255,138,0,0.25),inset_0_0_18px_rgba(255,138,0,0.08)]"
                                  : "border-blue-300/50 bg-[radial-gradient(circle,rgba(64,130,205,0.12),rgba(10,21,37,0.82))] text-white/85 shadow-[0_0_20px_rgba(54,133,222,0.18)]"
                              }`}>
                                <span className={`absolute inset-1 rounded-full border ${isAvailable ? "border-orange-300/20" : "border-blue-200/15"}`} />
                                {String(item.order_number).padStart(2, "0")}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-[15px] font-semibold text-white/92">{item.title}</p>
                                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/42">
                                  <span>Data prevista: <strong className="font-semibold text-white/70">{fmtDate(item.scheduled_release_at)}</strong></span>
                                  <span className="text-white/20">•</span>
                                  <span>Liberação real: <strong className="font-semibold text-white/70">{fmtDateTime(item.released_at)}</strong></span>
                                  {item.completed_at && (
                                    <>
                                      <span className="text-white/20">•</span>
                                      <span>Concluído em: <strong className="font-semibold text-emerald-300/80">{fmtDateTime(item.completed_at)}</strong></span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="xl:relative xl:pl-6 xl:before:absolute xl:before:bottom-[18px] xl:before:left-0 xl:before:top-[18px] xl:before:w-px xl:before:bg-white/[0.075]">
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/32">Status</p>
                            <span className={`inline-flex h-[38px] items-center rounded-full border px-4 text-xs font-bold shadow-sm ${statusClass(item.status)}`}>
                              {statusLabel(item.status)}
                            </span>
                            {item.manually_released && (
                              <p className="mt-2 text-[11px] font-medium text-orange-300/80">Liberado manualmente</p>
                            )}
                          </div>

                          <div className="xl:relative xl:pl-6 xl:before:absolute xl:before:bottom-[18px] xl:before:left-0 xl:before:top-[18px] xl:before:w-px xl:before:bg-white/[0.075]">
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/32">Tentativas</p>
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="number"
                                min={0}
                                value={attemptDrafts[item.id] ?? String(item.attempts_counting)}
                                onChange={(e) => setAttemptDrafts((current) => ({ ...current, [item.id]: e.target.value }))}
                                className="h-12 w-[105px] rounded-[13px] border border-blue-300/20 bg-black/20 px-3.5 text-sm font-bold text-white/90 shadow-inner outline-none transition focus:border-orange-400/50 focus:ring-4 focus:ring-orange-500/10"
                              />
                              <span className="text-xs text-white/35">de {item.max_attempts ?? "∞"}</span>
                              <button
                                type="button"
                                onClick={() => handleSetAttempts(scheduleModalJornada, item)}
                                disabled={isProcessingAttempts}
                                className="inline-flex h-12 min-w-[118px] items-center justify-center gap-2 rounded-[13px] border border-blue-300/34 bg-[linear-gradient(180deg,rgba(18,47,79,0.95),rgba(9,31,56,0.95))] px-4 text-xs font-bold text-slate-200 shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:border-blue-200/45 hover:shadow-[0_0_20px_rgba(43,134,235,0.18)] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <Save size={14} />
                                {isProcessingAttempts ? "Salvando…" : "Salvar"}
                              </button>
                            </div>
                            <p className="mt-2 text-[11px] text-white/30">Total real: {item.attempts_total}</p>
                          </div>

                          <div className="flex flex-col gap-2 xl:relative xl:pl-6 xl:before:absolute xl:before:bottom-[18px] xl:before:left-0 xl:before:top-[18px] xl:before:w-px xl:before:bg-white/[0.075]">
                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/32">Ação manual</p>
                            {canReleaseNow && (
                              <button
                                type="button"
                                onClick={() => handleScheduleAction(scheduleModalJornada, item, "release_now")}
                                disabled={Boolean(scheduleProcessingId)}
                                className="inline-flex h-[54px] min-w-[190px] items-center justify-center gap-2 rounded-[13px] border border-amber-200/70 bg-[linear-gradient(110deg,#FF5A00_0%,#FF8A00_45%,#FFB500_100%)] px-5 text-xs font-black text-white shadow-[0_10px_25px_rgba(255,92,0,0.34),0_0_28px_rgba(255,138,0,0.30),inset_0_1px_0_rgba(255,255,255,0.40)] transition hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                              >
                                <Unlock size={15} />
                                {isProcessingRelease ? "Liberando…" : "Liberar agora"}
                              </button>
                            )}
                            {canUnrelease && (
                              <button
                                type="button"
                                onClick={() => handleScheduleAction(scheduleModalJornada, item, "unrelease")}
                                disabled={Boolean(scheduleProcessingId) || !canUnrelease}
                                className="inline-flex h-[52px] min-w-[190px] items-center justify-center gap-2 rounded-[13px] border border-blue-300/34 bg-[linear-gradient(180deg,rgba(18,45,76,0.92),rgba(8,29,53,0.94))] px-5 text-xs font-bold text-slate-200 shadow-lg shadow-black/15 transition hover:-translate-y-0.5 hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-45"
                                title={!canUnrelease || isStartedOrCompleted ? "Para desliberar, as tentativas e o Total real precisam estar zerados." : undefined}
                              >
                                <RotateCcw size={15} />
                                {isProcessingUnrelease ? "Revertendo…" : "Desliberar"}
                              </button>
                            )}
                            {!canReleaseNow && !canUnrelease && (
                              <span className="inline-flex h-[52px] min-w-[190px] items-center justify-center rounded-[13px] border border-white/[0.08] bg-white/[0.025] px-4 text-xs font-semibold text-white/38">
                                Sem ação manual
                              </span>
                            )}
                          </div>
                        </div>

                        {isAvailable && Boolean(item.released_at) && !canUnrelease && (
                          <div className="mt-4 rounded-xl border border-amber-500/18 bg-amber-500/[0.075] px-4 py-2.5 text-xs text-amber-200/75">
                            Para desliberar, zere as tentativas e confirme que o Total real também ficou em zero.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex min-h-[90px] items-center justify-end border-t border-white/[0.08] bg-[linear-gradient(180deg,rgba(8,24,43,0.94),rgba(7,19,34,0.98))] px-8 py-4 lg:px-10">
              <button
                type="button"
                onClick={() => setScheduleModalJornada(null)}
                className="inline-flex h-[54px] min-w-[150px] items-center justify-center rounded-[14px] border border-white/70 bg-gradient-to-b from-white to-slate-200 px-8 text-sm font-black text-[#07111F] shadow-[0_10px_30px_rgba(0,0,0,0.30),0_0_24px_rgba(255,255,255,0.10)] transition hover:-translate-y-0.5 hover:brightness-105"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — Reenvio de E-mails */}
      {resendEmailModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/75 px-4 py-8 backdrop-blur-md">
          <div className="relative isolate flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[2.25rem] border border-white/[0.10] bg-[linear-gradient(145deg,rgba(12,30,51,0.98),rgba(7,18,32,0.98))] shadow-[0_30px_90px_rgba(0,0,0,0.60)]">
            <div className="pointer-events-none absolute -left-24 -top-24 -z-10 h-72 w-72 rounded-full bg-orange-500/[0.16] blur-[85px]" />
            <div className="pointer-events-none absolute -bottom-28 right-0 -z-10 h-80 w-80 rounded-full bg-blue-500/[0.12] blur-[95px]" />

            <div className="flex items-start justify-between gap-5 border-b border-white/[0.08] bg-white/[0.025] px-7 py-6 md:px-8">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-orange-400">Central de e-mails</p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-white">Reenvio de e-mails</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                  Reenvie uma comunicação ou consulte os envios registrados para <span className="font-bold text-white">{student.name}</span>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setResendEmailModal(false);
                  setResendEmailTab("emails");
                  setSelectedResendOption("");
                }}
                className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3 text-white/35 transition hover:border-white/[0.14] hover:bg-white/[0.07] hover:text-white/70"
                aria-label="Fechar modal de reenvio de e-mails"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex gap-2 border-b border-white/[0.08] bg-black/10 px-7 pt-4 md:px-8">
              <button
                type="button"
                onClick={() => setResendEmailTab("emails")}
                className={`inline-flex h-11 items-center gap-2 rounded-t-xl border-b-2 px-4 text-sm font-black transition ${
                  resendEmailTab === "emails"
                    ? "border-orange-400 bg-orange-500/[0.10] text-orange-200"
                    : "border-transparent text-white/40 hover:bg-white/[0.04] hover:text-white/70"
                }`}
              >
                <Mail size={16} />
                E-mails
              </button>
              <button
                type="button"
                onClick={() => setResendEmailTab("history")}
                className={`inline-flex h-11 items-center gap-2 rounded-t-xl border-b-2 px-4 text-sm font-black transition ${
                  resendEmailTab === "history"
                    ? "border-orange-400 bg-orange-500/[0.10] text-orange-200"
                    : "border-transparent text-white/40 hover:bg-white/[0.04] hover:text-white/70"
                }`}
              >
                <History size={16} />
                Histórico
                <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] text-white/55">
                  {emailHistory.length}
                </span>
              </button>
            </div>

            {resendEmailTab === "emails" ? (
              <>
                <div className="flex-1 space-y-6 overflow-y-auto px-7 py-6 md:px-8">
              <div className="grid gap-4 md:grid-cols-2">
                <ResendEmailCard
                  active={selectedResendOption === "welcome"}
                  title="Boas-vindas ao sistema"
                  eyebrow="Cadastro do aluno"
                  description="Reenvia o primeiro e-mail de boas-vindas da plataforma."
                  meta="Template institucional"
                  icon={<Mail size={18} />}
                  onClick={() => setSelectedResendOption("welcome")}
                />
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/32">Jornadas</p>
                    <h3 className="mt-1 text-sm font-bold text-white">E-mails de entrada em Jornada</h3>
                  </div>
                  <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs font-bold text-white/45">
                    {localJornadas.length} disponível(is)
                  </span>
                </div>
                {localJornadas.length === 0 ? (
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] px-5 py-4 text-sm text-white/38">
                    O aluno ainda não está inserido em nenhuma Jornada.
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {localJornadas.map((sj) => (
                      <ResendEmailCard
                        key={`jornada-${sj.id}`}
                        active={selectedResendOption === `jornada:${sj.jornada_id}`}
                        title={sj.jornadas?.title ?? "Jornada"}
                        eyebrow="Entrada em Jornada"
                        description="Reenvia o e-mail que informa que o aluno foi inserido nesta Jornada."
                        meta={`${sj.progress.completed}/${sj.progress.total} simulados concluídos`}
                        icon={<MapPin size={18} />}
                        onClick={() => setSelectedResendOption(`jornada:${sj.jornada_id}`)}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/32">Simulados liberados</p>
                    <h3 className="mt-1 text-sm font-bold text-white">E-mails de simulado liberado</h3>
                  </div>
                  <span className="rounded-full border border-orange-400/20 bg-orange-500/[0.08] px-3 py-1 text-xs font-bold text-orange-200/75">
                    {releasedSimuladoEmailOptions.length} disponível(is)
                  </span>
                </div>
                {releasedSimuladoEmailOptions.length === 0 ? (
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] px-5 py-4 text-sm text-white/38">
                    Nenhum simulado está liberado para reenvio neste momento.
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {releasedSimuladoEmailOptions.map(({ jornada: sj, item }) => (
                      <ResendEmailCard
                        key={`simulado-${item.id}`}
                        active={selectedResendOption === `simulado:${sj.id}:${item.id}`}
                        title={item.title}
                        eyebrow="Simulado liberado"
                        description={sj.jornadas?.title ?? "Jornada"}
                        meta={`Liberado em ${fmtDateTime(item.released_at)}`}
                        icon={<ListChecks size={18} />}
                        onClick={() => setSelectedResendOption(`simulado:${sj.id}:${item.id}`)}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-blue-300/15 bg-blue-500/[0.055] px-5 py-4 text-xs leading-5 text-blue-100/70">
                {selectedResendOption.startsWith("simulado:")
                  ? "O aluno receberá novamente o e-mail de novo simulado liberado, no mesmo padrão visual usado nas liberações automáticas e manuais."
                  : selectedResendOption.startsWith("jornada:")
                    ? "O aluno receberá novamente o e-mail informando que foi inserido(a) na Jornada selecionada."
                    : selectedResendOption === "welcome"
                      ? "O aluno receberá novamente o e-mail institucional de boas-vindas ao sistema."
                      : "Selecione uma opção acima para confirmar qual mensagem será reenviada."}
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-white/[0.08] bg-black/15 px-7 py-5 md:flex-row md:justify-end md:px-8">
              <PremiumButton
                variant="secondary"
                className="!h-[50px] !rounded-[14px] !border-white/[0.12] !bg-white/[0.04] !text-slate-100 hover:!bg-white/[0.07]"
                onClick={() => {
                  setResendEmailModal(false);
                  setResendEmailTab("emails");
                  setSelectedResendOption("");
                }}
                disabled={sendingResendEmail}
              >
                Cancelar
              </PremiumButton>
              <PremiumButton
                className="!h-[50px] !rounded-[14px] !bg-[linear-gradient(135deg,#FF6500_0%,#FF9E00_55%,#FFC000_100%)] !px-7 !font-black !text-[#07111F] !shadow-[0_12px_30px_rgba(255,105,0,0.35)]"
                icon={<Mail size={16} />}
                onClick={handleSendResendEmail}
                disabled={sendingResendEmail || !selectedResendOption}
              >
                {sendingResendEmail ? "Enviando…" : "Reenviar e-mail"}
              </PremiumButton>
            </div>
              </>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto px-7 py-6 md:px-8">
                  <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/32">Linha do tempo</p>
                      <h3 className="mt-1 text-lg font-black text-white">Histórico de e-mails</h3>
                    </div>
                    <p className="text-xs font-semibold text-white/38">Do primeiro ao mais recente · {student.email}</p>
                  </div>

                  {emailHistory.length === 0 ? (
                    <div className="flex min-h-52 flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-white/[0.10] bg-white/[0.025] px-6 text-center">
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-white/35">
                        <History size={21} />
                      </span>
                      <p className="mt-4 text-sm font-black text-white/70">Nenhum envio registrado</p>
                      <p className="mt-1 max-w-md text-xs leading-5 text-white/38">
                        O sistema ainda não possui um registro interno de e-mail enviado para este aluno.
                      </p>
                    </div>
                  ) : (
                    <div className="relative space-y-3 before:absolute before:bottom-6 before:left-[21px] before:top-6 before:w-px before:bg-gradient-to-b before:from-orange-400/35 before:via-white/10 before:to-transparent">
                      {emailHistory.map((item) => (
                        <EmailHistoryCard key={item.id} item={item} />
                      ))}
                    </div>
                  )}

                  <div className="mt-5 rounded-2xl border border-blue-300/15 bg-blue-500/[0.055] px-5 py-4 text-xs leading-5 text-blue-100/65">
                    Este histórico reúne os registros internos disponíveis no sistema. Ele confirma tentativas e envios registrados, não a abertura da mensagem pelo destinatário.
                  </div>
                </div>

                <div className="flex justify-end border-t border-white/[0.08] bg-black/15 px-7 py-5 md:px-8">
                  <PremiumButton
                    variant="secondary"
                    className="!h-[50px] !rounded-[14px] !border-white/[0.12] !bg-white/[0.04] !text-slate-100 hover:!bg-white/[0.07]"
                    onClick={() => {
                      setResendEmailModal(false);
                      setResendEmailTab("emails");
                      setSelectedResendOption("");
                    }}
                  >
                    Fechar
                  </PremiumButton>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function ResendEmailCard({
  active,
  title,
  eyebrow,
  description,
  meta,
  icon,
  onClick,
}: {
  active: boolean;
  title: string;
  eyebrow: string;
  description: string;
  meta?: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "group relative isolate overflow-hidden rounded-[1.35rem] border border-orange-300/65 bg-[linear-gradient(145deg,rgba(255,138,0,0.18),rgba(255,255,255,0.055))] p-4 text-left shadow-[0_16px_35px_rgba(255,105,0,0.18),inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-orange-300/25 transition"
          : "group relative isolate overflow-hidden rounded-[1.35rem] border border-white/[0.08] bg-white/[0.035] p-4 text-left shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:border-white/[0.15] hover:bg-white/[0.055]"
      }
    >
      <span className={active ? "absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-orange-200/70 to-transparent" : "absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"} />
      <div className="flex gap-3">
        <span className={active ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-orange-200/50 bg-orange-400/20 text-orange-100" : "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.045] text-white/45 group-hover:text-orange-300"}>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-black uppercase tracking-[0.18em] text-white/32">{eyebrow}</span>
          <span className="mt-1 block truncate text-sm font-black text-white">{title}</span>
          <span className="mt-1 block text-xs leading-5 text-white/48">{description}</span>
          {meta && <span className="mt-3 inline-flex rounded-full border border-white/[0.08] bg-black/15 px-3 py-1 text-[11px] font-bold text-white/42">{meta}</span>}
        </span>
      </div>
    </button>
  );
}

function EmailHistoryCard({ item }: { item: StudentEmailHistoryItem }) {
  const failed = item.status === "failed";
  const categoryLabel = {
    welcome: "Boas-vindas",
    jornada: "Jornada",
    simulado: "Simulado",
    password: "Senha",
  }[item.category];

  return (
    <div className="relative flex gap-4 rounded-[1.35rem] border border-white/[0.08] bg-white/[0.035] p-4 shadow-lg shadow-black/10">
      <span className={`relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${
        failed
          ? "border-red-300/25 bg-red-500/[0.12] text-red-300"
          : "border-emerald-300/25 bg-emerald-500/[0.12] text-emerald-300"
      }`}>
        {failed ? <AlertTriangle size={18} /> : <Mail size={18} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/32">{categoryLabel}</p>
            <h4 className="mt-1 truncate text-sm font-black text-white">{item.title}</h4>
          </div>
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${
            failed
              ? "border-red-300/20 bg-red-500/[0.10] text-red-300"
              : "border-emerald-300/20 bg-emerald-500/[0.10] text-emerald-300"
          }`}>
            {failed ? "Falhou" : "Enviado"}
          </span>
        </div>
        <p className="mt-2 text-xs leading-5 text-white/48">{item.description}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-bold text-white/35">
          <span className="inline-flex items-center gap-1.5"><Clock3 size={12} /> {fmtDateTime(item.occurred_at)}</span>
          <span>{item.source}</span>
        </div>
      </div>
    </div>
  );
}

function DarkCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="group relative isolate overflow-hidden rounded-[24px] border border-blue-300/[0.18] bg-[linear-gradient(145deg,rgba(12,30,51,0.95),rgba(8,22,38,0.93))] shadow-[0_18px_48px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.035),0_0_34px_rgba(31,126,223,0.06)] backdrop-blur-xl transition duration-300 hover:border-white/[0.12]">
      <div className="pointer-events-none absolute -inset-[2px] -z-10 rounded-[24px] bg-gradient-to-br from-blue-400/[0.09] via-transparent to-orange-400/[0.055] blur-[20px]" />
      <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/45 to-transparent opacity-80" />
      <div className="flex items-start justify-between gap-4 border-b border-white/[0.065] bg-white/[0.012] px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-white">{title}</h2>
          {description && <p className="mt-1 text-xs text-white/40">{description}</p>}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
