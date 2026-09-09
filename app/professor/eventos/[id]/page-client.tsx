"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowDownAZ, ArrowLeft, ArrowRight, Ban, BarChart3, Bird, CheckCircle2, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Circle, Clock3, Eye, EyeOff, FileText, Hourglass, Loader2, Medal, Minus, PlayCircle, Plus, Presentation, Radio, RotateCcw, Search, SearchX, ShieldCheck, Sparkles, Target, Trophy, Type, Unlock, UserRound, Users, X, XCircle } from "lucide-react";
import { supabase } from "@/app/lib/supabase/client";
import { rankedParticipants } from "@/lib/eventRanking";
import { formatRankingName } from "@/lib/formatRankingName";
import type { EventInsightsSummary, QuestionInsight, TopicDifficultyBand, TopicInsight } from "@/lib/eventInsights";
import { richTextToPlainText } from "@/lib/utils/rich-text";
import PremiumCard from "@/app/components/ui/PremiumCard";
import PremiumButton from "@/app/components/ui/PremiumButton";
import PremiumInput from "@/app/components/ui/PremiumInput";
import PremiumSelect from "@/app/components/ui/PremiumSelect";
import QuestionDisplayCard from "@/app/components/questions/QuestionDisplayCard";
import ProfessorEventBannerFrame from "./ProfessorEventBannerFrame";
import SimuladoControlMenu from "./SimuladoControlMenu";

type Tab = "overview" | "participants" | "questions" | "insights";
type Alternative = { id: string; label: string | null; text: string | null; image_url: string | null; is_correct: boolean; order_number: number | null };
type ClassroomQuestion = { id: string; order_number: number; status: string; questions: { id: string; code: string | null; statement: string | null; image_url: string | null; year: number | null; question_type: string | null; question_alternatives: Alternative[] } | null; answered: number; total_considered: number; correct: number; wrong: number; blank: number; accuracy_percent: number | null; error_percent: number | null; average_time_seconds: number; alternative_counts: Record<string, number> };
type Participant = { id: string; name: string; email: string; joined_at: string; status: "not_started" | "not_completed" | "in_progress" | "completed" | "disqualified" | "admin_terminated" | "expired"; attempt_count: number; representative_attempt_id: string | null; representative_attempt_number: number | null; attempt: { id: string; status: string; attempt_number: number; started_at: string | null; submitted_at: string | null; time_spent_seconds: number | null; is_representative: boolean } | null; result: { display_score: number | null; percentage: number | null; correct_count: number; wrong_count: number; blank_count: number; total_questions: number; time_spent_ms: number; owl_help_used_count: number; focus_violation_count: number; difficulty_topics: string[] } | null; result_status: "not_available" | "pending" | "available"; result_released_at: string | null; is_online: boolean; rank?: number | null; rank_tied?: boolean };
type Dashboard = { event: { id: string; name: string; simulado_id: string | null; effective_status: string; result_policy: string; starts_at: string; professor_banner_url?: string | null; professor_banner_position_x?: number; professor_banner_position_y?: number; simulados?: { title?: string } }; summary: { registered: number; online: number; not_started: number; taking: number; completed: number; pending_results: number; accuracy_percent: number | null; error_percent: number | null; blank_answers: number; average_time_seconds: number; highest_score: number | null; lowest_score: number | null; average_score: number | null }; participants: Participant[]; questions: ClassroomQuestion[]; insights: EventInsightsSummary };

// Classificação visual exibida ao professor na guia Insights — nomenclatura
// e cores definidas no refinamento de UX (2026-09-10); os limiares em si
// (75/50/25%) são calculados uma única vez em lib/eventInsights.ts
// (classifyTopicDifficultyBand), nunca reimplementados aqui.
const TOPIC_BAND_META: Record<TopicDifficultyBand, { label: string; badge: string }> = {
  extreme: { label: "Extrema", badge: "border-red-300/80 bg-red-50 text-red-700" },
  high: { label: "Alta", badge: "border-orange-300/80 bg-orange-50 text-orange-700" },
  medium: { label: "Média", badge: "border-amber-300/80 bg-amber-50 text-amber-700" },
  low: { label: "Baixa", badge: "border-emerald-300/80 bg-emerald-50 text-emerald-700" },
};

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

