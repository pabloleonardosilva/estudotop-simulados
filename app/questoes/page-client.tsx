"use client";

import type { ChangeEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import {
  AlertTriangle,
  Calendar,
  ClipboardList,
  Clock,
  Check,
  CheckCircle2,
  Filter,
  CircleDot,
  ChevronDown,
  Copy,
  Eye,
  FileQuestion,
  Loader2,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  X,
  XCircle,
  PenLine,
  Sparkles,
  ClipboardPaste,
  CopyCheck,
  Star,
  Save,
  UsersRound,
  BadgeCheck,
  Ban,
  ListPlus,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import { useRouter } from "next/navigation";
import PageBackground from "../components/ui/PageBackground";
import PageHeader from "../components/ui/PageHeader";
import PremiumButton from "../components/ui/PremiumButton";
import SelectionGhostBar from "../components/ui/SelectionGhostBar";
import QuestionActionModal, { type QuestionActionModalState } from "../components/questions/QuestionActionModal";
import RichTextEditor from "../components/questions/RichTextEditor";
import SubjectMultiSelect from "../components/questions/SubjectMultiSelect";
import EvaluatedTopicsInput from "../components/questions/EvaluatedTopicsInput";
import PremiumCard from "../components/ui/PremiumCard";
import PremiumInput from "../components/ui/PremiumInput";
import PremiumSelect from "../components/ui/PremiumSelect";
import ExplanationAuthorCard from "../components/questions/ExplanationAuthorCard";
import {
  extractQuestionSubjects,
  getQuestionDisciplineIds,
} from "@/lib/questions/question-subjects";
import { hasEvaluatedTopics, normalizeEvaluatedTopics } from "@/lib/questions/evaluated-topics";
import { adminFetch } from "@/app/lib/supabase/adminFetch";

type Feedback = { type: "success" | "error" | "warning"; message: string } | null;
type PublicationQueueBulkEditFields = {
  exam_board_id?: string;
  subject_ids?: string[];
  year?: number;
  difficulty_level?: number;
};

type Confirm = { title: string; message: string; onConfirm: () => Promise<void> | void } | null;
type SimuladoOption = { id: string; title: string; status?: string | null; linked_questions_count?: number | null; question_count?: number | null };
type QuestionSimuladoRelation = {
  status?: string | null;
  order_number?: number | null;
  simulados?: SimuladoUsageSource | SimuladoUsageSource[] | null;
};
type SimuladoUsageSource = {
  id?: string | null;
  title?: string | null;
  status?: string | null;
};
type SimuladoUsage = {
  id: string;
  title: string;
  status: string;
  relationStatus: string;
  orderNumber?: number | null;
};

const OWL_MARK = "\u{1F989}\uFE0F";

function getStatusLabel(status: string) {
  if (status === "pending_review") return "Pendente revisão";
  if (status === "published") return "Publicada";
  if (status === READY_TO_PUBLISH_STATUS) return "Fila de publicação";
  if (status === "active") return "Ativa";
  if (status === "archived") return "Arquivada";
  if (status === "annulled") return "Anulada";
  return "Rascunho";
}

function getStatusClass(status: string) {
  if (status === "pending_review") return "border-amber-400/30 bg-amber-400/10 text-amber-400";
  if (status === "published" || status === "active") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
  if (status === READY_TO_PUBLISH_STATUS) return "border-sky-400/30 bg-sky-400/10 text-sky-400";
  if (status === "archived") return "border-white/[0.10] bg-white/[0.04] text-white/40";
  if (status === "annulled") return "border-red-500/40 bg-red-500/10 text-red-400";
  return "border-blue-400/30 bg-blue-400/10 text-blue-400";
}

function isTrueFalseQuestion(question: any) {
  const type = String(question?.question_type || "").toLowerCase();
  if (type === "true_false") return true;
  const alternatives = Array.isArray(question?.question_alternatives) ? question.question_alternatives : [];
  if (alternatives.length !== 2) return false;
  const labels = alternatives.map((alt: any) => String(alt?.label || alt?.text || "").trim().toLowerCase());
  return labels.some((value: string) => ["c", "certo", "cerTO".toLowerCase()].includes(value)) &&
    labels.some((value: string) => ["e", "errado"].includes(value));
}

function getTrueFalseAnswerLabel(question: any) {
  const alternatives = Array.isArray(question?.question_alternatives) ? question.question_alternatives : [];
  const correct = alternatives.find((alt: any) => Boolean(alt?.is_correct));
  if (!correct) return "Gabarito não definido";
  const raw = String(correct.label || correct.text || "").trim().toLowerCase();
  return raw === "e" || raw.includes("errado") ? "Errado" : "Certo";
}


const READY_TO_PUBLISH_STATUS = "ready_to_publish";
function notifyPublicationQueueUpdated() {
  window.dispatchEvent(new Event("estudotop:publication-queue-updated"));
}

const QUESTIONS_PER_PAGE = 40;

const difficultyOptions = [
  { value: "1", label: "Muito facil" },
  { value: "2", label: "Facil" },
  { value: "3", label: "Media" },
  { value: "4", label: "Dificil" },
  { value: "5", label: "Muito dificil" },
];

type InitialFilters = {
  search: string;
  disciplineId: string;
  subjectIds: string[];
  boardIds: string[];
  inspirationBoardIds: string[];
  orgaos: string[];
  difficultyLevels: string[];
  status: string;
  yearFilters: string[];
  missingTopics?: boolean;
};

type MatchFilterOptions = {
  term?: string;
  disciplineId?: string;
  subjectIds?: string[];
  boardIds?: string[];
  inspirationBoardIds?: string[];
  orgaos?: string[];
  difficultyLevels?: string[];
  status?: string;
  yearFilters?: string[];
  missingTopics?: boolean;
};

function stripHtml(html: string) {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function questionMatchesFilters(question: any, opts: MatchFilterOptions): boolean {
  const {
    term = "",
    disciplineId: fDiscipline = "",
    subjectIds: fSubjects = [],
    boardIds: fBoards = [],
    inspirationBoardIds: fInspirationBoards = [],
    orgaos: fOrgaos = [],
    difficultyLevels: fDifficulty = [],
    status: fStatus = "",
    yearFilters: fYears = [],
    missingTopics: fMissingTopics = false,
  } = opts;

  const qDisciplineIds = getQuestionDisciplineIds(question);
  const qSubjectIds = extractQuestionSubjects(question).map((s: any) => s.id).filter(Boolean);
  const qBoardId = question.exam_boards?.id || "";
  const qInspirationBoardId = question.inspiration_board?.id || question.inspiration_board_id || "";
  const qStatus = question.status || "draft";
  if (!fStatus && (qStatus === "pending_review" || qStatus === "ready_to_publish")) return false;
  const questionCode =
    question.code ||
    question.question_code ||
    question.public_code ||
    `Q${String(question.id || "").slice(0, 8).toUpperCase()}`;
  const alternativeTexts = (question.question_alternatives || []).map((alt: any) => stripHtml(alt?.text || ""));
  const searchable = [questionCode, question.title, question.name, question.orgao, stripHtml(question.statement || ""), ...alternativeTexts]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    (!term || searchable.includes(term)) &&
    (!fDiscipline || qDisciplineIds.includes(fDiscipline)) &&
    (fSubjects.length === 0 || fSubjects.some((id) => qSubjectIds.includes(id))) &&
    (fBoards.length === 0 || fBoards.includes(qBoardId)) &&
    (fInspirationBoards.length === 0 || fInspirationBoards.includes(qInspirationBoardId)) &&
    (fOrgaos.length === 0 || fOrgaos.includes((question.orgao || "").trim())) &&
    (fDifficulty.length === 0 || fDifficulty.includes(String(question.difficulty_level || ""))) &&
    (!fStatus || qStatus === fStatus || (fStatus === "published" && ["published", "active"].includes(qStatus))) &&
    (fYears.length === 0 || fYears.includes(String(question.year || ""))) &&
    (!fMissingTopics || !hasEvaluatedTopics(question.evaluated_topics))
  );
}

export default function QuestoesClient({
  initialQuestions,
  disciplines,
  subjects,
  boards,
  initialFilters,
  initialStatusCounts,
}: {
  initialQuestions: any[];
  disciplines: any[];
  subjects: any[];
  boards: any[];
  initialFilters?: InitialFilters;
  initialStatusCounts?: Record<string, number>;
}) {
  const router = useRouter();
  const [questions, setQuestions] = useState<any[]>(initialQuestions);

  useEffect(() => {
    setQuestions(initialQuestions);
  }, [initialQuestions]);

  useEffect(() => {
    setStatus(initialFilters?.status ?? "");
  }, [initialFilters?.status]);

  const [search, setSearch] = useState(initialFilters?.search ?? "");
  const [disciplineId, setDisciplineId] = useState(initialFilters?.disciplineId ?? "");
  const [subjectIds, setSubjectIds] = useState<string[]>(initialFilters?.subjectIds ?? []);
  const [boardIds, setBoardIds] = useState<string[]>(initialFilters?.boardIds ?? []);
  const [inspirationBoardIds, setInspirationBoardIds] = useState<string[]>(initialFilters?.inspirationBoardIds ?? []);
  const [orgaoFilters, setOrgaoFilters] = useState<string[]>(initialFilters?.orgaos ?? []);
  const [difficultyLevels, setDifficultyLevels] = useState<string[]>(initialFilters?.difficultyLevels ?? []);
  const [showDifficultyDropdown, setShowDifficultyDropdown] = useState(false);
  const [status, setStatus] = useState(initialFilters?.status ?? "");
  const [yearFilters, setYearFilters] = useState<string[]>(initialFilters?.yearFilters ?? []);
  const [missingTopicsFilter, setMissingTopicsFilter] = useState(Boolean(initialFilters?.missingTopics));
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [publicationQueueIds, setPublicationQueueIds] = useState<string[]>([]);
  const [answerEditQuestionId, setAnswerEditQuestionId] = useState<string | null>(null);
  const [answerDraft, setAnswerDraft] = useState<Record<string, string>>({});
  const [savingAnswerId, setSavingAnswerId] = useState<string | null>(null);
  const [savingDifficultyId, setSavingDifficultyId] = useState<string | null>(null);
  const [detectingTopicsId, setDetectingTopicsId] = useState<string | null>(null);
  const [bulkStatus, setBulkStatus] = useState<"draft" | "pending_review" | "published" | "ready_to_publish">("pending_review");
  const [bulkEditType, setBulkEditType] = useState<"status" | "subject" | "board">("status");
  const [bulkSubjectIds, setBulkSubjectIds] = useState<string[]>([]);
  const [bulkBoardId, setBulkBoardId] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [useAsTemplateQuestion, setUseAsTemplateQuestion] = useState<any | null>(null);
  const [showNewQuestionModal, setShowNewQuestionModal] = useState(false);
  const [showBulkStatusModal, setShowBulkStatusModal] = useState(false);
  const [showPublicationQueueBulkEditModal, setShowPublicationQueueBulkEditModal] = useState(false);
  const [showAddToSimuladoModal, setShowAddToSimuladoModal] = useState(false);
  const [simuladoOptions, setSimuladoOptions] = useState<SimuladoOption[]>([]);
  const [selectedSimuladoId, setSelectedSimuladoId] = useState("");
  const [loadingSimulados, setLoadingSimulados] = useState(false);
  const [addingQuestionsToSimulado, setAddingQuestionsToSimulado] = useState(false);
  const [viewMode, setViewMode] = useState<"multiple" | "single">("multiple");
  const [singleIndex, setSingleIndex] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [inlineEditingIds, setInlineEditingIds] = useState<string[]>([]);
  const [saveAllTrigger, setSaveAllTrigger] = useState(0);
  const [actionModal, setActionModal] = useState<QuestionActionModalState>(null);
  const [classifyPhase, setClassifyPhase] = useState<"idle" | "running" | "done" | "error">("idle");
  const [classifyResult, setClassifyResult] = useState<{ total: number; classified: number; errors: number } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (disciplineId) params.set("disciplina", disciplineId);
    if (subjectIds.length > 0) subjectIds.forEach((id) => params.append("assunto", id));
    if (boardIds.length > 0) boardIds.forEach((id) => params.append("banca", id));
    if (inspirationBoardIds.length > 0) inspirationBoardIds.forEach((id) => params.append("inspirada", id));
    if (orgaoFilters.length > 0) orgaoFilters.forEach((orgao) => params.append("orgao", orgao));
    if (difficultyLevels.length > 0) difficultyLevels.forEach((l) => params.append("dificuldade", l));
    if (status) params.set("status", status);
    if (yearFilters.length > 0) yearFilters.forEach((y) => params.append("ano", y));
    if (missingTopicsFilter) params.set("topicos", "sem");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [search, disciplineId, subjectIds, boardIds, inspirationBoardIds, orgaoFilters, difficultyLevels, status, yearFilters, missingTopicsFilter]);

  useEffect(() => {
    if (!showDifficultyDropdown) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowDifficultyDropdown(false);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [showDifficultyDropdown]);

  const selectedSubjects = useMemo(
    () => subjects.filter((subject) => subjectIds.includes(subject.id)),
    [subjects, subjectIds],
  );

  const estudoTopBoardId = useMemo(
    () => boards.find((board) => /estudo\s*top/i.test(board.name || ""))?.id || "",
    [boards],
  );
  const showInspirationBoardFilter = Boolean(estudoTopBoardId && boardIds.includes(estudoTopBoardId));

  useEffect(() => {
    if (!showInspirationBoardFilter && inspirationBoardIds.length > 0) {
      setInspirationBoardIds([]);
    }
  }, [showInspirationBoardFilter, inspirationBoardIds.length]);

  const clientStatusCounts = useMemo(() => {
    return questions.reduce((acc: Record<string, number>, question) => {
      const key = question.status || "draft";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }, [questions]);

  const statusCounts = initialStatusCounts || clientStatusCounts;

  const questionDashboardStats = useMemo(() => {
    return {
      pending: statusCounts.draft || 0,
      readyToPublish: statusCounts.ready_to_publish || 0,
      published: statusCounts.published || 0,
      awaitingReview: statusCounts.pending_review || 0,
    };
  }, [statusCounts]);

  const darkCard = {
    wrapper:
      "rounded-[2rem] border border-white/[0.07] bg-white/[0.03] p-0 shadow-xl shadow-black/30 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.12]",
    statement:
      "mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-4 text-sm leading-7 text-white/75 md:text-[15px]",
    footer:
      "flex flex-col gap-3 border-t border-white/[0.06] bg-black/10 px-6 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end",
    tags: {
      row: "flex flex-wrap items-center gap-2",
      primary: "rounded-full border border-white/[0.12] bg-white/[0.08] px-3 py-1 text-xs font-black text-white/90 shadow-sm",
      success: "rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-400",
      warning: "rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-400",
      brand: "rounded-full border border-orange-400/30 bg-orange-400/10 px-3 py-1 text-xs font-bold text-orange-400",
      neutral: "rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs font-bold text-white/55",
      subject: "rounded-full border border-violet-500/25 bg-violet-500/[0.10] px-3 py-1 text-xs font-bold text-violet-300",
      muted: "rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1 text-xs font-semibold text-white/30",
      info: "rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-bold text-sky-400",
    },
    alts: {
      base: "rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 text-sm text-white/70 transition hover:border-white/[0.14]",
      selected: "rounded-2xl border-2 border-orange-400/60 bg-orange-400/[0.08] px-4 py-3 text-sm text-white/90 ring-2 ring-orange-400/[0.12] transition",
      correct: "rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-300 transition",
      wrong: "rounded-2xl border-2 border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 transition",
      labelBase: "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/[0.15] bg-white/[0.06] text-xs font-black text-white/60",
      labelSelected: "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-orange-500 bg-orange-500 text-xs font-black text-white",
      labelCorrect: "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-emerald-500 bg-emerald-500 text-xs font-black text-white shadow-sm",
      labelWrong: "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-red-500 bg-red-500 text-xs font-black text-white",
      text: "prose max-w-none text-sm leading-6 [&_*]:!text-inherit",
    },
  };

  const disciplineCounts = useMemo(() => {
    const term = search.toLowerCase().trim();
    const counts: Record<string, number> = {};
    questions.forEach((question) => {
      if (!questionMatchesFilters(question, {
        term,
        subjectIds,
        boardIds,
        inspirationBoardIds,
        orgaos: orgaoFilters,
        difficultyLevels,
        status,
        yearFilters,
      })) return;
      getQuestionDisciplineIds(question).forEach((id: string) => {
        counts[id] = (counts[id] || 0) + 1;
      });
    });
    return counts;
  }, [questions, search, subjectIds, boardIds, inspirationBoardIds, orgaoFilters, difficultyLevels, status, yearFilters]);

  const subjectCounts = useMemo(() => {
    const term = search.toLowerCase().trim();
    const counts: Record<string, number> = {};
    questions.forEach((question) => {
      if (!questionMatchesFilters(question, {
        term,
        disciplineId,
        boardIds,
        inspirationBoardIds,
        orgaos: orgaoFilters,
        difficultyLevels,
        status,
        yearFilters,
      })) return;
      extractQuestionSubjects(question).map((s: any) => s.id).filter(Boolean).forEach((id: string) => {
        counts[id] = (counts[id] || 0) + 1;
      });
    });
    return counts;
  }, [questions, search, disciplineId, boardIds, inspirationBoardIds, orgaoFilters, difficultyLevels, status, yearFilters]);

  const boardCounts = useMemo(() => {
    const term = search.toLowerCase().trim();
    const counts: Record<string, number> = {};
    questions.forEach((question) => {
      if (!questionMatchesFilters(question, {
        term,
        disciplineId,
        subjectIds,
        inspirationBoardIds,
        orgaos: orgaoFilters,
        difficultyLevels,
        status,
        yearFilters,
      })) return;
      const qBoardId = question.exam_boards?.id || "";
      if (qBoardId) counts[qBoardId] = (counts[qBoardId] || 0) + 1;
    });
    return counts;
  }, [questions, search, disciplineId, subjectIds, inspirationBoardIds, orgaoFilters, difficultyLevels, status, yearFilters]);

  const inspirationBoardCounts = useMemo(() => {
    const term = search.toLowerCase().trim();
    const counts: Record<string, number> = {};
    questions.forEach((question) => {
      if (!questionMatchesFilters(question, {
        term,
        disciplineId,
        subjectIds,
        boardIds,
        orgaos: orgaoFilters,
        difficultyLevels,
        status,
        yearFilters,
      })) return;
      const id = question.inspiration_board?.id || question.inspiration_board_id || "";
      if (id) counts[id] = (counts[id] || 0) + 1;
    });
    return counts;
  }, [questions, search, disciplineId, subjectIds, boardIds, orgaoFilters, difficultyLevels, status, yearFilters]);

  const orgaoCounts = useMemo(() => {
    const term = search.toLowerCase().trim();
    const counts: Record<string, number> = {};
    questions.forEach((question) => {
      if (!questionMatchesFilters(question, {
        term,
        disciplineId,
        subjectIds,
        boardIds,
        inspirationBoardIds,
        difficultyLevels,
        status,
        yearFilters,
      })) return;
      const orgao = (question.orgao || "").trim();
      if (orgao) counts[orgao] = (counts[orgao] || 0) + 1;
    });
    return counts;
  }, [questions, search, disciplineId, subjectIds, boardIds, inspirationBoardIds, difficultyLevels, status, yearFilters]);

  const yearCounts = useMemo(() => {
    const term = search.toLowerCase().trim();
    const counts: Record<string, number> = {};
    questions.forEach((question) => {
      if (!questionMatchesFilters(question, {
        term,
        disciplineId,
        subjectIds,
        boardIds,
        inspirationBoardIds,
        orgaos: orgaoFilters,
        difficultyLevels,
        status,
      })) return;
      const year = String(question.year || "");
      if (year) counts[year] = (counts[year] || 0) + 1;
    });
    return counts;
  }, [questions, search, disciplineId, subjectIds, boardIds, inspirationBoardIds, orgaoFilters, difficultyLevels, status]);

  const difficultyCounts = useMemo(() => {
    const term = search.toLowerCase().trim();
    const counts: Record<string, number> = {};
    questions.forEach((question) => {
      if (!questionMatchesFilters(question, {
        term,
        disciplineId,
        subjectIds,
        boardIds,
        inspirationBoardIds,
        orgaos: orgaoFilters,
        status,
        yearFilters,
      })) return;
      const level = String(question.difficulty_level || "");
      if (level) counts[level] = (counts[level] || 0) + 1;
    });
    return counts;
  }, [questions, search, disciplineId, subjectIds, boardIds, inspirationBoardIds, orgaoFilters, status, yearFilters]);

  const statusFacetCounts = useMemo(() => {
    const term = search.toLowerCase().trim();
    const counts: Record<string, number> = {};
    questions.forEach((question) => {
      if (!questionMatchesFilters(question, {
        term,
        disciplineId,
        subjectIds,
        boardIds,
        inspirationBoardIds,
        orgaos: orgaoFilters,
        difficultyLevels,
        yearFilters,
      })) return;
      const raw = question.status || "draft";
      const key = raw === "active" ? "published" : raw;
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [questions, search, disciplineId, subjectIds, boardIds, inspirationBoardIds, orgaoFilters, difficultyLevels, yearFilters]);

  const availableDisciplines = useMemo(
    () => disciplines.filter((item) => (disciplineCounts[item.id] || 0) > 0 || item.id === disciplineId),
    [disciplines, disciplineCounts, disciplineId],
  );

  const availableSubjects = useMemo(
    () => subjects.filter((item) =>
      (!disciplineId || item.discipline_id === disciplineId) &&
      ((subjectCounts[item.id] || 0) > 0 || subjectIds.includes(item.id)),
    ),
    [subjects, disciplineId, subjectCounts, subjectIds],
  );

  const availableBoards = useMemo(
    () => boards.filter((item) => (boardCounts[item.id] || 0) > 0 || boardIds.includes(item.id)),
    [boards, boardCounts, boardIds],
  );

  const availableInspirationBoards = useMemo(
    () => boards.filter((item) =>
      item.id !== estudoTopBoardId &&
      ((inspirationBoardCounts[item.id] || 0) > 0 || inspirationBoardIds.includes(item.id)),
    ),
    [boards, estudoTopBoardId, inspirationBoardCounts, inspirationBoardIds],
  );

  const availableOrgaos = useMemo(
    () => Object.keys(orgaoCounts)
      .filter((item) => (orgaoCounts[item] || 0) > 0 || orgaoFilters.includes(item))
      .sort((a, b) => a.localeCompare(b, "pt-BR")),
    [orgaoCounts, orgaoFilters],
  );

  const availableYears = useMemo(
    () => Object.keys(yearCounts)
      .filter((item) => (yearCounts[item] || 0) > 0 || yearFilters.includes(item))
      .sort((a, b) => Number(b) - Number(a)),
    [yearCounts, yearFilters],
  );

  const availableDifficultyOptions = useMemo(
    () => difficultyOptions.filter((item) => (difficultyCounts[item.value] || 0) > 0 || difficultyLevels.includes(item.value)),
    [difficultyCounts, difficultyLevels],
  );

  const filteredQuestions = useMemo(() => {
    const term = search.toLowerCase().trim();
    return questions
      .filter((question) => questionMatchesFilters(question, { term, disciplineId, subjectIds, boardIds, inspirationBoardIds, orgaos: orgaoFilters, difficultyLevels, status, yearFilters, missingTopics: missingTopicsFilter }))
      .sort((a, b) => {
        const ya = a.year || 0;
        const yb = b.year || 0;
        if (!ya && !yb) return 0;
        if (!ya) return 1;
        if (!yb) return -1;
        return sortOrder === "newest" ? yb - ya : ya - yb;
      });
  }, [questions, search, disciplineId, subjectIds, boardIds, inspirationBoardIds, orgaoFilters, difficultyLevels, status, yearFilters, missingTopicsFilter, sortOrder]);

  useEffect(() => {
    setSingleIndex((current) => {
      if (filteredQuestions.length === 0) return 0;
      return Math.min(current, filteredQuestions.length - 1);
    });
  }, [filteredQuestions.length]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, disciplineId, subjectIds.join(","), boardIds.join(","), inspirationBoardIds.join(","), orgaoFilters.join(","), difficultyLevels.join(","), status, yearFilters.join(","), missingTopicsFilter, sortOrder, viewMode]);

  const totalPages = Math.max(1, Math.ceil(filteredQuestions.length / QUESTIONS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedQuestions = filteredQuestions.slice(
    (safeCurrentPage - 1) * QUESTIONS_PER_PAGE,
    safeCurrentPage * QUESTIONS_PER_PAGE,
  );

  const renderedQuestions = viewMode === "single"
    ? filteredQuestions.slice(singleIndex, singleIndex + 1)
    : paginatedQuestions;

  const isViewingPublicationQueue = status === READY_TO_PUBLISH_STATUS;
  const publicationQueueVisibleIds = filteredQuestions
    .filter((question) => (question.status || "draft") === READY_TO_PUBLISH_STATUS)
    .map((question) => question.id);

  const allVisibleSelected =
    renderedQuestions.length > 0 &&
    renderedQuestions.every((question) => selectedIds.includes(question.id));

  function toggleQuestion(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function toggleAllVisible() {
    if (allVisibleSelected) {
      setSelectedIds((current) =>
        current.filter((id) => !renderedQuestions.some((question) => question.id === id)),
      );
      return;
    }

    setSelectedIds((current) => {
      const merged = new Set(current);
      renderedQuestions.forEach((question) => merged.add(question.id));
      return [...merged];
    });
  }

  function toggleDifficultyLevel(level: string) {
    setDifficultyLevels((current) =>
      current.includes(level)
        ? current.filter((item) => item !== level)
        : [...current, level],
    );
  }

  function getDifficultyLabel() {
    if (difficultyLevels.length === 0) return "Todas as dificuldades";
    if (difficultyLevels.length === 1) return `Dificuldade (${difficultyLevels.length})`;
    return `Dificuldades (${difficultyLevels.length})`;
  }

  async function updateQuestionDifficulty(questionId: string, level: number) {
    try {
      setSavingDifficultyId(questionId);

      const response = await adminFetch(`/api/admin/questions/${questionId}/difficulty`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ difficulty_level: level }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Erro ao atualizar dificuldade.");
      }

      setFeedback({ type: "success", message: result.message || "Dificuldade atualizada com sucesso." });
      setQuestions((current) =>
        current.map((question) =>
          question.id === questionId ? { ...question, difficulty_level: level } : question,
        ),
      );
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao atualizar dificuldade.",
      });
    } finally {
      setSavingDifficultyId(null);
    }
  }

  async function detectEvaluatedTopics(questionId: string) {
    setDetectingTopicsId(questionId);
    setFeedback(null);
    try {
      const response = await adminFetch(`/api/admin/questions/${questionId}/detect-evaluated-topics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ save: true }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Erro ao detectar tópicos avaliados.");
      }
      const evaluatedTopics = normalizeEvaluatedTopics(result.evaluated_topics);
      setQuestions((current) =>
        current.map((question) =>
          question.id === questionId ? { ...question, evaluated_topics: evaluatedTopics } : question,
        ),
      );
      setFeedback({ type: "success", message: result.message || "Tópicos avaliados detectados com sucesso." });
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao detectar tópicos avaliados.",
      });
    } finally {
      setDetectingTopicsId(null);
    }
  }

  function findMissingTopics(ids: string[]) {
    const selected = questions.filter((question) => ids.includes(question.id));
    return selected.filter((question) => normalizeEvaluatedTopics(question.evaluated_topics).length === 0);
  }

  function renderDifficultyStars(
    level: number | string | null | undefined,
    compact = false,
    questionId?: string,
  ) {
    const numericLevel = Number(level || 0);

    const baseClass = compact
      ? "inline-flex items-center gap-0.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-600"
      : "inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-600";

    const disabled = questionId ? savingDifficultyId === questionId : true;

    return (
      <span
        className={baseClass}
        title={numericLevel ? `${numericLevel} estrela${numericLevel === 1 ? "" : "s"}` : "Sem dificuldade"}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {Array.from({ length: 5 }).map((_, index) => {
          const starLevel = index + 1;
          const filled = starLevel <= numericLevel;
          const content = (
            <Star
              size={compact ? 13 : 15}
              className={filled ? "fill-current" : "text-amber-200"}
            />
          );

          if (!questionId) {
            return <span key={starLevel}>{content}</span>;
          }

          return (
            <button
              key={starLevel}
              type="button"
              disabled={disabled}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                updateQuestionDifficulty(questionId, starLevel);
              }}
              className="rounded p-0.5 transition hover:scale-110 hover:text-amber-700 disabled:cursor-wait disabled:opacity-60"
              aria-label={`Definir dificuldade ${starLevel}`}
            >
              {content}
            </button>
          );
        })}
      </span>
    );
  }


  function togglePublicationQueue(id: string) {
    setPublicationQueueIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  async function executeFormPublicationQueue() {
    try {
      const response = await adminFetch("/api/admin/questions/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: publicationQueueIds, status: READY_TO_PUBLISH_STATUS }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Erro ao formar a fila de publicação.");
      }

      setPublicationQueueIds([]);
      notifyPublicationQueueUpdated();
      router.refresh();
      setActionModal({
        open: true,
        tone: "success",
        title: "Fila formada",
        message: result.message || `${publicationQueueIds.length} questão(ões) enviadas para a fila de publicação.`,
        onClose: () => setActionModal(null),
      });
    } catch (error) {
      setActionModal({
        open: true,
        tone: "error",
        title: "Não foi possível formar a fila",
        message: error instanceof Error ? error.message : "Erro ao formar a fila de publicação.",
        onClose: () => setActionModal(null),
      });
    }
  }

  async function formPublicationQueue() {
    if (publicationQueueIds.length === 0) {
      setFeedback({ type: "warning", message: "Marque pelo menos uma questão para formar a fila de publicação." });
      return;
    }

    const missingTopics = findMissingTopics(publicationQueueIds);
    if (missingTopics.length > 0) {
      setFeedback({ type: "error", message: `${missingTopics.length} questao(oes) sem topicos avaliados nao podem entrar na fila de publicacao.` });
      return;
    }

    setActionModal({
      open: true,
      tone: "publish",
      title: "Formar fila de publicação",
      message: `Deseja enviar ${publicationQueueIds.length} questão(ões) para a fila de publicação?`,
      primaryLabel: "Formar fila",
      secondaryLabel: "Cancelar",
      onClose: () => setActionModal(null),
      onSecondary: () => setActionModal(null),
      onPrimary: async () => {
        setActionModal((current) => current ? { ...current, loading: true, message: "Formando fila de publicação..." } : current);
        await executeFormPublicationQueue();
      },
    });
  }

  async function publishSelectedQueueItems() {
    if (selectedIds.length === 0) {
      setFeedback({ type: "warning", message: "Selecione pelo menos uma questão da fila." });
      return;
    }

    setActionModal({
      open: true,
      tone: "publish",
      title: "Publicar itens da fila",
      message: `Deseja publicar ${selectedIds.length} questão(ões) da fila de publicação?`,
      primaryLabel: "Publicar",
      secondaryLabel: "Cancelar",
      onClose: () => setActionModal(null),
      onSecondary: () => setActionModal(null),
      onPrimary: async () => {
        setActionModal((current) => current ? { ...current, loading: true, message: "Publicando itens da fila..." } : current);
        try {
          const response = await adminFetch("/api/admin/questions/bulk", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: selectedIds, status: "published" }),
          });
          const result = await response.json();
          if (!response.ok || !result.ok) throw new Error(result.message || "Não foi possível publicar os itens da fila.");
          const actualPublished = result.updatedCount ?? (result.updatedIds?.length ?? 0);
          const blockedIds: string[] = result.blockedIds || [];
          const blockedTopicIds: string[] = result.blockedTopicIds || [];
          const blockedSubjectIds: string[] = result.blockedSubjectIds || [];
          const codesFor = (ids: string[]) => ids.map((bid: string) => {
            const q = questions.find((q: any) => q.id === bid);
            return q?.code || bid.slice(0, 8).toUpperCase();
          });
          const blockedCodes = codesFor(blockedIds);
          const blockedTopicCodes = codesFor(blockedTopicIds);
          const blockedSubjectCodes = codesFor(blockedSubjectIds);
          setSelectedIds([]);
          notifyPublicationQueueUpdated();
          router.refresh();
          const hasPartialBlocks = blockedIds.length > 0 || blockedTopicIds.length > 0 || blockedSubjectIds.length > 0;
          const messageParts: string[] = [];
          if (actualPublished > 0) messageParts.push(`${actualPublished} questão(ões) publicada(s).`);
          if (blockedIds.length > 0) messageParts.push(`${blockedIds.length} questão(ões) sem gabarito único devolvida(s) para revisão: ${blockedCodes.join(", ")}.`);
          if (blockedTopicIds.length > 0) messageParts.push(`${blockedTopicIds.length} questão(ões) sem tópicos avaliados devolvida(s) para revisão: ${blockedTopicCodes.join(", ")}.`);
          if (blockedSubjectIds.length > 0) messageParts.push(`${blockedSubjectIds.length} questão(ões) sem assunto real devolvida(s) para revisão: ${blockedSubjectCodes.join(", ")}.`);
          setActionModal({
            open: true,
            tone: hasPartialBlocks ? "warning" : "success",
            title: hasPartialBlocks ? "Publicação parcial" : "Itens publicados",
            message: messageParts.join(" ") || result.message || `${actualPublished} questão(ões) publicada(s) com sucesso.`,
            onClose: () => setActionModal(null),
          });
        } catch (error) {
          setActionModal({
            open: true,
            tone: "error",
            title: "Não foi possível publicar",
            message: error instanceof Error ? error.message : "Não foi possível publicar os itens da fila.",
            onClose: () => setActionModal(null),
          });
        }
      },
    });
  }

  async function publishAllCurrentQueueItems() {
    const idsToPublish = publicationQueueVisibleIds;

    if (idsToPublish.length === 0) {
      setFeedback({ type: "warning", message: "Nenhuma questão da fila encontrada neste filtro." });
      return;
    }

    setActionModal({
      open: true,
      tone: "publish",
      title: "Publicar essa fila",
      message: `Deseja publicar ${idsToPublish.length} questão(ões) desta fila de publicação?`,
      primaryLabel: "Publicar fila",
      secondaryLabel: "Cancelar",
      onClose: () => setActionModal(null),
      onSecondary: () => setActionModal(null),
      onPrimary: async () => {
        setActionModal((current) => current ? { ...current, loading: true, message: "Publicando questões da fila..." } : current);
        try {
          const response = await adminFetch("/api/admin/questions/bulk", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: idsToPublish, status: "published" }),
          });
          const result = await response.json();
          if (!response.ok || !result.ok) {
            throw new Error(result.message || "Não foi possível publicar essa fila.");
          }

          const actualPublished = result.updatedCount ?? (result.updatedIds?.length ?? 0);
          const blockedIds: string[] = result.blockedIds || [];
          const blockedTopicIds: string[] = result.blockedTopicIds || [];
          const blockedSubjectIds: string[] = result.blockedSubjectIds || [];
          const codesFor = (ids: string[]) => ids.map((bid: string) => {
            const q = questions.find((q: any) => q.id === bid);
            return q?.code || bid.slice(0, 8).toUpperCase();
          });
          const blockedCodes = codesFor(blockedIds);
          const blockedTopicCodes = codesFor(blockedTopicIds);
          const blockedSubjectCodes = codesFor(blockedSubjectIds);
          setSelectedIds([]);
          setPublicationQueueIds([]);
          notifyPublicationQueueUpdated();
          router.refresh();
          const hasPartialBlocks = blockedIds.length > 0 || blockedTopicIds.length > 0 || blockedSubjectIds.length > 0;
          const messageParts: string[] = [];
          if (actualPublished > 0) messageParts.push(`${actualPublished} questão(ões) publicada(s).`);
          if (blockedIds.length > 0) messageParts.push(`${blockedIds.length} questão(ões) sem gabarito único devolvida(s) para revisão: ${blockedCodes.join(", ")}.`);
          if (blockedTopicIds.length > 0) messageParts.push(`${blockedTopicIds.length} questão(ões) sem tópicos avaliados devolvida(s) para revisão: ${blockedTopicCodes.join(", ")}.`);
          if (blockedSubjectIds.length > 0) messageParts.push(`${blockedSubjectIds.length} questão(ões) sem assunto real devolvida(s) para revisão: ${blockedSubjectCodes.join(", ")}.`);
          setActionModal({
            open: true,
            tone: hasPartialBlocks ? "warning" : "success",
            title: hasPartialBlocks ? "Publicação parcial" : "Fila publicada",
            message: messageParts.join(" ") || result.message || `${actualPublished} questão(ões) publicada(s) com sucesso.`,
            onClose: () => setActionModal(null),
          });
        } catch (error) {
          setActionModal({
            open: true,
            tone: "error",
            title: "Não foi possível publicar",
            message: error instanceof Error ? error.message : "Não foi possível publicar essa fila.",
            onClose: () => setActionModal(null),
          });
        }
      },
    });
  }

  function startAnswerEdit(question: any) {
    const currentCorrect = (question.question_alternatives || []).find((alt: any) => Boolean(alt.is_correct));
    setAnswerDraft((current) => ({ ...current, [question.id]: currentCorrect?.id || "" }));
    setAnswerEditQuestionId(question.id);
  }

  async function saveCardAnswer(questionId: string) {
    const alternativeId = answerDraft[questionId];

    if (!alternativeId) {
      setFeedback({ type: "warning", message: "Selecione uma alternativa correta antes de salvar." });
      return;
    }

    try {
      setSavingAnswerId(questionId);
      const response = await adminFetch(`/api/admin/questions/${questionId}/answer`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alternative_id: alternativeId }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Erro ao salvar gabarito.");
      }

      setFeedback({ type: "success", message: result.message || "Gabarito atualizado com sucesso." });
      setAnswerEditQuestionId(null);
      setAnswerDraft((current) => {
        const next = { ...current };
        delete next[questionId];
        return next;
      });
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao salvar gabarito.",
      });
    } finally {
      setSavingAnswerId(null);
    }
  }

  async function openAddToSimuladoModal(idsOverride?: string[]) {
    const idsToUse = idsOverride && idsOverride.length > 0 ? idsOverride : selectedIds;
    if (idsToUse.length === 0) {
      setFeedback({ type: "warning", message: "Selecione pelo menos uma questão para adicionar ao simulado." });
      return;
    }

    if (idsOverride && idsOverride.length > 0) {
      setSelectedIds(idsOverride);
    }

    const missingTopics = findMissingTopics(idsToUse);
    if (missingTopics.length > 0) {
      setFeedback({ type: "error", message: `${missingTopics.length} questao(oes) sem topicos avaliados nao podem ser adicionadas ao simulado.` });
      return;
    }

    setShowAddToSimuladoModal(true);
    setSelectedSimuladoId("");
    setLoadingSimulados(true);

    try {
      const response = await adminFetch("/api/admin/simulados");
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Erro ao carregar simulados.");
      }

      setSimuladoOptions(result.simulados || []);
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro ao carregar simulados." });
      setSimuladoOptions([]);
    } finally {
      setLoadingSimulados(false);
    }
  }

  async function addSelectedToSimulado() {
    if (!selectedSimuladoId) {
      setFeedback({ type: "warning", message: "Selecione um simulado." });
      return;
    }

    try {
      setAddingQuestionsToSimulado(true);
      const response = await adminFetch(`/api/admin/simulados/${selectedSimuladoId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_ids: selectedIds }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Não foi possível adicionar as questões ao simulado.");
      }

      setFeedback({ type: "success", message: result.message || `${selectedIds.length} questão(ões) adicionada(s) ao simulado.` });
      setShowAddToSimuladoModal(false);
      setSelectedSimuladoId("");
      setSelectedIds([]);
      router.refresh();
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro ao adicionar questões ao simulado." });
    } finally {
      setAddingQuestionsToSimulado(false);
    }
  }

  async function applyPublicationQueueBulkEdit(fields: PublicationQueueBulkEditFields) {
    if (selectedIds.length === 0) {
      setFeedback({ type: "warning", message: "Selecione pelo menos uma questão da fila." });
      setShowPublicationQueueBulkEditModal(false);
      return;
    }

    const idsToUpdate = [...selectedIds];

    try {
      const response = await adminFetch("/api/admin/questions/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: idsToUpdate, metadata: fields }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Erro ao aplicar edições em massa.");
      }

      const changedIds = new Set(idsToUpdate);
      const selectedBoard = fields.exam_board_id ? boards.find((board: any) => board.id === fields.exam_board_id) : null;
      const updatedSubjectObjects = fields.subject_ids?.map((id) => {
        const subject = subjects.find((item: any) => item.id === id);
        if (!subject) return null;
        return {
          subjects: {
            id: subject.id,
            name: subject.name,
            discipline_id: subject.discipline_id,
            disciplines: disciplines.find((discipline: any) => discipline.id === subject.discipline_id) || null,
          },
        };
      }).filter(Boolean);

      setQuestions((current) => current.map((question) => changedIds.has(question.id)
        ? {
            ...question,
            ...(fields.exam_board_id !== undefined ? { exam_board_id: fields.exam_board_id, exam_boards: selectedBoard || null } : {}),
            ...(fields.subject_ids !== undefined ? {
              subject_id: fields.subject_ids[0] || null,
              subjects: updatedSubjectObjects?.[0]?.subjects || null,
              question_subjects: updatedSubjectObjects || [],
            } : {}),
            ...(fields.year !== undefined ? { year: fields.year } : {}),
            ...(fields.difficulty_level !== undefined ? { difficulty_level: fields.difficulty_level } : {}),
          }
        : question,
      ));

      setFeedback({ type: "success", message: result.message || "Edições em massa aplicadas com sucesso." });
      setShowPublicationQueueBulkEditModal(false);
      setSelectedIds([]);
      router.refresh();
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro ao aplicar edições em massa." });
      setShowPublicationQueueBulkEditModal(false);
    }
  }

  async function applyBulkStatus(statusToApply = bulkStatus) {
    if (selectedIds.length === 0) {
      setFeedback({ type: "warning", message: "Selecione pelo menos uma questão." });
      setShowBulkStatusModal(false);
      return;
    }

    if (statusToApply === "published" || statusToApply === READY_TO_PUBLISH_STATUS) {
      const missingTopics = findMissingTopics(selectedIds);
      if (missingTopics.length > 0) {
        setFeedback({ type: "error", message: `${missingTopics.length} questao(oes) sem topicos avaliados nao podem ser publicadas.` });
        setShowBulkStatusModal(false);
        return;
      }
    }

    try {
      const response = await adminFetch("/api/admin/questions/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds, status: statusToApply }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Erro ao mudar status das questões.");
      }

      setFeedback({
        type: "success",
        message: result.message || "Status das questões atualizado com sucesso.",
      });

      const changedIds = new Set(selectedIds);
      setQuestions((current) =>
        current.map((question) =>
          changedIds.has(question.id) ? { ...question, status: statusToApply } : question,
        ),
      );
      setSelectedIds([]);
      setShowBulkStatusModal(false);
      notifyPublicationQueueUpdated();
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao mudar status das questões.",
      });
      setShowBulkStatusModal(false);
    }
  }

  async function applyBulkMetadata() {
    if (selectedIds.length === 0) {
      setFeedback({ type: "warning", message: "Selecione pelo menos uma questão." });
      setShowBulkStatusModal(false);
      return;
    }

    const metadata: Record<string, unknown> = {};
    if (bulkEditType === "subject" && bulkSubjectIds.length > 0) {
      metadata.subject_ids = bulkSubjectIds;
    } else if (bulkEditType === "board" && bulkBoardId) {
      metadata.exam_board_id = bulkBoardId;
    } else {
      setFeedback({ type: "warning", message: "Selecione um valor para aplicar." });
      return;
    }

    try {
      const response = await adminFetch("/api/admin/questions/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds, metadata }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Erro ao atualizar questões.");
      const changedIds = new Set(selectedIds);
      if (bulkEditType === "subject" && bulkSubjectIds.length > 0) {
        const updatedSubjectObjects = bulkSubjectIds.map((id) => {
          const subject = subjects.find((item: any) => item.id === id);
          if (!subject) return null;
          return {
            subjects: {
              id: subject.id,
              name: subject.name,
              discipline_id: subject.discipline_id,
              disciplines: disciplines.find((discipline: any) => discipline.id === subject.discipline_id) || null,
            },
          };
        }).filter(Boolean);

        setQuestions((current) => current.map((question) => changedIds.has(question.id)
          ? {
              ...question,
              subject_id: bulkSubjectIds[0],
              subjects: updatedSubjectObjects[0]?.subjects || question.subjects,
              question_subjects: updatedSubjectObjects,
            }
          : question,
        ));
      }

      if (bulkEditType === "board" && bulkBoardId) {
        const board = boards.find((item: any) => item.id === bulkBoardId);
        setQuestions((current) => current.map((question) => changedIds.has(question.id)
          ? { ...question, exam_board_id: bulkBoardId, exam_boards: board ? { id: board.id, name: board.name } : question.exam_boards }
          : question,
        ));
      }

      setFeedback({ type: "success", message: result.message || "Questões atualizadas com sucesso." });
      setSelectedIds([]);
      setShowBulkStatusModal(false);
      router.refresh();
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro ao atualizar questões." });
      setShowBulkStatusModal(false);
    }
  }

  async function deleteSelected() {
    if (selectedIds.length === 0) {
      setFeedback({ type: "warning", message: "Selecione pelo menos uma questão." });
      return;
    }

    try {
      const response = await adminFetch("/api/admin/questions/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Erro ao excluir questões.");
      setFeedback({ type: "success", message: result.message || "Questões excluídas com sucesso." });
      const deletedIds = new Set(selectedIds);
      setQuestions((current) => current.filter((question) => !deletedIds.has(question.id)));
      setConfirm(null);
      setSelectedIds([]);
      router.refresh();
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro ao excluir questões." });
      setConfirm(null);
    }
  }

  function editSelected() {
    if (selectedIds.length === 0) {
      setFeedback({ type: "warning", message: "Selecione pelo menos uma questão." });
      return;
    }
    const first = filteredQuestions.find((question) => selectedIds.includes(question.id));
    if (first) router.push(getEditHref(first));
  }

  async function deleteQuestion(id: string) {
    try {
      const response = await adminFetch(`/api/admin/questions?id=${id}`, { method: "DELETE" });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Erro ao excluir questão.");
      }

      setFeedback({ type: "success", message: result.message || "Questão excluída com sucesso." });
      setConfirm(null);
      router.refresh();
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro ao excluir questão." });
      setConfirm(null);
    }
  }

  async function annulQuestion(questionId: string, currentStatus: string) {
    const nextStatus = currentStatus === "annulled" ? "draft" : "annulled";
    try {
      const response = await adminFetch("/api/admin/questions/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [questionId], status: nextStatus }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Erro ao alterar status.");
      setFeedback({ type: "success", message: nextStatus === "annulled" ? "Questão marcada como anulada." : "Questão reativada (rascunho)." });
      setQuestions((current) => current.map((q) => q.id === questionId ? { ...q, status: nextStatus } : q));
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro ao anular questão." });
    }
  }

  async function toggleQuestionArchiveStatus(questionId: string, currentStatus: string) {
    const nextStatus = currentStatus === "archived" ? "draft" : "archived";
    try {
      const response = await adminFetch("/api/admin/questions/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [questionId], status: nextStatus }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Erro ao alterar status.");
      setFeedback({ type: "success", message: nextStatus === "archived" ? "Questão arquivada com sucesso." : "Questão desarquivada (rascunho)." });
      setQuestions((current) => current.map((q) => q.id === questionId ? { ...q, status: nextStatus } : q));
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro ao arquivar questão." });
    }
  }

  async function toggleQuestionPublishStatus(questionId: string, currentStatus: string) {
    const nextStatus = currentStatus === "published" ? "pending_review" : "published";

    try {
      const response = await adminFetch("/api/admin/questions/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [questionId], status: nextStatus }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Erro ao alterar status da questão.");
      }

      setFeedback({
        type: "success",
        message:
          nextStatus === "published"
            ? "Questão publicada com sucesso."
            : "Questão voltou para revisão.",
      });

      setQuestions((current) =>
        current.map((question) =>
          question.id === questionId ? { ...question, status: nextStatus } : question,
        ),
      );
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Erro ao alterar status da questão.",
      });
    }
  }

  async function runClassifyDifficulty() {
    setClassifyPhase("running");
    setClassifyResult(null);
    try {
      const response = await adminFetch("/api/admin/questions/classify-difficulty", { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Erro ao classificar.");
      setClassifyResult({ total: result.total_count ?? 0, classified: result.classified_count ?? 0, errors: result.error_count ?? 0 });
      setClassifyPhase("done");
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro ao classificar dificuldades." });
      setClassifyPhase("error");
    }
  }

  function getEditHref(question: any) {
    const queueStatus = status || question.status || "draft";
    const queueDisciplineId = disciplineId || getQuestionDisciplineIds(question)[0] || "";
    const params = new URLSearchParams();
    params.set("fila", queueStatus);
    if (queueDisciplineId) params.set("disciplina", queueDisciplineId);
    const currentFilter = window.location.search;
    if (currentFilter) params.set("retorno", `/questoes${currentFilter}`);
    return `/questoes/${question.id}/editar?${params.toString()}`;
  }

  return (
    <main className="relative min-h-screen overflow-visible bg-[#07111F] px-4 pb-20 pt-6 md:px-8 md:pt-10">
      <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 h-[600px] w-[1000px] rounded-full bg-sky-900/[0.12] blur-[150px]" />
      <div className="pointer-events-none absolute -right-40 top-1/4 h-[500px] w-[500px] rounded-full bg-violet-900/[0.08] blur-[120px]" />
      <div className="pointer-events-none absolute -left-40 bottom-1/3 h-[400px] w-[500px] rounded-full bg-blue-900/[0.07] blur-[100px]" />
      <section className="relative w-full">
      {showNewQuestionModal && <NewQuestionModal onCancel={() => setShowNewQuestionModal(false)} />}
      <QuestionActionModal modal={actionModal} />

      {(classifyPhase === "running" || classifyPhase === "done") && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-white/15 bg-[#080b12] p-7 text-center text-white shadow-2xl">
            <div className="pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full bg-orange-500/25 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -right-14 h-44 w-44 rounded-full bg-amber-400/20 blur-3xl" />
            <p className="relative text-[11px] font-semibold uppercase tracking-[0.28em] text-orange-300">EstudoTOP</p>
            {classifyPhase === "running" ? (
              <>
                <h2 className="relative mt-2 text-xl font-semibold tracking-tight">Classificando dificuldades…</h2>
                <p className="relative mt-2 text-sm leading-6 text-slate-300">Analisando questões sem dificuldade. Aguarde.</p>
                <div className="relative mt-6 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-orange-500 to-amber-400" />
                </div>
              </>
            ) : (
              <>
                <h2 className="relative mt-2 text-xl font-semibold tracking-tight">Classificação concluída</h2>
                {classifyResult && (
                  <div className="relative mt-4 space-y-1 text-sm text-slate-300">
                    <p>Total sem dificuldade: <span className="font-bold text-white">{classifyResult.total}</span></p>
                    <p>Classificadas: <span className="font-bold text-emerald-400">{classifyResult.classified}</span></p>
                    {classifyResult.errors > 0 && (
                      <p>Erros: <span className="font-bold text-red-400">{classifyResult.errors}</span></p>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => { setClassifyPhase("idle"); router.refresh(); }}
                  className="relative mt-6 inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 px-6 py-2.5 text-sm font-bold text-slate-950 shadow-lg transition hover:opacity-90"
                >
                  Fechar e recarregar
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {showBulkStatusModal && (
        <BulkEditModal
          selectedCount={selectedIds.length}
          editType={bulkEditType}
          selectedStatus={bulkStatus}
          selectedSubjectIds={bulkSubjectIds}
          selectedBoardId={bulkBoardId}
          subjects={subjects}
          boards={boards}
          onSelectEditType={setBulkEditType}
          onSelectStatus={setBulkStatus}
          onSelectSubjects={setBulkSubjectIds}
          onSelectBoard={setBulkBoardId}
          onCancel={() => setShowBulkStatusModal(false)}
          onConfirm={() => bulkEditType === "status" ? applyBulkStatus(bulkStatus) : applyBulkMetadata()}
        />
      )}



      {showPublicationQueueBulkEditModal && (
        <PublicationQueueBulkEditModal
          open={showPublicationQueueBulkEditModal}
          count={selectedIds.length}
          subjects={subjects}
          boards={boards}
          onConfirm={applyPublicationQueueBulkEdit}
          onClose={() => setShowPublicationQueueBulkEditModal(false)}
        />
      )}

      {showAddToSimuladoModal && (
        <AddToSimuladoModal
          selectedCount={selectedIds.length}
          simulados={simuladoOptions}
          selectedSimuladoId={selectedSimuladoId}
          loading={loadingSimulados}
          saving={addingQuestionsToSimulado}
          onSelect={setSelectedSimuladoId}
          onCancel={() => setShowAddToSimuladoModal(false)}
          onConfirm={addSelectedToSimulado}
        />
      )}

      {confirm && (
        <ConfirmModal
          title={confirm.title}
          message={confirm.message}
          onCancel={() => setConfirm(null)}
          onConfirm={confirm.onConfirm}
        />
      )}

      <header className="relative mb-8 overflow-hidden rounded-[1.75rem] border border-white/[0.08] bg-white/[0.03] p-5 shadow-2xl shadow-black/30 backdrop-blur-sm md:p-6">
        <div className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-orange-500/[0.09] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-44 w-44 rounded-full bg-sky-500/[0.06] blur-3xl" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-400/80">
              BANCO DE QUESTÕES
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
              Questões
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/35">
              Banco mestre de questões com filtros, status e ações.
            </p>
          </div>
          <div className="relative shrink-0">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/questoes/duplicatas">
                <PremiumButton variant="secondary" icon={<CopyCheck size={18} />}>
                  Encontrar duplicatas
                </PremiumButton>
              </Link>
              <Link href="/questoes/nova?modelo=1">
                <PremiumButton variant="secondary" icon={<CopyCheck size={18} />}>
                  Usar como modelo
                </PremiumButton>
              </Link>
              <PremiumButton
                variant="secondary"
                icon={<Sparkles size={18} />}
                onClick={runClassifyDifficulty}
                disabled={classifyPhase === "running"}
              >
                Classificar dificuldades
              </PremiumButton>
              <PremiumButton icon={<Plus size={18} />} onClick={() => setShowNewQuestionModal(true)}>
                Nova questão
              </PremiumButton>
            </div>
          </div>
        </div>
      </header>

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <QuestionStatCard
          label="Questões filtradas"
          value={filteredQuestions.length}
          tone="purple"
          icon={<Filter size={15} />}
        />
        <QuestionStatCard
          label="Publicadas"
          value={questionDashboardStats.published}
          tone="green"
          icon={<CheckCircle2 size={15} />}
        />
        <QuestionStatCard
          label="Na fila"
          value={questionDashboardStats.readyToPublish}
          tone="amber"
          icon={<Clock size={15} />}
        />
        <QuestionStatCard
          label="Aguardando revisão"
          value={questionDashboardStats.awaitingReview}
          tone="purple"
          icon={<Eye size={15} />}
        />
        <QuestionStatCard
          label="Rascunho"
          value={questionDashboardStats.pending}
          tone="orange"
          icon={<ClipboardList size={15} />}
        />
      </div>

      {feedback && <FeedbackBox feedback={feedback} />}

      <div className="relative z-20 mb-6 rounded-[1.75rem] border border-white/[0.07] bg-white/[0.03] p-5 shadow-xl shadow-black/20 backdrop-blur-sm md:p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-orange-500/[0.05] blur-3xl" />
        <div className="relative mb-6 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/10 text-orange-400">
            <Search size={18} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white/90">Filtros</h2>
            <p className="mt-0.5 text-sm text-white/35">Refine a busca no banco de questões.</p>
          </div>
        </div>
        <div className="relative space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <PremiumSearch
              value={search}
              onChange={setSearch}
              onClear={() => setSearch("")}
            />

            <SimpleSelectDropdown
              label="Disciplina"
              value={disciplineId}
              onChange={(v) => { setDisciplineId(v); setSubjectIds([]); }}
              options={[
                { value: "", label: "Todas" },
                ...availableDisciplines.map((d) => ({ value: d.id, label: `${d.name} (${disciplineCounts[d.id] || 0})` })),
              ]}
            />

            <SubjectFilterDropdown
              label="Assuntos"
              subjects={availableSubjects}
              selectedIds={subjectIds}
              onChange={setSubjectIds}
              subjectCounts={subjectCounts}
            />

            <BoardFilterDropdown
              boards={availableBoards}
              selectedIds={boardIds}
              onChange={setBoardIds}
              counts={boardCounts}
            />
          </div>

          {showInspirationBoardFilter && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <BoardFilterDropdown
                label="Inspirada na banca"
                boards={availableInspirationBoards}
                selectedIds={inspirationBoardIds}
                onChange={setInspirationBoardIds}
                counts={inspirationBoardCounts}
                instantApply
              />
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <OrgaoFilterDropdown
              orgaos={availableOrgaos}
              selectedOrgaos={orgaoFilters}
              onChange={setOrgaoFilters}
              counts={orgaoCounts}
            />

            <YearFilterDropdown
              years={availableYears}
              selectedYears={yearFilters}
              onChange={setYearFilters}
              counts={yearCounts}
            />

            <div className="relative">
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
                Dificuldade
              </label>

              <button
                type="button"
                onClick={() => setShowDifficultyDropdown((current) => !current)}
                aria-expanded={showDifficultyDropdown}
                className="group flex h-12 w-full items-center justify-between rounded-2xl border border-white/[0.08] bg-[#0D1926] px-4 text-left text-sm font-semibold text-white/80 outline-none transition hover:border-white/[0.15]"
              >
                <span className="truncate">{getDifficultyLabel()}</span>
                <span className="flex items-center gap-2">
                  {difficultyLevels.length > 0 && (
                    <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white">
                      {difficultyLevels.length}
                    </span>
                  )}
                  <ChevronDown
                    size={16}
                    className={`text-white/30 transition duration-200 group-hover:text-orange-400 ${
                      showDifficultyDropdown ? "rotate-180 text-orange-400" : ""
                    }`}
                  />
                </span>
              </button>

              {showDifficultyDropdown && (
                <div className="absolute left-0 top-full z-[9999] mt-2 w-full min-w-0 rounded-2xl border border-white/[0.09] bg-[#0D1B2E] p-3 shadow-2xl shadow-black/50 backdrop-blur-xl sm:min-w-72">
                  <div className="space-y-1">
                    {availableDifficultyOptions.map((option) => {
                      const level = option.value;
                      const selected = difficultyLevels.includes(level);

                      return (
                        <button
                          key={level}
                          type="button"
                          onClick={() => toggleDifficultyLevel(level)}
                          className={
                            selected
                              ? "flex w-full items-center justify-between rounded-xl border border-orange-400/30 bg-orange-400/10 px-4 py-3 text-left text-sm font-semibold text-white/90 transition duration-200"
                              : "flex w-full items-center justify-between rounded-xl border border-transparent px-4 py-3 text-left text-sm font-semibold text-white/55 transition duration-200 hover:border-white/[0.07] hover:bg-white/[0.04] hover:text-white/85"
                          }
                        >
                          <span className="flex items-center gap-2">
                            <span className="flex items-center gap-0.5">
                              {Array.from({ length: Number(level) }).map((_, index) => (
                                <Star key={index} size={14} className="fill-current text-amber-400" />
                              ))}
                            </span>
                            <span>
                              {level === "1" && "Muito fácil"}
                              {level === "2" && "Fácil"}
                              {level === "3" && "Média"}
                              {level === "4" && "Difícil"}
                              {level === "5" && "Muito difícil"}
                            </span>
                            <span className="rounded-full border border-white/[0.08] bg-white/[0.05] px-2 py-0.5 text-[10px] font-black text-white/40">
                              {difficultyCounts[level] || 0}
                            </span>
                          </span>

                          <span
                            className={
                              selected
                                ? "flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-white"
                                : "h-6 w-6 rounded-full border border-white/[0.15] bg-white/[0.05]"
                            }
                          >
                            {selected && <Check size={14} strokeWidth={3} />}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex gap-2 border-t border-white/[0.07] pt-3">
                    <button
                      type="button"
                      onClick={() => setDifficultyLevels([])}
                      className="flex-1 rounded-2xl bg-white/[0.04] px-3 py-2 text-xs font-bold text-white/45 hover:bg-white/[0.08] hover:text-white/75"
                    >
                      Limpar
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowDifficultyDropdown(false)}
                      className="flex-1 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-500 px-3 py-2 text-xs font-bold text-white shadow-sm"
                    >
                      Aplicar
                    </button>
                  </div>
                </div>
              )}
            </div>

            <SimpleSelectDropdown
              label="Status"
              value={status}
              onChange={setStatus}
              options={[
                { value: "", label: "Todos" },
                ...[
                  { value: "draft", label: "Rascunho" },
                  { value: "published", label: "Publicada" },
                  { value: "archived", label: "Arquivada" },
                ]
                  .filter((item) => (statusFacetCounts[item.value] || 0) > 0 || status === item.value)
                  .map((item) => ({
                    value: item.value,
                    label: `${item.label} (${statusFacetCounts[item.value] || 0})`,
                  })),
              ]}
            />

            <div className="flex flex-col">
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Tópicos avaliados</label>
              <button
                type="button"
                onClick={() => setMissingTopicsFilter((current) => !current)}
                className={missingTopicsFilter
                  ? "flex h-12 w-full items-center justify-between rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 text-left text-sm font-semibold text-amber-200 transition"
                  : "flex h-12 w-full items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 text-left text-sm font-semibold text-white/60 transition hover:border-white/[0.15]"}
              >
                <span className="truncate">Sem tópicos avaliados</span>
                <span className={missingTopicsFilter ? "flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white" : "h-6 w-6 rounded-full border border-white/[0.15] bg-white/[0.05]"}>
                  {missingTopicsFilter && <Check size={14} strokeWidth={3} />}
                </span>
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">
                Assuntos:
              </span>
              {selectedSubjects.length === 0 ? (
                <span className="text-sm font-semibold text-white/35">
                  Todos os assuntos
                </span>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {selectedSubjects.map((subject) => (
                    <span
                      key={subject.id}
                      className="inline-flex items-center gap-1 rounded-full border border-orange-400/30 bg-orange-400/10 px-3 py-1 text-xs font-bold text-orange-400"
                    >
                      {subject.name}
                      <button
                        type="button"
                        onClick={() => setSubjectIds((current) => current.filter((id) => id !== subject.id))}
                        className="ml-0.5 rounded-full p-0.5 text-orange-400/60 transition hover:bg-orange-400/20 hover:text-orange-300"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      <div className="mt-4 mb-4 flex flex-col gap-3 rounded-[2rem] border border-white/[0.07] bg-white/[0.03] px-5 py-3.5 shadow-sm shadow-black/10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.04]">
            <Calendar size={13} className="text-white/45" />
          </span>
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-white/40">Ordenar por ano</span>
        </div>
        <div className="flex gap-1 rounded-xl bg-white/[0.04] p-1">
          <button
            type="button"
            onClick={() => setSortOrder("newest")}
            className={sortOrder === "newest" ? "rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-bold text-white shadow-sm shadow-orange-500/30 transition" : "rounded-lg px-4 py-1.5 text-xs font-bold text-white/40 transition hover:bg-white/[0.06] hover:text-white/70"}
          >
            Mais recentes
          </button>
          <button
            type="button"
            onClick={() => setSortOrder("oldest")}
            className={sortOrder === "oldest" ? "rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-bold text-white shadow-sm shadow-orange-500/30 transition" : "rounded-lg px-4 py-1.5 text-xs font-bold text-white/40 transition hover:bg-white/[0.06] hover:text-white/70"}
          >
            Mais antigas
          </button>
        </div>
      </div>

      <div className="mt-2">
        <div className="mb-4 flex flex-col gap-3 rounded-[2rem] border border-white/[0.07] bg-white/[0.03] p-4 shadow-xl shadow-black/20 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-400">Modo de revisão</p>
            <p className="mt-0.5 text-sm text-white/40">Escolha se deseja trabalhar questão por questão ou em lote.</p>
          </div>
          <div className="flex gap-1.5 rounded-2xl bg-white/[0.04] p-1.5">
            <button
              type="button"
              onClick={() => setViewMode("single")}
              className={viewMode === "single" ? "rounded-xl bg-orange-500 px-5 py-2 text-sm font-bold text-white shadow-sm shadow-orange-500/30 transition" : "rounded-xl px-5 py-2 text-sm font-bold text-white/40 transition hover:bg-white/[0.06] hover:text-white/70"}
            >
              Uma por vez
            </button>
            <button
              type="button"
              onClick={() => setViewMode("multiple")}
              className={viewMode === "multiple" ? "rounded-xl bg-white/[0.12] px-5 py-2 text-sm font-bold text-white shadow-sm transition" : "rounded-xl px-5 py-2 text-sm font-bold text-white/40 transition hover:bg-white/[0.06] hover:text-white/70"}
            >
              Múltiplas
            </button>
          </div>
        </div>

        {isViewingPublicationQueue && publicationQueueVisibleIds.length > 0 && (
          <div className="mb-4 flex flex-col gap-3 rounded-[2rem] border border-sky-400/20 bg-sky-400/[0.06] p-4 shadow-xl shadow-black/20 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-400">Fila de publicação</p>
              <p className="text-sm font-semibold text-white/50">{publicationQueueVisibleIds.length} questão(ões) prontas para publicação neste filtro.</p>
            </div>
            <PremiumButton icon={<BadgeCheck size={16} />} onClick={publishAllCurrentQueueItems}>
              Publicar essa fila
            </PremiumButton>
          </div>
        )}

        {viewMode === "single" && filteredQuestions.length > 0 && (
          <div className="mb-4 flex items-center justify-between rounded-[2rem] border border-white/[0.07] bg-white/[0.03] p-4 shadow-xl shadow-black/20">
            <p className="text-sm font-semibold text-white/55">
              Questão {singleIndex + 1} de {filteredQuestions.length} neste filtro
            </p>
            <div className="flex gap-2">
              <PremiumButton variant="secondary" disabled={singleIndex === 0} onClick={() => setSingleIndex((i) => Math.max(0, i - 1))}>
                Anterior
              </PremiumButton>
              <PremiumButton variant="secondary" disabled={singleIndex >= filteredQuestions.length - 1} onClick={() => setSingleIndex((i) => Math.min(filteredQuestions.length - 1, i + 1))}>
                Próxima
              </PremiumButton>
            </div>
          </div>
        )}

        <div className="relative overflow-hidden rounded-[1.75rem] border border-white/[0.07] bg-white/[0.03] p-5 shadow-xl shadow-black/20 backdrop-blur-sm md:p-6">
          <div className="pointer-events-none absolute -left-20 top-0 h-40 w-40 rounded-full bg-sky-500/[0.04] blur-3xl" />
          <div className="relative mb-6 flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-sky-400/20 bg-sky-400/10 text-sky-400">
              <FileQuestion size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white/90">Banco de questões</h2>
              <p className="mt-0.5 text-sm text-white/35">{filteredQuestions.length} questão(ões) encontrada(s).</p>
            </div>
          </div>
          <div className="relative">

          {filteredQuestions.length > 0 && (
            <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <label className="inline-flex cursor-pointer items-center gap-3 font-bold text-white/65">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  className="h-5 w-5 rounded border-white/20 text-orange-500 focus:ring-orange-400"
                />
                Selecionar questões exibidas
              </label>
              <span className="text-xs font-semibold text-white/30">
                {selectedIds.length} selecionada(s) • {renderedQuestions.length} exibida(s)
              </span>
            </div>
          )}

          {filteredQuestions.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/[0.08] bg-white/[0.02] p-10 text-center text-sm text-white/30">
              Nenhuma questão encontrada.
            </div>
          ) : (
            <div className="grid gap-4">
              {renderedQuestions.map((question, index) => {
                const alternatives = [...(question.question_alternatives || [])].sort(
                  (a, b) => (a.order_number || 0) - (b.order_number || 0),
                );
                const linkedSubjects = extractQuestionSubjects(question);
                const disciplineNames = Array.from(
                  new Set(
                    linkedSubjects
                      .map((subject) => subject.disciplines?.name)
                      .filter(Boolean),
                  ),
                );
                const simuladoLinks = ((question.simulado_questions || []) as QuestionSimuladoRelation[])
                  .map((relation): SimuladoUsage | null => {
                    const simulado = Array.isArray(relation.simulados)
                      ? relation.simulados[0]
                      : relation.simulados;

                    if (!simulado?.id) return null;

                    return {
                      id: simulado.id,
                      title: simulado.title || "Simulado sem titulo",
                      status: simulado.status || "draft",
                      relationStatus: relation.status || "active",
                      orderNumber: relation.order_number,
                    };
                  })
                  .filter((simulado): simulado is SimuladoUsage => Boolean(simulado))
                  .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
                const evaluatedTopics = normalizeEvaluatedTopics(question.evaluated_topics);

                const topicsPending = evaluatedTopics.length === 0;

                return (
                  <div key={question.id} className="relative isolate">
                    {/* Luz LED de fundo — separa cards visualmente */}
                    <div className={`pointer-events-none absolute -inset-[3px] -z-10 rounded-[2.25rem] blur-[14px] ${topicsPending ? "bg-gradient-to-b from-amber-400/[0.16] via-amber-300/[0.04] to-transparent" : "bg-gradient-to-b from-orange-400/[0.07] via-white/[0.025] to-transparent"}`} />
                    {question.status === "annulled" && (
                      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center overflow-hidden rounded-[2rem]">
                        <span className="select-none whitespace-nowrap text-[5rem] font-black tracking-[0.25em] text-red-500/20 rotate-[-25deg] uppercase leading-none">ANULADA</span>
                      </div>
                    )}
                    <details
                      open
                      className={topicsPending
                        ? "rounded-[2rem] border border-amber-400/40 bg-white/[0.03] p-0 shadow-xl shadow-black/30 ring-1 ring-amber-400/20 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-amber-400/60"
                        : darkCard.wrapper}
                    >
                    <summary className="cursor-pointer list-none">
                      <div className="p-6 md:p-8">
                        <div className={darkCard.tags.row}>
                          <label
                            className="mr-1 inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/[0.10] bg-white/[0.06] px-3 py-1 text-xs font-black text-white/70 transition hover:border-orange-400/40 hover:bg-orange-400/[0.10] hover:text-white"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(question.id)}
                              onChange={() => toggleQuestion(question.id)}
                              className="h-4 w-4 rounded border-white/[0.20] text-orange-500 focus:ring-orange-400"
                            />
                            Selecionar
                          </label>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              const code = question.code || question.question_code || question.public_code || `Q${String(question.id || "").slice(0, 8).toUpperCase()}`;
                              void navigator.clipboard.writeText(code);
                            }}
                            title="Copiar código"
                            className={`${darkCard.tags.primary} inline-flex items-center gap-1.5 transition hover:opacity-80 active:scale-95`}
                          >
                            {question.code || question.question_code || question.public_code || `Q${String(question.id || "").slice(0, 8).toUpperCase()}`}
                            <Copy size={10} className="opacity-50" />
                          </button>

                          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClass(question.status || "draft")}`}>
                            {getStatusLabel(question.status || "draft")}
                          </span>

                          <span className={darkCard.tags.brand}>
                            {question.exam_boards?.name || "Sem banca"}
                          </span>

                          {question.inspiration_board?.name && (
                            <span className="rounded-full border border-violet-400/25 bg-violet-400/[0.10] px-3 py-1 text-xs font-bold text-violet-200">
                              Inspirada na {question.inspiration_board.name}
                            </span>
                          )}

                          {question.orgao && (
                            <span className={darkCard.tags.neutral}>{question.orgao}</span>
                          )}

                          {question.year && (
                            <span className={darkCard.tags.neutral}>Ano {question.year}</span>
                          )}

                          {linkedSubjects.length ? (
                            linkedSubjects.map((subject) => (
                              <span key={subject.id || subject.name} className={darkCard.tags.subject}>
                                {subject.name}
                              </span>
                            ))
                          ) : (
                            <span className={darkCard.tags.muted}>Sem assunto</span>
                          )}

                          {renderDifficultyStars(question.difficulty_level, true, question.id)}
                        </div>

                        {disciplineNames.length > 0 && (
                          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/30">
                            {disciplineNames.join(", ")}
                          </p>
                        )}

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {evaluatedTopics.length > 0 ? (
                            evaluatedTopics.map((topic) => (
                              <span key={topic} className="rounded-full border border-emerald-400/25 bg-emerald-400/[0.10] px-3 py-1 text-xs font-bold text-emerald-200">
                                {topic}
                              </span>
                            ))
                          ) : (
                            <>
                              <span className="rounded-full border border-amber-400/30 bg-amber-400/[0.10] px-3 py-1 text-xs font-bold text-amber-200">
                                Sem tópicos avaliados
                              </span>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.preventDefault();
                                  void detectEvaluatedTopics(question.id);
                                }}
                                disabled={detectingTopicsId === question.id}
                                className="inline-flex items-center gap-1.5 rounded-full border border-orange-400/30 bg-orange-400/[0.10] px-3 py-1 text-xs font-bold text-orange-200 transition hover:border-orange-400/50 hover:bg-orange-400/[0.16] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {detectingTopicsId === question.id ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                Detectar com IA
                              </button>
                            </>
                          )}
                        </div>

                        {!inlineEditingIds.includes(question.id) && (
                          <div
                            className={`richtext-editor ${darkCard.statement}`}
                            dangerouslySetInnerHTML={{ __html: question.statement || "" }}
                          />
                        )}
                      </div>
                    </summary>

                    <div className="px-6 pb-6 md:px-8 md:pb-8">
                      {inlineEditingIds.includes(question.id) ? null : (
                        <>
                      {question.image_url && (
                        <img
                          src={question.image_url}
                          alt="Imagem da questão"
                          className="mb-4 max-h-48 w-full rounded-2xl border border-white/[0.08] object-contain"
                        />
                      )}

                      <div className="mb-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() =>
                            answerEditQuestionId === question.id
                              ? setAnswerEditQuestionId(null)
                              : startAnswerEdit(question)
                          }
                          className="inline-flex items-center gap-2 rounded-2xl border border-orange-400/30 bg-orange-400/[0.08] px-3 py-2 text-xs font-bold text-orange-400 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-400/50 hover:bg-orange-400/[0.14]"
                        >
                          <CircleDot size={15} />
                          Mudar resposta
                        </button>
                      </div>

                      {isTrueFalseQuestion(question) ? (
                        <div className="flex gap-3">
                          {[...alternatives]
                            .sort((a, b) => {
                              const aLabel = (a.label || a.text || "").toLowerCase();
                              const aIsCerto = aLabel === "c" || aLabel === "certo" || aLabel.includes("certo");
                              return aIsCerto ? -1 : 1;
                            })
                            .map((alt, displayIndex) => {
                              const editingAnswer = answerEditQuestionId === question.id;
                              const draftCorrect = answerDraft[question.id] || "";
                              const isMarkedCorrect = editingAnswer ? draftCorrect === alt.id : Boolean(alt.is_correct);
                              const altLabel = (alt.label || alt.text || "").toLowerCase();
                              const isCerto = altLabel === "c" || altLabel === "certo" || altLabel.includes("certo");

                              const inner = (
                                <div className={`flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-2 transition ${
                                  isMarkedCorrect
                                    ? isCerto
                                      ? "border-emerald-500/40 bg-emerald-500/10"
                                      : "border-red-500/40 bg-red-500/10"
                                    : editingAnswer
                                      ? "border-white/[0.08] bg-white/[0.03] hover:border-orange-400/30 hover:bg-orange-400/[0.07]"
                                      : "border-white/[0.07] bg-white/[0.03]"
                                }`}>
                                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${
                                    isMarkedCorrect
                                      ? isCerto
                                        ? "border-emerald-500 bg-emerald-500/20"
                                        : "border-red-500 bg-red-500/20"
                                      : "border-white/[0.15] bg-white/[0.06]"
                                  }`}>
                                    {isMarkedCorrect && <span className="text-base leading-none">{OWL_MARK}</span>}
                                  </span>
                                  <span className={`font-bold text-sm ${
                                    isMarkedCorrect
                                      ? isCerto ? "text-emerald-300" : "text-red-300"
                                      : "text-white/40"
                                  }`}>
                                    {isCerto ? "Certo" : "Errado"}
                                  </span>
                                </div>
                              );

                              return editingAnswer ? (
                                <button
                                  key={`${alt.id || alt.label || "tf"}-${displayIndex}`}
                                  type="button"
                                  onClick={() => setAnswerDraft((current) => ({ ...current, [question.id]: alt.id }))}
                                  aria-label={`Marcar ${isCerto ? "Certo" : "Errado"} como resposta`}
                                  className="flex flex-1"
                                >
                                  {inner}
                                </button>
                              ) : (
                                <div key={`${alt.id || alt.label || "tf"}-${displayIndex}`} className="flex flex-1">
                                  {inner}
                                </div>
                              );
                            })}
                        </div>
                      ) : (
                      <div className="grid gap-3">
                        {alternatives.map((alt, altIndex) => {
                          const editingAnswer = answerEditQuestionId === question.id;
                          const draftCorrect = answerDraft[question.id] || "";
                          const isMarkedCorrect = editingAnswer ? draftCorrect === alt.id : Boolean(alt.is_correct);

                          return (
                            <div
                              key={`${alt.id || alt.label || "tf"}-${altIndex}`}
                              className={
                                isMarkedCorrect
                                  ? darkCard.alts.correct
                                  : `${darkCard.alts.base} cursor-default`
                              }
                            >
                              <div className="flex items-start gap-3">
                                {editingAnswer ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setAnswerDraft((current) => ({ ...current, [question.id]: alt.id }))
                                    }
                                    aria-label={`Marcar alternativa ${alt.label || altIndex + 1} como correta`}
                                    className={
                                      isMarkedCorrect
                                        ? darkCard.alts.labelCorrect
                                        : `${darkCard.alts.labelBase} transition hover:border-orange-400`
                                    }
                                  >
                                    {isMarkedCorrect
                                      ? <span className="text-base leading-none" aria-label="Alternativa correta">{OWL_MARK}</span>
                                      : (alt.label || String(altIndex + 1))}
                                  </button>
                                ) : (
                                  <span className={isMarkedCorrect ? darkCard.alts.labelCorrect : darkCard.alts.labelBase}>
                                    {isMarkedCorrect ? <span className="text-base leading-none" aria-label="Alternativa correta">{OWL_MARK}</span> : (alt.label || String(altIndex + 1))}
                                  </span>
                                )}
                                <div
                                  className={`${darkCard.alts.text} min-w-0 flex-1`}
                                  dangerouslySetInnerHTML={{ __html: alt.text || "" }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      )}

                      {answerEditQuestionId === question.id && (
                        <div className="mt-3 flex flex-wrap justify-end gap-2 rounded-2xl border border-orange-400/20 bg-orange-400/[0.06] p-3">
                          <PremiumButton
                            variant="secondary"
                            icon={<X size={15} />}
                            onClick={() => setAnswerEditQuestionId(null)}
                          >
                            Cancelar
                          </PremiumButton>
                          <PremiumButton
                            icon={<Save size={15} />}
                            disabled={savingAnswerId === question.id}
                            onClick={() => saveCardAnswer(question.id)}
                          >
                            {savingAnswerId === question.id ? "Salvando..." : "Salvar resposta"}
                          </PremiumButton>
                        </div>
                      )}

                      {question.explanation_text && (
                        <details className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.03]">
                          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-white/65">
                            Ver explicação da IA
                          </summary>
                          <div className="border-t border-white/[0.06] px-4 py-3 text-sm leading-6 text-white/45">
                            {question.explanation_text}
                            <ExplanationAuthorCard />
                          </div>
                        </details>
                      )}

                      <div className="mt-4 border-t border-white/[0.06] pt-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="flex items-start gap-3">
                            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-orange-400/25 bg-orange-400/[0.08] text-orange-300">
                              <ClipboardList size={17} />
                            </span>
                            <div>
                              <p className="text-xs font-black uppercase tracking-[0.16em] text-white/35">
                                Uso em simulados
                              </p>
                              <p className="mt-1 text-sm font-semibold text-white/70">
                                {simuladoLinks.length > 0
                                  ? `Presente em ${simuladoLinks.length} simulado${simuladoLinks.length > 1 ? "s" : ""}`
                                  : "Ainda nao inserida em simulados"}
                              </p>
                            </div>
                          </div>

                          {simuladoLinks.length > 0 && (
                            <div className="flex min-w-0 flex-1 flex-wrap gap-2 lg:justify-end">
                              {simuladoLinks.map((simulado) => (
                                <Link
                                  key={simulado.id}
                                  href={`/simulados/${simulado.id}`}
                                  className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-white/65 transition hover:border-orange-400/35 hover:bg-orange-400/[0.08] hover:text-orange-200"
                                  title={simulado.title}
                                >
                                  <span className="max-w-[15rem] truncate">{simulado.title}</span>
                                  {simulado.orderNumber && (
                                    <span className="shrink-0 text-white/30">#{simulado.orderNumber}</span>
                                  )}
                                  {simulado.relationStatus === "annulled" && (
                                    <span className="shrink-0 rounded-full border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-amber-300">
                                      Anulada
                                    </span>
                                  )}
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className={darkCard.footer}>

                        <PremiumButton
                          variant="dark"
                          icon={<Pencil size={16} />}
                          onClick={() => setInlineEditingIds((c) => c.includes(question.id) ? c.filter((i) => i !== question.id) : [...c, question.id])}
                        >
                          {inlineEditingIds.includes(question.id) ? "Fechar edição" : "Editar"}
                        </PremiumButton>

                        <Link href={`/questoes/${question.id}/preview`} target="_blank">
                          <PremiumButton variant="dark" icon={<Eye size={16} />}>
                            Visualizar
                          </PremiumButton>
                        </Link>

                        {question.status !== "published" && (
                          <PremiumButton
                            variant="dark-primary"
                            icon={<CheckCircle2 size={16} />}
                            onClick={() =>
                              toggleQuestionPublishStatus(question.id, question.status || "draft")
                            }
                          >
                            Publicar
                          </PremiumButton>
                        )}

                        {question.status === "published" && (
                          <PremiumButton
                            variant="dark"
                            icon={<Send size={16} />}
                            onClick={() => {
                              void openAddToSimuladoModal([question.id]);
                            }}
                          >
                            Simulado
                          </PremiumButton>
                        )}

                        <PremiumButton
                          variant={question.status === "annulled" ? "dark-success" : "dark-warning"}
                          icon={question.status === "annulled" ? <CheckCircle2 size={16} /> : <Ban size={16} />}
                          onClick={() => annulQuestion(question.id, question.status || "draft")}
                        >
                          {question.status === "annulled" ? "Reativar" : "Anular"}
                        </PremiumButton>

                        <PremiumButton
                          variant="dark"
                          icon={<Copy size={16} />}
                          onClick={() => setUseAsTemplateQuestion(question)}
                        >
                          Usar como modelo
                        </PremiumButton>

                        <PremiumButton
                          variant={question.status === "archived" ? "dark" : "dark-danger"}
                          icon={question.status === "archived" ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                          onClick={() => toggleQuestionArchiveStatus(question.id, question.status || "draft")}
                        >
                          {question.status === "archived" ? "Desarquivar" : "Arquivar"}
                        </PremiumButton>

                        <PremiumButton
                          variant="dark-danger"
                          icon={<Trash2 size={16} />}
                          onClick={() =>
                            setConfirm({
                              title: "Excluir questão",
                              message: "Deseja realmente excluir esta questão? Essa ação não poderá ser desfeita.",
                              onConfirm: () => deleteQuestion(question.id),
                            })
                          }
                        >
                          Excluir
                        </PremiumButton>
                      </div>
                        </>
                      )}

                      {inlineEditingIds.includes(question.id) && (
                        <InlineQuestionEditor
                          question={question}
                          disciplines={disciplines}
                          subjects={subjects}
                          boards={boards}
                          saveAllTrigger={saveAllTrigger}
                          onCancel={() => setInlineEditingIds((c) => c.filter((i) => i !== question.id))}
                          onSaved={(updates) => {
                            if (updates) {
                              setQuestions((current) =>
                                current.map((q) => q.id === question.id ? { ...q, ...updates } : q),
                              );
                            }
                            setInlineEditingIds((c) => c.filter((i) => i !== question.id));
                            router.refresh();
                          }}
                          setActionModal={setActionModal}
                        />
                      )}
                    </div>
                  </details>
                  </div>
                );
              })}
            </div>
          )}
          </div>
        </div>

        {viewMode === "multiple" && filteredQuestions.length > QUESTIONS_PER_PAGE && (
          <div className="mt-5 flex flex-col gap-3 rounded-3xl border border-white/[0.07] bg-white/[0.03] p-4 text-sm shadow-xl shadow-black/20 sm:flex-row sm:items-center sm:justify-between">
            <div className="font-semibold text-white/40">
              Mostrando {(safeCurrentPage - 1) * QUESTIONS_PER_PAGE + 1}
              {" "}a {Math.min(safeCurrentPage * QUESTIONS_PER_PAGE, filteredQuestions.length)}
              {" "}de {filteredQuestions.length} questão(ões)
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={safeCurrentPage <= 1}
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 font-bold text-white/55 transition hover:bg-white/[0.08] hover:text-white/80 disabled:cursor-not-allowed disabled:opacity-30"
              >
                Anterior
              </button>
              <span className="rounded-xl bg-white/[0.12] px-4 py-2 font-bold text-white">
                {safeCurrentPage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safeCurrentPage >= totalPages}
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 font-bold text-white/55 transition hover:bg-white/[0.08] hover:text-white/80 disabled:cursor-not-allowed disabled:opacity-30"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>

      <SelectionGhostBar
        count={selectedIds.length + publicationQueueIds.length + (isViewingPublicationQueue && publicationQueueVisibleIds.length > 0 && selectedIds.length === 0 ? publicationQueueVisibleIds.length : 0) + inlineEditingIds.length}
        actions={[
          ...(inlineEditingIds.length > 1
            ? [{ label: "Salvar todas as alterações", icon: <Save size={14} />, onClick: () => setSaveAllTrigger((t) => t + 1), variant: "primary" as const }]
            : inlineEditingIds.length === 1
              ? [{ label: "Salvar questão", icon: <Save size={14} />, onClick: () => setSaveAllTrigger((t) => t + 1), variant: "primary" as const }]
              : []),
          ...(isViewingPublicationQueue && publicationQueueVisibleIds.length > 0 && selectedIds.length === 0
            ? [
                {
                  label: "Publicar essa fila",
                  icon: <BadgeCheck size={14} />,
                  onClick: publishAllCurrentQueueItems,
                  variant: "primary" as const,
                },
              ]
            : []),
          ...(publicationQueueIds.length > 0
            ? [
                {
                  label: "Formar fila de publicação",
                  icon: <UsersRound size={14} />,
                  onClick: formPublicationQueue,
                  variant: "primary" as const,
                },
                {
                  label: "Limpar fila marcada",
                  icon: <XCircle size={14} />,
                  onClick: () => setPublicationQueueIds([]),
                  variant: "secondary" as const,
                },
              ]
            : []),
          ...(selectedIds.length > 0
            ? status === READY_TO_PUBLISH_STATUS
              ? [
                  { label: "Publicar questão", icon: <BadgeCheck size={14} />, onClick: publishSelectedQueueItems, variant: "primary" as const },
                  { label: "Publicar fila", icon: <Send size={14} />, onClick: publishAllCurrentQueueItems, variant: "primary" as const },
                  { label: "Edição em massa", icon: <Pencil size={14} />, onClick: () => setShowPublicationQueueBulkEditModal(true), variant: "primary" as const },
                  { label: "Rascunho", icon: <XCircle size={14} />, onClick: () => applyBulkStatus("draft"), variant: "secondary" as const },
                  { label: "Limpar seleção", icon: <XCircle size={14} />, onClick: () => setSelectedIds([]), variant: "secondary" as const },
                ]
              : [
                  ...(selectedIds.every((id) => questions.find((question) => question.id === id)?.status === "published")
                    ? [{ label: "Adicionar ao simulado", icon: <ListPlus size={14} />, onClick: openAddToSimuladoModal, variant: "primary" as const }]
                    : []),
                  ...(selectedIds.length > 1 ? [{ label: "Editar em massa", icon: <Send size={14} />, onClick: () => setShowBulkStatusModal(true), variant: "primary" as const }] : []),
                  { label: "Enviar para rascunho", icon: <XCircle size={14} />, onClick: () => applyBulkStatus("draft"), variant: "secondary" as const },
                  { label: "Limpar seleção", icon: <XCircle size={14} />, onClick: () => setSelectedIds([]), variant: "secondary" as const },
                  { label: "Excluir", icon: <Trash2 size={14} />, onClick: deleteSelected, variant: "danger" as const },
                ]
            : []),
        ]}
      />
      </section>

      {useAsTemplateQuestion && (
        <UseAsTemplateModal
          question={useAsTemplateQuestion}
          subjects={subjects}
          boards={boards}
          onClose={() => setUseAsTemplateQuestion(null)}
          onCreated={(newQ) => {
            setFeedback({ type: "success", message: newQ.status === "published" ? `Questão ${newQ.code} publicada com sucesso.` : `Questão ${newQ.code} salva como rascunho.` });
            setUseAsTemplateQuestion(null);
          }}
        />
      )}
    </main>
  );
}


function UseAsTemplateModal({
  question,
  subjects,
  boards,
  onClose,
  onCreated,
}: {
  question: any;
  subjects: any[];
  boards: any[];
  onClose: () => void;
  onCreated: (q: { id: string; code: string; status: string }) => void;
}) {
  const estudoTopBoard = boards.find((b) => /estudo\s*top/i.test(b.name || ""));
  const sortedAlts = [...(question.question_alternatives || [])].sort(
    (a: any, b: any) => (a.order_number || 0) - (b.order_number || 0),
  );
  const linkedSubjects = extractQuestionSubjects(question);
  const currentYear = new Date().getFullYear();
  const originalBoardId = question.exam_boards?.id || question.exam_board_id || null;
  const inspirationBoardId = question.inspiration_board?.id ||
    (/estudo\s*top/i.test(question.exam_boards?.name || "") ? null : originalBoardId);
  const inspirationBoardName = boards.find((board) => board.id === inspirationBoardId)?.name || null;

  const [statement, setStatement] = useState<string>(question.statement || "");
  const [alternatives, setAlternatives] = useState(
    sortedAlts.map((alt: any) => ({
      label: alt.label || "",
      text: alt.text || "",
      is_correct: Boolean(alt.is_correct),
    })),
  );
  const [subjectIds, setSubjectIds] = useState<string[]>(
    linkedSubjects.map((s: any) => s.id).filter(Boolean),
  );
  const [difficulty, setDifficulty] = useState<number>(question.difficulty_level || 3);
  const [savingAs, setSavingAs] = useState<"draft" | "published" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function markCorrect(index: number) {
    setAlternatives((curr) => curr.map((a, i) => ({ ...a, is_correct: i === index })));
  }

  async function save(status: "draft" | "published") {
    if (!estudoTopBoard) {
      setError("Banca 'Estudo TOP' não cadastrada. Adicione-a em Bancas antes de continuar.");
      return;
    }
    if (!subjectIds.length) {
      setError("Selecione pelo menos um assunto.");
      return;
    }
    if (status === "published" && !alternatives.some((a) => a.is_correct)) {
      setError("Marque a alternativa correta antes de publicar.");
      return;
    }
    setSavingAs(status);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_type: question.question_type || "multiple_choice",
          statement,
          alternatives,
          subject_id: subjectIds[0],
          subject_ids: subjectIds,
          exam_board_id: estudoTopBoard.id,
          inspiration_board_id: inspirationBoardId,
          year: currentYear,
          difficulty_level: difficulty,
          status,
          source_origin: "bank",
          orgao: question.orgao || null,
          use_as_template: true,
        }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.message || "Erro ao criar questão."); return; }
      onCreated({ id: data.questionId, code: data.questionCode, status });
    } catch {
      setError("Erro inesperado. Tente novamente.");
    } finally {
      setSavingAs(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] overflow-y-auto bg-slate-950/80 backdrop-blur-sm">
      <div className="flex min-h-full items-start justify-center p-4 sm:p-8">
        <div className="my-8 w-full max-w-3xl rounded-[2rem] border border-white/[0.08] bg-[#07111F] shadow-2xl shadow-black/60">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-orange-400/30 bg-orange-400/10 p-2.5 text-orange-300">
                <Copy size={18} />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-orange-300">Usar como modelo</p>
                <p className="mt-0.5 text-sm font-semibold text-white/50">
                  Baseado em {question.code || "questão"} · Banca Estudo TOP · {currentYear}
                </p>
              </div>
            </div>
            <button type="button" onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-white/50 transition hover:bg-white/[0.10] hover:text-white">
              <X size={18} />
            </button>
          </div>

          {inspirationBoardName && (
            <div className="mx-6 mt-5 flex items-center justify-between rounded-2xl border border-violet-400/20 bg-violet-400/[0.08] px-4 py-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-300">Informação interna</p>
                <p className="mt-1 text-sm font-bold text-white/80">Inspirada na banca {inspirationBoardName}</p>
              </div>
              <span className="rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-violet-200">Somente admin</span>
            </div>
          )}

          {/* Body */}
          <div className="space-y-6 px-6 py-6">
            {/* Meta */}
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-orange-500/30 bg-orange-500/[0.12] px-3 py-1 text-xs font-black text-orange-300">
                {estudoTopBoard?.name ?? "Estudo TOP"}
              </span>
              <span className="rounded-full border border-white/[0.09] bg-white/[0.05] px-3 py-1 text-xs font-semibold text-white/50">{currentYear}</span>
              <span className="rounded-full border border-white/[0.09] bg-white/[0.05] px-3 py-1 text-xs font-semibold text-white/50">
                {question.question_type === "true_false" ? "Certo / Errado" : "Múltipla escolha"}
              </span>
              <span className="rounded-full border border-white/[0.09] bg-white/[0.05] px-3 py-1 text-xs font-semibold text-white/40">Nova questão</span>
            </div>

            {/* Subjects */}
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-white/30">Assunto</p>
              <SubjectMultiSelect subjects={subjects} selectedIds={subjectIds} onChange={setSubjectIds} dark />
            </div>

            {/* Difficulty */}
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-white/30">Dificuldade</p>
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button key={star} type="button" onClick={() => setDifficulty(star)}
                    className={`text-xl leading-none transition hover:scale-110 active:scale-95 ${star <= difficulty ? "text-amber-400" : "text-white/15"} hover:text-amber-300`}>
                    ★
                  </button>
                ))}
              </div>
            </div>

            {/* Statement */}
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-white/30">Enunciado</p>
              <RichTextEditor value={statement} onChange={setStatement}
                placeholder="Enunciado da questão..."
                minRows={4} dark
                className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-4 text-sm leading-6 text-slate-200 outline-none focus:ring-2 focus:ring-orange-400/20" />
            </div>

            {/* Alternatives */}
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-white/30">Alternativas</p>
              <div className="space-y-2">
                {alternatives.map((alt, idx) => (
                  <div key={idx} className={`flex items-start gap-3 rounded-2xl border p-3 transition ${alt.is_correct ? "border-emerald-500/30 bg-emerald-500/[0.07]" : "border-white/[0.06] bg-white/[0.03]"}`}>
                    <button type="button" onClick={() => markCorrect(idx)}
                      className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition ${alt.is_correct ? "border-emerald-500 bg-emerald-500/20 text-base" : "border-white/[0.15] bg-white/[0.04] text-xs font-black text-white/50 hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300"}`}>
                      {alt.is_correct ? "🦉" : (alt.label || String.fromCharCode(65 + idx))}
                    </button>
                    <RichTextEditor
                      value={alt.text}
                      onChange={(v) => setAlternatives((curr) => curr.map((a, i) => i === idx ? { ...a, text: v } : a))}
                      placeholder={`Alternativa ${alt.label || String.fromCharCode(65 + idx)}`}
                      compact minRows={2} dark
                      className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-2 text-sm text-white/70 outline-none" />
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <p className="rounded-2xl border border-red-400/30 bg-red-400/[0.08] px-4 py-3 text-sm font-semibold text-red-300">{error}</p>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 border-t border-white/[0.07] px-6 py-4">
            <PremiumButton variant="secondary" onClick={onClose} disabled={!!savingAs}>Cancelar</PremiumButton>
            <PremiumButton variant="secondary" onClick={() => void save("draft")} disabled={!!savingAs}
              icon={savingAs === "draft" ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}>
              {savingAs === "draft" ? "Salvando..." : "Salvar rascunho"}
            </PremiumButton>
            <PremiumButton onClick={() => void save("published")} disabled={!!savingAs}
              icon={savingAs === "published" ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}>
              {savingAs === "published" ? "Publicando..." : "Publicar questão"}
            </PremiumButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function InlineQuestionEditor({
  question,
  disciplines,
  subjects,
  boards,
  saveAllTrigger,
  onCancel,
  onSaved,
  setActionModal,
}: {
  question: any;
  disciplines: any[];
  subjects: any[];
  boards: any[];
  saveAllTrigger?: number;
  onCancel: () => void;
  onSaved: (updates?: Record<string, any>) => void;
  setActionModal: (modal: QuestionActionModalState) => void;
}) {
  const sortedAlternatives = [...(question.question_alternatives || [])].sort(
    (a: any, b: any) => (a.order_number || 0) - (b.order_number || 0),
  );
  const linkedSubjects = extractQuestionSubjects(question);
  const initialDisciplineId =
    linkedSubjects[0]?.discipline_id ||
    linkedSubjects[0]?.disciplines?.id ||
    question.subjects?.discipline_id ||
    "";

  const [questionType, setQuestionType] = useState<"multiple_choice" | "true_false">(
    question.question_type === "true_false" ? "true_false" : "multiple_choice",
  );
  const [disciplineId, setDisciplineId] = useState(initialDisciplineId);
  const [subjectIds, setSubjectIds] = useState<string[]>(
    linkedSubjects.map((subject: any) => subject.id).filter(Boolean),
  );
  const [boardId, setBoardId] = useState(question.exam_board_id || question.exam_boards?.id || "");
  const [year, setYear] = useState(question.year ? String(question.year) : "");
  const [difficulty, setDifficulty] = useState<number | null>(question.difficulty_level || null);
  const [status, setStatus] = useState(question.status || "draft");
  const [statement, setStatement] = useState(question.statement || "");
  const [explanation, setExplanation] = useState(question.explanation_text || "");
  const [evaluatedTopics, setEvaluatedTopics] = useState<string[]>(normalizeEvaluatedTopics(question.evaluated_topics));
  const [alternatives, setAlternatives] = useState(
    sortedAlternatives.map((alt: any) => ({
      id: alt.id,
      label: alt.label,
      text: alt.text || "",
      image_url: alt.image_url || "",
      is_correct: Boolean(alt.is_correct),
    })),
  );
  const [saving, setSaving] = useState(false);

  const filteredSubjects = subjects.filter((subject) => subject.discipline_id === disciplineId);
  const selectedDiscipline = disciplines.find((d) => d.id === disciplineId);
  const selectedSubjectsList = subjects.filter((s) => subjectIds.includes(s.id));
  const selectedBoardItem = boards.find((b) => b.id === boardId);

  const [generatingAI, setGeneratingAI] = useState(false);

  useEffect(() => {
    if (!saveAllTrigger) return;
    saveImmediate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveAllTrigger]);

  async function generateExplanation() {
    if (!statement || !alternatives.some((a) => a.is_correct)) return;
    setGeneratingAI(true);
    try {
      const response = await adminFetch("/api/admin/questions/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statement,
          question_type: questionType,
          alternatives,
          discipline: selectedDiscipline?.name,
          subject: selectedSubjectsList.map((s: any) => s.name).join(", "),
          board: selectedBoardItem?.name,
        }),
      });
      const result = await response.json();
      if (result.ok && result.explanation) setExplanation(result.explanation);
    } catch {
      // silencia — o usuário pode tentar novamente
    } finally {
      setGeneratingAI(false);
    }
  }

  function markCorrect(index: number) {
    setAlternatives((current) =>
      current.map((alternative, currentIndex) => ({
        ...alternative,
        is_correct: currentIndex === index,
      })),
    );
  }

  function updateAlternative(index: number, text: string) {
    setAlternatives((current) =>
      current.map((alternative, currentIndex) =>
        currentIndex === index ? { ...alternative, text } : alternative,
      ),
    );
  }

  async function saveImmediate() {
    if (saving) return;

    if (!subjectIds.length || !boardId || !year || !difficulty) {
      setActionModal({
        open: true,
        tone: "error",
        title: "Dados incompletos",
        message: `Não foi possível salvar a questão ${question.code || ""}. Informe assunto, banca, ano e dificuldade antes de salvar.`,
        onClose: () => setActionModal(null),
      });
      return;
    }

    if (!alternatives.some((alternative) => alternative.is_correct)) {
      setActionModal({
        open: true,
        tone: "error",
        title: "Gabarito obrigatório",
        message: `Não foi possível salvar a questão ${question.code || ""}. Marque uma alternativa correta antes de salvar.`,
        onClose: () => setActionModal(null),
      });
      return;
    }

    if (evaluatedTopics.length === 0) {
      setActionModal({
        open: true,
        tone: "error",
        title: "Tópicos obrigatórios",
        message: `Não foi possível salvar a questão ${question.code || ""}. Informe pelo menos um tópico avaliado antes de salvar.`,
        onClose: () => setActionModal(null),
      });
      return;
    }

    setSaving(true);
    try {
      const response = await adminFetch(`/api/admin/questions/${question.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_type: questionType,
          subject_id: subjectIds[0],
          subject_ids: subjectIds,
          exam_board_id: boardId,
          statement,
          image_url: question.image_url || "",
          explanation_text: explanation,
          year: Number(year),
          difficulty_level: difficulty,
          status,
          evaluated_topics: evaluatedTopics,
          alternatives,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Erro ao salvar questão.");
      const selectedBoard = boards.find((b) => b.id === boardId) || null;
      const updatedSubjectObjects = subjectIds.map((id) => {
        const subj = subjects.find((s) => s.id === id);
        if (!subj) return null;
        return { subjects: { id: subj.id, name: subj.name, discipline_id: subj.discipline_id, disciplines: disciplines.find((d) => d.id === subj.discipline_id) || null } };
      }).filter(Boolean);
      onSaved({
        statement,
        question_type: questionType,
        exam_board_id: boardId,
        exam_boards: selectedBoard,
        difficulty_level: difficulty,
        year: Number(year) || null,
        status,
        explanation_text: explanation,
        evaluated_topics: evaluatedTopics,
        question_subjects: updatedSubjectObjects,
        question_alternatives: alternatives.map((alt: any, i: number) => ({ ...alt, order_number: i + 1 })),
      });
    } catch (error) {
      setActionModal({
        open: true,
        tone: "error",
        title: "Erro ao salvar",
        message: `Não foi possível salvar a questão ${question.code || ""}. ${error instanceof Error ? error.message : "Tente novamente."}`,
        onClose: () => setActionModal(null),
      });
    } finally {
      setSaving(false);
    }
  }

  async function save(nextStatus?: string) {
    if (!subjectIds.length || !boardId || !year || !difficulty) {
      setActionModal({
        open: true,
        tone: "error",
        title: "Dados incompletos",
        message: "Informe assunto, banca, ano e dificuldade antes de salvar.",
        onClose: () => setActionModal(null),
      });
      return;
    }

    if (!alternatives.some((alternative) => alternative.is_correct)) {
      setActionModal({
        open: true,
        tone: "error",
        title: "Gabarito obrigatório",
        message: "Marque uma alternativa correta antes de salvar.",
        onClose: () => setActionModal(null),
      });
      return;
    }

    if (evaluatedTopics.length === 0) {
      setActionModal({
        open: true,
        tone: "error",
        title: "Tópicos obrigatórios",
        message: "Informe pelo menos um tópico avaliado antes de salvar.",
        onClose: () => setActionModal(null),
      });
      return;
    }

    setActionModal({
      open: true,
      tone: nextStatus === "published" ? "publish" : "confirm",
      title: nextStatus === "published" ? "Publicar questão" : "Salvar questão",
      message: nextStatus === "published" ? "Salvar alterações e publicar esta questão?" : "Salvar as alterações desta questão?",
      primaryLabel: nextStatus === "published" ? "Publicar" : "Salvar",
      secondaryLabel: "Cancelar",
      onClose: () => setActionModal(null),
      onSecondary: () => setActionModal(null),
      onPrimary: async () => {
        setSaving(true);
        setActionModal({
          open: true,
          tone: nextStatus === "published" ? "publish" : "confirm",
          title: nextStatus === "published" ? "Publicar questao" : "Salvar questao",
          message: "Salvando alteracoes...",
          loading: true,
        });
        try {
          const response = await adminFetch(`/api/admin/questions/${question.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              question_type: questionType,
              subject_id: subjectIds[0],
              subject_ids: subjectIds,
              exam_board_id: boardId,
              statement,
              image_url: question.image_url || "",
              explanation_text: explanation,
              year: Number(year),
              difficulty_level: difficulty,
              status: nextStatus || status,
              evaluated_topics: evaluatedTopics,
              alternatives,
            }),
          });
          const result = await response.json();
          if (!response.ok || !result.ok) throw new Error(result.message || "Erro ao salvar questão.");
          const selectedBoard = boards.find((b) => b.id === boardId) || null;
          const updatedSubjectObjects = subjectIds.map((id) => {
            const subj = subjects.find((s) => s.id === id);
            if (!subj) return null;
            return { subjects: { id: subj.id, name: subj.name, discipline_id: subj.discipline_id, disciplines: disciplines.find((d) => d.id === subj.discipline_id) || null } };
          }).filter(Boolean);
          const immediateUpdates = {
            statement,
            question_type: questionType,
            exam_board_id: boardId,
            exam_boards: selectedBoard,
            difficulty_level: difficulty,
            year: Number(year) || null,
            status: nextStatus || status,
            explanation_text: explanation,
            evaluated_topics: evaluatedTopics,
            question_subjects: updatedSubjectObjects,
            question_alternatives: alternatives.map((alt: any, i: number) => ({ ...alt, order_number: i + 1 })),
          };
          setActionModal({
            open: true,
            tone: "success",
            title: nextStatus === "published" ? "Questão publicada" : "Questão salva",
            message: nextStatus === "published" ? "Questão publicada com sucesso." : "Alterações salvas com sucesso.",
            onClose: () => {
              setActionModal(null);
              onSaved(immediateUpdates);
            },
          });
        } catch (error) {
          setActionModal({
            open: true,
            tone: "error",
            title: "Não foi possível salvar",
            message: error instanceof Error ? error.message : "Erro ao salvar questão.",
            onClose: () => setActionModal(null),
          });
        } finally {
          setSaving(false);
        }
      },
    });
  }

  return (
    <div className="overflow-hidden rounded-[2rem] border border-white/[0.08] bg-[#0A1322] shadow-2xl shadow-black/40">
      {/* Barra superior */}
      <div className="flex flex-col gap-3 border-b border-white/[0.07] bg-black/20 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-400">Edição inline</p>
          <p className="mt-0.5 text-xs text-white/40">Edite a questão sem sair da tela de listagem.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 text-sm font-semibold text-white/60 transition hover:border-white/[0.15] hover:text-white/80"
          >
            <X size={14} />
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => save()}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-white/[0.10] bg-white/[0.07] px-4 text-sm font-semibold text-white/80 transition hover:bg-white/[0.12] disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Salvar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => save("published")}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-400 px-4 text-sm font-bold text-white shadow-lg shadow-orange-500/25 transition hover:opacity-90 disabled:opacity-50"
          >
            <BadgeCheck size={14} />
            Publicar
          </button>
        </div>
      </div>

      <div className="space-y-4 p-5">
        {/* Grade de metadados */}
        <div className="grid gap-3 md:grid-cols-6">
          <SimpleSelectDropdown
            label="Tipo"
            value={questionType}
            onChange={(v) => setQuestionType(v as "multiple_choice" | "true_false")}
            options={[
              { value: "multiple_choice", label: "Alternativas" },
              { value: "true_false", label: "Assertivas" },
            ]}
          />

          <SimpleSelectDropdown
            label="Disciplina"
            value={disciplineId}
            onChange={(v) => { setDisciplineId(v); setSubjectIds([]); }}
            options={[
              { value: "", label: "Selecione" },
              ...disciplines.map((d) => ({ value: d.id, label: d.name })),
            ]}
          />

          <div className="md:col-span-2">
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Assuntos</label>
            <SubjectMultiSelect subjects={filteredSubjects} selectedIds={subjectIds} onChange={setSubjectIds} emptyLabel="Selecione" disciplineId={disciplineId} />
          </div>

          <SimpleSelectDropdown
            label="Banca"
            value={boardId}
            onChange={setBoardId}
            options={[
              { value: "", label: "Selecione" },
              ...boards.map((b) => ({ value: b.id, label: b.name })),
            ]}
          />

          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Ano</label>
            <input
              value={year}
              onChange={(event) => setYear(event.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="2025"
              className="h-11 w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3 text-sm font-semibold text-white/75 outline-none transition placeholder:text-white/25 hover:border-white/[0.14] focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
            />
          </div>
        </div>

        {/* Dificuldade + Status */}
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Dificuldade</span>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setDifficulty(star)}
                className={difficulty && star <= difficulty ? "text-amber-400" : "text-white/20 hover:text-amber-400"}
              >
                <Star size={17} fill={difficulty && star <= difficulty ? "currentColor" : "none"} />
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Status</span>
            <select
              value={status}
              onChange={(event: any) => setStatus(event.target.value)}
              className="h-9 rounded-2xl border border-white/[0.08] bg-[#0D1B2E] px-3 text-sm font-semibold text-white/70 outline-none transition hover:border-white/[0.14] focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
            >
              <option value="pending_review">Pendente revisão</option>
              <option value="ready_to_publish">Fila de publicação</option>
              <option value="published">Publicada</option>
              <option value="draft">Rascunho</option>
              <option value="archived">Arquivada</option>
            </select>
          </div>
        </div>

        {/* Enunciado */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
          <RichTextEditor value={statement} onChange={setStatement} placeholder="Enunciado" minRows={4} dark className="w-full rounded-xl border border-white/[0.06] bg-[#07111F] px-4 py-3 text-base text-slate-100 outline-none focus:ring-2 focus:ring-orange-400/[0.08]" />
        </div>

        {/* Alternativas */}
        {questionType === "true_false" ? (
          <div className="flex gap-3">
            {[...alternatives]
              .sort((a, b) => {
                const aLabel = (a.label || a.text || "").toLowerCase();
                return aLabel === "c" || aLabel === "certo" || aLabel.includes("certo") ? -1 : 1;
              })
              .map((alt, displayIndex) => {
                const originalIndex = alternatives.findIndex((a) => (a.id ? a.id === alt.id : a === alt));
                const altLabel = (alt.label || alt.text || "").toLowerCase();
                const isCerto = altLabel === "c" || altLabel === "certo" || altLabel.includes("certo");
                return (
                  <button
                    key={alt.id || alt.label || displayIndex}
                    type="button"
                    onClick={() => markCorrect(originalIndex)}
                    aria-label={`Marcar ${isCerto ? "Certo" : "Errado"} como resposta`}
                    className={`flex flex-1 items-center gap-3 rounded-2xl border-2 px-4 py-3 transition ${
                      alt.is_correct
                        ? isCerto
                          ? "border-emerald-500/40 bg-emerald-500/10"
                          : "border-red-500/40 bg-red-500/10"
                        : "border-white/[0.08] bg-white/[0.03] hover:border-white/[0.16] hover:bg-white/[0.05]"
                    }`}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 ${
                      alt.is_correct
                        ? isCerto ? "border-emerald-500 bg-emerald-500/20" : "border-red-500 bg-red-500/20"
                        : "border-white/[0.15] bg-white/[0.05]"
                    }`}>
                      {alt.is_correct && <span className="text-base leading-none">{OWL_MARK}</span>}
                    </span>
                    <span className={`text-sm font-bold ${
                      alt.is_correct
                        ? isCerto ? "text-emerald-300" : "text-red-300"
                        : "text-white/50"
                    }`}>
                      {isCerto ? "Certo" : "Errado"}
                    </span>
                  </button>
                );
              })}
          </div>
        ) : (
          <div className="space-y-3">
            {alternatives.map((alternative, index) => (
              <div
                key={alternative.id || alternative.label || index}
                className={alternative.is_correct
                  ? "rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.08] p-3"
                  : "rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3"
                }
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => markCorrect(index)}
                    className={alternative.is_correct
                      ? "mt-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-emerald-500 bg-emerald-500/20 text-xl"
                      : "mt-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white/[0.15] bg-white/[0.04] text-xl hover:border-emerald-500/40 hover:bg-emerald-500/10"
                    }
                  >
                    {alternative.is_correct ? OWL_MARK : ""}
                  </button>
                  <span className={`mt-2 font-black ${alternative.is_correct ? "text-emerald-300" : "text-white/40"}`}>
                    {alternative.label})
                  </span>
                  <div className="flex-1">
                    <RichTextEditor
                      value={alternative.text}
                      onChange={(value) => updateAlternative(index, value)}
                      placeholder={`Resposta ${alternative.label}`}
                      minRows={2}
                      compact
                      dark
                      className="w-full rounded-xl border border-white/[0.06] bg-[#07111F] px-4 py-2.5 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-orange-400/[0.08]"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tópicos avaliados */}
        <div className="relative isolate">
          <div className="pointer-events-none absolute -inset-[3px] -z-10 rounded-2xl bg-gradient-to-b from-blue-400/25 via-blue-400/[0.06] to-transparent blur-[10px]" />
          <div className="rounded-2xl border border-blue-400/30 bg-blue-500/[0.05] p-4 shadow-inner shadow-blue-950/20">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-200">Tópicos avaliados</p>
              <span className="text-[10px] font-semibold text-blue-200/60">Obrigatório para salvar/publicar</span>
            </div>
            <EvaluatedTopicsInput
              value={evaluatedTopics}
              onChange={setEvaluatedTopics}
              subjectId={subjectIds[0] || null}
              required
              disabled={saving}
              variant="dark"
              placeholder="Ex.: Memória RAM, Placa-mãe"
            />
          </div>
        </div>

        {/* Comentário do professor */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/50">
                Comentário do professor{" "}
                <span className="font-medium normal-case tracking-normal text-white/25">(opcional)</span>
              </p>
              <p className="mt-0.5 text-xs text-white/30">
                Adicione observações, justificativas ou comentários sobre esta questão.
              </p>
            </div>
            <button
              type="button"
              onClick={generateExplanation}
              disabled={generatingAI}
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-300 transition hover:border-violet-500/50 hover:bg-violet-500/[0.18] disabled:opacity-60"
            >
              {generatingAI ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              Gerar com IA
            </button>
          </div>
          <RichTextEditor value={explanation} onChange={setExplanation} placeholder="Digite seu comentário..." minRows={3} compact dark className="w-full rounded-xl border border-white/[0.06] bg-[#07111F] px-4 py-3 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-orange-400/[0.08]" />
        </div>

        {/* Rodapé */}
        <div className="flex items-center gap-2 pb-1 pt-0.5">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-400/60" />
          <p className="text-xs text-white/25">As alterações são salvas automaticamente.</p>
        </div>
      </div>
    </div>
  );
}

function PremiumSearch({
  value,
  onChange,
  onClear,
}: {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
        Buscar questão
      </label>

      <div className="group relative">
        <Search
          size={18}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/30 transition duration-200 group-focus-within:text-orange-400"
        />

        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Digite o código, nome ou enunciado..."
          className="h-12 w-full rounded-2xl border border-white/[0.08] bg-[#0D1926] pl-11 pr-12 text-sm font-semibold text-white/80 outline-none transition placeholder:text-white/25 hover:border-white/[0.15] focus:border-orange-400/40 focus:ring-2 focus:ring-orange-400/[0.08]"
        />

        {value && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Limpar busca"
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl text-white/30 transition duration-200 hover:bg-white/10 hover:text-white/70 active:scale-95"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

function SimpleSelectDropdown({
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
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const currentLabel = options.find((o) => o.value === value)?.label ?? options[0]?.label ?? label;
  const isFiltered = value !== "";

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="group flex h-12 w-full items-center justify-between rounded-2xl border border-white/[0.08] bg-[#0D1926] px-4 text-left text-sm font-semibold text-white/80 outline-none transition hover:border-white/[0.15]"
      >
        <span className={`truncate ${isFiltered ? "text-white/90" : ""}`}>{currentLabel}</span>
        <span className="flex items-center gap-2">
          {isFiltered && <span className="h-2 w-2 rounded-full bg-orange-500" />}
          <ChevronDown
            size={16}
            className={`text-white/30 transition duration-200 group-hover:text-orange-400 ${open ? "rotate-180 text-orange-400" : ""}`}
          />
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-[9999] mt-2 w-full rounded-2xl border border-white/[0.09] bg-[#0D1B2E] p-2 shadow-2xl shadow-black/50 backdrop-blur-xl">
          <div className="max-h-72 space-y-0.5 overflow-y-auto">
            {options.map((opt) => {
              const selected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className={
                    selected
                      ? "flex w-full items-center justify-between rounded-xl border border-orange-500/30 bg-orange-500/[0.12] px-4 py-2.5 text-left text-sm font-semibold text-orange-100"
                      : "flex w-full items-center rounded-xl border border-transparent px-4 py-2.5 text-left text-sm font-semibold text-white/60 hover:border-white/[0.07] hover:bg-white/[0.04] hover:text-white/80"
                  }
                >
                  <span className="flex-1 text-left">{opt.label}</span>
                  {selected && <Check size={14} className="shrink-0 text-orange-400" strokeWidth={3} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function BoardFilterDropdown({
  label = "Banca",
  boards,
  selectedIds,
  onChange,
  counts = {},
  instantApply = false,
}: {
  label?: string;
  boards: { id: string; name: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  counts?: Record<string, number>;
  instantApply?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draftIds, setDraftIds] = useState<string[]>(selectedIds);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  function getLabel() {
    if (selectedIds.length === 0) return label === "Banca" ? "Todas as bancas" : "Todas as inspirações";
    if (selectedIds.length === 1) {
      const b = boards.find((x) => x.id === selectedIds[0]);
      return b?.name ?? "1 banca";
    }
    return `${selectedIds.length} bancas selecionadas`;
  }

  function toggleBoard(id: string) {
    setDraftIds((current) => {
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      if (instantApply) onChange(next);
      return next;
    });
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
        {label}
      </label>
      <button
        type="button"
        onClick={() => { setDraftIds(selectedIds); setSearch(""); setOpen((o) => !o); }}
        className="group flex h-12 w-full items-center justify-between rounded-2xl border border-white/[0.08] bg-[#0D1926] px-4 text-left text-sm font-semibold text-white/80 outline-none transition hover:border-white/[0.15]"
      >
        <span className="truncate">{getLabel()}</span>
        <span className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white">
              {selectedIds.length}
            </span>
          )}
          <ChevronDown size={16} className={`text-white/30 transition duration-200 group-hover:text-orange-400 ${open ? "rotate-180 text-orange-400" : ""}`} />
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-[9999] mt-2 w-full min-w-0 rounded-2xl border border-white/[0.09] bg-[#0D1B2E] p-3 shadow-2xl shadow-black/50 backdrop-blur-xl sm:min-w-72">
          <div className="mb-2.5">
            <input
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Buscar banca..."
              className="h-9 w-full rounded-xl border border-white/[0.09] bg-white/[0.05] px-3 text-sm text-white/70 outline-none placeholder:text-white/25 focus:border-orange-500/30 focus:ring-2 focus:ring-orange-500/[0.07]"
            />
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {(() => {
              const visible = search.trim()
                ? boards.filter((b) => b.name.toLowerCase().includes(search.trim().toLowerCase()))
                : boards;
              if (visible.length === 0) return (
                <p className="rounded-xl border border-white/[0.05] bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white/40">
                  Nenhum resultado para &ldquo;{search}&rdquo;.
                </p>
              );
              return visible.map((board) => {
                const selected = draftIds.includes(board.id);
                return (
                  <button
                    key={board.id}
                    type="button"
                    onClick={() => toggleBoard(board.id)}
                    className={selected
                      ? "flex w-full items-center gap-3 rounded-xl border border-orange-500/30 bg-orange-500/[0.12] px-4 py-3 text-left text-sm font-semibold text-orange-100"
                      : "flex w-full items-center gap-3 rounded-xl border border-transparent px-4 py-3 text-left text-sm font-semibold text-white/60 hover:border-white/[0.07] hover:bg-white/[0.04] hover:text-white/80"}
                  >
                    <span className={selected ? "flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-orange-500 text-white" : "h-5 w-5 shrink-0 rounded-md border border-white/[0.15] bg-white/[0.04]"}>
                      {selected && <Check size={13} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{board.name}</span>
                    <span className={selected ? "rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-black text-white" : "rounded-full border border-white/[0.08] bg-white/[0.05] px-2 py-0.5 text-[10px] font-black text-white/40"}>
                      {counts[board.id] || 0}
                    </span>
                  </button>
                );
              });
            })()}
          </div>
          <div className="mt-3 flex gap-2 border-t border-white/[0.07] pt-3">
            <button type="button" onClick={() => { setDraftIds([]); onChange([]); setOpen(false); }} className="flex-1 rounded-2xl border border-white/[0.07] bg-white/[0.04] px-3 py-2 text-xs font-bold text-white/50 hover:bg-white/[0.08] hover:text-white/70">
              Limpar
            </button>
            <button type="button" onClick={() => { onChange(draftIds); setOpen(false); }} className="flex-1 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-500 px-3 py-2 text-xs font-bold text-white shadow-sm shadow-orange-900/30">
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function OrgaoFilterDropdown({
  orgaos,
  selectedOrgaos,
  onChange,
  counts = {},
}: {
  orgaos: string[];
  selectedOrgaos: string[];
  onChange: (orgaos: string[]) => void;
  counts?: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const [draftOrgaos, setDraftOrgaos] = useState<string[]>(selectedOrgaos);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  function getLabel() {
    if (selectedOrgaos.length === 0) return "Todos os órgãos";
    if (selectedOrgaos.length === 1) return selectedOrgaos[0];
    return `${selectedOrgaos.length} órgãos selecionados`;
  }

  function toggleOrgao(orgao: string) {
    setDraftOrgaos((current) =>
      current.includes(orgao) ? current.filter((x) => x !== orgao) : [...current, orgao],
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
        Órgão
      </label>
      <button
        type="button"
        onClick={() => { setDraftOrgaos(selectedOrgaos); setSearch(""); setOpen((o) => !o); }}
        className="group flex h-12 w-full items-center justify-between rounded-2xl border border-white/[0.08] bg-[#0D1926] px-4 text-left text-sm font-semibold text-white/80 outline-none transition hover:border-white/[0.15]"
      >
        <span className="truncate">{getLabel()}</span>
        <span className="flex items-center gap-2">
          {selectedOrgaos.length > 0 && (
            <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white">
              {selectedOrgaos.length}
            </span>
          )}
          <ChevronDown size={16} className={`text-white/30 transition duration-200 group-hover:text-orange-400 ${open ? "rotate-180 text-orange-400" : ""}`} />
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-[9999] mt-2 w-full min-w-0 rounded-2xl border border-white/[0.09] bg-[#0D1B2E] p-3 shadow-2xl shadow-black/50 backdrop-blur-xl sm:min-w-72">
          <div className="mb-2.5">
            <input
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Buscar órgão..."
              className="h-9 w-full rounded-xl border border-white/[0.09] bg-white/[0.05] px-3 text-sm text-white/70 outline-none placeholder:text-white/25 focus:border-orange-500/30 focus:ring-2 focus:ring-orange-500/[0.07]"
            />
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {(() => {
              const visible = search.trim()
                ? orgaos.filter((orgao) => orgao.toLowerCase().includes(search.trim().toLowerCase()))
                : orgaos;
              if (visible.length === 0) return (
                <p className="rounded-xl border border-white/[0.05] bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white/40">
                  Nenhum resultado para &ldquo;{search}&rdquo;.
                </p>
              );
              return visible.map((orgao) => {
                const selected = draftOrgaos.includes(orgao);
                return (
                  <button
                    key={orgao}
                    type="button"
                    onClick={() => toggleOrgao(orgao)}
                    className={selected
                      ? "flex w-full items-center gap-3 rounded-xl border border-orange-500/30 bg-orange-500/[0.12] px-4 py-3 text-left text-sm font-semibold text-orange-100"
                      : "flex w-full items-center gap-3 rounded-xl border border-transparent px-4 py-3 text-left text-sm font-semibold text-white/60 hover:border-white/[0.07] hover:bg-white/[0.04] hover:text-white/80"}
                  >
                    <span className={selected ? "flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-orange-500 text-white" : "h-5 w-5 shrink-0 rounded-md border border-white/[0.15] bg-white/[0.04]"}>
                      {selected && <Check size={13} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{orgao}</span>
                    <span className={selected ? "rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-black text-white" : "rounded-full border border-white/[0.08] bg-white/[0.05] px-2 py-0.5 text-[10px] font-black text-white/40"}>
                      {counts[orgao] || 0}
                    </span>
                  </button>
                );
              });
            })()}
          </div>
          <div className="mt-3 flex gap-2 border-t border-white/[0.07] pt-3">
            <button type="button" onClick={() => { setDraftOrgaos([]); onChange([]); setOpen(false); }} className="flex-1 rounded-2xl border border-white/[0.07] bg-white/[0.04] px-3 py-2 text-xs font-bold text-white/50 hover:bg-white/[0.08] hover:text-white/70">
              Limpar
            </button>
            <button type="button" onClick={() => { onChange(draftOrgaos); setOpen(false); }} className="flex-1 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-500 px-3 py-2 text-xs font-bold text-white shadow-sm shadow-orange-900/30">
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function YearFilterDropdown({
  years,
  selectedYears,
  onChange,
  counts = {},
}: {
  years: string[];
  selectedYears: string[];
  onChange: (years: string[]) => void;
  counts?: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const [draftYears, setDraftYears] = useState<string[]>(selectedYears);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  function getLabel() {
    if (selectedYears.length === 0) return "Todos os anos";
    if (selectedYears.length === 1) return selectedYears[0];
    return `${selectedYears.length} anos selecionados`;
  }

  function toggleYear(year: string) {
    setDraftYears((current) =>
      current.includes(year) ? current.filter((y) => y !== year) : [...current, year],
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
        Ano
      </label>
      <button
        type="button"
        onClick={() => { setDraftYears(selectedYears); setOpen((o) => !o); }}
        className="group flex h-12 w-full items-center justify-between rounded-2xl border border-white/[0.08] bg-[#0D1926] px-4 text-left text-sm font-semibold text-white/80 outline-none transition hover:border-white/[0.15]"
      >
        <span className="truncate">{getLabel()}</span>
        <span className="flex items-center gap-2">
          {selectedYears.length > 0 && (
            <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white">
              {selectedYears.length}
            </span>
          )}
          <ChevronDown size={16} className={`text-white/30 transition duration-200 group-hover:text-orange-400 ${open ? "rotate-180 text-orange-400" : ""}`} />
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-[9999] mt-2 w-full min-w-48 rounded-2xl border border-white/[0.09] bg-[#0D1B2E] p-3 shadow-2xl shadow-black/50 backdrop-blur-xl">
          <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {years.length === 0 ? (
              <p className="rounded-xl border border-white/[0.05] bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white/40">
                Nenhum ano disponível.
              </p>
            ) : years.map((year) => {
              const selected = draftYears.includes(year);
              return (
                <button
                  key={year}
                  type="button"
                  onClick={() => toggleYear(year)}
                  className={selected
                    ? "flex w-full items-center gap-3 rounded-xl border border-orange-500/30 bg-orange-500/[0.12] px-4 py-3 text-left text-sm font-semibold text-orange-100"
                    : "flex w-full items-center gap-3 rounded-xl border border-transparent px-4 py-3 text-left text-sm font-semibold text-white/60 hover:border-white/[0.07] hover:bg-white/[0.04] hover:text-white/80"}
                >
                  <span className={selected ? "flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-orange-500 text-white" : "h-5 w-5 shrink-0 rounded-md border border-white/[0.15] bg-white/[0.04]"}>
                    {selected && <Check size={13} strokeWidth={3} />}
                  </span>
                  <span className="flex-1">{year}</span>
                  <span className={selected ? "rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-black text-white" : "rounded-full border border-white/[0.08] bg-white/[0.05] px-2 py-0.5 text-[10px] font-black text-white/40"}>
                    {counts[year] || 0}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex gap-2 border-t border-white/[0.07] pt-3">
            <button type="button" onClick={() => { setDraftYears([]); onChange([]); setOpen(false); }} className="flex-1 rounded-2xl border border-white/[0.07] bg-white/[0.04] px-3 py-2 text-xs font-bold text-white/50 hover:bg-white/[0.08] hover:text-white/70">
              Limpar
            </button>
            <button type="button" onClick={() => { onChange(draftYears); setOpen(false); }} className="flex-1 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-500 px-3 py-2 text-xs font-bold text-white shadow-sm shadow-orange-900/30">
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SubjectFilterDropdown({
  label,
  subjects,
  selectedIds,
  onChange,
  subjectCounts = {},
}: {
  label: string;
  subjects: { id: string; name: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  subjectCounts?: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const [draftIds, setDraftIds] = useState<string[]>(selectedIds);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedSubjects = subjects.filter((subject) => selectedIds.includes(subject.id));

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  function getLabel() {
    if (selectedSubjects.length === 0) return "Todos os assuntos";
    if (selectedSubjects.length === 1) return selectedSubjects[0].name;
    return `${selectedSubjects.length} assuntos selecionados`;
  }

  function toggleSubject(subjectId: string) {
    setDraftIds((current) =>
      current.includes(subjectId)
        ? current.filter((id) => id !== subjectId)
        : [...current, subjectId],
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
        {label}
      </label>

      <button
        type="button"
        onClick={() => {
          setDraftIds(selectedIds);
          setSearch("");
          setOpen((current) => !current);
        }}
        className="group flex h-12 w-full items-center justify-between rounded-2xl border border-white/[0.08] bg-[#0D1926] px-4 text-left text-sm font-semibold text-white/80 outline-none transition hover:border-white/[0.15]"
      >
        <span className="truncate">{getLabel()}</span>
        <span className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white">
              {selectedIds.length}
            </span>
          )}
          <ChevronDown
            size={16}
            className={`text-white/30 transition duration-200 group-hover:text-orange-400 ${
              open ? "rotate-180 text-orange-400" : ""
            }`}
          />
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-[9999] mt-2 w-full min-w-0 rounded-2xl border border-white/[0.09] bg-[#0D1B2E] p-3 shadow-2xl shadow-black/50 backdrop-blur-xl sm:min-w-80">
          <div className="mb-2.5">
            <input
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Buscar assunto..."
              className="h-9 w-full rounded-xl border border-white/[0.09] bg-white/[0.05] px-3 text-sm text-white/70 outline-none placeholder:text-white/25 focus:border-orange-500/30 focus:ring-2 focus:ring-orange-500/[0.07]"
            />
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {subjects.length === 0 ? (
              <p className="rounded-xl border border-white/[0.05] bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white/40">
                Nenhum assunto disponível.
              </p>
            ) : (() => {
              const visible = search.trim()
                ? subjects.filter((s) => s.name.toLowerCase().includes(search.trim().toLowerCase()))
                : subjects;
              if (visible.length === 0) return (
                <p className="rounded-xl border border-white/[0.05] bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white/40">
                  Nenhum resultado para &ldquo;{search}&rdquo;.
                </p>
              );
              return visible.map((subject) => {
                const selected = draftIds.includes(subject.id);

                return (
                  <button
                    key={subject.id}
                    type="button"
                    onClick={() => toggleSubject(subject.id)}
                    className={
                      selected
                        ? "flex w-full items-center gap-3 rounded-xl border border-orange-500/30 bg-orange-500/[0.12] px-4 py-3 text-left text-sm font-semibold text-orange-100"
                        : "flex w-full items-center gap-3 rounded-xl border border-transparent px-4 py-3 text-left text-sm font-semibold text-white/60 hover:border-white/[0.07] hover:bg-white/[0.04] hover:text-white/80"
                    }
                  >
                    <span
                      className={
                        selected
                          ? "flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-orange-500 text-white"
                          : "h-5 w-5 shrink-0 rounded-md border border-white/[0.15] bg-white/[0.04]"
                      }
                    >
                      {selected && <Check size={13} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{subject.name}</span>
                    <span className={selected ? "rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-black text-white" : "rounded-full border border-white/[0.08] bg-white/[0.05] px-2 py-0.5 text-[10px] font-black text-white/40"}>
                      {subjectCounts[subject.id] || 0}
                    </span>
                  </button>
                );
              });
            })()}
          </div>

          <div className="mt-3 flex gap-2 border-t border-white/[0.07] pt-3">
            <button
              type="button"
              onClick={() => {
                setDraftIds([]);
                onChange([]);
                setOpen(false);
              }}
              className="flex-1 rounded-2xl border border-white/[0.07] bg-white/[0.04] px-3 py-2 text-xs font-bold text-white/50 hover:bg-white/[0.08] hover:text-white/70"
            >
              Limpar
            </button>

            <button
              type="button"
              onClick={() => {
                onChange(draftIds);
                setOpen(false);
              }}
              className="flex-1 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-500 px-3 py-2 text-xs font-bold text-white shadow-sm shadow-orange-900/30"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


function AddToSimuladoModal({
  selectedCount,
  simulados,
  selectedSimuladoId,
  loading,
  saving,
  onSelect,
  onCancel,
  onConfirm,
}: {
  selectedCount: number;
  simulados: SimuladoOption[];
  selectedSimuladoId: string;
  loading: boolean;
  saving: boolean;
  onSelect: (id: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[10000] flex items-center justify-center px-4"
        style={{ backgroundColor: "rgba(2,6,23,0.78)" }}
        initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
        animate={{ opacity: 1, backdropFilter: "blur(10px)" }}
        exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
        transition={{ duration: 0.18 }}
        onClick={onCancel}
      >
        <motion.div
          className="relative w-full max-w-2xl overflow-visible rounded-[2rem] border border-orange-400/25 bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950 p-7 text-white shadow-2xl shadow-orange-950/40"
          initial={{ opacity: 0, y: 18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.18 }}
          onClick={(event) => event.stopPropagation()}
        >
          {/* Decorações */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-orange-600 via-amber-400 to-yellow-300" />
          <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-orange-500/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-56 w-56 rounded-full bg-amber-400/10 blur-3xl" />

          <button
            type="button"
            onClick={onCancel}
            className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>

          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-orange-500 text-white shadow-xl shadow-orange-500/25">
            <ListPlus size={26} />
          </div>

          <p className="relative mt-5 text-xs font-black uppercase tracking-[0.22em] text-orange-300">Banco de questões</p>
          <h2 className="relative mt-2 text-2xl font-black tracking-tight text-white">Adicionar ao simulado</h2>
          <p className="relative mt-2 text-sm leading-6 text-slate-300">
            <span className="font-bold text-white">{selectedCount} questão(ões)</span> serão adicionadas ao final do simulado selecionado.
          </p>

          <div className="relative mt-6">
            {loading ? (
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-orange-400/40 border-t-orange-400" />
                <span className="text-sm font-semibold text-slate-300">Carregando simulados...</span>
              </div>
            ) : simulados.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-center">
                <FileQuestion className="mx-auto mb-2 text-slate-500" size={28} />
                <p className="text-sm font-semibold text-slate-400">Nenhum simulado encontrado.</p>
              </div>
            ) : (
              <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                {simulados.map((simulado) => {
                  const active = selectedSimuladoId === simulado.id;
                  return (
                    <button
                      key={simulado.id}
                      type="button"
                      onClick={() => onSelect(simulado.id)}
                      className={
                        active
                          ? "w-full rounded-2xl border border-orange-400/35 bg-orange-500/10 p-4 text-left shadow-lg shadow-orange-950/20 transition"
                          : "w-full rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-orange-400/25 hover:bg-white/[0.07]"
                      }
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className={`truncate text-sm font-bold ${active ? "text-orange-50" : "text-slate-200"}`}>{simulado.title}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {simulado.linked_questions_count ?? simulado.question_count ?? 0} questões vinculadas
                          </p>
                        </div>
                        <span className={
                          active
                            ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-400 text-slate-950"
                            : "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10"
                        }>
                          {active && <Check size={13} strokeWidth={3} />}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="relative mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <PremiumButton variant="secondary" onClick={onCancel}>Cancelar</PremiumButton>
            <PremiumButton disabled={!selectedSimuladoId || saving} icon={<ListPlus size={16} />} onClick={onConfirm}>
              {saving ? "Salvando..." : `Adicionar${selectedCount > 1 ? ` ${selectedCount}` : ""} questões`}
            </PremiumButton>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}


function PublicationQueueBulkEditModal({
  open,
  count,
  subjects,
  boards,
  onConfirm,
  onClose,
}: {
  open: boolean;
  count: number;
  subjects: { id: string; name: string; discipline_id: string }[];
  boards: { id: string; name: string }[];
  onConfirm: (fields: PublicationQueueBulkEditFields) => void;
  onClose: () => void;
}) {
  const [boardId, setBoardId] = useState("");
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [year, setYear] = useState("");
  const [difficulty, setDifficulty] = useState("");

  useEffect(() => {
    if (open) {
      setBoardId("");
      setSubjectIds([]);
      setYear("");
      setDifficulty("");
    }
  }, [open]);

  const hasChanges = Boolean(boardId || subjectIds.length > 0 || year.trim() || difficulty);

  function handleConfirm() {
    const fields: PublicationQueueBulkEditFields = {};
    if (boardId) fields.exam_board_id = boardId;
    if (subjectIds.length > 0) fields.subject_ids = subjectIds;
    const parsedYear = parseInt(year.trim());
    if (year.trim() && /^\d{4}$/.test(year.trim()) && parsedYear >= 1990 && parsedYear <= 2100) {
      fields.year = parsedYear;
    }
    if (difficulty) fields.difficulty_level = parseInt(difficulty);
    onConfirm(fields);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/75 px-4 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="relative w-full max-w-lg overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl shadow-slate-950/20"
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-orange-600 via-amber-400 to-yellow-300" />

            <div className="px-7 pb-7 pt-8">
              <button
                type="button"
                onClick={onClose}
                className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Fechar"
              >
                <X size={17} />
              </button>

              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
                  <Pencil size={22} />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-500">Edição em massa</p>
                  <h2 className="text-xl font-black tracking-tight text-slate-900">
                    {count} questão(ões) selecionada(s)
                  </h2>
                </div>
              </div>

              <p className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
                Preencha apenas os campos que deseja alterar. Os demais permanecerão inalterados em cada questão.
              </p>

              <div className="mt-5 space-y-4">
                <PremiumSelect
                  label="Banca"
                  value={boardId}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => setBoardId(e.target.value)}
                >
                  <option value="">Não alterar</option>
                  {boards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </PremiumSelect>

                <SubjectMultiSelect
                  label="Assunto(s)"
                  subjects={subjects}
                  selectedIds={subjectIds}
                  onChange={setSubjectIds}
                  emptyLabel="Não alterar"
                  allowCreate={false}
                />

                <div className="grid grid-cols-2 gap-4">
                  <PremiumInput
                    label="Ano"
                    value={year}
                    inputMode="numeric"
                    placeholder="Não alterar"
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setYear(e.target.value.replace(/\D/g, "").slice(0, 4))
                    }
                  />

                  <PremiumSelect
                    label="Dificuldade"
                    value={difficulty}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => setDifficulty(e.target.value)}
                  >
                    <option value="">Não alterar</option>
                    <option value="1">1 — Muito fácil</option>
                    <option value="2">2 — Fácil</option>
                    <option value="3">3 — Médio</option>
                    <option value="4">4 — Difícil</option>
                    <option value="5">5 — Muito difícil</option>
                  </PremiumSelect>
                </div>
              </div>

              <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <PremiumButton variant="secondary" onClick={onClose}>
                  Cancelar
                </PremiumButton>
                <PremiumButton
                  variant="primary"
                  disabled={!hasChanges}
                  icon={<Pencil size={15} />}
                  onClick={handleConfirm}
                >
                  Aplicar às {count} questões
                </PremiumButton>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function BulkEditModal({
  selectedCount,
  editType,
  selectedStatus,
  selectedSubjectIds,
  selectedBoardId,
  subjects,
  boards,
  onSelectEditType,
  onSelectStatus,
  onSelectSubjects,
  onSelectBoard,
  onCancel,
  onConfirm,
}: {
  selectedCount: number;
  editType: "status" | "subject" | "board";
  selectedStatus: "draft" | "pending_review" | "ready_to_publish" | "published";
  selectedSubjectIds: string[];
  selectedBoardId: string;
  subjects: { id: string; name: string; discipline_id: string }[];
  boards: { id: string; name: string }[];
  onSelectEditType: (type: "status" | "subject" | "board") => void;
  onSelectStatus: (status: "draft" | "pending_review" | "ready_to_publish" | "published") => void;
  onSelectSubjects: (ids: string[]) => void;
  onSelectBoard: (id: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const statusOptions = [
    { value: "draft" as const, title: "Rascunho", description: "A questão fica guardada, mas ainda não entra no fluxo de revisão." },
    { value: "pending_review" as const, title: "A revisar", description: "A questão entra na fila de revisão antes de ser publicada." },
    { value: "ready_to_publish" as const, title: "Fila de publicação", description: "A questão fica pronta para publicação em lote." },
    { value: "published" as const, title: "Publicar", description: "A questão fica pronta para uso no banco e nos simulados." },
  ];

  const typeOptions = [
    { value: "status" as const, label: "Status" },
    { value: "subject" as const, label: "Assunto" },
    { value: "board" as const, label: "Banca" },
  ];

  const confirmDisabled =
    (editType === "subject" && selectedSubjectIds.length === 0) ||
    (editType === "board" && !selectedBoardId);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[10000] flex items-center justify-center px-4"
        style={{ backgroundColor: "rgba(2,6,23,0.78)" }}
        initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
        animate={{ opacity: 1, backdropFilter: "blur(10px)" }}
        exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
        transition={{ duration: 0.18 }}
        onClick={onCancel}
      >
        <motion.div
          className="relative w-full max-w-2xl overflow-visible rounded-[2rem] border border-orange-400/25 bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950 p-7 text-white shadow-2xl shadow-orange-950/40"
          initial={{ opacity: 0, y: 18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.18 }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-orange-600 via-amber-400 to-yellow-300" />
          <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-orange-500/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-56 w-56 rounded-full bg-amber-400/10 blur-3xl" />

          <button type="button" onClick={onCancel} className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/10 hover:text-white">
            <X size={18} />
          </button>

          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-orange-500 text-white shadow-xl shadow-orange-500/25">
            <CheckCircle2 size={26} />
          </div>

          <p className="relative mt-5 text-xs font-black uppercase tracking-[0.22em] text-orange-300">Edição em massa</p>
          <h2 className="relative mt-2 text-2xl font-black tracking-tight text-white">Editar {selectedCount} questão(ões)</h2>
          <p className="relative mt-2 text-sm leading-6 text-slate-300">Escolha o que deseja alterar nas questões selecionadas.</p>

          {/* Tipo de edição */}
          <div className="relative mt-5 flex gap-2">
            {typeOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onSelectEditType(opt.value)}
                className={
                  editType === opt.value
                    ? "flex-1 rounded-2xl border border-orange-400/40 bg-orange-500/15 py-2 text-sm font-bold text-orange-200 transition"
                    : "flex-1 rounded-2xl border border-white/10 bg-white/[0.04] py-2 text-sm font-semibold text-slate-400 transition hover:border-white/20 hover:text-white"
                }
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Status */}
          {editType === "status" && (
            <div className="relative mt-4 grid gap-2">
              {statusOptions.map((option) => {
                const active = selectedStatus === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onSelectStatus(option.value)}
                    className={
                      active
                        ? "rounded-2xl border border-orange-400/35 bg-orange-500/10 p-4 text-left shadow-lg transition"
                        : "rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-orange-400/25 hover:bg-white/[0.07]"
                    }
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className={`text-sm font-bold ${active ? "text-orange-50" : "text-slate-200"}`}>{option.title}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{option.description}</p>
                      </div>
                      <span className={active ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-400 text-slate-950" : "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10"}>
                        {active && <Check size={13} strokeWidth={3} />}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Assunto */}
          {editType === "subject" && (
            <div className="relative mt-4 rounded-3xl border border-white/[0.08] bg-white/[0.035] p-4">
              <div className="mb-3 rounded-2xl border border-orange-400/15 bg-orange-500/[0.08] px-4 py-3 text-xs font-semibold leading-5 text-orange-100/85">
                Você pode selecionar <strong>um ou vários assuntos</strong>. Ao salvar, todos os assuntos selecionados substituirão os assuntos atuais das questões escolhidas.
              </div>
              <SubjectMultiSelect
                label="Assuntos da edição em massa"
                subjects={subjects}
                selectedIds={selectedSubjectIds}
                onChange={onSelectSubjects}
                emptyLabel="Selecionar um ou mais assuntos"
                dark
                allowCreate={false}
              />
            </div>
          )}

          {/* Banca */}
          {editType === "board" && (
            <div className="relative mt-4 max-h-60 overflow-y-auto space-y-1.5 rounded-2xl border border-white/10 bg-white/[0.03] p-2">
              {boards.length === 0 ? (
                <p className="px-3 py-2 text-sm text-slate-500">Nenhuma banca disponível.</p>
              ) : (
                boards.map((b) => {
                  const active = selectedBoardId === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => onSelectBoard(b.id)}
                      className={active ? "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold text-orange-200 bg-orange-500/10" : "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/[0.05]"}
                    >
                      {b.name}
                      {active && <Check size={13} strokeWidth={3} />}
                    </button>
                  );
                })
              )}
            </div>
          )}

          <div className="relative mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <PremiumButton variant="secondary" onClick={onCancel}>Cancelar</PremiumButton>
            <PremiumButton icon={<CheckCircle2 size={16} />} onClick={onConfirm} disabled={confirmDisabled}>
              Aplicar em {selectedCount} questão(ões)
            </PremiumButton>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function NewQuestionModal({ onCancel }: { onCancel: () => void }) {
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[10000] flex items-center justify-center px-4"
        style={{ backgroundColor: "rgba(2,6,23,0.78)" }}
        initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
        animate={{ opacity: 1, backdropFilter: "blur(10px)" }}
        exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
        transition={{ duration: 0.18 }}
        onClick={onCancel}
      >
        <motion.div
          className="relative w-full max-w-5xl overflow-hidden rounded-[2rem] border border-orange-400/25 bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950 p-8 text-white shadow-2xl shadow-orange-950/40"
          initial={{ opacity: 0, y: 18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.18 }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-orange-600 via-amber-400 to-yellow-300" />
          <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-orange-500/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-56 w-56 rounded-full bg-amber-400/10 blur-3xl" />

          <button
            type="button"
            onClick={onCancel}
            className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>

          <p className="relative text-xs font-black uppercase tracking-[0.22em] text-orange-300">
            Nova questão
          </p>

          <h2 className="relative mt-2 text-2xl font-black tracking-tight text-white">
            Como você quer criar a questão?
          </h2>

          <p className="relative mt-2 text-sm leading-6 text-slate-400">
            Escolha entre cadastrar manualmente, gerar questões com IA ou importar questões em massa com IA.
          </p>

          <div className="relative mt-7 grid gap-4 md:grid-cols-3">
          <Link
            href="/questoes/nova"
            className="group rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 transition hover:border-orange-400/30 hover:bg-white/[0.08]"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-orange-300 shadow-sm transition group-hover:scale-105 group-hover:bg-orange-500/20">
              <PenLine size={24} />
            </div>
            <h3 className="mt-5 text-lg font-bold text-white">Criar manualmente</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Você digita enunciado, alternativas, gabarito, imagens e explicação.
            </p>
          </Link>

          <Link
            href="/questoes/gerar-ia"
            className="group rounded-[2rem] border border-orange-400/25 bg-orange-500/[0.07] p-6 transition hover:border-orange-400/45 hover:bg-orange-500/15"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/20 text-orange-300 shadow-sm transition group-hover:scale-105 group-hover:bg-orange-500/30">
              <Sparkles size={24} />
            </div>
            <h3 className="mt-5 text-lg font-bold text-white">Gerar com IA</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              A IA cria questões pendentes de revisão com base em banca, assunto e dificuldade.
            </p>
          </Link>

          <Link
            href="/questoes/importar"
            className="group rounded-[2rem] border border-emerald-400/20 bg-emerald-500/[0.06] p-6 transition hover:border-emerald-400/40 hover:bg-emerald-500/12"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-300 shadow-sm transition group-hover:scale-105 group-hover:bg-emerald-500/30">
              <ClipboardPaste size={24} />
            </div>
            <h3 className="mt-5 text-lg font-bold text-white">Importar com IA</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Cole várias questões no padrão INÍCIO/FIM e deixe a IA organizar para revisão.
            </p>
          </Link>
        </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function QuestionStatCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "orange" | "amber" | "green" | "purple";
  icon: ReactNode;
}) {
  const styles = {
    orange: {
      glow: "bg-orange-500/[0.06] blur-2xl",
      border: "border-orange-500/20",
      num: "text-orange-400",
      iconBg: "border border-orange-500/25 bg-orange-500/10 text-orange-400",
      label: "text-orange-400/60",
    },
    amber: {
      glow: "bg-amber-400/[0.06] blur-2xl",
      border: "border-amber-400/20",
      num: "text-amber-400",
      iconBg: "border border-amber-400/25 bg-amber-400/10 text-amber-400",
      label: "text-amber-400/60",
    },
    green: {
      glow: "bg-emerald-500/[0.06] blur-2xl",
      border: "border-emerald-500/20",
      num: "text-emerald-400",
      iconBg: "border border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
      label: "text-emerald-400/60",
    },
    purple: {
      glow: "bg-violet-500/[0.08] blur-2xl",
      border: "border-violet-500/25",
      num: "text-violet-400",
      iconBg: "border border-violet-500/30 bg-violet-500/10 text-violet-400",
      label: "text-violet-400/60",
    },
  }[tone];

  return (
    <div className={`relative overflow-hidden rounded-[1.5rem] border ${styles.border} bg-white/[0.03] p-5 shadow-xl shadow-black/20 backdrop-blur-sm transition hover:-translate-y-0.5`}>
      <div className={`pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full ${styles.glow}`} />
      <div className="relative flex items-start justify-between">
        <div>
          <p className={`text-[10px] font-black uppercase tracking-[0.22em] ${styles.label}`}>{label}</p>
          <p className={`mt-3 text-4xl font-black leading-none ${styles.num}`}>{value.toLocaleString()}</p>
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${styles.iconBg}`}>
          {icon}
        </span>
      </div>
    </div>
  );
}

function FeedbackBox({ feedback }: { feedback: NonNullable<Feedback> }) {
  const isSuccess = feedback.type === "success";
  const isWarning = feedback.type === "warning";

  return (
    <div
      className={
        isSuccess
          ? "mb-6 flex items-center gap-3 rounded-[2rem] border border-emerald-500/25 bg-emerald-500/10 p-5 text-emerald-300"
          : isWarning
            ? "mb-6 flex items-center gap-3 rounded-[2rem] border border-amber-400/25 bg-amber-400/10 p-5 text-amber-300"
            : "mb-6 flex items-center gap-3 rounded-[2rem] border border-red-500/25 bg-red-500/10 p-5 text-red-300"
      }
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.07] shadow-sm">
        {isSuccess ? <CheckCircle2 size={20} /> : isWarning ? <AlertTriangle size={20} /> : <XCircle size={20} />}
      </div>
      <p className="font-medium">{feedback.message}</p>
    </div>
  );
}

function ConfirmModal({
  title,
  message,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm" onClick={onCancel}>
      <div className="relative w-full max-w-lg rounded-[2rem] bg-white p-7 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <button type="button" onClick={onCancel} className="absolute right-5 top-5 rounded-2xl p-2 text-slate-400 hover:bg-slate-100">
          <X size={18} />
        </button>

        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <AlertTriangle size={24} />
        </div>

        <h2 className="text-2xl font-semibold text-slate-950">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <PremiumButton variant="secondary" onClick={onCancel}>
            Cancelar
          </PremiumButton>
          <PremiumButton variant="danger" onClick={onConfirm}>
            Excluir
          </PremiumButton>
        </div>
      </div>
    </div>
  );
}
