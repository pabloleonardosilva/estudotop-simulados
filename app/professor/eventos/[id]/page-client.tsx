"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownAZ, ArrowLeft, ArrowRight, BarChart3, CheckCircle2, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Circle, Clock3, Eye, EyeOff, Hourglass, Loader2, Medal, Minus, PlayCircle, Plus, Presentation, Radio, Search, SearchX, ShieldCheck, Target, Trophy, Type, Unlock, UserRound, Users, X, XCircle } from "lucide-react";
import { supabase } from "@/app/lib/supabase/client";
import PremiumButton from "@/app/components/ui/PremiumButton";
import PremiumInput from "@/app/components/ui/PremiumInput";
import PremiumSelect from "@/app/components/ui/PremiumSelect";
import QuestionDisplayCard from "@/app/components/questions/QuestionDisplayCard";

type Tab = "overview" | "participants" | "questions";
type Alternative = { id: string; label: string | null; text: string | null; image_url: string | null; is_correct: boolean; order_number: number | null };
type ClassroomQuestion = { id: string; order_number: number; status: string; questions: { id: string; code: string | null; statement: string | null; image_url: string | null; year: number | null; question_type: string | null; question_alternatives: Alternative[] } | null; answered: number; total_considered: number; correct: number; wrong: number; blank: number; accuracy_percent: number | null; error_percent: number | null; average_time_seconds: number; alternative_counts: Record<string, number> };
type Participant = { id: string; name: string; email: string; joined_at: string; status: "not_started" | "not_completed" | "in_progress" | "completed" | "disqualified" | "admin_terminated" | "expired"; attempt_count: number; representative_attempt_id: string | null; representative_attempt_number: number | null; attempt: { id: string; status: string; attempt_number: number; started_at: string | null; submitted_at: string | null; time_spent_seconds: number | null; is_representative: boolean } | null; result: { display_score: number | null; percentage: number | null; correct_count: number; wrong_count: number; blank_count: number; total_questions: number; time_spent_ms: number } | null; result_status: "not_available" | "pending" | "available"; result_released_at: string | null; is_online: boolean; rank?: number | null; rank_tied?: boolean };
type Dashboard = { event: { id: string; name: string; simulado_id: string | null; effective_status: string; result_policy: string; starts_at: string; professor_banner_url?: string | null; simulados?: { title?: string } }; summary: { registered: number; online: number; not_started: number; taking: number; completed: number; pending_results: number; accuracy_percent: number | null; error_percent: number | null; blank_answers: number; average_time_seconds: number; highest_score: number | null; lowest_score: number | null; average_score: number | null }; participants: Participant[]; questions: ClassroomQuestion[] };

