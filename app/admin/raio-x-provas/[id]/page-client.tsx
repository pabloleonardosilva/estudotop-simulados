"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  BarChart3,
  Bot,
  CheckCircle2,
  Layers3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CopyPlus,
  Edit3,
  Eye,
  FileSearch,
  FileText,
  ImageIcon,
  Loader2,
  Mail,
  Pencil,
  RefreshCw,
  Save,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis,
} from "recharts";
import { splitIntoQuestionBlocks } from "@/app/lib/utils/question-splitter";
import RichTextEditor from "@/app/components/questions/RichTextEditor";
import SelectionGhostBar from "@/app/components/ui/SelectionGhostBar";
import QuestionActionModal, { type QuestionActionModalState } from "@/app/components/questions/QuestionActionModal";
import { isHtmlContent } from "@/app/lib/markdownReport";
import HtmlWithImageMarkers, { insertListItemBreaks } from "@/app/components/ui/HtmlWithImageMarkers";
import SubjectMultiSelect from "@/app/components/questions/SubjectMultiSelect";
import PremiumScissorsIcon from "@/app/components/questions/PremiumScissorsIcon";
import PremiumButton from "@/app/components/ui/PremiumButton";
import type { BoardOption, DisciplineOption, EntityOption, RaioXAnalysis, RaioXQuestion, SubjectOption } from "../types";
import { difficultyLabel, statusClass, statusLabel } from "../utils";
import { normalizeBoardComparableName } from "@/lib/utils/text";
import { adminFetch } from "@/lib/supabase/adminFetch";

type CloneSimulado = {
  id: string;
  title: string;
  status: string;
  question_count: number;
  created_at: string;
};

type Props = {
  analysis: RaioXAnalysis;
  questions: RaioXQuestion[];
  disciplines: DisciplineOption[];
  subjects: SubjectOption[];
  boards: BoardOption[];
  contests: EntityOption[];
  cloneSimulados: CloneSimulado[];
};

type Feedback = { type: "success" | "error" | "warning"; message: string } | null;
type VariationModal = { questionId: string; title: string } | null;
type ViewMode = "review" | "raiox";
type ReprocessMode = "summary" | "full";

const OWL_MARK = "\u{1F989}️";

const fidelityOptions = [
  { value: "100", label: "Espelho fiel — 100%", description: "Mesmo assunto, tópico de cobrança, dificuldade e perfil." },
  { value: "75", label: "Muito próxima — 75%", description: "Mantém o núcleo e varia contexto/detalhes." },
  { value: "50", label: "Equilibrada — 50%", description: "Mantém o assunto, varia tópico/abordagem." },
  { value: "25", label: "Mais livre — 25%", description: "Usa a questão como inspiração ampla." },
];

