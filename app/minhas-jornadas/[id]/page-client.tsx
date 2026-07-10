"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleCheckBig,
  ClipboardCheck,
  Clock3,
  FileText,
  Gauge,
  HelpCircle,
  Layers,
  LockKeyhole,
  Medal,
  Play,
  RefreshCw,
  RotateCcw,
  Route,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/app/lib/supabase/client";
import PremiumModal from "../../components/ui/PremiumModal";

const SIMULADO_THUMBNAIL = "/images/mini_simulados/simulado-coruja-estudando.png";
const SIMULADO_THUMBNAIL_FALLBACK = "/images/mini_simulados/simulado-mini1.png";

const HIGHLIGHT_LABELS: Record<string, string> = {
  simulados_ineditos: "Simulados inéditos",
  correcao_comentada: "Correção comentada",
  relatorios_desempenho: "Relatórios de desempenho",
  comparacao_tentativas: "Comparação entre tentativas",
  cronograma_progressivo: "Cronograma progressivo",
  estatisticas_assunto: "Estatísticas por assunto",
};

type SimuladoStatus = "locked" | "locked_late" | "available" | "in_progress" | "completed" | "expired";

type Jornada = {
  id: string;
  title: string;
  description: string | null;
  exam_name: string | null;
  exam_position: string | null;
  exam_board: string | null;
  welcome_title: string | null;
  welcome_message: string | null;
  study_strategy: string | null;
  important_guidelines: string | null;
  journey_highlights: string[];
  started_at: string;
  duration_months: number;
  duration_days: number | null;
  exam_date: string | null;
  effective_end_date: string | null;
  expires_at: string;
  status: "active" | "expired" | "cancelled";
  total_simulados: number;
  completed_simulados: number;
  available_simulados: number;
  progress_percent: number;
  late_simulado: Simulado | null;
};

type Simulado = {
  id: string;
  simulado_id: string;
  order_number: number;
  title: string;
  discipline: string;
  time_label: string;
  scheduled_release_at: string;
  released_at: string | null;
  completed_at: string | null;
  status: SimuladoStatus;
  thumbnail_url: string;
  score_percent: number | null;
  correct_count: number | null;
  total_questions: number | null;
  progress_percent: number | null;
  max_attempts: number | null;
  owl_help_enabled: boolean;
  attempts_used: number;
  attempts_completed: number;
  attempts_incomplete: number;
  attempts_remaining: number | null;
  attempts_exhausted: boolean;
  real_score_percent: number | null;
  best_score_percent: number | null;
  average_time_seconds: number | null;
  result_url: string | null;
  simulado_url: string;
};

function formatDate(date?: string | null) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${date}T00:00:00`));
}


function formatDurationSeconds(seconds?: number | null) {
  if (!seconds || seconds <= 0) return "—";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}min` : `${hours}h`;
}

function getDurationDays(jornada: Jornada) {
  return jornada.duration_days && jornada.duration_days > 0
    ? jornada.duration_days
    : Math.max(1, Math.round((jornada.duration_months || 0) * 30));
}

function durationLabel(jornada: Jornada) {
  const days = getDurationDays(jornada);
  return days === 1 ? "1 dia" : `${days} dias`;
}

function releasedCount(simulados: Simulado[]) {
  return simulados.filter((item) =>
    Boolean(item.released_at) || item.status === "available" || item.status === "in_progress" || item.status === "completed",
  ).length;
}

function buildJourneyIntro(jornada: Jornada) {
  const exam = jornada.exam_name || jornada.title;
  const days = getDurationDays(jornada);
  const total = jornada.total_simulados || 0;
  const plural = total === 1 ? "simulado" : "simulados";

  const opening = `Esta Jornada foi criada para auxiliar sua preparação para o concurso ${exam}. Ao longo desta trilha você terá acesso a ${total} ${plural}, liberados progressivamente durante ${days} ${days === 1 ? "dia" : "dias"}, permitindo acompanhar sua evolução de forma estruturada e contínua.`;
  const objective = "O objetivo é testar gradativamente seu nível de conhecimento, identificar pontos de melhoria e ajudar você a corrigir o que ainda estiver sendo feito errado antes da prova.";
  const examNote = jornada.exam_date
    ? `A prova está prevista para ${formatDate(jornada.exam_date)}, e esta jornada foi organizada para acompanhar sua evolução até essa data.`
    : "Esta jornada está sendo disponibilizada antes da publicação do edital justamente para que você tenha muito mais tempo para estudar, construir base e chegar mais forte quando a banca for definida.";

  return [opening, objective, examNote];
}

function attemptsLabel(used: number, max: number | null) {
  return max === null ? `${used} realizadas` : `${used}/${max}`;
}

function pluralizeAttempt(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural;
}

function attemptsBreakdownLabel(simulado: Simulado) {
  return `${simulado.attempts_completed} ${pluralizeAttempt(simulado.attempts_completed, "concluída", "concluídas")} · ${simulado.attempts_incomplete} ${pluralizeAttempt(simulado.attempts_incomplete, "incompleta", "incompletas")}`;
}

function statusText(status: SimuladoStatus) {
  const map: Record<SimuladoStatus, string> = {
    completed: "Concluído",
    available: "Disponível",
    in_progress: "Em andamento",
    locked: "Bloqueado",
    locked_late: "Atrasado",
    expired: "Expirado",
  };
  return map[status];
}

