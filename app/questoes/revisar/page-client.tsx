"use client";

import { type ReactNode, ChangeEvent, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import SelectionGhostBar from "../../components/ui/SelectionGhostBar";
import {
  Archive,
  Calendar,
  Check,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileQuestion,
  Filter,
  Loader2,
  Pencil,
  Save,
  Search,
  Send,
  Star,
  UsersRound,
  X,
  ChevronDown,
} from "lucide-react";
import PremiumButton from "../../components/ui/PremiumButton";
import PremiumInput from "../../components/ui/PremiumInput";
import PremiumSelect from "../../components/ui/PremiumSelect";
import SubjectMultiSelect from "../../components/questions/SubjectMultiSelect";
import QuestionActionModal, { type QuestionActionModalState } from "../../components/questions/QuestionActionModal";
import DraftRestoreModal from "../../components/ui/DraftRestoreModal";
import QuestionEditor from "../../components/questions/QuestionEditor";
import { hasEvaluatedTopics } from "@/lib/questions/evaluated-topics";
import { adminFetch } from "@/app/lib/supabase/adminFetch";

const QUESTIONS_PER_PAGE = 40;
function notifyPublicationQueueUpdated() {
  window.dispatchEvent(new Event("estudotop:publication-queue-updated"));
}


const publishSteps = [
  "Preparando questões selecionadas",
  "Publicando no banco",
  "Finalizando",
];

const queueSteps = [
  "Salvando alterações",
  "Enviando para a fila",
  "Atualizando revisão",
];

const REVIEW_DRAFT_PROMPT_GROUP = "estudotop:draft:questoes:revisar";
const REVIEW_PUBLICATION_QUEUE_DRAFT_KEY = "estudotop:draft:questoes:revisar:publication-queue";

type PublicationQueueDraft = {
  version: 1;
  savedAt: string;
  ids: string[];
};

function wait(ms: number) {
  return new Promise<void>((resolve) => { window.setTimeout(resolve, ms); });
}

export type Alternative = {
  id?: string;
  label?: string | null;
  text?: string | null;
  image_url?: string | null;
  is_correct?: boolean | null;
  order_number?: number | null;
  showImage?: boolean;
};

export type Discipline = {
  id: string;
  name: string;
};

export type Subject = {
  id: string;
  name: string;
  discipline_id: string;
};

export type Board = {
  id: string;
  name: string;
};

export type Question = {
  id: string;
  code?: string | null;
  statement?: string | null;
  status?: string | null;
  question_type?: string | null;
  year?: number | null;
  difficulty_level?: number | null;
  orgao?: string | null;
  image_url?: string | null;
  explanation_text?: string | null;
  evaluated_topics?: string[] | null;
  review_comment?: string | null;
  created_at?: string | null;
  subjects?: {
    id: string;
    name: string;
    discipline_id?: string | null;
    disciplines?: {
      id: string;
      name: string;
    } | null;
  } | null;
  question_subjects?: {
    subjects?: Subject & {
      disciplines?: {
        id: string;
        name: string;
      } | null;
    } | null;
  }[];
  exam_boards?: {
    id: string;
    name: string;
  } | null;
  question_alternatives?: Alternative[];
};

type BulkEditFields = {
  exam_board_id?: string;
  subject_ids?: string[];
  year?: number;
  difficulty_level?: number;
};

function renderDifficultyStars(level?: number | null) {
  if (!level) {
    return (
      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-400">
        Sem dificuldade
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-amber-600">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star key={index} size={11} className={index < level ? "fill-current" : "text-amber-200"} />
      ))}
    </span>
  );
}