const DEFAULT_PARTICIPANTS_PER_PAGE = 10;
const participantStatus = {
  not_started: { label: "Não iniciado", className: "border-slate-500/20 bg-slate-500/10 text-slate-700" },
  not_completed: { label: "Não realizado", className: "border-amber-500/20 bg-amber-500/10 text-amber-700" },
  in_progress: { label: "Em andamento", className: "border-blue-500/25 bg-blue-500/10 text-blue-700" },
  completed: { label: "Concluído", className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700" },
  disqualified: { label: "Desclassificado", className: "border-red-500/25 bg-red-500/10 text-red-700" },
  admin_terminated: { label: "Encerrada pelo administrador", className: "border-slate-500/20 bg-slate-500/10 text-slate-700" },
  expired: { label: "Expirado", className: "border-amber-500/20 bg-amber-500/10 text-amber-700" },
};

function formatTimeMs(milliseconds?: number | null) {
  if (milliseconds === null || milliseconds === undefined) return "—";
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
function formatPreciseTime(milliseconds?: number | null) {
  if (milliseconds === null || milliseconds === undefined) return null;
  const safe = Math.max(0, Math.floor(milliseconds));
  const totalSeconds = Math.floor(safe / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const ms = safe % 1000;
  return {
    main: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(ms).padStart(3, "0")}`,
    detail: `${totalSeconds}s ${ms}ms`,
  };
}
function participantInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "—";
}
function formatTime(seconds: number) { return formatTimeMs(Number(seconds || 0) * 1000); }
function formatPercent(value: number | null) { return value === null ? "—" : `${value.toFixed(1).replace(".0", "").replace(".", ",")}%`; }
function formatScore(value: number | null) { return value === null ? "—" : value.toLocaleString("pt-BR", { maximumFractionDigits: 2 }); }

function rankedParticipants(participants: Participant[]) {
  const ranked = participants.filter((item) => item.result).sort((a, b) => Number(b.result?.correct_count || 0) - Number(a.result?.correct_count || 0) || Number(a.result?.time_spent_ms || 0) - Number(b.result?.time_spent_ms || 0) || a.name.localeCompare(b.name, "pt-BR"));
  const tieCount = new Map<string, number>();
  ranked.forEach((item) => { const key = `${item.result?.correct_count}:${item.result?.time_spent_ms}`; tieCount.set(key, (tieCount.get(key) || 0) + 1); });
  const ranks = new Map<string, { rank: number; tied: boolean }>();
  let lastKey = "";
  let rank = 0;
  ranked.forEach((item, index) => { const key = `${item.result?.correct_count}:${item.result?.time_spent_ms}`; if (key !== lastKey) rank = index + 1; ranks.set(item.id, { rank, tied: (tieCount.get(key) || 0) > 1 }); lastKey = key; });
  return participants.map((item) => ({ ...item, rank: ranks.get(item.id)?.rank || null, rank_tied: ranks.get(item.id)?.tied || false })).sort((a, b) => a.rank !== null && b.rank !== null ? a.rank - b.rank || a.name.localeCompare(b.name, "pt-BR") : a.rank !== null ? -1 : b.rank !== null ? 1 : a.name.localeCompare(b.name, "pt-BR"));
}

export default function ProfessorEventoClient({ id }: { id: string }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [showQuestionData, setShowQuestionData] = useState(false);
  const [questionFontScale, setQuestionFontScale] = useState(1);
  const [eliminatedQuestionAlternatives, setEliminatedQuestionAlternatives] = useState<Record<string, string[]>>({});
  const [participantSearch, setParticipantSearch] = useState("");
  const [participantFilter, setParticipantFilter] = useState("all");
  const [participantSort, setParticipantSort] = useState<"score" | "alphabetical">("score");
  const [participantPage, setParticipantPage] = useState(0);
  const [participantsPerPage, setParticipantsPerPage] = useState(DEFAULT_PARTICIPANTS_PER_PAGE);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getSession();
    if (!auth.session) return;
    const response = await fetch(`/api/professor/events/${id}`, { headers: { Authorization: `Bearer ${auth.session.access_token}` } });
    const json = await response.json();
    if (json.ok) setData(json); else setMessage(json.message);
  }, [id]);

  useEffect(() => { const initial = window.setTimeout(() => void load(), 0); const timer = window.setInterval(() => void load(), 10_000); return () => { window.clearTimeout(initial); window.clearInterval(timer); }; }, [load]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1_000); return () => window.clearInterval(timer); }, []);

  async function action(value: string) {
    const { data: auth } = await supabase.auth.getSession();
    if (!auth.session) return;
    const response = await fetch(`/api/professor/events/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.session.access_token}` }, body: JSON.stringify({ action: value }) });
    const json = await response.json(); setMessage(json.message); if (json.ok) await load();
  }
  function selectQuestion(index: number) { setQuestionIndex(index); setShowQuestionData(false); }
  function toggleQuestionAlternative(questionId: string, alternativeId: string) {
    setEliminatedQuestionAlternatives((currentState) => {
      const currentIds = currentState[questionId] || [];
      return { ...currentState, [questionId]: currentIds.includes(alternativeId) ? currentIds.filter((id) => id !== alternativeId) : [...currentIds, alternativeId] };
    });
  }

  const participants = useMemo(() => rankedParticipants(data?.participants || []), [data?.participants]);
  if (!data) return <main className="min-h-dvh bg-slate-50 p-8 text-slate-700">{message || "Carregando dashboard..."}</main>;
  const safeQuestionIndex = Math.min(questionIndex, Math.max(0, data.questions.length - 1));
  const current = data.questions[safeQuestionIndex] || null;
  const currentQuestion = current?.questions || null;
  const isAnnulled = current?.status === "annulled";
  const search = participantSearch.trim().toLocaleLowerCase("pt-BR");
  const filtered = participants.filter((item) => (!search || `${item.name} ${item.email}`.toLocaleLowerCase("pt-BR").includes(search)) && (participantFilter === "all" || item.status === participantFilter || (participantFilter === "pending" && item.result_status === "pending") || (participantFilter === "available" && item.result_status === "available"))).sort((a, b) => participantSort === "alphabetical" ? a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }) : a.rank !== null && b.rank !== null ? a.rank - b.rank || a.name.localeCompare(b.name, "pt-BR") : a.rank !== null ? -1 : b.rank !== null ? 1 : a.name.localeCompare(b.name, "pt-BR"));
  const pageCount = Math.max(1, Math.ceil(filtered.length / participantsPerPage));
  const safePage = Math.min(participantPage, pageCount - 1);
  const visible = filtered.slice(safePage * participantsPerPage, (safePage + 1) * participantsPerPage);
  const selected = participants.find((item) => item.id === selectedParticipantId) || null;
  const secondsToStart = Math.max(0, Math.ceil((new Date(data.event.starts_at).getTime() - now) / 1000));
  const countdown = `${Math.floor(secondsToStart / 3600)}h ${String(Math.floor((secondsToStart % 3600) / 60)).padStart(2, "0")}min ${String(secondsToStart % 60).padStart(2, "0")}s`;
  const completed = participants.filter((item) => item.result);
  const bands = [
    { label: "Até 39%", count: completed.filter((item) => Number(item.result?.percentage || 0) < 40).length, color: "bg-rose-400" },
    { label: "40–59%", count: completed.filter((item) => Number(item.result?.percentage || 0) >= 40 && Number(item.result?.percentage || 0) < 60).length, color: "bg-amber-400" },
    { label: "60–79%", count: completed.filter((item) => Number(item.result?.percentage || 0) >= 60 && Number(item.result?.percentage || 0) < 80).length, color: "bg-sky-400" },
    { label: "80–100%", count: completed.filter((item) => Number(item.result?.percentage || 0) >= 80).length, color: "bg-emerald-400" },
  ];

  return <main className="min-h-dvh bg-[radial-gradient(circle_at_8%_10%,rgba(255,122,0,0.06),transparent_30%),radial-gradient(circle_at_92%_18%,rgba(59,130,246,0.055),transparent_34%),linear-gradient(180deg,#fbfaf7_0%,#f8fafc_52%,#ffffff_100%)] px-5 py-7 text-slate-900 antialiased lg:px-8 lg:pb-12"><div className="relative mx-auto max-w-[1760px]">
    {data.event.professor_banner_url ? (
      <header className="relative isolate flex h-[340px] items-center overflow-hidden rounded-[26px] border border-slate-900/[0.04] bg-white shadow-[0_18px_45px_rgba(15,23,42,0.10),0_3px_10px_rgba(15,23,42,0.05)] sm:h-[300px] md:h-[280px] xl:h-[320px] 2xl:h-[340px]">
        <img src={data.event.professor_banner_url} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-white/75 sm:bg-transparent sm:bg-[linear-gradient(90deg,rgba(255,255,255,0.94)_0%,rgba(255,255,255,0.84)_22%,rgba(255,255,255,0.58)_34%,rgba(255,255,255,0.24)_44%,rgba(255,255,255,0.08)_56%,rgba(255,255,255,0.08)_100%)]" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] ring-1 ring-inset ring-slate-900/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.40)]" />
        <div className="relative z-10 w-full px-7 py-6 sm:max-w-[55%] sm:px-10 md:max-w-[49%] md:px-[clamp(42px,4.4vw,76px)] md:py-5 lg:max-w-[47%]">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">Evento de Simulado</p>
            <span className="inline-flex h-8 items-center gap-2 rounded-full border border-emerald-300/70 bg-emerald-50/90 px-4 text-[13px] font-bold text-emerald-700 shadow-[0_8px_20px_rgba(16,185,129,0.10),inset_0_1px_0_rgba(255,255,255,0.85)]"><span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" /><Radio size={13} className="sr-only" /> Atualização ao vivo</span>
          </div>
          <h1 className="mt-3 text-[clamp(32px,3.8vw,56px)] font-bold leading-[0.98] tracking-[-0.055em] text-[#07142f]">{data.event.name}</h1>
          <p className="mt-3 max-w-2xl text-[14px] leading-5 text-slate-600">{data.event.simulados?.title || "Simulado ainda não vinculado"} · dados consolidados pela tentativa oficial.</p>
        </div>
      </header>
    ) : (<>
    <header className="relative flex min-h-[210px] items-center overflow-hidden rounded-[28px] border border-orange-200/70 bg-[radial-gradient(circle_at_92%_50%,rgba(255,122,0,0.16),transparent_34%),radial-gradient(circle_at_70%_18%,rgba(255,255,255,0.95),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(255,255,255,0.94)_48%,rgba(255,247,237,0.84)_100%)] px-6 py-9 shadow-[0_28px_80px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.94)] sm:px-10 lg:px-[70px]"><div aria-hidden="true" className="pointer-events-none absolute right-32 top-7 hidden text-white/75 drop-shadow-[0_16px_30px_rgba(255,122,0,0.12)] xl:block"><Trophy size={120} strokeWidth={1.35} /></div><div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-40 h-[480px] w-[650px] rounded-[50%] border border-white/70 opacity-60 shadow-[0_0_0_18px_rgba(255,255,255,0.12),0_0_0_36px_rgba(255,255,255,0.08),0_0_0_54px_rgba(255,255,255,0.05)]" /><div className="relative flex w-full flex-col gap-8 xl:flex-row xl:items-end xl:justify-between"><div className="max-w-4xl"><div className="flex flex-wrap items-center gap-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">Evento de Simulado</p><span className="inline-flex h-8 items-center gap-2 rounded-full border border-emerald-300/70 bg-emerald-50/90 px-4 text-[13px] font-bold text-emerald-700 shadow-[0_8px_20px_rgba(16,185,129,0.10),inset_0_1px_0_rgba(255,255,255,0.85)]"><span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" /><Radio size={13} className="sr-only" /> Atualização ao vivo</span></div><h1 className="mt-4 text-[clamp(42px,4.8vw,72px)] font-bold leading-[0.98] tracking-[-0.055em] text-[#07142f]">{data.event.name}</h1><p className="mt-[18px] text-[15px] leading-[22px] text-slate-600">{data.event.simulados?.title || "Simulado ainda não vinculado"} · dados consolidados pela tentativa oficial.</p></div><div className="relative flex flex-wrap gap-3">{data.event.simulado_id && <PremiumButton href={`/professor/eventos/${id}/preview`} variant="secondary" className="min-h-[52px] rounded-[15px] px-6 shadow-[0_14px_34px_rgba(15,23,42,0.08)]" icon={<Eye size={18} />}>Ver como aluno</PremiumButton>}{data.event.effective_status === "scheduled" && data.event.simulado_id && <PremiumButton onClick={() => void action("start")} icon={<PlayCircle size={17} />}>Iniciar agora</PremiumButton>}{data.event.result_policy === "blocked" && data.summary.pending_results > 0 && <PremiumButton onClick={() => void action("release_results")} icon={<Unlock size={17} />}>Liberar resultados ({data.summary.pending_results})</PremiumButton>}</div></div></header>
    </>)}
    {data.event.professor_banner_url && (data.event.simulado_id || (data.event.result_policy === "blocked" && data.summary.pending_results > 0)) && <div className="mt-3 flex flex-wrap gap-3">{data.event.simulado_id && <PremiumButton href={`/professor/eventos/${id}/preview`} variant="secondary" className="min-h-[48px] rounded-[15px] px-5 shadow-[0_10px_26px_rgba(15,23,42,0.07)]" icon={<Eye size={18} />}>Ver como aluno</PremiumButton>}{data.event.effective_status === "scheduled" && data.event.simulado_id && <PremiumButton onClick={() => void action("start")} icon={<PlayCircle size={17} />}>Iniciar agora</PremiumButton>}{data.event.result_policy === "blocked" && data.summary.pending_results > 0 && <PremiumButton onClick={() => void action("release_results")} icon={<Unlock size={17} />}>Liberar resultados ({data.summary.pending_results})</PremiumButton>}</div>}
    {data.event.effective_status === "scheduled" && <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 px-5 py-4 text-sm text-orange-800 shadow-sm">Pré-evento · começa em <strong>{countdown}</strong> · {data.summary.registered} inscritos · {data.summary.online} online.</div>}{!data.event.simulado_id && <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 font-semibold text-amber-800 shadow-sm">Evento sem Simulado vinculado. O início permanece bloqueado até a configuração pelo administrador.</div>}{message && <p className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 px-5 py-3 text-sm text-orange-800">{message}</p>}
    <nav className="mt-[22px] grid gap-2 rounded-[18px] border border-slate-200/90 bg-white/90 p-2 shadow-[0_18px_46px_rgba(15,23,42,0.07),inset_0_1px_0_rgba(255,255,255,0.94)] sm:grid-cols-3" aria-label="Áreas da dashboard"><DashboardTab active={activeTab === "overview"} icon={<BarChart3 size={18} />} label="Visão geral" onClick={() => setActiveTab("overview")} /><DashboardTab active={activeTab === "participants"} icon={<Users size={18} />} label="Participantes" onClick={() => setActiveTab("participants")} /><DashboardTab active={activeTab === "questions"} icon={<Presentation size={18} />} label="Questões / revisão" onClick={() => setActiveTab("questions")} /></nav>

    {activeTab === "overview" && <section className="mt-6 space-y-6"><div className="grid gap-[18px] sm:grid-cols-2 xl:grid-cols-5"><MetricCard icon={<Users size={22} />} label="Participantes" value={String(data.summary.registered)} detail={`${data.summary.online} online agora`} /><MetricCard icon={<Trophy size={22} />} label="Maior nota" value={formatScore(data.summary.highest_score)} detail="Tentativa oficial" /><MetricCard icon={<Medal size={22} />} label="Menor nota" value={formatScore(data.summary.lowest_score)} detail="Tentativa oficial" /><MetricCard icon={<BarChart3 size={22} />} label="Média do evento" value={formatScore(data.summary.average_score)} detail={`${data.summary.completed} concluídos`} featured /><MetricCard icon={<Clock3 size={22} />} label="Tempo médio" value={formatTime(data.summary.average_time_seconds)} detail="Resultados oficiais" /></div><div className="grid items-stretch gap-[22px] xl:grid-cols-[minmax(0,1.75fr)_minmax(420px,0.85fr)]"><article className="relative min-h-[420px] overflow-hidden rounded-3xl border border-slate-200/90 bg-white/95 p-6 shadow-[0_22px_58px_rgba(15,23,42,0.065),inset_0_1px_0_rgba(255,255,255,0.94)] sm:p-8"><div className="flex items-start justify-between gap-4"><div className="flex gap-4"><span className="h-[52px] w-1 rounded-full bg-gradient-to-b from-[#ff8a00] to-[#ff6b00] shadow-[0_10px_22px_rgba(249,115,22,0.20)]" /><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">Distribuição de desempenho</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-slate-950">Faixas de aproveitamento</h2></div></div><span className="rounded-full border border-slate-300/80 bg-slate-50/90 px-3.5 py-1.5 text-[13px] font-semibold text-slate-500">{completed.length} resultados</span></div><div className="mt-8 space-y-2">{bands.map((band) => <div key={band.label} className="grid min-h-[54px] grid-cols-[88px_1fr_28px] items-center gap-[18px]"><span className="text-sm text-slate-700">{band.label}</span><div className="grid grid-cols-10 gap-1.5" aria-label={`${band.label}: ${band.count} participantes`}>{Array.from({ length: 10 }, (_, index) => <span key={index} className={`h-2.5 rounded-full ${index < Math.round((band.count / Math.max(1, completed.length)) * 10) ? band.color : "bg-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]"}`} />)}</div><strong className="text-right text-lg tabular-nums text-slate-950">{band.count}</strong></div>)}</div></article><article className="min-h-[420px] rounded-3xl border border-orange-200/80 bg-[radial-gradient(circle_at_92%_6%,rgba(255,122,0,0.10),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.94),rgba(255,250,245,0.92))] p-6 shadow-[0_22px_58px_rgba(15,23,42,0.065),inset_0_1px_0_rgba(255,255,255,0.94)] sm:p-[30px]"><div className="flex gap-4"><span className="h-[52px] w-1 rounded-full bg-gradient-to-b from-[#ff8a00] to-[#ff6b00]" /><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">Situação ao vivo</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-slate-950">Participação geral</h2></div></div><div className="mt-6 grid grid-cols-2 gap-3.5"><CompactMetric label="Concluídos" value={data.summary.completed} tone="text-emerald-600" icon={<CheckCircle2 size={21} />} iconTone="bg-emerald-50 text-emerald-600" /><CompactMetric label="Realizando" value={data.summary.taking} tone="text-blue-600" icon={<Loader2 size={21} />} iconTone="bg-blue-50 text-blue-600" /><CompactMetric label="Não iniciaram" value={data.summary.not_started} icon={<UserRound size={21} />} iconTone="bg-slate-100 text-slate-600" /><CompactMetric label="Pendentes" value={data.summary.pending_results} tone="text-orange-600" icon={<Hourglass size={21} />} iconTone="bg-orange-50 text-orange-600" /></div><div className="my-7 h-px bg-gradient-to-r from-transparent via-slate-300/80 to-transparent" /><div className="grid grid-cols-[54px_1fr] items-center gap-4"><div className="flex h-[54px] w-[54px] items-center justify-center rounded-[18px] border border-orange-200 bg-orange-50 text-orange-600"><Target size={28} /></div><div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Precisão consolidada</p><p className="mt-2 text-[42px] font-bold leading-[0.95] tracking-[-0.045em] text-[#07142f]">{formatPercent(data.summary.accuracy_percent)}</p><p className="mt-2 text-sm text-slate-500">Acertos nas tentativas oficiais</p></div></div></article></div></section>}

    {activeTab === "participants" && (
      <section className="mt-9">
        <div className="grid items-end gap-6 sm:grid-cols-[1fr_auto]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">Ranking oficial</p>
            <h2 className="mt-2 text-[28px] font-bold leading-[34px] tracking-[-0.035em] text-slate-950">Participantes</h2>
            <p className="mt-2 text-sm leading-5 text-slate-600">Mais acertos, depois menor tempo total com precisão de milissegundos.</p>
          </div>
          <span className="inline-flex h-[34px] items-center justify-center rounded-full border border-slate-300/80 bg-white/85 px-3.5 text-[13px] font-semibold text-slate-500 shadow-[0_10px_24px_rgba(15,23,42,0.045),inset_0_1px_0_rgba(255,255,255,0.90)]">
            {filtered.length} de {participants.length} participantes
          </span>
        </div>

        <div className="mt-5 inline-flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200/90 bg-white/80 p-1.5 shadow-[0_10px_26px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.92)]" aria-label="Ordenação dos participantes">
          <button type="button" aria-pressed={participantSort === "score"} onClick={() => { setParticipantSort("score"); setParticipantPage(0); }} className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-[13px] font-bold transition duration-200 ${participantSort === "score" ? "border border-orange-200 bg-orange-50 text-orange-700 shadow-[0_8px_18px_rgba(249,115,22,0.10)]" : "border border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}><BarChart3 size={16} strokeWidth={2.1} />Por nota</button>
          <button type="button" aria-pressed={participantSort === "alphabetical"} onClick={() => { setParticipantSort("alphabetical"); setParticipantPage(0); }} className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-[13px] font-bold transition duration-200 ${participantSort === "alphabetical" ? "border border-blue-200 bg-blue-50 text-blue-700 shadow-[0_8px_18px_rgba(59,130,246,0.09)]" : "border border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}><ArrowDownAZ size={16} strokeWidth={2.1} />Ordem alfabética</button>
        </div>

        <div className="mt-[26px] grid items-end gap-[18px] md:grid-cols-[minmax(0,1fr)_320px]">
          <PremiumInput
            label="Buscar participante"
            icon={<Search size={17} strokeWidth={2.1} />}
            className="h-[54px] rounded-2xl border-slate-300/80 bg-white/90 px-[18px] shadow-[0_10px_24px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.92)]"
            value={participantSearch}
            placeholder="Buscar participante por nome ou e-mail"
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => { setParticipantSearch(event.target.value); setParticipantPage(0); }}
          />
          <PremiumSelect
            label="Situação"
            className="h-[54px] rounded-2xl border-slate-300/80 bg-white/90 px-[18px] shadow-[0_10px_24px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.92)]"
            value={participantFilter}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) => { setParticipantFilter(event.target.value); setParticipantPage(0); }}
          >
            <option value="all">Todas</option><option value="not_started">Não iniciados</option><option value="in_progress">Em andamento</option><option value="completed">Concluídos</option><option value="not_completed">Não realizados</option><option value="pending">Aguardando resultado</option><option value="available">Resultado disponível</option>
          </PremiumSelect>
        </div>

        <div className="mt-[26px] overflow-hidden rounded-[18px] border border-slate-200/90 bg-white/95 shadow-[0_22px_58px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.94)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="h-14 border-b border-slate-200/90 bg-gradient-to-b from-slate-50/95 to-white/95">
                <tr>{["Posição", "Aluno", "Situação", "Nota", "Detalhes"].map((label) => <th key={label} className={`${label === "Detalhes" ? "text-right" : "text-left"} px-5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 lg:px-7`}>{label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70">
                {visible.map((item, index) => {
                  const status = participantStatus[item.status];
                  const displayedPosition = participantSort === "score" ? item.rank : safePage * participantsPerPage + index + 1;
                  const trophyTone = item.rank === 1 ? "fill-yellow-300 text-yellow-400 drop-shadow-[0_5px_9px_rgba(250,204,21,0.55)]" : item.rank === 2 ? "fill-slate-200 text-slate-400 drop-shadow-[0_5px_9px_rgba(148,163,184,0.38)]" : "fill-amber-600 text-amber-700 drop-shadow-[0_5px_9px_rgba(180,83,9,0.34)]";
                  return (
                    <tr key={item.id} className={`${index % 2 ? "bg-slate-50/30" : "bg-white"} h-[98px] transition-colors duration-150 hover:bg-orange-50/40`}>
                      <td className="px-5 lg:px-7"><div className="flex items-center gap-2.5 text-[21px] font-bold leading-none tracking-[-0.03em] text-slate-700">{participantSort === "score" && item.rank && item.rank <= 3 && <Trophy size={24} strokeWidth={2.15} className={trophyTone} />}<span>{displayedPosition ? `${displayedPosition}º` : "—"}</span>{participantSort === "score" && item.rank_tied && <span className="rounded-full bg-violet-50 px-2 py-1 text-[9px] tracking-normal text-violet-700">EMPATE</span>}</div></td>
                      <td className="max-w-[420px] px-5 lg:px-7"><div className="grid grid-cols-[44px_1fr] items-center gap-3.5"><span className={`flex h-11 w-11 items-center justify-center rounded-full border text-sm font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.90)] ${item.status === "not_started" ? "border-slate-300/80 bg-slate-100 text-slate-600" : "border-orange-200 bg-gradient-to-br from-orange-100 to-orange-50 text-orange-600 shadow-orange-100"}`}>{participantInitials(item.name)}</span><div className="min-w-0"><p className="truncate text-[15px] font-bold leading-5 tracking-[-0.015em] text-slate-950">{item.name}</p><p className="mt-0.5 truncate text-[13px] leading-[18px] text-slate-500">{item.email}</p></div></div></td>
                      <td className="px-5 lg:px-7"><span className={`inline-flex h-7 items-center rounded-full border px-3 text-xs font-bold ${status.className}`}>{status.label}</span></td>
                      <td className="px-5 text-base font-bold tabular-nums text-slate-950 lg:px-7">{formatScore(item.result?.display_score ?? null)}</td>
                      <td className="px-5 text-right lg:px-7"><PremiumButton variant="secondary" className="min-h-11 rounded-[14px] px-[18px] shadow-[0_10px_24px_rgba(15,23,42,0.045)]" onClick={() => setSelectedParticipantId(item.id)} icon={<Eye size={16} strokeWidth={2.1} />}>Ver</PremiumButton></td>
                    </tr>
                  );
                })}
                {visible.length === 0 && <tr><td colSpan={5} className="bg-slate-50/50 px-6 py-12 text-center"><SearchX size={46} className="mx-auto text-slate-400" /><p className="mt-3.5 text-lg font-semibold leading-7 text-slate-700">Nenhum participante encontrado</p><p className="mt-1 text-sm text-slate-500">Ajuste os filtros ou aguarde novas inscrições no Evento.</p></td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-[26px] grid items-center gap-5 sm:grid-cols-[1fr_auto_1fr]">
          <label className="flex items-center gap-3 text-sm text-slate-600">Itens por página:<select value={participantsPerPage} onChange={(event) => { setParticipantsPerPage(Number(event.target.value)); setParticipantPage(0); }} className="h-11 min-w-[84px] rounded-[14px] border border-slate-300/80 bg-white/90 px-3.5 font-semibold text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.035)] outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100"><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></label>
          <div className="flex items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white/80 p-1.5 shadow-sm">
            <PaginationButton label="Primeira página" disabled={safePage === 0} onClick={() => setParticipantPage(0)}><ChevronFirst size={17} /></PaginationButton><PaginationButton label="Página anterior" disabled={safePage === 0} onClick={() => setParticipantPage(safePage - 1)}><ChevronLeft size={17} /></PaginationButton><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-orange-300 bg-orange-50 text-sm font-bold text-orange-600 shadow-[0_8px_20px_rgba(249,115,22,0.12)]">{safePage + 1}</span><PaginationButton label="Próxima página" disabled={safePage === pageCount - 1} onClick={() => setParticipantPage(safePage + 1)}><ChevronRight size={17} /></PaginationButton><PaginationButton label="Última página" disabled={safePage === pageCount - 1} onClick={() => setParticipantPage(pageCount - 1)}><ChevronLast size={17} /></PaginationButton>
          </div>
          <p className="text-sm text-slate-600 sm:justify-self-end">Página {safePage + 1} de {pageCount}</p>
        </div>
      </section>
    )}

    {activeTab === "questions" && <section className="mt-[34px] font-sans text-sm leading-5 text-slate-700">
      <div className="grid items-end gap-6 sm:grid-cols-[1fr_auto]"><div><p className="text-xs font-bold uppercase leading-4 tracking-[0.18em] text-orange-600">Revisão pedagógica</p><h2 className="mt-2 text-[28px] font-bold leading-[34px] tracking-[-0.035em] text-slate-950">Questões / modo aula</h2><p className="mt-2 text-sm text-slate-600">Apresente primeiro. Revele gabarito, distribuição e métricas somente quando desejar.</p></div>{current && <span className="inline-flex h-[42px] items-center justify-center rounded-full border border-slate-300/80 bg-white/90 px-5 font-bold text-slate-950 shadow-[0_10px_24px_rgba(15,23,42,0.045)]">Questão {safeQuestionIndex + 1} de {data.questions.length}</span>}</div>
      {current && currentQuestion ? <div><div className="mt-6 flex gap-3.5 overflow-x-auto pb-2">{data.questions.map((question, index) => <button key={question.id} type="button" onClick={() => selectQuestion(index)} className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-[15px] font-bold transition duration-200 hover:-translate-y-px ${index === safeQuestionIndex ? "border-orange-400/70 bg-gradient-to-br from-[#ff8a00] via-[#ff6b00] to-orange-500 text-white shadow-[0_14px_30px_rgba(249,115,22,0.26)]" : "border-slate-300/80 bg-white/90 text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.04)] hover:border-orange-300"}`}>{index + 1}</button>)}</div>
        <div className="mt-5"><QuestionDisplayCard question={currentQuestion} orderLabel={`Questão ${current.order_number}`} showCorrect={showQuestionData && !isAnnulled} markIncorrect={showQuestionData && !isAnnulled} presentationMode presentationFontScale={questionFontScale} eliminatedAlternativeIds={eliminatedQuestionAlternatives[currentQuestion.id] || []} onToggleEliminate={(alternativeId) => toggleQuestionAlternative(currentQuestion.id, alternativeId)} presentationControls={<div className="inline-flex items-center gap-1 rounded-[14px] border border-slate-300/80 bg-white/90 p-1.5 shadow-[0_8px_20px_rgba(15,23,42,0.045)]"><span className="flex h-9 items-center gap-2 px-2 text-xs font-bold text-slate-500"><Type size={16} /> Texto</span><button type="button" aria-label="Diminuir tamanho do texto" title="Diminuir texto" disabled={questionFontScale === 0} onClick={() => setQuestionFontScale((value) => Math.max(0, value - 1))} className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-35"><Minus size={17} /></button><span className="min-w-8 text-center text-xs font-bold tabular-nums text-slate-600">{questionFontScale + 1}/4</span><button type="button" aria-label="Aumentar tamanho do texto" title="Aumentar texto" disabled={questionFontScale === 3} onClick={() => setQuestionFontScale((value) => Math.min(3, value + 1))} className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-35"><Plus size={17} /></button></div>} extraBadges={isAnnulled ? <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">Questão anulada</span> : undefined} renderAlternativeMeta={showQuestionData ? (alternative) => { const count = current.alternative_counts[alternative.id || ""] || 0; const percentage = current.answered ? count / current.answered * 100 : 0; return <AlternativeDistribution count={count} percentage={percentage} isCorrect={Boolean(alternative.is_correct)} />; } : undefined} /></div>
        {showQuestionData && <div className="mt-[22px] rounded-[22px] border border-slate-200/90 bg-white/90 p-[18px] shadow-[0_18px_46px_rgba(15,23,42,0.055)]"><div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-5"><CompactMetric label="Total considerado" value={current.total_considered} icon={<Users size={21} />} iconTone="bg-blue-50 text-blue-600" /><CompactMetric label="Acertos" value={isAnnulled ? "—" : current.correct} tone="text-emerald-600" icon={<CheckCircle2 size={21} />} iconTone="bg-emerald-50 text-emerald-600" /><CompactMetric label="Erros" value={isAnnulled ? "—" : current.wrong} tone="text-red-600" icon={<XCircle size={21} />} iconTone="bg-red-50 text-red-600" /><CompactMetric label="Brancos" value={current.blank} icon={<Circle size={21} />} iconTone="bg-slate-100 text-slate-600" /><CompactMetric label="Tempo médio" value={formatTime(current.average_time_seconds)} icon={<Clock3 size={21} />} iconTone="bg-violet-50 text-violet-600" /></div></div>}
        <div className="mt-[22px] grid gap-4 sm:grid-cols-[1fr_1.2fr_1fr]"><PremiumButton variant="secondary" className="min-h-14 rounded-2xl shadow-[0_10px_24px_rgba(15,23,42,0.04)]" disabled={safeQuestionIndex === 0} onClick={() => selectQuestion(safeQuestionIndex - 1)} icon={<ArrowLeft size={18} />}>Anterior</PremiumButton><PremiumButton variant={showQuestionData ? "secondary" : "primary"} className={`min-h-14 rounded-2xl ${showQuestionData ? "border-slate-800 text-slate-900" : "shadow-[0_18px_38px_rgba(249,115,22,0.30)]"}`} onClick={() => setShowQuestionData((value) => !value)} icon={showQuestionData ? <EyeOff size={18} /> : <Eye size={18} />}>{showQuestionData ? "Ocultar dados" : "Exibir dados"}</PremiumButton><PremiumButton variant="secondary" className="min-h-14 rounded-2xl shadow-[0_10px_24px_rgba(15,23,42,0.04)]" disabled={safeQuestionIndex === data.questions.length - 1} onClick={() => selectQuestion(safeQuestionIndex + 1)}>Próxima <ArrowRight size={18} /></PremiumButton></div>
      </div> : <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-white/90 p-10 text-center text-slate-500">Este Evento ainda não possui questões disponíveis para revisão.</div>}
    </section>}
  </div>{selected && <ParticipantDetailModal participant={selected} onClose={() => setSelectedParticipantId(null)} />}</main>;
}

