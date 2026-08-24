"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { AlertTriangle, CalendarClock, Clock3, LockKeyhole, PlayCircle, RotateCcw, ShieldCheck, Target, Trophy, Users } from "lucide-react";
import { supabase } from "@/app/lib/supabase/client";
import PremiumButton from "@/app/components/ui/PremiumButton";
import PremiumModal from "@/app/components/ui/PremiumModal";
import { eventStatusLabel } from "@/lib/ui/eventStatus";
import { FOCUS_VIOLATION_LIMIT } from "@/lib/simulado-focus-violation";

type Attempt = { id: string; status: string; counts_toward_limit: boolean };
type Payload = {
  participant: {
    representative_attempt_id: string | null;
    result_released_at: string | null;
    simulado_events: {
      id: string;
      name: string;
      starts_at: string;
      ends_at: string;
      simulado_id: string | null;
      result_policy: string;
      effective_status: string;
      simulados: {
        title: string;
        max_attempts: number | null;
        time_limit_minutes: number | null;
        anti_tab_switch_enabled?: boolean | null;
        anti_window_blur_enabled?: boolean | null;
      } | null;
      simulado_event_professors: Array<{ professors: { name: string } | null }>;
    };
  };
  attempts: Attempt[];
};

function countdown(target: string, now: number) {
  const seconds = Math.max(0, Math.ceil((new Date(target).getTime() - now) / 1_000));
  return `${Math.floor(seconds / 3600)}h ${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}min ${String(seconds % 60).padStart(2, "0")}s`;
}

function formatCompactDateTime(iso: string) {
  const datePart = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date(iso));
  const timePart = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(iso)).replace(":", "h");
  return `${datePart} · ${timePart}`;
}

function formatExamDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours <= 0) return `${remainder} min`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}min`;
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

export default function EventoAlunoClient({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [refazerOpen, setRefazerOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getSession();
    if (!auth.session) return;
    const response = await fetch(`/api/student/events/${id}`, { headers: { Authorization: `Bearer ${auth.session.access_token}` } });
    const json = await response.json();
    if (json.ok) setData(json); else setMessage(json.message);
  }, [id]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const refresh = window.setInterval(() => void load(), 10_000);
    const clock = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => { window.clearTimeout(initial); window.clearInterval(refresh); window.clearInterval(clock); };
  }, [load]);

  useEffect(() => {
    async function heartbeat() {
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) return;
      await fetch(`/api/student/events/${id}/heartbeat`, { method: "POST", headers: { Authorization: `Bearer ${auth.session.access_token}` } }).catch(() => undefined);
    }
    void heartbeat();
    const timer = window.setInterval(() => void heartbeat(), 30_000);
    return () => window.clearInterval(timer);
  }, [id]);

  function closeRefazerModal() {
    if (confirming) return;
    setRefazerOpen(false);
    setActionError(null);
  }

  async function confirmRefazer() {
    if (!data || confirming) return;
    const simuladoId = data.participant.simulado_events.simulado_id;
    if (!simuladoId) return;

    setConfirming(true);
    setActionError(null);
    try {
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) throw new Error("Sua sessão expirou. Faça login novamente.");
      const response = await fetch(`/api/student/simulados/${simuladoId}/attempts?event=${id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${auth.session.access_token}` },
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.message || "Não foi possível iniciar uma nova tentativa.");
      router.push(`/meus-simulados/${simuladoId}?event=${id}`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Erro inesperado ao iniciar nova tentativa.");
      setConfirming(false);
      void load();
    }
  }

  if (!data) return <main className="min-h-full bg-slate-50 p-8 text-slate-600">{message || "Carregando Evento..."}</main>;
  const event = data.participant.simulado_events;
  const running = data.attempts.find((attempt) => attempt.status === "in_progress");
  const used = data.attempts.filter((attempt) => attempt.counts_toward_limit).length;
  const maxAttempts = event.simulados?.max_attempts ?? null;
  const remaining = maxAttempts == null ? null : Math.max(0, maxAttempts - used);
  const professors = event.simulado_event_professors.map((item) => item.professors?.name).filter(Boolean) as string[];
  const simuladoUrl = event.simulado_id ? `/meus-simulados/${event.simulado_id}?event=${id}` : null;
  const canStartNewAttempt = Boolean(simuladoUrl) && event.effective_status === "active" && (remaining === null || remaining > 0);
  const isRefazer = used > 0 && !running;

  // Fonte real da configuração de foco: os dois toggles do Simulado (mesmos
  // usados pelo motor de execução em app/meus-simulados/[id]/page-client.tsx e
  // pela regra de negócio em app/api/student/simulados/[id]/attempts/route.ts
  // — nunca um valor fixo/assumido). Ausência/null é tratada como ligado
  // (`!== false`), mesma convenção usada em toda a Sprint de anti-cheat.
  const antiTabSwitchEnabled = event.simulados?.anti_tab_switch_enabled !== false;
  const antiWindowBlurEnabled = event.simulados?.anti_window_blur_enabled !== false;
  const isFocusMonitored = antiTabSwitchEnabled || antiWindowBlurEnabled;

  const attemptsValue = maxAttempts === null ? "Ilimitadas" : `${used} de ${maxAttempts}`;
  const attemptsSubtext = maxAttempts === null
    ? `${used} realizada${used === 1 ? "" : "s"}`
    : `${remaining} restante${remaining === 1 ? "" : "s"}`;
  const timeValue = event.simulados?.time_limit_minutes ? formatExamDuration(event.simulados.time_limit_minutes) : "Sem limite";
  const resultValue = event.result_policy === "blocked" ? "Após liberação" : "Disponível ao concluir";
  const resultSubtext = event.result_policy === "blocked" ? "Liberado pelo professor." : undefined;
  const focusValue = isFocusMonitored ? "Monitorado" : "Não monitorado";
  const focusSubtext = isFocusMonitored ? `Limite de ${FOCUS_VIOLATION_LIMIT} violações` : undefined;

  return (
    <main className="min-h-full bg-slate-50 px-4 py-8 md:px-8">
      <div className="mx-auto max-w-5xl">
        <section className="student-journey-card relative overflow-hidden rounded-[1.75rem] p-6 md:p-9">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-orange-600">
                <CalendarClock size={14} />
                Evento de Simulado
              </p>
              <h1 className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.03em] text-slate-950 md:text-[32px]">{event.name}</h1>
            </div>
            <span className={`student-status-badge ${eventStatusModifierClass(event.effective_status)} inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-[11px] font-black uppercase tracking-[0.08em]`}>
              <span className={`h-2 w-2 rounded-full ${eventStatusDotClass(event.effective_status)}`} />
              {eventStatusLabel(event.effective_status)}
            </span>
          </div>

          <div className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-1.5 text-sm">
            <p><span className="text-xs font-bold uppercase tracking-wide text-slate-400">Início </span><span className="font-semibold text-slate-700">{formatCompactDateTime(event.starts_at)}</span></p>
            <p><span className="text-xs font-bold uppercase tracking-wide text-slate-400">Término </span><span className="font-semibold text-slate-700">{formatCompactDateTime(event.ends_at)}</span></p>
          </div>
          <p className="mt-1 text-xs text-slate-400">Horário de Brasília</p>

          {professors.length > 0 && (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-slate-500">
              <Users size={14} className="shrink-0 text-orange-400" />
              <span>{professors.length > 1 ? "Professores: " : "Professor: "}{professors.join(", ")}</span>
            </p>
          )}

          {event.effective_status === "scheduled" && (
            <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-blue-800">
              <strong>Começa em {countdown(event.starts_at, now)}</strong>
              <p className="mt-1 text-sm">Esta tela atualiza automaticamente quando o professor iniciar o Evento.</p>
            </div>
          )}
          {!event.simulado_id && (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 font-semibold text-amber-800">
              O Simulado ainda não foi vinculado. O Evento permanece em preparação e não pode ser iniciado.
            </div>
          )}
          {event.effective_status === "closed" && !running && (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-slate-700">
              Evento encerrado. Não é possível iniciar uma nova tentativa.
            </div>
          )}
          {event.effective_status === "closed" && running && (
            <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-blue-800">
              <strong>Evento encerrado, tentativa preservada</strong>
              <p className="mt-1 text-sm">Você pode continuar a tentativa iniciada dentro da janela. Novas tentativas estão bloqueadas.</p>
            </div>
          )}

          {event.simulados && (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4">
              <InfoCard tone="orange" icon={<Target size={17} />} label="Tentativas" value={attemptsValue} subtext={attemptsSubtext} />
              <InfoCard tone="blue" icon={<Clock3 size={17} />} label="Tempo da prova" value={timeValue} />
              <InfoCard tone="violet" icon={<Trophy size={17} />} label="Resultado" value={resultValue} subtext={resultSubtext} />
              <InfoCard tone="emerald" icon={<ShieldCheck size={17} />} label="Controle de foco" value={focusValue} subtext={focusSubtext} />
            </div>
          )}

          {(Boolean(running) || (!running && canStartNewAttempt) || Boolean(data.participant.representative_attempt_id)) && (
            <div className="mt-6 flex flex-wrap gap-3">
              {simuladoUrl && Boolean(running) && (
                <a href={simuladoUrl} className="student-button-primary inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-6 text-sm font-bold transition duration-200 hover:-translate-y-0.5">
                  <PlayCircle size={18} />
                  Continuar Simulado
                </a>
              )}
              {!running && canStartNewAttempt && (
                isRefazer ? (
                  <button
                    type="button"
                    onClick={() => setRefazerOpen(true)}
                    className="student-button-primary inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-6 text-sm font-bold transition duration-200 hover:-translate-y-0.5"
                  >
                    <RotateCcw size={18} />
                    Refazer simulado
                  </button>
                ) : (
                  <a href={simuladoUrl!} className="student-button-primary inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-6 text-sm font-bold transition duration-200 hover:-translate-y-0.5">
                    <PlayCircle size={18} />
                    Iniciar Simulado
                  </a>
                )
              )}
              {data.participant.representative_attempt_id && data.participant.result_released_at && (
                <a href={`/meus-simulados/${event.simulado_id}/resultado?attemptId=${data.participant.representative_attempt_id}`} className="student-button-secondary inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-6 text-sm font-semibold transition duration-200 hover:-translate-y-0.5">
                  <Trophy size={18} />
                  Ver meus resultados
                </a>
              )}
            </div>
          )}

          {data.participant.representative_attempt_id && !data.participant.result_released_at && !running && (
            <div className="mt-5 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
              <LockKeyhole size={17} />
              Respostas registradas. Resultado aguardando liberação.
            </div>
          )}
        </section>
      </div>

      <PremiumModal
        open={refazerOpen}
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

function InfoCard({
  icon,
  label,
  value,
  subtext,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  subtext?: string;
  tone: "orange" | "blue" | "violet" | "emerald";
}) {
  return (
    <div className={`student-metric-card student-metric-${tone} min-w-0 rounded-2xl px-4 py-3.5`}>
      <div className="flex items-start gap-3">
        <span className="student-metric-icon mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">{icon}</span>
        <div className="min-w-0">
          <span className="block truncate text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</span>
          <p className="mt-1 text-[15px] font-bold leading-tight text-slate-900">{value}</p>
          {subtext && <p className="mt-0.5 line-clamp-2 text-[11px] font-medium leading-snug text-slate-500">{subtext}</p>}
        </div>
      </div>
    </div>
  );
}
