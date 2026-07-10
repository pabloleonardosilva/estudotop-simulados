"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CopyCheck,
  Loader2,
  Search,
  Trash2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Columns2,
} from "lucide-react";
import PageBackground from "../../components/ui/PageBackground";
import PageHeader from "../../components/ui/PageHeader";
import PremiumButton from "../../components/ui/PremiumButton";
import PremiumCard from "../../components/ui/PremiumCard";
import PremiumLoadingOverlay from "../../components/ui/PremiumLoadingOverlay";
import PremiumModal from "../../components/ui/PremiumModal";
import { adminFetch } from "@/app/lib/supabase/adminFetch";

type Feedback = { type: "success" | "error" | "warning"; message: string } | null;

type DuplicateQuestion = {
  id: string;
  statement: string | null;
  created_at: string | null;
  action: "manter" | "excluir";
};

type DuplicateGroup = {
  key: string;
  board_id: string | null;
  board_name: string;
  statement: string | null;
  keep_question_id: string;
  duplicate_count: number;
  total_count: number;
  duplicate_ids: string[];
  questions: DuplicateQuestion[];
};

function stripHtml(value: string) {
  return (value || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function formatDate(value: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

function SideBySidePanel({ group }: { group: DuplicateGroup }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="rounded-[2rem] border border-amber-200 bg-amber-50/60 p-5">
      {/* Group header */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-bold text-amber-800">
          {group.board_name}
        </span>
        <span className="rounded-full border border-red-200 bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
          {group.duplicate_count} duplicada(s)
        </span>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
          1 será mantida
        </span>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50"
        >
          <Columns2 size={13} />
          {expanded ? "Ocultar comparação" : "Ver lado a lado"}
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {/* Side-by-side grid */}
      {expanded && (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${group.questions.length}, minmax(0, 1fr))` }}
        >
          {group.questions.map((question) => {
            const keep = question.action === "manter";
            return (
              <div
                key={question.id}
                className={`flex flex-col gap-2 rounded-2xl border p-4 ${
                  keep
                    ? "border-emerald-200 bg-white ring-2 ring-emerald-100"
                    : "border-red-200 bg-red-50/50"
                }`}
              >
                {/* Question badge */}
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                      keep
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {keep ? "✓ Manter" : "✕ Excluir"}
                  </span>
                  <span className="text-[10px] text-slate-400">{formatDate(question.created_at)}</span>
                </div>

                {/* Question id */}
                <p className="truncate font-mono text-[10px] text-slate-400" title={question.id}>
                  {question.id}
                </p>

                {/* Statement preview */}
                <div className="flex-1">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Enunciado</p>
                  <p className="mt-1.5 line-clamp-6 text-sm leading-6 text-slate-700">
                    {stripHtml(question.statement || "")}
                  </p>
                </div>

                {/* Full statement toggle */}
                <details className="text-xs text-slate-500">
                  <summary className="cursor-pointer select-none font-semibold hover:text-orange-600">
                    Ver enunciado completo
                  </summary>
                  <p className="mt-2 text-sm leading-6 text-slate-700 whitespace-pre-wrap">
                    {stripHtml(question.statement || "")}
                  </p>
                </details>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DuplicatasClient() {
  const [loading, setLoading] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [groupsCount, setGroupsCount] = useState(0);
  const [duplicateQuestionsCount, setDuplicateQuestionsCount] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [confirmModal, setConfirmModal] = useState(false);
  const [successModal, setSuccessModal] = useState<{ count: number } | null>(null);

  async function findDuplicates() {
    setFeedback(null);
    setLoading(true);

    try {
      const response = await adminFetch("/api/admin/questions/duplicates", {
        method: "GET",
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Erro ao localizar duplicatas.");
      }

      setDuplicates(result.duplicates || []);
      setGroupsCount(result.groupsCount || 0);
      setDuplicateQuestionsCount(result.duplicateQuestionsCount || 0);

      if ((result.duplicateQuestionsCount || 0) === 0) {
        setFeedback({
          type: "success",
          message: "Nenhuma questão duplicada encontrada.",
        });
      } else {
        setFeedback({
          type: "warning",
          message: `${result.duplicateQuestionsCount} questão(ões) duplicada(s) encontrada(s) em ${result.groupsCount} grupo(s).`,
        });
      }
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error ? error.message : "Erro ao localizar duplicatas.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function removeDuplicates() {
    setConfirmModal(false);
    setLoading(true);
    setFeedback(null);

    try {
      const response = await adminFetch("/api/admin/questions/duplicates", {
        method: "DELETE",
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Erro ao excluir duplicatas.");
      }

      setDuplicates([]);
      setGroupsCount(0);
      setDuplicateQuestionsCount(0);
      setSuccessModal({ count: result.deletedCount || 0 });
      setFeedback({
        type: "success",
        message: result.message || "Questões duplicadas excluídas.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error ? error.message : "Erro ao excluir duplicatas.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageBackground>
      <PremiumLoadingOverlay
        show={loading}
        title="Verificando duplicatas..."
        message="Analisando banca, enunciado e alternativas das questões."
      />

      <PremiumModal
        open={confirmModal}
        theme="light"
        tone="error"
        title="Deixar apenas questões exclusivas?"
        message={`O sistema manterá a primeira questão de cada grupo e excluirá as demais versões duplicadas. Esta ação afeta ${duplicateQuestionsCount} questão(ões).`}
        onClose={() => setConfirmModal(false)}
        actions={
          <>
            <PremiumButton variant="secondary" onClick={() => setConfirmModal(false)}>
              Cancelar
            </PremiumButton>
            <PremiumButton variant="danger" icon={<Trash2 size={16} />} onClick={removeDuplicates}>
              Deixar questões exclusivas
            </PremiumButton>
          </>
        }
      />

      <PremiumModal
        open={Boolean(successModal)}
        theme="light"
        tone="success"
        title="Questões exclusivas mantidas"
        message={successModal ? `${successModal.count} questão(ões) duplicada(s) foram excluída(s).` : undefined}
        onClose={() => setSuccessModal(null)}
      />

      <PageHeader
        title="Encontrar duplicatas"
        description="Localiza questões similares usando as mesmas regras de similaridade aplicadas na importação."
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
        title="Análise de duplicidade"
        description="Compara banca, enunciado e alternativas usando Jaccard similarity (mesmo critério da importação)."
        icon={<CopyCheck size={18} />}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <PremiumButton icon={loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} onClick={findDuplicates} disabled={loading}>
            Encontrar duplicatas
          </PremiumButton>

          {duplicateQuestionsCount > 0 && (
            <PremiumButton
              variant="danger"
              icon={<Trash2 size={16} />}
              onClick={() => setConfirmModal(true)}
            >
              Deixar questões exclusivas
            </PremiumButton>
          )}
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <StatCard label="Grupos duplicados" value={groupsCount} danger />
          <StatCard label="Questões a remover" value={duplicateQuestionsCount} danger />
          <StatCard label="Grupos exibidos" value={duplicates.length} />
        </div>
      </PremiumCard>

      {duplicates.length > 0 && (
        <div className="mt-6">
          <PremiumCard
            title="Duplicatas encontradas"
            description={`${duplicates.length} grupo(s) — comparação lado a lado por banca`}
            icon={<AlertTriangle size={18} />}
          >
            <div className="grid gap-5">
              {duplicates.map((group) => (
                <SideBySidePanel key={group.key} group={group} />
              ))}
            </div>
          </PremiumCard>
        </div>
      )}

      {duplicates.length === 0 && feedback && (
        <div className="mt-6">
          <PremiumCard
            title="Resultado"
            description="Nenhuma duplicata listada."
            icon={<AlertTriangle size={18} />}
          >
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
              {feedback.type === "success"
                ? "Nenhuma questão duplicada encontrada. O banco está limpo."
                : "Clique em «Encontrar duplicatas» para iniciar a análise."}
            </div>
          </PremiumCard>
        </div>
      )}
    </PageBackground>
  );
}

function StatCard({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div
      className={
        danger && value > 0
          ? "rounded-3xl border border-red-200 bg-red-50 p-5 text-red-700"
          : "rounded-3xl border border-slate-200 bg-slate-50 p-5 text-slate-700"
      }
    >
      <p className="text-xs font-bold uppercase tracking-[0.14em] opacity-70">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black">{value}</p>
    </div>
  );
}

function Notice({ feedback }: { feedback: NonNullable<Feedback> }) {
  const ok = feedback.type === "success";
  const warning = feedback.type === "warning";

  return (
    <div
      className={
        ok
          ? "mb-6 flex items-center gap-3 rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5 text-emerald-800"
          : warning
          ? "mb-6 flex items-center gap-3 rounded-[2rem] border border-amber-200 bg-amber-50 p-5 text-amber-800"
          : "mb-6 flex items-center gap-3 rounded-[2rem] border border-red-200 bg-red-50 p-5 text-red-800"
      }
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm">
        {ok ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
      </div>
      <p className="font-medium">{feedback.message}</p>
    </div>
  );
}
