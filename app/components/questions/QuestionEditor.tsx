"use client";

import { type ChangeEvent, type ClipboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Archive,
  ArchiveRestore,
  Ban,
  Check,
  CheckCircle2,
  ChevronDown,
  Eye,
  ImageIcon,
  Loader2,
  MessageSquareText,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence as AP, motion as m } from "framer-motion";
import PremiumButton from "@/app/components/ui/PremiumButton";
import SearchableSelect from "@/app/components/ui/SearchableSelect";
import SubjectMultiSelect from "@/app/components/questions/SubjectMultiSelect";
import EvaluatedTopicsInput from "@/app/components/questions/EvaluatedTopicsInput";
import PremiumScissorsIcon from "@/app/components/questions/PremiumScissorsIcon";
import RichTextEditor from "@/app/components/questions/RichTextEditor";
import ExplanationAuthorCard from "@/app/components/questions/ExplanationAuthorCard";
import DraftRestoreModal from "@/app/components/ui/DraftRestoreModal";
import { useLocalDraft } from "@/app/lib/useLocalDraft";
import { extractQuestionSubjectIds } from "@/lib/questions/question-subjects";
import { hasEvaluatedTopics, normalizeEvaluatedTopics } from "@/lib/questions/evaluated-topics";
import { isQuestionImagePending } from "@/lib/questions/image-pending";
import { adminFetch } from "@/lib/supabase/adminFetch";

// ─── Constants ────────────────────────────────────────────────────────────────

const OWL_MARK = "\u{1F989}️";
const PROFESSOR_PREFIX = "🦉 Professor Pablo Leonardo:";

// ─── Exported Types ───────────────────────────────────────────────────────────

export type Alternative = {
  id?: string;
  label?: string | null;
  text?: string | null;
  image_url?: string | null;
  is_correct?: boolean | null;
  order_number?: number | null;
  showImage?: boolean;
};

export type Discipline = { id: string; name: string };
export type Subject = { id: string; name: string; discipline_id: string };
export type Board = { id: string; name: string };

export type Question = {
  id: string;
  code?: string | null;
  statement?: string | null;
  status?: string | null;
  question_type?: string | null;
  year?: number | null;
  orgao?: string | null;
  difficulty_level?: number | null;
  evaluated_topics?: string[] | null;
  image_url?: string | null;
  explanation_text?: string | null;
  review_comment?: string | null;
  created_at?: string | null;
  subjects?: {
    id: string;
    name: string;
    discipline_id?: string | null;
    disciplines?: { id: string; name: string } | null;
  } | null;
  question_subjects?: {
    subjects?: Subject & { disciplines?: { id: string; name: string } | null } | null;
  }[];
  exam_boards?: { id: string; name: string } | null;
  question_alternatives?: Alternative[];
};

