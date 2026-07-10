"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileQuestion,
  Info,
  Layers3,
  Trophy,
} from "lucide-react";
import { supabase } from "@/app/lib/supabase/client";

type DashboardData = {
  student: {
    id: string;
    name: string;
    email: string | null;
  };
  next_action: {
    type: "continuar" | "resolver" | "refazer_simulados" | "ver_jornadas";
    label: string;
    title: string;
    description: string;
    href: string;
    jornada_title: string | null;
  };
  summary: {
    active_jornadas: number;
    completed_simulados: number;
    resolved_questions: number;
    accuracy_percent: number | null;
    studied_seconds: number;
    correct_count: number;
    wrong_count: number;
    blank_count: number;
    pending_available_simulados: number;
  };
  jornadas: Array<{
    id: string;
    title: string;
    description: string | null;
    contest_name: string | null;
    scope_type: "general" | "contest";
    started_at: string;
    expires_at: string;
    status: "active" | "expired" | "cancelled" | string;
    total_simulados: number;
    completed_simulados: number;
    available_simulados: number;
    locked_simulados: number;
    progress_percent: number;
    average_score: number | null;
  }>;
  attention: Array<{
    title: string;
    description: string;
    tone: "orange" | "blue" | "slate" | string;
  }>;
};

function firstName(name?: string | null) {
  const clean = (name || "").trim();
  if (!clean) return "Aluno";
  return clean.split(/\s+/)[0];
}

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR").format(Number(value || 0));
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `${Math.round(value)}%`;
}

function formatStudiedTime(seconds: number | null | undefined) {
  const total = Math.max(0, Number(seconds || 0));
  if (total < 60) return "0min";
  const minutes = Math.round(total / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours > 0 && rest > 0) return `${hours}h${String(rest).padStart(2, "0")}`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}min`;
}

function daysUntil(date?: string | null) {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${date}T00:00:00`);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function expirationLabel(date?: string | null) {
  const days = daysUntil(date);
  if (days === null) return "Sem data";
  if (days < 0) return "Expirada";
  if (days === 0) return "Expira hoje";
  if (days === 1) return "Expira amanhã";
  return `Expira em ${days} dias`;
}

