"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Ban,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  Eye,
  Loader2,
  MessageCircle,
  RotateCcw,
  Search,
  StickyNote,
  Trash2,
  UserRoundSearch,
} from "lucide-react";
import PremiumButton from "@/app/components/ui/PremiumButton";
import PremiumModal from "@/app/components/ui/PremiumModal";
import { adminFetch } from "@/app/lib/supabase/adminFetch";

type Attempt = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  phone_normalized: string | null;
  status: "open" | "contacted" | "ignored" | "completed";
  stage: "confirmation_sent" | "confirmation_confirmed" | "account_creation_failed" | "completed";
  source: "public_signup" | "event_signup" | null;
  first_started_at: string;
  last_activity_at: string;
  confirmation_requested_at: string | null;
  confirmation_confirmed_at: string | null;
  completed_at: string | null;
  ignored_at: string | null;
  attempt_count: number;
  confirmation_send_count: number;
  last_failure_code: string | null;
  last_failure_message: string | null;
  admin_contacted_at: string | null;
  admin_contacted_by: string | null;
  admin_notes: string | null;
  created_at: string;
};

type Metrics = { open: number; last24h: number; contacted: number; completed: number };

const STAGE_LABELS: Record<Attempt["stage"], string> = {
  confirmation_sent: "Código não confirmado",
  confirmation_confirmed: "Confirmado, aguardando conclusão",
  account_creation_failed: "Falha na conclusão",
  completed: "Concluído",
};

const STAGE_FAILURE_LABELS: Record<string, string> = {
  STUDENT_EMAIL_ALREADY_EXISTS: "Conflito cadastral (e-mail)",
  STUDENT_CPF_ALREADY_EXISTS: "Conflito cadastral (CPF)",
  STUDENT_EMAIL_USED_BY_ADMIN: "Conflito de identidade",
  STUDENT_AUTH_CREATION_FAILED: "Falha ao criar acesso",
  STUDENT_PROFILE_CREATION_FAILED: "Falha ao criar perfil",
  STUDENT_RECORD_CREATION_FAILED: "Falha ao criar cadastro",
  STUDENT_ACCOUNT_INCOMPLETE: "Conta incompleta encontrada",
  STUDENT_ACCOUNT_CONFLICT: "Dados vinculados a outra conta",
  INTERNAL_ERROR: "Falha de criação",
};

const STATUS_OPTIONS = [
  ["all", "Todos"],
  ["open", "Em aberto"],
  ["contacted", "Contatados"],
  ["completed", "Recuperados"],
  ["ignored", "Ignorados"],
] as const;

const STAGE_OPTIONS = [
  ["all", "Todas"],
  ["confirmation_sent", "Código não confirmado"],
  ["confirmation_confirmed", "Confirmado, aguardando conclusão"],
  ["account_creation_failed", "Falha na conclusão"],
  ["completed", "Concluído"],
] as const;

const PERIOD_OPTIONS = [
  ["all", "Todos"],
  ["today", "Hoje"],
  ["7d", "Últimos 7 dias"],
  ["30d", "Últimos 30 dias"],
] as const;

const PAGE_SIZE = 25;

