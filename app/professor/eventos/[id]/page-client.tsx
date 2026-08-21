"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, BarChart3, Eye, EyeOff, ListChecks, PlayCircle, Presentation, Search, Unlock, Users } from "lucide-react";
import { supabase } from "@/app/lib/supabase/client";
import PremiumButton from "@/app/components/ui/PremiumButton";
import PremiumInput from "@/app/components/ui/PremiumInput";
import PremiumSelect from "@/app/components/ui/PremiumSelect";
import QuestionDisplayCard from "@/app/components/questions/QuestionDisplayCard";

type Alternative = { id: string; label: string | null; text: string | null; image_url: string | null; is_correct: boolean; order_number: number | null };
type ClassroomQuestion = {
  id: string;
  order_number: number;
  status: string;
  questions: { id: string; code: string | null; statement: string | null; image_url: string | null; year: number | null; question_type: string | null; question_alternatives: Alternative[] } | null;
  answered: number;
  total_considered: number;
  correct: number;
  wrong: number;
  blank: number;
  accuracy_percent: number | null;
  error_percent: number | null;
  average_time_seconds: number;
  alternative_counts: Record<string, number>;
};
type Participant = {
  id: string;
  name: string;
  email: string;
  joined_at: string;
  status: "not_started" | "not_completed" | "in_progress" | "completed" | "disqualified" | "expired";
  attempt_count: number;
  representative_attempt_id: string | null;
  representative_attempt_number: number | null;
  attempt: { id: string; status: string; attempt_number: number; started_at: string | null; submitted_at: string | null; time_spent_seconds: number | null; is_representative: boolean } | null;
  result: { display_score: number | null; percentage: number | null } | null;
  result_status: "not_available" | "pending" | "available";
  result_released_at: string | null;
  is_online: boolean;
};
type Dashboard = {
  event: { id: string; name: string; simulado_id: string | null; effective_status: string; result_policy: string; starts_at: string; simulados?: { title?: string } };
  summary: { registered: number; online: number; not_started: number; taking: number; completed: number; pending_results: number; accuracy_percent: number | null; error_percent: number | null; blank_answers: number; average_time_seconds: number };
  participants: Participant[];
  questions: ClassroomQuestion[];
};

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(safe / 60);
  const remainingSeconds = safe % 60;
  return minutes > 0 ? `${minutes}min ${String(remainingSeconds).padStart(2, "0")}s` : `${remainingSeconds}s`;
}

