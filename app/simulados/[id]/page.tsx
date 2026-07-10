import Link from "next/link";
import PremiumDifficultyStars from "@/app/components/questions/PremiumDifficultyStars";
import QuestionCodePopupLink from "@/app/components/questions/QuestionCodePopupLink";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  Clock3,
  FileQuestion,
  Gauge,
  MapPinned,
  Pencil,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdminPage } from "@/lib/server/authGuard";
import { hasEvaluatedTopics, normalizeEvaluatedTopics } from "@/lib/questions/evaluated-topics";
import PremiumButton from "../../components/ui/PremiumButton";
import SimuladoCard from "../components/SimuladoCard";
import SimuladoShell from "../components/SimuladoShell";
import SimuladoDetailActions from "./SimuladoDetailActions";
import {
  attemptsLabel,
  difficultyLabel,
  formatDateTime,
  scoringLabel,
  statusClass,
  statusLabel,
  timeLimitLabel,
} from "../utils";

const OWL_MARK = "\u{1F989}\uFE0F";

async function getData(id: string) {
  const supabase = createSupabaseAdminClient();

  const { data: simulado, error } = await supabase
    .from("simulados")
    .select(`
      *,
      disciplines:discipline_id (
        id,
        name
      ),
      simulado_questions (
        id,
        order_number,
        points,
        status,
        questions:question_id (
          id,
          code,
          statement,
          image_url,
          explanation_text,
          difficulty_level,
          evaluated_topics,
          year,
          question_type,
          exam_boards:exam_board_id (
            id,
            name
          ),
          subjects:subject_id (
            id,
            name,
            disciplines:discipline_id (
              id,
              name
            )
          ),
          question_alternatives (
            id,
            label,
            text,
            image_url,
            is_correct,
            order_number
          )
        )
      )
    `)
    .eq("id", id)
    .single();

  if (error || !simulado) return null;

  const [{ data: results }, { data: jornadaLinks }] = await Promise.all([
    supabase
      .from("simulado_results")
      .select("simulado_id, display_score, display_percentage, percentage, time_spent_seconds")
      .eq("simulado_id", id),
    supabase
      .from("jornada_simulados")
      .select("simulado_id, jornadas(id, title, status)")
      .eq("simulado_id", id),
  ]);

  const scores = ((results || []) as any[])
    .map((row) => row.display_score)
    .filter((value) => value !== null && value !== undefined)
    .map(Number)
    .filter((value) => Number.isFinite(value));

  const percentages = ((results || []) as any[])
    .map((row) => row.display_percentage ?? row.percentage)
    .filter((value) => value !== null && value !== undefined)
    .map(Number)
    .filter((value) => Number.isFinite(value));

  const timeSpentValues = ((results || []) as any[])
    .map((row) => Number(row.time_spent_seconds || 0))
    .filter((value) => Number.isFinite(value) && value > 0);

  const jornadas = Array.from(
    new Set(
      ((jornadaLinks || []) as any[])
        .map((link) => {
          const jornada = Array.isArray(link.jornadas) ? link.jornadas[0] : link.jornadas;
          return jornada?.title;
        })
        .filter(Boolean),
    ),
  );

  return {
    ...simulado,
    insights: {
      execution_count: ((results || []) as any[]).length,
      average_score: scores.length
        ? Math.round((scores.reduce((acc, value) => acc + value, 0) / scores.length) * 100) / 100
        : null,
      average_percentage: percentages.length
        ? Math.round((percentages.reduce((acc, value) => acc + value, 0) / percentages.length) * 100) / 100
        : null,
      average_time_seconds: timeSpentValues.length
        ? Math.round(timeSpentValues.reduce((acc, value) => acc + value, 0) / timeSpentValues.length)
        : null,
      jornadas,
    },
  };
}

function richHtml(value?: string | null): string {
  return (value || "").replace(
    /<mark([^>]*)>/gi,
    '<mark data-highlight="true" class="bg-yellow-200 px-1 rounded">',
  );
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  const safe = Math.max(0, Math.floor(Number(seconds || 0)));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getOwlHelpLimit(questionCount?: number | null) {
  const total = Number(questionCount || 0);
  if (total <= 0) return 1;
  return Math.max(1, Math.floor(total * 0.1));
}

function normalizeSubjectDisplayName(value: string | null | undefined) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  const lowerWords = new Set(["a", "as", "o", "os", "e", "em", "no", "na", "nos", "nas", "de", "da", "das", "do", "dos", "para", "por", "com", "sem", "sob", "sobre", "entre"]);
  const acronyms = new Map([["ia", "IA"], ["ti", "TI"], ["api", "API"], ["html", "HTML"], ["css", "CSS"], ["pdf", "PDF"], ["usb", "USB"], ["tcp", "TCP"], ["ip", "IP"], ["dns", "DNS"], ["ssd", "SSD"], ["hd", "HD"], ["ram", "RAM"], ["rom", "ROM"], ["wifi", "Wi-Fi"], ["wi-fi", "Wi-Fi"], ["macos", "macOS"]]);
  return text.split(" ").map((token, index) => {
    const comparable = token.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    if (index > 0 && lowerWords.has(comparable)) return comparable;
    if (acronyms.has(comparable)) return acronyms.get(comparable) || token;
    return token.toLowerCase().split(/([\-\/])/).map((part) => {
      if (part === "-" || part === "/" || !part) return part;
      const partComparable = part.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      if (acronyms.has(partComparable)) return acronyms.get(partComparable) || part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    }).join("");
  }).join(" ");
}