export default function RegistrationAttemptsClient() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({ open: 0, last24h: 0, contacted: 0, completed: 0 });
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("open");
  const [stage, setStage] = useState("all");
  const [period, setPeriod] = useState("all");
  const [selected, setSelected] = useState<Attempt | null>(null);
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const debounceRef = useRef<number | null>(null);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  // Busca com debounce: `search` reflete o que o usuário digita a cada
  // tecla; `debouncedSearch` só muda 400ms depois de parar de digitar, e é
  // o único valor que efetivamente dispara uma nova busca no servidor.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [search]);

  const load = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(targetPage));
      params.set("pageSize", String(PAGE_SIZE));
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (status !== "all") params.set("status", status);
      if (stage !== "all") params.set("stage", stage);
      if (period !== "all") params.set("period", period);

      const response = await adminFetch(`/api/admin/registration-attempts?${params.toString()}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Não foi possível carregar as tentativas de cadastro.");

      setAttempts(result.data || []);
      setCount(result.count || 0);
      if (result.metrics) setMetrics(result.metrics);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar as tentativas de cadastro.");
      setAttempts([]);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, status, stage, period]);

  useEffect(() => {
    void load(page);
  }, [page, load]);

  // Qualquer filtro (exceto paginação) volta a página para 1.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, stage, period]);

  const applyPatch = useCallback(async (id: string, action: string, note?: string) => {
    try {
      const response = await adminFetch(`/api/admin/registration-attempts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Não foi possível atualizar a tentativa.");
      setToast({ tone: "success", message: result.message || "Tentativa atualizada." });
      setSelected((current) => (current && current.id === id ? (result.data as Attempt) : current));
      await load(page);
    } catch (err) {
      setToast({ tone: "error", message: err instanceof Error ? err.message : "Não foi possível atualizar a tentativa." });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const [deleteTarget, setDeleteTarget] = useState<Attempt | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await adminFetch(`/api/admin/registration-attempts/${deleteTarget.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Não foi possível excluir.");
      setToast({ tone: "success", message: "Registro de acompanhamento excluído." });
      setDeleteTarget(null);
      setSelected(null);
      await load(page);
    } catch (err) {
      setToast({ tone: "error", message: err instanceof Error ? err.message : "Não foi possível excluir." });
    } finally {
      setDeleting(false);
    }
  }

  async function copyToClipboard(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setToast({ tone: "success", message: `${label} copiado.` });
    } catch {
      setToast({ tone: "error", message: `Não foi possível copiar ${label.toLowerCase()}.` });
    }
  }

  return (
    <main className="et-admin-dark-page px-4 pb-20 pt-6 md:px-8 md:pt-10">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[-10%] top-[-10%] h-96 w-96 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="absolute right-[-10%] top-[20%] h-[28rem] w-[28rem] rounded-full bg-blue-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-[1500px]">
        <section className="et-admin-dark-hero min-h-[150px] px-6 py-8 sm:px-8 lg:px-10">
          <div className="relative flex min-h-[90px] flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div>
              <p className="et-admin-dark-label text-orange-400">Tentativas de cadastro</p>
              <h1 className="et-admin-dark-page-title mt-3">Cadastros que ficaram pelo caminho</h1>
              <p className="et-admin-dark-text mt-4 max-w-2xl">Acompanhe pessoas que iniciaram o cadastro, mas ainda não concluíram a criação da conta.</p>
            </div>
            <div className="et-admin-dark-icon-box et-admin-dark-icon-box-orange shrink-0">
              <UserRoundSearch size={26} />
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={<UserRoundSearch />} label="Em aberto" value={metrics.open} tone="orange" />
          <MetricCard icon={<Clock3 />} label="Últimas 24h" value={metrics.last24h} tone="blue" />
          <MetricCard icon={<MessageCircle />} label="Contatados" value={metrics.contacted} tone="amber" />
          <MetricCard icon={<CheckCircle2 />} label="Recuperados" value={metrics.completed} tone="green" />
        </section>

        <section className="relative z-20 mt-5 rounded-[1.75rem] border border-white/[0.07] bg-white/[0.035] p-5 shadow-xl shadow-black/20 backdrop-blur-sm">
          <div className="mb-4">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-orange-300">Filtros</p>
            <p className="mt-1 text-xs text-slate-500">Busque por nome, e-mail ou telefone, e refine por situação, etapa ou período.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="block">
              <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Busca</span>
              <span className="flex h-12 items-center gap-2 rounded-2xl border border-white/[0.08] bg-[#0D1926] px-4 text-sm font-semibold text-white/80 focus-within:border-orange-400/40 focus-within:ring-2 focus-within:ring-orange-400/[0.08]">
                <Search size={15} className="text-slate-500" />
                <input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-600" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, e-mail ou telefone" />
              </span>
            </label>
            <FilterSelect label="Situação" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
            <FilterSelect label="Etapa" value={stage} onChange={setStage} options={STAGE_OPTIONS} />
            <FilterSelect label="Período" value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />
          </div>
        </section>

        <section className="mt-5 overflow-hidden rounded-[1.75rem] border border-white/[0.07] bg-[#091321]/90 shadow-2xl shadow-black/30 backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
            <div>
              <p className="text-sm font-black text-white">Tentativas</p>
              <p className="text-xs text-slate-500">{count} {count === 1 ? "tentativa encontrada" : "tentativas encontradas"}.</p>
            </div>
          </div>

          {error ? (
            <div className="m-5 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
              {error}
              <button type="button" onClick={() => load(page)} className="ml-3 font-bold underline underline-offset-2">Tentar novamente</button>
            </div>
          ) : loading ? (
            <div className="flex min-h-[280px] items-center justify-center text-sm text-slate-400">
              <Loader2 className="mr-2 animate-spin" size={18} /> Carregando tentativas de cadastro...
            </div>
          ) : attempts.length === 0 ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center text-center text-slate-500">
              <CheckCircle2 className="mb-3 text-slate-600" size={36} />
              <p className="text-base font-bold text-white">Nenhum cadastro incompleto</p>
              <p className="mt-2 max-w-md text-sm text-slate-500">No momento, não existem tentativas de cadastro aguardando acompanhamento.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.055]">
              {attempts.map((attempt) => (
                <AttemptRow key={attempt.id} attempt={attempt} onOpen={() => setSelected(attempt)} />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-4">
              <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs font-bold text-slate-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40">Anterior</button>
              <span className="text-xs font-bold text-slate-400">{page} / {totalPages}</span>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs font-bold text-slate-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40">Próxima</button>
            </div>
          )}
        </section>
      </div>

      {selected && (
        <AttemptDetailModal
          attempt={selected}
          onClose={() => setSelected(null)}
          onContact={(note) => applyPatch(selected.id, "contact", note)}
          onIgnore={() => applyPatch(selected.id, "ignore")}
          onReopen={() => applyPatch(selected.id, "reopen")}
          onSaveNote={(note) => applyPatch(selected.id, "note", note)}
          onDelete={() => setDeleteTarget(selected)}
          onCopy={copyToClipboard}
        />
      )}

      {deleteTarget && (
        <PremiumModal
          open
          theme="dark"
          tone="warning"
          title="Excluir registro de acompanhamento?"
          message={`Isso remove apenas o acompanhamento de "${deleteTarget.full_name}" nesta central. Nenhum dado de conta, aluno ou histórico de e-mail é apagado.`}
          onClose={() => (!deleting ? setDeleteTarget(null) : undefined)}
          dismissible={!deleting}
          actions={
            <>
              <PremiumButton variant="dark" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancelar</PremiumButton>
              <PremiumButton variant="dark-danger" icon={deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} onClick={confirmDelete} disabled={deleting}>
                {deleting ? "Excluindo..." : "Excluir registro"}
              </PremiumButton>
            </>
          }
        />
      )}

      {toast && (
        <PremiumModal
          open
          theme="dark"
          tone={toast.tone}
          title={toast.tone === "success" ? "Tudo certo" : "Não foi possível continuar"}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}
    </main>
  );
}

function MetricCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "orange" | "blue" | "amber" | "green" }) {
  const toneClass = {
    orange: "from-orange-500/20 text-orange-200 border-orange-400/20",
    blue: "from-blue-500/20 text-blue-200 border-blue-400/20",
    amber: "from-amber-500/20 text-amber-200 border-amber-400/20",
    green: "from-emerald-500/20 text-emerald-200 border-emerald-400/20",
  }[tone];

  return (
    <div className={`rounded-[1.75rem] border bg-gradient-to-br ${toneClass} via-white/[0.025] to-white/[0.03] p-5 shadow-xl shadow-black/20 backdrop-blur-sm`}>
      <div className="flex items-center justify-between">
        <div className="rounded-2xl bg-white/[0.06] p-3">{icon}</div>
      </div>
      <p className="mt-5 text-3xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
    </div>
  );
}

function FilterSelect<T extends readonly (readonly [string, string])[]>({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: T }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">{label}</span>
      <select className="h-12 w-full rounded-2xl border border-white/[0.08] bg-[#0D1926] px-4 text-sm font-semibold text-white/80 outline-none focus:border-orange-400/40 focus:ring-2 focus:ring-orange-400/[0.08]" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}

function StatusBadge({ status }: { status: Attempt["status"] }) {
  const config = {
    open: { className: "et-admin-dark-badge-info", label: "Em aberto" },
    contacted: { className: "et-admin-dark-badge-warning", label: "Contatado" },
    completed: { className: "et-admin-dark-badge-success", label: "Recuperado" },
    ignored: { className: "et-admin-dark-badge-neutral", label: "Ignorado" },
  }[status];
  return <span className={`et-admin-dark-badge ${config.className}`}>{config.label}</span>;
}

function relativeTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "agora mesmo";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days} dia${days === 1 ? "" : "s"}`;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

function stageLabel(attempt: Attempt) {
  if (attempt.stage === "account_creation_failed" && attempt.last_failure_code) {
    return STAGE_FAILURE_LABELS[attempt.last_failure_code] || STAGE_LABELS.account_creation_failed;
  }
  return STAGE_LABELS[attempt.stage];
}

function AttemptRow({ attempt, onOpen }: { attempt: Attempt; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="group grid w-full gap-3 px-5 py-4 text-left transition hover:bg-white/[0.035] md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.1fr)_minmax(0,1fr)_140px_150px_110px_40px] md:items-center">
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-white">{attempt.full_name}</p>
        <p className="truncate text-xs text-slate-500">{attempt.email}{attempt.phone ? ` · ${attempt.phone}` : ""}</p>
      </div>
      <p className="truncate text-xs font-semibold text-slate-400">{stageLabel(attempt)}</p>
      <p className="truncate text-xs text-slate-500">Início: {formatDate(attempt.first_started_at)}</p>
      <p className="text-xs font-semibold text-slate-400">{relativeTime(attempt.last_activity_at)}</p>
      <p className="text-xs text-slate-500">{attempt.attempt_count} tentativa(s) · {attempt.confirmation_send_count} código(s)</p>
      <StatusBadge status={attempt.status} />
      <span className="hidden justify-self-end rounded-xl border border-white/[0.08] bg-white/[0.04] p-2 text-slate-400 transition group-hover:text-orange-200 md:inline-flex">
        <Eye size={16} />
      </span>
    </button>
  );
}

function buildWhatsAppUrl(phoneNormalized: string | null) {
  if (!phoneNormalized) return null;
  const digits = phoneNormalized.replace(/\D/g, "");
  if (!digits) return null;
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}`;
}

function AttemptDetailModal({
  attempt,
  onClose,
  onContact,
  onIgnore,
  onReopen,
  onSaveNote,
  onDelete,
  onCopy,
}: {
  attempt: Attempt;
  onClose: () => void;
  onContact: (note?: string) => void;
  onIgnore: () => void;
  onReopen: () => void;
  onSaveNote: (note: string) => void;
  onDelete: () => void;
  onCopy: (value: string, label: string) => void;
}) {
  const [note, setNote] = useState(attempt.admin_notes || "");
  const whatsappUrl = useMemo(() => buildWhatsAppUrl(attempt.phone_normalized), [attempt.phone_normalized]);
  const isCompleted = attempt.status === "completed";

  const timeline = [
    { label: "Cadastro iniciado", at: attempt.first_started_at },
    { label: "Código de confirmação enviado", at: attempt.confirmation_requested_at },
    { label: "Código confirmado", at: attempt.confirmation_confirmed_at },
    attempt.stage === "account_creation_failed" ? { label: "Falha na conclusão da conta", at: attempt.last_activity_at } : null,
    { label: "Cadastro concluído", at: attempt.completed_at },
    { label: "Marcado como ignorado", at: attempt.ignored_at },
  ].filter((item): item is { label: string; at: string } => Boolean(item?.at))
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return (
    <PremiumModal
      open
      theme="dark"
      tone="info"
      size="wide"
      title={attempt.full_name}
      onClose={onClose}
      actions={
        <>
          {!isCompleted && attempt.status !== "ignored" && (
            <PremiumButton variant="dark" icon={<Ban size={16} />} onClick={onIgnore}>Ignorar</PremiumButton>
          )}
          {!isCompleted && attempt.status === "ignored" && (
            <PremiumButton variant="dark" icon={<RotateCcw size={16} />} onClick={onReopen}>Reabrir</PremiumButton>
          )}
          {!isCompleted && (
            <PremiumButton variant="dark-primary" icon={<MessageCircle size={16} />} onClick={() => onContact(note)}>Marcar como contatado</PremiumButton>
          )}
          <PremiumButton variant="dark-danger" icon={<Trash2 size={16} />} onClick={onDelete}>Excluir</PremiumButton>
        </>
      }
    >
      <div className="space-y-5 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={attempt.status} />
          <span className="et-admin-dark-badge et-admin-dark-badge-neutral">{stageLabel(attempt)}</span>
          {attempt.source === "event_signup" && <span className="et-admin-dark-badge et-admin-dark-badge-info">Evento</span>}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <DetailItem label="E-mail" value={attempt.email} action={<IconButton icon={<Copy size={14} />} label="Copiar e-mail" onClick={() => onCopy(attempt.email, "E-mail")} />} />
          <DetailItem
            label="Telefone"
            value={attempt.phone || "—"}
            action={attempt.phone ? (
              <div className="flex gap-1">
                <IconButton icon={<Copy size={14} />} label="Copiar telefone" onClick={() => onCopy(attempt.phone as string, "Telefone")} />
                {whatsappUrl && (
                  <a href={whatsappUrl} target="_blank" rel="noreferrer" className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-slate-400 transition hover:border-emerald-400/40 hover:text-emerald-300" aria-label="Abrir WhatsApp">
                    <MessageCircle size={14} />
                  </a>
                )}
              </div>
            ) : undefined}
          />
          <DetailItem label="Primeiro início" value={formatDate(attempt.first_started_at)} />
          <DetailItem label="Última atividade" value={`${formatDate(attempt.last_activity_at)} (${relativeTime(attempt.last_activity_at)})`} />
          <DetailItem label="Tentativas" value={`${attempt.attempt_count} tentativa(s)`} />
          <DetailItem label="Códigos enviados" value={`${attempt.confirmation_send_count} código(s)`} />
          {attempt.stage === "account_creation_failed" && (
            <DetailItem label="Motivo da falha" value={STAGE_FAILURE_LABELS[attempt.last_failure_code || ""] || attempt.last_failure_message || "Não foi possível concluir a criação da conta."} />
          )}
          {attempt.admin_contacted_at && (
            <DetailItem label="Contatado em" value={formatDate(attempt.admin_contacted_at)} />
          )}
        </div>

        {timeline.length > 0 && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <p className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Linha do tempo</p>
            <div className="space-y-2">
              {timeline.map((item, index) => (
                <div key={`${item.label}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2">
                  <p className="text-sm font-semibold text-slate-200">{item.label}</p>
                  <span className="shrink-0 text-xs font-semibold text-slate-500">{formatDate(item.at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Observação administrativa</p>
            <StickyNote size={14} className="text-slate-500" />
          </div>
          <textarea
            className="w-full rounded-xl border border-white/[0.08] bg-[#0D1926] p-3 text-sm text-white/80 outline-none focus:border-orange-400/40"
            rows={3}
            maxLength={2000}
            placeholder="Ex.: Enviei mensagem pelo WhatsApp em 09/09."
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="mt-2 flex justify-end">
            <PremiumButton variant="dark" icon={<Check size={14} />} onClick={() => onSaveNote(note)} disabled={note.trim() === (attempt.admin_notes || "").trim()}>
              Salvar observação
            </PremiumButton>
          </div>
        </div>
      </div>
    </PremiumModal>
  );
}

function DetailItem({ label, value, action }: { label: string; value: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4">
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
        <p className="mt-2 break-words text-sm font-semibold text-slate-200">{value}</p>
      </div>
      {action}
    </div>
  );
}

function IconButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-slate-400 transition hover:border-orange-400/40 hover:text-orange-200">
      {icon}
    </button>
  );
}
