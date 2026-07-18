"use client";
import PremiumDifficultyStars from "@/app/components/questions/PremiumDifficultyStars";
import QuestionCodePopupLink from "@/app/components/questions/QuestionCodePopupLink";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BarChart3,
  Check,
  CheckCircle2,
  Clock3,
  ChevronDown,
  CopyCheck,
  Eye,
  FileQuestion,
  Filter,
  ImageIcon,
  ListChecks,
  ListPlus,
  Pencil,
  Printer,
  Plus,
  Save,
  Search,
  Send,
  Settings2,
  Star,
  Target,
  Trophy,
  RotateCcw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import PremiumButton from "../../../components/ui/PremiumButton";
import PremiumInput from "../../../components/ui/PremiumInput";
import PremiumLoadingOverlay from "../../../components/ui/PremiumLoadingOverlay";
import PremiumModal from "../../../components/ui/PremiumModal";
import PremiumSelect from "../../../components/ui/PremiumSelect";
import SearchableSelect from "../../../components/ui/SearchableSelect";
import SimuladoCard from "../../components/SimuladoCard";
import SimuladoShell from "../../components/SimuladoShell";
import QuestionActionModal, { type QuestionActionModalState } from "../../../components/questions/QuestionActionModal";
import EvaluatedTopicsInput from "../../../components/questions/EvaluatedTopicsInput";
import { isQuestionImagePending } from "@/lib/questions/image-pending";
import { hasEvaluatedTopics, normalizeEvaluatedTopics } from "@/lib/questions/evaluated-topics";
import { adminFetch } from "@/app/lib/supabase/adminFetch";
import QuestionTemplatePicker, {
  getTemplateAlternatives,
  getTemplateDisciplineId,
  getTemplateSubjectIds,
  type TemplateQuestion,
} from "../../../components/questions/QuestionTemplatePicker";

const OWL_MARK = "\u{1F989}\uFE0F";

const DIFFICULTY_LEVEL_LABELS: Record<number, string> = {
  1: "Muito f\u00E1cil",
  2: "F\u00E1cil",
  3: "M\u00E9dia",
  4: "Dif\u00EDcil",
  5: "Muito dif\u00EDcil",
};

function normalizeSubjectDisplayName(value: string | null | undefined) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  const lowerWords = new Set(["a", "as", "o", "os", "e", "em", "no", "na", "nos", "nas", "de", "da", "das", "do", "dos", "para", "por", "com", "sem", "sob", "sobre", "entre"]);
  const acronyms = new Map([["ia", "IA"], ["ti", "TI"], ["api", "API"], ["html", "HTML"], ["css", "CSS"], ["pdf", "PDF"], ["usb", "USB"], ["tcp", "TCP"], ["ip", "IP"], ["dns", "DNS"], ["ssd", "SSD"], ["hd", "HD"], ["ram", "RAM"], ["rom", "ROM"], ["wifi", "Wi-Fi"], ["wi-fi", "Wi-Fi"], ["macos", "macOS"]]);
  return text.split(" ").map((token, index) => {
    const comparable = token.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (index > 0 && lowerWords.has(comparable)) return comparable;
    if (acronyms.has(comparable)) return acronyms.get(comparable) || token;
    return token.toLowerCase().split(/([\-\/])/).map((part) => {
      if (part === "-" || part === "/" || !part) return part;
      const partComparable = part.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      if (acronyms.has(partComparable)) return acronyms.get(partComparable) || part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    }).join("");
  }).join(" ");
}

function isTrueFalseWrongAlternative(questionType?: string | null, alternative?: { label?: string | null; text?: string | null; is_correct?: boolean | null }) {
  return questionType === "true_false" && Boolean(alternative?.is_correct) && (alternative?.label === "E" || String(alternative?.text || "").trim().toLowerCase() === "errado");
}

function alternativeCircleContent(questionType: string | null | undefined, alternative: { label?: string | null; text?: string | null; is_correct?: boolean | null }, fallback: string) {
  if (alternative.is_correct) return OWL_MARK;
  if (questionType === "true_false") return "";
  return alternative.label || fallback;
}

function richHtml(value?: string | null): string {
  return (value || "").replace(
    /<mark([^>]*)>/gi,
    '<mark data-highlight="true" class="bg-yellow-200 px-1 rounded">',
  );
}

import type { BankQuestion, Discipline, ExamBoard, Simulado, SimuladoPayload, SimuladoQuestion, Subject } from "../../types";
import { difficultyLabel, getDefaultOwlHelpLimit, resolveOwlHelpLimit, scoringLabel, stripHtml } from "../../utils";
import { normalizeBoardComparableName } from "@/lib/utils/text";
import { qCard } from "@/lib/ui/question-tokens";

type Feedback = { type: "success" | "error" | "warning"; title: string; message: string } | null;
type SimuladoOption = {
  id: string;
  title: string;
  status?: string | null;
  linked_questions_count?: number | null;
  question_count?: number | null;
};

function getQuestionAccuracyStats(question?: BankQuestion | null) {
  const total = Number(question?.total_answered_count || 0);
  const correct = Number(question?.correct_count || 0);
  const wrong = Number(question?.wrong_count || 0);

  if (total <= 0) {
    return { label: "Ainda nao respondida", fullLabel: "Ainda nao respondida em simulados" };
  }

  const rate = Math.round((correct / total) * 100);

  return {
    label: `${rate}% acerto`,
    fullLabel: `${correct} acerto(s), ${wrong} erro(s), ${total} resposta(s) em simulados`,
  };
}

function isTrueFalseBankQuestion(question?: BankQuestion | null) {
  if (!question) return false;
  if (question.question_type === "true_false") return true;

  const labels = (question.question_alternatives || [])
    .map((alt) => String(alt.label || stripHtml(alt.text || "")).trim().toLowerCase())
    .filter(Boolean);

  return labels.length === 2 && labels.some((label) => label === "c" || label === "certo") && labels.some((label) => label === "e" || label === "errado");
}

function getBankQuestionSubjects(question: BankQuestion) {
  const map = new Map<string, Subject & { disciplines?: Discipline | null }>();

  if (question.subjects?.id) {
    map.set(question.subjects.id, question.subjects);
  }

  (question.question_subjects || []).forEach((relation) => {
    const subject = relation.subjects;
    if (subject?.id) map.set(subject.id, subject);
  });

  return Array.from(map.values());
}

function getBankQuestionSubjectIds(question: BankQuestion) {
  return getBankQuestionSubjects(question).map((subject) => subject.id).filter(Boolean);
}

function getBankQuestionDisciplineIds(question: BankQuestion) {
  return Array.from(new Set(
    getBankQuestionSubjects(question)
      .map((subject) => subject.discipline_id || subject.disciplines?.id || "")
      .filter(Boolean),
  ));
}

