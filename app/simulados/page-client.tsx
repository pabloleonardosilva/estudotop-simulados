"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  Archive,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  CopyCheck,
  Eye,
  FileQuestion,
  Gauge,
  MapPin,
  Pencil,
  Search,
  SlidersHorizontal,
  PlusCircle,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import PremiumButton from "../components/ui/PremiumButton";
import PremiumModal from "../components/ui/PremiumModal";
import type { Discipline, Simulado } from "./types";
import { adminFetch } from "@/app/lib/supabase/adminFetch";
import {
  formatDateTime,
  timeLimitLabel,
} from "./utils";

type Feedback = { type: "success" | "error"; title: string; message: string } | null;
type JornadaOption = { id: string; title: string; status: string };
type SortMode = "recent" | "oldest" | "title";

const SIMULADO_THUMBNAIL = "/images/mini_simulados/simulado-coruja-estudando.png";
const SIMULADO_THUMBNAIL_FALLBACK = "/images/mini_simulados/simulado-mini1.png";

function statusLabel(status?: string | null) {
  if (status === "published") return "Publicado";
  if (status === "archived") return "Arquivado";
  return "Rascunho";
}

function statusBadgeClass(status?: string | null) {
  if (status === "published") {
    return "border-emerald-300/35 bg-[linear-gradient(135deg,rgba(16,185,129,0.18),rgba(20,184,166,0.08))] text-emerald-200 shadow-[0_0_22px_rgba(16,185,129,0.18)]";
  }

  if (status === "archived") {
    return "border-slate-400/25 bg-slate-500/10 text-slate-300";
  }

  return "border-orange-400/35 bg-orange-500/10 text-orange-300 shadow-[0_0_22px_rgba(255,138,0,0.10)]";
}

function statusBarClass(status?: string | null) {
  if (status === "published") return "bg-[linear-gradient(to_bottom,#6EE7B7,#10B981,#047857)] shadow-[0_0_26px_rgba(16,185,129,0.50)]";
  if (status === "archived") return "bg-slate-500";
  return "bg-orange-400 shadow-[0_0_20px_rgba(255,138,0,0.35)]";
}

function statusDotClass(status?: string | null) {
  if (status === "published") return "bg-[linear-gradient(135deg,#A7F3D0,#10B981,#047857)] shadow-[0_0_10px_rgba(16,185,129,0.55)]";
  if (status === "archived") return "bg-slate-400";
  return "bg-orange-400";
}

function actionButtonClass(tone: "default" | "danger" = "default") {
  if (tone === "danger") {
    return "inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-red-500/25 bg-red-500/5 px-4 text-xs font-bold text-red-400 transition hover:border-red-400/45 hover:bg-red-500/10";
  }

  return "inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 text-xs font-bold text-slate-200 transition hover:border-orange-400/35 hover:bg-orange-500/10 hover:text-white";
}

function formatAverageScore(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const rounded = Math.round(Number(value) * 10) / 10;
  return `${rounded.toLocaleString("pt-BR")} pts`;
}

function formatAveragePercentage(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return undefined;
  const rounded = Math.round(Number(value) * 10) / 10;
  return `(${rounded.toLocaleString("pt-BR")}%)`;
}

function formatJornadas(titles?: string[] | null) {
  if (!titles || titles.length === 0) return "—";
  return titles.join(", ");
}


type InitialFilters = {
  search?: string;
  status?: string;
  disciplineId?: string;
  jornadaFilterId?: string;
  sortMode?: string;
};

const SORT_MODES: SortMode[] = ["recent", "oldest", "title"];