export default function RaioXDetalheClient({ analysis, questions, disciplines, subjects, boards, contests, cloneSimulados }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<RaioXQuestion[]>(questions);
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);
  const autoSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  // ── Estado do modal de edição de configurações ─────────────────────────────
  const [editModal, setEditModal] = useState(false);
  const [editContest, setEditContest] = useState(analysis.contest_name || "");
  const [editPosition, setEditPosition] = useState(analysis.position_name || "");
  const [editBoard, setEditBoard] = useState(analysis.board_name || "");
  const [editYear, setEditYear] = useState(String(analysis.exam_year || ""));
  const [editDisciplineId, setEditDisciplineId] = useState(analysis.discipline_id || "");
  const [savingMeta, setSavingMeta] = useState(false);
  const [actionModal, setActionModal] = useState<QuestionActionModalState>(null);
  const [deletingAnalysis, setDeletingAnalysis] = useState(false);
  const [deleteAnalysisLoading, setDeleteAnalysisLoading] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState(analysis.status);
  const [mode, setMode] = useState<ViewMode>(analysis.status === "reviewed" ? "raiox" : "review");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [variationModal, setVariationModal] = useState<VariationModal>(null);
  const [variationCount, setVariationCount] = useState("3");
  const [variationFidelity, setVariationFidelity] = useState("100");
  const [generatingVariation, setGeneratingVariation] = useState(false);
  const [variationReviewItems, setVariationReviewItems] = useState<RaioXQuestion[]>([]);
  const [teacherNotes, setTeacherNotes] = useState(analysis.teacher_notes || "");
  const [aiAdjustmentPrompt, setAiAdjustmentPrompt] = useState(analysis.ai_adjustment_prompt || "");
  const [finalSummary, setFinalSummary] = useState(analysis.final_summary_text || analysis.summary_text || "");
  const [summaryDraft, setSummaryDraft] = useState(analysis.final_summary_text || analysis.summary_text || "");
  const [editingSummary, setEditingSummary] = useState(false);
  const [consolidatingSummary, setConsolidatingSummary] = useState(false);
  const [reprocessModal, setReprocessModal] = useState(false);
  const [reprocessingMode, setReprocessingMode] = useState<ReprocessMode | null>(null);
  const [refazerModal, setRefazerModal] = useState(false);
  const [newRawText, setNewRawText] = useState("");
  const [refazendo, setRefazendo] = useState(false);

  // ── Modal de processamento (reutilizado em "Inserir nova prova") ────────────
  const [refazerProcessingModal, setRefazerProcessingModal] = useState(false);
  const [refazerProcessingStep, setRefazerProcessingStep] = useState(0);
  const [refazerDetectedCount, setRefazerDetectedCount] = useState(0);

  const REFAZER_STEPS = [
    { label: "Sanitizando e dividindo o texto", weight: 10 },
    { label: "Detectando blocos de questões", weight: 15 },
    { label: "Enviando para análise com IA", weight: 20 },
    { label: "Processando resultado da IA", weight: 30 },
    { label: "Salvando questões no banco", weight: 17 },
    { label: "Concluído", weight: 8 },
  ];
  // Progresso cumulativo: soma dos pesos das tarefas concluídas
  const refazerProgressPct = REFAZER_STEPS.slice(0, Math.min(refazerProcessingStep + 1, REFAZER_STEPS.length))
    .reduce((sum, s) => sum + s.weight, 0);
  const [generationModal, setGenerationModal] = useState<QuestionActionModalState>(null);
  const [reportModal, setReportModal] = useState<QuestionActionModalState>(null);

  async function saveMetadata() {
    const contest = editContest.trim();
    const position = editPosition.trim();
    const board = editBoard.trim();
    const year = editYear.trim();
    if (!contest || !position || !board || !year) {
      setFeedback({ type: "error", message: "Preencha todos os campos obrigatórios (concurso, cargo, banca e ano)." });
      setEditModal(false);
      return;
    }
    const discipline = disciplines.find((d) => d.id === editDisciplineId);
    const newTitle = `RaioX - Prova - ${contest} - ${position} - ${year} - ${board}`;
    setSavingMeta(true);
    try {
      const res = await adminFetch(`/api/admin/exam-analyses/${analysis.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contest_name: contest,
          position_name: position,
          board_name: board,
          exam_year: Number(year) || null,
          discipline_id: editDisciplineId || null,
          discipline_name: discipline?.name || analysis.discipline_name || null,
          title: newTitle,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || "Erro ao salvar.");
      setEditModal(false);
      setFeedback({ type: "success", message: "Configurações atualizadas com sucesso." });
      router.refresh();
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro ao salvar." });
    } finally {
      setSavingMeta(false);
    }
  }

  const originalQuestions = items
    .filter((q) => !q.parent_question_id && q.status !== "discarded")
    .sort((a, b) => Number(a.original_number ?? 0) - Number(b.original_number ?? 0));
  const variationQuestions = items.filter((q) => q.parent_question_id && q.status !== "discarded");
  const dashboard = analysis.dashboard || {};
  const modulesSummary = Array.isArray(analysis.modules_summary) ? analysis.modules_summary : [];
  const activeQuestion = originalQuestions[Math.min(currentIndex, Math.max(originalQuestions.length - 1, 0))] || null;

  const selectedQuestions = useMemo(() => items.filter((q) => selectedIds.includes(q.id)), [items, selectedIds]);
  const reviewStats = useMemo(() => {
    const active = originalQuestions.length;
    const pending = originalQuestions.filter((q) => ["detected", "draft"].includes(q.status)).length;
    const reviewed = originalQuestions.filter((q) => ["confirmed", "pending_review", "published"].includes(q.status)).length;
    const withImage = originalQuestions.filter((q) => q.has_image).length;
    const annulled = originalQuestions.filter((q) => q.is_annulled).length;
    return { active, pending, reviewed, withImage, annulled };
  }, [originalQuestions]);

  function updateQuestion(id: string, changes: Partial<RaioXQuestion>) {
    setItems((current) => current.map((q) => (q.id === id ? { ...q, ...changes } : q)));
    if (autoSaveTimers.current[id]) clearTimeout(autoSaveTimers.current[id]);
    autoSaveTimers.current[id] = setTimeout(() => {
      const q = itemsRef.current.find((item) => item.id === id);
      if (q) patchQuestion(q).catch(() => {});
    }, 1500);
  }

  useEffect(() => {
    let cancelled = false;

    async function detectDatabaseDuplicates() {
      const boardByName = new Map(
        boards.map((board) => [normalizeBoardComparableName(board.name), board.id]),
      );

      const candidates = questions.filter((question) => {
        if (question.parent_question_id) return false;
        if (question.is_duplicate) return false;
        if (["discarded", "pending_review", "published"].includes(question.status)) return false;
        if (question.created_question_id) return false;
        return Boolean(question.statement && (question.board_name || analysis.board_name || analysis.board_id));
      });

      if (candidates.length === 0) return;

      const duplicateUpdates: Record<string, Partial<RaioXQuestion>> = {};

      await Promise.all(
        candidates.map(async (question) => {
          const boardName = question.board_name || analysis.board_name || "";
          const examBoardId = analysis.board_id || boardByName.get(normalizeBoardComparableName(boardName));
          if (!examBoardId) return;

          const response = await adminFetch("/api/admin/questions/check-duplicate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              statement: question.statement,
              alternatives: question.alternatives || [],
              exam_board_id: examBoardId,
              year: question.year || analysis.exam_year || null,
            }),
          });
          const result = await response.json().catch(() => ({}));

          if (!response.ok || !result.ok || !result.duplicate_blocking || !result.possibleDuplicate) return;

          duplicateUpdates[question.id] = {
            is_duplicate: true,
            duplicate_type: "database",
            duplicate_message: "Esta questão já está no banco de questões.",
            duplicate_of: {
              id: result.possibleDuplicate.id,
              statement: result.possibleDuplicate.statement,
              status: result.possibleDuplicate.status,
              similarity: result.possibleDuplicate.similarity,
              statement_similarity: result.possibleDuplicate.statement_similarity,
              alternatives_similarity: result.possibleDuplicate.alternatives_similarity,
              matched_metadata: result.possibleDuplicate.matched_metadata,
            },
          };
        }),
      );

      if (cancelled || Object.keys(duplicateUpdates).length === 0) return;

      setItems((current) =>
        current.map((question) =>
          duplicateUpdates[question.id] ? { ...question, ...duplicateUpdates[question.id] } : question,
        ),
      );
      setSelectedIds((current) => current.filter((id) => !duplicateUpdates[id]));
    }

    void detectDatabaseDuplicates();

    return () => {
      cancelled = true;
    };
  }, [analysis.board_id, analysis.board_name, analysis.exam_year, boards, questions]);

  function toggleSelected(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function patchQuestion(question: RaioXQuestion, changes: Partial<RaioXQuestion> = {}) {
    const payload = { ...question, ...changes };
    const response = await adminFetch(`/api/admin/exam-analyses/${analysis.id}/questions/${question.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok && !response.headers.get("content-type")?.includes("json")) {
      throw new Error(`Erro ${response.status} ao salvar questão.`);
    }
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.message || "Erro ao salvar questão.");
  }

  async function persistQuestions(questionList = items) {
    for (const question of questionList) await patchQuestion(question);
  }

  function canMarkReviewedWithoutRegeneration() {
    const activeQuestions = originalQuestions.filter((q) => q.status !== "discarded");
    const reviewCandidates = activeQuestions.filter((q) => !q.is_annulled);
    if (activeQuestions.length === 0) return false;
    return reviewCandidates.every((q) => (q.subject_id || q.subject_ids?.length) && q.status !== "detected");
  }

  async function saveAnalysis(markReviewed = true) {
    setSaving(true);
    setFeedback(null);
    try {
      await persistQuestions(items);
      const shouldMarkReviewed = markReviewed || canMarkReviewedWithoutRegeneration();
      const nextStatus = shouldMarkReviewed ? "reviewed" : analysisStatus;
      const response = await adminFetch(`/api/admin/exam-analyses/${analysis.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          teacher_notes: teacherNotes,
          ai_adjustment_prompt: aiAdjustmentPrompt,
          final_summary_text: finalSummary,
          summary_text: finalSummary,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "Erro ao salvar análise.");
      setAnalysisStatus(nextStatus);
      setFeedback({ type: "success", message: shouldMarkReviewed ? "Análise salva e marcada como revisada." : "Alterações salvas." });
      router.refresh();
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro ao salvar análise." });
    } finally {
      setSaving(false);
    }
  }

  function openRaioXFinal() {
    const switchToRaioX = () => {
      setMode("raiox");
      if (analysisStatus !== "reviewed" && canMarkReviewedWithoutRegeneration()) {
        void saveAnalysis(true);
      }
    };
    const pendingPublish = selectedIds.length > 0
      ? items.filter((q) => selectedIds.includes(q.id) && q.status !== "published" && !q.is_duplicate)
      : [];
    if (pendingPublish.length > 0) {
      sendToBankWithModal(pendingPublish, true, switchToRaioX);
      return;
    }
    switchToRaioX();
  }

  async function saveActiveQuestion() {
    if (!activeQuestion) return;
    setSaving(true);
    setFeedback(null);
    try {
      await patchQuestion(activeQuestion, { status: activeQuestion.status === "detected" ? "confirmed" : activeQuestion.status });
      updateQuestion(activeQuestion.id, { status: activeQuestion.status === "detected" ? "confirmed" : activeQuestion.status });
      setFeedback({ type: "success", message: `Questão ${activeQuestion.original_number || currentIndex + 1} salva.` });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro ao salvar questão." });
    } finally {
      setSaving(false);
    }
  }

  async function discardQuestion(question: RaioXQuestion) {
    try {
      await patchQuestion(question, { status: "discarded" });
      updateQuestion(question.id, { status: "discarded" });
      setSelectedIds((current) => current.filter((id) => id !== question.id));
      setCurrentIndex((index) => Math.min(index, Math.max(originalQuestions.length - 2, 0)));
      setFeedback({ type: "success", message: "Questão descartada da análise." });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro ao descartar questão." });
    }
  }

  async function sendToBank(questionList: RaioXQuestion[], publish = true) {
    if (!questionList.length) return;
    if (questionList.some((q) => q.is_duplicate)) {
      setFeedback({ type: "warning", message: "Uma ou mais questões selecionadas já estão no banco e não podem ser reenviadas." });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const missingSubject = questionList.find((q) => !(q.subject_ids?.length || q.subject_id));
      if (missingSubject) throw new Error("Selecione pelo menos um assunto antes de enviar a questão ao banco.");

      const response = await adminFetch("/api/admin/questions/import/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject_ids: questionList[0].subject_ids?.length ? questionList[0].subject_ids : questionList[0].subject_id ? [questionList[0].subject_id] : [],
          year: analysis.exam_year,
          questions: questionList.map((q) => ({
            temp_id: q.id,
            statement: q.statement,
            question_type: q.question_type,
            board_name: q.board_name || analysis.board_name,
            year: q.year || analysis.exam_year,
            explanation_text: q.explanation_text || "",
            difficulty_level: q.difficulty_level || null,
            source_origin: "exam_analysis",
            orgao: analysis.contest_name || null,
            alternatives: (q.alternatives || []).map((alt) => ({ ...alt, is_correct: q.is_annulled ? false : alt.label === q.answer_key || alt.is_correct })),
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "Erro ao enviar questões ao banco.");

      // Mark questions that were saved OR ignored (already in bank) — hiding action buttons for both.
      const handledIds = new Set<string>([
        ...(Array.isArray(data.saved_temp_ids) ? data.saved_temp_ids : []),
        ...(Array.isArray(data.ignored_temp_ids) ? data.ignored_temp_ids : []),
      ]);
      const toMark = handledIds.size > 0 ? questionList.filter((q) => handledIds.has(q.id)) : questionList;

      for (const q of toMark) await patchQuestion(q, { status: publish ? "published" : "pending_review" });
      setItems((current) => current.map((q) => toMark.some((item) => item.id === q.id) ? { ...q, status: publish ? "published" : "pending_review" } : q));
      setSelectedIds([]);

      const savedCount: number = data.savedCount ?? 0;
      const ignoredCount: number = data.ignoredCount ?? 0;
      const msg = ignoredCount > 0 && savedCount === 0
        ? "Questões já constam no banco — nenhuma duplicata foi criada."
        : ignoredCount > 0
        ? `${savedCount} questão(ões) salvas. ${ignoredCount} já constavam no banco e foram ignoradas.`
        : publish ? "Questões enviadas para o banco. Valide a publicação no fluxo padrão." : "Questões enviadas para revisão.";
      setFeedback({ type: "success", message: msg });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro ao enviar questão." });
    } finally {
      setSaving(false);
    }
  }

  function sendToBankWithModal(questionList: RaioXQuestion[], publish: boolean, onAfterPublish?: () => void) {
    const duplicate = questionList.find((q) => q.is_duplicate);
    if (duplicate) {
      setActionModal({
        open: true,
        tone: "warning",
        title: "Questão já está no banco",
        message: duplicate.duplicate_message || "Esta questão já consta no banco de questões. O envio para revisão foi bloqueado para evitar duplicidade.",
        primaryLabel: "Entendi",
        onClose: () => setActionModal(null),
        onPrimary: () => setActionModal(null),
      });
      return;
    }

    const alreadySent = questionList.find((q) => q.status === "pending_review" || q.status === "published");
    if (alreadySent) return;
    const missingSubject = questionList.find((q) => !(q.subject_ids?.length || q.subject_id));
    if (missingSubject) {
      setActionModal({
        open: true,
        tone: "warning",
        title: "Assunto obrigatório",
        message: "Selecione pelo menos um assunto no bloco de Classificação da IA antes de enviar a questão ao banco.",
        primaryLabel: "Entendi",
        onClose: () => setActionModal(null),
        onPrimary: () => setActionModal(null),
      });
      return;
    }

    const steps = [
      "Verificando classificação",
      "Salvando no banco de questões",
      "Atualizando status",
      "Concluído",
    ];

    const n = questionList.length;
    setActionModal({
      open: true,
      tone: publish ? "publish" : "review",
      title: publish ? (n === 1 ? "Publicar questão" : `Publicar ${n} questões`) : "Enviar para revisão",
      message: publish
        ? n === 1
          ? "A questão será publicada diretamente no banco de questões. Confirma?"
          : `As ${n} questões marcadas serão publicadas diretamente no banco. Confirma?`
        : "A questão será enviada para a fila de revisão. Confirma?",
      primaryLabel: publish ? "Publicar" : "Enviar para revisão",
      secondaryLabel: "Cancelar",
      onClose: () => setActionModal(null),
      onSecondary: () => setActionModal(null),
      onPrimary: async () => {
        setActionModal((m) => m ? { ...m, loading: true, steps, currentStep: 0 } : m);
        try {
          await new Promise((r) => setTimeout(r, 250));
          setActionModal((m) => m ? { ...m, currentStep: 1 } : m);

          const response = await adminFetch("/api/admin/questions/import/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subject_ids: questionList[0].subject_ids?.length ? questionList[0].subject_ids : questionList[0].subject_id ? [questionList[0].subject_id] : [],
              year: analysis.exam_year,
              questions: questionList.map((q) => ({
                temp_id: q.id,
                statement: q.statement,
                question_type: q.question_type,
                board_name: q.board_name || analysis.board_name,
                year: q.year || analysis.exam_year,
                explanation_text: q.explanation_text || "",
                difficulty_level: q.difficulty_level || null,
                source_origin: "exam_analysis",
                orgao: analysis.contest_name || null,
                alternatives: (q.alternatives || []).map((alt) => ({ ...alt, is_correct: q.is_annulled ? false : alt.label === q.answer_key || alt.is_correct })),
              })),
            }),
          });
          const data = await response.json();
          if (!response.ok || !data.ok) throw new Error(data.message || "Erro ao enviar questão ao banco.");

          setActionModal((m) => m ? { ...m, currentStep: 2 } : m);

          // Mark questions handled by the bank (saved or ignored-as-duplicate) — hides action buttons.
          const handledIds = new Set<string>([
            ...(Array.isArray(data.saved_temp_ids) ? data.saved_temp_ids : []),
            ...(Array.isArray(data.ignored_temp_ids) ? data.ignored_temp_ids : []),
          ]);
          const toMark = handledIds.size > 0 ? questionList.filter((q) => handledIds.has(q.id)) : questionList;
          for (const q of toMark) await patchQuestion(q, { status: publish ? "published" : "pending_review" });
          setItems((current) => current.map((q) => toMark.some((item) => item.id === q.id) ? { ...q, status: publish ? "published" : "pending_review" } : q));
          setSelectedIds([]);

          setActionModal((m) => m ? { ...m, currentStep: 3 } : m);
          await new Promise((r) => setTimeout(r, 350));

          const isAlreadyInBank = (data.ignoredCount ?? 0) > 0 && (data.savedCount ?? 0) === 0;
          const savedCount: number = data.savedCount ?? 0;
          const close = () => { setActionModal(null); onAfterPublish?.(); };
          setActionModal({
            open: true,
            tone: "success",
            title: isAlreadyInBank
              ? "Questão já está no banco"
              : publish
              ? (savedCount > 1 ? `${savedCount} questões publicadas!` : "Questão publicada!")
              : "Enviada para revisão!",
            message: isAlreadyInBank
              ? "Esta questão já constava no banco de questões. Nenhuma duplicata foi criada."
              : publish
              ? (savedCount > 1
                  ? `${savedCount} questões foram publicadas no banco com sucesso.`
                  : "A questão foi publicada no banco de questões com sucesso.")
              : "A questão foi enviada para a fila de revisão.",
            primaryLabel: "Fechar",
            onClose: close,
            onPrimary: close,
          });
        } catch (error) {
          setActionModal({
            open: true,
            tone: "error",
            title: "Erro ao enviar",
            message: error instanceof Error ? error.message : "Ocorreu um erro ao enviar a questão. Tente novamente.",
            primaryLabel: "Fechar",
            onClose: () => setActionModal(null),
            onPrimary: () => setActionModal(null),
          });
        }
      },
    });
  }

  async function consolidateSummary() {
    setConsolidatingSummary(true);
    setFeedback(null);
    try {
      const response = await adminFetch(`/api/admin/exam-analyses/${analysis.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "consolidate_summary",
          teacher_notes: teacherNotes,
          ai_adjustment_prompt: aiAdjustmentPrompt,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "Erro ao consolidar resumo.");
      const generatedText = data.final_summary_text || "";
      setFinalSummary(generatedText);
      setSummaryDraft(generatedText);
      if (generatedText.trim()) {
        setTeacherNotes(generatedText);
        try {
          await adminFetch(`/api/admin/exam-analyses/${analysis.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ teacher_notes: generatedText }),
          });
        } catch {
          // O texto já foi gerado e exibido na tela; se a gravação extra falhar, o usuário ainda pode salvar/gerar novamente.
        }
      }
      setFeedback({ type: "success", message: "Parecer EstudoTOP gerado com texto natural. Revise antes de abrir o relatório final." });
      router.refresh();
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro ao consolidar resumo." });
    } finally {
      setConsolidatingSummary(false);
    }
  }

  function checkClassification(): boolean {
    const activeQuestions = originalQuestions.filter((q) => q.status !== "discarded");
    const reviewCandidates = activeQuestions.filter((q) => !q.is_annulled);
    const unclassified = reviewCandidates.filter(
      (q) => !q.subject_id && !(q.subject_ids?.length)
    );
    const unreviewed = reviewCandidates.filter(
      (q) => q.status === "detected"
    );
    if (activeQuestions.length === 0) {
      setActionModal({
        open: true, tone: "warning",
        title: "Nenhuma questão para analisar",
        message: "Esta análise não possui questões ativas. Volte à etapa de revisão e analise o texto da prova primeiro.",
        primaryLabel: "Ir para revisão",
        onClose: () => { setActionModal(null); setMode("review"); },
        onPrimary: () => { setActionModal(null); setMode("review"); },
      });
      return false;
    }
    if (unclassified.length > 0 || unreviewed.length > 0) {
      const n = Math.max(unclassified.length, unreviewed.length);
      setActionModal({
        open: true, tone: "warning",
        title: "Questões não classificadas",
        message: `${n} questão${n > 1 ? "ões" : ""} ainda não ${n > 1 ? "foram classificadas" : "foi classificada"} com assunto do banco. Questões marcadas como anuladas não bloqueiam a geração do relatório. Volte à aba "Revisar questões", selecione o assunto correto nas questões ativas e depois gere o Raio-X.`,
        primaryLabel: "Ir para revisão",
        onClose: () => setActionModal(null),
        onPrimary: () => { setActionModal(null); setMode("review"); },
      });
      return false;
    }
    return true;
  }

  function checkTeacherOpinion(): boolean {
    if (teacherNotes.trim()) return true;
    setActionModal({
      open: true,
      tone: "warning",
      title: "Parecer EstudoTOP obrigatório",
      message: "Antes de gerar o relatório final, preencha o Parecer EstudoTOP na aba do Raio-X final. Esse texto será usado para orientar a IA sem perder o seu estilo editorial.",
      primaryLabel: "Preencher parecer",
      onClose: () => setActionModal(null),
      onPrimary: () => { setActionModal(null); setMode("raiox"); },
    });
    return false;
  }

  function generateReport() {
    if (!checkClassification()) return;
    if (!checkTeacherOpinion()) return;
    const steps = [
      "Coletando dados das questões revisadas",
      "Processando tags e pareceres do professor",
      "Calculando distribuição temática",
      "Gerando laudo analítico com IA",
      "Estruturando relatório final",
      "Concluído",
    ];
    setReportModal({
      open: true,
      tone: "review",
      title: "Gerar Raio-X inicial",
      message: "A IA irá gerar a primeira versão do relatório final a partir das questões revisadas, das tags e do Parecer EstudoTOP. Depois, os dados salvos passam a atualizar o relatório automaticamente.",
      primaryLabel: "Gerar agora",
      secondaryLabel: "Cancelar",
      onClose: () => setReportModal(null),
      onSecondary: () => setReportModal(null),
      onPrimary: async () => {
        setReportModal((m) => m ? { ...m, loading: true, steps, currentStep: 0 } : m);
        try {
          await new Promise((r) => setTimeout(r, 350));
          setReportModal((m) => m ? { ...m, currentStep: 1 } : m);
          await new Promise((r) => setTimeout(r, 350));
          setReportModal((m) => m ? { ...m, currentStep: 2 } : m);

          const response = await adminFetch(`/api/admin/exam-analyses/${analysis.id}/reprocess`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "report", teacher_notes: teacherNotes, ai_adjustment_prompt: aiAdjustmentPrompt }),
          });

          const contentType = response.headers.get("content-type") || "";
          if (!contentType.includes("json")) throw new Error(`Erro ${response.status} na geração. Tente novamente.`);

          setReportModal((m) => m ? { ...m, currentStep: 3 } : m);
          const data = await response.json();
          if (!response.ok || !data.ok) throw new Error(data.message || "Erro ao gerar relatório.");

          setReportModal((m) => m ? { ...m, currentStep: 4 } : m);
          await new Promise((r) => setTimeout(r, 400));
          setReportModal((m) => m ? { ...m, currentStep: 5 } : m);

          setFinalSummary(data.final_summary_text || finalSummary);
          setSummaryDraft(data.final_summary_text || finalSummary);
          setMode("raiox");

          await new Promise((r) => setTimeout(r, 400));
          setReportModal({
            open: true,
            tone: "success",
            title: "Relatório gerado!",
            message: "O relatório final foi gerado. Daqui em diante, os dados objetivos acompanham automaticamente as alterações salvas nas questões, classificações e parecer.",
            primaryLabel: "Ver relatório",
            onClose: () => { setReportModal(null); router.refresh(); },
            onPrimary: () => { setReportModal(null); router.refresh(); },
          });
        } catch (error) {
          setReportModal({
            open: true,
            tone: "error",
            title: "Erro ao gerar relatório",
            message: error instanceof Error ? error.message : "Ocorreu um erro. Tente novamente.",
            primaryLabel: "Fechar",
            onClose: () => setReportModal(null),
            onPrimary: () => setReportModal(null),
          });
        }
      },
    });
  }

  function regenerateFinalRaioX() {
    if (!checkClassification()) return;
    const steps = [
      "Salvando questões revisadas",
      "Calculando mapa de cobrança",
      "Gerando análise estratégica com IA",
      "Montando relatório HTML",
      "Concluído",
    ];
    setGenerationModal({
      open: true,
      tone: "review",
      title: "Gerar Raio-X inicial",
      message: "A primeira versão do Raio-X será gerada com base nas questões revisadas. Depois disso, as alterações salvas serão refletidas automaticamente no relatório.",
      primaryLabel: "Gerar agora",
      secondaryLabel: "Cancelar",
      onClose: () => setGenerationModal(null),
      onSecondary: () => setGenerationModal(null),
      onPrimary: async () => {
        setGenerationModal((m) => m ? { ...m, loading: true, steps, currentStep: 0 } : m);
        try {
          await new Promise((r) => setTimeout(r, 300));
          setGenerationModal((m) => m ? { ...m, currentStep: 1 } : m);
          // Salva edições locais — ignora falhas individuais para não bloquear a geração
          try { await persistQuestions(items); } catch { /* continua mesmo se alguma questão falhar */ }

          await new Promise((r) => setTimeout(r, 300));
          setGenerationModal((m) => m ? { ...m, currentStep: 2 } : m);

          const response = await adminFetch(`/api/admin/exam-analyses/${analysis.id}/reprocess`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "summary", teacher_notes: teacherNotes, ai_adjustment_prompt: aiAdjustmentPrompt }),
          });

          // Detecta resposta HTML (erro do Next.js) antes de tentar parsear JSON
          const contentType = response.headers.get("content-type") || "";
          if (!contentType.includes("json")) {
            throw new Error(`Erro ${response.status} na geração do Raio-X. Tente novamente.`);
          }

          const data = await response.json();
          if (!response.ok || !data.ok) throw new Error(data.message || "Erro ao gerar Raio-X final.");

          setGenerationModal((m) => m ? { ...m, currentStep: 3 } : m);
          await new Promise((r) => setTimeout(r, 400));
          setGenerationModal((m) => m ? { ...m, currentStep: 4 } : m);

          setFinalSummary(data.final_summary_text || data.summary_text || finalSummary);
          setSummaryDraft(data.final_summary_text || data.summary_text || finalSummary);
          setMode("raiox");

          await new Promise((r) => setTimeout(r, 400));
          setGenerationModal({
            open: true,
            tone: "success",
            title: "Raio-X inicial gerado!",
            message: "O Raio-X inicial foi gerado. Daqui em diante, os dados objetivos acompanham automaticamente as alterações salvas nas questões, classificações e parecer.",
            primaryLabel: "Ver Raio-X",
            onClose: () => { setGenerationModal(null); router.refresh(); },
            onPrimary: () => { setGenerationModal(null); router.refresh(); },
          });
        } catch (error) {
          setGenerationModal({
            open: true,
            tone: "error",
            title: "Erro ao gerar Raio-X",
            message: error instanceof Error ? error.message : "Ocorreu um erro ao gerar o Raio-X final.",
            primaryLabel: "Fechar",
            onClose: () => setGenerationModal(null),
            onPrimary: () => setGenerationModal(null),
          });
        }
      },
    });
  }

  async function reprocess(modeToRun: ReprocessMode) {
    setReprocessingMode(modeToRun);
    setFeedback(null);
    try {
      if (modeToRun === "summary") await persistQuestions(items);
      const response = await adminFetch(`/api/admin/exam-analyses/${analysis.id}/reprocess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: modeToRun, teacher_notes: teacherNotes, ai_adjustment_prompt: aiAdjustmentPrompt }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "Erro ao refazer análise.");
      setReprocessModal(false);
      setFeedback({ type: "success", message: modeToRun === "summary" ? "Raio-X refeito sem alterar as questões." : "Análise completa refeita a partir do texto original." });
      if (modeToRun === "full") setMode("review");
      else setMode("raiox");
      router.refresh();
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro ao refazer análise." });
    } finally {
      setReprocessingMode(null);
    }
  }

  async function refazerComNovoTexto() {
    const texto = newRawText.trim();
    if (texto.length < 40) {
      setFeedback({ type: "error", message: "Cole o texto da prova antes de continuar." });
      return;
    }

    // ── Passo 0: fecha modal de texto, abre modal de processamento ────────────
    setRefazerModal(false);
    setRefazerProcessingStep(0);
    setRefazerDetectedCount(0);
    setRefazerProcessingModal(true);
    setRefazendo(true);
    setFeedback(null);

    // ── Passo 1: detecta blocos (mesmas regras do Importador com IA) ──────────
    await new Promise((r) => setTimeout(r, 300));
    const blocks = splitIntoQuestionBlocks(texto);
    setRefazerDetectedCount(blocks.length);
    setRefazerProcessingStep(1);

    if (blocks.length === 0) {
      setRefazerProcessingModal(false);
      setRefazendo(false);
      setFeedback({ type: "error", message: "Nenhuma questão foi detectada no texto. Verifique o formato." });
      return;
    }

    try {
      // ── Passo 2: envia para análise (mesmo fluxo da análise inicial) ────────
      await new Promise((r) => setTimeout(r, 400));
      setRefazerProcessingStep(2);

      const response = await adminFetch("/api/admin/exam-analyses/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contest_name: analysis.contest_name,
          position_name: analysis.position_name,
          exam_year: analysis.exam_year,
          board_name: analysis.board_name,
          board_id: analysis.board_id || null,
          discipline_id: analysis.discipline_id || null,
          discipline_name: analysis.discipline_name,
          raw_content: texto,
        }),
      });

      // ── Passo 3: processa resultado ────────────────────────────────────────
      setRefazerProcessingStep(3);
      await new Promise((r) => setTimeout(r, 300));

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("json")) throw new Error(`Erro ${response.status}. Tente novamente.`);
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "Erro ao analisar nova prova.");

      // ── Passo 4: remove análise anterior ──────────────────────────────────
      setRefazerProcessingStep(4);
      await adminFetch(`/api/admin/exam-analyses/${analysis.id}`, { method: "DELETE" });
      await new Promise((r) => setTimeout(r, 350));

      // ── Passo 5: concluído — navega para a nova análise ───────────────────
      setRefazerProcessingStep(5);
      await new Promise((r) => setTimeout(r, 500));

      setRefazerProcessingModal(false);
      setNewRawText("");
      router.push(`/admin/raio-x-provas/${data.id}`);
    } catch (error) {
      setRefazerProcessingModal(false);
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro ao refazer análise." });
    } finally {
      setRefazendo(false);
    }
  }

  async function saveEditedSummary() {
    setSaving(true);
    setFeedback(null);
    try {
      const response = await adminFetch(`/api/admin/exam-analyses/${analysis.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ final_summary_text: summaryDraft, summary_text: summaryDraft }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "Erro ao salvar Raio-X.");
      setFinalSummary(summaryDraft);
      setEditingSummary(false);
      setFeedback({ type: "success", message: "Texto do Raio-X salvo." });
      router.refresh();
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro ao salvar Raio-X." });
    } finally {
      setSaving(false);
    }
  }

  async function generateVariations() {
    if (!variationModal) return;
    setGeneratingVariation(true);
    setFeedback(null);
    try {
      const response = await adminFetch(`/api/admin/exam-analyses/${analysis.id}/questions/${variationModal.questionId}/variations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: Number(variationCount), fidelity: variationFidelity }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "Erro ao gerar variações.");
      setVariationModal(null);
      const created: RaioXQuestion[] = Array.isArray(data.variations) ? data.variations : [];
      if (created.length > 0) {
        setVariationReviewItems(created);
      } else {
        setFeedback({ type: "success", message: `${data.created_count || variationCount} variações criadas. Elas aparecerão abaixo da análise.` });
        router.refresh();
      }
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro ao gerar variações." });
    } finally {
      setGeneratingVariation(false);
    }
  }

  async function discardVariationItem(id: string) {
    await adminFetch(`/api/admin/exam-analyses/${analysis.id}/questions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "discarded" }),
    }).catch(() => null);
    setVariationReviewItems((current) => current.filter((v) => v.id !== id));
  }

  function closeVariationReview() {
    setVariationReviewItems([]);
    router.refresh();
  }

  return (
    <main className="min-h-full bg-[#0D1B2A] px-4 py-6 text-white md:px-8">
      <div className="pointer-events-none fixed inset-0 opacity-80">
        <div className="absolute left-[-12%] top-[-10%] h-72 w-72 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="absolute right-[-10%] top-1/4 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl" />
      </div>

      <section className="relative mx-auto max-w-7xl space-y-5">
        {/* ── Barra de ações compacta ────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/admin/raio-x-provas" className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-sm font-semibold text-slate-400 transition hover:text-white">
            <ArrowLeft size={15} /> Voltar
          </Link>
          <div className="flex flex-wrap items-center gap-1.5">
            {deletingAnalysis ? (
              <>
                <span className="self-center text-sm font-semibold text-red-300">Excluir permanentemente?</span>
                <button type="button" onClick={async () => {
                  setDeleteAnalysisLoading(true);
                  try {
                    const res = await adminFetch(`/api/admin/exam-analyses/${analysis.id}`, { method: "DELETE" });
                    const data = await res.json();
                    if (!res.ok || !data.ok) throw new Error(data.message);
                    router.push("/admin/raio-x-provas");
                  } catch { setDeletingAnalysis(false); }
                  finally { setDeleteAnalysisLoading(false); }
                }} disabled={deleteAnalysisLoading} className="inline-flex items-center gap-1.5 rounded-xl border border-red-400/30 bg-red-500/15 px-3 py-1.5 text-sm font-bold text-red-300 transition hover:bg-red-500/25 disabled:opacity-60">
                  {deleteAnalysisLoading ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />} Confirmar
                </button>
                <button type="button" onClick={() => setDeletingAnalysis(false)} className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-sm font-semibold text-slate-400 hover:text-white">
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setDeletingAnalysis(true)} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold text-red-400 transition hover:bg-red-500/10" title="Excluir esta análise permanentemente">
                  <Trash2 size={14} /> Excluir
                </button>
                <button type="button" onClick={() => {
                  setEditContest(analysis.contest_name || "");
                  setEditPosition(analysis.position_name || "");
                  setEditBoard(analysis.board_name || "");
                  setEditYear(String(analysis.exam_year || ""));
                  setEditDisciplineId(analysis.discipline_id || "");
                  setEditModal(true);
                }} className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-sm font-semibold text-slate-300 transition hover:text-white" title="Editar concurso, cargo, banca, ano e disciplina">
                  <Settings2 size={14} /> Editar dados
                </button>
                <button type="button" onClick={() => { setNewRawText(""); setRefazerModal(true); }} className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-sm font-semibold text-slate-300 transition hover:text-white" title="Cola um novo texto de prova e descarta as questões atuais">
                  <ClipboardList size={14} /> Inserir nova prova
                </button>
                <button onClick={() => saveAnalysis(mode === "raiox")} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-1.5 text-sm font-bold text-white shadow-md shadow-orange-500/20 transition hover:bg-orange-400 disabled:opacity-60">
                  {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} Salvar
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Header da análise ─────────────────────────────────────────────── */}
        <header className="rounded-[1.5rem] border border-white/[0.07] bg-[#0C1E34]/90 px-5 py-4 shadow-lg shadow-black/20 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-orange-400/20 bg-orange-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-orange-300">
                  <FileSearch size={11} /> Raio-X de Provas
                </div>
                <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${statusClass(analysisStatus)}`}>{statusLabel(analysisStatus)}</span>
              </div>
              <h1 className="text-xl font-bold leading-tight text-slate-100">{analysis.title}</h1>
              <p className="mt-1 text-xs text-slate-500">{[analysis.contest_name, analysis.position_name, analysis.board_name, analysis.exam_year, analysis.discipline_name].filter(Boolean).join(" · ")}</p>
            </div>
          </div>
        </header>

        {/* ── Toast de feedback (canto superior direito) ────────────────────── */}
        {feedback && (
          <div className={`fixed right-5 top-5 z-50 max-w-xs rounded-2xl border px-4 py-3 text-sm font-semibold shadow-2xl shadow-black/40 ${feedback.type === "error" ? "border-red-300/25 bg-red-950/90 text-red-200" : feedback.type === "warning" ? "border-amber-300/25 bg-amber-950/90 text-amber-200" : "border-emerald-300/25 bg-emerald-950/90 text-emerald-200"}`}>
            {feedback.message}
          </div>
        )}

        <div className="grid gap-3 rounded-[1.5rem] border border-white/[0.08] bg-[#0C1E34]/80 p-3 shadow-xl shadow-black/20 sm:grid-cols-2">
          <button type="button" onClick={() => setMode("review")} className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition ${mode === "review" ? "bg-orange-500 text-white shadow-md shadow-orange-500/20" : "bg-white/[0.04] text-slate-400 hover:bg-white/[0.07] hover:text-slate-200"}`}>
            Revisar questões
          </button>
          <button type="button" onClick={openRaioXFinal} className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition ${mode === "raiox" ? "bg-blue-600 text-white shadow-md shadow-blue-600/20" : "bg-white/[0.04] text-slate-400 hover:bg-white/[0.07] hover:text-slate-200"}`}>
            Ver Raio-X final
          </button>
        </div>

        {mode === "review" ? (
          <section className="space-y-5">
            <ReviewHeader stats={reviewStats} currentIndex={currentIndex} total={originalQuestions.length} />

            {activeQuestion ? (
              <>
                <QuestionNavigator
                  questions={originalQuestions}
                  currentIndex={currentIndex}
                  onSelect={setCurrentIndex}
                />

                <QuestionCard
                  question={activeQuestion}
                  selected={selectedIds.includes(activeQuestion.id)}
                  onToggleSelected={() => toggleSelected(activeQuestion.id)}
                  onChange={(changes) => updateQuestion(activeQuestion.id, changes)}
                  onDiscard={() => discardQuestion(activeQuestion)}
                  onPublish={() => sendToBankWithModal([activeQuestion], true)}
                  onVariations={() => setVariationModal({ questionId: activeQuestion.id, title: `Questão ${activeQuestion.original_number || currentIndex + 1}` })}
                  subjects={subjects}
                  disciplines={disciplines}
                />

                <div className="flex flex-col gap-3 rounded-[1.7rem] border border-white/[0.08] bg-[#0C1E34]/88 p-4 shadow-xl shadow-black/20 sm:flex-row sm:items-center sm:justify-between">
                  <button type="button" onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))} disabled={currentIndex === 0} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm font-black text-slate-300 disabled:cursor-not-allowed disabled:opacity-40">
                    <ChevronLeft size={17} /> Questão anterior
                  </button>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button type="button" onClick={saveActiveQuestion} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm font-black text-emerald-100 disabled:opacity-60">
                      {saving ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />} Salvar questão
                    </button>
                    {currentIndex === originalQuestions.length - 1 ? (
                      finalSummary ? (
                        <button type="button" onClick={openRaioXFinal} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-300 to-orange-400 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-sky-500/20">
                          <Eye size={17} /> Ver Raio-X final
                        </button>
                      ) : (
                        <button type="button" onClick={regenerateFinalRaioX} disabled={consolidatingSummary} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-300 to-orange-400 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-sky-500/20 disabled:opacity-60">
                          {consolidatingSummary ? <Loader2 className="animate-spin" size={17} /> : <BarChart3 size={17} />} Gerar Raio-X inicial
                        </button>
                      )
                    ) : (
                      <button type="button" onClick={() => setCurrentIndex((i) => Math.min(originalQuestions.length - 1, i + 1))} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-orange-500/20">
                        Próxima questão <ChevronRight size={17} />
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-8 text-center text-slate-500">Nenhuma questão ativa nesta análise.</div>
            )}

            {!!variationQuestions.length && (
              <section className="space-y-4 rounded-[2rem] border border-white/[0.08] bg-[#0C1E34]/90 p-6 shadow-2xl shadow-black/25">
                <h2 className="text-xl font-black text-white">Variações geradas</h2>
                <p className="text-sm text-slate-400">As variações ficam salvas e podem ser revisadas, enviadas para revisão ou publicadas.</p>
                {variationQuestions.map((question) => (
                  <QuestionCard
                    key={question.id}
                    question={question}
                    selected={selectedIds.includes(question.id)}
                    onToggleSelected={() => toggleSelected(question.id)}
                    onChange={(changes) => updateQuestion(question.id, changes)}
                    onDiscard={() => discardQuestion(question)}
                    onPublish={() => sendToBankWithModal([question], true)}
                    onVariations={() => setVariationModal({ questionId: question.id, title: `Variação ${question.original_number || ""}` })}
                    subjects={subjects}
                    disciplines={disciplines}
                  />
                ))}
              </section>
            )}
          </section>
        ) : (
          <RaioXFinalView
            analysis={analysis}
            dashboard={dashboard}
            modulesSummary={modulesSummary}
            finalSummary={finalSummary}
            summaryDraft={summaryDraft}
            setSummaryDraft={setSummaryDraft}
            editingSummary={editingSummary}
            setEditingSummary={setEditingSummary}
            saving={saving}
            consolidatingSummary={consolidatingSummary}
            teacherNotes={teacherNotes}
            setTeacherNotes={setTeacherNotes}
            aiAdjustmentPrompt={aiAdjustmentPrompt}
            setAiAdjustmentPrompt={setAiAdjustmentPrompt}
            questions={originalQuestions}
            subjects={subjects}
            cloneSimulados={cloneSimulados}
            onGenerateReport={generateReport}
            onSave={saveEditedSummary}
            onConsolidate={consolidateSummary}
            onEmail={() => setActionModal({ open: true, tone: "confirm", title: "Enviar por e-mail", message: "O envio de e-mail para alunos cadastrados está disponível no módulo de alunos. Vá até o perfil do aluno e utilize a opção de envio de documento.", primaryLabel: "Entendi", onClose: () => setActionModal(null), onPrimary: () => setActionModal(null) })}
          />
        )}
      </section>

      {selectedIds.length > 0 && (
        <SelectionGhostBar
          count={selectedIds.length}
          actions={[
            { label: "Publicar", icon: <CheckCircle2 size={16} />, onClick: () => sendToBankWithModal(selectedQuestions.filter((q) => q.status !== "published"), true), variant: "primary" },
            { label: "Descartar", icon: <Trash2 size={16} />, onClick: () => selectedQuestions.forEach((q) => discardQuestion(q)), variant: "danger" },
            { label: "Limpar", icon: <X size={16} />, onClick: () => setSelectedIds([]), variant: "secondary" },
          ]}
        />
      )}

      <QuestionActionModal modal={actionModal} />
      <QuestionActionModal modal={generationModal} />
      <QuestionActionModal modal={reportModal} />

      {variationModal && (
        <VariationModalView
          modal={variationModal}
          count={variationCount}
          fidelity={variationFidelity}
          loading={generatingVariation}
          onCountChange={setVariationCount}
          onFidelityChange={setVariationFidelity}
          onClose={() => setVariationModal(null)}
          onSubmit={generateVariations}
        />
      )}

      {variationReviewItems.length > 0 && (
        <VariationReviewPanel
          variations={variationReviewItems}
          analysis={analysis}
          subjects={subjects}
          onClose={closeVariationReview}
        />
      )}

      {/* ── MODAL: EDITAR CONFIGURAÇÕES ───────────────────────────────────── */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm" onClick={() => { if (!savingMeta) setEditModal(false); }}>
          <div className="w-full max-w-xl rounded-[2rem] border border-white/[0.10] bg-[#0C1E34] p-6 text-white shadow-2xl shadow-black/50" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-orange-400/25 bg-orange-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-orange-200">
                  <Edit3 size={13} /> Editar configurações
                </div>
                <h3 className="mt-3 text-xl font-black">Dados da análise</h3>
                <p className="mt-1 text-sm text-slate-400">O nome da análise será regenerado automaticamente.</p>
              </div>
              {!savingMeta && (
                <button type="button" onClick={() => setEditModal(false)} className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-2 text-slate-400 hover:text-white">
                  <X size={18} />
                </button>
              )}
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {/* Órgão */}
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Órgão *</span>
                <input
                  list="edit-contests-list"
                  value={editContest}
                  onChange={(e) => setEditContest(e.target.value)}
                  placeholder="Ex.: PC-MG, IBGE, TJSP"
                  className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-orange-300/50"
                />
                <datalist id="edit-contests-list">
                  {contests.map((c) => <option key={c.id} value={c.name} />)}
                </datalist>
              </label>

              {/* Cargo */}
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Cargo *</span>
                <input
                  value={editPosition}
                  onChange={(e) => setEditPosition(e.target.value)}
                  placeholder="Ex.: Técnico Assistente"
                  className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-orange-300/50"
                />
              </label>

              {/* Banca */}
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Banca *</span>
                <input
                  value={editBoard}
                  onChange={(e) => setEditBoard(e.target.value)}
                  placeholder="Ex.: CESPE / CEBRASPE"
                  className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-orange-300/50"
                />
              </label>

              {/* Ano */}
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Ano *</span>
                <input
                  type="number"
                  min="1990"
                  max="2100"
                  value={editYear}
                  onChange={(e) => setEditYear(e.target.value)}
                  placeholder="Ex.: 2026"
                  className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-orange-300/50"
                />
              </label>

              {/* Disciplina */}
              {disciplines.length > 0 && (
                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Disciplina</span>
                  <select
                    value={editDisciplineId}
                    onChange={(e) => setEditDisciplineId(e.target.value)}
                    className="w-full rounded-2xl border border-white/[0.08] bg-[#091323] px-4 py-3 text-sm font-semibold text-white outline-none focus:border-orange-300/50"
                  >
                    <option value="">Selecione</option>
                    {disciplines.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </label>
              )}
            </div>

            {/* Preview do nome */}
            {editContest.trim() && editPosition.trim() && editBoard.trim() && editYear.trim() && (
              <div className="mt-4 rounded-2xl border border-orange-300/15 bg-orange-400/10 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-300">Nome que será gerado</p>
                <p className="mt-1 break-words text-sm font-bold text-white">
                  RaioX - Prova - {editContest.trim()} - {editPosition.trim()} - {editYear.trim()} - {editBoard.trim()}
                </p>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              {!savingMeta && (
                <button type="button" onClick={() => setEditModal(false)} className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-5 py-3 text-sm font-bold text-slate-300 transition hover:bg-white/[0.07]">
                  Cancelar
                </button>
              )}
              <button
                type="button"
                onClick={saveMetadata}
                disabled={savingMeta || !editContest.trim() || !editPosition.trim() || !editBoard.trim() || !editYear.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 px-6 py-3 text-sm font-black text-slate-950 shadow-lg shadow-orange-500/20 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingMeta ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />}
                {savingMeta ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: PROCESSAMENTO (INSERIR NOVA PROVA) ────────────────────── */}
      {refazerProcessingModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 px-4 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-[2rem] border border-white/[0.10] bg-[#0B1424] p-8 shadow-2xl shadow-black/60">
            {/* Header */}
            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-orange-400/25 bg-orange-500/15 text-orange-300">
                {refazerProcessingStep === REFAZER_STEPS.length - 1
                  ? <CheckCircle2 size={30} className="text-emerald-400" />
                  : <Sparkles size={28} className="animate-pulse" />}
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-orange-300">
                Raio-X de Provas · IA em ação
              </p>
              <h3 className="mt-2 text-2xl font-black text-white">
                {refazerProcessingStep === REFAZER_STEPS.length - 1 ? "Análise concluída!" : "Analisando a prova"}
              </h3>
              <p className="mt-1 text-sm text-slate-400">
                {REFAZER_STEPS[Math.min(refazerProcessingStep, REFAZER_STEPS.length - 1)].label}
                {refazerDetectedCount > 0 && refazerProcessingStep >= 1 && (
                  <span className="ml-2 font-semibold text-orange-300">
                    · {refazerDetectedCount} quest{refazerDetectedCount !== 1 ? "ões" : "ão"} detectada{refazerDetectedCount !== 1 ? "s" : ""}
                  </span>
                )}
              </p>
            </div>

            {/* Barra de progresso */}
            <div className="mb-6 h-3 overflow-hidden rounded-full bg-white/[0.06] shadow-inner shadow-black/30">
              <div
                className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-700"
                style={{ width: `${refazerProgressPct}%` }}
              />
            </div>
            <p className="mb-5 text-right text-sm font-black text-orange-300">{refazerProgressPct}%</p>

            {/* Steps */}
            <div className="space-y-2">
              {REFAZER_STEPS.map((step, i) => {
                const done = i < refazerProcessingStep;
                const active = i === refazerProcessingStep;
                return (
                  <div key={i} className={`relative overflow-hidden rounded-2xl border px-4 py-3 transition-all ${
                    done ? "border-emerald-400/25 bg-emerald-400/[0.07]"
                    : active ? "border-orange-400/35 bg-orange-500/[0.10] shadow-lg shadow-orange-950/20"
                    : "border-white/[0.05] bg-white/[0.025]"
                  }`}>
                    {active && (
                      <div className="pointer-events-none absolute inset-y-0 left-0 animate-[progressPulse_1.5s_ease-in-out_infinite] w-1/2 bg-gradient-to-r from-transparent via-orange-500/10 to-transparent" />
                    )}
                    <div className="relative flex items-center gap-3">
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black shadow-sm ${
                        done ? "bg-emerald-400 text-slate-950"
                        : active ? "bg-orange-400 text-slate-950"
                        : "bg-white/[0.08] text-slate-500"
                      }`}>
                        {done ? <CheckCircle2 size={13} /> : i + 1}
                      </span>
                      <span className={`flex-1 text-sm font-bold ${
                        done ? "text-emerald-200" : active ? "text-orange-100" : "text-slate-600"
                      }`}>{step.label}</span>
                      <StepPct active={active} done={done} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Estatísticas */}
            <div className="mt-5 grid grid-cols-3 gap-3">
              {[
                { icon: <FileText size={15} />, label: "Texto", value: `${newRawText.trim().length} chars` },
                { icon: <Layers3 size={15} />, label: "Detectadas", value: refazerDetectedCount > 0 ? String(refazerDetectedCount) : "—" },
                { icon: <Sparkles size={15} />, label: "Status", value: refazerProcessingStep === REFAZER_STEPS.length - 1 ? "Pronto" : "Analisando" },
              ].map((s) => (
                <div key={s.label} className="flex flex-col items-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5">
                  <span className="text-orange-400">{s.icon}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{s.label}</span>
                  <span className="text-sm font-black text-white">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: REFAZER COM NOVO TEXTO ─────────────────────────────────── */}
      {refazerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm" onClick={() => { if (!refazendo) setRefazerModal(false); }}>
          <div className="w-full max-w-3xl rounded-[2rem] border border-white/[0.10] bg-[#0C1E34] p-6 text-white shadow-2xl shadow-black/50" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/25 bg-sky-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-sky-200">
                  <RefreshCw size={13} /> Refazer com novo texto
                </div>
                <h3 className="mt-3 text-2xl font-black">Cole o texto da prova</h3>
                <p className="mt-1 text-sm text-slate-400">
                  As questões e análises anteriores serão descartadas. Os campos de configuração (concurso, cargo, banca, ano, disciplina) serão mantidos.
                </p>
              </div>
              {!refazendo && (
                <button type="button" onClick={() => setRefazerModal(false)} className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-2 text-slate-400 hover:text-white">
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Campos de configuração — somente leitura, para confirmar */}
            <div className="mt-5 grid grid-cols-2 gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4 sm:grid-cols-4">
              {[
                { label: "Concurso", value: analysis.contest_name },
                { label: "Cargo", value: analysis.position_name },
                { label: "Banca", value: analysis.board_name },
                { label: "Ano", value: String(analysis.exam_year || "") },
              ].filter((f) => f.value).map((f) => (
                <div key={f.label}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">{f.label}</p>
                  <p className="mt-0.5 text-sm font-bold text-white">{f.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-5">
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Novo texto bruto da prova</label>
              <textarea
                value={newRawText}
                onChange={(e) => setNewRawText(e.target.value)}
                disabled={refazendo}
                placeholder={`Cole aqui o texto bruto da prova.\n\nExemplo:\n1. Enunciado da questão...\nA) Alternativa A\nB) Alternativa B\nC) Alternativa C\nD) Alternativa D\nGabarito: B`}
                className="min-h-[260px] w-full resize-y rounded-2xl border border-white/[0.08] bg-[#0D1B2A]/75 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-sky-300/50 focus:ring-4 focus:ring-sky-500/10 disabled:opacity-50"
              />
              <p className="mt-2 text-xs text-slate-600">
                {newRawText.trim().length > 0
                  ? `${newRawText.trim().length} caracteres · pronto para analisar`
                  : "Cole o texto acima para habilitar a análise"}
              </p>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              {!refazendo && (
                <button type="button" onClick={() => setRefazerModal(false)} className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-5 py-3 text-sm font-bold text-slate-300 transition hover:bg-white/[0.07]">
                  Cancelar
                </button>
              )}
              <button
                type="button"
                onClick={refazerComNovoTexto}
                disabled={refazendo || newRawText.trim().length < 40}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-400 to-orange-400 px-6 py-3 text-sm font-black text-slate-950 shadow-lg shadow-sky-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {refazendo ? <Loader2 className="animate-spin" size={17} /> : <Sparkles size={17} />}
                {refazendo ? "Analisando prova..." : "Descartar anterior e analisar novo texto"}
              </button>
            </div>
          </div>
        </div>
      )}

      {reprocessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[2rem] border border-white/[0.10] bg-[#0C1E34] p-6 text-white shadow-2xl shadow-black/50">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-orange-400/25 bg-orange-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-orange-200"><RefreshCw size={14} /> Refazer análise</div>
                <h3 className="mt-3 text-2xl font-black">Escolha o tipo de reprocessamento</h3>
                <p className="mt-1 text-sm text-slate-400">Use a opção completa apenas quando quiser zerar a diagramação atual e analisar o texto original novamente.</p>
              </div>
              <button onClick={() => setReprocessModal(false)} className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-2 text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <button type="button" onClick={() => reprocess("summary")} disabled={Boolean(reprocessingMode)} className="rounded-2xl border border-sky-300/20 bg-sky-400/10 p-5 text-left transition hover:bg-sky-400/15 disabled:opacity-60">
                <div className="flex items-center gap-2 text-sm font-black text-sky-100">{reprocessingMode === "summary" ? <Loader2 className="animate-spin" size={17} /> : <BarChart3 size={17} />} Refazer apenas o Raio-X</div>
                <p className="mt-2 text-xs leading-5 text-slate-400">Mantém as questões e suas edições. Recalcula mapa de cobrança, resumo, métricas e recomendações.</p>
              </button>
              <button type="button" onClick={() => reprocess("full")} disabled={Boolean(reprocessingMode)} className="rounded-2xl border border-red-300/20 bg-red-400/10 p-5 text-left transition hover:bg-red-400/15 disabled:opacity-60">
                <div className="flex items-center gap-2 text-sm font-black text-red-100">{reprocessingMode === "full" ? <Loader2 className="animate-spin" size={17} /> : <AlertTriangle size={17} />} Refazer análise completa</div>
                <p className="mt-2 text-xs leading-5 text-slate-400">Descarta as questões atuais, refaz a identificação/diagramação e recria o Raio-X com base no texto original.</p>
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
/** Contador animado 0 → ~90% enquanto ativa, salta para 100% quando concluída */
function StepPct({ active, done }: { active: boolean; done: boolean }) {
  const [pct, setPct] = useState(done ? 100 : 0);

  useEffect(() => {
    if (done) { setPct(100); return; }
    if (!active) { setPct(0); return; }
    let cur = 0;
    setPct(0);
    const id = setInterval(() => {
      cur += Math.random() * 4 + 1.5;
      if (cur >= 88) { clearInterval(id); setPct(88); return; }
      setPct(Math.round(cur));
    }, 90);
    return () => clearInterval(id);
  }, [active, done]);

  if (done) return <span className="text-xs font-black text-emerald-300">100%</span>;
  if (active) return <span className="text-xs font-black text-orange-300">{pct}%</span>;
  return <span className="text-xs font-bold text-slate-700">0%</span>;
}

function RaioXFinalView({ analysis, dashboard, modulesSummary, finalSummary, summaryDraft, setSummaryDraft, editingSummary, setEditingSummary, saving, consolidatingSummary, teacherNotes, setTeacherNotes, aiAdjustmentPrompt, setAiAdjustmentPrompt, questions, subjects, cloneSimulados: initialCloneSimulados, onGenerateReport, onSave, onConsolidate, onEmail }: {
  analysis: RaioXAnalysis; dashboard: any; modulesSummary: any[]; finalSummary: string; summaryDraft: string;
  setSummaryDraft: (v: string) => void; editingSummary: boolean; setEditingSummary: (v: boolean) => void;
  saving: boolean; consolidatingSummary: boolean; teacherNotes: string; setTeacherNotes: (v: string) => void;
  aiAdjustmentPrompt: string; setAiAdjustmentPrompt: (v: string) => void;
  questions: RaioXQuestion[]; subjects: SubjectOption[];
  cloneSimulados: CloneSimulado[];
  onGenerateReport: () => void; onSave: () => void; onConsolidate: () => void; onEmail: () => void;
}) {
  const [showConfig, setShowConfig] = useState(true);

  // ── Recalcula a distribuição usando os assuntos do banco atribuídos ────────
  const effectiveModules = useMemo(() => {
    const active = questions.filter((q) => q.status !== "discarded");
    const hasAssignments = active.some((q) => q.subject_id || (q.subject_ids?.length ?? 0) > 0);
    if (!hasAssignments) {
      // Sem atribuições manuais → usa o modulesSummary salvo no banco
      return [...modulesSummary].sort((a: any, b: any) => (b.question_count || 0) - (a.question_count || 0));
    }
    // Com atribuições manuais → agrupa pelo assunto do banco
    const groups: Record<string, { count: number; totalDiff: number; diffCount: number; hasImage: number; points: string[] }> = {};
    for (const q of active) {
      const primaryId = (q.subject_ids?.[0]) || q.subject_id || null;
      const subjectName = (primaryId && subjects.find((s) => s.id === primaryId)?.name) || q.module_name || "Não classificado";
      if (!groups[subjectName]) groups[subjectName] = { count: 0, totalDiff: 0, diffCount: 0, hasImage: 0, points: [] };
      groups[subjectName].count++;
      if (q.difficulty_level) { groups[subjectName].totalDiff += q.difficulty_level; groups[subjectName].diffCount++; }
      if (q.has_image) groups[subjectName].hasImage++;
      // Coleta as tags (knowledge_points) de cada questão
      if (Array.isArray(q.knowledge_points)) {
        for (const pt of q.knowledge_points) {
          if (pt && !groups[subjectName].points.includes(pt)) groups[subjectName].points.push(pt);
        }
      }
    }
    const total = active.length;
    return Object.entries(groups)
      .map(([module, d]) => ({
        module,
        question_count: d.count,
        percentage: total > 0 ? Math.round((d.count / total) * 100) : 0,
        average_difficulty: d.diffCount > 0 ? d.totalDiff / d.diffCount : null,
        subtopics: [],
        charging_profile: null,
        knowledge_points: d.points.slice(0, 8),
      }))
      .sort((a, b) => b.question_count - a.question_count);
  }, [questions, subjects, modulesSummary]);

  const active = questions.filter((q) => q.status !== "discarded");
  const total = active.length || Number(dashboard?.total_it_questions || 0);
  const sorted = effectiveModules;
  const avgDiff = active.length > 0
    ? active.reduce((s, q) => s + (Number(q.difficulty_level) || 0), 0) / active.length
    : Number(dashboard?.average_difficulty || 0);
  const withImage = active.filter((q) => q.has_image).length || Number(dashboard?.total_images || 0);
  const annulledCount = active.filter((q) => q.is_annulled).length;
  const [parecerQuestionCount, setParecerQuestionCount] = useState(String(total || ""));
  const [parecerSubjects, setParecerSubjects] = useState(sorted.map((m: any) => m.module).join(", "));
  const [parecerDifficulty, setParecerDifficulty] = useState(avgDiff ? avgDiff.toFixed(1) : "");
  const [parecerAlerts, setParecerAlerts] = useState(() => {
    const opinions = questions
      .filter((q) => q.status !== "discarded" && q.teacher_opinion && q.teacher_opinion.replace(/<[^>]*>/g, "").trim())
      .map((q) => {
        const num = q.original_number ? String(q.original_number).padStart(2, "0") : null;
        const text = q.teacher_opinion!.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
        return num ? `Q${num}: ${text}` : text;
      });
    return opinions.join("\n");
  });
  const [parecerFreeText, setParecerFreeText] = useState(teacherNotes || "");

  useEffect(() => {
    const opinions = questions
      .filter((q) => q.status !== "discarded" && q.teacher_opinion && q.teacher_opinion.replace(/<[^>]*>/g, "").trim())
      .map((q) => {
        const num = q.original_number ? String(q.original_number).padStart(2, "0") : null;
        const text = q.teacher_opinion!.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
        return num ? `Q${num}: ${text}` : text;
      });
    setParecerAlerts(opinions.join("\n"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions.map((q) => `${q.id}:${q.teacher_opinion || ""}`).join("|")]);
  const [cloneModal, setCloneModal] = useState(false);
  const [cloneSimilarity, setCloneSimilarity] = useState("75");
  const [cloneDifficulty, setCloneDifficulty] = useState("0");
  const [cloneTitle, setCloneTitle] = useState("");
  const [cloning, setCloning] = useState(false);
  const [cloneStep, setCloneStep] = useState(0);
  const [cloneResult, setCloneResult] = useState<{ simulado_id: string; simulado_title: string; question_count: number } | null>(null);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [localClones, setLocalClones] = useState<CloneSimulado[]>(initialCloneSimulados);
  const [reviewQuestions, setReviewQuestions] = useState<CloneReviewQuestion[] | null>(null);
  const [reviewBoardId, setReviewBoardId] = useState("");

  useEffect(() => {
    if (!cloning) { setCloneStep(0); return; }
    const t1 = setTimeout(() => setCloneStep(1), 2000);
    const t2 = setTimeout(() => setCloneStep(2), 12000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [cloning]);

  function buildTeacherOpinionFromFields() {
    const subjects = parecerSubjects.trim() || sorted.map((m: any) => m.module).join(", ") || "assuntos mapeados no Raio-X";
    const subjectList = subjects.split(",").map((item) => item.trim()).filter(Boolean);
    const questionCount = parecerQuestionCount.trim() || String(total || active.length || 0);
    const difficulty = parecerDifficulty.trim() || (avgDiff ? avgDiff.toFixed(1) : "não informado");
    const alerts = parecerAlerts.trim();
    const freeText = parecerFreeText.trim();
    const contest = analysis.contest_name || "concurso analisado";
    const role = analysis.position_name ? ` para o cargo de ${analysis.position_name}` : "";
    const board = analysis.board_name || "banca organizadora";
    const annulledText = annulledCount > 0
      ? `, sendo que ${annulledCount} ${annulledCount === 1 ? "foi anulada" : "foram anuladas"}`
      : ", sem questões anuladas neste recorte";
    const topicsText = subjectList.length
      ? `${subjectList.length} ${subjectList.length === 1 ? "tópico" : "tópicos"}: ${subjectList.join(", ")}`
      : subjects;

    const paragraphs = [
      `A prova de Informática do concurso ${contest}${role}, organizada pela banca ${board}, teve ${questionCount} ${Number(questionCount) === 1 ? "questão analisada" : "questões analisadas"}${annulledText}.`,
      `A banca ${board} cobrou ${topicsText}.`,
      `Considero que o nível de dificuldade geral tenha sido ${difficulty}/5.`,
      alerts ? `Entre os principais alertas para o aluno, destaco: ${alerts}.` : "",
      freeText ? `Analisando as questões, percebo que ${freeText}` : "Analisando as questões, percebo que o aluno precisa estudar os assuntos cobrados de forma equilibrada, reforçando especialmente os pontos de maior dificuldade indicados no Raio-X.",
    ].filter(Boolean);

    setTeacherNotes(paragraphs.join("\n\n"));
    setAiAdjustmentPrompt("Reescreva o Parecer EstudoTOP em texto natural, profissional e bem formatado, usando parágrafos curtos. Preserve meu estilo direto de escrever, corrija ortografia e gramática, não invente dados e não use formato de formulário. O parecer deve começar falando da prova de Informática do concurso, citar quantidade de questões e anuladas, mencionar a banca e os tópicos cobrados, indicar o nível de dificuldade e concluir com uma análise editorial do professor.");
  }

  async function cloneProva() {
    setCloning(true);
    setCloneStep(0);
    setCloneError(null);
    try {
      const res = await adminFetch(`/api/admin/exam-analyses/${analysis.id}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          similarity_level: cloneSimilarity,
          difficulty_adjustment: parseInt(cloneDifficulty),
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Erro ao gerar clone.");
      setCloneStep(3);
      await new Promise((r) => setTimeout(r, 400));
      setCloneStep(4);
      const qs: CloneReviewQuestion[] = (data.questions || []).map((q: CloneReviewQuestion, i: number) => ({
        ...q,
        tempId: `clone-${Date.now()}-${i}`,
      }));
      if (data.suggested_title) setCloneTitle(data.suggested_title);
      setReviewBoardId(data.exam_board_id || "");
      setReviewQuestions(qs);
      setCloneModal(false);
    } catch (e) {
      setCloneError(e instanceof Error ? e.message : "Erro inesperado ao gerar clone.");
    } finally {
      setCloning(false);
    }
  }

  const topCount = Number(sorted[0]?.question_count || 0);
  const topTiedModules = sorted.filter((m: any) => Number(m.question_count || 0) === topCount && topCount > 0);
  const topPct = total > 0 && topCount > 0 ? Math.round((topCount / total) * 100) : 0;
  const hasIsolatedTop = topTiedModules.length === 1 && topCount > Number(sorted[1]?.question_count || 0);
  const topModule = hasIsolatedTop
    ? sorted[0]?.module || "—"
    : topTiedModules.length > 1
      ? "Empate técnico"
      : sorted[0]?.module || "—";
  const topModuleSub = hasIsolatedTop
    ? `${topPct}% da prova`
    : topTiedModules.length > 1
      ? `${topTiedModules.length} assuntos com ${topPct}% cada`
      : "—";
  const BAR_COLORS = ["#f97316","#0ea5e9","#10b981","#8b5cf6","#f59e0b","#ec4899","#14b8a6","#a855f7","#ef4444","#06b6d4"];

  function topicIcon(name: string): string {
    if (/windows|win/i.test(name)) return "🪟";
    if (/excel|planilha/i.test(name)) return "📊";
    if (/word|texto|documento/i.test(name)) return "📝";
    if (/powerpoint|apresenta/i.test(name)) return "📑";
    if (/internet|navegador|browser|web/i.test(name)) return "🌐";
    if (/email|correio/i.test(name)) return "📧";
    if (/seguran/i.test(name)) return "🛡️";
    if (/hardware|processador|memória|cpu/i.test(name)) return "💻";
    if (/nuvem|cloud/i.test(name)) return "☁️";
    if (/linux/i.test(name)) return "🐧";
    if (/redes|rede|protocolo/i.test(name)) return "🔗";
    return "💡";
  }

  const barData = sorted.map((m: any, i: number) => ({
    name: m.module,
    fullName: m.module,
    pct: total > 0 ? Math.round((m.question_count / total) * 100) : (m.percentage || 0),
    count: m.question_count,
    color: BAR_COLORS[i % BAR_COLORS.length],
  }));

  // Dados reais do donut — baseados nas questões classificadas
  const pieData = sorted.map((m: any, i: number) => ({
    name: m.module,
    value: Number(m.question_count),
    pct: total > 0 ? Math.round((m.question_count / total) * 100) : (m.percentage || 0),
    color: BAR_COLORS[i % BAR_COLORS.length],
  }));

  const insights: string[] = [];
  if (total > 0 && sorted[0]) {
    if (hasIsolatedTop) {
      insights.push(`O assunto "${topModule}" foi o mais cobrado, representando ${topPct}% da prova.`);
    } else if (topTiedModules.length > 1) {
      const tiedNames = topTiedModules.map((m: any) => m.module).join(", ");
      insights.push(`Não houve assunto dominante isolado: ${topTiedModules.length} assuntos ficaram empatados com ${topPct}% da prova cada (${tiedNames}).`);
    }
  }
  if (sorted.length > 1 && hasIsolatedTop) {
    const top2 = sorted.slice(0, 2).map((m: any) => m.module).join(" e ");
    const top2pct = sorted.slice(0, 2).reduce((s: number, m: any) => s + (total > 0 ? Math.round((m.question_count / total) * 100) : 0), 0);
    insights.push(`Juntos, ${top2} concentraram ${top2pct}% das questões.`);
  }
  if (avgDiff > 0) {
    const lvl = avgDiff < 2 ? "abaixo da média" : avgDiff < 3.5 ? "moderado" : "acima da média";
    insights.push(`Nível de dificuldade geral ${lvl} (média ${avgDiff.toFixed(1)}/5).`);
  }
  if (withImage > 0) {
    insights.push(`${withImage} questão${withImage > 1 ? "ões" : ""} utilizou imagem (${Math.round((withImage/total)*100)}% da prova).`);
  }
  if (sorted.length >= 5) {
    insights.push(`A prova apresentou alta diversidade temática com ${sorted.length} assuntos distintos cobrados.`);
  }

  // Perfil dominante derivado do charging_profile mais frequente
  const dominantProfile = (() => {
    const counts: Record<string, number> = {};
    for (const m of modulesSummary) {
      const p = String(m.charging_profile || "").trim();
      if (p) counts[p] = (counts[p] || 0) + (m.question_count || 1);
    }
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : "Não informado";
  })();

  return (
    <div id="raio-x-analysis-content" className="space-y-5">

      {/* HERO HEADER compacto */}
      <div className="overflow-hidden rounded-[1.5rem] border border-white/[0.07] bg-[#0C1E34] shadow-lg shadow-black/20">
        <div className="relative px-5 py-4">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-orange-500/[0.04] via-transparent to-sky-500/[0.02]" />
          <div className="relative flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold leading-tight text-slate-100">{analysis.title}</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {[analysis.contest_name, analysis.position_name, analysis.board_name, analysis.exam_year && String(analysis.exam_year)].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {finalSummary ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.10em] text-emerald-300">
                    <CheckCircle2 size={13} /> Raio-X ativo
                  </span>
                  <a href={`/admin/raio-x-provas/${analysis.id}/relatorio`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-sky-400/30 bg-sky-500/15 px-3 py-1.5 text-sm font-semibold text-sky-300 transition hover:bg-sky-500/20">
                    <Eye size={13} /> Ver relatório final
                  </a>
                </>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-orange-400/25 bg-orange-500/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.10em] text-orange-300">
                  <FileText size={13} /> Aguardando geração inicial
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4 KPI CARDS — uniforme e compactos */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([
          { label: "Questões de Informática", sub: "Total analisado", value: String(total || "—"), accent: "#f97316", large: true },
          { label: "Dificuldade Média", sub: avgDiff < 2 ? "Fácil" : avgDiff < 3.5 ? "Moderada" : "Difícil", value: avgDiff ? `${avgDiff.toFixed(1)} / 5` : "—", accent: "#94a3b8", large: false },
          { label: hasIsolatedTop ? "Assunto Dominante" : "Maior Incidência", sub: topModuleSub, value: topModule, accent: "#94a3b8", large: false },
          { label: "Banca", sub: "Organizadora", value: analysis.board_name || "—", accent: "#94a3b8", large: false },
        ] as const).map((c, i) => (
          <div key={i} className="rounded-xl border border-white/[0.07] bg-white/[0.04] px-4 py-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{c.label}</p>
            <p className={`font-bold leading-tight text-slate-100 ${c.large ? "text-xl" : "text-sm"}`} style={i === 0 ? { color: c.accent } : {}}>
              {c.value}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-600">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* MAPA + DONUT */}
      {sorted.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="rounded-[1.5rem] border border-white/[0.07] bg-[#0C1E34] p-5">
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Mapa da Prova</p>
            <p className="mb-4 text-xs text-slate-600">Distribuição de questões por assunto</p>
            <ResponsiveContainer width="100%" height={Math.max(sorted.length * 46 + 20, 160)}>
              <BarChart layout="vertical" data={barData} margin={{ top: 0, right: 50, bottom: 0, left: 0 }} barCategoryGap="28%">
                <XAxis type="number" domain={[0, Math.max(...barData.map((d: any) => d.pct), 25)]} tickFormatter={(v: number) => `${v}%`} tick={{ fill: "#475569", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={Math.min(Math.max(...barData.map((d: any) => String(d.name || "").length)) * 7 + 12, 230)} tick={{ fill: "#e2e8f0", fontSize: 12, fontWeight: 700 }} axisLine={false} tickLine={false} />
                <Bar dataKey="pct" radius={[0, 6, 6, 0]} maxBarSize={14} label={{ position: "right", fill: "#64748b", fontSize: 11, fontWeight: 700, formatter: (v: unknown) => `${v}%` }}>
                  {barData.map((entry: any, i: number) => <Cell key={i} fill={entry.color} />)}
                </Bar>
                <Tooltip content={({ active, payload }: any) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div style={{ background: "#0B1424", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, padding: "10px 14px" }}>
                      <p style={{ color: "#fff", fontWeight: 800, margin: "0 0 4px" }}>{d.fullName}</p>
                      <p style={{ color: d.color, fontWeight: 900, margin: 0 }}>{d.pct}% · {d.count === 1 ? "questão" : "questões"}</p>
                    </div>
                  );
                }} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Donut — distribuição real dos tópicos */}
          <div className="rounded-[1.7rem] border border-white/[0.07] bg-[#0C1E34] p-5">
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Composição da prova</p>
            <p className="mb-3 text-xs text-slate-600">Distribuição percentual por tópico</p>
            {/* Donut com overlay HTML para o centro — html2canvas captura melhor que SVG text */}
            <div className="relative" style={{ height: 210 }}>
              <ResponsiveContainer width="100%" height={210}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value" animationBegin={0} animationDuration={600} label={false}>
                    {pieData.map((entry: any, i: number) => <Cell key={i} fill={entry.color} stroke="transparent" />)}
                  </Pie>
                  <Tooltip content={({ active, payload }: any) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div style={{ background: "#0B1424", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, padding: "9px 14px" }}>
                        <p style={{ color: "#fff", fontWeight: 800, margin: "0 0 3px", fontSize: 13 }}>{d.name}</p>
                        <p style={{ color: d.color, fontWeight: 900, margin: 0, fontSize: 16 }}>{d.pct}%</p>
                        <p style={{ color: "#64748b", margin: 0, fontSize: 11 }}>{d.value === 1 ? "questão" : "questões"}</p>
                      </div>
                    );
                  }} />
                </PieChart>
              </ResponsiveContainer>
              {/* Centro como HTML — renderiza corretamente no html2canvas */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-2xl font-black leading-none text-white">{total}</p>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500">questões</p>
              </div>
            </div>
            {/* Legenda */}
            <div className="mt-3 space-y-1.5">
              {pieData.map((d: any) => (
                <div key={d.name} className="flex items-center gap-2">
                  <div style={{ width: 9, height: 9, borderRadius: 3, background: d.color, flexShrink: 0 }} />
                  <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-400">{d.name}</span>
                  <span className="text-[11px] font-black text-white">{d.pct}%</span>
                  <span className="text-[11px] text-slate-600">{d.value}q</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* O QUE FOI COBRADO */}
      {sorted.length > 0 && (
        <div className="overflow-hidden rounded-[1.7rem] border border-white/[0.07] bg-[#0C1E34]">
          <div className="border-b border-white/[0.06] px-6 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">O que foi cobrado em cada assunto</p>
            <p className="text-xs text-slate-600">Assunto, tópicos específicos, perfil e dificuldade</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.05] bg-white/[0.02]">
                {["Assunto e Subassunto", "Questões", "O que foi cobrado", "Perfil", "Dificuldade"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-[0.2em] text-slate-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {sorted.map((m: any, i: number) => {
                const pct = total > 0 ? Math.round((m.question_count / total) * 100) : (m.percentage || 0);
                const color = BAR_COLORS[i % BAR_COLORS.length];
                // Tags das questões: prefere knowledge_points direto (via effectiveModules),
                // fallback para subtopics (via modulesSummary salvo no banco)
                const allPoints: string[] = (
                  m.knowledge_points?.length
                    ? m.knowledge_points
                    : (m.subtopics || []).flatMap((s: any) => s.knowledge_points || [])
                ).filter(Boolean).slice(0, 6);
                const diff = Number(m.average_difficulty || 0);
                const profile = m.charging_profile || "—";
                const profileColor = profile.toLowerCase().includes("prática") || profile.toLowerCase().includes("pratica")
                  ? "text-emerald-300 border-emerald-400/25 bg-emerald-500/10"
                  : profile.toLowerCase().includes("conceitual")
                    ? "text-sky-300 border-sky-400/25 bg-sky-500/10"
                    : profile.toLowerCase().includes("interpret")
                      ? "text-amber-300 border-amber-400/25 bg-amber-500/10"
                      : "text-slate-400 border-white/[0.08] bg-white/[0.04]";
                return (
                  <tr key={m.module} className="transition hover:bg-white/[0.025]">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{topicIcon(m.module)}</span>
                        <div>
                          <p className="font-black text-white">{m.module}</p>
                          {(m.subtopics || []).slice(0, 1).map((s: any) => (
                            <p key={s.name} className="text-[11px] text-slate-500">{s.name}</p>
                          ))}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-black text-white">{m.question_count} {m.question_count === 1 ? "questão" : "questões"}</p>
                      <div className="mt-1.5 h-1.5 w-16 overflow-hidden rounded-full bg-white/[0.05]">
                        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: color }} />
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">{pct}%</p>
                    </td>
                    <td className="px-4 py-4 max-w-[240px]">
                      {allPoints.length > 0 ? (
                        <p className="text-xs leading-5 text-slate-300">
                          {allPoints.map((pt) => pt.charAt(0).toUpperCase() + pt.slice(1)).join(", ")}
                        </p>
                      ) : <span className="text-xs text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${profileColor}`}>{profile}</span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex gap-0.5">
                        {[1,2,3,4,5].map((s) => (
                          <div key={s} style={{ width: 14, height: 14, borderRadius: 3, background: s <= Math.round(diff) ? "#f97316" : "rgba(255,255,255,0.08)" }} />
                        ))}
                      </div>
                      {diff > 0 && <p className="mt-1 text-[10px] text-slate-600">{diff.toFixed(1)}/5</p>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* INSIGHTS + CONFIG */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[1.7rem] border border-white/[0.07] bg-[#0C1E34] p-5">
          <div className="mb-4 flex items-center gap-2">
            <div className="rounded-xl border border-violet-400/20 bg-violet-500/10 p-2 text-violet-300"><Sparkles size={14} /></div>
            <p className="text-sm font-black text-white">Insights da IA</p>
          </div>
          <div className="space-y-3">
            {insights.slice(0, 5).map((insight, i) => (
              <div key={i} className="flex items-start gap-3 rounded-2xl border border-white/[0.05] bg-white/[0.025] px-4 py-3">
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: BAR_COLORS[i % BAR_COLORS.length], flexShrink: 0, marginTop: 6 }} />
                <p className="text-xs leading-5 text-slate-300">{insight}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-[1.7rem] border border-white/[0.06] bg-[#0C1E34]">
          <button type="button" onClick={() => setShowConfig((v) => !v)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-white/[0.03]">
            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-orange-400/20 bg-orange-500/10 p-2 text-orange-300"><Bot size={14} /></div>
              <p className="text-sm font-black text-white">Parecer EstudoTOP</p>
            </div>
            <ChevronDown size={15} className={`text-slate-500 transition-transform ${showConfig ? "rotate-180" : ""}`} />
          </button>
          {showConfig && (
            <div className="border-t border-white/[0.06] p-5">
              <div className="mb-4 rounded-2xl border border-orange-400/20 bg-orange-500/[0.06] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-300">Parecer EstudoTOP obrigatório</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">Preencha os campos abaixo. O sistema monta um texto-base em parágrafos. A IA transforma isso em um parecer natural, profissional, corrigindo gramática e preservando seu estilo.</p>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="grid gap-3 sm:grid-cols-3 lg:col-span-2">
                  <label className="block">
                    <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.12em] text-orange-300">Número de questões</span>
                    <input value={parecerQuestionCount} onChange={(e) => setParecerQuestionCount(e.target.value)} className="h-11 w-full rounded-2xl border border-white/[0.06] bg-[#0D1B2A] px-4 text-sm font-bold text-white outline-none focus:border-orange-300/40" />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.12em] text-orange-300">Assuntos cobrados</span>
                    <input value={parecerSubjects} onChange={(e) => setParecerSubjects(e.target.value)} className="h-11 w-full rounded-2xl border border-white/[0.06] bg-[#0D1B2A] px-4 text-sm font-bold text-white outline-none focus:border-orange-300/40" />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.12em] text-orange-300">Dificuldade geral 1 a 5</span>
                    <input value={parecerDifficulty} onChange={(e) => setParecerDifficulty(e.target.value)} className="h-11 w-full rounded-2xl border border-white/[0.06] bg-[#0D1B2A] px-4 text-sm font-bold text-white outline-none focus:border-orange-300/40" />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.12em] text-amber-300">Alertas — pontos de atenção (auto preenchido das anotações das questões)</span>
                    <textarea value={parecerAlerts} onChange={(e) => setParecerAlerts(e.target.value)} placeholder="Ex.: cuidado com Excel, comandos do Windows, pegadinhas da banca..." rows={4} className="w-full resize-y rounded-2xl border border-white/[0.06] bg-[#0D1B2A] px-4 py-3 text-sm font-bold leading-6 text-white outline-none placeholder:text-slate-700 focus:border-amber-300/40" />
                  </label>
                </div>
                <div>
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-orange-300">Texto livre do professor</p>
                  <textarea value={parecerFreeText} onChange={(e) => setParecerFreeText(e.target.value)} placeholder="Escreva aqui seu parecer, observações, alerta pedagógico ou recomendação principal..." className="min-h-[140px] w-full resize-y rounded-2xl border border-white/[0.06] bg-[#0D1B2A] px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-700 focus:border-orange-300/40" />
                  <button type="button" onClick={buildTeacherOpinionFromFields} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-orange-400/30 bg-orange-500/15 px-4 py-2.5 text-sm font-black text-orange-200 transition hover:bg-orange-500/20">
                    <FileText size={15} /> Montar parecer-base
                  </button>
                </div>
                <div>
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-sky-300">Texto-base / parecer gerado</p>
                  <textarea value={teacherNotes} onChange={(e) => setTeacherNotes(e.target.value)} placeholder="Clique em Montar parecer-base, revise o texto e depois gere a versão final com IA..." className="min-h-[140px] w-full resize-y rounded-2xl border border-white/[0.06] bg-[#0D1B2A] px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-700 focus:border-sky-300/40" />
                  <textarea value={aiAdjustmentPrompt} onChange={(e) => setAiAdjustmentPrompt(e.target.value)} placeholder="Comando para a IA: corrija ortografia, preserve meu estilo, deixe profissional..." className="mt-3 min-h-[70px] w-full resize-y rounded-2xl border border-white/[0.06] bg-[#0D1B2A] px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-700 focus:border-sky-300/40" />
                  <button type="button" onClick={onConsolidate} disabled={consolidatingSummary || !teacherNotes.trim()} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-400 to-orange-400 px-4 py-2.5 text-sm font-black text-slate-950 shadow-lg disabled:cursor-not-allowed disabled:opacity-50">
                    {consolidatingSummary ? <Loader2 className="animate-spin" size={15} /> : <Sparkles size={15} />} Gerar parecer final com IA
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* RELATÓRIO FINAL — fluxo único */}
      <div className={`overflow-hidden rounded-[1.7rem] border ${finalSummary ? "border-emerald-400/20 bg-gradient-to-br from-emerald-500/[0.055] via-[#0C1728] to-[#0C1728]" : "border-orange-400/20 bg-gradient-to-br from-orange-500/[0.07] via-[#0C1728] to-[#0C1728]"}`}>
        <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className={`rounded-2xl border p-3 ${finalSummary ? "border-emerald-400/25 bg-emerald-500/15 text-emerald-300" : "border-orange-400/25 bg-orange-500/15 text-orange-300"}`}>
              {finalSummary ? <CheckCircle2 size={18} /> : <FileText size={18} />}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-white">Relatório final do Raio-X</span>
                {finalSummary
                  ? <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">✓ Gerado uma vez</span>
                  : <span className="rounded-full border border-orange-400/25 bg-orange-500/10 px-2.5 py-0.5 text-[11px] font-bold text-orange-300">Aguardando geração inicial</span>
                }
              </div>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
                {finalSummary
                  ? "A partir de agora, alterações salvas nas questões, classificações e no Parecer EstudoTOP são refletidas automaticamente no Raio-X e no relatório final. Não é necessário regenerar."
                  : "Gere a primeira versão uma única vez. Depois disso, o relatório passa a acompanhar automaticamente os dados salvos da análise."}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {finalSummary ? (
              <a href={`/admin/raio-x-provas/${analysis.id}/relatorio`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-sky-400/35 bg-sky-500/20 px-4 py-2 text-sm font-bold text-sky-200 transition hover:bg-sky-500/25">
                <Eye size={14} /> Abrir relatório final
              </a>
            ) : (
              <button type="button" onClick={onGenerateReport} className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white shadow-md shadow-orange-500/20 transition hover:bg-orange-400">
                <FileText size={14} /> Gerar Raio-X inicial
              </button>
            )}
          </div>
        </div>
      </div>

      {/* CLONE DE PROVA */}
      {cloneResult ? (
        <div className="overflow-hidden rounded-[1.7rem] border border-violet-400/20 bg-gradient-to-br from-violet-500/[0.055] via-[#0C1728] to-[#0C1728]">
          <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl border border-violet-400/25 bg-violet-500/15 p-3 text-violet-300">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <span className="text-sm font-bold text-white">Clone criado com sucesso!</span>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  {cloneResult.question_count} questões geradas pela IA. Simulado em rascunho — revise antes de publicar.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Link
                href={`/simulados/${cloneResult.simulado_id}`}
                className="inline-flex items-center gap-2 rounded-xl border border-violet-400/35 bg-violet-500/20 px-4 py-2 text-sm font-bold text-violet-200 transition hover:bg-violet-500/25"
              >
                <Eye size={14} /> Ver simulado clone
              </Link>
              <button
                type="button"
                onClick={() => setCloneResult(null)}
                className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-sm font-bold text-slate-400 transition hover:text-white"
              >
                Criar outro
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[1.7rem] border border-violet-400/15 bg-[#0C1E34]">
          <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-3 text-violet-300">
                <CopyPlus size={18} />
              </div>
              <div>
                <span className="text-sm font-bold text-white">Clone desta prova</span>
                <p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">
                  Gere um simulado em rascunho com questões inéditas baseadas nesta prova. A IA mantém o estilo da banca, os assuntos e o formato — mas aborda tudo de ângulo completamente diferente.
                </p>
              </div>
            </div>
            <div className="shrink-0">
              <button
                type="button"
                onClick={() => {
                  const parts: string[] = ["Simulado - Clone"];
                  if (analysis.contest_name) parts.push(`(${analysis.contest_name})`);
                  if (analysis.position_name) parts.push(analysis.position_name);
                  if (analysis.exam_year) parts.push(String(analysis.exam_year));
                  setCloneTitle(parts.join(" - "));
                  setCloneModal(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white shadow-md shadow-violet-600/20 transition hover:bg-violet-500"
              >
                <CopyPlus size={14} /> Criar clone desta prova
              </button>
            </div>
          </div>
          {cloneError && (
            <div className="border-t border-white/[0.06] px-6 py-3">
              <p className="text-xs font-bold text-red-400">{cloneError}</p>
            </div>
          )}
        </div>
      )}

      {localClones.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/30">Simulados clonados desta prova</p>
          {localClones.map((clone) => (
            <div key={clone.id} className="flex flex-col gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="shrink-0 rounded-xl border border-violet-400/25 bg-violet-500/10 p-2 text-violet-300">
                  <CopyPlus size={14} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white/80">{clone.title}</p>
                  <p className="text-xs text-white/30">{clone.question_count} questões · {new Date(clone.created_at).toLocaleDateString("pt-BR")}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ${clone.status === "published" ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : clone.status === "archived" ? "border border-white/[0.08] bg-white/[0.04] text-white/30" : "border border-amber-500/30 bg-amber-500/10 text-amber-300"}`}>
                  {clone.status === "published" ? "Publicado" : clone.status === "archived" ? "Arquivado" : "Rascunho"}
                </span>
                <Link href={`/simulados/${clone.id}`} className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-white/50 transition hover:bg-white/[0.08] hover:text-white/80">
                  <Eye size={12} /> Ver
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {cloneModal && !cloning && (
        <CloneProvaModal
          analysis={analysis}
          similarity={cloneSimilarity}
          difficulty={cloneDifficulty}
          title={cloneTitle}
          onChangeSimilarity={setCloneSimilarity}
          onChangeDifficulty={setCloneDifficulty}
          onChangeTitle={setCloneTitle}
          onClose={() => setCloneModal(false)}
          onSubmit={() => { setCloneModal(false); cloneProva(); }}
        />
      )}
      {cloning && <CloneProgressModal step={cloneStep} />}
      {reviewQuestions && (
        <CloneReviewPanel
          initialQuestions={reviewQuestions}
          initialTitle={cloneTitle}
          analysisId={analysis.id}
          examBoardId={reviewBoardId}
          boardName={analysis.board_name || "Estudo TOP"}
          subjects={subjects}
          onClose={() => setReviewQuestions(null)}
          onApproved={(simuladoId, simuladoTitle, count) => {
            setReviewQuestions(null);
            setCloneResult({ simulado_id: simuladoId, simulado_title: simuladoTitle, question_count: count });
            setLocalClones((prev) => [{ id: simuladoId, title: simuladoTitle, status: "draft", question_count: count, created_at: new Date().toISOString() }, ...prev]);
          }}
        />
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[1.4rem] border border-white/[0.08] bg-white/[0.035] p-4">
      <p className="text-2xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
    </div>
  );
}

function ReviewHeader({ stats, currentIndex, total }: { stats: { active: number; pending: number; reviewed: number; withImage: number; annulled: number }; currentIndex: number; total: number }) {
  const progress = total ? Math.round(((currentIndex + 1) / total) * 100) : 0;
  return (
    <section className="rounded-[2rem] border border-white/[0.08] bg-[#0C1E34]/90 p-5 shadow-2xl shadow-black/25">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-black text-white">Revisão questão por questão</h2>
          <p className="mt-1 text-sm text-slate-400">Revise a diagramação, confirme gabarito, ajuste assunto/tópico e registre seu parecer antes do Raio-X final.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
          <Badge label="Ativas" value={stats.active} />
          <Badge label="Pendentes" value={stats.pending} />
          <Badge label="Revisadas" value={stats.reviewed} />
          <Badge label="Imagem" value={stats.withImage} />
          <Badge label="Anuladas" value={stats.annulled} />
        </div>
      </div>
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
          <span>Questão {total ? currentIndex + 1 : 0} de {total}</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-sky-300 transition-all" style={{ width: `${progress}%` }} /></div>
      </div>
    </section>
  );
}

function Badge({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-center"><p className="text-lg font-black text-white">{value}</p><p className="mt-0.5 font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p></div>;
}

function QuestionNavigator({ questions, currentIndex, onSelect }: { questions: RaioXQuestion[]; currentIndex: number; onSelect: (index: number) => void }) {
  return (
    <div className="flex flex-wrap gap-2 rounded-[1.5rem] border border-white/[0.08] bg-[#0C1E34]/80 p-3">
      {questions.map((question, index) => {
        const active = index === currentIndex;
        const tone = question.is_annulled ? "border-amber-300/40 bg-amber-400/15 text-amber-100" : question.has_image ? "border-sky-300/35 bg-sky-400/15 text-sky-100" : ["confirmed", "pending_review", "published"].includes(question.status) ? "border-emerald-300/35 bg-emerald-400/15 text-emerald-100" : "border-white/[0.08] bg-white/[0.04] text-slate-300";
        return (
          <button key={question.id} type="button" onClick={() => onSelect(index)} className={`h-10 min-w-10 rounded-xl border px-3 text-sm font-black transition ${active ? "ring-2 ring-orange-300/60" : ""} ${tone}`}>
            {index + 1}
          </button>
        );
      })}
    </div>
  );
}

function QuestionCard({ question, selected, onToggleSelected, onChange, onDiscard, onPublish, onVariations, subjects, disciplines }: {
  question: RaioXQuestion;
  selected: boolean;
  onToggleSelected: () => void;
  onChange: (changes: Partial<RaioXQuestion>) => void;
  onDiscard: () => void;
  onPublish: () => void;
  onVariations: () => void;
  subjects: SubjectOption[];
  disciplines: DisciplineOption[];
}) {
  const [editingStatement, setEditingStatement] = useState(false);
  const [editingAltIndex, setEditingAltIndex] = useState<number | null>(null);
  const [editingMeta, setEditingMeta] = useState(false);
  const availableSubjects = subjects.filter((s) => !question.discipline_id || s.discipline_id === question.discipline_id);
  const selectedSubjectIds = question.subject_ids?.length ? question.subject_ids : (question.subject_id ? [question.subject_id] : []);
  const questionYear = question.year || "";
  const requiresImage = question.has_image || question.visual_analysis_status === "review_required" || question.visual_analysis_status === "pending";
  const disciplineName = disciplines.find((d) => d.id === question.discipline_id)?.name || null;

  function updateAnswer(label: string) {
    onChange({
      answer_key: label,
      is_annulled: false,
      alternatives: (question.alternatives || []).map((alt) => ({ ...alt, is_correct: alt.label === label })),
    });
  }

  return (
    <div className="relative isolate">
      {question.is_annulled && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center overflow-hidden rounded-[2rem]">
          <span className="select-none whitespace-nowrap text-[5rem] font-black uppercase leading-none tracking-[0.25em] text-red-500/20 rotate-[-25deg]">ANULADA</span>
        </div>
      )}
      {requiresImage ? (
        <>
          <div className="pointer-events-none absolute -inset-[10px] -z-10 rounded-[2.5rem] bg-gradient-to-b from-sky-400/25 via-sky-400/10 to-transparent blur-[32px]" />
          <div className="pointer-events-none absolute -inset-[2px] -z-10 rounded-[2.25rem] bg-gradient-to-b from-sky-300/40 via-sky-400/10 to-transparent blur-[8px]" />
        </>
      ) : selected ? (
        <div className="pointer-events-none absolute -inset-[3px] -z-10 rounded-[2.25rem] bg-gradient-to-b from-orange-400/[0.12] via-white/[0.025] to-transparent blur-[14px]" />
      ) : (
        <div className="pointer-events-none absolute -inset-[3px] -z-10 rounded-[2.25rem] bg-gradient-to-b from-orange-400/[0.07] via-white/[0.025] to-transparent blur-[14px]" />
      )}
    <article className={`overflow-hidden rounded-[2rem] border backdrop-blur-sm shadow-xl shadow-black/30 transition-all duration-300 ${
      selected ? "border-orange-400/40 bg-white/[0.04] ring-1 ring-orange-400/20 hover:-translate-y-0.5"
      : requiresImage ? "border-sky-400/25 bg-white/[0.03]"
      : "border-white/[0.07] bg-white/[0.03] hover:-translate-y-0.5 hover:border-white/[0.12]"
    }`}>

      {/* Barra de cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] bg-black/20 px-6 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs font-black text-slate-300">
            Questão {question.original_number || "?"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {requiresImage && (
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/25 bg-sky-400/10 px-3 py-1 text-xs font-semibold text-sky-300">
              <ImageIcon size={11} /> Imagem
            </span>
          )}
          {question.visual_analysis_status === "applied" && (
            <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">Visual aplicada</span>
          )}
          {question.is_annulled && (
            <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-300">Anulada</span>
          )}
          {question.is_duplicate && question.duplicate_type === "database" && (
            <span className="rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-300">
              Já existe no banco{question.duplicate_of?.similarity ? ` (${Math.round(question.duplicate_of.similarity * 100)}%)` : ""}
            </span>
          )}
          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusClass(question.status)}`}>{statusLabel(question.status)}</span>
        </div>
      </div>

      {/* Layout de dois painéis */}
      <div className="grid lg:grid-cols-[1fr_370px]">

        {/* ── PAINEL ESQUERDO ── */}
        <div className="space-y-8 border-r border-white/[0.06] px-6 py-7">

          {/* Bloco 01 — Enunciado */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-500/20 text-[10px] font-black text-orange-300 shadow-[0_0_14px_rgba(255,138,0,0.25)]">01</span>
                <h3 className="text-[10px] font-black uppercase tracking-[0.12em] text-orange-300">Enunciado</h3>
              </div>
              <button type="button" onClick={() => setEditingStatement((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-slate-400 transition hover:border-orange-400/30 hover:text-orange-300">
                <Edit3 size={12} /> {editingStatement ? "Concluir" : "Editar"}
              </button>
            </div>
            {editingStatement ? (
              <RichTextEditor
                value={insertListItemBreaks(question.statement || "")}
                onChange={(value) => onChange({ statement: value })}
                placeholder="Enunciado da questão"
                minRows={4}
                dark
                className="w-full rounded-2xl border border-white/[0.08] bg-[#0D1B2A] px-5 py-4 text-sm leading-7 text-slate-100 outline-none focus:ring-2 focus:ring-orange-400/20"
              />
            ) : (
              <HtmlWithImageMarkers
                html={question.statement || "<span style='color:#475569;font-style:italic'>Sem enunciado — clique em Editar para adicionar.</span>"}
                className="cursor-text rounded-2xl border border-white/[0.06] bg-[#0D1B2A]/60 px-5 py-4 text-sm leading-7 text-slate-200"
                onClick={() => setEditingStatement(true)}
              />
            )}
          </section>

          {/* Bloco 03 — Alternativas */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-500/20 text-[10px] font-black text-sky-300 shadow-[0_0_14px_rgba(46,167,255,0.20)]">03</span>
              <h3 className="text-[10px] font-black uppercase tracking-[0.12em] text-sky-300">Alternativas</h3>
            </div>

            {question.question_type === "true_false" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {(question.alternatives || [])
                  .slice()
                  .sort((a, b) => {
                    const aIsCerto = ["C", "c", "certo"].includes((a.label || a.text || "").toLowerCase().trim()) || (a.text || "").toLowerCase().includes("certo");
                    return aIsCerto ? -1 : 1;
                  })
                  .map((alt, index) => {
                    const isCerto = ["C", "c", "certo"].includes((alt.label || "").toLowerCase().trim()) || (alt.text || "").toLowerCase().includes("certo");
                    const isCorrect = alt.label === question.answer_key && !question.is_annulled;
                    const isWrongAnswer = !isCerto && isCorrect;
                    return (
                      <button key={`${alt.label}-${index}`} type="button" onClick={() => updateAnswer(alt.label)}
                        className={`flex items-center gap-4 rounded-2xl border-2 px-5 py-4 text-left transition ${
                          isWrongAnswer ? "border-red-500/40 bg-red-500/10 shadow-[0_0_12px_rgba(239,68,68,0.12)]"
                          : isCorrect ? "border-emerald-500/40 bg-emerald-500/10 shadow-[0_0_12px_rgba(16,185,129,0.12)]"
                          : isCerto ? "border-white/[0.08] bg-white/[0.02] hover:border-emerald-500/30 hover:bg-emerald-500/[0.05]"
                          : "border-white/[0.08] bg-white/[0.02] hover:border-red-500/30 hover:bg-red-500/[0.05]"
                        }`}>
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 text-lg font-normal leading-none [font-family:'Segoe_UI_Emoji','Apple_Color_Emoji','Noto_Color_Emoji',sans-serif] ${
                          isWrongAnswer ? "border-red-500 bg-red-500/20"
                          : isCorrect ? "border-emerald-500 bg-emerald-500/20"
                          : "border-white/[0.15] bg-white/[0.05]"
                        }`}>
                          {isCorrect ? OWL_MARK : (isCerto ? "C" : "E")}
                        </span>
                        <div className="flex flex-1 items-center justify-between gap-2">
                          <span className={`text-sm font-bold ${isWrongAnswer ? "text-red-200" : isCorrect ? "text-emerald-200" : "text-slate-300"}`}>
                            {isCerto ? "Certo" : "Errado"}
                          </span>
                          {isCorrect && (
                            <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${isWrongAnswer ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>
                              Gabarito
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
              </div>
            ) : (
              <div className="space-y-2">
                {(question.alternatives || []).map((alt, index) => {
                  const isCorrect = alt.label === question.answer_key && !question.is_annulled;
                  const isEditing = editingAltIndex === index;
                  const displayLabel = alt.label.length > 1 ? alt.label.charAt(0) : alt.label;
                  return (
                    <div key={`${alt.label}-${index}`} className={`overflow-hidden rounded-2xl border transition ${
                      isCorrect ? "border-emerald-500/30 bg-emerald-500/[0.06] shadow-[0_0_10px_rgba(16,185,129,0.08)]"
                      : isEditing ? "border-orange-400/30 bg-orange-500/[0.04]"
                      : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.10]"
                    }`}>
                      <div className="flex items-center gap-3 px-4 py-3">
                        <button type="button" onClick={() => updateAnswer(alt.label)} title="Marcar como gabarito"
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black transition ${
                            isCorrect ? "bg-emerald-500 text-white shadow-[0_0_0_3px_rgba(16,185,129,0.20)]"
                            : "border border-white/[0.15] bg-transparent text-slate-400 hover:border-emerald-400/50 hover:bg-emerald-400/10 hover:text-emerald-300"
                          }`}>
                          {displayLabel}
                        </button>
                        <button type="button" onClick={() => setEditingAltIndex(isEditing ? null : index)} className="min-w-0 flex-1 text-left">
                          <HtmlWithImageMarkers
                            html={alt.text || `<span style='color:#475569;font-style:italic'>Alternativa ${displayLabel} — clique para editar</span>`}
                            className={`text-sm leading-5 ${isCorrect ? "font-semibold text-emerald-200" : "text-slate-300"}`}
                          />
                        </button>
                        {isCorrect && !question.is_annulled && (
                          <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1">
                            <CheckCircle2 size={12} className="text-emerald-400" />
                            <span className="text-[11px] font-bold text-emerald-300">Resposta correta</span>
                          </div>
                        )}
                      </div>
                      {isEditing && (
                        <div className="border-t border-white/[0.06] px-4 pb-3 pt-2">
                          <RichTextEditor
                            value={alt.text}
                            onChange={(value) => onChange({ alternatives: (question.alternatives || []).map((item, i) => i === index ? { ...item, text: value } : item) })}
                            placeholder={`Texto da alternativa ${displayLabel}`}
                            minRows={2}
                            compact
                            dark
                            className="w-full rounded-xl border border-white/[0.08] bg-[#0D1B2A] px-4 py-2.5 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-orange-400/15"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
                <p className="pl-1 pt-1 text-[11px] text-white/20">Clique na letra para marcar gabarito · clique no texto para editar</p>
              </div>
            )}

            {question.is_annulled && (
              <div className="mt-2 flex items-center gap-2 rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] px-4 py-2.5">
                <AlertTriangle size={14} className="text-amber-400" />
                <span className="text-sm font-bold text-amber-300">Questão anulada — sem gabarito oficial</span>
              </div>
            )}
          </section>

          {/* Bloco 05 — Parecer do Professor */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-500/20 text-[10px] font-black text-orange-300 shadow-[0_0_14px_rgba(255,138,0,0.25)]">05</span>
              <h3 className="text-[10px] font-black uppercase tracking-[0.12em] text-orange-300">Comentário do Professor</h3>
            </div>
            <RichTextEditor
              value={question.teacher_opinion || ""}
              onChange={(value) => onChange({ teacher_opinion: value })}
              placeholder="Registre sua leitura: pegadinhas, padrão da banca, importância para revisão etc."
              minRows={3}
              dark
              className="w-full rounded-2xl border border-white/[0.08] bg-[#0D1B2A]/60 px-5 py-4 text-sm leading-6 text-slate-200 outline-none focus:ring-2 focus:ring-orange-400/20"
            />
          </section>
        </div>

        {/* ── PAINEL DIREITO ── */}
        <div className="space-y-6 px-5 py-7">

          {/* Bloco 02 — Metadados */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-500/20 text-[10px] font-black text-slate-300 shadow-[0_0_10px_rgba(148,163,184,0.15)]">02</span>
                <h3 className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Metadados</h3>
              </div>
              <button type="button" onClick={() => setEditingMeta((v) => !v)} className="text-[11px] font-semibold text-slate-600 transition hover:text-slate-300">
                {editingMeta ? "Concluir" : "Editar"}
              </button>
            </div>
            {editingMeta ? (
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Ano", children: <input type="number" min="1990" max="2100" value={String(questionYear)} onChange={(e) => onChange({ year: /^\d{0,4}$/.test(e.target.value) && e.target.value ? Number(e.target.value) : null })} className="h-8 w-full rounded-lg border border-white/[0.08] bg-[#0D1B2A] px-2 text-xs font-semibold text-slate-300 outline-none" /> },
                  { label: "Banca", children: <input value={question.board_name || ""} onChange={(e) => onChange({ board_name: e.target.value })} className="h-8 w-full rounded-lg border border-white/[0.08] bg-[#0D1B2A] px-2 text-xs font-semibold text-slate-300 outline-none" /> },
                  { label: "Dificuldade", children: <select value={question.difficulty_level || ""} onChange={(e) => onChange({ difficulty_level: e.target.value ? Number(e.target.value) : null })} className="h-8 w-full rounded-lg border border-white/[0.08] bg-[#0D1B2A] px-2 text-xs font-semibold text-slate-300 outline-none"><option value="">—</option>{[1,2,3,4,5].map((n) => <option key={n} value={n}>{n} — {difficultyLabel(n)}</option>)}</select> },
                  { label: "Tipo", children: <select value={question.question_type} onChange={(e) => onChange({ question_type: e.target.value as RaioXQuestion["question_type"] })} className="h-8 w-full rounded-lg border border-white/[0.08] bg-[#0D1B2A] px-2 text-xs font-semibold text-slate-300 outline-none"><option value="true_false">Certo/Errado</option><option value="multiple_choice">Múltipla escolha</option></select> },
                ].map((item) => (
                  <label key={item.label} className="block">
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">{item.label}</span>
                    {item.children}
                  </label>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Ano", value: String(questionYear || "—") },
                  { label: "Banca", value: question.board_name || "—" },
                  ...(disciplineName ? [{ label: "Disciplina", value: disciplineName }] : []),
                  { label: "Tipo", value: question.question_type === "true_false" ? "Certo/Errado" : "Múltipla escolha" },
                  { label: "Status", value: statusLabel(question.status) },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">{item.label}</p>
                    <p className="mt-1 text-sm font-semibold leading-tight text-slate-200">{item.value}</p>
                  </div>
                ))}
                {/* Dificuldade com estrelinhas editáveis */}
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5">
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">Dificuldade</p>
                  <div className="flex gap-1">
                    {[1,2,3,4,5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => onChange({ difficulty_level: question.difficulty_level === star ? null : star })}
                        title={`${star} — ${difficultyLabel(star)}`}
                        className="text-lg leading-none transition-transform hover:scale-125 active:scale-95"
                        style={{ color: (question.difficulty_level || 0) >= star ? "#f97316" : "rgba(255,255,255,0.15)" }}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-600">
                    {question.difficulty_level ? difficultyLabel(question.difficulty_level) : "Não definida"}
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* Bloco 04 — Classificação da IA */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500/20 text-[10px] font-black text-violet-300 shadow-[0_0_14px_rgba(139,92,246,0.25)]">04</span>
              <h3 className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-300">Classificação da IA</h3>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
                <SubjectMultiSelect
                  label="Assunto no banco"
                  subjects={availableSubjects}
                  selectedIds={selectedSubjectIds}
                  onChange={(ids) => onChange({ subject_ids: ids, subject_id: ids[0] || null })}
                  dark
                  disciplineId={question.discipline_id || null}
                  allowCreate={false}
                />
              </div>
              {[
                { key: "module_name" as const, label: "Assunto principal", value: question.module_name },
                { key: "subtopic_name" as const, label: "Tópico de cobrança", value: question.subtopic_name },
                { key: "charging_profile" as const, label: "Perfil", value: question.charging_profile },
              ].map((item) => (
                <div key={item.key} className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">{item.label}</p>
                  <p className="mb-1 text-sm font-semibold text-slate-200">{item.value || "—"}</p>
                  <input value={item.value || ""} onChange={(e) => onChange({ [item.key]: e.target.value })} className="w-full rounded border-0 bg-transparent text-[11px] text-slate-600 outline-none focus:text-slate-300" placeholder="Editar..." />
                </div>
              ))}
            </div>

            {Boolean(question.knowledge_points?.length) && (
              <div className="mt-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">Conhecimentos correlatos</p>
                <div className="flex flex-wrap gap-1.5">
                  {question.knowledge_points!.map((point) => (
                    <span key={point} className="rounded-full border border-white/[0.08] bg-white/[0.035] px-2.5 py-1 text-xs font-semibold text-slate-400">{point}</span>
                  ))}
                </div>
              </div>
            )}

            {question.difficulty_reason && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-orange-400/15 bg-orange-400/[0.05] px-3 py-2.5">
                <AlertTriangle size={12} className="mt-0.5 shrink-0 text-orange-400" />
                <p className="text-xs leading-5 text-slate-400">{question.difficulty_reason}</p>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* ── BARRA DE AÇÕES (rodapé fixo do card) ── */}
      {(() => {
        const alreadySent = question.status === "pending_review" || question.status === "published";
        const isDatabaseDuplicate = Boolean(question.is_duplicate && question.duplicate_type === "database");
        if (alreadySent) {
          return (
            <div className="flex items-center justify-between border-t border-white/[0.06] bg-[#080F1A]/95 px-5 py-3.5 backdrop-blur">
              <button type="button" onClick={onDiscard} className="flex items-center gap-2 rounded-xl border border-red-400/20 bg-red-500/[0.07] px-3 py-1.5 text-xs font-bold text-red-400 transition hover:bg-red-500/15">
                <Trash2 size={13} /> Descartar
              </button>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onChange({ is_annulled: !question.is_annulled, ...(question.is_annulled ? {} : { answer_key: null }) })}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                    question.is_annulled
                      ? "border-emerald-400/20 bg-emerald-500/[0.07] text-emerald-300 hover:bg-emerald-500/15"
                      : "border-amber-400/20 bg-amber-500/[0.07] text-amber-300 hover:bg-amber-500/15"
                  }`}
                >
                  {question.is_annulled ? <><CheckCircle2 size={13} /> Desanular</> : <><Ban size={13} /> Anular</>}
                </button>
                <button type="button" onClick={onVariations} className="flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-500/[0.07] px-3 py-1.5 text-xs font-bold text-amber-300 transition hover:bg-amber-500/15">
                  <Sparkles size={13} /> Variações
                </button>
                <div className={`flex items-center gap-2 rounded-xl border px-4 py-1.5 text-xs font-black ${question.status === "published" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300" : "border-orange-400/30 bg-orange-500/10 text-orange-300"}`}>
                  <CheckCircle2 size={13} />
                  {question.status === "published" ? "Publicada no banco" : "Em fila de revisão"}
                </div>
              </div>
            </div>
          );
        }
        if (isDatabaseDuplicate) {
          return (
            <div className="flex flex-col gap-3 border-t border-red-400/20 bg-red-500/[0.08] px-5 py-4 backdrop-blur md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-red-300/30 bg-red-500/15 text-red-200">
                  <AlertTriangle size={15} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-black text-red-100">Esta questão já está no banco</p>
                  <p className="mt-1 text-xs font-medium leading-5 text-red-100/70">
                    {question.duplicate_of?.similarity ? `${Math.round(question.duplicate_of.similarity * 100)}% de semelhança. ` : ""}
                    O envio para revisão foi bloqueado para evitar duplicidade.
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" onClick={onDiscard} className="flex items-center gap-2 rounded-xl border border-red-300/25 bg-red-500/[0.10] px-3 py-1.5 text-xs font-bold text-red-100 transition hover:bg-red-500/20">
                  <Trash2 size={13} /> Descartar
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ is_annulled: !question.is_annulled, ...(question.is_annulled ? {} : { answer_key: null }) })}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                    question.is_annulled
                      ? "border-emerald-400/20 bg-emerald-500/[0.07] text-emerald-300 hover:bg-emerald-500/15"
                      : "border-amber-400/20 bg-amber-500/[0.07] text-amber-300 hover:bg-amber-500/15"
                  }`}
                >
                  {question.is_annulled ? <><CheckCircle2 size={13} /> Desanular</> : <><Ban size={13} /> Anular</>}
                </button>
                <button type="button" onClick={onVariations} className="flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-500/[0.07] px-3 py-1.5 text-xs font-bold text-amber-300 transition hover:bg-amber-500/15">
                  <Sparkles size={13} /> Variações
                </button>
              </div>
            </div>
          );
        }
        return (
          <div className="grid grid-cols-4 border-t border-white/[0.06] bg-black/10 backdrop-blur-sm">
            <button type="button" onClick={onDiscard} className="flex items-center justify-center gap-2 border-r border-white/[0.05] px-4 py-3.5 text-sm font-bold text-red-400 transition hover:bg-red-500/10 active:scale-95">
              <Trash2 size={14} /> Descartar
            </button>
            <button
              type="button"
              onClick={() => onChange({ is_annulled: !question.is_annulled, ...(question.is_annulled ? {} : { answer_key: null }) })}
              className={`flex items-center justify-center gap-2 border-r border-white/[0.05] px-4 py-3.5 text-sm font-bold transition active:scale-95 ${
                question.is_annulled ? "text-emerald-300 hover:bg-emerald-500/10" : "text-amber-300 hover:bg-amber-500/10"
              }`}
            >
              {question.is_annulled ? <><CheckCircle2 size={14} /> Desanular</> : <><Ban size={14} /> Anular</>}
            </button>
            <button type="button" onClick={onVariations} className="flex items-center justify-center gap-2 border-r border-white/[0.05] px-4 py-3.5 text-sm font-bold text-amber-300 transition hover:bg-amber-500/10 active:scale-95">
              <Sparkles size={14} /> Variações
            </button>
            <button
              type="button"
              onClick={onToggleSelected}
              className={`flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-black transition active:scale-95 ${
                selected
                  ? "bg-gradient-to-r from-orange-500 to-amber-400 text-slate-950"
                  : "bg-gradient-to-r from-orange-500/80 to-amber-400/80 text-slate-950 hover:from-orange-500 hover:to-amber-400"
              }`}
            >
              <span className={`flex h-4 w-4 items-center justify-center rounded border-2 text-[10px] transition ${selected ? "border-slate-950 bg-slate-950 text-orange-500" : "border-slate-950/40"}`}>
                {selected && "✓"}
              </span>
              {selected ? "Marcada para publicar" : "Preparar para publicação"}
            </button>
          </div>
        );
      })()}
    </article>
    </div>
  );
}

function VariationReviewPanel({
  variations: initialVariations,
  analysis,
  subjects,
  onClose,
}: {
  variations: RaioXQuestion[];
  analysis: RaioXAnalysis;
  subjects: SubjectOption[];
  onClose: () => void;
}) {
  const [localVariations, setLocalVariations] = useState<RaioXQuestion[]>(initialVariations);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedIds, setExpandedIds] = useState<string[]>(initialVariations.map((v) => v.id));
  const [saving, setSaving] = useState(false);
  const [sendStep, setSendStep] = useState(0);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [panelFeedback, setPanelFeedback] = useState<Feedback>(null);

  const selectedVariations = localVariations.filter((v) => selectedIds.includes(v.id));

  function wait(ms: number) {
    return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
  }

  function toggleSelected(id: string) {
    setSelectedIds((c) => (c.includes(id) ? c.filter((i) => i !== id) : [...c, id]));
  }

  function toggleExpanded(id: string) {
    setExpandedIds((c) => (c.includes(id) ? c.filter((i) => i !== id) : [...c, id]));
  }

  function updateVariation(id: string, updates: Partial<RaioXQuestion>) {
    setLocalVariations((c) => c.map((v) => (v.id === id ? { ...v, ...updates } : v)));
  }

  function updateAlt(
    variationId: string,
    index: number,
    updates: Partial<{ label: string; text: string; is_correct: boolean }>,
  ) {
    setLocalVariations((c) =>
      c.map((v) => {
        if (v.id !== variationId) return v;
        return { ...v, alternatives: v.alternatives.map((a, i) => (i === index ? { ...a, ...updates } : a)) };
      }),
    );
  }

  async function handleDiscard(id: string) {
    setDiscardingId(id);
    await adminFetch(`/api/admin/exam-analyses/${analysis.id}/questions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "discarded" }),
    });
    setLocalVariations((c) => c.filter((v) => v.id !== id));
    setSelectedIds((c) => c.filter((i) => i !== id));
    setExpandedIds((c) => c.filter((i) => i !== id));
    setDiscardingId(null);
  }

  async function sendToReview(targetVariations: RaioXQuestion[]) {
    if (saving) return;
    setPanelFeedback(null);
    setSaving(true);
    setSendStep(0);
    const sentIds = new Set(targetVariations.map((v) => v.id));
    setLocalVariations((c) => c.filter((v) => !sentIds.has(v.id)));
    setSelectedIds((c) => c.filter((i) => !sentIds.has(i)));
    setExpandedIds((c) => c.filter((i) => !sentIds.has(i)));

    try {
      await wait(120); setSendStep(1);
      await wait(120); setSendStep(2);
      await wait(120); setSendStep(3);

      const response = await adminFetch("/api/admin/questions/import/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questions: targetVariations.map((v) => ({
            statement: v.statement,
            question_type: v.question_type,
            alternatives: v.alternatives,
            explanation_text: v.explanation_text || "",
            difficulty_level: v.difficulty_level,
            board_name: v.board_name || analysis.board_name,
            year: v.year || analysis.exam_year,
            source_origin: "exam_question_variation",
            orgao: analysis.contest_name || null,
            subject_id: v.subject_ids?.[0] ?? v.subject_id ?? null,
            subject_ids: v.subject_ids?.length ? v.subject_ids : v.subject_id ? [v.subject_id] : [],
          })),
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Erro ao enviar para revisão.");

      setSendStep(4);
      await wait(160);
      setPanelFeedback({ type: "success", message: result.message || "Variações enviadas para revisão com sucesso." });
    } catch (error) {
      setLocalVariations((c) => [...targetVariations, ...c]);
      setSelectedIds((c) => [...c, ...targetVariations.map((v) => v.id)]);
      setExpandedIds((c) => [...c, ...targetVariations.map((v) => v.id)]);
      setPanelFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro ao enviar para revisão." });
    } finally {
      setSaving(false);
      setSendStep(0);
    }
  }

  if (localVariations.length === 0 && !saving) {
    onClose();
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-slate-50">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100">
            <Sparkles size={16} className="text-orange-600" />
          </span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-orange-600">Revisão de variações geradas</p>
            <h2 className="text-lg font-semibold text-slate-900">
              {localVariations.length} variação{localVariations.length !== 1 ? "ões" : ""} aguardando revisão
            </h2>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          <X size={15} /> Fechar e voltar ao Raio-X
        </button>
      </div>

      <VariationSendProgressModal show={saving} currentStep={sendStep} />

      {panelFeedback && (
        <div
          className={`mx-auto mt-4 w-full max-w-4xl rounded-[2rem] border px-6 py-4 text-sm font-medium ${
            panelFeedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : panelFeedback.type === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {panelFeedback.message}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
        <div className="mx-auto max-w-4xl space-y-4">
          <p className="text-sm text-slate-500">
            Revise cada variação antes de enviá-la para o banco de questões. As descartadas ficam arquivadas na análise.
          </p>

          {localVariations.map((variation, index) => (
            <VariationCard
              key={variation.id}
              variation={variation}
              index={index}
              selected={selectedIds.includes(variation.id)}
              expanded={expandedIds.includes(variation.id)}
              subjects={subjects}
              discarding={discardingId === variation.id}
              saving={saving}
              onToggleSelected={() => toggleSelected(variation.id)}
              onToggleExpanded={() => toggleExpanded(variation.id)}
              onChange={(updates) => updateVariation(variation.id, updates)}
              onAlternativeChange={(i, upd) => updateAlt(variation.id, i, upd)}
              onDiscard={() => handleDiscard(variation.id)}
              onSend={() => sendToReview([variation])}
            />
          ))}
        </div>
      </div>

      {selectedVariations.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 px-4 sm:px-6">
          <div className="mx-auto flex max-w-4xl flex-col gap-3 rounded-[2rem] border border-orange-200 bg-white/90 p-3 shadow-2xl shadow-orange-950/10 ring-1 ring-white/80 backdrop-blur md:flex-row md:items-center md:justify-between">
            <div className="px-2">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-orange-600">
                {selectedVariations.length} questão(ões) selecionada(s)
              </p>
              <p className="mt-1 text-sm text-slate-600">Revise a seleção antes de enviar para revisão.</p>
            </div>
            <div className="pointer-events-auto">
              <PremiumButton
                icon={<Send size={16} />}
                onClick={() => sendToReview(selectedVariations)}
                disabled={saving}
                full
              >
                Enviar selecionadas para revisão
              </PremiumButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VariationCard({
  variation,
  index,
  selected,
  expanded,
  subjects,
  discarding,
  saving,
  onToggleSelected,
  onToggleExpanded,
  onChange,
  onAlternativeChange,
  onDiscard,
  onSend,
}: {
  variation: RaioXQuestion;
  index: number;
  selected: boolean;
  expanded: boolean;
  subjects: SubjectOption[];
  discarding: boolean;
  saving: boolean;
  onToggleSelected: () => void;
  onToggleExpanded: () => void;
  onChange: (updates: Partial<RaioXQuestion>) => void;
  onAlternativeChange: (index: number, updates: Partial<{ label: string; text: string; is_correct: boolean }>) => void;
  onDiscard: () => void;
  onSend: () => void;
}) {
  const correct = variation.alternatives.find((a) => a.is_correct);

  return (
    <div
      className={
        selected
          ? "rounded-[2rem] border border-orange-200 bg-orange-50/60 p-5 shadow-sm ring-1 ring-orange-100"
          : "rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm"
      }
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <input
            type="checkbox"
            checked={selected}
            disabled={saving}
            onChange={onToggleSelected}
            className="mt-1 h-5 w-5 shrink-0 accent-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
          />

          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-bold text-orange-700">
                Variação {index + 1}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                {variation.question_type === "true_false" ? "Certo ou Errado" : "Múltipla escolha"}
              </span>
              {variation.module_name && (
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                  {variation.module_name}
                </span>
              )}
            </div>

            <RichTextEditor
              value={variation.statement}
              onChange={(value) => onChange({ statement: value })}
              placeholder="Enunciado da questão"
              disabled={saving}
              minRows={3}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-800 outline-none focus:ring-4 focus:ring-orange-100"
            />

            <div className="mt-3">
              <SubjectMultiSelect
                subjects={subjects}
                selectedIds={
                  variation.subject_ids?.length
                    ? variation.subject_ids
                    : variation.subject_id
                      ? [variation.subject_id]
                      : []
                }
                onChange={(ids) => onChange({ subject_ids: ids, subject_id: ids[0] || null })}
                emptyLabel="Selecionar assunto no banco"
                disciplineId={variation.discipline_id || null}
                allowCreate={false}
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleExpanded}
          className="shrink-0 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
        >
          {expanded ? "Recolher" : "Ver detalhes"}
        </button>
      </div>

      {expanded && (
        <div className="mt-5 border-t border-slate-100 pt-5">
          <div className="grid gap-3">
            {variation.alternatives.map((alt, i) => (
              <div
                key={`${variation.id}-${alt.label}-${i}`}
                className={
                  alt.is_correct
                    ? "rounded-2xl border border-emerald-200 bg-emerald-50 p-4"
                    : "rounded-2xl border border-slate-200 bg-slate-50 p-4"
                }
              >
                <div className="grid gap-2">
                  <span
                    className={`inline-flex items-center gap-2 text-sm font-black ${alt.is_correct ? "text-emerald-800" : "text-slate-700"}`}
                  >
                    {alt.is_correct && (
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-sm leading-none text-white">
                        ✓
                      </span>
                    )}
                    Alternativa {alt.label}
                  </span>
                  <RichTextEditor
                    value={alt.text}
                    onChange={(value) => onAlternativeChange(i, { text: value })}
                    placeholder="Texto da alternativa"
                    disabled={saving}
                    minRows={2}
                    compact
                    className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-800 outline-none focus:ring-4 focus:ring-orange-100"
                  />
                </div>
              </div>
            ))}
          </div>

          {correct && (
            <p className="mt-4 text-sm font-semibold text-emerald-700">
              Resposta correta:{" "}
              {variation.question_type === "true_false" ? correct.text : correct.label || "Não definida"}
            </p>
          )}

          {variation.explanation_text && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
              {variation.explanation_text}
            </div>
          )}
        </div>
      )}

      <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
        <PremiumButton
          variant="danger"
          icon={discarding ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
          onClick={onDiscard}
          disabled={saving || discarding}
        >
          Descartar variação
        </PremiumButton>
        <PremiumButton icon={<CheckCircle2 size={16} />} onClick={onSend} disabled={saving || discarding}>
          Publicar
        </PremiumButton>
      </div>
    </div>
  );
}

function VariationSendProgressModal({ show, currentStep }: { show: boolean; currentStep: number }) {
  if (!show) return null;
  const steps = [
    "Preparando variações",
    "Validando duplicidades",
    "Organizando metadados",
    "Salvando no banco",
    "Publicando no banco",
  ];
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[2rem] border border-orange-100 bg-white p-7 shadow-2xl">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
          <Loader2 size={26} className="animate-spin" />
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">Processando</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950">Enviando variações para revisão</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">Salvando informações no banco.</p>
        <div className="mt-6 grid gap-3">
          {steps.map((step, index) => {
            const done = index < currentStep;
            const active = index === currentStep;
            return (
              <div
                key={step}
                className={
                  done
                    ? "flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700"
                    : active
                      ? "flex items-center gap-3 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-orange-700"
                      : "flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-500"
                }
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
                  {done ? (
                    <CheckCircle2 size={16} />
                  ) : active ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-current opacity-50" />
                  )}
                </span>
                <span className="text-sm font-semibold">{step}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function VariationModalView({ modal, count, fidelity, loading, onCountChange, onFidelityChange, onClose, onSubmit }: {
  modal: VariationModal;
  count: string;
  fidelity: string;
  loading: boolean;
  onCountChange: (value: string) => void;
  onFidelityChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-[2rem] border border-white/[0.10] bg-[#0C1E34] p-6 text-white shadow-2xl shadow-black/50">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-400/25 bg-orange-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-orange-200"><Sparkles size={14} /> Variações</div>
            <h3 className="mt-3 text-2xl font-black">Criar variações</h3>
            <p className="mt-1 text-sm text-slate-400">{modal?.title}</p>
          </div>
          <button onClick={onClose} className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-2 text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="mt-5 space-y-4">
          <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Quantidade</span><input type="number" min={1} max={10} value={count} onChange={(e) => onCountChange(e.target.value)} className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white outline-none focus:border-orange-300/50" /></label>
          <div className="space-y-2"><span className="block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Grau de fidelidade</span>{fidelityOptions.map((option) => <button key={option.value} type="button" onClick={() => onFidelityChange(option.value)} className={`w-full rounded-2xl border px-4 py-3 text-left transition ${fidelity === option.value ? "border-orange-300/50 bg-orange-500/10" : "border-white/[0.08] bg-white/[0.035] hover:bg-white/[0.06]"}`}><p className="text-sm font-black text-white">{option.label}</p><p className="mt-1 text-xs text-slate-400">{option.description}</p></button>)}</div>
        </div>
        <div className="mt-6 flex justify-end gap-3"><button onClick={onClose} className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-sm font-bold text-slate-300">Cancelar</button><button onClick={onSubmit} disabled={loading} className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 px-5 py-2.5 text-sm font-black text-slate-950 disabled:opacity-60">{loading ? <Loader2 className="animate-spin" size={17} /> : <Sparkles size={17} />} Criar variações</button></div>
      </div>
    </div>
  );
}

function CloneProvaModal({
  analysis,
  similarity,
  difficulty,
  title,
  onChangeSimilarity,
  onChangeDifficulty,
  onChangeTitle,
  onClose,
  onSubmit,
}: {
  analysis: RaioXAnalysis;
  similarity: string;
  difficulty: string;
  title: string;
  onChangeSimilarity: (v: string) => void;
  onChangeDifficulty: (v: string) => void;
  onChangeTitle: (v: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const similarityOptions = [
    { value: "100", label: "Espelho — 100%", description: "Mesmo assunto e tópico, varia apenas o enunciado e os dados." },
    { value: "75", label: "Alta — 75%", description: "Mantém o núcleo temático, varia abordagem e contexto." },
    { value: "50", label: "Média — 50%", description: "Mantém os assuntos, varia o tópico de cobrança." },
    { value: "25", label: "Livre — 25%", description: "Usa a prova como inspiração temática ampla." },
  ];
  const difficultyOptions = [
    { value: "-2", label: "Muito mais fácil" },
    { value: "-1", label: "Mais fácil" },
    { value: "0", label: "Mesma dificuldade" },
    { value: "1", label: "Mais difícil" },
    { value: "2", label: "Muito mais difícil" },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[2rem] border border-white/[0.10] bg-[#0C1E34] p-6 text-white shadow-2xl shadow-black/50">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/25 bg-violet-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-violet-200">
              <CopyPlus size={14} /> Clone de Prova
            </div>
            <h3 className="mt-3 text-2xl font-black">Criar clone</h3>
            <p className="mt-1 text-sm text-slate-400">{analysis.title}</p>
          </div>
          <button onClick={onClose} className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-2 text-slate-400 hover:text-white">
            <X size={18} />
          </button>
        </div>
        <div className="mt-5 space-y-5">
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Título do simulado</span>
            <input
              type="text"
              value={title}
              onChange={(e) => onChangeTitle(e.target.value)}
              placeholder={`Clone — ${analysis.title || "Prova"}`}
              className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white outline-none placeholder:text-slate-700 focus:border-violet-300/50"
            />
          </label>
          <div className="space-y-2">
            <span className="block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Nível de similaridade</span>
            {similarityOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChangeSimilarity(opt.value)}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${similarity === opt.value ? "border-violet-300/50 bg-violet-500/10" : "border-white/[0.08] bg-white/[0.035] hover:bg-white/[0.06]"}`}
              >
                <p className="text-sm font-black text-white">{opt.label}</p>
                <p className="mt-1 text-xs text-slate-400">{opt.description}</p>
              </button>
            ))}
          </div>
          <div>
            <span className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Ajuste de dificuldade</span>
            <div className="flex flex-wrap gap-2">
              {difficultyOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onChangeDifficulty(opt.value)}
                  className={`rounded-2xl border px-4 py-2 text-sm font-bold transition ${difficulty === opt.value ? "border-violet-300/50 bg-violet-500/10 text-violet-200" : "border-white/[0.08] bg-white/[0.035] text-slate-400 hover:bg-white/[0.06]"}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-700/50 bg-white/[0.025] px-4 py-3">
            <p className="text-xs leading-5 text-slate-500">
              A IA mantém o vocabulário e estilo da banca, os assuntos cobrados e o formato das questões — mas aborda tudo de ângulo completamente diferente. Questões com imagem recebem uma descrição textual da imagem necessária.
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-sm font-bold text-slate-300">
            Cancelar
          </button>
          <button
            onClick={onSubmit}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-500 px-5 py-2.5 text-sm font-black text-white shadow-md"
          >
            <CopyPlus size={17} /> Gerar clone
          </button>
        </div>
      </div>
    </div>
  );
}

function CloneProgressModal({ step }: { step: number }) {
  const steps = [
    "Analisando prova original",
    "Gerando questões com IA",
    "Aplicando estilo e dificuldade",
    "Preparando questões para revisão",
    "Pronto para revisar",
  ];
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[2rem] border border-violet-400/15 bg-[#0C1E34] p-7 shadow-2xl">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300">
          <Loader2 size={26} className="animate-spin" />
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-400">Gerando</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">Criando clone da prova</h2>
        <p className="mt-3 text-sm leading-6 text-slate-500">A IA está criando questões originais. Isso pode levar alguns minutos.</p>
        <div className="mt-6 grid gap-3">
          {steps.map((stepLabel, index) => {
            const done = index < step;
            const active = index === step;
            return (
              <div
                key={stepLabel}
                className={
                  done
                    ? "flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-emerald-300"
                    : active
                      ? "flex items-center gap-3 rounded-2xl border border-violet-300/30 bg-violet-500/10 px-4 py-3 text-violet-200"
                      : "flex items-center gap-3 rounded-2xl border border-white/[0.05] bg-white/[0.02] px-4 py-3 text-slate-600"
                }
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.05]">
                  {done ? (
                    <CheckCircle2 size={16} />
                  ) : active ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-current opacity-30" />
                  )}
                </span>
                <span className="text-sm font-semibold">{stepLabel}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Clone Review ──────────────────────────────────────────────────────────────

type CloneReviewAlt = { label: string; text: string; is_correct: boolean };

type CloneReviewQuestion = {
  tempId: string;
  statement: string;
  question_type: "multiple_choice" | "true_false";
  alternatives: CloneReviewAlt[];
  subject_id: string | null;
  subject_ids: string[];
  exam_board_id: string;
  year: number;
  difficulty_level: number;
  explanation_text: string | null;
  module_name: string | null;
};

function CloneAlternativeEditor({
  alt,
  onChange,
  onMarkCorrect,
}: {
  alt: { label?: string; text: string; is_correct: boolean };
  onChange: (newText: string) => void;
  onMarkCorrect: () => void;
}) {
  const [isEliminated, setIsEliminated] = useState(false);
  const label = alt.label ?? "?";
  return (
    <div className="group relative pl-10">
      <button
        type="button"
        aria-label={isEliminated ? "Remover eliminação" : "Eliminar alternativa"}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsEliminated((v) => !v); }}
        className={`absolute left-0 top-0 z-20 flex h-full w-10 items-center justify-center transition ${
          isEliminated ? "opacity-100" : "opacity-0 hover:opacity-100 focus:opacity-100 focus-visible:opacity-100"
        }`}
      >
        <PremiumScissorsIcon size={18} />
      </button>
      <div
        onClick={onMarkCorrect}
        className={`cursor-pointer transition ${isEliminated ? "opacity-60" : ""} ${
          alt.is_correct
            ? "rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] p-3"
            : "rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3 hover:border-emerald-500/25 hover:bg-emerald-500/[0.05]"
        }`}
      >
        <div className="flex items-start gap-2">
          {alt.is_correct ? (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-emerald-500 bg-emerald-500/20 text-lg">
              <span className="block font-normal leading-none">{OWL_MARK}</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={(event) => { event.stopPropagation(); onMarkCorrect(); }}
              title="Marcar como correta"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/[0.15] bg-white/[0.04] text-xs font-black text-white/50 transition hover:border-emerald-500/40 hover:bg-emerald-500/[0.10] hover:text-emerald-300"
            >
              {label}
            </button>
          )}
          <div className="min-w-0 flex-1" onClick={(event) => event.stopPropagation()}>
            <RichTextEditor
              value={alt.text}
              onChange={onChange}
              placeholder={`Resposta ${label}`}
              compact
              minRows={3}
              className={`w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm text-white/70 outline-none focus:ring-2 focus:ring-orange-400/[0.08] ${isEliminated ? "line-through decoration-red-500 decoration-2 [&_*]:line-through [&_*]:decoration-red-500 [&_*]:decoration-2" : ""}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function CloneReviewPanel({
  initialQuestions,
  initialTitle,
  analysisId,
  examBoardId,
  boardName,
  subjects,
  onClose,
  onApproved,
}: {
  initialQuestions: CloneReviewQuestion[];
  initialTitle: string;
  analysisId: string;
  examBoardId: string;
  boardName: string;
  subjects: SubjectOption[];
  onClose: () => void;
  onApproved: (simuladoId: string, simuladoTitle: string, count: number) => void;
}) {
  const [questions, setQuestions] = useState<CloneReviewQuestion[]>(initialQuestions);
  const [title, setTitle] = useState(initialTitle);
  const [variatingId, setVariatingId] = useState<string | null>(null);
  const [variationPreview, setVariationPreview] = useState<{ tempId: string; question: CloneReviewQuestion } | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeStep, setFinalizeStep] = useState(0);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [addMode, setAddMode] = useState<"none" | "manual" | "ai">("none");
  const [manualStatement, setManualStatement] = useState("");
  const [manualAlts, setManualAlts] = useState<CloneReviewAlt[]>([
    { label: "A", text: "", is_correct: true },
    { label: "B", text: "", is_correct: false },
    { label: "C", text: "", is_correct: false },
    { label: "D", text: "", is_correct: false },
    { label: "E", text: "", is_correct: false },
  ]);
  const [manualSubjectIds, setManualSubjectIds] = useState<string[]>([]);
  const [manualDifficulty, setManualDifficulty] = useState(3);
  const [aiSubjectIds, setAiSubjectIds] = useState<string[]>([]);
  const [aiDifficulty, setAiDifficulty] = useState(3);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiPreview, setAiPreview] = useState<CloneReviewQuestion | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [variationError, setVariationError] = useState<string | null>(null);

  function updateQuestion(tempId: string, updates: Partial<CloneReviewQuestion>) {
    setQuestions((curr) => curr.map((q) => (q.tempId === tempId ? { ...q, ...updates } : q)));
  }

  function removeQuestion(tempId: string) {
    setQuestions((curr) => curr.filter((q) => q.tempId !== tempId));
    setVariationPreview((prev) => (prev?.tempId === tempId ? null : prev));
  }

  async function generateVariation(tempId: string) {
    const q = questions.find((q) => q.tempId === tempId);
    if (!q) return;
    setVariatingId(tempId);
    setVariationError(null);
    setVariationPreview(null);
    try {
      const res = await adminFetch(`/api/admin/exam-analyses/${analysisId}/clone/variation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statement: q.statement, alternatives: q.alternatives, module_name: q.module_name || "Informática", difficulty_level: q.difficulty_level, board_name: boardName }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Erro ao gerar variação.");
      setVariationPreview({ tempId, question: { ...data.question, tempId: `var-${Date.now()}` } });
    } catch (e) {
      setVariationError(e instanceof Error ? e.message : "Erro ao gerar variação.");
    } finally {
      setVariatingId(null);
    }
  }

  function acceptVariation() {
    if (!variationPreview) return;
    const { tempId, question } = variationPreview;
    updateQuestion(tempId, { statement: question.statement, alternatives: question.alternatives, explanation_text: question.explanation_text, module_name: question.module_name, difficulty_level: question.difficulty_level });
    setVariationPreview(null);
  }

  async function generateFromTopic() {
    if (!aiSubjectIds.length) return;
    setAiGenerating(true);
    setAiError(null);
    setAiPreview(null);
    const subjectName = subjects.find((s) => s.id === aiSubjectIds[0])?.name || "Informática";
    try {
      const res = await adminFetch(`/api/admin/exam-analyses/${analysisId}/clone/variation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statement: "", alternatives: [], module_name: subjectName, difficulty_level: aiDifficulty, board_name: boardName }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Erro ao gerar questão.");
      setAiPreview({ ...data.question, tempId: `ai-${Date.now()}`, subject_ids: aiSubjectIds, subject_id: aiSubjectIds[0] || null, exam_board_id: examBoardId });
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Erro ao gerar questão.");
    } finally {
      setAiGenerating(false);
    }
  }

  function addAiQuestion() {
    if (!aiPreview) return;
    setQuestions((curr) => [...curr, aiPreview!]);
    setAiPreview(null);
    setAiSubjectIds([]);
    setAiDifficulty(3);
    setAddMode("none");
  }

  function addManualQuestion() {
    if (!manualStatement.trim()) return;
    const alts = manualAlts.filter((a) => a.text.trim());
    if (!alts.some((a) => a.is_correct) && alts.length) alts[0].is_correct = true;
    const newQ: CloneReviewQuestion = {
      tempId: `manual-${Date.now()}`,
      statement: manualStatement,
      question_type: "multiple_choice",
      alternatives: alts,
      subject_id: manualSubjectIds[0] || null,
      subject_ids: manualSubjectIds,
      exam_board_id: examBoardId,
      year: new Date().getFullYear(),
      difficulty_level: manualDifficulty,
      explanation_text: null,
      module_name: subjects.find((s) => s.id === manualSubjectIds[0])?.name || null,
    };
    setQuestions((curr) => [...curr, newQ]);
    setManualStatement("");
    setManualAlts([{ label: "A", text: "", is_correct: true }, { label: "B", text: "", is_correct: false }, { label: "C", text: "", is_correct: false }, { label: "D", text: "", is_correct: false }, { label: "E", text: "", is_correct: false }]);
    setManualSubjectIds([]);
    setManualDifficulty(3);
    setAddMode("none");
  }

  async function finalize() {
    setFinalizing(true);
    setFinalizeStep(0);
    setFinalizeError(null);
    const t1 = setTimeout(() => setFinalizeStep(1), 1800);
    const t2 = setTimeout(() => setFinalizeStep(2), 6000);
    try {
      const res = await adminFetch(`/api/admin/exam-analyses/${analysisId}/clone/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          simulado_title: title.trim() || "Simulado Clone",
          questions: questions.map((q) => ({ statement: q.statement, question_type: q.question_type, alternatives: q.alternatives, subject_id: q.subject_id, subject_ids: q.subject_ids, exam_board_id: q.exam_board_id || examBoardId, year: q.year, difficulty_level: q.difficulty_level, explanation_text: q.explanation_text, module_name: q.module_name })),
        }),
      });
      clearTimeout(t1); clearTimeout(t2);
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Erro ao criar simulado.");
      setFinalizeStep(3);
      await new Promise((r) => setTimeout(r, 700));
      onApproved(data.simulado_id, data.simulado_title, data.question_count);
    } catch (e) {
      clearTimeout(t1); clearTimeout(t2);
      setFinalizeError(e instanceof Error ? e.message : "Erro ao criar simulado.");
      setFinalizing(false);
      setFinalizeStep(0);
    }
  }

  const finalizeSteps = ["Salvando questões no banco", "Criando simulado", "Vinculando questões", "Concluído"];

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#07111F]">
      <div className="shrink-0 border-b border-white/[0.08] bg-[#0A1525]/90 px-4 py-4 shadow-sm backdrop-blur-sm sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-violet-400/30 bg-violet-400/10 p-2.5 text-violet-300">
              <CopyPlus size={18} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-violet-400">Revisar clone</p>
              <p className="text-sm font-bold text-white/70">{questions.length} {questions.length === 1 ? "questão" : "questões"}</p>
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título do simulado"
              className="w-full rounded-2xl border border-white/[0.10] bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-white/80 outline-none placeholder:text-white/30 focus:border-violet-400/50 focus:ring-2 focus:ring-violet-400/10 sm:max-w-xs"
            />
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="rounded-2xl border border-white/[0.10] bg-white/[0.05] px-4 py-2.5 text-sm font-bold text-white/50 transition hover:bg-white/[0.10] hover:text-white/80">
                Fechar
              </button>
              <button
                type="button"
                onClick={finalize}
                disabled={finalizing || !questions.length}
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-500 px-5 py-2.5 text-sm font-black text-white shadow-md shadow-violet-500/20 transition hover:from-violet-500 hover:to-purple-400 disabled:opacity-50"
              >
                <CheckCircle2 size={16} /> Aprovar simulado
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6">
          {variationError && (
            <div className="flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/[0.08] px-4 py-3 text-sm font-semibold text-red-300">
              <AlertTriangle size={16} /> {variationError}
              <button type="button" onClick={() => setVariationError(null)} className="ml-auto text-red-400/60 hover:text-red-300"><X size={14} /></button>
            </div>
          )}
          {questions.map((q, i) => {
            const isVariating = variatingId === q.tempId;
            const hasVariationPreview = variationPreview?.tempId === q.tempId;
            return (
              <article key={q.tempId} className="rounded-[2rem] border border-white/[0.07] bg-white/[0.03] shadow-xl shadow-black/30 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.12]">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-6 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-orange-500/30 bg-orange-500/[0.12] px-3 py-1 text-xs font-black text-orange-300">#{i + 1}</span>
                    {q.module_name && (
                      <span className="rounded-full border border-white/[0.09] bg-white/[0.05] px-3 py-1 text-xs font-semibold text-white/50">{q.module_name}</span>
                    )}
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button key={star} type="button" onClick={() => updateQuestion(q.tempId, { difficulty_level: star })} className={`text-sm leading-none transition ${star <= q.difficulty_level ? "text-amber-400" : "text-white/15"} hover:text-amber-300`}>★</button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => generateVariation(q.tempId)} disabled={!!variatingId} className="inline-flex items-center gap-1.5 rounded-xl border border-violet-400/30 bg-violet-400/10 px-3 py-1.5 text-xs font-bold text-violet-300 transition hover:bg-violet-400/20 disabled:opacity-50">
                      {isVariating ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Variação IA
                    </button>
                    <button type="button" onClick={() => removeQuestion(q.tempId)} className="rounded-xl border border-red-400/30 bg-red-400/10 p-1.5 text-red-300 transition hover:bg-red-400/20">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Statement */}
                <div className="border-b border-white/[0.06] px-6 py-5">
                  <RichTextEditor
                    value={q.statement}
                    onChange={(val) => updateQuestion(q.tempId, { statement: val })}
                    minRows={3}
                    placeholder="Enunciado da questão"
                    className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm leading-6 text-white/70 outline-none focus:ring-2 focus:ring-orange-400/[0.08]"
                  />
                </div>

                {/* Variation preview */}
                {hasVariationPreview && variationPreview && (
                  <div className="border-b border-white/[0.06] px-6 py-5">
                    <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-violet-400">Nova versão gerada pela IA</p>
                    <div className="rounded-2xl border border-violet-400/30 bg-violet-400/[0.08] px-4 py-4 text-sm leading-6 text-white/70" dangerouslySetInnerHTML={{ __html: variationPreview.question.statement }} />
                    <div className="mt-3 space-y-1.5">
                      {variationPreview.question.alternatives.map((alt) => (
                        <div key={alt.label} className={`flex items-start gap-2 rounded-xl px-3 py-2 text-xs ${alt.is_correct ? "bg-emerald-500/20 text-emerald-300" : "bg-white/[0.03] text-white/50"}`}>
                          <span className="shrink-0 font-black">{alt.label}</span>
                          <span>{alt.text}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={acceptVariation} className="rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-600">Aceitar variação</button>
                      <button type="button" onClick={() => setVariationPreview(null)} className="rounded-xl border border-white/[0.10] bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-white/50 hover:bg-white/[0.08]">Descartar</button>
                    </div>
                  </div>
                )}

                {/* Alternatives */}
                <div className="border-b border-white/[0.06] px-6 py-5">
                  {q.question_type === "true_false" ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {q.alternatives.map((alt, ai) => {
                        const isWrong = alt.label === "E" || String(alt.text || "").trim().toLowerCase() === "errado";
                        const isSelected = alt.is_correct;
                        return (
                          <button key={alt.label} type="button"
                            onClick={() => { const newAlts = q.alternatives.map((a, j) => ({ ...a, is_correct: j === ai })); updateQuestion(q.tempId, { alternatives: newAlts }); }}
                            className={
                              isSelected && isWrong
                                ? "rounded-2xl border-2 border-red-500/40 bg-red-500/[0.10] px-5 py-4 text-left text-sm font-bold text-red-300"
                                : isSelected
                                  ? "rounded-2xl border-2 border-emerald-500/40 bg-emerald-500/[0.10] px-5 py-4 text-left text-sm font-bold text-emerald-300"
                                  : isWrong
                                    ? "rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-4 text-left text-sm font-semibold text-white/50 hover:border-red-500/30 hover:bg-red-500/[0.08] hover:text-red-300"
                                    : "rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-4 text-left text-sm font-semibold text-white/50 hover:border-emerald-500/30 hover:bg-emerald-500/[0.08] hover:text-emerald-300"
                            }>
                            <span className="flex items-center gap-2">
                              {isSelected && <span className="font-normal leading-none">{OWL_MARK}</span>}
                              {alt.label === "C" ? "Certo" : "Errado"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {q.alternatives.map((alt, ai) => (
                        <CloneAlternativeEditor
                          key={alt.label}
                          alt={alt}
                          onChange={(newText) => { const newAlts = q.alternatives.map((a, j) => j === ai ? { ...a, text: newText } : a); updateQuestion(q.tempId, { alternatives: newAlts }); }}
                          onMarkCorrect={() => { const newAlts = q.alternatives.map((a, j) => ({ ...a, is_correct: j === ai })); updateQuestion(q.tempId, { alternatives: newAlts }); }}
                        />
                      ))}
                    </div>
                  )}
                  {(() => {
                    const correct = q.alternatives.find((a) => a.is_correct);
                    const isWrongTF = q.question_type === "true_false" && (correct?.label === "E" || String(correct?.text || "").trim().toLowerCase() === "errado");
                    return (
                      <p className={`mt-4 text-sm font-semibold ${isWrongTF ? "text-red-400" : "text-emerald-400"}`}>
                        Resposta correta:{" "}
                        {q.question_type === "true_false" ? correct?.text : correct?.label || "Não definida"}
                      </p>
                    );
                  })()}
                </div>

                {/* Explanation */}
                {q.explanation_text && (
                  <div className="border-b border-white/[0.06] px-6 py-5">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/30">Explicação</p>
                    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm leading-6 text-white/50">
                      {q.explanation_text}
                    </div>
                  </div>
                )}

                {/* Subject */}
                <div className="px-6 py-5">
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-white/30">Assunto</p>
                  <SubjectMultiSelect subjects={subjects} selectedIds={q.subject_ids} onChange={(ids) => updateQuestion(q.tempId, { subject_ids: ids, subject_id: ids[0] || null })} dark />
                </div>
              </article>
            );
          })}

          <div className="overflow-hidden rounded-[2rem] border border-dashed border-white/[0.12] bg-white/[0.02]">
            {addMode === "none" ? (
              <div className="flex flex-wrap items-center justify-center gap-3 px-6 py-5">
                <span className="text-sm font-semibold text-white/40">Adicionar questão:</span>
                <button type="button" onClick={() => setAddMode("manual")} className="inline-flex items-center gap-2 rounded-2xl border border-white/[0.10] bg-white/[0.05] px-4 py-2 text-sm font-bold text-white/60 transition hover:bg-white/[0.10] hover:text-white/80">
                  <Edit3 size={14} /> Manualmente
                </button>
                <button type="button" onClick={() => setAddMode("ai")} className="inline-flex items-center gap-2 rounded-2xl border border-violet-400/30 bg-violet-400/10 px-4 py-2 text-sm font-bold text-violet-300 transition hover:bg-violet-400/20">
                  <Sparkles size={14} /> Com IA
                </button>
              </div>
            ) : addMode === "ai" ? (
              <div className="space-y-4 p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-white/70">Gerar questão com IA</p>
                  <button type="button" onClick={() => { setAddMode("none"); setAiPreview(null); setAiError(null); }} className="text-white/30 hover:text-white/60"><X size={16} /></button>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.12em] text-white/30">Assunto</p>
                  <SubjectMultiSelect subjects={subjects} selectedIds={aiSubjectIds} onChange={setAiSubjectIds} dark />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.12em] text-white/30">Dificuldade</p>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((d) => (
                      <button key={d} type="button" onClick={() => setAiDifficulty(d)} className={`h-9 w-9 rounded-xl border text-sm font-bold transition ${aiDifficulty === d ? "border-violet-400/50 bg-violet-400/20 text-violet-300" : "border-white/[0.10] bg-white/[0.04] text-white/40 hover:bg-white/[0.08] hover:text-white/70"}`}>{d}</button>
                    ))}
                  </div>
                </div>
                {aiError && <p className="text-xs font-bold text-red-400">{aiError}</p>}
                {!aiPreview ? (
                  <button type="button" onClick={generateFromTopic} disabled={aiGenerating || !aiSubjectIds.length} className="inline-flex items-center gap-2 rounded-2xl bg-violet-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-violet-400 disabled:opacity-50">
                    {aiGenerating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Gerar questão
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-violet-400/30 bg-violet-400/[0.08] p-4">
                      <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-violet-400">Questão gerada</p>
                      <div className="text-sm leading-6 text-white/70" dangerouslySetInnerHTML={{ __html: aiPreview.statement }} />
                      <div className="mt-3 space-y-1.5">
                        {aiPreview.alternatives.map((alt) => (
                          <div key={alt.label} className={`flex items-start gap-2 rounded-xl px-3 py-2 text-xs ${alt.is_correct ? "bg-emerald-500/20 text-emerald-300" : "bg-white/[0.03] text-white/50"}`}>
                            <span className="shrink-0 font-black">{alt.label}</span>
                            <span>{alt.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={addAiQuestion} className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600">Adicionar ao simulado</button>
                      <button type="button" onClick={() => { setAiPreview(null); setAiError(null); }} className="rounded-xl border border-white/[0.10] bg-white/[0.04] px-3 py-2 text-xs font-bold text-white/50 hover:bg-white/[0.08]">Gerar outra</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4 p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-white/70">Adicionar questão manualmente</p>
                  <button type="button" onClick={() => setAddMode("none")} className="text-white/30 hover:text-white/60"><X size={16} /></button>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.12em] text-white/30">Enunciado</p>
                  <RichTextEditor value={manualStatement} onChange={setManualStatement} minRows={3} placeholder="Enunciado da questão" className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm text-white/70 outline-none focus:ring-2 focus:ring-orange-400/[0.08]" />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.12em] text-white/30">Alternativas</p>
                  <div className="space-y-2">
                    {manualAlts.map((alt, ai) => (
                      <div key={alt.label} className={`flex items-start gap-3 rounded-2xl border p-3 ${alt.is_correct ? "border-emerald-500/30 bg-emerald-500/[0.07]" : "border-white/[0.06] bg-white/[0.03]"}`}>
                        <button type="button" onClick={() => setManualAlts((curr) => curr.map((a, j) => ({ ...a, is_correct: j === ai })))} className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-black transition ${alt.is_correct ? "border-emerald-500 bg-emerald-500/20 text-emerald-300" : "border-white/[0.15] text-white/40 hover:border-emerald-500/40 hover:text-emerald-300"}`}>{alt.label}</button>
                        <textarea value={alt.text} onChange={(e) => setManualAlts((curr) => curr.map((a, j) => j === ai ? { ...a, text: e.target.value } : a))} rows={2} className="flex-1 resize-none rounded-xl border-0 bg-transparent p-0 text-sm text-white/70 outline-none placeholder:text-white/20" placeholder={`Alternativa ${alt.label}`} />
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.12em] text-white/30">Assunto</p>
                  <SubjectMultiSelect subjects={subjects} selectedIds={manualSubjectIds} onChange={setManualSubjectIds} dark />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.12em] text-white/30">Dificuldade</p>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((d) => (
                      <button key={d} type="button" onClick={() => setManualDifficulty(d)} className={`h-9 w-9 rounded-xl border text-sm font-bold transition ${manualDifficulty === d ? "border-white/30 bg-white/10 text-white" : "border-white/[0.10] bg-white/[0.04] text-white/40 hover:bg-white/[0.08] hover:text-white/70"}`}>{d}</button>
                    ))}
                  </div>
                </div>
                <button type="button" onClick={addManualQuestion} disabled={!manualStatement.trim()} className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2.5 text-sm font-bold text-white/70 transition hover:bg-white/[0.15] hover:text-white disabled:opacity-50">
                  <Save size={15} /> Adicionar ao simulado
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {finalizing && (
        <div className="fixed inset-0 z-[101] flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] border border-violet-400/20 bg-[#0C1E34] p-7 shadow-2xl">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300">
              <Loader2 size={26} className="animate-spin" />
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-400">Aprovando</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Criando simulado</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">Salvando questões e criando o simulado em rascunho…</p>
            <div className="mt-6 grid gap-3">
              {finalizeSteps.map((stepLabel, index) => {
                const done = index < finalizeStep;
                const active = index === finalizeStep;
                return (
                  <div key={stepLabel} className={done ? "flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-emerald-300" : active ? "flex items-center gap-3 rounded-2xl border border-violet-300/30 bg-violet-500/10 px-4 py-3 text-violet-200" : "flex items-center gap-3 rounded-2xl border border-white/[0.05] bg-white/[0.02] px-4 py-3 text-slate-600"}>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.05]">
                      {done ? <CheckCircle2 size={16} /> : active ? <Loader2 size={16} className="animate-spin" /> : <span className="h-2 w-2 rounded-full bg-current opacity-30" />}
                    </span>
                    <span className="text-sm font-semibold">{stepLabel}</span>
                  </div>
                );
              })}
            </div>
            {finalizeError && <p className="mt-4 text-xs font-bold text-red-400">{finalizeError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