function getBankQuestionSubjectSearchText(question: BankQuestion) {
  return getBankQuestionSubjects(question)
    .map((subject) => subject.name || "")
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function questionMatchesBankFilters(question: BankQuestion, opts: {
  term: string;
  disciplineId: string;
  subjectIds: string[];
  boardIds: string[];
  difficultyLevels: string[];
  yearFilters: string[];
  questionType: string;
  missingTopics?: boolean;
  excludedQuestionIds?: Set<string> | null;
}) {
  const text = stripHtml(question.statement || "").toLowerCase();
  const code = String(question.code || "").toLowerCase();
  const boardName = String(question.exam_boards?.name || "").toLowerCase();
  const subjectName = getBankQuestionSubjectSearchText(question);
  const questionDisciplineIds = getBankQuestionDisciplineIds(question);
  const questionSubjectIds = getBankQuestionSubjectIds(question);
  const questionBoardId = question.exam_boards?.id || "";
  const type = isTrueFalseBankQuestion(question) ? "true_false" : "multiple_choice";
  const status = question.status || "";

  return (
    ["published", "active"].includes(status) &&
    (!opts.term || text.includes(opts.term) || code.includes(opts.term) || boardName.includes(opts.term) || subjectName.includes(opts.term)) &&
    (!opts.disciplineId || questionDisciplineIds.includes(opts.disciplineId)) &&
    (opts.subjectIds.length === 0 || opts.subjectIds.some((id) => questionSubjectIds.includes(id))) &&
    (opts.boardIds.length === 0 || opts.boardIds.includes(questionBoardId)) &&
    (opts.difficultyLevels.length === 0 || opts.difficultyLevels.includes(String(question.difficulty_level || ""))) &&
    (opts.yearFilters.length === 0 || opts.yearFilters.includes(String(question.year || ""))) &&
    (!opts.questionType || type === opts.questionType) &&
    (!opts.missingTopics || !hasEvaluatedTopics(question.evaluated_topics)) &&
    (!opts.excludedQuestionIds || !opts.excludedQuestionIds.has(question.id))
  );
}

function normalizeConfigSnapshot(payload: SimuladoPayload) {
  return JSON.stringify({
    title: payload.title || "",
    description: payload.description || "",
    discipline_id: payload.discipline_id || "",
    status: payload.status || "draft",
    question_count: payload.question_count ?? null,
    time_limit_minutes: payload.time_limit_minutes ?? null,
    max_attempts: payload.max_attempts ?? null,
    show_result_on_finish: Boolean(payload.show_result_on_finish),
    show_answer_key_on_finish: Boolean(payload.show_answer_key_on_finish),
    instant_feedback_enabled: Boolean(payload.instant_feedback_enabled),
    feedback_mode: payload.feedback_mode || (payload.instant_feedback_enabled ? "instant" : "final_only"),
    show_teacher_comment: Boolean(payload.show_teacher_comment),
    correction_video_url: payload.correction_video_url || "",
    shuffle_questions: Boolean(payload.shuffle_questions),
    shuffle_alternatives: Boolean(payload.shuffle_alternatives),
    allow_blank_answers: Boolean(payload.allow_blank_answers),
    scoring_model: payload.scoring_model || "traditional",
    owl_help_enabled: Boolean(payload.owl_help_enabled),
    owl_help_limit: payload.owl_help_enabled ? payload.owl_help_limit ?? null : null,
  });
}

function normalizeQuestionSnapshot(items: SimuladoQuestion[]) {
  return JSON.stringify(items.map((item) => ({
    id: item.id,
    question_id: item.question_id,
    order_number: item.order_number,
    status: item.status,
  })));
}

function buildAutoDescription({
  disciplineName,
  questionCount,
  timeLimitMinutes,
  scoringModel,
  maxAttempts,
}: {
  disciplineName?: string;
  questionCount?: number | null;
  timeLimitMinutes?: number | null;
  scoringModel: "traditional" | "cebraspe";
  maxAttempts?: number | null;
}) {
  const subject = disciplineName ? `Simulado de ${disciplineName}` : "Simulado geral";
  const questions = questionCount ? `com ${questionCount} quest${questionCount > 1 ? "ões" : "ão"}` : "com meta de questões não definida";
  const duration = timeLimitMinutes ? `duração de ${timeLimitMinutes} minutos` : "sem limite de tempo";
  const model = scoringModel === "cebraspe" ? "modelo CEBRASPE" : "modelo tradicional";
  const attempts = maxAttempts
    ? `${maxAttempts} tentativa${maxAttempts > 1 ? "s" : ""} permitida${maxAttempts > 1 ? "s" : ""}`
    : "tentativas ilimitadas";

  return `${subject}, ${questions}, ${duration}, ${model}, ${attempts}.`;
}

type ManualAlternative = {
  label: string;
  text: string;
  is_correct: boolean;
};

const defaultAlternatives: ManualAlternative[] = ["A", "B", "C", "D"].map((label) => ({
  label,
  text: "",
  is_correct: label === "A",
}));

export default function EditarSimuladoClient({
  simulado,
  initialRelations,
  disciplines,
  subjects,
  boards,
  jornadas,
  retorno,
}: {
  simulado: Simulado;
  initialRelations: SimuladoQuestion[];
  disciplines: Discipline[];
  subjects: Subject[];
  boards: ExamBoard[];
  jornadas: { id: string; title: string }[];
  retorno?: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<SimuladoPayload>({
    title: simulado.title || "",
    description: simulado.description || "",
    discipline_id: simulado.discipline_id || "",
    status: simulado.status || "draft",
    question_count: simulado.question_count ?? null,
    time_limit_minutes: simulado.time_limit_minutes ?? null,
    max_attempts: simulado.max_attempts ?? null,
    show_result_on_finish: simulado.show_result_on_finish,
    show_answer_key_on_finish: simulado.show_answer_key_on_finish,
    instant_feedback_enabled: simulado.instant_feedback_enabled,
    feedback_mode: (simulado as any).feedback_mode || (simulado.instant_feedback_enabled ? "instant" : "final_only"),
    show_teacher_comment: simulado.show_teacher_comment,
    correction_video_url: simulado.correction_video_url || "",
    shuffle_questions: simulado.shuffle_questions,
    shuffle_alternatives: simulado.shuffle_alternatives,
    allow_blank_answers: simulado.allow_blank_answers,
    scoring_model: simulado.scoring_model,
    owl_help_enabled: Boolean(simulado.owl_help_enabled),
    owl_help_limit: simulado.owl_help_enabled
      ? resolveOwlHelpLimit(simulado.owl_help_limit, simulado.question_count)
      : null,
  });
  const [relations, setRelations] = useState(initialRelations || []);
  const [savedConfigSnapshot, setSavedConfigSnapshot] = useState(() => normalizeConfigSnapshot({
    title: simulado.title || "",
    description: simulado.description || "",
    discipline_id: simulado.discipline_id || "",
    status: simulado.status || "draft",
    question_count: simulado.question_count ?? null,
    time_limit_minutes: simulado.time_limit_minutes ?? null,
    max_attempts: simulado.max_attempts ?? null,
    show_result_on_finish: simulado.show_result_on_finish,
    show_answer_key_on_finish: simulado.show_answer_key_on_finish,
    instant_feedback_enabled: simulado.instant_feedback_enabled,
    feedback_mode: simulado.feedback_mode || (simulado.instant_feedback_enabled ? "instant" : "final_only"),
    show_teacher_comment: simulado.show_teacher_comment,
    correction_video_url: simulado.correction_video_url || "",
    shuffle_questions: simulado.shuffle_questions,
    shuffle_alternatives: simulado.shuffle_alternatives,
    allow_blank_answers: simulado.allow_blank_answers,
    scoring_model: simulado.scoring_model,
    owl_help_enabled: Boolean(simulado.owl_help_enabled),
    owl_help_limit: simulado.owl_help_limit ?? null,
  }));
  const [savedQuestionSnapshot, setSavedQuestionSnapshot] = useState(() => normalizeQuestionSnapshot(initialRelations || []));

  useEffect(() => {
    setRelations(initialRelations || []);
    setSavedQuestionSnapshot(normalizeQuestionSnapshot(initialRelations || []));
  }, [initialRelations]);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBankModal, setShowBankModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [bankQuestions, setBankQuestions] = useState<BankQuestion[]>([]);
  const [jornadaQuestionIds, setJornadaQuestionIds] = useState<Record<string, string[]>>({});
  const [bankQuestionsLoaded, setBankQuestionsLoaded] = useState(false);
  const [loadingBankQuestions, setLoadingBankQuestions] = useState(false);
  const [templateQuestionForManual, setTemplateQuestionForManual] = useState<TemplateQuestion | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [sendRelation, setSendRelation] = useState<SimuladoQuestion | null>(null);
  const [simuladoOptions, setSimuladoOptions] = useState<SimuladoOption[]>([]);
  const [selectedTargetSimuladoId, setSelectedTargetSimuladoId] = useState("");
  const [loadingSimulados, setLoadingSimulados] = useState(false);
  const [sendingToSimulado, setSendingToSimulado] = useState(false);
  const disciplineName = disciplines.find((item) => item.id === form.discipline_id)?.name;
  const autoDescription = useMemo(
    () =>
      buildAutoDescription({
        disciplineName,
        questionCount: form.question_count,
        timeLimitMinutes: form.time_limit_minutes,
        scoringModel: form.scoring_model,
        maxAttempts: form.max_attempts,
      }),
    [disciplineName, form.question_count, form.time_limit_minutes, form.scoring_model, form.max_attempts],
  );

  const currentConfigSnapshot = useMemo(() => normalizeConfigSnapshot({ ...form, description: autoDescription }), [form, autoDescription]);
  const configDirty = currentConfigSnapshot !== savedConfigSnapshot;
  const currentQuestionSnapshot = useMemo(() => normalizeQuestionSnapshot(relations), [relations]);
  const questionsDirty = currentQuestionSnapshot !== savedQuestionSnapshot;

  const [search, setSearch] = useState("");
  const [disciplineId, setDisciplineId] = useState("");
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [boardIds, setBoardIds] = useState<string[]>([]);
  const [difficultyLevels, setDifficultyLevels] = useState<string[]>([]);
  const [yearFilters, setYearFilters] = useState<string[]>([]);
  const [questionType, setQuestionType] = useState("");
  const [missingTopicsOnly, setMissingTopicsOnly] = useState(false);
  const [excludeJornadaId, setExcludeJornadaId] = useState("");

  async function loadBankQuestions() {
    if (bankQuestionsLoaded) return true;

    setLoadingBankQuestions(true);
    try {
      const response = await adminFetch("/api/admin/questions?context=simulado-editor");
      const result = await response.json() as {
        ok?: boolean;
        message?: string;
        questions?: BankQuestion[];
        jornadaQuestionIds?: Record<string, string[]>;
      };
      if (!response.ok || result.ok === false) {
        throw new Error(result.message || "Não foi possível carregar o banco de questões.");
      }

      setBankQuestions(result.questions || []);
      setJornadaQuestionIds(result.jornadaQuestionIds || {});
      setBankQuestionsLoaded(true);
      return true;
    } catch (error) {
      setFeedback({
        type: "error",
        title: "Não foi possível abrir o banco de questões",
        message: error instanceof Error ? error.message : "Tente novamente em instantes.",
      });
      return false;
    } finally {
      setLoadingBankQuestions(false);
    }
  }

  async function openBankModal() {
    if (await loadBankQuestions()) setShowBankModal(true);
  }

  async function openManualModal() {
    if (await loadBankQuestions()) setShowManualModal(true);
  }

  const excludedQuestionIds = useMemo(() => {
    if (!excludeJornadaId) return null;
    return new Set(jornadaQuestionIds[excludeJornadaId] || []);
  }, [excludeJornadaId, jornadaQuestionIds]);

  const filteredSubjects = useMemo(
    () => (disciplineId ? subjects.filter((subject) => subject.discipline_id === disciplineId) : subjects),
    [subjects, disciplineId],
  );

  const filteredQuestions = useMemo(() => {
    const term = search.toLowerCase().trim();
    return bankQuestions.filter((question) => questionMatchesBankFilters(question, {
      term,
      disciplineId,
      subjectIds,
      boardIds,
      difficultyLevels,
      yearFilters,
      questionType,
      missingTopics: missingTopicsOnly,
      excludedQuestionIds,
    }));
  }, [bankQuestions, search, disciplineId, subjectIds, boardIds, difficultyLevels, yearFilters, questionType, missingTopicsOnly, excludedQuestionIds]);

  const bankQuestionsForCounts = useMemo(() => {
    const term = search.toLowerCase().trim();
    return bankQuestions.filter((question) => questionMatchesBankFilters(question, {
      term,
      disciplineId,
      subjectIds: [],
      boardIds: [],
      difficultyLevels,
      yearFilters,
      questionType,
      missingTopics: missingTopicsOnly,
      excludedQuestionIds,
    }));
  }, [bankQuestions, search, disciplineId, difficultyLevels, yearFilters, questionType, missingTopicsOnly, excludedQuestionIds]);

  const subjectCounts = useMemo(() => {
    const counts = new Map<string, number>();
    bankQuestionsForCounts.forEach((question) => {
      getBankQuestionSubjectIds(question).forEach((id) => {
        counts.set(id, (counts.get(id) || 0) + 1);
      });
    });
    return counts;
  }, [bankQuestionsForCounts]);

  const currentSubjectDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    relations.forEach((relation) => {
      const question = relation.questions;
      if (!question) return;
      const subjects = getBankQuestionSubjects(question);
      const displaySubjects = subjects.length ? subjects : ([question.subjects].filter(Boolean) as (Subject & { disciplines?: Discipline | null })[]);
      displaySubjects.forEach((subjectItem) => {
        const subject = normalizeSubjectDisplayName(subjectItem?.name) || "Sem assunto";
        counts.set(subject, (counts.get(subject) || 0) + 1);
      });
    });

    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [relations]);

  const boardCounts = useMemo(() => {
    const term = search.toLowerCase().trim();
    const counts = new Map<string, number>();
    bankQuestions.filter((question) => questionMatchesBankFilters(question, {
      term,
      disciplineId,
      subjectIds,
      boardIds: [],
      difficultyLevels,
      yearFilters,
      questionType,
    })).forEach((question) => {
      const id = question.exam_boards?.id || "";
      if (!id) return;
      counts.set(id, (counts.get(id) || 0) + 1);
    });
    return counts;
  }, [bankQuestions, search, disciplineId, subjectIds, difficultyLevels, yearFilters, questionType]);

  const availableYears = useMemo(() => {
    const term = search.toLowerCase().trim();
    const years = new Set<string>();
    bankQuestions.filter((question) => questionMatchesBankFilters(question, {
      term,
      disciplineId,
      subjectIds,
      boardIds,
      difficultyLevels,
      yearFilters: [],
      questionType,
    })).forEach((question) => {
      if (question.year) years.add(String(question.year));
    });
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [bankQuestions, search, disciplineId, subjectIds, boardIds, difficultyLevels, questionType]);

  function update<K extends keyof SimuladoPayload>(key: K, value: SimuladoPayload[K]) {
    setForm((current) => {
      if (key === "feedback_mode") {
        const mode = value === "instant" ? "instant" : "final_only";
        return { ...current, feedback_mode: mode as any, instant_feedback_enabled: mode === "instant" };
      }
      return { ...current, [key]: value };
    });
  }

  function updateOwlHelpEnabled(enabled: boolean) {
    setForm((current) => ({
      ...current,
      owl_help_enabled: enabled,
      owl_help_limit: enabled
        ? resolveOwlHelpLimit(current.owl_help_limit, current.question_count)
        : null,
    }));
  }

  async function save() {
    setFeedback(null);

    if (!form.title.trim()) {
      setFeedback({ type: "error", title: "Nome obrigatório", message: "Informe o nome do simulado." });
      return;
    }

    if (form.question_count !== null && form.question_count !== undefined && (!Number.isInteger(form.question_count) || form.question_count <= 0)) {
      setFeedback({ type: "error", title: "Número de questões inválido", message: "Informe um número inteiro positivo maior que zero." });
      return;
    }

    if (form.owl_help_enabled && (!Number.isInteger(Number(form.owl_help_limit)) || Number(form.owl_help_limit) < 1)) {
      setFeedback({ type: "error", title: "Quantidade de ajudas inválida", message: "Informe um número inteiro maior que zero ou desabilite a Ajuda da Coruja." });
      return;
    }

    if (form.status === "published") {
      const missingTopics = relations.filter(
        (relation) => relation.status === "active" && !hasEvaluatedTopics(relation.questions?.evaluated_topics),
      );
      if (missingTopics.length > 0) {
        setFeedback({
          type: "error",
          title: "Tópicos obrigatórios",
          message: `Não é possível publicar: ${missingTopics.length} questão${missingTopics.length > 1 ? "ões" : ""} deste simulado ainda não ${missingTopics.length > 1 ? "possuem" : "possui"} tópicos avaliados. Edite ${missingTopics.length > 1 ? "essas questões" : "essa questão"} antes de publicar.`,
        });
        return;
      }

      if (form.question_count && relations.length !== form.question_count) {
        const diff = Math.abs(relations.length - form.question_count);
        const message = relations.length > form.question_count
          ? `Este simulado está com ${relations.length} questões, mas a configuração informa ${form.question_count}. Exclua ${diff} questão${diff > 1 ? "ões" : ""} para prosseguir.`
          : `Este simulado está com ${relations.length} questões, mas a configuração informa ${form.question_count}. Adicione mais ${diff} questão${diff > 1 ? "ões" : ""} ou ajuste o número configurado.`;
        setFeedback({
          type: "warning",
          title: "Quantidade de questões divergente",
          message,
        });
        return;
      }
    }

    setSaving(true);

    try {
      const response = await adminFetch(`/api/admin/simulados/${simulado.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, description: autoDescription }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Erro ao salvar simulado.");
      }

      setSavedConfigSnapshot(normalizeConfigSnapshot({ ...form, description: autoDescription }));
      setFeedback({ type: "success", title: "Configurações salvas", message: result.message || "Dados atualizados." });
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        title: "Nao foi possivel salvar",
        message: error instanceof Error ? error.message : "Erro ao salvar simulado.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function addSelected() {
    if (selectedIds.length === 0) {
      setFeedback({ type: "warning", title: "Selecione questões", message: "Selecione pelo menos uma questão." });
      return;
    }

    setSaving(true);

    try {
      const response = await adminFetch(`/api/admin/simulados/${simulado.id}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_ids: selectedIds }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Erro ao adicionar questões.");
      }

      const currentCount = relations.length;
      const newRelations = selectedIds
        .map((questionId, index) => {
          const question = bankQuestions.find((item) => item.id === questionId);
          if (!question) return null;
          return {
            id: `temp-${questionId}`,
            simulado_id: simulado.id,
            question_id: questionId,
            order_number: currentCount + index + 1,
            points: 1,
            status: "active" as const,
            questions: question,
          };
        })
        .filter(Boolean) as SimuladoQuestion[];

      setRelations((current) => [...current, ...newRelations]);
      setSelectedIds([]);
      setShowBankModal(false);
      setFeedback({ type: "success", title: "Questões adicionadas", message: result.message || "Questões vinculadas." });
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        title: "Nao foi possivel adicionar",
        message: error instanceof Error ? error.message : "Erro ao adicionar questões.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function openSendToSimuladoModal(relation: SimuladoQuestion) {
    if (!relation.question_id) {
      setFeedback({ type: "error", title: "Questao invalida", message: "Nao foi possivel identificar a questao selecionada." });
      return;
    }

    setSendRelation(relation);
    setSelectedTargetSimuladoId("");
    setLoadingSimulados(true);

    try {
      const response = await adminFetch("/api/admin/simulados");
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Erro ao carregar simulados.");
      }

      setSimuladoOptions((result.simulados || []).filter((item: SimuladoOption) => item.id !== simulado.id));
    } catch (error) {
      setFeedback({
        type: "error",
        title: "Nao foi possivel carregar",
        message: error instanceof Error ? error.message : "Erro ao carregar simulados.",
      });
      setSendRelation(null);
      setSimuladoOptions([]);
    } finally {
      setLoadingSimulados(false);
    }
  }

  async function sendQuestionToSimulado() {
    if (!sendRelation?.question_id) {
      setFeedback({ type: "error", title: "Questao invalida", message: "Nao foi possivel identificar a questao selecionada." });
      return;
    }

    if (!selectedTargetSimuladoId) {
      setFeedback({ type: "warning", title: "Selecione um simulado", message: "Escolha o simulado de destino." });
      return;
    }

    setSendingToSimulado(true);

    try {
      const response = await adminFetch(`/api/admin/simulados/${selectedTargetSimuladoId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_ids: [sendRelation.question_id] }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Nao foi possivel enviar a questao para o simulado.");
      }

      const target = simuladoOptions.find((item) => item.id === selectedTargetSimuladoId);
      setFeedback({
        type: "success",
        title: "Questao enviada",
        message: result.message || `Questao vinculada ao simulado ${target?.title || "selecionado"}.`,
      });
      setSendRelation(null);
      setSelectedTargetSimuladoId("");
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        title: "Nao foi possivel enviar",
        message: error instanceof Error ? error.message : "Erro ao enviar questao para outro simulado.",
      });
    } finally {
      setSendingToSimulado(false);
    }
  }

  async function removeRelation(relation: SimuladoQuestion) {
    const previous = relations;
    setRelations((current) =>
      current.filter((item) => item.id !== relation.id).map((item, index) => ({ ...item, order_number: index + 1 })),
    );

    if (relation.id.startsWith("temp-")) return;

    setSaving(true);
    try {
      const response = await adminFetch(`/api/admin/simulados/${simulado.id}/questions`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relation_id: relation.id }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Erro ao remover questão.");
      router.refresh();
    } catch (error) {
      setRelations(previous);
      setFeedback({
        type: "error",
        title: "Nao foi possivel remover",
        message: error instanceof Error ? error.message : "Erro ao remover questão.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function refreshRelationQuestion(questionId: string) {
    try {
      const response = await adminFetch(`/api/admin/questions/${questionId}`);
      const result = await response.json();
      if (!response.ok || !result.ok || !result.question) return;

      setRelations((current) =>
        current.map((relation) =>
          relation.question_id === questionId
            ? { ...relation, questions: { ...relation.questions, ...result.question } }
            : relation,
        ),
      );
    } catch {
      // Falha silenciosa: o card mantém os dados antigos até o próximo refresh manual.
    }
  }

  async function move(index: number, direction: "up" | "down") {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= relations.length) return;

    const reordered = [...relations];
    const [item] = reordered.splice(index, 1);
    reordered.splice(target, 0, item);
    const withOrder = reordered.map((relation, itemIndex) => ({ ...relation, order_number: itemIndex + 1 }));
    setRelations(withOrder);

    try {
      await adminFetch(`/api/admin/simulados/${simulado.id}/questions/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: withOrder.map(({ id, order_number }) => ({ id, order_number })) }),
      });
      router.refresh();
    } catch {
      setFeedback({ type: "error", title: "Ordem não sincronizada", message: "Atualize a página e tente novamente." });
    }
  }

  async function saveQuestions() {
    setSaving(true);
    try {
      const persistedRelations = relations.filter((relation) => !relation.id.startsWith("temp-"));
      if (persistedRelations.length > 0) {
        const response = await adminFetch(`/api/admin/simulados/${simulado.id}/questions/reorder`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: persistedRelations.map(({ id, order_number }) => ({ id, order_number })) }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.ok === false) throw new Error(result.message || "Erro ao salvar questões.");
      }
      setSavedQuestionSnapshot(normalizeQuestionSnapshot(relations));
      setFeedback({ type: "success", title: "Questões salvas", message: "A lista e a ordem das questões foram sincronizadas." });
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        title: "Não foi possível salvar as questões",
        message: error instanceof Error ? error.message : "Erro ao salvar questões.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#03070D] px-5 py-4 text-white sm:px-6 lg:px-8">
      <PremiumLoadingOverlay
        show={saving || loadingBankQuestions}
        title={loadingBankQuestions ? "Carregando banco de questões..." : "Salvando..."}
        message={loadingBankQuestions ? "Preparando filtros e questões publicadas." : "Sincronizando alterações do simulado."}
      />
      <PremiumModal
        open={Boolean(feedback)}
        tone={feedback?.type === "success" ? "success" : feedback?.type === "warning" ? "warning" : "error"}
        title={feedback?.title || ""}
        message={feedback?.message}
        onClose={() => setFeedback(null)}
      />

      {showBankModal && (
        <QuestionBankModal
          questions={filteredQuestions}
          allQuestions={bankQuestions}
          currentQuestions={relations.map((relation) => relation.questions).filter(Boolean) as BankQuestion[]}
          selectedIds={selectedIds}
          targetQuestionCount={form.question_count}
          onToggle={(id) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])}
          onClose={() => setShowBankModal(false)}
          onAdd={addSelected}
          disciplines={disciplines}
          subjects={filteredSubjects}
          boards={boards}
          search={search}
          setSearch={setSearch}
          disciplineId={disciplineId}
          setDisciplineId={(value) => {
            setDisciplineId(value);
            setSubjectIds([]);
          }}
          subjectIds={subjectIds}
          setSubjectIds={setSubjectIds}
          boardIds={boardIds}
          setBoardIds={setBoardIds}
          difficultyLevels={difficultyLevels}
          setDifficultyLevels={setDifficultyLevels}
          yearFilters={yearFilters}
          setYearFilters={setYearFilters}
          availableYears={availableYears}
          questionType={questionType}
          setQuestionType={setQuestionType}
          missingTopicsOnly={missingTopicsOnly}
          setMissingTopicsOnly={setMissingTopicsOnly}
          jornadas={jornadas}
          excludeJornadaId={excludeJornadaId}
          setExcludeJornadaId={setExcludeJornadaId}
          subjectCounts={subjectCounts}
          boardCounts={boardCounts}
          onUseAsTemplate={(question) => {
            setTemplateQuestionForManual(question as unknown as TemplateQuestion);
            setShowBankModal(false);
            setShowManualModal(true);
          }}
        />
      )}

      {showManualModal && (
        <ManualQuestionModal
          simuladoId={simulado.id}
          disciplines={disciplines}
          subjects={subjects}
          boards={boards}
          modelQuestions={bankQuestions as unknown as TemplateQuestion[]}
          initialTemplateQuestion={templateQuestionForManual}
          onClose={() => {
            setShowManualModal(false);
            setTemplateQuestionForManual(null);
          }}
          onCreated={(question) => {
            setRelations((current) => [
              ...current,
              {
                id: `temp-${question.id}`,
                simulado_id: simulado.id,
                question_id: question.id,
                order_number: current.length + 1,
                points: 1,
                status: "active",
                questions: question,
              },
            ]);
            setShowManualModal(false);
            setTemplateQuestionForManual(null);
            setFeedback({ type: "success", title: "Questão criada", message: "A questão foi salva no banco e vinculada ao simulado." });
            router.refresh();
          }}
        />
      )}

      {sendRelation && (
        <SendToSimuladoModal
          questionCode={sendRelation.questions?.code || "Sem codigo"}
          simulados={simuladoOptions}
          selectedSimuladoId={selectedTargetSimuladoId}
          loading={loadingSimulados}
          saving={sendingToSimulado}
          onSelect={setSelectedTargetSimuladoId}
          onCancel={() => {
            if (sendingToSimulado) return;
            setSendRelation(null);
            setSelectedTargetSimuladoId("");
          }}
          onConfirm={sendQuestionToSimulado}
        />
      )}

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(249,115,22,0.10),transparent_28%),radial-gradient(circle_at_82%_5%,rgba(37,99,235,0.16),transparent_34%),linear-gradient(180deg,#03070D_0%,#050B14_48%,#03070D_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.18)_1px,transparent_1px)] [background-size:72px_72px]" />
      <section className="relative mx-auto max-w-[1600px]">
        <header className="relative isolate mb-5 overflow-hidden rounded-[1.35rem] border border-white/[0.11] bg-[#07111F]/80 p-6 shadow-2xl shadow-black/35 sm:p-8">
          <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_12%_50%,rgba(249,115,22,0.24),transparent_34%),radial-gradient(circle_at_72%_28%,rgba(37,99,235,0.18),transparent_38%)]" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#05080D] via-[#061426]/88 to-[#05080D]/90" />
          <div className="absolute inset-y-0 left-0 -z-10 w-72 bg-[radial-gradient(circle_at_20%_50%,rgba(249,115,22,0.22),transparent_58%)]" />
          <div className="absolute bottom-0 left-0 h-px w-full bg-gradient-to-r from-orange-400/70 via-white/10 to-transparent" />
          <div className="relative space-y-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.28em] text-orange-400">Simulados</p>
                <h1 className="mt-1 max-w-5xl text-3xl font-black leading-tight tracking-tight text-white md:text-5xl">{form.title || "Editar simulado"}</h1>
                <p className="mt-3 max-w-4xl text-sm leading-relaxed text-white/72 md:text-base">Configure regras, organize questões e acompanhe o status administrativo deste simulado.</p>
              </div>

              <div className="flex flex-wrap justify-start gap-3 xl:justify-end">
                <Link href={retorno ? `/simulados/${simulado.id}?retorno=${encodeURIComponent(retorno)}` : `/simulados/${simulado.id}`}>
                  <PremiumButton variant="secondary" icon={<ArrowLeft size={18} />} className="border-white/[0.12] bg-white/[0.04] text-white/75 hover:bg-white/[0.08]">Voltar ao modo normal</PremiumButton>
                </Link>
                <Link href={`/simulados/${simulado.id}/preview`}>
                  <PremiumButton icon={<Eye size={18} />} className="px-6 py-3.5 shadow-orange-500/30">Preview</PremiumButton>
                </Link>
                {form.status !== "published" && (
                  <PremiumButton variant="secondary" icon={<ShieldCheck size={18} />} onClick={() => update("status", "published")} className="border-orange-400/30 bg-orange-500/10 text-orange-200 hover:bg-orange-500/15">Publicar</PremiumButton>
                )}
                {configDirty && (
                  <PremiumButton icon={<Save size={18} />} onClick={save}>Salvar</PremiumButton>
                )}
              </div>
            </div>

            <div className="mx-auto grid max-w-5xl gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <HeroMetric label="Questões" value={form.question_count ? String(form.question_count) : String(relations.length || "—")} icon={<FileQuestion size={16} />} />
              <HeroMetric label="Tempo" value={form.time_limit_minutes ? `${form.time_limit_minutes} min` : "Livre"} icon={<Clock3 size={16} />} />
              <HeroMetric label="Tentativas" value={form.max_attempts ? String(form.max_attempts) : "∞"} icon={<RotateCcw size={16} />} />
              <HeroMetric label="Status" value={form.status === "published" ? "Publicado" : form.status === "archived" ? "Arquivado" : "Rascunho"} icon={<ShieldCheck size={16} />} />
              <HeroMetric label="Pontuação" value={scoringLabel(form.scoring_model)} icon={<Trophy size={16} />} />
            </div>
          </div>
        </header>

        <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-7">
            <PremiumSection
              eyebrow="Bloco A"
              title="Identidade do Simulado"
              description="Nome, descrição automática, disciplina principal e status público."
              icon={<Settings2 size={18} />}
            >
              <div className="grid gap-5 dark-form">
                <PremiumInput label="Nome" value={form.title} onChange={(event: any) => update("title", event.target.value)} />
                <PremiumInput label="Descrição automática" textarea value={autoDescription} readOnly />
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  <PremiumSelect label="Disciplina" value={form.discipline_id || ""} onChange={(event: any) => update("discipline_id", event.target.value)}>
                    <option value="">Sem disciplina principal</option>
                    {disciplines.map((discipline) => <option key={discipline.id} value={discipline.id}>{discipline.name}</option>)}
                  </PremiumSelect>
                  <PremiumSelect label="Status" value={form.status} onChange={(event: any) => update("status", event.target.value)}>
                    <option value="draft">Rascunho</option>
                    <option value="published">Publicado</option>
                    <option value="archived">Arquivado</option>
                  </PremiumSelect>
                  <PremiumInput label="URL Vimeo" value={form.correction_video_url || ""} onChange={(event: any) => update("correction_video_url", event.target.value)} />
                </div>
              </div>
            </PremiumSection>

            <PremiumSection
              eyebrow="Bloco B"
              title="Regras do Simulado"
              description="Parâmetros estratégicos que definem duração, quantidade e pontuação."
              icon={<Target size={18} />}
            >
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4 dark-form">
                <StrategyField label="Tempo" hint="Duração máxima da tentativa">
                  <PremiumInput
                    label="Tempo (minutos)"
                    type="number"
                    min={1}
                    step={1}
                    icon={<Clock3 size={15} />}
                    value={form.time_limit_minutes ?? ""}
                    onChange={(event: any) => update("time_limit_minutes", event.target.value ? Number(event.target.value) : null)}
                    placeholder="Ex.: 90"
                  />
                </StrategyField>
                <StrategyField label="Tentativas" hint="Quantidade permitida por aluno">
                  <PremiumSelect label="Tentativas" value={form.max_attempts ?? ""} onChange={(event: any) => update("max_attempts", event.target.value ? Number(event.target.value) : null)}>
                    <option value="1">1 tentativa</option>
                    <option value="2">2 tentativas</option>
                    <option value="3">3 tentativas</option>
                    <option value="">Ilimitado</option>
                  </PremiumSelect>
                </StrategyField>
                <StrategyField label="Questões" hint="Meta oficial do simulado" accent>
                  <PremiumInput
                    label="Número de questões"
                    type="number"
                    min={1}
                    step={1}
                    icon={<Target size={15} />}
                    value={form.question_count ?? ""}
                    onChange={(event: any) => update("question_count", event.target.value ? Number(event.target.value) : null)}
                    placeholder="Ex.: 50"
                  />
                </StrategyField>
                <StrategyField label="Pontuação" hint="Modelo de correção">
                  <PremiumSelect label="Pontuação" value={form.scoring_model} onChange={(event: any) => update("scoring_model", event.target.value)}>
                    <option value="traditional">Tradicional</option>
                    <option value="cebraspe">CEBRASPE</option>
                  </PremiumSelect>
                </StrategyField>
              </div>
            </PremiumSection>

            <PremiumSection
              eyebrow="Bloco C"
              title="Comportamentos"
              description="Regras de experiência do aluno, feedback, embaralhamento e apoio da coruja."
              icon={<CopyCheck size={18} />}
            >
              <div className="grid gap-4 xl:grid-cols-2 dark-form">
                <Toggle label="Permitir questões em branco" value={form.allow_blank_answers} onChange={(value) => update("allow_blank_answers", value)} />
                <Toggle label="Exibir resultado ao finalizar" value={form.show_result_on_finish} onChange={(value) => update("show_result_on_finish", value)} />
                <Toggle label="Mostrar gabarito ao finalizar" value={form.show_answer_key_on_finish} onChange={(value) => update("show_answer_key_on_finish", value)} />
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <PremiumSelect
                    label="Modo de feedback"
                    value={form.feedback_mode || (form.instant_feedback_enabled ? "instant" : "final_only")}
                    onChange={(event: any) => update("feedback_mode", event.target.value)}
                  >
                    <option value="instant">Feedback imediato</option>
                    <option value="final_only">Navegação aberta / feedback ao final</option>
                  </PremiumSelect>
                </div>
                <Toggle label="Mostrar comentário do professor" value={form.show_teacher_comment} onChange={(value) => update("show_teacher_comment", value)} />
                <Toggle label="Ajuda da Coruja" value={Boolean(form.owl_help_enabled)} onChange={updateOwlHelpEnabled}>
                  {form.owl_help_enabled && (
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(150px,0.42fr)] sm:items-end">
                      <p className="text-xs font-semibold leading-5 text-slate-400">
                        Sugestão automática: {getDefaultOwlHelpLimit(form.question_count)} ajuda(s). O número informado será o limite deste simulado.
                      </p>
                    <PremiumInput
                      label="Quantidade de ajudas"
                      type="number"
                      min={1}
                      step={1}
                      value={form.owl_help_limit ?? ""}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) => update("owl_help_limit", event.target.value ? Number(event.target.value) : null)}
                      placeholder={String(getDefaultOwlHelpLimit(form.question_count))}
                      variant="jornada"
                      className="!h-10 !rounded-xl !border-orange-300/20 !bg-black/20 text-center !font-black"
                    />
                    </div>
                  )}
                </Toggle>
                <Toggle label="Embaralhar questões" value={form.shuffle_questions} onChange={(value) => update("shuffle_questions", value)} />
                <Toggle label="Embaralhar alternativas" value={form.shuffle_alternatives} onChange={(value) => update("shuffle_alternatives", value)} />
              </div>
              {configDirty && (
                <div className="mt-6 flex justify-end border-t border-white/10 pt-5">
                  <PremiumButton icon={<Save size={18} />} onClick={save}>Salvar configurações</PremiumButton>
                </div>
              )}
            </PremiumSection>

            <PremiumSection
              eyebrow="Gerenciamento"
              title="Questões do Simulado"
              description={`${relations.length} questão(ões) vinculada(s). As questões permanecem expandidas por padrão.`}
              icon={<FileQuestion size={18} />}
              action={
                <div className="flex flex-wrap gap-3">
                  <PremiumButton icon={<Plus size={16} />} onClick={() => void openBankModal()} disabled={loadingBankQuestions}>Selecionar questões</PremiumButton>
                  <PremiumButton variant="secondary" icon={<Pencil size={16} />} onClick={() => void openManualModal()} disabled={loadingBankQuestions} className="border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]">Criar questão</PremiumButton>
                </div>
              }
            >
              {relations.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-10 text-center text-sm text-slate-400">
                  Nenhuma questão adicionada.
                </div>
              ) : (
                <div className="grid gap-5">
                  {relations.map((relation, index) => (
                    <QuestionRelationCard
                      key={relation.id}
                      relation={relation}
                      index={index}
                      total={relations.length}
                      onMove={move}
                      onRemove={removeRelation}
                      onSend={openSendToSimuladoModal}
                      onQuestionSaved={refreshRelationQuestion}
                    />
                  ))}
                </div>
              )}
              {questionsDirty && (
                <div className="mt-5 flex justify-end border-t border-white/10 pt-5">
                  <PremiumButton icon={<Save size={18} />} onClick={saveQuestions}>Salvar questões</PremiumButton>
                </div>
              )}
            </PremiumSection>
          </div>

          <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
            <SidebarPanel
              eyebrow="Status do Simulado"
              title="Configuração ativa"
              description="Resumo rápido das regras atuais."
              icon={<ShieldCheck size={20} />}
            >
              <div className="space-y-2.5">
                <Summary label="Status" value={form.status === "published" ? "Publicado" : form.status === "archived" ? "Arquivado" : "Rascunho"} icon={<FileQuestion size={15} />} accent={form.status === "published"} />
                <Summary label="Publicação" value={form.status === "published" ? "Disponível" : "Não publicada"} icon={<CheckCircle2 size={15} />} accent={form.status === "published"} />
                <Summary label="Tentativas" value={form.max_attempts ? String(form.max_attempts) : "Ilimitado"} icon={<RotateCcw size={15} />} />
                <Summary label="Tempo" value={form.time_limit_minutes ? `${form.time_limit_minutes} min` : "Sem limite"} icon={<Clock3 size={15} />} />
                <Summary label="Questões" value={form.question_count ? String(form.question_count) : String(relations.length || "Não definido")} icon={<Target size={15} />} />
                <Summary label="Ajuda da Coruja" value={form.owl_help_enabled ? `${resolveOwlHelpLimit(form.owl_help_limit, form.question_count)} uso(s)` : "Desabilitada"} icon={<span className="text-sm">{OWL_MARK}</span>} accent={Boolean(form.owl_help_enabled)} />
              </div>
            </SidebarPanel>

            <SidebarPanel
              eyebrow="Performance e Analytics"
              title="Insights"
              description="Indicadores visuais preparados para acompanhar uso do simulado."
              icon={<Trophy size={20} />}
            >
              <div className="space-y-3">
                <InsightBar label="Execuções" value="—" width="28%" />
                <InsightBar label="Nota média" value="—" width="46%" />
                <Summary label="Jornadas" value="—" icon={<Trophy size={15} />} />
              </div>
            </SidebarPanel>

            <SidebarPanel
              eyebrow="Banco de Questões"
              title="Distribuição por assunto"
              description="Quantidade de questões vinculadas, agrupadas por assunto."
              icon={<BarChart3 size={20} />}
            >
              {currentSubjectDistribution.length ? (
                <div className="space-y-2">
                  {currentSubjectDistribution.map((item) => {
                    const itemPct = relations.length > 0 ? (item.count / relations.length) * 100 : 0;
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
            </SidebarPanel>

            <SidebarPanel
              eyebrow="Ações Rápidas"
              title="Operações"
              description="Atalhos administrativos do simulado."
              icon={<Settings2 size={20} />}
            >
              <div className="grid gap-2">
                <Link href={`/simulados/${simulado.id}/preview`}>
                  <PremiumButton full icon={<Eye size={18} />} className="shadow-orange-500/25">Preview como aluno</PremiumButton>
                </Link>
                <PremiumButton
                  full
                  href={`/simulados/${simulado.id}/print?popup=1&mode=slide&question=1`}
                  variant="dark"
                  icon={<Printer size={18} />}
                  className="!border-orange-400/35 !bg-orange-500/[0.10] !text-orange-100 shadow-[0_0_18px_rgba(255,138,0,0.10)] hover:!border-orange-300/55 hover:!bg-orange-500/[0.16] hover:!text-white hover:!shadow-[0_0_24px_rgba(255,138,0,0.16)]"
                >
                  Printar
                </PremiumButton>
                <PremiumButton
                  full
                  variant="danger"
                  icon={<Trash2 size={18} />}
                  className="!border-red-500/30 !bg-red-950/35 !text-red-300 shadow-[0_0_18px_rgba(239,68,68,0.08)] hover:!bg-red-900/35 hover:!shadow-[0_0_24px_rgba(239,68,68,0.14)]"
                >
                  Arquivar
                </PremiumButton>
              </div>
            </SidebarPanel>
          </aside>
        </div>
      </section>

      <style jsx global>{`
        .dark-form label { color: rgb(203 213 225) !important; }
        .dark-form input,
        .dark-form textarea,
        .dark-form select {
          border-color: rgba(255,255,255,0.10) !important;
          background: rgba(255,255,255,0.045) !important;
          color: rgb(248 250 252) !important;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
        }
        .dark-form input::placeholder,
        .dark-form textarea::placeholder { color: rgb(100 116 139) !important; }
        .dark-form input:focus,
        .dark-form textarea:focus,
        .dark-form select:focus {
          border-color: rgba(255,138,0,0.75) !important;
          box-shadow: 0 0 0 4px rgba(255,138,0,0.13) !important;
        }
        .dark-form option { background: #0B111C; color: #F8FAFC; }
      `}</style>
    </main>
  );
}

function PremiumSection({ eyebrow, title, description, icon, action, children }: {
  eyebrow: string;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-[1.7rem] border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.82),rgba(8,13,24,0.96))] p-5 shadow-xl shadow-black/20 ring-1 ring-white/[0.03] md:p-6">
      <div className="pointer-events-none absolute -right-20 -top-24 h-48 w-48 rounded-full bg-orange-500/10 blur-3xl" />
      <div className="relative mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {icon && (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-orange-400/20 bg-orange-500/10 text-orange-300 shadow-lg shadow-orange-500/10">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-orange-400">{eyebrow}</p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-slate-50">{title}</h2>
            {description && <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">{description}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="relative">{children}</div>
    </section>
  );
}

function HeroMetric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.045] px-3.5 py-3 shadow-sm transition hover:bg-white/[0.07]">
      <p className="flex min-w-0 items-center gap-2 text-[9px] font-black uppercase tracking-[0.11em] text-orange-400">
        <span className="shrink-0 text-orange-300">{icon}</span>
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-1.5 truncate text-sm font-black text-white">{value}</p>
    </div>
  );
}

