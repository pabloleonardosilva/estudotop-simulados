"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileQuestion,
  HelpCircle,
  Hourglass,
  ListChecks,
  Lock,
  NotebookText,
  PlayCircle,
  RotateCcw,
  Trophy,
} from "lucide-react";
import { supabase } from "@/app/lib/supabase/client";
import { TopCoinValueInfo } from "@/app/components/gamification/TopCoinRewardModal";
import { getTopCoinBaseValue } from "@/app/lib/gamification/topcoins";

type StudentSimulado = {
  id: string;
  title: string;
  description: string | null;
  question_count: number;
  time_limit_minutes: number | null;
  max_attempts: number | null;
  scoring_model: "traditional" | "cebraspe";
  instant_feedback_enabled: boolean;
  published_at: string | null;
  student_status: "not_started" | "in_progress" | "completed" | "no_attempts";
  attempts_used: number;
  attempts_completed: number;
  attempts_incomplete: number;
  attempts_remaining: number | null;
  in_progress_attempt: { id: string; progress_percent: number; answered_count: number } | null;
  last_completed_attempt: { id: string } | null;
  disqualified_count: number;
  locked: boolean;
  release_date: string | null;
  jornada_id: string | null;
  jornada_title: string | null;
};

type StatusInfo = {
  label: string;
  className: string;
  icon: React.ReactNode;
};

const THUMBNAILS = {
  green: "/jornadas/simulados/thumb-coruja-laranja.webp",
  orange: "/jornadas/simulados/thumb-coruja-laranja.webp",
  slate: "/jornadas/simulados/thumb-coruja-cinza.webp",
} as const;

