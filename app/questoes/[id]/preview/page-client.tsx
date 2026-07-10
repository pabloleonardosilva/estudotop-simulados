"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileText,
  ImageIcon,
  ShieldCheck,
} from "lucide-react";
import StudentExplanationAuthorCard from "../../../components/questions/StudentExplanationAuthorCard";
import { extractQuestionSubjects, formatQuestionSubjects } from "@/lib/questions/question-subjects";
import { isQuestionImagePending } from "@/lib/questions/image-pending";
import {
  getStudentAlternatives,
  getStudentCorrectAlternative,
} from "@/lib/questions/true-false-alternatives";
import PremiumDifficultyStars from "@/app/components/questions/PremiumDifficultyStars";

const OWL_MARK = "\u{1F989}\uFE0F";

type Alternative = {
  id?: string;
  label: string;
  text: string;
  image_url?: string | null;
  is_correct?: boolean;
  order_number?: number;
};

type Question = {
  id: string;
  code?: string | null;
  statement: string;
  status?: string | null;
  question_type?: string | null;
  difficulty_level?: number | null;
  image_url?: string | null;
  explanation_text?: string | null;
  created_at?: string | null;
  subjects?: {
    id: string;
    name: string;
    disciplines?: {
      id: string;
      name: string;
    } | null;
  } | null;
  question_subjects?: {
    subjects?: {
      id: string;
      name: string;
      discipline_id?: string | null;
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
  question_alternatives: Alternative[];
};

function safeHtml(value?: string | null) {
  return { __html: normalizePreviewHtml(value || "") };
}

function normalizePreviewHtml(input: string) {
  if (!input) return "";

  let output = input;

  if (
    output.includes("&lt;") ||
    output.includes("&gt;") ||
    output.includes("&amp;")
  ) {
    const textarea =
      typeof document !== "undefined" ? document.createElement("textarea") : null;

    if (textarea) {
      textarea.innerHTML = output;
      output = textarea.value;
    }
  }

  output = output
    .replace(
      /<mark([^>]*)>/gi,
      '<mark data-highlight="true" class="bg-yellow-200 px-1 rounded">',
    )
    .replace(
      /<span([^>]*background-color:\s*(?:rgb\(254,\s*240,\s*138\)|#fef08a|yellow)[^>]*)>/gi,
      '<mark data-highlight="true" class="bg-yellow-200 px-1 rounded">',
    )
    .replace(/<\/span>/gi, "</mark>");

  if (!/<(p|div|br|h[1-6]|ul|ol|li|blockquote)\b/i.test(output)) {
    output = output.replace(/\n/g, "<br>");
  }

  return output;
}

function getStatusLabel(status?: string | null) {
  if (status === "pending_review") return "Pendente revisão";
  if (status === "published") return "Publicada";
  if (status === "active") return "Ativa";
  if (status === "archived") return "Arquivada";
  return "Rascunho";
}

function getQuestionCode(question: Question) {
  return question.code || "ET0000";
}

export default function PreviewQuestaoClient({
  question,
}: {
  question: Question;
}) {
  const linkedSubjects = extractQuestionSubjects(question);
  const disciplineName = Array.from(
    new Set(linkedSubjects.map((subject) => subject?.disciplines?.name).filter(Boolean)),
  ).join(", ") || "Disciplina";
  const subjectName = formatQuestionSubjects(question);
  const boardName = question.exam_boards?.name || "Banca";
  const code = getQuestionCode(question);
  const isTrueFalse = question.question_type === "true_false";
  const studentAlternatives = getStudentAlternatives(
    question.question_type,
    question.question_alternatives,
  );
  const correctAlternative = getStudentCorrectAlternative(
    question.question_type,
    question.question_alternatives,
  );
  const isWrongTrueFalseAnswer = isTrueFalse && (correctAlternative?.label === "E" || String(correctAlternative?.text || "").trim().toLowerCase() === "errado");

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-8 text-slate-950">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-orange-700">
                <ShieldCheck size={14} />
                Pré-visualização do simulado
              </div>

              <h1 className="text-2xl font-black tracking-tight text-slate-950">
                Questão {code}
              </h1>

              <p className="mt-1 text-sm text-slate-500">
                Visualização fiel de como a questão será exibida para o aluno.
              </p>
            </div>

            <button
              type="button"
              onClick={() => window.close()}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 active:scale-[0.98]"
            >
              <ArrowLeft size={16} />
              Fechar guia
            </button>
          </div>
        </header>

        <section className="mb-6 grid gap-3 md:grid-cols-4">
          <InfoCard label="Disciplina" value={disciplineName} />
          <InfoCard label="Assunto" value={subjectName} />
          <InfoCard label="Banca" value={boardName} />
          <InfoCard label="Status" value={getStatusLabel(question.status)} />
          {isQuestionImagePending(question) && (
            <div className="col-span-full inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-100 px-4 py-2 text-xs font-semibold text-blue-700">
              <ImageIcon size={14} />
              Imagem ausente — esta questão contém referência a imagem que ainda não foi inserida.
            </div>
          )}
        </section>

        <section className={`rounded-[2rem] border p-6 shadow-sm md:p-8 ${isQuestionImagePending(question) ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}>
          <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-500/20">
                <FileText size={20} />
              </div>

              <div>
                <p className="text-sm font-black text-slate-950">
                  Questão {code}
                </p>

                <p className="text-xs text-slate-500">Modo aluno</p>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-500">
              <Clock size={14} />1 ponto
            </div>
          </div>

          {question.image_url ? (
            <div className="mb-6 overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
              <img
                src={question.image_url}
                alt="Imagem do enunciado"
                className="max-h-[420px] w-full object-contain"
              />
            </div>
          ) : null}

          <div
            className="prose prose-slate max-w-none text-[15px] leading-8 text-slate-900 prose-mark:rounded prose-mark:bg-yellow-200 prose-mark:px-1 prose-strong:font-bold prose-em:italic"
            dangerouslySetInnerHTML={safeHtml(question.statement)}
          />

          <div className="mt-8 space-y-4">
            {studentAlternatives.map((alternative) => {
              const isCorrect = Boolean(alternative.is_correct);
              const isWrongTrueFalse = isTrueFalse && isCorrect && (alternative.label === "E" || String(alternative.text || "").trim().toLowerCase() === "errado");

              return (
              <article
                key={alternative.id || alternative.label}
                className={
                  isWrongTrueFalse
                    ? "rounded-3xl border border-red-200 bg-red-50 p-4 shadow-sm transition hover:border-red-300"
                    : isCorrect
                      ? "rounded-3xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm transition hover:border-emerald-300"
                      : "rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-orange-200 hover:shadow-md"
                }
              >
                {isTrueFalse ? (
                  <div className={`flex items-center gap-4 ${isWrongTrueFalse ? "text-red-900" : isCorrect ? "text-emerald-900" : "text-slate-900"}`}>
                    <span
                      className={
                        isWrongTrueFalse
                          ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-red-500 bg-red-500 text-sm leading-none text-white"
                          : isCorrect
                            ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-500 bg-emerald-500 text-sm leading-none text-white"
                            : "h-6 w-6 shrink-0 rounded-full border border-orange-500 bg-white"
                      }
                    >
                      {isCorrect ? OWL_MARK : null}
                    </span>

                    <div className="min-w-0">
                      <div
                        className="prose prose-slate max-w-none text-[15px] leading-7 text-slate-900 prose-mark:rounded prose-mark:bg-yellow-200 prose-mark:px-1 prose-strong:font-bold prose-em:italic"
                        dangerouslySetInnerHTML={safeHtml(alternative.text)}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-[48px_1fr] gap-4">
                    <div
                      className={
                        isCorrect
                          ? "flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-500 bg-emerald-500 text-sm font-black text-white"
                          : "flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-sm font-black text-slate-700"
                      }
                    >
                      {isCorrect ? OWL_MARK : alternative.label}
                    </div>

                    <div>
                      {alternative.image_url ? (
                        <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                          <img
                            src={alternative.image_url}
                            alt={`Imagem da alternativa ${alternative.label}`}
                            className="max-h-[260px] w-full object-contain"
                          />
                        </div>
                      ) : null}

                      <div
                        className="prose prose-slate max-w-none text-[15px] leading-7 text-slate-900 prose-mark:rounded prose-mark:bg-yellow-200 prose-mark:px-1 prose-strong:font-bold prose-em:italic"
                        dangerouslySetInnerHTML={safeHtml(alternative.text)}
                      />
                    </div>
                  </div>
                )}
              </article>
              );
            })}
          </div>

          <div className={`mt-8 rounded-3xl border p-5 ${isWrongTrueFalseAnswer ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
            <div className={`mb-2 flex items-center gap-2 text-sm font-black ${isWrongTrueFalseAnswer ? "text-red-900" : "text-emerald-900"}`}>
              <CheckCircle2 size={17} className={isWrongTrueFalseAnswer ? "text-red-600" : "text-emerald-600"} />
              Conferência interna
            </div>

            <p className={`text-sm ${isWrongTrueFalseAnswer ? "text-red-800" : "text-emerald-800"}`}>
              Alternativa correta:{" "}
              <span className="font-black">
                {isTrueFalse ? (correctAlternative?.text || "Não definida") : (correctAlternative?.label || "Não definida")}
              </span>
            </p>
          </div>

          <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-5">
            <PremiumDifficultyStars value={question.difficulty_level} />
          </div>

          {question.explanation_text ? (
            <div className="mt-6 rounded-3xl border border-orange-200 bg-orange-50 p-5">
              <p className="mb-2 text-sm font-black text-orange-900">
                🦉 Análise do Professor Pablo Leonardo
              </p>

              <div
                className="prose prose-slate max-w-none text-sm leading-7 text-orange-950 prose-mark:rounded prose-mark:bg-yellow-200 prose-mark:px-1"
                dangerouslySetInnerHTML={safeHtml(question.explanation_text)}
              />
              <StudentExplanationAuthorCard />
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>

      <p className="mt-1 text-sm font-black text-slate-900">{value}</p>
    </div>
  );
}