function StrategyField({ label, hint, accent = false, children }: { label: string; hint: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <div className={`rounded-3xl border p-4 shadow-sm transition ${accent ? "border-orange-400/25 bg-orange-500/10 shadow-orange-500/10" : "border-white/10 bg-white/[0.035] hover:bg-white/[0.055]"}`}>
      <div className="mb-4">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-400">{label}</p>
        <p className="mt-1 text-xs font-medium text-slate-500">{hint}</p>
      </div>
      {children}
    </div>
  );
}

function SidebarPanel({ eyebrow, title, description, icon, children }: {
  eyebrow: string;
  title: string;
  description?: string;
  icon: React.ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[1.65rem] border border-white/10 bg-slate-950/90 shadow-2xl shadow-black/25 ring-1 ring-orange-400/10">
      <div className="relative overflow-hidden border-b border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-orange-950/45 p-4">
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-orange-400/18 blur-2xl" />
        <div className="relative flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-amber-300 text-slate-950 shadow-lg shadow-orange-500/25">
            {icon}
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-200">{eyebrow}</p>
            <h3 className="mt-1 text-base font-black text-white">{title}</h3>
            {description && <p className="mt-1 text-xs font-medium leading-5 text-slate-300">{description}</p>}
          </div>
        </div>
      </div>
      <div className="p-3.5">{children}</div>
    </section>
  );
}