function formatPercent(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1).replace(".0", "").replace(".", ",")}%`;
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

const participantStatus = {
  not_started: { label: "Não iniciado", className: "border-slate-500/20 bg-slate-500/10 text-slate-300" },
  not_completed: { label: "Não realizado", className: "border-amber-500/20 bg-amber-500/10 text-amber-300" },
  in_progress: { label: "Em andamento", className: "border-blue-500/20 bg-blue-500/10 text-blue-300" },
  completed: { label: "Concluído", className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" },
  disqualified: { label: "Desclassificado", className: "border-red-500/20 bg-red-500/10 text-red-300" },
  expired: { label: "Expirado", className: "border-amber-500/20 bg-amber-500/10 text-amber-300" },
};

const PARTICIPANTS_PER_PAGE = 25;

export default function ProfessorEventoClient({ id }: { id: string }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [message, setMessage] = useState("");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [showQuestionData, setShowQuestionData] = useState(false);
  const [participantSearch, setParticipantSearch] = useState("");
  const [participantFilter, setParticipantFilter] = useState("all");
  const [participantPage, setParticipantPage] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getSession();
    if (!auth.session) return;
    const response = await fetch(`/api/professor/events/${id}`, { headers: { Authorization: `Bearer ${auth.session.access_token}` } });
    const json = await response.json();
    if (json.ok) setData(json);
    else setMessage(json.message);
  }, [id]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 10_000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  async function action(value: string) {
    const { data: auth } = await supabase.auth.getSession();
    if (!auth.session) return;
    const response = await fetch(`/api/professor/events/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.session.access_token}` }, body: JSON.stringify({ action: value }) });
    const json = await response.json();
    setMessage(json.message);
    if (json.ok) await load();
  }

  function selectQuestion(index: number) {
    setQuestionIndex(index);
    setShowQuestionData(false);
  }

  if (!data) return <main className="min-h-dvh bg-[#050b14] p-8 text-white">{message || "Carregando..."}</main>;

  const safeQuestionIndex = Math.min(questionIndex, Math.max(0, data.questions.length - 1));
  const current = data.questions[safeQuestionIndex] || null;
  const currentQuestion = current?.questions || null;
  const isAnnulled = current?.status === "annulled";
  const normalizedSearch = participantSearch.trim().toLocaleLowerCase("pt-BR");
  const filteredParticipants = data.participants.filter((participant) => {
    const matchesSearch = !normalizedSearch || `${participant.name} ${participant.email}`.toLocaleLowerCase("pt-BR").includes(normalizedSearch);
    const matchesFilter = participantFilter === "all"
      || participant.status === participantFilter
      || (participantFilter === "pending" && participant.result_status === "pending")
      || (participantFilter === "available" && participant.result_status === "available");
    return matchesSearch && matchesFilter;
  });
  const participantPageCount = Math.max(1, Math.ceil(filteredParticipants.length / PARTICIPANTS_PER_PAGE));
  const safeParticipantPage = Math.min(participantPage, participantPageCount - 1);
  const visibleParticipants = filteredParticipants.slice(safeParticipantPage * PARTICIPANTS_PER_PAGE, (safeParticipantPage + 1) * PARTICIPANTS_PER_PAGE);
  const secondsToStart = Math.max(0, Math.ceil((new Date(data.event.starts_at).getTime() - now) / 1_000));
  const countdown = `${Math.floor(secondsToStart / 3600)}h ${String(Math.floor((secondsToStart % 3600) / 60)).padStart(2, "0")}min ${String(secondsToStart % 60).padStart(2, "0")}s`;
  const overview = [
    ["Inscritos", data.summary.registered], ["Online agora", data.summary.online], ["Não iniciaram", data.summary.not_started], ["Realizando", data.summary.taking],
    ["Concluídos", data.summary.completed], ["Resultados pendentes", data.summary.pending_results], ["Acertos", formatPercent(data.summary.accuracy_percent)],
    ["Erros", formatPercent(data.summary.error_percent)], ["Em branco", data.summary.blank_answers], ["Tempo médio", formatTime(data.summary.average_time_seconds)],
  ];

  return (
    <main className="min-h-dvh bg-[#050b14] px-4 py-8 text-white">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-400">Evento de Simulado</p>
        <h1 className="mt-2 text-3xl font-black">{data.event.name}</h1>
        {data.event.effective_status === "scheduled" && <div className="mt-5 rounded-2xl border border-orange-400/20 bg-orange-500/10 p-5"><p className="font-black text-orange-200">Pré-evento · começa em {countdown}</p><p className="mt-2 text-sm text-slate-300">{data.summary.registered} inscritos · {data.summary.online} online agora · Horário de Brasília</p><p className="mt-2 line-clamp-2 text-xs text-slate-400">{data.participants.map((participant) => participant.name).join(" · ") || "Nenhum participante inscrito."}</p></div>}
        {!data.event.simulado_id && <div className="mt-5 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-5 font-semibold text-amber-200">Evento sem Simulado vinculado. O início e a aplicação estão bloqueados até a configuração ser concluída pelo administrador.</div>}
        {data.event.effective_status === "closed" && data.summary.taking > 0 && <div className="mt-5 rounded-2xl border border-blue-400/30 bg-blue-500/10 p-5 font-semibold text-blue-200">Evento encerrado com {data.summary.taking} tentativa(s) ainda em andamento. Esses alunos podem concluir normalmente; novas tentativas permanecem bloqueadas.</div>}
        <div className="mt-5 flex flex-wrap gap-3">
          {data.event.simulado_id && <PremiumButton href={`/professor/eventos/${id}/preview`} variant="dark" icon={<Eye size={17} />}>Ver simulado como aluno</PremiumButton>}
          <PremiumButton href="#dashboard" variant="dark-primary" icon={<BarChart3 size={17} />}>Dashboard de resultados</PremiumButton>
          {data.event.effective_status === "scheduled" && data.event.simulado_id && <PremiumButton onClick={() => void action("start")} icon={<PlayCircle size={17} />}>Iniciar agora</PremiumButton>}
          {data.event.result_policy === "blocked" && data.summary.pending_results > 0 && <PremiumButton onClick={() => void action("release_results")} icon={<Unlock size={17} />}>Liberar resultados ({data.summary.pending_results})</PremiumButton>}
        </div>
        {message && <p className="mt-4 text-sm text-orange-200">{message}</p>}

        <nav className="mt-7 flex flex-wrap gap-2" aria-label="Áreas da dashboard">
          <PremiumButton href="#overview" variant="dark" icon={<BarChart3 size={16} />}>Visão geral</PremiumButton>
          <PremiumButton href="#classroom" variant="dark" icon={<Presentation size={16} />}>Questões / Modo aula</PremiumButton>
          <PremiumButton href="#participants" variant="dark" icon={<Users size={16} />}>Participantes</PremiumButton>
        </nav>

        <section id="dashboard" className="mt-8">
          <h2 className="sr-only">Visão geral</h2>
          <div id="overview" className="scroll-mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {overview.map(([label, value]) => <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><p className="text-xs uppercase text-slate-400">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></div>)}
          </div>

          <section id="classroom" className="mt-9 scroll-mt-6" aria-labelledby="classroom-mode-title">
            <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-orange-300"><Presentation size={16} /> Questões</p>
                <h2 id="classroom-mode-title" className="mt-2 text-2xl font-black">Modo aula</h2>
                <p className="mt-1 max-w-2xl text-sm text-slate-400">Apresente a questão sem revelar o gabarito. Os dados aparecem somente quando você solicitar.</p>
              </div>
              {current && <span className="text-sm font-bold text-slate-300">Questão {safeQuestionIndex + 1} de {data.questions.length}</span>}
            </div>

            {current && currentQuestion ? (
              <div className="mt-6">
                <div className="mb-5 flex gap-2 overflow-x-auto pb-2" aria-label="Selecionar questão">
                  {data.questions.map((question, index) => (
                    <PremiumButton key={question.id} variant={index === safeQuestionIndex ? "dark-primary" : "dark"} className="min-w-11 px-3 py-2" onClick={() => selectQuestion(index)}>{index + 1}</PremiumButton>
                  ))}
                </div>

                <QuestionDisplayCard
                  question={currentQuestion}
                  orderLabel={`Questão ${current.order_number}`}
                  showCorrect={showQuestionData && !isAnnulled}
                  markIncorrect={showQuestionData && !isAnnulled}
                  extraBadges={isAnnulled ? <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">Questão anulada</span> : undefined}
                  renderAlternativeMeta={showQuestionData ? (alternative) => {
                    const count = current.alternative_counts[alternative.id || ""] || 0;
                    const percentage = current.answered > 0 ? (count / current.answered) * 100 : 0;
                    return <span className="ml-auto shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-xs font-bold text-slate-700"><span className="block text-base text-slate-950">{percentage.toFixed(1).replace(".", ",")}%</span>{count} {count === 1 ? "aluno" : "alunos"}</span>;
                  } : undefined}
                />

                {showQuestionData && (
                  <div className="mt-5">
                    {current.answered === 0 && <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center text-sm text-slate-300">Nenhuma resposta registrada até o momento.</p>}
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <Metric label="Total considerado" value={String(current.total_considered)} />
                      <Metric label="Acertos" value={isAnnulled ? "—" : String(current.correct)} detail={isAnnulled ? "Questão anulada" : formatPercent(current.accuracy_percent)} />
                      <Metric label="Erros" value={isAnnulled ? "—" : String(current.wrong)} detail={isAnnulled ? "Questão anulada" : formatPercent(current.error_percent)} />
                      <Metric label="Brancos concluídos" value={String(current.blank)} detail={`Tempo médio ${formatTime(current.average_time_seconds)}`} />
                    </div>
                  </div>
                )}

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <PremiumButton variant="dark" disabled={safeQuestionIndex === 0} onClick={() => selectQuestion(safeQuestionIndex - 1)} icon={<ArrowLeft size={17} />}>Questão anterior</PremiumButton>
                  <PremiumButton variant={showQuestionData ? "dark" : "dark-primary"} onClick={() => setShowQuestionData((visible) => !visible)} icon={showQuestionData ? <EyeOff size={17} /> : <Eye size={17} />}>{showQuestionData ? "Ocultar dados" : "Exibir dados"}</PremiumButton>
                  <PremiumButton variant="dark" disabled={safeQuestionIndex === data.questions.length - 1} onClick={() => selectQuestion(safeQuestionIndex + 1)}>Próxima questão <ArrowRight size={17} /></PremiumButton>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-10 text-center text-slate-400">Este Evento ainda não possui questões disponíveis para o modo aula.</div>
            )}
          </section>

          <section id="participants" className="mt-12 scroll-mt-6" aria-labelledby="participants-title">
            <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-orange-300"><Users size={16} /> Acompanhamento individual</p>
                <h2 id="participants-title" className="mt-2 text-2xl font-black">Participantes</h2>
                <p className="mt-1 text-sm text-slate-400">Dados pedagógicos exclusivos deste Evento. Horários de Brasília.</p>
              </div>
              <span className="text-sm font-bold text-slate-300">{filteredParticipants.length} de {data.participants.length}</span>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
              <PremiumInput variant="jornada" label="Buscar participante" icon={<Search size={16} />} value={participantSearch} placeholder="Nome ou e-mail" onChange={(event: React.ChangeEvent<HTMLInputElement>) => { setParticipantSearch(event.target.value); setParticipantPage(0); }} />
              <PremiumSelect variant="jornada" label="Situação" value={participantFilter} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => { setParticipantFilter(event.target.value); setParticipantPage(0); }}>
                <option value="all">Todos</option>
                <option value="not_started">Não iniciados</option>
                <option value="in_progress">Em andamento</option>
                <option value="completed">Concluídos</option>
                <option value="not_completed">Não realizados</option>
                <option value="pending">Aguardando resultado</option>
                <option value="available">Resultado disponível</option>
              </PremiumSelect>
            </div>

            <div className="mt-5 space-y-3">
              {visibleParticipants.map((participant) => {
                const status = participantStatus[participant.status];
                return (
                  <article key={participant.id} className="rounded-[1.4rem] border border-white/10 bg-white/[0.04] p-4 md:p-5">
                    <div className="grid gap-5 lg:grid-cols-[minmax(220px,1.25fr)_minmax(260px,1fr)_minmax(220px,0.8fr)] lg:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate font-black text-white">{participant.name}</h3>
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${participant.is_online ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-300" : "border-slate-500/20 bg-slate-500/10 text-slate-400"}`}>{participant.is_online ? "Online" : "Offline"}</span>
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${status.className}`}>{status.label}</span>
                        </div>
                        <p className="mt-1 truncate text-sm text-slate-400">{participant.email || "E-mail não disponível"}</p>
                        <p className="mt-2 text-xs text-slate-500">Ingresso: {formatDateTime(participant.joined_at)}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                        <ParticipantInfo label="Início" value={formatDateTime(participant.attempt?.started_at || null)} />
                        <ParticipantInfo label="Conclusão" value={formatDateTime(participant.attempt?.submitted_at || null)} />
                        <ParticipantInfo label="Tempo" value={participant.attempt?.submitted_at && participant.attempt.time_spent_seconds !== null ? formatTime(participant.attempt.time_spent_seconds) : "—"} />
                        <ParticipantInfo label="Tentativas no Evento" value={String(participant.attempt_count)} />
                      </div>

                      <div className="rounded-2xl border border-white/[0.08] bg-black/15 p-4">
                        {participant.result ? (
                          <div className="flex items-end justify-between gap-3">
                            <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Resultado oficial</p><p className="mt-1 text-2xl font-black text-white">{formatPercent(participant.result.percentage)}</p></div>
                            {participant.result.display_score !== null && <span className="text-xs font-bold text-slate-400">Nota {Number(participant.result.display_score).toLocaleString("pt-BR")}</span>}
                          </div>
                        ) : <p className="text-sm font-semibold text-slate-400">Resultado ainda não calculado</p>}
                        <div className={`mt-3 flex items-center gap-2 text-xs font-bold ${participant.result_status === "available" ? "text-emerald-300" : participant.result_status === "pending" ? "text-amber-300" : "text-slate-500"}`}>
                          <ListChecks size={15} />
                          {participant.result_status === "available" ? "Resultado disponível" : participant.result_status === "pending" ? "Resultado aguardando liberação" : "Sem resultado disponível"}
                        </div>
                        {participant.representative_attempt_number && <p className="mt-2 text-[11px] text-slate-500">Tentativa oficial #{participant.representative_attempt_number}{participant.attempt && !participant.attempt.is_representative ? ` · tentativa #${participant.attempt.attempt_number} em andamento` : ""}</p>}
                      </div>
                    </div>
                  </article>
                );
              })}
              {visibleParticipants.length === 0 && <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-10 text-center text-slate-400">Nenhum participante encontrado.</div>}
            </div>

            {participantPageCount > 1 && (
              <div className="mt-5 flex items-center justify-between gap-3">
                <PremiumButton variant="dark" disabled={safeParticipantPage === 0} onClick={() => setParticipantPage(safeParticipantPage - 1)} icon={<ArrowLeft size={16} />}>Anterior</PremiumButton>
                <span className="text-sm font-bold text-slate-400">Página {safeParticipantPage + 1} de {participantPageCount}</span>
                <PremiumButton variant="dark" disabled={safeParticipantPage === participantPageCount - 1} onClick={() => setParticipantPage(safeParticipantPage + 1)}>Próxima <ArrowRight size={16} /></PremiumButton>
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-2 text-2xl font-black text-white">{value}</p>{detail && <p className="mt-1 text-xs text-slate-400">{detail}</p>}</div>;
}

function ParticipantInfo({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 font-semibold text-slate-200">{value}</p></div>;
}