export default async function SimuladoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage();
  const { id } = await params;
  const sp = await searchParams;
  const rawRetorno = typeof sp.retorno === "string" ? sp.retorno : "";
  const backUrl = rawRetorno.startsWith("/simulados") ? rawRetorno : "/simulados";
  const simulado = await getData(id);

  if (!simulado) notFound();

  const questions = [...(simulado.simulado_questions || [])].sort(
    (a: any, b: any) => (a.order_number || 0) - (b.order_number || 0),
  );
  const insights = (simulado as any).insights || { execution_count: 0, average_score: null, average_percentage: null, jornadas: [] };
  const insightsJornadas = Array.isArray(insights.jornadas) && insights.jornadas.length > 0
    ? insights.jornadas.join(", ")
    : "—";
  const insightsAverage = insights.average_score === null || insights.average_score === undefined
    ? "—"
    : `${(Math.round(Number(insights.average_score) * 10) / 10).toLocaleString("pt-BR")} pts`;
  const insightsAveragePercentage = insights.average_percentage === null || insights.average_percentage === undefined
    ? undefined
    : `(${(Math.round(Number(insights.average_percentage) * 10) / 10).toLocaleString("pt-BR")}%)`;
  const insightsAverageTime = formatDuration(insights.average_time_seconds);

  const subjectDistribution = (() => {
    const counts = new Map<string, number>();
    questions.forEach((relation: any) => {
      const subjectName = normalizeSubjectDisplayName(relation.questions?.subjects?.name) || "Sem assunto";
      counts.set(subjectName, (counts.get(subjectName) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  })();

  return (
    <SimuladoShell
      variant="dark"
      title={simulado.title}
      description={simulado.description || "Detalhes administrativos do simulado."}
      action={
        <div className="flex flex-wrap gap-3">
          <Link href={backUrl}>
            <PremiumButton variant="secondary" icon={<ArrowLeft size={18} />}>Voltar</PremiumButton>
          </Link>
          <Link href={`/simulados/${simulado.id}/editar`}>
            <PremiumButton icon={<Pencil size={18} />}>Editar</PremiumButton>
          </Link>
        </div>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <SimuladoCard variant="dark" title="Dados do simulado" description="Configurações principais e status." icon={<Settings2 size={18} />}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Metric label="Status" value={statusLabel(simulado.status)} highlight className={statusClass(simulado.status)} />
              <Metric label="Disciplina" value={simulado.disciplines?.name || "Sem disciplina"} />
              <Metric label="Atualizado" value={formatDateTime(simulado.updated_at)} />
              <Metric label="Criado" value={formatDateTime(simulado.created_at)} />
            </div>
          </SimuladoCard>

          <SimuladoCard
            variant="dark"
            title="Questões"
            description={`${questions.length} questão(ões) vinculada(s). Conteúdo completo para revisão.`}
            icon={<FileQuestion size={18} />}
          >
            {questions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.04] p-10 text-center text-sm text-slate-400">
                Nenhuma questão vinculada ainda.
              </div>
            ) : (
              <div className="space-y-6">
                {questions.map((relation: any) => {
                  const q = relation.questions;
                  const alternatives = [...(q?.question_alternatives || [])].sort(
                    (a: any, b: any) => (a.order_number || 0) - (b.order_number || 0),
                  );
                  const topicsPending = !hasEvaluatedTopics(q?.evaluated_topics);

                  return (
                    <div key={relation.id} className={`rounded-[1.35rem] border p-5 shadow-xl ${topicsPending ? "border-amber-400/50 bg-amber-500/[0.06] shadow-amber-900/30 ring-2 ring-amber-400/20" : "border-white/10 bg-slate-950/55 shadow-black/15"}`}>
                      {/* Header badges */}
                      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-semibold">
                        <span className="rounded-full bg-white px-3 py-1 text-slate-950">
                          #{relation.order_number}
                        </span>
                        {q?.id && (
                          <QuestionCodePopupLink
                            questionId={q.id}
                            code={q?.code || "Sem código"}
                            className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-black text-orange-700 transition hover:border-orange-300 hover:bg-orange-100"
                          />
                        )}
                        <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-orange-700">
                          {q?.exam_boards?.name || "Sem banca"}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-slate-300">
                          {q?.subjects?.disciplines?.name || "Sem disciplina"} / {q?.subjects?.name || "Sem assunto"}
                        </span>
                        {q?.year && (
                          <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-slate-300">
                            {q.year}
                          </span>
                        )}
                        {q?.difficulty_level && (
                          <PremiumDifficultyStars value={q.difficulty_level} compact />
                        )}
                        {relation.status === "annulled" && (
                          <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-red-700">
                            Anulada
                          </span>
                        )}
                        {topicsPending && (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-amber-800">
                            ⚠ Sem tópicos avaliados
                          </span>
                        )}
                      </div>

                      {!topicsPending && (
                        <div className="mb-3 flex flex-wrap gap-1.5">
                          {normalizeEvaluatedTopics(q?.evaluated_topics).map((topic: string) => (
                            <span key={topic} className="rounded-full border border-emerald-400/25 bg-emerald-400/[0.10] px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">
                              {topic}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Statement */}
                      <div
                        className="richtext-editor relative mt-5 max-w-none rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-4 text-sm leading-7 text-slate-100 md:text-base"
                        dangerouslySetInnerHTML={{ __html: richHtml(q?.statement) }}
                      />

                      {/* Statement image */}
                      {q?.image_url && (
                        <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                          <img
                            src={q.image_url}
                            alt="Imagem do enunciado"
                            className="max-h-72 rounded-xl object-contain"
                          />
                        </div>
                      )}

                      {/* Alternatives */}
                      {alternatives.length > 0 && (
                        <div className="mt-4 space-y-2">
                          {alternatives.map((alt: any) => {
                            const isWrongTrueFalse = q?.question_type === "true_false" && alt.is_correct && (alt.label === "E" || String(alt.text || "").trim().toLowerCase() === "errado");

                            return (
                              <div
                                key={alt.id}
                                className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${
                                  isWrongTrueFalse
                                    ? "border-red-300 bg-red-50"
                                    : alt.is_correct
                                      ? "border-emerald-300 bg-emerald-50"
                                      : "border-white/10 bg-white/[0.045]"
                                }`}
                              >
                                <span
                                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                                    isWrongTrueFalse
                                      ? "border-red-500 bg-red-500 text-white"
                                      : alt.is_correct
                                        ? "border-emerald-500 bg-emerald-500 text-white"
                                        : "border-white/20 bg-slate-950 text-slate-300"
                                  }`}
                                >
                                  {alt.is_correct ? OWL_MARK : q?.question_type === "true_false" ? "" : alt.label}
                                </span>
                                <div className="flex-1">
                                  <div
                                    className={`richtext-editor max-w-none text-sm leading-6 ${isWrongTrueFalse ? "text-red-900" : alt.is_correct ? "text-emerald-900" : "text-slate-100"}`}
                                    dangerouslySetInnerHTML={{ __html: richHtml(alt.text) }}
                                  />
                                  {alt.image_url && (
                                    <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-slate-950/50 p-2">
                                      <img
                                        src={alt.image_url}
                                        alt={`Imagem alternativa ${alt.label}`}
                                        className="max-h-40 rounded-lg object-contain"
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Explanation */}
                      {q?.explanation_text && (
                        <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm leading-6 text-emerald-100">
                          <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-emerald-300">
                            Comentário / Explicação
                          </p>
                          <div
                            className="richtext-editor max-w-none text-sm leading-6"
                            dangerouslySetInnerHTML={{ __html: richHtml(q.explanation_text) }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </SimuladoCard>
        </div>

        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <div className="overflow-hidden rounded-[1.55rem] border border-slate-900 bg-slate-950 shadow-2xl shadow-slate-950/20 ring-1 ring-orange-400/20">
            <div className="relative overflow-hidden border-b border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-orange-950/70 p-4">
              <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-orange-400/20 blur-2xl" />
              <div className="relative flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-amber-300 text-slate-950 shadow-lg shadow-orange-500/30">
                  <ShieldCheck size={21} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-200">Resumo do simulado</p>
                  <h3 className="mt-1 text-base font-black text-white">Configuração ativa</h3>
                  <p className="mt-1 text-xs font-medium leading-5 text-slate-300">Visão rápida das regras atuais.</p>
                </div>
              </div>
            </div>
            <div className="space-y-2.5 p-3">
              <Summary label="Questões" value={simulado.question_count ? String(simulado.question_count) : String(questions.length || "Não definido")} icon={<Target size={15} />} />
              <Summary label="Tempo" value={timeLimitLabel(simulado.time_limit_minutes)} icon={<Clock3 size={15} />} />
              <Summary label="Pontuação" value={scoringLabel(simulado.scoring_model)} icon={<Trophy size={15} />} />
              <Summary label="Status" value={statusLabel(simulado.status)} icon={<FileQuestion size={15} />} />
              <Summary label="Tentativas" value={attemptsLabel(simulado.max_attempts)} icon={<RotateCcw size={15} />} />
              <Summary label="Ajuda da Coruja" value={(simulado as any).owl_help_enabled ? `${getOwlHelpLimit(simulado.question_count || questions.length)} uso(s)` : "Desabilitada"} icon={<span className="text-sm">{OWL_MARK}</span>} accent={Boolean((simulado as any).owl_help_enabled)} />
            </div>
          </div>

          <div className="overflow-hidden rounded-[1.55rem] border border-slate-900 bg-slate-950 shadow-2xl shadow-slate-950/20 ring-1 ring-orange-400/20">
            <div className="relative overflow-hidden border-b border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-orange-950/70 p-4">
              <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-orange-400/20 blur-2xl" />
              <div className="relative flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-amber-300 text-slate-950 shadow-lg shadow-orange-500/30">
                  <Gauge size={21} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-200">Insights</p>
                  <h3 className="mt-1 text-base font-black text-white">Desempenho e uso</h3>
                  <p className="mt-1 text-xs font-medium leading-5 text-slate-300">Indicadores administrativos do simulado.</p>
                </div>
              </div>
            </div>
            <div className="space-y-2.5 p-3">
              <Summary label="Execuções" value={String(insights.execution_count || 0)} icon={<Users size={15} />} />
              <Summary label="Nota média" value={insightsAverage} secondaryValue={insightsAveragePercentage} icon={<Gauge size={15} />} accent={insights.average_score !== null && insights.average_score !== undefined} />
              <Summary label="Tempo médio" value={insightsAverageTime} icon={<Clock3 size={15} />} accent={insights.average_time_seconds !== null && insights.average_time_seconds !== undefined} />
              <Summary label="Jornadas" value={insightsJornadas} icon={<MapPinned size={15} />} />
            </div>
          </div>

          <div className="overflow-hidden rounded-[1.55rem] border border-slate-900 bg-slate-950 shadow-2xl shadow-slate-950/20 ring-1 ring-orange-400/20">
            <div className="relative overflow-hidden border-b border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-orange-950/70 p-4">
              <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-orange-400/20 blur-2xl" />
              <div className="relative flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-amber-300 text-slate-950 shadow-lg shadow-orange-500/30">
                  <BarChart3 size={21} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-200">Banco de Questões</p>
                  <h3 className="mt-1 text-base font-black text-white">Distribuição por assunto</h3>
                  <p className="mt-1 text-xs font-medium leading-5 text-slate-300">Quantidade de questões vinculadas, agrupadas por assunto.</p>
                </div>
              </div>
            </div>
            <div className="p-3">
              {subjectDistribution.length ? (
                <div className="space-y-2">
                  {subjectDistribution.map((item) => {
                    const itemPct = questions.length > 0 ? (item.count / questions.length) * 100 : 0;
                    return (
                      <div key={item.name} className="grid grid-cols-[1fr_auto] items-center gap-3 text-xs">
                        <div>
                          <span className="block truncate font-bold text-slate-200">{item.name}</span>
                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
                            <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-300" style={{ width: `${itemPct}%` }} />
                          </div>
                        </div>
                        <span className="text-right font-black text-orange-200">{item.count}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm font-semibold text-slate-400">Nenhuma questão vinculada ainda.</p>
              )}
            </div>
          </div>

          <SimuladoDetailActions simulado={simulado} questions={questions} />
        </aside>
      </div>
    </SimuladoShell>
  );
}

function Metric({ label, value, highlight, className = "" }: { label: string; value: string; highlight?: boolean; className?: string }) {
  return (
    <div className={`rounded-2xl border p-4 ${highlight ? className : "border-white/10 bg-white/[0.055] text-slate-100"}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] opacity-70">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function Summary({ label, value, secondaryValue, icon, accent = false }: { label: string; value: string; secondaryValue?: string; icon?: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`group flex items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 shadow-sm transition ${accent ? "border-orange-300/40 bg-orange-400/15 shadow-orange-500/10" : "border-white/10 bg-white/[0.06] hover:bg-white/[0.09]"}`}>
      <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-300">
        <span className={`flex h-7 w-7 items-center justify-center rounded-xl ${accent ? "bg-orange-400 text-slate-950" : "bg-white/10 text-orange-200"}`}>{icon}</span>
        {label}
      </span>
      <span className={`text-right text-sm font-black ${accent ? "text-orange-200" : "text-white"}`}>
        {value}
        {secondaryValue && <span className="ml-1 text-[10px] font-semibold opacity-70">{secondaryValue}</span>}
      </span>
    </div>
  );
}
