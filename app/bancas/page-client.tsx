"use client";

import { type ChangeEvent, useMemo, useState } from "react";
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

      <section className="et-admin-dark-hero mb-8 min-h-[170px] px-6 py-8 sm:px-8 lg:px-10">
        <div className="relative flex min-h-[106px] flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <p className="et-admin-dark-label text-orange-400">EstudoTOP Simulados</p>
            <h1 className="et-admin-dark-page-title mt-3">Bancas organizadoras</h1>
            <p className="et-admin-dark-text mt-4 max-w-2xl">Consulte e organize as bancas cadastradas no sistema.</p>
          </div>
          <PremiumButton href="/bancas/importar" variant="dark-primary" icon={<Plus size={17} strokeWidth={2.6} />} className="shrink-0">Nova banca</PremiumButton>
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(280px,30%)_minmax(0,70%)]">
        <section className="et-admin-dark-panel p-5 sm:p-7">
          <div className="mb-7 flex items-start gap-4"><div className="et-admin-dark-icon-box et-admin-dark-icon-box-orange"><Search size={20} strokeWidth={2.3} /></div><div><h2 className="et-admin-dark-section-title">Filtrar bancas</h2><p className="et-admin-dark-muted mt-1.5">Busque uma banca pelo nome.</p></div></div>
          <PremiumInput
            variant="jornada"
            label="Buscar"
            icon={<Search size={16} />}
            value={search}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
            placeholder="Ex.: VUNESP, CEBRASPE, FCC..."
          />
          <div className="et-admin-dark-stat-card mt-6 p-4">
            <p className="et-admin-dark-label">Resultado atual</p>
            <p className="et-admin-dark-page-title mt-2">{filteredBoards.length}</p>
            <p className="et-admin-dark-muted mt-1">{filteredBoards.length === 1 ? "banca encontrada" : "bancas encontradas"}</p>
          </div>
        </section>

        <section className="et-admin-dark-panel min-w-0 p-5 sm:p-7">
          <div className="mb-7 flex items-start gap-4"><div className="et-admin-dark-icon-box et-admin-dark-icon-box-orange"><BadgeCheck size={20} strokeWidth={2.2} /></div><div><h2 className="et-admin-dark-section-title">Bancas cadastradas</h2><p className="et-admin-dark-muted mt-1.5">{filteredBoards.length} {filteredBoards.length === 1 ? "banca encontrada" : "bancas encontradas"}.</p></div></div>
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
                    className="et-admin-dark-list-card flex min-h-[260px] flex-col p-5 transition hover:-translate-y-0.5 hover:border-white/[0.12]"
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="et-admin-dark-icon-box et-admin-dark-icon-box-orange">
                        <BadgeCheck size={20} />
                      </div>

                      <span
                        className={`et-admin-dark-badge ${board.is_active ? "et-admin-dark-badge-success" : "et-admin-dark-badge-neutral"}`}
                      >
                        {board.is_active ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                        {board.is_active ? "Ativa" : "Inativa"}
                      </span>
                    </div>

                    <h3 className="et-admin-dark-section-title truncate" title={board.name}>{board.name}</h3>

                    <div className="et-admin-dark-muted mt-4 inline-flex items-center gap-2">
                      <FileQuestion size={14} />
                      {questionCount} questão(ões)
                    </div>

                    <div className="mt-auto grid gap-2 pt-5">
                      <PremiumButton
                        href={`/questoes?banca=${board.id}`}
                        variant="dark"
                        icon={<FileQuestion size={15} />}
                        full
                      >
                        Ver questões
                      </PremiumButton>

                      <PremiumButton
                        variant="dark-danger"
                        onClick={() => setConfirmBoard(board)}
                        disabled={deleting || deletingId !== null}
                        icon={deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                        full
                      >
                        {deleting ? "Excluindo..." : "Excluir banca"}
                      </PremiumButton>
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
