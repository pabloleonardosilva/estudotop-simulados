"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, BarChart3, CalendarDays, ChevronDown, FileSearch, Layers3, Loader2, Plus, Search, Sparkles, Target, Trash2, X } from "lucide-react";
import type { RaioXAnalysis } from "./types";
import type { FilterOptions } from "./page";
import { adminFetch } from "@/lib/supabase/adminFetch";
import { formatDateOnly, statusClass, statusLabel } from "./utils";

type Props = { analyses: RaioXAnalysis[]; filterOptions: FilterOptions };
type SortCol = "title" | "board" | "questions" | "status" | "created_at";
type SortDir = "asc" | "desc";

export default function RaioXProvasClient({ analyses: initialAnalyses, filterOptions }: Props) {
  const router = useRouter();
  const [analyses, setAnalyses] = useState<RaioXAnalysis[]>(initialAnalyses);
  const [search, setSearch] = useState("");
  const [filterContest, setFilterContest] = useState("");
  const [filterPosition, setFilterPosition] = useState("");
  const [filterBoard, setFilterBoard] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [sortCol, setSortCol] = useState<SortCol>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const match = (field: string | null | undefined, filter: string) =>
      !filter || String(field || "").toLowerCase().includes(filter.toLowerCase());
    return analyses.filter((item) => {
      if (!match(item.contest_name, filterContest)) return false;
      if (!match(item.position_name, filterPosition)) return false;
      if (!match(item.board_name, filterBoard)) return false;
      if (!match(String(item.exam_year), filterYear)) return false;
      if (term && ![item.title, item.contest_name, item.position_name, item.board_name, String(item.exam_year)]
        .some((v) => String(v || "").toLowerCase().includes(term))) return false;
      return true;
    });
  }, [analyses, search, filterContest, filterPosition, filterBoard, filterYear]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortCol) {
      case "title":
        return arr.sort((a, b) => dir * String(a.title || "").localeCompare(String(b.title || ""), "pt-BR"));
      case "board":
        return arr.sort((a, b) => dir * (`${a.board_name || ""} ${a.exam_year || ""}`).localeCompare(`${b.board_name || ""} ${b.exam_year || ""}`, "pt-BR"));
      case "questions":
        return arr.sort((a, b) => dir * (Number(a.dashboard?.total_it_questions || 0) - Number(b.dashboard?.total_it_questions || 0)));
      case "status":
        return arr.sort((a, b) => dir * String(a.status || "").localeCompare(String(b.status || ""), "pt-BR"));
      case "created_at":
        return arr.sort((a, b) => dir * (new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()));
      default:
        return arr;
    }
  }, [filtered, sortCol, sortDir]);

  const totals = useMemo(() => ({
    analyses: analyses.length,
    questions: analyses.reduce((sum, item) => sum + Number(item.dashboard?.total_it_questions || 0), 0),
    images: analyses.reduce((sum, item) => sum + Number(item.dashboard?.total_images || 0), 0),
    reviewed: analyses.filter((item) => item.status === "reviewed").length,
  }), [analyses]);

  const hasFilters = filterContest || filterPosition || filterBoard || filterYear || search;

  function clearFilters() {
    setSearch("");
    setFilterContest("");
    setFilterPosition("");
    setFilterBoard("");
    setFilterYear("");
  }

  async function deleteAnalysis(id: string) {
    setDeleteLoading(true);
    try {
      const response = await adminFetch(`/api/admin/exam-analyses/${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "Erro ao excluir.");
      setAnalyses((current) => current.filter((a) => a.id !== id));
      setDeletingId(null);
    } catch {
      // erro silencioso; o botão voltará ao estado normal
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <main className="min-h-full bg-[#0D1B2A] px-4 py-6 text-white md:px-8">
      <div className="pointer-events-none fixed inset-0 opacity-80">
        <div className="absolute left-[-12%] top-[-10%] h-72 w-72 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="absolute right-[-10%] top-1/4 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl" />
      </div>

      <section className="relative mx-auto max-w-7xl space-y-7">
        <header className="overflow-hidden rounded-[1.5rem] border border-white/[0.07] bg-[#0C1E34]/90 px-5 py-4 shadow-lg shadow-black/20 backdrop-blur">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-orange-400/20 bg-orange-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-orange-300">
                <FileSearch size={11} /> Raio-X de Provas
              </div>
              <h1 className="mt-2 text-xl font-bold text-slate-100">Análises estratégicas de provas</h1>
              <p className="mt-1 text-sm text-slate-500">
                Cole provas de TI, gere o mapa de cobrança e revise as questões.
              </p>
            </div>
            <Link href="/admin/raio-x-provas/nova" className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white shadow-md shadow-orange-500/20 transition hover:bg-orange-400">
              <Plus size={16} /> Nova análise
            </Link>
          </div>
        </header>

        <div className="grid gap-3 md:grid-cols-4">
          <Metric icon={<FileSearch size={16} />} label="Análises" value={totals.analyses} />
          <Metric icon={<Layers3 size={16} />} label="Questões mapeadas" value={totals.questions} />
          <Metric icon={<Sparkles size={16} />} label="Com imagens" value={totals.images} />
          <Metric icon={<Target size={16} />} label="Revisadas" value={totals.reviewed} />
        </div>

        {/* Filter card */}
        <div className="relative z-20 rounded-[1.75rem] border border-white/[0.07] bg-white/[0.03] p-5 shadow-xl shadow-black/20 backdrop-blur-sm md:p-6">
          <div className="mb-5 flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/10 text-orange-400">
              <Search size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white/90">Filtros</h2>
              <p className="mt-0.5 text-sm text-white/35">Filtre por concurso, cargo, banca e ano.</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Buscar prova</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={15} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Busca livre..." className="h-12 w-full rounded-2xl border border-white/[0.08] bg-[#0D1926] pl-10 pr-4 text-sm font-semibold text-white/80 outline-none transition placeholder:text-white/30 hover:border-white/[0.15] focus:border-orange-400/40 focus:ring-2 focus:ring-orange-400/[0.08]" />
              </div>
            </div>
            <FilterSelect label="Concurso" value={filterContest} onChange={setFilterContest} options={filterOptions.contests} />
            <FilterSelect label="Cargo" value={filterPosition} onChange={setFilterPosition} options={filterOptions.positions} />
            <FilterSelect label="Banca" value={filterBoard} onChange={setFilterBoard} options={filterOptions.boards} />
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-4">
            <div className="min-w-[200px] flex-1 xl:max-w-[calc(25%-12px)]">
              <FilterSelect label="Ano" value={filterYear} onChange={setFilterYear} options={filterOptions.years} />
            </div>
            {hasFilters && (
              <button type="button" onClick={clearFilters} className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 text-sm font-semibold text-white/50 transition hover:border-white/[0.15] hover:text-white/80">
                <X size={14} /> Limpar filtros
              </button>
            )}
          </div>
        </div>

        {/* Table card */}
        <div className="rounded-[1.5rem] border border-white/[0.07] bg-[#0C1E34]/88 shadow-lg shadow-black/15">
          <div className="border-b border-white/[0.06] px-5 py-4">
            <h2 className="text-base font-semibold text-white/90">Histórico de Raio-X</h2>
            <p className="mt-0.5 text-sm text-white/40">{sorted.length} análise{sorted.length !== 1 ? "s" : ""} encontrada{sorted.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="overflow-x-auto">
          <div className="overflow-hidden rounded-2xl border border-white/[0.07] m-4">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-white/[0.035] text-xs uppercase tracking-widest text-slate-500">
                <tr>
                  {([
                    { col: "title" as SortCol, label: "Prova" },
                    { col: "board" as SortCol, label: "Banca / Ano" },
                    { col: "questions" as SortCol, label: "Questões" },
                    { col: "status" as SortCol, label: "Status", className: "w-40" },
                    { col: "created_at" as SortCol, label: "Criada em" },
                  ]).map(({ col, label, className }) => {
                    const active = sortCol === col;
                    const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                    return (
                      <th key={col} className={`px-4 py-3 ${className ?? ""}`}>
                        <button
                          type="button"
                          onClick={() => toggleSort(col)}
                          className={`inline-flex items-center gap-1.5 font-black uppercase tracking-widest transition ${active ? "text-orange-300" : "text-slate-500 hover:text-slate-300"}`}
                        >
                          {label}
                          <Icon size={11} className={active ? "text-orange-400" : "text-slate-600"} />
                        </button>
                      </th>
                    );
                  })}
                  <th className="px-4 py-3 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {sorted.map((item, idx) => (
                  <tr key={item.id} className={`group transition hover:bg-white/[0.045] ${idx % 2 === 0 ? "bg-[#0C1B2E]/60" : "bg-white/[0.02]"}`}>
                    <td className="px-4 py-4">
                      <Link href={`/admin/raio-x-provas/${item.id}`} className="font-bold text-white hover:text-orange-200">
                        {item.contest_name || item.title}
                      </Link>
                      {item.position_name && (
                        <p className="mt-1 text-xs text-slate-500">{item.position_name}</p>
                      )}
                    </td>
                    <td className="px-4 py-4 text-slate-300">{item.board_name} · {item.exam_year}</td>
                    <td className="px-4 py-4 text-slate-300">{Number(item.dashboard?.total_it_questions || 0)} questões</td>
                    <td className="px-4 py-4"><span className={`inline-block whitespace-nowrap rounded-full border px-3 py-1 text-xs font-bold ${statusClass(item.status)}`}>{statusLabel(item.status)}</span></td>
                    <td className="px-4 py-4 text-slate-400"><span className="inline-flex items-center gap-2"><CalendarDays size={14} />{formatDateOnly(item.created_at)}</span></td>
                    <td className="px-4 py-4">
                      {deletingId === item.id ? (
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => deleteAnalysis(item.id)} disabled={deleteLoading} className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs font-bold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50">
                            {deleteLoading ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />} Confirmar
                          </button>
                          <button type="button" onClick={() => setDeletingId(null)} className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-xs font-semibold text-slate-400 hover:text-white">
                            <X size={11} />
                          </button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setDeletingId(item.id)} className="rounded-lg border border-transparent p-1.5 text-slate-600 opacity-0 transition hover:border-red-500/25 hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Nenhuma análise encontrada.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  const [open, setOpen] = useState(false);

  const suggestions = useMemo(() => {
    const term = value.toLowerCase().trim();
    if (!term) return options.slice(0, 25);
    return options.filter((o) => o.toLowerCase().includes(term)).slice(0, 25);
  }, [options, value]);

  if (!options.length) return null;

  return (
    <div className="relative">
      <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">{label}</label>
      <div className={`flex h-12 items-center gap-2 rounded-2xl border px-4 transition ${
        value ? "border-orange-400/40 bg-orange-500/10 text-orange-200" : "border-white/[0.08] bg-[#0D1926] text-white/80 hover:border-white/[0.15]"
      }`}>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Todos"
          className="flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-white/30"
        />
        {value ? (
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(""); setOpen(false); }} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white/50 hover:text-white/80">
            <X size={14} />
          </button>
        ) : (
          <ChevronDown size={16} className="shrink-0 text-white/30" />
        )}
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute left-0 top-[3.5rem] z-[9999] min-w-full rounded-2xl border border-white/[0.09] bg-[#0D1B2E] p-1.5 shadow-2xl shadow-black/50">
          {suggestions.map((opt) => (
            <button key={opt} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(opt); setOpen(false); }}
              className={`flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-white/[0.07] ${
                value === opt ? "text-orange-200" : "text-white/60 hover:text-white/80"
              }`}>
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-[1.2rem] border border-white/[0.07] bg-white/[0.04] p-4">
      <div className="flex items-center justify-between">
        <div className="rounded-xl border border-orange-400/20 bg-orange-500/10 p-2 text-orange-300">{icon}</div>
      </div>
      <p className="mt-3 text-xl font-bold text-slate-100">{value}</p>
      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
    </div>
  );
}
