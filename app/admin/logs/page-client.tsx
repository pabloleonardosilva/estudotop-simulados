"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bug,
  CalendarDays,
  Clock3,
  DatabaseZap,
  Eye,
  Filter,
  Gauge,
  MonitorDot,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";

type TabKey = "realtime" | "activity" | "security" | "errors" | "sessions";

type LogRecord = Record<string, any>;

type ApiResponse = {
  ok: boolean;
  data?: LogRecord[];
  count?: number;
  page?: number;
  pageSize?: number;
  message?: string;
};

const TAB_ENDPOINTS: Record<TabKey, string> = {
  realtime: "/api/admin/logs/activity",
  activity: "/api/admin/logs/activity",
  security: "/api/admin/logs/security",
  errors: "/api/admin/logs/errors",
  sessions: "/api/admin/logs/sessions",
};

const TAB_LABELS: Record<TabKey, string> = {
  realtime: "Tempo real",
  activity: "Atividades",
  security: "Segurança",
  errors: "Falhas",
  sessions: "Sessões",
};

const today = new Date().toISOString().slice(0, 10);

export default function LogsClient() {
  const [activeTab, setActiveTab] = useState<TabKey>("realtime");
  const [records, setRecords] = useState<LogRecord[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<LogRecord | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filters, setFilters] = useState({
    startDate: today,
    endDate: today,
    actorType: "all",
    severity: "all",
    action: "all",
    route: "",
    search: "",
  });

  const metrics = useMemo(() => {
    const securityAlerts = records.filter((item) => ["high", "critical"].includes(String(item.risk_level || item.severity))).length;
    const criticalErrors = records.filter((item) => String(item.severity) === "critical").length;
    const activeSessions = records.filter((item) => item.is_active === true).length;

    return {
      eventsToday: count || records.length,
      activeSessions,
      securityAlerts,
      criticalErrors,
    };
  }, [count, records]);

  async function loadLogs(tab: TabKey = activeTab) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("pageSize", tab === "realtime" ? "50" : "30");
      if (filters.startDate) params.set("startDate", filters.startDate);
      if (filters.endDate) params.set("endDate", filters.endDate);
      if (filters.actorType !== "all") params.set("actorType", filters.actorType);
      if (filters.severity !== "all") params.set("severity", filters.severity);
      if (filters.action !== "all") params.set("action", filters.action);
      if (filters.route.trim()) params.set("route", filters.route.trim());
      if (filters.search.trim()) params.set("search", filters.search.trim());

      const response = await fetch(`${TAB_ENDPOINTS[tab]}?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok) throw new Error(payload.message || "Falha ao carregar logs.");
      setRecords(payload.data || []);
      setCount(payload.count || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar logs.");
      setRecords([]);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLogs(activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    if (!autoRefresh || activeTab !== "realtime") return;
    const interval = window.setInterval(() => {
      void loadLogs("realtime");
    }, 8000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, autoRefresh, filters]);

  function updateFilter(key: keyof typeof filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function clearFilters() {
    setFilters({ startDate: today, endDate: today, actorType: "all", severity: "all", action: "all", route: "", search: "" });
  }

  return (
    <main className="min-h-screen bg-[#07111F] px-4 pb-20 pt-6 text-white md:px-8 md:pt-10">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[-10%] top-[-10%] h-96 w-96 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="absolute right-[-10%] top-[20%] h-[28rem] w-[28rem] rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:48px_48px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-[1500px]">
        <section className="overflow-hidden rounded-[2rem] border border-white/[0.08] bg-white/[0.035] shadow-2xl shadow-black/30 backdrop-blur-xl">
          <div className="relative p-6 md:p-8">
            <div className="absolute right-8 top-8 hidden rounded-full border border-orange-300/20 bg-orange-500/10 p-5 text-orange-200 shadow-2xl shadow-orange-500/20 md:block">
              <ShieldCheck size={42} />
            </div>
            <p className="inline-flex items-center gap-2 rounded-full border border-orange-400/20 bg-orange-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-orange-200">
              <Sparkles size={13} /> Auditoria premium
            </p>
            <h1 className="mt-5 max-w-3xl text-2xl font-semibold tracking-tight text-white md:text-3xl">
              Logs do Sistema, Segurança e Auditoria
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              Monitore acessos, ações administrativas, tentativas suspeitas, sessões ativas e falhas técnicas em uma central única de observabilidade.
            </p>
          </div>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={<Activity />} label="Eventos no filtro" value={metrics.eventsToday} tone="orange" />
          <MetricCard icon={<MonitorDot />} label="Sessões ativas" value={metrics.activeSessions} tone="blue" />
          <MetricCard icon={<ShieldAlert />} label="Alertas altos" value={metrics.securityAlerts} tone="amber" />
          <MetricCard icon={<Bug />} label="Erros críticos" value={metrics.criticalErrors} tone="red" />
        </section>

        <section className="relative z-20 mt-5 rounded-[1.75rem] border border-white/[0.07] bg-white/[0.035] p-5 shadow-xl shadow-black/20 backdrop-blur-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-orange-300">Filtros</p>
              <p className="mt-1 text-xs text-slate-500">Escolha período, ator, gravidade, rota ou termo livre.</p>
            </div>
            <div className="flex items-center gap-2">
              {activeTab === "realtime" && (
                <button
                  type="button"
                  onClick={() => setAutoRefresh((current) => !current)}
                  className={`rounded-2xl border px-4 py-2 text-xs font-bold transition ${autoRefresh ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-white/[0.08] bg-white/[0.04] text-slate-400"}`}
                >
                  {autoRefresh ? "Ao vivo ligado" : "Ao vivo pausado"}
                </button>
              )}
              <button type="button" onClick={() => loadLogs(activeTab)} className="inline-flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs font-bold text-slate-200 transition hover:border-orange-400/30 hover:text-orange-200">
                <RefreshCw size={14} /> Atualizar
              </button>
              <button type="button" onClick={clearFilters} className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs font-bold text-slate-400 transition hover:text-white">
                Limpar
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <FilterInput icon={<CalendarDays size={15} />} label="Data inicial" type="date" value={filters.startDate} onChange={(value) => updateFilter("startDate", value)} />
            <FilterInput icon={<CalendarDays size={15} />} label="Data final" type="date" value={filters.endDate} onChange={(value) => updateFilter("endDate", value)} />
            <FilterSelect label="Ator" value={filters.actorType} onChange={(value) => updateFilter("actorType", value)} options={[ ["all", "Todos"], ["admin", "Admin"], ["student", "Aluno"], ["system", "Sistema"] ]} />
            <FilterSelect label={activeTab === "security" ? "Risco" : activeTab === "sessions" ? "Status" : "Gravidade"} value={filters.severity} onChange={(value) => updateFilter("severity", value)} options={severityOptions(activeTab)} />
            <FilterInput icon={<Search size={15} />} label="Busca" value={filters.search} onChange={(value) => updateFilter("search", value)} placeholder="Nome, e-mail, ação ou erro" />
            <FilterInput icon={<Filter size={15} />} label="Rota" value={filters.route} onChange={(value) => updateFilter("route", value)} placeholder="/admin/alunos" />
            <FilterInput icon={<Gauge size={15} />} label="Ação/evento" value={filters.action === "all" ? "" : filters.action} onChange={(value) => updateFilter("action", value || "all")} placeholder="login_success" />
            <button type="button" onClick={() => loadLogs(activeTab)} className="mt-6 h-12 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 px-4 text-sm font-black text-slate-950 shadow-lg shadow-orange-500/20 transition hover:scale-[1.01]">
              Aplicar filtros
            </button>
          </div>
        </section>

        <section className="mt-5 rounded-[1.75rem] border border-white/[0.07] bg-white/[0.03] p-2 shadow-xl shadow-black/20 backdrop-blur-sm">
          <div className="grid gap-2 md:grid-cols-5">
            {(Object.keys(TAB_LABELS) as TabKey[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-2xl px-4 py-3 text-sm font-black transition ${activeTab === tab ? "bg-gradient-to-r from-orange-500 to-amber-400 text-slate-950 shadow-lg shadow-orange-500/20" : "text-slate-400 hover:bg-white/[0.05] hover:text-white"}`}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-5 overflow-hidden rounded-[1.75rem] border border-white/[0.07] bg-[#091321]/90 shadow-2xl shadow-black/30 backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
            <div>
              <p className="text-sm font-black text-white">{TAB_LABELS[activeTab]}</p>
              <p className="text-xs text-slate-500">{count} registros encontrados.</p>
            </div>
            <DatabaseZap className="text-orange-300" />
          </div>

          {error ? (
            <div className="m-5 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>
          ) : loading ? (
            <div className="flex min-h-[300px] items-center justify-center text-sm text-slate-400">Carregando logs...</div>
          ) : records.length === 0 ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center text-center text-slate-500">
              <ShieldCheck className="mb-3 text-slate-600" size={36} />
              Nenhum registro encontrado para os filtros selecionados.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.055]">
              {records.map((record) => (
                <LogRow key={record.id} record={record} tab={activeTab} onOpen={() => setSelectedRecord(record)} />
              ))}
            </div>
          )}
        </section>
      </div>

      {selectedRecord && <DetailsDrawer record={selectedRecord} tab={activeTab} onClose={() => setSelectedRecord(null)} />}
    </main>
  );
}

function severityOptions(tab: TabKey): [string, string][] {
  if (tab === "security") return [["all", "Todos"], ["low", "Baixo"], ["medium", "Médio"], ["high", "Alto"], ["critical", "Crítico"]];
  if (tab === "sessions") return [["all", "Todas"], ["active", "Ativas"], ["inactive", "Encerradas"]];
  return [["all", "Todos"], ["info", "Info"], ["warning", "Aviso"], ["error", "Erro"], ["critical", "Crítico"]];
}

function MetricCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "orange" | "blue" | "amber" | "red" }) {
  const toneClass = {
    orange: "from-orange-500/20 text-orange-200 border-orange-400/20",
    blue: "from-blue-500/20 text-blue-200 border-blue-400/20",
    amber: "from-amber-500/20 text-amber-200 border-amber-400/20",
    red: "from-red-500/20 text-red-200 border-red-400/20",
  }[tone];

  return (
    <div className={`rounded-[1.75rem] border bg-gradient-to-br ${toneClass} via-white/[0.025] to-white/[0.03] p-5 shadow-xl shadow-black/20 backdrop-blur-sm`}>
      <div className="flex items-center justify-between">
        <div className="rounded-2xl bg-white/[0.06] p-3">{icon}</div>
        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white/35">Hoje</span>
      </div>
      <p className="mt-5 text-3xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
    </div>
  );
}

function FilterInput({ label, value, onChange, type = "text", placeholder, icon }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; icon?: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">{label}</span>
      <span className="flex h-12 items-center gap-2 rounded-2xl border border-white/[0.08] bg-[#0D1926] px-4 text-sm font-semibold text-white/80 focus-within:border-orange-400/40 focus-within:ring-2 focus-within:ring-orange-400/[0.08]">
        {icon && <span className="text-slate-500">{icon}</span>}
        <input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-600" type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      </span>
    </label>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">{label}</span>
      <select className="h-12 w-full rounded-2xl border border-white/[0.08] bg-[#0D1926] px-4 text-sm font-semibold text-white/80 outline-none focus:border-orange-400/40 focus:ring-2 focus:ring-orange-400/[0.08]" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}

function humanizeSource(value: string) {
  return value
    .split(/[._]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" › ");
}

const SECURITY_EVENT_INFO: Record<string, { label: string; description: string }> = {
  login_success: { label: "Login bem-sucedido", description: "Um usuário autenticou com e-mail e senha corretos." },
  login_failed: { label: "Falha no login", description: "Alguém tentou entrar com e-mail ou senha incorretos." },
  login_denied_inactive: { label: "Login negado (conta inativa)", description: "Uma conta desativada/bloqueada tentou fazer login." },
  logout: { label: "Logout", description: "Um usuário encerrou a sessão manualmente." },
  session_touch: { label: "Sessão ativa", description: "Atualização de atividade de uma sessão já autenticada." },
  unauthorized_access: { label: "Acesso sem login", description: "Uma requisição tentou usar um recurso protegido sem estar autenticada." },
  forbidden_access: { label: "Acesso negado por permissão", description: "Um usuário autenticado tentou acessar algo que seu perfil não permite." },
  invalid_session: { label: "Sessão inválida", description: "O token de sessão apresentado estava expirado, corrompido ou já não existia mais." },
  suspicious_request: { label: "Requisição suspeita", description: "O sistema recebeu uma requisição fora do padrão esperado, que não se encaixa nas outras categorias." },
};

function securityEventInfo(eventType?: string) {
  if (eventType && SECURITY_EVENT_INFO[eventType]) return SECURITY_EVENT_INFO[eventType];
  return { label: eventType ? humanizeSource(eventType) : "Evento", description: "Evento de segurança sem descrição cadastrada." };
}

function LogRow({ record, tab, onOpen }: { record: LogRecord; tab: TabKey; onOpen: () => void }) {
  const title = tab === "errors" && record.source
    ? humanizeSource(String(record.source))
    : tab === "security"
      ? securityEventInfo(record.event_type).label
      : record.action || record.event_type || record.source || record.last_route || "Evento";
  const subtitle = tab === "errors"
    ? record.error_message || record.message || "Nenhuma mensagem técnica foi registrada para esta falha."
    : tab === "security"
      ? record.reason || securityEventInfo(record.event_type).description
      : record.actor_name || record.actor_email || record.reason || record.route || "Sistema";
  const severity = record.risk_level || record.severity || (record.is_active ? "active" : "info");
  const date = record.created_at || record.last_seen_at || record.started_at;

  return (
    <button type="button" onClick={onOpen} className="group grid w-full gap-4 px-5 py-4 text-left transition hover:bg-white/[0.035] md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_180px_110px_44px] md:items-center">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-orange-200">
            {tab === "security" ? <ShieldAlert size={17} /> : tab === "errors" ? <Bug size={17} /> : tab === "sessions" ? <Clock3 size={17} /> : <Activity size={17} />}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-white">{title}</p>
            <p className="truncate text-xs text-slate-500">{subtitle}</p>
          </div>
        </div>
      </div>
      <p className="truncate text-xs font-semibold text-slate-400">{record.route || record.request_path || record.last_route || record.entity_type || record.error_code || "—"}</p>
      <p className="text-xs font-semibold text-slate-500">{formatDate(date)}</p>
      <SeverityBadge value={severity} />
      <span className="hidden justify-self-end rounded-xl border border-white/[0.08] bg-white/[0.04] p-2 text-slate-400 transition group-hover:text-orange-200 md:inline-flex">
        <Eye size={16} />
      </span>
    </button>
  );
}

function SeverityBadge({ value }: { value: string }) {
  const normalized = String(value || "info");
  const classes = normalized === "critical" || normalized === "high"
    ? "border-red-400/30 bg-red-500/10 text-red-200"
    : normalized === "error" || normalized === "medium" || normalized === "warning"
      ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
      : normalized === "active"
        ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
        : "border-white/[0.08] bg-white/[0.04] text-slate-300";
  return <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${classes}`}>{normalized}</span>;
}

function humanizeDuration(seconds?: number | null) {
  if (seconds === null || seconds === undefined) return "—";
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}h ${minutes}min`;
  if (minutes > 0) return `${minutes}min ${secs}s`;
  return `${secs}s`;
}

function SessionTimeline({ record }: { record: LogRecord }) {
  const [items, setItems] = useState<LogRecord[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!record.actor_id) {
        setItems([]);
        return;
      }
      try {
        const params = new URLSearchParams({ actorId: record.actor_id, pageSize: "100" });
        const response = await fetch(`/api/admin/logs/activity?${params.toString()}`, { cache: "no-store" });
        const payload = (await response.json()) as ApiResponse;
        if (!payload.ok) throw new Error(payload.message || "Falha ao carregar atividades da sessão.");
        if (cancelled) return;
        const windowStart = record.started_at ? new Date(record.started_at).getTime() : null;
        const windowEnd = new Date(record.ended_at || record.last_seen_at || Date.now()).getTime();
        const filtered = (payload.data || [])
          .filter((item) => {
            const timestamp = new Date(item.created_at).getTime();
            return (windowStart === null || timestamp >= windowStart) && timestamp <= windowEnd;
          })
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        setItems(filtered);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Falha ao carregar atividades da sessão.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [record.actor_id, record.started_at, record.ended_at, record.last_seen_at]);

  return (
    <div className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
      <p className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">O que o usuário fez nessa sessão</p>
      {error ? (
        <p className="text-sm text-red-300">{error}</p>
      ) : items === null ? (
        <p className="text-sm text-slate-500">Carregando atividades...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma atividade registrada (ações como abrir simulados, concluir tentativas etc.) foi encontrada dentro do período dessa sessão.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-100">{humanizeSource(String(item.action || "Evento"))}</p>
                <p className="truncate text-xs text-slate-500">
                  {[item.entity_type, item.route].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <span className="shrink-0 text-xs font-semibold text-slate-500">{formatDate(item.created_at)}</span>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-[11px] leading-5 text-slate-600">
        Mostra apenas ações registradas em Atividades (ex.: login, tentativas de simulado, ações de Jornada). A navegação entre páginas que não gera uma ação específica não fica listada aqui — apenas a última área acessada aparece acima, em &ldquo;Área atual/mais recente&rdquo;.
      </p>
    </div>
  );
}

function DetailsDrawer({ record, tab, onClose }: { record: LogRecord; tab: TabKey; onClose: () => void }) {
  const isError = tab === "errors";
  const isSecurity = tab === "security";
  const isSessions = tab === "sessions";
  const safeDetails = record.safe_details && typeof record.safe_details === "object"
    ? record.safe_details
    : record.metadata && typeof record.metadata === "object"
      ? record.metadata
      : null;
  const detailEntries = safeDetails ? Object.entries(safeDetails).filter(([, value]) => value !== undefined) : [];
  const isFlatDetails = detailEntries.every(([, value]) => value === null || typeof value !== "object");
  const eventInfo = isSecurity ? securityEventInfo(record.event_type) : null;

  return (
    <div className="fixed inset-0 z-[200] flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <aside className="h-full w-full max-w-2xl overflow-y-auto border-l border-white/[0.08] bg-[#08111F] p-6 text-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-orange-300">{isError ? "Detalhes da falha" : isSecurity ? "Detalhes do evento de segurança" : "Detalhes do evento"}</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">
              {isError && record.source
                ? humanizeSource(String(record.source))
                : isSecurity
                  ? eventInfo!.label
                  : record.action || record.event_type || record.source || "Registro"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{formatDate(record.created_at || record.last_seen_at || record.started_at)}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3 text-slate-400 transition hover:text-white">
            <X size={18} />
          </button>
        </div>

        {isError && (
          <div className="mt-6 rounded-2xl border border-red-400/20 bg-red-500/[0.06] p-4">
            <p className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-red-300">O que aconteceu</p>
            <p className="text-sm leading-6 text-slate-200">
              {record.error_message || record.message || "Nenhuma mensagem técnica foi registrada para esta falha."}
            </p>
            <p className="mt-3 border-t border-red-400/10 pt-3 text-xs leading-6 text-red-200/80">
              {record.severity === "warning"
                ? "Gravidade \"warning\": o sistema registrou o problema, mas a operação pode ter continuado normalmente."
                : `Gravidade "${record.severity || "error"}": a operação em "${record.source ? humanizeSource(String(record.source)) : "um ponto do sistema"}" não foi concluída como esperado nesse momento — foi interrompida pelo erro acima.`}
            </p>
          </div>
        )}

        {isSecurity && (
          <div className="mt-6 rounded-2xl border border-orange-400/20 bg-orange-500/[0.06] p-4">
            <p className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-orange-300">O que aconteceu</p>
            <p className="text-sm leading-6 text-slate-200">{eventInfo!.description}</p>
            {record.reason && <p className="mt-2 text-sm leading-6 text-slate-400">Detalhe registrado: {record.reason}</p>}
          </div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {isError ? (
            <>
              <DetailItem label="Origem" value={record.source ? humanizeSource(String(record.source)) : "—"} />
              <DetailItem label="Código do erro" value={record.error_code || "—"} />
              <DetailItem label="Rota" value={record.route || record.request_path || "—"} />
              <DetailItem label="Método" value={record.method || record.request_method || "—"} />
              <DetailItem label="Ator" value={record.actor_type || "Sistema"} />
              <DetailItem label="Gravidade" value={record.severity || "—"} />
              <DetailItem label="Status" value={record.resolved_at ? `Resolvido em ${formatDate(record.resolved_at)}` : "Em aberto"} />
            </>
          ) : isSecurity ? (
            <>
              <DetailItem label="Quem" value={record.actor_email || record.actor_type || "Sistema"} />
              <DetailItem label="Rota" value={record.route || "—"} />
              <DetailItem label="Método" value={record.method || "—"} />
              <DetailItem label="IP" value={record.ip_address || "—"} />
              <DetailItem label="Nível de risco" value={record.risk_level || "—"} />
              <DetailItem label="Bloqueado pelo sistema?" value={record.blocked ? "Sim" : "Não"} />
            </>
          ) : isSessions ? (
            <>
              <DetailItem label="Quem" value={record.actor_name || record.actor_email || "—"} />
              <DetailItem label="Perfil" value={record.actor_type === "admin" ? "Administrador" : "Aluno"} />
              <DetailItem label="Status" value={record.is_active ? "Sessão ativa" : `Encerrada${record.ended_at ? ` em ${formatDate(record.ended_at)}` : ""}`} />
              <DetailItem label="Duração" value={humanizeDuration(record.duration_seconds)} />
              <DetailItem label="Início da sessão" value={formatDate(record.started_at)} />
              <DetailItem label="Última atividade" value={formatDate(record.last_seen_at)} />
              <DetailItem label="Área atual/mais recente" value={record.last_route || "—"} />
              <DetailItem label="IP" value={record.ip_address || "—"} />
            </>
          ) : (
            <>
              <DetailItem label="Ator" value={record.actor_name || record.actor_email || record.actor_type || "Sistema"} />
              <DetailItem label="Rota" value={record.route || record.last_route || "—"} />
              <DetailItem label="IP" value={record.ip_address || "—"} />
              <DetailItem label="Gravidade" value={record.risk_level || record.severity || (record.is_active ? "active" : "—")} />
            </>
          )}
        </div>

        {isSessions && <SessionTimeline record={record} />}

        {isError && detailEntries.length > 0 && isFlatDetails && (
          <div className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <p className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Detalhes adicionais</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {detailEntries.map(([key, value]) => (
                <DetailItem key={key} label={humanizeSource(key)} value={value === null || value === undefined ? "—" : String(value)} />
              ))}
            </div>
          </div>
        )}

        {isError && record.stack && (
          <div className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <p className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Rastreio técnico (stack trace)</p>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-slate-400">{record.stack}</pre>
          </div>
        )}

        <div className="mt-5 rounded-2xl border border-white/[0.08] bg-black/20 p-4">
          <p className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Payload completo (avançado)</p>
          <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-slate-300">{JSON.stringify(record, null, 2)}</pre>
        </div>
      </aside>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 break-words text-sm font-semibold text-slate-200">{value}</p>
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}