export type EditableQuestion = {
  id: string;
  code: string;
  statement: string;
  status: string;
  question_type: "multiple_choice" | "true_false";
  year: string;
  orgao: string;
  difficulty_level: number | null;
  evaluated_topics: string[];
  image_url: string;
  showStatementImage: boolean;
  explanation_text: string;
  review_comment: string;
  discipline_id: string;
  subject_ids: string[];
  exam_board_id: string;
  alternatives: Alternative[];
  created_at?: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getQuestionCode(q: Question) {
  return q.code || `ET${String(q.id || "").slice(0, 4).toUpperCase()}`;
}

function relabelAlternatives(items: Alternative[]): Alternative[] {
  return items.map((a, i) => ({ ...a, label: String.fromCharCode(65 + i) }));
}

function getNextAlternativeLabel(items: Alternative[]) {
  return String.fromCharCode(65 + items.length);
}

function normalizeTrueFalseCorrectLabel(alternative?: Alternative) {
  const rawLabel = String(alternative?.label || "").trim().toLowerCase();
  const rawText = stripHtml(String(alternative?.text || "")).trim().toLowerCase();

  if (rawLabel === "c" || rawLabel === "certo" || rawText === "certo") return "C";
  if (rawLabel === "e" || rawLabel === "errado" || rawText === "errado") return "E";

  return null;
}

function trueFalseAlternatives(existing?: Alternative[]): Alternative[] {
  const correctLabel = normalizeTrueFalseCorrectLabel(existing?.find((a) => a.is_correct));
  return [
    { label: "C", text: "Certo",  image_url: "", is_correct: correctLabel === "C", order_number: 1, showImage: false },
    { label: "E", text: "Errado", image_url: "", is_correct: correctLabel === "E", order_number: 2, showImage: false },
  ];
}

export function toEditableQuestion(q: Question): EditableQuestion {
  const alternatives = [...(q.question_alternatives || [])]
    .sort((a, b) => Number(a.order_number || 0) - Number(b.order_number || 0))
    .map((a) => ({
      ...a,
      label: a.label || "",
      text: (a.text || "")
        .replace(/<strong>(imagem\s+associada\s+para\s+resolu[cç][aã]o\s+da\s+quest[aã]o)<\/strong>/gi, "$1")
        .replace(/imagem\s+associada\s+para\s+resolu[cç][aã]o\s+da\s+quest[aã]o/gi, (m) => `<strong>${m}</strong>`),
      image_url: a.image_url || "",
      is_correct: Boolean(a.is_correct),
      showImage: Boolean(a.image_url),
    }));

  const questionType = q.question_type === "true_false" ? "true_false" : "multiple_choice";
  const subjectIds = extractQuestionSubjectIds(q);
  const linkedSubjects = Array.isArray(q.question_subjects)
    ? q.question_subjects.map((qs) => qs.subjects).filter(Boolean)
    : [];
  const firstLinkedSubject = linkedSubjects[0];

  return {
    id: q.id,
    code: getQuestionCode(q),
    statement: q.statement || "",
    status: q.status || "pending_review",
    question_type: questionType,
    year: q.year ? String(q.year) : "",
    orgao: q.orgao || "",
    difficulty_level: q.difficulty_level || null,
    evaluated_topics: normalizeEvaluatedTopics(q.evaluated_topics),
    image_url: q.image_url || "",
    showStatementImage: Boolean(q.image_url),
    explanation_text: q.explanation_text || "",
    review_comment: q.review_comment?.trim() ? q.review_comment : PROFESSOR_PREFIX,
    discipline_id:
      firstLinkedSubject?.discipline_id ||
      firstLinkedSubject?.disciplines?.id ||
      q.subjects?.discipline_id ||
      q.subjects?.disciplines?.id ||
      "",
    subject_ids: subjectIds,
    exam_board_id: q.exam_boards?.id || "",
    alternatives: questionType === "true_false" ? trueFalseAlternatives(alternatives) : alternatives,
    created_at: q.created_at,
  };
}

function stripHtml(input: string) {
  return (input || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");
}

function hasInlineImage(input: string) {
  return /<img[^>]*>/i.test(input || "");
}

type DraftContentMode = "full" | "text-only";

function normalizeDraftString(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getTextDraftSignature(value: EditableQuestion) {
  return JSON.stringify({
    id: value.id,
    statement: normalizeDraftString(value.statement),
    image_url: normalizeDraftString(value.image_url),
    explanation_text: normalizeDraftString(value.explanation_text),
    evaluated_topics: normalizeEvaluatedTopics(value.evaluated_topics),
    alternatives: value.alternatives.map((alternative) => ({
      label: normalizeDraftString(alternative.label || ""),
      text: normalizeDraftString(alternative.text || ""),
      image_url: normalizeDraftString(alternative.image_url || ""),
    })),
  });
}

function hasMeaningfulDraftContent(
  value: EditableQuestion,
  baseline: EditableQuestion,
  mode: DraftContentMode,
) {
  if (mode === "text-only") {
    return getTextDraftSignature(value) !== getTextDraftSignature(baseline);
  }

  return JSON.stringify(value) !== JSON.stringify(baseline);
}

// ─── ActionModal (internal, light theme — idêntico ao de revisar) ──────────

type ActionModalState = {
  title: string;
  message: string;
  confirmLabel: string;
  variant: "approve" | "archive" | "save" | "preview";
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
} | null;

function ActionModal({ modal, onCancel }: { modal: NonNullable<ActionModalState>; onCancel: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const isApprove = modal.variant === "approve";
  const isArchive = modal.variant === "archive";
  const Icon = isApprove ? CheckCircle2 : isArchive ? Archive : modal.variant === "preview" ? Eye : Save;
  const iconBg = isApprove
    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
    : isArchive
    ? "border-red-500/25 bg-red-500/10 text-red-400"
    : "border-orange-500/25 bg-orange-500/10 text-orange-400";

  if (!mounted) return null;

  return createPortal(
    <m.div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onCancel}
    >
      <m.div
        className="relative w-full max-w-lg rounded-[1.75rem] border border-white/[0.08] bg-[#0B111C] p-7 shadow-2xl shadow-black/60"
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onCancel} disabled={modal.loading}
          className="absolute right-5 top-5 rounded-xl p-2 text-white/40 transition hover:bg-white/[0.06] hover:text-white/70 disabled:opacity-40">
          <X size={18} />
        </button>
        <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border ${iconBg}`}>
          <Icon size={22} />
        </div>
        <h2 className="text-xl font-semibold text-white/90">{modal.title}</h2>
        <p className="mt-2 text-sm leading-6 text-white/55">{modal.message}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <PremiumButton variant="secondary" onClick={onCancel} disabled={modal.loading}>Cancelar</PremiumButton>
          <PremiumButton
            variant={isArchive ? "danger" : isApprove ? "primary" : "secondary"}
            onClick={() => { void modal.onConfirm(); }}
            disabled={modal.loading}
            icon={modal.loading ? <Loader2 className="animate-spin" size={16} /> : undefined}
          >
            {modal.confirmLabel}
          </PremiumButton>
        </div>
      </m.div>
    </m.div>,
    document.body,
  );
}


// ─── ImageUrlEditor ───────────────────────────────────────────────────────────

function ImageUrlEditor({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [uploading, setUploading] = useState(false);

  async function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const items = event.clipboardData?.items || [];
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        event.preventDefault();
        const file = item.getAsFile();
        if (!file) return;
        setUploading(true);
        const reader = new FileReader();
        reader.onload = () => { onChange(String(reader.result || "")); setUploading(false); };
        reader.onerror = () => setUploading(false);
        reader.readAsDataURL(file);
        return;
      }
    }
  }

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3">
      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-white/35">{label}</label>
      <div className="flex gap-2">
        <input value={value} onChange={(e) => onChange(e.target.value)} onPaste={handlePaste}
          placeholder="Cole a imagem com Ctrl+V ou insira URL..."
          className="h-10 min-w-0 flex-1 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 text-sm text-white/70 outline-none placeholder:text-white/25 focus:border-orange-400/30 focus:ring-2 focus:ring-orange-400/[0.08]"
        />
        {value && (
          <button type="button" onClick={() => onChange("")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-500/25 bg-red-500/[0.10] text-red-400 hover:bg-red-500/[0.18]"
            title="Remover imagem">
            <Trash2 size={16} />
          </button>
        )}
      </div>
      {uploading && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-orange-500/20 bg-orange-500/[0.08] px-3 py-2 text-xs font-semibold text-orange-300">
          <Loader2 className="h-4 w-4 animate-spin" /> Processando imagem...
        </div>
      )}
      {value && (
        <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={label} className="max-h-48 w-full object-contain" />
        </div>
      )}
    </div>
  );
}

// ─── TrueFalseEditor ──────────────────────────────────────────────────────────

function TrueFalseEditor({ alternatives, onMarkCorrect }: {
  alternatives: Alternative[];
  onMarkCorrect: (index: number) => void;
}) {
  const correctIndex = alternatives.findIndex((a) => a.is_correct);
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {["Certo", "Errado"].map((label, index) => {
        const isSelected = correctIndex === index;
        const isWrong = label === "Errado";
        return (
          <button key={label} type="button" onClick={() => onMarkCorrect(index)}
            className={
              isSelected && isWrong
                ? "rounded-2xl border-2 border-red-500/40 bg-red-500/[0.10] px-5 py-4 text-left text-sm font-bold text-red-300"
              : isSelected
                ? "rounded-2xl border-2 border-emerald-500/40 bg-emerald-500/[0.10] px-5 py-4 text-left text-sm font-bold text-emerald-300"
              : isWrong
                ? "rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-4 text-left text-sm font-semibold text-white/50 hover:border-red-500/30 hover:bg-red-500/[0.08] hover:text-red-300"
                : "rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-4 text-left text-sm font-semibold text-white/50 hover:border-emerald-500/30 hover:bg-emerald-500/[0.08] hover:text-emerald-300"
            }
          >
            <span className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2">
                {isSelected && <span className="font-normal leading-none [font-family:'Segoe_UI_Emoji','Apple_Color_Emoji','Noto_Color_Emoji',sans-serif]">{OWL_MARK}</span>}
                {label}
              </span>
              {isSelected && <CheckCircle2 size={16} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── AlternativeEditor ────────────────────────────────────────────────────────

function AlternativeEditor({ alternative, index, total, isCorrect, onChange, onRemove, onMarkCorrect }: {
  alternative: Alternative;
  index: number;
  total: number;
  isCorrect: boolean;
  onChange: (updates: Partial<Alternative>) => void;
  onRemove: () => void;
  onMarkCorrect: () => void;
}) {
  const hasText = Boolean(stripHtml(alternative.text || "").trim()) || hasInlineImage(alternative.text || "");
  const hasContent = hasText || Boolean(alternative.image_url?.trim());
  const [expanded, setExpanded] = useState(!hasContent);
  const [isEliminated, setIsEliminated] = useState(false);
  const label = alternative.label || String.fromCharCode(65 + index);

  const scissorsBtn = (
    <button type="button"
      aria-label={isEliminated ? "Remover eliminação da alternativa" : "Eliminar alternativa"}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsEliminated((v) => !v); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setIsEliminated((v) => !v); } }}
      className={`absolute left-0 top-0 z-20 flex h-full w-10 items-center justify-center transition ${isEliminated ? "opacity-100" : "opacity-0 hover:opacity-100 focus:opacity-100 focus-visible:opacity-100"}`}
    >
      <PremiumScissorsIcon size={18} />
    </button>
  );

  if (!expanded) {
    return (
      <div className="group relative pl-10">
        {scissorsBtn}
        <div onClick={onMarkCorrect} className={`cursor-pointer transition ${isEliminated ? "opacity-60" : ""} ${isCorrect ? "flex items-start gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.08] px-3 py-2.5" : "flex items-start gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 hover:border-emerald-500/25 hover:bg-emerald-500/[0.05]"}`}>
          {isCorrect ? (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-emerald-500 bg-emerald-500/20 text-lg">
              <span className="block font-normal leading-none [font-family:'Segoe_UI_Emoji','Apple_Color_Emoji','Noto_Color_Emoji',sans-serif]">{OWL_MARK}</span>
            </span>
          ) : (
            <button type="button" onClick={(event) => { event.stopPropagation(); onMarkCorrect(); }} title="Marcar como correta"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/[0.15] bg-white/[0.04] text-xs font-black text-white/50 transition hover:border-emerald-500/40 hover:bg-emerald-500/[0.10] hover:text-emerald-300">
              {label}
            </button>
          )}
          <button type="button" onClick={(event) => { event.stopPropagation(); setExpanded(true); }} className="flex min-w-0 flex-1 items-start gap-2 text-left">
            <span className={`min-w-0 flex-1 break-words text-sm leading-5 ${isCorrect ? "font-semibold text-emerald-300" : "text-white/60"} ${isEliminated ? "line-through decoration-red-500 decoration-2 [&_*]:line-through [&_*]:decoration-red-500 [&_*]:decoration-2" : ""}`}>
              {stripHtml(alternative.text || "").trim() || (
                alternative.image_url?.trim() || hasInlineImage(alternative.text || "")
                  ? <span className="italic text-white/40">[ imagem ] — clique para editar</span>
                  : <span className="italic text-white/25">Vazia — clique para editar</span>
              )}
            </span>
            <ChevronDown size={13} className="mt-0.5 shrink-0 text-white/30" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative pl-10">
      {scissorsBtn}
      <div onClick={onMarkCorrect} className={`cursor-pointer transition ${isEliminated ? "opacity-60" : ""} ${isCorrect ? "rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] p-3" : "rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3 hover:border-emerald-500/25 hover:bg-emerald-500/[0.05]"}`}>
        {hasContent && (
          <div className="mb-1.5 flex justify-end">
            <button type="button" onClick={(event) => { event.stopPropagation(); setExpanded(false); }} className="inline-flex items-center gap-1 text-xs font-semibold text-white/30 hover:text-white/60">
              <ChevronDown size={12} className="rotate-180" /> Colapsar
            </button>
          </div>
        )}
        <div className="flex items-start gap-2">
          <button type="button" onClick={(event) => { event.stopPropagation(); onRemove(); }} disabled={total <= 2}
            className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/25 hover:bg-red-500/[0.12] hover:text-red-400 disabled:opacity-20">
            <X size={16} />
          </button>
          {isCorrect ? (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-emerald-500 bg-emerald-500/20 text-lg">
              <span className="block font-normal leading-none [font-family:'Segoe_UI_Emoji','Apple_Color_Emoji','Noto_Color_Emoji',sans-serif]">{OWL_MARK}</span>
            </span>
          ) : (
            <button type="button" onClick={(event) => { event.stopPropagation(); onMarkCorrect(); }} title="Marcar como correta"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/[0.15] bg-white/[0.04] text-xs font-black text-white/50 transition hover:border-emerald-500/40 hover:bg-emerald-500/[0.10] hover:text-emerald-300">
              {label}
            </button>
          )}
          <div className="min-w-0 flex-1" onClick={(event) => event.stopPropagation()}>
            <RichTextEditor
              value={alternative.text || ""}
              onChange={(v) => onChange({ text: v })}
              placeholder={`Resposta ${label}`}
              minRows={3}
              compact
              className={`w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm text-white/70 outline-none focus:ring-2 focus:ring-orange-400/[0.08] ${isEliminated ? "line-through decoration-red-500 decoration-2 [&_*]:line-through [&_*]:decoration-red-500 [&_*]:decoration-2" : ""}`}
            />
          </div>
          <button type="button" onClick={(event) => { event.stopPropagation(); onChange({ showImage: !alternative.showImage }); }}
            className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white/25 hover:bg-white/[0.06] hover:text-orange-400">
            <ImageIcon size={18} />
          </button>
        </div>
        {alternative.showImage && (
          <div className="mt-2 pl-[4.5rem]">
            <div onClick={(event) => event.stopPropagation()}>
              <ImageUrlEditor value={alternative.image_url || ""} onChange={(v) => onChange({ image_url: v })} label={`Imagem da alternativa ${label}`} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Props ─────────────────────────────────────────────────────────────────────

export type QuestionEditorProps = {
  initialQuestion: Question;
  index?: number;
  disciplines: Discipline[];
  subjects: Subject[];
  boards: Board[];
  // Draft
  storageKey?: string;
  // Feedback callbacks
  onSaved?: (message: string) => void;
  onPublished?: (questionId: string) => void;
  onArchived?: (questionId: string) => void;
  onAnnulled?: (questionId: string) => void;
  onError?: (message: string) => void;
  // Publication queue (revisar page)
  queuedForPublication?: boolean;
  onTogglePublicationQueue?: (questionId: string) => void;
  // Selection (revisar page)
  isSelected?: boolean;
  onToggleSelect?: () => void;
  // Save-all registration (revisar page "Salvar todos")
  onRegisterSave?: (
    questionId: string,
    code: string,
    handler: () => Promise<{ ok: boolean; message?: string }>,
  ) => () => void;
  /**
   * Quando true, remove a ação Publicar do rodapé.
   * Usado no popup de edição aberto a partir do Simulado, onde a questão já deve ser salva diretamente no banco.
   */
  hidePublishButton?: boolean;
  /**
   * review = salvar como pending_review. preserve = salvar preservando o status atual da questão.
   */
  saveMode?: "review" | "preserve";
  /**
   * full = qualquer alteração do editor gera rascunho.
   * text-only = usado em /questoes/revisar; só enunciado, alternativas, imagens e explicação geram rascunho.
   */
  draftContentMode?: DraftContentMode;
  /** Agrupa prompts de rascunho para evitar vários modais sobrepostos na mesma tela. */
  draftPromptGroupKey?: string;
};

// ─── QuestionEditor ───────────────────────────────────────────────────────────

export default function QuestionEditor({
  initialQuestion,
  index,
  disciplines,
  subjects,
  boards,
  storageKey,
  onSaved,
  onPublished,
  onArchived,
  onAnnulled,
  onError,
  queuedForPublication = false,
  onTogglePublicationQueue,
  isSelected = false,
  onToggleSelect,
  onRegisterSave,
  hidePublishButton = false,
  saveMode = "review",
  draftContentMode = "full",
  draftPromptGroupKey,
}: QuestionEditorProps) {
  const [question, setQuestion] = useState<EditableQuestion>(() => toEditableQuestion(initialQuestion));
  const [processing, setProcessing] = useState(false);
  const [generatingExplanation, setGeneratingExplanation] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [internalCommentOpen, setInternalCommentOpen] = useState(false);
  const [actionModal, setActionModal] = useState<ActionModalState>(null);
  const baselineDraftRef = useRef<EditableQuestion>(toEditableQuestion(initialQuestion));

  const isTrueFalse = question.question_type === "true_false";
  const isReadyToPublish = question.status === "ready_to_publish";
  const imagePending = isQuestionImagePending(question);
  const topicsPending = !hasEvaluatedTopics(question.evaluated_topics);

  const filteredSubjects = useMemo(
    () => subjects.filter((s) => s.discipline_id === question.discipline_id),
    [subjects, question.discipline_id],
  );
  const correctAlternative = useMemo(
    () => question.alternatives.find((a) => a.is_correct),
    [question.alternatives],
  );
  const isWrongTrueFalseAnswer =
    isTrueFalse && (correctAlternative?.label === "E" || String(correctAlternative?.text || "").trim().toLowerCase() === "errado");

  const selectedDiscipline = useMemo(
    () => disciplines.find((d) => d.id === question.discipline_id),
    [disciplines, question.discipline_id],
  );
  const selectedSubject = useMemo(
    () => subjects.filter((s) => question.subject_ids.includes(s.id)),
    [subjects, question.subject_ids],
  );
  const selectedBoard = useMemo(
    () => boards.find((b) => b.id === question.exam_board_id),
    [boards, question.exam_board_id],
  );

  const updateQuestion = useCallback((updates: Partial<EditableQuestion>) => {
    setQuestion((current) => ({ ...current, ...updates }));
  }, []);

  const hasDraftContent = useCallback(
    (value: EditableQuestion) => hasMeaningfulDraftContent(value, baselineDraftRef.current, draftContentMode),
    [draftContentMode],
  );

  const restoreSavedDraft = useCallback((value: EditableQuestion) => { setQuestion(value); }, []);

  const effectiveStorageKey = storageKey || `estudotop:draft:questoes:editor:${question.id}`;

  const { pendingDraft, restoreDraft: continueDraft, discardDraft, clearDraft } = useLocalDraft({
    storageKey: effectiveStorageKey,
    draft: question,
    hasContent: hasDraftContent,
    onRestore: restoreSavedDraft,
    promptGroupKey: draftPromptGroupKey,
  });

  useEffect(() => {
    const incomingOrgao = String(initialQuestion.orgao || "").trim();
    if (!incomingOrgao) return;

    setQuestion((current) => {
      if (current.id !== initialQuestion.id || current.orgao.trim()) return current;
      return { ...current, orgao: incomingOrgao };
    });
  }, [initialQuestion.id, initialQuestion.orgao]);

  const updateAlternative = useCallback((i: number, updates: Partial<Alternative>) => {
    setQuestion((current) => ({
      ...current,
      alternatives: current.alternatives.map((a, idx) => idx === i ? { ...a, ...updates } : a),
    }));
  }, []);

  const markCorrect = useCallback((i: number) => {
    setQuestion((current) => ({
      ...current,
      alternatives: current.alternatives.map((a, idx) => ({ ...a, is_correct: idx === i })),
    }));
  }, []);

  const addAlternative = useCallback(() => {
    setQuestion((current) => {
      if (current.question_type !== "multiple_choice" || current.alternatives.length >= 5) return current;
      return {
        ...current,
        alternatives: [...current.alternatives, { label: getNextAlternativeLabel(current.alternatives), text: "", image_url: "", is_correct: false, showImage: false }],
      };
    });
  }, []);

  const removeAlternative = useCallback((i: number) => {
    setQuestion((current) => {
      if (current.question_type !== "multiple_choice" || current.alternatives.length <= 2) return current;
      return { ...current, alternatives: relabelAlternatives(current.alternatives.filter((_, idx) => idx !== i)) };
    });
  }, []);

  const handleQuestionTypeChange = useCallback((value: "multiple_choice" | "true_false") => {
    setQuestion((current) => {
      if (value === "true_false") return { ...current, question_type: value, alternatives: trueFalseAlternatives(current.alternatives) };
      const mc = current.alternatives.filter((a) => a.label !== "C" && a.label !== "E");
      return {
        ...current, question_type: value,
        alternatives: mc.length >= 2 ? relabelAlternatives(mc) : [
          { label: "A", text: "", image_url: "", is_correct: false, showImage: false },
          { label: "B", text: "", image_url: "", is_correct: false, showImage: false },
          { label: "C", text: "", image_url: "", is_correct: false, showImage: false },
          { label: "D", text: "", image_url: "", is_correct: false, showImage: false },
        ],
      };
    });
  }, []);

  const validateBeforePersist = useCallback((draft: EditableQuestion) => {
    if (draft.subject_ids.length === 0) return "Selecione pelo menos um assunto da questão.";
    if (!draft.exam_board_id) return "Selecione a banca organizadora.";
    if (draft.year && !/^\d{4}$/.test(draft.year)) return "Informe um ano válido com 4 dígitos.";
    if (!stripHtml(draft.statement).trim() || stripHtml(draft.statement).trim().length < 10) return "Informe um enunciado válido.";
    if (normalizeEvaluatedTopics(draft.evaluated_topics).length === 0) return "Informe pelo menos um tópico avaliado pela questão.";
    if (!draft.alternatives.some((a) => a.is_correct)) return "Marque a resposta correta da questão.";
    if (draft.alternatives.some((a) => !stripHtml(a.text || "").trim() && !hasInlineImage(a.text || "") && !a.image_url?.trim())) return "Todas as alternativas/assertivas precisam ter texto ou imagem.";
    return null;
  }, []);

  const persistQuestion = useCallback(
    async (
      statusToSave?: "pending_review" | "ready_to_publish" | "published" | "archived",
      opts?: { silent?: boolean },
    ): Promise<{ ok: boolean; message?: string }> => {
      const err = validateBeforePersist(question);
      if (err) { if (!opts?.silent) onError?.(err); return { ok: false, message: err }; }

      setProcessing(true);
      try {
        const res = await adminFetch(`/api/admin/questions/${question.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject_id: question.subject_ids[0],
            subject_ids: question.subject_ids,
            exam_board_id: question.exam_board_id,
            statement: question.statement,
            image_url: question.image_url,
            explanation_text: question.explanation_text,
            evaluated_topics: normalizeEvaluatedTopics(question.evaluated_topics),
            year: question.year ? Number(question.year) : null,
            orgao: question.orgao.trim() || null,
            difficulty_level: question.difficulty_level,
            status: statusToSave || question.status || "pending_review",
            question_type: question.question_type,
            alternatives: question.alternatives,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.message || "Erro ao salvar questão.");

        const commentRes = await adminFetch("/api/admin/questions/review-comment", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: question.id, review_comment: question.review_comment }),
        });
        const commentData = await commentRes.json();
        if (!commentRes.ok || !commentData.ok) throw new Error(commentData.message || "Questão salva, mas o comentário interno não foi persistido.");

        setQuestion((current) => ({ ...current, status: statusToSave || current.status }));
        baselineDraftRef.current = { ...question, status: statusToSave || question.status };
        clearDraft();
        return { ok: true };
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Erro ao salvar questão.";
        if (!opts?.silent) onError?.(msg);
        return { ok: false, message: msg };
      } finally {
        setProcessing(false);
      }
    },
    [clearDraft, onError, question, validateBeforePersist],
  );

  const saveQuestion = useCallback(async () => {
    const result = await persistQuestion(saveMode === "preserve" ? undefined : "pending_review");
    if (!result.ok) return;
    onSaved?.(saveMode === "preserve" ? "Alterações salvas diretamente no banco." : "Alterações salvas. A questão permanece pendente de revisão.");
    setActionModal(null);
  }, [onSaved, persistQuestion, saveMode]);

  const publishQuestion = useCallback(async () => {
    const result = await persistQuestion("published");
    if (!result.ok) return;
    onPublished?.(question.id);
    setActionModal(null);
  }, [onPublished, persistQuestion, question.id]);

  const archiveQuestion = useCallback(async () => {
    setProcessing(true);
    try {
      const res = await adminFetch("/api/admin/questions/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [question.id], status: "archived" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || "Erro ao descartar questão.");
      onArchived?.(question.id);
      setActionModal(null);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Erro ao descartar questão.");
    } finally {
      setProcessing(false);
    }
  }, [onArchived, onError, question.id]);

  const annullQuestion = useCallback(async () => {
    const nextStatus = question.status === "annulled" ? "draft" : "annulled";
    setProcessing(true);
    try {
      const res = await adminFetch("/api/admin/questions/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [question.id], status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || "Erro ao anular questão.");
      setQuestion((q) => ({ ...q, status: nextStatus }));
      if (nextStatus === "annulled") onAnnulled?.(question.id);
      setActionModal(null);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Erro ao anular questão.");
    } finally {
      setProcessing(false);
    }
  }, [onAnnulled, onError, question.id, question.status]);

  const toggleArchiveQuestion = useCallback(async () => {
    const nextStatus = question.status === "archived" ? "draft" : "archived";
    setProcessing(true);
    try {
      const res = await adminFetch("/api/admin/questions/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [question.id], status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || "Erro ao arquivar questão.");
      setQuestion((q) => ({ ...q, status: nextStatus }));
      if (nextStatus === "archived") onArchived?.(question.id);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Erro ao arquivar questão.");
    } finally {
      setProcessing(false);
    }
  }, [onArchived, onError, question.id, question.status]);

  const openPreview = useCallback(() => {
    window.open(`/questoes/${question.id}/preview`, "_blank", "noopener,noreferrer");
    setActionModal(null);
  }, [question.id]);

  const generateExplanation = useCallback(async () => {
    if (!stripHtml(question.statement).trim()) { onError?.("Digite o enunciado antes de gerar a explicação."); return; }
    if (!question.alternatives.some((a) => a.is_correct)) { onError?.("Marque a resposta correta antes de gerar a explicação."); return; }
    setGeneratingExplanation(true);
    try {
      const res = await adminFetch("/api/admin/questions/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statement: question.statement,
          question_type: question.question_type,
          alternatives: question.alternatives,
          discipline: selectedDiscipline?.name || "",
          subject: selectedSubject.map((s) => s.name).join(", "),
          board: selectedBoard?.name || "",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || "Erro ao gerar explicação com IA.");
      setQuestion((current) => ({ ...current, explanation_text: data.explanation || "" }));
      onSaved?.(question.explanation_text?.trim() ? "Explicação melhorada com IA. Revise e salve." : "Explicação gerada com IA. Revise e salve.");
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Erro ao gerar explicação com IA.");
    } finally {
      setGeneratingExplanation(false);
    }
  }, [onError, onSaved, question.alternatives, question.explanation_text, question.question_type, question.statement, selectedBoard, selectedDiscipline, selectedSubject]);

  useEffect(() => {
    if (!onRegisterSave) return;
    return onRegisterSave(question.id, question.code, () => persistQuestion("pending_review", { silent: true }));
  }, [onRegisterSave, persistQuestion, question.id, question.code]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="relative isolate">
      {question.status === "annulled" && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center overflow-hidden rounded-[2rem]">
          <span className="select-none whitespace-nowrap text-[5rem] font-black tracking-[0.25em] text-red-500/20 rotate-[-25deg] uppercase leading-none">ANULADA</span>
        </div>
      )}
      {imagePending ? (
        <>
          <div className="pointer-events-none absolute -inset-[10px] -z-10 rounded-[2.5rem] bg-gradient-to-b from-blue-400/30 via-cyan-400/10 to-transparent blur-[32px]" />
          <div className="pointer-events-none absolute -inset-[2px] -z-10 rounded-[2.25rem] bg-gradient-to-b from-blue-300/50 via-blue-400/10 to-transparent blur-[8px]" />
        </>
      ) : topicsPending ? (
        <>
          <div className="pointer-events-none absolute -inset-[10px] -z-10 rounded-[2.5rem] bg-gradient-to-b from-amber-400/30 via-yellow-400/10 to-transparent blur-[32px]" />
          <div className="pointer-events-none absolute -inset-[2px] -z-10 rounded-[2.25rem] bg-gradient-to-b from-amber-300/50 via-amber-400/10 to-transparent blur-[8px]" />
        </>
      ) : (
        <div className="pointer-events-none absolute -inset-[3px] -z-10 rounded-[2.25rem] bg-gradient-to-b from-orange-400/[0.07] via-white/[0.025] to-transparent blur-[14px]" />
      )}

      <article
        data-question-editor
        data-question-id={question.id}
        className={`overflow-hidden rounded-[2rem] border backdrop-blur-sm transition-all duration-300 ${
          isSelected
            ? "border-violet-500/40 bg-white/[0.04] shadow-xl shadow-black/30 ring-1 ring-violet-500/20"
            : queuedForPublication
              ? "border-amber-500/30 bg-white/[0.03] shadow-xl shadow-black/30 ring-1 ring-amber-500/15"
              : imagePending
                ? "border-blue-400/60 bg-white/[0.03] shadow-2xl shadow-blue-900/40 ring-2 ring-blue-400/25"
                : topicsPending
                  ? "border-amber-400/60 bg-white/[0.03] shadow-2xl shadow-amber-900/40 ring-2 ring-amber-400/25"
                  : "border-white/[0.07] bg-white/[0.03] shadow-xl shadow-black/30 hover:-translate-y-0.5 hover:border-white/[0.12]"
        }`}
      >
        <DraftRestoreModal
          open={Boolean(pendingDraft)}
          savedAt={pendingDraft?.savedAt}
          onContinue={continueDraft}
          onDiscard={discardDraft}
        />

        <AP>
          {actionModal && (
            <ActionModal
              modal={{ ...actionModal, loading: processing }}
              onCancel={() => { if (!processing) setActionModal(null); }}
            />
          )}
        </AP>

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-6 py-4">
          <div className="flex flex-wrap items-center gap-2">
            {onToggleSelect && (
              <button type="button" onClick={onToggleSelect}
                aria-label={isSelected ? "Desmarcar questão" : "Selecionar"}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition ${isSelected ? "border-orange-400 bg-orange-400 text-white" : "border-white/[0.15] bg-white/[0.04] text-transparent hover:border-orange-400/50 hover:bg-orange-400/[0.08] hover:text-orange-400/60"}`}
              >
                <Check size={12} />
              </button>
            )}

            <button type="button" onClick={() => navigator.clipboard.writeText(question.code)} title="Copiar código"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.12] bg-white/[0.07] px-3 py-1 text-xs font-bold text-white/80 transition hover:bg-white/[0.12] active:scale-95">
              {question.code}
            </button>

            {isReadyToPublish ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/[0.12] px-3 py-1 text-xs font-semibold text-emerald-300">
                <CheckCircle2 size={12} /> Na fila de publicação
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/[0.10] px-3 py-1 text-xs font-semibold text-amber-300">
                Pendente revisão
              </span>
            )}

            {question.difficulty_level ? (
              <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-500/25 bg-amber-500/[0.08] px-2.5 py-0.5 text-amber-400">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} size={10} className={i < question.difficulty_level! ? "fill-current" : "text-amber-900/50"} />
                ))}
              </span>
            ) : (
              <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-0.5 text-xs font-semibold text-white/30">Sem dificuldade</span>
            )}

            {imagePending && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/60 bg-blue-500/25 px-3 py-1 text-xs font-bold text-blue-200 shadow-sm shadow-blue-500/30">
                <ImageIcon size={12} className="text-blue-300" /> ⚠ Imagem ausente
              </span>
            )}

            {topicsPending && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/60 bg-amber-500/25 px-3 py-1 text-xs font-bold text-amber-200 shadow-sm shadow-amber-500/30">
                ⚠ Sem tópicos avaliados
              </span>
            )}

            {index !== undefined && (
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/25">
                #{String(index + 1).padStart(2, "0")}
              </span>
            )}
          </div>

          <button type="button"
            onClick={() => setActionModal({ title: "Visualizar no simulado", message: "Abrir a prévia desta questão em uma nova aba?", confirmLabel: "Abrir prévia", variant: "preview", onConfirm: openPreview })}
            disabled={processing}
            className="inline-flex items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.05] px-3 py-2 text-xs font-semibold text-white/60 transition hover:border-orange-400/30 hover:bg-orange-400/[0.08] hover:text-orange-300 disabled:opacity-50">
            <Eye size={14} /> Visualizar
          </button>
        </div>

        {/* Metadata bar */}
        <div className="grid gap-3 border-b border-white/[0.06] bg-white/[0.02] px-6 py-4 md:grid-cols-2 xl:grid-cols-7">
          <SearchableSelect
            label="Tipo"
            value={question.question_type}
            onChange={(v) => handleQuestionTypeChange(v as "multiple_choice" | "true_false")}
            options={[
              { value: "multiple_choice", label: "Alternativas" },
              { value: "true_false", label: "Assertivas" },
            ]}
            dark
          />
          <SearchableSelect
            label="Disciplina"
            value={question.discipline_id || ""}
            onChange={(v) => updateQuestion({ discipline_id: v, subject_ids: [] })}
            options={[{ value: "", label: "Todas" }, ...disciplines.map((d) => ({ value: d.id, label: d.name }))]}
            dark
          />
          <SubjectMultiSelect
            subjects={filteredSubjects}
            selectedIds={question.subject_ids}
            onChange={(ids) => updateQuestion({ subject_ids: ids })}
            emptyLabel="Adicionar assunto"
            disciplineId={question.discipline_id}
            dark
          />
          <SearchableSelect
            label="Banca"
            value={question.exam_board_id || ""}
            onChange={(v) => updateQuestion({ exam_board_id: v })}
            options={[{ value: "", label: "Selecione" }, ...boards.map((b) => ({ value: b.id, label: b.name }))]}
            dark
          />
          <div>
            <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Ano</label>
            <input
              value={question.year}
              inputMode="numeric"
              onChange={(e: ChangeEvent<HTMLInputElement>) => updateQuestion({ year: e.target.value.replace(/\D/g, "").slice(0, 4) })}
              placeholder="Ex.: 2026"
              className="h-11 w-full rounded-2xl border border-white/[0.08] bg-[#0D1926] px-3 text-sm font-semibold text-white/80 outline-none transition placeholder:text-white/25 hover:border-white/[0.15] focus:border-orange-400/40 focus:ring-2 focus:ring-orange-400/[0.08]"
            />
          </div>
          <div>
            <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Órgão</label>
            <input
              value={question.orgao}
              onChange={(e: ChangeEvent<HTMLInputElement>) => updateQuestion({ orgao: e.target.value.replace(/\s+/g, " ").trimStart() })}
              placeholder="Ex.: PC-RR"
              className="h-11 w-full rounded-2xl border border-white/[0.08] bg-[#0D1926] px-3 text-sm font-semibold text-white/80 outline-none transition placeholder:text-white/25 hover:border-white/[0.15] focus:border-orange-400/40 focus:ring-2 focus:ring-orange-400/[0.08]"
            />
          </div>
          <div>
            <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Dificuldade</label>
            <div className="flex h-11 items-center gap-1 rounded-2xl border border-white/[0.08] bg-[#0D1926] px-3">
              {[1, 2, 3, 4, 5].map((star) => (
                <button key={star} type="button"
                  onClick={() => updateQuestion({ difficulty_level: question.difficulty_level === star ? null : star })}
                  className={question.difficulty_level && star <= question.difficulty_level ? "text-amber-400" : "text-white/20 hover:text-amber-400/60"}>
                  <Star size={18} fill={question.difficulty_level && star <= question.difficulty_level ? "currentColor" : "none"} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Enunciado</p>
            <div className="mb-3">
              <RichTextEditor
                value={question.statement}
                onChange={(v) => updateQuestion({ statement: v })}
                placeholder={isTrueFalse ? "Digite a assertiva para o aluno julgar..." : "Digite o enunciado da questão..."}
                minRows={3}
                className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-base text-white/80 outline-none focus:ring-2 focus:ring-orange-400/[0.08]"
              />
            </div>

            <div className="mb-3 flex justify-end">
              <button type="button"
                onClick={() => updateQuestion({ showStatementImage: !question.showStatementImage })}
                className="inline-flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/50 hover:border-orange-400/30 hover:text-orange-300">
                <ImageIcon size={14} />
                {question.showStatementImage ? "Remover imagem" : "Imagem do enunciado"}
              </button>
            </div>

            {question.showStatementImage && (
              <ImageUrlEditor value={question.image_url} onChange={(v) => updateQuestion({ image_url: v })} label="Imagem abaixo do enunciado" />
            )}

            {isTrueFalse ? (
              <TrueFalseEditor alternatives={question.alternatives} onMarkCorrect={markCorrect} />
            ) : (
              <div className="mt-4 space-y-2.5">
                {question.alternatives.map((alt, i) => (
                  <AlternativeEditor
                    key={alt.id || `${alt.label}-${i}`}
                    alternative={alt}
                    index={i}
                    total={question.alternatives.length}
                    isCorrect={Boolean(alt.is_correct)}
                    onChange={(updates) => updateAlternative(i, updates)}
                    onRemove={() => removeAlternative(i)}
                    onMarkCorrect={() => markCorrect(i)}
                  />
                ))}
                {question.alternatives.length < 5 && (
                  <button type="button" onClick={addAlternative}
                    className="ml-10 mt-3 inline-flex items-center gap-2 rounded-xl border border-dashed border-white/[0.10] bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-white/40 transition hover:border-orange-400/30 hover:bg-orange-400/[0.06] hover:text-orange-300">
                    <Plus size={16} /> Adicionar resposta {getNextAlternativeLabel(question.alternatives)}
                  </button>
                )}
              </div>
            )}

            {/* Gabarito */}
            <div className={`mt-5 flex items-center gap-3 rounded-xl border px-4 py-3 ${isWrongTrueFalseAnswer ? "border-red-500/25 bg-red-500/[0.08]" : "border-emerald-500/25 bg-emerald-500/[0.08]"}`}>
              <ShieldCheck size={16} className={`shrink-0 ${isWrongTrueFalseAnswer ? "text-red-400" : "text-emerald-400"}`} />
              <span className={`text-sm font-bold ${isWrongTrueFalseAnswer ? "text-red-300" : "text-emerald-300"}`}>Gabarito:</span>
              <span className={`text-sm ${isWrongTrueFalseAnswer ? "text-red-300/80" : "text-emerald-300/80"}`}>
                {isTrueFalse
                  ? correctAlternative?.label === "C" ? "Certo" : (correctAlternative?.label === "E" || String(correctAlternative?.text || "").trim().toLowerCase() === "errado") ? "Errado" : "Não informado"
                  : correctAlternative?.label ? `Alternativa ${correctAlternative.label}` : "Não informado"}
              </span>
            </div>
          </div>

          {/* Tópicos avaliados */}
          <div className="relative mt-4 isolate">
            <div className="pointer-events-none absolute -inset-[3px] -z-10 rounded-2xl bg-gradient-to-b from-blue-400/25 via-blue-400/[0.06] to-transparent blur-[10px]" />
            <div className="rounded-2xl border border-blue-400/30 bg-blue-500/[0.05] p-4 shadow-inner shadow-blue-950/20">
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-200">Tópicos avaliados</label>
                <span className="text-[10px] font-semibold text-blue-200/60">Obrigatório para salvar/publicar</span>
              </div>
              <EvaluatedTopicsInput
                value={question.evaluated_topics}
                onChange={(evaluated_topics) => updateQuestion({ evaluated_topics })}
                subjectId={question.subject_ids[0] || null}
                required
                disabled={processing}
                variant="dark"
                placeholder="Ex.: Memória RAM, Placa-mãe"
              />
            </div>
          </div>

          {/* Comentários */}
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
              <button type="button" onClick={() => setCommentsOpen((o) => !o)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/[0.03]">
                <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-white/50">
                  <MessageSquareText size={14} className="text-orange-400" />
                  Explicação para o aluno
                  {question.explanation_text?.trim()
                    ? <span className="rounded-full border border-emerald-500/25 bg-emerald-500/[0.10] px-2 py-0.5 text-[10px] text-emerald-300">Possui conteúdo</span>
                    : <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/35">Inserir comentários</span>}
                </span>
                <ChevronDown className={`h-5 w-5 text-orange-400 transition ${commentsOpen ? "rotate-180" : "animate-bounce"}`} />
              </button>
              {commentsOpen && (
                <div className="border-t border-white/[0.06] p-4">
                  <div className="mb-3 flex justify-end">
                    <button type="button" onClick={generateExplanation} disabled={processing || generatingExplanation}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/[0.10] px-3 py-1.5 text-xs font-semibold text-violet-300 transition hover:border-violet-500/50 hover:bg-violet-500/[0.18] disabled:opacity-60">
                      {generatingExplanation ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      {question.explanation_text?.trim() ? "Melhorar com IA" : "Gerar com IA"}
                    </button>
                  </div>
                  <RichTextEditor
                    value={question.explanation_text}
                    onChange={(v) => updateQuestion({ explanation_text: v })}
                    placeholder="Explicação que poderá aparecer para o aluno..."
                    minRows={3}
                    compact
                    className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm text-white/70 outline-none focus:ring-2 focus:ring-orange-400/[0.08]"
                  />
                  {question.explanation_text?.trim() ? <ExplanationAuthorCard /> : null}
                </div>
              )}
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
              <button type="button" onClick={() => setInternalCommentOpen((o) => !o)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/[0.03]">
                <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-white/50">
                  <MessageSquareText size={14} className="text-white/30" />
                  Comentário interno
                  {question.review_comment?.trim()
                    ? <span className="rounded-full border border-emerald-500/25 bg-emerald-500/[0.10] px-2 py-0.5 text-[10px] text-emerald-300">Possui conteúdo</span>
                    : <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/35">Inserir comentários</span>}
                </span>
                <ChevronDown className={`h-5 w-5 text-white/40 transition ${internalCommentOpen ? "rotate-180" : "animate-bounce"}`} />
              </button>
              {internalCommentOpen && (
                <div className="border-t border-white/[0.06] p-4">
                  <RichTextEditor
                    value={question.review_comment}
                    onChange={(v) => updateQuestion({ review_comment: v })}
                    placeholder="Observações internas sobre esta questão..."
                    minRows={3}
                    compact
                    className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm text-white/70 outline-none focus:ring-2 focus:ring-orange-400/[0.08]"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 z-10 flex flex-col gap-3 rounded-b-[2rem] border-t border-white/[0.06] bg-black/10 px-6 py-4 backdrop-blur-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          {!isReadyToPublish && onTogglePublicationQueue && (
            <button type="button" onClick={() => onTogglePublicationQueue(question.id)} disabled={processing}
              className={`mr-auto inline-flex items-center gap-2.5 rounded-xl border px-4 py-2 text-sm font-bold transition disabled:opacity-50 ${queuedForPublication ? "border-amber-500/30 bg-amber-500/[0.12] text-amber-300" : "border-white/[0.09] bg-white/[0.04] text-white/50 hover:border-amber-500/30 hover:bg-amber-500/[0.08] hover:text-amber-300"}`}
            >
              <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${queuedForPublication ? "bg-amber-500/60" : "bg-white/[0.12]"}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white/90 shadow-sm transition-transform duration-200 ${queuedForPublication ? "translate-x-4" : "translate-x-0.5"}`} />
              </span>
              Preparar para fila
            </button>
          )}

          <button type="button" disabled={processing}
            onClick={() => setActionModal({ title: "Descartar questão", message: "A questão será arquivada e removida desta lista.", confirmLabel: "Descartar", variant: "archive", onConfirm: archiveQuestion })}
            className="inline-flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/[0.08] px-4 py-2.5 text-sm font-semibold text-red-400 transition hover:border-red-500/40 hover:bg-red-500/[0.14] hover:text-red-300 disabled:opacity-40">
            {processing ? <Loader2 className="animate-spin" size={15} /> : <Archive size={15} />} Descartar
          </button>

          <button type="button" disabled={processing}
            onClick={() => setActionModal({
              title: question.status === "annulled" ? "Reativar questão" : "Anular questão",
              message: question.status === "annulled"
                ? "A questão voltará para rascunho e poderá ser usada em simulados novamente."
                : "A questão será marcada como anulada, ficará inutilizável em simulados e exibirá marca d'água.",
              confirmLabel: question.status === "annulled" ? "Reativar" : "Anular",
              variant: question.status === "annulled" ? "approve" : "archive",
              onConfirm: annullQuestion,
            })}
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition disabled:opacity-40 ${
              question.status === "annulled"
                ? "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-400 hover:border-emerald-500/40 hover:bg-emerald-500/[0.14] hover:text-emerald-300"
                : "border-amber-500/25 bg-amber-500/[0.08] text-amber-400 hover:border-amber-500/40 hover:bg-amber-500/[0.14] hover:text-amber-300"
            }`}>
            {processing ? <Loader2 className="animate-spin" size={15} /> : question.status === "annulled" ? <CheckCircle2 size={15} /> : <Ban size={15} />}
            {question.status === "annulled" ? "Reativar" : "Anular"}
          </button>

          <button type="button" disabled={processing}
            onClick={toggleArchiveQuestion}
            className="inline-flex items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white/70 transition hover:border-white/[0.15] hover:bg-white/[0.10] hover:text-white/90 disabled:opacity-40">
            {processing ? <Loader2 className="animate-spin" size={15} /> : question.status === "archived" ? <ArchiveRestore size={15} /> : <Archive size={15} />}
            {question.status === "archived" ? "Desarquivar" : "Arquivar"}
          </button>

          <button type="button" disabled={processing}
            onClick={() => setActionModal({
              title: saveMode === "preserve" ? "Salvar questão" : "Salvar revisão",
              message: saveMode === "preserve" ? "Persistir as alterações diretamente no banco?" : "Persistir as alterações e manter a questão pendente de revisão?",
              confirmLabel: "Salvar",
              variant: "save",
              onConfirm: saveQuestion,
            })}
            className="inline-flex items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.06] px-5 py-2.5 text-sm font-bold text-white/70 transition hover:border-white/[0.15] hover:bg-white/[0.10] hover:text-white/90 disabled:opacity-50">
            {processing ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />} Salvar
          </button>

          {!hidePublishButton && (
            <button type="button" disabled={processing}
              onClick={() => setActionModal({ title: "Publicar questão", message: "Salvar as alterações e publicar esta questão? Requer ano e dificuldade definidos.", confirmLabel: "Salvar e publicar", variant: "approve", onConfirm: publishQuestion })}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 px-6 py-2.5 text-sm font-bold text-slate-950 shadow-md shadow-orange-900/40 transition hover:from-orange-600 hover:to-amber-500 active:scale-[0.98] disabled:opacity-50">
              {processing ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />} Publicar
            </button>
          )}
        </div>
      </article>
    </div>
  );
}
