"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  CalendarDays,
  Clock3,
  Eye,
  FileQuestion,
  Flag,
  Layers3,
  Pencil,
  Plus,
  CopyPlus,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import PremiumButton from "../../components/ui/PremiumButton";
import PremiumModal from "../../components/ui/PremiumModal";
import { adminFetch } from "@/lib/supabase/adminFetch";
import type { Jornada } from "./types";
import { formatDate, jornadaCategoryImage, jornadaCategoryLabel, scopeLabel, statusLabel } from "./utils";

type Feedback = { tone: "success" | "error"; title: string; message: string } | null;
type StatusFilter = "" | "draft" | "published" | "archived";

const STATUS_TABS: Array<{ value: StatusFilter; label: string; description: string }> = [
  { value: "", label: "Todas", description: "Catálogo completo" },
  { value: "draft", label: "Rascunho", description: "Em preparação" },
  { value: "published", label: "Publicadas", description: "Liberadas para matrícula" },
  { value: "archived", label: "Arquivadas", description: "Fora de uso" },
];


function durationInDays(jornada: Jornada) {
  const explicitDays = Number(jornada.duration_days || 0);
  if (Number.isFinite(explicitDays) && explicitDays > 0) return explicitDays;
  return Math.max(0, Number(jornada.duration_months || 0) * 30);
}

function statusBadgeClass(status: string | null | undefined) {
  if (status === "published") {
    return "border-emerald-300/35 bg-emerald-400/10 text-emerald-200 shadow-[0_0_22px_rgba(16,185,129,0.14)]";
  }
  if (status === "archived") {
    return "border-slate-400/25 bg-slate-500/10 text-slate-300";
  }
  return "border-orange-400/35 bg-orange-500/10 text-orange-300 shadow-[0_0_22px_rgba(255,138,0,0.12)]";
}

function statusDotClass(status: string | null | undefined) {
  if (status === "published") return "bg-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.6)]";
  if (status === "archived") return "bg-slate-400";
  return "bg-orange-400 shadow-[0_0_10px_rgba(255,138,0,0.55)]";
}

function statusSpineClass(status: string | null | undefined) {
  if (status === "published") return "bg-[linear-gradient(to_bottom,#A7F3D0,#10B981,#047857)] shadow-[0_0_26px_rgba(16,185,129,0.45)]";
  if (status === "archived") return "bg-slate-500";
  return "bg-[linear-gradient(to_bottom,#FED7AA,#F97316,#C2410C)] shadow-[0_0_26px_rgba(249,115,22,0.45)]";
}

function scopeBadgeClass(scopeType: string | null | undefined) {
  if (scopeType === "contest") return "border-orange-400/35 bg-orange-500/10 text-orange-200";
  return "border-sky-300/25 bg-sky-400/10 text-sky-200";
}

function actionButtonClass(tone: "default" | "danger" = "default") {
  if (tone === "danger") {
    return "inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-red-500/25 bg-red-500/5 px-3 text-xs font-bold text-red-300 transition hover:border-red-400/45 hover:bg-red-500/10";
  }

  return "inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-bold text-slate-200 transition hover:border-orange-400/35 hover:bg-orange-500/10 hover:text-white";
}

function calcFillPercent(linked: number, planned: number) {
  if (!planned || planned <= 0) return linked > 0 ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round((linked / planned) * 100)));
}

function metricLabel(value: number | null | undefined) {
  return Number(value || 0).toLocaleString("pt-BR");
}

