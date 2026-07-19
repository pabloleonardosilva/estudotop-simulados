"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlarmClock,
  AlertTriangle,
  BookOpen,
  Bookmark,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleCheck,
  Clock3,
  FileText,
  Hourglass,
  Info,
  ListChecks,
  Lightbulb,
  MessageCircleQuestion,
  PlayCircle,
  RotateCcw,
  Scissors,
  Send,
  Shield,
  ShieldAlert,
  Timer,
  Trophy,
  XCircle,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { supabase } from "@/app/lib/supabase/client";
import { resolveOwlHelpLimit } from "@/app/simulados/utils";
import PremiumButton from "../../components/ui/PremiumButton";
import PremiumModal from "../../components/ui/PremiumModal";
import TopCoinRewardModal, { TopCoinValueInfo } from "@/app/components/gamification/TopCoinRewardModal";
import { getTopCoinMaxValue } from "@/app/lib/gamification/topcoins";

const OWL_MARK = "\u{1F989}\uFE0F";
const WINDOW_BLUR_GRACE_MS = 10_000;

type Phase =
  | "loading"
  | "rules"
  | "in_progress"
  | "focus_warning"
  | "disqualified"
  | "submitting"
  | "done"
  | "error";

type InitialSimulado = {
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
  navigation_type?: "open" | "closed" | null;
  owl_help_enabled?: boolean | null;
  owl_help_limit?: number | null;
};

type AttemptData = {
  id: string;
  simulado_id: string;
  attempt_number: number;
  status: string;
  started_at: string;
  expires_at: string | null;
  total_questions: number;
  answered_count: number;
  progress_percent: number;
  time_spent_seconds: number;
  tab_switch_count: number;
  focus_violation_count: number;
  owl_help_used_count?: number | null;
  owl_help_data?: Record<string, string[]> | null;
};

type OrderedQuestion = {
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
  discipline: string | null;
  alternatives: { id: string; label: string; text: string }[];
};

type AnswerState = {
  alternativeId: string;
  label: string;
  isCorrect: boolean | null;
  isLocked: boolean;
};

type AnswerMap = Record<string, AnswerState>;

type AttemptInfo = {
  used: number;
  remaining: number | null;
  total: number | null;
};

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0)
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function normalizeHtml(value?: string | null): string {
  let out = value || "";
  out = out.replace(
    /<mark([^>]*)>/gi,
    '<mark data-highlight="true" class="bg-yellow-200 px-1 rounded">',
  );
  if (!/<(p|div|br|h[1-6]|ul|ol|li|blockquote)\b/i.test(out)) {
    out = out.replace(/\n/g, "<br>");
  }
  return out;
}

function isTrueFalseQuestionType(value?: string | null): boolean {
  return String(value || "").toLowerCase() === "true_false";
}

function isOwlEligibleQuestion(question?: OrderedQuestion | null): boolean {
  if (!question || isTrueFalseQuestionType(question.question_type)) return false;
  return question.alternatives.length >= 3;
}

function escapeNoteHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function plainTextToNoteHtml(value: string): string {
  return escapeNoteHtml(value).replace(/\n/g, "<br>");
}

function noteHtmlToPlainText(html: string): string {
  const temp = document.createElement("div");
  temp.innerHTML = html;
  temp.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  return temp.textContent || "";
}

function extractNoteBlocks(
  html: string,
  currentAttemptNumber: number,
): {
  legacyHtml: string;
  previousAttemptHtml: string;
  currentTextByQid: Record<string, string>;
  previousTextByQid: Record<string, string>;
} {
  const clean = String(html || "").trim();
  if (!clean || typeof document === "undefined") {
    return { legacyHtml: clean, previousAttemptHtml: "", currentTextByQid: {}, previousTextByQid: {} };
  }

  const temp = document.createElement("div");
  temp.innerHTML = clean;

  const currentTextByQid: Record<string, string> = {};
  const previousTextByQid: Record<string, string> = {};
  const previousBlocksHtml: string[] = [];

  temp.querySelectorAll("[data-sqid]").forEach((block) => {
    const sqid = block.getAttribute("data-sqid");
    if (!sqid) return;

    const attemptAttr = block.getAttribute("data-attempt");
    const blockAttempt = attemptAttr ? Number(attemptAttr) : 0;

    const inner = block.cloneNode(true) as HTMLElement;
    inner.querySelectorAll("[data-note-label], [data-note-divider]").forEach((el) => el.remove());
    const text = noteHtmlToPlainText(inner.innerHTML);

    if (blockAttempt === currentAttemptNumber) {
      currentTextByQid[sqid] = text;
    } else {
      previousTextByQid[sqid] = previousTextByQid[sqid] ? `${previousTextByQid[sqid]}\n${text}` : text;
      previousBlocksHtml.push((block as HTMLElement).outerHTML);
    }
    block.remove();
  });

  return {
    legacyHtml: temp.innerHTML,
    previousAttemptHtml: previousBlocksHtml.join(""),
    currentTextByQid,
    previousTextByQid,
  };
}

function buildNoteBlockHtml(sqid: string, attemptNumber: number, number: number, withDivider: boolean, text: string): string {
  const divider = withDivider
    ? `<hr data-note-divider="true" style="border:none;border-top:1px dashed #D9E1EC;margin:18px 0;" />`
    : "";
  return `<div data-note-block="true" data-sqid="${sqid}" data-attempt="${attemptNumber}">${divider}<strong data-note-label="true">Nota ${number}: </strong>${plainTextToNoteHtml(text)}</div>`;
}

function countNoteBlocks(html: string): number {
  if (!html || typeof document === "undefined") return 0;
  const temp = document.createElement("div");
  temp.innerHTML = html;
  return temp.querySelectorAll("[data-note-block]").length;
}

function scoringDescription(model: "traditional" | "cebraspe"): string {
  return model === "cebraspe"
    ? "Modelo CEBRASPE: acerto soma, erro subtrai, branco zera."
    : "Modelo tradicional: acerto soma, erro e branco não pontuam.";
}

async function getAuthHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return {
    Authorization: `Bearer ${session?.access_token || ""}`,
    "Content-Type": "application/json",
  };
}

function resourcesIntroStorageKey(simuladoId: string, attemptId: string): string {
  return `estudotop:simulado:${simuladoId}:attempt:${attemptId}:resources-intro-seen`;
}

function shouldShowResourcesIntro(simuladoId: string, attemptId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(resourcesIntroStorageKey(simuladoId, attemptId)) !== "1";
  } catch {
    return true;
  }
}

function markResourcesIntroSeen(simuladoId: string, attemptId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(resourcesIntroStorageKey(simuladoId, attemptId), "1");
  } catch {
    // O fechamento continua disponível quando o armazenamento do navegador estiver bloqueado.
  }
}

