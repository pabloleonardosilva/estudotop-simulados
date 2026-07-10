"use client";

import { ChangeEvent, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Check,
  CheckCircle2,
  FileQuestion,
  ImageIcon,
  Loader2,
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
import PremiumCard from "../../components/ui/PremiumCard";
import PremiumInput from "../../components/ui/PremiumInput";
import PremiumSelect from "../../components/ui/PremiumSelect";
import PremiumLoadingOverlay from "../../components/ui/PremiumLoadingOverlay";
import SubjectMultiSelect from "../../components/questions/SubjectMultiSelect";
import PremiumScissorsIcon from "../../components/questions/PremiumScissorsIcon";
import DraftRestoreModal from "../../components/ui/DraftRestoreModal";
import RichTextEditor from "../../components/questions/RichTextEditor";
import EvaluatedTopicsInput from "../../components/questions/EvaluatedTopicsInput";
import { useLocalDraft } from "../../lib/useLocalDraft";
import PremiumDifficultyStars from "@/app/components/questions/PremiumDifficultyStars";
import { adminFetch } from "@/app/lib/supabase/adminFetch";
import { isQuestionImagePending } from "@/lib/questions/image-pending";
import { normalizeEvaluatedTopics } from "@/lib/questions/evaluated-topics";

const OWL_MARK = "\u{1F989}\uFE0F";

type Feedback = {
  type: "success" | "error" | "warning";
  message: string;
} | null;

type GeneratedAlternative = {
  label: string;
  text: string;
  is_correct: boolean;
};

type GeneratedQuestion = {
  temp_id: string;
  statement: string;
  question_type: "multiple_choice" | "true_false";
  board_name: string;
  exam_board_id: string;
  inspiring_board_name?: string;
  inspiring_exam_board_id?: string;
  discipline_id: string;
  discipline_name: string;
  subject_id: string;
  subject_ids?: string[];
  subject_name: string;
  difficulty_level: number | null;
  explanation_text: string;
  evaluated_topics: string[];
  alternatives: GeneratedAlternative[];
  is_duplicate?: boolean;
  duplicate_message?: string;
  duplicate_of?: unknown;
  source_origin?: string;
};

type DisciplineOption = {
  id: string;
  name: string;
};

type SubjectOption = {
  id: string;
  name: string;
  discipline_id: string;
};

type BoardOption = {
  id: string;
  name: string;
};

type ConfirmAction = {
  title: string;
  message: string;
  confirmLabel: string;
  variant?: "primary" | "danger";
  onConfirm: () => Promise<void> | void;
} | null;

type GenerateDraft = {
  disciplineId: string;
  subjectIds: string[];
  boardId: string;
  questionType: "multiple_choice" | "true_false";
  difficulty: number | null;
  quantity: string;
  includeExplanations: boolean;
  additionalInstructions: string;
  questions: GeneratedQuestion[];
  selectedIds: string[];
  generatedCount: number;
  sentCount: number;
  rejectedCount: number;
};

export default function GerarQuestoesIAClient({
  disciplines,
  subjects,
  boards,
}: {
  disciplines: DisciplineOption[];
  subjects: SubjectOption[];
  boards: BoardOption[];
}) {
  const [disciplineId, setDisciplineId] = useState(disciplines[0]?.id || "");
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [boardId, setBoardId] = useState(boards[0]?.id || "");
  const [questionType, setQuestionType] = useState<"multiple_choice" | "true_false">("multiple_choice");
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [quantity, setQuantity] = useState("5");
  const [includeExplanations, setIncludeExplanations] = useState(true);
  const [additionalInstructions, setAdditionalInstructions] = useState("");

  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [generatedCount, setGeneratedCount] = useState(0);
  const [sentCount, setSentCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendStep, setSendStep] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [confirm, setConfirm] = useState<ConfirmAction>(null);

  const filteredSubjects = useMemo(() => {
    return subjects.filter((subject) => subject.discipline_id === disciplineId);
  }, [subjects, disciplineId]);

  const selectedQuestions = useMemo(() => {
    return questions.filter(
      (question) => selectedIds.includes(question.temp_id) && !question.is_duplicate
    );
  }, [questions, selectedIds]);

  const duplicateCount = questions.filter((question) => question.is_duplicate).length;
  const pendingCount = questions.length;
  const progressPercent = generatedCount > 0
    ? Math.round(((sentCount + rejectedCount) / generatedCount) * 100)
    : 0;

  const draft = useMemo<GenerateDraft>(
    () => ({
      disciplineId,
      subjectIds,
      boardId,
      questionType,
      difficulty,
      quantity,
      includeExplanations,
      additionalInstructions,
      questions,
      selectedIds,
      generatedCount,
      sentCount,
      rejectedCount,
    }),
    [
      additionalInstructions,
      boardId,
      difficulty,
      disciplineId,
      generatedCount,
      includeExplanations,
      quantity,
      questionType,
      questions,
      rejectedCount,
      selectedIds,
      sentCount,
      subjectIds,
    ],
  );

  const hasDraftContent = useCallback((value: GenerateDraft) => {
    return Boolean(value.additionalInstructions.trim() || value.questions.length);
  }, []);

  const restoreSavedDraft = useCallback((value: GenerateDraft) => {
    setDisciplineId(value.disciplineId || disciplines[0]?.id || "");
    setSubjectIds(value.subjectIds || []);
    setBoardId(value.boardId || boards[0]?.id || "");
    setQuestionType(value.questionType || "multiple_choice");
    setDifficulty(value.difficulty ?? null);
    setQuantity(value.quantity || "5");
    setIncludeExplanations(value.includeExplanations ?? true);
    setAdditionalInstructions(value.additionalInstructions || "");
    setQuestions(value.questions || []);
    setSelectedIds(value.selectedIds || []);
    setGeneratedCount(value.generatedCount || value.questions?.length || 0);
    setSentCount(value.sentCount || 0);
    setRejectedCount(value.rejectedCount || 0);
  }, [boards, disciplines]);

  const {
    pendingDraft,
    restoreDraft: continueDraft,
    discardDraft,
    clearDraft,
  } = useLocalDraft({
    storageKey: "estudotop:draft:questoes:gerar-ia",
    draft,
    hasContent: hasDraftContent,
    onRestore: restoreSavedDraft,
  });

  function wait(ms: number) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function toggleSelected(id: string) {
    if (saving) return;

    const question = questions.find((item) => item.temp_id === id);
    if (question?.is_duplicate) return;

    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  function selectAllValid() {
    setSelectedIds(
      questions
        .filter((question) => !question.is_duplicate)
        .map((question) => question.temp_id)
    );
  }

  function removeQuestions(ids: string[], countAsRejected = true) {
    const idSet = new Set(ids);
    setQuestions((current) => current.filter((question) => !idSet.has(question.temp_id)));
    setSelectedIds((current) => current.filter((id) => !idSet.has(id)));

    if (countAsRejected) {
      setRejectedCount((current) => current + ids.length);
    }
  }

  function updateGeneratedQuestion(id: string, updates: Partial<GeneratedQuestion>) {
    setQuestions((current) =>
      current.map((question) =>
        question.temp_id === id ? { ...question, ...updates } : question
      )
    );
  }

  function updateGeneratedAlternative(
    questionId: string,
    index: number,
    updates: Partial<GeneratedAlternative>
  ) {
    setQuestions((current) =>
      current.map((question) => {
        if (question.temp_id !== questionId) return question;

        return {
          ...question,
          alternatives: question.alternatives.map((alternative, altIndex) =>
            altIndex === index ? { ...alternative, ...updates } : alternative
          ),
        };
      })
    );
  }

  function rejectQuestion(question: GeneratedQuestion) {
    if (saving) return;

    setConfirm({
      title: "Descartar questão",
      message: "Essa questão sairá da lista e não será salva no banco.",
      confirmLabel: "Descartar",
      variant: "danger",
      onConfirm: () => {
        removeQuestions([question.temp_id]);
        setFeedback({ type: "success", message: "Questão descartada." });
        setConfirm(null);
      },
    });
  }

  async function handleGenerate() {
    setFeedback(null);

    if (subjectIds.length === 0) {
      setFeedback({ type: "error", message: "Selecione o assunto das questões." });
      return;
    }

    if (!boardId) {
      setFeedback({ type: "error", message: "Selecione a banca inspiradora." });
      return;
    }

    const parsedQuantity = Number(quantity);

    if (!parsedQuantity || parsedQuantity < 1 || parsedQuantity > 20) {
      setFeedback({ type: "error", message: "Informe uma quantidade entre 1 e 20 questões." });
      return;
    }

    setGenerating(true);

    try {
      const response = await adminFetch("/api/admin/questions/generate-ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subject_id: subjectIds[0],
          subject_ids: subjectIds,
          exam_board_id: boardId,
          question_type: questionType,
          difficulty_level: difficulty,
          quantity: parsedQuantity,
          include_explanations: includeExplanations,
          additional_instructions: additionalInstructions,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Erro ao gerar questões com IA.");
      }

      const generated = ((result.questions || []) as GeneratedQuestion[]).map((question) => ({
        ...question,
        evaluated_topics: normalizeEvaluatedTopics(question.evaluated_topics),
      }));

      setQuestions(generated);
      setSelectedIds([]);
      setGeneratedCount(generated.length);
      setSentCount(0);
      setRejectedCount(0);

      setFeedback({
        type: "success",
        message: result.message || "Questões geradas. Revise antes de enviar para revisão.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao gerar questões com IA.",
      });
    } finally {
      setGenerating(false);
    }
  }

  function requestSendToReview(targetQuestions: GeneratedQuestion[]) {
    if (saving) return;

    const allowedQuestions = targetQuestions.filter((question) => !question.is_duplicate);

    if (allowedQuestions.length === 0) {
      setFeedback({
        type: "warning",
        message: "Nenhuma questão válida para enviar. Duplicadas não podem ser publicadas no banco.",
      });
      return;
    }

    const missingTopics = allowedQuestions.filter((question) => normalizeEvaluatedTopics(question.evaluated_topics).length === 0);
    if (missingTopics.length > 0) {
      setFeedback({
        type: "error",
        message: "Informe pelo menos um tópico avaliado em cada questão antes de enviar para revisão.",
      });
      return;
    }

    setConfirm({
      title: "Enviar para revisão",
      message: `Confirma enviar ${allowedQuestions.length} questão(ões) para revisão? Só agora elas serão salvas no banco.`,
      confirmLabel: "Enviar",
      onConfirm: () => sendToReview(allowedQuestions),
    });
  }

  async function sendToReview(targetQuestions: GeneratedQuestion[]) {
    setFeedback(null);
    setConfirm(null);
    setSaving(true);
    setSendStep(0);

    const sentIds = new Set(targetQuestions.map((question) => question.temp_id));

    setQuestions((current) => current.filter((question) => !sentIds.has(question.temp_id)));
    setSelectedIds((current) => current.filter((id) => !sentIds.has(id)));

    try {
      await wait(120);
      setSendStep(1);
      await wait(120);
      setSendStep(2);
      await wait(120);
      setSendStep(3);

      const response = await adminFetch("/api/admin/questions/import/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questions: targetQuestions.map((question) => ({
            ...question,
            board_name: "Estudo TOP",
            source_origin: "generate_ai",
          })),
          discipline_id: disciplineId,
          subject_id: subjectIds[0],
          subject_ids: subjectIds,
          year: new Date().getFullYear(),
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Erro ao enviar questões para revisão.");
      }

      setSendStep(4);
      await wait(160);

      const savedCount = Number(result.savedCount ?? targetQuestions.length);
      const rejectedByBackend = Math.max(targetQuestions.length - savedCount, 0);

      setSentCount((current) => current + savedCount);

      if (rejectedByBackend > 0) {
        setRejectedCount((current) => current + rejectedByBackend);
      }

      if (targetQuestions.length === questions.length) {
        setAdditionalInstructions("");
        clearDraft();
      }

      setFeedback({
        type: "success",
        message: result.message || "Questões enviadas para revisão.",
      });
    } catch (error) {
      setQuestions((current) => [...targetQuestions, ...current]);
      setSelectedIds((current) => [
        ...current,
        ...targetQuestions
          .filter((question) => !question.is_duplicate)
          .map((question) => question.temp_id),
      ]);
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao enviar para revisão.",
      });
    } finally {
      setSaving(false);
      setSendStep(0);
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
        show={generating}
        title="Gerando questões com IA..."
        message="A IA está criando enunciados, alternativas, gabaritos e explicações para revisão prévia."
      />

      <SendReviewProgressModal show={saving} currentStep={sendStep} />

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
        title="Gerar questões com IA"
        description="Gere questões inéditas, revise na tela e envie para revisão apenas quando estiver tudo certo."
        action={
          <Link href="/questoes">
            <PremiumButton variant="secondary" icon={<ArrowLeft size={18} />}>
              Voltar
            </PremiumButton>
          </Link>
        }
      />

      {feedback && <Notice feedback={feedback} />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <PremiumCard
            title="Parâmetros da geração"
            description="A IA gera a prévia; o banco só recebe o que você enviar para revisão."
            icon={<Bot size={18} />}
          >
            <div className="grid gap-5">
              <div className="grid gap-5 md:grid-cols-3">
                <PremiumSelect
                  label="Tipo de questão"
                  value={questionType}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                    setQuestionType(
                      event.target.value === "true_false" ? "true_false" : "multiple_choice"
                    )
                  }
                >
                  <option value="multiple_choice">Questão com alternativas</option>
                  <option value="true_false">Questão de assertiva / Certo ou Errado</option>
                </PremiumSelect>

                <PremiumSelect
                  label="Disciplina"
                  value={disciplineId}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                    if (event.target.value === "__new") {
                      window.location.href = "/disciplinas";
                      return;
                    }

                    setDisciplineId(event.target.value);
                    setSubjectIds([]);
                  }}
                >
                  {disciplines.map((discipline) => (
                    <option key={discipline.id} value={discipline.id}>
                      {discipline.name}
                    </option>
                  ))}
                  <option value="__new">+ Cadastrar nova disciplina</option>
                </PremiumSelect>

                <SubjectMultiSelect
                  subjects={filteredSubjects}
                  selectedIds={subjectIds}
                  onChange={setSubjectIds}
                  emptyLabel="Adicionar assunto"
                  disciplineId={disciplineId}
                />
              </div>

              <PremiumSelect
                label="Inspirado na banca"
                value={boardId}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                  if (event.target.value === "__new") {
                    window.location.href = "/bancas";
                    return;
                  }

                  setBoardId(event.target.value);
                }}
              >
                <option value="">Selecione a banca inspiradora</option>
                {boards.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.name}
                  </option>
                ))}
                <option value="__new">+ Cadastrar nova banca</option>
              </PremiumSelect>

              <div>
                <label className="mb-3 block text-sm font-medium text-slate-700">
                  Nível de dificuldade
                </label>

                <div className="flex flex-wrap items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setDifficulty(difficulty === star ? null : star)}
                      className={difficulty && star <= difficulty ? "text-amber-500" : "text-slate-300"}
                    >
                      <Star size={34} fill={difficulty && star <= difficulty ? "currentColor" : "none"} />
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => setDifficulty(null)}
                    className="ml-1 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                  >
                    Aleatória
                  </button>
                </div>

                <p className="mt-2 text-xs text-slate-500">
                  Se não selecionar, a IA distribui níveis variados e cada questão recebe sua dificuldade.
                </p>
              </div>

              <PremiumInput
                label="Quantidade de questões"
                type="number"
                min="1"
                max="20"
                value={quantity}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setQuantity(event.target.value)}
                placeholder="Ex.: 5"
              />

              <PremiumInput
                label="Orientações adicionais para a IA"
                textarea
                value={additionalInstructions}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setAdditionalInstructions(event.target.value)}
                placeholder="Ex.: cobre pegadinhas sobre fórmulas do Excel, use situações práticas de escritório..."
              />

              <label className="flex cursor-pointer items-center gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <input
                  type="checkbox"
                  checked={includeExplanations}
                  onChange={(event) => setIncludeExplanations(event.target.checked)}
                  className="h-5 w-5 accent-orange-500"
                />

                <div>
                  <p className="font-semibold text-slate-900">Gerar explicações também</p>
                  <p className="text-sm text-slate-500">
                    A IA criará uma explicação curta para cada questão.
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
                  Gerar prévia com IA
                </PremiumButton>
              </div>
            </div>
          </PremiumCard>

          <PremiumCard
            title="Questões geradas"
            description={`${pendingCount} pendente(s) na tela. ${duplicateCount} duplicada(s). ${selectedIds.length} selecionada(s).`}
            icon={<FileQuestion size={18} />}
            action={
              pendingCount > 0 ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <PremiumButton variant="secondary" onClick={selectAllValid}>
                    Selecionar todas não duplicadas
                  </PremiumButton>
                  <PremiumButton
                    icon={<Send size={16} />}
                    onClick={() => requestSendToReview(selectedQuestions)}
                    disabled={selectedQuestions.length === 0 || saving}
                  >
                    Enviar selecionadas para revisão
                  </PremiumButton>
                </div>
              ) : null
            }
          >
            {pendingCount === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
                Nenhuma questão gerada na tela.
              </div>
            ) : (
              <div className="grid gap-4">
                {questions.map((question) => (
                  <GeneratedQuestionCard
                    key={question.temp_id}
                    question={question}
                    selected={selectedIds.includes(question.temp_id)}
                    onToggleSelected={() => toggleSelected(question.temp_id)}
                    onChange={(updates) => updateGeneratedQuestion(question.temp_id, updates)}
                    onAlternativeChange={(index, updates) =>
                      updateGeneratedAlternative(question.temp_id, index, updates)
                    }
                    onReject={() => rejectQuestion(question)}
                    onSend={() => requestSendToReview([question])}
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
              <ProgressPill label="Duplicadas" value={duplicateCount} tone="danger" />
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
            title="Como funciona"
            description="Nada é salvo automaticamente."
            icon={<FileQuestion size={18} />}
          >
            <div className="space-y-4 text-sm leading-6 text-slate-600">
              <p>
                A IA usa a banca inspiradora apenas como referência de estilo; as questões geradas entram como banca Estudo TOP.
              </p>

              <p>
                Só ao clicar em <strong>Enviar para revisão</strong> a API valida duplicidade na banca Estudo TOP e grava com status <strong>pending_review</strong>.
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
                {selectedQuestions.length} questão(ões) selecionada(s)
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
  onToggleSelected,
  onChange,
  onAlternativeChange,
  onReject,
  onSend,
  disabled = false,
}: {
  question: GeneratedQuestion;
  selected: boolean;
  onToggleSelected: () => void;
  onChange: (updates: Partial<GeneratedQuestion>) => void;
  onAlternativeChange: (index: number, updates: Partial<GeneratedAlternative>) => void;
  onReject: () => void;
  onSend: () => void;
  disabled?: boolean;
}) {
  const correct = question.alternatives.find((alternative) => alternative.is_correct);
  const isWrongTrueFalseAnswer =
    question.question_type === "true_false" &&
    (correct?.label === "E" || String(correct?.text || "").trim().toLowerCase() === "errado");
  const topicsPending = normalizeEvaluatedTopics(question.evaluated_topics).length === 0;

  return (
    <article
      className={`overflow-hidden rounded-[2rem] border backdrop-blur-sm transition-all duration-300 ${
        question.is_duplicate
          ? "border-red-500/40 bg-red-500/[0.06] shadow-xl shadow-black/30"
          : selected
            ? "border-orange-400/40 bg-white/[0.04] shadow-xl shadow-black/30 ring-1 ring-orange-400/20"
            : isQuestionImagePending(question)
              ? "border-blue-400/60 bg-white/[0.03] shadow-2xl shadow-blue-900/40 ring-2 ring-blue-400/25"
              : topicsPending
                ? "border-amber-400/60 bg-white/[0.03] shadow-2xl shadow-amber-900/40 ring-2 ring-amber-400/25"
                : "border-white/[0.07] bg-white/[0.03] shadow-xl shadow-black/30 hover:-translate-y-0.5 hover:border-white/[0.12]"
      }`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-6 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleSelected}
            disabled={Boolean(question.is_duplicate) || disabled}
            aria-label={selected ? "Desmarcar questão" : "Selecionar questão"}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition ${selected ? "border-orange-400 bg-orange-400 text-white" : "border-white/[0.15] bg-white/[0.04] text-transparent hover:border-orange-400/50 hover:bg-orange-400/[0.08] hover:text-orange-400/60"} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            <Check size={12} />
          </button>

          <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/[0.12] px-3 py-1 text-xs font-bold text-orange-300">
            {question.board_name}
          </span>

          {question.inspiring_board_name && (
            <span className="rounded-full border border-white/[0.09] bg-white/[0.05] px-3 py-1 text-xs font-semibold text-white/50">
              Inspirado: {question.inspiring_board_name}
            </span>
          )}

          <span className="rounded-full border border-white/[0.09] bg-white/[0.05] px-3 py-1 text-xs font-semibold text-white/50">
            {question.question_type === "true_false" ? "Assertiva" : "Alternativas"}
          </span>

          <span className="rounded-full border border-white/[0.09] bg-white/[0.05] px-3 py-1 text-xs font-semibold text-white/50">
            {question.discipline_name} / {question.subject_name}
          </span>

          <PremiumDifficultyStars value={question.difficulty_level} compact />

          {question.is_duplicate && (
            <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/[0.12] px-3 py-1 text-xs font-bold text-red-300">
              <AlertTriangle size={13} />
              Duplicada
            </span>
          )}

          {isQuestionImagePending(question) && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/60 bg-blue-500/25 px-3 py-1 text-xs font-bold text-blue-200">
              <ImageIcon size={12} className="text-blue-300" /> Imagem ausente
            </span>
          )}

          {topicsPending && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/60 bg-amber-500/25 px-3 py-1 text-xs font-bold text-amber-200">
              ⚠ Sem tópicos avaliados
            </span>
          )}
        </div>
      </div>

      {/* Statement */}
      <div className="border-b border-white/[0.06] px-6 py-5">
        <RichTextEditor
          value={question.statement}
          onChange={(value) => onChange({ statement: value })}
          placeholder="Enunciado da questão"
          disabled={disabled}
          minRows={3}
          className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm leading-6 text-white/70 outline-none focus:ring-2 focus:ring-orange-400/[0.08]"
        />

        {question.is_duplicate && question.duplicate_message && (
          <p className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/[0.08] px-4 py-3 text-sm font-semibold text-red-300">
            {question.duplicate_message}
          </p>
        )}
      </div>

      {/* Alternatives */}
      <div className="border-b border-white/[0.06] px-6 py-5">
        {question.question_type === "true_false" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {question.alternatives.map((alternative, index) => {
              const isWrong = alternative.label === "E" || String(alternative.text || "").trim().toLowerCase() === "errado";
              const isSelected = alternative.is_correct;
              return (
                <button
                  key={`${question.temp_id}-${alternative.label}-${index}`}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    const newAlts = question.alternatives.map((a, i) => ({ ...a, is_correct: i === index }));
                    onChange({ alternatives: newAlts });
                  }}
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
                  <span className="flex items-center gap-2">
                    {isSelected && <span className="font-normal leading-none">{OWL_MARK}</span>}
                    {alternative.label === "C" ? "Certo" : "Errado"}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="grid gap-3">
            {question.alternatives.map((alternative, index) => (
              <GeneratedAlternativeEditor
                key={`${question.temp_id}-${alternative.label}-${index}`}
                alternative={alternative}
                index={index}
                isCorrect={alternative.is_correct}
                disabled={disabled}
                onChange={(updates) => onAlternativeChange(index, updates)}
                onMarkCorrect={() => {
                  const newAlts = question.alternatives.map((a, i) => ({ ...a, is_correct: i === index }));
                  onChange({ alternatives: newAlts });
                }}
              />
            ))}
          </div>
        )}

        <p className={`mt-4 text-sm font-semibold ${isWrongTrueFalseAnswer ? "text-red-400" : "text-emerald-400"}`}>
          Resposta correta:{" "}
          {question.question_type === "true_false" ? correct?.text : correct?.label || "Não definida"}
        </p>
      </div>

      <div className="border-b border-white/[0.06] px-6 py-5">
        <div className="relative isolate">
          <div className="pointer-events-none absolute -inset-[3px] -z-10 rounded-2xl bg-gradient-to-b from-blue-400/25 via-blue-400/[0.06] to-transparent blur-[10px]" />
          <div className="rounded-2xl border border-blue-400/30 bg-blue-500/[0.05] p-4 shadow-inner shadow-blue-950/20">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-blue-200">Tópicos avaliados</p>
            <EvaluatedTopicsInput
              value={question.evaluated_topics}
              onChange={(evaluated_topics) => onChange({ evaluated_topics })}
              subjectId={question.subject_id || null}
              required
              disabled={disabled}
              variant="dark"
              placeholder="Ex.: Memória RAM, Placa-mãe"
            />
          </div>
        </div>
      </div>

      {/* Explanation */}
      {question.explanation_text && (
        <div className="border-b border-white/[0.06] px-6 py-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/30">Explicação</p>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm leading-6 text-white/50">
            {question.explanation_text}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:justify-end">
        <PremiumButton variant="secondary" icon={<Trash2 size={16} />} onClick={onReject} disabled={disabled}>
          Descartar
        </PremiumButton>

        {!question.is_duplicate && (
          <PremiumButton icon={<Send size={16} />} onClick={onSend} disabled={disabled}>
            Enviar para revisão
          </PremiumButton>
        )}
      </div>
    </article>
  );
}

function GeneratedAlternativeEditor({
  alternative,
  index,
  isCorrect,
  disabled,
  onChange,
  onMarkCorrect,
}: {
  alternative: GeneratedAlternative;
  index: number;
  isCorrect: boolean;
  disabled?: boolean;
  onChange: (updates: Partial<GeneratedAlternative>) => void;
  onMarkCorrect: () => void;
}) {
  const [isEliminated, setIsEliminated] = useState(false);
  const label = alternative.label || String.fromCharCode(65 + index);

  return (
    <div className="group relative pl-10">
      <button
        type="button"
        aria-label={isEliminated ? "Remover eliminação" : "Eliminar alternativa"}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsEliminated((v) => !v); }}
        className={`absolute left-0 top-0 z-20 flex h-full w-10 items-center justify-center transition ${isEliminated ? "opacity-100" : "opacity-0 hover:opacity-100 focus:opacity-100 focus-visible:opacity-100"}`}
      >
        <PremiumScissorsIcon size={18} />
      </button>

      <div
        onClick={!disabled ? onMarkCorrect : undefined}
        className={`cursor-pointer transition ${isEliminated ? "opacity-60" : ""} ${
          isCorrect
            ? "rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] p-3"
            : "rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3 hover:border-emerald-500/25 hover:bg-emerald-500/[0.05]"
        }`}
      >
        <div className="flex items-start gap-2">
          {isCorrect ? (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-emerald-500 bg-emerald-500/20 text-lg">
              <span className="block font-normal leading-none">{OWL_MARK}</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={(event) => { event.stopPropagation(); onMarkCorrect(); }}
              disabled={disabled}
              title="Marcar como correta"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/[0.15] bg-white/[0.04] text-xs font-black text-white/50 transition hover:border-emerald-500/40 hover:bg-emerald-500/[0.10] hover:text-emerald-300 disabled:opacity-40"
            >
              {label}
            </button>
          )}
          <div className="min-w-0 flex-1" onClick={(event) => event.stopPropagation()}>
            <RichTextEditor
              value={alternative.text}
              onChange={(v) => onChange({ text: v })}
              placeholder={`Resposta ${label}`}
              disabled={disabled}
              minRows={3}
              compact
              className={`w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm text-white/70 outline-none focus:ring-2 focus:ring-orange-400/[0.08] ${isEliminated ? "line-through decoration-red-500 decoration-2 [&_*]:line-through [&_*]:decoration-red-500 [&_*]:decoration-2" : ""}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SendReviewProgressModal({
  show,
  currentStep,
}: {
  show: boolean;
  currentStep: number;
}) {
  if (!show) return null;

  const steps = [
    "Preparando questões",
    "Validando duplicidades",
    "Organizando metadados",
    "Salvando no banco",
    "Enviando para revisão",
  ];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[2rem] border border-orange-100 bg-white p-7 shadow-2xl">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
          <Loader2 size={26} className="animate-spin" />
        </div>

        <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">
          Processando
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950">
          Enviando selecionadas para revisão
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Salvando informações no banco.
        </p>

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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm" onClick={onCancel}>
      <div className="relative w-full max-w-lg rounded-[2rem] bg-white p-7 shadow-2xl" onClick={(event) => event.stopPropagation()}>
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
          <PremiumButton variant="secondary" onClick={onCancel} disabled={disabled}>
            Cancelar
          </PremiumButton>
          <PremiumButton variant={variant === "danger" ? "danger" : "primary"} onClick={onConfirm} disabled={disabled}>
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