function Toggle({ label, value, onChange, children }: { label: string; value: boolean; onChange: (value: boolean) => void; children?: React.ReactNode }) {
  const activeClass = value
    ? "border-orange-400/35 bg-orange-500/12 text-slate-50 shadow-lg shadow-orange-500/10"
    : "border-white/10 bg-white/[0.035] text-slate-300 hover:border-white/15 hover:bg-white/[0.06]";

  if (children) {
    return (
      <div className={`group overflow-hidden rounded-2xl border transition ${activeClass}`}>
        <button
          type="button"
          onClick={() => onChange(!value)}
          className="flex min-h-16 w-full items-center justify-between gap-4 px-4 py-3 text-left text-sm font-bold"
        >
          <span className="leading-5">{label}</span>
          <span className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition ${value ? "bg-orange-500 shadow-lg shadow-orange-500/25" : "bg-slate-700"}`}>
            <span className={`block h-5 w-5 rounded-full bg-white transition ${value ? "translate-x-5" : ""}`} />
          </span>
        </button>
        <div className="border-t border-orange-200/10 bg-black/10 px-4 py-3">{children}</div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`group flex min-h-16 items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-left text-sm font-bold transition ${activeClass}`}
    >
      <span className="leading-5">{label}</span>
      <span className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition ${value ? "bg-orange-500 shadow-lg shadow-orange-500/25" : "bg-slate-700"}`}>
        <span className={`block h-5 w-5 rounded-full bg-white transition ${value ? "translate-x-5" : ""}`} />
      </span>
    </button>
  );
}

