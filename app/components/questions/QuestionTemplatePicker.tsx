"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, FileQuestion, Search, X } from "lucide-react";
import PremiumButton from "../ui/PremiumButton";
import PremiumInput from "../ui/PremiumInput";
import PremiumSelect from "../ui/PremiumSelect";
import { richTextToPlainText } from "@/lib/utils/rich-text";
import { difficultyStars } from "@/lib/utils/difficulty-stars";
import PremiumDifficultyStars from "@/app/components/questions/PremiumDifficultyStars";

export type TemplateAlternative = {
  id?: string;
  label?: string | null;
  text?: string | null;
  image_url?: string | null;
  is_correct?: boolean | null;
  order_number?: number | null;
};

export type TemplateQuestion = {
  id: string;
  code?: string | null;
  statement?: string | null;
  status?: string | null;
  question_type?: string | null;
  year?: number | null;
  difficulty_level?: number | null;
  image_url?: string | null;
  explanation_text?: string | null;
  subject_id?: string | null;
  exam_board_id?: string | null;
  subjects?: {
    id: string;
    name: string;
    discipline_id?: string | null;
    disciplines?: { id: string; name: string } | null;
  } | null;
  question_subjects?: {
    subjects?: {
      id: string;
      name: string;
      discipline_id?: string | null;
      disciplines?: { id: string; name: string } | null;
    } | null;
  }[];
  exam_boards?: { id: string; name: string } | null;
  question_alternatives?: TemplateAlternative[];
};

type Option = { id: string; name: string; discipline_id?: string | null };

