"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Activity, AlertTriangle, CalendarClock, Clock3, PlayCircle, RotateCcw, Trophy, Users } from "lucide-react";
import { supabase } from "@/app/lib/supabase/client";
import PremiumButton from "@/app/components/ui/PremiumButton";
import PremiumModal from "@/app/components/ui/PremiumModal";
import { eventStatusLabel } from "@/lib/ui/eventStatus";

type Row = {
  id: string;
  representative_attempt_id: string | null;
  result_released_at: string | null;
  attempts: Array<{ id: string; status: string; counts_toward_limit: boolean }>;
  simulado_events: {
    id: string;
    name: string;
    starts_at: string;
    ends_at: string;
    simulado_id: string | null;
    effective_status: string;
    card_image_url: string;
    simulados?: { title?: string; max_attempts?: number | null } | null;
    simulado_event_professors: Array<{ professors: { name: string } | null }>;
  };
};

function formatCompactDateTime(iso: string) {
  const datePart = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" }).format(new Date(iso));
  const timePart = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(iso)).replace(":", "h");
  return `${datePart} · ${timePart}`;
}

function formatFullDateTime(iso: string) {
  const datePart = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" }).format(new Date(iso));
  const timePart = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(iso)).replace(":", "h");
  return `${datePart} · ${timePart} (Horário de Brasília)`;
}

function eventStatusDotClass(status: string) {
  if (status === "active") return "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.48)]";
  if (status === "scheduled") return "bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.48)]";
  return "bg-slate-400";
}

function eventStatusModifierClass(status: string) {
  if (status === "active") return "student-status-active";
  if (status === "scheduled") return "student-status-scheduled";
  return "student-status-expired";
}

// Prioridade dos cards em /meus-eventos: ACTIVE primeiro, depois SCHEDULED por
// starts_at mais próximo, depois os demais mantêm a ordem já existente
// (joined_at desc, decidida pela API). Eventos closed/archived nunca sobem.
function sortEventRows(rows: Row[]): Row[] {
  const rank = (status: string) => (status === "active" ? 0 : status === "scheduled" ? 1 : 2);
  return [...rows].sort((left, right) => {
    const leftStatus = left.simulado_events.effective_status;
    const rightStatus = right.simulado_events.effective_status;
    const rankDiff = rank(leftStatus) - rank(rightStatus);
    if (rankDiff !== 0) return rankDiff;
    if (leftStatus === "scheduled" && rightStatus === "scheduled") {
      return new Date(left.simulado_events.starts_at).getTime() - new Date(right.simulado_events.starts_at).getTime();
    }
    return 0;
  });
}

// Evento prioritário para o glow: o primeiro da ordenação acima que seja
// active ou scheduled (desempate estável, já resolvido por sortEventRows).
function priorityEventId(rows: Row[]): string | null {
  const candidate = rows.find((row) => ["active", "scheduled"].includes(row.simulado_events.effective_status));
  return candidate ? candidate.id : null;
}