export default function SimuladosClient({
  simulados,
  disciplines,
  jornadas: jornadaOptions,
  initialFilters,
}: {
  simulados: Simulado[];
  disciplines: Discipline[];
  jornadas: JornadaOption[];
  initialFilters?: InitialFilters;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(initialFilters?.search || "");
  const [status, setStatus] = useState(initialFilters?.status || "");
  const [disciplineId, setDisciplineId] = useState(initialFilters?.disciplineId || "");
  const [jornadaFilterId, setJornadaFilterId] = useState(initialFilters?.jornadaFilterId || "");
  const [sortMode, setSortMode] = useState<SortMode>(
    SORT_MODES.includes(initialFilters?.sortMode as SortMode) ? (initialFilters?.sortMode as SortMode) : "recent",
  );
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Simulado | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [duplicateSourceId, setDuplicateSourceId] = useState("");
  const [duplicateTitle, setDuplicateTitle] = useState("");
  const [duplicatingSimulado, setDuplicatingSimulado] = useState(false);
  const [titleOverrides, setTitleOverrides] = useState<Record<string, string>>({});

  const duplicateSource = useMemo(
    () => simulados.find((simulado) => simulado.id === duplicateSourceId) || null,
    [simulados, duplicateSourceId],
  );

  function openDuplicateModal() {
    const firstSimulado = simulados[0];
    setDuplicateSourceId(firstSimulado?.id || "");
    setDuplicateTitle(firstSimulado ? `${firstSimulado.title || "Simulado"} — Cópia` : "");
    setDuplicateModalOpen(true);
  }

  function handleDuplicateSourceChange(id: string) {
    setDuplicateSourceId(id);
    const source = simulados.find((simulado) => simulado.id === id);
    setDuplicateTitle(source ? `${source.title || "Simulado"} — Cópia` : "");
  }

  async function duplicateSimulado() {
    if (!duplicateSourceId) {
      setFeedback({ type: "error", title: "Selecione um simulado", message: "Escolha qual simulado deseja duplicar." });
      return;
    }

    const cleanTitle = duplicateTitle.trim();
    if (!cleanTitle) {
      setFeedback({ type: "error", title: "Informe um nome", message: "A cópia precisa ter um nome." });
      return;
    }

    setDuplicatingSimulado(true);
    try {
      const response = await adminFetch(`/api/admin/simulados/${duplicateSourceId}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: cleanTitle }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Erro ao duplicar simulado.");

      setDuplicateModalOpen(false);
      setDuplicateSourceId("");
      setDuplicateTitle("");
      setFeedback({
        type: "success",
        title: "Simulado duplicado",
        message: result.message || "A cópia foi criada como rascunho.",
      });
      router.push(`/simulados/${result.id}/editar`);
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        title: "Não foi possível duplicar",
        message: error instanceof Error ? error.message : "Erro inesperado ao duplicar simulado.",
      });
    } finally {
      setDuplicatingSimulado(false);
    }
  }

  async function updateSimuladoTitle(simulado: Simulado, nextTitle: string) {
    const cleanTitle = nextTitle.trim();
    if (!cleanTitle) {
      throw new Error("Informe o nome do simulado.");
    }

    const currentTitle = titleOverrides[simulado.id] || simulado.title || "";
    if (cleanTitle === currentTitle.trim()) return;

    const response = await adminFetch(`/api/admin/simulados/${simulado.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...simulado,
        title: cleanTitle,
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.message || "Erro ao atualizar nome do simulado.");
    }

    setTitleOverrides((current) => ({ ...current, [simulado.id]: cleanTitle }));
    router.refresh();
  }

  const filterQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (status) params.set("status", status);
    if (disciplineId) params.set("disciplina", disciplineId);
    if (jornadaFilterId) params.set("jornada", jornadaFilterId);
    if (sortMode !== "recent") params.set("ordenar", sortMode);
    return params.toString();
  }, [search, status, disciplineId, jornadaFilterId, sortMode]);

  useEffect(() => {
    window.history.replaceState(null, "", filterQueryString ? `?${filterQueryString}` : window.location.pathname);
  }, [filterQueryString]);

  const retornoHref = filterQueryString ? `/simulados?${filterQueryString}` : "/simulados";

  const [jornadaModalSimulado, setJornadaModalSimulado] = useState<Simulado | null>(null);
  const [jornadas, setJornadas] = useState<JornadaOption[]>([]);
  const [loadingJornadas, setLoadingJornadas] = useState(false);
  const [addingToJornada, setAddingToJornada] = useState(false);
  const [updatingJourneyId, setUpdatingJourneyId] = useState<string | null>(null);

  async function openJornadaModal(simulado: Simulado) {
    setJornadaModalSimulado(simulado);
    setLoadingJornadas(true);
    try {
      const res = await adminFetch("/api/admin/jornadas");
      const result = await res.json();
      if (result.ok) {
        setJornadas(
          (result.jornadas || []).filter((j: JornadaOption) =>
            j.status === "published" || j.status === "draft",
          ),
        );
      }
    } catch {
      setJornadas([]);
    } finally {
      setLoadingJornadas(false);
    }
  }

  async function addToJornada(jornadaId: string) {
    if (!jornadaModalSimulado || !jornadaId) return;
    setAddingToJornada(true);
    setUpdatingJourneyId(jornadaId);
    try {
      const res = await adminFetch(`/api/admin/jornadas/${jornadaId}/simulados`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simulado_id: jornadaModalSimulado.id }),
      });
      const result = await res.json();
      if (!result.ok) throw new Error(result.message);
      const jornadaName = jornadas.find((j) => j.id === jornadaId)?.title || "Jornada";
      setFeedback({ type: "success", title: "Vínculo atualizado", message: `Simulado incluído na Jornada "${jornadaName}".` });
      setJornadaModalSimulado((current) => current ? {
        ...current,
        jornadas: [...(current.jornadas || []), { id: jornadaId, title: jornadaName, status: jornadas.find((j) => j.id === jornadaId)?.status || "draft", order_number: result.jornada_simulado?.order_number || 0, link_id: result.jornada_simulado?.id || "" }],
      } : current);
      router.refresh();
    } catch (err) {
      setFeedback({
        type: "error",
        title: "Erro ao incluir",
        message: err instanceof Error ? err.message : "Erro inesperado.",
      });
    } finally {
      setAddingToJornada(false);
      setUpdatingJourneyId(null);
    }
  }

  async function removeFromJornada(jornadaId: string, jornadaSimuladoId: string) {
    if (!jornadaModalSimulado || !jornadaSimuladoId) return;
    setUpdatingJourneyId(jornadaId);
    try {
      const res = await adminFetch(`/api/admin/jornadas/${jornadaId}/simulados`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jornada_simulado_id: jornadaSimuladoId }),
      });
      const result = await res.json();
      if (!result.ok) throw new Error(result.message);
      const jornadaName = jornadas.find((j) => j.id === jornadaId)?.title || "Jornada";
      setFeedback({ type: "success", title: "Vínculo removido", message: `Simulado removido da Jornada "${jornadaName}".` });
      setJornadaModalSimulado((current) => current ? {
        ...current,
        jornadas: (current.jornadas || []).filter((item) => item.id !== jornadaId),
      } : current);
      router.refresh();
    } catch (err) {
      setFeedback({
        type: "error",
        title: "Não foi possível remover",
        message: err instanceof Error ? err.message : "Erro inesperado.",
      });
    } finally {
      setUpdatingJourneyId(null);
    }
  }

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: simulados.length };
    simulados.forEach((item) => {
      const s = item.status || "draft";
      counts[s] = (counts[s] || 0) + 1;
    });
    return counts;
  }, [simulados]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();

    const result = simulados.filter((simulado) => {
      const displayTitle = titleOverrides[simulado.id] || simulado.title || "";
      const matchesSearch =
        !term ||
        displayTitle.toLowerCase().includes(term) ||
        simulado.description?.toLowerCase().includes(term);
      return (
        matchesSearch &&
        (!status || simulado.status === status) &&
        (!disciplineId || simulado.discipline_id === disciplineId) &&
        (!jornadaFilterId || simulado.jornadas?.some((j) => j.id === jornadaFilterId))
      );
    });

    return [...result].sort((a, b) => {
      if (sortMode === "oldest") {
        return new Date(a.updated_at || a.created_at).getTime() - new Date(b.updated_at || b.created_at).getTime();
      }

      if (sortMode === "title") {
        return String(titleOverrides[a.id] || a.title || "").localeCompare(String(titleOverrides[b.id] || b.title || ""), "pt-BR");
      }

      return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime();
    });
  }, [simulados, search, status, disciplineId, jornadaFilterId, sortMode, titleOverrides]);

  const hasActiveFilters = Boolean(search || status || disciplineId || jornadaFilterId);

  function clearFilters() {
    setSearch("");
    setStatus("");
    setDisciplineId("");
    setJornadaFilterId("");
  }

  async function toggleArchiveSimulado(id: string) {
    const simulado = simulados.find((item) => item.id === id);
    if (!simulado) return;

    const nextStatus = simulado.status === "archived" ? "draft" : "archived";

    setArchivingId(id);
    try {
      const response = await adminFetch(`/api/admin/simulados/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...simulado, status: nextStatus }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Erro ao atualizar simulado.");

      setFeedback({
        type: "success",
        title: nextStatus === "archived" ? "Simulado arquivado" : "Simulado desarquivado",
        message:
          nextStatus === "archived"
            ? "O simulado foi arquivado mantendo seu histórico."
            : "O simulado voltou para rascunho e pode ser editado normalmente.",
      });
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        title: "Não foi possível atualizar",
        message: error instanceof Error ? error.message : "Erro ao atualizar simulado.",
      });
    } finally {
      setArchivingId(null);
    }
  }

  async function deleteSimulado() {
    if (!confirmDelete) return;
    const id = confirmDelete.id;
    setDeletingId(id);
    try {
      const response = await adminFetch(`/api/admin/simulados/${id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Erro ao excluir simulado.");

      setConfirmDelete(null);
      setFeedback({
        type: "success",
        title: "Simulado excluído",
        message: result.message || "O simulado foi excluído com sucesso.",
      });
      router.refresh();
    } catch (error) {
      setConfirmDelete(null);
      setFeedback({
        type: "error",
        title: "Não foi possível excluir",
        message: error instanceof Error ? error.message : "Erro ao excluir simulado.",
      });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#03070D] px-5 py-4 text-white sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(249,115,22,0.10),transparent_28%),radial-gradient(circle_at_82%_5%,rgba(37,99,235,0.16),transparent_34%),linear-gradient(180deg,#03070D_0%,#050B14_48%,#03070D_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.18)_1px,transparent_1px)] [background-size:72px_72px]" />

      <PremiumModal
        open={Boolean(feedback)}
        tone={feedback?.type === "success" ? "success" : "error"}
        title={feedback?.title || ""}
        message={feedback?.message}
        onClose={() => setFeedback(null)}
      />

      <PremiumModal
        open={Boolean(confirmDelete)}
        tone="warning"
        title="Excluir simulado"
        message={`Tem certeza que deseja excluir "${confirmDelete?.title}"? Esta ação não pode ser desfeita e removerá também as questões vinculadas, tentativas e resultados de alunos associados a este simulado.`}
        onClose={() => { if (!deletingId) setConfirmDelete(null); }}
        actions={
          <div className="flex gap-3">
            <PremiumButton variant="secondary" onClick={() => setConfirmDelete(null)} disabled={Boolean(deletingId)}>
              Cancelar
            </PremiumButton>
            <PremiumButton variant="danger" icon={<Trash2 size={16} />} onClick={deleteSimulado} disabled={Boolean(deletingId)}>
              {deletingId ? "Excluindo…" : "Excluir"}
            </PremiumButton>
          </div>
        }
      />

      {duplicateModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/75 px-4 backdrop-blur-md">
          <div className="relative w-full max-w-xl overflow-hidden rounded-[2rem] border border-orange-400/25 bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950 p-7 text-white shadow-2xl shadow-orange-950/40">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(249,115,22,0.16),transparent_36%),radial-gradient(circle_at_90%_18%,rgba(37,99,235,0.12),transparent_38%)]" />
            <div className="relative">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-orange-400/30 bg-orange-500/10 text-orange-300 shadow-[0_0_28px_rgba(249,115,22,0.20)]">
                    <CopyCheck size={22} />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-300">Duplicar existente</p>
                    <h2 className="mt-1 text-xl font-semibold text-white">Duplicar simulado</h2>
                    <p className="mt-1 text-sm leading-relaxed text-slate-300">
                      Escolha um simulado base. A cópia será criada como rascunho, com as mesmas configurações e questões vinculadas.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { if (!duplicatingSimulado) setDuplicateModalOpen(false); }}
                  className="rounded-xl p-2 text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-50"
                  disabled={duplicatingSimulado}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-5">
                <label className="block">
                  <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-white/40">Simulado base</span>
                  <select
                    value={duplicateSourceId}
                    onChange={(event) => handleDuplicateSourceChange(event.target.value)}
                    disabled={duplicatingSimulado || simulados.length === 0}
                    className="h-12 w-full rounded-2xl border border-white/[0.10] bg-[#0D1926] px-4 text-sm font-semibold text-white/85 outline-none transition hover:border-orange-400/35 focus:border-orange-400/50 focus:ring-4 focus:ring-orange-500/10 disabled:opacity-60"
                  >
                    {simulados.length === 0 ? (
                      <option value="">Nenhum simulado disponível</option>
                    ) : (
                      simulados.map((simulado) => (
                        <option key={simulado.id} value={simulado.id}>
                          {simulado.title} · {statusLabel(simulado.status)}
                        </option>
                      ))
                    )}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-white/40">Nome da cópia</span>
                  <input
                    type="text"
                    value={duplicateTitle}
                    onChange={(event) => setDuplicateTitle(event.target.value)}
                    disabled={duplicatingSimulado || !duplicateSource}
                    placeholder="Ex.: PCMG 01 - Hardware — Cópia"
                    className="h-12 w-full rounded-2xl border border-white/[0.10] bg-[#0D1926] px-4 text-sm font-semibold text-white/85 outline-none transition placeholder:text-white/25 hover:border-orange-400/35 focus:border-orange-400/50 focus:ring-4 focus:ring-orange-500/10 disabled:opacity-60"
                  />
                </label>

                {duplicateSource && (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 text-sm text-slate-300">
                    <p className="font-semibold text-white">O que será copiado</p>
                    <p className="mt-1 leading-relaxed">
                      Configurações do simulado, tempo, tentativas, feedback, pontuação, ajuda da coruja e banco de questões vinculado.
                    </p>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Não copia tentativas, respostas, resultados de alunos nem vínculos com Jornadas.
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <PremiumButton variant="secondary" onClick={() => setDuplicateModalOpen(false)} disabled={duplicatingSimulado}>
                  Cancelar
                </PremiumButton>
                <PremiumButton
                  icon={<CopyCheck size={16} />}
                  onClick={duplicateSimulado}
                  disabled={duplicatingSimulado || !duplicateSourceId || !duplicateTitle.trim()}
                >
                  {duplicatingSimulado ? "Duplicando…" : "Duplicar agora"}
                </PremiumButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {jornadaModalSimulado && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/75 px-4 backdrop-blur-md">
          <div className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-orange-400/25 bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950 p-7 text-white shadow-2xl shadow-orange-950/40">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">Jornada</p>
                <h2 className="mt-1 text-xl font-semibold text-white">Gerenciar Jornadas</h2>
                <p className="mt-1 line-clamp-1 text-sm text-slate-300">Inclua ou remova <strong className="text-white">{jornadaModalSimulado.title}</strong> das Jornadas.</p>
              </div>
              <button
                type="button"
                onClick={() => setJornadaModalSimulado(null)}
                className="rounded-xl p-2 text-slate-300 hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {loadingJornadas ? (
              <p className="py-6 text-center text-sm text-slate-300">Carregando jornadas…</p>
            ) : jornadas.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-300">Nenhuma jornada disponível. Crie uma jornada primeiro.</p>
            ) : (
              <div className="max-h-56 space-y-2 overflow-y-auto">
                {jornadas.map((j) => {
                  const linked = jornadaModalSimulado.jornadas?.find((item) => item.id === j.id);
                  const busy = updatingJourneyId === j.id;
                  return (
                    <div
                      key={j.id}
                      className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition ${
                        linked
                          ? "border-emerald-300/30 bg-emerald-400/[0.08] shadow-[0_0_22px_rgba(16,185,129,0.08)]"
                          : "border-white/10 bg-white/[0.05] hover:border-orange-300/35 hover:bg-white/[0.08]"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-semibold text-white">{j.title}</span>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${j.status === "published" ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-300" : "border-orange-400/35 bg-orange-500/10 text-orange-300"}`}>
                            {j.status === "published" ? "Publicada" : "Rascunho"}
                          </span>
                        </div>
                        <p className={`mt-1 text-xs ${linked ? "text-emerald-300/80" : "text-slate-400"}`}>
                          {linked ? `Vinculado na posição ${linked.order_number}` : "Ainda não vinculado"}
                        </p>
                      </div>
                      {linked ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => removeFromJornada(j.id, linked.link_id)}
                          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300 transition hover:border-red-300/45 hover:bg-red-500/15 disabled:opacity-50"
                        >
                          <Trash2 size={14} /> {busy ? "Removendo…" : "Remover"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy || addingToJornada}
                          onClick={() => addToJornada(j.id)}
                          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-orange-300/30 bg-orange-500/10 px-3 py-2 text-xs font-bold text-orange-200 transition hover:border-orange-300/55 hover:bg-orange-500/16 disabled:opacity-50"
                        >
                          <PlusCircle size={14} /> {busy ? "Incluindo…" : "Incluir"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-6">
              <PremiumButton variant="secondary" full onClick={() => setJornadaModalSimulado(null)}>
                Concluir
              </PremiumButton>
            </div>
          </div>
        </div>
      )}

      <section className="relative mx-auto max-w-[1600px]">
        <SimuladosHero onDuplicateClick={openDuplicateModal} />

        <FilterPanel
          search={search}
          setSearch={setSearch}
          status={status}
          setStatus={setStatus}
          disciplineId={disciplineId}
          setDisciplineId={setDisciplineId}
          disciplines={disciplines}
          statusCounts={statusCounts}
          jornadaFilterId={jornadaFilterId}
          setJornadaFilterId={setJornadaFilterId}
          jornadaOptions={jornadaOptions}
        />

        {hasActiveFilters && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-3">
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Filtros ativos</span>
            {search && <ActiveChip label={`Busca: "${search}"`} onRemove={() => setSearch("")} />}
            {status && <ActiveChip label={`Status: ${statusLabel(status)}`} onRemove={() => setStatus("")} />}
            {disciplineId && (
              <ActiveChip
                label={`Disciplina: ${disciplines.find((d) => d.id === disciplineId)?.name || disciplineId}`}
                onRemove={() => setDisciplineId("")}
              />
            )}
            {jornadaFilterId && (
              <ActiveChip
                label={`Jornada: ${jornadaOptions.find((j) => j.id === jornadaFilterId)?.title || jornadaFilterId}`}
                onRemove={() => setJornadaFilterId("")}
              />
            )}
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto text-xs font-bold uppercase tracking-[0.14em] text-slate-500 transition hover:text-orange-300"
            >
              Limpar tudo
            </button>
          </div>
        )}

        <div className="mb-4 mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-slate-300">
            <span className="text-white">{filtered.length}</span>{" "}
            simulado{filtered.length !== 1 ? "s" : ""} encontrado{filtered.length !== 1 ? "s" : ""}
          </p>

          <label className="flex items-center gap-3 text-xs font-medium text-slate-500">
            Ordenar por:
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="h-10 rounded-xl border border-white/10 bg-[#0B111C] px-4 text-sm font-semibold text-slate-200 outline-none transition hover:border-orange-400/35 focus:border-orange-400/50 focus:ring-4 focus:ring-orange-500/10"
            >
              <option value="recent">Mais recentes</option>
              <option value="oldest">Mais antigos</option>
              <option value="title">Nome</option>
            </select>
          </label>
        </div>

        {filtered.length === 0 ? (
          <EmptyState hasActiveFilters={hasActiveFilters} />
        ) : (
          <div className="space-y-4">
            {filtered.map((simulado, index) => (
              <SimuladoCard
                key={simulado.id}
                simulado={simulado}
                index={index}
                jornadaFilterId={jornadaFilterId}
                archivingId={archivingId}
                onArchive={toggleArchiveSimulado}
                onAddToJornada={openJornadaModal}
                onDelete={() => setConfirmDelete(simulado)}
                retornoHref={retornoHref}
                titleOverride={titleOverrides[simulado.id]}
                onRenameTitle={updateSimuladoTitle}
                onOpen={(id) => router.push(`/simulados/${id}?retorno=${encodeURIComponent(retornoHref)}`)}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function SimuladosHero({ onDuplicateClick }: { onDuplicateClick: () => void }) {
  return (
    <header className="relative isolate mb-5 overflow-hidden rounded-[1.35rem] border border-white/[0.11] bg-[#07111F]/80 px-6 py-6 shadow-2xl shadow-black/35 sm:px-8">
      <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_12%_50%,rgba(249,115,22,0.24),transparent_34%),radial-gradient(circle_at_72%_28%,rgba(37,99,235,0.18),transparent_38%)]" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#05080D] via-[#061426]/88 to-[#05080D]/90" />
      <div className="absolute inset-y-0 left-0 -z-10 w-72 bg-[radial-gradient(circle_at_20%_50%,rgba(249,115,22,0.22),transparent_58%)]" />
      <div className="absolute bottom-0 left-0 h-px w-full bg-gradient-to-r from-orange-400/70 via-white/10 to-transparent" />

      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-orange-500/35 bg-orange-500/[0.08] text-orange-400 shadow-[0_0_38px_rgba(249,115,22,0.22)]">
            <FileQuestion size={40} strokeWidth={1.55} />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-400">Simulados</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-white md:text-5xl">Consultar Simulados</h1>
            <p className="mt-3 max-w-4xl text-sm leading-relaxed text-white/72 md:text-base">
              Gerencie simulados, bancos de questões vinculados, jornadas associadas e regras de execução dos alunos.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={onDuplicateClick}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-5 text-sm font-black text-slate-100 shadow-[0_16px_32px_rgba(0,0,0,0.22)] transition hover:-translate-y-0.5 hover:border-orange-400/35 hover:bg-orange-500/10 hover:text-white"
          >
            <CopyCheck size={18} />
            Duplicar existente
          </button>

          <Link
            href="/simulados/novo"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 px-6 text-sm font-black text-slate-950 shadow-[0_0_0_1px_rgba(255,255,255,0.18),0_18px_38px_rgba(249,115,22,0.32)] transition hover:-translate-y-0.5 hover:brightness-105"
          >
            <PlusCircle size={18} />
            Novo simulado
            <ArrowRight size={17} />
          </Link>
        </div>
      </div>
    </header>
  );
}

function FilterPanel({
  search,
  setSearch,
  status,
  setStatus,
  disciplineId,
  setDisciplineId,
  disciplines,
  statusCounts,
  jornadaFilterId,
  setJornadaFilterId,
  jornadaOptions,
}: {
  search: string;
  setSearch: (value: string) => void;
  status: string;
  setStatus: (value: string) => void;
  disciplineId: string;
  setDisciplineId: (value: string) => void;
  disciplines: Discipline[];
  statusCounts: Record<string, number>;
  jornadaFilterId: string;
  setJornadaFilterId: (value: string) => void;
  jornadaOptions: JornadaOption[];
}) {
  return (
    <section className="relative z-20 overflow-visible rounded-[1.75rem] border border-white/[0.07] bg-white/[0.03] p-5 shadow-xl shadow-black/20 backdrop-blur-sm md:p-6">
      <div className="mb-5 flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/10 text-orange-400">
          <SlidersHorizontal size={18} />
        </div>

        <div>
          <h2 className="text-base font-semibold text-white/90">Filtros</h2>
          <p className="mt-0.5 text-sm text-white/35">Busque por nome, status, disciplina e jornada.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
            Busca
          </label>
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome ou descrição do simulado..."
              className="h-12 w-full rounded-2xl border border-white/[0.08] bg-[#0D1926] pl-11 pr-10 text-sm font-semibold text-white/80 outline-none transition placeholder:text-white/30 hover:border-white/[0.15] focus:border-orange-400/40 focus:ring-2 focus:ring-orange-400/[0.08]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-500 transition hover:bg-white/10 hover:text-white"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <SimpleSelectDropdown
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "", label: `Todos (${statusCounts.all || 0})` },
            { value: "published", label: `Publicado (${statusCounts.published || 0})` },
            { value: "draft", label: `Rascunho (${statusCounts.draft || 0})` },
            { value: "archived", label: `Arquivado (${statusCounts.archived || 0})` },
          ]}
        />

        <SimpleSelectDropdown
          label="Disciplina"
          value={disciplineId}
          onChange={setDisciplineId}
          options={[
            { value: "", label: "Todas as disciplinas" },
            ...disciplines.map((discipline) => ({ value: discipline.id, label: discipline.name })),
          ]}
        />

        <SimpleSelectDropdown
          label="Jornada"
          value={jornadaFilterId}
          onChange={setJornadaFilterId}
          options={[
            { value: "", label: "Todas as jornadas" },
            ...jornadaOptions.map((jornada) => ({ value: jornada.id, label: jornada.title })),
          ]}
        />
      </div>
    </section>
  );
}

function SimpleSelectDropdown({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: globalThis.MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const currentLabel = options.find((o) => o.value === value)?.label ?? options[0]?.label ?? label;
  const isFiltered = value !== "";

  return (
    <div>
      <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
        {label}
      </label>
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="group flex h-12 w-full items-center justify-between rounded-2xl border border-white/[0.08] bg-[#0D1926] px-4 text-left text-sm font-semibold text-white/80 outline-none transition hover:border-white/[0.15] focus:border-orange-400/40 focus:ring-2 focus:ring-orange-400/[0.08]"
        >
          <span className="truncate">{currentLabel}</span>
          <span className="flex items-center gap-2">
            {isFiltered && <span className="h-2 w-2 rounded-full bg-orange-500" />}
            <ChevronDown
              size={16}
              className={`text-white/30 transition duration-200 group-hover:text-orange-400 ${open ? "rotate-180 text-orange-400" : ""}`}
            />
          </span>
        </button>

        {open && (
          <div className="absolute left-0 top-full z-[9999] mt-2 w-full rounded-2xl border border-white/[0.09] bg-[#0D1B2E] p-2 shadow-2xl shadow-black/50 backdrop-blur-xl">
            <div className="max-h-72 space-y-0.5 overflow-y-auto">
              {options.map((opt) => {
                const selected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { onChange(opt.value); setOpen(false); }}
                    className={
                      selected
                        ? "flex w-full items-center justify-between rounded-xl border border-orange-500/30 bg-orange-500/[0.12] px-4 py-2.5 text-left text-sm font-semibold text-orange-100"
                        : "flex w-full items-center rounded-xl border border-transparent px-4 py-2.5 text-left text-sm font-semibold text-white/60 hover:border-white/[0.07] hover:bg-white/[0.04] hover:text-white/80"
                    }
                  >
                    <span className="flex-1 truncate text-left">{opt.label}</span>
                    {selected && <Check size={14} className="shrink-0 text-orange-400" strokeWidth={3} />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SimuladoCard({
  simulado,
  index,
  jornadaFilterId,
  archivingId,
  onArchive,
  onAddToJornada,
  onDelete,
  onOpen,
  retornoHref,
  titleOverride,
  onRenameTitle,
}: {
  simulado: Simulado;
  index: number;
  jornadaFilterId: string;
  archivingId: string | null;
  onArchive: (id: string) => void;
  onAddToJornada: (simulado: Simulado) => void;
  onDelete: () => void;
  onOpen: (id: string) => void;
  retornoHref: string;
  titleOverride?: string;
  onRenameTitle: (simulado: Simulado, nextTitle: string) => Promise<void>;
}) {
  const questionCount = simulado.simulado_questions?.length ?? simulado.question_count ?? 0;
  const updatedLabel = formatDateTime(simulado.updated_at);
  const isArchived = simulado.status === "archived";
  const jornadaOrderNumber = jornadaFilterId
    ? simulado.jornadas?.find((j) => j.id === jornadaFilterId)?.order_number
    : undefined;
  const displayNumber = String(jornadaOrderNumber ?? index + 1).padStart(2, "0");
  const thumbnailLabel = jornadaOrderNumber ? "NA JORNADA" : "SIMULADO";
  const description = simulado.description || "Simulado completo com foco nas disciplinas do edital.";
  const executionCount = Number(simulado.execution_count || 0);
  const averageScore = formatAverageScore(simulado.average_score);
  const averagePercentage = formatAveragePercentage(simulado.average_percentage);
  const jornadasLabel = formatJornadas(simulado.jornadas_titles);
  const displayTitle = titleOverride || simulado.title;

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpen(simulado.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(simulado.id);
        }
      }}
      className={`group relative cursor-pointer overflow-hidden rounded-2xl border border-white/[0.08] bg-[linear-gradient(135deg,rgba(15,23,36,0.96),rgba(8,15,28,0.96))] shadow-[0_18px_50px_rgba(0,0,0,0.22)] transition-all duration-300 hover:-translate-y-0.5 hover:border-orange-400/18 hover:shadow-[0_0_34px_rgba(255,138,0,0.11),0_18px_64px_rgba(0,0,0,0.34)] focus:outline-none focus:ring-4 focus:ring-orange-500/20 ${
        isArchived ? "opacity-70" : ""
      }`}
    >
      <div className={`absolute left-0 top-0 h-full w-1 ${statusBarClass(simulado.status)}`} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(255,138,0,0.08),transparent_28%),linear-gradient(90deg,rgba(255,255,255,0.035),transparent_34%)] opacity-80" />

      <div className="relative grid gap-5 p-4 md:grid-cols-[230px_1fr] xl:grid-cols-[230px_1fr_160px] xl:items-center">
        <SimuladoThumbnail
          number={displayNumber}
          label={thumbnailLabel}
          archived={isArchived}
        />

        <div className="min-w-0 py-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${statusBadgeClass(simulado.status)}`}>
              <span className={`h-2 w-2 rounded-full ${statusDotClass(simulado.status)}`} />
              {statusLabel(simulado.status)}
            </span>
          </div>

          <QuickEditableSimuladoTitle
            simulado={simulado}
            title={displayTitle}
            onSave={onRenameTitle}
          />

          <p className="mt-1 line-clamp-2 max-w-2xl text-sm leading-relaxed text-slate-400">
            {description}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
            <MetricItem icon={<Clock3 size={15} />} label="Tempo" value={timeLimitLabel(simulado.time_limit_minutes)} />
            <MetricItem icon={<FileQuestion size={15} />} label="Questões" value={String(questionCount)} />
            <MetricItem icon={<Gauge size={15} />} label="Pontuação média" value={averageScore} detail={averagePercentage} />
            <MetricItem icon={<Activity size={15} />} label="Execuções" value={String(executionCount)} />
            <MetricItem icon={<MapPin size={15} />} label="Jornadas" value={jornadasLabel} />
          </div>

          <p className="mt-4 flex items-center gap-2 text-xs font-medium text-slate-500" title={updatedLabel}>
            <CalendarDays size={13} />
            Atualizado em {updatedLabel}
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-1 xl:justify-self-end" onClick={(event) => event.stopPropagation()}>
          <Link href={`/simulados/${simulado.id}?retorno=${encodeURIComponent(retornoHref)}`} className={actionButtonClass()}>
            <Eye size={15} />
            Visualizar
          </Link>

          <Link href={`/simulados/${simulado.id}/editar?retorno=${encodeURIComponent(retornoHref)}`} className={actionButtonClass()}>
            <Pencil size={15} />
            Editar
          </Link>

          <button
            type="button"
            className={actionButtonClass()}
            onClick={() => onAddToJornada(simulado)}
          >
            <MapPin size={15} />
            Gerenciar Jornadas
          </button>

          <button
            type="button"
            className={actionButtonClass("danger")}
            disabled={archivingId === simulado.id}
            onClick={() => onArchive(simulado.id)}
          >
            <Archive size={15} />
            {archivingId === simulado.id
              ? "Atualizando..."
              : isArchived
                ? "Desarquivar"
                : "Arquivar"}
          </button>

          <button
            type="button"
            className={actionButtonClass("danger")}
            onClick={onDelete}
          >
            <Trash2 size={15} />
            Excluir
          </button>
        </div>
      </div>
    </article>
  );
}

function QuickEditableSimuladoTitle({
  simulado,
  title,
  onSave,
}: {
  simulado: Simulado;
  title: string;
  onSave: (simulado: Simulado, nextTitle: string) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title || "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!isEditing) setDraftTitle(title || "");
  }, [title, isEditing]);

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  useEffect(() => {
    if (status !== "saved") return;
    const timeout = window.setTimeout(() => setStatus("idle"), 1600);
    return () => window.clearTimeout(timeout);
  }, [status]);

  function startEditing(event: ReactMouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setDraftTitle(title || "");
    setErrorMessage("");
    setStatus("idle");
    setIsEditing(true);
  }

  function cancelEditing() {
    setDraftTitle(title || "");
    setErrorMessage("");
    setStatus("idle");
    setIsEditing(false);
  }

  async function commitTitle() {
    const cleanTitle = draftTitle.trim();
    if (!cleanTitle) {
      setStatus("error");
      setErrorMessage("Informe o nome do simulado.");
      return;
    }

    if (cleanTitle === (title || "").trim()) {
      setIsEditing(false);
      setStatus("idle");
      return;
    }

    setStatus("saving");
    setErrorMessage("");
    try {
      await onSave(simulado, cleanTitle);
      setIsEditing(false);
      setStatus("saved");
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Erro ao salvar nome.");
    }
  }

  if (isEditing) {
    return (
      <div className="max-w-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            ref={inputRef}
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onBlur={commitTitle}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                cancelEditing();
              }
            }}
            disabled={status === "saving"}
            className="h-11 min-w-0 flex-1 rounded-2xl border border-orange-400/35 bg-[#0D1926] px-4 text-xl font-black tracking-tight text-slate-50 outline-none transition placeholder:text-slate-500 focus:border-orange-300/70 focus:ring-4 focus:ring-orange-500/10 disabled:opacity-70"
          />
          <span className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold uppercase tracking-[0.13em] ${
            status === "saving"
              ? "border-orange-400/25 bg-orange-500/10 text-orange-200"
              : status === "error"
                ? "border-red-400/30 bg-red-500/10 text-red-300"
                : "border-white/10 bg-white/[0.04] text-slate-400"
          }`}>
            {status === "saving" ? "Salvando…" : status === "error" ? "Erro" : "Enter salva · Esc cancela"}
          </span>
        </div>
        {errorMessage && <p className="mt-2 text-xs font-semibold text-red-300">{errorMessage}</p>}
      </div>
    );
  }

  return (
    <div className="group/title flex max-w-2xl items-start gap-2">
      <h2 className="min-w-0 text-xl font-black tracking-tight text-slate-50">
        {title}
      </h2>
      <button
        type="button"
        onClick={startEditing}
        className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-slate-400 opacity-75 transition hover:border-orange-400/35 hover:bg-orange-500/10 hover:text-orange-200 group-hover/title:opacity-100"
        title="Editar nome do simulado"
        aria-label="Editar nome do simulado"
      >
        <Pencil size={13} />
      </button>
      {status === "saved" && (
        <span className="mt-1 inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.13em] text-emerald-300">
          <Check size={12} /> Salvo
        </span>
      )}
    </div>
  );
}

function SimuladoThumbnail({
  number,
  label,
  archived,
}: {
  number: string;
  label: string;
  archived: boolean;
}) {
  return (
    <div className="relative h-[148px] overflow-hidden rounded-xl border border-white/10 bg-[#07101d] shadow-[inset_0_0_40px_rgba(255,138,0,0.08)]">
      <img
        src={SIMULADO_THUMBNAIL}
        alt="Miniatura do simulado"
        onError={(event) => {
          if (event.currentTarget.src.includes(SIMULADO_THUMBNAIL_FALLBACK)) {
            event.currentTarget.style.display = "none";
            return;
          }
          event.currentTarget.src = SIMULADO_THUMBNAIL_FALLBACK;
        }}
        className={`h-full w-full object-cover transition duration-300 group-hover:scale-[1.03] ${
          archived ? "grayscale opacity-45" : "opacity-95"
        }`}
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.82),rgba(0,0,0,0.30),rgba(0,0,0,0.70))]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_20%,rgba(255,138,0,0.28),transparent_36%)]" />
      <div className="absolute inset-x-0 top-0 p-4">
        <p className="text-sm font-black uppercase tracking-[0.22em] text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)]">
          {label}
        </p>
        <p className="mt-1 text-5xl font-black leading-none text-orange-500 drop-shadow-[0_0_18px_rgba(255,138,0,0.65)]">
          {number}
        </p>
      </div>
    </div>
  );
}

function MetricItem({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail?: string }) {
  return (
    <div className="border-r border-white/10 pr-3 last:border-r-0">
      <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-orange-400">
        {icon}
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-bold text-white">
        {value}
        {detail && <span className="ml-1 text-[10px] font-semibold text-slate-400">{detail}</span>}
      </p>
    </div>
  );
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-400/25 bg-orange-500/10 px-3 py-1 text-xs font-bold text-orange-300">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="flex h-4 w-4 items-center justify-center rounded-full text-orange-300 transition hover:bg-orange-400/20 hover:text-white"
        aria-label="Remover filtro"
      >
        <X size={10} />
      </button>
    </span>
  );
}

function EmptyState({ hasActiveFilters }: { hasActiveFilters: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.03] p-14 text-center shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-orange-400">
        <FileQuestion size={28} />
      </div>
      <p className="text-base font-bold text-white">Nenhum simulado encontrado</p>
      <p className="mt-1 text-sm text-slate-400">
        {hasActiveFilters ? "Ajuste os filtros para ver outros simulados." : "Crie o primeiro simulado para começar."}
      </p>
    </div>
  );
}