function Summary({ label, value, icon, accent = false }: { label: string; value: string; icon?: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`group flex items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 shadow-sm transition ${accent ? "border-orange-300/40 bg-orange-400/15 shadow-orange-500/10" : "border-white/10 bg-white/[0.06] hover:bg-white/[0.09]"}`}>
      <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-300">
        <span className={`flex h-7 w-7 items-center justify-center rounded-xl ${accent ? "bg-orange-400 text-slate-950" : "bg-white/10 text-orange-200"}`}>{icon}</span>
        {label}
      </span>
      <span className={`text-right text-sm font-black ${accent ? "text-orange-200" : "text-white"}`}>{value}</span>
    </div>
  );
}

function InsightBar({ label, value, width }: { label: string; value: string; width: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</span>
        <span className="text-sm font-black text-white">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-300 shadow-[0_0_16px_rgba(255,138,0,0.32)]" style={{ width }} />
      </div>
    </div>
  );
}

function QuestionRelationCard({ relation, index, total, onMove, onRemove, onSend, onQuestionSaved }: {
  relation: SimuladoQuestion;
  index: number;
  total: number;
  onMove: (index: number, direction: "up" | "down") => void;
  onRemove: (relation: SimuladoQuestion) => void;
  onSend: (relation: SimuladoQuestion) => void;
  onQuestionSaved: (questionId: string) => void;
}) {
  const question = relation.questions;
  const alternatives = [...(question?.question_alternatives || [])].sort((a, b) => (a.order_number || 0) - (b.order_number || 0));
  const accuracyStats = getAccuracyStats(question || null);
  const topicsPending = !hasEvaluatedTopics(question?.evaluated_topics);

  return (
    <article className={`group relative overflow-hidden rounded-[1.6rem] border bg-[linear-gradient(135deg,rgba(248,250,252,0.98),rgba(241,245,249,0.94))] p-4 text-slate-900 shadow-xl transition hover:-translate-y-0.5 hover:shadow-2xl md:p-5 ${topicsPending ? "border-amber-300 shadow-amber-200/50 ring-2 ring-amber-200" : "border-white/10 shadow-black/20"}`}>
      <div className={`absolute left-0 top-0 h-full w-1 bg-gradient-to-b shadow-[0_0_24px_rgba(255,138,0,0.34)] ${topicsPending ? "from-amber-400 via-amber-500 to-amber-700" : "from-orange-400 via-amber-400 to-orange-700"}`} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_56px]">
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-bold text-white">#{relation.order_number}</span>
            {question?.id && (
              <QuestionCodePopupLink
                questionId={question.id}
                code={question?.code || "Sem código"}
                className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-black text-orange-700 transition hover:border-orange-300 hover:bg-orange-100"
                onSaved={onQuestionSaved}
              />
            )}
            <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700">{question?.exam_boards?.name || "Sem banca"}</span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
              {question?.subjects?.disciplines?.name || "Sem disciplina"} / {question?.subjects?.name || "Sem assunto"}
            </span>
            <PremiumDifficultyStars value={question?.difficulty_level} compact />
            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700" title={accuracyStats.fullLabel}>
              {accuracyStats.label}
            </span>
            {topicsPending && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                ⚠ Sem tópicos avaliados
              </span>
            )}
          </div>
          {!topicsPending && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {normalizeEvaluatedTopics(question?.evaluated_topics).map((topic) => (
                <span key={topic} className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                  {topic}
                </span>
              ))}
            </div>
          )}
          <div
            className="richtext-editor rounded-2xl border border-slate-200/80 bg-white/85 px-5 py-5 text-base leading-8 text-slate-800 shadow-sm"
            dangerouslySetInnerHTML={{ __html: richHtml(question?.statement) }}
          />
          {alternatives.length > 0 && (
            <div className="mt-4 grid gap-2">
              {alternatives.map((alt) => {
                const isWrongTrueFalse = isTrueFalseWrongAlternative(question?.question_type, alt);

                return (
                  <div key={alt.id} className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-sm transition ${isWrongTrueFalse ? "border-red-200 bg-red-50 text-red-900" : alt.is_correct ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white text-slate-600"}`}>
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${isWrongTrueFalse ? "bg-red-500 text-white" : alt.is_correct ? "bg-emerald-500 text-white" : "border border-slate-300 bg-white text-slate-600"}`}>
                      {alternativeCircleContent(question?.question_type, alt, alt.label || "")}
                    </span>
                    <span className="richtext-editor min-w-0 flex-1 leading-6" dangerouslySetInnerHTML={{ __html: richHtml(alt.text) }} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex gap-2 lg:flex-col lg:items-end">
          <button type="button" disabled={index === 0} onClick={() => onMove(index, "up")} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-200 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-40" title="Subir">
            <ArrowUp size={17} />
          </button>
          <button type="button" disabled={index === total - 1} onClick={() => onMove(index, "down")} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-200 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-40" title="Descer">
            <ArrowDown size={17} />
          </button>
          <button type="button" onClick={() => onSend(relation)} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-orange-200 bg-orange-50 text-orange-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-orange-100" title="Enviar para outro simulado">
            <Send size={17} />
          </button>
          <button type="button" onClick={() => onRemove(relation)} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-red-200 bg-red-50 text-red-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-red-100" title="Remover">
            <Trash2 size={17} />
          </button>
        </div>
      </div>
    </article>
  );
}

function getSimulationTitles(question: BankQuestion) {
  return (question.simulado_questions || [])
    .map((item) => item.simulados?.title)
    .filter((title): title is string => Boolean(title));
}

function getSimulationLinks(question: BankQuestion) {
  const seen = new Set<string>();

  return (question.simulado_questions || [])
    .map((item) => item.simulados)
    .filter((simulado): simulado is NonNullable<typeof simulado> => Boolean(simulado?.id))
    .filter((simulado) => {
      if (seen.has(simulado.id)) return false;
      seen.add(simulado.id);
      return true;
    });
}

function simulationStatusLabel(status?: string | null) {
  if (status === "published") return "Publicado";
  if (status === "draft") return "Rascunho";
  if (status === "archived") return "Arquivado";
  return "Status não definido";
}

function SimulationHistoryFooter({ simulations }: { simulations: ReturnType<typeof getSimulationLinks> }) {
  const visibleSimulations = simulations.slice(0, 4);
  const extraCount = Math.max(simulations.length - visibleSimulations.length, 0);

  return (
    <div className="border-t border-white/[0.06] bg-black/15 px-3 py-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-2 text-xs text-white/45">
          <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-xl border border-orange-300/20 bg-orange-500/[0.10] text-orange-200">
            <ListChecks size={13} />
          </span>
          <div>
            <p className="font-black uppercase tracking-[0.18em] text-white/35">Histórico em simulados</p>
            <p className="mt-1 text-[12px] leading-5 text-white/46">
              {simulations.length
                ? `Esta questão já fez parte de ${simulations.length} simulado${simulations.length > 1 ? "s" : ""}.`
                : "Esta questão ainda não fez parte de nenhum simulado."}
            </p>
          </div>
        </div>

        {simulations.length > 0 && (
          <div className="flex min-w-0 flex-1 flex-wrap gap-2 lg:justify-end">
            {visibleSimulations.map((simulado) => (
              <span
                key={simulado.id}
                title={`${simulado.title || "Simulado sem título"} · ${simulationStatusLabel(simulado.status)}`}
                className="max-w-full truncate rounded-full border border-white/[0.08] bg-white/[0.045] px-3 py-1.5 text-[11px] font-bold text-white/62 shadow-sm shadow-black/15 lg:max-w-[220px]"
              >
                {simulado.title || "Simulado sem título"}
                <span className="ml-2 text-white/32">· {simulationStatusLabel(simulado.status)}</span>
              </span>
            ))}
            {extraCount > 0 && (
              <span className="rounded-full border border-orange-300/20 bg-orange-500/[0.10] px-3 py-1.5 text-[11px] font-black text-orange-200">
                + {extraCount} outro(s)
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function getAccuracyStats(question?: BankQuestion | null) {
  if (question || question === null || question === undefined) return getQuestionAccuracyStats(question);
  return { label: "Ainda não utilizada", fullLabel: "Ainda não utilizada" };
}

function SimulationGhostBadge({ titles }: { titles: string[] }) {
  const uniqueTitles = Array.from(new Set(titles));

  return (
    <span className="group relative inline-flex items-center">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-orange-200 bg-orange-50 text-orange-700 shadow-sm" title={uniqueTitles.length ? uniqueTitles.join("\n") : "Ainda não participou de simulados"}>
        <Eye size={14} />
      </span>
      <span className="pointer-events-none absolute left-1/2 top-9 z-50 hidden w-72 -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-3 text-left text-xs font-semibold normal-case tracking-normal text-slate-700 shadow-2xl group-hover:block">
        <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-600">Simulados vinculados</span>
        {uniqueTitles.length ? (
          <span className="block space-y-1">
            {uniqueTitles.slice(0, 8).map((title) => (
              <span key={title} className="block rounded-xl bg-slate-50 px-3 py-2">{title}</span>
            ))}
            {uniqueTitles.length > 8 && <span className="block px-3 py-1 text-slate-400">+ {uniqueTitles.length - 8} outro(s)</span>}
          </span>
        ) : (
          <span className="block rounded-xl bg-slate-50 px-3 py-2 text-slate-500">Esta questão ainda não aparece em outros simulados.</span>
        )}
      </span>
    </span>
  );
}

function SendToSimuladoModal({
  questionCode,
  simulados,
  selectedSimuladoId,
  loading,
  saving,
  onSelect,
  onCancel,
  onConfirm,
}: {
  questionCode: string;
  simulados: SimuladoOption[];
  selectedSimuladoId: string;
  loading: boolean;
  saving: boolean;
  onSelect: (id: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm" onClick={onCancel}>
      <div className="relative w-full max-w-2xl overflow-hidden rounded-[2rem] border border-orange-400/25 bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950 p-7 text-white shadow-2xl shadow-orange-950/40" onClick={(event) => event.stopPropagation()}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-orange-600 via-amber-400 to-yellow-300" />
        <button type="button" onClick={onCancel} disabled={saving} className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50">
          <X size={18} />
        </button>

        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-orange-500 text-white shadow-xl shadow-orange-500/25">
          <Send size={24} />
        </div>
        <p className="mt-5 text-xs font-black uppercase tracking-[0.22em] text-orange-300">Enviar para outro simulado</p>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-white">Questao {questionCode}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          A questao continuara neste simulado e tambem sera vinculada ao simulado escolhido.
        </p>

        <div className="mt-6 max-h-[22rem] overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.03] p-2">
          {loading ? (
            <div className="flex items-center gap-3 px-3 py-5 text-sm font-semibold text-slate-300">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-orange-300 border-t-transparent" />
              Carregando simulados...
            </div>
          ) : simulados.length === 0 ? (
            <p className="px-3 py-5 text-sm font-semibold text-slate-500">Nenhum outro simulado disponivel.</p>
          ) : (
            <div className="grid gap-2">
              {simulados.map((item) => {
                const active = selectedSimuladoId === item.id;
                const count = item.linked_questions_count ?? item.question_count ?? 0;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelect(item.id)}
                    className={
                      active
                        ? "w-full rounded-2xl border border-orange-400/40 bg-orange-500/[0.12] p-4 text-left shadow-lg shadow-orange-950/20 transition"
                        : "w-full rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-orange-400/25 hover:bg-white/[0.07]"
                    }
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className={`truncate text-sm font-bold ${active ? "text-orange-50" : "text-slate-200"}`}>{item.title}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{count} questao(oes) vinculada(s)</p>
                      </div>
                      <span className={active ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-400 text-slate-950" : "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10"}>
                        {active && <CheckCircle2 size={13} strokeWidth={3} />}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <PremiumButton variant="secondary" onClick={onCancel} disabled={saving}>Cancelar</PremiumButton>
          <PremiumButton disabled={!selectedSimuladoId || saving || loading} icon={<ListPlus size={16} />} onClick={onConfirm}>
            {saving ? "Enviando..." : "Enviar questao"}
          </PremiumButton>
        </div>
      </div>
    </div>
  );
}

function DarkDropdownShell({
  label,
  summary,
  children,
}: {
  label: string;
  summary: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  return (
    <div ref={containerRef} className={`relative ${open ? "z-[10000]" : ""}`}>
      <p className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">{label}</p>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="group flex h-12 w-full items-center justify-between rounded-2xl border border-white/[0.08] bg-[#0D1926] px-4 text-left text-sm font-semibold text-white/80 outline-none transition hover:border-white/[0.15]"
      >
        <span className="truncate">{summary}</span>
        <ChevronDown size={16} className={`shrink-0 text-white/30 transition duration-200 group-hover:text-orange-400 ${open ? "rotate-180 text-orange-400" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-[10001] mt-2 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0D1B2E] shadow-2xl shadow-black/50 backdrop-blur-xl">
          {children}
        </div>
      )}
    </div>
  );
}

function DarkSingleDropdown({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const selected = options.find((item) => item.value === value)?.label || options[0]?.label || "Todos";
  return (
    <DarkDropdownShell label={label} summary={selected}>
      <div className="max-h-72 overflow-y-auto p-2">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value || "all"}
              type="button"
              onClick={() => onChange(option.value)}
              className={`flex w-full items-center justify-between rounded-xl border px-4 py-2.5 text-left text-sm font-semibold transition ${active ? "border-orange-500/30 bg-orange-500/[0.12] text-orange-100" : "border-transparent text-white/60 hover:border-white/[0.07] hover:bg-white/[0.04] hover:text-white/80"}`}
            >
              <span className="truncate">{option.label}</span>
              {active && <CheckCircle2 size={15} />}
            </button>
          );
        })}
      </div>
    </DarkDropdownShell>
  );
}

