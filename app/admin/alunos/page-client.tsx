"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  Clock3,
  ExternalLink,
  Lock,
  MoreVertical,
  Plus,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import PremiumButton from "@/app/components/ui/PremiumButton";
import { formatCpf } from "@/lib/utils/cpf";
import type { StudentRow } from "./page";

// ── constants ──────────────────────────────────────────────

type TabKey = "all" | "pending" | "active" | "blocked" | "inactive";
type SortKey = "name" | "email" | "status" | "created_at";
type SortDir = "asc" | "desc";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "all", label: "Todos", icon: <UsersRound size={14} /> },
  { key: "pending", label: "Em análise", icon: <Clock3 size={14} /> },
  { key: "active", label: "Ativos", icon: <ShieldCheck size={14} /> },
  { key: "blocked", label: "Bloqueados", icon: <Lock size={14} /> },
  { key: "inactive", label: "Inativos", icon: <UserRound size={14} /> },
];

const AVATAR_COLORS = [
  "bg-violet-500",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-orange-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-amber-600",
  "bg-indigo-500",
];

const STATUS_CFG: Record<StudentRow["status"], { label: string; cls: string }> = {
  active: { label: "Ativo", cls: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" },
  pending: { label: "Em análise", cls: "border-amber-500/20 bg-amber-500/10 text-amber-400" },
  blocked: { label: "Bloqueado", cls: "border-red-500/20 bg-red-500/10 text-red-400" },
  inactive: { label: "Inativo", cls: "border-white/10 bg-white/[0.04] text-white/40" },
};

// ── helpers ────────────────────────────────────────────────

// Normalização única para busca: usada no termo digitado E em cada campo
// comparado, garantindo comparação simétrica. Remove acentos, caixa e todo
// caractere que não seja letra/número (pontos, hífens, barras, parênteses,
// espaços, @, etc.). Não altera os dados nem o texto exibido.
function normalizeSearchValue(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return ((parts[0][0] ?? "") + (parts[parts.length - 1][0] ?? "")).toUpperCase();
}

function getAvatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatAbsoluteDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(value));
}

function formatRelativeDays(value: string): string {
  const diff = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (diff === 0) return "hoje";
  if (diff === 1) return "há 1 dia";
  return `há ${diff} dias`;
}

// ── main component ─────────────────────────────────────────

