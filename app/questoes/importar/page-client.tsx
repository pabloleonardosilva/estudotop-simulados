"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import PremiumDifficultyStars from "@/app/components/questions/PremiumDifficultyStars";
import { adminFetch } from "@/app/lib/supabase/adminFetch";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  Ban,
  Bold,
  Bot,
  BrushCleaning,
  Check,
  CheckCircle2,
  ClipboardPaste,
  Clock3,
  Eye,
  FileQuestion,
  Highlighter,
  ImageIcon,
  Italic,
  Layers3,
  Loader2,
  PauseCircle,
  Plus,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Star,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import PageBackground from "../../components/ui/PageBackground";
import PageHeader from "../../components/ui/PageHeader";
import PremiumButton from "../../components/ui/PremiumButton";
import SelectionGhostBar from "../../components/ui/SelectionGhostBar";
import PremiumCard from "../../components/ui/PremiumCard";
import PremiumInput from "../../components/ui/PremiumInput";
import PremiumLoadingOverlay from "../../components/ui/PremiumLoadingOverlay";
import SubjectMultiSelect from "../../components/questions/SubjectMultiSelect";
import PremiumScissorsIcon from "../../components/questions/PremiumScissorsIcon";
import SearchableSelect from "../../components/ui/SearchableSelect";
import DraftRestoreModal from "../../components/ui/DraftRestoreModal";
import RichTextEditor from "../../components/questions/RichTextEditor";
import EvaluatedTopicsInput from "../../components/questions/EvaluatedTopicsInput";
import { useLocalDraft } from "../../lib/useLocalDraft";
import { normalizeBoardComparableName, normalizeBoardName as normalizeBoardDisplayName } from "@/lib/utils/text";
import QuestionActionModal, { type QuestionActionModalState } from "../../components/questions/QuestionActionModal";
import { normalizeEvaluatedTopics } from "@/lib/questions/evaluated-topics";

const OWL_MARK = "\u{1F989}\uFE0F";

type Feedback = {
  type: "success" | "error" | "warning";
  message: string;
} | null;

const PROVA_COMPLETA_SUBJECT_ID = "__prova_completa__";
const PROVA_COMPLETA_SUBJECT = { id: PROVA_COMPLETA_SUBJECT_ID, name: "Prova completa", discipline_id: null };

function realSubjectIds(ids?: Array<string | null | undefined>) {
  return Array.from(new Set((ids || []).filter((id): id is string => Boolean(id && id !== PROVA_COMPLETA_SUBJECT_ID))));
}

function questionOwnSubjectIds(question: Pick<ImportedQuestion, "subject_id" | "subject_ids">) {
  return realSubjectIds([...(question.subject_ids || []), question.subject_id || undefined]);
}

type ImportedAlternative = {
  label: string;
  text: string;
  is_correct: boolean;
};

type ImportedQuestion = {
  temp_id: string;
  statement: string;
  question_type: "multiple_choice" | "true_false";
  board_name: string;
  exam_board_id?: string;
  orgao?: string | null;
  year?: number | string | null;
  difficulty_level: number | null;
  explanation_text: string;
  evaluated_topics: string[];
  subject_id?: string | null;
  subject_ids?: string[];
  alternatives: ImportedAlternative[];
  is_duplicate?: boolean;
  duplicate_type?: "batch" | "database" | "possible" | null;
  duplicate_message?: string;
  duplicate_of?: {
    id?: string;
    temp_id?: string;
    statement?: string | null;
    similarity?: number;
    statement_similarity?: number;
    alternatives_similarity?: number;
    matched_metadata?: string[];
  } | null;
};

type SentQuestion = {
  temp_id: string;
  statement: string;
  board_name: string;
};

type BoardOption = {
  id: string;
  name: string;
};

type ImportDraft = {
  rawText: string;
  questions: ImportedQuestion[];
  sentQuestions: SentQuestion[];
  expandedIds: string[];
  selectedIds: string[];
  disciplineId: string;
  subjectIds: string[];
  year: string;
  boardSearches: Record<string, string>;
  totalDetected?: number;
  analyzedCount?: number;
  processedBatches?: number;
  totalBatches?: number;
  failedBatches?: number;
};

type BoardCreateModalState = {
  status: "processing" | "success" | "error";
  name: string;
  affectedCount: number;
  message?: string;
};

type QuestionDisplayData = {
  code?: string | null;
  status: string;
  board_name: string;
  orgao?: string | null;
  year?: number | string | null;
  difficulty_level?: number | null;
  statement?: string | null;
  alternatives?: { label: string; text: string; is_correct: boolean }[];
  question_type?: "multiple_choice" | "true_false" | string | null;
  explanation_text?: string | null;
  discipline_name?: string;
  subject_names?: string[];
};

type CompareModalState = {
  importedTempId: string;
  duplicateQuestionId?: string | null;
  left: QuestionDisplayData;
  right: QuestionDisplayData | null;
  loading: boolean;
  source: string;
  similarity: number | null;
  statementSimilarity: number | null;
  alternativesSimilarity: number | null;
  matchedMetadata: string[] | null;
  hasImageEquivalence: boolean;
} | null;

function detectImageEquivalence(a?: string | null, b?: string | null): boolean {
  const hasText = (s: string) => /imagem\s+associada\s+para\s+resolu/i.test(s);
  const hasTag = (s: string) => /<img/i.test(s);
  const sa = a || "", sb = b || "";
  return (hasText(sa) && hasTag(sb)) || (hasTag(sa) && hasText(sb));
}

const BATCH_SIZE = 5;
const sendReviewSteps = [
  "Preparando questões selecionadas",
  "Validando duplicidades",
  "Conferindo banca, ano e metadados",
  "Salvando no banco",
  "Enviando para revisão",
  "Finalizando",
];
const IMAGE_PHRASE_REGEX = /imagem\s+associada\s+para\s+resolu[cç][aã]o\s+da\s+quest[aã]o/i;
const IMAGE_FILE_REGEX = /\b[\w][\w\s.-]*\.(png|jpe?g|gif|bmp|webp|tiff?|svg)(?:\s*\(\d+\s*[×x]\s*\d+\))?/i;

function questionRequiresImage(question: ImportedQuestion): boolean {
  const fields = [
    question.statement || "",
    question.explanation_text || "",
    ...question.alternatives.map((alt) => alt.text || ""),
  ];
  return fields.some((text) => IMAGE_PHRASE_REGEX.test(text) || IMAGE_FILE_REGEX.test(text));
}

function normalizeQuestionTypeByAlternativeCount(question: ImportedQuestion): ImportedQuestion {
  // Regra do Importador com IA: duas opções indicam assertiva Certo/Errado,
  // mesmo que a IA tenha devolvido o tipo como múltipla escolha.
  if ((question.alternatives || []).length !== 2) return question;

  return {
    ...question,
    question_type: "true_false",
  };
}

const questionMetadataLineRegex =
  /\bAno\s*:\s*(?:19\d{2}|20\d{2}|2100)\b[\s\S]{0,240}?\bBanca\s*:/i;

function isQConcursosJunkLine(line: string) {
  const normalized = line
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

  if (!normalized) return false;

  const exactJunk = new Set([
    "mentoria qconcursos",
    "home",
    "concursos publicos",
    "questoes",
    "minhas questoes",
    "nome do novo filtro",
    "palavra chave",
    "excluir questoes",
    "mostrar filtro simples",
    "filtros",
    "filtro",
    "buscar",
    "limpar",
    "aplicar",
    "entrar",
    "cadastre-se",
    "proxima",
    "anterior",
  ]);

  if (exactJunk.has(normalized)) return true;

  return [
    /^receba orientacao/,
    /^foram encontradas? \d+ quest/,
    /^pagina \d+/,
    /^ir para pagina/,
    /^questoes encontradas/,
    /^mostrar filtro/,
    /^ocultar filtro/,
    /^criar novo filtro/,
    /^salvar filtro/,
    /^limpar filtros/,
    /^ordenar por/,
    /^disciplinas?$/,
    /^assuntos?$/,
    /^bancas?$/,
    /^anos?$/,
    /^orgaos?$/,
    /^provas?$/,
  ].some((pattern) => pattern.test(normalized));
}

function isQuestionSignalLine(line: string) {
  const trimmed = line.trim();

  return (
    /^Q\d{3,}/i.test(trimmed) ||
    questionMetadataLineRegex.test(trimmed) ||
    /^(?:Ano|Banca|Órgão|Orgao|Prova|Disciplina|Assunto)\s*:/i.test(trimmed) ||
    /^\s*(?:quest(?:ão|ao)?\s*)?(?:n[ºo°.]?\s*)?\d{1,4}[).:-]\s+/i.test(trimmed) ||
    /^\s*(?:quest(?:ão|ao)\s*|n[ºo°.]?\s*)[IVXLCDM]{1,8}[).:-]\s+/i.test(trimmed)
  );
}

function sanitizeImportedText(text: string) {
  const lines = text
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""));

  const filtered = lines.filter((line) => !isQConcursosJunkLine(line));
  // Use only STRONG signals (Q-number, Ano:, Banca:) to trim preamble.
  // Bare numbered lines like "1. Abrir a PASTA1" must NOT trigger preamble removal —
  // they can be numbered steps inside a statement that follows the preceding paragraph.
  const firstSignalIndex = filtered.findIndex((line) => {
    const t = line.trim();
    return (
      /^Q\d{3,}/i.test(t) ||
      questionMetadataLineRegex.test(t) ||
      /^(?:Ano|Banca|Órgão|Orgao|Prova|Disciplina|Assunto)\s*:/i.test(t)
    );
  });
  const usefulLines =
    firstSignalIndex > 0 ? filtered.slice(firstSignalIndex) : filtered;

  return usefulLines
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function isPreMetadataContextLine(line: string) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.length > 80) return false;
  if (/^\s*([A-E])\s*[).:]\s*/i.test(trimmed)) return false;
  if (/^(?:[IVXLCDM]+\.?)(?:\s*(?:,|e)\s*[IVXLCDM]+\.?)*\s*(?:,?\s*apenas\.?)?$/i.test(trimmed)) return false;
  if (/^(?:est[aá]\s+corret[ao]|com rela[cç][aã]o|considere|analise|assinale)\b/i.test(trimmed)) {
    return false;
  }

  return /^[\p{L}\d\s/().,\-]+$/u.test(trimmed);
}

function detachPreMetadataContext(lines: string[]) {
  const context: string[] = [];

  while (lines.length > 0 && context.length < 4) {
    const lastLine = lines[lines.length - 1];

    if (!isPreMetadataContextLine(lastLine)) break;

    context.unshift(lines.pop() || "");
  }

  return context;
}

function looksLikeQuestionContinuation(value: string) {
  const lines = value
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const firstLine = lines[0] || "";

  return (
    !lines.some((line) => questionMetadataLineRegex.test(line)) &&
    (
      /^\s*alternativas?\s*[:\-]?\s*$/i.test(firstLine) ||
      /^\s*([A-E])\s*(?:[).:]|\s+-|\s*$)/i.test(firstLine) ||
      /^(?:[IVXLCDM]+\.?)(?:\s*(?:,|e)\s*[IVXLCDM]+\.?)*\s*(?:,?\s*apenas\.?)?$/i.test(firstLine) ||
      /^\s*\d{1,2}\.\s+\S/.test(firstLine)
    )
  );
}