export default function MeusEventosClient() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refazerTarget, setRefazerTarget] = useState<Row | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    const response = await fetch("/api/student/events", { headers: { Authorization: `Bearer ${data.session.access_token}` } });
    const json = await response.json();
    if (json.ok) setRows(sortEventRows(json.events || []));
    setLoading(false);
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void loadEvents(), 0);
    return () => window.clearTimeout(initial);
  }, [loadEvents]);

  function closeRefazerModal() {
    if (confirming) return;
    setRefazerTarget(null);
    setActionError(null);
  }

  async function confirmRefazer() {
    const target = refazerTarget;
    const simuladoId = target?.simulado_events.simulado_id;
    if (!target || !simuladoId || confirming) return;

    setConfirming(true);
    setActionError(null);
    try {
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) throw new Error("Sua sessão expirou. Faça login novamente.");
      const response = await fetch(`/api/student/simulados/${simuladoId}/attempts?event=${target.simulado_events.id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${auth.session.access_token}` },
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.message || "Não foi possível iniciar uma nova tentativa.");
      router.push(`/meus-simulados/${simuladoId}?event=${target.simulado_events.id}`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Erro inesperado ao iniciar nova tentativa.");
      setConfirming(false);
      void loadEvents();
    }
  }

  return (
    <main className="et-student-premium min-h-full bg-slate-50 px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl">
        <p className="et-student-section-eyebrow">Área do aluno</p>
        <h1 className="et-student-display mt-2">Meus Eventos</h1>

        {loading ? (
          <p className="mt-8 text-slate-500">Carregando...</p>
        ) : rows.length ? (
          <div className="mt-8 grid items-start gap-5 sm:grid-cols-2 2xl:grid-cols-3">
            {rows.map((row, index) => (
              <EventCard
                key={row.id}
                row={row}
                index={index}
                isPriority={row.id === priorityEventId(rows)}
                onOpenRefazer={() => setRefazerTarget(row)}
              />
            ))}
          </div>
        ) : (
          <p className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 text-slate-500">Você ainda não participa de nenhum Evento.</p>
        )}
      </div>

      <PremiumModal
        open={Boolean(refazerTarget)}
        theme="light"
        tone="warning"
        title="Refazer este Simulado?"
        message="Você ainda possui tentativas disponíveis e pode resolver este Simulado novamente."
        onClose={closeRefazerModal}
        dismissible={!confirming}
        actions={
          <>
            <PremiumButton variant="secondary" full onClick={closeRefazerModal} disabled={confirming}>Cancelar</PremiumButton>
            <PremiumButton full onClick={confirmRefazer} disabled={confirming}>{confirming ? "Iniciando..." : "Refazer simulado"}</PremiumButton>
          </>
        }
      >
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <p>Atenção: sua primeira tentativa é a tentativa oficial deste Evento. A nota obtida nela continuará sendo considerada como sua nota oficial, mesmo que você obtenha um resultado diferente nas próximas tentativas.</p>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Esta nova tentativa pode ser utilizada para revisar as questões e acompanhar sua evolução, mas não substituirá o resultado oficial já registrado.
        </p>
        {actionError && <p className="mt-3 text-sm font-semibold text-red-600">{actionError}</p>}
      </PremiumModal>
    </main>
  );
}

