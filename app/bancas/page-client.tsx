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
import PremiumButton from "../components/ui/PremiumButton";
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
      {confirmBoard && (
        <DeleteBoardModal
          board={confirmBoard}
          onClose={() => setConfirmBoard(null)}
          onConfirm={() => deleteBoard(confirmBoard)}
        />
      )}

      {feedback && <Notice feedback={feedback} onClose={() => setFeedback(null)} />}

      <section className="relative mb-8 min-h-[170px] overflow-hidden rounded-[2rem] border border-white/[0.08] bg-[linear-gradient(115deg,rgba(255,122,0,0.11)_0%,rgba(12,30,52,0.94)_48%,rgba(2,8,23,0.98)_100%)] px-6 py-8 shadow-[0_24px_80px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] sm:px-8 lg:px-10">
        <div className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full bg-blue-500/[0.10] blur-3xl" />
        <div className="pointer-events-none absolute -left-20 bottom-[-8rem] h-64 w-64 rounded-full bg-orange-500/[0.12] blur-3xl" />
        <div className="relative flex min-h-[106px] flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-orange-400">EstudoTOP Simulados</p>
            <h1 className="mt-3 text-[34px] font-bold leading-[1.05] tracking-[-0.04em] text-white sm:text-[40px]">Bancas organizadoras</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">Consulte e organize as bancas cadastradas no sistema.</p>
          </div>
          <Link href="/bancas/importar" className="shrink-0">
            <PremiumButton variant="dark" icon={<Plus size={17} strokeWidth={2.6} />} className="h-12 border-orange-300/30 bg-[linear-gradient(135deg,#f97316_0%,#f59e0b_100%)] font-extrabold text-white shadow-[0_14px_32px_rgba(249,115,22,0.25)] hover:-translate-y-0.5 hover:border-orange-200/50 hover:text-white hover:shadow-[0_18px_38px_rgba(249,115,22,0.34)]">Nova banca</PremiumButton>
          </Link>
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="relative isolate rounded-[1.75rem] border border-white/[0.08] bg-[#0C1E34]/70 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.30)] backdrop-blur-xl sm:p-7">
          <div className="pointer-events-none absolute -inset-0.5 -z-10 rounded-[1.9rem] bg-gradient-to-b from-orange-400/[0.08] via-white/[0.02] to-transparent blur-2xl" />
          <div className="mb-7 flex items-start gap-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-orange-400/25 bg-orange-500/[0.10] text-orange-300"><Search size={20} strokeWidth={2.3} /></div><div><h2 className="text-lg font-bold tracking-tight text-white">Filtrar bancas</h2><p className="mt-1.5 text-[13px] leading-5 text-slate-400">Busque uma banca pelo nome.</p></div></div>
          <PremiumInput
            variant="jornada"
            label="Buscar"
            icon={<Search size={16} />}
            value={search}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
            placeholder="Ex.: VUNESP, CEBRASPE, FCC..."
            className="border-white/[0.08] bg-[#020817]/55 focus:border-orange-400/55"
          />
          <div className="mt-6 rounded-2xl border border-white/[0.06] bg-[#020817]/30 p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-400">Resultado atual</p>
            <p className="mt-2 text-2xl font-bold text-white">{filteredBoards.length}</p>
            <p className="mt-1 text-xs font-semibold text-slate-400">{filteredBoards.length === 1 ? "banca encontrada" : "bancas encontradas"}</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-white/[0.08] bg-[#0C1E34]/65 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.32)] backdrop-blur-xl sm:p-7">
          <div className="mb-7 flex items-start gap-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-orange-400/25 bg-orange-500/[0.10] text-orange-300"><BadgeCheck size={20} strokeWidth={2.2} /></div><div><h2 className="text-lg font-bold tracking-tight text-white">Bancas cadastradas</h2><p className="mt-1.5 text-[13px] leading-5 text-slate-400">{filteredBoards.length} {filteredBoards.length === 1 ? "banca encontrada" : "bancas encontradas"}.</p></div></div>
          {filteredBoards.length === 0 ? (
            <div className="rounded-[1.25rem] border border-dashed border-slate-400/20 bg-white/[0.025] p-9 text-center">
              <BadgeCheck className="mx-auto text-slate-500" size={38} strokeWidth={1.5} />
              <p className="mt-4 text-base font-bold text-white">Nenhuma banca encontrada</p>
              <p className="mx-auto mt-2 max-w-md text-[13px] leading-5 text-slate-400">Ajuste a busca ou cadastre uma nova banca pelo importador.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredBoards.map((board) => {
                const questionCount = board.question_count || 0;
                const deleting = deletingId === board.id;

                return (
                  <div
                    key={board.id}
                    className="block rounded-[1.6rem] border border-white/[0.08] bg-white/[0.035] p-5 shadow-xl shadow-black/20 transition hover:-translate-y-0.5 hover:border-orange-400/25 hover:bg-white/[0.055] active:scale-[0.99]"
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-orange-400/20 bg-orange-500/[0.10] text-orange-300 shadow-sm">
                        <BadgeCheck size={20} />
                      </div>

                      <span
                        className={
                          board.is_active
                            ? "inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/[0.12] px-3 py-1 text-xs font-semibold text-emerald-200"
                            : "inline-flex items-center gap-1 rounded-full border border-red-400/20 bg-red-500/[0.08] px-3 py-1 text-xs font-semibold text-red-200"
                        }
                      >
                        {board.is_active ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                        {board.is_active ? "Ativa" : "Inativa"}
                      </span>
                    </div>

                    <h3 className="text-lg font-semibold text-white">{board.name}</h3>

                    <div className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-slate-400">
                      <FileQuestion size={14} />
                      {questionCount} questão(ões)
                    </div>

                    <div className="mt-5 grid gap-2">
                      <Link
                        href={`/questoes?banca=${board.id}`}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white/65 transition hover:border-orange-400/30 hover:bg-orange-500/[0.08] hover:text-orange-200"
                      >
                        <FileQuestion size={15} />
                        Ver questões
                      </Link>

                      <button
                        type="button"
                        onClick={() => setConfirmBoard(board)}
                        disabled={deleting || deletingId !== null}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-400/20 bg-red-500/[0.06] px-4 py-3 text-sm font-semibold text-red-200 transition hover:border-red-300/35 hover:bg-red-500/[0.12] disabled:cursor-not-allowed disabled:opacity-60"
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
        </section>
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
      theme="dark"
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
          <PremiumButton variant="dark" onClick={onClose}>
            Cancelar
          </PremiumButton>
          <PremiumButton variant="dark-danger" icon={<Trash2 size={18} />} onClick={onConfirm}>
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
      theme="dark"
      tone={ok ? "success" : "error"}
      title={ok ? "Tudo certo" : "Nao foi possivel continuar"}
      message={feedback.message}
      onClose={onClose}
    />
  );
}
