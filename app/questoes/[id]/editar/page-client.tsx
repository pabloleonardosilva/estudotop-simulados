"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import PageBackground from "../../../components/ui/PageBackground";
import PageHeader from "../../../components/ui/PageHeader";
import PremiumButton from "../../../components/ui/PremiumButton";
import QuestionEditor from "../../../components/questions/QuestionEditor";
import type { Discipline, Subject, Board } from "../../../components/questions/QuestionEditor";

type NavigationData = {
  previousQuestionId: string | null;
  nextQuestionId: string | null;
  currentIndex: number | null;
  totalSameStatus: number;
  queueStatus: string;
  queueDisciplineId: string;
  queueDisciplineName: string;
  currentQuestionStatus: string;
  currentQuestionDisciplineId: string;
};

function getStatusLabel(status: string) {
  if (status === "pending_review") return "Pendente revisão";
  if (status === "published") return "Publicada";
  if (status === "ready_to_publish") return "Fila de publicação";
  if (status === "active") return "Ativa";
  if (status === "archived") return "Arquivada";
  return "Rascunho";
}

function withQueueHref(id: string, queueStatus: string, queueDisciplineId: string) {
  const params = new URLSearchParams();
  params.set("fila", queueStatus);
  params.set("disciplina", queueDisciplineId);
  return `/questoes/${id}/editar?${params.toString()}`;
}

export default function EditarQuestaoClient({
  question,
  disciplines,
  subjects,
  boards,
  navigation,
  backUrl,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  question: any;
  disciplines: Discipline[];
  subjects: Subject[];
  boards: Board[];
  navigation: NavigationData;
  backUrl?: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isPopup = searchParams.get("popup") === "1";
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  function goToNext() {
    if (navigation.nextQuestionId) {
      router.push(withQueueHref(navigation.nextQuestionId, "pending_review", navigation.queueDisciplineId));
    } else {
      router.push(backUrl || "/questoes");
    }
  }

  if (isPopup) {
    function notifyParentQuestionUpdated() {
      if (typeof window !== "undefined" && window.parent !== window) {
        window.parent.postMessage(
          { source: "estudotop-question-popup", type: "question-saved", questionId: question.id },
          window.location.origin,
        );
      }
    }

    return (
      <div className="min-h-screen bg-[#07111F] px-4 py-6 md:px-6">
        {notice && (
          <div className={`mb-4 rounded-2xl border px-5 py-3 text-sm font-semibold ${notice.type === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"}`}>
            {notice.message}
            <button type="button" onClick={() => setNotice(null)} className="ml-3 opacity-60 hover:opacity-100">✕</button>
          </div>
        )}

        <QuestionEditor
          initialQuestion={question}
          disciplines={disciplines}
          subjects={subjects}
          boards={boards}
          storageKey={`estudotop:draft:questoes:editar:${question.id}`}
          onSaved={(msg) => { setNotice({ type: "success", message: msg }); notifyParentQuestionUpdated(); }}
          onPublished={() => { setNotice({ type: "success", message: "Questão publicada." }); notifyParentQuestionUpdated(); }}
          hidePublishButton
          saveMode="preserve"
          onArchived={() => { setNotice({ type: "success", message: "Questão arquivada." }); notifyParentQuestionUpdated(); }}
          onError={(msg) => setNotice({ type: "error", message: msg })}
        />
      </div>
    );
  }

  return (
    <PageBackground>
      <PageHeader
        title="Editar questão"
        description={`Fila: ${getStatusLabel(navigation.queueStatus)} — Disciplina: ${navigation.queueDisciplineName}.`}
        action={
          <Link href={backUrl || "/questoes"}>
            <PremiumButton variant="secondary" icon={<ArrowLeft size={18} />}>Voltar</PremiumButton>
          </Link>
        }
      />

      {/* Navigation / queue info */}
      <div className="mb-6 flex flex-col gap-3 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white">
              {question.code || `ET${String(question.id || "").slice(0, 4).toUpperCase()}`}
            </span>
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600">Revisão de questões</p>
          <p className="mt-1 text-sm text-slate-600">
            {navigation.currentIndex || 1} de {navigation.totalSameStatus || 1} questão(ões) na fila{" "}
            <strong>{getStatusLabel(navigation.queueStatus)}</strong> da disciplina{" "}
            <strong>{navigation.queueDisciplineName}</strong>.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          {navigation.previousQuestionId ? (
            <Link href={withQueueHref(navigation.previousQuestionId, navigation.queueStatus, navigation.queueDisciplineId)}>
              <PremiumButton variant="secondary" icon={<ChevronLeft size={18} />}>Anterior</PremiumButton>
            </Link>
          ) : (
            <PremiumButton variant="secondary" disabled icon={<ChevronLeft size={18} />}>Anterior</PremiumButton>
          )}
          {navigation.nextQuestionId ? (
            <Link href={withQueueHref(navigation.nextQuestionId, navigation.queueStatus === "pending_review" || navigation.currentQuestionStatus === "pending_review" ? "pending_review" : navigation.queueStatus, navigation.queueDisciplineId)}>
              <PremiumButton variant="secondary" icon={<ChevronRight size={18} />}>Próxima</PremiumButton>
            </Link>
          ) : (
            <PremiumButton variant="secondary" disabled icon={<ChevronRight size={18} />}>Próxima</PremiumButton>
          )}
        </div>
      </div>

      {notice && (
        <div className={`mb-4 rounded-2xl border px-5 py-3 text-sm font-semibold ${notice.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
          {notice.message}
          <button type="button" onClick={() => setNotice(null)} className="ml-3 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      <QuestionEditor
        initialQuestion={question}
        disciplines={disciplines}
        subjects={subjects}
        boards={boards}
        storageKey={`estudotop:draft:questoes:editar:${question.id}`}
        onSaved={(msg) => setNotice({ type: "success", message: msg })}
        onPublished={() => goToNext()}
        onArchived={() => goToNext()}
        onError={(msg) => setNotice({ type: "error", message: msg })}
      />
    </PageBackground>
  );
}
