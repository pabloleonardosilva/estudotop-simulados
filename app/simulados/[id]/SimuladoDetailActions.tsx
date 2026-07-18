"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CopyCheck, Download, Eye, Pencil, PlayCircle, Printer } from "lucide-react";
import PremiumButton from "../../components/ui/PremiumButton";
import PremiumModal from "../../components/ui/PremiumModal";
import QuestionActionModal, { type QuestionActionModalState } from "../../components/questions/QuestionActionModal";
import { downloadSimuladoAdminPdf } from "@/app/lib/pdf/simulado-admin-pdf";
import { adminFetch } from "@/app/lib/supabase/adminFetch";
import SimuladoCard from "../components/SimuladoCard";
import { resolveOwlHelpLimit, scoringLabel } from "../utils";

const OWL_MARK = "\u{1F989}\uFE0F";

type Feedback = { type: "success" | "error" | "warning"; title: string; message: string } | null;

type SimuladoPdfAlternative = {
  label?: string | null;
  text?: string | null;
  is_correct?: boolean | null;
  order_number?: number | null;
};

type SimuladoPdfRelation = {
  order_number?: number | null;
  questions?: {
    code?: string | null;
    statement?: string | null;
    difficulty_level?: number | null;
    year?: number | string | null;
    exam_boards?: { name?: string | null } | null;
    subjects?: { name?: string | null } | null;
    question_alternatives?: SimuladoPdfAlternative[] | null;
  } | null;
};

type SimuladoDetailActionsProps = {
  simulado: {
    id: string;
    title?: string | null;
    status?: string | null;
    time_limit_minutes?: number | null;
    max_attempts?: number | null;
    scoring_model?: "traditional" | "cebraspe" | string | null;
    question_count?: number | null;
    owl_help_enabled?: boolean | null;
    owl_help_limit?: number | null;
  };
  questions: SimuladoPdfRelation[];
};