export default function ProfessorEventoClient({ id }: { id: string }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [showQuestionData, setShowQuestionData] = useState(false);
  const [questionFontScale, setQuestionFontScale] = useState(1);
  const [eliminatedQuestionAlternatives, setEliminatedQuestionAlternatives] = useState<Record<string, string[]>>({});
  const [annulmentBusy, setAnnulmentBusy] = useState(false);
  const [participantSearch, setParticipantSearch] = useState("");
  const [participantFilter, setParticipantFilter] = useState("all");
  const [participantSort, setParticipantSort] = useState<"score" | "alphabetical">("score");
  const [participantPage, setParticipantPage] = useState(0);
  const [participantsPerPage, setParticipantsPerPage] = useState(DEFAULT_PARTICIPANTS_PER_PAGE);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [previewQuestionRelationId, setPreviewQuestionRelationId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [professorName, setProfessorName] = useState("");
  const [controlBusy, setControlBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [rankingPdfBusy, setRankingPdfBusy] = useState(false);

  // Proteção contra resposta HTTP fora de ordem: cada chamada de load()
  // aborta a requisição anterior ainda em voo antes de iniciar a nova, e só
  // aplica setData/setMessage se a resposta corresponder à requisição mais
  // recente (loadAbortRef.current === controller). Sem isso, uma resposta
  // mais antiga que demore mais para chegar (jitter de rede, GC do
  // servidor) pode sobrescrever um estado mais novo já aplicado pelo poll
  // seguinte — mesmo padrão já usado em app/questoes/importar/page-client.tsx.
  const loadAbortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getSession();
    if (!auth.session) return;
    setProfessorName(String(auth.session.user.user_metadata.full_name || auth.session.user.user_metadata.name || "").trim().replace(/^professor(?:a)?\s+/i, ""));
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    try {
      const response = await fetch(`/api/professor/events/${id}`, { cache: "no-store", headers: { Authorization: `Bearer ${auth.session.access_token}` }, signal: controller.signal });
      const json = await response.json();
      if (loadAbortRef.current !== controller) return;
      if (json.ok) setData(json); else setMessage(json.message);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      throw error;
    }
  }, [id]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 10_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      loadAbortRef.current?.abort();
    };
  }, [load]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1_000); return () => window.clearInterval(timer); }, []);

  async function action(value: string, payload: Record<string, string> = {}) {
    const { data: auth } = await supabase.auth.getSession();
    if (!auth.session) return { ok: false, message: "Sua sessão expirou. Entre novamente para continuar." };
    setControlBusy(true);
    try {
      const response = await fetch(`/api/professor/events/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.session.access_token}` }, body: JSON.stringify({ action: value, ...payload }) });
      const json = await response.json() as { ok?: boolean; message?: string };
      const actionMessage = json.message || "Não foi possível concluir a ação.";
      setMessage(actionMessage);
      if (json.ok) await load();
      return { ok: Boolean(json.ok), message: actionMessage };
    } catch {
      const actionMessage = "Não foi possível comunicar com o servidor. Tente novamente.";
      setMessage(actionMessage);
      return { ok: false, message: actionMessage };
    } finally {
      setControlBusy(false);
    }
  }
  async function generateExamPdf() {
    const { data: auth } = await supabase.auth.getSession();
    if (!auth.session) { setMessage("Sua sessão expirou. Entre novamente para continuar."); return; }
    setPdfBusy(true);
    try {
      const response = await fetch(`/api/professor/events/${id}/exam-pdf`, { cache: "no-store", headers: { Authorization: `Bearer ${auth.session.access_token}` } });
      const json = await response.json();
      if (!json.ok) { setMessage(json.message || "Não foi possível gerar o PDF da prova."); return; }
      const { downloadNeutralSimuladoPdf } = await import("@/app/lib/pdf/simulado-result-pdf");
      await downloadNeutralSimuladoPdf({ meta: json.simulado, questions: json.questions });
    } catch {
      setMessage("Não foi possível comunicar com o servidor. Tente novamente.");
    } finally {
      setPdfBusy(false);
    }
  }
  async function toggleQuestionAnnulment(relationId: string, targetStatus: "active" | "annulled") {
    const confirmed = window.confirm(
      targetStatus === "annulled"
        ? "Anular esta questão? Todos os participantes concluídos deste Simulado passam a receber o ponto integral dela, e os resultados afetados serão recalculados imediatamente."
        : "Desanular esta questão? Os resultados serão recalculados considerando a resposta original de cada aluno contra o gabarito vigente — isso pode reduzir a nota de quem havia recebido o ponto pela anulação.",
    );
    if (!confirmed) return;
    const { data: auth } = await supabase.auth.getSession();
    if (!auth.session) { setMessage("Sua sessão expirou. Entre novamente para continuar."); return; }
    setAnnulmentBusy(true);
    try {
      const response = await fetch(`/api/professor/events/${id}/questions/${relationId}/annul`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.session.access_token}` },
        body: JSON.stringify({ status: targetStatus }),
      });
      const json = await response.json() as { ok?: boolean; message?: string; results_changed?: number; attempts_reprocessed?: number };
      setMessage(json.ok ? `${json.message} (${json.results_changed ?? 0} de ${json.attempts_reprocessed ?? 0} resultado(s) alterado(s).)` : (json.message || "Não foi possível concluir a operação."));
      if (json.ok) await load();
    } catch {
      setMessage("Não foi possível comunicar com o servidor. Tente novamente.");
    } finally {
      setAnnulmentBusy(false);
    }
  }
  function selectQuestion(index: number) { setQuestionIndex(index); setShowQuestionData(false); }
  function toggleQuestionAlternative(questionId: string, alternativeId: string) {
    setEliminatedQuestionAlternatives((currentState) => {
      const currentIds = currentState[questionId] || [];
      return { ...currentState, [questionId]: currentIds.includes(alternativeId) ? currentIds.filter((id) => id !== alternativeId) : [...currentIds, alternativeId] };
    });
  }

  const participants = useMemo(() => rankedParticipants(data?.participants || []), [data?.participants]);
  // "Questões mais difíceis" (guia Insights) reaproveita integralmente o
  // mesmo `data.questions` já carregado para a aba Questões/revisão (nenhum
  // fetch novo) para abrir o modal de consulta — só um índice em memória
  // por id da relação simulado_questions, montado uma vez por atualização.
  const classroomQuestionsById = useMemo(() => new Map((data?.questions || []).map((question) => [question.id, question])), [data?.questions]);

  async function generateRankingPdf() {
    if (rankingPdfBusy) return;
    setRankingPdfBusy(true);
    let coverLoadError = "";
    try {
      const { downloadEventRankingPdf, RANKING_COVER_LOAD_ERROR } = await import("@/app/lib/pdf/event-ranking-pdf");
      coverLoadError = RANKING_COVER_LOAD_ERROR;
      await downloadEventRankingPdf({
        eventName: data?.event.name || "Evento",
        simuladoTitle: data?.event.simulados?.title || null,
        participants,
      });
    } catch (error) {
      setMessage(error instanceof Error && coverLoadError && error.message === coverLoadError ? error.message : "Não foi possível gerar o ranking em PDF. Tente novamente.");
    } finally {
      setRankingPdfBusy(false);
    }
  }
  if (!data) return <main className="min-h-dvh bg-slate-50 p-8 text-slate-700" aria-busy={!message}>
    <p role="status">{message || "Carregando dashboard..."}</p>
    {!message && <div aria-hidden="true" className="mx-auto mt-6 max-w-[1760px] space-y-6 motion-safe:animate-pulse">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-[182px] rounded-[22px] border border-slate-200 bg-white" />)}</div>
      <div className="grid gap-6 xl:grid-cols-[1.78fr_1fr]"><div className="h-[420px] rounded-3xl border border-slate-200 bg-white" /><div className="h-[420px] rounded-3xl border border-orange-100 bg-white" /></div>
    </div>}
  </main>;
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
  const previewClassroomQuestion = previewQuestionRelationId ? classroomQuestionsById.get(previewQuestionRelationId) || null : null;
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
      <ProfessorEventBannerFrame imageUrl={data.event.professor_banner_url} positionX={Number(data.event.professor_banner_position_x ?? 50)} positionY={Number(data.event.professor_banner_position_y ?? 50)}>
        <div className="relative z-10 w-full max-w-[600px] px-7 py-6 sm:max-w-[55%] sm:px-10 md:max-w-[49%] md:px-[clamp(42px,4.4vw,76px)] md:py-5 lg:max-w-[47%]">
          <span className="inline-flex h-8 items-center gap-2.5 rounded-full border border-emerald-300/70 bg-emerald-50/90 px-3.5 text-[12px] font-bold text-emerald-700 shadow-[0_8px_20px_rgba(16,185,129,0.10),inset_0_1px_0_rgba(255,255,255,0.85)]"><span className="relative flex h-2.5 w-2.5 items-center justify-center"><span className="absolute h-full w-full rounded-full bg-emerald-400/35 motion-safe:animate-pulse motion-safe:[animation-duration:2s] motion-reduce:animate-none" /><span className="relative h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.10)]" /></span><Radio size={13} className="sr-only" /> Atualização ao vivo</span>
          <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.2em] text-orange-600">Evento de Simulado</p>
          <h1 className="mt-2.5 text-[clamp(32px,3.8vw,56px)] font-bold leading-[0.98] tracking-[-0.055em] text-[#07142f]">{data.event.name}</h1>
          <div className="mt-4 max-w-[580px] space-y-1 text-[14px] font-medium leading-[1.45] text-slate-700">
            <p>{data.event.simulados?.title || "Simulado ainda não vinculado"}{professorName ? ` · Professor ${professorName}` : ""}</p>
            <p className="text-slate-600">Dados consolidados pela tentativa oficial</p>
          </div>
        </div>
      </ProfessorEventBannerFrame>
    ) : (<>
    <header className="relative flex min-h-[210px] items-center overflow-hidden rounded-[28px] border border-orange-200/70 bg-[radial-gradient(circle_at_92%_50%,rgba(255,122,0,0.16),transparent_34%),radial-gradient(circle_at_70%_18%,rgba(255,255,255,0.95),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(255,255,255,0.94)_48%,rgba(255,247,237,0.84)_100%)] px-6 py-9 shadow-[0_28px_80px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.94)] sm:px-10 lg:px-[70px]"><div aria-hidden="true" className="pointer-events-none absolute right-32 top-7 hidden text-white/75 drop-shadow-[0_16px_30px_rgba(255,122,0,0.12)] xl:block"><Trophy size={120} strokeWidth={1.35} /></div><div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-40 h-[480px] w-[650px] rounded-[50%] border border-white/70 opacity-60 shadow-[0_0_0_18px_rgba(255,255,255,0.12),0_0_0_36px_rgba(255,255,255,0.08),0_0_0_54px_rgba(255,255,255,0.05)]" /><div className="relative flex w-full flex-col gap-8 xl:flex-row xl:items-end xl:justify-between"><div className="max-w-4xl"><div className="flex flex-wrap items-center gap-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">Evento de Simulado</p><span className="inline-flex h-8 items-center gap-2 rounded-full border border-emerald-300/70 bg-emerald-50/90 px-4 text-[13px] font-bold text-emerald-700 shadow-[0_8px_20px_rgba(16,185,129,0.10),inset_0_1px_0_rgba(255,255,255,0.85)]"><span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" /><Radio size={13} className="sr-only" /> Atualização ao vivo</span></div><h1 className="mt-4 text-[clamp(42px,4.8vw,72px)] font-bold leading-[0.98] tracking-[-0.055em] text-[#07142f]">{data.event.name}</h1><p className="mt-[18px] text-[15px] leading-[22px] text-slate-600">{data.event.simulados?.title || "Simulado ainda não vinculado"} · dados consolidados pela tentativa oficial.</p></div><div className="relative flex flex-wrap gap-3">{data.event.simulado_id && <PremiumButton href={`/professor/eventos/${id}/preview`} variant="secondary" className="min-h-[52px] rounded-[15px] px-6 shadow-[0_14px_34px_rgba(15,23,42,0.08)]" icon={<Eye size={18} />}>Ver como aluno</PremiumButton>}{data.event.simulado_id && <PremiumButton onClick={() => void generateExamPdf()} disabled={pdfBusy} className="min-h-[52px] rounded-[15px] px-6 shadow-[0_14px_34px_rgba(15,23,42,0.08)]" icon={pdfBusy ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}>Gerar prova em PDF</PremiumButton>}<SimuladoControlMenu status={data.event.effective_status} resultPolicy={data.event.result_policy} busy={controlBusy} onAction={async (_controlAction, payload) => action(String(payload?.action || ""), payload)} />{data.event.effective_status === "scheduled" && data.event.simulado_id && <PremiumButton onClick={() => void action("start")} icon={<PlayCircle size={17} />}>Iniciar agora</PremiumButton>}{data.event.result_policy === "blocked" && data.summary.pending_results > 0 && <PremiumButton onClick={() => void action("release_results")} icon={<Unlock size={17} />}>Liberar resultados ({data.summary.pending_results})</PremiumButton>}</div></div></header>
    </>)}
    {data.event.professor_banner_url && <div className="mt-3 flex flex-wrap gap-3">{data.event.simulado_id && <PremiumButton href={`/professor/eventos/${id}/preview`} variant="secondary" className="min-h-[48px] rounded-[15px] px-5 shadow-[0_10px_26px_rgba(15,23,42,0.07)]" icon={<Eye size={18} />}>Ver como aluno</PremiumButton>}{data.event.simulado_id && <PremiumButton onClick={() => void generateExamPdf()} disabled={pdfBusy} className="min-h-[48px] rounded-[15px] px-5 shadow-[0_10px_26px_rgba(15,23,42,0.07)]" icon={pdfBusy ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}>Gerar prova em PDF</PremiumButton>}<SimuladoControlMenu status={data.event.effective_status} resultPolicy={data.event.result_policy} busy={controlBusy} onAction={async (_controlAction, payload) => action(String(payload?.action || ""), payload)} />{data.event.effective_status === "scheduled" && data.event.simulado_id && <PremiumButton onClick={() => void action("start")} icon={<PlayCircle size={17} />}>Iniciar agora</PremiumButton>}{data.event.result_policy === "blocked" && data.summary.pending_results > 0 && <PremiumButton onClick={() => void action("release_results")} icon={<Unlock size={17} />}>Liberar resultados ({data.summary.pending_results})</PremiumButton>}</div>}
    {data.event.effective_status === "scheduled" && <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 px-5 py-4 text-sm text-orange-800 shadow-sm">Pré-evento · começa em <strong>{countdown}</strong> · {data.summary.registered} inscritos · {data.summary.online} online.</div>}{!data.event.simulado_id && <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 font-semibold text-amber-800 shadow-sm">Evento sem Simulado vinculado. O início permanece bloqueado até a configuração pelo administrador.</div>}{message && <p className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 px-5 py-3 text-sm text-orange-800">{message}</p>}
    <nav className="mt-[22px] grid gap-2 rounded-[18px] border border-slate-200/90 bg-white/90 p-2 shadow-[0_18px_46px_rgba(15,23,42,0.07),inset_0_1px_0_rgba(255,255,255,0.94)] sm:grid-cols-2 lg:grid-cols-4" aria-label="Áreas da dashboard"><DashboardTab active={activeTab === "overview"} icon={<BarChart3 size={18} />} label="Visão geral" onClick={() => setActiveTab("overview")} /><DashboardTab active={activeTab === "participants"} icon={<Users size={18} />} label="Participantes" onClick={() => setActiveTab("participants")} /><DashboardTab active={activeTab === "questions"} icon={<Presentation size={18} />} label="Questões / revisão" onClick={() => setActiveTab("questions")} /><DashboardTab active={activeTab === "insights"} icon={<Sparkles size={18} />} label="Insights" onClick={() => setActiveTab("insights")} /></nav>

    {activeTab === "overview" && <section className="mt-5 space-y-5" aria-label="Visão geral do evento">
      <div className="grid gap-[18px] sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={<Users size={25} />} label="Participantes" value={String(data.summary.registered)} detail={`${data.summary.online} online agora`} tone="emerald" />
        <MetricCard icon={<Trophy size={25} />} label="Maior nota" value={formatScore(data.summary.highest_score)} detail="Tentativa oficial" tone="orange" />
        <MetricCard icon={<Medal size={25} />} label="Menor nota" value={formatScore(data.summary.lowest_score)} detail="Tentativa oficial" tone="rose" />
        <MetricCard icon={<BarChart3 size={25} />} label="Média do evento" value={formatScore(data.summary.average_score)} detail={`${data.summary.completed} concluídos`} tone="blue" />
        <MetricCard icon={<Clock3 size={25} />} label="Tempo médio" value={formatTime(data.summary.average_time_seconds)} detail="Resultados oficiais" tone="violet" />
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.78fr)_minmax(0,1fr)]">
        <PremiumCard variant="light" className="min-w-0 rounded-3xl border-slate-200/80 bg-white/95 shadow-[0_18px_48px_rgba(15,23,42,0.09),inset_0_1px_0_white] md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-orange-700">Distribuição de desempenho</p><h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Faixas de aproveitamento</h2></div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">{completed.length} resultados</span>
          </div>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">Percentual de alunos em cada faixa de acerto nas tentativas oficiais.</p>
          <div className="mt-5 space-y-2">{bands.map((band, index) => <PerformanceBand key={band.label} label={band.label} count={band.count} total={completed.length} index={index} />)}</div>
          {completed.length === 0 && <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Ainda não há resultados de tentativas oficiais para distribuir entre as faixas.</p>}
        </PremiumCard>
        <PremiumCard variant="light" className="min-w-0 rounded-3xl border-orange-200/80 bg-[radial-gradient(circle_at_85%_10%,rgba(255,122,0,0.13),transparent_40%),linear-gradient(135deg,#ffffff,#fff7ed)] shadow-[0_18px_48px_rgba(249,115,22,0.12),inset_0_1px_0_white] md:p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-orange-700">Situação ao vivo</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Participação geral</h2>
          <p className="mt-3 text-sm leading-6 text-slate-500">Acompanhe o engajamento dos alunos no evento em tempo real.</p>
          <div className="mt-4 grid items-center gap-3 sm:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-1 min-[96rem]:grid-cols-[200px_minmax(0,1fr)]">
            <ParticipationDonut completed={data.summary.completed} total={data.summary.registered} />
            <div className="grid grid-cols-1 gap-2 xl:grid-cols-2 min-[96rem]:grid-cols-1">
              {[
                { label: "Concluídos", count: data.summary.completed, tone: "text-emerald-700", icon: <CheckCircle2 size={17} /> },
                { label: "Realizando", count: data.summary.taking, tone: "text-blue-700", icon: <Loader2 size={17} />, title: "Tentativas em andamento com atividade recente" },
                { label: "Não iniciaram", count: data.summary.not_started, tone: "text-slate-600", icon: <UserRound size={17} /> },
                { label: "Pendentes", count: data.summary.pending_results, tone: "text-orange-700", icon: <Hourglass size={17} />, title: "Resultados ainda não liberados; podem incluir alunos concluídos" },
              ].map((status) => <div key={status.label} title={status.title} className="flex min-h-[54px] items-center gap-2 rounded-[14px] border border-orange-100/60 bg-white/85 px-3 py-2 shadow-[0_3px_10px_rgba(15,23,42,0.04),inset_0_1px_0_white]">
                <span className={status.tone}>{status.icon}</span><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{status.label}</p><strong className={`text-xl tabular-nums ${status.tone}`}>{status.count}</strong></div>
                <span className="text-sm font-semibold tabular-nums text-slate-600">{overviewPercent(status.count, data.summary.registered)}</span>
              </div>)}
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">O anel representa os concluídos entre os inscritos. Os status podem se sobrepor.</p>
          <div className="mt-4 flex min-h-[104px] items-center gap-4 rounded-[18px] border border-orange-200/80 bg-gradient-to-br from-white to-orange-50/80 p-[18px] shadow-[0_8px_22px_rgba(249,115,22,0.08),inset_0_1px_0_white]">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 ring-1 ring-orange-100"><Target size={28} /></span>
            <div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Precisão consolidada</p><p className="mt-2 text-[42px] font-extrabold leading-none tracking-[-0.05em] tabular-nums text-slate-950">{formatPercent(data.summary.accuracy_percent)}</p><p className="mt-1 text-xs text-slate-500">Acertos nas tentativas oficiais</p></div>
          </div>
        </PremiumCard>
      </div>
    </section>}
    {activeTab === "participants" && (
      <section className="mt-9">
        <div className="grid items-end gap-6 sm:grid-cols-[1fr_auto]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">Ranking oficial</p>
            <h2 className="mt-2 text-[28px] font-bold leading-[34px] tracking-[-0.035em] text-slate-950">Participantes</h2>
            <p className="mt-2 text-sm leading-5 text-slate-600">Mais acertos, depois menor tempo total com precisão de milissegundos.</p>
          </div>
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <PremiumButton onClick={() => void generateRankingPdf()} disabled={rankingPdfBusy} className="min-h-[46px] rounded-[14px] px-5 shadow-[0_14px_34px_rgba(15,23,42,0.08)]" icon={rankingPdfBusy ? <Loader2 size={17} className="animate-spin" /> : <FileText size={17} />}>Exportar ranking em PDF</PremiumButton>
            <span className="inline-flex h-[34px] items-center justify-center rounded-full border border-slate-300/80 bg-white/85 px-3.5 text-[13px] font-semibold text-slate-500 shadow-[0_10px_24px_rgba(15,23,42,0.045),inset_0_1px_0_rgba(255,255,255,0.90)]">
              {filtered.length} de {participants.length} participantes
            </span>
          </div>
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
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="h-14 border-b border-slate-200/90 bg-gradient-to-b from-slate-50/95 to-white/95">
                <tr>
                  <th className="px-5 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 lg:px-7">Posição</th>
                  <th className="px-5 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 lg:px-7">Aluno</th>
                  <th className="px-5 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 lg:px-7">Tempo</th>
                  <th className="px-5 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 lg:px-7" title="Advertências por troca/saída de tela">Advert.</th>
                  <th className="px-5 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 lg:px-7" title="Quantidade de ajudas da coruja utilizadas durante a tentativa"><span className="block max-w-[72px] leading-[13px]">Ajudas utilizadas</span></th>
                  <th className="px-5 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 lg:px-7">Pontos</th>
                  <th className="px-5 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 lg:px-7">Situação</th>
                  <th className="px-5 text-right text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 lg:px-7">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70">
                {visible.map((item, index) => {
                  const status = participantStatus[item.status];
                  const displayedPosition = participantSort === "score" ? item.rank : safePage * participantsPerPage + index + 1;
                  const trophyTone = item.rank === 1 ? "fill-yellow-300 text-yellow-400 drop-shadow-[0_5px_9px_rgba(250,204,21,0.55)]" : item.rank === 2 ? "fill-slate-200 text-slate-400 drop-shadow-[0_5px_9px_rgba(148,163,184,0.38)]" : "fill-amber-600 text-amber-700 drop-shadow-[0_5px_9px_rgba(180,83,9,0.34)]";
                  return (
                    <tr key={item.id} className={`${index % 2 ? "bg-slate-50/30" : "bg-white"} h-[98px] transition-colors duration-150 hover:bg-orange-50/40`}>
                      <td className="px-5 lg:px-7"><div className="flex items-center gap-2.5 text-[21px] font-bold leading-none tracking-[-0.03em] text-slate-700">{participantSort === "score" && item.rank && item.rank <= 3 && <Trophy size={24} strokeWidth={2.15} className={trophyTone} />}<span>{displayedPosition ? `${displayedPosition}º` : "—"}</span>{participantSort === "score" && item.rank_tied && <span className="rounded-full bg-violet-50 px-2 py-1 text-[9px] tracking-normal text-violet-700">EMPATE</span>}</div></td>
                      <td className="max-w-[420px] px-5 lg:px-7"><div className="grid grid-cols-[44px_1fr] items-center gap-3.5"><span className={`flex h-11 w-11 items-center justify-center rounded-full border text-sm font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.90)] ${item.status === "not_started" ? "border-slate-300/80 bg-slate-100 text-slate-600" : "border-orange-200 bg-gradient-to-br from-orange-100 to-orange-50 text-orange-600 shadow-orange-100"}`}>{participantInitials(item.name)}</span><div className="min-w-0"><p className="truncate text-[15px] font-bold leading-5 tracking-[-0.015em] text-slate-950" title={item.name}>{formatRankingName(item.name)}</p><p className="mt-0.5 truncate text-[13px] leading-[18px] text-slate-500">{item.email}</p></div></div></td>
                      <td className="px-5 text-sm tabular-nums text-slate-700 lg:px-7">{formatTimeMs(item.result?.time_spent_ms)}</td>
                      <td className="px-5 text-sm font-semibold tabular-nums text-slate-700 lg:px-7">{item.result ? item.result.focus_violation_count : "—"}</td>
                      <td className="px-5 text-sm font-semibold tabular-nums text-slate-700 lg:px-7">{item.result ? item.result.owl_help_used_count : "—"}</td>
                      <td className="px-5 text-base font-bold tabular-nums text-slate-950 lg:px-7">{formatScore(item.result?.display_score ?? null)}</td>
                      <td className="px-5 lg:px-7"><span className={`inline-flex h-7 items-center rounded-full border px-3 text-xs font-bold ${status.className}`}>{status.label}</span></td>
                      <td className="px-5 text-right lg:px-7"><PremiumButton variant="secondary" className="min-h-11 rounded-[14px] px-[18px] shadow-[0_10px_24px_rgba(15,23,42,0.045)]" onClick={() => setSelectedParticipantId(item.id)} icon={<Eye size={16} strokeWidth={2.1} />}>Ver</PremiumButton></td>
                    </tr>
                  );
                })}
                {visible.length === 0 && <tr><td colSpan={8} className="bg-slate-50/50 px-6 py-12 text-center"><SearchX size={46} className="mx-auto text-slate-400" /><p className="mt-3.5 text-lg font-semibold leading-7 text-slate-700">Nenhum participante encontrado</p><p className="mt-1 text-sm text-slate-500">Ajuste os filtros ou aguarde novas inscrições no Evento.</p></td></tr>}
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
        <div className="mt-[22px] grid gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_1.2fr_1fr_1fr]"><PremiumButton variant="secondary" className="min-h-14 rounded-2xl shadow-[0_10px_24px_rgba(15,23,42,0.04)]" disabled={safeQuestionIndex === 0} onClick={() => selectQuestion(safeQuestionIndex - 1)} icon={<ArrowLeft size={18} />}>Anterior</PremiumButton><PremiumButton variant={showQuestionData ? "secondary" : "primary"} className={`min-h-14 rounded-2xl ${showQuestionData ? "border-slate-800 text-slate-900" : "shadow-[0_18px_38px_rgba(249,115,22,0.30)]"}`} onClick={() => setShowQuestionData((value) => !value)} icon={showQuestionData ? <EyeOff size={18} /> : <Eye size={18} />}>{showQuestionData ? "Ocultar dados" : "Exibir dados"}</PremiumButton><PremiumButton variant="secondary" className="min-h-14 rounded-2xl border-amber-300 text-amber-700 shadow-[0_10px_24px_rgba(15,23,42,0.04)]" disabled={annulmentBusy} onClick={() => void toggleQuestionAnnulment(current.id, isAnnulled ? "active" : "annulled")} icon={isAnnulled ? <RotateCcw size={18} /> : <Ban size={18} />}>{isAnnulled ? "Desanular questão" : "Anular questão"}</PremiumButton><PremiumButton variant="secondary" className="min-h-14 rounded-2xl shadow-[0_10px_24px_rgba(15,23,42,0.04)]" disabled={safeQuestionIndex === data.questions.length - 1} onClick={() => selectQuestion(safeQuestionIndex + 1)}>Próxima <ArrowRight size={18} /></PremiumButton></div>
      </div> : <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-white/90 p-10 text-center text-slate-500">Este Evento ainda não possui questões disponíveis para revisão.</div>}
    </section>}

    {activeTab === "insights" && <section className="mt-[34px] font-sans text-sm leading-5 text-slate-700">
      <div><p className="text-xs font-bold uppercase leading-4 tracking-[0.18em] text-orange-600">Análise pedagógica</p><h2 className="mt-2 text-[28px] font-bold leading-[34px] tracking-[-0.035em] text-slate-950">Insights</h2><p className="mt-2 text-sm text-slate-600">Panorama do desempenho coletivo por tópico — apoio para planejar a revisão em aula.</p></div>

      {data.insights.validQuestionCount === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-white/90 p-10 text-center text-slate-500">{data.questions.length === 0 ? "Este simulado não possui tópicos suficientes para esta análise." : "Ainda não há respostas suficientes para gerar Insights."}</div>
      ) : (<>
        <div className="mt-6 rounded-3xl border border-orange-200/70 bg-[radial-gradient(circle_at_92%_10%,rgba(255,122,0,0.08),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,250,245,0.94))] p-6 shadow-[0_18px_46px_rgba(15,23,42,0.06)] sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">Panorama pedagógico do simulado</p>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Análise baseada no desempenho dos participantes e normalizada pela quantidade de questões associadas a cada tópico.</p>
          <div className="mt-5 grid gap-3.5 sm:grid-cols-3">
            <CompactMetric label="Dificuldade global" value={formatPercent((data.insights.globalDifficulty ?? 0) * 100)} icon={<Target size={21} />} iconTone="bg-orange-50 text-orange-600" />
            <CompactMetric label="Questões analisadas" value={data.insights.validQuestionCount} icon={<Presentation size={21} />} iconTone="bg-blue-50 text-blue-600" />
            <CompactMetric label="Tópicos avaliados" value={data.insights.topics.length} icon={<Sparkles size={21} />} iconTone="bg-violet-50 text-violet-600" />
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-slate-200/90 bg-white/95 p-6 shadow-[0_18px_46px_rgba(15,23,42,0.06)] sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-xl font-bold tracking-[-0.02em] text-slate-950">Tópicos de maior dificuldade</h3><span title="Índice que considera a taxa de erro e a quantidade de questões que avaliaram o tópico, reduzindo distorções de amostras pequenas." className="inline-flex cursor-help items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">Dificuldade ajustada <AlertTriangle size={13} /></span></div>
          {data.insights.topics.length === 0 ? <p className="mt-5 text-sm text-slate-500">Nenhum tópico com respostas suficientes para análise.</p> : <div className="mt-5 space-y-2.5">{data.insights.topics.map((topic, index) => <InsightsTopicRow key={topic.key} topic={topic} position={index + 1} />)}</div>}
        </div>

        <div className="mt-6 rounded-3xl border border-slate-200/90 bg-white/95 p-6 shadow-[0_18px_46px_rgba(15,23,42,0.06)] sm:p-8">
          <div><h3 className="text-xl font-bold tracking-[-0.02em] text-slate-950">Questões mais difíceis</h3><p className="mt-1.5 text-sm text-slate-500">Clique em uma questão para abri-la e entender o que os participantes erraram.</p></div>
          {data.insights.hardestQuestions.length === 0 ? <p className="mt-5 text-sm text-slate-500">Nenhuma questão válida para esta análise.</p> : <div className="mt-5 space-y-2">{data.insights.hardestQuestions.slice(0, 10).map((question) => <InsightsQuestionRow key={question.simulado_question_id} question={question} statement={classroomQuestionsById.get(question.simulado_question_id)?.questions?.statement ?? null} onOpen={() => setPreviewQuestionRelationId(question.simulado_question_id)} />)}</div>}
        </div>

        <div className="mt-6 rounded-3xl border border-orange-200/70 bg-orange-50/50 p-6 shadow-[0_18px_46px_rgba(15,23,42,0.05)] sm:p-8">
          <h3 className="text-xl font-bold tracking-[-0.02em] text-slate-950">O que merece revisão em aula</h3>
          <p className="mt-3 text-[15px] leading-6 text-slate-700">{data.insights.teachingReviewSummary}</p>
        </div>
      </>)}
    </section>}
  </div>{selected && <ParticipantDetailModal participant={selected} onClose={() => setSelectedParticipantId(null)} />}{previewClassroomQuestion?.questions && <QuestionPreviewModal question={previewClassroomQuestion.questions} orderLabel={`Questão ${previewClassroomQuestion.order_number}`} onClose={() => setPreviewQuestionRelationId(null)} />}</main>;
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
          <ParticipantMetricCard label="Ajudas utilizadas" value={String(participant.result?.owl_help_used_count ?? "—")} icon={<Bird size={20} strokeWidth={2.2} />} iconTone="text-amber-600" />
          <ParticipantMetricCard label="Advertências por troca de tela" value={String(participant.result?.focus_violation_count ?? "—")} valueTone={participant.result && participant.result.focus_violation_count > 0 ? "text-red-600" : "text-[#07142f]"} icon={<AlertTriangle size={20} strokeWidth={2.2} />} iconTone="text-red-500" />
          <ParticipantMetricCard label="Tentativa oficial" value={participant.representative_attempt_number ? <span className="inline-flex h-9 min-w-[58px] items-center justify-center rounded-full border border-blue-300/70 bg-blue-50 px-4 text-[15px] font-bold tracking-[-0.01em] text-blue-600">#{participant.representative_attempt_number}</span> : "—"} icon={<ShieldCheck size={20} strokeWidth={2.2} />} iconTone="text-blue-600" />
          <ParticipantMetricCard label="Situação" value={<span className={`inline-flex min-h-9 items-center justify-center rounded-full border px-4 text-sm font-bold tracking-[-0.01em] ${statusTone}`}>{status.label}</span>} icon={<CheckCircle2 size={20} strokeWidth={2.2} />} iconTone={participant.status === "completed" ? "text-emerald-500" : "text-slate-500"} />
          <ParticipantTopicsCard topics={participant.result?.difficulty_topics ?? []} />
        </div>

        <button type="button" onClick={onClose} className="relative mt-[30px] flex min-h-14 w-full items-center justify-center rounded-2xl border border-orange-400/70 bg-gradient-to-br from-[#ff8a00] via-[#ff6b00] to-orange-500 text-[15px] font-bold text-white shadow-[0_18px_38px_rgba(249,115,22,0.30),inset_0_1px_0_rgba(255,255,255,0.30)] transition duration-200 hover:-translate-y-px hover:shadow-[0_22px_46px_rgba(249,115,22,0.38)] active:translate-y-0">Entendi</button>
      </section>
    </div>
  );
}

// Consulta somente-leitura de uma questão do banco, aberta a partir de
// "Questões mais difíceis" (guia Insights). Reaproveita QuestionDisplayCard
// (mesmo componente já usado na aba Questões/revisão desta própria tela) e
// `data.questions` já carregado — nenhum fetch novo, nenhuma rota nova. Sem
// onSelect/edição: puramente uma janela de consulta.
function QuestionPreviewModal({ question, orderLabel, onClose }: { question: NonNullable<ClassroomQuestion["questions"]>; orderLabel?: string; onClose: () => void }) {
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
        aria-label="Consulta da questão do banco"
        className="animate-modal-in relative max-h-[calc(100dvh-32px)] w-full max-w-[820px] overflow-x-hidden overflow-y-auto rounded-3xl border border-slate-200/90 bg-white shadow-[0_38px_95px_rgba(15,23,42,0.32),0_18px_44px_rgba(15,23,42,0.16)] [scrollbar-width:none] sm:rounded-[28px] [&::-webkit-scrollbar]:hidden"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200/80 bg-white/95 px-6 py-4 backdrop-blur sm:px-8">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">Banco de questões</p><p className="mt-0.5 text-sm text-slate-500">Consulta — sem edição.</p></div>
          <button type="button" autoFocus onClick={onClose} aria-label="Fechar consulta da questão" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-300/70 bg-white text-slate-600 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition duration-200 hover:-translate-y-px hover:border-orange-300 hover:text-orange-600"><X size={18} strokeWidth={2.1} /></button>
        </div>
        <div className="p-5 sm:p-6 lg:p-8">
          <QuestionDisplayCard question={question} orderLabel={orderLabel} showCorrect />
        </div>
      </section>
    </div>
  );
}

function ParticipantMetricCard({ label, value, detail, icon, iconTone, valueTone = "text-[#07142f]", compact = false }: { label: string; value: React.ReactNode; detail?: string; icon: React.ReactNode; iconTone: string; valueTone?: string; compact?: boolean }) {
  return <article className="relative flex min-h-[116px] flex-col justify-between overflow-hidden rounded-[18px] border border-slate-300/80 bg-white/75 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05),inset_0_1px_0_rgba(255,255,255,0.92)] lg:min-h-[126px] lg:p-5"><div className="flex items-center gap-2.5"><span className={`shrink-0 ${iconTone}`}>{icon}</span><p className="text-[11px] font-bold uppercase leading-[14px] tracking-[0.14em] text-slate-500">{label}</p></div><div className="mt-[18px]"><div className={`${compact ? "text-[28px]" : "text-[30px]"} font-bold leading-none tracking-[-0.04em] tabular-nums ${valueTone}`}>{value}</div>{detail && <p className="mt-1 text-xs leading-4 text-slate-500">{detail}</p>}</div></article>;
}

// "Tópicos de maior dificuldade" — mesma análise já usada na tela de
// resultados do aluno (lib/topicDifficulty.ts), só sem agrupar por assunto.
// Ocupa duas colunas da grade de métricas do modal (sm:col-span-2 — em
// mobile, 1 coluna, naturalmente full-width); fica por último, depois de
// todas as métricas já existentes.
function ParticipantTopicsCard({ topics }: { topics: string[] }) {
  return <article className="relative flex flex-col overflow-hidden rounded-[18px] border border-slate-300/80 bg-white/75 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05),inset_0_1px_0_rgba(255,255,255,0.92)] sm:col-span-2 lg:p-5">
    <div className="flex items-center gap-2.5"><span className="shrink-0 text-red-500"><AlertTriangle size={20} strokeWidth={2.2} /></span><p className="text-[11px] font-bold uppercase leading-[14px] tracking-[0.14em] text-slate-500">Tópicos de maior dificuldade</p></div>
    <div className="mt-[14px]">
      {topics.length ? (
        <div className="flex max-h-[168px] flex-wrap gap-2 overflow-y-auto pr-1">
          {topics.map((topic) => <span key={topic} className="inline-flex min-h-[30px] max-w-full items-center whitespace-normal break-words rounded-full border border-red-200 bg-red-50/70 px-3.5 text-[12px] font-bold leading-4 text-red-700 shadow-[0_4px_10px_rgba(239,68,68,0.06)]">{topic}</span>)}
        </div>
      ) : <p className="text-sm leading-5 text-slate-500">Nenhum tópico de maior dificuldade identificado.</p>}
    </div>
  </article>;
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
function MetricCard({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: string; detail: string; tone: "emerald" | "orange" | "rose" | "blue" | "violet" }) {
  const id = useId();
  const colors = {
    emerald: "from-emerald-100/80 via-white to-teal-50 border-emerald-200/80 text-emerald-600 shadow-[0_10px_28px_rgba(16,185,129,0.12),inset_0_1px_0_white]",
    orange: "from-orange-100/80 via-white to-amber-50 border-orange-200/80 text-orange-600 shadow-[0_10px_28px_rgba(249,115,22,0.12),inset_0_1px_0_white]",
    rose: "from-rose-100/80 via-white to-rose-50 border-rose-200/80 text-rose-600 shadow-[0_10px_28px_rgba(244,63,94,0.11),inset_0_1px_0_white]",
    blue: "from-blue-100/80 via-white to-sky-50 border-blue-200/80 text-blue-600 shadow-[0_10px_28px_rgba(59,130,246,0.12),inset_0_1px_0_white]",
    violet: "from-violet-100/80 via-white to-purple-50 border-violet-200/80 text-violet-600 shadow-[0_10px_28px_rgba(139,92,246,0.12),inset_0_1px_0_white]",
  };
  return <PremiumCard variant="light" className={`min-w-0 rounded-[22px] bg-gradient-to-br p-[22px] md:p-[22px] motion-safe:transition-transform motion-safe:duration-500 motion-safe:hover:-translate-y-0.5 ${colors[tone]}`}>
    <div className="flex items-center gap-3"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-current/10 bg-current/10 shadow-[0_5px_14px_-6px_currentColor,inset_0_1px_0_rgba(255,255,255,0.9)]">{icon}</span><p className="text-[10px] font-bold uppercase leading-4 tracking-[0.1em] text-slate-600">{label}</p></div>
    <div className="relative mt-2.5"><p className={`relative z-10 w-fit font-extrabold leading-none tracking-tight tabular-nums text-slate-950 ${label === "Tempo médio" ? "text-[clamp(25px,2vw,34px)]" : "text-[36px]"}`}>{value}</p>
      <svg aria-hidden="true" focusable="false" viewBox="0 0 90 40" className="pointer-events-none absolute -bottom-0.5 right-0 h-9 w-[76px] opacity-30">
        <defs><linearGradient id={`${id}-line`}><stop stopColor="currentColor" stopOpacity="0.3" /><stop offset="1" stopColor="currentColor" /></linearGradient><linearGradient id={`${id}-area`} x2="0" y2="1"><stop stopColor="currentColor" stopOpacity="0.3" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
        <path d="M2 22 C10 22 12 10 22 14 S35 30 44 22 S58 10 67 17 S79 26 88 22 L88 40 L2 40 Z" fill={`url(#${id}-area)`} />
        <path d="M2 22 C10 22 12 10 22 14 S35 30 44 22 S58 10 67 17 S79 26 88 22" fill="none" stroke={`url(#${id}-line)`} strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </div>
    <p className="mt-2 text-xs leading-4 text-slate-500">{label === "Participantes" && <span aria-hidden="true" className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-500" />}{detail}</p>
  </PremiumCard>;
}
function overviewPercent(count: number, total: number) {
  return `${(total > 0 ? count / total * 100 : 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function PerformanceBand({ label, count, total, index }: { label: string; count: number; total: number; index: number }) {
  const id = useId();
  const percentage = total > 0 ? count / total * 100 : 0;
  const tones = [
    { start: "#f43f5e", end: "#fb7185", icon: "bg-rose-50 text-rose-600", description: "Baixo aproveitamento" },
    { start: "#f59e0b", end: "#facc15", icon: "bg-amber-50 text-amber-700", description: "Aproveitamento regular" },
    { start: "#0ea5e9", end: "#22d3ee", icon: "bg-sky-50 text-sky-600", description: "Bom aproveitamento" },
    { start: "#10b981", end: "#34d399", icon: "bg-emerald-50 text-emerald-600", description: "Alto aproveitamento" },
  ];
  const tone = tones[index];
  return <div className="grid min-h-[82px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-2xl bg-gradient-to-r from-slate-50/80 to-white px-3 py-3 sm:grid-cols-[185px_minmax(0,1fr)_90px]">
    <div className="flex min-w-0 items-center gap-3"><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-[0_5px_14px_-8px_currentColor,inset_0_1px_0_white] ${tone.icon}`}><BarChart3 size={21} /></span><div><p className="text-sm font-bold text-slate-800">{label}</p><p className="mt-1 text-xs text-slate-500">{tone.description}</p></div></div>
    <svg role="img" aria-label={`${label}: ${overviewPercent(count, total)}, ${count} alunos`} width="100%" height="22" className="col-span-2 row-start-2 overflow-visible sm:col-span-1 sm:col-start-2 sm:row-start-1">
      <defs><filter id={`${id}-shadow`} x="-30%" y="-100%" width="160%" height="350%"><feDropShadow dx="0" dy="4" stdDeviation="3" floodColor={tone.start} floodOpacity="0.3" /></filter><linearGradient id={`${id}-track`} x2="0" y2="1"><stop stopColor="#e2e8f0" /><stop offset="1" stopColor="#f1f5f9" /></linearGradient><linearGradient id={`${id}-fill`}><stop stopColor={tone.start} /><stop offset="1" stopColor={tone.end} /></linearGradient><linearGradient id={`${id}-shine`} x2="0" y2="1"><stop stopColor="white" stopOpacity="0.8" /><stop offset="0.6" stopColor="white" stopOpacity="0" /></linearGradient></defs>
      <rect y="4" width="100%" height="14" rx="7" fill={`url(#${id}-track)`} stroke="#cbd5e1" strokeWidth="0.5" />
      {percentage > 0 && <g filter={`url(#${id}-shadow)`}><rect y="4" width={`${percentage}%`} height="14" rx="7" fill={`url(#${id}-fill)`} className="motion-safe:transition-all motion-safe:duration-700" /><rect y="4" width={`${percentage}%`} height="14" rx="7" fill={`url(#${id}-shine)`} className="motion-safe:transition-all motion-safe:duration-700" /></g>}
    </svg>
    <div className="col-start-2 row-start-1 text-right sm:col-start-3"><strong className="text-2xl font-bold tracking-tight tabular-nums text-slate-950">{overviewPercent(count, total)}</strong><p className="mt-1 text-xs text-slate-500">({count} {count === 1 ? "aluno" : "alunos"})</p></div>
  </div>;
}

