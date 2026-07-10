"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bookmark,
  BookOpen,
  Brain,
  Calculator,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock3,
  Download,
  Eye,
  FileText,
  Hourglass,
  Info,
  ListChecks,
  MessageCircleQuestion,
  RotateCcw,
  Scissors,
  Send,
  Shield,
  ShieldAlert,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  Trophy,
  XCircle,
} from "lucide-react";

const OWL_MARK = "\u{1F989}\uFE0F";

// ─── Types ───────────────────────────────────────────────────────────────────

type SimuladoMeta = {
  id: string;
  title: string;
  description: string | null;
  question_count: number;
  time_limit_minutes: number | null;
  max_attempts: number | null;
  show_result_on_finish: boolean;
  show_answer_key_on_finish: boolean;
  instant_feedback_enabled: boolean;
  feedback_mode?: "instant" | "final_only" | null;
  show_teacher_comment: boolean;
  correction_video_url: string | null;
  shuffle_questions: boolean;
  shuffle_alternatives: boolean;
  allow_blank_answers: boolean;
  scoring_model: "traditional" | "cebraspe";
  owl_help_enabled?: boolean;
};

type PreviewQuestion = {
  simulado_question_id: string;
  question_id: string;
  order_number: number;
  points: number;
  status: string;
  statement: string | null;
  explanation_text: string | null;
  question_type: string | null;
  exam_board: string | null;
  subject: string | null;
  alternatives: {
    id: string;
    label: string;
    text: string;
    image_url?: string | null;
    is_correct: boolean;
  }[];
};

type AnswerState = {
  alternativeId: string;
  label: string;
  isCorrect: boolean | null;
};

type Phase = "rules" | "in_progress" | "focus_warning" | "done";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0)
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function richHtml(value?: string | null): string {
  // Preserva o HTML/rich text original salvo no banco.
  // A diagramação fina fica por conta da classe global .richtext-editor,
  // que mantém quebras de linha e espaçamento como na tela do banco.
  return (value || "").replace(
    /<mark([^>]*)>/gi,
    '<mark data-highlight="true" class="bg-yellow-200 px-1 rounded">',
  );
}

function isTrueFalseQuestionType(value?: string | null): boolean {
  return String(value || "").toLowerCase() === "true_false";
}

function scoringDescription(model: "traditional" | "cebraspe"): string {
  return model === "cebraspe"
    ? "Modelo CEBRASPE: acerto soma, erro subtrai, branco zera."
    : "Modelo tradicional: acerto soma, erro e branco não pontuam.";
}

function getOwlHelpLimit(totalQuestions: number): number {
  if (!totalQuestions || totalQuestions <= 0) return 1;
  return Math.max(1, Math.floor(totalQuestions * 0.1));
}