function ParticipantDetailModal({ participant, onClose }: { participant: Participant; onClose: () => void }) {
  const preciseTime = formatPreciseTime(participant.result?.time_spent_ms);
  const status = participantStatus[participant.status];
  const statusTone = participant.status === "completed"
    ? "border-emerald-300/80 bg-emerald-50 text-emerald-700"
    : participant.status === "in_progress"
      ? "border-blue-300/80 bg-blue-50 text-blue-700"
      : participant.status === "disqualified"
        ? "border-red-300/80 bg-red-50 text-red-700"
        : participant.status === "not_completed" || participant.status === "expired"
          ? "border-amber-300/80 bg-amber-50 text-amber-700"
          : "border-slate-300/80 bg-slate-100 text-slate-600";

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/60 p-4 font-sans backdrop-blur-[9px] sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="participant-detail-title"
        aria-describedby="participant-detail-description"
        className="animate-modal-in relative max-h-[calc(100dvh-32px)] w-full max-w-[860px] overflow-x-hidden overflow-y-auto rounded-3xl border border-orange-300/70 bg-[radial-gradient(circle_at_96%_8%,rgba(255,122,0,0.105),transparent_32%),radial-gradient(circle_at_10%_2%,rgba(255,255,255,0.96),transparent_36%),linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(255,255,255,0.94)_52%,rgba(255,247,237,0.88)_100%)] p-7 text-slate-900 shadow-[0_38px_95px_rgba(15,23,42,0.32),0_18px_44px_rgba(15,23,42,0.16),inset_0_1px_0_rgba(255,255,255,0.94)] [scrollbar-width:none] sm:p-8 lg:rounded-[28px] lg:p-[42px] [&::-webkit-scrollbar]:hidden"
      >
        <div aria-hidden="true" className="pointer-events-none absolute -right-28 -top-28 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(255,122,0,0.13),transparent_68%)]" />
        <div className="relative flex h-[66px] w-[66px] items-center justify-center rounded-[18px] border border-orange-200/70 bg-gradient-to-b from-orange-50 to-[#fff1e7] text-[#ff6b00] shadow-[0_12px_28px_rgba(249,115,22,0.08),inset_0_1px_0_rgba(255,255,255,0.92)]">
          <UserRound size={28} strokeWidth={2.1} />
        </div>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          aria-label="Fechar detalhes do participante"
          className="absolute right-5 top-5 flex h-[52px] w-[52px] items-center justify-center rounded-full border border-slate-300/70 bg-white/80 text-slate-600 shadow-[0_12px_28px_rgba(15,23,42,0.075),inset_0_1px_0_rgba(255,255,255,0.92)] transition duration-200 hover:-translate-y-px hover:border-orange-300 hover:text-orange-600 hover:shadow-[0_16px_34px_rgba(15,23,42,0.10),0_0_0_4px_rgba(255,122,0,0.055)] sm:right-[30px] sm:top-[30px]"
        >
          <X size={20} strokeWidth={2.1} />
        </button>

        <p className="relative mt-7 text-xs font-bold uppercase leading-4 tracking-[0.18em] text-orange-600">Informação</p>
        <h2 id="participant-detail-title" className="relative mt-2.5 pr-16 text-[28px] font-bold leading-[1.12] tracking-[-0.04em] text-[#07142f] sm:text-[34px] sm:leading-[1.08]">{participant.name}</h2>
        <p id="participant-detail-description" className="relative mt-3 text-[15px] leading-[22px] text-slate-600">Desempenho consolidado da tentativa oficial deste Evento.</p>

        <div className="relative mt-[30px] grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
          <ParticipantMetricCard label="Posição" value={participant.rank ? `${participant.rank}º${participant.rank_tied ? " · empate" : ""}` : "—"} icon={<Trophy size={20} strokeWidth={2.2} />} iconTone="text-orange-500" />
          <ParticipantMetricCard label="Nota" value={formatScore(participant.result?.display_score ?? null)} icon={<BarChart3 size={20} strokeWidth={2.2} />} iconTone="text-orange-600" />
          <ParticipantMetricCard label="Acertos" value={String(participant.result?.correct_count ?? "—")} valueTone={participant.result ? "text-emerald-600" : "text-slate-400"} icon={<CheckCircle2 size={20} strokeWidth={2.2} />} iconTone="text-emerald-500" />
          <ParticipantMetricCard label="Erros" value={String(participant.result?.wrong_count ?? "—")} valueTone={participant.result ? "text-red-600" : "text-slate-400"} icon={<XCircle size={20} strokeWidth={2.2} />} iconTone="text-red-500" />
          <ParticipantMetricCard label="Brancos" value={String(participant.result?.blank_count ?? "—")} icon={<Circle size={20} strokeWidth={2.2} />} iconTone="text-slate-500" />
          <ParticipantMetricCard label="Tempo total" value={formatTimeMs(participant.result?.time_spent_ms)} detail={preciseTime?.detail} compact icon={<Clock3 size={20} strokeWidth={2.2} />} iconTone="text-blue-600" />
          <ParticipantMetricCard label="Tentativa oficial" value={participant.representative_attempt_number ? <span className="inline-flex h-9 min-w-[58px] items-center justify-center rounded-full border border-blue-300/70 bg-blue-50 px-4 text-[15px] font-bold tracking-[-0.01em] text-blue-600">#{participant.representative_attempt_number}</span> : "—"} icon={<ShieldCheck size={20} strokeWidth={2.2} />} iconTone="text-blue-600" />
          <ParticipantMetricCard label="Situação" value={<span className={`inline-flex min-h-9 items-center justify-center rounded-full border px-4 text-sm font-bold tracking-[-0.01em] ${statusTone}`}>{status.label}</span>} icon={<CheckCircle2 size={20} strokeWidth={2.2} />} iconTone={participant.status === "completed" ? "text-emerald-500" : "text-slate-500"} />
        </div>

        <button type="button" onClick={onClose} className="relative mt-[30px] flex min-h-14 w-full items-center justify-center rounded-2xl border border-orange-400/70 bg-gradient-to-br from-[#ff8a00] via-[#ff6b00] to-orange-500 text-[15px] font-bold text-white shadow-[0_18px_38px_rgba(249,115,22,0.30),inset_0_1px_0_rgba(255,255,255,0.30)] transition duration-200 hover:-translate-y-px hover:shadow-[0_22px_46px_rgba(249,115,22,0.38)] active:translate-y-0">Entendi</button>
      </section>
    </div>
  );
}