function ParticipationDonut({ completed, total }: { completed: number; total: number }) {
  const id = useId();
  const percentage = total > 0 ? completed / total * 100 : 0;
  return <div className="relative mx-auto h-[185px] w-[185px] sm:h-[200px] sm:w-[200px] min-[106.25rem]:h-[220px] min-[106.25rem]:w-[220px]">
    <svg viewBox="0 0 240 240" role="img" aria-label={`${overviewPercent(completed, total)} dos inscritos concluíram o evento`} className="h-full w-full overflow-visible">
      <defs><linearGradient id={`${id}-green`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#10b981" /><stop offset="1" stopColor="#2dd4bf" /></linearGradient><radialGradient id={`${id}-center`}><stop stopColor="white" /><stop offset="1" stopColor="#f0fdfa" /></radialGradient></defs>
      <circle cx="120" cy="120" r="78" fill={`url(#${id}-center)`} />
      <circle cx="120" cy="120" r="94" fill="none" stroke="#e2e8f0" strokeWidth="34" className="drop-shadow-[0_3px_3px_rgba(15,23,42,0.10)]" />
      {percentage > 0 && <circle cx="120" cy="120" r="94" pathLength="100" fill="none" stroke={`url(#${id}-green)`} strokeWidth="34" strokeLinecap="round" strokeDasharray={`${percentage} 100`} transform="rotate(-90 120 120)" className="drop-shadow-[0_7px_5px_rgba(16,185,129,0.32)] motion-safe:transition-all motion-safe:duration-700" />}
      <circle cx="120" cy="120" r="77" fill="none" stroke="white" strokeOpacity="0.8" strokeWidth="2" />
      <circle cx="120" cy="120" r="109" fill="none" stroke="white" strokeOpacity="0.6" strokeWidth="1" />
    </svg>
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><strong className="text-[36px] font-bold tracking-tight tabular-nums text-slate-950">{overviewPercent(completed, total)}</strong><span className="mt-1 text-xs font-medium text-slate-500">Participação total</span></div>
  </div>;
}
function CompactMetric({ label, value, tone = "text-slate-950", icon, iconTone = "bg-slate-100 text-slate-600", title }: { label: string; value: string | number; tone?: string; icon?: React.ReactNode; iconTone?: string; title?: string }) { return <div title={title} className="grid min-h-[86px] grid-cols-[42px_1fr] items-center gap-3 rounded-2xl border border-slate-300/70 bg-white/75 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.035),inset_0_1px_0_rgba(255,255,255,0.90)]"><div className={`flex h-[42px] w-[42px] items-center justify-center rounded-[14px] ${iconTone}`}>{icon}</div><div><p className="text-[10px] font-bold uppercase leading-[14px] tracking-[0.14em] text-slate-500">{label}</p><p className={`mt-1.5 text-[26px] font-bold leading-none tracking-[-0.035em] tabular-nums ${tone}`}>{value}</p></div></div>; }

// Linha do ranking de "Tópicos de maior dificuldade" (guia Insights) — usa
// D_adjusted (dificuldade ajustada) para a faixa/cor exibida e é a ÚNICA
// dificuldade mostrada ao professor (a bruta/observada continua calculada
// em lib/eventInsights.ts, só deixou de aparecer nesta interface — decisão
// de clareza do refinamento de 2026-09-10). Os rótulos de confiança da
// amostra (baseados na quantidade de questões do tópico) também deixaram
// de aparecer aqui pelo mesmo motivo — só o essencial fica visível.
function InsightsTopicRow({ topic, position }: { topic: TopicInsight; position: number }) {
  const meta = TOPIC_BAND_META[topic.band];
  return <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white/80 p-4 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-300/80 bg-slate-50 text-sm font-bold text-slate-600">{position}</span><div><p className="font-bold text-slate-950">{topic.label}</p><p className="mt-0.5 text-xs text-slate-500">{topic.questionCount} {topic.questionCount === 1 ? "questão relacionada" : "questões relacionadas"}{topic.responsesAnalyzed > 0 ? ` · ${topic.responsesAnalyzed} ${topic.responsesAnalyzed === 1 ? "resposta válida considerada" : "respostas válidas consideradas"}` : ""}</p></div></div>
    <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5"><span className={`inline-flex h-7 items-center rounded-full border px-3 text-xs font-bold ${meta.badge}`}>{meta.label}</span><span className="text-sm font-bold tabular-nums text-slate-950">{formatPercent(topic.adjustedDifficulty * 100)} de dificuldade ajustada</span></div>
  </div>;
}

// "Questões mais difíceis" (guia Insights) — só código, título curto (texto
// puro do enunciado, via lib/utils/rich-text já existente — reaproveitado,
// não duplicado) e percentual de erro; branco deixou de aparecer aqui por
// decisão de clareza (2026-09-10). Clicável (código/título e botão "Ver
// questão") para abrir QuestionPreviewModal com o enunciado/alternativas
// completos, reaproveitando dado já carregado (sem fetch novo).
function InsightsQuestionRow({ question, statement, onOpen }: { question: QuestionInsight; statement: string | null; onOpen: () => void }) {
  const plainStatement = statement ? richTextToPlainText(statement) : "";
  const shortTitle = plainStatement.length > 110 ? `${plainStatement.slice(0, 110)}…` : plainStatement;
  return <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white/80 p-4 sm:flex-row sm:items-center sm:justify-between">
    <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
      <p className="font-bold text-slate-950 underline decoration-transparent decoration-2 underline-offset-4 transition duration-200 hover:text-orange-700 hover:decoration-orange-400">{question.code || `Questão ${question.order_number}`}</p>
      {shortTitle && <p className="mt-0.5 truncate text-xs text-slate-500">{shortTitle}</p>}
    </button>
    <div className="flex shrink-0 items-center gap-3">
      <span className="text-sm font-bold tabular-nums text-red-600">{formatPercent(question.difficulty * 100)} de erro</span>
      <PremiumButton variant="secondary" className="min-h-9 rounded-[12px] px-3.5 text-xs shadow-none" onClick={onOpen} icon={<Eye size={14} strokeWidth={2.1} />}>Ver questão</PremiumButton>
    </div>
  </div>;
}
