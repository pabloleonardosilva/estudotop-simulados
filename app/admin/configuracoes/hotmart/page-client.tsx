"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CreditCard, Link2, RefreshCw, ScrollText } from "lucide-react";
import PageBackground from "@/app/components/ui/PageBackground";
import PageHeader from "@/app/components/ui/PageHeader";
import MetricCard from "@/app/components/ui/MetricCard";
import PremiumCard from "@/app/components/ui/PremiumCard";
import PremiumButton from "@/app/components/ui/PremiumButton";
import PremiumInput from "@/app/components/ui/PremiumInput";
import PremiumSelect from "@/app/components/ui/PremiumSelect";

type Destination = { id: string; title?: string; name?: string; status: string };
type Mapping = { id: string; hotmart_product_ucode: string; hotmart_product_name: string; destination_type: string; status: string; jornadas?: { title?: string } | null; simulado_events?: { name?: string } | null };
type Transaction = { id: string; transaction_code: string; hotmart_product_ucode: string; product_name_snapshot: string; buyer_email: string; purchase_status: string; processing_status: string; refund_request_state?: string | null; amount: number | null; currency: string | null; created_at: string; destination_type: string | null; possible_duplicate_student_id?: string | null; resolved_at?: string | null; jornadas?: { title?: string } | null; simulado_events?: { name?: string } | null; students?: { name?: string; email?: string } | null; possible_duplicate?: { name?: string; email?: string } | null; hotmart_access_links?: Array<{ current_origin: string; access_state: string; access_expires_at?: string | null; student_jornadas?: { started_at?: string; expires_at?: string; status?: string } | null }> };
type History = { id: string; action: string; actor_type: string; created_at: string };
type Readiness = { hottok: boolean; client_id: boolean; client_secret: boolean; basic_token: boolean; environment: "sandbox" | "production" | null; resend: boolean; registration_token_secret: boolean };
type Data = { configured: boolean; readiness: Readiness; mappings: Mapping[]; transactions: Transaction[]; history: History[] };

const emptyReadiness: Readiness = { hottok: false, client_id: false, client_secret: false, basic_token: false, environment: null, resend: false, registration_token_secret: false };

