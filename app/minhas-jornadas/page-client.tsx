"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Clock3,
  Flag,
  Home,
  Layers3,
  Map,
  PlayCircle,
  Rocket,
  ShieldCheck,
} from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/app/lib/supabase/client";
import { jornadaCategoryImage } from "@/app/admin/jornadas/utils";

type Jornada = {
  id: string;
  title: string;
  description: string | null;
  started_at: string;
  expires_at: string;
  status: "active" | "expired" | "cancelled";
  scope_type: "general" | "contest";
  category: "saude" | "policial" | "tribunais" | "administrativo" | null;
  contest_name: string | null;
  duration_days: number | null;
  duration_months: number;
  exam_date: string | null;
  effective_end_date: string | null;
  total_simulados: number;
  completed_simulados: number;
  available_simulados: number;
  progress_percent: number;
};

function formatDate(date?: string | null) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${date}T00:00:00`));
}

function statusLabel(status: Jornada["status"]) {
  if (status === "expired") return "Expirada";
  if (status === "cancelled") return "Cancelada";
  return "Ativa";
}


function statusDotClasses(status: Jornada["status"]) {
  if (status === "expired") return "bg-slate-400";
  if (status === "cancelled") return "bg-red-500";
  return "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.48)]";
}

function scopeLabel(scopeType: Jornada["scope_type"], contestName: string | null) {
  if (scopeType === "contest") return contestName?.trim() || "Concurso específico";
  return "Geral";
}

function durationInDays(jornada: Jornada) {
  const explicitDays = Number(jornada.duration_days || 0);
  if (Number.isFinite(explicitDays) && explicitDays > 0) return explicitDays;
  return Math.max(0, Number(jornada.duration_months || 0) * 30);
}

export default function MinhasJornadasClient() {
  const router = useRouter();
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

    const res = await fetch("/api/student/jornadas", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const json = await res.json();

    if (!res.ok || !json.ok) {
      setError(json.message || "Erro ao carregar jornadas.");
      setLoading(false);
      return;
    }

    setJornadas(json.jornadas || []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="student-light-canvas relative min-h-full overflow-hidden px-4 py-4 text-slate-950 sm:px-7 lg:h-full lg:px-8 lg:py-5 xl:px-10">
      <div className="pointer-events-none absolute bottom-[-170px] right-[-90px] h-[520px] w-[520px] rounded-full border border-slate-200/50 opacity-45 [background-image:radial-gradient(circle,rgba(15,23,42,0.075)_1px,transparent_1px)] [background-size:12px_12px]" />

      <div className="relative mx-auto flex w-full max-w-[1380px] flex-col">
        <section className="student-page-context flex min-h-[58px] flex-col justify-between gap-3 px-1 pb-3 sm:flex-row sm:items-end">
          <div className="min-w-0">
            <div className="student-context-trail inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.20em]">
              <Home size={12} />
              <span>Área do aluno</span>
              <ChevronRight size={11} className="opacity-45" />
              <span className="text-orange-600">Minhas Jornadas</span>
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h1 className="text-2xl font-semibold tracking-[-0.04em] text-[#07111F] sm:text-[28px]">Minhas Jornadas</h1>
              <p className="text-xs leading-5 text-slate-500 sm:text-sm">Acompanhe suas trilhas, desbloqueios e progresso.</p>
            </div>
          </div>

          <Link
            href="/meus-simulados"
            className="student-button-secondary inline-flex h-10 shrink-0 items-center justify-center gap-2 self-start rounded-2xl px-4 text-[13px] font-semibold transition duration-200 hover:-translate-y-0.5 sm:self-auto"
          >
            <ShieldCheck size={15} />
            Ver simulados avulsos
            <ArrowRight size={14} />
          </Link>
        </section>

        <section className="mt-2 min-h-0 flex-1">
          {loading ? (
            <StatePanel>Carregando suas jornadas...</StatePanel>
          ) : error ? (
            <div className="rounded-[1.6rem] border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">{error}</div>
          ) : jornadas.length === 0 ? (
            <div className="student-light-surface rounded-[1.75rem] border-dashed px-8 py-14 text-center">
              <Map size={40} className="mx-auto text-orange-500" />
              <h2 className="mt-4 text-xl font-semibold text-slate-900">Nenhuma jornada disponível.</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">Quando você for matriculado em uma Jornada, ela aparecerá aqui.</p>
            </div>
          ) : (
            <div className="grid items-start gap-5 sm:grid-cols-2 2xl:grid-cols-3">
              {jornadas.map((jornada, index) => (
                <JornadaCard key={jornada.id} jornada={jornada} index={index} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function JornadaCard({ jornada, index }: { jornada: Jornada; index: number }) {
  const progress = Math.min(100, Math.max(0, Number(jornada.progress_percent || 0)));
  const image = jornadaCategoryImage(jornada.category);

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, delay: Math.min(index * 0.04, 0.2) }}
      className={`student-journey-card group relative w-full max-w-[390px] overflow-hidden rounded-[1.6rem] transition duration-300 hover:-translate-y-1 ${
        jornada.status === "expired" ? "opacity-75" : ""
      }`}
    >
      <div className="relative aspect-[16/8.2] overflow-hidden bg-[#07111F]">
        <div
          className="absolute inset-0 bg-cover bg-center transition duration-700 group-hover:scale-[1.035]"
          style={{ backgroundImage: `url(${image})` }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,7,13,0.02)_0%,rgba(3,7,13,0.08)_55%,rgba(3,7,13,0.46)_100%)]" />
        <div className="absolute inset-0 ring-1 ring-inset ring-white/10" />

        <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/65 bg-white/92 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.17em] text-slate-800 shadow-[0_8px_24px_rgba(0,0,0,0.22)] backdrop-blur-md">
          <ShieldCheck size={12} className="text-orange-500" />
          Jornada
        </div>
      </div>

      <div className="p-5">
        <h2 className="line-clamp-1 text-[21px] font-semibold leading-tight tracking-[-0.03em] text-[#07111F]">{jornada.title}</h2>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <span className={`student-status-badge student-status-${jornada.status} inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.08em]`}>
            <span className={`h-2 w-2 rounded-full ${statusDotClasses(jornada.status)}`} />
            {statusLabel(jornada.status)}
          </span>

          <span className="student-scope-badge inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.08em]">
            <Flag size={11} />
            <span className="truncate">{scopeLabel(jornada.scope_type, jornada.contest_name)}</span>
          </span>
        </div>

        <p className="mt-3 line-clamp-1 text-[13px] leading-5 text-slate-500">
          {jornada.description || "Jornada progressiva de simulados, com cronograma individual por aluno."}
        </p>

        <div className="mt-3.5 grid grid-cols-2 gap-2.5">
          <MetricCard tone="orange" icon={<Layers3 size={16} />} label="Simulados" value={`${jornada.completed_simulados}/${jornada.total_simulados}`} />
          <MetricCard tone="blue" icon={<PlayCircle size={16} />} label="Liberados" value={String(jornada.available_simulados)} />
          <MetricCard tone="violet" icon={<Clock3 size={16} />} label="Duração" value={`${durationInDays(jornada)} dias`} />
          <MetricCard tone="emerald" icon={<CalendarDays size={16} />} label="Prova" value={jornada.exam_date ? formatDate(jornada.exam_date) : "Geral"} />
        </div>

        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/85 px-3 py-2.5 shadow-inner">
          <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-semibold">
            <span className="text-slate-600">Progresso</span>
            <span className="text-slate-900">{progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#FF6A00,#FFB000)] shadow-[0_0_18px_rgba(255,138,0,0.38)] transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <Link
          href={`/minhas-jornadas/${jornada.id}`}
          className="student-button-primary mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl px-5 text-sm font-bold transition duration-200 hover:-translate-y-0.5"
        >
          <Rocket size={16} />
          Entrar na jornada
          <ArrowRight size={16} />
        </Link>
      </div>
    </motion.article>
  );
}

function MetricCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "orange" | "blue" | "violet" | "emerald";
}) {
  return (
    <div className={`student-metric-card student-metric-${tone} group/metric min-w-0 rounded-2xl px-3 py-2.5`}>
      <div className="flex items-center gap-2.5">
        <span className="student-metric-icon inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl">{icon}</span>
        <div className="min-w-0">
          <span className="block truncate text-[8px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</span>
          <p className="mt-0.5 truncate text-[13px] font-bold text-slate-900" title={value}>
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

function StatePanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="student-light-surface rounded-[1.75rem] p-10 text-center text-sm text-slate-500">{children}</div>
  );
}