function coalesceContinuationBlocks(blocks: string[]) {
  const merged: string[] = [];

  for (const block of blocks) {
    const cleaned = block.trim();
    if (!cleaned) continue;

    if (merged.length > 0 && looksLikeQuestionContinuation(cleaned)) {
      merged[merged.length - 1] = `${merged[merged.length - 1]}\n${cleaned}`.trim();
      continue;
    }

    merged.push(cleaned);
  }

  return merged;
}

function splitIntoQuestionBlocks(text: string) {
  const normalized = sanitizeImportedText(text);

  if (!normalized) return [];

  const markedRegex =
    /\(?IN[IÍ]CIO DA QUEST(?:ÃO|AO)\)?([\s\S]*?)\(?FIM DA QUEST(?:ÃO|AO)\)?/gi;
  const markedBlocks: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = markedRegex.exec(normalized)) !== null) {
    const block = match[1]?.trim();
    if (block) {
      markedBlocks.push(block);
    }
  }

  if (markedBlocks.length > 0) return markedBlocks;

  const lines = normalized.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  const strongQuestionStartRegex = /^\s*(?:Q\d{3,}|Ano\s*:)/i;
  const numberedQuestionStartRegex =
    /^\s*(?:quest(?:ão|ao)?\s*)?(?:n[ºo°.]?\s*)?(?:\d{1,4}|[IVXLCDM]{1,8})[).:-]?\s*$/i;
  const metadataRegex =
    /^\s*(?:Q\d{3,}|Ano\s*:|Banca\s*:|Órgão\s*:|Orgao\s*:|Provas?\s*:)/i;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const trimmed = line.trim();
    const hasMetadataAhead = lines
      .slice(index + 1, index + 8)
      .some((nextLine) => metadataRegex.test(nextLine.trim()));
    const isQuestionStart =
      strongQuestionStartRegex.test(trimmed) ||
      questionMetadataLineRegex.test(trimmed) ||
      (numberedQuestionStartRegex.test(trimmed) && hasMetadataAhead);
    const previousLine = current[current.length - 1] ?? "";
    const hasBlankLineBefore = previousLine.trim().length === 0;

    if (
      isQuestionStart &&
      current.join("\n").trim().length > 0 &&
      (hasBlankLineBefore || current.join("\n").trim().length > 250)
    ) {
      const preMetadataContext = questionMetadataLineRegex.test(trimmed)
        ? detachPreMetadataContext(current)
        : [];
      const previousBlock = current.join("\n").trim();

      if (previousBlock) {
        blocks.push(previousBlock);
      }
      current = [...preMetadataContext, line];
      continue;
    }

    current.push(line);
  }

  const lastBlock = current.join("\n").trim();
  if (lastBlock) blocks.push(lastBlock);

  return coalesceContinuationBlocks(blocks.length ? blocks : [normalized]);
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function parseValidYear(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  const year = Number(value);

  if (!Number.isInteger(year) || year < 1990 || year > 2100) {
    return null;
  }

  return year;
}

function normalizeAgencyName(value?: string | null) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeForSimilarity(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function jaccardSimilarityClient(a: string, b: string): number {
  const aTokens = new Set(normalizeForSimilarity(a).split(" ").filter((t) => t.length > 2));
  const bTokens = new Set(normalizeForSimilarity(b).split(" ").filter((t) => t.length > 2));
  if (!aTokens.size || !bTokens.size) return 0;
  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection++;
  }
  const union = new Set([...aTokens, ...bTokens]).size;
  return union ? intersection / union : 0;
}

