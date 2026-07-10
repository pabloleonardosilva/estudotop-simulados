"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bold,
  CheckCircle2,
  Highlighter,
  ImageIcon,
  Info,
  Italic,
  Loader2,
  Plus,
  CopyCheck,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import PageBackground from "../../components/ui/PageBackground";
import PageHeader from "../../components/ui/PageHeader";
import PremiumButton from "../../components/ui/PremiumButton";
import PremiumCard from "../../components/ui/PremiumCard";
import PremiumInput from "../../components/ui/PremiumInput";
import PremiumSelect from "../../components/ui/PremiumSelect";
import PremiumLoadingOverlay from "../../components/ui/PremiumLoadingOverlay";
import SubjectMultiSelect from "../../components/questions/SubjectMultiSelect";
import EvaluatedTopicsInput from "../../components/questions/EvaluatedTopicsInput";
import DraftRestoreModal from "../../components/ui/DraftRestoreModal";
import { useLocalDraft } from "../../lib/useLocalDraft";
import RichTextEditor from "../../components/questions/RichTextEditor";
import { normalizeBoardComparableName } from "@/lib/utils/text";
import { adminFetch } from "@/app/lib/supabase/adminFetch";
import { normalizeEvaluatedTopics } from "@/lib/questions/evaluated-topics";
import { hasMeaningfulRichText, richTextToPlainText } from "@/lib/utils/rich-text";
import QuestionActionModal, { type QuestionActionModalState } from "../../components/questions/QuestionActionModal";
import QuestionTemplatePicker, {
  getTemplateAlternatives,
  getTemplateDisciplineId,
  getTemplateSubjectIds,
  type TemplateQuestion,
} from "../../components/questions/QuestionTemplatePicker";

type Alternative = {
  label: string;
  text: string;
  image_url: string;
  is_correct: boolean;
  showImage: boolean;
};

type Board = {
  id: string;
  name: string;
  is_active?: boolean;
};

type Feedback =
  | {
      type: "success" | "error";
      message: string;
      questionId?: string;
    }
  | null;

type QuestionDraft = {
  questionType: "multiple_choice" | "true_false";
  disciplineId: string;
  subjectIds: string[];
  boardId: string;
  statement: string;
  evaluatedTopics: string[];
  showStatementImage: boolean;
  imageUrl: string;
  explanation: string;
  year: string;
  difficulty: number | null;
  status: "pending_review" | "published" | "archived";
  alternatives: Alternative[];
};

const defaultAlternatives: Alternative[] = [
  { label: "A", text: "", image_url: "", is_correct: false, showImage: false },
  { label: "B", text: "", image_url: "", is_correct: false, showImage: false },
  { label: "C", text: "", image_url: "", is_correct: false, showImage: false },
  { label: "D", text: "", image_url: "", is_correct: false, showImage: false },
];

const trueFalseAlternatives: Alternative[] = [
  { label: "C", text: "Certo", image_url: "", is_correct: false, showImage: false },
  { label: "E", text: "Errado", image_url: "", is_correct: false, showImage: false },
];

const OWL_MARK = "\u{1F989}\uFE0F";

function isWrongTrueFalseAlternative(questionType: "multiple_choice" | "true_false", alternative: Alternative) {
  return questionType === "true_false" && alternative.is_correct && (alternative.label === "E" || alternative.text.trim().toLowerCase() === "errado");
}

function relabelAlternatives(items: Alternative[]) {
  return items.map((alt, index) => ({
    ...alt,
    label: String.fromCharCode(65 + index),
  }));
}

function getNextAlternativeLabel(items: Alternative[]) {
  return String.fromCharCode(65 + items.length);
}

function getDuplicateAlternativeLabels(alternatives: Alternative[]) {
  // Outer key: coarse (lowercased, accent-stripped) groups candidates together.
  // Inner key: fine (accent-stripped but case-preserved) separates alternatives that
  // differ only in capitalisation \u2014 they are valid distinct alternatives (e.g. exam
  // questions where CAPS is the meaningful difference between options).
  const byCoarse = new Map<string, Map<string, string[]>>();

  for (const alternative of alternatives) {
    const plain = richTextToPlainText(alternative.text)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!plain) continue;

    const coarse = plain.toLowerCase();
    const fine = plain;

    if (!byCoarse.has(coarse)) byCoarse.set(coarse, new Map());
    const sub = byCoarse.get(coarse)!;
    sub.set(fine, [...(sub.get(fine) || []), alternative.label]);
  }

  const result: string[][] = [];
  for (const sub of byCoarse.values()) {
    for (const labels of sub.values()) {
      if (labels.length > 1) result.push(labels);
    }
  }
  return result;
}