function ParticipantMetricCard({ label, value, detail, icon, iconTone, valueTone = "text-[#07142f]", compact = false }: { label: string; value: React.ReactNode; detail?: string; icon: React.ReactNode; iconTone: string; valueTone?: string; compact?: boolean }) {
  return <article className="relative flex min-h-[116px] flex-col justify-between overflow-hidden rounded-[18px] border border-slate-300/80 bg-white/75 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05),inset_0_1px_0_rgba(255,255,255,0.92)] lg:min-h-[126px] lg:p-5"><div className="flex items-center gap-2.5"><span className={`shrink-0 ${iconTone}`}>{icon}</span><p className="text-[11px] font-bold uppercase leading-[14px] tracking-[0.14em] text-slate-500">{label}</p></div><div className="mt-[18px]"><div className={`${compact ? "text-[28px]" : "text-[30px]"} font-bold leading-none tracking-[-0.04em] tabular-nums ${valueTone}`}>{value}</div>{detail && <p className="mt-1 text-xs leading-4 text-slate-500">{detail}</p>}</div></article>;
}

function AlternativeDistribution({ count, percentage, isCorrect }: { count: number; percentage: number; isCorrect: boolean }) {
  const heights = ["h-[5px]", "h-[7px]", "h-[9px]", "h-3", "h-4", "h-[21px]", "h-[26px]", "h-8", "h-[38px]", "h-11"];
  const formatted = percentage.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return <div className="ml-auto flex shrink-0 items-center gap-3 sm:gap-4 lg:gap-[18px]">
    <div className="hidden h-11 min-w-[180px] items-end justify-end gap-1.5 opacity-90 md:flex xl:min-w-[260px] xl:gap-2" aria-hidden="true">
      {heights.map((height, index) => {
        const active = percentage > index * 10;
        return <span key={height} className={`${height} w-3 rounded-t-[7px] rounded-b-[3px] border transition duration-300 [transform:perspective(90px)_rotateX(5deg)] [transform-origin:bottom_center] xl:w-[22px] ${active ? isCorrect ? "border-emerald-400/40 bg-gradient-to-b from-emerald-300 via-emerald-500 to-emerald-600 shadow-[0_8px_16px_rgba(16,185,129,0.18),inset_0_1px_0_rgba(255,255,255,0.42)]" : "border-red-400/40 bg-gradient-to-b from-rose-200 via-rose-400 to-red-500 shadow-[0_8px_16px_rgba(239,68,68,0.16),inset_0_1px_0_rgba(255,255,255,0.42)]" : "border-slate-300/30 bg-gradient-to-b from-slate-100/60 to-slate-200/40 opacity-40"}`} />;
      })}
    </div>
    <span className={`flex h-14 min-w-[92px] flex-col items-center justify-center rounded-[14px] border bg-white/90 px-3 shadow-[0_10px_24px_rgba(15,23,42,0.045),inset_0_1px_0_rgba(255,255,255,0.92)] sm:min-w-[104px] ${isCorrect ? "border-emerald-300/70" : "border-red-300/60"}`}><strong className="text-lg leading-[22px] tracking-[-0.035em] tabular-nums text-[#07142f] sm:text-xl">{formatted}%</strong><small className="mt-0.5 text-xs font-semibold leading-4 text-slate-500">{count} {count === 1 ? "aluno" : "alunos"}</small></span>
  </div>;
}