export default function JornadasClient({ jornadas }: { jornadas: Jornada[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("published");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<Jornada | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateSourceId, setDuplicateSourceId] = useState<string>(jornadas[0]?.id || "");
  const [duplicateTitle, setDuplicateTitle] = useState("");
  const [duplicating, setDuplicating] = useState(false);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { "": jornadas.length };
    jornadas.forEach((j) => {
      counts[j.status] = (counts[j.status] || 0) + 1;
    });
    return counts;
  }, [jornadas]);

  const summary = useMemo(() => {
    return jornadas.reduce(
      (acc, jornada) => {
        acc.simulados += Number(jornada.simulado_count || 0);
        acc.planned += Number(jornada.planned_simulados_count || 0);
        acc.students += Number(jornada.student_count || 0);
        return acc;
      },
      { simulados: 0, planned: 0, students: 0 },
    );
  }, [jornadas]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    return jornadas.filter((j) => {
      const matchSearch =
        !term ||
        j.title.toLowerCase().includes(term) ||
        (j.description || "").toLowerCase().includes(term) ||
        (j.contest_name || "").toLowerCase().includes(term);
      const matchStatus = !statusFilter || j.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [jornadas, search, statusFilter]);

  async function handleArchive(jornada: Jornada) {
    setArchivingId(jornada.id);
    try {
      const res = await adminFetch(`/api/admin/jornadas/${jornada.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive" }),
      });
      const result = await res.json();
      if (!result.ok) throw new Error(result.message);
      setFeedback({ tone: "success", title: "Jornada arquivada", message: result.message });
      router.refresh();
    } catch (err) {
      setFeedback({
        tone: "error",
        title: "Erro ao arquivar",
        message: err instanceof Error ? err.message : "Erro inesperado.",
      });
    } finally {
      setArchivingId(null);
      setConfirmArchive(null);
    }
  }


  function openDuplicateModal() {
    const firstVisible = filtered[0] || jornadas[0];
    const sourceId = duplicateSourceId || firstVisible?.id || "";
    const source = jornadas.find((j) => j.id === sourceId) || firstVisible;
    setDuplicateSourceId(source?.id || "");
    setDuplicateTitle(source ? `${source.title} — cópia` : "");
    setShowDuplicateModal(true);
  }

  function selectDuplicateSource(id: string) {
    const source = jornadas.find((j) => j.id === id);
    setDuplicateSourceId(id);
    setDuplicateTitle(source ? `${source.title} — cópia` : "");
  }

  async function handleDuplicateJornada() {
    if (!duplicateSourceId) {
      setFeedback({ tone: "error", title: "Selecione uma Jornada", message: "Escolha qual Jornada deve ser duplicada." });
      return;
    }

    setDuplicating(true);
    try {
      const res = await adminFetch("/api/admin/jornadas/duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_jornada_id: duplicateSourceId, title: duplicateTitle }),
      });
      const result = await res.json();
      if (!result.ok) throw new Error(result.message || "Erro ao duplicar Jornada.");
      setShowDuplicateModal(false);
      setFeedback({ tone: "success", title: "Jornada duplicada", message: result.message || "A cópia foi criada como rascunho." });
      router.push(`/admin/jornadas/${result.id}/editar`);
      router.refresh();
    } catch (err) {
      setFeedback({
        tone: "error",
        title: "Erro ao duplicar",
        message: err instanceof Error ? err.message : "Erro inesperado.",
      });
    } finally {
      setDuplicating(false);
    }
  }

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[#03070D] px-4 py-6 text-slate-100 md:px-8 md:py-8">
      <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_16%_0%,rgba(249,115,22,0.12),transparent_30%),radial-gradient(circle_at_78%_5%,rgba(37,99,235,0.16),transparent_32%),linear-gradient(180deg,#03070D_0%,#050B14_48%,#03070D_100%)]" />
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-[0.055] [background-image:linear-gradient(rgba(255,255,255,.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.18)_1px,transparent_1px)] [background-size:72px_72px]" />

      <PremiumModal
        open={Boolean(feedback)}
        tone={feedback?.tone || "info"}
        title={feedback?.title || ""}
        message={feedback?.message}
        onClose={() => setFeedback(null)}
      />

      <PremiumModal
        open={Boolean(confirmArchive)}
        tone="warning"
        title="Arquivar Jornada"
        message={`Tem certeza que deseja arquivar "${confirmArchive?.title}"? Alunos matriculados continuarão com acesso até o vencimento.`}
        onClose={() => setConfirmArchive(null)}
        actions={
          <div className="flex gap-3">
            <PremiumButton variant="secondary" onClick={() => setConfirmArchive(null)}>
              Cancelar
            </PremiumButton>
            <PremiumButton
              variant="danger"
              disabled={archivingId !== null}
              onClick={() => confirmArchive && handleArchive(confirmArchive)}
            >
              {archivingId ? "Arquivando…" : "Arquivar"}
            </PremiumButton>
          </div>
        }
      />


      <PremiumModal
        open={showDuplicateModal}
        tone="info"
        title="Duplicar Jornada existente"
        message="Escolha a Jornada base e confirme o nome da nova cópia. A duplicação cria uma Jornada em rascunho, copiando as configurações e os simulados vinculados, sem copiar alunos matriculados."
        onClose={() => setShowDuplicateModal(false)}
        actions={
          <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <PremiumButton variant="dark" onClick={() => setShowDuplicateModal(false)} disabled={duplicating}>
              Cancelar
            </PremiumButton>
            <PremiumButton icon={<CopyPlus size={17} />} onClick={handleDuplicateJornada} disabled={duplicating || !duplicateSourceId}>
              {duplicating ? "Duplicando…" : "Duplicar agora"}
            </PremiumButton>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-orange-200">
              Jornada que será duplicada
            </label>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {jornadas.map((jornada) => {
                const selected = duplicateSourceId === jornada.id;
                return (
                  <button
                    key={jornada.id}
                    type="button"
                    onClick={() => selectDuplicateSource(jornada.id)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                      selected
                        ? "border-orange-400/55 bg-orange-500/15 shadow-[0_0_22px_rgba(249,115,22,0.14)]"
                        : "border-white/10 bg-white/[0.045] hover:border-orange-400/35 hover:bg-white/[0.07]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="line-clamp-1 text-sm font-black text-white">{jornada.title}</span>
                      <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ${statusBadgeClass(jornada.status)}`}>
                        {statusLabel(jornada.status)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-1 text-xs font-semibold text-slate-400">
                      {jornada.simulado_count || 0} simulado(s) · {jornada.student_count || 0} aluno(s) matriculado(s)
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-orange-200">
              Nome da nova Jornada
            </label>
            <input
              value={duplicateTitle}
              onChange={(event) => setDuplicateTitle(event.target.value)}
              placeholder="Ex.: Jornada PCMG — cópia"
              className="h-12 w-full rounded-2xl border border-white/[0.10] bg-[#0D1926] px-4 text-sm font-semibold text-white outline-none transition placeholder:text-white/30 hover:border-white/[0.16] focus:border-orange-400/45 focus:ring-2 focus:ring-orange-400/[0.10]"
            />
          </div>
        </div>
      </PremiumModal>

      <section className="relative mx-auto max-w-[1500px]">
        <header className="mb-5 overflow-hidden rounded-[1.35rem] border border-white/[0.11] bg-[#07111F]/80 p-5 shadow-2xl shadow-black/35 backdrop-blur-xl md:p-7">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_20%,rgba(249,115,22,0.18),transparent_24%),radial-gradient(circle_at_85%_8%,rgba(37,99,235,0.18),transparent_32%),linear-gradient(135deg,#05080D,#061426_48%,#05080D)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-orange-400/25 bg-orange-500/10 px-3 py-1 text-xs font-black uppercase tracking-[0.20em] text-orange-200">
                <Layers3 size={14} />
                Jornadas
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-white md:text-4xl">
                Álbum de Jornadas
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400 md:text-base">
                Gerencie trilhas de simulados progressivos com visual de catálogo premium: cada Jornada aparece como uma figurinha de álbum.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[480px]">
              <HeroMetric icon={<Layers3 size={17} />} label="Total de Jornadas" value={metricLabel(jornadas.length)} />
              <HeroMetric icon={<FileQuestion size={17} />} label="Simulados Cadastrados" value={metricLabel(summary.simulados)} />
              <HeroMetric icon={<Users size={17} />} label="Alunos Inseridos" value={metricLabel(summary.students)} />
            </div>
          </div>
        </header>

        <section className="relative z-20 mb-5 rounded-[1.75rem] border border-white/[0.07] bg-white/[0.03] p-5 shadow-xl shadow-black/20 backdrop-blur-sm">
          <div className="grid gap-3 xl:grid-cols-[1fr_340px_auto] xl:items-center">
            <div className="grid gap-2 sm:grid-cols-4">
              {STATUS_TABS.map((tab) => {
                const active = statusFilter === tab.value;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setStatusFilter(tab.value)}
                    className={`rounded-2xl border px-3 py-2 text-left transition ${
                      active
                        ? "border-orange-400/45 bg-orange-500/12 shadow-[0_0_24px_rgba(249,115,22,0.12)]"
                        : "border-white/10 bg-white/[0.035] hover:border-orange-400/25 hover:bg-white/[0.055]"
                    }`}
                  >
                    <span className={`text-sm font-black ${active ? "text-orange-100" : "text-slate-200"}`}>
                      {tab.label}
                    </span>
                    <span className="hidden">
                      {tab.description}
                    </span>
                    <span className="mt-1 inline-flex rounded-full border border-white/10 bg-black/20 px-2.5 py-0.5 text-[11px] font-black text-slate-200">
                      {statusCounts[tab.value] ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>

            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={17} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nome, descrição ou concurso…"
                className="h-12 w-full rounded-2xl border border-white/[0.08] bg-[#0D1926] pl-11 pr-4 text-sm font-semibold text-white/80 outline-none transition placeholder:text-white/30 hover:border-white/[0.15] focus:border-orange-400/40 focus:ring-2 focus:ring-orange-400/[0.08]"
              />
            </label>

            <div className="grid gap-2 sm:grid-cols-2 xl:w-[380px]">
              <button
                type="button"
                onClick={openDuplicateModal}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-bold text-slate-100 shadow-sm transition hover:border-orange-400/35 hover:bg-orange-500/10 hover:text-white"
              >
                <CopyPlus size={18} />
                Duplicar existente
              </button>
              <Link href="/admin/jornadas/nova" className="w-full">
                <PremiumButton full icon={<Plus size={18} />}>
                  Nova Jornada
                </PremiumButton>
              </Link>
            </div>
          </div>
        </section>

        {filtered.length === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-white/15 bg-white/[0.035] p-14 text-center shadow-[0_16px_50px_rgba(0,0,0,0.18)]">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-orange-400/25 bg-orange-500/10 text-orange-300">
              <CalendarDays size={28} />
            </div>
            <p className="text-xl font-black text-white">Nenhuma jornada encontrada.</p>
            <p className="mt-2 text-sm text-slate-500">
              {search ? "Tente outro termo de busca ou limpe os filtros." : "Crie a primeira jornada para começar."}
            </p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filtered.map((jornada) => (
              <JornadaStickerCard
                key={jornada.id}
                jornada={jornada}
                archivingId={archivingId}
                onOpen={() => router.push(`/admin/jornadas/${jornada.id}`)}
                onArchive={() => setConfirmArchive(jornada)}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function HeroMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="mb-1.5 flex h-8 w-8 items-center justify-center rounded-xl border border-orange-400/25 bg-orange-500/10 text-orange-300">
        {icon}
      </div>
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-white">{value}</p>
    </div>
  );
}

function JornadaStickerCard({
  jornada,
  archivingId,
  onOpen,
  onArchive,
}: {
  jornada: Jornada;
  archivingId: string | null;
  onOpen: () => void;
  onArchive: () => void;
}) {
  const linked = Number(jornada.simulado_count || 0);
  const planned = Number(jornada.planned_simulados_count || 0);
  const fillPercent = calcFillPercent(linked, planned);
  const isArchived = jornada.status === "archived";
  const hasOverflow = planned > 0 && linked > planned;

  return (
    <article
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className={`group relative min-h-[500px] cursor-pointer overflow-hidden rounded-[1.9rem] border border-white/[0.09] bg-[linear-gradient(160deg,rgba(8,13,22,0.99),rgba(3,7,13,0.99))] p-4 shadow-[0_20px_58px_rgba(0,0,0,0.32)] outline-none transition-all duration-300 hover:-translate-y-1 hover:border-orange-400/28 hover:shadow-[0_0_34px_rgba(255,138,0,0.13),0_22px_70px_rgba(0,0,0,0.42)] focus-visible:border-orange-400/45 focus-visible:ring-4 focus-visible:ring-orange-500/15 ${
        isArchived ? "opacity-70" : ""
      }`}
    >
      <div className={`absolute left-0 top-0 h-full w-1.5 ${statusSpineClass(jornada.status)}`} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_28%_0%,rgba(255,138,0,0.14),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.045),transparent_32%)]" />
      <div className="pointer-events-none absolute -right-16 top-10 h-40 w-40 rounded-full bg-orange-500/10 blur-3xl transition duration-300 group-hover:bg-orange-500/16" />

      <div className="relative flex h-full min-h-[468px] flex-col">
        <div className="mb-4 overflow-hidden rounded-[1.45rem] border border-white/10 bg-[#07101d] shadow-[inset_0_0_42px_rgba(255,138,0,0.08)]">
          <div
            className="relative h-52 overflow-hidden bg-cover bg-center transition duration-500 group-hover:scale-[1.015]"
            style={{ backgroundImage: `url(${jornadaCategoryImage(jornada.category)})` }}
          >
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.05)_0%,rgba(2,6,23,0.18)_38%,rgba(2,6,23,0.92)_100%)]" />
            <div className="absolute inset-0 ring-1 ring-inset ring-white/10" />
            <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/35 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-slate-100 shadow-[0_8px_22px_rgba(0,0,0,0.22)] backdrop-blur-md">
              <ShieldCheck size={13} className="text-orange-300" />
              {jornadaCategoryLabel(jornada.category)}
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <p className="line-clamp-2 text-2xl font-black leading-tight tracking-tight text-white drop-shadow-[0_3px_16px_rgba(0,0,0,0.85)]">
                {jornada.title}
              </p>
            </div>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${statusBadgeClass(jornada.status)}`}>
            <span className={`h-2 w-2 rounded-full ${statusDotClass(jornada.status)}`} />
            {statusLabel(jornada.status)}
          </span>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${scopeBadgeClass(jornada.scope_type)}`}>
            <Flag size={12} />
            {scopeLabel(jornada.scope_type, jornada.contest_name)}
          </span>
          {hasOverflow && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-red-400/35 bg-red-500/10 px-3 py-1 text-xs font-bold text-red-300"
              title={`${linked} simulados vinculados, mas apenas ${planned} planejados`}
            >
              <AlertTriangle size={12} />
              Excedente
            </span>
          )}
        </div>

        <p className="mt-3 line-clamp-2 min-h-[40px] text-sm leading-relaxed text-slate-400">
          {jornada.description || "Jornada progressiva de simulados, com cronograma individual por aluno."}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <StickerMetric icon={<Clock3 size={14} />} label="Duração" value={`${durationInDays(jornada)} dias`} />
          <StickerMetric icon={<Users size={14} />} label="Alunos" value={metricLabel(jornada.student_count)} />
          <StickerMetric icon={<FileQuestion size={14} />} label="Simulados" value={`${linked}/${planned || 0}`} />
          <StickerMetric icon={<CalendarDays size={14} />} label="Prova" value={jornada.exam_date ? formatDate(jornada.exam_date) : "Geral"} />
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold text-slate-400">
            <span>Montagem da jornada</span>
            <span className="text-orange-200">{fillPercent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#F97316,#FDBA74)] shadow-[0_0_18px_rgba(249,115,22,0.45)] transition-all"
              style={{ width: `${fillPercent}%` }}
            />
          </div>
        </div>

        <p className="mt-3 flex items-center gap-2 text-xs font-medium text-slate-500">
          <CalendarDays size={13} />
          Criada em {formatDate(jornada.created_at)}
        </p>

        <div className="mt-auto grid grid-cols-2 gap-2 pt-5">
          <Link href={`/admin/jornadas/${jornada.id}`} onClick={(event) => event.stopPropagation()} className={actionButtonClass()}>
            <Eye size={15} />
            Ver
          </Link>
          <Link href={`/admin/jornadas/${jornada.id}/editar`} onClick={(event) => event.stopPropagation()} className={actionButtonClass()}>
            <Pencil size={15} />
            Editar
          </Link>
          {jornada.status === "published" && (
            <button
              type="button"
              className={`${actionButtonClass("danger")} col-span-2`}
              disabled={archivingId === jornada.id}
              onClick={(event) => {
                event.stopPropagation();
                onArchive();
              }}
            >
              <Archive size={15} />
              {archivingId === jornada.id ? "Arquivando..." : "Arquivar"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function StickerMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
      <div className="mb-2 flex items-center gap-2 text-orange-300">
        {icon}
        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</span>
      </div>
      <p className="truncate text-sm font-black text-slate-100" title={value}>
        {value}
      </p>
    </div>
  );
}