export default function ImportarQuestoesClient({
  disciplines,
  subjects,
  initialBoards,
}: {
  disciplines: any[];
  subjects: any[];
  initialBoards: any[];
}) {
  const stopRef = useRef(false);
  const questionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const currentQuestionsForBatchRef = useRef<ImportedQuestion[]>([]);

  const [rawText, setRawText] = useState("");
  const [questions, setQuestions] = useState<ImportedQuestion[]>([]);
  const [sentQuestions, setSentQuestions] = useState<SentQuestion[]>([]);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [annulledTempIds, setAnnulledTempIds] = useState<string[]>([]);

  const [disciplineId, setDisciplineId] = useState("");
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [year, setYear] = useState("");

  const [boards, setBoards] = useState(initialBoards || []);
  const [boardSearches, setBoardSearches] = useState<Record<string, string>>({});
  const [boardSuggestions, setBoardSuggestions] = useState<Record<string, any[]>>({});
  const [subjectSearches, setSubjectSearches] = useState<Record<string, string>>({});
  const [eliminatedAltKeys, setEliminatedAltKeys] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [totalDetected, setTotalDetected] = useState(0);
  const [analyzedCount, setAnalyzedCount] = useState(0);
  const [processedBatches, setProcessedBatches] = useState(0);
  const [failedBatches, setFailedBatches] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [boardCreateModal, setBoardCreateModal] =
    useState<BoardCreateModalState | null>(null);
  const [creatingBoardQuestionId, setCreatingBoardQuestionId] = useState<
    string | null
  >(null);
  const [sendReviewModal, setSendReviewModal] = useState<QuestionActionModalState>(null);
  const [possibleDuplicateConfirm, setPossibleDuplicateConfirm] = useState<{
    questions: ImportedQuestion[];
    count: number;
  } | null>(null);
  const [compareModal, setCompareModal] = useState<CompareModalState>(null);
  const [resolvingDuplicate, setResolvingDuplicate] = useState(false);

  const filteredSubjects = useMemo(() => {
    const base = !disciplineId ? subjects : subjects.filter((subject) => subject.discipline_id === disciplineId);
    return [PROVA_COMPLETA_SUBJECT, ...base];
  }, [subjects, disciplineId]);

  const duplicateCount = useMemo(
    () => questions.filter((question) => question.is_duplicate).length,
    [questions],
  );

  const possibleDuplicateCount = useMemo(
    () => questions.filter((question) => question.duplicate_type === "possible").length,
    [questions],
  );

  const pendingCount = questions.length;
  const sentCount = sentQuestions.length;
  const sendingToReview = Boolean(sendReviewModal?.loading);

  const selectedQuestions = useMemo(() => {
    return questions.filter(
      (question) =>
        selectedIds.includes(question.temp_id) && !question.is_duplicate,
    );
  }, [questions, selectedIds]);

  const progressPercent =
    totalBatches > 0 ? Math.round((processedBatches / totalBatches) * 100) : 0;

  const draft = useMemo<ImportDraft>(
    () => ({
      rawText,
      questions,
      sentQuestions,
      expandedIds,
      selectedIds,
      disciplineId,
      subjectIds,
      year,
      boardSearches,
      totalDetected,
      analyzedCount,
      processedBatches,
      totalBatches,
      failedBatches,
    }),
    [
      boardSearches,
      disciplineId,
      expandedIds,
      questions,
      rawText,
      selectedIds,
      sentQuestions,
      subjectIds,
      analyzedCount,
      failedBatches,
      processedBatches,
      totalBatches,
      totalDetected,
      year,
    ],
  );

  const hasDraftContent = useCallback((value: ImportDraft) => {
    return Boolean(value.rawText.trim() || value.questions.length);
  }, []);

  const restoreSavedDraft = useCallback((value: ImportDraft) => {
    setRawText(value.rawText || "");
    setQuestions(value.questions || []);
    setSentQuestions(value.sentQuestions || []);
    setExpandedIds(value.expandedIds || []);
    setSelectedIds(value.selectedIds || []);
    setDisciplineId(value.disciplineId || "");
    setSubjectIds(value.subjectIds || []);
    setYear(value.year || "");
    setBoardSearches(value.boardSearches || {});
    setBoardSuggestions({});
    // Reconstrói subjectSearches a partir dos assuntos já selecionados por questão
    setSubjectSearches(() => {
      const map: Record<string, string> = {};
      for (const q of value.questions || []) {
        const sid = q.subject_ids?.[0] || q.subject_id;
        if (sid) {
          const name = filteredSubjects.find((s) => s.id === sid)?.name || "";
          if (name) map[q.temp_id] = name;
        }
      }
      return map;
    });
    setCurrentBatch(0);
    setTotalBatches(value.totalBatches || 0);
    setTotalDetected(value.totalDetected || value.questions?.length || 0);
    setAnalyzedCount(
      value.analyzedCount ||
        (value.questions?.length || 0) + (value.sentQuestions?.length || 0),
    );
    setProcessedBatches(value.processedBatches || 0);
    setFailedBatches(value.failedBatches || 0);
  }, []);

  const {
    pendingDraft,
    restoreDraft: continueDraft,
    discardDraft,
    clearDraft: clearStoredDraft,
  } = useLocalDraft({
    storageKey: "estudotop:draft:questoes:importar",
    draft,
    hasContent: hasDraftContent,
    onRestore: restoreSavedDraft,
  });

  async function refreshBoards() {
    const response = await adminFetch("/api/admin/exam-boards/search");
    const result = await response.json();

    if (result.ok) {
      setBoards(result.boards || []);
    }
  }

  function wait(ms: number) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function normalizeBoardName(value: string) {
    return normalizeBoardDisplayName(value);
  }

  function boardExists(value: string) {
    const normalized = normalizeBoardName(value);
    if (!normalized) return false;
    return boards.some(
      (board) => normalizeBoardComparableName(board.name) === normalizeBoardComparableName(normalized),
    );
  }

  function upsertBoardInState(board: BoardOption) {
    setBoards((current) => {
      const exists = current.some(
        (item) => normalizeBoardName(item.name) === normalizeBoardName(board.name),
      );

      if (exists) {
        return current.map((item) =>
          normalizeBoardName(item.name) === normalizeBoardName(board.name)
            ? board
            : item,
        );
      }

      return [...current, board].sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"),
      );
    });
  }

  function clearImportDraft() {
    setRawText("");
    setQuestions([]);
    setSentQuestions([]);
    setExpandedIds([]);
    setSelectedIds([]);
    setBoardSearches({});
    setBoardSuggestions({});
    setCurrentBatch(0);
    setTotalBatches(0);
    setTotalDetected(0);
    setAnalyzedCount(0);
    setProcessedBatches(0);
    setFailedBatches(0);
    clearStoredDraft();
    setFeedback({ type: "success", message: "Rascunho da importação limpo." });
  }

  function stopImport() {
    stopRef.current = true;
    setProcessing(false);
    setFeedback({
      type: "warning",
      message: "Importação interrompida. Os lotes já processados foram mantidos.",
    });
  }

    function toggleExpanded(id: string) {
    setExpandedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function toggleSelected(id: string) {
    const question = questions.find((item) => item.temp_id === id);
    if (question?.is_duplicate) return;

    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function selectAll() {
    setSelectedIds(
      questions
        .filter((question) => !question.is_duplicate)
        .map((question) => question.temp_id),
    );
  }

  function discardQuestion(id: string) {
    setQuestions((current) =>
      current.filter((question) => question.temp_id !== id),
    );
    setSelectedIds((current) => current.filter((item) => item !== id));
    setExpandedIds((current) => current.filter((item) => item !== id));
    setBoardSearches((current) => {
      const copy = { ...current };
      delete copy[id];
      return copy;
    });
    setBoardSuggestions((current) => {
      const copy = { ...current };
      delete copy[id];
      return copy;
    });
    setFeedback({
      type: "success",
      message: "Questão descartada da prévia.",
    });
  }

  async function openCompareModal(question: ImportedQuestion) {
    const duplicate = question.duplicate_of;
    if (!duplicate) return;

    const discipline = disciplines.find((d: any) => d.id === disciplineId);
    const selectedSubjectNames = filteredSubjects
      .filter((s: any) => subjectIds.includes(s.id))
      .map((s: any) => s.name);

    const left: QuestionDisplayData = {
      code: null,
      status: "Importada (prévia)",
      board_name: normalizeBoardName(question.board_name),
      orgao: question.orgao || null,
      year: question.year,
      difficulty_level: question.difficulty_level,
      statement: question.statement,
      alternatives: question.alternatives,
      question_type: question.question_type,
      explanation_text: question.explanation_text,
      discipline_name: discipline?.name,
      subject_names: selectedSubjectNames,
    };

    setCompareModal({
      importedTempId: question.temp_id,
      duplicateQuestionId: duplicate.id || null,
      left,
      right: null,
      loading: true,
      source: duplicate.id ? "database" : "batch",
      similarity: duplicate.similarity ?? null,
      statementSimilarity: duplicate.statement_similarity ?? null,
      alternativesSimilarity: duplicate.alternatives_similarity ?? null,
      matchedMetadata: duplicate.matched_metadata ?? null,
      hasImageEquivalence: false,
    });

    if (duplicate.id) {
      const response = await adminFetch(`/api/admin/questions/${duplicate.id}`);
      const result = await response.json();
      if (result.ok && result.question) {
        const q = result.question;
        const boardObj = boards.find((b: any) => b.id === q.exam_board_id);
        const right: QuestionDisplayData = {
          code: q.code,
          status: q.status,
          board_name: boardObj?.name ?? "—",
          orgao: q.orgao || null,
          year: q.year,
          difficulty_level: q.difficulty_level,
          statement: q.statement,
          question_type: q.question_type,
          alternatives: (q.question_alternatives || []).map((alt: any) => {
            const raw: string = alt.text || "";
            const text = raw
              .replace(/<strong>(imagem\s+associada\s+para\s+resolu[cç][aã]o\s+da\s+quest[aã]o)<\/strong>/gi, "$1")
              .replace(/imagem\s+associada\s+para\s+resolu[cç][aã]o\s+da\s+quest[aã]o/gi, (m: string) => `<strong>${m}</strong>`);
            return { label: alt.label, text, is_correct: alt.is_correct };
          }),
          explanation_text: q.explanation_text,
          discipline_name: q.question_subjects?.[0]?.subjects?.disciplines?.name,
          subject_names: (q.question_subjects || [])
            .map((qs: any) => qs.subjects?.name)
            .filter(Boolean),
        };
        setCompareModal((current) => current ? { ...current, right, loading: false, hasImageEquivalence: detectImageEquivalence(current.left.statement, right.statement) } : null);
      } else {
        setCompareModal((current) => current ? { ...current, loading: false } : null);
      }
    } else if (duplicate.temp_id) {
      const batchQ = questions.find((q) => q.temp_id === duplicate.temp_id);
      if (batchQ) {
        const right: QuestionDisplayData = {
          code: null,
          status: "Importada (prévia)",
          board_name: normalizeBoardName(batchQ.board_name),
          orgao: batchQ.orgao || null,
          year: batchQ.year,
          difficulty_level: batchQ.difficulty_level,
          statement: batchQ.statement,
          alternatives: batchQ.alternatives,
          question_type: batchQ.question_type,
          explanation_text: batchQ.explanation_text,
          discipline_name: discipline?.name,
          subject_names: selectedSubjectNames,
        };
        setCompareModal((current) => current ? { ...current, right, loading: false, hasImageEquivalence: detectImageEquivalence(current.left.statement, right.statement) } : null);
      } else {
        setCompareModal((current) => current ? { ...current, loading: false } : null);
      }
    }
  }

  function releaseImportedDuplicate(tempId: string) {
    setQuestions((current) =>
      current.map((question) =>
        question.temp_id === tempId
          ? {
              ...question,
              is_duplicate: false,
              duplicate_type: null,
              duplicate_message: undefined,
              duplicate_of: null,
            }
          : question,
      ),
    );
    setSelectedIds((current) => (current.includes(tempId) ? current : [...current, tempId]));
  }

  async function keepImportedAndArchiveExisting() {
    if (!compareModal || resolvingDuplicate) return;

    const importedTempId = compareModal.importedTempId;
    const existingQuestionId = compareModal.duplicateQuestionId;

    if (compareModal.source !== "database" || !existingQuestionId) {
      releaseImportedDuplicate(importedTempId);
      setCompareModal(null);
      setFeedback({
        type: "success",
        message: "Questão importada liberada para seguir no fluxo.",
      });
      return;
    }

    setResolvingDuplicate(true);

    try {
      const response = await adminFetch("/api/admin/questions/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [existingQuestionId], status: "archived" }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Não foi possível arquivar a questão existente.");
      }

      releaseImportedDuplicate(importedTempId);
      setCompareModal(null);
      setFeedback({
        type: "success",
        message: "Questão existente arquivada. A questão importada foi liberada e selecionada para seguir no fluxo.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao substituir a questão duplicada.",
      });
    } finally {
      setResolvingDuplicate(false);
    }
  }

  function discardSelectedQuestions() {
    if (sendingToReview || selectedQuestions.length === 0) return;

    const ids = selectedQuestions.map((question) => question.temp_id);
    const idSet = new Set(ids);
    const firstRemaining = questions.find((q) => !idSet.has(q.temp_id));

    ids.forEach((id) => discardQuestion(id));
    setFeedback({
      type: "success",
      message: `${ids.length} questão(ões) descartada(s) da prévia.`,
    });

    if (firstRemaining) {
      setTimeout(() => {
        questionRefs.current[firstRemaining.temp_id]?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 150);
    }
  }

  function removeDuplicateQuestions() {
    const duplicateIds = questions
      .filter((question) => question.is_duplicate)
      .map((question) => question.temp_id);

    if (!duplicateIds.length) {
      setFeedback({
        type: "warning",
        message: "Nenhuma questão duplicada encontrada na prévia.",
      });
      return;
    }

    const duplicateIdSet = new Set(duplicateIds);

    setQuestions((current) =>
      current.filter((question) => !duplicateIdSet.has(question.temp_id)),
    );
    setSelectedIds((current) => current.filter((id) => !duplicateIdSet.has(id)));
    setExpandedIds((current) => current.filter((id) => !duplicateIdSet.has(id)));
    setBoardSearches((current) => {
      const copy = { ...current };
      duplicateIds.forEach((id) => {
        delete copy[id];
      });
      return copy;
    });
    setBoardSuggestions((current) => {
      const copy = { ...current };
      duplicateIds.forEach((id) => {
        delete copy[id];
      });
      return copy;
    });
    setFeedback({
      type: "success",
      message: `${duplicateIds.length} questão(ões) duplicada(s) removida(s).`,
    });
  }

  function updateQuestion(
    id: string,
    field: keyof ImportedQuestion,
    value: any,
  ) {
    setQuestions((current) =>
      current.map((question) =>
        question.temp_id === id ? { ...question, [field]: value } : question,
      ),
    );
  }

  function updateAlternative(
    questionId: string,
    index: number,
    field: keyof ImportedAlternative,
    value: any,
  ) {
    setQuestions((current) =>
      current.map((question) => {
        if (question.temp_id !== questionId) return question;

        return {
          ...question,
          alternatives: question.alternatives.map((alternative, altIndex) =>
            altIndex === index
              ? { ...alternative, [field]: value }
              : field === "is_correct" && value === true
                ? { ...alternative, is_correct: false }
              : alternative,
          ),
        };
      }),
    );
  }

  function applyBoardToQuestion(questionId: string, board: BoardOption) {
    if (!board?.id) return;

    upsertBoardInState(board);

    setQuestions((current) =>
      current.map((question) =>
        question.temp_id === questionId
          ? {
              ...question,
              exam_board_id: board.id,
              board_name: board.name || "",
            }
          : question,
      ),
    );

    setBoardSearches((current) => ({
      ...current,
      [questionId]: board.name || "",
    }));

    setBoardSuggestions((current) => ({
      ...current,
      [questionId]: [],
    }));
  }

  function applySubjectsToQuestion(questionId: string, ids: string[]) {
    const cleanedIds = realSubjectIds(ids);
    setQuestions((current) =>
      current.map((q) =>
        q.temp_id === questionId
          ? { ...q, subject_id: cleanedIds[0] || null, subject_ids: cleanedIds }
          : q,
      ),
    );
  }

  async function searchBoardForQuestion(questionId: string, value: string) {
    setBoardSearches((current) => ({
      ...current,
      [questionId]: value,
    }));

    setQuestions((current) =>
      current.map((question) =>
        question.temp_id === questionId
          ? {
              ...question,
              board_name: value,
              exam_board_id: "",
            }
          : question,
      ),
    );

    if (!value.trim()) {
      setBoardSuggestions((current) => ({
        ...current,
        [questionId]: [],
      }));
      return;
    }

    const response = await fetch(
      `/api/admin/exam-boards/search?q=${encodeURIComponent(value)}`,
    );

    const result = await response.json();

    if (result.ok) {
      const foundBoards = ((result.boards || []) as BoardOption[]);
      const exactBoard = foundBoards.find(
        (board) =>
          normalizeBoardComparableName(board.name || "") === normalizeBoardComparableName(value),
      );

      if (exactBoard) {
        applyBoardToQuestion(questionId, exactBoard);
        return;
      }

      setBoardSuggestions((current) => ({
        ...current,
        [questionId]: foundBoards,
      }));
    }
  }

  async function createBoardForQuestion(questionId: string) {
    const value = (boardSearches[questionId] || "").trim();

    if (!value) {
      setFeedback({
        type: "error",
        message: "Digite o nome da banca antes de cadastrar.",
      });
      return;
    }

    const typedBoardName = normalizeBoardName(value);
    const affectedCount = Math.max(
      1,
      questions.filter((question) => {
        const currentBoardName = normalizeBoardName(question.board_name || "");
        const currentSearchName = normalizeBoardName(
          boardSearches[question.temp_id] || "",
        );

        return (
          question.temp_id === questionId ||
          currentBoardName === typedBoardName ||
          currentSearchName === typedBoardName
        );
      }).length,
    );

    setCreatingBoardQuestionId(questionId);
    setBoardCreateModal({
      status: "processing",
      name: value,
      affectedCount,
      message: "Cadastrando banca e aplicando nas questões correspondentes.",
    });

    try {
      const response = await adminFetch("/api/admin/exam-boards", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: value }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Erro ao cadastrar banca.");
      }

      const board = result.board;
      upsertBoardInState(board);

      setQuestions((current) =>
        current.map((question) => {
          const currentBoardName = normalizeBoardName(
            question.board_name || "",
          );
          const currentSearchName = normalizeBoardName(
            boardSearches[question.temp_id] || "",
          );

          if (
            question.temp_id === questionId ||
            currentBoardName === typedBoardName ||
            currentSearchName === typedBoardName
          ) {
            return {
              ...question,
              exam_board_id: board.id,
              board_name: board.name,
            };
          }

          return question;
        }),
      );

      setBoardSearches((current) => {
        const copy = { ...current };

        Object.keys(copy).forEach((key) => {
          const currentValue = normalizeBoardName(String(copy[key] || ""));
          const matchingQuestion = questions.find(
            (question) => question.temp_id === key,
          );
          const currentQuestionBoardName = normalizeBoardName(
            matchingQuestion?.board_name || "",
          );

          if (
            key === questionId ||
            currentValue === typedBoardName ||
            currentQuestionBoardName === typedBoardName
          ) {
            copy[key] = board.name;
          }
        });

        return copy;
      });

      setBoardSuggestions((current) => {
        const copy = { ...current };

        Object.keys(copy).forEach((key) => {
          const currentValue = normalizeBoardName(
            String(boardSearches[key] || ""),
          );
          const matchingQuestion = questions.find(
            (question) => question.temp_id === key,
          );
          const currentQuestionBoardName = normalizeBoardName(
            matchingQuestion?.board_name || "",
          );

          if (
            key === questionId ||
            currentValue === typedBoardName ||
            currentQuestionBoardName === typedBoardName
          ) {
            copy[key] = [];
          }
        });

        return copy;
      });

      await refreshBoards();

      setBoardCreateModal({
        status: "success",
        name: board.name,
        affectedCount,
        message: result.created
          ? "Banca cadastrada e aplicada nas questões correspondentes."
          : "Banca já existia e foi aplicada nas questões correspondentes.",
      });

      setFeedback({
        type: "success",
        message: result.created
          ? `Banca ${board.name} cadastrada, selecionada e normalizada nas questões correspondentes.`
          : `Banca ${board.name} selecionada.`,
      });
    } catch (error) {
      setBoardCreateModal({
        status: "error",
        name: value,
        affectedCount,
        message: error instanceof Error ? error.message : "Erro ao cadastrar banca.",
      });
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao cadastrar banca.",
      });
    } finally {
      setCreatingBoardQuestionId(null);
    }
  }

  async function analyzeTextInBatches() {
    setFeedback(null);

    if (!rawText.trim()) {
      setFeedback({
        type: "error",
        message: "Cole o texto com as questões antes de analisar.",
      });
      return;
    }

    if (!disciplineId || subjectIds.length === 0) {
      setFeedback({
        type: "error",
        message:
          "Informe disciplina e pelo menos um assunto antes de iniciar a importação.",
      });
      return;
    }

    const blocks = splitIntoQuestionBlocks(rawText);

    if (blocks.length === 0) {
      setFeedback({
        type: "error",
        message: "Nenhum texto válido foi encontrado para análise.",
      });
      return;
    }

    stopRef.current = false;
    currentQuestionsForBatchRef.current = [];
    setProcessing(true);
    setLoading(false);
    setQuestions([]);
    setSentQuestions([]);
    setSelectedIds([]);
    setExpandedIds([]);
    setBoardSearches({});
    setBoardSuggestions({});
    setCurrentBatch(0);
    setProcessedBatches(0);
    setAnalyzedCount(0);
    setFailedBatches(0);
    setTotalDetected(blocks.length);

    const batches = chunkArray(blocks, BATCH_SIZE);
    setTotalBatches(batches.length);

    await new Promise((resolve) => setTimeout(resolve, 60));

    try {
      for (let index = 0; index < batches.length; index++) {
        if (stopRef.current) break;

        setCurrentBatch(index + 1);

        const batchBlocks = batches[index];
        const batchText = batchBlocks.join("\n\n");
        const defaultYear = parseValidYear(year);

        const response = await fetch(
          "/api/admin/questions/import/analyze-batch",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text: batchText,
              blocks: batchBlocks,
              subject_id: subjectIds.includes(PROVA_COMPLETA_SUBJECT_ID) ? null : subjectIds[0],
              subject_ids: subjectIds.filter((id) => id !== PROVA_COMPLETA_SUBJECT_ID),
              subject_mode: subjectIds.includes(PROVA_COMPLETA_SUBJECT_ID) ? "prova_completa" : "normal",
              year: defaultYear,
              batch_index: index,
            }),
          },
        );

        const result = await response.json();

        if (!response.ok || !result.ok) {
          setFailedBatches((current) => current + 1);
          setProcessedBatches((current) => current + 1);
          setFeedback({
            type: "warning",
            message:
              result.message ||
              `Erro ao analisar lote ${index + 1}. Os demais lotes continuarão.`,
          });
          continue;
        }

        const rawNewQuestions = ((result.questions || []) as ImportedQuestion[])
          .map((question) => ({
            ...question,
            orgao: normalizeAgencyName(question.orgao),
            evaluated_topics: normalizeEvaluatedTopics(question.evaluated_topics),
          }))
          .map(normalizeQuestionTypeByAlternativeCount);
        const defaultSubjectIdsForBatch = realSubjectIds(subjectIds);

        // Deduplicação cross-batch: compara novas questões contra as de lotes anteriores.
        // Se o usuário escolheu um assunto real antes da importação, cada questão analisada
        // herda esse assunto. Assim, "Redefinir assunto" só aparece quando o modo escolhido
        // é Prova completa ou quando não existe assunto real definido.
        const newQuestions = rawNewQuestions.map((nq) => {
          const ownSubjectIds = questionOwnSubjectIds(nq);
          const effectiveSubjectIds = ownSubjectIds.length > 0 ? ownSubjectIds : defaultSubjectIdsForBatch;
          const normalizedQuestion = {
            ...nq,
            subject_id: effectiveSubjectIds[0] || null,
            subject_ids: effectiveSubjectIds,
          };

          if (normalizedQuestion.is_duplicate || normalizedQuestion.duplicate_type) return normalizedQuestion;
          for (const existing of currentQuestionsForBatchRef.current) {
            const score = jaccardSimilarityClient(normalizedQuestion.statement || "", existing.statement || "");
            if (score >= 0.82) {
              return {
                ...normalizedQuestion,
                is_duplicate: true,
                duplicate_type: "batch" as const,
                duplicate_of: { temp_id: existing.temp_id, statement: existing.statement, similarity: score },
              };
            }
          }
          return normalizedQuestion;
        });

        currentQuestionsForBatchRef.current = [...currentQuestionsForBatchRef.current, ...newQuestions];

        setQuestions((current) => [...current, ...newQuestions]);
        setAnalyzedCount((current) => current + newQuestions.length);

        setExpandedIds((current) => [
          ...current,
          ...newQuestions.map((question) => question.temp_id),
        ]);

        setBoardSearches((current) => {
          const copy = { ...current };

          newQuestions.forEach((question) => {
            copy[question.temp_id] = question.board_name || "";
          });

          return copy;
        });

        setProcessedBatches((current) => current + 1);

        await new Promise((resolve) => setTimeout(resolve, 120));
      }

      await refreshBoards();

      setFeedback({
        type: "success",
        message:
          "Importação concluída. Revise as questões antes de enviar para revisão.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Erro ao processar importação por lotes.",
      });
    } finally {
      setProcessing(false);
    }
  }

  function focusNextQuestionAfterRemoval(removedId: string) {
    const index = questions.findIndex(
      (question) => question.temp_id === removedId,
    );

    const nextQuestion = questions[index + 1] || questions[index - 1];

    if (!nextQuestion) return;

    setTimeout(() => {
      questionRefs.current[nextQuestion.temp_id]?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 120);
  }

  async function sendToReview(targetQuestions: ImportedQuestion[], skipPossibleCheck = false) {
    if (sendingToReview) return;

    setFeedback(null);

    const allowedQuestions = targetQuestions.filter(
      (question) => !question.is_duplicate,
    );

    if (allowedQuestions.length === 0) {
      setFeedback({
        type: "warning",
        message:
          "Nenhuma questão válida para enviar. Duplicadas não podem ser publicadas no banco.",
      });
      return;
    }

    const missingTopics = allowedQuestions.filter((question) => normalizeEvaluatedTopics(question.evaluated_topics).length === 0);
    if (missingTopics.length > 0) {
      setSendReviewModal({
        open: true,
        tone: "error",
        title: "Informe os tópicos avaliados",
        message: "Nenhuma questão foi enviada. Informe pelo menos um tópico avaliado em cada questão selecionada.",
        loading: false,
        onClose: () => setSendReviewModal(null),
      });
      return;
    }

    const globalSubjectIds = realSubjectIds(subjectIds);
    const subjectReadyQuestions = allowedQuestions.filter((question) => {
      const ownIds = questionOwnSubjectIds(question);
      return ownIds.length > 0 || globalSubjectIds.length > 0;
    });
    const skippedByProvaCompleta = allowedQuestions.filter(
      (question) => !subjectReadyQuestions.some((ready) => ready.temp_id === question.temp_id),
    );

    if (subjectReadyQuestions.length === 0) {
      setSendReviewModal({
        open: true,
        tone: "error",
        title: "Redefina o assunto",
        message: "Nenhuma questão foi enviada. As questões selecionadas ainda estão como Prova completa ou sem assunto real. Redefina o assunto dessas questões e tente novamente.",
        loading: false,
        onClose: () => setSendReviewModal(null),
      });
      return;
    }

    const knownSentIds = new Set(sentQuestions.map((question) => question.temp_id));
    const alreadySentInScreen = subjectReadyQuestions.filter((question) => knownSentIds.has(question.temp_id));
    const alreadySentIds = new Set(alreadySentInScreen.map((question) => question.temp_id));
    const pendingSubjectReadyQuestions = subjectReadyQuestions.filter((question) => !knownSentIds.has(question.temp_id));

    if (alreadySentInScreen.length > 0) {
      setQuestions((current) => current.filter((question) => !alreadySentIds.has(question.temp_id)));
      setSelectedIds((current) => current.filter((id) => !alreadySentIds.has(id)));
      setExpandedIds((current) => current.filter((id) => !alreadySentIds.has(id)));
    }

    if (pendingSubjectReadyQuestions.length === 0) {
      setFeedback({
        type: "success",
        message: `${alreadySentInScreen.length} questão(ões) já haviam sido enviadas para revisão e foram removida(s) da tela.`,
      });
      return;
    }

    if (!skipPossibleCheck) {
      const possibleCount = pendingSubjectReadyQuestions.filter((q) => q.duplicate_type === "possible").length;
      if (possibleCount > 0) {
        setPossibleDuplicateConfirm({ questions: pendingSubjectReadyQuestions, count: possibleCount });
        return;
      }
    }

    const allowedForSave = pendingSubjectReadyQuestions.map((question) => {
      const ownIds = questionOwnSubjectIds(question);
      const effectiveSubjectIds = ownIds.length > 0 ? ownIds : globalSubjectIds;
      return {
        ...question,
        subject_id: effectiveSubjectIds[0] || null,
        subject_ids: effectiveSubjectIds,
        status_override: annulledTempIds.includes(question.temp_id) ? "annulled" : null,
      };
    });

    const withoutBoard = allowedForSave.find(
      (question) => !question.board_name?.trim(),
    );

    if (withoutBoard) {
      setSendReviewModal({
        open: true,
        tone: "error",
        title: "Banca não selecionada",
        message: "Toda questão precisa ter banca selecionada antes de enviar para revisão.",
        loading: false,
        onClose: () => setSendReviewModal(null),
      });
      return;
    }

    setSendReviewModal({
      open: true,
      tone: "review",
      title: `${allowedForSave.length} questão(ões) em processamento`,
      loading: true,
      steps: sendReviewSteps,
      currentStep: 0,
    });

    try {
      await wait(140);
      setSendReviewModal({
        open: true,
        tone: "review",
        title: `${allowedForSave.length} questão(ões) em processamento`,
        loading: true,
        steps: sendReviewSteps,
        currentStep: 1,
      });
      await wait(140);
      setSendReviewModal({
        open: true,
        tone: "review",
        title: `${allowedForSave.length} questão(ões) em processamento`,
        loading: true,
        steps: sendReviewSteps,
        currentStep: 2,
      });
      await wait(140);
      setSendReviewModal({
        open: true,
        tone: "review",
        title: `${allowedForSave.length} questão(ões) em processamento`,
        loading: true,
        steps: sendReviewSteps,
        currentStep: 3,
      });

      const response = await adminFetch("/api/admin/questions/import/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          questions: allowedForSave.map((question) => ({
            ...question,
            orgao: normalizeAgencyName(question.orgao),
          })),
          subject_id: globalSubjectIds[0] || null,
          subject_ids: globalSubjectIds,
          year: parseValidYear(year),
        }),
      });

      const result = await response.json();

      const savedTempIds = new Set<string>(
        Array.isArray(result.saved_temp_ids) ? result.saved_temp_ids : [],
      );
      const ignoredTempIds = new Set<string>(
        Array.isArray(result.ignored_temp_ids) ? result.ignored_temp_ids : [],
      );
      const failedTempIds = new Set<string>(
        Array.isArray(result.failed_items)
          ? result.failed_items
              .map((item: { temp_id?: string | null }) => item.temp_id)
              .filter((id: string | null | undefined): id is string => Boolean(id))
          : [],
      );

      const removableIds = new Set<string>([
        ...Array.from(savedTempIds),
        ...Array.from(ignoredTempIds),
      ]);

      if (
        removableIds.size === 0 &&
        ((Number(result.saved_count) || 0) + (Number(result.ignored_count) || 0)) > 0
      ) {
        allowedForSave.forEach((question) => {
          if (!failedTempIds.has(question.temp_id)) {
            removableIds.add(question.temp_id);
          }
        });
      }

      if (!response.ok || (!result.ok && removableIds.size === 0)) {
        throw new Error(
          result.message || "Erro ao enviar questões para revisão.",
        );
      }

      const removedPayload = allowedForSave
        .filter((question) => removableIds.has(question.temp_id))
        .map((question) => ({
          temp_id: question.temp_id,
          statement: question.statement,
          board_name: question.board_name,
        }));

      const completedIds = new Set<string>([
        ...Array.from(removableIds),
        ...Array.from(alreadySentIds),
      ]);

      const firstRemainingId = questions.find(
        (q) => !completedIds.has(q.temp_id),
      )?.temp_id;

      const sendingAllVisible = questions.every(
        (question) => completedIds.has(question.temp_id),
      );

      setSendReviewModal({
        open: true,
        tone: "review",
        title: `${allowedForSave.length} questão(ões) em processamento`,
        loading: true,
        steps: sendReviewSteps,
        currentStep: 4,
      });

      await refreshBoards();

      setSendReviewModal({
        open: true,
        tone: "review",
        title: `${allowedForSave.length} questão(ões) em processamento`,
        loading: true,
        steps: sendReviewSteps,
        currentStep: 5,
      });
      await wait(180);

      setQuestions((current) =>
        current.filter((question) => !removableIds.has(question.temp_id)),
      );

      setSelectedIds((current) => current.filter((id) => !removableIds.has(id)));

      setExpandedIds((current) => current.filter((id) => !removableIds.has(id)));

      setSentQuestions((current) => [...removedPayload, ...current]);

      if (allowedForSave.length === 1) {
        focusNextQuestionAfterRemoval(allowedForSave[0].temp_id);
      }

      if (sendingAllVisible) {
        setRawText("");
        clearStoredDraft();
      }

      const partialSubjectMessage = skippedByProvaCompleta.length > 0
        ? ` ${skippedByProvaCompleta.length} questão(ões) ficaram na tela porque ainda estão como Prova completa ou sem assunto real.`
        : "";
      const failedCount = Number(result.failed_count) || 0;
      const partialSend = skippedByProvaCompleta.length > 0 || failedCount > 0;
      const successMessage = `${result.message || "Questões enviadas para revisão."}${partialSubjectMessage}`;

      setFeedback({
        type: partialSend ? "warning" : "success",
        message: successMessage,
      });
      setSendReviewModal({
        open: true,
        tone: partialSend ? "warning" : "success",
        title: partialSend ? "Envio parcial concluído" : "Questões enviadas",
        message: successMessage,
        loading: false,
        steps: sendReviewSteps,
        currentStep: 5,
        onClose: () => setSendReviewModal(null),
      });
      await wait(900);
      setSendReviewModal(null);

      if (firstRemainingId) {
        setTimeout(() => {
          questionRefs.current[firstRemainingId]?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }, 100);
      }
    } catch (error) {
      setQuestions((current) => current);
      setSentQuestions((current) =>
        current,
      );

      const message =
        error instanceof Error
          ? error.message
          : "Erro ao enviar para revisão.";

      setSendReviewModal({
        open: true,
        tone: "error",
        title: "Não foi possível enviar",
        message,
        loading: false,
        steps: sendReviewSteps,
        currentStep: 5,
        onClose: () => setSendReviewModal(null),
      });

      setFeedback({
        type: "error",
        message,
      });
    }
  }

    return (
    <PageBackground>
      <DraftRestoreModal
        open={Boolean(pendingDraft)}
        savedAt={pendingDraft?.savedAt}
        onContinue={continueDraft}
        onDiscard={discardDraft}
      />

      <PremiumLoadingOverlay
        show={loading && !processing}
        title="Processando..."
        message="Salvando informações no banco."
      />

      <PossibleDuplicateConfirmModal
        modal={possibleDuplicateConfirm}
        onConfirm={() => {
          const modal = possibleDuplicateConfirm;
          setPossibleDuplicateConfirm(null);
          if (modal) sendToReview(modal.questions, true);
        }}
        onCancel={() => setPossibleDuplicateConfirm(null)}
      />

      <QuestionActionModal modal={sendReviewModal} />

      <CompareModal
        modal={compareModal}
        resolving={resolvingDuplicate}
        onKeepImported={keepImportedAndArchiveExisting}
        onKeepExisting={() => {
          if (compareModal) discardQuestion(compareModal.importedTempId);
          setCompareModal(null);
        }}
        onClose={() => {
          if (!resolvingDuplicate) setCompareModal(null);
        }}
      />

      <BoardCreateProgressModal
        modal={boardCreateModal}
        onClose={() => {
          if (boardCreateModal?.status !== "processing") {
            setBoardCreateModal(null);
          }
        }}
      />

      <PageHeader
        title="Importar questões com IA"
        description="Configure os padrões, cole o texto bruto das questões e acompanhe a análise inteligente em lotes."
        action={
          <Link href="/questoes">
            <PremiumButton variant="secondary" icon={<ArrowLeft size={18} />}>
              Voltar
            </PremiumButton>
          </Link>
        }
      />

      {feedback && <Notice feedback={feedback} />}

      <PremiumCard
        title="1. Padrões de importação"
        description="Defina disciplina e assunto. O ano padrão é opcional; quando vazio, o sistema tenta detectar o ano em cada questão."
        icon={<Bot size={18} />}
      >
        <div className="grid gap-5 md:grid-cols-3">
          <SearchableSelect
            label="Disciplina padrão"
            value={disciplineId}
            onChange={(value) => {
              setDisciplineId(value);
              setSubjectIds([]);
            }}
            options={disciplines.map((discipline) => ({ value: discipline.id, label: discipline.name }))}
            placeholder="Selecione"
          />

          <SubjectMultiSelect
            label="Assuntos padrão"
            subjects={filteredSubjects}
            selectedIds={subjectIds}
            onChange={setSubjectIds}
            emptyLabel="Adicionar assunto"
            disciplineId={disciplineId}
          />

          <PremiumInput
            label="Ano padrão (opcional)"
            type="number"
            value={year}
            min="1990"
            max="2100"
            placeholder="Ex.: 2025"
            onChange={(event: any) => setYear(event.target.value)}
          />
        </div>
      </PremiumCard>

      <div className="mt-6">
        <PremiumCard
          title="2. Texto bruto"
          description="Cole o texto bruto vindo da internet, PDF, Word ou ChatGPT. O sistema tentará identificar as questões automaticamente."
          icon={<ClipboardPaste size={18} />}
        >
          <div className="grid gap-5">
            <PremiumInput
              label="Texto das questões"
              textarea
              value={rawText}
              onChange={(event: any) => setRawText(event.target.value)}
              placeholder={`Cole aqui o texto bruto das questões.\n\nExemplo:\nAno: 2026 Banca: CEBRASPE\n1. Enunciado da questão...\nA) Alternativa A\nB) Alternativa B\nC) Alternativa C\nD) Alternativa D\nGabarito: B`}
            />

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <PremiumButton variant="secondary" onClick={clearImportDraft}>
                Limpar rascunho
              </PremiumButton>

              {processing ? (
                <PremiumButton
                  variant="danger"
                  icon={<PauseCircle size={16} />}
                  onClick={stopImport}
                >
                  Parar importação
                </PremiumButton>
              ) : (
                <PremiumButton
                  icon={<Sparkles size={16} />}
                  onClick={analyzeTextInBatches}
                >
                  Analisar texto bruto com IA
                </PremiumButton>
              )}
            </div>

            {(processing || totalBatches > 0) && (
              <div className="overflow-hidden rounded-[2rem] border border-orange-200 bg-gradient-to-br from-white via-orange-50/60 to-white p-5 shadow-sm">
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-500/20">
                      {processing ? (
                        <Sparkles size={22} className="animate-pulse" />
                      ) : (
                        <CheckCircle2 size={22} />
                      )}
                    </div>

                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">
                        {processing ? "Importação em andamento" : "Importação processada"}
                      </p>

                      <h3 className="mt-1 text-lg font-semibold text-slate-950">
                        {processing
                          ? `Processando lote ${currentBatch} de ${totalBatches}`
                          : `Último processamento: ${processedBatches}/${totalBatches} lote(s)`}
                      </h3>
                    </div>
                  </div>

                  <div className="rounded-full border border-orange-200 bg-white px-4 py-2 text-sm font-semibold text-orange-700 shadow-sm">
                    {progressPercent}%
                  </div>
                </div>

                <div className="mb-5 h-3 overflow-hidden rounded-full bg-white shadow-inner">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-7">
                  <ProgressPill icon={<Layers3 size={17} />} label="Lotes" value={`${processedBatches}/${totalBatches}`} />
                  <ProgressPill icon={<FileQuestion size={17} />} label="Detectadas" value={totalDetected} />
                  <ProgressPill icon={<FileQuestion size={17} />} label="Analisadas" value={analyzedCount} />
                  <ProgressPill icon={<FileQuestion size={17} />} label="Na tela" value={pendingCount} />
                  <ProgressPill icon={<ShieldAlert size={17} />} label="Duplicadas" value={duplicateCount} tone="danger" />
                  <ProgressPill icon={<AlertTriangle size={17} />} label="Possíveis" value={possibleDuplicateCount} tone="warning" />
                  <ProgressPill icon={<CheckCircle2 size={17} />} label="Enviadas" value={sentCount} tone="success" />
                </div>

                <p className="mt-4 flex items-center gap-2 text-sm text-slate-600">
                  <Clock3 size={16} className={processing ? "animate-pulse text-orange-500" : "text-slate-400"} />
                  {processing
                    ? "Os números mudam a cada lote processado."
                    : "Revise as questões abaixo e envie apenas as válidas para revisão."}
                </p>
              </div>
            )}
          </div>
        </PremiumCard>
      </div>

      {sentCount > 0 && (
        <div className="mt-6 flex items-center gap-3 rounded-[2rem] border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white px-5 py-4 shadow-sm">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-sm">
            <CheckCircle2 size={19} />
          </span>
          <span className="text-sm font-semibold text-emerald-700">
            {sentCount} questão(ões) enviada(s) para revisão com sucesso.
          </span>
        </div>
      )}

      <div className="mt-6">
        <PremiumCard
          title="3. Prévia das questões"
          description={`${questions.length} questão(ões) na tela. ${duplicateCount} duplicada(s). ${selectedIds.length} selecionada(s).`}
          icon={<FileQuestion size={18} />}
        >
          {questions.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
              Nenhuma questão na lista de importação.
            </div>
          ) : (
            <>
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <PremiumButton
                  variant="secondary"
                  icon={<CheckCircle2 size={16} />}
                  onClick={selectAll}
                >
                  Selecionar todas não duplicadas
                </PremiumButton>

                <PremiumButton
                  variant="secondary"
                  icon={<XCircle size={16} />}
                  onClick={() => setSelectedIds([])}
                >
                  Limpar seleção
                </PremiumButton>

                <PremiumButton
                  variant="danger"
                  icon={<Trash2 size={16} />}
                  onClick={removeDuplicateQuestions}
                  disabled={duplicateCount === 0 || sendingToReview}
                >
                  Remover questões duplicadas
                </PremiumButton>

                <PremiumButton
                  icon={<Send size={16} />}
                  onClick={() => sendToReview(selectedQuestions)}
                  disabled={sendingToReview || selectedQuestions.length === 0}
                >
                  Enviar selecionadas para revisão
                </PremiumButton>
              </div>
                            <div className="grid gap-5">
                {questions.map((question) => {
                  const questionYear = parseValidYear(question.year);
                  const isExpanded = expandedIds.includes(
                    question.temp_id,
                  );

                  const isSelected = selectedIds.includes(
                    question.temp_id,
                  );
                  const requiresImage = questionRequiresImage(question);

                  const boardSuggestionsForQuestion =
                    boardSuggestions[question.temp_id] || [];
                  const isCreatingThisBoard =
                    creatingBoardQuestionId === question.temp_id;

                  const isAnnulledInImport = annulledTempIds.includes(question.temp_id);

                  return (
                    <div
                      key={question.temp_id}
                      ref={(element) => {
                        questionRefs.current[
                          question.temp_id
                        ] = element;
                      }}
                      className={`relative import-question-card motion-safe:animate-[importCardIn_220ms_ease-out] rounded-[2rem] border p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl ${
                        isAnnulledInImport
                          ? "border-red-300 bg-red-50/80 shadow-red-950/5"
                          : question.is_duplicate
                          ? "border-red-300 bg-red-50 shadow-red-950/5"
                          : question.duplicate_type === "possible"
                            ? "border-amber-300 bg-amber-50 shadow-amber-950/5"
                            : requiresImage
                              ? "border-blue-300 bg-blue-50 shadow-blue-950/5"
                              : isSelected
                                ? "border-orange-300 bg-orange-50/40 shadow-orange-950/10 ring-1 ring-orange-100"
                                : "border-slate-200 bg-white shadow-slate-950/5"
                      }`}
                    >
                      {isAnnulledInImport && (
                        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center overflow-hidden rounded-[2rem]">
                          <span className="select-none whitespace-nowrap text-[5rem] font-black tracking-[0.25em] text-red-500/20 rotate-[-25deg] uppercase leading-none">ANULADA</span>
                        </div>
                      )}
                      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              toggleSelected(
                                question.temp_id,
                              )
                            }
                            disabled={
                              question.is_duplicate
                            }
                            className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                              question.is_duplicate
                                ? "cursor-not-allowed border-red-200 bg-red-50 text-red-400"
                                : isSelected
                                  ? "border-orange-300 bg-orange-600 text-white shadow-lg shadow-orange-100"
                                  : "border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                            }`}
                          >
                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                              question.is_duplicate
                                ? "border-red-200 bg-red-100"
                                : isSelected
                                  ? "border-white bg-white text-orange-600"
                                  : "border-slate-300 bg-white"
                            }`}>
                              {isSelected && !question.is_duplicate && <CheckCircle2 size={14} />}
                            </span>
                            {isSelected
                              ? "Selecionada"
                              : "Selecionar"}
                          </button>

                          {question.is_duplicate && question.duplicate_type === "batch" && (
                            <span className="rounded-full border border-red-200 bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                              Duplicada neste lote
                            </span>
                          )}
                          {question.is_duplicate && question.duplicate_type === "database" && (
                            <>
                              <span className="rounded-full border border-red-200 bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                                Já existe no banco{question.duplicate_of?.similarity ? ` (${Math.round(question.duplicate_of.similarity * 100)}%)` : ""}
                              </span>
                              {question.duplicate_of?.id && (
                                <button
                                  type="button"
                                  onClick={() => openCompareModal(question)}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-600 transition hover:border-red-400 hover:bg-red-50 active:scale-95"
                                >
                                  <ArrowLeftRight size={12} />
                                  Ver comparação
                                </button>
                              )}
                            </>
                          )}
                          {!question.is_duplicate && question.duplicate_type === "possible" && (
                            <>
                              <span className="rounded-full border border-amber-200 bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                                Possível duplicada{question.duplicate_of?.similarity ? ` (${Math.round(question.duplicate_of.similarity * 100)}%)` : ""}
                              </span>
                              <button
                                type="button"
                                onClick={() => openCompareModal(question)}
                                className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 transition hover:border-amber-400 hover:bg-amber-100 active:scale-95"
                              >
                                <ArrowLeftRight size={12} />
                                Ver comparação
                              </button>
                            </>
                          )}

                          {requiresImage && (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                              <ImageIcon size={12} />
                              Requer imagem
                            </span>
                          )}

                          {(question.is_duplicate || question.duplicate_type === "possible") && (
                            <button
                              type="button"
                              onClick={() => discardQuestion(question.temp_id)}
                              className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-600 transition hover:border-red-300 hover:bg-red-50 active:scale-95"
                            >
                              <Trash2 size={12} />
                              Descartar
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setAnnulledTempIds((current) => current.includes(question.temp_id) ? current.filter((id) => id !== question.temp_id) : [...current, question.temp_id])}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition active:scale-95 ${
                              isAnnulledInImport
                                ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                : "border-red-200 bg-white text-red-600 hover:border-red-300 hover:bg-red-50"
                            }`}
                          >
                            {isAnnulledInImport ? <CheckCircle2 size={12} /> : <Ban size={12} />}
                            {isAnnulledInImport ? "Reativar" : "Anular"}
                          </button>
                        </div>

                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm">
                          {isExpanded ? "Detalhes abertos" : "Detalhes recolhidos"}
                        </span>
                      </div>

                      <div className="mb-5 rounded-[1.5rem] border border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-orange-950 p-3 text-white shadow-lg shadow-slate-950/10">
                        <div className="flex flex-wrap items-end gap-3">
                          <label className="grid w-[72px] shrink-0 gap-1">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-200">Ano</span>
                            <input
                              type="number"
                              min="1990"
                              max="2100"
                              placeholder={year || "—"}
                              value={String(question.year || "")}
                              onChange={(event) =>
                                updateQuestion(
                                  question.temp_id,
                                  "year",
                                  /^\d{0,4}$/.test(event.target.value)
                                    ? event.target.value || null
                                    : question.year || null,
                                )
                              }
                              className="h-10 w-full rounded-xl border border-white/10 bg-white/95 px-3 text-sm font-semibold text-slate-900 outline-none transition focus:ring-4 focus:ring-orange-400/30"
                            />
                          </label>

                          <div className="relative grid w-[160px] shrink-0 gap-1">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-200">Banca</span>
                            <input
                              value={boardSearches[question.temp_id] || ""}
                              onChange={(event) =>
                                searchBoardForQuestion(question.temp_id, event.target.value)
                              }
                              placeholder="Buscar banca"
                              className="h-10 w-full rounded-xl border border-white/10 bg-white/95 px-3 text-sm font-semibold text-slate-900 outline-none transition focus:ring-4 focus:ring-orange-400/30"
                            />
                            {boardSuggestionsForQuestion.length > 0 && (
                              <div className="absolute left-0 right-0 top-[3.8rem] z-30 grid max-h-56 gap-1 overflow-auto rounded-2xl border border-orange-100 bg-white p-2 shadow-2xl">
                                {boardSuggestionsForQuestion.map((board) => (
                                  <button key={board.id} type="button"
                                    onClick={() => applyBoardToQuestion(question.temp_id, board)}
                                    className="rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-orange-50 hover:text-orange-700">
                                    {board.name}
                                  </button>
                                ))}
                              </div>
                            )}
                            {!question.exam_board_id && !boardExists(boardSearches[question.temp_id] || "") && (boardSearches[question.temp_id] || "").trim() && (
                              <button type="button"
                                onClick={() => createBoardForQuestion(question.temp_id)}
                                disabled={Boolean(creatingBoardQuestionId)}
                                className="mt-1 inline-flex w-fit items-center gap-1 rounded-full border border-orange-200 bg-white/95 px-2.5 py-1 text-[10px] font-semibold text-orange-700 transition hover:bg-orange-50 disabled:opacity-60">
                                {isCreatingThisBoard ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                                {isCreatingThisBoard ? "Cadastrando" : "Cadastrar"}
                              </button>
                            )}
                          </div>

                          <label className="grid w-[150px] shrink-0 gap-1">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-200">Órgão</span>
                            <input
                              value={question.orgao || ""}
                              onChange={(event) =>
                                updateQuestion(
                                  question.temp_id,
                                  "orgao",
                                  normalizeAgencyName(event.target.value),
                                )
                              }
                              placeholder="Ex.: PC-RR"
                              className="h-10 w-full rounded-xl border border-white/10 bg-white/95 px-3 text-sm font-semibold text-slate-900 outline-none transition focus:ring-4 focus:ring-orange-400/30"
                            />
                          </label>

                          <div className="w-[260px] shrink-0">
                            <SubjectMultiSelect
                              label="Assuntos"
                              subjects={filteredSubjects.filter((s) => s.id !== PROVA_COMPLETA_SUBJECT_ID)}
                              selectedIds={questionOwnSubjectIds(question)}
                              onChange={(ids) => applySubjectsToQuestion(question.temp_id, ids)}
                              emptyLabel="Redefinir assunto"
                              disciplineId={disciplineId}
                              dark
                            />
                          </div>

                          <div className="grid w-[120px] shrink-0 gap-1">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-200">Dificuldade</span>
                            <div className="flex h-10 items-center gap-1 rounded-xl border border-white/10 bg-white/[0.06] px-3">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button key={star} type="button"
                                  onClick={() => updateQuestion(question.temp_id, "difficulty_level", question.difficulty_level === star ? null : star)}
                                  className={question.difficulty_level && star <= question.difficulty_level ? "text-amber-400 transition hover:scale-110" : "text-white/20 transition hover:text-amber-400/60 hover:scale-110"}>
                                  <Star size={16} fill={question.difficulty_level && star <= question.difficulty_level ? "currentColor" : "none"} />
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="grid w-[110px] shrink-0 gap-1">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-200">Tipo</span>
                            <button type="button"
                              onClick={() => updateQuestion(question.temp_id, "question_type", question.question_type === "true_false" ? "multiple_choice" : "true_false")}
                              title="Clique para alternar o tipo"
                              className="flex h-10 items-center justify-between rounded-xl border border-white/10 bg-white/10 px-3 text-xs font-bold text-white transition hover:border-orange-400/30 hover:bg-orange-500/10 hover:text-orange-200">
                              {question.question_type === "true_false" ? "Assertivas" : "Alternativas"}
                              <span className="ml-1 text-white/30">⇄</span>
                            </button>
                          </div>

                        </div>
                      </div>

                      <RichTextEditor
                        value={question.statement || ""}
                        onChange={(value) =>
                          updateQuestion(
                            question.temp_id,
                            "statement",
                            value,
                          )
                        }
                        placeholder="Enunciado da questão"
                        minRows={3}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-800 outline-none focus:ring-4 focus:ring-orange-100"
                      />

                      {isExpanded && (
                        <div className="mt-6 grid gap-5">
                          <div className="hidden">
                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                              <PremiumInput
                                label="Ano da questão"
                                type="number"
                                min="1990"
                                max="2100"
                                placeholder={year || "Opcional"}
                                value={String(
                                  question.year ||
                                    "",
                                )}
                                onChange={(
                                  event: any,
                                ) =>
                                  updateQuestion(
                                    question.temp_id,
                                    "year",
                                    /^\d{0,4}$/.test(event.target.value)
                                      ? event.target.value || null
                                      : question.year || null,
                                  )
                                }
                              />
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                              <PremiumInput
                                label="Buscar banca"
                                value={
                                  boardSearches[
                                    question
                                      .temp_id
                                  ] || ""
                                }
                                onChange={(
                                  event: any,
                                ) =>
                                  searchBoardForQuestion(
                                    question.temp_id,
                                    event.target
                                      .value,
                                  )
                                }
                              />

                              {boardSuggestionsForQuestion.length >
                                0 && (
                                <div className="mt-3 grid gap-2">
                                  {boardSuggestionsForQuestion.map(
                                    (
                                      board,
                                    ) => (
                                      <button
                                        key={
                                          board.id
                                        }
                                        type="button"
                                        onClick={() =>
                                          applyBoardToQuestion(
                                            question.temp_id,
                                            board,
                                          )
                                        }
                                        className="rounded-2xl border border-slate-200 px-4 py-2 text-left text-sm font-semibold text-slate-700 transition hover:border-orange-300 hover:bg-orange-50"
                                      >
                                        {
                                          board.name
                                        }
                                      </button>
                                    ),
                                  )}
                                </div>
                              )}

                              {!question.exam_board_id &&
                                !boardExists(
                                boardSearches[
                                  question
                                    .temp_id
                                ] || "",
                              ) &&
                                (
                                  boardSearches[
                                    question
                                      .temp_id
                                  ] || ""
                                ).trim() && (
                                  <div className="mt-3">
                                    <PremiumButton
                                      variant="secondary"
                                      icon={
                                        <Plus
                                          size={
                                            15
                                          }
                                        />
                                      }
                                      onClick={() =>
                                        createBoardForQuestion(
                                          question.temp_id,
                                        )
                                      }
                                      disabled={Boolean(creatingBoardQuestionId)}
                                    >
                                      {isCreatingThisBoard
                                        ? "Cadastrando..."
                                        : "Cadastrar banca"}
                                    </PremiumButton>
                                  </div>
                                )}
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Dificuldade</p>
                              <div className="flex h-10 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <button
                                    key={star}
                                    type="button"
                                    onClick={() => updateQuestion(question.temp_id, "difficulty_level", question.difficulty_level === star ? null : star)}
                                    className={question.difficulty_level && star <= question.difficulty_level ? "text-amber-400 transition hover:scale-110" : "text-slate-300 transition hover:text-amber-400/70 hover:scale-110"}
                                  >
                                    <Star size={18} fill={question.difficulty_level && star <= question.difficulty_level ? "currentColor" : "none"} />
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="grid gap-2.5">
                            {question.alternatives.map((alternative, altIndex) => {
                              const isWrongTrueFalse = question.question_type === "true_false" && alternative.is_correct && (alternative.label === "E" || String(alternative.text || "").trim().toLowerCase() === "errado");
                              const elimKey = `${question.temp_id}-${altIndex}`;
                              const isEliminated = eliminatedAltKeys.has(elimKey);
                              const label = alternative.label || String.fromCharCode(65 + altIndex);

                              return (
                                <div key={elimKey} className="group relative pl-10">
                                  {/* Tesourinha */}
                                  <button
                                    type="button"
                                    aria-label={isEliminated ? "Remover eliminação" : "Eliminar alternativa"}
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      setEliminatedAltKeys((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(elimKey)) next.delete(elimKey);
                                        else next.add(elimKey);
                                        return next;
                                      });
                                    }}
                                    className={`absolute left-0 top-0 z-20 flex h-full w-10 items-center justify-center transition ${isEliminated ? "opacity-100" : "opacity-0 hover:opacity-100 focus:opacity-100"}`}
                                  >
                                    <PremiumScissorsIcon size={18} />
                                  </button>

                                  <div onClick={() => updateAlternative(question.temp_id, altIndex, "is_correct", true)} className={`cursor-pointer transition ${isEliminated ? "opacity-60" : ""} ${
                                    isWrongTrueFalse
                                      ? "flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-3"
                                    : alternative.is_correct
                                      ? "flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3"
                                        : "flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 hover:border-emerald-300 hover:bg-emerald-50/70"
                                  }`}>
                                    {/* Badge de letra / coruja */}
                                    <button
                                      type="button"
                                      onClick={(event) => { event.stopPropagation(); updateAlternative(question.temp_id, altIndex, "is_correct", true); }}
                                      title="Marcar como correta"
                                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black transition ${
                                        isWrongTrueFalse
                                          ? "border-2 border-red-500 bg-red-500 text-white"
                                          : alternative.is_correct
                                            ? "border-2 border-emerald-500 bg-emerald-500/20 text-lg"
                                            : "border border-slate-300 bg-white text-slate-600 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700"
                                      }`}
                                    >
                                      {alternative.is_correct
                                        ? <span className="font-normal leading-none [font-family:'Segoe_UI_Emoji','Apple_Color_Emoji','Noto_Color_Emoji',sans-serif]">{OWL_MARK}</span>
                                        : label}
                                    </button>

                                    <div className="min-w-0 flex-1" onClick={(event) => event.stopPropagation()}>
                                      <RichTextEditor
                                        value={alternative.text}
                                        onChange={(value) => updateAlternative(question.temp_id, altIndex, "text", value)}
                                        placeholder={question.question_type === "true_false" ? `Assertiva ${label}` : `Alternativa ${label}`}
                                        minRows={2}
                                        compact
                                        className={`min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm leading-6 text-slate-800 outline-none focus:ring-4 focus:ring-orange-100 ${isEliminated ? "line-through decoration-red-400 decoration-2" : ""}`}
                                      />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          <div className="rounded-2xl border border-blue-300 bg-blue-50/70 p-4 shadow-[0_0_0_3px_rgba(59,130,246,0.08)]">
                            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">Tópicos avaliados</p>
                            <EvaluatedTopicsInput
                              value={question.evaluated_topics}
                              onChange={(topics) => updateQuestion(question.temp_id, "evaluated_topics", topics)}
                              subjectId={questionOwnSubjectIds(question)[0] || null}
                              required
                              variant="light"
                              placeholder="Ex.: Memória RAM, Placa-mãe"
                            />
                          </div>
                        </div>
                      )}

                      <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                          <span className="h-2 w-2 rounded-full bg-orange-500" />
                          {questionYear ? `Ano ${questionYear}` : "Ano não detectado"}
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                          <PremiumButton
                            variant="secondary"
                            icon={<Eye size={16} />}
                            onClick={() => toggleExpanded(question.temp_id)}
                          >
                            {isExpanded ? "Recolher" : "Expandir"}
                          </PremiumButton>

                          <PremiumButton
                            variant="danger"
                            icon={<Trash2 size={16} />}
                            onClick={() => discardQuestion(question.temp_id)}
                          >
                            Descartar
                          </PremiumButton>

                          {!question.is_duplicate && (
                            <PremiumButton
                              icon={<Send size={16} />}
                            onClick={() => sendToReview([question])}
                            disabled={sendingToReview}
                          >
                              Enviar para revisão
                            </PremiumButton>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </PremiumCard>
      </div>

      <SelectionGhostBar
        count={selectedIds.length}
        actions={[
          { label: "Enviar para revisão", icon: <Send size={14} />, onClick: () => sendToReview(selectedQuestions), variant: "primary", disabled: sendingToReview || selectedQuestions.length === 0 },
          { label: "Limpar seleção", icon: <BrushCleaning size={14} />, onClick: () => setSelectedIds([]), variant: "secondary", disabled: sendingToReview },
          { label: "Descartar", icon: <Trash2 size={14} />, onClick: discardSelectedQuestions, variant: "danger", disabled: sendingToReview },
        ]}
      />
    </PageBackground>
  );
}

function BoardCreateProgressModal({
  modal,
  onClose,
}: {
  modal: BoardCreateModalState | null;
  onClose: () => void;
}) {
  if (!modal) return null;

  const isProcessing = modal.status === "processing";
  const isSuccess = modal.status === "success";
  const isError = modal.status === "error";

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => {
          if (!isProcessing) onClose();
        }}
      >
        <motion.div
          className="w-full max-w-md overflow-hidden rounded-[2rem] border border-orange-100 bg-white shadow-2xl shadow-slate-950/25"
          initial={{ opacity: 0, scale: 0.96, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 18 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="relative bg-[#080b12] p-6 text-white">
            <div className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full bg-orange-500/25 blur-3xl" />
            <div className="relative flex items-center gap-4">
              <div
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl shadow-lg ${
                  isSuccess
                    ? "bg-emerald-400 text-slate-950 shadow-emerald-500/20"
                    : isError
                      ? "bg-red-500 text-white shadow-red-500/20"
                      : "bg-gradient-to-br from-orange-500 to-amber-400 text-slate-950 shadow-orange-500/25"
                }`}
              >
                {isProcessing ? (
                  <Loader2 size={26} className="animate-spin" />
                ) : isSuccess ? (
                  <CheckCircle2 size={27} />
                ) : (
                  <AlertTriangle size={27} />
                )}
              </div>

              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-200">
                  Cadastro de banca
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight">
                  {isProcessing
                    ? "Cadastrando banca"
                    : isSuccess
                      ? "Banca cadastrada"
                      : "Falha no cadastro"}
                </h2>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                Banca
              </p>
              <p className="mt-1 text-base font-semibold text-slate-950">
                {modal.name}
              </p>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-600">
              {modal.message}
            </p>

            {!isError && (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
                {modal.affectedCount} questão(ões) correspondente(s) atualizada(s).
              </div>
            )}

            {isProcessing && (
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-orange-500 to-amber-400" />
              </div>
            )}

            {!isProcessing && (
              <div className="mt-6 flex justify-end">
                <PremiumButton onClick={onClose}>
                  {isSuccess ? "Concluir" : "Entendi"}
                </PremiumButton>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function Notice({
  feedback,
}: {
  feedback: any;
}) {
  const isSuccess = feedback.type === "success";
  const isWarning = feedback.type === "warning";

  return (
    <div
      className={`mb-6 flex items-center gap-3 rounded-[2rem] border px-5 py-4 text-sm font-semibold shadow-sm transition-all duration-300 ${
        isSuccess
          ? "border-emerald-200 bg-gradient-to-r from-emerald-50 to-white text-emerald-700"
          : isWarning
            ? "border-orange-200 bg-gradient-to-r from-orange-50 to-white text-orange-700"
            : "border-red-200 bg-red-50 text-red-700"
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ${
          isSuccess ? "text-emerald-600" : isWarning ? "text-orange-600" : "text-red-600"
        }`}
      >
        {isSuccess ? <CheckCircle2 size={19} /> : isWarning ? <AlertTriangle size={19} /> : <XCircle size={19} />}
      </span>
      <span>{feedback.message}</span>
    </div>
  );
}

function ProgressPill({
  icon,
  label,
  value,
  tone = "default",
}: any) {
  const toneClass =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "danger"
        ? "border-red-200 bg-red-50 text-red-700"
        : tone === "warning"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-slate-200 bg-white text-slate-950";

  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${toneClass}`}
    >
      <div className="mb-2 flex items-center gap-2 opacity-75">
        {icon}
      </div>

      <p className="text-xs font-bold uppercase tracking-[0.14em] opacity-70">
        {label}
      </p>

      <p className="mt-1 text-2xl font-semibold tabular-nums transition-all duration-300">
        {value}
      </p>
    </div>
  );
}

function QuestionCompareColumn({
  title,
  origin,
  data,
}: {
  title: string;
  origin: string;
  data: QuestionDisplayData | null;
}) {
  const statusMap: Record<string, string> = {
    pending_review: "Pendente de revisão",
    published: "Publicada",
    archived: "Arquivada",
    draft: "Rascunho",
  };

  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</p>

      {!data ? (
        <p className="text-sm text-slate-400">Nenhuma questão encontrada.</p>
      ) : (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            {data.code && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Código</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-700">{data.code}</p>
              </div>
            )}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Status</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-700">{statusMap[data.status] ?? data.status}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Banca</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-700">{data.board_name || "—"}</p>
            </div>
            {data.orgao && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Órgão</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-700">{data.orgao}</p>
              </div>
            )}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Ano</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-700">{data.year ? String(data.year) : "—"}</p>
            </div>
            {data.discipline_name && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Disciplina</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-700">{data.discipline_name}</p>
              </div>
            )}
            {data.subject_names && data.subject_names.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Assunto(s)</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-700">{data.subject_names.join(", ")}</p>
              </div>
            )}
            {data.difficulty_level != null && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Dificuldade</p>
                <div className="mt-1"><PremiumDifficultyStars value={data.difficulty_level} compact /></div>
              </div>
            )}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Origem</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-700">{origin}</p>
            </div>
          </div>

          {data.statement && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Enunciado</p>
              <div
                className="richtext-editor max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700"
                dangerouslySetInnerHTML={{ __html: data.statement }}
              />
            </div>
          )}

          {data.alternatives && data.alternatives.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{data.question_type === "true_false" ? "Assertivas" : "Alternativas"}</p>
              <div className="grid gap-1.5">
                {data.alternatives.map((alt) => (
                  <div
                    key={alt.label}
                    className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
                      alt.is_correct
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    <span className="mt-0.5 shrink-0 font-bold">{alt.label}.</span>
                    <span dangerouslySetInnerHTML={{ __html: alt.text }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.explanation_text && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Comentário / Explicação</p>
              <div
                className="richtext-editor max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700"
                dangerouslySetInnerHTML={{ __html: data.explanation_text }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CompareModal({
  modal,
  resolving,
  onKeepImported,
  onKeepExisting,
  onClose,
}: {
  modal: CompareModalState;
  resolving: boolean;
  onKeepImported: () => void;
  onKeepExisting: () => void;
  onClose: () => void;
}) {
  if (!modal) return null;

  const isDatabaseDuplicate = modal.source === "database" && Boolean(modal.duplicateQuestionId);

  return (
    <div
      className="fixed inset-0 z-[10001] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-8 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-6xl rounded-[2rem] border border-orange-100 bg-white p-7 shadow-2xl shadow-slate-950/25"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-6 top-6 flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Fechar comparação"
        >
          <X size={18} />
        </button>

        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">
          Comparação de questões
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950">
          Possível duplicata{modal.similarity != null ? ` — ${Math.round(modal.similarity * 100)}% de semelhança` : ""}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {isDatabaseDuplicate
            ? "Compare as versões e escolha se deseja manter a questão já existente no banco ou arquivá-la para liberar a importada."
            : "Compare as questões antes de decidir o que fazer com a questão importada."}
        </p>

        {(modal.statementSimilarity != null || modal.alternativesSimilarity != null || (modal.matchedMetadata && modal.matchedMetadata.length > 0)) && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              Semelhança baseada em:
            </span>
            {modal.statementSimilarity != null && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                <span className="h-2 w-2 rounded-full bg-orange-500" />
                Enunciado: {Math.round(modal.statementSimilarity * 100)}%
              </span>
            )}
            {modal.alternativesSimilarity != null && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Alternativas: {Math.round(modal.alternativesSimilarity * 100)}%
              </span>
            )}
            {modal.similarity != null && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                Score final: {Math.round(modal.similarity * 100)}%
              </span>
            )}
            {modal.matchedMetadata && modal.matchedMetadata.length > 0 && (
              modal.matchedMetadata.map((meta) => (
                <span key={meta} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {meta === "banca" ? "Mesma banca" : meta === "ano" ? "Mesmo ano" : meta} ✓
                </span>
              ))
            )}
          </div>
        )}

        {modal.hasImageEquivalence && (
          <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
            <p className="text-xs font-semibold text-blue-700">
              Imagem detectada em uma das versões — o texto &ldquo;Imagem associada para resolução da questão&rdquo; foi tratado como equivalente à imagem real do banco na comparação de similaridade.
            </p>
          </div>
        )}

        {modal.loading ? (
          <div className="mt-10 flex items-center justify-center gap-3 py-12">
            <Loader2 size={22} className="animate-spin text-orange-500" />
            <span className="text-sm font-semibold text-slate-500">Carregando questão similar...</span>
          </div>
        ) : (
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <QuestionCompareColumn
              title="Questão importada"
              origin="Importada (prévia)"
              data={modal.left}
            />
            <QuestionCompareColumn
              title="Questão similar"
              origin={modal.source === "database" ? "Banco de dados" : "Mesmo lote"}
              data={modal.right}
            />
          </div>
        )}

        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <PremiumButton variant="secondary" onClick={onClose} disabled={resolving}>
            Fechar
          </PremiumButton>
          <PremiumButton variant="danger" onClick={onKeepExisting} disabled={resolving}>
            <Trash2 size={15} />
            {isDatabaseDuplicate ? "Manter questão do banco" : "Descartar importada"}
          </PremiumButton>
          {isDatabaseDuplicate && (
            <PremiumButton onClick={onKeepImported} disabled={resolving}>
              {resolving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              {resolving ? "Arquivando antiga..." : "Manter importada e arquivar antiga"}
            </PremiumButton>
          )}
        </div>
      </div>
    </div>
  );
}

function PossibleDuplicateConfirmModal({
  modal,
  onConfirm,
  onCancel,
}: {
  modal: { questions: ImportedQuestion[]; count: number } | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!modal) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[2rem] border border-amber-100 bg-white p-7 shadow-2xl shadow-slate-950/25 motion-safe:animate-[importCardIn_220ms_ease-out]">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 shadow-lg shadow-amber-950/10">
          <AlertTriangle size={26} />
        </div>

        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">
          Possíveis duplicatas
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950">
          {modal.count === 1 ? "1 questão suspeita" : `${modal.count} questões suspeitas`}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {modal.count === 1
            ? "1 questão selecionada é uma possível duplicata de outra já existente no banco."
            : `${modal.count} questões selecionadas são possíveis duplicatas de outras já existentes no banco.`}{" "}
          Deseja enviar assim mesmo para revisão?
        </p>

        <div className="mt-6 flex justify-end gap-3">
          <PremiumButton variant="secondary" onClick={onCancel}>
            Cancelar
          </PremiumButton>
          <PremiumButton onClick={onConfirm}>
            Enviar assim mesmo
          </PremiumButton>
        </div>
      </div>
    </div>
  );
}