function DashboardTab({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) { return <button type="button" onClick={onClick} className={`flex min-h-14 items-center justify-center gap-2.5 rounded-[13px] px-4 text-sm transition duration-200 ${active ? "bg-gradient-to-br from-[#ff8a00] via-[#ff6b00] to-orange-500 font-bold text-white shadow-[0_16px_34px_rgba(249,115,22,0.28),inset_0_1px_0_rgba(255,255,255,0.28)]" : "font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-950"}`}>{icon}{label}</button>; }
function PaginationButton({ children, label, disabled, onClick }: { children: React.ReactNode; label: string; disabled: boolean; onClick: () => void }) { return <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300/80 bg-white/90 text-slate-500 shadow-[0_8px_18px_rgba(15,23,42,0.035)] transition hover:-translate-y-px hover:border-orange-200 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0">{children}</button>; }
function MetricCard({ icon, label, value, detail, featured = false }: { icon: React.ReactNode; label: string; value: string; detail: string; featured?: boolean }) { return <article className={`relative min-h-[170px] overflow-hidden rounded-[22px] border p-6 shadow-[0_18px_46px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.94)] transition duration-200 hover:-translate-y-px hover:shadow-[0_22px_52px_rgba(15,23,42,0.08)] ${featured ? "border-orange-300/80 bg-[radial-gradient(circle_at_92%_12%,rgba(255,122,0,0.12),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.94),rgba(255,250,245,0.94))]" : "border-slate-200/90 bg-white/95"}`}><div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${featured ? "bg-gradient-to-br from-[#ff8a00] via-[#ff6b00] to-orange-500 text-white shadow-[0_12px_28px_rgba(249,115,22,0.25)]" : "border border-orange-100 bg-orange-50 text-orange-600"}`}>{icon}</div><p className="mt-[22px] text-[11px] font-bold uppercase leading-[14px] tracking-[0.16em] text-slate-500">{label}</p><p className="mt-3 text-[clamp(30px,2.6vw,42px)] font-bold leading-[0.95] tracking-[-0.045em] text-slate-950 tabular-nums">{value}</p><p className="mt-3 text-sm leading-5 text-slate-600">{label === "Participantes" && <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.10)]" />}{detail}</p></article>; }
function CompactMetric({ label, value, tone = "text-slate-950", icon, iconTone = "bg-slate-100 text-slate-600" }: { label: string; value: string | number; tone?: string; icon?: React.ReactNode; iconTone?: string }) { return <div className="grid min-h-[86px] grid-cols-[42px_1fr] items-center gap-3 rounded-2xl border border-slate-300/70 bg-white/75 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.035),inset_0_1px_0_rgba(255,255,255,0.90)]"><div className={`flex h-[42px] w-[42px] items-center justify-center rounded-[14px] ${iconTone}`}>{icon}</div><div><p className="text-[10px] font-bold uppercase leading-[14px] tracking-[0.14em] text-slate-500">{label}</p><p className={`mt-1.5 text-[26px] font-bold leading-none tracking-[-0.035em] tabular-nums ${tone}`}>{value}</p></div></div>; }