export default function AreaAlunoPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
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

    const res = await fetch("/api/student/dashboard", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const json = await res.json();

    if (!res.ok || !json.ok) {
      setError(json.message || "Não foi possível carregar seu painel.");
      setLoading(false);
      return;
    }

    setData(json);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <main className="min-h-full bg-[#FAF8F5] px-4 py-6 text-[#0A0F1E] md:px-8 lg:px-10">
        <StatePanel>Carregando seu painel...</StatePanel>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-full bg-[#FAF8F5] px-4 py-6 text-[#0A0F1E] md:px-8 lg:px-10">
        <div className="mx-auto max-w-3xl rounded-[20px] border border-red-200 bg-red-50 p-6 text-sm font-medium text-red-700 shadow-sm">
          {error || "Não foi possível carregar seu painel."}
        </div>
      </main>
    );
  }

  const studentFirstName = firstName(data.student.name);
  const answeredTotal =
    Number(data.summary.correct_count || 0) + Number(data.summary.wrong_count || 0) + Number(data.summary.blank_count || 0);

  return (
    <main className="relative min-h-full bg-[#FAF8F5] px-4 pb-14 pt-8 text-[#0A0F1E] sm:px-6 lg:px-8 xl:px-12 2xl:px-[80px]">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-28 -top-28 h-[460px] w-[560px] bg-[radial-gradient(circle,rgba(255,138,0,0.20),transparent_66%)] blur-2xl" />
        <div className="absolute -top-20 right-[6%] h-[340px] w-[460px] bg-[radial-gradient(circle,rgba(27,106,254,0.09),transparent_66%)] blur-2xl" />
        <div className="absolute bottom-[-180px] left-[30%] h-[420px] w-[560px] bg-[radial-gradient(circle,rgba(255,138,0,0.09),transparent_66%)] blur-3xl" />
      </div>

      <div className="relative mx-auto flex w-full max-w-[1520px] flex-col gap-9">
        <section className="grid items-stretch gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(380px,490px)]">
          <div className="relative flex min-h-[300px] items-center xl:min-h-[360px]">
            <div aria-hidden className="pointer-events-none absolute left-[10px] bottom-[24px] hidden h-[300px] w-[300px] rounded-full bg-[radial-gradient(circle,rgba(255,138,0,0.22),transparent_68%)] blur-lg xl:block" />
            <div aria-hidden className="pointer-events-none absolute bottom-[-6px] left-[40px] hidden h-7 w-[220px] rounded-full bg-[#0A0F1E]/10 blur-xl xl:block" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/coruja-welcome.png"
              alt="Coruja mascote do EstudoTOP recebendo o aluno"
              className="pointer-events-none absolute bottom-0 left-0 hidden h-[360px] select-none object-contain drop-shadow-[0_28px_32px_rgba(10,15,30,0.16)] xl:block 2xl:h-[380px]"
            />

            <div className="min-w-0 xl:pl-[290px] 2xl:pl-[320px]">
              <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-[#FF5300]">Painel do aluno</p>
              <h1 className="mt-3 text-[34px] font-extrabold leading-[1.15] tracking-[-0.02em] text-[#0A0F1E] md:text-[42px] 2xl:text-[46px]">
                Olá, {studentFirstName}.
                <br />
                <span className="bg-[linear-gradient(90deg,#F67310,#FBA045)] bg-clip-text text-transparent">
                  Continue sua preparação.
                </span>
              </h1>
              <p className="mt-4 max-w-[460px] text-base font-medium leading-[1.55] text-[#44617A]">
                {data.next_action.description || "Você não tem nenhuma tentativa em andamento ou simulado novo liberado neste momento."}
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-6">
                <Link
                  href="/minhas-jornadas"
                  className="inline-flex items-center gap-2.5 rounded-full bg-[linear-gradient(180deg,#FFA048_0%,#FE7C00_55%,#FF5700_100%)] px-7 py-4 text-[15px] font-bold text-white shadow-[0_10px_24px_rgba(255,87,0,0.35),inset_0_1px_0_rgba(255,255,255,0.35)] transition duration-200 hover:-translate-y-0.5 hover:brightness-[1.06] hover:shadow-[0_14px_30px_rgba(255,87,0,0.42),inset_0_1px_0_rgba(255,255,255,0.35)]"
                >
                  Ver minhas jornadas
                  <ChevronRight size={17} />
                </Link>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[20px] border border-[#F0F2F5] bg-[linear-gradient(160deg,#FFFFFF_0%,#FEFDFB_62%,#FEF7F0_100%)] p-7 shadow-[0_18px_40px_rgba(15,23,42,0.10)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_48px_rgba(15,23,42,0.12)]">
            <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-[180px] w-[220px] bg-[radial-gradient(circle,rgba(255,110,0,0.10),transparent_64%)] blur-xl" />
            <div aria-hidden className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.95),transparent)]" />
            <div className="relative flex items-start justify-between gap-4">
              <p className="pt-3 text-xs font-bold uppercase tracking-[0.12em] text-[#2F4767]">Hoje</p>
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#FDF0E3] text-[#FF6300]">
                <CalendarDays size={22} />
              </span>
            </div>

            <h2 className="mt-1 text-2xl font-extrabold tracking-[-0.01em] text-[#0A0F1E]">Disponíveis agora</h2>
            <p className="mt-4 text-[64px] font-extrabold leading-none tracking-[-0.03em] text-[#0A0F1E]">
              {data.summary.pending_available_simulados}
            </p>
            <p className="mt-3 max-w-[200px] text-sm font-medium leading-[1.55] text-[#606E88]">
              {data.summary.pending_available_simulados === 1
                ? "simulado liberado aguardando resolução."
                : "simulados liberados aguardando resolução."}
            </p>

            <svg
              viewBox="0 0 210 170"
              aria-hidden="true"
              className="pointer-events-none absolute bottom-4 right-4 hidden w-[150px] opacity-[0.96] lg:block"
            >
              <ellipse cx="112" cy="158" rx="88" ry="9" fill="#0F172A" opacity="0.07" />
              <rect x="18" y="118" width="52" height="36" rx="5" fill="#F1F5F9" stroke="#E2E8F0" />
              <rect x="24" y="126" width="40" height="4" rx="2" fill="#E2E8F0" />
              <rect x="24" y="135" width="30" height="4" rx="2" fill="#E8EEF6" />
              <rect x="24" y="144" width="35" height="4" rx="2" fill="#E8EEF6" />
              <rect x="78" y="34" width="92" height="122" rx="12" fill="#FFFFFF" stroke="#E2E8F0" />
              <rect x="103" y="24" width="42" height="18" rx="6" fill="#CBD5E1" />
              <rect x="110" y="20" width="28" height="10" rx="5" fill="#94A3B8" />
              <circle cx="96" cy="62" r="7" fill="#FEEFE4" stroke="#FE7C00" strokeWidth="1.6" />
              <path d="M92.8 62l2.4 2.4 4-4.4" stroke="#FF5300" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="110" y="57" width="48" height="5" rx="2.5" fill="#E2E8F0" />
              <rect x="110" y="66" width="34" height="4" rx="2" fill="#EEF2F7" />
              <circle cx="96" cy="90" r="7" fill="#FEEFE4" stroke="#FE7C00" strokeWidth="1.6" />
              <path d="M92.8 90l2.4 2.4 4-4.4" stroke="#FF5300" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="110" y="85" width="48" height="5" rx="2.5" fill="#E2E8F0" />
              <rect x="110" y="94" width="40" height="4" rx="2" fill="#EEF2F7" />
              <circle cx="96" cy="118" r="7" fill="#FEF6EF" stroke="#FFA048" strokeWidth="1.6" />
              <rect x="110" y="113" width="48" height="5" rx="2.5" fill="#E2E8F0" />
              <rect x="110" y="122" width="30" height="4" rx="2" fill="#EEF2F7" />
              <rect x="110" y="134" width="44" height="12" rx="6" fill="#FEEFE4" />
              <rect x="116" y="138" width="32" height="4" rx="2" fill="#FE7C00" opacity="0.8" />
              <path d="M36 108c-2-14 4-24 12-30" stroke="#16BA7C" strokeWidth="2.4" fill="none" strokeLinecap="round" />
              <path d="M48 78c-8-1-13 3-14 10 8 2 13-3 14-10z" fill="#4ADE80" />
              <path d="M34 92c-8 0-12 5-12 12 8 1 12-5 12-12z" fill="#16BA7C" />
              <path d="M40 96c6-2 12 0 14 6-6 3-12 0-14-6z" fill="#86EFAC" />
              <rect x="26" y="106" width="24" height="16" rx="4" fill="#FDBA74" />
              <rect x="26" y="106" width="24" height="5" rx="2.5" fill="#FB923C" />
            </svg>
          </div>
        </section>

        <section className="grid gap-[22px] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <SummaryCard icon={<Layers3 size={22} />} label="Jornadas ativas" value={formatNumber(data.summary.active_jornadas)} detail="em andamento" tone="blue" />
          <SummaryCard icon={<CheckCircle2 size={22} />} label="Simulados concluídos" value={formatNumber(data.summary.completed_simulados)} detail="finalizados" tone="emerald" />
          <SummaryCard icon={<FileQuestion size={22} />} label="Questões resolvidas" value={formatNumber(data.summary.resolved_questions)} detail="em simulados concluídos" tone="violet" />
          <SummaryCard icon={<Trophy size={22} />} label="Índice de acerto" value={formatPercent(data.summary.accuracy_percent)} detail="média geral" tone="orange" />
          <SummaryCard icon={<Clock3 size={22} />} label="Tempo estudado" value={formatStudiedTime(data.summary.studied_seconds)} detail="tempo finalizado" tone="sky" />
        </section>

        <section className="grid gap-8 xl:grid-cols-[1.15fr_1fr_1fr]">
          <div className="rounded-[20px] border border-[#F0F2F5] bg-[linear-gradient(180deg,#FFFFFF_0%,#FDFDFB_100%)] p-7 shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_38px_rgba(15,23,42,0.09)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#FF5300]">Minhas Jornadas</p>
                <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.01em] text-[#0A0F1E]">Progresso por Jornada</h2>
              </div>
              <Link
                href="/minhas-jornadas"
                className="inline-flex h-11 items-center gap-1.5 rounded-full border border-[#E4E7EC] bg-white px-5 text-sm font-semibold text-[#0A0F1E] shadow-[0_4px_14px_rgba(15,23,42,0.04)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(15,23,42,0.08)]"
              >
                Ver todas
                <ChevronRight size={15} className="text-[#606E88]" />
              </Link>
            </div>

            {data.jornadas.length === 0 ? (
              <div className="mt-6 rounded-[14px] border border-dashed border-[#E4E7EC] bg-[#F8F9FB] p-8 text-sm font-medium leading-6 text-[#606E88]">
                Quando você for matriculado em uma Jornada, ela aparecerá aqui.
              </div>
            ) : (
              <div className="mt-6 grid gap-4">
                {data.jornadas.map((jornada) => (
                  <JornadaMiniCard key={jornada.id} jornada={jornada} />
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col rounded-[20px] border border-[#F0F2F5] bg-[linear-gradient(180deg,#FFFFFF_0%,#FDFDFB_100%)] p-7 shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_38px_rgba(15,23,42,0.09)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#FF5300]">Desempenho</p>
                <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.01em] text-[#0A0F1E]">Resumo geral</h2>
              </div>
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#000010] text-white">
                <BarChart3 size={20} />
              </span>
            </div>

            <div className="mt-6 flex flex-1 flex-col justify-center gap-5">
              <PerformanceBar
                label="Acertos"
                value={data.summary.correct_count}
                total={answeredTotal}
                barClass="bg-[linear-gradient(90deg,#0FA96C,#3AD695)] shadow-[0_0_8px_rgba(22,186,124,0.35)]"
              />
              <PerformanceBar
                label="Erros"
                value={data.summary.wrong_count}
                total={answeredTotal}
                barClass="bg-[linear-gradient(90deg,#E23B57,#F97889)] shadow-[0_0_8px_rgba(235,76,102,0.30)]"
              />
              <PerformanceBar
                label="Em branco"
                value={data.summary.blank_count}
                total={answeredTotal}
                barClass="bg-[linear-gradient(90deg,#76859A,#A5B1C2)]"
              />
            </div>

            <div className="mt-6 flex items-center justify-between gap-3 rounded-[14px] border border-[#F9E2CE] bg-[linear-gradient(135deg,#FEF1E7_0%,#FDE9D8_100%)] py-3.5 pl-5 pr-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
              <span className="text-xs font-extrabold uppercase tracking-[0.1em] text-[#D62F00]">Aproveitamento</span>
              <span className="rounded-full bg-white px-5 py-2 text-lg font-extrabold leading-none text-[#FF5E00] shadow-[0_2px_8px_rgba(214,47,0,0.12)]">
                {formatPercent(data.summary.accuracy_percent)}
              </span>
            </div>
          </div>

          <div className="rounded-[20px] border border-[#F0F2F5] bg-[linear-gradient(180deg,#FFFFFF_0%,#FDFDFB_100%)] p-7 shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_38px_rgba(15,23,42,0.09)]">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#FF5300]">Pontos de Atenção</p>
              <Info size={20} className="shrink-0 text-[#FF5300]" />
            </div>

            <div className="mt-6 space-y-3.5">
              {data.attention.length === 0 ? (
                <div className="rounded-[14px] border border-[#DEF3E7] bg-[#F1FCF5] p-[18px] text-[13px] font-medium leading-6 text-emerald-700">
                  Nenhum alerta importante agora. Continue acompanhando suas Jornadas e seus resultados.
                </div>
              ) : (
                data.attention.map((item) => (
                  <AttentionItem key={`${item.title}-${item.description}`} title={item.title} description={item.description} tone={item.tone} />
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatePanel({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto mt-10 max-w-3xl rounded-[20px] bg-white p-10 text-center text-sm text-[#606E88] shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
      {children}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: "blue" | "emerald" | "violet" | "orange" | "sky";
}) {
  const toneMap = {
    blue: {
      card: "border-[#E4EDFB] bg-[linear-gradient(160deg,#FDFEFF_0%,#F4F8FE_58%,#EDF4FE_100%)]",
      icon: "text-[#1B6AFE] shadow-[0_6px_16px_rgba(27,106,254,0.18)]",
    },
    emerald: {
      card: "border-[#DEF3E7] bg-[linear-gradient(160deg,#FDFFFE_0%,#F1FCF5_58%,#E9F9EF_100%)]",
      icon: "text-[#0ABB6A] shadow-[0_6px_16px_rgba(10,187,106,0.18)]",
    },
    violet: {
      card: "border-[#EBE4FA] bg-[linear-gradient(160deg,#FEFDFF_0%,#F7F4FE_58%,#F1EBFD_100%)]",
      icon: "text-[#8D3BF4] shadow-[0_6px_16px_rgba(141,59,244,0.16)]",
    },
    orange: {
      card: "border-[#F8E7D6] bg-[linear-gradient(160deg,#FFFEFC_0%,#FEF6EF_58%,#FDEFE2_100%)]",
      icon: "text-[#FF4300] shadow-[0_6px_16px_rgba(255,67,0,0.16)]",
    },
    sky: {
      card: "border-[#E4EDFB] bg-[linear-gradient(160deg,#FDFEFF_0%,#F3F7FE_58%,#EBF2FD_100%)]",
      icon: "text-[#5492FD] shadow-[0_6px_16px_rgba(84,146,253,0.18)]",
    },
  } as const;

  return (
    <div
      className={`group relative flex min-h-[115px] items-center gap-4 overflow-hidden rounded-[18px] border p-5 shadow-[0_4px_14px_rgba(15,23,42,0.04)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,0.09)] ${toneMap[tone].card}`}
    >
      <span aria-hidden className="pointer-events-none absolute inset-x-5 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.95),transparent)]" />
      <span className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-white ring-1 ring-white/70 transition duration-200 group-hover:scale-105 ${toneMap[tone].icon}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-bold uppercase tracking-[0.08em] text-[#445472]">{label}</p>
        <p className="mt-1 truncate text-[26px] font-extrabold leading-none tracking-[-0.02em] text-[#0A0F1E]">{value}</p>
        <p className="mt-1.5 truncate text-[13px] font-medium text-[#435273]">{detail}</p>
      </div>
    </div>
  );
}

function JornadaMiniCard({ jornada }: { jornada: DashboardData["jornadas"][number] }) {
  const progress = Math.min(100, Math.max(0, Number(jornada.progress_percent || 0)));
  const scope = jornada.scope_type === "contest" ? jornada.contest_name || "Concurso específico" : "Jornada geral";

  return (
    <Link
      href={`/minhas-jornadas/${jornada.id}`}
      className="group block rounded-[14px] border border-[#EFF1F4] bg-[linear-gradient(180deg,#F9FAFC_0%,#F4F6F9_100%)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_26px_rgba(15,23,42,0.08)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="line-clamp-1 text-[17px] font-extrabold tracking-[-0.01em] text-[#0A0F1E]">{jornada.title}</h3>
          <p className="mt-1 truncate text-[13px] font-medium text-[#606E88]">{scope}</p>
        </div>
        <span className="shrink-0 rounded-full bg-[rgba(255,71,0,0.10)] px-3.5 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.04em] text-[#FF4700]">
          {jornada.status === "active" ? "Ativa" : jornada.status === "expired" ? "Expirada" : "Pausada"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2.5 text-center">
        <SmallStat label="Feitos" value={`${jornada.completed_simulados}/${jornada.total_simulados}`} />
        <SmallStat label="Livres" value={String(jornada.available_simulados)} />
        <SmallStat label="Média" value={formatPercent(jornada.average_score)} />
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-[13px] font-medium text-[#606E88]">
          <span>{expirationLabel(jornada.expires_at)}</span>
          <span>{progress}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[#F0F4F7]">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,#FD6E05,#FFB748)] shadow-[0_0_8px_rgba(253,139,5,0.40)] transition-[width] duration-700"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </Link>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#EDF0F3] bg-white p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#4D607D]">{label}</p>
      <p className="mt-1 truncate text-base font-extrabold text-[#0A0F1E]" title={value}>{value}</p>
    </div>
  );
}

function PerformanceBar({ label, value, total, barClass }: { label: string; value: number; total: number; barClass: string }) {
  const pct = total > 0 ? Math.round((Number(value || 0) / total) * 100) : 0;

  return (
    <div title={`${label}: ${formatNumber(value)} de ${formatNumber(total)} (${pct}%)`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-[0.08em] text-[#495975]">{label}</span>
        <span className="text-[15px] font-extrabold text-[#0A0F1E]">
          {formatNumber(value)} <span className="font-medium text-[#606E88]">· {pct}%</span>
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#F0F4F7]">
        <div className={`h-full rounded-full transition-[width] duration-700 ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function AttentionItem({ title, description, tone }: { title: string; description: string; tone: string }) {
  const toneMap: Record<string, { card: string; title: string }> = {
    blue: { card: "border-[#E3EDFB] bg-[linear-gradient(180deg,#F6FAFE_0%,#EFF5FD_100%)]", title: "text-[#2B5FD9]" },
    orange: { card: "border-[#F8E7D6] bg-[linear-gradient(180deg,#FEF8F1_0%,#FDF0E3_100%)]", title: "text-[#D62F00]" },
    slate: { card: "border-[#EDF0F3] bg-[linear-gradient(180deg,#FFFFFF_0%,#FAFBFC_100%)]", title: "text-[#0A0F1E]" },
  };
  const styles = toneMap[tone] || toneMap.slate;

  return (
    <div className={`group flex cursor-pointer items-start justify-between gap-4 rounded-[14px] border p-[18px] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_26px_rgba(15,23,42,0.07)] ${styles.card}`}>
      <div>
        <p className={`text-[15px] font-bold ${styles.title}`}>{title}</p>
        <p className="mt-1 text-[13px] font-medium leading-[1.55] text-[#44617A]">{description}</p>
      </div>
      <ChevronRight size={17} className="mt-1 shrink-0 text-[#9AA7BA] transition group-hover:translate-x-0.5" />
    </div>
  );
}