export default function SimuladoDetailActions({ simulado, questions }: SimuladoDetailActionsProps) {
  const router = useRouter();
  const [duplicating, setDuplicating] = useState(false);
  const [actionModal, setActionModal] = useState<QuestionActionModalState>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  function requestDuplicateSimulado() {
    setActionModal({
      open: true,
      tone: "duplicate",
      title: "Duplicar simulado?",
      message: "Uma nova cópia será criada como rascunho, mantendo as configurações e as questões vinculadas ao simulado atual.",
      primaryLabel: "Duplicar agora",
      secondaryLabel: "Cancelar",
      onPrimary: duplicateSimulado,
      onSecondary: () => setActionModal(null),
      onClose: () => setActionModal(null),
    });
  }

  async function duplicateSimulado() {
    if (duplicating) return;

    setDuplicating(true);
    setActionModal({
      open: true,
      tone: "duplicate",
      title: "Duplicando simulado",
      message: "Aguarde enquanto criamos a cópia em rascunho.",
      loading: true,
      steps: [
        "Copiando configurações principais",
        "Vinculando questões na nova cópia",
        "Preparando edição do novo simulado",
      ],
      currentStep: 0,
      onClose: () => undefined,
    });

    try {
      const response = await adminFetch(`/api/admin/simulados/${simulado.id}/duplicate`, { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.message || "Erro ao duplicar simulado.");

      setActionModal({
        open: true,
        tone: "success",
        title: "Simulado duplicado",
        message: result.message || "Uma cópia em rascunho foi criada com sucesso.",
        primaryLabel: "Editar cópia",
        secondaryLabel: "Ficar nesta tela",
        onPrimary: () => {
          setActionModal(null);
          if (result.id) router.push(`/simulados/${result.id}/editar`);
          else router.refresh();
        },
        onSecondary: () => setActionModal(null),
        onClose: () => setActionModal(null),
      });
    } catch (error) {
      setActionModal({
        open: true,
        tone: "error",
        title: "Não foi possível duplicar",
        message: error instanceof Error ? error.message : "Erro inesperado ao duplicar simulado.",
        primaryLabel: "Entendi",
        onPrimary: () => setActionModal(null),
        onClose: () => setActionModal(null),
      });
    } finally {
      setDuplicating(false);
    }
  }

  function exportSimuladoPdf() {
    downloadSimuladoAdminPdf({
      meta: {
        title: simulado.title || "Simulado",
        status: simulado.status || "draft",
        timeLimitMinutes: simulado.time_limit_minutes,
        maxAttempts: simulado.max_attempts,
        scoringModel: scoringLabel(simulado.scoring_model as any),
        questionCount: simulado.question_count ?? questions.length,
        owlHelpEnabled: Boolean(simulado.owl_help_enabled),
        owlHelpLimit: resolveOwlHelpLimit(simulado.owl_help_limit, simulado.question_count ?? questions.length),
      },
      questions: questions.map((relation, index) => ({
        orderNumber: index + 1,
        code: relation.questions?.code || `Questão ${index + 1}`,
        statement: relation.questions?.statement || "",
        subject: relation.questions?.subjects?.name || "Sem assunto",
        board: relation.questions?.exam_boards?.name || "Sem banca",
        year: relation.questions?.year || null,
        difficulty: relation.questions?.difficulty_level || null,
        alternatives: (relation.questions?.question_alternatives || [])
          .slice()
          .sort((a, b) => (a.order_number || 0) - (b.order_number || 0))
          .map((alternative) => ({
            label: alternative.label || "",
            text: alternative.text || "",
            isCorrect: Boolean(alternative.is_correct),
          })),
      })),
    });

    setFeedback({
      type: "success",
      title: "PDF gerado",
      message: "O arquivo do simulado foi exportado usando a geração nativa de PDF.",
    });
  }

  return (
    <>
      <QuestionActionModal modal={actionModal} />
      <PremiumModal
        open={Boolean(feedback)}
        tone={feedback?.type === "success" ? "success" : feedback?.type === "warning" ? "warning" : "error"}
        title={feedback?.title || ""}
        message={feedback?.message}
        onClose={() => setFeedback(null)}
      />

      <SimuladoCard variant="dark" title="Ações" icon={<PlayCircle size={18} />}>
        <div className="grid gap-3">
          <Link href={`/simulados/${simulado.id}/editar`}>
            <PremiumButton full icon={<Pencil size={18} />}>Editar simulado</PremiumButton>
          </Link>
          <Link href={`/simulados/${simulado.id}/preview`} target="_blank" rel="noopener noreferrer">
            <PremiumButton full variant="secondary" icon={<Eye size={18} />}>Preview como aluno</PremiumButton>
          </Link>
          <Link href={`/simulados/${simulado.id}/print?popup=1`} target="_blank" rel="noopener noreferrer">
            <PremiumButton full variant="secondary" icon={<Printer size={18} />}>Printar</PremiumButton>
          </Link>
          <PremiumButton
            full
            variant="secondary"
            icon={<CopyCheck size={18} />}
            onClick={requestDuplicateSimulado}
            disabled={duplicating}
            className="!border-cyan-400/25 !bg-cyan-500/10 !text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.08)] hover:!bg-cyan-500/15 hover:!shadow-[0_0_24px_rgba(34,211,238,0.14)]"
          >
            {duplicating ? "Duplicando..." : "Duplicar simulado"}
          </PremiumButton>
          <PremiumButton
            full
            variant="secondary"
            icon={<Download size={18} />}
            onClick={exportSimuladoPdf}
            className="!border-sky-400/25 !bg-sky-500/10 !text-sky-100 shadow-[0_0_18px_rgba(56,189,248,0.08)] hover:!bg-sky-500/15 hover:!shadow-[0_0_24px_rgba(56,189,248,0.14)]"
          >
            Exportar PDF
          </PremiumButton>
        </div>
      </SimuladoCard>
    </>
  );
}