function badgeClass(status: SimuladoStatus) {
  if (status === "completed") return "student-detail-badge student-detail-badge-completed";
  if (status === "available" || status === "in_progress") return "student-detail-badge student-detail-badge-available";
  if (status === "locked_late") return "student-detail-badge student-detail-badge-late";
  if (status === "expired") return "student-detail-badge student-detail-badge-expired";
  return "student-detail-badge student-detail-badge-locked";
}

function nodeClass(status: SimuladoStatus) {
  if (status === "completed") return "student-detail-node student-detail-node-completed";
  if (status === "available" || status === "in_progress") return "student-detail-node student-detail-node-active";
  if (status === "locked_late") return "student-detail-node student-detail-node-late";
  return "student-detail-node student-detail-node-locked";
}

function actionPanelClass(status: SimuladoStatus) {
  if (status === "completed") return "student-detail-card-action-success";
  if (status === "available" || status === "in_progress") return "student-detail-card-action-available";
  return "";
}

function connectorClass(current: SimuladoStatus, next?: SimuladoStatus) {
  if (!next || next === "locked" || next === "locked_late" || next === "expired") {
    return "student-detail-connector student-detail-connector-locked";
  }
  if (current === "completed" && next === "completed") return "student-detail-connector student-detail-connector-completed";
  if (current === "completed") return "student-detail-connector student-detail-connector-completed-to-active";
  if (current === "available" || current === "in_progress") return "student-detail-connector student-detail-connector-active";
  return "student-detail-connector student-detail-connector-locked";
}