export default function HotmartPageClient({ jornadas, events }: { jornadas: Destination[]; events: Destination[] }) {
  const [data, setData] = useState<Data>({ configured: false, readiness: emptyReadiness, mappings: [], transactions: [], history: [] });
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ hotmart_product_ucode: "", hotmart_product_name: "", hotmart_product_id: "", destination_type: "jornada", destination_id: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/admin/hotmart");
    const json = await response.json();
    if (response.ok && json.ok) setData(json);
    else setMessage(json.message || "Não foi possível carregar.");
    setLoading(false);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function createMapping() {
    const response = await fetch("/api/admin/hotmart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const json = await response.json();
    setMessage(json.message);
    if (response.ok) { setForm({ ...form, hotmart_product_ucode: "", hotmart_product_name: "", hotmart_product_id: "", destination_id: "" }); await load(); }
  }
  async function setMappingStatus(id: string, status: string) {
    const response = await fetch(`/api/admin/hotmart/mappings/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const json = await response.json(); setMessage(json.message); if (response.ok) await load();
  }
  async function transactionAction(id: string, action: string) {
    const response = action === "refund"
      ? await fetch(`/api/admin/hotmart/transactions/${id}/refund`, { method: "POST" })
      : await fetch(`/api/admin/hotmart/transactions/${id}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const json = await response.json(); setMessage(json.message); if (response.ok) await load();
  }
  async function recoverEmails() {
    const response = await fetch("/api/admin/hotmart/recover-emails", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit: 20 }) });
    const json = await response.json(); setMessage(json.message); if (response.ok) await load();
  }

  const pending = data.transactions
    .filter((item) => item.processing_status.startsWith("pending") || item.processing_status === "processing_error" || item.processing_status === "refund_reconciliation_required" || item.refund_request_state === "reconciliation_required")
    .map((item) => item.refund_request_state === "reconciliation_required" ? { ...item, processing_status: "Pedido de reembolso recebido" } : item);
  const duplicates = data.transactions.filter((item) => item.processing_status === "pending_duplicate_purchase");
  const duplicateStudents = data.transactions.filter((item) => item.possible_duplicate_student_id && !item.resolved_at);
  const destinations = form.destination_type === "jornada" ? jornadas : events;
  const tabs = [["overview", "Visão geral"], ["mappings", "Produtos vinculados"], ["transactions", "Transações"], ["pending", "Pendências"], ["duplicates", "Compras em duplicidade"], ["students", "Possíveis cadastros duplicados"], ["history", "Histórico / Logs"]];

  return <PageBackground><PageHeader eyebrow="Configurações" title="Integração Hotmart" description="Produtos, transações e acessos comerciais vinculados aos motores oficiais do EstudoTOP." action={<PremiumButton variant="dark" icon={<RefreshCw size={16} />} onClick={() => void load()}>Atualizar</PremiumButton>} />
    <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Integração" value={data.configured ? "Configurada" : "Pendente"} detail={data.readiness.environment || "ambiente não definido"} icon={data.configured ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />} /><MetricCard label="Produtos" value={String(data.mappings.length)} detail="vínculos cadastrados" icon={<Link2 size={18} />} /><MetricCard label="Transações" value={String(data.transactions.length)} detail="100 mais recentes" icon={<CreditCard size={18} />} /><MetricCard label="Pendências" value={String(pending.length)} detail="exigem tratamento" icon={<AlertTriangle size={18} />} /></div>
    <div className="mb-5 flex gap-2 overflow-x-auto pb-2">{tabs.map(([key,label]) => <PremiumButton key={key} variant={tab === key ? "dark-primary" : "dark"} onClick={() => setTab(key)}>{label}</PremiumButton>)}</div>
    {message ? <div className="mb-4 rounded-xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">{message}</div> : null}
    {loading ? <PremiumCard><p className="et-admin-dark-text">Carregando...</p></PremiumCard> : null}
    {!loading && tab === "overview" ? <PremiumCard title="Estado operacional" icon={<CreditCard size={18} />}><p className="et-admin-dark-text">O webhook autentica, deduplica e processa cada produto isoladamente. Credenciais nunca são exibidas nesta tela.</p><div className="mt-4"><PremiumButton variant="dark" onClick={() => void recoverEmails()}>Recuperar e-mails pendentes</PremiumButton></div></PremiumCard> : null}
    {!loading && tab === "mappings" ? <div className="space-y-5"><PremiumCard title="Vincular produto"><div className="grid gap-4 md:grid-cols-2"><PremiumInput variant="jornada" label="Product ucode" value={form.hotmart_product_ucode} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, hotmart_product_ucode: event.target.value })} /><PremiumInput variant="jornada" label="Nome do produto" value={form.hotmart_product_name} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, hotmart_product_name: event.target.value })} /><PremiumSelect variant="jornada" label="Tipo" value={form.destination_type} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, destination_type: event.target.value, destination_id: "" })}><option value="jornada">Jornada</option><option value="event">Evento</option></PremiumSelect><PremiumSelect variant="jornada" label="Destino" value={form.destination_id} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, destination_id: event.target.value })}><option value="">Selecione</option>{destinations.map((item) => <option key={item.id} value={item.id}>{item.title || item.name} — {item.status}</option>)}</PremiumSelect></div><div className="mt-4"><PremiumButton variant="dark-primary" onClick={() => void createMapping()}>Salvar vínculo</PremiumButton></div></PremiumCard><PremiumCard title="Produtos vinculados"><div className="space-y-3">{data.mappings.map((item) => <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 md:flex-row md:items-center md:justify-between"><div><p className="font-semibold text-white">{item.hotmart_product_name}</p><p className="text-xs text-slate-400">{item.hotmart_product_ucode} → {item.jornadas?.title || item.simulado_events?.name}</p></div><div className="flex gap-2"><PremiumButton variant="dark" onClick={() => void setMappingStatus(item.id, item.status === "active" ? "inactive" : "active")}>{item.status === "active" ? "Inativar" : "Ativar"}</PremiumButton><PremiumButton variant="dark-warning" onClick={() => void setMappingStatus(item.id, "archived")}>Arquivar</PremiumButton></div></div>)}{!data.mappings.length ? <p className="et-admin-dark-muted">Nenhum produto vinculado.</p> : null}</div></PremiumCard></div> : null}
    {!loading && ["transactions","pending","duplicates"].includes(tab) ? <PremiumCard title={tab === "transactions" ? "Transações" : tab === "pending" ? "Pendências" : "Compras em duplicidade"}><div className="space-y-3">{(tab === "transactions" ? data.transactions : tab === "pending" ? pending : duplicates).map((item) => { const access = item.hotmart_access_links?.[0]; const enrollment = access?.student_jornadas; return <div key={item.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4"><div className="flex flex-wrap justify-between gap-2"><p className="font-semibold text-white">{item.product_name_snapshot}</p><span className="text-xs text-orange-300">{item.processing_status}</span></div><p className="mt-1 text-xs text-slate-400">{item.transaction_code} · {item.hotmart_product_ucode} · {item.buyer_email} · {item.purchase_status}</p><p className="mt-2 text-xs text-slate-300">Destino: {item.jornadas?.title || item.simulado_events?.name || "Aguardando mapping"} · Origem: {access?.current_origin || "—"}{enrollment ? ` · ${enrollment.started_at} até ${enrollment.expires_at}` : ""}</p><div className="mt-3 flex flex-wrap gap-2">{item.processing_status.startsWith("pending") ? <PremiumButton variant="dark" onClick={() => void transactionAction(item.id, "reprocess")}>Reprocessar</PremiumButton> : null}{item.processing_status === "pending_duplicate_purchase" && item.destination_type === "jornada" ? <PremiumButton variant="dark-success" onClick={() => void transactionAction(item.id, "extend_jornada")}>Estender matrícula</PremiumButton> : null}{item.processing_status.startsWith("pending") ? <PremiumButton variant="dark-warning" onClick={() => void transactionAction(item.id, "refund")}>Solicitar estorno</PremiumButton> : null}</div></div>; })}{!(tab === "transactions" ? data.transactions : tab === "pending" ? pending : duplicates).length ? <p className="et-admin-dark-muted">Nenhum registro nesta seção.</p> : null}</div></PremiumCard> : null}
    {!loading && tab === "students" ? <PremiumCard title="Possíveis cadastros duplicados"><div className="space-y-3">{duplicateStudents.map((item) => <div key={item.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4"><p className="font-semibold text-white">Conta Hotmart: {item.students?.name || item.students?.email}</p><p className="mt-1 text-xs text-slate-400">Possível cadastro existente: {item.possible_duplicate?.name || item.possible_duplicate?.email}</p><div className="mt-3 flex gap-2"><PremiumButton variant="dark" onClick={() => void transactionAction(item.id, "keep_separate")}>Manter separados</PremiumButton><PremiumButton variant="dark-danger" disabled>Mesclar — bloqueado</PremiumButton></div></div>)}{!duplicateStudents.length ? <p className="et-admin-dark-muted">Nenhuma possível duplicidade pendente.</p> : null}<p className="et-admin-dark-muted mt-4">O merge permanece indisponível até que todas as relações críticas e o Supabase Auth possam ser migrados de forma transacional.</p></div></PremiumCard> : null}
    {!loading && tab === "history" ? <PremiumCard title="Histórico comercial" icon={<ScrollText size={18} />}><div className="space-y-2">{data.history.map((item) => <div key={item.id} className="flex justify-between rounded-xl border border-white/10 px-4 py-3 text-sm"><span className="text-slate-200">{item.action}</span><span className="text-slate-500">{new Date(item.created_at).toLocaleString("pt-BR")}</span></div>)}</div></PremiumCard> : null}
  </PageBackground>;
}