function normalizeFilterText(value?: string | null) {
  return (value || "")
    .replace(/<[^>]*>/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getQuestionDisciplineIds(question: Question): string[] {
  const ids = new Set<string>();
  if (question.subjects?.discipline_id) ids.add(question.subjects.discipline_id);
  if (Array.isArray(question.question_subjects)) {
    question.question_subjects.forEach((item) => {
      if (item?.subjects?.discipline_id) ids.add(item.subjects.discipline_id);
    });
  }
  return Array.from(ids);
}

function getQuestionSubjectIds(question: Question) {
  const ids = new Set<string>();

  if (question.subjects?.id) {
    ids.add(question.subjects.id);
  }

  if (Array.isArray(question.question_subjects)) {
    question.question_subjects.forEach((item) => {
      if (item.subjects?.id) {
        ids.add(item.subjects.id);
      }
    });
  }

  return Array.from(ids);
}

function getQuestionSearchText(question: Question) {
  const subjectNames = [
    question.subjects?.name,
    ...(question.question_subjects || []).map((item) => item.subjects?.name),
  ]
    .filter(Boolean)
    .join(" ");

  const alternativesText = (question.question_alternatives || [])
    .map((alternative) => alternative.text || "")
    .join(" ");

  return normalizeFilterText(
    [
      question.code,
      question.statement,
      question.exam_boards?.name,
      question.orgao,
      subjectNames,
      alternativesText,
    ].join(" "),
  );
}

type RevisarInitialFilters = {
  boardIds: string[];
  subjectIds: string[];
  disciplineId: string;
  difficultyLevels: string[];
  orgaos: string[];
  status: string;
  years: string[];
  q: string;
  missingTopics?: boolean;
};

export default function RevisarQuestoesClient({
  initialQuestions,
  disciplines,
  subjects,
  boards,
  initialFilters,
}: {
  initialQuestions: Question[];
  disciplines: Discipline[];
  subjects: Subject[];
  boards: Board[];
  initialFilters?: RevisarInitialFilters;
}) {
  const [queue, setQueue] = useState<Question[]>(initialQuestions || []);
  const [approvedCount, setApprovedCount] = useState(0);
  const [archivedCount, setArchivedCount] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [filterBoardIds, setFilterBoardIds] = useState<string[]>(initialFilters?.boardIds ?? []);
  const [filterSubjectIds, setFilterSubjectIds] = useState<string[]>(initialFilters?.subjectIds ?? []);
  const [filterDisciplineId, setFilterDisciplineId] = useState(initialFilters?.disciplineId ?? "");
  const [filterDifficultyLevels, setFilterDifficultyLevels] = useState<string[]>(initialFilters?.difficultyLevels ?? []);
  const [filterOrgaos, setFilterOrgaos] = useState<string[]>(initialFilters?.orgaos ?? []);
  const [showDifficultyDropdown, setShowDifficultyDropdown] = useState(false);
  const [filterStatus, setFilterStatus] = useState(initialFilters?.status ?? "pending_review");
  const [filterYears, setFilterYears] = useState<string[]>(initialFilters?.years ?? []);
  const [filterText, setFilterText] = useState(initialFilters?.q ?? "");
  const [filterMissingTopics, setFilterMissingTopics] = useState(Boolean(initialFilters?.missingTopics));
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [currentPage, setCurrentPage] = useState(1);
  const [actionFeedback, setActionFeedback] = useState<QuestionActionModalState>(null);
  const [publicationQueueIds, setPublicationQueueIds] = useState<string[]>([]);
  const [pendingPublicationQueueDraft, setPendingPublicationQueueDraft] = useState<PublicationQueueDraft | null>(null);
  const [publicationQueueDraftChecked, setPublicationQueueDraftChecked] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  // Each entry stores { code, save } so the queue can report failures per-question.
  const saveHandlersRef = useRef<Record<string, { code: string; save: () => Promise<{ ok: boolean; message?: string }> }>>({});

  const filteredSubjects = useMemo(() => {
    if (!filterDisciplineId) return subjects;
    return subjects.filter((s) => s.discipline_id === filterDisciplineId);
  }, [subjects, filterDisciplineId]);

  const selectedSubjects = useMemo(
    () => subjects.filter((s) => filterSubjectIds.includes(s.id)),
    [subjects, filterSubjectIds],
  );

  useEffect(() => {
    if (publicationQueueDraftChecked) return;

    try {
      const raw = window.localStorage.getItem(REVIEW_PUBLICATION_QUEUE_DRAFT_KEY);
      if (!raw) {
        setPublicationQueueDraftChecked(true);
        return;
      }

      const parsed = JSON.parse(raw) as PublicationQueueDraft;
      const validIds = Array.isArray(parsed?.ids)
        ? parsed.ids.filter((id) => queue.some((question) => question.id === id && question.status === "pending_review"))
        : [];

      if (parsed?.version === 1 && validIds.length > 0) {
        setPendingPublicationQueueDraft({ ...parsed, ids: validIds });
      } else {
        window.localStorage.removeItem(REVIEW_PUBLICATION_QUEUE_DRAFT_KEY);
      }
    } catch {
      window.localStorage.removeItem(REVIEW_PUBLICATION_QUEUE_DRAFT_KEY);
    } finally {
      setPublicationQueueDraftChecked(true);
    }
  }, [publicationQueueDraftChecked, queue]);

  useEffect(() => {
    if (!publicationQueueDraftChecked || pendingPublicationQueueDraft) return;

    try {
      if (publicationQueueIds.length === 0) {
        window.localStorage.removeItem(REVIEW_PUBLICATION_QUEUE_DRAFT_KEY);
        return;
      }

      const payload: PublicationQueueDraft = {
        version: 1,
        savedAt: new Date().toISOString(),
        ids: publicationQueueIds,
      };
      window.localStorage.setItem(REVIEW_PUBLICATION_QUEUE_DRAFT_KEY, JSON.stringify(payload));
    } catch {
      // localStorage can fail in private mode or quota exhaustion; the review flow must continue.
    }
  }, [pendingPublicationQueueDraft, publicationQueueDraftChecked, publicationQueueIds]);

  const restorePublicationQueueDraft = useCallback(() => {
    if (!pendingPublicationQueueDraft) return;

    const validIds = pendingPublicationQueueDraft.ids.filter((id) =>
      queue.some((question) => question.id === id && question.status === "pending_review"),
    );

    setPublicationQueueIds(validIds);
    setPendingPublicationQueueDraft(null);
  }, [pendingPublicationQueueDraft, queue]);

  const discardPublicationQueueDraft = useCallback(() => {
    window.localStorage.removeItem(REVIEW_PUBLICATION_QUEUE_DRAFT_KEY);
    setPublicationQueueIds([]);
    setPendingPublicationQueueDraft(null);
  }, []);

  function getDifficultyLabel() {
    if (filterDifficultyLevels.length === 0) return "Todas as dificuldades";
    if (filterDifficultyLevels.length === 1) return `Dificuldade (${filterDifficultyLevels.length})`;
    return `Dificuldades (${filterDifficultyLevels.length})`;
  }

  function toggleDifficultyLevel(level: string) {
    setFilterDifficultyLevels((current) =>
      current.includes(level) ? current.filter((x) => x !== level) : [...current, level],
    );
  }

  const focusAfterAction = useCallback((remainingQueueIds: string[]) => {
    window.setTimeout(() => {
      if (remainingQueueIds.length === 0) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const allCards = Array.from(
        document.querySelectorAll<HTMLElement>("[data-review-question-card]"),
      );
      let lastQueuedIdx = -1;
      for (let i = 0; i < allCards.length; i++) {
        const cardId = allCards[i].dataset.questionId;
        if (cardId && remainingQueueIds.includes(cardId)) lastQueuedIdx = i;
      }
      const target = allCards[lastQueuedIdx + 1] ?? null;
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }, 80);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filterDisciplineId) params.set("disciplina", filterDisciplineId);
    if (filterBoardIds.length > 0) filterBoardIds.forEach((id) => params.append("banca", id));
    if (filterSubjectIds.length > 0) filterSubjectIds.forEach((id) => params.append("assunto", id));
    if (filterDifficultyLevels.length > 0) filterDifficultyLevels.forEach((l) => params.append("dificuldade", l));
    if (filterOrgaos.length > 0) filterOrgaos.forEach((orgao) => params.append("orgao", orgao));
    if (filterStatus && filterStatus !== "pending_review") params.set("status", filterStatus);
    if (filterYears.length > 0) filterYears.forEach((y) => params.append("ano", y));
    if (filterText) params.set("q", filterText);
    if (filterMissingTopics) params.set("topicos", "sem");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [filterDisciplineId, filterBoardIds, filterSubjectIds, filterDifficultyLevels, filterOrgaos, filterStatus, filterYears, filterText, filterMissingTopics]);

  const stats = useMemo(
    () => ({
      pending: queue.length,
      pendingReview: queue.filter((question) => question.status === "pending_review").length,
      readyToPublish: queue.filter((question) => question.status === "ready_to_publish").length,
      approved: approvedCount,
      archived: archivedCount,
      saved: savedCount,
    }),
    [queue, approvedCount, archivedCount, savedCount],
  );

  const filteredQueue = useMemo(() => {
    const text = normalizeFilterText(filterText);

    return queue.filter((question) => {
      const matchesDiscipline = !filterDisciplineId || getQuestionDisciplineIds(question).includes(filterDisciplineId);
      const matchesBoard = filterBoardIds.length === 0 || filterBoardIds.includes(question.exam_boards?.id ?? "");
      const matchesSubject = filterSubjectIds.length === 0 || filterSubjectIds.some((id) => getQuestionSubjectIds(question).includes(id));
      const matchesDifficulty = filterDifficultyLevels.length === 0 || filterDifficultyLevels.includes(String(question.difficulty_level || ""));
      const matchesOrgao = filterOrgaos.length === 0 || filterOrgaos.includes((question.orgao || "").trim());
      const matchesStatus = !filterStatus || question.status === filterStatus;
      const matchesYear = filterYears.length === 0 || filterYears.includes(String(question.year || ""));
      const matchesText = !text || getQuestionSearchText(question).includes(text);
      const matchesMissingTopics = !filterMissingTopics || !hasEvaluatedTopics(question.evaluated_topics);

      return matchesDiscipline && matchesBoard && matchesSubject && matchesDifficulty && matchesOrgao && matchesStatus && matchesYear && matchesText && matchesMissingTopics;
    }).sort((a, b) => {
      const ya = a.year || 0;
      const yb = b.year || 0;
      if (!ya && !yb) return 0;
      if (!ya) return 1;
      if (!yb) return -1;
      return sortOrder === "newest" ? yb - ya : ya - yb;
    });
  }, [queue, filterDisciplineId, filterBoardIds, filterSubjectIds, filterDifficultyLevels, filterOrgaos, filterStatus, filterYears, filterText, filterMissingTopics, subjects, sortOrder]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterDisciplineId, filterBoardIds.join(","), filterSubjectIds.join(","), filterDifficultyLevels.join(","), filterOrgaos.join(","), filterStatus, filterYears.join(","), filterText, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filteredQueue.length / QUESTIONS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedQueue = filteredQueue.slice(
    (safeCurrentPage - 1) * QUESTIONS_PER_PAGE,
    safeCurrentPage * QUESTIONS_PER_PAGE,
  );

  const availableYears = useMemo(() => {
    const years = queue.map((question) => question.year).filter(Boolean).map(String);
    return Array.from(new Set(years)).sort((a, b) => Number(b) - Number(a));
  }, [queue]);

  const disciplineCounts = useMemo(() => {
    const text = normalizeFilterText(filterText);
    const counts: Record<string, number> = {};
    queue.forEach((q) => {
      if (text && !getQuestionSearchText(q).includes(text)) return;
      getQuestionDisciplineIds(q).forEach((id) => { counts[id] = (counts[id] || 0) + 1; });
    });
    return counts;
  }, [queue, filterText]);

  const boardCounts = useMemo(() => {
    const text = normalizeFilterText(filterText);
    const counts: Record<string, number> = {};
    queue.forEach((q) => {
      const matchesDiscipline = !filterDisciplineId || getQuestionDisciplineIds(q).includes(filterDisciplineId);
      const matchesSubject = filterSubjectIds.length === 0 || filterSubjectIds.some((id) => getQuestionSubjectIds(q).includes(id));
      const matchesDifficulty = filterDifficultyLevels.length === 0 || filterDifficultyLevels.includes(String(q.difficulty_level || ""));
      const matchesOrgao = filterOrgaos.length === 0 || filterOrgaos.includes((q.orgao || "").trim());
      const matchesStatus = !filterStatus || q.status === filterStatus;
      const matchesYear = filterYears.length === 0 || filterYears.includes(String(q.year || ""));
      const matchesText = !text || getQuestionSearchText(q).includes(text);
      if (!matchesDiscipline || !matchesSubject || !matchesDifficulty || !matchesOrgao || !matchesStatus || !matchesYear || !matchesText) return;
      const boardId = q.exam_boards?.id;
      if (boardId) counts[boardId] = (counts[boardId] || 0) + 1;
    });
    return counts;
  }, [queue, filterDisciplineId, filterSubjectIds, filterDifficultyLevels, filterOrgaos, filterStatus, filterYears, filterText]);

  const subjectCounts = useMemo(() => {
    const text = normalizeFilterText(filterText);
    const counts: Record<string, number> = {};
    queue.forEach((q) => {
      const matchesDiscipline = !filterDisciplineId || getQuestionDisciplineIds(q).includes(filterDisciplineId);
      const matchesBoard = filterBoardIds.length === 0 || filterBoardIds.includes(q.exam_boards?.id ?? "");
      const matchesDifficulty = filterDifficultyLevels.length === 0 || filterDifficultyLevels.includes(String(q.difficulty_level || ""));
      const matchesOrgao = filterOrgaos.length === 0 || filterOrgaos.includes((q.orgao || "").trim());
      const matchesStatus = !filterStatus || q.status === filterStatus;
      const matchesYear = filterYears.length === 0 || filterYears.includes(String(q.year || ""));
      const matchesText = !text || getQuestionSearchText(q).includes(text);
      if (!matchesDiscipline || !matchesBoard || !matchesDifficulty || !matchesOrgao || !matchesStatus || !matchesYear || !matchesText) return;
      getQuestionSubjectIds(q).forEach((id) => { counts[id] = (counts[id] || 0) + 1; });
    });
    return counts;
  }, [queue, filterDisciplineId, filterBoardIds, filterDifficultyLevels, filterOrgaos, filterStatus, filterYears, filterText]);


  const availableOrgaos = useMemo(() => {
    const values = queue
      .map((question) => (question.orgao || "").trim())
      .filter(Boolean);
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [queue]);

  const orgaoCounts = useMemo(() => {
    const text = normalizeFilterText(filterText);
    const counts: Record<string, number> = {};
    queue.forEach((q) => {
      const matchesDiscipline = !filterDisciplineId || getQuestionDisciplineIds(q).includes(filterDisciplineId);
      const matchesBoard = filterBoardIds.length === 0 || filterBoardIds.includes(q.exam_boards?.id ?? "");
      const matchesSubject = filterSubjectIds.length === 0 || filterSubjectIds.some((id) => getQuestionSubjectIds(q).includes(id));
      const matchesDifficulty = filterDifficultyLevels.length === 0 || filterDifficultyLevels.includes(String(q.difficulty_level || ""));
      const matchesStatus = !filterStatus || q.status === filterStatus;
      const matchesYear = filterYears.length === 0 || filterYears.includes(String(q.year || ""));
      const matchesText = !text || getQuestionSearchText(q).includes(text);
      if (!matchesDiscipline || !matchesBoard || !matchesSubject || !matchesDifficulty || !matchesStatus || !matchesYear || !matchesText) return;
      const orgao = (q.orgao || "").trim();
      if (orgao) counts[orgao] = (counts[orgao] || 0) + 1;
    });
    return counts;
  }, [queue, filterDisciplineId, filterBoardIds, filterSubjectIds, filterDifficultyLevels, filterStatus, filterYears, filterText]);

  const yearCounts = useMemo(() => {
    const text = normalizeFilterText(filterText);
    const counts: Record<string, number> = {};
    queue.forEach((q) => {
      const matchesDiscipline = !filterDisciplineId || getQuestionDisciplineIds(q).includes(filterDisciplineId);
      const matchesBoard = filterBoardIds.length === 0 || filterBoardIds.includes(q.exam_boards?.id ?? "");
      const matchesSubject = filterSubjectIds.length === 0 || filterSubjectIds.some((id) => getQuestionSubjectIds(q).includes(id));
      const matchesDifficulty = filterDifficultyLevels.length === 0 || filterDifficultyLevels.includes(String(q.difficulty_level || ""));
      const matchesOrgao = filterOrgaos.length === 0 || filterOrgaos.includes((q.orgao || "").trim());
      const matchesStatus = !filterStatus || q.status === filterStatus;
      const matchesText = !text || getQuestionSearchText(q).includes(text);
      if (!matchesDiscipline || !matchesBoard || !matchesSubject || !matchesDifficulty || !matchesOrgao || !matchesStatus || !matchesText) return;
      const year = String(q.year || "");
      if (year) counts[year] = (counts[year] || 0) + 1;
    });
    return counts;
  }, [queue, filterDisciplineId, filterBoardIds, filterSubjectIds, filterDifficultyLevels, filterOrgaos, filterStatus, filterText]);

  const hasActiveFilters = Boolean(filterDisciplineId || filterBoardIds.length > 0 || filterOrgaos.length > 0 || filterSubjectIds.length > 0 || filterDifficultyLevels.length > 0 || filterStatus !== "pending_review" || filterYears.length > 0 || filterText.trim() || filterMissingTopics);
  const publicationQueueCount = publicationQueueIds.length;
  const isReadyToPublishView = filterStatus === "ready_to_publish" && filteredQueue.length > 0;

  // Ghost bar appears when 2+ questions are selected, when staged for queue, or in ready-to-publish view
  const ghostCount = selectedIds.length >= 2
    ? selectedIds.length
    : publicationQueueCount > 0
      ? publicationQueueCount
      : isReadyToPublishView ? filteredQueue.length : 0;

  const clearFilters = useCallback(() => {
    setFilterDisciplineId("");
    setFilterBoardIds([]);
    setFilterOrgaos([]);
    setFilterSubjectIds([]);
    setFilterDifficultyLevels([]);
    setFilterStatus("pending_review");
    setFilterYears([]);
    setFilterText("");
    setFilterMissingTopics(false);
  }, []);

  const removeQuestionFromList = useCallback((questionId: string) => {
    focusAfterAction(publicationQueueIds.filter((id) => id !== questionId));
    setQueue((current) => current.filter((question) => question.id !== questionId));
  }, [focusAfterAction, publicationQueueIds]);

  const togglePublicationQueue = useCallback((questionId: string) => {
    setPublicationQueueIds((current) =>
      current.includes(questionId)
        ? current.filter((id) => id !== questionId)
        : [...current, questionId],
    );
  }, []);

  const clearPublicationQueue = useCallback(() => setPublicationQueueIds([]), []);

  const toggleSelectQuestion = useCallback((id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }, []);

  const clearSelection = useCallback(() => setSelectedIds([]), []);

  const applyBulkEdit = useCallback(
    async (fields: BulkEditFields) => {
      const idsToUpdate = [...selectedIds];
      setBulkEditOpen(false);
      clearSelection();
      setActionFeedback({
        open: true,
        tone: "confirm",
        title: "Aplicando edições em massa",
        loading: true,
        steps: ["Atualizando questões selecionadas"],
        currentStep: 0,
      });
      try {
        const response = await adminFetch("/api/admin/questions/bulk", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: idsToUpdate, metadata: fields }),
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.message || "Erro ao aplicar edições.");
        setQueue((current) =>
          current.map((q) => {
            if (!idsToUpdate.includes(q.id)) return q;
            return {
              ...q,
              ...(fields.exam_board_id !== undefined && {
                exam_boards: fields.exam_board_id ? boards.find((b) => b.id === fields.exam_board_id) ?? null : null,
              }),
              ...(fields.year !== undefined && { year: fields.year }),
              ...(fields.difficulty_level !== undefined && { difficulty_level: fields.difficulty_level }),
            };
          }),
        );
        setActionFeedback({
          open: true,
          tone: "success",
          title: "Edições aplicadas",
          message: `${idsToUpdate.length} questão(ões) atualizada(s) com sucesso.`,
          onClose: () => setActionFeedback(null),
        });
      } catch (error) {
        setActionFeedback({
          open: true,
          tone: "error",
          title: "Erro nas edições em massa",
          message: error instanceof Error ? error.message : "Erro inesperado.",
          onClose: () => setActionFeedback(null),
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedIds, boards, clearSelection],
  );

  const registerQuestionSave = useCallback(
    (questionId: string, code: string, handler: () => Promise<{ ok: boolean; message?: string }>) => {
      saveHandlersRef.current[questionId] = { code, save: handler };
      return () => { delete saveHandlersRef.current[questionId]; };
    },
    [],
  );

  const formPublicationQueue = useCallback(async () => {
    if (publicationQueueIds.length === 0) return;

    const idsToQueue = [...publicationQueueIds];

    setActionFeedback({
      open: true,
      tone: "review",
      title: "Formando fila de publicação",
      loading: true,
      steps: queueSteps,
      currentStep: 0,
    });

    try {
      // Save each question individually; collect per-question failures with details.
      const failures: { id: string; code: string; message: string }[] = [];
      for (const questionId of idsToQueue) {
        const entry = saveHandlersRef.current[questionId];
        if (entry) {
          const result = await entry.save();
          if (!result.ok) {
            failures.push({ id: questionId, code: entry.code, message: result.message || "Erro ao salvar." });
          }
        }
      }

      const failedIds = new Set(failures.map((failure) => failure.id));
      const validIdsToQueue = idsToQueue.filter((id) => !failedIds.has(id));

      if (validIdsToQueue.length === 0) {
        setActionFeedback({
          open: true,
          tone: "error",
          title: `${failures.length} questão(ões) não puderam ser enviadas`,
          message: "Nenhuma questão foi enviada para a fila. Corrija os problemas abaixo e tente novamente:",
          children: (
            <div className="mt-3 space-y-2">
              {failures.map((f) => (
                <div key={f.code} className="rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-sm">
                  <span className="font-bold text-red-700">{f.code}</span>
                  <span className="ml-1 text-slate-600">— {f.message}</span>
                </div>
              ))}
            </div>
          ) as ReactNode,
          onClose: () => setActionFeedback(null),
        });
        return;
      }

      setActionFeedback({
        open: true,
        tone: "review",
        title: "Formando fila de publicação",
        loading: true,
        steps: queueSteps,
        currentStep: 1,
        message: failures.length > 0
          ? `${validIdsToQueue.length} questão(ões) serão enviadas. ${failures.length} questão(ões) serão ignoradas por inconsistência.`
          : undefined,
      });

      const response = await adminFetch("/api/admin/questions/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: validIdsToQueue, status: "ready_to_publish" }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Erro ao formar fila de publicação.");
      }

      setActionFeedback({
        open: true,
        tone: "review",
        title: "Formando fila de publicação",
        loading: true,
        steps: queueSteps,
        currentStep: 2,
      });
      const queuedIds = Array.isArray(result.updatedIds)
        ? validIdsToQueue.filter((id) => result.updatedIds.includes(id))
        : validIdsToQueue;
      const updateFailures = validIdsToQueue
        .filter((id) => !queuedIds.includes(id))
        .map((id) => ({
          id,
          code: saveHandlersRef.current[id]?.code || queue.find((question) => question.id === id)?.code || id,
          message: "A API nao retornou confirmacao de atualizacao desta questao.",
        }));
      const allFailures = [...failures, ...updateFailures];

      await wait(180);

      setQueue((current) => current.map((question) =>
        queuedIds.includes(question.id) ? { ...question, status: "ready_to_publish" } : question,
      ));
      notifyPublicationQueueUpdated();
      setPublicationQueueIds((current) => current.filter((id) => !queuedIds.includes(id)));
      focusAfterAction([]);

      setActionFeedback({
        open: true,
        tone: allFailures.length > 0 ? "warning" : "success",
        title: allFailures.length > 0 ? "Fila formada parcialmente" : "Fila de publicação formada",
        message: allFailures.length > 0
          ? `${queuedIds.length} questão(ões) enviada(s) para a fila. ${allFailures.length} questão(ões) não foram enviadas.`
          : `${queuedIds.length} questão(ões) enviada(s) para a fila de publicação.`,
        children: allFailures.length > 0 ? (
          <div className="mt-3 space-y-2">
            {allFailures.map((f) => (
              <div key={f.code} className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5 text-sm">
                <span className="font-bold text-amber-800">{f.code}</span>
                <span className="ml-1 text-slate-600">— {f.message}</span>
              </div>
            ))}
          </div>
        ) as ReactNode : undefined,
        steps: queueSteps,
        currentStep: 2,
        onClose: () => setActionFeedback(null),
      });
    } catch (error) {
      setActionFeedback({
        open: true,
        tone: "error",
        title: "Não foi possível formar a fila",
        message: error instanceof Error ? error.message : "Erro ao formar fila de publicação.",
        steps: queueSteps,
        currentStep: 1,
        onClose: () => setActionFeedback(null),
      });
    }
  }, [publicationQueueIds, queue, focusAfterAction]);

  const confirmFormPublicationQueue = useCallback(() => {
    if (publicationQueueIds.length === 0) return;
    setActionFeedback({
      open: true,
      tone: "review",
      title: "Formar fila de publicação",
      message: `Salvar alterações e enviar ${publicationQueueIds.length} questão(ões) para a fila de publicação?`,
      primaryLabel: "Formar fila",
      secondaryLabel: "Cancelar",
      onPrimary: formPublicationQueue,
      onSecondary: () => setActionFeedback(null),
      onClose: () => setActionFeedback(null),
    });
  }, [formPublicationQueue, publicationQueueIds.length]);

  const publishAllReadyQueue = useCallback(async () => {
    const idsToPublish = filteredQueue.map((q) => q.id);
    if (idsToPublish.length === 0) return;

    const count = idsToPublish.length;

    setActionFeedback({
      open: true,
      tone: "publish",
      title: `Publicando ${count} questão(ões)`,
      loading: true,
      steps: publishSteps,
      currentStep: 0,
    });
    await wait(140);

    setActionFeedback({
      open: true,
      tone: "publish",
      title: `Publicando ${count} questão(ões)`,
      loading: true,
      steps: publishSteps,
      currentStep: 1,
    });

    try {
      const saveFailures: { id: string; code: string; message: string }[] = [];
      for (const qId of idsToPublish) {
        const entry = saveHandlersRef.current[qId];
        if (entry) {
          const saveResult = await entry.save();
          if (!saveResult.ok) {
            saveFailures.push({ id: qId, code: entry.code, message: saveResult.message || "Erro ao salvar." });
          }
        }
      }
      const failedSaveIds = new Set(saveFailures.map((f) => f.id));
      const validIdsToPublish = idsToPublish.filter((id) => !failedSaveIds.has(id));

      if (validIdsToPublish.length === 0) {
        setActionFeedback({
          open: true,
          tone: "error",
          title: `${saveFailures.length} questão(ões) não puderam ser salvas`,
          message: "Nenhuma questão foi publicada. Corrija os problemas abaixo e tente novamente:",
          children: (
            <div className="mt-3 space-y-2">
              {saveFailures.map((f) => (
                <div key={f.code} className="rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-sm">
                  <span className="font-bold text-red-700">{f.code}</span>
                  <span className="ml-1 text-slate-600">— {f.message}</span>
                </div>
              ))}
            </div>
          ) as ReactNode,
          onClose: () => setActionFeedback(null),
        });
        return;
      }

      const response = await adminFetch("/api/admin/questions/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: validIdsToPublish, status: "published" }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Erro ao publicar questões.");
      }

      setActionFeedback({
        open: true,
        tone: "publish",
        title: `Publicando ${count} questão(ões)`,
        loading: true,
        steps: publishSteps,
        currentStep: 2,
      });
      await wait(180);

      const updatedIds: string[] = result.updatedIds || [];
      const blockedIds: string[] = result.blockedIds || [];
      const blockedSubjectIds: string[] = result.blockedSubjectIds || [];
      const actualPublished = result.updatedCount ?? updatedIds.length;
      const blockedCodes = blockedIds.map((bid: string) => {
        const q = filteredQueue.find((q) => q.id === bid);
        return q?.code || saveHandlersRef.current[bid]?.code || bid.slice(0, 8).toUpperCase();
      });
      const blockedSubjectCodes = blockedSubjectIds.map((bid: string) => {
        const q = filteredQueue.find((q) => q.id === bid);
        return q?.code || saveHandlersRef.current[bid]?.code || bid.slice(0, 8).toUpperCase();
      });
      setQueue((current) => current.filter((q) => !updatedIds.includes(q.id)));
      notifyPublicationQueueUpdated();
      setPublicationQueueIds((current) => current.filter((id) => !updatedIds.includes(id)));
      focusAfterAction(blockedIds.concat(blockedSubjectIds));
      setApprovedCount((current) => current + actualPublished);
      const messageParts: string[] = [];
      if (actualPublished > 0) messageParts.push(`${actualPublished} questão(ões) publicada(s).`);
      if (saveFailures.length > 0) messageParts.push(`${saveFailures.length} questão(ões) ignorada(s) por erro ao salvar.`);
      if (blockedIds.length > 0) messageParts.push(`${blockedIds.length} questão(ões) sem gabarito único devolvida(s) para revisão: ${blockedCodes.join(", ")}.`);
      if (blockedSubjectIds.length > 0) messageParts.push(`${blockedSubjectIds.length} questão(ões) ficaram na revisão porque estão sem assunto real/Prova completa: ${blockedSubjectCodes.join(", ")}.`);
      const hasPartialBlocks = blockedIds.length > 0 || blockedSubjectIds.length > 0 || saveFailures.length > 0;
      setActionFeedback({
        open: true,
        tone: hasPartialBlocks ? "warning" : "success",
        title: hasPartialBlocks ? "Publicação parcial" : "Fila publicada com sucesso",
        message: messageParts.join(" ") || `${actualPublished} questão(ões) publicada(s).`,
        steps: publishSteps,
        currentStep: 2,
        onClose: () => setActionFeedback(null),
      });
    } catch (error) {
      setActionFeedback({
        open: true,
        tone: "error",
        title: "Erro ao publicar",
        message: error instanceof Error ? error.message : "Erro ao publicar questões.",
        steps: publishSteps,
        currentStep: 1,
        onClose: () => setActionFeedback(null),
      });
    }
  }, [filteredQueue, focusAfterAction]);

  const confirmPublishAllReadyQueue = useCallback(() => {
    if (filteredQueue.length === 0) return;
    setActionFeedback({
      open: true,
      tone: "publish",
      title: "Publicar fila completa",
      message: `Deseja publicar ${filteredQueue.length} questão(ões) da fila de publicação?`,
      primaryLabel: "Publicar toda a fila",
      secondaryLabel: "Cancelar",
      onPrimary: publishAllReadyQueue,
      onSecondary: () => setActionFeedback(null),
      onClose: () => setActionFeedback(null),
    });
  }, [filteredQueue.length, publishAllReadyQueue]);

  const handleSaved = useCallback((message: string) => {
    setSavedCount((current) => current + 1);
    setActionFeedback({ open: true, tone: "success", title: "Revisão salva", message, onClose: () => setActionFeedback(null) });
  }, []);

  const handlePublished = useCallback(
    (questionId: string) => {
      removeQuestionFromList(questionId);
      setApprovedCount((current) => current + 1);
      setActionFeedback({ open: true, tone: "publish", title: "Questão publicada", message: "Questão salva e publicada com sucesso.", onClose: () => setActionFeedback(null) });
    },
    [removeQuestionFromList],
  );

  const handleArchived = useCallback(
    (questionId: string) => {
      removeQuestionFromList(questionId);
      setArchivedCount((current) => current + 1);
      setActionFeedback({ open: true, tone: "warning", title: "Questão arquivada", message: "Questão arquivada e removida da fila de revisão.", onClose: () => setActionFeedback(null) });
    },
    [removeQuestionFromList],
  );

  const handleAnnulled = useCallback(
    (questionId: string) => {
      removeQuestionFromList(questionId);
      setActionFeedback({ open: true, tone: "warning", title: "Questão anulada", message: "Questão marcada como anulada e removida da fila de revisão.", onClose: () => setActionFeedback(null) });
    },
    [removeQuestionFromList],
  );

  const handleError = useCallback((message: string) => {
    setActionFeedback({ open: true, tone: "error", title: "Não foi possível continuar", message, onClose: () => setActionFeedback(null) });
  }, []);

  return (
    <div className="min-h-screen bg-[#07111F] px-4 pb-20 pt-6 md:px-8 md:pt-10">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="mb-1 text-[10px] font-black uppercase tracking-[0.22em] text-orange-400">
            Esteira editorial
          </p>
          <h1 className="text-2xl font-black tracking-tight text-white">Revisar questões</h1>
          <p className="mt-1 text-sm text-white/40">
            Edite, valide e encaminhe questões para publicação.
          </p>
        </div>
        <Link href="/questoes">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-2xl border border-white/[0.09] bg-white/[0.05] px-5 py-2.5 text-sm font-semibold text-white/70 shadow-sm transition hover:border-white/[0.15] hover:bg-white/[0.09] hover:text-white/90"
          >
            <FileQuestion size={16} />
            Banco de questões
          </button>
        </Link>
      </div>

      <QuestionActionModal modal={actionFeedback} />

      <DraftRestoreModal
        open={Boolean(pendingPublicationQueueDraft)}
        savedAt={pendingPublicationQueueDraft?.savedAt}
        onContinue={restorePublicationQueueDraft}
        onDiscard={discardPublicationQueueDraft}
      />

      <SelectionGhostBar
        count={ghostCount}
        actions={[
          ...(selectedIds.length >= 2
            ? [
                { label: "Edições em massa", icon: <Pencil size={14} />, onClick: () => setBulkEditOpen(true), variant: "primary" as const },
                { label: "Limpar seleção", onClick: clearSelection, variant: "secondary" as const },
              ]
            : []),
          ...(publicationQueueCount > 0
            ? [
                { label: "Formar fila", icon: <UsersRound size={14} />, onClick: confirmFormPublicationQueue, variant: "primary" as const },
                { label: "Limpar fila", onClick: clearPublicationQueue, variant: "secondary" as const },
              ]
            : isReadyToPublishView
              ? [
                  { label: `Publicar ${filteredQueue.length} questão(ões)`, icon: <Send size={14} />, onClick: confirmPublishAllReadyQueue, variant: "primary" as const },
                ]
              : []),
        ]}
      />

      <BulkEditModal
        open={bulkEditOpen}
        count={selectedIds.length}
        disciplines={disciplines}
        subjects={subjects}
        boards={boards}
        onConfirm={applyBulkEdit}
        onClose={() => setBulkEditOpen(false)}
      />

      {/* Filter card */}
      <div className="relative z-20 mb-6 rounded-[1.75rem] border border-white/[0.07] bg-white/[0.03] p-5 shadow-xl shadow-black/20 backdrop-blur-sm md:p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-orange-500/[0.05] blur-3xl" />
        <div className="relative mb-6 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/10 text-orange-400">
            <Search size={18} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white/90">Filtros</h2>
            <p className="mt-0.5 text-sm text-white/35">Refine a busca nas questões a revisar.</p>
          </div>
        </div>
        <div className="relative space-y-5">
          {/* Linha 1: Busca, Disciplina, Assunto, Banca */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <RevisarSearch value={filterText} onChange={setFilterText} onClear={() => setFilterText("")} />

            <SimpleSelectDropdown
              label="Disciplina"
              value={filterDisciplineId}
              onChange={(v) => { setFilterDisciplineId(v); setFilterSubjectIds([]); }}
              options={[
                { value: "", label: "Todas" },
                ...disciplines.map((d) => ({ value: d.id, label: `${d.name} (${disciplineCounts[d.id] || 0})` })),
              ]}
            />

            <FilterSubjectDropdown
              subjects={filteredSubjects}
              selectedIds={filterSubjectIds}
              onChange={setFilterSubjectIds}
              counts={subjectCounts}
            />

            <BoardFilterDropdown
              boards={boards}
              selectedIds={filterBoardIds}
              onChange={setFilterBoardIds}
              counts={boardCounts}
            />
          </div>

          {/* Linha 2: Órgão, Ano, Dificuldade, Status */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <OrgaoFilterDropdown
              orgaos={availableOrgaos}
              selectedOrgaos={filterOrgaos}
              onChange={setFilterOrgaos}
              counts={orgaoCounts}
            />

            <YearFilterDropdown years={availableYears} selectedYears={filterYears} onChange={setFilterYears} counts={yearCounts} />

            <div className="relative">
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Dificuldade</label>
              <button
                type="button"
                onClick={() => setShowDifficultyDropdown((o) => !o)}
                className="group flex h-12 w-full items-center justify-between rounded-2xl border border-white/[0.08] bg-[#0D1926] px-4 text-left text-sm font-semibold text-white/80 outline-none transition duration-200 hover:border-white/[0.15]"
              >
                <span className="truncate">{getDifficultyLabel()}</span>
                <span className="flex items-center gap-2">
                  {filterDifficultyLevels.length > 0 && (
                    <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white">{filterDifficultyLevels.length}</span>
                  )}
                  <ChevronDown size={16} className={`text-white/30 transition duration-200 group-hover:text-orange-400 ${showDifficultyDropdown ? "rotate-180 text-orange-400" : ""}`} />
                </span>
              </button>
              {showDifficultyDropdown && (
                <div className="absolute left-0 top-full z-[9999] mt-2 w-full min-w-72 rounded-2xl border border-white/[0.09] bg-[#0D1B2E] p-3 shadow-2xl shadow-black/50 backdrop-blur-xl">
                  <div className="space-y-1">
                    {[{value:"1",label:"Muito fácil"},{value:"2",label:"Fácil"},{value:"3",label:"Média"},{value:"4",label:"Difícil"},{value:"5",label:"Muito difícil"}].map((opt) => {
                      const sel = filterDifficultyLevels.includes(opt.value);
                      return (
                        <button key={opt.value} type="button" onClick={() => toggleDifficultyLevel(opt.value)}
                          className={sel ? "flex w-full items-center justify-between rounded-xl border border-orange-400/30 bg-orange-400/10 px-4 py-3 text-left text-sm font-semibold text-white/90 transition" : "flex w-full items-center justify-between rounded-xl border border-transparent px-4 py-3 text-left text-sm font-semibold text-white/55 transition hover:border-white/[0.07] hover:bg-white/[0.04] hover:text-white/85"}
                        >
                          <span className="flex items-center gap-2">
                            <span className="flex items-center gap-0.5">
                              {Array.from({length: Number(opt.value)}).map((_,i) => <Star key={i} size={14} className="fill-current text-amber-400" />)}
                            </span>
                            <span>{opt.label}</span>
                          </span>
                          <span className={sel ? "flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-white" : "h-6 w-6 rounded-full border border-white/[0.15] bg-white/[0.05]"}>
                            {sel && <Check size={14} strokeWidth={3} />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex gap-2 border-t border-white/[0.07] pt-3">
                    <button type="button" onClick={() => setFilterDifficultyLevels([])} className="flex-1 rounded-2xl bg-white/[0.04] px-3 py-2 text-xs font-bold text-white/45 hover:bg-white/[0.08] hover:text-white/75">Limpar</button>
                    <button type="button" onClick={() => setShowDifficultyDropdown(false)} className="flex-1 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-500 px-3 py-2 text-xs font-bold text-white shadow-sm">Aplicar</button>
                  </div>
                </div>
              )}
            </div>

            <SimpleSelectDropdown
              label="Status"
              value={filterStatus}
              onChange={setFilterStatus}
              options={[
                { value: "", label: "Todos" },
                { value: "pending_review", label: "Pendente revisão" },
                { value: "ready_to_publish", label: "Fila de publicação" },
                { value: "draft", label: "Rascunho" },
                { value: "published", label: "Publicada" },
                { value: "active", label: "Ativa" },
                { value: "archived", label: "Arquivada" },
              ]}
            />

            <div className="flex flex-col">
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Tópicos avaliados</label>
              <button
                type="button"
                onClick={() => setFilterMissingTopics((current) => !current)}
                className={filterMissingTopics
                  ? "flex h-12 w-full items-center justify-between rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 text-left text-sm font-semibold text-amber-200 transition"
                  : "flex h-12 w-full items-center justify-between rounded-2xl border border-white/[0.08] bg-[#0D1926] px-4 text-left text-sm font-semibold text-white/60 transition hover:border-white/[0.15]"}
              >
                <span className="truncate">Sem tópicos avaliados</span>
                <span className={filterMissingTopics ? "flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white" : "h-6 w-6 rounded-full border border-white/[0.15] bg-white/[0.05]"}>
                  {filterMissingTopics && <Check size={14} strokeWidth={3} />}
                </span>
              </button>
            </div>
          </div>

          {/* Assuntos selecionados */}
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Assuntos:</span>
              {selectedSubjects.length === 0 ? (
                <span className="text-sm font-semibold text-white/35">Todos os assuntos</span>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {selectedSubjects.map((s) => (
                    <span key={s.id} className="inline-flex items-center gap-1 rounded-full border border-orange-400/30 bg-orange-400/10 px-3 py-1 text-xs font-bold text-orange-400">
                      {s.name}
                      <button
                        type="button"
                        onClick={() => setFilterSubjectIds((current) => current.filter((id) => id !== s.id))}
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

          <div className="flex justify-end">
            <button
              type="button"
              onClick={clearFilters}
              disabled={!hasActiveFilters}
              className="h-12 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-5 text-sm font-bold text-white/50 transition hover:border-white/[0.15] hover:bg-white/[0.08] hover:text-white/80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Limpar
            </button>
          </div>
        </div>
      </div>

      <div className="mt-5 mb-2 flex items-center justify-between px-0.5">
        <p className="text-xs font-semibold text-white/40">
          Sessão atual:{" "}
          <span className="font-bold text-orange-400">
            {stats.approved + stats.archived + stats.saved}
          </span>{" "}
          questão(ões) processadas
        </p>
        <p className="text-xs text-white/25">{queue.length} no banco</p>
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <StatCard label="Questões filtradas" value={filteredQueue.length} tone="violet" icon={<Filter size={15} />} />
        <StatCard label="Pendente de revisão" value={stats.pendingReview} tone="orange" icon={<ClipboardList size={15} />} />
        <StatCard label="Na fila" value={stats.readyToPublish} tone="amber" icon={<Clock size={15} />} />
        <StatCard label="Em rascunho" value={stats.saved} tone="slate" icon={<Save size={15} />} />
      </div>

      <div className="mb-6 flex flex-col gap-3 rounded-[2rem] border border-white/[0.07] bg-white/[0.03] px-5 py-3.5 shadow-sm shadow-black/10 sm:flex-row sm:items-center sm:justify-between">
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

      {filteredQueue.length === 0 && queue.length === 0 ? (
        <div className="overflow-hidden rounded-[2rem] border border-white/[0.07] bg-white/[0.03] shadow-xl shadow-black/20">
          <div className="border-b border-white/[0.06] px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.09] bg-white/[0.06]">
                <ClipboardCheck size={16} className="text-orange-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-white/80">Nenhuma questão pendente</p>
                <p className="text-xs text-white/35">Não há questões aguardando revisão neste momento.</p>
              </div>
            </div>
          </div>
          <div className="p-6">
            <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] p-10 text-center text-sm text-white/30">
              A fila de revisão está limpa.
            </div>
          </div>
        </div>
      ) : filteredQueue.length === 0 ? (
        <div className="overflow-hidden rounded-[2rem] border border-white/[0.07] bg-white/[0.03] shadow-xl shadow-black/20">
          <div className="border-b border-white/[0.06] px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.09] bg-white/[0.06]">
                <Search size={16} className="text-orange-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-white/80">Nenhuma questão encontrada</p>
                <p className="text-xs text-white/35">Ajuste os filtros para voltar a ver a fila de revisão.</p>
              </div>
            </div>
          </div>
          <div className="p-6">
            <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] p-10 text-center text-sm text-white/30">
              Nenhuma questão corresponde aos filtros atuais.
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {paginatedQueue.map((question, index) => (
            <MemoizedQuestionEditor
              key={question.id}
              initialQuestion={question}
              index={(safeCurrentPage - 1) * QUESTIONS_PER_PAGE + index}
              disciplines={disciplines}
              subjects={subjects}
              boards={boards}
              storageKey={`estudotop:draft:questoes:revisar:${question.id}`}
              draftContentMode="text-only"
              draftPromptGroupKey={REVIEW_DRAFT_PROMPT_GROUP}
              onSaved={handleSaved}
              onPublished={handlePublished}
              onArchived={handleArchived}
              onAnnulled={handleAnnulled}
              onError={handleError}
              queuedForPublication={publicationQueueIds.includes(question.id)}
              onTogglePublicationQueue={togglePublicationQueue}
              onRegisterSave={registerQuestionSave}
              isSelected={selectedIds.includes(question.id)}
              onToggleSelect={() => toggleSelectQuestion(question.id)}
            />
          ))}

          {filteredQueue.length > QUESTIONS_PER_PAGE && (
            <div className="flex flex-col gap-3 rounded-3xl border border-white/[0.07] bg-white/[0.03] p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="font-semibold text-white/50">
                Mostrando {(safeCurrentPage - 1) * QUESTIONS_PER_PAGE + 1}
                {" "}a {Math.min(safeCurrentPage * QUESTIONS_PER_PAGE, filteredQueue.length)}
                {" "}de {filteredQueue.length} questão(ões)
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={safeCurrentPage <= 1}
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 font-bold text-white/60 transition hover:bg-white/[0.08] hover:text-white/80 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Anterior
                </button>
                <span className="rounded-xl bg-white/[0.10] px-4 py-2 font-bold text-white/80">
                  {safeCurrentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safeCurrentPage >= totalPages}
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 font-bold text-white/60 transition hover:bg-white/[0.08] hover:text-white/80 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const MemoizedQuestionEditor = memo(QuestionEditor);


function RevisarSearch({
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
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/30 transition duration-200 group-focus-within:text-orange-400" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
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
  boards,
  selectedIds,
  onChange,
  counts = {},
}: {
  boards: { id: string; name: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  counts?: Record<string, number>;
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
    if (selectedIds.length === 0) return "Todas as bancas";
    if (selectedIds.length === 1) {
      const b = boards.find((x) => x.id === selectedIds[0]);
      return b?.name ?? "1 banca";
    }
    return `${selectedIds.length} bancas selecionadas`;
  }

  function toggleBoard(id: string) {
    setDraftIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Banca</label>
      <button
        type="button"
        onClick={() => { setDraftIds(selectedIds); setSearch(""); setOpen((o) => !o); }}
        className="group flex h-12 w-full items-center justify-between rounded-2xl border border-white/[0.08] bg-[#0D1926] px-4 text-left text-sm font-semibold text-white/80 outline-none transition hover:border-white/[0.15]"
      >
        <span className="truncate">{getLabel()}</span>
        <span className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white">{selectedIds.length}</span>
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
                  <button key={board.id} type="button" onClick={() => toggleBoard(board.id)}
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
      <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Órgão</label>
      <button
        type="button"
        onClick={() => { setDraftOrgaos(selectedOrgaos); setSearch(""); setOpen((o) => !o); }}
        className="group flex h-12 w-full items-center justify-between rounded-2xl border border-white/[0.08] bg-[#0D1926] px-4 text-left text-sm font-semibold text-white/80 outline-none transition hover:border-white/[0.15]"
      >
        <span className="truncate">{getLabel()}</span>
        <span className="flex items-center gap-2">
          {selectedOrgaos.length > 0 && (
            <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white">{selectedOrgaos.length}</span>
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
                  <button key={orgao} type="button" onClick={() => toggleOrgao(orgao)}
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
      <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Ano</label>
      <button
        type="button"
        onClick={() => { setDraftYears(selectedYears); setOpen((o) => !o); }}
        className="group flex h-12 w-full items-center justify-between rounded-2xl border border-white/[0.08] bg-[#0D1926] px-4 text-left text-sm font-semibold text-white/80 outline-none transition hover:border-white/[0.15]"
      >
        <span className="truncate">{getLabel()}</span>
        <span className="flex items-center gap-2">
          {selectedYears.length > 0 && (
            <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white">{selectedYears.length}</span>
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
                <button key={year} type="button" onClick={() => toggleYear(year)}
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

function FilterSubjectDropdown({
  subjects,
  selectedIds,
  onChange,
  counts = {},
}: {
  subjects: Subject[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  counts?: Record<string, number>;
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
    if (selectedIds.length === 0) return "Todos os assuntos";
    if (selectedIds.length === 1) {
      const s = subjects.find((x) => x.id === selectedIds[0]);
      return s?.name ?? "1 assunto";
    }
    return `${selectedIds.length} assuntos selecionados`;
  }

  function toggleSubject(id: string) {
    setDraftIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Assunto</label>
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
          <ChevronDown size={15} className={`text-white/30 transition duration-200 group-hover:text-orange-400 ${open ? "rotate-180 text-orange-400" : ""}`} />
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
              placeholder="Buscar assunto..."
              className="h-9 w-full rounded-xl border border-white/[0.09] bg-white/[0.05] px-3 text-sm text-white/70 outline-none placeholder:text-white/25 focus:border-orange-500/30 focus:ring-2 focus:ring-orange-500/[0.07]"
            />
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {(() => {
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
                    className={selected
                      ? "flex w-full items-center gap-3 rounded-xl border border-orange-500/30 bg-orange-500/[0.12] px-4 py-3 text-left text-sm font-semibold text-orange-100"
                      : "flex w-full items-center gap-3 rounded-xl border border-transparent px-4 py-3 text-left text-sm font-semibold text-white/60 hover:border-white/[0.07] hover:bg-white/[0.04] hover:text-white/80"}
                  >
                    <span className={selected ? "flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-orange-500 text-white" : "h-5 w-5 shrink-0 rounded-md border border-white/[0.15] bg-white/[0.04]"}>
                      {selected && <Check size={13} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{subject.name}</span>
                    <span className={selected ? "rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-black text-white" : "rounded-full border border-white/[0.08] bg-white/[0.05] px-2 py-0.5 text-[10px] font-black text-white/40"}>
                      {counts[subject.id] || 0}
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


function StatCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "orange" | "amber" | "green" | "red" | "slate" | "violet";
  icon: ReactNode;
}) {
  const styles = {
    orange: { border: "border-orange-500/20", num: "text-orange-400", iconBg: "border-orange-500/20 bg-orange-500/[0.10] text-orange-400" },
    amber:  { border: "border-amber-500/20",  num: "text-amber-400",  iconBg: "border-amber-500/20 bg-amber-500/[0.10] text-amber-400" },
    green:  { border: "border-emerald-500/20", num: "text-emerald-400", iconBg: "border-emerald-500/20 bg-emerald-500/[0.10] text-emerald-400" },
    red:    { border: "border-red-500/20",    num: "text-red-400",    iconBg: "border-red-500/20 bg-red-500/[0.10] text-red-400" },
    slate:  { border: "border-white/[0.08]",  num: "text-white/70",  iconBg: "border-white/[0.08] bg-white/[0.06] text-white/50" },
    violet: { border: "border-violet-500/20", num: "text-violet-400", iconBg: "border-violet-500/20 bg-violet-500/[0.10] text-violet-400" },
  }[tone];

  return (
    <div className={`rounded-2xl border bg-white/[0.03] ${styles.border} shadow-sm`}>
      <div className="flex items-start justify-between px-4 pb-3.5 pt-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">{label}</p>
          <p className={`mt-2 text-3xl font-black ${styles.num}`}>{value}</p>
        </div>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${styles.iconBg}`}>
          {icon}
        </span>
      </div>
    </div>
  );
}

function BulkEditModal({
  open,
  count,
  disciplines,
  subjects,
  boards,
  onConfirm,
  onClose,
}: {
  open: boolean;
  count: number;
  disciplines: Discipline[];
  subjects: Subject[];
  boards: Board[];
  onConfirm: (fields: BulkEditFields) => void;
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
    const fields: BulkEditFields = {};
    if (boardId) fields.exam_board_id = boardId;
    if (subjectIds.length > 0) fields.subject_ids = subjectIds;
    const y = parseInt(year.trim());
    if (year.trim() && /^\d{4}$/.test(year.trim()) && y >= 1990 && y <= 2100) fields.year = y;
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
            className="relative w-full max-w-lg overflow-hidden rounded-[2rem] border border-orange-400/25 bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950 text-white shadow-2xl shadow-orange-950/40"
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-orange-600 via-amber-400 to-yellow-300" />
            <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-orange-500/15 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-24 h-56 w-56 rounded-full bg-amber-400/10 blur-3xl" />

            <div className="relative px-7 pb-7 pt-8">
              <button
                type="button"
                onClick={onClose}
                className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/10 hover:text-white"
                aria-label="Fechar"
              >
                <X size={17} />
              </button>

              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-orange-400/10 text-orange-300 ring-1 ring-orange-400/20">
                  <Pencil size={22} />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-300">Edição em massa</p>
                  <h2 className="text-xl font-black tracking-tight text-white">
                    {count} questão(ões) selecionada(s)
                  </h2>
                </div>
              </div>

              <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-2.5 text-sm text-amber-200">
                Preencha apenas os campos que deseja alterar. Os demais permanecerão inalterados em cada questão.
              </p>

              <div className="mt-5 space-y-4">
                <PremiumSelect
                  label="Banca"
                  variant="jornada"
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
                  dark
                  subjects={subjects}
                  selectedIds={subjectIds}
                  onChange={setSubjectIds}
                  emptyLabel="Não alterar"
                  allowCreate={false}
                />

                <div className="grid grid-cols-2 gap-4">
                  <PremiumInput
                    label="Ano"
                    variant="jornada"
                    value={year}
                    inputMode="numeric"
                    placeholder="Não alterar"
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setYear(e.target.value.replace(/\D/g, "").slice(0, 4))
                    }
                  />

                  <PremiumSelect
                    label="Dificuldade"
                    variant="jornada"
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
                <PremiumButton variant="dark" onClick={onClose}>
                  Cancelar
                </PremiumButton>
                <PremiumButton
                  variant="dark-primary"
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