function DarkMultiDropdown({
  label,
  values,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  options: { value: string; label: string; node?: ReactNode; count?: number }[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const filtered = options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase().trim()));
  const selectedLabels = options.filter((option) => values.includes(option.value)).map((option) => option.label);
  const summary = selectedLabels.length === 0 ? placeholder : selectedLabels.length === 1 ? selectedLabels[0] : `${selectedLabels.length} selecionados`;

  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    function handleOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function toggle(value: string) {
    onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  return (
    <div ref={containerRef} className={`relative ${open ? "z-[10000]" : ""}`}>
      <p className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">{label}</p>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="group flex h-12 w-full items-center justify-between rounded-2xl border border-white/[0.08] bg-[#0D1926] px-4 text-left text-sm font-semibold text-white/80 outline-none transition hover:border-white/[0.15]"
      >
        <span className="truncate">{summary}</span>
        <ChevronDown size={16} className={`shrink-0 text-white/30 transition duration-200 group-hover:text-orange-400 ${open ? "rotate-180 text-orange-400" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-[10001] mt-2 rounded-2xl border border-white/[0.09] bg-[#0D1B2E] shadow-2xl shadow-black/50 backdrop-blur-xl">
          <div className="border-b border-white/[0.06] p-2">
            <div className="flex h-10 items-center gap-2 rounded-xl border border-white/[0.08] bg-black/30 px-3 text-white/70">
              <Search size={14} className="text-orange-300" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Digite para filtrar..."
                className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold text-white/80 outline-none placeholder:text-white/25"
              />
              {values.length > 0 && (
                <button type="button" onClick={() => { onChange([]); searchInputRef.current?.focus(); }} className="text-xs font-bold text-orange-300 hover:text-orange-200">
                  Limpar
                </button>
              )}
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-white/40">Nenhum item encontrado.</p>
            ) : filtered.map((option) => {
              const active = values.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggle(option.value)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-left text-sm font-semibold transition ${active ? "border-orange-500/30 bg-orange-500/[0.12] text-orange-100" : "border-transparent text-white/60 hover:border-white/[0.07] hover:bg-white/[0.04] hover:text-white/80"}`}
                >
                  <span className="min-w-0 truncate">{option.node ?? option.label}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    {typeof option.count === "number" && (
                      <span className="rounded-full border border-white/[0.08] bg-white/[0.05] px-2 py-0.5 text-[11px] text-white/55">{option.count}</span>
                    )}
                    <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${active ? "border-orange-300 bg-orange-400 text-black" : "border-white/15 bg-black/20"}`}>
                      {active && <CheckCircle2 size={13} />}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionBankModal(props: {
  questions: BankQuestion[];
  allQuestions: BankQuestion[];
  currentQuestions: BankQuestion[];
  selectedIds: string[];
  targetQuestionCount?: number | null;
  onToggle: (id: string) => void;
  onClose: () => void;
  onAdd: () => void;
  disciplines: Discipline[];
  subjects: Subject[];
  boards: ExamBoard[];
  search: string;
  setSearch: (value: string) => void;
  disciplineId: string;
  setDisciplineId: (value: string) => void;
  subjectIds: string[];
  setSubjectIds: (value: string[]) => void;
  boardIds: string[];
  setBoardIds: (value: string[]) => void;
  difficultyLevels: string[];
  setDifficultyLevels: (value: string[]) => void;
  yearFilters: string[];
  setYearFilters: (value: string[]) => void;
  availableYears: string[];
  questionType: string;
  setQuestionType: (value: string) => void;
  missingTopicsOnly: boolean;
  setMissingTopicsOnly: (value: boolean) => void;
  jornadas: { id: string; title: string }[];
  excludeJornadaId: string;
  setExcludeJornadaId: (value: string) => void;
  subjectCounts: Map<string, number>;
  boardCounts: Map<string, number>;
  onUseAsTemplate: (question: BankQuestion) => void;
}) {
  const [collapsedIds, setCollapsedIds] = useState<string[]>([]);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const selectedQuestions = useMemo(
    () => props.allQuestions.filter((question) => props.selectedIds.includes(question.id)),
    [props.allQuestions, props.selectedIds],
  );
  const selectedTotalQuestions = useMemo(
    () => [...props.currentQuestions, ...selectedQuestions],
    [props.currentQuestions, selectedQuestions],
  );
  const selectedTotal = selectedTotalQuestions.length;
  const target = props.targetQuestionCount || null;
  const missing = target ? Math.max(target - selectedTotal, 0) : null;
  const extra = target ? Math.max(selectedTotal - target, 0) : 0;
  const hasActiveFilters = Boolean(
    props.search.trim() ||
    props.disciplineId ||
    props.subjectIds.length ||
    props.boardIds.length ||
    props.difficultyLevels.length ||
    props.yearFilters.length ||
    props.questionType ||
    props.missingTopicsOnly ||
    props.excludeJornadaId
  );
  const subjectDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    selectedTotalQuestions.forEach((question) => {
      const subjects = getBankQuestionSubjects(question);
      const displaySubjects = subjects.length ? subjects : ([question.subjects].filter(Boolean) as (Subject & { disciplines?: Discipline | null })[]);
      displaySubjects.forEach((subjectItem) => {
        const subject = normalizeSubjectDisplayName(subjectItem?.name) || "Sem assunto";
        counts.set(subject, (counts.get(subject) || 0) + 1);
      });
    });

    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [selectedTotalQuestions]);

  function toggleExpanded(id: string) {
    setCollapsedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function clearFilters() {
    props.setSearch("");
    props.setDisciplineId("");
    props.setSubjectIds([]);
    props.setBoardIds([]);
    props.setDifficultyLevels([]);
    props.setYearFilters([]);
    props.setQuestionType("");
    props.setMissingTopicsOnly(false);
    props.setExcludeJornadaId("");
  }

  return (
    <div className="animate-fullscreen-in fixed inset-0 z-[9999] overflow-y-auto bg-[#03070D] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.20),transparent_32%),radial-gradient(circle_at_75%_10%,rgba(59,130,246,0.13),transparent_30%),linear-gradient(135deg,#03070D_0%,#07111F_42%,#02040A_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,.75)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.75)_1px,transparent_1px)] [background-size:42px_42px]" />
      <div className="relative min-h-full p-5 sm:p-6">
        <div className="mb-5 flex flex-col gap-4 rounded-[2rem] border border-white/[0.08] bg-white/[0.035] p-4 shadow-2xl shadow-black/40 backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-orange-400/25 bg-orange-500/15 text-orange-300 shadow-lg shadow-orange-950/30">
              <Filter size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-orange-300">Banco de Questões</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-white">Selecionar questões</h2>
              <p className="mt-1 max-w-3xl text-sm text-white/50">Use a mesma lógica do Banco de Questões para filtrar, revisar e selecionar as questões que entrarão neste simulado.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setFiltersCollapsed((current) => !current)}
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 text-sm font-bold text-white/75 transition hover:bg-white/[0.08]"
            >
              <Filter size={16} /> {filtersCollapsed ? "Mostrar filtros" : "Ocultar filtros"}
            </button>
            <button
              type="button"
              onClick={props.onClose}
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 text-sm font-bold text-white/75 transition hover:bg-white/[0.08]"
            >
              <X size={16} /> Fechar
            </button>
            <button
              type="button"
              onClick={props.onAdd}
              disabled={props.selectedIds.length === 0}
              className="inline-flex h-11 items-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 px-5 text-sm font-black text-black shadow-lg shadow-orange-950/40 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
            >
              <ListPlus size={16} /> Adicionar {props.selectedIds.length ? props.selectedIds.length : ""}
            </button>
          </div>
        </div>

        <SelecaoStatusBar
          selectedTotal={selectedTotal}
          target={target}
          missing={missing}
          extra={extra}
          distribution={subjectDistribution}
        />

        {filtersCollapsed ? (
          <div className="mb-3 flex items-center justify-between rounded-[1.5rem] border border-orange-400/15 bg-orange-500/[0.06] px-4 py-3 text-xs font-semibold text-orange-100 shadow-xl shadow-black/20">
            <span>Filtros recolhidos para economizar espaço. Clique em Mostrar filtros para reabrir.</span>
            <button type="button" onClick={() => setFiltersCollapsed(false)} className="rounded-xl border border-orange-300/20 bg-black/20 px-3 py-2 font-bold text-orange-200 hover:bg-orange-500/10">Mostrar filtros</button>
          </div>
        ) : (
        <div className="relative z-[200] mb-6 rounded-[1.75rem] border border-white/[0.07] bg-white/[0.03] p-5 shadow-xl shadow-black/20 backdrop-blur-sm md:p-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Buscar questão</p>
              <div className="group relative flex h-12 items-center gap-3 rounded-2xl border border-white/[0.08] bg-[#0D1926] px-4 text-white/70 outline-none transition hover:border-white/[0.15] focus-within:border-orange-400/40 focus-within:ring-2 focus-within:ring-orange-400/[0.08]">
                <Search size={15} className="text-white/30 transition duration-200 group-focus-within:text-orange-400" />
                <input
                  value={props.search}
                  onChange={(event) => props.setSearch(event.target.value)}
                  placeholder="Digite o código, nome ou enunciado..."
                  className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold text-white/80 outline-none placeholder:text-white/25"
                />
              </div>
            </div>
            <DarkSingleDropdown
              label="Disciplina"
              value={props.disciplineId}
              onChange={props.setDisciplineId}
              options={[{ value: "", label: "Todas" }, ...props.disciplines.map((item) => ({ value: item.id, label: item.name }))]}
            />
            <DarkMultiDropdown
              label="Assuntos"
              values={props.subjectIds}
              onChange={props.setSubjectIds}
              placeholder="Todos os assuntos"
              options={props.subjects.map((item) => ({ value: item.id, label: normalizeSubjectDisplayName(item.name), count: props.subjectCounts.get(item.id) || 0 }))}
            />
            <DarkMultiDropdown
              label="Banca"
              values={props.boardIds}
              onChange={props.setBoardIds}
              placeholder="Todas as bancas"
              options={props.boards.map((item) => ({ value: item.id, label: item.name, count: props.boardCounts.get(item.id) || 0 }))}
            />
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <DarkMultiDropdown
              label="Dificuldade"
              values={props.difficultyLevels}
              onChange={props.setDifficultyLevels}
              placeholder="Todas"
              options={[1, 2, 3, 4, 5].map((item) => ({
                value: String(item),
                label: `Nível ${item} - ${DIFFICULTY_LEVEL_LABELS[item]}`,
                node: (
                  <span className="flex items-center gap-2">
                    <span className="flex items-center gap-0.5">
                      {Array.from({ length: item }).map((_, index) => (
                        <Star key={index} size={13} className="fill-current text-amber-400" />
                      ))}
                    </span>
                    <span>{DIFFICULTY_LEVEL_LABELS[item]}</span>
                  </span>
                ),
              }))}
            />
            <DarkMultiDropdown
              label="Ano"
              values={props.yearFilters}
              onChange={props.setYearFilters}
              placeholder="Todos"
              options={props.availableYears.map((year) => ({ value: year, label: year }))}
            />
            <DarkSingleDropdown
              label="Tipo de questão"
              value={props.questionType}
              onChange={props.setQuestionType}
              options={[{ value: "", label: "Todos" }, { value: "true_false", label: "Assertiva / Certo e Errado" }, { value: "multiple_choice", label: "Alternativa / Múltipla escolha" }]}
            />
            <DarkSingleDropdown
              label="Excluir questões da Jornada"
              value={props.excludeJornadaId}
              onChange={props.setExcludeJornadaId}
              options={[{ value: "", label: "Nenhuma" }, ...props.jornadas.map((item) => ({ value: item.id, label: item.title }))]}
            />
            <div className="flex flex-col">
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Tópicos avaliados</label>
              <button
                type="button"
                onClick={() => props.setMissingTopicsOnly(!props.missingTopicsOnly)}
                className={props.missingTopicsOnly
                  ? "flex h-12 w-full items-center justify-between rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 text-left text-sm font-semibold text-amber-200 transition"
                  : "flex h-12 w-full items-center justify-between rounded-2xl border border-white/[0.08] bg-[#0D1926] px-4 text-left text-sm font-semibold text-white/60 transition hover:border-white/[0.15]"}
              >
                <span className="truncate">Sem tópicos avaliados</span>
                <span className={props.missingTopicsOnly ? "flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white" : "h-6 w-6 rounded-full border border-white/[0.15] bg-white/[0.05]"}>
                  {props.missingTopicsOnly && <Check size={14} strokeWidth={3} />}
                </span>
              </button>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={clearFilters}
                disabled={!hasActiveFilters}
                className="h-12 w-full rounded-2xl border border-white/[0.08] bg-[#0D1926] px-4 text-sm font-semibold text-white/80 outline-none transition hover:border-white/[0.15] disabled:cursor-not-allowed disabled:opacity-35"
              >
                Limpar filtros
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4 text-xs font-semibold text-white/45">
            <span>{props.questions.length} questão(ões) encontrada(s) para os filtros atuais.</span>
            <span>{props.selectedIds.length} selecionada(s) nesta busca · {props.currentQuestions.length} já vinculada(s)</span>
          </div>
        </div>
        )}

        <div className="relative z-0 pr-1">
          <div className="grid gap-4">
            {props.questions.length === 0 && (
              <div className="rounded-[2rem] border border-dashed border-white/[0.12] bg-white/[0.035] p-10 text-center shadow-xl shadow-black/25">
                <FileQuestion className="mx-auto mb-3 text-white/35" size={34} />
                <p className="font-semibold text-white">Nenhuma questão encontrada</p>
                <p className="mt-1 text-sm text-white/45">Ajuste os filtros para encontrar outras questões do banco.</p>
              </div>
            )}

            {props.questions.map((question, index) => {
              const selected = props.selectedIds.includes(question.id);
              const expanded = !collapsedIds.includes(question.id);
              const alternatives = [...(question.question_alternatives || [])].sort((a, b) => (a.order_number || 0) - (b.order_number || 0));
              const rawQuestion = question as any;
              const teacherComment = rawQuestion.explanation_text || rawQuestion.comment || rawQuestion.teacher_comment || rawQuestion.resolution || "";
              const simulationTitles = getSimulationTitles(question);
              const simulationLinks = getSimulationLinks(question);
              const accuracyStats = getAccuracyStats(question);
              const isTrueFalse = isTrueFalseBankQuestion(question);
              const linkedToCurrent = props.currentQuestions.some((item) => item.id === question.id);
              const topicsPending = !hasEvaluatedTopics(question.evaluated_topics);
              const selectedShell = selected
                ? "border-orange-400/45 bg-orange-500/[0.09] shadow-orange-950/35 ring-1 ring-orange-300/25"
                : linkedToCurrent
                  ? "border-emerald-400/30 bg-emerald-500/[0.06] shadow-emerald-950/20 ring-1 ring-emerald-300/10"
                  : isQuestionImagePending(question)
                    ? "border-blue-400/45 bg-blue-500/[0.08] shadow-blue-950/25 ring-1 ring-blue-300/20"
                    : topicsPending
                      ? "border-amber-400/45 bg-amber-500/[0.08] shadow-amber-950/25 ring-1 ring-amber-300/20"
                      : "border-white/[0.07] bg-white/[0.03] shadow-black/30 hover:border-white/[0.12] hover:bg-white/[0.045]";
              const questionSubjects = getBankQuestionSubjects(question);
              const disciplineName = questionSubjects[0]?.disciplines?.name || question.subjects?.disciplines?.name || "Sem disciplina";
              const subjectName = questionSubjects.length
                ? questionSubjects.map((subject) => normalizeSubjectDisplayName(subject.name)).join(" · ")
                : normalizeSubjectDisplayName(question.subjects?.name) || "Sem assunto";

              return (
                <div key={question.id} className="relative isolate">
                  <div className={`absolute -inset-[3px] -z-10 rounded-[2.15rem] bg-gradient-to-b ${isQuestionImagePending(question) ? "from-blue-400/[0.12]" : topicsPending ? "from-amber-400/[0.14]" : "from-orange-400/[0.08]"} via-white/[0.02] to-transparent blur-[14px]`} />
                  <article className={`overflow-hidden rounded-[1.5rem] border p-0 text-left shadow-xl backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 ${selectedShell}`}>
                    <div className="p-3">
                      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-950 shadow-sm">{question.code || "Sem código"}</span>
                            <span className="rounded-full border border-orange-400/25 bg-orange-500/[0.10] px-3 py-1 text-xs font-bold text-orange-200">{question.exam_boards?.name || "Sem banca"}</span>
                            {question.year && <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs font-bold text-white/60">Ano {question.year}</span>}
                            <span className="rounded-full border border-violet-500/25 bg-violet-500/[0.10] px-3 py-1 text-xs font-bold text-violet-300" style={{ textTransform: "none" }}>{subjectName}</span>
                            <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs font-bold text-white/55">{isTrueFalse ? "Assertiva" : "Alternativa"}</span>
                            <PremiumDifficultyStars value={question.difficulty_level} compact />
                            <SimulationGhostBadge titles={simulationTitles} />
                            <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/45" title={accuracyStats.fullLabel}>{accuracyStats.label}</span>
                            {isQuestionImagePending(question) && (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-300/25 bg-blue-400/10 px-3 py-1 text-xs font-semibold text-blue-200">
                                <ImageIcon size={12} />
                                Imagem ausente
                              </span>
                            )}
                            {topicsPending && (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-200">
                                ⚠ Sem tópicos avaliados
                              </span>
                            )}
                          </div>

                          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/35">
                            {disciplineName}
                          </p>

                          {!topicsPending && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {normalizeEvaluatedTopics(question.evaluated_topics).map((topic) => (
                                <span key={topic} className="rounded-full border border-emerald-400/25 bg-emerald-400/[0.10] px-2.5 py-0.5 text-[11px] font-bold text-emerald-200">
                                  {topic}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => { if (!linkedToCurrent) props.onToggle(question.id); }}
                            disabled={linkedToCurrent}
                            className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-bold transition ${linkedToCurrent ? "cursor-not-allowed border-emerald-300/25 bg-emerald-500/[0.08] text-emerald-200" : selected ? "border-orange-300 bg-orange-500 text-black shadow-lg shadow-orange-950/30" : "border-white/[0.08] bg-white/[0.04] text-white/70 hover:border-orange-400/35 hover:bg-orange-500/[0.10] hover:text-orange-200"}`}
                          >
                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${linkedToCurrent ? "border-emerald-300/25 bg-emerald-500/20 text-emerald-200" : selected ? "border-black/10 bg-black text-orange-300" : "border-white/15 bg-black/20"}`}>
                              {(selected || linkedToCurrent) && <CheckCircle2 size={14} />}
                            </span>
                            {linkedToCurrent ? "Já vinculada" : selected ? "Selecionada" : "Selecionar"}
                          </button>

                          <button
                            type="button"
                            onClick={() => props.onUseAsTemplate(question)}
                            className="inline-flex items-center gap-2 rounded-2xl border border-blue-300/20 bg-blue-500/[0.08] px-4 py-2 text-sm font-bold text-blue-100 transition hover:-translate-y-0.5 hover:border-blue-300/40 hover:bg-blue-500/[0.13]"
                          >
                            <CopyCheck size={16} /> Usar como modelo
                          </button>

                          <button
                            type="button"
                            onClick={() => toggleExpanded(question.id)}
                            aria-label={expanded ? "Encolher questão" : "Expandir questão"}
                            className="inline-flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-sm font-bold text-orange-200 transition hover:-translate-y-0.5 hover:border-orange-400/35 hover:bg-orange-500/[0.10]"
                          >
                            <span className={`flex h-7 w-7 items-center justify-center rounded-full bg-orange-500 text-black shadow-sm transition ${expanded ? "rotate-180" : ""}`}>
                              <ChevronDown size={16} strokeWidth={3} />
                            </span>
                            {expanded ? "Encolher" : "Expandir"}
                          </button>
                        </div>
                      </div>

                      <div
                        className="richtext-editor mt-3 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-3 text-xs leading-6 text-white/80"
                        dangerouslySetInnerHTML={{ __html: richHtml(question.statement || "Enunciado não informado.") }}
                      />
                    </div>

                    {expanded && (
                      <div className="px-3 pb-3">
                        {alternatives.length > 0 ? (
                          <div className={isTrueFalse ? "grid gap-2 md:grid-cols-2" : "grid gap-2"}>
                            {alternatives.map((alternative, altIndex) => {
                              const isWrongTrueFalse = isTrueFalseWrongAlternative(question.question_type, alternative);
                              const isMarkedCorrect = Boolean(alternative.is_correct);
                              const optionClass = isWrongTrueFalse
                                ? "border-red-400/35 bg-red-500/[0.10] text-red-100"
                                : isMarkedCorrect
                                  ? "border-emerald-400/35 bg-emerald-500/[0.10] text-emerald-100"
                                  : "border-white/[0.07] bg-white/[0.035] text-white/70";
                              const labelClass = isWrongTrueFalse
                                ? "border-red-400 bg-red-500 text-white"
                                : isMarkedCorrect
                                  ? "border-emerald-400 bg-emerald-500 text-white"
                                  : "border-white/15 bg-black/30 text-white/55";

                              return (
                                <div key={`${alternative.id || alternative.label || "tf"}-${altIndex}`} className={`rounded-xl border px-3 py-2 text-xs transition ${optionClass}`}>
                                  <div className="flex items-start gap-3">
                                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-black shadow-sm ${labelClass}`}>
                                      {alternativeCircleContent(question.question_type, alternative, alternative.label || String(altIndex + 1))}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <div
                                        className="prose prose-invert max-w-none text-xs leading-5 text-inherit"
                                        dangerouslySetInnerHTML={{ __html: richHtml(alternative.text) }}
                                      />
                                      {alternative.is_correct && (
                                        <p className={`mt-1 text-xs font-semibold uppercase tracking-[0.16em] ${isWrongTrueFalse ? "text-red-200" : "text-emerald-200"}`}>
                                          Gabarito
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3 text-sm font-semibold text-white/45">
                            Alternativas não carregadas para esta questão.
                          </p>
                        )}

                        {teacherComment && (
                          <details className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/[0.07]">
                            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-amber-200">
                              Ver comentário do professor
                            </summary>
                            <div className="richtext-editor border-t border-amber-400/10 px-4 py-3 text-sm leading-7 text-amber-50" dangerouslySetInnerHTML={{ __html: richHtml(teacherComment) }} />
                          </details>
                        )}
                      </div>
                    )}

                    <SimulationHistoryFooter simulations={simulationLinks} />
                  </article>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function SelecaoStatusBar({
  selectedTotal,
  target,
  missing,
  extra,
  distribution,
}: {
  selectedTotal: number;
  target: number | null;
  missing: number | null;
  extra: number;
  distribution: { name: string; count: number }[];
}) {
  const [open, setOpen] = useState(false);
  const isExact = target !== null && selectedTotal === target;
  const isOver = target !== null && extra > 0;
  const pct = target ? Math.min((selectedTotal / target) * 100, 100) : 0;

  const statusLabel = target === null
    ? "Sem meta definida"
    : isExact
      ? "Meta completa"
      : isOver
        ? `${extra} acima da meta`
        : `Faltam ${missing}`;

  const progressClass = isExact
    ? "from-emerald-500 via-green-400 to-lime-300"
    : isOver
      ? "from-red-500 via-orange-500 to-amber-300"
      : "from-orange-500 via-amber-400 to-yellow-300";

  return (
    <div className="mb-4 overflow-hidden rounded-[1.65rem] border border-slate-900/10 bg-[#070a11] text-white shadow-xl shadow-slate-950/15">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="relative flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.22),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(245,158,11,0.16),transparent_36%)]" />
        <div className="relative min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-orange-300/30 bg-orange-400/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-orange-200">
              <CheckCircle2 size={14} /> Seleção
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-slate-200">
              {selectedTotal} selecionada(s)
            </span>
            {target !== null && (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-slate-200">
                Meta {target}
              </span>
            )}
            <span className={`rounded-full border px-3 py-1 text-xs font-black ${isOver ? "border-red-300/40 bg-red-400/15 text-red-200" : isExact ? "border-emerald-300/40 bg-emerald-400/15 text-emerald-200" : "border-amber-300/40 bg-amber-400/15 text-amber-200"}`}>
              {statusLabel}
            </span>
          </div>
          {target !== null && (
            <div className="mt-3 h-2.5 overflow-hidden rounded-full border border-white/10 bg-white/10 shadow-inner">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${progressClass} shadow-[0_0_18px_rgba(251,191,36,0.45)] transition-all duration-500`}
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>

        <div className="relative flex shrink-0 items-center gap-2">
          {!open && distribution.length > 0 && (
            <div className="hidden max-w-[420px] flex-wrap justify-end gap-1.5 lg:flex">
              {distribution.slice(0, 3).map((item) => (
                <span key={item.name} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-slate-200">
                  {item.name} ({item.count})
                </span>
              ))}
            </div>
          )}
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-orange-200">
            <ChevronDown size={17} className={`transition-transform ${open ? "rotate-180" : ""}`} />
          </span>
        </div>
      </button>

      {open && (
        <div className="border-t border-white/10 bg-white/[0.03] px-3 pb-3 pt-3">
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-orange-200">Distribuição por assunto</p>
          {distribution.length ? (
            <div className="space-y-2">
              {distribution.map((item) => {
                const itemPct = selectedTotal > 0 ? (item.count / selectedTotal) * 100 : 0;
                return (
                  <div key={item.name} className="grid grid-cols-[140px_1fr_32px] items-center gap-3 text-xs">
                    <span className="truncate font-bold text-slate-200">{item.name}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-300" style={{ width: `${itemPct}%` }} />
                    </div>
                    <span className="text-right font-black text-orange-200">{item.count}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm font-semibold text-slate-400">Nenhuma questão selecionada ainda.</p>
          )}
        </div>
      )}
    </div>
  );
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
      <span className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-500">{label}</span>
      <span className="text-right text-xs font-bold text-slate-800">{value}</span>
    </div>
  );
}

function MetaSimulationLine({ titles }: { titles: string[] }) {
  const [open, setOpen] = useState(false);
  const uniqueTitles = Array.from(new Set(titles));
  const used = uniqueTitles.length > 0;

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
      <button
        type="button"
        disabled={!used}
        onClick={() => used && setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-500">Simulados</span>
        <span className="inline-flex items-center gap-1 text-right text-xs font-bold text-slate-800">
          {used ? `${uniqueTitles.length} uso(s)` : "Ainda não utilizada"}
          {used && <ChevronDown size={13} className={`text-orange-500 transition ${open ? "rotate-180" : ""}`} />}
        </span>
      </button>
      {open && used && (
        <div className="mt-2 space-y-1 border-t border-white pt-2">
          {uniqueTitles.map((title) => (
            <div key={title} className="rounded-lg bg-white px-2 py-1.5 text-[11px] font-semibold leading-4 text-slate-700 shadow-sm">
              {title}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ManualQuestionModal({ simuladoId, disciplines, subjects, boards, modelQuestions, initialTemplateQuestion, onClose, onCreated }: {
  simuladoId: string;
  disciplines: Discipline[];
  subjects: Subject[];
  boards: ExamBoard[];
  modelQuestions: TemplateQuestion[];
  initialTemplateQuestion?: TemplateQuestion | null;
  onClose: () => void;
  onCreated: (question: BankQuestion) => void;
}) {
  const [disciplineId, setDisciplineId] = useState(disciplines[0]?.id || "");
  const [subjectId, setSubjectId] = useState("");
  const [boardId, setBoardId] = useState(boards[0]?.id || "");
  const [statement, setStatement] = useState("");
  const [explanation, setExplanation] = useState("");
  const [year, setYear] = useState("2025");
  const [difficulty, setDifficulty] = useState("3");
  const [evaluatedTopics, setEvaluatedTopics] = useState<string[]>([]);
  const [alternatives, setAlternatives] = useState(defaultAlternatives);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [actionModal, setActionModal] = useState<QuestionActionModalState>(null);
  const [templateLoaded, setTemplateLoaded] = useState(false);
  const [templateAdjusted, setTemplateAdjusted] = useState(false);
  const availableSubjects = subjects.filter((subject) => subject.discipline_id === disciplineId);
  const estudoTopBoard = boards.find((board) => {
    const normalized = normalizeBoardComparableName(board.name);
    return normalized === "estudo top" || normalized === "estudotop" || normalized.includes("estudo top");
  }) || null;

  function markTemplateEdited() {
    if (!templateLoaded || templateAdjusted) return;
    if (!estudoTopBoard) {
      setTemplateAdjusted(true);
      setActionModal({
        open: true,
        tone: "warning",
        title: "Banca Estudo TOP não encontrada",
        message: "O modelo foi carregado, mas a banca Estudo TOP não está cadastrada. Ajuste a banca manualmente antes de salvar.",
        onClose: () => setActionModal(null),
      });
      return;
    }

    setBoardId(estudoTopBoard.id);
    setYear(String(new Date().getFullYear()));
    setTemplateAdjusted(true);
    setActionModal({
      open: true,
      tone: "success",
      title: "Modelo ajustado",
      message: "Banca alterada para Estudo TOP e ano atualizado automaticamente.",
      onClose: () => setActionModal(null),
    });
  }

  function loadTemplate(question: TemplateQuestion) {
    const templateAlternatives = getTemplateAlternatives(question);
    setDisciplineId(getTemplateDisciplineId(question) || disciplines[0]?.id || "");
    setSubjectId(getTemplateSubjectIds(question)[0] || "");
    setBoardId(question.exam_boards?.id || question.exam_board_id || boards[0]?.id || "");
    setStatement(question.statement || "");
    setExplanation(question.explanation_text || "");
    setEvaluatedTopics(normalizeEvaluatedTopics((question as TemplateQuestion & { evaluated_topics?: string[] | null }).evaluated_topics));
    setYear(question.year ? String(question.year) : String(new Date().getFullYear()));
    setDifficulty(String(question.difficulty_level || 3));
    setAlternatives(templateAlternatives.length ? templateAlternatives.map((item) => ({
      label: item.label,
      text: item.text,
      is_correct: item.is_correct,
    })) : defaultAlternatives);
    setTemplateLoaded(true);
    setTemplateAdjusted(false);
    setShowTemplatePicker(false);
  }

  useEffect(() => {
    if (!initialTemplateQuestion) return;
    loadTemplate(initialTemplateQuestion);
    setTimeout(() => markTemplateEdited(), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTemplateQuestion?.id]);

  async function create() {
    setError("");
    if (!subjectId || !boardId || !statement.trim()) {
      setError("Preencha disciplina, assunto, banca e enunciado.");
      return;
    }
    if (alternatives.some((alt) => !alt.text.trim()) || alternatives.filter((alt) => alt.is_correct).length !== 1) {
      setError("Preencha as alternativas e marque exatamente uma correta.");
      return;
    }
    const normalizedEvaluatedTopics = normalizeEvaluatedTopics(evaluatedTopics);
    if (normalizedEvaluatedTopics.length === 0) {
      setError("Informe pelo menos um topico avaliado.");
      return;
    }

    setSaving(true);
    try {
      const response = await adminFetch("/api/admin/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_type: "multiple_choice",
          subject_id: subjectId,
          subject_ids: [subjectId],
          exam_board_id: boardId,
          statement,
          explanation_text: explanation,
          year: Number(year),
          difficulty_level: Number(difficulty),
          status: "published",
          evaluated_topics: normalizedEvaluatedTopics,
          alternatives,
          source_origin: "simulado_admin",
          is_in_question_bank: true,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Erro ao criar questão.");

      const addResponse = await adminFetch(`/api/admin/simulados/${simuladoId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_ids: [result.questionId] }),
      });
      const addResult = await addResponse.json();
      if (!addResponse.ok || !addResult.ok) throw new Error(addResult.message || "Questão criada, mas não vinculada.");

      onCreated({
        id: result.questionId,
        code: result.questionCode,
        statement,
        explanation_text: explanation,
        status: "published",
        evaluated_topics: normalizedEvaluatedTopics,
        difficulty_level: Number(difficulty),
        year: Number(year),
        exam_boards: boards.find((board) => board.id === boardId) || null,
        subjects: {
          ...(availableSubjects.find((subject) => subject.id === subjectId) as Subject),
          disciplines: disciplines.find((discipline) => discipline.id === disciplineId) || null,
        },
        question_alternatives: alternatives.map((alt, index) => ({ id: `${result.questionId}-${alt.label}`, order_number: index + 1, ...alt })),
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Erro ao criar questão.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-backdrop-in fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm" onClick={onClose}>
      <QuestionActionModal modal={actionModal} />
      <QuestionTemplatePicker
        open={showTemplatePicker}
        questions={modelQuestions}
        disciplines={disciplines}
        subjects={subjects}
        boards={boards}
        onClose={() => setShowTemplatePicker(false)}
        onSelect={loadTemplate}
      />
      <div className="animate-modal-in max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <ModalHeader title="Criar questão manualmente" subtitle="A questão será salva no banco e vinculada ao simulado." onClose={onClose} icon={<Pencil size={22} />} />
        <div className="mb-4 flex flex-wrap gap-3">
          <PremiumButton variant="secondary" icon={<CopyCheck size={18} />} onClick={() => setShowTemplatePicker(true)}>
            Usar como modelo
          </PremiumButton>
          {templateLoaded && <span className="rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-bold text-orange-700">Criada a partir de modelo</span>}
          {templateAdjusted && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700">Banca alterada para Estudo TOP e ano atualizado automaticamente.</span>}
        </div>
        {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
        <div className="grid gap-4 md:grid-cols-4">
          <PremiumSelect label="Disciplina" value={disciplineId} onChange={(event: any) => { markTemplateEdited(); setDisciplineId(event.target.value); setSubjectId(""); }}>
            {disciplines.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </PremiumSelect>
          <SearchableSelect
            label="Assunto"
            value={subjectId}
            onChange={(v) => { markTemplateEdited(); setSubjectId(v); }}
            options={[{ value: "", label: "Selecione" }, ...availableSubjects.map((item) => ({ value: item.id, label: item.name }))]}
            placeholder="Selecione"
          />
          <SearchableSelect
            label="Banca"
            value={boardId}
            onChange={(v) => { markTemplateEdited(); setBoardId(v); }}
            options={boards.map((item) => ({ value: item.id, label: item.name }))}
            placeholder="Selecione"
          />
          <PremiumSelect label="Dificuldade" value={difficulty} onChange={(event: any) => { markTemplateEdited(); setDifficulty(event.target.value); }}>
            {[1, 2, 3, 4, 5].map((item) => <option key={item} value={item}>{"★".repeat(item)}{"☆".repeat(5 - item)}</option>)}
          </PremiumSelect>
        </div>
        <div className="mt-4 grid gap-4">
          <PremiumInput label="Ano" value={year} onChange={(event: any) => { markTemplateEdited(); setYear(event.target.value.replace(/\D/g, "").slice(0, 4)); }} />
          <PremiumInput label="Enunciado" textarea className="min-h-56" value={statement} onChange={(event: any) => { markTemplateEdited(); setStatement(event.target.value); }} />
          {alternatives.map((alt, index) => (
            <div key={alt.label} className={`grid gap-2 rounded-2xl border p-3 md:grid-cols-[80px_1fr_150px] ${alt.is_correct ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
              <div className={`flex items-center justify-center rounded-xl text-lg font-bold ${alt.is_correct ? "bg-emerald-500 text-white" : "bg-white text-slate-800"}`}>{alt.is_correct ? OWL_MARK : alt.label}</div>
              <PremiumInput value={alt.text} onChange={(event: any) => { markTemplateEdited(); setAlternatives((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item)); }} placeholder={`Alternativa ${alt.label}`} />
              <PremiumButton variant={alt.is_correct ? "primary" : "secondary"} onClick={() => { markTemplateEdited(); setAlternatives((current) => current.map((item, itemIndex) => ({ ...item, is_correct: itemIndex === index }))); }}>{alt.is_correct ? "Gabarito" : "Marcar"}</PremiumButton>
            </div>
          ))}
          <div className="rounded-2xl border border-blue-300 bg-blue-50/70 p-4 shadow-[0_0_0_3px_rgba(59,130,246,0.08)]">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">Tópicos avaliados</p>
            <EvaluatedTopicsInput
              value={evaluatedTopics}
              onChange={(topics) => { markTemplateEdited(); setEvaluatedTopics(topics); }}
              subjectId={subjectId || null}
              required
              variant="light"
              placeholder="Ex.: Memória RAM, Placa-mãe"
            />
          </div>
          <PremiumInput label="Comentário do professor" textarea value={explanation} onChange={(event: any) => { markTemplateEdited(); setExplanation(event.target.value); }} />
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <PremiumButton variant="secondary" onClick={onClose}>Cancelar</PremiumButton>
          <PremiumButton icon={<CheckCircle2 size={18} />} onClick={create} disabled={saving}>Salvar e vincular</PremiumButton>
        </div>
      </div>
    </div>
  );
}

function ModalHeader({ title, subtitle, onClose, icon }: { title: string; subtitle: string; onClose: () => void; icon: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-950 text-amber-300">{icon}</div>
        <div>
          <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
      </div>
      <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100">
        <X size={18} />
      </button>
    </div>
  );
}