function formatDuplicateAlternativeMessage(groups: string[][]) {
  const details = groups.map((labels) => labels.join(" e ")).join("; ");
  return `As alternativas ${details} estão com o mesmo texto. Ajuste antes de salvar.`;
}

function findEstudoTopBoard(boards: Board[]) {
  return boards.find((board) => {
    const normalized = normalizeBoardComparableName(board.name);
    return normalized === "estudo top" || normalized === "estudotop" || normalized.includes("estudo top");
  }) || null;
}

export default function NovaQuestaoClient({
  disciplines,
  subjects,
  boards,
  modelQuestions,
}: {
  disciplines: any[];
  subjects: any[];
  boards: Board[];
  modelQuestions: TemplateQuestion[];
}) {
  const searchParams = useSearchParams();
  const [questionType, setQuestionType] = useState<"multiple_choice" | "true_false">("multiple_choice");
  const [disciplineId, setDisciplineId] = useState(disciplines[0]?.id || "");
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [boardId, setBoardId] = useState(boards[0]?.id || "");
  const [boardOptions, setBoardOptions] = useState<Board[]>(boards || []);

  const [statement, setStatement] = useState("");
  const [evaluatedTopics, setEvaluatedTopics] = useState<string[]>([]);
  const [showStatementImage, setShowStatementImage] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [explanation, setExplanation] = useState("");
  const [year, setYear] = useState("");
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [status, setStatus] = useState<"pending_review" | "published" | "archived">("pending_review");
  const [alternatives, setAlternatives] = useState<Alternative[]>(defaultAlternatives);

  const [saving, setSaving] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [actionModal, setActionModal] = useState<QuestionActionModalState>(null);
  const [possibleDuplicate, setPossibleDuplicate] = useState<any>(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [templateLoaded, setTemplateLoaded] = useState(false);
  const [templateAdjusted, setTemplateAdjusted] = useState(false);

  const [showBoardModal, setShowBoardModal] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [creatingBoard, setCreatingBoard] = useState(false);

  const filteredSubjects = useMemo(
    () => subjects.filter((subject) => subject.discipline_id === disciplineId),
    [subjects, disciplineId]
  );

  const selectedDiscipline = disciplines.find((item) => item.id === disciplineId);
  const selectedSubjects = subjects.filter((item) => subjectIds.includes(item.id));
  const selectedBoard = boardOptions.find((item) => item.id === boardId);
  const existingBoardWhileTyping = newBoardName.trim()
    ? boardOptions.find(
        (board) => normalizeBoardComparableName(board.name) === normalizeBoardComparableName(newBoardName),
      )
    : null;

  const estudoTopBoard = useMemo(() => findEstudoTopBoard(boardOptions), [boardOptions]);

  const draft = useMemo<QuestionDraft>(
    () => ({
      questionType,
      disciplineId,
      subjectIds,
      boardId,
      statement,
      evaluatedTopics,
      showStatementImage,
      imageUrl,
      explanation,
      year,
      difficulty,
      status,
      alternatives,
    }),
    [
      alternatives,
      boardId,
      difficulty,
      disciplineId,
      evaluatedTopics,
      explanation,
      imageUrl,
      questionType,
      showStatementImage,
      statement,
      status,
      subjectIds,
      year,
    ],
  );

  const hasDraftContent = useCallback((value: QuestionDraft) => {
    return Boolean(
      value.statement.trim() ||
        value.evaluatedTopics.length > 0 ||
        value.explanation.trim() ||
        value.imageUrl.trim() ||
        value.alternatives.some((alternative) => alternative.text.trim() || alternative.image_url.trim()),
    );
  }, []);

  const restoreDraft = useCallback((value: QuestionDraft) => {
    setQuestionType(value.questionType);
    setDisciplineId(value.disciplineId);
    setSubjectIds(value.subjectIds || []);
    setBoardId(value.boardId);
    setStatement(value.statement || "");
    setEvaluatedTopics(normalizeEvaluatedTopics(value.evaluatedTopics));
    setShowStatementImage(Boolean(value.showStatementImage));
    setImageUrl(value.imageUrl || "");
    setExplanation(value.explanation || "");
    setYear(value.year || "");
    setDifficulty(value.difficulty ?? null);
    setStatus(value.status || "pending_review");
    setAlternatives(value.alternatives?.length ? value.alternatives : defaultAlternatives);
  }, []);

  const { pendingDraft, restoreDraft: continueDraft, discardDraft, clearDraft } = useLocalDraft({
    storageKey: "estudotop:draft:questoes:nova",
    draft,
    hasContent: hasDraftContent,
    onRestore: restoreDraft,
  });

  useEffect(() => {
    if (templateLoaded) return;
    setAlternatives(questionType === "true_false" ? trueFalseAlternatives : defaultAlternatives);
  }, [questionType, templateLoaded]);

  useEffect(() => {
    if (searchParams.get("modelo") === "1") {
      setShowTemplatePicker(true);
    }
  }, [searchParams]);

  function markTemplateEdited() {
    if (!templateLoaded || templateAdjusted) return;

    if (!estudoTopBoard) {
      setTemplateAdjusted(true);
      setActionModal({
        open: true,
        tone: "warning",
        title: "Banca Estudo TOP não encontrada",
        message: "A questão foi carregada como modelo, mas não localizei a banca Estudo TOP no cadastro. Ajuste a banca manualmente antes de salvar.",
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
    const nextType = question.question_type === "true_false" ? "true_false" : "multiple_choice";
    const nextAlternatives = getTemplateAlternatives(question);

    setQuestionType(nextType);
    setDisciplineId(getTemplateDisciplineId(question) || disciplines[0]?.id || "");
    setSubjectIds(getTemplateSubjectIds(question));
    setBoardId(question.exam_boards?.id || question.exam_board_id || "");
    setStatement(question.statement || "");
    setShowStatementImage(Boolean(question.image_url));
    setImageUrl(question.image_url || "");
    setExplanation(question.explanation_text || "");
    setEvaluatedTopics(normalizeEvaluatedTopics((question as TemplateQuestion & { evaluated_topics?: string[] | null }).evaluated_topics));
    setYear(question.year ? String(question.year) : "");
    setDifficulty(question.difficulty_level || null);
    setStatus("pending_review");
    setAlternatives(nextAlternatives.length ? nextAlternatives : nextType === "true_false" ? trueFalseAlternatives : defaultAlternatives);
    setTemplateLoaded(true);
    setTemplateAdjusted(false);
    setShowTemplatePicker(false);
    setActionModal({
      open: true,
      tone: "duplicate",
      title: "Modelo carregado",
      message: "A questão original não será alterada. A primeira modificação trocará a banca para Estudo TOP e atualizará o ano.",
      onClose: () => setActionModal(null),
    });
  }

  useEffect(() => {
    if (statement.trim().length < 40 || !boardId) {
      setPossibleDuplicate(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const response = await adminFetch("/api/admin/questions/check-duplicate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            statement,
            alternatives,
            exam_board_id: boardId,
          }),
        });

        const result = await response.json();

        if (result.ok) {
          setPossibleDuplicate(result.possibleDuplicate || null);
        }
      } catch {
        setPossibleDuplicate(null);
      }
    }, 900);

    return () => clearTimeout(timer);
  }, [statement, alternatives, boardId]);

  function updateAlternative(index: number, field: keyof Alternative, value: string | boolean) {
    markTemplateEdited();
    setAlternatives((current) =>
      current.map((alt, i) => (i === index ? { ...alt, [field]: value } : alt))
    );
  }

  function markCorrect(index: number) {
    markTemplateEdited();
    setAlternatives((current) =>
      current.map((alt, i) => ({
        ...alt,
        is_correct: i === index,
      }))
    );
  }

  function addAlternative() {
    markTemplateEdited();
    if (questionType !== "multiple_choice" || alternatives.length >= 5) return;

    const nextLabel = getNextAlternativeLabel(alternatives);

    setAlternatives((current) => [
      ...current,
      {
        label: nextLabel,
        text: "",
        image_url: "",
        is_correct: false,
        showImage: false,
      },
    ]);
  }

  function removeAlternative(index: number) {
    markTemplateEdited();
    if (questionType !== "multiple_choice" || alternatives.length <= 2) return;
    setAlternatives((current) => relabelAlternatives(current.filter((_, i) => i !== index)));
  }

  async function createBoardInline() {
    setFeedback(null);

    const name = newBoardName.trim();

    if (!name) {
      setFeedback({ type: "error", message: "Informe o nome da banca." });
      return;
    }

    setCreatingBoard(true);

    try {
      const response = await adminFetch("/api/admin/exam-boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Erro ao cadastrar banca.");
      }

      const board = result.board;

      setBoardOptions((current) => {
        const alreadyExists = current.some((item) => item.id === board.id);
        if (alreadyExists) return current;
        return [...current, board].sort((a, b) => a.name.localeCompare(b.name));
      });

      setBoardId(board.id);
      setNewBoardName("");
      setShowBoardModal(false);
      setFeedback({
        type: "success",
        message: result.created ? "Banca cadastrada e selecionada." : "Banca já existia e foi selecionada.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao cadastrar banca.",
      });
    } finally {
      setCreatingBoard(false);
    }
  }

  async function generateExplanation() {
    setFeedback(null);

    if (!hasMeaningfulRichText(statement, 10)) {
      setFeedback({ type: "error", message: "Digite o enunciado antes de gerar a explicação." });
      return;
    }

    if (!alternatives.some((alt) => alt.is_correct)) {
      setFeedback({ type: "error", message: "Marque a resposta correta antes de gerar a explicação." });
      return;
    }

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
          subject: selectedSubjects.map((subject) => subject.name).join(", "),
          board: selectedBoard?.name,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Falha ao gerar explicação.");
      }

      setExplanation(result.explanation || "");
      setFeedback({ type: "success", message: "Explicação gerada com IA. Revise antes de salvar." });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao gerar explicação.",
      });
    } finally {
      setGeneratingAI(false);
    }
  }

  async function handleSubmit() {
    setFeedback(null);

    if (subjectIds.length === 0) {
      setFeedback({ type: "error", message: "Selecione o assunto da questão." });
      return;
    }

    if (!boardId) {
      setFeedback({ type: "error", message: "Selecione a banca organizadora." });
      return;
    }

    if (!year || year.length !== 4) {
      setFeedback({ type: "error", message: "Informe o ano da questão." });
      return;
    }

    if (!status) {
      setFeedback({ type: "error", message: "Selecione o status da questão." });
      return;
    }

    if (!hasMeaningfulRichText(statement, 10)) {
      setFeedback({ type: "error", message: "Informe o enunciado da questão." });
      return;
    }

    const normalizedEvaluatedTopics = normalizeEvaluatedTopics(evaluatedTopics);

    if (normalizedEvaluatedTopics.length === 0) {
      setFeedback({ type: "error", message: "Informe pelo menos um tópico avaliado pela questão." });
      return;
    }

    if (!alternatives.some((alt) => alt.is_correct)) {
      setFeedback({ type: "error", message: "Marque a resposta correta da questão." });
      return;
    }

    if (questionType === "multiple_choice" && alternatives.length < 4) {
      setFeedback({ type: "error", message: "Cadastre pelo menos 4 alternativas." });
      return;
    }

    if (alternatives.some((alt) => !alt.text.trim() && !alt.image_url?.trim())) {
      setFeedback({ type: "error", message: "Todas as alternativas/assertivas precisam ter texto ou imagem." });
      return;
    }

    const duplicateAlternativeGroups = getDuplicateAlternativeLabels(alternatives);
    if (duplicateAlternativeGroups.length > 0) {
      setFeedback({ type: "error", message: formatDuplicateAlternativeMessage(duplicateAlternativeGroups) });
      return;
    }

    setSaving(true);

    try {
      const response = await adminFetch("/api/admin/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_type: questionType,
          discipline_id: disciplineId,
          subject_id: subjectIds[0],
          subject_ids: subjectIds,
          exam_board_id: boardId,
          statement,
          image_url: imageUrl,
          explanation_text: explanation,
          evaluated_topics: normalizedEvaluatedTopics,
          year: year ? Number(year) : null,
          difficulty_level: difficulty,
          status,
          alternatives,
          source_origin: "bank",
          is_in_question_bank: true,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Erro ao cadastrar questão.");
      }

      setFeedback({
        type: "success",
        message: result.message || "Questão cadastrada com sucesso.",
        questionId: result.questionId,
      });

      setStatement("");
      setEvaluatedTopics([]);
      setImageUrl("");
      setShowStatementImage(false);
      setExplanation("");
      setYear("");
      setDifficulty(null);
      setStatus("pending_review");
      setQuestionType("multiple_choice");
      setAlternatives(defaultAlternatives);
      setPossibleDuplicate(null);
      clearDraft();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao cadastrar questão.",
      });
    } finally {
      setSaving(false);
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
      <QuestionActionModal modal={actionModal} />
      <QuestionTemplatePicker
        open={showTemplatePicker}
        questions={modelQuestions}
        disciplines={disciplines}
        subjects={subjects}
        boards={boardOptions}
        onClose={() => setShowTemplatePicker(false)}
        onSelect={loadTemplate}
      />

      <PremiumLoadingOverlay
        show={saving || generatingAI || creatingBoard}
        title={
          creatingBoard
            ? "Cadastrando banca..."
            : generatingAI
              ? "Gerando explicação..."
              : "Salvando questão..."
        }
        message={
          creatingBoard
            ? "Registrando banca organizadora."
            : generatingAI
              ? "A IA está analisando a questão."
              : "Validando duplicidade e registrando no banco mestre."
        }
      />

      {showBoardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600">
                Nova banca
              </p>
              <h2 className="mt-1 text-xl font-bold text-slate-950">
                Cadastrar banca organizadora
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Digite o nome da banca. Ela será cadastrada e selecionada automaticamente.
              </p>
            </div>

            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Nome da banca
            </label>
            <input
              value={newBoardName}
              onChange={(event) => setNewBoardName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") createBoardInline();
                if (event.key === "Escape") setShowBoardModal(false);
              }}
              autoFocus
              placeholder="Ex.: FUNDATEC"
              className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-medium text-slate-800 outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
            />

            {existingBoardWhileTyping && (
              <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
                Já existe uma banca equivalente: {existingBoardWhileTyping.name}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowBoardModal(false);
                  setNewBoardName("");
                }}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={createBoardInline}
                disabled={creatingBoard}
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-orange-200 hover:from-orange-700 hover:to-amber-600 disabled:opacity-60"
              >
                {creatingBoard && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      <PageHeader
        title="Nova questão"
        description="Mesa de montagem de questão."
        action={
          <div className="flex flex-wrap gap-3">
            <PremiumButton variant="secondary" icon={<CopyCheck size={18} />} onClick={() => setShowTemplatePicker(true)}>
              Usar como modelo
            </PremiumButton>
            <Link href="/questoes">
              <PremiumButton variant="secondary" icon={<ArrowLeft size={18} />}>
                Voltar
              </PremiumButton>
            </Link>
          </div>
        }
      />

      {templateLoaded && (
        <div className="mb-6 flex flex-wrap gap-3">
          <span className="rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-bold text-orange-700">
            Criada a partir de modelo
          </span>
          {templateAdjusted && (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700">
              Banca alterada para Estudo TOP e ano atualizado automaticamente.
            </span>
          )}
        </div>
      )}

      {feedback && <Notice feedback={feedback} onClose={() => setFeedback(null)} />}

      {possibleDuplicate && (
        <div className="mb-6 rounded-[2rem] border border-red-200 bg-gradient-to-r from-red-50 to-white p-5 text-red-900 shadow-sm">
          <p className="font-semibold">Questão duplicada encontrada para esta mesma banca.</p>
          <p className="mt-1 text-sm">
            Similaridade: {Math.round((possibleDuplicate.similarity || 0) * 100)}%.
          </p>
          <p className="mt-1 text-sm">
            Status atual: <strong>{possibleDuplicate.status || "não informado"}</strong>.
          </p>
          <p className="mt-3 line-clamp-3 rounded-2xl bg-white/70 p-3 text-sm">
            {possibleDuplicate.statement}
          </p>
        </div>
      )}

      <PremiumCard title="Classificação" description="Selecione disciplina, assunto, banca e tipo." icon={<Info size={18} />}>
        <div className="grid gap-5 md:grid-cols-6">
          <PremiumSelect
            label="Tipo"
            value={questionType}
            onChange={(event: any) => {
              markTemplateEdited();
              setQuestionType(event.target.value);
            }}
          >
            <option value="multiple_choice">Alternativas</option>
            <option value="true_false">Assertivas</option>
          </PremiumSelect>

          <PremiumSelect
            label="Disciplina"
            value={disciplineId}
            onChange={(event: any) => {
              if (event.target.value === "__new") {
                window.location.href = "/disciplinas";
                return;
              }
              markTemplateEdited();
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
            onChange={(ids) => {
              markTemplateEdited();
              setSubjectIds(ids);
            }}
            emptyLabel="Selecione"
            disciplineId={disciplineId}
          />

          <PremiumSelect
            label="Banca"
            value={boardId}
            onChange={(event: any) => {
              if (event.target.value === "__new") {
                setShowBoardModal(true);
                return;
              }
              markTemplateEdited();
              setBoardId(event.target.value);
            }}
          >
            <option value="">Selecione</option>
            {boardOptions.map((board) => (
              <option key={board.id} value={board.id}>
                {board.name}
              </option>
            ))}
            <option value="__new">+ Cadastrar nova banca</option>
          </PremiumSelect>

          <PremiumInput
            label="Ano"
            value={year}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              {
                markTemplateEdited();
                setYear(event.target.value.replace(/\D/g, "").slice(0, 4));
              }
            }
            placeholder="Ex.: 2025"
            inputMode="numeric"
          />
        </div>
      </PremiumCard>

      <PremiumCard
        title="Tópicos avaliados"
        description="Informe os tópicos específicos cobrados pela questão."
        icon={<Info size={18} />}
        className="border-blue-300 ring-blue-100 shadow-[0_0_0_3px_rgba(59,130,246,0.08)]"
      >
        <EvaluatedTopicsInput
          value={evaluatedTopics}
          onChange={(topics) => {
            markTemplateEdited();
            setEvaluatedTopics(topics);
          }}
          subjectId={subjectIds[0] || null}
          required
          variant="light"
          placeholder="Ex.: Memória RAM, Placa-mãe"
        />
      </PremiumCard>

      <div
        className={
          possibleDuplicate
            ? "mt-6 rounded-[2rem] border-2 border-red-300 bg-red-50 p-4 shadow-sm shadow-red-100 md:p-6"
            : "mt-6 rounded-[2rem] border border-slate-200 bg-slate-100/70 p-4 shadow-sm md:p-6"
        }
      >
        <div className="mb-5 flex flex-wrap items-center gap-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white" />
          <span className="text-xl font-semibold text-slate-950">1.</span>

          <RichTextarea
            value={statement}
            onChange={(value) => {
              markTemplateEdited();
              setStatement(value);
            }}
            placeholder={
              questionType === "multiple_choice"
                ? "Quer fazer uma pergunta de escolha múltipla?"
                : "Digite a assertiva para o aluno julgar como certo ou errado..."
            }
            className="min-h-12 flex-1 rounded-xl border border-white bg-white px-4 py-3 text-base text-slate-700 outline-none focus:ring-4 focus:ring-orange-100"
          />

          <input
            className="h-12 w-28 rounded-xl border border-white bg-white px-4 text-center text-slate-700 outline-none"
            value="1"
            readOnly
          />
          <span className="text-sm text-slate-400">ponto</span>
        </div>

        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => {
              markTemplateEdited();
              setShowStatementImage(!showStatementImage);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-500 shadow-sm hover:text-orange-600"
          >
            <ImageIcon size={16} />
            Imagem do enunciado
          </button>
        </div>

        {showStatementImage && (
          <ImageUrlEditor
            value={imageUrl}
            onChange={(value) => {
              markTemplateEdited();
              setImageUrl(value);
            }}
            label="Imagem abaixo do enunciado"
          />
        )}

        {questionType === "true_false" ? (
          <InlineTrueFalseEditor alternatives={alternatives} onMarkCorrect={markCorrect} />
        ) : (
          <div className="mt-5 space-y-3">
            {alternatives.map((alt, index) => (
              <div key={alt.label}>
                <div className={possibleDuplicate ? "flex items-start gap-3 rounded-2xl border border-red-200 bg-red-100/70 p-2" : alt.is_correct ? "flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-2" : "flex items-start gap-3 rounded-2xl p-2"}>
                  <button
                    type="button"
                    onClick={() => removeAlternative(index)}
                    disabled={alternatives.length <= 2}
                    className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                  >
                    <X size={18} />
                  </button>

                  <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-700">
                    {alt.label}
                  </span>

                  <button
                    type="button"
                    onClick={() => markCorrect(index)}
                    title="Marcar como correta"
                    className={alt.is_correct ? "mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-emerald-400 bg-emerald-100 text-xl shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" : "mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 bg-white text-slate-300 hover:border-emerald-300 hover:bg-emerald-50"}
                  >
                    {alt.is_correct ? <span className="font-normal leading-none [font-family:'Segoe_UI_Emoji','Apple_Color_Emoji','Noto_Color_Emoji',sans-serif]">{OWL_MARK}</span> : null}
                  </button>

                  <RichTextarea
                    value={alt.text}
                    onChange={(value) => updateAlternative(index, "text", value)}
                    placeholder={`Resposta ${alt.label}`}
                    className="w-full rounded-xl border border-white bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:ring-4 focus:ring-orange-100 disabled:text-slate-500"
                    minRows={1}
                    compact
                  />

                  <button
                    type="button"
                    onClick={() => updateAlternative(index, "showImage", !alt.showImage)}
                    className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-white hover:text-orange-600"
                  >
                    <ImageIcon size={20} />
                  </button>
                </div>

                {alt.showImage && (
                  <div className="mt-2 pl-24">
                    <ImageUrlEditor
                      value={alt.image_url}
                      onChange={(value) => updateAlternative(index, "image_url", value)}
                      label={`Imagem da alternativa ${alt.label}`}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

                {questionType === "multiple_choice" && alternatives.length < 5 && (
          <div className="mt-4">
            <button
              type="button"
              onClick={addAlternative}
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-orange-700 shadow-sm hover:bg-orange-50"
            >
              <Plus size={16} />
              Adicionar alternativa
            </button>
          </div>
        )}

        <div className="mt-8 flex items-start gap-3">
          <span className="mt-3 flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm">
            <Info size={16} />
          </span>

          <RichTextarea
            value={explanation}
            onChange={(value) => {
              markTemplateEdited();
              setExplanation(value);
            }}
            placeholder="Pode incluir uma explicação."
            className="min-h-11 flex-1 rounded-xl border border-white bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:ring-4 focus:ring-orange-100"
          />

          <div className="mt-1 flex items-center gap-2 rounded-2xl bg-white p-2 shadow-sm">
            <EditorToggle icon={<Bold size={15} />} />
            <EditorToggle icon={<Italic size={15} />} />
            <EditorToggle icon={<Highlighter size={15} />} />
          </div>

          <button
            type="button"
            onClick={generateExplanation}
            disabled={generatingAI}
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-white px-4 text-sm font-bold text-orange-600 shadow-sm hover:bg-orange-50 disabled:opacity-60"
          >
            {generatingAI ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles size={16} />
            )}
            IA
          </button>
        </div>
      </div>

      <PremiumCard
        className="mt-6"
        title="Configurações finais"
        description="Defina dificuldade e status."
        icon={<Star size={18} />}
      >
        <div className="grid gap-5 md:grid-cols-2">
          <StarRatingField value={difficulty} onChange={(value) => {
            markTemplateEdited();
            setDifficulty(value);
          }} />

          <PremiumSelect
            label="Status"
            value={status}
            onChange={(event: any) => {
              markTemplateEdited();
              setStatus(event.target.value);
            }}
          >
            <option value="pending_review">Pendente revisão</option>
            <option value="published">Publicada</option>
            <option value="archived">Arquivada</option>
          </PremiumSelect>
        </div>

        <div className="mt-8 flex justify-end">
          <PremiumButton
            onClick={handleSubmit}
            disabled={saving || !!possibleDuplicate}
            icon={<CheckCircle2 size={18} />}
          >
            {possibleDuplicate ? "Questão duplicada" : "Salvar questão"}
          </PremiumButton>
        </div>
      </PremiumCard>
    </PageBackground>
  );
}

function Notice({ feedback, onClose }: { feedback: Feedback; onClose: () => void }) {
  if (!feedback) return null;

  const isSuccess = feedback.type === "success";

  return (
    <QuestionActionModal
      modal={{
        open: true,
        tone: isSuccess ? "success" : "error",
        title: isSuccess ? "Tudo certo" : "Não foi possível continuar",
        message: feedback.message,
        primaryLabel: feedback.questionId ? "Visualizar questão" : "Entendi",
        secondaryLabel: feedback.questionId ? "Fechar" : undefined,
        onPrimary: feedback.questionId ? () => window.open(`/questoes/${feedback.questionId}/preview`, "_blank", "noopener,noreferrer") : onClose,
        onSecondary: onClose,
        onClose,
      }}
    />
  );
}

function StarRatingField({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">Dificuldade</label>
      <div className="flex h-12 items-center gap-1 rounded-2xl border border-slate-200 bg-white px-3 shadow-sm">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(value === star ? null : star)}
            className={value && star <= value ? "text-amber-500" : "text-slate-300 hover:text-amber-400"}
            aria-label={`Dificuldade ${star}`}
          >
            <Star size={18} fill={value && star <= value ? "currentColor" : "none"} />
          </button>
        ))}
      </div>
    </div>
  );
}

function EditorToggle({
  icon,
}: {
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-50 hover:text-orange-600"
    >
      {icon}
    </button>
  );
}

function InlineTrueFalseEditor({
  alternatives,
  onMarkCorrect,
}: {
  alternatives: Alternative[];
  onMarkCorrect: (index: number) => void;
}) {
  const correctIndex = alternatives.findIndex((alternative) => alternative.is_correct);

  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      {["Certo", "Errado"].map((label, index) => {
        const isSelected = correctIndex === index;
        const isWrong = label === "Errado";

        return (
          <button
            key={label}
            type="button"
            onClick={() => onMarkCorrect(index)}
            className={
              isSelected && isWrong
                ? "rounded-2xl border border-red-200 bg-red-100 px-5 py-4 text-left text-sm font-bold text-red-800 shadow-[0_0_0_3px_rgba(239,68,68,0.10)]"
              : isSelected
                ? "rounded-2xl border border-emerald-200 bg-emerald-100 px-5 py-4 text-left text-sm font-bold text-emerald-800 shadow-[0_0_0_3px_rgba(16,185,129,0.10)]"
              : isWrong
                ? "rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left text-sm font-semibold text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                : "rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left text-sm font-semibold text-slate-600 hover:border-emerald-200 hover:bg-emerald-50"
            }
          >
            <span className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2">
                {isSelected && (
                  <span className="font-normal leading-none [font-family:'Segoe_UI_Emoji','Apple_Color_Emoji','Noto_Color_Emoji',sans-serif]">
                    {OWL_MARK}
                  </span>
                )}
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

function ImageUrlEditor({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </label>

      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Cole a imagem aqui com CTRL + V ou insira URL..."
        className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm text-slate-700 outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
        onPaste={async (event) => {
          const items = event.clipboardData?.items || [];

          for (const item of items) {
            if (item.type.startsWith("image/")) {
              event.preventDefault();

              const file = item.getAsFile();

              if (!file) return;

              const formData = new FormData();
              formData.append("file", file);

              const response = await fetch(
                "/api/admin/upload-image",
                {
                  method: "POST",
                  body: formData,
                }
              );

              const result = await response.json();

              if (result.ok && result.url) {
                onChange(result.url);
              }

              return;
            }
          }
        }}
      />

      {value && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 p-3">
          <img
            src={value}
            alt="Preview"
            className="max-h-48 rounded-xl object-contain"
          />
        </div>
      )}
    </div>
  );
}

function RichTextarea({
  value,
  onChange,
  placeholder,
  className = "",
  minRows = 2,
  disabled = false,
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
  minRows?: number;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <RichTextEditor
      value={value}
      disabled={disabled}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      minRows={Math.max(minRows, 3)}
      compact={compact}
    />
  );
}