function EventCard({ row, index, isPriority, onOpenRefazer }: { row: Row; index: number; isPriority: boolean; onOpenRefazer: () => void }) {
  const event = row.simulado_events;
  const running = row.attempts.some((attempt) => attempt.status === "in_progress");
  const completed = row.attempts.some((attempt) => ["completed", "disqualified", "expired"].includes(attempt.status));
  const isClosed = event.effective_status === "closed" || event.effective_status === "archived";

  const situation = running
    ? "Em andamento"
    : completed
    ? (row.result_released_at ? "Resultado disponível" : "Resultado aguardando liberação")
    : isClosed
    ? "Não realizado"
    : "Não iniciado";

  const hasSimulado = Boolean(event.simulado_id);
  const maxAttempts = event.simulados?.max_attempts ?? null;
  const attemptsUsed = row.attempts.filter((attempt) => attempt.counts_toward_limit).length;
  const attemptsRemaining = maxAttempts === null ? null : Math.max(0, maxAttempts - attemptsUsed);
  const canStartNewAttempt = !running && hasSimulado && event.effective_status === "active" && (maxAttempts === null || (attemptsRemaining ?? 0) > 0);

  const showContinueButton = running;
  const showVerEventoButton = !running && event.effective_status === "scheduled";
  const showEntrarButton = canStartNewAttempt && attemptsUsed === 0;
  const showRefazerButton = canStartNewAttempt && attemptsUsed > 0;
  const showResultsButton = Boolean(row.result_released_at);

  const attemptsValue = !hasSimulado
    ? "—"
    : maxAttempts === null
      ? `Ilimitadas · ${attemptsUsed} realizada${attemptsUsed === 1 ? "" : "s"}`
      : `${attemptsUsed}/${maxAttempts} · ${attemptsRemaining} restante${attemptsRemaining === 1 ? "" : "s"}`;

  const professorNames = event.simulado_event_professors.map((item) => item.professors?.name).filter(Boolean) as string[];

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, delay: Math.min(index * 0.04, 0.2) }}
      className={`student-journey-card group relative w-full max-w-[440px] overflow-hidden rounded-[1.6rem] transition duration-300 hover:-translate-y-1 ${isPriority ? "student-journey-card--priority" : ""} ${isClosed ? "opacity-90" : ""}`}
    >
      <div className="relative aspect-[16/8.2] overflow-hidden bg-[#07111F]">
        <div
          className="absolute inset-0 bg-cover bg-center transition duration-700 group-hover:scale-[1.035]"
          style={{ backgroundImage: `url(${event.card_image_url})` }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,7,13,0.02)_0%,rgba(3,7,13,0.08)_55%,rgba(3,7,13,0.46)_100%)]" />
        <div className="absolute inset-0 ring-1 ring-inset ring-white/10" />

        <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/65 bg-white/92 px-3 py-1.5 text-[10.5px] font-black uppercase tracking-[0.16em] text-slate-800 shadow-[0_8px_24px_rgba(0,0,0,0.22)] backdrop-blur-md">
          <CalendarClock size={12} className="text-orange-500" />
          Evento de Simulado
        </div>
      </div>

      <div className="p-5">
        <h2 className="et-student-card-title min-w-0">{event.name}</h2>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <span className={`et-student-pill student-status-badge ${eventStatusModifierClass(event.effective_status)} inline-flex items-center gap-2 rounded-full px-3 py-1.5`}>
            <span className={`h-2 w-2 rounded-full ${eventStatusDotClass(event.effective_status)}`} />
            {eventStatusLabel(event.effective_status)}
          </span>
        </div>

        {professorNames.length > 0 && (
          <p className="mt-2.5 flex items-center gap-1.5 text-[12px] leading-5 text-slate-500">
            <Users size={12} className="shrink-0 text-orange-400" />
            <span className="truncate">{professorNames.length > 1 ? "Professores: " : "Professor: "}{professorNames.join(", ")}</span>
          </p>
        )}

        <div className="mt-3.5 grid grid-cols-2 gap-2.5">
          <EventMetricCard tone="orange" icon={<CalendarClock size={16} />} label="Início" value={formatCompactDateTime(event.starts_at)} title={formatFullDateTime(event.starts_at)} />
          <EventMetricCard tone="blue" icon={<Clock3 size={16} />} label="Término" value={formatCompactDateTime(event.ends_at)} title={formatFullDateTime(event.ends_at)} />
          <EventMetricCard tone="violet" icon={<Activity size={16} />} label="Sua situação" value={situation} />
          <EventMetricCard tone="emerald" icon={<RotateCcw size={16} />} label="Tentativas" value={attemptsValue} />
        </div>

        {(showContinueButton || showVerEventoButton || showEntrarButton || showResultsButton || showRefazerButton) && (
          <div className="mt-3.5 flex flex-wrap gap-2">
            {showContinueButton && (
              <a href={`/meus-eventos/${event.id}`} className="et-student-button student-button-primary inline-flex h-11 min-w-fit flex-1 items-center justify-center gap-2 rounded-[14px] px-4 transition duration-200 hover:-translate-y-0.5">
                <PlayCircle size={16} />
                Continuar simulado
              </a>
            )}
            {showVerEventoButton && (
              <a href={`/meus-eventos/${event.id}`} className="et-student-button student-button-secondary inline-flex h-11 min-w-fit flex-1 items-center justify-center gap-2 rounded-[14px] px-4 transition duration-200 hover:-translate-y-0.5">
                <CalendarClock size={16} />
                Ver evento
              </a>
            )}
            {showEntrarButton && (
              <a href={`/meus-eventos/${event.id}`} className="et-student-button student-button-primary inline-flex h-11 min-w-fit flex-1 items-center justify-center gap-2 rounded-[14px] px-4 transition duration-200 hover:-translate-y-0.5">
                <PlayCircle size={16} />
                Entrar no evento
              </a>
            )}
            {showResultsButton && (
              <a href={`/meus-eventos/${event.id}`} className="et-student-button student-button-secondary inline-flex h-11 min-w-fit flex-1 items-center justify-center gap-2 rounded-[14px] px-4 transition duration-200 hover:-translate-y-0.5">
                <Trophy size={16} />
                Ver resultados
              </a>
            )}
            {showRefazerButton && (
              <button
                type="button"
                onClick={onOpenRefazer}
                className={`et-student-button inline-flex h-11 min-w-fit flex-1 items-center justify-center gap-2 rounded-[14px] px-4 transition duration-200 hover:-translate-y-0.5 ${showResultsButton ? "student-button-secondary" : "student-button-primary"}`}
              >
                <RotateCcw size={16} />
                Refazer simulado
              </button>
            )}
          </div>
        )}
      </div>
    </motion.article>
  );
}

function EventMetricCard({
  icon,
  label,
  value,
  title,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  title?: string;
  tone: "orange" | "blue" | "violet" | "emerald";
}) {
  return (
    <div className={`student-metric-card student-metric-${tone} group/metric min-w-0 rounded-2xl px-3 py-2.5`}>
      <div className="flex items-center gap-2.5">
        <span className="student-metric-icon inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl">{icon}</span>
        <div className="min-w-0">
          <span className="et-student-label block">{label}</span>
          <p className="et-student-value mt-1 line-clamp-2" title={title || value}>
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}