function isOwlEligibleQuestion(question?: PreviewQuestion | null): boolean {
  if (!question || question.question_type === "true_false") return false;
  const wrongAlternatives = question.alternatives.filter((alt) => !alt.is_correct);
  return wrongAlternatives.length >= 2;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PreviewSimuladoClient({
  simulado,
}: {
  simulado: any;
}) {
  const questions: PreviewQuestion[] = useMemo(
    () =>
      [...(simulado.simulado_questions || [])].sort(
        (a: any, b: any) => (a.order_number || 0) - (b.order_number || 0),
      ).map((rel: any) => ({
        simulado_question_id: rel.id,
        question_id: rel.questions?.id || "",
        order_number: rel.order_number,
        points: rel.points,
        status: rel.status,
        statement: rel.questions?.statement || null,
        explanation_text: rel.questions?.explanation_text || null,
        question_type: rel.questions?.question_type || null,
        exam_board: rel.questions?.exam_boards?.name || null,
        subject: rel.questions?.subjects?.name || null,
        alternatives: [...(rel.questions?.question_alternatives || [])]
          .sort((a: any, b: any) => (a.order_number || 0) - (b.order_number || 0))
          .map((alt: any) => ({
            id: alt.id,
            label: alt.label,
            text: alt.text,
            image_url: alt.image_url,
            is_correct: alt.is_correct,
          })),
      })),
    [simulado.simulado_questions],
  );

  const meta: SimuladoMeta = {
    id: simulado.id,
    title: simulado.title,
    description: simulado.description,
    question_count: questions.length,
    time_limit_minutes: simulado.time_limit_minutes,
    max_attempts: simulado.max_attempts,
    show_result_on_finish: simulado.show_result_on_finish,
    show_answer_key_on_finish: simulado.show_answer_key_on_finish,
    instant_feedback_enabled: simulado.feedback_mode === "instant" || simulado.instant_feedback_enabled,
    feedback_mode: simulado.feedback_mode || (simulado.instant_feedback_enabled ? "instant" : "final_only"),
    show_teacher_comment: simulado.show_teacher_comment,
    correction_video_url: simulado.correction_video_url,
    shuffle_questions: simulado.shuffle_questions,
    shuffle_alternatives: simulado.shuffle_alternatives,
    allow_blank_answers: simulado.allow_blank_answers,
    scoring_model: simulado.scoring_model || "traditional",
    owl_help_enabled: Boolean(simulado.owl_help_enabled),
  };

  const [phase, setPhase] = useState<Phase>("rules");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [timeSpent, setTimeSpent] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(
    meta.time_limit_minutes ? meta.time_limit_minutes * 60 : null,
  );
  const [violationWarned, setViolationWarned] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [instantResultQuestionId, setInstantResultQuestionId] = useState<string | null>(null);
  const [answerChanges, setAnswerChanges] = useState(0);
  const [resultStep, setResultStep] = useState(0);
  const [owlHelpModalOpen, setOwlHelpModalOpen] = useState(false);
  const [owlHelpUsed, setOwlHelpUsed] = useState<Record<string, string[]>>({});
  const [manuallyEliminatedAlternatives, setManuallyEliminatedAlternatives] = useState<Record<string, string[]>>({});

  const lastViolationTime = useRef(0);
  const questionStartRef = useRef(Date.now());

  // Timer
  useEffect(() => {
    if (phase !== "in_progress") return;
    const interval = window.setInterval(() => {
      setTimeSpent((prev) => prev + 1);
      setRemainingSeconds((prev) => (prev !== null ? Math.max(prev - 1, 0) : null));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [phase]);

  // Time expired → just show done (no DB write)
  useEffect(() => {
    if (phase !== "in_progress" || remainingSeconds === null) return;
    if (remainingSeconds <= 0) setPhase("done");
  }, [remainingSeconds, phase]);

  // Anti-fraud detection (visual only — no disqualification in preview)
  const handleViolation = useCallback(() => {
    if (phase !== "in_progress") return;
    const now = Date.now();
    if (now - lastViolationTime.current < 1000) return;
    lastViolationTime.current = now;
    if (!violationWarned) {
      setViolationWarned(true);
      setPhase("focus_warning");
    }
  }, [phase, violationWarned]);

  useEffect(() => {
    function onVisibility() {
      if (document.hidden) handleViolation();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [handleViolation]);

  // Block print/save in progress
  useEffect(() => {
    if (phase !== "in_progress" && phase !== "focus_warning") return;
    function blockPrint(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && "pPsS".includes(e.key)) e.preventDefault();
    }
    function blockContext(e: MouseEvent) { e.preventDefault(); }
    document.addEventListener("keydown", blockPrint);
    document.addEventListener("contextmenu", blockContext);
    return () => {
      document.removeEventListener("keydown", blockPrint);
      document.removeEventListener("contextmenu", blockContext);
    };
  }, [phase]);

  function startPreview() {
    setPhase("in_progress");
    setCurrentIndex(0);
    questionStartRef.current = Date.now();
  }

  function selectAnswer(question: PreviewQuestion, alt: { id: string; label: string; is_correct: boolean }) {
    clearManualEliminatedAlternative(question.simulado_question_id, alt.id);
    const existing = answers[question.simulado_question_id];
    if (meta.instant_feedback_enabled && existing && existing.isCorrect !== null && existing.isCorrect !== undefined) return;

    if (existing?.alternativeId && existing.alternativeId !== alt.id && existing.isCorrect === null) {
      setAnswerChanges((current) => current + 1);
    }

    setAnswers((prev) => ({
      ...prev,
      [question.simulado_question_id]: {
        alternativeId: alt.id,
        label: alt.label,
        isCorrect: null,
      },
    }));
  }

  function submitInstantAnswer(question: PreviewQuestion) {
    const current = answers[question.simulado_question_id];
    if (!current?.alternativeId) return;
    const selected = question.alternatives.find((alt) => alt.id === current.alternativeId);
    if (!selected) return;
    setAnswers((prev) => ({
      ...prev,
      [question.simulado_question_id]: {
        ...current,
        isCorrect: selected.is_correct,
      },
    }));
    setInstantResultQuestionId(question.simulado_question_id);
  }

  function goToNextAfterInstant() {
    setInstantResultQuestionId(null);
    if (currentIndex >= questions.length - 1) setPhase("done");
    else goNext();
  }

  const answeredCount = useMemo(
    () => Object.keys(answers).filter((id) => answers[id]?.alternativeId).length,
    [answers],
  );

  const totalQuestions = questions.length;
  const progressPercent = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  const correctCount = useMemo(
    () => Object.values(answers).filter((a) => a.isCorrect === true).length,
    [answers],
  );
  const wrongCount = useMemo(
    () => Object.values(answers).filter((a) => a.isCorrect === false).length,
    [answers],
  );

  const currentQuestion = questions[currentIndex] || null;
  const owlHelpLimit = useMemo(() => getOwlHelpLimit(totalQuestions), [totalQuestions]);
  const owlHelpUsedCount = Object.keys(owlHelpUsed).length;
  const owlHelpRemaining = meta.owl_help_enabled ? Math.max(owlHelpLimit - owlHelpUsedCount, 0) : 0;

  function useOwlHelp(question: PreviewQuestion) {
    if (!meta.owl_help_enabled || owlHelpRemaining <= 0 || !isOwlEligibleQuestion(question)) return;
    if (owlHelpUsed[question.simulado_question_id]) return;

    const wrongAlternatives = question.alternatives.filter((alt) => !alt.is_correct);
    const selectedWrongIds = wrongAlternatives.slice(0, 2).map((alt) => alt.id);

    if (selectedWrongIds.length < 2) return;
    setOwlHelpUsed((prev) => ({ ...prev, [question.simulado_question_id]: selectedWrongIds }));
    setOwlHelpModalOpen(false);
  }

  function toggleManualEliminatedAlternative(questionId: string, alternativeId: string) {
    setManuallyEliminatedAlternatives((current) => {
      const list = current[questionId] || [];
      const next = list.includes(alternativeId)
        ? list.filter((id) => id !== alternativeId)
        : [...list, alternativeId];
      return { ...current, [questionId]: next };
    });
  }

  function clearManualEliminatedAlternative(questionId: string, alternativeId: string) {
    setManuallyEliminatedAlternatives((current) => {
      const list = current[questionId] || [];
      if (!list.includes(alternativeId)) return current;
      return { ...current, [questionId]: list.filter((id) => id !== alternativeId) };
    });
  }

  const goPrev = () => { setCurrentIndex((i) => Math.max(0, i - 1)); questionStartRef.current = Date.now(); };
  const goNext = () => { setCurrentIndex((i) => Math.min(questions.length - 1, i + 1)); questionStartRef.current = Date.now(); };
  const goTo = (index: number) => { setCurrentIndex(index); questionStartRef.current = Date.now(); };

  // ── Rules screen ──
  if (phase === "rules") {
    return (
      <main className="min-h-screen bg-[#eef0f4] px-4 py-6 md:px-6">
        {/* Preview badge */}
        <div className="mx-auto mb-4 max-w-4xl">
          <div className="flex items-center gap-2 rounded-2xl border border-amber-300 bg-amber-100 px-4 py-3 text-sm font-bold text-amber-800">
            <Eye size={16} />
            MODO PREVIEW (ADMIN) — Nenhuma tentativa será registrada no banco de dados.
          </div>
        </div>

        <section className="relative mx-auto max-w-4xl overflow-hidden rounded-[2rem] border border-black/10 bg-[#070a11] p-6 text-white shadow-2xl shadow-slate-950/20 md:p-10">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/70 to-transparent" />
          <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-orange-500/15 blur-3xl" />
          <div className="absolute -bottom-10 left-0 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl" />

          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-300">
              Antes de iniciar
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              {meta.title}
            </h1>
            {meta.description && (
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                {meta.description}
              </p>
            )}

            <div className="mt-8 grid gap-3 md:grid-cols-2">
              <RuleItem
                icon={<Timer size={20} />}
                title={meta.time_limit_minutes ? `Tempo de prova: ${meta.time_limit_minutes} minutos` : "Sem limite de tempo"}
                description={meta.time_limit_minutes ? "O contador inicia ao confirmar e a tentativa será finalizada automaticamente." : "Você pode levar o tempo que precisar."}
              />
              <RuleItem
                icon={<RotateCcw size={20} />}
                title={meta.max_attempts === null ? "Tentativas ilimitadas" : `${meta.max_attempts} tentativa(s) disponível(is)`}
                description="Tentativas concluídas ou com mais de 50% respondido contam para o limite."
              />
              <RuleItem
                icon={<ListChecks size={20} />}
                title={meta.allow_blank_answers ? "Pode finalizar com questões em branco" : "Responda todas as questões antes de finalizar"}
                description={meta.allow_blank_answers ? "Questões em branco não pontuam." : "O simulado só finaliza após todas as questões respondidas."}
              />
              <RuleItem
                icon={<Calculator size={20} />}
                title={`Modelo de correção: ${meta.scoring_model === "cebraspe" ? "CEBRASPE" : "Tradicional"}`}
                description={scoringDescription(meta.scoring_model)}
              />
              <RuleItem
                icon={<MessageCircleQuestion size={20} />}
                title={meta.instant_feedback_enabled ? "Feedback instantâneo ativado" : "Feedback ao final do simulado"}
                description={meta.instant_feedback_enabled ? "Você verá se acertou ou errou imediatamente." : "O gabarito será exibido após o envio."}
              />
              <RuleItem
                icon={<ShieldAlert size={20} />}
                title="Não saia da tela do simulado!"
                description="Trocar de aba ou minimizar gera um aviso."
                variant="danger"
              />
            </div>

            <div className="mt-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <a
                href={`/simulados/${meta.id}/editar`}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
              >
                <ChevronLeft size={18} /> Voltar ao admin
              </a>
              <button
                type="button"
                onClick={startPreview}
                disabled={questions.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-4 text-base font-semibold text-slate-950 shadow-xl shadow-orange-500/30 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                🦉 Iniciar preview
              </button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  // ── Done screen ──
  if (phase === "done") {
    const computed = computePreviewResult(questions, answers, meta.scoring_model, timeSpent);
    const subjects = Array.from(new Set(questions.map((q) => q.subject).filter(Boolean))) as string[];
    const weakTopics = buildWeakTopicGroups(questions, answers);
    const performanceBySubject = buildSubjectPerformance(questions, answers);
    const criticalQuestions = buildCriticalQuestions(questions, answers);

    return (
      <main className="min-h-screen bg-[#eef0f4] px-4 py-8 md:px-6 print:bg-white print:px-0 print:py-0">
        <ResultExperience
          simuladoTitle={meta.title}
          computed={computed}
          questions={questions}
          answers={answers}
          subjects={subjects}
          weakTopics={weakTopics}
          performanceBySubject={performanceBySubject}
          criticalQuestions={criticalQuestions}
          timeSpent={timeSpent}
          answerChanges={answerChanges}
          resultStep={resultStep}
          setResultStep={setResultStep}
          correctionVideoUrl={meta.correction_video_url}
          onRestart={() => {
            setPhase("rules");
            setAnswers({});
            setCurrentIndex(0);
            setTimeSpent(0);
            setRemainingSeconds(meta.time_limit_minutes ? meta.time_limit_minutes * 60 : null);
            setViolationWarned(false);
            setAnswerChanges(0);
            setResultStep(0);
          }}
          adminUrl={`/simulados/${meta.id}`}
        />
      </main>
    );
  }

  // ── In progress ──
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#f7f7f5]">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_8%_86%,rgba(255,138,0,0.075),transparent_19%),radial-gradient(circle_at_94%_80%,rgba(255,179,71,0.07),transparent_23%),radial-gradient(circle_at_50%_4%,rgba(148,163,184,0.055),transparent_30%),linear-gradient(180deg,#fbfcfd_0%,#f5f6f8_58%,#f9f7f3_100%)]" />
      <div className="pointer-events-none fixed bottom-0 left-0 z-0 h-56 w-56 opacity-40 [background-image:radial-gradient(circle,rgba(255,138,0,0.35)_1.2px,transparent_1.2px)] [background-size:13px_13px] [mask-image:linear-gradient(135deg,#000,transparent_72%)]" />
      <div className="pointer-events-none fixed bottom-0 right-0 z-0 h-64 w-64 rounded-full bg-orange-100/35 blur-3xl" />

      <PreviewStickyHeader
        title={meta.title}
        timeSpent={timeSpent}
        remainingSeconds={remainingSeconds}
        currentIndex={currentIndex}
        total={totalQuestions}
        progressPercent={progressPercent}
        correctCount={correctCount}
        wrongCount={wrongCount}
        instantFeedback={meta.instant_feedback_enabled}
        adminUrl={`/simulados/${meta.id}/editar`}
      />

      <div className="relative z-10 mx-auto grid w-full max-w-[1680px] gap-5 px-4 py-5 md:px-6 xl:px-8 lg:grid-cols-[minmax(0,1fr)_310px]">
        <div className="min-w-0">
          {currentQuestion && (
            <QuestionCard
              question={currentQuestion}
              index={currentIndex}
              total={questions.length}
              answer={answers[currentQuestion.simulado_question_id]}
              instantFeedback={meta.instant_feedback_enabled}
              showTeacherComment={meta.show_teacher_comment}
              eliminatedAlternativeIds={owlHelpUsed[currentQuestion.simulado_question_id] || []}
              manuallyEliminatedAlternativeIds={manuallyEliminatedAlternatives[currentQuestion.simulado_question_id] || []}
              onToggleEliminate={(alternativeId) => toggleManualEliminatedAlternative(currentQuestion.simulado_question_id, alternativeId)}
              onSelect={(alt) => selectAnswer(currentQuestion, alt)}
            />
          )}

          {meta.instant_feedback_enabled && currentQuestion && answers[currentQuestion.simulado_question_id]?.alternativeId && answers[currentQuestion.simulado_question_id]?.isCorrect === null && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => submitInstantAnswer(currentQuestion)}
                className="animate-pulse inline-flex items-center gap-2 rounded-2xl border border-amber-200 bg-gradient-to-r from-orange-400 via-amber-300 to-yellow-300 px-7 py-3.5 text-sm font-black text-slate-950 shadow-[0_0_0_6px_rgba(251,191,36,0.16),0_18px_40px_rgba(249,115,22,0.35)] transition hover:-translate-y-0.5 hover:brightness-105"
              >
                <Send size={17} /> Enviar resposta
              </button>
            </div>
          )}

          <Navigator
            questions={questions}
            answers={answers}
            currentIndex={currentIndex}
            onGoTo={goTo}
            onPrev={goPrev}
            onNext={goNext}
            onFinish={() => setConfirmFinish(true)}
            instantMode={meta.instant_feedback_enabled}
            currentAnswered={Boolean(currentQuestion && answers[currentQuestion.simulado_question_id]?.isCorrect !== null && answers[currentQuestion.simulado_question_id]?.isCorrect !== undefined)}
          />
        </div>
        <PreviewQuestionSidePanel
          questions={questions}
          answers={answers}
          currentIndex={currentIndex}
          onGoTo={meta.instant_feedback_enabled ? (() => {}) : goTo}
          answeredCount={answeredCount}
          totalQuestions={totalQuestions}
          owlHelpEnabled={Boolean(meta.owl_help_enabled)}
          owlHelpRemaining={owlHelpRemaining}
          currentEligible={isOwlEligibleQuestion(currentQuestion)}
          onOpenOwlHelp={() => setOwlHelpModalOpen(true)}
        />
      </div>

      {instantResultQuestionId && currentQuestion && answers[instantResultQuestionId] && (
        <OverlayModal
          icon={answers[instantResultQuestionId]?.isCorrect ? <CheckCircle2 size={56} className="text-emerald-500" /> : <XCircle size={56} className="text-red-500" />}
          title={answers[instantResultQuestionId]?.isCorrect ? "Você acertou!" : "Resposta incorreta"}
          description={currentQuestion.explanation_text && meta.show_teacher_comment ? "Confira o comentário do professor antes de avançar." : "Clique para seguir para a próxima questão."}
          actionLabel={currentIndex >= questions.length - 1 ? "Ver resultado" : "Próxima questão"}
          onAction={goToNextAfterInstant}
          variant={answers[instantResultQuestionId]?.isCorrect ? "success" : "danger"}
        >
          {currentQuestion.explanation_text && meta.show_teacher_comment && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-left text-sm leading-6 text-slate-700" dangerouslySetInnerHTML={{ __html: richHtml(currentQuestion.explanation_text) }} />
          )}
        </OverlayModal>
      )}

      {owlHelpModalOpen && currentQuestion && (
        <OverlayModal
          icon={<Sparkles size={56} className="text-orange-400" />}
          title="Usar Ajuda da Coruja?"
          description={isOwlEligibleQuestion(currentQuestion)
            ? "A Coruja vai eliminar duas alternativas erradas desta questão. Esse recurso só pode ser usado em questões de alternativas."
            : "A Ajuda da Coruja só pode ser usada em questões de alternativas. Questões de certo ou errado não são elegíveis."}
          actionLabel={isOwlEligibleQuestion(currentQuestion) ? "Sim, chamar a Coruja" : "Entendi"}
          onAction={() => {
            if (isOwlEligibleQuestion(currentQuestion)) useOwlHelp(currentQuestion);
            else setOwlHelpModalOpen(false);
          }}
          variant="warning"
        >
          {isOwlEligibleQuestion(currentQuestion) && (
            <button
              type="button"
              onClick={() => setOwlHelpModalOpen(false)}
              className="mt-3 inline-flex w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              Cancelar
            </button>
          )}
        </OverlayModal>
      )}

      {/* Focus warning overlay */}
      {phase === "focus_warning" && (
        <OverlayModal
          icon={<ShieldAlert size={56} className="text-amber-500" />}
          title="Atenção: você saiu da tela"
          description="Em modo real, isso geraria uma advertência. No preview, continue normalmente."
          actionLabel="Entendi, continuar preview"
          onAction={() => setPhase("in_progress")}
          variant="warning"
        />
      )}

      {confirmFinish && (
        <FinishConfirm
          allowBlank={meta.allow_blank_answers}
          answeredCount={answeredCount}
          total={totalQuestions}
          onCancel={() => setConfirmFinish(false)}
          onConfirm={() => { setConfirmFinish(false); setPhase("done"); }}
        />
      )}
    </main>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PreviewStickyHeader({
  title,
  timeSpent,
  remainingSeconds,
  currentIndex,
  total,
  progressPercent,
  correctCount,
  wrongCount,
  instantFeedback,
  adminUrl,
}: {
  title: string;
  timeSpent: number;
  remainingSeconds: number | null;
  currentIndex: number;
  total: number;
  progressPercent: number;
  correctCount: number;
  wrongCount: number;
  instantFeedback: boolean;
  adminUrl: string;
}) {
  const warningTime = remainingSeconds !== null && remainingSeconds < 5 * 60;
  return (
    <header className="sticky top-0 z-30 overflow-hidden border-b border-white/15 bg-black text-white shadow-[0_22px_58px_rgba(15,23,42,0.28)]">
      <div className="pointer-events-none absolute inset-0 opacity-90 [background:linear-gradient(132deg,transparent_0%,transparent_37%,rgba(255,138,0,0.09)_46%,rgba(255,138,0,0.035)_56%,transparent_66%),linear-gradient(180deg,#000000_0%,#030303_100%)]" />
      <div className="pointer-events-none absolute left-[34%] top-[-90px] h-[260px] w-[330px] rotate-45 bg-orange-500/10 blur-2xl" />
      <div className="relative flex min-h-[124px] w-full flex-col gap-5 px-5 py-5 md:px-9 lg:flex-row lg:items-center lg:justify-between xl:px-[54px]">
        <div className="flex min-w-0 items-center gap-5">
          <div className="relative flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-[1.05rem] border border-orange-400/60 bg-[linear-gradient(145deg,rgba(255,138,0,0.18),rgba(255,138,0,0.035)_54%,rgba(0,0,0,0.24))] shadow-[0_0_0_1px_rgba(255,255,255,0.035)_inset,0_0_26px_rgba(255,122,24,0.42)]">
            <Shield size={36} strokeWidth={2.2} className="text-orange-300 drop-shadow-[0_0_12px_rgba(255,138,0,0.62)]" />
            <div className="pointer-events-none absolute inset-0 rounded-[1.05rem] ring-1 ring-inset ring-orange-300/10" />
          </div>
          <div className="min-w-0 border-l border-white/20 pl-5">
            <p className="text-[11px] font-black uppercase tracking-[0.42em] text-orange-300">
              Preview admin · resolvendo
            </p>
            <h1 className="mt-3 truncate text-[26px] font-black leading-none tracking-tight text-white md:text-[30px]">{title}</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-5 text-xs">
          <div className="flex h-[72px] min-w-[208px] items-center gap-4 rounded-[1rem] border border-white/25 bg-white/[0.055] px-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_26px_rgba(0,0,0,0.26)] backdrop-blur-md">
            <Clock3 size={31} strokeWidth={2.1} className="text-orange-300" />
            <div>
              <strong className="block text-[18px] leading-none text-white md:text-[19px]">{formatTime(timeSpent)}</strong>
              <span className="mt-2 block text-[10px] font-black uppercase tracking-[0.08em] text-white/65">Tempo decorrido</span>
            </div>
          </div>
          {remainingSeconds !== null && (
            <div className={`flex h-[72px] min-w-[190px] items-center gap-4 rounded-[1rem] border px-5 backdrop-blur-md transition duration-500 ${warningTime ? "border-2 border-orange-400 bg-[#170d04] shadow-[0_0_0_1px_rgba(251,146,60,0.7)_inset,0_0_16px_4px_rgba(251,146,60,0.95),0_0_48px_16px_rgba(251,146,60,0.55)]" : "border-orange-400/50 bg-orange-500/[0.07] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_22px_rgba(255,122,24,0.42),0_12px_28px_rgba(0,0,0,0.26)]"}`}>
              <Hourglass size={31} strokeWidth={2.1} className={warningTime ? "text-orange-100 drop-shadow-[0_0_10px_rgba(251,146,60,0.95)]" : "text-amber-300 drop-shadow-[0_0_12px_rgba(251,146,60,0.7)]"} />
              <div>
                <strong className="block text-[18px] leading-none text-white md:text-[19px]">{formatTime(remainingSeconds)}</strong>
                <span className="mt-2 block text-[10px] font-black uppercase tracking-[0.08em] text-white/65">Tempo restante</span>
              </div>
            </div>
          )}
          <div className="flex h-[72px] min-w-[296px] items-center gap-4 rounded-[1rem] border border-white/25 bg-white/[0.055] px-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_26px_rgba(0,0,0,0.26)] backdrop-blur-md">
            <ProgressRing percent={progressPercent} />
            <div>
              <strong className="block text-[18px] leading-none text-white md:text-[19px]">{Math.min(currentIndex + 1, total)}/{total}</strong>
              <span className="mt-2 block text-[10px] font-black uppercase tracking-[0.08em] text-white/65">Progresso geral</span>
            </div>
            <span className="ml-auto text-[18px] font-black text-amber-300">{progressPercent}%</span>
          </div>
          {instantFeedback && (
            <div className="flex items-center gap-3 rounded-[1.1rem] border border-white/10 bg-white/[0.055] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
              <span className="flex items-center gap-1 text-emerald-300"><CheckCircle2 size={14} />{correctCount}</span>
              <span className="flex items-center gap-1 text-red-300"><XCircle size={14} />{wrongCount}</span>
            </div>
          )}
          <a
            href={adminUrl}
            className="inline-flex h-[72px] items-center justify-center gap-2 rounded-[1rem] border border-orange-300/30 bg-orange-500/10 px-5 text-xs font-black uppercase tracking-[0.12em] text-orange-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_26px_rgba(0,0,0,0.26)] backdrop-blur-md transition hover:-translate-y-0.5 hover:border-orange-300/55 hover:bg-orange-500/20"
          >
            <ChevronLeft size={16} /> Sair do preview
          </a>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-orange-400/45 to-transparent" />
    </header>
  );
}

function ProgressRing({ percent }: { percent: number }) {
  const radius = 17;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;
  return (
    <svg width="42" height="42" viewBox="0 0 42 42" className="shrink-0 -rotate-90">
      <circle cx="21" cy="21" r={radius} fill="none" stroke="rgba(251,146,60,0.28)" strokeWidth="4" />
      <circle cx="21" cy="21" r={radius} fill="none" stroke="#fb923c" strokeWidth="4" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
    </svg>
  );
}

function QuestionCard({
  question,
  index,
  total,
  answer,
  instantFeedback,
  showTeacherComment,
  eliminatedAlternativeIds = [],
  manuallyEliminatedAlternativeIds = [],
  onToggleEliminate,
  onSelect,
}: {
  question: PreviewQuestion;
  index: number;
  total: number;
  answer: AnswerState | undefined;
  instantFeedback: boolean;
  showTeacherComment: boolean;
  eliminatedAlternativeIds?: string[];
  manuallyEliminatedAlternativeIds?: string[];
  onToggleEliminate?: (alternativeId: string) => void;
  onSelect: (alt: { id: string; label: string; is_correct: boolean }) => void;
}) {
  const isAnnulled = question.status === "annulled";
  const showFeedback = instantFeedback && answer?.isCorrect !== null && answer?.isCorrect !== undefined;
  const isTrueFalse = isTrueFalseQuestionType(question.question_type);

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-slate-200/85 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(255,253,249,0.96))] p-5 shadow-[0_22px_62px_rgba(15,23,42,0.08),0_1px_0_rgba(255,255,255,0.9)_inset] ring-1 ring-white/90 backdrop-blur-xl md:p-7">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange-300/70 to-transparent" />
      <div className="pointer-events-none absolute right-0 top-0 h-48 w-48 rounded-full bg-orange-100/35 blur-3xl" />
      {isAnnulled && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rotate-[-12deg] text-4xl font-black uppercase tracking-widest text-amber-500/20 md:text-6xl">
            Questão Anulada
          </span>
        </div>
      )}

      <div className="relative flex items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-1.5 font-black text-orange-600 shadow-sm">
            <FileText size={16} /> Questão {index + 1} de {total}
          </span>
          {question.subject && (
            <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 font-bold text-slate-600">
              {question.subject}
            </span>
          )}
          {question.points ? (
            <span className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-1.5 font-bold text-emerald-700">
              {Number(question.points).toFixed(2).replace(".", ",")} pts
            </span>
          ) : null}
          {isAnnulled && (
            <span className="rounded-xl border border-amber-300 bg-amber-100 px-3 py-1.5 font-bold text-amber-800">
              Anulada
            </span>
          )}
        </div>
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-orange-200 bg-white text-orange-500 shadow-sm">
          <Bookmark size={18} />
        </span>
      </div>

      <div
        className="richtext-editor relative mt-6 max-w-none border-b border-slate-100 pb-5 text-[16px] leading-[1.72] text-slate-800 md:text-[17px]"
        dangerouslySetInnerHTML={{ __html: richHtml(question.statement) }}
      />

      <div className="relative mt-5 space-y-2.5">
        {question.alternatives.map((alt) => {
          const isSelected = answer?.alternativeId === alt.id;
          const eliminatedByOwl = eliminatedAlternativeIds.includes(alt.id);
          const manuallyEliminated = manuallyEliminatedAlternativeIds.includes(alt.id) && !isSelected;
          const locked = showFeedback || isAnnulled || eliminatedByOwl;
          const isWrongTrueFalse = question.question_type === "true_false" && alt.is_correct && (alt.label === "E" || String(alt.text || "").trim().toLowerCase() === "errado");

          let cls =
            "group relative flex w-full items-center gap-3.5 rounded-[1.2rem] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#fbfcfd_100%)] px-4 py-3.5 pl-[4.5rem] text-left text-[15px] leading-6 shadow-[0_6px_18px_rgba(15,23,42,0.03)] transition duration-200";
          if (!locked) cls += " cursor-pointer hover:-translate-y-0.5 hover:border-orange-300 hover:bg-orange-50/50 hover:shadow-[0_10px_28px_rgba(255,138,0,0.08)]";
          else cls += " cursor-default";
          if (manuallyEliminated) cls += " opacity-55";

          if (eliminatedByOwl) {
            cls =
              "group relative flex w-full items-center gap-3.5 rounded-[1.2rem] border border-orange-200 bg-orange-50/70 px-4 py-3.5 pl-[4.5rem] text-left text-[15px] leading-6 opacity-60 line-through cursor-default";
          } else if (showFeedback && isSelected) {
            cls = alt.is_correct
              ? isWrongTrueFalse
                ? "group relative flex w-full items-center gap-3.5 rounded-[1.2rem] border-2 border-red-400 bg-red-50 px-4 py-3.5 pl-[4.5rem] text-left text-sm"
                : "group relative flex w-full items-center gap-3.5 rounded-[1.2rem] border-2 border-emerald-400 bg-emerald-50 px-4 py-3.5 pl-[4.5rem] text-left text-sm"
              : "group relative flex w-full items-center gap-3.5 rounded-[1.2rem] border-2 border-red-400 bg-red-50 px-4 py-3.5 pl-[4.5rem] text-left text-sm";
          } else if (isSelected) {
            cls =
              "group relative flex w-full items-center gap-3.5 rounded-[1.2rem] border-2 border-orange-400 bg-orange-50 px-4 py-3.5 pl-[4.5rem] text-left text-sm ring-4 ring-orange-100/70 shadow-[0_10px_30px_rgba(255,138,0,0.10)]";
          }

          return (
            <div
              key={alt.id}
              role={!locked ? "button" : undefined}
              tabIndex={!locked ? 0 : undefined}
              onClick={!locked ? () => onSelect(alt) : undefined}
              onKeyDown={!locked ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(alt);
                }
              } : undefined}
              className={cls}
            >
              {!locked && (
                <button
                  type="button"
                  aria-label={manuallyEliminated ? "Remover eliminação da alternativa" : "Eliminar alternativa"}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onToggleEliminate?.(alt.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      onToggleEliminate?.(alt.id);
                    }
                  }}
                  className={`absolute left-0 top-0 z-20 flex h-full w-14 items-center justify-start pl-3.5 transition ${
                    manuallyEliminated
                      ? "opacity-100"
                      : "opacity-0 hover:opacity-100 focus:opacity-100"
                  } [&>svg]:rounded-full [&>svg]:border [&>svg]:p-1.5 [&>svg]:shadow-sm ${
                    manuallyEliminated
                      ? "[&>svg]:border-red-200 [&>svg]:bg-red-50 [&>svg]:text-red-500"
                      : "[&>svg]:border-orange-100 [&>svg]:bg-orange-50 [&>svg]:text-orange-400 hover:[&>svg]:border-red-200 hover:[&>svg]:bg-red-50 hover:[&>svg]:text-red-500"
                  }`}
                >
                  <Scissors size={26} />
                </button>
              )}

              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-black transition ${
                  eliminatedByOwl
                    ? "border-orange-300 bg-orange-200 text-orange-700"
                    : isSelected
                    ? showFeedback
                      ? alt.is_correct
                        ? isWrongTrueFalse
                          ? "border-red-500 bg-red-500 text-white"
                          : "border-emerald-500 bg-emerald-500 text-white"
                        : "border-red-500 bg-red-500 text-white"
                      : "border-orange-500 bg-orange-500 text-white shadow-[0_0_16px_rgba(255,138,0,0.24)]"
                    : manuallyEliminated
                    ? "border-red-200 bg-red-50 text-red-500"
                    : "border-orange-200 bg-white text-orange-600"
                }`}
              >
                <span className="sr-only">{alt.label}</span>
                {isSelected && !showFeedback ? (
                  <span className="text-base leading-none" aria-label="Selecionada pela Coruja">
                    {OWL_MARK}
                  </span>
                ) : isTrueFalse ? null : (
                  <span>{alt.label}</span>
                )}
              </span>
              <div className="flex-1">
                <div
                  className={`richtext-editor max-w-none text-[15px] leading-6 text-slate-700 md:text-base ${manuallyEliminated ? "line-through decoration-red-500 decoration-2" : ""}`}
                  dangerouslySetInnerHTML={{ __html: richHtml(alt.text) }}
                />
                {alt.image_url && (
                  <div className="mt-2 overflow-hidden rounded-xl border border-slate-100 bg-white p-2">
                    <img src={alt.image_url} alt={`Imagem alternativa ${alt.label}`} className="max-h-40 rounded-lg object-contain" />
                  </div>
                )}
                {eliminatedByOwl && (
                  <p className="mt-2 text-xs font-black uppercase tracking-[0.16em] text-orange-700">Eliminada pela Coruja</p>
                )}
              </div>
              {showFeedback && isSelected && (
                <span className="ml-2">
                  {alt.is_correct ? (
                    <CheckCircle2 className={isWrongTrueFalse ? "text-red-500" : "text-emerald-500"} size={22} />
                  ) : (
                    <XCircle className="text-red-500" size={22} />
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {showFeedback && showTeacherComment && question.explanation_text && (
        <div className="relative mt-5 rounded-[1.4rem] border border-emerald-200 bg-emerald-50/70 p-4 text-sm leading-7 text-emerald-900">
          <p className="flex items-center gap-2 font-bold">
            <BookOpen size={17} /> Comentário do professor
          </p>
          <div
            className="richtext-editor mt-2 max-w-none text-sm leading-7 text-emerald-900"
            dangerouslySetInnerHTML={{ __html: richHtml(question.explanation_text) }}
          />
        </div>
      )}
    </section>
  );
}

function Navigator({
  questions,
  answers,
  currentIndex,
  onGoTo,
  onPrev,
  onNext,
  onFinish,
  instantMode = false,
  currentAnswered = true,
}: {
  questions: PreviewQuestion[];
  answers: Record<string, AnswerState>;
  currentIndex: number;
  onGoTo: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onFinish: () => void;
  instantMode?: boolean;
  currentAnswered?: boolean;
}) {
  const isLast = currentIndex === questions.length - 1;

  return (
    <section className="mt-5 rounded-[1.75rem] border border-slate-200/85 bg-white/95 px-4 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.065),0_1px_0_rgba(255,255,255,0.9)_inset] backdrop-blur-xl md:px-5">
      <div className="grid items-center gap-4 md:grid-cols-[auto_1fr_auto]">
        <button
          type="button"
          onClick={onPrev}
          disabled={currentIndex === 0 || instantMode}
          className="inline-flex min-w-[118px] items-center justify-center gap-2 rounded-2xl border border-orange-200 bg-white px-4 py-2.5 text-sm font-bold text-orange-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-orange-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 disabled:opacity-60"
        >
          <ChevronLeft size={18} /> Anterior
        </button>

        <div className="min-w-0 text-center">
          <div className="flex flex-wrap justify-center gap-1.5">
            {questions.map((q, idx) => {
              const ans = answers[q.simulado_question_id];
              const isCurrent = idx === currentIndex;
              const isAnswered = Boolean(ans?.alternativeId);
              const cls = isCurrent
                ? "h-9 w-9 rounded-xl border-2 border-orange-500 bg-orange-50 text-sm font-black text-orange-600 shadow-[0_0_18px_rgba(255,138,0,0.16)]"
                : isAnswered
                  ? "h-9 w-9 rounded-xl border border-emerald-300 bg-emerald-50 text-sm font-black text-emerald-700 hover:bg-emerald-100"
                  : "h-9 w-9 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-500 hover:border-orange-200 hover:bg-orange-50";

              return (
                <button
                  key={q.simulado_question_id}
                  type="button"
                  onClick={() => { if (!instantMode) onGoTo(idx); }}
                  disabled={instantMode && idx !== currentIndex}
                  className={instantMode && idx !== currentIndex ? `${cls} cursor-not-allowed opacity-55` : cls}
                  aria-label={`Ir para questão ${idx + 1}`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-sm font-black text-slate-700">Questão {currentIndex + 1} de {questions.length}</p>
        </div>

        {isLast ? (
          <button
            type="button"
            onClick={onFinish}
            className="inline-flex min-w-[132px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-400 px-5 py-2.5 text-sm font-black text-white shadow-[0_14px_30px_rgba(255,138,0,0.28)] transition hover:-translate-y-1 hover:shadow-[0_18px_38px_rgba(255,138,0,0.36)]"
          >
            <Trophy size={17} /> Finalizar
          </button>
        ) : (
          <button
            type="button"
            onClick={onNext}
            disabled={instantMode}
            className="inline-flex min-w-[132px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-400 px-5 py-2.5 text-sm font-black text-white shadow-[0_14px_30px_rgba(255,138,0,0.28)] transition hover:-translate-y-1 hover:shadow-[0_18px_38px_rgba(255,138,0,0.36)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Próxima <ChevronRight size={18} />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onFinish}
        disabled={instantMode}
        className="mt-4 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 md:hidden"
      >
        Finalizar preview
      </button>
    </section>
  );
}


function formatPreviewNumber(value: number): string {
  return Number(value || 0).toFixed(2).replace(".", ",");
}

function computePreviewResult(questions: PreviewQuestion[], answers: Record<string, AnswerState>, scoringModel: "traditional" | "cebraspe", timeSpent: number) {
  let correct = 0;
  let wrong = 0;
  let blank = 0;
  let rawScore = 0;
  let maxScore = 0;

  for (const question of questions) {
    const points = Number(question.points || 1);
    maxScore += points;
    const answer = answers[question.simulado_question_id];
    const selected = question.alternatives.find((alt) => alt.id === answer?.alternativeId);
    if (!selected) { blank += 1; continue; }
    if (selected.is_correct) { correct += 1; rawScore += points; }
    else { wrong += 1; if (scoringModel === "cebraspe") rawScore -= points; }
  }

  const displayScore = Math.max(rawScore, 0);
  const percentage = maxScore > 0 ? Math.max(0, Math.round((displayScore / maxScore) * 10000) / 100) : 0;
  return { correct, wrong, blank, rawScore, displayScore, maxScore, percentage, timeSpent };
}

type WeakTopicGroup = { subject: string; topics: string[]; count: number };
type SubjectPerformance = { subject: string; correct: number; wrong: number; blank: number; total: number; percent: number };
type CriticalQuestion = { number: number; subject: string; status: "wrong" | "blank" | "correct"; selectedLabel: string | null; correctLabel: string | null; statement: string | null; explanation: string | null; timeHint: string };

function buildWeakTopicGroups(questions: PreviewQuestion[], answers: Record<string, AnswerState>): WeakTopicGroup[] {
  const groups = new Map<string, Set<string>>();

  questions.forEach((question) => {
    const answer = answers[question.simulado_question_id];
    const selected = question.alternatives.find((alt) => alt.id === answer?.alternativeId);
    if (selected?.is_correct) return;

    const subject = question.subject || "Assunto não informado";
    const topic = question.subject || "Tópico da questão";
    if (!groups.has(subject)) groups.set(subject, new Set());
    groups.get(subject)?.add(topic);
  });

  return Array.from(groups.entries()).map(([subject, topics]) => ({
    subject,
    topics: Array.from(topics),
    count: topics.size,
  }));
}

function buildSubjectPerformance(questions: PreviewQuestion[], answers: Record<string, AnswerState>): SubjectPerformance[] {
  const map = new Map<string, SubjectPerformance>();

  questions.forEach((question) => {
    const subject = question.subject || "Sem assunto";
    if (!map.has(subject)) map.set(subject, { subject, correct: 0, wrong: 0, blank: 0, total: 0, percent: 0 });
    const item = map.get(subject)!;
    const answer = answers[question.simulado_question_id];
    const selected = question.alternatives.find((alt) => alt.id === answer?.alternativeId);

    item.total += 1;
    if (!selected) item.blank += 1;
    else if (selected.is_correct) item.correct += 1;
    else item.wrong += 1;
  });

  return Array.from(map.values())
    .map((item) => ({ ...item, percent: item.total > 0 ? Math.round((item.correct / item.total) * 100) : 0 }))
    .sort((a, b) => a.percent - b.percent || b.total - a.total);
}

function buildCriticalQuestions(questions: PreviewQuestion[], answers: Record<string, AnswerState>): CriticalQuestion[] {
  return questions.map((question, index) => {
    const answer = answers[question.simulado_question_id];
    const selected = question.alternatives.find((alt) => alt.id === answer?.alternativeId);
    const correct = question.alternatives.find((alt) => alt.is_correct);
    return {
      number: index + 1,
      subject: question.subject || "Sem assunto",
      status: !selected ? "blank" : selected.is_correct ? "correct" : "wrong",
      selectedLabel: selected?.label || null,
      correctLabel: correct?.label || null,
      statement: question.statement,
      explanation: question.explanation_text,
      timeHint: "Tempo individual será gravado na tentativa real",
    };
  });
}

function getStudentProfile(
  timeSpent: number,
  answerChanges: number,
  totalQuestions: number,
  correctCount: number,
  blankCount: number,
) {
  const avg = totalQuestions > 0 ? timeSpent / totalQuestions : 0;
  const changeRate = totalQuestions > 0 ? answerChanges / totalQuestions : 0;
  const blankRate = totalQuestions > 0 ? blankCount / totalQuestions : 0;
  const correctRate = totalQuestions > 0 ? correctCount / totalQuestions : 0;

  // Impulsivo: tempo muito baixo + muitos erros
  if (avg < 20 && correctRate < 0.5) {
    return {
      title: "Impulsivo",
      description:
        "Você responde rápido, mas precisa reduzir decisões precipitadas.",
      icon: "⚡",
    };
  }

  // Decisor rápido: poucas mudanças, tempo baixo
  if (avg < 30 && changeRate < 0.15) {
    return {
      title: "Decisor Rápido",
      description:
        "Você responde com rapidez e confiança. Seu desafio é evitar impulsividade.",
      icon: "🎯",
    };
  }

  // Estratégico: bom tempo + poucas trocas + boa taxa de acerto
  if (avg >= 30 && avg <= 90 && changeRate < 0.2 && correctRate >= 0.65) {
    return {
      title: "Estratégico",
      description:
        "Você demonstra equilíbrio entre velocidade e precisão.",
      icon: "🏆",
    };
  }

  // Conservador: muitas em branco, poucas mudanças
  if (blankRate >= 0.25 && changeRate < 0.15) {
    return {
      title: "Conservador",
      description:
        "Você evita riscos. Seu desafio é confiar mais no seu conhecimento.",
      icon: "🛡️",
    };
  }

  // Analítico: tempo maior + mais revisões
  if (avg > 60 && changeRate >= 0.2) {
    return {
      title: "Analítico",
      description:
        "Você analisa com profundidade antes de decidir. Seu desafio é controlar excesso de revisão.",
      icon: "🔬",
    };
  }

  return {
    title: "Estratégico",
    description:
      "Você demonstra equilíbrio entre velocidade e precisão.",
    icon: "🏆",
  };
}



function ResultExperience({
  simuladoTitle,
  computed,
  questions,
  answers,
  subjects,
  weakTopics,
  performanceBySubject,
  criticalQuestions,
  timeSpent,
  answerChanges,
  resultStep,
  setResultStep,
  correctionVideoUrl,
  onRestart,
  adminUrl,
}: {
  simuladoTitle: string;
  computed: ReturnType<typeof computePreviewResult>;
  questions: PreviewQuestion[];
  answers: Record<string, AnswerState>;
  subjects: string[];
  weakTopics: WeakTopicGroup[];
  performanceBySubject: SubjectPerformance[];
  criticalQuestions: CriticalQuestion[];
  timeSpent: number;
  answerChanges: number;
  resultStep: number;
  setResultStep: (step: number | ((current: number) => number)) => void;
  correctionVideoUrl: string | null;
  onRestart: () => void;
  adminUrl: string;
}) {
  const steps = [
    { title: "Resultado geral", icon: <Trophy size={16} /> },
    { title: "Evolução", icon: <TrendingUp size={16} /> },
    { title: "Assuntos", icon: <BarChart3 size={16} /> },
    { title: "Pontos fracos", icon: <Target size={16} /> },
    { title: "Comportamento", icon: <Brain size={16} /> },
    { title: "Plano de revisão", icon: <ListChecks size={16} /> },
    { title: "Questões", icon: <FileText size={16} /> },
  ];

  const profile = getStudentProfile(timeSpent, answerChanges, questions.length, computed.correct, computed.blank);
  const avgTime = questions.length > 0 ? timeSpent / questions.length : 0;
  const scoreTone = computed.percentage >= 80 ? "Excelente" : computed.percentage >= 60 ? "Bom desempenho" : "Atenção aos pontos fracos";
  const safeStep = Math.min(Math.max(resultStep, 0), steps.length - 1);
  const [pdfLoading, setPdfLoading] = useState(false);

  function nextStep() { setResultStep((current) => Math.min(steps.length - 1, current + 1)); }
  function prevStep() { setResultStep((current) => Math.max(0, current - 1)); }
  async function exportPdf() {
    setPdfLoading(true);
    try {
      const { generateSimuladoPdf } = await import("./SimuladoPdfReport");
      await generateSimuladoPdf({
        simuladoTitle,
        computed,
        questions,
        answers,
        weakTopics,
        performanceBySubject,
        timeSpent,
        answerChanges,
        profile,
      });
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 print:max-w-none print:space-y-4">
      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          body { background: white !important; color: #0f172a !important; font-family: Arial, Helvetica, sans-serif !important; }
          * { box-shadow: none !important; text-shadow: none !important; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .result-print-page { break-inside: avoid; page-break-inside: avoid; border: 1px solid #e2e8f0 !important; border-radius: 14px !important; padding: 16px !important; margin-bottom: 14px !important; }
          .result-question-print { break-inside: avoid; page-break-inside: avoid; margin-bottom: 16px; }
        }
        @media screen { .print-only { display: none !important; } }
      `}</style>

      {/* Header compacto */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm print:rounded-none print:border-0 print:shadow-none">
        <div className="h-0.5 bg-gradient-to-r from-orange-500 via-amber-400 to-orange-300" />
        <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between md:p-6">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-slate-950">Resultado do Simulado</h1>
            <p className="mt-1 text-sm text-slate-500">
              {simuladoTitle} · Preview admin · tentativa demonstrativa
            </p>
          </div>
          <div className="no-print flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={exportPdf}
              disabled={pdfLoading}
              className="inline-flex h-9 animate-pulse cursor-pointer items-center gap-2 rounded-lg border border-amber-200 bg-gradient-to-r from-orange-500 via-amber-400 to-yellow-300 px-4 text-sm font-black text-slate-950 shadow-lg shadow-orange-500/25 transition hover:-translate-y-0.5 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download size={15} />
              {pdfLoading ? "Gerando PDF..." : "Exportar PDF"}
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <RotateCcw size={15} /> Reiniciar preview
            </button>
            <a
              href={adminUrl}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-500 transition hover:text-slate-700"
            >
              Voltar ao admin
            </a>
          </div>
        </div>
      </section>

      {/* Tabs leves */}
      <div className="no-print rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className="flex gap-1 overflow-x-auto">
          {steps.map((step, index) => (
            <button
              key={step.title}
              type="button"
              onClick={() => setResultStep(index)}
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition ${
                safeStep === index
                  ? "bg-orange-50 text-orange-600"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              }`}
            >
              {step.icon}{step.title}
            </button>
          ))}
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8 print:hidden">
        <div className="mb-8 flex items-center justify-between gap-4">
          <button type="button" onClick={prevStep} disabled={safeStep === 0} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"><ChevronLeft size={16} /> Anterior</button>
          <div className="text-center">
            <p className="text-xs font-medium text-slate-500">Etapa {safeStep + 1} de {steps.length}</p>
            <h2 className="mt-0.5 text-lg font-semibold text-slate-950">{steps[safeStep].title}</h2>
          </div>
          <button type="button" onClick={nextStep} disabled={safeStep === steps.length - 1} className="inline-flex h-9 items-center gap-2 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-40">Próximo <ChevronRight size={16} /></button>
        </div>

        {safeStep === 0 && <ResultOverview computed={computed} timeSpent={timeSpent} avgTime={avgTime} questionsCount={questions.length} />}
        {safeStep === 1 && <ResultEvolution computed={computed} />}
        {safeStep === 2 && <ResultSubjects performance={performanceBySubject} subjects={subjects} />}
        {safeStep === 3 && <ResultWeakTopics weakTopics={weakTopics} />}
        {safeStep === 4 && <ResultBehavior profile={profile} answerChanges={answerChanges} timeSpent={timeSpent} avgTime={avgTime} />}
        {safeStep === 5 && <ResultActionPlan weakTopics={weakTopics} performance={performanceBySubject} />}
        {safeStep === 6 && <ResultQuestions questions={questions} answers={answers} />}
      </section>

      <section className="print-only space-y-6">
        <ResultOverview computed={computed} timeSpent={timeSpent} avgTime={avgTime} questionsCount={questions.length} />
        <ResultSubjects performance={performanceBySubject} subjects={subjects} />
        <ResultWeakTopics weakTopics={weakTopics} />
        <ResultBehavior profile={profile} answerChanges={answerChanges} timeSpent={timeSpent} avgTime={avgTime} />
        <ResultActionPlan weakTopics={weakTopics} performance={performanceBySubject} />
        {correctionVideoUrl && <div className="result-print-page rounded-3xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-black text-slate-950">Correção em vídeo</h2><p className="mt-2 text-sm text-slate-600">O vídeo de correção fica disponível na plataforma.</p></div>}
        <ResultQuestions questions={questions} answers={answers} />
      </section>

      <section className="no-print rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2"><Trophy size={18} className="text-orange-500" /><h3 className="font-black text-slate-950">Avaliação do simulado</h3></div>
        <div className="flex gap-1 text-amber-400">{[1,2,3,4,5].map((n)=><span key={n} className="text-3xl">★</span>)}</div>
        <textarea disabled rows={3} className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500" placeholder="Campo de comentário do aluno..." />
      </section>
    </div>
  );
}

function ResultOverview({ computed, timeSpent, avgTime }: { computed: ReturnType<typeof computePreviewResult>; timeSpent: number; avgTime: number; questionsCount?: number }) {
  const metrics = [
    { label: "Pontuação", value: `${formatPreviewNumber(computed.displayScore)} / ${formatPreviewNumber(computed.maxScore)} pts` },
    { label: "Aproveitamento", value: `${formatPreviewNumber(computed.percentage)}%`, highlight: true },
    { label: "Tempo total", value: formatTime(timeSpent) },
    { label: "Tempo médio por questão", value: formatTime(avgTime) },
  ];

  return (
    <div className="space-y-6">
      {/* Resumo executivo — grid horizontal único card clean */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className={`rounded-xl border p-4 ${m.highlight ? "border-orange-200 bg-orange-50" : "border-slate-200 bg-slate-50"}`}>
            <p className="text-xs font-medium text-slate-500">{m.label}</p>
            <p className={`mt-2 text-2xl font-semibold ${m.highlight ? "text-orange-600" : "text-slate-900"}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Donut + contadores */}
      <div className="flex flex-col items-center gap-6 rounded-xl border border-slate-200 bg-white p-6 md:flex-row md:justify-center">
        <PremiumDonut percent={computed.percentage} />
        <div className="grid grid-cols-3 gap-4">
          <SmallPill label="Acertos" value={computed.correct} tone="emerald" />
          <SmallPill label="Erros" value={computed.wrong} tone="red" />
          <SmallPill label="Em branco" value={computed.blank} tone="slate" />
        </div>
      </div>
      <p className="text-center text-xs text-slate-400">Média geral do simulado: indisponível no preview</p>
    </div>
  );
}

function ResultEvolution({ computed }: { computed: ReturnType<typeof computePreviewResult> }) {
  const points = [42, 55, 63, Math.round(computed.percentage)];
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-600">Evolução na jornada</p>
      <h3 className="mt-2 text-2xl font-black text-slate-950">Tendência de desempenho</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">Na tentativa real, este bloco compara o aluno dentro da mesma jornada. No preview, exibimos uma amostra visual.</p>
      <div className="mt-8 flex h-56 items-end gap-4 rounded-[2rem] border border-slate-200 bg-white p-5">
        {points.map((point, index) => (
          <div key={index} className="flex flex-1 flex-col items-center gap-3">
            <div className="flex w-full items-end justify-center rounded-t-3xl bg-gradient-to-t from-orange-500 to-amber-300 shadow-lg" style={{ height: `${Math.max(20, point * 1.7)}px` }} />
            <span className="text-xs font-black text-slate-500">Sim. {index + 1}</span>
            <span className="text-sm font-black text-slate-950">{point}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function plural(n: number, singular: string, plural: string) {
  return `${n} ${n === 1 ? singular : plural}`;
}

function ResultSubjects({ performance, subjects }: { performance: SubjectPerformance[]; subjects: string[] }) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-slate-950">Desempenho por assunto</h3>
        <div className="mt-5 space-y-5">
          {(performance.length ? performance : [{ subject: "Assuntos indisponíveis", correct: 0, wrong: 0, blank: 0, total: 0, percent: 0 }]).map((item) => (
            <div key={item.subject}>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700">{item.subject}</span>
                <span className="font-semibold text-slate-900">{item.percent}%</span>
              </div>
              <div className="h-1 overflow-hidden rounded-sm bg-slate-100">
                <div className="h-full rounded-sm bg-orange-500" style={{ width: `${Math.max(2, item.percent)}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-slate-400">
                {plural(item.correct, "acerto", "acertos")}, {plural(item.wrong, "erro", "erros")}, {plural(item.blank, "em branco", "em branco")}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-slate-950">Assuntos revisados</h3>
        <div className="mt-4 flex flex-wrap gap-2">
          {(subjects.length ? subjects : ["Assuntos indisponíveis no preview"]).map((subject) => (
            <span key={subject} className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-600">
              {subject}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ResultWeakTopics({ weakTopics }: { weakTopics: WeakTopicGroup[] }) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-red-600">Onde revisar</p>
      <h3 className="mt-2 text-2xl font-black text-slate-950">Pontos fracos por tópico</h3>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {(weakTopics.length ? weakTopics : [{ subject: "Nenhum ponto fraco detectado", topics: ["Você não errou questões neste preview."], count: 0 }]).map((group) => (
          <div key={group.subject} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
            <h4 className="font-black text-slate-950">{group.subject}</h4>
            <p className="mt-1 text-sm text-slate-500">Seu ponto fraco está em:</p>
            <div className="mt-3 flex flex-wrap gap-2">{group.topics.map((topic) => <span key={topic} className="rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-black text-red-700">{topic}</span>)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultBehavior({ profile, answerChanges, timeSpent, avgTime }: { profile: { title: string; description: string; icon: string }; answerChanges: number; timeSpent: number; avgTime: number }) {
  const decisionNote = answerChanges === 0
    ? "Você manteve a primeira escolha em todas as questões."
    : answerChanges <= 2
      ? "Poucas revisões — boa segurança nas respostas."
      : "Você revisou bastante. Avalie se as mudanças melhoraram ou pioraram o resultado.";

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <span className="text-3xl">{profile.icon}</span>
          <div>
            <h3 className="text-xl font-semibold text-slate-950">{profile.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{profile.description}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-500">Mudanças de resposta</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{answerChanges}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-500">Tempo total</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{formatTime(timeSpent)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-500">Ritmo médio</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{formatTime(avgTime)}<span className="text-sm font-normal text-slate-400"> /questão</span></p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm text-slate-600">{decisionNote}</p>
      </div>
    </div>
  );
}

function ResultActionPlan({ weakTopics, performance }: { weakTopics: WeakTopicGroup[]; performance: SubjectPerformance[] }) {
  const targets = weakTopics.length ? weakTopics : performance.filter((item) => item.percent < 70).map((item) => ({ subject: item.subject, topics: [item.subject], count: 1 }));
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-gradient-to-br from-white to-orange-50 p-6 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-600">Próximo treino sugerido</p>
      <h3 className="mt-2 text-2xl font-black text-slate-950">Plano de revisão objetivo</h3>
      <div className="mt-6 space-y-3">
        {(targets.length ? targets : [{ subject: "Manutenção", topics: ["Refaça questões para consolidar o desempenho."], count: 1 }]).slice(0, 6).map((group, index) => (
          <div key={`${group.subject}-${index}`} className="flex gap-4 rounded-[1.5rem] border border-slate-200 bg-white p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-sm font-black text-white">{index + 1}</div>
            <div><h4 className="font-black text-slate-950">{group.subject}</h4><p className="mt-1 text-sm text-slate-600">Revise {group.topics.join(", ")} por pelo menos 20 a 30 minutos.</p></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultQuestions({ questions, answers }: { questions: PreviewQuestion[]; answers: Record<string, AnswerState> }) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-600">Questões comentadas</p>
      <h3 className="mt-2 text-2xl font-black text-slate-950">Questões do simulado</h3>
      <div className="mt-6 space-y-5">
        {questions.map((question, index) => {
          const answer = answers[question.simulado_question_id];
          const selected = question.alternatives.find((alt) => alt.id === answer?.alternativeId);
          const correct = question.alternatives.find((alt) => alt.is_correct);
          const isWrongTrueFalseAnswer = question.question_type === "true_false" && (correct?.label === "E" || String(correct?.text || "").trim().toLowerCase() === "errado");
          return (
            <div key={question.simulado_question_id} className="result-question-print rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
              <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white">Questão {index + 1}</span>{question.subject && <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-600">{question.subject}</span>}</div>
              <div className="richtext-editor mt-4 max-w-none rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-4 text-sm leading-6" dangerouslySetInnerHTML={{ __html: richHtml(question.statement) }} />
              <div className="mt-4 space-y-2">
                {question.alternatives.map((alt) => {
                  const isWrongTrueFalse = question.question_type === "true_false" && alt.is_correct && (alt.label === "E" || String(alt.text || "").trim().toLowerCase() === "errado");

                  return (
                    <div key={alt.id} className={`flex items-start gap-3 rounded-2xl border p-3 text-sm ${isWrongTrueFalse ? "border-red-300 bg-red-50 text-red-900" : alt.is_correct ? "border-emerald-300 bg-emerald-50 text-emerald-900" : selected?.id === alt.id ? "border-red-300 bg-red-50 text-red-900" : "border-slate-200 bg-white text-slate-800"}`}>
                      <strong className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${isWrongTrueFalse ? "bg-red-500 text-white" : alt.is_correct ? "bg-emerald-500 text-white" : "border border-slate-300 bg-white text-slate-700"}`}>
                        {alt.is_correct ? OWL_MARK : question.question_type === "true_false" ? "" : alt.label}
                      </strong>
                      <span className="richtext-editor min-w-0 flex-1" dangerouslySetInnerHTML={{ __html: richHtml(alt.text) }} />
                    </div>
                  );
                })}
              </div>
              <div className={`mt-4 rounded-2xl border p-3 text-sm font-semibold ${isWrongTrueFalseAnswer ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>Gabarito: {correct ? (question.question_type === "true_false" ? correct.text : `Alternativa ${correct.label}`) : "Sem gabarito"}</div>
              <div className="mt-4 grid gap-2 text-sm md:grid-cols-2"><InfoLine label="Sua resposta" value={selected ? (question.question_type === "true_false" ? selected.text : `Alternativa ${selected.label}`) : "Em branco"} /><InfoLine label="Resultado" value={!selected ? "Em branco" : selected.is_correct ? "Acertou" : "Errou"} /></div>
              {question.explanation_text && <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm"><strong>Comentário do professor:</strong><div className="richtext-editor mt-2 max-w-none" dangerouslySetInnerHTML={{ __html: richHtml(question.explanation_text) }} /></div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PremiumDonut({ percent }: { percent: number }) {
  const circumference = 2 * Math.PI * 46;
  const dash = Math.max(0, Math.min(100, percent));
  return (
    <div className="mx-auto flex max-w-xs flex-col items-center">
      <div className="relative h-44 w-44 sm:h-48 sm:w-48">
        <svg viewBox="0 0 130 130" className="h-full w-full -rotate-90 drop-shadow-lg">
          <circle cx="65" cy="65" r="46" fill="none" stroke="#e5e7eb" strokeWidth="10" />
          <circle cx="65" cy="65" r="46" fill="none" stroke="url(#premiumResultGradient)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(dash / 100) * circumference} ${circumference}`} />
          <defs><linearGradient id="premiumResultGradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#fb923c" /><stop offset="100%" stopColor="#facc15" /></linearGradient></defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center"><span className="text-2xl font-black tracking-[-0.04em] text-slate-950 sm:text-3xl">{formatPreviewNumber(percent)}%</span><span className="mt-1 text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">aproveitamento</span></div>
      </div>
    </div>
  );
}


function SmallPill({ label, value, tone }: { label: string; value: number | string; tone: "emerald" | "red" | "slate" }) {
  const cls = tone === "emerald" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : tone === "red" ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-slate-50 text-slate-700";
  return <div className={`rounded-2xl border px-3 py-2 text-xs font-black ${cls}`}><span>{label}</span><p className="mt-1 text-xl text-slate-950">{value}</p></div>;
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</p><p className="mt-1 font-black text-slate-950">{value}</p></div>;
}

function PreviewQuestionSidePanel({
  questions,
  answers,
  currentIndex,
  onGoTo,
  answeredCount,
  totalQuestions,
  owlHelpEnabled = false,
  owlHelpRemaining = 0,
  currentEligible = false,
  onOpenOwlHelp,
}: {
  questions: PreviewQuestion[];
  answers: Record<string, AnswerState>;
  currentIndex: number;
  onGoTo: (index: number) => void;
  answeredCount: number;
  totalQuestions: number;
  owlHelpEnabled?: boolean;
  owlHelpRemaining?: number;
  currentEligible?: boolean;
  onOpenOwlHelp?: () => void;
}) {
  const remaining = Math.max(0, totalQuestions - answeredCount);
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-24 space-y-3">
        <div className="relative overflow-hidden rounded-[1.75rem] border border-slate-200/85 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(255,253,249,0.96))] p-4 shadow-[0_20px_58px_rgba(15,23,42,0.08),0_1px_0_rgba(255,255,255,0.9)_inset] backdrop-blur-xl">
          <div className="pointer-events-none absolute right-0 top-0 h-36 w-36 rounded-full bg-orange-100/40 blur-3xl" />
          <div className="relative flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-600">Mapa do preview</p>
              <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">Questões</h2>
            </div>
            <span className="rounded-xl bg-slate-950 px-3 py-1.5 text-xs font-black text-white shadow-lg">{answeredCount}/{totalQuestions}</span>
          </div>

          <div className="relative mt-4 grid grid-cols-2 gap-2.5">
            <div className="rounded-[1.15rem] border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-3 text-emerald-700 shadow-sm">
              <p className="flex items-center gap-2 text-xs font-bold"><CircleCheck size={16} /> Respondidas</p>
              <strong className="mt-1.5 block text-xl text-slate-950">{answeredCount}</strong>
            </div>
            <div className="rounded-[1.15rem] border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-3 text-orange-600 shadow-sm">
              <p className="flex items-center gap-2 text-xs font-bold"><Timer size={16} /> Faltam</p>
              <strong className="mt-1.5 block text-xl text-slate-950">{remaining}</strong>
            </div>
          </div>

          {owlHelpEnabled && (
            <button
              type="button"
              onClick={onOpenOwlHelp}
              disabled={!currentEligible || owlHelpRemaining <= 0}
              className={`relative mt-4 w-full overflow-hidden rounded-[1.15rem] border p-3 text-left transition ${currentEligible && owlHelpRemaining > 0 ? "border-orange-200 bg-gradient-to-br from-orange-50 to-white shadow-sm hover:-translate-y-0.5 hover:border-orange-300" : "border-slate-200 bg-slate-50 opacity-60"}`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-2xl shadow-sm">
                  {OWL_MARK}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-600">Ajuda da Coruja</p>
                  <p className="mt-0.5 text-sm font-black text-slate-950">Você tem {owlHelpRemaining} ajuda{owlHelpRemaining === 1 ? "" : "s"}</p>
                  <p className="mt-0.5 text-xs font-semibold leading-4 text-slate-500">
                    {owlHelpRemaining <= 0 ? "Limite usado." : currentEligible ? "Clique para usar." : "Só em questões de alternativas."}
                  </p>
                </div>
              </div>
            </button>
          )}

          <div className="relative mt-4 max-h-[42vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-4 gap-2.5">
              {questions.map((question, index) => {
                const answered = Boolean(answers[question.simulado_question_id]?.alternativeId);
                const active = index === currentIndex;
                return (
                  <button
                    key={question.simulado_question_id}
                    type="button"
                    onClick={() => onGoTo(index)}
                    className={`h-11 rounded-xl border text-sm font-black transition duration-200 ${active ? "border-orange-500 bg-orange-50 text-orange-600 shadow-[0_0_18px_rgba(255,138,0,0.12)]" : answered ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "border-slate-200 bg-slate-50 text-slate-500 hover:-translate-y-0.5 hover:border-orange-200 hover:bg-orange-50"}`}
                    title={answered ? `Questão ${index + 1} respondida` : `Questão ${index + 1} pendente`}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="relative mt-4 rounded-[1.15rem] bg-gradient-to-br from-slate-50 to-white p-3 text-center text-xs leading-5 text-slate-500 ring-1 ring-slate-100">
            <Info size={16} className="mx-auto mb-1.5 text-orange-500" />
            Navegue pelas questões usando os números acima ou os botões abaixo.
          </div>
        </div>
      </div>
    </aside>
  );
}

function RuleItem({
  icon,
  title,
  description,
  variant = "default",
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  variant?: "default" | "danger" | "success";
}) {
  const variants = {
    default: "border-white/10 bg-white/5 text-slate-200",
    danger: "border-red-400/40 bg-red-500/10 text-red-100",
    success: "border-emerald-400/40 bg-emerald-500/10 text-emerald-100",
  } as const;

  const iconBg = {
    default: "bg-orange-500/20 text-orange-300",
    danger: "bg-red-500/30 text-red-200",
    success: "bg-emerald-500/30 text-emerald-200",
  } as const;

  return (
    <div className={`flex gap-3 rounded-2xl border p-4 ${variants[variant]}`}>
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBg[variant]}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mt-1 text-xs leading-5">{description}</p>
      </div>
    </div>
  );
}

function OverlayModal({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  variant,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  variant: "warning" | "danger" | "success";
  children?: React.ReactNode;
}) {
  const accent = variant === "warning" ? "from-orange-500 via-amber-400 to-yellow-300" : variant === "success" ? "from-emerald-500 via-green-400 to-teal-300" : "from-red-500 via-rose-500 to-orange-400";
  const eyebrow = variant === "warning" ? "Atenção" : variant === "success" ? "Sucesso" : "Erro";
  const ring = variant === "warning" ? "border-orange-200 shadow-orange-500/20" : variant === "success" ? "border-emerald-200 shadow-emerald-500/20" : "border-red-200 shadow-red-500/20";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-md">
      <div className={`relative w-full max-w-md overflow-hidden rounded-[2rem] border bg-white p-7 text-left text-slate-950 shadow-2xl ${ring}`}>
        <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent}`} />
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-orange-100 bg-orange-50 shadow-lg shadow-orange-500/10">
          {icon}
        </div>
        <p className="mt-5 text-xs font-black uppercase tracking-[0.24em] text-orange-600">{eyebrow}</p>
        <h2 className="mt-2 text-2xl font-black tracking-[-0.03em] text-slate-950">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
        {children}
        <button
          type="button"
          onClick={onAction}
          className={`mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r ${accent} px-5 py-3 text-sm font-black text-slate-950 shadow-xl shadow-orange-500/20 transition hover:-translate-y-0.5 hover:brightness-105`}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

function FinishConfirm({
  allowBlank,
  answeredCount,
  total,
  onCancel,
  onConfirm,
}: {
  allowBlank: boolean;
  answeredCount: number;
  total: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const unanswered = Math.max(0, total - answeredCount);
  const blockedByBlank = !allowBlank && unanswered > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-2xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <AlertTriangle size={28} />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-slate-950">Finalizar preview?</h2>
        {blockedByBlank ? (
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Você ainda tem <strong>{unanswered}</strong> questão(ões) em branco.
            Este simulado exige todas as questões respondidas.
          </p>
        ) : (
          <p className="mt-3 text-sm leading-6 text-slate-600">
            <strong>{answeredCount}</strong> de <strong>{total}</strong> questões respondidas.
            {unanswered > 0 ? ` ${unanswered} em branco — não pontuarão.` : " Todas respondidas."}
          </p>
        )}
        <div className="mt-6 flex flex-col gap-3 md:flex-row md:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Continuar respondendo
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={blockedByBlank}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-orange-500/20 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Sim, finalizar preview
          </button>
        </div>
      </div>
    </div>
  );
}