function formatReleaseDate(date: string | null) {
  if (!date) return null;
  const value = /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00` : date;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(parsed);
}

function displayReleaseDate(simulado: StudentSimulado) {
  if (simulado.locked) return formatReleaseDate(simulado.release_date);
  return formatReleaseDate(simulado.release_date || simulado.published_at);
}

function statusInfo(status: StudentSimulado["student_status"]): StatusInfo {
  switch (status) {
    case "in_progress":
      return {
        label: "Em andamento",
        className: "border-amber-200 bg-amber-50 text-amber-700",
        icon: <Hourglass size={14} />,
      };
    case "completed":
      return {
        label: "Concluído",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
        icon: <CheckCircle2 size={14} />,
      };
    case "no_attempts":
      return {
        label: "Sem tentativas",
        className: "border-slate-200 bg-slate-100 text-slate-600",
        icon: <Lock size={14} />,
      };
    default:
      return {
        label: "Não iniciado",
        className: "border-orange-200 bg-orange-50 text-orange-700",
        icon: <span className="h-2.5 w-2.5 rounded-full bg-orange-400" />,
      };
  }
}

function scoringLabel(model: string) {
  return model === "cebraspe" ? "CEBRASPE" : "tradicional";
}

function timeLabel(minutes: number | null) {
  return minutes ? `${minutes} minutos` : "tempo livre";
}

function attemptsText(simulado: StudentSimulado) {
  if (simulado.max_attempts === null) return "tentativas ilimitadas";
  return `${simulado.max_attempts} tentativas permitidas`;
}

function pluralizeAttempt(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural;
}

function attemptsSummary(simulado: StudentSimulado) {
  return `${simulado.attempts_completed} ${pluralizeAttempt(simulado.attempts_completed, "concluída", "concluídas")} · ${simulado.attempts_incomplete} ${pluralizeAttempt(simulado.attempts_incomplete, "incompleta", "incompletas")}`;
}

function cardDescription(simulado: StudentSimulado) {
  return `Simulado geral, com ${simulado.question_count} questões, duração de ${timeLabel(simulado.time_limit_minutes)}, modelo ${scoringLabel(simulado.scoring_model)}, ${attemptsText(simulado)}.`;
}

function simuladoOrder(title: string) {
  const match = title.match(/\b(?:PCMG|Simulado)\s*0*(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

function isSolved(simulado: StudentSimulado) {
  return simulado.student_status === "completed" || Boolean(simulado.last_completed_attempt);
}

function cardTone(simulado: StudentSimulado) {
  if (isSolved(simulado)) return "green";
  if (simulado.locked) return "slate";
  return "orange";
}

function thumbnailFor(simulado: StudentSimulado) {
  return THUMBNAILS[cardTone(simulado)];
}

function toneClasses(simulado: StudentSimulado) {
  const tone = cardTone(simulado);

  if (tone === "green") {
    return {
      card: "border-emerald-100 shadow-[0_24px_70px_rgba(16,185,129,0.18)] hover:shadow-[0_30px_82px_rgba(16,185,129,0.24)]",
      eyebrow: "text-emerald-300",
      badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
      mutedBadge: "border-emerald-100 bg-emerald-50/60 text-emerald-700",
      dot: "bg-emerald-500",
      metric: "border-emerald-100 bg-emerald-50/45",
      metricIcon: "text-emerald-600",
      date: "border-emerald-100 bg-emerald-50/55 text-slate-700",
      dateIcon: "text-emerald-600",
      dateText: "text-emerald-700",
      thumbnail: "hue-rotate-[78deg] saturate-[1.15] brightness-[1.02]",
      button: "bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-lg shadow-emerald-600/25 hover:shadow-xl",
    };
  }

  if (tone === "orange") {
    return {
      card: "border-orange-100 shadow-[0_24px_70px_rgba(249,115,22,0.18)] hover:shadow-[0_30px_82px_rgba(249,115,22,0.24)]",
      eyebrow: "text-orange-400",
      badge: "border-orange-200 bg-orange-50 text-orange-600",
      mutedBadge: "border-orange-100 bg-orange-50/60 text-orange-700",
      dot: "bg-orange-400",
      metric: "border-orange-100 bg-orange-50/45",
      metricIcon: "text-orange-500",
      date: "border-orange-100 bg-orange-50/55 text-slate-700",
      dateIcon: "text-orange-500",
      dateText: "text-orange-600",
      thumbnail: "",
      button: "bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950 shadow-lg shadow-orange-500/25 hover:shadow-xl",
    };
  }

  return {
    card: "border-slate-200 shadow-[0_24px_70px_rgba(15,23,42,0.14)] hover:shadow-[0_30px_82px_rgba(15,23,42,0.18)]",
    eyebrow: "text-slate-300",
    badge: "border-slate-200 bg-slate-100 text-slate-600",
    mutedBadge: "border-slate-200 bg-slate-50 text-slate-600",
    dot: "bg-slate-300",
    metric: "border-slate-200 bg-slate-50/70",
    metricIcon: "text-slate-500",
    date: "border-slate-200 bg-slate-50/70 text-slate-600",
    dateIcon: "text-slate-500",
    dateText: "text-slate-600",
    thumbnail: "",
    button: "border border-slate-200 bg-slate-100 text-slate-500 shadow-inner",
  };
}

export default function MeusSimuladosClient() {
  const router = useRouter();
  const [simulados, setSimulados] = useState<StudentSimulado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attemptsHelpSimulado, setAttemptsHelpSimulado] = useState<StudentSimulado | null>(null);

  const orderedSimulados = useMemo(() => {
    return [...simulados].sort((a, b) => {
      const aOrder = simuladoOrder(a.title);
      const bOrder = simuladoOrder(b.title);

      if (aOrder !== null && bOrder !== null && aOrder !== bOrder) return aOrder - bOrder;
      if (aOrder !== null && bOrder === null) return -1;
      if (aOrder === null && bOrder !== null) return 1;
      if (!a.release_date && !b.release_date) return a.title.localeCompare(b.title, "pt-BR");
      if (!a.release_date) return -1;
      if (!b.release_date) return 1;
      return a.release_date.localeCompare(b.release_date);
    });
  }, [simulados]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.replace("/login");
      return;
    }

    const res = await fetch("/api/student/simulados", {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const json = await res.json();
    if (!res.ok || !json.ok) {
      setError(json.message || "Erro ao carregar simulados.");
      setLoading(false);
      return;
    }

    setSimulados(json.simulados || []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <div className="min-h-full bg-[#f6f7f9] px-5 py-7 md:px-8 lg:px-10">
      <section className="relative mb-7 overflow-hidden rounded-[1.35rem] border border-slate-200/90 bg-white/95 px-6 py-7 shadow-[0_18px_54px_rgba(15,23,42,0.08)] ring-1 ring-white md:px-10">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-[34rem] opacity-80 [background:radial-gradient(circle_at_72%_44%,rgba(255,133,0,0.10),transparent_30%),radial-gradient(circle_at_55%_48%,rgba(255,176,0,0.07),transparent_34%)]" />
        <div className="pointer-events-none absolute right-10 top-6 h-32 w-80 rotate-[-12deg] rounded-full border border-orange-100/80" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.36em] text-orange-600">Área do aluno</p>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950">Meus Simulados</h1>
            <p className="mt-3 text-base font-medium text-slate-600">Pratique com simulados oficiais e acompanhe sua evolução em tempo real.</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/minhas-anotacoes" className="inline-flex h-14 items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-6 text-sm font-black text-slate-950 shadow-sm transition hover:border-orange-200 hover:bg-orange-50">
              <NotebookText size={18} /> Minhas anotações
            </Link>
            <Link href="/aluno" className="inline-flex h-14 items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-6 text-sm font-black text-slate-950 shadow-sm transition hover:border-orange-200 hover:bg-orange-50">
              <ArrowLeft size={18} /> Voltar para a área do aluno
            </Link>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
          Carregando seus simulados...
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          {error}
        </div>
      ) : orderedSimulados.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
          Nenhum simulado disponível no momento. Volte mais tarde.
        </div>
      ) : (
        <div className="mx-auto grid max-w-[1760px] justify-center gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {orderedSimulados.map((simulado) => {
            const info = statusInfo(simulado.student_status);
            const releaseDateLabel = displayReleaseDate(simulado);
            const thumbnail = thumbnailFor(simulado);
            const tone = toneClasses(simulado);

            return (
              <article
                key={simulado.id}
                className={`group relative flex min-h-[505px] w-full min-w-0 max-w-[410px] flex-col overflow-hidden rounded-[1.15rem] bg-white ring-1 ring-white transition hover:-translate-y-1 ${tone.card}`}
              >
                <div className="relative h-[190px] overflow-hidden bg-[#05080d] px-6 py-6 text-white">
                  <Image src={thumbnail} alt="" width={180} height={180} className={`absolute bottom-[-18px] right-4 h-[160px] w-[160px] object-contain transition duration-500 group-hover:scale-105 ${tone.thumbnail}`} />
                  <div className="absolute inset-0 bg-[linear-gradient(90deg,#05080d_0%,rgba(5,8,13,0.96)_42%,rgba(5,8,13,0.50)_72%,rgba(5,8,13,0.12)_100%)]" />
                  <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:42px_42px]" />
                  <div className="relative flex max-w-[86%] flex-wrap items-center gap-2">
                    <p className={`text-[10px] font-black uppercase tracking-[0.34em] ${tone.eyebrow}`}>Simulado</p>
                    {simulado.jornada_title && (
                      <span className="inline-flex h-6 max-w-full items-center rounded-full border border-orange-300/30 bg-orange-400/10 px-2.5 text-[9px] font-black uppercase tracking-[0.16em] text-orange-100 shadow-[0_0_18px_rgba(249,115,22,0.16)]">
                        <span className="truncate">{simulado.jornada_title}</span>
                      </span>
                    )}
                  </div>
                  <h2 className="relative mt-3 max-w-[76%] text-[18px] font-black leading-[1.06] tracking-tight text-white">{simulado.title}</h2>
                  <p className="relative mt-3 line-clamp-3 max-w-[72%] text-[13px] font-medium leading-5 text-slate-200">{cardDescription(simulado)}</p>
                </div>

                <div className="flex flex-1 flex-col gap-4 p-6">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-xs font-black ${tone.badge}`}>
                      {isSolved(simulado) ? <CheckCircle2 size={14} /> : simulado.locked ? <Lock size={14} /> : <CalendarDays size={14} />}
                      {isSolved(simulado) ? "Concluído" : simulado.locked ? "Bloqueado" : "Liberado"}
                    </span>
                    <span className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-xs font-black ${tone.mutedBadge}`}>
                      <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} /> {simulado.student_status === "not_started" ? "Não iniciado" : info.label}
                    </span>
                    <TopCoinValueInfo
                      amount={getTopCoinBaseValue(
                        simulado.question_count,
                        Math.max(1, simulado.attempts_remaining === 0 ? simulado.attempts_used : simulado.attempts_used + 1),
                      )}
                      className="inline-flex h-10 items-center gap-2 overflow-visible rounded-full border border-orange-200 bg-orange-50 pl-3 pr-4 text-xs font-black text-orange-800 transition hover:border-orange-300 hover:bg-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-center text-[11px] text-slate-500">
                    <Metric icon={<FileQuestion size={19} />} value={simulado.question_count} label="Questões" className={tone.metric} iconClassName={tone.metricIcon} />
                    <Metric icon={<Clock3 size={19} />} value={simulado.time_limit_minutes ? `${simulado.time_limit_minutes} min` : "Livre"} label="Tempo" className={tone.metric} iconClassName={tone.metricIcon} />
                    <Metric icon={<RotateCcw size={19} />} value={`${simulado.attempts_used}/${simulado.max_attempts === null ? "∞" : simulado.max_attempts}`} label="Usadas" className={tone.metric} iconClassName={tone.metricIcon} />
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-xs font-bold text-slate-600 shadow-sm">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Tentativas</p>
                      <p className="mt-1 text-slate-700">{attemptsSummary(simulado)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAttemptsHelpSimulado(simulado)}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-orange-200 bg-orange-50 text-orange-600 transition hover:border-orange-300 hover:bg-orange-100"
                      aria-label="Entender contagem de tentativas"
                    >
                      <HelpCircle size={16} />
                    </button>
                  </div>

                  <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${tone.date}`}>
                    <CalendarDays size={21} className={`shrink-0 ${tone.dateIcon}`} />
                    <div>
                      <p className="font-semibold text-slate-700">{simulado.locked ? "Será liberado em" : "Liberado em"}</p>
                      <p className={`font-black ${tone.dateText}`}>{releaseDateLabel || "Data a definir"}</p>
                    </div>
                  </div>

                  {!simulado.locked && simulado.in_progress_attempt && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1 font-semibold">
                          <ListChecks size={14} /> Em andamento
                        </span>
                        <span className="font-semibold">{simulado.in_progress_attempt.progress_percent}%</span>
                      </div>
                      <progress
                        value={Math.min(100, simulado.in_progress_attempt.progress_percent)}
                        max={100}
                        className="mt-2 h-1.5 w-full overflow-hidden rounded-full accent-amber-500"
                      />
                    </div>
                  )}

                  {isSolved(simulado) && !simulado.in_progress_attempt && (
                    <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                      <Trophy size={14} />
                      Tentativa concluída disponível para revisão
                    </div>
                  )}

                  <div className="mt-auto flex flex-col gap-2 pt-2">
                    {simulado.locked ? (
                      <span className={`inline-flex h-12 cursor-not-allowed items-center justify-center gap-2 rounded-xl px-5 text-sm font-black ${tone.button}`}>
                        <Lock size={16} /> Bloqueado
                      </span>
                    ) : isSolved(simulado) ? (
                      <>
                        <Link href={`/meus-simulados/${simulado.id}/resultado`} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-xs font-black text-slate-700 transition hover:bg-slate-100">
                          Ver resultado
                        </Link>
                        <Link href={`/meus-simulados/${simulado.id}`} className={`inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-black transition hover:-translate-y-0.5 ${tone.button}`}>
                          Refazer o simulado
                          <PlayCircle size={16} />
                        </Link>
                      </>
                    ) : (
                      <Link href={`/meus-simulados/${simulado.id}`} className={`inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-black transition hover:-translate-y-0.5 ${tone.button}`}>
                        {simulado.student_status === "in_progress" ? "Retomar simulado" : "Acessar simulado"}
                        <PlayCircle size={16} />
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

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
    </div>
  );
}

function Metric({
  icon,
  value,
  label,
  className,
  iconClassName,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  className: string;
  iconClassName: string;
}) {
  return (
    <div className={`rounded-xl border px-2 py-4 ${className}`}>
      <div className={`mx-auto flex justify-center ${iconClassName}`}>{icon}</div>
      <p className="mt-2 text-base font-black text-slate-950">{value}</p>
      <p className="text-[10px] font-black uppercase tracking-wider">{label}</p>
    </div>
  );
}