export default function QuestionTemplatePicker({
  open,
  questions,
  disciplines,
  subjects,
  boards,
  onClose,
  onSelect,
}: {
  open: boolean;
  questions: TemplateQuestion[];
  disciplines: Option[];
  subjects: Option[];
  boards: Option[];
  onClose: () => void;
  onSelect: (question: TemplateQuestion) => void;
}) {
  const [search, setSearch] = useState("");
  const [disciplineId, setDisciplineId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [boardId, setBoardId] = useState("");
  const [year, setYear] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const filteredSubjects = useMemo(
    () => (disciplineId ? subjects.filter((subject) => subject.discipline_id === disciplineId) : subjects),
    [subjects, disciplineId],
  );

  const filteredQuestions = useMemo(() => {
    const term = normalize(search);

    return questions
      .filter((question) => {
        const subjectIds = getSubjectIds(question);
        const questionDisciplineIds = getDisciplineIds(question);
        const text = normalize([
          question.code,
          question.statement,
          question.exam_boards?.name,
          question.subjects?.name,
          ...(question.question_subjects || []).map((item) => item.subjects?.name),
        ].filter(Boolean).join(" "));

        return (
          question.status === "published" &&
          (!term || text.includes(term)) &&
          (!disciplineId || questionDisciplineIds.includes(disciplineId)) &&
          (!subjectId || subjectIds.includes(subjectId)) &&
          (!boardId || question.exam_boards?.id === boardId || question.exam_board_id === boardId) &&
          (!year || String(question.year || "") === year) &&
          (!difficulty || String(question.difficulty_level || "") === difficulty)
        );
      })
      .slice(0, 120);
  }, [questions, search, disciplineId, subjectId, boardId, year, difficulty]);

  const selectedQuestion = filteredQuestions.find((question) => question.id === selectedId) || null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="flex max-h-[92vh] w-full max-w-6xl flex-col rounded-[2rem] border border-white/60 bg-white p-6 shadow-2xl shadow-slate-950/25"
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-amber-300">
                  <FileQuestion size={22} />
                </div>
                <div>
                  <h2 className="text-2xl font-semibold text-slate-950">Usar questão como modelo</h2>
                  <p className="mt-1 text-sm text-slate-500">Escolha uma questão publicada para criar uma nova, sem alterar a original.</p>
                </div>
              </div>
              <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-3 border-y border-slate-100 py-4 lg:grid-cols-6">
              <PremiumInput label="Texto" value={search} icon={<Search size={15} />} onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)} placeholder="Codigo ou enunciado" />
              <PremiumSelect label="Disciplina" value={disciplineId} onChange={(event: ChangeEvent<HTMLSelectElement>) => { setDisciplineId(event.target.value); setSubjectId(""); }}>
                <option value="">Todas</option>
                {disciplines.map((discipline) => <option key={discipline.id} value={discipline.id}>{discipline.name}</option>)}
              </PremiumSelect>
              <PremiumSelect label="Assunto" value={subjectId} onChange={(event: ChangeEvent<HTMLSelectElement>) => setSubjectId(event.target.value)}>
                <option value="">Todos</option>
                {filteredSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
              </PremiumSelect>
              <PremiumSelect label="Banca" value={boardId} onChange={(event: ChangeEvent<HTMLSelectElement>) => setBoardId(event.target.value)}>
                <option value="">Todas</option>
                {boards.map((board) => <option key={board.id} value={board.id}>{board.name}</option>)}
              </PremiumSelect>
              <PremiumInput label="Ano" value={year} inputMode="numeric" onChange={(event: ChangeEvent<HTMLInputElement>) => setYear(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="Ex.: 2023" />
              <PremiumSelect label="Dificuldade" value={difficulty} onChange={(event: ChangeEvent<HTMLSelectElement>) => setDifficulty(event.target.value)}>
                <option value="">Todas</option>
                {[1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>{difficultyStars(level)}</option>)}
              </PremiumSelect>
            </div>

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="grid gap-3">
                {filteredQuestions.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                    <FileQuestion className="mx-auto mb-3 text-slate-400" size={34} />
                    <p className="font-semibold text-slate-900">Nenhuma questão publicada encontrada</p>
                    <p className="mt-1 text-sm text-slate-500">Ajuste os filtros para buscar outro modelo.</p>
                  </div>
                )}

                {filteredQuestions.map((question) => {
                  const selected = selectedId === question.id;
                  return (
                    <button
                      type="button"
                      key={question.id}
                      onClick={() => setSelectedId(question.id)}
                      className={`rounded-2xl border p-4 text-left transition ${selected ? "border-orange-300 bg-orange-50 ring-4 ring-orange-100" : "border-slate-200 bg-white hover:border-orange-200"}`}
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
                        <span className="rounded-full bg-slate-950 px-3 py-1 text-white">{question.code || "Sem codigo"}</span>
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600">{question.exam_boards?.name || "Sem banca"}</span>
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600">{question.subjects?.disciplines?.name || "Sem disciplina"} / {question.subjects?.name || "Sem assunto"}</span>
                        <PremiumDifficultyStars value={question.difficulty_level} compact />
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600">{question.year || "Sem ano"}</span>
                      </div>
                      <p className="line-clamp-3 text-sm leading-6 text-slate-700">{richTextToPlainText(question.statement || "")}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
              <PremiumButton variant="secondary" onClick={onClose}>Cancelar</PremiumButton>
              <PremiumButton
                disabled={!selectedQuestion}
                icon={<CheckCircle2 size={18} />}
                onClick={() => {
                  if (selectedQuestion) onSelect(selectedQuestion);
                }}
              >
                Usar como modelo
              </PremiumButton>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function getTemplateSubjectIds(question: TemplateQuestion) {
  const ids = new Set<string>();
  if (question.subjects?.id) ids.add(question.subjects.id);
  (question.question_subjects || []).forEach((item) => {
    if (item.subjects?.id) ids.add(item.subjects.id);
  });
  return Array.from(ids);
}

export function getTemplateDisciplineId(question: TemplateQuestion) {
  return (
    question.question_subjects?.[0]?.subjects?.discipline_id ||
    question.question_subjects?.[0]?.subjects?.disciplines?.id ||
    question.subjects?.discipline_id ||
    question.subjects?.disciplines?.id ||
    ""
  );
}

export function getTemplateAlternatives(question: TemplateQuestion) {
  return [...(question.question_alternatives || [])]
    .sort((a, b) => Number(a.order_number || 0) - Number(b.order_number || 0))
    .map((alternative, index) => ({
      label: alternative.label || String.fromCharCode(65 + index),
      text: alternative.text || "",
      image_url: alternative.image_url || "",
      is_correct: Boolean(alternative.is_correct),
      showImage: Boolean(alternative.image_url),
    }));
}

function getSubjectIds(question: TemplateQuestion) {
  return getTemplateSubjectIds(question);
}

function getDisciplineIds(question: TemplateQuestion) {
  return Array.from(new Set([
    getTemplateDisciplineId(question),
    question.subjects?.discipline_id || "",
    ...(question.question_subjects || []).map((item) => item.subjects?.discipline_id || item.subjects?.disciplines?.id || ""),
  ].filter(Boolean)));
}

function normalize(value: string) {
  return (value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