export default function SimuladoExperience({
  simuladoId,
  initialSimulado,
}: {
  simuladoId: string;
  initialSimulado: InitialSimulado;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jornadaId = searchParams.get("jornada");
  const jornadaQuery = jornadaId ? `?jornada=${encodeURIComponent(jornadaId)}` : "";
  const [phase, setPhase] = useState<Phase>("loading");
  const [simulado, setSimulado] = useState<InitialSimulado>(initialSimulado);
  const [attempt, setAttempt] = useState<AttemptData | null>(null);
  const [attemptInfo, setAttemptInfo] = useState<AttemptInfo>({
    used: 0,
    remaining: initialSimulado.max_attempts,
    total: initialSimulado.max_attempts,
  });
  const [questions, setQuestions] = useState<OrderedQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [timeSpent, setTimeSpent] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [violationCount, setViolationCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [instantResultQuestionId, setInstantResultQuestionId] = useState<string | null>(null);
  const [eliminatedAlternatives, setEliminatedAlternatives] = useState<Record<string, string[]>>({});
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [notesByQuestion, setNotesByQuestion] = useState<Record<string, string>>({});
  const [previousNotesByQuestion, setPreviousNotesByQuestion] = useState<Record<string, string>>({});
  const [legacyNoteBlockCount, setLegacyNoteBlockCount] = useState(0);
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesFeedback, setNotesFeedback] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [topCoinsReward, setTopCoinsReward] = useState<number | null>(null);
  const [owlHelpModalOpen, setOwlHelpModalOpen] = useState(false);
  const [owlHelpLoading, setOwlHelpLoading] = useState(false);
  const [owlHelpError, setOwlHelpError] = useState<string | null>(null);
  const [owlHelpUsedCount, setOwlHelpUsedCount] = useState(0);
  const [owlHelpData, setOwlHelpData] = useState<Record<string, string[]>>({});
  const [owlPromptShownForKey, setOwlPromptShownForKey] = useState<string | null>(null);
  const [showResourcesIntro, setShowResourcesIntro] = useState(false);
  const [windowBlurCountdown, setWindowBlurCountdown] = useState<number | null>(null);

  const submittingRef = useRef(false);
  const autoSubmitTriggeredRef = useRef(false);
  const lastViolationTime = useRef(0);
  const windowBlurGraceTimerRef = useRef<number | null>(null);
  const windowBlurCountdownIntervalRef = useRef<number | null>(null);
  const windowBlurDeadlineRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const questionStartRef = useRef<number>(Date.now());
  const lastActivityRef = useRef<number>(Date.now());
  const legacyNotesHtmlRef = useRef("");
  const previousAttemptHtmlRef = useRef("");
  const notesByQuestionRef = useRef<Record<string, string>>({});
  const lastSavedNotesRef = useRef("{}");
  const notesSavingRef = useRef(false);
  const notesSaveQueuedRef = useRef(false);
  const idleEventOpenRef = useRef(false);
  const scissorsRecordedRef = useRef<Set<string>>(new Set());

  // Carrega dados iniciais (verifica tentativa em andamento)
  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }

      const res = await fetch(`/api/student/simulados/${simuladoId}${jornadaQuery}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErrorMessage(json.message || "Erro ao carregar simulado.");
        setPhase("error");
        return;
      }

      setSimulado(json.simulado);
      setAttemptInfo({
        used: json.attempts?.used ?? 0,
        remaining: json.attempts?.remaining ?? null,
        total: json.attempts?.total ?? null,
      });

      if (json.attempts?.in_progress) {
        // Restaura tentativa existente
        await resumeAttempt();
      } else {
        setPhase("rules");
      }
    }

    async function resumeAttempt() {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/student/simulados/${simuladoId}/attempts${jornadaQuery}`,
        { method: "POST", headers },
      );
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErrorMessage(json.message || "Erro ao retomar tentativa.");
        setPhase("error");
        return;
      }
      bindAttempt(json);
      setPhase("in_progress");
    }

    function bindAttempt(json: {
      attempt: AttemptData;
      questions: OrderedQuestion[];
      simulado: InitialSimulado;
      answers?: {
        simulado_question_id: string;
        selected_alternative_id: string | null;
        selected_alternative_label: string | null;
        is_correct: boolean | null;
        is_locked: boolean;
      }[];
    }) {
      setAttempt(json.attempt);
      setSimulado((prev) => ({ ...prev, ...json.simulado }));
      setQuestions(json.questions);
      const startedAt = new Date(json.attempt.started_at).getTime();
      startedAtRef.current = startedAt;
      questionStartRef.current = Date.now();
      lastActivityRef.current = Date.now();
      idleEventOpenRef.current = false;
      scissorsRecordedRef.current = new Set();
      setTimeSpent(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
      if (json.attempt.expires_at) {
        setRemainingSeconds(
          Math.max(
            0,
            Math.floor((new Date(json.attempt.expires_at).getTime() - Date.now()) / 1000),
          ),
        );
      } else {
        setRemainingSeconds(null);
      }

      const map: AnswerMap = {};
      for (const a of json.answers || []) {
        if (a.selected_alternative_id) {
          map[a.simulado_question_id] = {
            alternativeId: a.selected_alternative_id,
            label: a.selected_alternative_label || "",
            isCorrect: a.is_correct,
            isLocked: a.is_locked,
          };
        }
      }
      setAnswers(map);
      setViolationCount(json.attempt.focus_violation_count || 0);
      setOwlHelpUsedCount(Number(json.attempt.owl_help_used_count || 0));
      setOwlHelpData(
        json.attempt.owl_help_data && typeof json.attempt.owl_help_data === "object"
          ? json.attempt.owl_help_data
          : {},
      );
      autoSubmitTriggeredRef.current = false;
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simuladoId, router, jornadaQuery]);

  const recordBehaviorEvent = useCallback(async (payload: { type: "inactivity_event" } | { type: "scissors_used"; simulado_question_id: string }) => {
    if (!attempt) return;
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/student/simulados/${simuladoId}/attempts/${attempt.id}/behavior`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(payload),
      });
    } catch {
      // Métrica comportamental: falha silenciosa para não interromper o simulado.
    }
  }, [attempt, simuladoId]);

  useEffect(() => {
    if (phase !== "in_progress") return;

    function markActivity() {
      lastActivityRef.current = Date.now();
      idleEventOpenRef.current = false;
    }

    const events: Array<keyof WindowEventMap> = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((eventName) => window.addEventListener(eventName, markActivity, { passive: true }));
    markActivity();

    const interval = window.setInterval(() => {
      const idleFor = Date.now() - lastActivityRef.current;
      if (idleFor >= 60000 && !idleEventOpenRef.current) {
        idleEventOpenRef.current = true;
        void recordBehaviorEvent({ type: "inactivity_event" });
      }
    }, 5000);

    return () => {
      window.clearInterval(interval);
      events.forEach((eventName) => window.removeEventListener(eventName, markActivity));
    };
  }, [phase, recordBehaviorEvent]);

  // Timer
  useEffect(() => {
    if (phase !== "in_progress") return;
    const interval = window.setInterval(() => {
      setTimeSpent((prev) => prev + 1);
      setRemainingSeconds((prev) => (prev !== null ? Math.max(prev - 1, 0) : null));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [phase]);

  // Auto-submit por tempo esgotado
  useEffect(() => {
    if (phase !== "in_progress") return;
    if (remainingSeconds === null) return;
    if (remainingSeconds <= 0 && !autoSubmitTriggeredRef.current) {
      autoSubmitTriggeredRef.current = true;
      void submitAttempt(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSeconds, phase]);

  // Anti-fraud: troca de guia/minimização e perda prolongada de foco da janela
  const recordViolation = useCallback(async () => {
    const newCount = violationCount + 1;
    setViolationCount(newCount);
    if (!attempt) return;

    const headers = await getAuthHeaders();
    const res = await fetch(
      `/api/student/simulados/${simuladoId}/attempts/${attempt.id}/focus-violation`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ violation_number: newCount }),
      },
    );
    const json = await res.json();
    if (typeof json?.violation_count === "number") {
      setViolationCount(json.violation_count);
    }

    if (json?.disqualified) {
      setPhase("disqualified");
    } else {
      setPhase("focus_warning");
    }
  }, [violationCount, attempt, simuladoId]);

  useEffect(() => {
    if (phase !== "in_progress") return;

    function clearWindowBlurGraceTimer() {
      if (windowBlurGraceTimerRef.current !== null) {
        window.clearTimeout(windowBlurGraceTimerRef.current);
      }
      if (windowBlurCountdownIntervalRef.current !== null) {
        window.clearInterval(windowBlurCountdownIntervalRef.current);
      }
      windowBlurGraceTimerRef.current = null;
      windowBlurCountdownIntervalRef.current = null;
      windowBlurDeadlineRef.current = null;
      setWindowBlurCountdown(null);
    }

    function registerViolationOnce() {
      const now = Date.now();
      if (now - lastViolationTime.current < 1000) return;
      lastViolationTime.current = now;
      void recordViolation();
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        clearWindowBlurGraceTimer();
        registerViolationOnce();
      }
    }

    function handleWindowBlur() {
      if (document.hidden || windowBlurGraceTimerRef.current !== null) return;
      const deadline = Date.now() + WINDOW_BLUR_GRACE_MS;
      windowBlurDeadlineRef.current = deadline;
      setWindowBlurCountdown(Math.ceil(WINDOW_BLUR_GRACE_MS / 1000));
      windowBlurCountdownIntervalRef.current = window.setInterval(() => {
        if (windowBlurDeadlineRef.current === null) return;
        const seconds = Math.max(
          1,
          Math.ceil((windowBlurDeadlineRef.current - Date.now()) / 1000),
        );
        setWindowBlurCountdown(seconds);
      }, 200);
      windowBlurGraceTimerRef.current = window.setTimeout(() => {
        windowBlurGraceTimerRef.current = null;
        if (windowBlurCountdownIntervalRef.current !== null) {
          window.clearInterval(windowBlurCountdownIntervalRef.current);
        }
        windowBlurCountdownIntervalRef.current = null;
        windowBlurDeadlineRef.current = null;
        setWindowBlurCountdown(null);
        if (document.visibilityState === "visible" && !document.hasFocus()) {
          registerViolationOnce();
        }
      }, WINDOW_BLUR_GRACE_MS);
    }

    function handleWindowFocus() {
      clearWindowBlurGraceTimer();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);
    return () => {
      clearWindowBlurGraceTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [phase, recordViolation]);

  // Bloqueia print / save / contextmenu enquanto está em prova
  useEffect(() => {
    if (phase !== "in_progress" && phase !== "focus_warning") return;
    function blockPrint(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P" || e.key === "s" || e.key === "S")) {
        e.preventDefault();
      }
    }
    function blockContext(e: MouseEvent) {
      e.preventDefault();
    }
    document.addEventListener("keydown", blockPrint);
    document.addEventListener("contextmenu", blockContext);
    return () => {
      document.removeEventListener("keydown", blockPrint);
      document.removeEventListener("contextmenu", blockContext);
    };
  }, [phase]);

  // Aviso de saída
  useEffect(() => {
    if (phase !== "in_progress") return;
    function beforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [phase]);

  const startAttempt = useCallback(async () => {
    setPhase("loading");
    const headers = await getAuthHeaders();
    const res = await fetch(
      `/api/student/simulados/${simuladoId}/attempts${jornadaQuery}`,
      { method: "POST", headers },
    );
    const json = await res.json();
    if (!res.ok || !json.ok) {
      setErrorMessage(json.message || "Não foi possível iniciar o simulado.");
      setPhase("error");
      return;
    }

    setAttempt(json.attempt);
    setSimulado((prev) => ({ ...prev, ...json.simulado }));
    setQuestions(json.questions);
    setAnswers({});
    setCurrentIndex(0);
    const startedAt = new Date(json.attempt.started_at).getTime();
    startedAtRef.current = startedAt;
    questionStartRef.current = Date.now();
    lastActivityRef.current = Date.now();
    idleEventOpenRef.current = false;
    scissorsRecordedRef.current = new Set();
    setTimeSpent(0);
    if (json.attempt.expires_at) {
      setRemainingSeconds(
        Math.max(
          0,
          Math.floor((new Date(json.attempt.expires_at).getTime() - Date.now()) / 1000),
        ),
      );
    } else {
      setRemainingSeconds(null);
    }
    setShowResourcesIntro(shouldShowResourcesIntro(simuladoId, json.attempt.id));
    setPhase("in_progress");
  }, [simuladoId, jornadaQuery]);

  const sendAnswer = useCallback(
    async (question: OrderedQuestion, alt: { id: string; label: string }): Promise<boolean> => {
      if (!attempt) return false;
      if (question.status === "annulled") return false;

      const existing = answers[question.simulado_question_id];
      if (existing?.isLocked) return false;

      setAnswers((prev) => ({
        ...prev,
        [question.simulado_question_id]: {
          alternativeId: alt.id,
          label: alt.label,
          isCorrect: existing?.isCorrect ?? null,
          isLocked: existing?.isLocked || false,
        },
      }));

      const responseTime = Math.max(
        0,
        Math.floor((Date.now() - questionStartRef.current) / 1000),
      );

      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/student/simulados/${simuladoId}/attempts/${attempt.id}/answers`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            simulado_question_id: question.simulado_question_id,
            question_id: question.question_id,
            selected_alternative_id: alt.id,
            selected_alternative_label: alt.label,
            response_time_seconds: responseTime,
          }),
        },
      );
      const json = await res.json();

      if (!res.ok || !json.ok) {
        setAnswers((prev) => {
          const copy = { ...prev };
          if (existing) copy[question.simulado_question_id] = existing;
          else delete copy[question.simulado_question_id];
          return copy;
        });
        return false;
      }

      setAnswers((prev) => ({
        ...prev,
        [question.simulado_question_id]: {
          alternativeId: alt.id,
          label: alt.label,
          isCorrect: json.is_correct,
          isLocked: Boolean(json.is_locked),
        },
      }));

      if (attempt) {
        setAttempt({
          ...attempt,
          answered_count: json.answered_count ?? attempt.answered_count,
          progress_percent: json.progress_percent ?? attempt.progress_percent,
        });
      }
      return true;
    },
    [answers, attempt, simuladoId],
  );

  const chooseAnswer = useCallback((question: OrderedQuestion, alt: { id: string; label: string }) => {
    clearEliminatedAlternative(question.simulado_question_id, alt.id);
    if (simulado.feedback_mode === "instant" || simulado.instant_feedback_enabled) {
      const existing = answers[question.simulado_question_id];
      if (existing?.isLocked) return;
      setAnswers((prev) => ({
        ...prev,
        [question.simulado_question_id]: {
          alternativeId: alt.id,
          label: alt.label,
          isCorrect: null,
          isLocked: false,
        },
      }));
      return;
    }
    void sendAnswer(question, alt);
  }, [answers, sendAnswer, simulado.feedback_mode, simulado.instant_feedback_enabled]);

  const submitInstantAnswer = useCallback(async (question: OrderedQuestion) => {
    const selected = answers[question.simulado_question_id];
    if (!selected?.alternativeId) return;
    const ok = await sendAnswer(question, { id: selected.alternativeId, label: selected.label });
    if (ok) setInstantResultQuestionId(question.simulado_question_id);
  }, [answers, sendAnswer]);

  function toggleEliminatedAlternative(questionId: string, alternativeId: string) {
    setEliminatedAlternatives((current) => {
      const list = current[questionId] || [];
      const wasAlreadyEliminated = list.includes(alternativeId);
      const next = wasAlreadyEliminated
        ? list.filter((id) => id !== alternativeId)
        : [...list, alternativeId];
      if (!wasAlreadyEliminated && !scissorsRecordedRef.current.has(questionId)) {
        scissorsRecordedRef.current.add(questionId);
        void recordBehaviorEvent({ type: "scissors_used", simulado_question_id: questionId });
      }
      return { ...current, [questionId]: next };
    });
  }

  function clearEliminatedAlternative(questionId: string, alternativeId: string) {
    setEliminatedAlternatives((current) => {
      const list = current[questionId] || [];
      if (!list.includes(alternativeId)) return current;
      return { ...current, [questionId]: list.filter((id) => id !== alternativeId) };
    });
  }

  function goToNextAfterInstant() {
    setInstantResultQuestionId(null);
    if (currentIndex >= questions.length - 1) setConfirmFinish(true);
    else goNext();
  }

  // Após finalizar, o resultado exibido deve ser o da tentativa recém-concluída
  // (attemptId na URL); o contexto de Jornada é propagado para o botão de retorno.
  const buildResultUrl = useCallback(
    (attemptIdValue: string | null | undefined) => {
      const query = new URLSearchParams();
      if (attemptIdValue) query.set("attemptId", attemptIdValue);
      if (jornadaId) query.set("jornada", jornadaId);
      const queryString = query.toString();
      return `/meus-simulados/${simuladoId}/resultado${queryString ? `?${queryString}` : ""}`;
    },
    [simuladoId, jornadaId],
  );

  const submitAttempt = useCallback(
    async (auto = false) => {
      if (!attempt) return;
      if (submittingRef.current) return;
      submittingRef.current = true;
      setSubmitError(null);
      setPhase("submitting");

      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/student/simulados/${simuladoId}/attempts/${attempt.id}/submit`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            time_spent_seconds: timeSpent,
            auto_submission: auto,
          }),
        },
      );
      const json = await res.json();
      submittingRef.current = false;

      if (!res.ok || !json.ok) {
        if (!auto) autoSubmitTriggeredRef.current = false;
        setSubmitError(json.message || "Erro ao finalizar simulado.");
        setPhase("in_progress");
        return;
      }

      // TopCoins: gamificação separada da nota pedagógica. O próprio POST
      // .../submit já calcula e persiste o ganho; se por algum motivo ele
      // não vier na resposta, não trava o fluxo — só não mostra a recompensa.
      if (typeof json.earned_topcoins === "number") {
        setTopCoinsReward(json.earned_topcoins);
        return;
      }

      setPhase("done");
      router.replace(buildResultUrl(attempt.id));
    },
    [attempt, simuladoId, timeSpent, router, buildResultUrl],
  );

  function closeTopCoinsReward() {
    setTopCoinsReward(null);
    setPhase("done");
    router.replace(buildResultUrl(attempt?.id));
  }

  const openNotesPanel = useCallback(async () => {
    setNotesOpen(true);
    setNotesFeedback(null);

    if (notesLoaded) return;

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/student/simulados/${simuladoId}/notes`, {
        method: "GET",
        headers,
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        setNotesFeedback(json.message || "Não foi possível carregar suas anotações.");
        return;
      }

      const attemptNumber = attempt?.attempt_number ?? 1;
      const { legacyHtml, previousAttemptHtml, currentTextByQid, previousTextByQid } = extractNoteBlocks(
        String(json.note?.content || ""),
        attemptNumber,
      );
      legacyNotesHtmlRef.current = legacyHtml;
      previousAttemptHtmlRef.current = previousAttemptHtml;
      setLegacyNoteBlockCount(countNoteBlocks(legacyHtml) + countNoteBlocks(previousAttemptHtml));
      notesByQuestionRef.current = currentTextByQid;
      lastSavedNotesRef.current = JSON.stringify(currentTextByQid);
      setNotesByQuestion(currentTextByQid);
      setPreviousNotesByQuestion(previousTextByQid);
      setNotesLoaded(true);
    } catch {
      setNotesFeedback("Não foi possível carregar suas anotações.");
    }
  }, [notesLoaded, simuladoId, attempt]);

  const saveNotesPanel = useCallback(async function persistNotes() {
    if (notesSavingRef.current) {
      notesSaveQueuedRef.current = true;
      return;
    }

    notesSavingRef.current = true;
    setNotesSaving(true);
    setNotesFeedback("Salvando automaticamente...");

    const attemptNumber = attempt?.attempt_number ?? 1;
    const notesSnapshot = notesByQuestionRef.current;
    const serializedSnapshot = JSON.stringify(notesSnapshot);
    let blockNumber = legacyNoteBlockCount;
    const hasPrecedingContent = legacyNoteBlockCount > 0 || legacyNotesHtmlRef.current.trim().length > 0;
    const newBlocksHtml = questions
      .map((question) => {
        const text = (notesSnapshot[question.simulado_question_id] || "").trim();
        if (!text) return "";
        blockNumber += 1;
        const withDivider = blockNumber > 1 || hasPrecedingContent;
        return buildNoteBlockHtml(question.simulado_question_id, attemptNumber, blockNumber, withDivider, text);
      })
      .join("");

    const finalContent = legacyNotesHtmlRef.current + previousAttemptHtmlRef.current + newBlocksHtml;

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/student/simulados/${simuladoId}/notes`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ content: finalContent }),
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        setNotesFeedback(json.message || "Não foi possível salvar suas anotações.");
        return;
      }

      setNotesLoaded(true);
      lastSavedNotesRef.current = serializedSnapshot;
      setNotesFeedback("Anotações salvas automaticamente.");
    } catch {
      setNotesFeedback("Não foi possível salvar suas anotações.");
    } finally {
      notesSavingRef.current = false;
      setNotesSaving(false);
      if (notesSaveQueuedRef.current) {
        notesSaveQueuedRef.current = false;
        void persistNotes();
      }
    }
  }, [simuladoId, questions, legacyNoteBlockCount, attempt]);

  useEffect(() => {
    notesByQuestionRef.current = notesByQuestion;
    if (!notesLoaded || JSON.stringify(notesByQuestion) === lastSavedNotesRef.current) return;

    setNotesFeedback("Alterações pendentes...");
    const timer = window.setTimeout(() => {
      void saveNotesPanel();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [notesByQuestion, notesLoaded, saveNotesPanel]);

  const answeredCount = useMemo(
    () => Object.keys(answers).filter((id) => answers[id]?.alternativeId).length,
    [answers],
  );
  const correctCount = useMemo(
    () =>
      Object.values(answers).filter((a) => a.isCorrect === true).length,
    [answers],
  );
  const wrongCount = useMemo(
    () =>
      Object.values(answers).filter((a) => a.isCorrect === false).length,
    [answers],
  );

  const totalQuestions = questions.length || simulado.question_count;
  const progressPercent =
    totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  const currentQuestion = questions[currentIndex] || null;
  const isInstantMode = simulado.feedback_mode === "instant" || Boolean(simulado.instant_feedback_enabled);

  const owlHelpEnabled = Boolean(simulado.owl_help_enabled);
  const owlHelpLimit = resolveOwlHelpLimit(simulado.owl_help_limit, questions.length || simulado.question_count);
  const owlHelpRemaining = owlHelpEnabled ? Math.max(owlHelpLimit - owlHelpUsedCount, 0) : 0;
  const currentOwlEliminatedIds = currentQuestion
    ? owlHelpData[currentQuestion.simulado_question_id] || []
    : [];
  const currentQuestionLocked = Boolean(
    currentQuestion && answers[currentQuestion.simulado_question_id]?.isLocked,
  );
  const currentQuestionOwlEligible = isOwlEligibleQuestion(currentQuestion);
  const owlQuestionKey = attempt && currentQuestion
    ? `${attempt.id}:${currentQuestion.simulado_question_id}`
    : "";

  useEffect(() => {
    if (
      phase !== "in_progress"
      || !owlQuestionKey
      || !owlHelpEnabled
      || owlHelpRemaining <= 0
      || !currentQuestionOwlEligible
      || currentOwlEliminatedIds.length > 0
      || currentQuestionLocked
      || owlHelpModalOpen
      || showResourcesIntro
      || owlPromptShownForKey === owlQuestionKey
    ) return;

    const timer = window.setTimeout(() => setOwlPromptShownForKey(owlQuestionKey), 10_000);
    return () => window.clearTimeout(timer);
  }, [
    phase,
    owlQuestionKey,
    owlHelpEnabled,
    owlHelpRemaining,
    currentQuestionOwlEligible,
    currentOwlEliminatedIds.length,
    currentQuestionLocked,
    owlHelpModalOpen,
    showResourcesIntro,
    owlPromptShownForKey,
  ]);

  const owlPromptVisible = Boolean(owlQuestionKey) && owlPromptShownForKey === owlQuestionKey;

  const showOwlHelper =
    owlPromptVisible &&
    owlHelpEnabled &&
    phase === "in_progress" &&
    Boolean(attempt) &&
    Boolean(currentQuestion) &&
    currentQuestionOwlEligible &&
    owlHelpRemaining > 0 &&
    currentOwlEliminatedIds.length === 0 &&
    !currentQuestionLocked &&
    !owlHelpModalOpen &&
    !showResourcesIntro;

  async function confirmOwlHelp() {
    if (!attempt || !currentQuestion || owlHelpLoading) return;
    if (!isOwlEligibleQuestion(currentQuestion)) {
      setOwlHelpModalOpen(false);
      return;
    }
    setOwlHelpLoading(true);
    setOwlHelpError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/student/simulados/${simuladoId}/attempts/${attempt.id}/owl-help`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ simulado_question_id: currentQuestion.simulado_question_id }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setOwlHelpError(json.message || "Não foi possível usar a ajuda agora.");
        return;
      }
      const hiddenIds = Array.isArray(json.hiddenAlternativeIds) ? json.hiddenAlternativeIds : [];
      setOwlHelpData((prev) => ({ ...prev, [currentQuestion.simulado_question_id]: hiddenIds }));
      setOwlHelpUsedCount(Number(json.used || 0));
      setOwlHelpModalOpen(false);
    } catch {
      setOwlHelpError("Não foi possível usar a ajuda agora. Tente novamente.");
    } finally {
      setOwlHelpLoading(false);
    }
  }

  let currentNoteNumber: number | null = null;
  {
    let count = legacyNoteBlockCount;
    for (const question of questions) {
      const text = (notesByQuestion[question.simulado_question_id] || "").trim();
      if (!text) continue;
      count += 1;
      if (currentQuestion && question.simulado_question_id === currentQuestion.simulado_question_id) {
        currentNoteNumber = count;
        break;
      }
    }
  }

  const goPrev = () => {
    setOwlPromptShownForKey(null);
    setCurrentIndex((idx) => Math.max(0, idx - 1));
    questionStartRef.current = Date.now();
  };
  const goNext = () => {
    setOwlPromptShownForKey(null);
    setCurrentIndex((idx) => Math.min(questions.length - 1, idx + 1));
    questionStartRef.current = Date.now();
  };
  const goTo = (index: number) => {
    setOwlPromptShownForKey(null);
    setCurrentIndex(index);
    questionStartRef.current = Date.now();
  };

  const closeResourcesIntro = () => {
    if (attempt) {
      markResourcesIntroSeen(simuladoId, attempt.id);
    }
    questionStartRef.current = Date.now();
    lastActivityRef.current = Date.now();
    setOwlPromptShownForKey(null);
    setShowResourcesIntro(false);
  };

  if (phase === "loading") {
    return (
      <main className="min-h-screen bg-[#eef0f4] px-4 py-10">
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
          Carregando simulado...
        </div>
      </main>
    );
  }

  if (phase === "error") {
    return (
      <main className="min-h-screen bg-[#eef0f4] px-4 py-10">
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-red-200 bg-white p-10 text-center shadow-sm">
          <AlertTriangle className="mx-auto text-red-500" size={36} />
          <h1 className="mt-4 text-lg font-semibold text-slate-950">
            Não foi possível carregar o simulado
          </h1>
          <p className="mt-2 text-sm text-slate-600">{errorMessage}</p>
          <button
            onClick={() => router.push("/meus-simulados")}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Voltar para Meus Simulados
          </button>
        </div>
      </main>
    );
  }

  if (phase === "rules") {
    return (
      <RulesScreen
        simulado={simulado}
        attemptInfo={attemptInfo}
        onStart={startAttempt}
        onBack={() =>
          router.push(
            jornadaId ? `/minhas-jornadas/${jornadaId}?tab=simulados` : "/meus-simulados",
          )
        }
      />
    );
  }

  if (phase === "disqualified") {
    return (
      <FullScreenModal
        icon={<XCircle size={56} className="text-red-500" />}
        title="Tentativa encerrada"
        description="Você saiu da tela do simulado pela terceira vez. Conforme os avisos anteriores, esta tentativa foi encerrada e contará como utilizada."
        actionLabel="Ver meus simulados"
        onAction={() => router.push("/meus-simulados")}
        variant="danger"
      />
    );
  }

  return (
    <main className={`et-laptop-density relative min-h-screen overflow-x-hidden transition-colors duration-500 ${focusMode ? "bg-[#020617]" : "bg-[#f7f7f5]"}`}>
      <div className={`pointer-events-none fixed inset-0 z-0 transition duration-500 ${focusMode ? "bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,0.055),transparent_22%),radial-gradient(circle_at_72%_72%,rgba(255,138,0,0.08),transparent_24%),linear-gradient(180deg,#020617_0%,#050914_55%,#01030a_100%)]" : "bg-[radial-gradient(circle_at_8%_86%,rgba(255,138,0,0.075),transparent_19%),radial-gradient(circle_at_94%_80%,rgba(255,179,71,0.07),transparent_23%),radial-gradient(circle_at_50%_4%,rgba(148,163,184,0.055),transparent_30%),linear-gradient(180deg,#fbfcfd_0%,#f5f6f8_58%,#f9f7f3_100%)]"}`} />
      <div className={`pointer-events-none fixed bottom-0 left-0 z-0 h-56 w-56 transition-opacity duration-500 [background-image:radial-gradient(circle,rgba(255,138,0,0.35)_1.2px,transparent_1.2px)] [background-size:13px_13px] [mask-image:linear-gradient(135deg,#000,transparent_72%)] ${focusMode ? "opacity-15" : "opacity-40"}`} />
      <div className={`pointer-events-none fixed bottom-0 right-0 z-0 h-64 w-64 rounded-full blur-3xl transition duration-500 ${focusMode ? "bg-orange-500/10" : "bg-orange-100/35"}`} />
      {focusMode ? (
        <FocusModeTimer timeSpent={timeSpent} remainingSeconds={remainingSeconds} />
      ) : (
        <StickyHeader
          title={simulado.title}
          timeSpent={timeSpent}
          remainingSeconds={remainingSeconds}
          currentIndex={currentIndex}
          total={questions.length}
          progressPercent={progressPercent}
          correctCount={correctCount}
          wrongCount={wrongCount}
          instantFeedback={isInstantMode}
          focusMode={focusMode}
        />
      )}

      {focusMode && phase === "in_progress" && (
        <FocusModeLightButton onToggle={() => setFocusMode(false)} />
      )}

      <TopCoinRewardModal
        amount={topCoinsReward ?? 0}
        open={topCoinsReward !== null}
        onClose={closeTopCoinsReward}
      />

      <WindowBlurCountdownOverlay seconds={windowBlurCountdown} />

      <SimuladoResourcesIntroModal
        open={showResourcesIntro}
        onClose={closeResourcesIntro}
      />

      <div className={`relative z-10 mx-auto grid w-full gap-5 px-4 py-5 md:px-6 xl:px-8 ${focusMode ? "max-w-[1280px] pt-18" : "et-laptop-exam-grid max-w-[1680px] lg:grid-cols-[minmax(0,1fr)_310px]"}`}>
        <div className="min-w-0">
          {phase === "submitting" && (
            <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-600">
              Enviando suas respostas...
            </div>
          )}

          {submitError && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {submitError}
            </div>
          )}

          {currentQuestion && (
            <QuestionCard
              question={currentQuestion}
              index={currentIndex}
              total={questions.length}
              answer={answers[currentQuestion.simulado_question_id]}
              instantFeedback={isInstantMode}
              showTeacherComment={simulado.show_teacher_comment}
              eliminatedAlternativeIds={eliminatedAlternatives[currentQuestion.simulado_question_id] || []}
              owlEliminatedAlternativeIds={currentOwlEliminatedIds}
              onToggleEliminate={(alternativeId) => toggleEliminatedAlternative(currentQuestion.simulado_question_id, alternativeId)}
              onSelect={(alt) => chooseAnswer(currentQuestion, alt)}
            />
          )}

          {currentQuestion && !focusMode && (
            <div className="mt-4 lg:hidden">
              <NotebookControl
                open={notesOpen}
                onToggle={() => (notesOpen ? setNotesOpen(false) : openNotesPanel())}
                content={notesByQuestion[currentQuestion.simulado_question_id] || ""}
                previousText={previousNotesByQuestion[currentQuestion.simulado_question_id] || ""}
                noteNumber={currentNoteNumber}
                questionNumber={currentIndex + 1}
                saving={notesSaving}
                feedback={notesFeedback}
                onChange={(value) => setNotesByQuestion((prev) => ({ ...prev, [currentQuestion.simulado_question_id]: value }))}
                onClose={() => setNotesOpen(false)}
              />
            </div>
          )}

          {isInstantMode && currentQuestion && answers[currentQuestion.simulado_question_id]?.alternativeId && !answers[currentQuestion.simulado_question_id]?.isLocked && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => submitInstantAnswer(currentQuestion)}
                className="animate-pulse inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 px-6 py-3 text-sm font-black text-slate-950 shadow-lg shadow-orange-500/25 transition hover:-translate-y-0.5"
              >
                <Send size={17} /> Enviar resposta
              </button>
            </div>
          )}

          <AnimatePresence initial={false}>
            {showOwlHelper && (
              <motion.div
                key={`owl-help-${currentQuestion?.simulado_question_id || "prompt"}`}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="relative z-30 overflow-visible"
              >
                <OwlHelpFlyingPrompt
                  remaining={owlHelpRemaining}
                  onClick={() => {
                    setOwlPromptShownForKey(null);
                    setOwlHelpError(null);
                    setOwlHelpModalOpen(true);
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <Navigator
            questions={questions}
            answers={answers}
            currentIndex={currentIndex}
            onGoTo={goTo}
            onPrev={goPrev}
            onNext={goNext}
            onFinish={() => setConfirmFinish(true)}
            submitting={phase === "submitting"}
            instantMode={isInstantMode}
            currentAnswered={Boolean(currentQuestion && answers[currentQuestion.simulado_question_id]?.isLocked)}
            allowNextWithoutAnswer={simulado.navigation_type !== "closed"}
          />
        </div>

        {!focusMode && (
          <QuestionSidePanel
            questions={questions}
            answers={answers}
            currentIndex={currentIndex}
            onGoTo={isInstantMode ? (() => {}) : goTo}
            answeredCount={answeredCount}
            totalQuestions={questions.length}
            focusMode={focusMode}
            onToggleFocusMode={() => setFocusMode((current) => !current)}
            notesOpen={notesOpen}
            onToggleNotes={() => (notesOpen ? setNotesOpen(false) : openNotesPanel())}
            notesContent={currentQuestion ? notesByQuestion[currentQuestion.simulado_question_id] || "" : ""}
            previousNotesText={currentQuestion ? previousNotesByQuestion[currentQuestion.simulado_question_id] || "" : ""}
            noteNumber={currentNoteNumber}
            questionNumber={currentIndex + 1}
            notesSaving={notesSaving}
            notesFeedback={notesFeedback}
            onNotesChange={(value) => {
              if (!currentQuestion) return;
              setNotesByQuestion((prev) => ({ ...prev, [currentQuestion.simulado_question_id]: value }));
            }}
            onCloseNotes={() => setNotesOpen(false)}
          />
        )}
      </div>

      {instantResultQuestionId && currentQuestion && answers[instantResultQuestionId] && (
        <FullScreenModal
          icon={answers[instantResultQuestionId]?.isCorrect ? <CheckCircle2 size={56} className="text-emerald-500" /> : <XCircle size={56} className="text-red-500" />}
          title={answers[instantResultQuestionId]?.isCorrect ? "Você acertou!" : "Resposta incorreta"}
          description={currentQuestion.explanation_text && simulado.show_teacher_comment ? "Confira o comentário do professor antes de avançar." : "Clique para seguir."}
          actionLabel={currentIndex >= questions.length - 1 ? "Finalizar simulado" : "Próxima questão"}
          onAction={goToNextAfterInstant}
          variant={answers[instantResultQuestionId]?.isCorrect ? "success" : "danger"}
        >
          {currentQuestion.explanation_text && simulado.show_teacher_comment && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-left text-sm leading-6 text-slate-700" dangerouslySetInnerHTML={{ __html: normalizeHtml(currentQuestion.explanation_text) }} />
          )}
        </FullScreenModal>
      )}

      {phase === "focus_warning" && (
        <FullScreenModal
          icon={<ShieldAlert size={56} className="text-amber-500" />}
          title="Atenção: a janela do simulado perdeu o foco"
          description={violationCount >= 2
            ? "A janela do simulado perdeu o foco. Usar outra janela, aplicativo, guia ou minimizar o navegador é considerado saída da prova. Esta foi a segunda ocorrência. Se isso acontecer mais uma vez, sua tentativa será encerrada e contará como utilizada."
            : "A janela do simulado perdeu o foco. Usar outra janela, aplicativo, guia ou minimizar o navegador é considerado saída da prova. Esta foi a primeira ocorrência. Na terceira ocorrência, sua tentativa será encerrada e contará como utilizada."}
          actionLabel="Entendi, continuar simulado"
          onAction={() => setPhase("in_progress")}
          variant="warning"
        />
      )}

      {confirmFinish && currentQuestion && (
        <FinishConfirm
          allowBlank={simulado.allow_blank_answers}
          answeredCount={answeredCount}
          total={questions.length}
          onCancel={() => setConfirmFinish(false)}
          onConfirm={() => {
            setConfirmFinish(false);
            submitAttempt();
          }}
        />
      )}

      {owlHelpModalOpen && currentQuestion && (
        <FullScreenModal
          icon={<Lightbulb size={56} className="text-orange-400" />}
          title="Usar Ajuda da Coruja?"
          description={
            isOwlEligibleQuestion(currentQuestion)
              ? `A Coruja vai eliminar duas alternativas erradas desta questão. Você tem ${owlHelpRemaining} ajuda${owlHelpRemaining === 1 ? "" : "s"} disponíve${owlHelpRemaining === 1 ? "l" : "is"} e só pode usar uma ajuda por questão.`
              : "A Ajuda da Coruja só pode ser usada em questões de alternativas. Questões de certo ou errado não são elegíveis."
          }
          actionLabel={
            isOwlEligibleQuestion(currentQuestion)
              ? owlHelpLoading
                ? "Chamando a Coruja..."
                : "Sim, chamar a Coruja"
              : "Entendi"
          }
          onAction={() => {
            if (owlHelpLoading) return;
            if (isOwlEligibleQuestion(currentQuestion)) void confirmOwlHelp();
            else setOwlHelpModalOpen(false);
          }}
          variant="warning"
        >
          {owlHelpError && (
            <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {owlHelpError}
            </p>
          )}
          {isOwlEligibleQuestion(currentQuestion) && (
            <button
              type="button"
              onClick={() => setOwlHelpModalOpen(false)}
              disabled={owlHelpLoading}
              className="mt-3 inline-flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancelar
            </button>
          )}
        </FullScreenModal>
      )}
    </main>
  );
}

function WindowBlurCountdownOverlay({ seconds }: { seconds: number | null }) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {seconds !== null && (
        <motion.div
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          className="pointer-events-none fixed inset-0 z-[10050] grid place-items-center overflow-hidden bg-slate-950/[0.88] p-4 backdrop-blur-lg"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.18 }}
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(circle_at_50%_46%,rgba(249,115,22,0.28),transparent_28%),radial-gradient(circle_at_50%_50%,rgba(239,68,68,0.12),transparent_52%)]"
          />
          <motion.section
            initial={reduceMotion ? false : { opacity: 0, scale: 0.82, y: 24 }}
            animate={reduceMotion
              ? { opacity: 1, scale: 1, y: 0 }
              : { opacity: 1, scale: [0.82, 1.035, 1], y: [24, -5, 0] }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.94, y: 12 }}
            transition={reduceMotion
              ? { duration: 0 }
              : { duration: 0.42, times: [0, 0.78, 1], ease: "easeOut" }}
            className="relative w-full max-w-2xl overflow-hidden rounded-[2rem] border border-orange-400/45 bg-[linear-gradient(155deg,rgba(15,23,42,0.98),rgba(24,14,8,0.98))] px-5 py-7 text-center shadow-[0_30px_100px_rgba(0,0,0,0.62),0_0_70px_rgba(249,115,22,0.18)] sm:px-9 sm:py-9"
          >
            <div className="absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-orange-400 to-transparent" />
            <span className="inline-flex items-center gap-2 rounded-full border border-orange-400/30 bg-orange-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-orange-300">
              <ShieldAlert size={15} />
              Janela do simulado sem foco
            </span>

            <h2 className="mt-5 text-2xl font-black tracking-[-0.035em] text-white sm:text-4xl">
              Volte para o simulado agora
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
              Retorne antes de a contagem zerar. Caso contrário, uma saída será registrada.
            </p>

            <div className="relative mx-auto mt-5 grid size-44 place-items-center rounded-full border border-orange-400/35 bg-orange-500/[0.07] shadow-[inset_0_0_38px_rgba(249,115,22,0.13),0_0_55px_rgba(249,115,22,0.2)] sm:size-52">
              <div className="absolute inset-3 rounded-full border-2 border-dashed border-orange-400/35" />
              <motion.strong
                key={seconds}
                initial={reduceMotion ? false : { opacity: 0.35, scale: 1.22 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: reduceMotion ? 0 : 0.22, ease: "easeOut" }}
                className="text-[6.5rem] font-black leading-none tracking-[-0.08em] text-white drop-shadow-[0_0_28px_rgba(249,115,22,0.42)] sm:text-[8rem]"
              >
                {seconds}
              </motion.strong>
              <span className="absolute bottom-6 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-orange-300 sm:bottom-7">
                <Clock3 size={13} />
                segundos
              </span>
            </div>

            <div className="mx-auto mt-5 flex max-w-md gap-1.5" aria-hidden="true">
              {Array.from({ length: 10 }, (_, index) => (
                <span
                  key={index}
                  className={`h-2 flex-1 rounded-full transition-colors duration-200 ${
                    index < seconds
                      ? "bg-gradient-to-r from-orange-500 to-amber-400 shadow-[0_0_10px_rgba(249,115,22,0.3)]"
                      : "bg-white/10"
                  }`}
                />
              ))}
            </div>

            <p className="mx-auto mt-5 max-w-xl rounded-2xl border border-red-400/20 bg-red-500/[0.08] px-4 py-3 text-xs font-semibold leading-5 text-red-100 sm:text-sm">
              Na terceira saída, esta tentativa será encerrada e contabilizada.
            </p>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SimuladoResourcesIntroModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const actionAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      actionAreaRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    });
    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key !== "Tab" && event.key !== "Escape") return;
      event.preventDefault();
      actionAreaRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    };
    document.addEventListener("keydown", keepFocusInside);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", keepFocusInside);
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[10030] flex items-center justify-center overflow-y-auto bg-slate-950/[0.78] p-3 backdrop-blur-md sm:p-5"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.38, ease: "easeOut" }}
        >
          {!reduceMotion && (
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 h-[58vh] w-[72vw] max-w-[1040px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-500/35 blur-[90px]"
              initial={{ opacity: 0.85, scale: 0.35 }}
              animate={{ opacity: 0, scale: 1.28 }}
              transition={{ duration: 1.05, ease: "easeOut" }}
            />
          )}
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="resources-intro-title"
            aria-describedby="resources-intro-description"
            initial={reduceMotion ? false : { opacity: 0, y: 58, scale: 0.72 }}
            animate={reduceMotion
              ? { opacity: 1, y: 0, scale: 1 }
              : {
                  opacity: [0, 1, 1],
                  y: [58, -9, 0],
                  scale: [0.72, 1.035, 1],
                }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 18, scale: 0.96 }}
            transition={reduceMotion
              ? { duration: 0 }
              : { duration: 0.72, times: [0, 0.76, 1], ease: [0.22, 1, 0.36, 1] }}
            className="relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-[1180px] flex-col overflow-hidden rounded-[1.75rem] border border-white/70 bg-[#fffdfa] shadow-[0_32px_100px_rgba(2,6,23,0.52)] sm:max-h-[calc(100dvh-2.5rem)] sm:rounded-[2.25rem]"
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-[radial-gradient(circle_at_12%_0%,rgba(255,138,0,0.13),transparent_34%),radial-gradient(circle_at_88%_0%,rgba(251,191,36,0.1),transparent_30%)]" />

            <div className="relative overflow-y-auto px-4 pb-4 pt-5 sm:px-7 sm:pb-6 sm:pt-7 lg:px-9">
              <header className="mx-auto max-w-4xl text-center">
                <span className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-orange-700">
                  <Shield size={13} aria-hidden="true" />
                  Recursos do simulado
                </span>
                <h2
                  id="resources-intro-title"
                  className="mt-3 text-2xl font-black tracking-[-0.035em] text-slate-950 sm:text-3xl lg:text-[2.15rem]"
                >
                  Antes de começar: conheça seus recursos
                </h2>
                <p
                  id="resources-intro-description"
                  className="mx-auto mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-[15px]"
                >
                  Três ferramentas acompanham você durante a prova. Veja onde encontrá-las e como cada uma pode ajudar.
                </p>
              </header>

              <div className="mt-5 grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)] lg:gap-5">
                <div className="relative min-h-[310px] overflow-hidden rounded-[1.5rem] border border-slate-200 bg-gradient-to-br from-white via-[#f8fafc] to-orange-50/70 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_18px_45px_rgba(15,23,42,0.08)] sm:min-h-[350px] sm:p-4">
                  <div className="overflow-hidden rounded-[1.15rem] border border-slate-200 bg-white shadow-sm">
                    <div className="flex h-12 items-center justify-between bg-gradient-to-r from-[#080b12] via-[#191008] to-[#090c12] px-4">
                      <div className="flex items-center gap-2">
                        <span className="grid size-7 place-items-center rounded-lg border border-orange-400/50 bg-orange-500/10 text-orange-400">
                          <Shield size={14} />
                        </span>
                        <span className="text-[9px] font-black uppercase tracking-[0.18em] text-white">
                          Simulado em andamento
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <span className="h-6 w-16 rounded-lg border border-white/15 bg-white/5" />
                        <span className="h-6 w-12 rounded-lg border border-orange-400/40 bg-orange-500/10" />
                      </div>
                    </div>

                    <div className="grid grid-cols-[minmax(0,1fr)_82px] gap-2 bg-[#f7f7f5] p-3 sm:grid-cols-[minmax(0,1fr)_112px]">
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex items-center gap-1.5">
                          <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-1 text-[7px] font-black text-orange-600">
                            Questão 1
                          </span>
                          <span className="rounded-full bg-emerald-50 px-2 py-1 text-[7px] font-bold text-emerald-700">
                            1,00 pts
                          </span>
                        </div>
                        <div className="mt-4 h-2 w-11/12 rounded-full bg-slate-300" />
                        <div className="mt-2 h-2 w-8/12 rounded-full bg-slate-200" />
                        <div className="mt-4 space-y-2">
                          {["w-8/12", "w-11/12", "w-9/12"].map((widthClass, index) => (
                            <div
                              key={widthClass}
                              className={`relative flex h-9 items-center gap-2 rounded-xl border bg-white py-1.5 pr-2 pl-9 ${
                                index === 0
                                  ? "border-orange-300 bg-orange-50/50 shadow-[0_5px_18px_rgba(249,115,22,0.12)]"
                                  : index === 1
                                    ? "border-red-200 bg-red-50/40 opacity-55"
                                    : "border-slate-200"
                              }`}
                            >
                              {index < 2 && (
                                <span
                                  className={`absolute left-1.5 grid size-6 place-items-center rounded-full border shadow-sm ${
                                    index === 0
                                      ? "border-orange-200 bg-orange-50 text-orange-500"
                                      : "border-red-200 bg-red-50 text-red-500"
                                  }`}
                                >
                                  <Scissors size={13} />
                                </span>
                              )}
                              <span className="grid size-5 place-items-center rounded-full border border-orange-200 text-[8px] font-bold text-orange-600">
                                {String.fromCharCode(65 + index)}
                              </span>
                              <span className={`h-1.5 rounded-full ${index === 1 ? "bg-red-200" : "bg-slate-200"} ${widthClass}`} />
                              {index === 1 && (
                                <span className="absolute right-4 left-9 top-1/2 h-px -rotate-2 bg-red-500" />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="rounded-xl border border-slate-200 bg-white p-2">
                          <span className="text-[7px] font-black uppercase tracking-[0.14em] text-orange-600">
                            Mapa da prova
                          </span>
                          <div className="mt-2 grid grid-cols-2 gap-1">
                            {[1, 2, 3, 4].map((number) => (
                              <span
                                key={number}
                                className="grid h-6 place-items-center rounded-md border border-slate-200 bg-slate-50 text-[8px] font-bold text-slate-500"
                              >
                                {number}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-xl border border-orange-200 bg-white p-2">
                          <span className="flex items-center gap-1 text-[7px] font-black uppercase tracking-[0.12em] text-orange-600">
                            <BookOpen size={10} /> Caderno
                          </span>
                          <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200" />
                          <div className="mt-1.5 h-1.5 w-3/4 rounded-full bg-slate-100" />
                        </div>
                      </div>
                    </div>

                    <div className="flex h-14 items-center justify-center gap-2 border-t border-slate-200 bg-white">
                      <span className="text-2xl" aria-hidden="true">{OWL_MARK}</span>
                      <span className="rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-[8px] font-black text-slate-700">
                        Precisa de uma ajuda?
                      </span>
                    </div>
                  </div>

                  <svg
                    aria-hidden="true"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    className="pointer-events-none absolute inset-3 h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] overflow-visible sm:inset-4 sm:h-[calc(100%-2rem)] sm:w-[calc(100%-2rem)]"
                  >
                    <defs>
                      <linearGradient id="resources-intro-line" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#fb923c" />
                        <stop offset="100%" stopColor="#ea580c" />
                      </linearGradient>
                      <filter id="resources-intro-glow" x="-50%" y="-50%" width="200%" height="200%">
                        <feDropShadow dx="0" dy="1" stdDeviation="1.25" floodColor="#fb923c" floodOpacity="0.55" />
                      </filter>
                      <marker
                        id="resources-intro-arrow"
                        viewBox="0 0 10 10"
                        refX="8.5"
                        refY="5"
                        markerWidth="5.5"
                        markerHeight="5.5"
                        orient="auto-start-reverse"
                      >
                        <path d="M 0 0 L 10 5 L 0 10 L 2.5 5 z" fill="#ea580c" />
                      </marker>
                    </defs>
                    <path
                      d="M 8 62 C 5.5 58, 5.5 51, 8 46"
                      fill="none"
                      stroke="white"
                      strokeWidth="2.1"
                      strokeLinecap="round"
                      opacity="0.95"
                    />
                    <motion.path
                      d="M 8 62 C 5.5 58, 5.5 51, 8 46"
                      fill="none"
                      stroke="url(#resources-intro-line)"
                      strokeWidth="1"
                      strokeLinecap="round"
                      markerEnd="url(#resources-intro-arrow)"
                      filter="url(#resources-intro-glow)"
                      initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ delay: 0.25, duration: reduceMotion ? 0 : 0.7 }}
                    />
                    <path
                      d="M 50 95 C 49 91, 45 87, 41 84"
                      fill="none"
                      stroke="white"
                      strokeWidth="2.1"
                      strokeLinecap="round"
                      opacity="0.95"
                    />
                    <motion.path
                      d="M 50 95 C 49 91, 45 87, 41 84"
                      fill="none"
                      stroke="url(#resources-intro-line)"
                      strokeWidth="1"
                      strokeLinecap="round"
                      markerEnd="url(#resources-intro-arrow)"
                      filter="url(#resources-intro-glow)"
                      initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ delay: 0.35, duration: reduceMotion ? 0 : 0.7 }}
                    />
                    <path
                      d="M 95 66 C 92 59, 87 53, 82 49"
                      fill="none"
                      stroke="white"
                      strokeWidth="2.1"
                      strokeLinecap="round"
                      opacity="0.95"
                    />
                    <motion.path
                      d="M 95 66 C 92 59, 87 53, 82 49"
                      fill="none"
                      stroke="url(#resources-intro-line)"
                      strokeWidth="1"
                      strokeLinecap="round"
                      markerEnd="url(#resources-intro-arrow)"
                      filter="url(#resources-intro-glow)"
                      initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ delay: 0.45, duration: reduceMotion ? 0 : 0.7 }}
                    />
                  </svg>

                  <motion.span
                    aria-label="Local da ferramenta Tesoura"
                    className="absolute left-[2%] top-[58%] grid size-9 place-items-center rounded-full border-2 border-white bg-gradient-to-br from-orange-400 to-orange-600 text-sm font-black text-white shadow-[0_8px_24px_rgba(249,115,22,0.5)] ring-4 ring-orange-200/60"
                    animate={reduceMotion ? undefined : { scale: [1, 1.08, 1] }}
                    transition={{ duration: 2.1, repeat: Infinity }}
                  >
                    1
                  </motion.span>
                  <motion.span
                    aria-label="Local da Ajuda da Coruja"
                    className="absolute -bottom-[1%] left-1/2 grid size-9 -translate-x-1/2 place-items-center rounded-full border-2 border-white bg-gradient-to-br from-orange-400 to-orange-600 text-sm font-black text-white shadow-[0_8px_24px_rgba(249,115,22,0.5)] ring-4 ring-orange-200/60"
                    animate={reduceMotion ? undefined : { scale: [1, 1.08, 1] }}
                    transition={{ delay: 0.25, duration: 2.1, repeat: Infinity }}
                  >
                    2
                  </motion.span>
                  <motion.span
                    aria-label="Local do Caderno"
                    className="absolute -right-[0.5%] top-[62%] grid size-9 place-items-center rounded-full border-2 border-white bg-gradient-to-br from-orange-400 to-orange-600 text-sm font-black text-white shadow-[0_8px_24px_rgba(249,115,22,0.5)] ring-4 ring-orange-200/60"
                    animate={reduceMotion ? undefined : { scale: [1, 1.08, 1] }}
                    transition={{ delay: 0.5, duration: 2.1, repeat: Infinity }}
                  >
                    3
                  </motion.span>
                </div>

                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                  <div className="rounded-[1.25rem] border border-orange-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-600">
                        <Scissors size={19} />
                      </span>
                      <div>
                        <span className="text-[9px] font-black uppercase tracking-[0.18em] text-orange-600">Recurso 1</span>
                        <h3 className="text-base font-black text-slate-950">Tesoura</h3>
                      </div>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-slate-600 sm:text-[13px]">
                      Posicione o mouse antes da letra da alternativa até que o ponteiro se transforme em uma tesoura. Depois, clique para eliminar visualmente a opção que considera incorreta.
                    </p>
                  </div>

                  <div className="rounded-[1.25rem] border border-amber-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600">
                        <span className="text-xl" aria-hidden="true">{OWL_MARK}</span>
                      </span>
                      <div>
                        <span className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-700">Recurso 2</span>
                        <h3 className="text-base font-black text-slate-950">Ajuda da Coruja</h3>
                      </div>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-slate-600 sm:text-[13px]">
                      Quando disponível, a coruja oferece uma ajuda extra para a questão atual.
                    </p>
                  </div>

                  <div className="rounded-[1.25rem] border border-blue-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
                        <BookOpen size={19} />
                      </span>
                      <div>
                        <span className="text-[9px] font-black uppercase tracking-[0.18em] text-blue-700">Recurso 3</span>
                        <h3 className="text-base font-black text-slate-950">Caderno</h3>
                      </div>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-slate-600 sm:text-[13px]">
                      Use o caderno para registrar observações, dúvidas e estratégias durante a prova.
                    </p>
                  </div>
                </div>
              </div>

              <footer className="mt-4 flex flex-col items-center justify-between gap-3 rounded-[1.25rem] border border-slate-200 bg-white/90 p-3.5 sm:flex-row sm:px-5">
                <p className="text-center text-xs font-semibold leading-5 text-slate-500 sm:text-left">
                  Você poderá usar esses recursos durante a prova, sem sair da questão.
                </p>
                <div ref={actionAreaRef} className="w-full shrink-0 sm:w-auto">
                  <PremiumButton
                    full
                    icon={<PlayCircle size={17} />}
                    onClick={onClose}
                    className="min-w-full px-6 sm:min-w-[245px]"
                  >
                    Entendi, iniciar simulado
                  </PremiumButton>
                </div>
              </footer>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function OwlHelpFlyingPrompt({
  remaining,
  onClick,
}: {
  remaining: number;
  onClick: () => void;
}) {
  const [hasLanded, setHasLanded] = useState(false);
  const reduceMotion = useReducedMotion();
  const label =
    remaining === 1
      ? "Você tem direito a 1 ajuda. Clique aqui!"
      : `Você tem direito a ${remaining} ajudas. Clique aqui!`;

  return (
    <div className="pointer-events-none flex min-h-[126px] items-end justify-center overflow-visible px-1 pb-1 pt-4 md:px-3">
      <motion.button
        type="button"
        onClick={onClick}
        aria-label="Abrir Ajuda da Coruja"
        initial={reduceMotion ? { opacity: 0 } : { y: "-38vh", opacity: 0, scale: 1.6 }}
        animate={reduceMotion
          ? { y: 0, opacity: 1, scale: 1 }
          : {
              y: ["-38vh", "-38vh", "-16vh", 0],
              scale: [1.6, 1.6, 1.18, 1],
              rotate: [0, -3, 2, 0],
              opacity: [0, 1, 1, 1],
            }}
        transition={reduceMotion
          ? { duration: 0.2 }
          : { duration: 2.15, times: [0, 0.28, 0.72, 1], ease: "easeInOut" }}
        onAnimationComplete={() => setHasLanded(true)}
        className="pointer-events-auto group relative flex items-center gap-3 focus:outline-none"
      >
        <AnimatePresence>
          {hasLanded && (
            <motion.span
              initial={reduceMotion ? false : { opacity: 0, scale: 0.82, x: 10 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.28, ease: "easeOut" }}
              className="relative -mt-8 rounded-2xl border border-orange-200 bg-white px-4 py-2.5 text-left shadow-[0_14px_34px_rgba(15,23,42,0.14)] transition duration-200 group-hover:-translate-y-0.5 group-hover:border-orange-300"
            >
              <span className="block text-sm font-black text-slate-950">{label}</span>
              <span className="mt-0.5 block text-[10px] font-black uppercase tracking-[0.16em] text-orange-600">
                Ajuda da Coruja
              </span>
              <span
                aria-hidden="true"
                className="absolute -right-[7px] top-[58%] h-3.5 w-3.5 -translate-y-1/2 rotate-45 border-r border-t border-orange-200 bg-white"
              />
            </motion.span>
          )}
        </AnimatePresence>

        <span className="relative flex shrink-0 flex-col items-center" aria-hidden="true">
          <motion.span
            animate={
              reduceMotion
                ? { y: 0, scaleY: 1, rotate: 0 }
                : hasLanded
                ? { y: [0, -4, 0], scaleY: [1, 1.02, 1], rotate: 0 }
                : { y: [0, -8, 3, -6, 0], scaleY: [1, 0.93, 1.05, 0.94, 1], rotate: [0, -3, 2, -2, 0] }
            }
            transition={
              reduceMotion
                ? { duration: 0 }
                : hasLanded
                ? { repeat: Infinity, duration: 3, ease: "easeInOut" }
                : { repeat: Infinity, duration: 0.42, ease: "easeInOut" }
            }
            className="relative z-10 block h-24 w-24 overflow-hidden rounded-full border-2 border-orange-300 bg-white shadow-[0_16px_36px_rgba(255,138,0,0.26)] transition duration-200 group-hover:scale-105"
          >
            <img
              src="/images/coruja-ajuda.jpg"
              alt=""
              className="h-full w-full object-cover"
            />
          </motion.span>
          <motion.span
            animate={
              reduceMotion
                ? { scaleX: 1, opacity: 0.32 }
                : hasLanded
                ? { scaleX: [1, 0.88, 1], opacity: [0.32, 0.24, 0.32] }
                : { scaleX: [0.62, 0.5, 0.68, 0.52, 0.62], opacity: [0.16, 0.1, 0.18, 0.11, 0.16] }
            }
            transition={
              reduceMotion
                ? { duration: 0 }
                : hasLanded
                ? { repeat: Infinity, duration: 3, ease: "easeInOut" }
                : { repeat: Infinity, duration: 0.42, ease: "easeInOut" }
            }
            className="mt-1.5 block h-2 w-14 rounded-full bg-slate-900 blur-[3px]"
          />
        </span>
      </motion.button>
    </div>
  );
}

function NotebookControl({
  open,
  onToggle,
  ...panelProps
}: {
  open: boolean;
  onToggle: () => void;
  content: string;
  previousText: string;
  noteNumber: number | null;
  questionNumber: number;
  saving: boolean;
  feedback: string | null;
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="group relative flex w-full items-center justify-between overflow-hidden rounded-[1.5rem] border border-orange-200/90 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(255,247,237,0.96))] p-4 text-left shadow-[0_16px_44px_rgba(249,115,22,0.10)] transition duration-300 hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-[0_20px_50px_rgba(249,115,22,0.16)]"
      >
        <span className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-orange-200/35 blur-2xl transition group-hover:bg-orange-300/45" />
        <span className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-lg shadow-orange-500/20">
            <BookOpen size={20} />
          </span>
          <span>
            <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-orange-600">Recurso de apoio</span>
            <span className="mt-0.5 block text-base font-black text-slate-950">Caderno</span>
          </span>
        </span>
        <span className="relative flex h-9 w-9 items-center justify-center rounded-full border border-orange-200 bg-white text-orange-600 shadow-sm transition duration-300 group-hover:scale-105">
          {open ? <ChevronUp size={18} /> : <ChevronDown size={18} className="animate-bounce" />}
        </span>
      </button>
      <NotesPanel open={open} {...panelProps} />
    </div>
  );
}

function NotesPanel({
  open,
  content,
  previousText,
  noteNumber,
  questionNumber,
  saving,
  feedback,
  onChange,
  onClose,
}: {
  open: boolean;
  content: string;
  previousText: string;
  noteNumber: number | null;
  questionNumber: number;
  saving: boolean;
  feedback: string | null;
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <section className="max-h-[56vh] overflow-y-auto rounded-[1.7rem] border border-slate-200 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.10)]">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 px-5 py-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-600">Caderno de anotações</p>
          <h2 className="mt-1 text-lg font-black text-slate-950">Questão {questionNumber}</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">Essas anotações ficam disponíveis depois em Minhas anotações.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar anotações" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          <XCircle size={18} />
        </button>
      </div>

      <div className="p-5">
        {previousText && (
          <div className="mb-4">
            <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">
              Anotações das tentativas anteriores
            </p>
            <div className="whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-100 p-4 text-sm leading-6 text-slate-600">
              {previousText}
            </div>
            <hr className="my-4 border-t border-dashed border-slate-300" />
          </div>
        )}

        <p className="mb-2 text-sm font-black text-slate-800">
          {noteNumber ? `Nota ${noteNumber}:` : "Nova nota"}
        </p>
        <textarea
          value={content}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Digite sua anotação para esta questão..."
          className="min-h-[200px] w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-orange-300 focus:bg-white focus:ring-4 focus:ring-orange-100"
        />
        {feedback && <p className="mt-3 text-xs font-bold text-slate-500">{feedback}</p>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-400">{saving ? "Salvando automaticamente..." : "Salvamento automático ativo"}</p>
          <button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 bg-white px-5 py-2 text-sm font-black text-slate-600 transition hover:bg-slate-50">
            Fechar anotações
          </button>
        </div>
      </div>
    </section>
  );
}

function StickyHeader({
  title,
  timeSpent,
  remainingSeconds,
  currentIndex,
  total,
  progressPercent,
  correctCount,
  wrongCount,
  instantFeedback,
  focusMode = false,
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
  focusMode?: boolean;
}) {
  const warningTime = remainingSeconds !== null && remainingSeconds < 5 * 60;
  return (
    <header className={`sticky top-0 z-30 overflow-hidden border-b border-white/15 text-white shadow-[0_22px_58px_rgba(15,23,42,0.28)] transition duration-500 ${focusMode ? "bg-[#010204]" : "bg-black"}`}>
      <div className="pointer-events-none absolute inset-0 opacity-90 [background:linear-gradient(132deg,transparent_0%,transparent_37%,rgba(255,138,0,0.09)_46%,rgba(255,138,0,0.035)_56%,transparent_66%),linear-gradient(180deg,#000000_0%,#030303_100%)]" />
      <div className="pointer-events-none absolute left-[34%] top-[-90px] h-[260px] w-[330px] rotate-45 bg-orange-500/10 blur-2xl" />
      <div className="et-laptop-exam-topbar relative flex min-h-[124px] w-full flex-col gap-5 px-5 py-5 md:px-9 lg:flex-row lg:items-center lg:justify-between lg:gap-4 xl:px-[54px]">
        <div className="et-laptop-exam-heading flex min-w-0 flex-1 items-center gap-5">
          <div className="et-laptop-exam-badge relative flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-[1.05rem] border border-orange-400/60 bg-[linear-gradient(145deg,rgba(255,138,0,0.18),rgba(255,138,0,0.035)_54%,rgba(0,0,0,0.24))] shadow-[0_0_0_1px_rgba(255,255,255,0.035)_inset,0_0_26px_rgba(255,122,24,0.42)]">
            <Shield size={36} strokeWidth={2.2} className="text-orange-300 drop-shadow-[0_0_12px_rgba(255,138,0,0.62)]" />
            <div className="pointer-events-none absolute inset-0 rounded-[1.05rem] ring-1 ring-inset ring-orange-300/10" />
          </div>
          <div className="min-w-0 border-l border-white/20 pl-5">
            <p className="text-[11px] font-black uppercase tracking-[0.42em] text-orange-300">
              Simulado em andamento
            </p>
            <h1 className="et-laptop-exam-title mt-2 break-words text-[21px] font-black leading-[1.15] tracking-tight text-white md:text-[23px] xl:text-[24px] 2xl:text-[26px]">{title}</h1>
          </div>
        </div>

        <div className="et-laptop-exam-stats flex w-full flex-wrap items-center gap-3 text-xs lg:w-auto lg:shrink-0 lg:flex-nowrap">
          <div className="et-laptop-exam-stat et-laptop-exam-stat-time flex h-[72px] min-w-[174px] shrink-0 items-center gap-4 rounded-[1rem] border border-white/25 bg-white/[0.055] px-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_26px_rgba(0,0,0,0.26)] backdrop-blur-md">
            <Clock3 size={31} strokeWidth={2.1} className="text-orange-300" />
            <div>
              <strong className="block text-[18px] leading-none text-white md:text-[19px]">{formatTime(timeSpent)}</strong>
              <span className="mt-2 block text-[10px] font-black uppercase tracking-[0.08em] text-white/65">Tempo decorrido</span>
            </div>
          </div>
          {remainingSeconds !== null && (
            <div className={`et-laptop-exam-stat et-laptop-exam-stat-time flex h-[72px] min-w-[164px] shrink-0 items-center gap-4 rounded-[1rem] border px-5 backdrop-blur-md transition duration-500 ${warningTime ? "border-2 border-orange-400 bg-[#170d04] shadow-[0_0_0_1px_rgba(251,146,60,0.7)_inset,0_0_16px_4px_rgba(251,146,60,0.95),0_0_48px_16px_rgba(251,146,60,0.55)]" : "border-orange-400/50 bg-orange-500/[0.07] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_22px_rgba(255,122,24,0.42),0_12px_28px_rgba(0,0,0,0.26)]"}`}>
              <Hourglass size={31} strokeWidth={2.1} className={warningTime ? "text-orange-100 drop-shadow-[0_0_10px_rgba(251,146,60,0.95)]" : "text-amber-300 drop-shadow-[0_0_12px_rgba(251,146,60,0.7)]"} />
              <div>
                <strong className="block text-[18px] leading-none text-white md:text-[19px]">{formatTime(remainingSeconds)}</strong>
                <span className="mt-2 block text-[10px] font-black uppercase tracking-[0.08em] text-white/65">Tempo restante</span>
              </div>
            </div>
          )}
          <div className="et-laptop-exam-stat et-laptop-exam-stat-progress flex h-[72px] min-w-[238px] shrink-0 items-center gap-4 rounded-[1rem] border border-white/25 bg-white/[0.055] px-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_26px_rgba(0,0,0,0.26)] backdrop-blur-md">
            <ProgressRing percent={progressPercent} />
            <div>
              <strong className="block text-[18px] leading-none text-white md:text-[19px]">{Math.min(currentIndex + 1, total)}/{total}</strong>
              <span className="mt-2 block text-[10px] font-black uppercase tracking-[0.08em] text-white/65">Progresso geral</span>
            </div>
            <span className="ml-auto text-[18px] font-black text-amber-300">{progressPercent}%</span>
          </div>
          {instantFeedback && (
            <div className="et-laptop-exam-feedback flex shrink-0 items-center gap-3 rounded-[1.1rem] border border-white/10 bg-white/[0.055] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
              <span className="flex items-center gap-1 text-emerald-300"><CheckCircle2 size={14} />{correctCount}</span>
              <span className="flex items-center gap-1 text-red-300"><XCircle size={14} />{wrongCount}</span>
            </div>
          )}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-orange-400/45 to-transparent" />
    </header>
  );
}

function FocusModeTimer({
  timeSpent,
  remainingSeconds,
}: {
  timeSpent: number;
  remainingSeconds: number | null;
}) {
  const [timerVisible, setTimerVisible] = useState(false);
  const hideTimerRef = useRef<number | null>(null);
  const reduceMotion = useReducedMotion();
  const hasLimit = remainingSeconds !== null;
  const warningTime = hasLimit && remainingSeconds < 5 * 60;
  const value = hasLimit ? remainingSeconds : timeSpent;

  useEffect(() => {
    return () => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  function revealTimer() {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
    }
    setTimerVisible(true);
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      setTimerVisible(false);
    }, 5_000);
  }

  return (
    <div className="absolute left-1/2 top-4 z-30 -translate-x-1/2">
      <AnimatePresence mode="wait" initial={false}>
        {timerVisible ? (
          <motion.div
            key="focus-timer"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.86, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.88, y: -5 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
            className={`flex h-11 items-center gap-2.5 rounded-full border px-4 text-white shadow-[0_16px_36px_rgba(0,0,0,0.28)] backdrop-blur-xl ${warningTime ? "border-orange-300/70 bg-orange-500/15 text-orange-100 shadow-[0_0_26px_rgba(251,146,60,0.30)]" : "border-white/10 bg-slate-950/70"}`}
          >
            {hasLimit ? (
              <Hourglass size={16} className={warningTime ? "text-orange-200" : "text-amber-300"} />
            ) : (
              <Clock3 size={16} className="text-orange-300" />
            )}
            <strong className="text-sm font-black tabular-nums tracking-wide">{formatTime(value)}</strong>
            <span className="hidden text-[9px] font-black uppercase tracking-[0.16em] text-white/45 sm:block">
              {hasLimit ? "Restante" : "Decorrido"}
            </span>
          </motion.div>
        ) : (
          <motion.div
            key="focus-clock-tower"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.82, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.88, y: -5 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
          >
            <PremiumButton
              variant="dark"
              onClick={revealTimer}
              className="group relative h-14 w-14 overflow-visible rounded-2xl border-amber-300/40 bg-slate-950/80 !p-0 text-amber-200 shadow-[0_0_28px_rgba(251,191,36,0.16),0_16px_36px_rgba(0,0,0,0.34)] backdrop-blur-xl hover:border-amber-200/70 hover:bg-slate-900"
            >
              <span className="relative grid size-10 place-items-center rounded-xl border border-amber-200/20 bg-[radial-gradient(circle_at_50%_40%,rgba(251,191,36,0.13),transparent_68%)]" aria-hidden="true">
                <AlarmClock size={30} strokeWidth={1.9} className="text-amber-200 drop-shadow-[0_0_7px_rgba(251,191,36,0.36)] transition group-hover:text-amber-100" />
              </span>
              <span className="sr-only">Exibir o relógio por 5 segundos</span>
            </PremiumButton>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FocusModeLightButton({ onToggle }: { onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-3 rounded-full border border-amber-300/45 bg-slate-950/88 px-5 py-3 text-sm font-black text-amber-100 shadow-[0_0_34px_rgba(251,191,36,0.18),0_18px_50px_rgba(0,0,0,0.34)] backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:border-amber-200 hover:bg-slate-900"
      aria-label="Acender a luz"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-200/45 bg-amber-300 text-slate-950 shadow-[0_0_22px_rgba(251,191,36,0.60)]">
        <Lightbulb size={17} fill="currentColor" />
      </span>
      Acender a luz
    </button>
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
  owlEliminatedAlternativeIds = [],
  onToggleEliminate,
  onSelect,
}: {
  question: OrderedQuestion;
  index: number;
  total: number;
  answer: AnswerState | undefined;
  instantFeedback: boolean;
  showTeacherComment: boolean;
  eliminatedAlternativeIds?: string[];
  owlEliminatedAlternativeIds?: string[];
  onToggleEliminate?: (alternativeId: string) => void;
  onSelect: (alt: { id: string; label: string }) => void;
}) {
  const isAnnulled = question.status === "annulled";
  const showFeedback = instantFeedback && answer?.isLocked;
  const isTrueFalse = isTrueFalseQuestionType(question.question_type);

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-slate-200/85 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(255,253,249,0.96))] p-5 shadow-[0_22px_62px_rgba(15,23,42,0.08),0_1px_0_rgba(255,255,255,0.9)_inset] ring-1 ring-white/90 backdrop-blur-xl md:p-7">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange-300/70 to-transparent" />
      <div className="pointer-events-none absolute right-0 top-0 h-48 w-48 rounded-full bg-orange-100/35 blur-3xl" />
      {isAnnulled && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rotate-[-12deg] text-4xl font-black uppercase tracking-widest text-amber-500/20 md:text-6xl">Questão Anulada</span>
        </div>
      )}

      <div className="relative flex items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-1.5 font-black text-orange-600 shadow-sm">
            <FileText size={16} /> Questão {index + 1} de {total}
          </span>
          {question.subject && <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 font-bold text-slate-600">{question.subject}</span>}
          {question.points ? <span className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-1.5 font-bold text-emerald-700">{Number(question.points).toFixed(2).replace(".", ",")} pts</span> : null}
          {isAnnulled && <span className="rounded-xl border border-amber-300 bg-amber-100 px-3 py-1.5 font-bold text-amber-800">Anulada</span>}
        </div>
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-orange-200 bg-white text-orange-500 shadow-sm">
          <Bookmark size={18} />
        </span>
      </div>

      <div className="prose prose-slate relative mt-6 max-w-none border-b border-slate-100 pb-5 text-[16px] font-medium leading-[1.72] text-slate-800 md:text-[17px]" dangerouslySetInnerHTML={{ __html: normalizeHtml(question.statement) }} />

      <div className="relative mt-5 space-y-2.5">
        {question.alternatives.map((alt) => {
          const isSelected = answer?.alternativeId === alt.id;
          const wasOwlEliminated = owlEliminatedAlternativeIds.includes(alt.id);
          const isOwlEliminated = wasOwlEliminated && !isSelected;
          const locked = answer?.isLocked || isAnnulled || isOwlEliminated;
          const isEliminated = eliminatedAlternativeIds.includes(alt.id) && !isSelected;
          const isWrongTrueFalseSelected = question.question_type === "true_false" && isSelected && answer?.isCorrect && (alt.label === "E" || String(alt.text || "").trim().toLowerCase() === "errado");
          let cls = "group relative flex w-full items-center gap-3.5 rounded-[1.2rem] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#fbfcfd_100%)] px-4 py-3.5 pl-[4.5rem] text-left text-[15px] leading-6 shadow-[0_6px_18px_rgba(15,23,42,0.03)] transition duration-200";
          if (!locked) cls += " cursor-pointer hover:-translate-y-0.5 hover:border-orange-300 hover:bg-orange-50/50 hover:shadow-[0_10px_28px_rgba(255,138,0,0.08)]";
          else cls += " cursor-default";
          if (isEliminated) cls += " opacity-55";
          if (isOwlEliminated) cls += " border-orange-200 bg-orange-50/40 opacity-60";
          if (showFeedback && isSelected) cls = answer?.isCorrect
            ? isWrongTrueFalseSelected
              ? "group relative flex w-full items-center gap-3.5 rounded-[1.2rem] border-2 border-red-400 bg-red-50 px-4 py-3.5 pl-[4.5rem] text-left text-sm"
              : "group relative flex w-full items-center gap-3.5 rounded-[1.2rem] border-2 border-emerald-400 bg-emerald-50 px-4 py-3.5 pl-[4.5rem] text-left text-sm"
            : "group relative flex w-full items-center gap-3.5 rounded-[1.2rem] border-2 border-red-400 bg-red-50 px-4 py-3.5 pl-[4.5rem] text-left text-sm";
          else if (isSelected) cls = "group relative flex w-full items-center gap-3.5 rounded-[1.2rem] border-2 border-orange-400 bg-orange-50 px-4 py-3.5 pl-[4.5rem] text-left text-sm ring-4 ring-orange-100/70 shadow-[0_10px_30px_rgba(255,138,0,0.10)]";

          return (
            <div key={alt.id} role={!locked ? "button" : undefined} tabIndex={!locked ? 0 : undefined}
              onClick={!locked ? () => onSelect({ id: alt.id, label: alt.label }) : undefined}
              onKeyDown={!locked ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect({ id: alt.id, label: alt.label }); } } : undefined}
              className={cls}>
              {!locked && (
                <button type="button" aria-label={isEliminated ? "Remover eliminação da alternativa" : "Eliminar alternativa"}
                  onClick={(event) => { event.preventDefault(); event.stopPropagation(); onToggleEliminate?.(alt.id); }}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onToggleEliminate?.(alt.id); } }}
                  className={`absolute left-0 top-0 z-20 flex h-full w-14 items-center justify-start pl-3.5 transition ${isEliminated ? "opacity-100" : "opacity-0 hover:opacity-100 focus:opacity-100"} [&>svg]:rounded-full [&>svg]:border [&>svg]:p-1.5 [&>svg]:shadow-sm ${isEliminated ? "[&>svg]:border-red-200 [&>svg]:bg-red-50 [&>svg]:text-red-500" : "[&>svg]:border-orange-100 [&>svg]:bg-orange-50 [&>svg]:text-orange-400 hover:[&>svg]:border-red-200 hover:[&>svg]:bg-red-50 hover:[&>svg]:text-red-500"}`}>
                  <Scissors size={26} />
                </button>
              )}
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-black transition ${isSelected ? showFeedback ? answer?.isCorrect ? isWrongTrueFalseSelected ? "border-red-500 bg-red-500 text-white" : "border-emerald-500 bg-emerald-500 text-white" : "border-red-500 bg-red-500 text-white" : "border-orange-500 bg-orange-500 text-white shadow-[0_0_16px_rgba(255,138,0,0.24)]" : isOwlEliminated ? "border-orange-300 bg-orange-200 text-orange-700" : isEliminated ? "border-red-200 bg-red-50 text-red-500" : "border-orange-200 bg-white text-orange-600"}`}>
                <span className="sr-only">{alt.label}</span>
                {isSelected && !showFeedback ? <span className="text-base leading-none" aria-label="Selecionada pela Coruja">{OWL_MARK}</span> : isTrueFalse ? null : <span>{alt.label}</span>}
              </span>
              <div className="flex-1">
                <div className={`prose prose-slate max-w-none text-[15px] leading-6 text-slate-700 md:text-base ${isEliminated ? "line-through decoration-red-500 decoration-2" : ""}`} dangerouslySetInnerHTML={{ __html: normalizeHtml(alt.text) }} />
                {wasOwlEliminated && (
                  <p className="mt-2 text-xs font-black uppercase tracking-[0.16em] text-orange-700">Eliminada pela Coruja</p>
                )}
              </div>
              {showFeedback && isSelected && <span className="ml-2">{answer?.isCorrect ? <CheckCircle2 className={isWrongTrueFalseSelected ? "text-red-500" : "text-emerald-500"} size={22} /> : <XCircle className="text-red-500" size={22} />}</span>}
            </div>
          );
        })}
      </div>

      {showFeedback && showTeacherComment && question.explanation_text && (
        <div className="relative mt-5 rounded-[1.4rem] border border-emerald-200 bg-emerald-50/70 p-4 text-sm leading-7 text-emerald-900">
          <p className="flex items-center gap-2 font-bold"><BookOpen size={17} /> Comentário do professor</p>
          <div className="prose prose-emerald mt-2 max-w-none text-sm leading-7 text-emerald-900" dangerouslySetInnerHTML={{ __html: normalizeHtml(question.explanation_text) }} />
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
  submitting,
  instantMode = false,
  currentAnswered = true,
  allowNextWithoutAnswer = false,
}: {
  questions: OrderedQuestion[];
  answers: AnswerMap;
  currentIndex: number;
  onGoTo: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onFinish: () => void;
  submitting: boolean;
  instantMode?: boolean;
  currentAnswered?: boolean;
  allowNextWithoutAnswer?: boolean;
}) {
  const isLast = currentIndex === questions.length - 1;
  return (
    <section className="mt-5 rounded-[1.75rem] border border-slate-200/85 bg-white/95 px-4 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.065),0_1px_0_rgba(255,255,255,0.9)_inset] backdrop-blur-xl md:px-5">
      <div className="grid items-center gap-4 md:grid-cols-[auto_1fr_auto]">
        <button type="button" onClick={onPrev} disabled={currentIndex === 0 || instantMode}
          className="inline-flex min-w-[118px] items-center justify-center gap-2 rounded-2xl border border-orange-200 bg-white px-4 py-2.5 text-sm font-bold text-orange-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-orange-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 disabled:opacity-60">
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
              return <button key={q.simulado_question_id} type="button" onClick={() => { if (!instantMode) onGoTo(idx); }} disabled={instantMode && idx !== currentIndex} className={instantMode && idx !== currentIndex ? `${cls} cursor-not-allowed opacity-55` : cls} aria-label={`Ir para questão ${idx + 1}`}>{idx + 1}</button>;
            })}
          </div>
          <p className="mt-3 text-sm font-black text-slate-700">Questão {currentIndex + 1} de {questions.length}</p>
        </div>

        {isLast ? (
          <button type="button" onClick={onFinish} disabled={submitting}
            className="inline-flex min-w-[132px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-400 px-5 py-2.5 text-sm font-black text-white shadow-[0_14px_30px_rgba(255,138,0,0.28)] transition hover:-translate-y-1 hover:shadow-[0_18px_38px_rgba(255,138,0,0.36)] disabled:cursor-not-allowed disabled:opacity-60">
            <Trophy size={17} /> Finalizar
          </button>
        ) : (
          <button type="button" onClick={onNext} disabled={instantMode || (!allowNextWithoutAnswer && !currentAnswered)}
            className="inline-flex min-w-[132px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-400 px-5 py-2.5 text-sm font-black text-white shadow-[0_14px_30px_rgba(255,138,0,0.28)] transition hover:-translate-y-1 hover:shadow-[0_18px_38px_rgba(255,138,0,0.36)] disabled:cursor-not-allowed disabled:opacity-45">
            Próxima <ChevronRight size={18} />
          </button>
        )}
      </div>

      <button type="button" onClick={onFinish} disabled={submitting} className="mt-4 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 md:hidden">Finalizar simulado</button>
    </section>
  );
}

function QuestionSidePanel({
  questions,
  answers,
  currentIndex,
  onGoTo,
  answeredCount,
  totalQuestions,
  focusMode = false,
  onToggleFocusMode,
  notesOpen,
  onToggleNotes,
  notesContent,
  previousNotesText,
  noteNumber,
  questionNumber,
  notesSaving,
  notesFeedback,
  onNotesChange,
  onCloseNotes,
}: {
  questions: OrderedQuestion[];
  answers: AnswerMap;
  currentIndex: number;
  onGoTo: (index: number) => void;
  answeredCount: number;
  totalQuestions: number;
  focusMode?: boolean;
  onToggleFocusMode?: () => void;
  notesOpen: boolean;
  onToggleNotes: () => void;
  notesContent: string;
  previousNotesText: string;
  noteNumber: number | null;
  questionNumber: number;
  notesSaving: boolean;
  notesFeedback: string | null;
  onNotesChange: (value: string) => void;
  onCloseNotes: () => void;
}) {
  const remaining = Math.max(0, totalQuestions - answeredCount);

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-24 space-y-3">
        <div className="relative overflow-hidden rounded-[1.75rem] border border-slate-200/85 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(255,253,249,0.96))] p-4 shadow-[0_20px_58px_rgba(15,23,42,0.08),0_1px_0_rgba(255,255,255,0.9)_inset] backdrop-blur-xl">
        <div className="pointer-events-none absolute right-0 top-0 h-36 w-36 rounded-full bg-orange-100/40 blur-3xl" />
        <div className="relative flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-600">Mapa da prova</p>
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

        <div className="relative mt-4 max-h-[42vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-4 gap-2.5">
            {questions.map((question, index) => {
              const answered = Boolean(answers[question.simulado_question_id]?.alternativeId);
              const active = index === currentIndex;
              return <button key={question.simulado_question_id} type="button" onClick={() => onGoTo(index)}
                className={`h-11 rounded-xl border text-sm font-black transition duration-200 ${active ? "border-orange-500 bg-orange-50 text-orange-600 shadow-[0_0_18px_rgba(255,138,0,0.12)]" : answered ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "border-slate-200 bg-slate-50 text-slate-500 hover:-translate-y-0.5 hover:border-orange-200 hover:bg-orange-50"}`}
                title={answered ? `Questão ${index + 1} respondida` : `Questão ${index + 1} pendente`}>{index + 1}</button>;
            })}
          </div>
        </div>

        <div className="relative mt-4 rounded-[1.15rem] bg-gradient-to-br from-slate-50 to-white p-3 text-center text-xs leading-5 text-slate-500 ring-1 ring-slate-100">
          <Info size={16} className="mx-auto mb-1.5 text-orange-500" />
          Navegue pelas questões usando os números acima ou os botões abaixo.
          <div className="pointer-events-none absolute bottom-2 right-2 h-9 w-9 opacity-40 [background-image:radial-gradient(circle,rgba(255,138,0,0.6)_1px,transparent_1px)] [background-size:7px_7px]" />
        </div>
      </div>
      <LightSwitchControl focusMode={focusMode} onToggle={onToggleFocusMode} />
      <NotebookControl
        open={notesOpen}
        onToggle={onToggleNotes}
        content={notesContent}
        previousText={previousNotesText}
        noteNumber={noteNumber}
        questionNumber={questionNumber}
        saving={notesSaving}
        feedback={notesFeedback}
        onChange={onNotesChange}
        onClose={onCloseNotes}
      />
      </div>
    </aside>
  );
}

function LightSwitchControl({
  focusMode,
  onToggle,
}: {
  focusMode: boolean;
  onToggle?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`group relative w-full overflow-hidden rounded-[1.5rem] border p-4 text-left shadow-[0_18px_54px_rgba(15,23,42,0.09),0_1px_0_rgba(255,255,255,0.9)_inset] backdrop-blur-xl transition duration-500 hover:-translate-y-0.5 ${focusMode ? "border-amber-300/45 bg-[#07101D] text-amber-100 shadow-[0_0_50px_rgba(251,191,36,0.16)]" : "border-slate-200/90 bg-white/95 text-slate-950"}`}
      aria-pressed={focusMode}
    >
      <div className={`pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full blur-3xl transition duration-500 ${focusMode ? "bg-amber-300/35" : "bg-orange-100/50"}`} />
      <div className="relative flex items-center gap-4">
        <div className={`relative flex h-20 w-14 shrink-0 items-center justify-center rounded-[1.35rem] border shadow-inner transition duration-500 ${focusMode ? "border-amber-200/50 bg-amber-100/15 shadow-amber-100/10" : "border-slate-200 bg-slate-50 shadow-slate-200/60"}`}>
          <div className={`absolute inset-2 rounded-[1.15rem] transition duration-500 ${focusMode ? "bg-amber-200/20 shadow-[0_0_28px_rgba(251,191,36,0.45)]" : "bg-white"}`} />
          <div className={`pointer-events-none absolute h-10 w-10 rounded-full blur-xl transition duration-500 ${focusMode ? "translate-y-[-6px] bg-amber-300/55" : "translate-y-[-8px] bg-orange-300/35"}`} />
          <div className={`relative flex h-10 w-7 items-center justify-center rounded-full border transition duration-500 ${focusMode ? "translate-y-[-7px] border-amber-200 bg-amber-300 text-slate-950 shadow-[0_0_24px_rgba(251,191,36,0.75)]" : "translate-y-[-7px] border-orange-200 bg-white text-orange-500 shadow-[0_4px_12px_rgba(15,23,42,0.10)]"}`}>
            <Lightbulb size={18} fill={focusMode ? "currentColor" : "none"} />
          </div>
          <span className="absolute -right-3 top-6 rotate-[-18deg] text-2xl transition duration-500 group-hover:scale-110" aria-hidden="true">👆</span>
        </div>
        <div className="min-w-0">
          <p className={`text-[10px] font-black uppercase tracking-[0.22em] ${focusMode ? "text-amber-200" : "text-orange-600"}`}>Modo foco</p>
          <h3 className={`mt-1 text-base font-black tracking-tight ${focusMode ? "text-white" : "text-slate-950"}`}>
            {focusMode ? "Acender a luz" : "Apagar a luz"}
          </h3>
          <p className={`mt-1.5 text-xs font-semibold leading-5 ${focusMode ? "text-amber-100/65" : "text-slate-500"}`}>
            {focusMode ? "O interruptor fica aceso para você voltar ao modo normal quando quiser." : "Escurece as distrações e mantém sua concentração total na prova. Ideal para sua melhor performance."}
          </p>
        </div>
      </div>
    </button>
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
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBg[variant]}`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mt-1 text-xs leading-5">{description}</p>
      </div>
    </div>
  );
}

function RulesScreen({
  simulado,
  attemptInfo,
  onStart,
  onBack,
}: {
  simulado: InitialSimulado;
  attemptInfo: AttemptInfo;
  onStart: () => void;
  onBack: () => void;
}) {
  const totalAttempts = simulado.max_attempts;
  const remaining = attemptInfo.remaining;
  const isInstantMode = simulado.feedback_mode === "instant" || Boolean(simulado.instant_feedback_enabled);
  const attemptsExhausted = totalAttempts !== null && (remaining ?? 0) <= 0;

  return (
    <main className="min-h-screen bg-[#eef0f4] px-4 py-6 md:px-6">
      <section className="relative mx-auto max-w-4xl overflow-hidden rounded-[2rem] border border-black/10 bg-[#070a11] p-6 text-white shadow-2xl shadow-slate-950/20 md:p-10">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/70 to-transparent" />
        <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-orange-500/15 blur-3xl" />
        <div className="absolute -bottom-10 left-0 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl" />

        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-300">
            Antes de iniciar
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            {simulado.title}
          </h1>
          {simulado.description && (
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              {simulado.description}
            </p>
          )}

          {!attemptsExhausted && (
            <TopCoinValueInfo
              amount={getTopCoinMaxValue(simulado.question_count, attemptInfo.used + 1)}
              prefix="Essa tentativa vale"
              dark
              className="mt-6 flex w-full items-center gap-3 rounded-2xl border border-amber-400/30 bg-gradient-to-r from-amber-500/10 to-orange-500/10 p-4 text-left text-sm font-black text-amber-100 transition hover:border-amber-300/50 hover:bg-amber-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            />
          )}

          <div className="mt-8 grid gap-3 md:grid-cols-2">
            <RuleItem
              icon={<Timer size={20} />}
              title={
                simulado.time_limit_minutes
                  ? `Tempo de prova: ${simulado.time_limit_minutes} minutos`
                  : "Sem limite de tempo"
              }
              description={
                simulado.time_limit_minutes
                  ? "O contador inicia ao confirmar e a tentativa será finalizada automaticamente quando o tempo acabar."
                  : "Você pode levar o tempo que precisar para concluir o simulado."
              }
            />

            <RuleItem
              icon={<RotateCcw size={20} />}
              title={
                totalAttempts === null
                  ? "Tentativas ilimitadas"
                  : `${remaining ?? 0} de ${totalAttempts} tentativa(s) disponível(is)`
              }
              description={
                totalAttempts === null
                  ? "Você pode refazer o simulado quantas vezes quiser."
                  : "Cada tentativa iniciada é registrada. Mesmo que ela não seja concluída, ela é contabilizada dentro do limite de tentativas."
              }
            />

            <RuleItem
              icon={<ListChecks size={20} />}
              title={
                simulado.allow_blank_answers
                  ? "Pode finalizar com questões em branco"
                  : "Responda todas as questões antes de finalizar"
              }
              description={
                simulado.allow_blank_answers
                  ? "Questões em branco não pontuam, mas não impedem a finalização."
                  : "O simulado só pode ser finalizado após todas as questões terem sido respondidas."
              }
            />

            <RuleItem
              icon={<Calculator size={20} />}
              title={`Modelo de correção: ${simulado.scoring_model === "cebraspe" ? "CEBRASPE" : "Tradicional"}`}
              description={scoringDescription(simulado.scoring_model)}
            />

            <RuleItem
              icon={<MessageCircleQuestion size={20} />}
              title={
                isInstantMode
                  ? "Feedback instantâneo ativado"
                  : "Feedback ao final do simulado"
              }
              description={
                isInstantMode
                  ? "Você verá imediatamente se acertou ou errou cada questão e a resposta fica bloqueada após confirmar."
                  : "O gabarito completo será exibido após o envio do simulado."
              }
            />

            <RuleItem
              icon={<ShieldAlert size={20} />}
              title="Não saia da tela do simulado!"
              description="Trocar de guia ou minimizar é registrado imediatamente. Manter outra janela ou aplicativo em foco por mais de 10 segundos também gera uma ocorrência. Na terceira ocorrência, a tentativa é encerrada e contabilizada."
              variant="danger"
            />

            {simulado.show_answer_key_on_finish && (
              <RuleItem
                icon={<Trophy size={20} />}
                title="Gabarito liberado ao finalizar"
                description="Você poderá conferir todas as questões com suas respostas e o gabarito oficial."
                variant="success"
              />
            )}

            {simulado.correction_video_url && (
              <RuleItem
                icon={<PlayCircle size={20} />}
                title="Vídeo de correção disponível"
                description="Após finalizar, você terá acesso ao vídeo com a correção comentada pelo professor."
                variant="success"
              />
            )}
          </div>

          {attemptsExhausted && (
            <div className="mt-8 rounded-2xl border border-red-400/35 bg-red-500/10 p-4 text-sm font-semibold leading-6 text-red-100">
              Você atingiu o limite de tentativas para este simulado. Volte para a lista de simulados para consultar outras atividades disponíveis.
            </div>
          )}

          <div className="mt-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              <ChevronLeft size={18} /> Voltar
            </button>
            <button
              type="button"
              onClick={onStart}
              disabled={attemptsExhausted}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-4 text-base font-semibold text-slate-950 shadow-xl shadow-orange-500/30 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:from-slate-500 disabled:to-slate-400 disabled:text-white disabled:shadow-none disabled:hover:translate-y-0"
            >
              {attemptsExhausted ? "Limite de tentativas atingido" : `${OWL_MARK} Estou ciente e quero iniciar o simulado`}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

function FullScreenModal({
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
  const tone = variant === "danger" ? "error" : variant;
  const premiumAccent = variant === "warning" ? "from-orange-500 via-amber-400 to-yellow-300" : variant === "success" ? "from-emerald-500 via-green-400 to-teal-300" : "from-red-500 via-rose-500 to-orange-400";

  return (
    <PremiumModal
      open
      theme="light"
      tone={tone}
      icon={icon}
      title={title}
      message={description}
      onClose={onAction}
      dismissible={false}
      actions={
        <button
          type="button"
          onClick={onAction}
          className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r ${premiumAccent} px-5 py-3 text-sm font-black text-slate-950 shadow-xl shadow-orange-500/20 transition hover:-translate-y-0.5 hover:brightness-105`}
        >
          {actionLabel}
        </button>
      }
    >
      {children}
    </PremiumModal>
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
    <PremiumModal
      open
      theme="light"
      tone="warning"
      title="Finalizar simulado?"
      message={
        blockedByBlank
          ? `Você ainda tem ${unanswered} questão(ões) em branco. Este simulado exige todas as questões respondidas antes de finalizar.`
          : `${answeredCount} de ${total} questões respondidas.${unanswered > 0 ? ` Você ainda tem ${unanswered} em branco — elas não pontuarão.` : " Todas as questões foram respondidas."} Deseja realmente enviar?`
      }
      onClose={onCancel}
      actions={
        <>
          <PremiumButton variant="secondary" onClick={onCancel}>
            Continuar respondendo
          </PremiumButton>
          <PremiumButton onClick={onConfirm} disabled={blockedByBlank}>
            Sim, finalizar
          </PremiumButton>
        </>
      }
    />
  );
}