export default function AlunosAdminClient({ students }: { students: StudentRow[] }) {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const counts = useMemo(
    () => ({
      all: students.length,
      pending: students.filter((s) => s.status === "pending").length,
      active: students.filter((s) => s.status === "active").length,
      blocked: students.filter((s) => s.status === "blocked").length,
      inactive: students.filter((s) => s.status === "inactive").length,
    }),
    [students],
  );

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setCurrentPage(1);
  }

  const filtered = useMemo(() => {
    let result = students;
    if (activeTab !== "all") result = result.filter((s) => s.status === activeTab);
    const q = normalizeSearchValue(search);
    if (q) {
      result = result.filter(
        (s) =>
          normalizeSearchValue(s.name).includes(q) ||
          normalizeSearchValue(s.email).includes(q) ||
          normalizeSearchValue(s.cpf).includes(q) ||
          normalizeSearchValue(s.phone).includes(q),
      );
    }

    const dir = sortDir === "asc" ? 1 : -1;
    result = [...result].sort((a, b) => {
      if (sortKey === "name") {
        return dir * (a.name ?? "").localeCompare(b.name ?? "", "pt-BR", { sensitivity: "base" });
      }
      if (sortKey === "email") {
        return dir * (a.email ?? "").localeCompare(b.email ?? "", "pt-BR", { sensitivity: "base" });
      }
      if (sortKey === "status") {
        return dir * (a.status ?? "").localeCompare(b.status ?? "");
      }
      if (sortKey === "created_at") {
        return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      }
      return 0;
    });

    return result;
  }, [students, activeTab, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(
    () => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filtered, currentPage, pageSize],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, activeTab, pageSize, sortKey, sortDir]);

  const showingFrom = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const showingTo = Math.min(currentPage * pageSize, filtered.length);

  return (
    <div className="et-dark-admin-page relative isolate min-h-screen overflow-hidden bg-[#03070D] text-slate-100">
      <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_16%_0%,rgba(249,115,22,0.12),transparent_30%),radial-gradient(circle_at_78%_5%,rgba(37,99,235,0.16),transparent_32%),linear-gradient(180deg,#03070D_0%,#050B14_48%,#03070D_100%)]" />
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-[0.055] [background-image:linear-gradient(rgba(255,255,255,.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.18)_1px,transparent_1px)] [background-size:72px_72px]">
      </div>
      {/* Page header */}
      <div className="relative mx-auto max-w-7xl px-6 pb-6 pt-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-orange-400">
          EstudoTOP Simulados
        </p>
        <div className="relative isolate overflow-hidden rounded-[1.35rem] border border-white/[0.11] bg-[#07111F]/80 p-6 shadow-2xl shadow-black/35 backdrop-blur-xl md:p-7">
          <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_8%_20%,rgba(249,115,22,0.18),transparent_24%),radial-gradient(circle_at_85%_8%,rgba(37,99,235,0.18),transparent_32%),linear-gradient(135deg,#05080D,#061426_48%,#05080D)]" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Alunos</h1>
            <p className="mt-2 text-sm text-white/45">
              Gerencie os cadastros e o status de acesso dos alunos da plataforma.
            </p>
          </div>
          <Link href="/admin/alunos/novo">
            <PremiumButton icon={<Plus size={18} />}>Novo aluno</PremiumButton>
          </Link>
        </div>
        </div>
      </div>

      <div className="relative mx-auto max-w-7xl px-6 pb-12">
        {/* Metric cards */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Total"
            value={counts.all}
            description="Todos os alunos cadastrados"
            icon={<UsersRound size={20} />}
            color="sky"
          />
          <MetricCard
            label="Em análise"
            value={counts.pending}
            description="Aguardando liberação"
            icon={<Clock3 size={20} />}
            color="amber"
          />
          <MetricCard
            label="Ativos"
            value={counts.active}
            description="Alunos com acesso liberado"
            icon={<ShieldCheck size={20} />}
            color="emerald"
          />
          <MetricCard
            label="Bloqueados"
            value={counts.blocked}
            description="Acesso bloqueado"
            icon={<Lock size={20} />}
            color="red"
          />
        </div>

        {/* Tab bar + search */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition duration-150 ${
                  activeTab === tab.key
                    ? "border-orange-500/40 bg-orange-500/10 text-orange-400"
                    : "border-white/[0.07] bg-white/[0.03] text-white/50 hover:border-white/[0.12] hover:text-white/75"
                }`}
              >
                {tab.icon}
                {tab.label}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    activeTab === tab.key
                      ? "bg-orange-500/20 text-orange-400"
                      : "bg-white/[0.06] text-white/35"
                  }`}
                >
                  {counts[tab.key]}
                </span>
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="ml-auto">
            <div className="group relative w-72">
              <Search
                size={15}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 transition group-focus-within:text-orange-400"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, e-mail ou CPF..."
                className="h-10 w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] pl-9 pr-8 text-sm text-white/80 outline-none transition placeholder:text-white/25 focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/10"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Table card */}
        <div className="relative isolate rounded-[2rem] border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm">
          <div className="pointer-events-none absolute -inset-[1px] -z-10 rounded-[2rem] bg-gradient-to-b from-white/[0.03] to-transparent blur-[16px]" />

          {/* Card header */}
          <div className="border-b border-white/[0.06] px-7 py-5">
            <h2 className="text-base font-semibold text-white">Alunos cadastrados</h2>
            <p className="mt-0.5 text-xs text-white/40">
              Clique em um aluno para gerenciar o acesso e visualizar detalhes.
            </p>
          </div>

          {paginated.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center text-center px-8 py-12">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.05]">
                <UserRound size={26} className="text-white/30" />
              </div>
              <p className="text-base font-semibold text-white/60">
                {search
                  ? "Nenhum aluno encontrado para essa busca."
                  : "Nenhum aluno nesta categoria."}
              </p>
              {!search && (
                <p className="mt-1 text-sm text-white/30">
                  Crie o primeiro aluno para começar.
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.05]">
                    <SortableHeader label="Aluno" col="name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-7 py-3.5 text-left" />
                    <SortableHeader label="E-mail" col="email" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-4 py-3.5 text-left" />
                    <SortableHeader label="Status" col="status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-4 py-3.5 text-left" />
                    <SortableHeader label="Cadastro" col="created_at" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-4 py-3.5 text-left" />
                    <th className="px-7 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.1em] text-white/30">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((student) => (
                    <StudentTableRow key={student.id} student={student} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer / pagination */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.06] px-7 py-4">
            <p className="text-xs text-white/35">
              {filtered.length === 0
                ? "Nenhum aluno"
                : `Mostrando ${showingFrom} a ${showingTo} de ${filtered.length} aluno${filtered.length !== 1 ? "s" : ""}`}
            </p>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-white/40 transition hover:border-white/[0.14] hover:text-white/70 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronLeft size={15} />
              </button>

              <span className="flex h-8 min-w-[2rem] items-center justify-center rounded-xl bg-orange-500/15 px-3 text-xs font-bold text-orange-400">
                {currentPage}
              </span>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-white/40 transition hover:border-white/[0.14] hover:text-white/70 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronRight size={15} />
              </button>

              <div className="relative ml-2">
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="h-8 appearance-none rounded-xl border border-white/[0.08] bg-white/[0.04] pl-3 pr-8 text-xs font-semibold text-white/60 outline-none transition hover:border-white/[0.14] focus:border-orange-500/50 [color-scheme:dark]"
                >
                  <option value={10}>10 por página</option>
                  <option value={25}>25 por página</option>
                  <option value={50}>50 por página</option>
                </select>
                <ChevronDown
                  size={13}
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── sub-components ─────────────────────────────────────────

function SortableHeader({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (col: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === col;
  return (
    <th className={className}>
      <button
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] transition hover:text-white/60 ${active ? "text-orange-400" : "text-white/30"}`}
      >
        {label}
        {active ? (
          sortDir === "asc" ? <ChevronUp size={13} /> : <ChevronDown size={13} />
        ) : (
          <ChevronsUpDown size={13} className="opacity-40" />
        )}
      </button>
    </th>
  );
}

function MetricCard({
  label,
  value,
  description,
  icon,
  color,
}: {
  label: string;
  value: number;
  description: string;
  icon: React.ReactNode;
  color: "sky" | "amber" | "emerald" | "red";
}) {
  const cls = {
    sky: { text: "text-sky-400", bg: "bg-sky-500/15", ring: "ring-sky-500/20" },
    amber: { text: "text-amber-400", bg: "bg-amber-500/15", ring: "ring-amber-500/20" },
    emerald: { text: "text-emerald-400", bg: "bg-emerald-500/15", ring: "ring-emerald-500/20" },
    red: { text: "text-red-400", bg: "bg-red-500/15", ring: "ring-red-500/20" },
  }[color];

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.04] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-xs font-black uppercase tracking-[0.18em] ${cls.text}`}>{label}</p>
          <p className={`mt-2 text-4xl font-black ${cls.text}`}>{value}</p>
          <p className="mt-2 text-xs text-white/35">{description}</p>
        </div>
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${cls.bg} ring-1 ${cls.ring}`}
        >
          <span className={cls.text}>{icon}</span>
        </div>
      </div>
    </div>
  );
}

function StudentTableRow({ student }: { student: StudentRow }) {
  const initials = getInitials(student.name);
  const avatarColor = getAvatarColor(student.id);
  const statusCfg = STATUS_CFG[student.status] ?? STATUS_CFG.inactive;

  return (
    <tr className="border-b border-white/[0.04] transition duration-150 hover:bg-white/[0.03]">
      {/* Aluno */}
      <td className="px-7 py-4">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${avatarColor}`}
          >
            {initials}
          </div>
          <div>
            <p className="text-sm font-semibold text-white/90">
              {student.name || "Aluno sem nome"}
            </p>
            <p className="mt-0.5 text-xs text-white/35">
              CPF: {student.cpf ? formatCpf(student.cpf) : "—"}
            </p>
          </div>
        </div>
      </td>

      {/* E-mail */}
      <td className="px-4 py-4 text-sm text-white/60">{student.email || "—"}</td>

      {/* Status */}
      <td className="px-4 py-4">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${statusCfg.cls}`}
        >
          {student.status === "active" && (
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          )}
          {statusCfg.label}
        </span>
      </td>

      {/* Cadastro */}
      <td className="px-4 py-4">
        <p className="text-sm text-white/60">{formatAbsoluteDate(student.created_at)}</p>
        <p className="mt-0.5 text-xs text-white/35" suppressHydrationWarning>
          {formatRelativeDays(student.created_at)}
        </p>
      </td>

      {/* Ações */}
      <td className="px-7 py-4">
        <div className="flex items-center justify-end gap-2">
          <Link href={`/admin/alunos/${student.id}`}>
            <button className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/65 transition hover:border-white/[0.16] hover:bg-white/[0.08] hover:text-white active:scale-95">
              <ExternalLink size={13} />
              Abrir
            </button>
          </Link>
          <button className="flex h-7 w-7 items-center justify-center rounded-xl text-white/30 transition hover:bg-white/[0.06] hover:text-white/60">
            <MoreVertical size={15} />
          </button>
        </div>
      </td>
    </tr>
  );
}
