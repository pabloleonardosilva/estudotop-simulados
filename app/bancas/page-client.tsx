"use client";

import { type ChangeEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  CheckCircle2,
  FileQuestion,
  Loader2,
  Plus,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import PageBackground from "../components/ui/PageBackground";
import PageHeader from "../components/ui/PageHeader";
import PremiumButton from "../components/ui/PremiumButton";
import PremiumCard from "../components/ui/PremiumCard";
import PremiumInput from "../components/ui/PremiumInput";
import PremiumModal from "../components/ui/PremiumModal";
import { adminFetch } from "@/app/lib/supabase/adminFetch";

type Board = {
  id: string;
  name: string;
  is_active: boolean;
  created_at?: string;
  question_count?: number;
};

type Feedback = { type: "success" | "error"; message: string } | null;

export default function BancasClient({ boards }: { boards: Board[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmBoard, setConfirmBoard] = useState<Board | null>(null);

  const filteredBoards = useMemo(() => {
    const term = search.toLowerCase().trim();
    return boards.filter((board) => !term || board.name.toLowerCase().includes(term));
  }, [boards, search]);

  async function deleteBoard(board: Board) {
    setFeedback(null);
    setConfirmBoard(null);
    setDeletingId(board.id);

    try {
      const response = await adminFetch(`/api/admin/exam-boards?id=${board.id}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Erro ao excluir banca.");
      }

      setFeedback({
        type: "success",
        message: result.message || "Banca excluÃ­da com sucesso.",
      });
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao excluir banca.",
      });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <PageBackground variant="jornada">
      <PageHeader
        variant="jornada"
        title="Bancas organizadoras"
        description="Consulte e organize as bancas cadastradas no sistema."
        action={
          <Link href="/bancas/importar">
            <PremiumButton icon={<Plus size={18} />}>Nova banca</PremiumButton>
          </Link>
        }
      />

      {confirmBoard && (
        <DeleteBoardModal
          board={confirmBoard}
          onClose={() => setConfirmBoard(null)}
          onConfirm={() => deleteBoard(confirmBoard)}
        />
      )}

      {feedback && <Notice feedback={feedback} onClose={() => setFeedback(null)} />}

      <PremiumCard variant="jornada" title="Filtros" description="Busque uma banca pelo nome." icon={<Search size={18} />}>
        <PremiumInput
          variant="jornada"
          label="Buscar"
          value={search}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
          placeholder="Ex.: VUNESP, CEBRASPE, FCC..."
        />
      </PremiumCard>

      <div className="mt-6">
        <PremiumCard
          variant="jornada"
          title="Bancas cadastradas"
          description={`${filteredBoards.length} banca(s) encontrada(s).`}
          icon={<BadgeCheck size={18} />}
        >
          {filteredBoards.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
              Nenhuma banca encontrada.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredBoards.map((board) => {
                const questionCount = board.question_count || 0;
                const deleting = deletingId === board.id;

                return (
                  <div
                    key={board.id}
                    className="block rounded-[2rem] border border-slate-200 bg-gradient-to-b from-white to-slate-50/60 p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-100 hover:shadow-md active:scale-[0.99]"
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-100 to-orange-50 text-orange-600 shadow-sm">
                        <BadgeCheck size={20} />
                      </div>

                      <span
                        className={
                          board.is_active
                            ? "inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                            : "inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500"
                        }
                      >
                        {board.is_active ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                        {board.is_active ? "Ativa" : "Inativa"}
                      </span>
                    </div>

                    <h3 className="text-lg font-semibold text-slate-950">{board.name}</h3>

                    <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
                      <FileQuestion size={14} />
                      {questionCount} questão(ões)
                    </div>

                    <div className="mt-5 grid gap-2">
                      <Link
                        href={`/questoes?banca=${board.id}`}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                      >
                        <FileQuestion size={15} />
                        Ver questões
                      </Link>

                      <button
                        type="button"
                        onClick={() => setConfirmBoard(board)}
                        disabled={deleting || deletingId !== null}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                        {deleting ? "Excluindo..." : "Excluir banca"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </PremiumCard>
      </div>
    </PageBackground>
  );
}

function DeleteBoardModal({
  board,
  onClose,
  onConfirm,
}: {
  board: Board;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const questionCount = board.question_count || 0;

  return (
    <PremiumModal
      open
      tone="warning"
      title={`Excluir ${board.name}?`}
      message={
        questionCount > 0
          ? `${questionCount} questao(oes) serao movidas para "ANONIMA".`
          : "Esta banca sera removida do cadastro."
      }
      onClose={onClose}
      actions={
        <>
          <PremiumButton variant="secondary" onClick={onClose}>
            Cancelar
          </PremiumButton>
          <PremiumButton variant="danger" icon={<Trash2 size={18} />} onClick={onConfirm}>
            Excluir banca
          </PremiumButton>
        </>
      }
    />
  );
}

function Notice({ feedback, onClose }: { feedback: NonNullable<Feedback>; onClose: () => void }) {
  const ok = feedback.type === "success";

  return (
    <PremiumModal
      open
      tone={ok ? "success" : "error"}
      title={ok ? "Tudo certo" : "Nao foi possivel continuar"}
      message={feedback.message}
      onClose={onClose}
    />
  );
}