export default function JornadaAlunoClient({ id }: { id: string }) {
  const router = useRouter();
  const [jornada, setJornada] = useState<Jornada | null>(null);
  const [simulados, setSimulados] = useState<Simulado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLateModal, setShowLateModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"dados" | "simulados" | "resultados" | "info">("simulados");
  const [attemptsHelpSimulado, setAttemptsHelpSimulado] = useState<Simulado | null>(null);
  const [realResultHelpSimulado, setRealResultHelpSimulado] = useState<Simulado | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.replace("/login");
      return;
    }

    const res = await fetch(`/api/student/jornadas/${id}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      setError(json.message || "Erro ao carregar jornada.");
      setLoading(false);
      return;
    }
    setJornada(json.jornada);
    setSimulados(json.simulados || []);
    setShowLateModal(Boolean(json.jornada?.late_simulado));
    setLoading(false);
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <main className="student-light-canvas min-h-screen px-4 py-10 sm:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-center rounded-[2rem] border border-slate-200/80 bg-white/90 p-16 text-slate-500 shadow-xl shadow-slate-900/5">
          <Sparkles className="mr-3 animate-pulse text-orange-500" size={22} /> Carregando sua Jornada...
        </div>
      </main>
    );
  }

  if (error || !jornada) {
    return (
      <main className="student-light-canvas min-h-screen px-4 py-10 sm:px-8">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-red-200 bg-red-50 p-8 text-red-700 shadow-xl shadow-red-900/5">
          {error || "Jornada não encontrada."}
        </div>
      </main>
    );
  }

  return (
    <main className="student-journey-detail-page student-light-canvas relative min-h-screen overflow-hidden px-4 py-8 text-slate-950 sm:px-8 lg:px-10">
      <div className="student-journey-detail-ambient" aria-hidden="true" />

      <div className="relative mx-auto max-w-[1320px]">
        <div className="student-detail-context mb-11 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-500">
            <Link href="/minhas-jornadas" className="transition hover:text-orange-600">
              Minhas Jornadas
            </Link>
            <ChevronRight size={14} className="text-slate-300" />
            <span className="font-semibold text-slate-900">{jornada.title}</span>
          </div>
          <div className="student-detail-running-badge">
            <Route size={15} /> Jornada em andamento
          </div>
        </div>

        <header className="mb-10 student-detail-hero">
          <div className="max-w-4xl">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[36px] font-bold leading-[1.1] tracking-[-0.03em] text-slate-950 md:text-[38px]">{jornada.title}</h1>
              <span className={`inline-flex h-[26px] items-center rounded-md px-3 text-xs font-extrabold ${jornada.status === "expired" ? "student-status-badge student-status-expired" : jornada.status === "cancelled" ? "student-status-badge student-status-cancelled" : "student-status-badge student-status-active"}`}>
                {jornada.status === "expired" ? "Expirada" : jornada.status === "cancelled" ? "Cancelada" : "Ativa"}
              </span>
            </div>
            {jornada.description && <p className="mt-6 max-w-[680px] text-base font-normal leading-[1.75] text-slate-600">{jornada.description}</p>}
          </div>
        </header>

        <div className="student-detail-summary-row mb-7 grid items-center gap-7 xl:grid-cols-[minmax(0,1fr)_410px]">
          <section className="student-detail-metrics">
            <Metric tone="orange" icon={<CalendarDays size={19} strokeWidth={2.2} />} label="Duração" value={durationLabel(jornada)} />
            <Metric tone="blue" icon={<CalendarCheck2 size={19} strokeWidth={2.2} />} label="Data da prova" value={formatDate(jornada.exam_date)} />
            <Metric tone="violet" icon={<CalendarCheck2 size={19} strokeWidth={2.2} />} label="Acesso até" value={formatDate(jornada.expires_at)} />
            <Metric tone="amber" icon={<FileText size={19} strokeWidth={2.2} />} label="Simulados" value={String(jornada.total_simulados)} />
            <Metric tone="emerald" icon={<CircleCheckBig size={19} strokeWidth={2.2} />} label="Concluídos" value={`${jornada.completed_simulados}/${jornada.total_simulados}`} />
          </section>

          <div className="student-detail-progress-premium">
            <div className="student-detail-progress-top">
              <div
                className="student-detail-progress-ring"
                style={{ "--progress-pct": jornada.progress_percent } as React.CSSProperties}
              >
                <div className="student-detail-progress-ring-glow" />
                <div className="student-detail-progress-ring-inner">
                  <span className="student-detail-progress-ring-value">{jornada.progress_percent}%</span>
                </div>
              </div>
              <div className="student-detail-progress-text">
                <p className="student-detail-progress-label">Progresso geral</p>
                <p className="student-detail-progress-sub">Você concluiu</p>
                <p className="student-detail-progress-highlight">{jornada.completed_simulados} de {jornada.total_simulados} simulados</p>
              </div>
            </div>
            <div className="student-detail-progress-track">
              <div className="student-detail-progress-fill" style={{ width: `${jornada.progress_percent}%` }} />
            </div>
          </div>
        </div>


        <nav className="student-detail-tabs mb-14" aria-label="Seções da Jornada">
          <div className="student-detail-tabs-header">
            <span className="student-detail-tabs-kicker">Trilha da Jornada</span>
            <span className="student-detail-tabs-current">
              {activeTab === "dados" ? "Etapa 01 · Sobre" : activeTab === "simulados" ? "Etapa 02 · Simulados" : activeTab === "resultados" ? "Etapa 03 · Resultados" : "Etapa 04 · Informações"}
            </span>
          </div>
          <div className="student-detail-tabs-scroll">
            <motion.button type="button" whileTap={{ scale: 0.985 }} onClick={() => setActiveTab("dados")} className={activeTab === "dados" ? "student-detail-tab student-detail-tab-active" : "student-detail-tab"}>
              <span className="student-detail-tab-icon"><Route size={18} /></span>
              <span className="student-detail-tab-copy"><small>Etapa 01</small><strong>Sobre</strong></span>
            </motion.button>
            <motion.button type="button" whileTap={{ scale: 0.985 }} onClick={() => setActiveTab("simulados")} className={activeTab === "simulados" ? "student-detail-tab student-detail-tab-active" : "student-detail-tab"}>
              <span className="student-detail-tab-icon"><Layers size={18} /></span>
              <span className="student-detail-tab-copy"><small>Etapa 02</small><strong>Simulados</strong></span>
            </motion.button>
            <motion.button type="button" whileTap={{ scale: 0.985 }} onClick={() => setActiveTab("resultados")} className={activeTab === "resultados" ? "student-detail-tab student-detail-tab-active" : "student-detail-tab"}>
              <span className="student-detail-tab-icon"><BarChart3 size={18} /></span>
              <span className="student-detail-tab-copy"><small>Etapa 03</small><strong>Resultados</strong></span>
            </motion.button>
            <motion.button type="button" whileTap={{ scale: 0.985 }} onClick={() => setActiveTab("info")} className={activeTab === "info" ? "student-detail-tab student-detail-tab-active" : "student-detail-tab"}>
              <span className="student-detail-tab-icon"><FileText size={18} /></span>
              <span className="student-detail-tab-copy"><small>Etapa 04</small><strong>Informações</strong></span>
            </motion.button>
          </div>
        </nav>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 14, scale: 0.992 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.996 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {activeTab === "dados" && <DadosJornadaPanel jornada={jornada} simulados={simulados} />}

            {activeTab === "simulados" && (
              <>
        <div className="mb-5">
          <div className="mb-2 inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-orange-600">
            <Sparkles size={14} /> Sua trilha de evolução
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Simulados da Jornada</h2>
          <p className="mt-1 text-sm text-slate-600">Acompanhe a ordem e o status de liberação dos simulados desta Jornada.</p>
        </div>

        <section className="space-y-4">
          {simulados.map((simulado, index) => (
            <motion.div
              key={simulado.id}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              className="grid grid-cols-[52px_1fr] gap-4 md:grid-cols-[64px_1fr]"
            >
              <div className="relative flex justify-center">
                <div className={nodeClass(simulado.status)}>{simulado.order_number}</div>
                {index < simulados.length - 1 && <div className={connectorClass(simulado.status, simulados[index + 1]?.status)} />}
              </div>


              <article className={`student-detail-simulado-card group relative overflow-hidden transition hover:-translate-y-0.5 ${simulado.status === "available" || simulado.status === "in_progress" ? "student-detail-simulado-card-active" : ""} ${simulado.status === "locked" || simulado.status === "locked_late" || simulado.status === "expired" ? "student-detail-simulado-card-muted" : ""}`}>
                <div className="grid md:grid-cols-[190px_minmax(0,1fr)_280px]">
                  <div className="student-detail-thumbnail group/thumb relative h-44 overflow-hidden bg-[#07101d] md:h-full">
                    <img
                      src={SIMULADO_THUMBNAIL}
                      alt={`Miniatura do ${simulado.title}`}
                      onError={(event) => {
                        if (event.currentTarget.src.includes(SIMULADO_THUMBNAIL_FALLBACK)) {
                          event.currentTarget.style.display = "none";
                          return;
                        }
                        event.currentTarget.src = SIMULADO_THUMBNAIL_FALLBACK;
                      }}
                      className={`h-full w-full object-cover transition duration-500 group-hover/thumb:scale-[1.035] ${
                        simulado.status === "locked" || simulado.status === "locked_late" || simulado.status === "expired"
                          ? "grayscale saturate-0 brightness-[0.42] contrast-[1.18] opacity-90"
                          : "opacity-96"
                      }`}
                    />
                    <div className={`absolute inset-0 ${
                      simulado.status === "locked" || simulado.status === "locked_late" || simulado.status === "expired"
                        ? "bg-[linear-gradient(90deg,rgba(0,0,0,0.88),rgba(8,15,25,0.48),rgba(0,0,0,0.78))]"
                        : "bg-[linear-gradient(90deg,rgba(0,0,0,0.78),rgba(0,0,0,0.22),rgba(0,0,0,0.56))]"
                    }`} />
                    <div className={`absolute inset-0 ${
                      simulado.status === "locked" || simulado.status === "locked_late" || simulado.status === "expired"
                        ? "bg-[radial-gradient(circle_at_28%_18%,rgba(148,163,184,0.10),transparent_38%)]"
                        : "bg-[radial-gradient(circle_at_28%_18%,rgba(255,138,0,0.30),transparent_38%)]"
                    }`} />
                    <div className="absolute inset-x-0 top-0 p-4">
                      <p className="text-xs font-black uppercase tracking-[0.22em] text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.90)]">
                        Simulado
                      </p>
                      <p className={`mt-1 text-4xl font-black leading-none ${
                        simulado.status === "locked" || simulado.status === "locked_late" || simulado.status === "expired"
                          ? "text-slate-300 drop-shadow-[0_0_14px_rgba(148,163,184,0.22)]"
                          : "text-orange-500 drop-shadow-[0_0_18px_rgba(255,138,0,0.68)]"
                      }`}>
                        {String(simulado.order_number).padStart(2, "0")}
                      </p>
                    </div>
                    <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-r from-transparent to-white/10 md:to-white/70" />
                  </div>

                  <div className="student-detail-card-body p-5 md:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className={badgeClass(simulado.status)}>{statusText(simulado.status)}</span>
                        <h3 className="mt-2.5 text-lg font-semibold tracking-tight text-slate-950 md:text-xl">{simulado.title}</h3>
                      </div>
                    </div>

                    <div className="student-detail-facts mt-3">
                      <Fact icon={<FileText size={14} />} label={simulado.total_questions ? `${simulado.total_questions} questões` : "Questões"} tone="orange" />
                      <Fact icon={<Clock3 size={14} />} label={simulado.time_label} tone="blue" />
                      <button
                        type="button"
                        onClick={() => setAttemptsHelpSimulado(simulado)}
                        className="student-detail-fact student-detail-fact-violet transition hover:-translate-y-0.5"
                        aria-label="Entender contagem de tentativas"
                      >
                        <span className="student-detail-fact-icon"><RotateCcw size={14} /></span>
                        {attemptsLabel(simulado.attempts_used, simulado.max_attempts)}
                        <HelpCircle size={13} />
                      </button>
                      <Fact icon={<HelpCircle size={14} />} label={simulado.owl_help_enabled ? "Ajuda ativa" : "Sem ajuda"} tone={simulado.owl_help_enabled ? "emerald" : "slate"} />
                    </div>

                    {simulado.attempts_used > 0 && (
                      <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-violet-100 bg-violet-50/45 px-4 py-3 text-xs font-bold text-slate-600">
                        <span>{attemptsBreakdownLabel(simulado)}</span>
                        <button
                          type="button"
                          onClick={() => setAttemptsHelpSimulado(simulado)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-violet-200 bg-white text-violet-600 transition hover:bg-violet-50"
                          aria-label="Entender tentativas completas e incompletas"
                        >
                          <HelpCircle size={14} />
                        </button>
                      </div>
                    )}

                    {simulado.attempts_used > 0 ? (
                      <div className="student-detail-performance mt-3">
                        <div className="student-detail-performance-item">
                          <Medal size={15} />
                          <span className="inline-flex items-center gap-1">
                            Resultado real
                            <button
                              type="button"
                              onClick={() => setRealResultHelpSimulado(simulado)}
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-emerald-200 bg-white text-emerald-600 transition hover:bg-emerald-50"
                              aria-label="Entender resultado real"
                            >
                              <HelpCircle size={12} />
                            </button>
                          </span>
                          <strong>{simulado.real_score_percent === null ? "—" : `${Math.round(simulado.real_score_percent)}%`}</strong>
                        </div>
                        <div className="student-detail-performance-item">
                          <TrendingUp size={15} />
                          <span>Tempo médio</span>
                          <strong>{formatDurationSeconds(simulado.average_time_seconds)}</strong>
                        </div>
                      </div>
                    ) : simulado.status === "available" || simulado.status === "in_progress" ? (
                      <div className="student-detail-first-attempt mt-3">
                        <Sparkles size={14} /> Faça sua primeira tentativa para liberar seu histórico de desempenho.
                      </div>
                    ) : null}

                    <p className="mt-3 text-xs font-medium text-slate-500">
                      {simulado.status === "locked" || simulado.status === "locked_late"
                        ? `Liberação programada para ${formatDate(simulado.scheduled_release_at)}`
                        : `Liberado em ${formatDate(simulado.released_at?.slice(0, 10) || simulado.scheduled_release_at)}`}
                    </p>
                  </div>

                  <div className={`student-detail-card-action flex items-center justify-start p-5 md:justify-center md:p-5 ${actionPanelClass(simulado.status)}`}>
                    <CardAction simulado={simulado} />
                  </div>
                </div>
              </article>
            </motion.div>
          ))}
        </section>

        <div className="student-detail-info mt-8 flex items-start gap-3 p-5 text-sm text-slate-600">
          <div className="student-detail-info-icon"><ShieldCheck size={18} /></div>
          <div>
            <p className="font-bold text-slate-900">Progressão inteligente</p>
            <p className="mt-1">A liberação dos simulados segue a ordem definida e as regras de progressão da Jornada.</p>
          </div>
        </div>
              </>
            )}

            {activeTab === "resultados" && <PlaceholderPanel icon={<BarChart3 size={24} />} title="Resultados" text="Os resultados consolidados desta Jornada aparecerão aqui conforme você concluir os simulados." />}
            {activeTab === "info" && <PlaceholderPanel icon={<FileText size={24} />} title="Informações Gerais" text="Em breve, esta área reunirá avisos, histórico e atualizações gerais da Jornada." />}
          </motion.div>
        </AnimatePresence>
      </div>

      {attemptsHelpSimulado && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg overflow-hidden rounded-[1.5rem] border border-orange-100 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.28)]">
            <div className="border-b border-slate-100 bg-gradient-to-r from-orange-50 to-amber-50 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-orange-600">Tentativas do simulado</p>
                  <h2 className="mt-2 text-xl font-black text-slate-950">Como a contagem funciona?</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setAttemptsHelpSimulado(null)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
                  aria-label="Fechar"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="px-6 py-5 text-sm leading-6 text-slate-600">
              <p>
                Este simulado foi configurado com limite de <strong className="font-black text-slate-950">{attemptsHelpSimulado.max_attempts === null ? "tentativas ilimitadas" : `${attemptsHelpSimulado.max_attempts} tentativa(s)`}</strong>.
              </p>
              <p className="mt-3">
                Cada vez que você inicia o simulado, uma tentativa é registrada. Mesmo que ela não seja concluída, seja abandonada, expire pelo tempo ou seja interrompida, ela <strong className="font-black text-slate-950">é contabilizada</strong> dentro do limite de tentativas.
              </p>
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs font-bold text-slate-700">
                <p>Tentativas usadas: <strong>{attemptsHelpSimulado.attempts_used}/{attemptsHelpSimulado.max_attempts === null ? "∞" : attemptsHelpSimulado.max_attempts}</strong></p>
                <p className="mt-1">Concluídas: <strong>{attemptsHelpSimulado.attempts_completed}</strong></p>
                <p className="mt-1">Incompletas: <strong>{attemptsHelpSimulado.attempts_incomplete}</strong></p>
              </div>
              <p className="mt-4">
                Tentativas concluídas geram resultado e podem ser revisadas. Tentativas incompletas não geram resultado, mas continuam contando como tentativa utilizada.
              </p>
            </div>
            <div className="flex justify-end border-t border-slate-100 px-6 py-4">
              <button
                type="button"
                onClick={() => setAttemptsHelpSimulado(null)}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-5 text-sm font-black text-slate-950 shadow-lg shadow-orange-500/20 transition hover:-translate-y-0.5"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}

      {realResultHelpSimulado && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg overflow-hidden rounded-[1.5rem] border border-emerald-100 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.28)]">
            <div className="border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-orange-50 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-600">Resultado real</p>
                  <h2 className="mt-2 text-xl font-black text-slate-950">Por que usamos a primeira tentativa completa?</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setRealResultHelpSimulado(null)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
                  aria-label="Fechar"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="px-6 py-5 text-sm leading-6 text-slate-600">
              <p>
                Este simulado foi configurado com limite de <strong className="font-black text-slate-950">{realResultHelpSimulado.max_attempts === null ? "tentativas ilimitadas" : `${realResultHelpSimulado.max_attempts} tentativa(s)`}</strong>. Cada tentativa concluída gera um resultado.
              </p>
              <p className="mt-3">
                O resultado mais realista é o da <strong className="font-black text-slate-950">primeira tentativa completa</strong>, porque ela representa uma resolução inédita, sem repetição prévia das mesmas questões.
              </p>
              <p className="mt-3">
                Por isso, é esse resultado que fica registrado como resultado real e é ele que aparece quando você abre a página de resultado do simulado.
              </p>
            </div>
            <div className="flex justify-end border-t border-slate-100 px-6 py-4">
              <button
                type="button"
                onClick={() => setRealResultHelpSimulado(null)}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-5 text-sm font-black text-slate-950 shadow-lg shadow-orange-500/20 transition hover:-translate-y-0.5"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}

      <PremiumModal
        open={showLateModal && Boolean(jornada.late_simulado)}
        theme="light"
        tone="warning"
        title="Simulado aguardando progressão"
        message={
          jornada.late_simulado
            ? `A data de liberação de ${jornada.late_simulado.title} já chegou, mas ele ainda depende da conclusão do simulado anterior.`
            : undefined
        }
        onClose={() => setShowLateModal(false)}
      />
    </main>
  );
}

function DadosJornadaPanel({ jornada, simulados }: { jornada: Jornada; simulados: Simulado[] }) {
  const highlights = jornada.journey_highlights?.length
    ? jornada.journey_highlights
    : ["simulados_ineditos", "correcao_comentada", "relatorios_desempenho", "estatisticas_assunto", "cronograma_progressivo", "comparacao_tentativas"];
  const nextLocked = simulados.find((item) => item.status === "locked" || item.status === "locked_late");
  const released = releasedCount(simulados);
  const intro = buildJourneyIntro(jornada);

  const highlightVisuals: Record<string, { icon: ReactNode; tone: string; description: string }> = {
    simulados_ineditos: { icon: <Sparkles size={18} />, tone: "orange", description: "Questões exclusivas e alinhadas ao edital" },
    correcao_comentada: { icon: <FileText size={18} />, tone: "blue", description: "Explicações detalhadas questão por questão" },
    relatorios_desempenho: { icon: <BarChart3 size={18} />, tone: "violet", description: "Acompanhe sua evolução com clareza" },
    estatisticas_assunto: { icon: <TrendingUp size={18} />, tone: "emerald", description: "Descubra seus pontos fortes e pontos a melhorar" },
    cronograma_progressivo: { icon: <CalendarCheck2 size={18} />, tone: "amber", description: "Liberações planejadas para maximizar seu aprendizado" },
    comparacao_tentativas: { icon: <RotateCcw size={18} />, tone: "blue", description: "Veja sua evolução entre diferentes tentativas" },
  };

  return (
    <section className="student-data-page space-y-5">
      <div className="student-data-overview-grid">
        <article className="student-data-hero">
          <div className="student-data-hero-glow student-data-hero-glow-orange" aria-hidden="true" />
          <div className="student-data-hero-glow student-data-hero-glow-blue" aria-hidden="true" />
          <div className="student-data-hero-illustration" aria-hidden="true">
            <span className="student-data-hero-illustration-orbit" />
            <ClipboardCheck size={112} strokeWidth={1.3} />
            <CheckCircle2 className="student-data-hero-illustration-check" size={34} />
          </div>
          <div className="student-data-hero-content">
            <div className="student-data-eyebrow">
              <Sparkles size={14} /> Dados da Jornada
            </div>
            <h2 className="student-data-title">
              <span className="student-data-title-emoji" aria-hidden="true">👋</span>
              {jornada.welcome_title || "Bem-vindo(a) à sua Jornada de Simulados"}
            </h2>
            <div className="student-data-copy">
              {intro.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>

            {jornada.welcome_message && (
              <div className="student-data-message">
                <div className="student-data-message-icon"><Trophy size={18} /></div>
                <div>
                  <strong>Mensagem da Jornada</strong>
                  <p className="whitespace-pre-line">{jornada.welcome_message}</p>
                </div>
              </div>
            )}

            <div className="student-data-highlights">
              {highlights.map((item) => {
                const visual = highlightVisuals[item] || { icon: <CheckCircle2 size={18} />, tone: "orange", description: "Recurso disponível nesta Jornada" };
                return (
                  <div key={item} className={`student-data-highlight student-data-highlight-${visual.tone}`}>
                    <div className="student-data-highlight-icon">{visual.icon}</div>
                    <div>
                      <strong>{HIGHLIGHT_LABELS[item] || item}</strong>
                      <span>{visual.description}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </article>

        <aside className="student-data-summary">
          <div className="student-data-summary-header">
            <div className="student-data-summary-icon"><Gauge size={20} /></div>
            <div>
              <span>Visão rápida</span>
              <h3>Resumo objetivo</h3>
            </div>
          </div>
          <div className="student-data-summary-list">
            <DataSummaryRow icon={<Medal size={16} />} label="Concurso" value={jornada.exam_name || jornada.title} tone="blue" />
            {jornada.exam_position && <DataSummaryRow icon={<Trophy size={16} />} label="Cargo" value={jornada.exam_position} tone="violet" />}
            {jornada.exam_board && <DataSummaryRow icon={<Target size={16} />} label="Banca" value={jornada.exam_board} tone="amber" />}
            {jornada.exam_date && <DataSummaryRow icon={<CalendarCheck2 size={16} />} label="Data da prova" value={formatDate(jornada.exam_date)} tone="orange" />}
            <DataSummaryRow icon={<CalendarDays size={16} />} label="Entrada na Jornada" value={formatDate(jornada.started_at)} tone="blue" />
            <DataSummaryRow icon={<CalendarDays size={16} />} label="Expiração da Jornada" value={formatDate(jornada.expires_at)} tone="slate" />
            <DataSummaryRow icon={<Layers size={16} />} label="Simulados liberados" value={`${released} de ${jornada.total_simulados}`} tone="emerald" strong />
            {nextLocked && <DataSummaryRow icon={<Clock3 size={16} />} label="Próxima liberação" value={formatDate(nextLocked.scheduled_release_at)} tone="orange" strong />}
          </div>
        </aside>
      </div>

      <div className="student-data-guidance-grid">
        <article className="student-data-guidance student-data-guidance-orange">
          <div className="student-data-guidance-heading">
            <div className="student-data-guidance-icon"><Target size={19} /></div>
            <div><span>Entenda a dinâmica</span><h3>Como funciona</h3></div>
          </div>
          <ul>
            <DataBullet>Esta Jornada possui <strong>{jornada.total_simulados}</strong> simulados planejados.</DataBullet>
            <DataBullet>Os simulados seguem uma ordem de progressão e liberação individual.</DataBullet>
            <DataBullet>Para avançar com mais consistência, conclua o simulado anterior antes de iniciar o próximo.</DataBullet>
            <DataBullet>O cronograma abaixo é calculado especificamente para a sua matrícula.</DataBullet>
          </ul>
        </article>

        <article className="student-data-guidance student-data-guidance-emerald">
          <div className="student-data-guidance-heading">
            <div className="student-data-guidance-icon"><ShieldCheck size={19} /></div>
            <div><span>Prepare seu ambiente</span><h3>Antes de começar</h3></div>
          </div>
          <ul>
            <DataBullet>Reserve um ambiente silencioso e evite interrupções.</DataBullet>
            <DataBullet>Faça o simulado sem consultas para medir seu desempenho real.</DataBullet>
            <DataBullet>Respeite o tempo de prova configurado em cada simulado.</DataBullet>
            <DataBullet>Revise seus erros após concluir cada tentativa.</DataBullet>
          </ul>
        </article>
      </div>

      {(jornada.study_strategy || jornada.important_guidelines) && (
        <div className="student-data-guidance-grid">
          {jornada.study_strategy && (
            <article className="student-data-guidance student-data-guidance-amber">
              <div className="student-data-guidance-heading">
                <div className="student-data-guidance-icon"><Trophy size={19} /></div>
                <div><span>Orientação exclusiva</span><h3>Dicas do Professor</h3></div>
              </div>
              <p className="student-data-guidance-copy whitespace-pre-line">{jornada.study_strategy}</p>
            </article>
          )}
          {jornada.important_guidelines && (
            <article className="student-data-guidance student-data-guidance-blue">
              <div className="student-data-guidance-heading">
                <div className="student-data-guidance-icon"><AlertTriangle size={19} /></div>
                <div><span>Leia com atenção</span><h3>Orientações importantes</h3></div>
              </div>
              <p className="student-data-guidance-copy whitespace-pre-line">{jornada.important_guidelines}</p>
            </article>
          )}
        </div>
      )}

      <article className="student-data-schedule">
        <div className="student-data-schedule-header">
          <div>
            <div className="student-data-eyebrow"><CalendarDays size={14} /> Seu cronograma</div>
            <h3>Liberações individuais</h3>
            <p>Datas calculadas especialmente para o seu ritmo dentro desta Jornada.</p>
          </div>
          <span className="student-data-stage-count">{simulados.length} etapas</span>
        </div>
        <div className="overflow-x-auto">
          <table className="student-data-table min-w-[860px]">
            <colgroup>
              <col className="student-data-table-col-stage" />
              <col className="student-data-table-col-simulado" />
              <col className="student-data-table-col-status" />
              <col className="student-data-table-col-date" />
            </colgroup>
            <thead>
              <tr>
                <th>Etapa</th>
                <th>Simulado</th>
                <th>Status</th>
                <th>Data prevista</th>
              </tr>
            </thead>
            <tbody>
              {simulados.map((simulado) => (
                <tr key={simulado.id}>
                  <td><span className="student-data-stage-number">{String(simulado.order_number).padStart(2, "0")}</span></td>
                  <td><strong>{simulado.title}</strong></td>
                  <td className="student-data-table-status-cell">
                    {simulado.status === "available" || simulado.status === "in_progress" ? (
                      <div className="student-data-schedule-actions student-data-schedule-actions-single">
                        <Link
                          href={`/meus-simulados/${simulado.simulado_id}?jornada=${jornada.id}`}
                          className="student-data-schedule-status student-data-schedule-status-released"
                          title={`Abrir ${simulado.title}`}
                        >
                          <Play size={12} aria-hidden="true" />
                          Liberado
                          <ChevronRight size={13} aria-hidden="true" />
                        </Link>
                      </div>
                    ) : simulado.status === "completed" ? (
                      <div className="student-data-schedule-actions">
                        <span className="student-data-schedule-status student-data-schedule-status-completed">
                          <CircleCheckBig size={12} aria-hidden="true" />
                          Resolvido
                        </span>
                        <Link
                          href={simulado.result_url || `/meus-simulados/${simulado.simulado_id}/resultado`}
                          className="student-data-schedule-status student-data-schedule-result-link"
                          title={`Ver resultado de ${simulado.title}`}
                        >
                          <BarChart3 size={12} aria-hidden="true" />
                          Ver resultado
                        </Link>
                        {!simulado.attempts_exhausted && (
                          <Link
                            href={simulado.simulado_url}
                            className="student-data-schedule-status student-data-schedule-redo-link"
                            title={`Resolver novamente ${simulado.title}`}
                          >
                            <RefreshCw size={12} aria-hidden="true" />
                            Resolver novamente
                          </Link>
                        )}
                      </div>
                    ) : (
                      <div className="student-data-schedule-actions student-data-schedule-actions-single">
                        <span className="student-data-schedule-status student-data-schedule-status-scheduled">
                          <Clock3 size={12} aria-hidden="true" />
                          Programado
                        </span>
                      </div>
                    )}
                  </td>
                  <td>{formatDate(simulado.scheduled_release_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

function DataSummaryRow({ icon, label, value, tone, strong = false }: { icon: ReactNode; label: string; value: string; tone: "orange" | "blue" | "violet" | "amber" | "emerald" | "slate"; strong?: boolean }) {
  return (
    <div className={`student-data-summary-row student-data-summary-row-${tone}`}>
      <div className="student-data-summary-row-icon">{icon}</div>
      <span>{label}</span>
      <strong className={strong ? "student-data-summary-value-strong" : ""}>{value}</strong>
    </div>
  );
}

function DataBullet({ children }: { children: ReactNode }) {
  return (
    <li><span className="student-data-bullet-icon"><CheckCircle2 size={13} /></span><span>{children}</span></li>
  );
}

function PlaceholderPanel({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <section className="student-detail-simulado-card p-10 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">{icon}</div>
      <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">{text}</p>
    </section>
  );
}

function Metric({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: "orange" | "blue" | "violet" | "amber" | "emerald" }) {
  return (
    <div className={`student-detail-metric student-detail-metric-${tone}`}>
      <div className="student-detail-metric-icon">{icon}</div>
      <div className="min-w-0">
        <p>{label}</p>
        <p>{value}</p>
      </div>
    </div>
  );
}

function Fact({ icon, label, tone }: { icon: ReactNode; label: string; tone: "orange" | "blue" | "violet" | "emerald" | "slate" }) {
  return (
    <span className={`student-detail-fact student-detail-fact-${tone}`}>
      <span className="student-detail-fact-icon">{icon}</span>
      {label}
    </span>
  );
}

function CardAction({ simulado }: { simulado: Simulado }) {
  if (simulado.status === "completed") {
    return (
      <div className="w-full">
        <div className="mb-3 flex items-center gap-2 text-sm font-black text-emerald-700"><CheckCircle2 size={18} /> Concluído</div>
        <p className="text-xs text-slate-500">Realizado em {formatDate(simulado.completed_at?.slice(0, 10))}</p>
        {simulado.score_percent !== null && <p className="mt-1 text-sm text-slate-700">Resultado real: <strong>{Math.round(simulado.score_percent)}%</strong></p>}
        <div className="mt-4 flex flex-col gap-2.5">
          <Link href={simulado.result_url || `/meus-simulados/${simulado.simulado_id}/resultado`} className="journey-action-button journey-action-secondary-success">
            <span className="journey-action-left"><BarChart3 size={18} strokeWidth={2.2} /> Ver resultado</span>
            <ChevronRight size={16} className="journey-action-chevron" />
          </Link>
          {!simulado.attempts_exhausted && (
            <Link href={simulado.simulado_url} className="journey-action-button journey-action-primary-success">
              <span className="journey-action-left">
                <span className="journey-action-icon-circle"><RefreshCw size={16} /></span>
                Refazer simulado
              </span>
              <ChevronRight size={16} className="journey-action-chevron" />
            </Link>
          )}
        </div>
      </div>
    );
  }

  if ((simulado.status === "available" || simulado.status === "in_progress") && simulado.attempts_exhausted) {
    return (
      <div className="flex items-center gap-3 text-slate-500">
        <div className="student-detail-lock-icon"><LockKeyhole size={24} /></div>
        <div>
          <p className="font-bold text-slate-800">Limite atingido</p>
          <p className="text-sm">Você já usou todas as tentativas deste simulado.</p>
        </div>
      </div>
    );
  }

  if (simulado.status === "available" || simulado.status === "in_progress") {
    return (
      <Link href={simulado.simulado_url} className="journey-action-button journey-action-primary-available">
        <span className="journey-action-left">
          <span className="journey-action-icon-circle"><Play size={15} strokeWidth={2.4} fill="currentColor" /></span>
          {simulado.status === "in_progress" ? "Retomar simulado" : "Iniciar simulado"}
        </span>
        <ChevronRight size={16} className="journey-action-chevron" />
      </Link>
    );
  }

  if (simulado.status === "expired") {
    return (
      <div className="flex items-center gap-3 text-slate-500">
        <div className="student-detail-lock-icon"><LockKeyhole size={24} /></div>
        <div><p className="font-bold text-slate-800">Jornada expirada</p><p className="text-sm">Sem novas tentativas</p></div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 text-slate-500">
      <div className="student-detail-lock-icon"><LockKeyhole size={24} /></div>
      <div>
        <p className="text-sm">Será liberado em</p>
        <p className="font-black text-orange-600">{formatDate(simulado.scheduled_release_at)}</p>
        {simulado.status === "locked_late" && <p className="mt-1 text-xs font-bold text-amber-700">Conclua o anterior</p>}
      </div>
    </div>
  );
}
