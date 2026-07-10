"use client";

import { ChangeEvent, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronDown,
  FileQuestion,
  ImageIcon,
  Scissors,
  Send,
  ShieldAlert,
  Sparkles,
  Star,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import PageBackground from "../../../components/ui/PageBackground";
import PageHeader from "../../../components/ui/PageHeader";
import PremiumButton from "../../../components/ui/PremiumButton";
import PremiumCard from "../../../components/ui/PremiumCard";
import PremiumInput from "../../../components/ui/PremiumInput";
import PremiumLoadingOverlay from "../../../components/ui/PremiumLoadingOverlay";
import RichTextEditor from "../../../components/questions/RichTextEditor";
import PremiumDifficultyStars from "@/app/components/questions/PremiumDifficultyStars";
import { adminFetch } from "@/app/lib/supabase/adminFetch";
import QuestionActionModal, {
  type QuestionActionModalState,
} from "../../../components/questions/QuestionActionModal";
import { isQuestionImagePending } from "@/lib/questions/image-pending";
import { qCard } from "@/lib/ui/question-tokens";

const OWL_MARK = "\u{1F989}\uFE0F";

type Feedback = {
  type: "success" | "error" | "warning";
  message: string;
} | null;

type GeneratedAlternative = {
  label: string;
  text: string;
  is_correct: boolean;
  image_url?: string | null;
  showImage?: boolean;
};

type GeneratedQuestion = {
  temp_id: string;
  statement: string;
  question_type: "multiple_choice" | "true_false";
  board_name: string;
  exam_board_id: string;
  inspiring_board_name?: string;
  inspiring_exam_board_id?: string;
  source_question_id?: string;
  source_question_code?: string | null;
  discipline_id: string;
  discipline_name: string;
  subject_id: string;
  subject_ids?: string[];
  subject_name: string;
  difficulty_level: number | null;
  explanation_text: string;
  alternatives: GeneratedAlternative[];
  is_duplicate?: boolean;
  duplicate_message?: string;
  duplicate_of?: unknown;
  source_origin?: string;
};

type SourceAlternative = {
  id?: string;
  label?: string | null;
  text?: string | null;
  is_correct?: boolean | null;
  order_number?: number | null;
};

type SourceQuestion = {
  id: string;
  code?: string | null;
  statement: string;
  status?: string | null;
  question_type?: string | null;
  difficulty_level?: number | null;
  year?: number | null;
  explanation_text?: string | null;
  exam_boards?: { id: string; name: string } | null;
  subjects?: {
    id: string;
    name: string;
    disciplines?: { id: string; name: string } | null;
  } | null;
  question_subjects?: Array<{
    subjects?: {
      id: string;
      name: string;
      disciplines?: { id: string; name: string } | null;
    } | null;
  }>;
  question_alternatives?: SourceAlternative[];
};

type ConfirmAction = {
  title: string;
  message: string;
  confirmLabel: string;
  variant?: "primary" | "danger";
  onConfirm: () => Promise<void> | void;
} | null;

export default function GerarVariacoesQuestaoClient({
  question,
}: {
  question: SourceQuestion;
}) {
  const [quantity, setQuantity] = useState("5");
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [includeExplanations, setIncludeExplanations] = useState(true);
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [generatedCount, setGeneratedCount] = useState(0);
  const [sentCount, setSentCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [confirm, setConfirm] = useState<ConfirmAction>(null);
  const [actionModal, setActionModal] =
    useState<QuestionActionModalState>(null);

  const selectedQuestions = useMemo(() => {
    return questions.filter(
      (item) => selectedIds.includes(item.temp_id) && !item.is_duplicate,
    );
  }, [questions, selectedIds]);

  const sourceAlternatives = useMemo(() => {
    return [...(question.question_alternatives || [])].sort(
      (a, b) => Number(a.order_number || 0) - Number(b.order_number || 0),
    );
  }, [question.question_alternatives]);

  const subjectNames = useMemo(() => {
    const fromPivot = (question.question_subjects || [])
      .map((item) => item.subjects?.name)
      .filter(Boolean) as string[];

    if (fromPivot.length) return fromPivot;
    return question.subjects?.name ? [question.subjects.name] : [];
  }, [question.question_subjects, question.subjects]);

  const duplicateCount = questions.filter((item) => item.is_duplicate).length;
  const pendingCount = questions.length;
  const progressPercent =
    generatedCount > 0
      ? Math.round(((sentCount + rejectedCount) / generatedCount) * 100)
      : 0;

  function wait(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  const sendReviewSteps = [
    "Preparando variações",
    "Validando gabaritos",
    "Preservando assunto da questão-modelo",
    "Salvando no banco",
    "Enviando para revisão",
  ];

  function relabelAlternatives(
    alternatives: GeneratedAlternative[],
    questionType: GeneratedQuestion["question_type"],
  ) {
    return alternatives.map((alternative, index) => ({
      ...alternative,
      label:
        questionType === "true_false"
          ? index === 0
            ? "CERTO"
            : "ERRADO"
          : String.fromCharCode(65 + index),
    }));
  }

  function toggleSelected(id: string) {
    if (saving) return;

    const target = questions.find((item) => item.temp_id === id);
    if (target?.is_duplicate) return;

    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function toggleExpanded(id: string) {
    setExpandedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function selectAllValid() {
    setSelectedIds(
      questions
        .filter((item) => !item.is_duplicate)
        .map((item) => item.temp_id),
    );
  }

  function removeQuestions(ids: string[], countAsRejected = true) {
    const idSet = new Set(ids);
    setQuestions((current) =>
      current.filter((item) => !idSet.has(item.temp_id)),
    );
    setSelectedIds((current) => current.filter((id) => !idSet.has(id)));
    setExpandedIds((current) => current.filter((id) => !idSet.has(id)));

    if (countAsRejected) {
      setRejectedCount((current) => current + ids.length);
    }
  }

  function updateGeneratedQuestion(
    id: string,
    updates: Partial<GeneratedQuestion>,
  ) {
    setQuestions((current) =>
      current.map((item) =>
        item.temp_id === id ? { ...item, ...updates } : item,
      ),
    );
  }

  function updateGeneratedAlternative(
    questionId: string,
    index: number,
    updates: Partial<GeneratedAlternative>,
  ) {
    setQuestions((current) =>
      current.map((item) => {
        if (item.temp_id !== questionId) return item;

        return {
          ...item,
          alternatives: item.alternatives.map((alternative, altIndex) =>
            altIndex === index ? { ...alternative, ...updates } : alternative,
          ),
        };
      }),
    );
  }

  function rejectQuestion(target: GeneratedQuestion) {
    if (saving) return;

    setConfirm({
      title: "Descartar variação",
      message: "Essa variação sairá da lista e não será salva no banco.",
      confirmLabel: "Descartar",
      variant: "danger",
      onConfirm: () => {
        removeQuestions([target.temp_id]);
        setFeedback({ type: "success", message: "Variação descartada." });
        setConfirm(null);
      },
    });
  }

  async function handleGenerate() {
    setFeedback(null);

    const parsedQuantity = Number(quantity);

    if (!parsedQuantity || parsedQuantity < 1 || parsedQuantity > 20) {
      setFeedback({
        type: "error",
        message: "Informe uma quantidade entre 1 e 20 questões.",
      });
      return;
    }

    setGenerating(true);

    try {
      const response = await fetch(
        `/api/admin/questions/${question.id}/variations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quantity: parsedQuantity,
            difficulty_level: difficulty,
            include_explanations: includeExplanations,
            additional_instructions: additionalInstructions,
          }),
        },
      );

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Erro ao gerar variações com IA.");
      }

      const generated = (result.questions || []) as GeneratedQuestion[];

      setQuestions(generated);
      setSelectedIds([]);
      setExpandedIds(generated.map((item) => item.temp_id));
      setGeneratedCount(generated.length);
      setSentCount(0);
      setRejectedCount(0);

      setFeedback({
        type: "success",
        message:
          result.message ||
          "Variações geradas. Revise antes de enviar para revisão.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Erro ao gerar variações com IA.",
      });
    } finally {
      setGenerating(false);
    }
  }

  function requestSendToReview(targetQuestions: GeneratedQuestion[]) {
    if (saving) return;

    const allowedQuestions = targetQuestions.filter(
      (item) => !item.is_duplicate,
    );

    if (allowedQuestions.length === 0) {
      setActionModal({
        open: true,
        tone: "warning",
        title: "Nenhuma variação válida",
        message:
          "Variações marcadas como muito parecidas não podem ser enviadas para revisão.",
        onClose: () => setActionModal(null),
      });
      return;
    }

    setActionModal({
      open: true,
      tone: "review",
      title: "Enviar para revisão",
      message: `Confirma enviar ${allowedQuestions.length} variação(ões) para a fila de revisão? Só agora elas serão salvas no banco.`,
      primaryLabel: "Enviar",
      secondaryLabel: "Cancelar",
      onClose: () => setActionModal(null),
      onSecondary: () => setActionModal(null),
      onPrimary: () => sendToReview(allowedQuestions),
    });
  }

  async function sendToReview(targetQuestions: GeneratedQuestion[]) {
    setFeedback(null);
    setConfirm(null);
    setSaving(true);
    setActionModal({
      open: true,
      tone: "review",
      title: "Enviando variações para revisão",
      message:
        "O sistema está salvando as questões no banco com o mesmo assunto da questão-modelo.",
      loading: true,
      steps: sendReviewSteps,
      currentStep: 0,
      onClose: () => setActionModal(null),
    });

    const sentIds = new Set(targetQuestions.map((item) => item.temp_id));

    setQuestions((current) =>
      current.filter((item) => !sentIds.has(item.temp_id)),
    );
    setSelectedIds((current) => current.filter((id) => !sentIds.has(id)));
    setExpandedIds((current) => current.filter((id) => !sentIds.has(id)));

    try {
      await wait(140);
      setActionModal((current) =>
        current ? { ...current, currentStep: 1 } : current,
      );
      await wait(140);
      setActionModal((current) =>
        current ? { ...current, currentStep: 2 } : current,
      );
      await wait(140);
      setActionModal((current) =>
        current ? { ...current, currentStep: 3 } : current,
      );

      const sourceSubjectIds = sourceSubjectIdsForSave(question);

      const response = await adminFetch("/api/admin/questions/import/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questions: targetQuestions.map((item) => ({
            ...item,
            board_name: "Estudo TOP",
            subject_id: sourceSubjectIds[0] || item.subject_id || "",
            subject_ids: sourceSubjectIds.length
              ? sourceSubjectIds
              : item.subject_ids || [item.subject_id].filter(Boolean),
            source_origin: "generate_ai",
          })),
          discipline_id: targetQuestions[0]?.discipline_id || "",
          subject_id:
            sourceSubjectIds[0] || targetQuestions[0]?.subject_id || "",
          subject_ids: sourceSubjectIds.length
            ? sourceSubjectIds
            : targetQuestions[0]?.subject_ids ||
              [targetQuestions[0]?.subject_id].filter(Boolean),
          year: new Date().getFullYear(),
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message || "Erro ao enviar variações para revisão.",
        );
      }

      setActionModal((current) =>
        current ? { ...current, currentStep: 4 } : current,
      );
      await wait(180);

      const savedCount = Number(
        result.saved_count ?? result.savedCount ?? targetQuestions.length,
      );
      const rejectedByBackend = Math.max(
        targetQuestions.length - savedCount,
        0,
      );

      setSentCount((current) => current + savedCount);

      if (rejectedByBackend > 0) {
        setRejectedCount((current) => current + rejectedByBackend);
      }

      setActionModal({
        open: true,
        tone: "success",
        title: "Variações enviadas",
        message:
          result.message ||
          `${savedCount} variação(ões) enviada(s) para revisão.`,
        primaryLabel: "Concluir",
        onClose: () => setActionModal(null),
        onPrimary: () => setActionModal(null),
      });
    } catch (error) {
      setQuestions((current) => [...targetQuestions, ...current]);
      setSelectedIds((current) => [
        ...current,
        ...targetQuestions
          .filter((item) => !item.is_duplicate)
          .map((item) => item.temp_id),
      ]);
      setExpandedIds((current) => [
        ...current,
        ...targetQuestions.map((item) => item.temp_id),
      ]);
      setActionModal({
        open: true,
        tone: "error",
        title: "Erro ao enviar para revisão",
        message:
          error instanceof Error
            ? error.message
            : "Erro ao enviar para revisão.",
        onClose: () => setActionModal(null),
      });
    } finally {
      setSaving(false);
    }
  }

  function sourceSubjectIdsForSave(source: SourceQuestion) {
    const fromPivot = (source.question_subjects || [])
      .map((item) => item.subjects?.id)
      .filter(Boolean) as string[];

    if (fromPivot.length) return Array.from(new Set(fromPivot));
    return source.subjects?.id ? [source.subjects.id] : [];
  }

  function markAlternativeCorrect(
    questionId: string,
    alternativeIndex: number,
  ) {
    setQuestions((current) =>
      current.map((item) => {
        if (item.temp_id !== questionId) return item;

        return {
          ...item,
          alternatives: item.alternatives.map((alternative, index) => ({
            ...alternative,
            is_correct: index === alternativeIndex,
          })),
        };
      }),
    );
  }

  function removeGeneratedAlternative(
    questionId: string,
    alternativeIndex: number,
  ) {
    setQuestions((current) =>
      current.map((item) => {
        if (item.temp_id !== questionId || item.alternatives.length <= 2)
          return item;

        const nextAlternatives = item.alternatives.filter(
          (_, index) => index !== alternativeIndex,
        );
        const hasCorrect = nextAlternatives.some(
          (alternative) => alternative.is_correct,
        );

        return {
          ...item,
          alternatives: relabelAlternatives(
            nextAlternatives.map((alternative, index) => ({
              ...alternative,
              is_correct: hasCorrect ? alternative.is_correct : index === 0,
            })),
            item.question_type,
          ),
        };
      }),
    );
  }

  function addGeneratedAlternative(questionId: string) {
    setQuestions((current) =>
      current.map((item) => {
        if (
          item.temp_id !== questionId ||
          item.question_type === "true_false" ||
          item.alternatives.length >= 5
        )
          return item;

        return {
          ...item,
          alternatives: relabelAlternatives(
            [...item.alternatives, { label: "", text: "", is_correct: false }],
            item.question_type,
          ),
        };
      }),
    );
  }

  return (
    <PageBackground>
      <PremiumLoadingOverlay
        show={generating}
        title="Gerando variações com IA..."
        message="A IA está criando questões diferentes da questão-modelo e conferindo gabarito, plausibilidade e originalidade."
      />

      <QuestionActionModal modal={actionModal} />

      {confirm && (
        <ConfirmModal
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          variant={confirm.variant}
          onCancel={() => setConfirm(null)}
          onConfirm={confirm.onConfirm}
          disabled={saving}
        />
      )}

      <PageHeader
        title="Gerar variações"
        description="Crie novas questões a partir de uma questão publicada, mantendo o tema e mudando enunciado, abordagem, tamanho e dificuldade."
        action={
          <Link href="/questoes">
            <PremiumButton variant="secondary" icon={<ArrowLeft size={18} />}>
              Voltar
            </PremiumButton>
          </Link>
        }
      />

      {feedback && <Notice feedback={feedback} />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_370px]">
        <div className="space-y-6">
          <PremiumCard
            title="Questão-modelo"
            description="As variações usam esta questão apenas como referência temática."
            icon={<FileQuestion size={18} />}
          >
            <div className="rounded-[2rem] border border-slate-200 bg-slate-50 p-5">
              <div className="mb-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-bold text-orange-700">
                  {question.code || `Q${question.id.slice(0, 8).toUpperCase()}`}
                </span>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                  Publicada
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                  {question.exam_boards?.name || "Sem banca"}
                </span>
                {subjectNames.map((name) => (
                  <span
                    key={name}
                    className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-600"
                  >
                    {name}
                  </span>
                ))}
                <PremiumDifficultyStars
                  value={question.difficulty_level || null}
                  compact
                />
              </div>

              <div
                className="richtext-editor text-sm leading-7 text-slate-800"
                dangerouslySetInnerHTML={{ __html: question.statement || "" }}
              />

              <div className="mt-5 grid gap-3">
                {sourceAlternatives.map((alternative, index) => (
                  <div
                    key={`${alternative.id || alternative.label || index}`}
                    className={
                      alternative.is_correct
                        ? "rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
                        : "rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700"
                    }
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={
                          alternative.is_correct
                            ? "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-sm leading-none text-white"
                            : "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white font-bold text-slate-500"
                        }
                      >
                        {alternative.is_correct
                          ? OWL_MARK
                          : alternative.label ||
                            String.fromCharCode(65 + index)}
                      </span>
                      <div
                        className="min-w-0 flex-1"
                        dangerouslySetInnerHTML={{
                          __html: alternative.text || "",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </PremiumCard>

          <PremiumCard
            title="Parâmetros da variação"
            description="A IA gera uma prévia editável. O banco só recebe o que você enviar para revisão."
            icon={<Bot size={18} />}
          >
            <div className="grid gap-5">
              <PremiumInput
                label="Quantidade de questões"
                type="number"
                min="1"
                max="20"
                value={quantity}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setQuantity(event.target.value)
                }
                placeholder="Ex.: 5"
              />

              <div>
                <label className="mb-3 block text-sm font-medium text-slate-700">
                  Nível de dificuldade
                </label>

                <div className="flex flex-wrap items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() =>
                        setDifficulty(difficulty === star ? null : star)
                      }
                      className={
                        difficulty && star <= difficulty
                          ? "text-amber-500"
                          : "text-slate-300"
                      }
                    >
                      <Star
                        size={34}
                        fill={
                          difficulty && star <= difficulty
                            ? "currentColor"
                            : "none"
                        }
                      />
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => setDifficulty(null)}
                    className={
                      difficulty === null
                        ? "ml-1 rounded-2xl border border-orange-300 bg-orange-50 px-4 py-2 text-xs font-black text-orange-700 shadow-sm ring-2 ring-orange-100"
                        : "ml-1 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                    }
                    aria-pressed={difficulty === null}
                  >
                    Variada
                  </button>
                </div>

                <p className="mt-2 text-xs text-slate-500">
                  Se não selecionar, a IA mistura níveis para criar variações
                  menos repetitivas.
                </p>
              </div>

              <PremiumInput
                label="Orientações adicionais para a IA"
                textarea
                value={additionalInstructions}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                  setAdditionalInstructions(event.target.value)
                }
                placeholder="Ex.: crie uma questão mais prática, outra mais conceitual, use pegadinhas de prova, evite enunciados muito longos..."
              />

              <label className="flex cursor-pointer items-center gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <input
                  type="checkbox"
                  checked={includeExplanations}
                  onChange={(event) =>
                    setIncludeExplanations(event.target.checked)
                  }
                  className="h-5 w-5 accent-orange-500"
                />

                <div>
                  <p className="font-semibold text-slate-900">
                    Gerar explicações também
                  </p>
                  <p className="text-sm text-slate-500">
                    Cada variação receberá uma explicação curta para revisão.
                  </p>
                </div>
              </label>

              <div className="border-t border-slate-100 pt-5">
                <PremiumButton
                  onClick={handleGenerate}
                  disabled={generating || saving}
                  icon={<Sparkles size={18} />}
                  full
                >
                  Gerar variações
                </PremiumButton>
              </div>
            </div>
          </PremiumCard>

          <PremiumCard
            title="Variações geradas"
            description={`${pendingCount} pendente(s) na tela. ${duplicateCount} muito parecida(s). ${selectedIds.length} selecionada(s).`}
            icon={<FileQuestion size={18} />}
            action={
              pendingCount > 0 ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <PremiumButton variant="secondary" onClick={selectAllValid}>
                    Selecionar todas válidas
                  </PremiumButton>
                  <PremiumButton
                    icon={<Send size={16} />}
                    onClick={() => requestSendToReview(selectedQuestions)}
                    disabled={selectedQuestions.length === 0 || saving}
                  >
                    Enviar selecionadas
                  </PremiumButton>
                </div>
              ) : null
            }
          >
            {pendingCount === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
                Nenhuma variação gerada na tela.
              </div>
            ) : (
              <div className="grid gap-4">
                {questions.map((item) => (
                  <GeneratedQuestionCard
                    key={item.temp_id}
                    question={item}
                    selected={selectedIds.includes(item.temp_id)}
                    expanded={expandedIds.includes(item.temp_id)}
                    onToggleSelected={() => toggleSelected(item.temp_id)}
                    onToggleExpanded={() => toggleExpanded(item.temp_id)}
                    onChange={(updates) =>
                      updateGeneratedQuestion(item.temp_id, updates)
                    }
                    onAlternativeChange={(index, updates) =>
                      updateGeneratedAlternative(item.temp_id, index, updates)
                    }
                    onMarkAlternativeCorrect={(index) =>
                      markAlternativeCorrect(item.temp_id, index)
                    }
                    onRemoveAlternative={(index) =>
                      removeGeneratedAlternative(item.temp_id, index)
                    }
                    onAddAlternative={() =>
                      addGeneratedAlternative(item.temp_id)
                    }
                    onReject={() => rejectQuestion(item)}
                    onSend={() => requestSendToReview([item])}
                    disabled={saving}
                  />
                ))}
              </div>
            )}
          </PremiumCard>
        </div>

        <div className="space-y-6">
          <PremiumCard
            title="Resumo"
            description="Acompanhe o funil antes de salvar no banco."
            icon={<ShieldAlert size={18} />}
          >
            <div className="grid gap-3">
              <ProgressPill label="Geradas" value={generatedCount} />
              <ProgressPill
                label="Muito parecidas"
                value={duplicateCount}
                tone="danger"
              />
              <ProgressPill label="Enviadas" value={sentCount} tone="success" />
              <ProgressPill label="Rejeitadas" value={rejectedCount} />
              <ProgressPill label="Pendentes" value={pendingCount} />

              <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                  <span>Progresso</span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </div>
          </PremiumCard>

          <PremiumCard
            title="Regra de segurança"
            description="A geração não publica nada automaticamente."
            icon={<AlertTriangle size={18} />}
          >
            <div className="space-y-3 text-sm leading-6 text-slate-600">
              <p>
                A IA é instruída a revisar cada variação três vezes: gabarito,
                plausibilidade e originalidade.
              </p>
              <p>
                O backend também valida se existe exatamente uma alternativa
                correta e bloqueia itens muito próximos da questão-modelo.
              </p>
              <p>
                Ao enviar, as questões entram como{" "}
                <strong>pending_review</strong> para revisão humana.
              </p>
            </div>
          </PremiumCard>
        </div>
      </div>

      {selectedQuestions.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 px-4 sm:px-6 lg:left-72">
          <div className="mx-auto flex max-w-4xl flex-col gap-3 rounded-[2rem] border border-orange-200 bg-white/90 p-3 shadow-2xl shadow-orange-950/10 ring-1 ring-white/80 backdrop-blur md:flex-row md:items-center md:justify-between">
            <div className="px-2">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-orange-600">
                {selectedQuestions.length} variação(ões) selecionada(s)
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Revise a seleção antes de enviar para revisão.
              </p>
            </div>

            <div className="pointer-events-auto">
              <PremiumButton
                icon={<Send size={16} />}
                onClick={() => requestSendToReview(selectedQuestions)}
                disabled={saving}
                full
              >
                Enviar selecionadas para revisão
              </PremiumButton>
            </div>
          </div>
        </div>
      )}
    </PageBackground>
  );
}

function GeneratedQuestionCard({
  question,
  selected,
  expanded,
  onToggleSelected,
  onToggleExpanded,
  onChange,
  onAlternativeChange,
  onMarkAlternativeCorrect,
  onRemoveAlternative,
  onAddAlternative,
  onReject,
  onSend,
  disabled = false,
}: {
  question: GeneratedQuestion;
  selected: boolean;
  expanded: boolean;
  onToggleSelected: () => void;
  onToggleExpanded: () => void;
  onChange: (updates: Partial<GeneratedQuestion>) => void;
  onAlternativeChange: (
    index: number,
    updates: Partial<GeneratedAlternative>,
  ) => void;
  onMarkAlternativeCorrect: (index: number) => void;
  onRemoveAlternative: (index: number) => void;
  onAddAlternative: () => void;
  onReject: () => void;
  onSend: () => void;
  disabled?: boolean;
}) {
  const correct = question.alternatives.find(
    (alternative) => alternative.is_correct,
  );

  return (
    <div
      className={
        question.is_duplicate
          ? "rounded-[2rem] border border-red-200 bg-red-50/70 p-5 shadow-sm"
          : selected
            ? "rounded-[2rem] border border-orange-200 bg-orange-50/60 p-5 shadow-sm ring-1 ring-orange-100"
            : isQuestionImagePending(question)
              ? "rounded-[2rem] border border-blue-300 bg-blue-50 p-5 shadow-sm ring-2 ring-blue-200/50"
              : "rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm"
      }
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <input
            type="checkbox"
            checked={selected}
            disabled={Boolean(question.is_duplicate) || disabled}
            onChange={onToggleSelected}
            className="mt-1 h-5 w-5 shrink-0 accent-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
          />

          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-bold text-orange-700">
                Banca final: {question.board_name}
              </span>
              {question.source_question_code && (
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                  Modelo: {question.source_question_code}
                </span>
              )}
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                {question.question_type === "true_false"
                  ? "Assertiva / Certo ou Errado"
                  : "Questão com alternativas"}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                {question.discipline_name} / {question.subject_name}
              </span>
              <PremiumDifficultyStars
                value={question.difficulty_level}
                compact
              />
              {question.is_duplicate && (
                <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
                  <AlertTriangle size={13} />
                  Muito parecida
                </span>
              )}
              {isQuestionImagePending(question) && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                  <ImageIcon size={12} />
                  Imagem ausente
                </span>
              )}
            </div>

            <RichTextEditor
              value={question.statement}
              onChange={(value) => onChange({ statement: value })}
              placeholder="Enunciado da variação"
              disabled={disabled}
              minRows={3}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-800 outline-none focus:ring-4 focus:ring-orange-100"
            />

            {question.is_duplicate && question.duplicate_message && (
              <p className="mt-3 rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-700">
                {question.duplicate_message}
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleExpanded}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
        >
          {expanded ? "Recolher" : "Ver detalhes"}
        </button>
      </div>

      {expanded && (
        <div className="mt-5 border-t border-slate-100 pt-5">
          <div className="grid gap-3">
            {question.alternatives.map((alternative, index) => (
              <VariationAlternativeEditor
                key={`${question.temp_id}-${alternative.label}-${index}`}
                alternative={alternative}
                index={index}
                total={question.alternatives.length}
                questionType={question.question_type}
                isCorrect={alternative.is_correct}
                disabled={disabled}
                onChange={(updates) => onAlternativeChange(index, updates)}
                onRemove={() => onRemoveAlternative(index)}
                onMarkCorrect={() => onMarkAlternativeCorrect(index)}
              />
            ))}
          </div>

          {question.question_type !== "true_false" &&
            question.alternatives.length < 5 && (
              <button
                type="button"
                onClick={onAddAlternative}
                disabled={disabled}
                className="mt-3 rounded-2xl border border-dashed border-orange-200 bg-orange-50/60 px-4 py-2 text-sm font-bold text-orange-700 transition hover:bg-orange-50 disabled:opacity-50"
              >
                + Adicionar alternativa
              </button>
            )}

          <p className="mt-4 text-sm font-semibold text-emerald-700">
            Resposta correta:{" "}
            {question.question_type === "true_false"
              ? correct?.text
              : correct?.label || "Não definida"}
          </p>

          <div className="mt-4">
            <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
              Comentário / explicação
            </p>
            <RichTextEditor
              value={question.explanation_text || ""}
              onChange={(value) => onChange({ explanation_text: value })}
              placeholder="Comentário da questão"
              disabled={disabled}
              minRows={3}
              compact
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-800 outline-none focus:ring-4 focus:ring-orange-100"
            />
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
        <PremiumButton
          variant="secondary"
          icon={<Trash2 size={16} />}
          onClick={onReject}
          disabled={disabled}
        >
          Descartar variação
        </PremiumButton>

        {!question.is_duplicate && (
          <PremiumButton
            icon={<Send size={16} />}
            onClick={onSend}
            disabled={disabled}
          >
            Enviar para revisão
          </PremiumButton>
        )}
      </div>
    </div>
  );
}

function VariationAlternativeEditor({
  alternative,
  index,
  total,
  questionType,
  isCorrect,
  disabled,
  onChange,
  onRemove,
  onMarkCorrect,
}: {
  alternative: GeneratedAlternative;
  index: number;
  total: number;
  questionType: GeneratedQuestion["question_type"];
  isCorrect: boolean;
  disabled?: boolean;
  onChange: (updates: Partial<GeneratedAlternative>) => void;
  onRemove: () => void;
  onMarkCorrect: () => void;
}) {
  const hasText = Boolean(stripHtmlLocal(alternative.text || ""));
  const [expanded, setExpanded] = useState(!hasText);
  const [isEliminated, setIsEliminated] = useState(false);
  const label =
    questionType === "true_false"
      ? index === 0
        ? "CERTO"
        : "ERRADO"
      : alternative.label || String.fromCharCode(65 + index);

  const scissorsBtn = (
    <button
      type="button"
      aria-label={
        isEliminated
          ? "Remover eliminação da alternativa"
          : "Eliminar alternativa"
      }
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsEliminated((value) => !value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          setIsEliminated((value) => !value);
        }
      }}
      className={`absolute left-0 top-0 z-20 flex h-full w-10 items-center justify-center transition ${
        isEliminated
          ? "opacity-100"
          : "opacity-0 hover:opacity-100 focus:opacity-100 focus-visible:opacity-100"
      } [&>svg]:rounded-full [&>svg]:border [&>svg]:p-1.5 [&>svg]:shadow-sm ${
        isEliminated
          ? "[&>svg]:border-red-200 [&>svg]:bg-red-50 [&>svg]:text-red-500"
          : "[&>svg]:border-sky-100 [&>svg]:bg-sky-50 [&>svg]:text-sky-400 hover:[&>svg]:border-red-200 hover:[&>svg]:bg-red-50 hover:[&>svg]:text-red-500"
      }`}
    >
      <Scissors size={22} />
    </button>
  );

  if (!expanded) {
    return (
      <div className="relative group pl-10">
        {scissorsBtn}
        <div
          onClick={!disabled ? onMarkCorrect : undefined}
          className={`cursor-pointer transition ${isEliminated ? "opacity-60" : ""} ${
            isCorrect
              ? "flex items-start gap-2 rounded-2xl border border-emerald-300 bg-emerald-50/80 px-3 py-2.5"
              : "flex items-start gap-2 rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 hover:border-emerald-300 hover:bg-emerald-50/70"
          }`}
        >
          {isCorrect ? (
            <span className={`${qCard.alts.labelCorrect} shrink-0`}>
              <span className="block font-normal leading-none [font-family:'Segoe_UI_Emoji','Apple_Color_Emoji','Noto_Color_Emoji',sans-serif]">
                {OWL_MARK}
              </span>
            </span>
          ) : (
            <button
              type="button"
              onClick={(event) => { event.stopPropagation(); onMarkCorrect(); }}
              disabled={disabled}
              title="Marcar como correta"
              className={`${qCard.alts.labelBase} shrink-0 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50`}
            >
              {label}
            </button>
          )}

          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); setExpanded(true); }}
            className="flex min-w-0 flex-1 items-start gap-2 text-left"
          >
            <span
              className={`min-w-0 flex-1 break-words text-sm leading-5 ${isCorrect ? "font-semibold text-emerald-800" : "text-slate-600"} ${isEliminated ? "line-through decoration-red-500 decoration-2 [&_*]:line-through [&_*]:decoration-red-500 [&_*]:decoration-2" : ""}`}
            >
              {stripHtmlLocal(alternative.text || "") || (
                <span className="italic text-slate-400">
                  Vazia — clique para editar
                </span>
              )}
            </span>
            <ChevronDown size={13} className="mt-0.5 shrink-0 text-slate-400" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative group pl-10">
      {scissorsBtn}
      <div
        onClick={!disabled ? onMarkCorrect : undefined}
        className={`cursor-pointer transition ${isEliminated ? "opacity-60" : ""} ${
          isCorrect
            ? "rounded-2xl border border-emerald-300 bg-emerald-50 p-3 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.10)]"
            : "rounded-2xl border border-slate-200 bg-slate-50/70 p-3 hover:border-emerald-300 hover:bg-emerald-50/70"
        }`}
      >
        {hasText && (
          <div className="mb-1.5 flex justify-end">
            <button
              type="button"
              onClick={(event) => { event.stopPropagation(); setExpanded(false); }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-slate-600"
            >
              <ChevronDown size={12} className="rotate-180" />
              Colapsar
            </button>
          </div>
        )}

        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); onRemove(); }}
            disabled={disabled || total <= 2 || questionType === "true_false"}
            className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-20"
            title="Remover alternativa"
          >
            <X size={16} />
          </button>

          {isCorrect ? (
            <span className={`${qCard.alts.labelCorrect} shrink-0`}>
              <span className="block font-normal leading-none [font-family:'Segoe_UI_Emoji','Apple_Color_Emoji','Noto_Color_Emoji',sans-serif]">
                {OWL_MARK}
              </span>
            </span>
          ) : (
            <button
              type="button"
              onClick={(event) => { event.stopPropagation(); onMarkCorrect(); }}
              disabled={disabled}
              title="Marcar como correta"
              className={`${qCard.alts.labelBase} shrink-0 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50`}
            >
              {label}
            </button>
          )}

          {questionType === "true_false" ? (
            <button
              type="button"
              onClick={(event) => { event.stopPropagation(); onMarkCorrect(); }}
              disabled={disabled}
              className={`min-h-[44px] flex-1 rounded-xl border px-4 py-3 text-left text-sm font-bold transition ${
                isCorrect
                  ? "border-emerald-300 bg-white text-emerald-800"
                  : "border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50"
              }`}
            >
              {index === 0 ? "Certo" : "Errado"}
            </button>
          ) : (
            <div className="min-w-0 flex-1" onClick={(event) => event.stopPropagation()}>
              <RichTextEditor
                value={alternative.text || ""}
                onChange={(value) => onChange({ text: value })}
                placeholder={`Resposta ${label}`}
                minRows={3}
                compact
                disabled={disabled}
                className={`w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:ring-4 focus:ring-orange-100 ${isEliminated ? "line-through decoration-red-500 decoration-2 [&_*]:line-through [&_*]:decoration-red-500 [&_*]:decoration-2" : ""}`}
              />
            </div>
          )}

          {questionType !== "true_false" && (
            <button
              type="button"
              onClick={(event) => { event.stopPropagation(); onChange({ showImage: !alternative.showImage }); }}
              disabled={disabled}
              className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-300 hover:bg-white hover:text-orange-600 disabled:opacity-40"
              title="Imagem da alternativa"
            >
              <ImageIcon size={18} />
            </button>
          )}
        </div>

        {questionType !== "true_false" && alternative.showImage && (
          <div className="mt-2 pl-[4.5rem]">
            <input
              type="url"
              value={alternative.image_url || ""}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => onChange({ image_url: event.target.value })}
              placeholder={`URL da imagem da alternativa ${label}`}
              disabled={disabled}
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-orange-300 focus:ring-4 focus:ring-orange-100 disabled:opacity-50"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function stripHtmlLocal(value: string) {
  return (value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "e")
    .replace(/\s+/g, " ")
    .trim();
}

function ConfirmModal({
  title,
  message,
  confirmLabel,
  variant = "primary",
  disabled,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  variant?: "primary" | "danger";
  disabled?: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="relative w-full max-w-lg rounded-[2rem] bg-white p-7 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onCancel}
          className="absolute right-5 top-5 rounded-2xl p-2 text-slate-400 hover:bg-slate-100"
          disabled={disabled}
        >
          <X size={18} />
        </button>

        <h2 className="text-2xl font-semibold text-slate-950">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <PremiumButton
            variant="secondary"
            onClick={onCancel}
            disabled={disabled}
          >
            Cancelar
          </PremiumButton>
          <PremiumButton
            variant={variant === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={disabled}
          >
            {confirmLabel}
          </PremiumButton>
        </div>
      </div>
    </div>
  );
}

function Notice({ feedback }: { feedback: NonNullable<Feedback> }) {
  const isSuccess = feedback.type === "success";
  const isWarning = feedback.type === "warning";

  return (
    <div
      className={
        isSuccess
          ? "mb-6 flex items-center gap-3 rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5 text-emerald-800"
          : isWarning
            ? "mb-6 flex items-center gap-3 rounded-[2rem] border border-amber-200 bg-amber-50 p-5 text-amber-800"
            : "mb-6 flex items-center gap-3 rounded-[2rem] border border-red-200 bg-red-50 p-5 text-red-800"
      }
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm">
        {isSuccess ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
      </div>
      <p className="font-medium">{feedback.message}</p>
    </div>
  );
}

function ProgressPill({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "danger" | "success";
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-200 bg-red-50 text-red-700"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-slate-200 bg-white text-slate-700";

  return (
    <div className={`rounded-2xl border p-3 shadow-sm ${toneClass}`}>
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] opacity-80">
        {label}
      </p>
      <p className="text-xl font-black">{value}</p>
    </div>
  );
}
