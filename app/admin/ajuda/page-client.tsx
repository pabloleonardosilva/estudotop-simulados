"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, Edit3, ExternalLink, LifeBuoy, Loader2, Search, Send, User, X } from "lucide-react";
import { adminFetch } from "@/app/lib/supabase/adminFetch";
import PremiumButton from "@/app/components/ui/PremiumButton";
import PremiumInput from "@/app/components/ui/PremiumInput";
import { getHelpContactReasonLabel, HELP_CONTACT_REASONS, type HelpContactReason } from "@/lib/help-tickets";

type TicketStatus = "open" | "answered" | "closed";
type StudentRef = { id?: string; name: string | null; email: string | null; phone?: string | null; status?: string | null; created_at?: string; last_login_at?: string | null };
type TicketRow = { id: string; ticket_number: string; contact_reason: HelpContactReason | null; status: TicketStatus; admin_seen_at: string | null; created_at: string; updated_at: string; student_id: string; students: StudentRef | StudentRef[] | null; latest_message: { message: string; author_type: string; created_at: string } | null };
type TicketDetail = TicketRow & { internal_note: string | null; technical_context: Record<string, unknown> | null; closed_at: string | null; messages: Array<{ id: string; author_type: "student" | "admin"; message: string; created_at: string; edited_at: string | null }>; events: Array<{ id: string; event_type: string; actor_type: string; created_at: string }>; student_summary: { active_journeys: Array<{ id: string; jornadas: { title: string } | Array<{ title: string }> | null }>; completed_simulados: number } };
type TabKey = TicketStatus | "all";
type Counts = Record<TabKey, number>;

const EVENT_LABELS: Record<string, string> = { created: "Ticket criado", admin_viewed: "Visualizado pelo admin", admin_replied: "Resposta enviada", student_viewed: "Resposta vista pelo aluno", student_replied: "Aluno respondeu", reply_edited: "Resposta editada", closed: "Ticket encerrado", reopened: "Ticket reaberto" };
function formatDate(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) }
function studentRef(value: TicketRow["students"]) { return Array.isArray(value) ? value[0] || null : value || null }
function statusLabel(status: TicketStatus) { return status === "open" ? "Aberto" : status === "answered" ? "Respondido" : "Encerrado" }

function PremiumFilterDropdown({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: MouseEvent) => { if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false) };
    const handleEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false) };
    document.addEventListener("mousedown", handleOutside); document.addEventListener("keydown", handleEscape);
    return () => { document.removeEventListener("mousedown", handleOutside); document.removeEventListener("keydown", handleEscape) };
  }, [open]);
  const currentLabel = options.find((option) => option.value === value)?.label ?? options[0]?.label ?? label;
  const isFiltered = value !== "" && value !== "all";
  return <div ref={containerRef} className="relative"><label className="mb-2 block text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-300/65">{label}</label><button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="group flex h-12 w-full items-center justify-between rounded-2xl border border-slate-400/[0.18] bg-[#0B1828] px-4 text-left text-sm font-semibold text-slate-200 outline-none transition-all duration-200 hover:border-orange-400/35 focus:border-orange-400/55 focus:ring-4 focus:ring-orange-500/10"><span className={`truncate ${isFiltered ? "text-white/90" : ""}`}>{currentLabel}</span><span className="flex items-center gap-2">{isFiltered && <span className="h-2 w-2 rounded-full bg-orange-500" />}<ChevronDown size={16} className={`text-white/30 transition duration-200 group-hover:text-orange-400 ${open ? "rotate-180 text-orange-400" : ""}`} /></span></button>{open && <div role="listbox" className="absolute left-0 top-full z-[9999] mt-2 w-full rounded-2xl border border-white/[0.09] bg-[#0D1B2E] p-2 shadow-2xl shadow-black/50 backdrop-blur-xl"><div className="max-h-72 space-y-0.5 overflow-y-auto">{options.map((option) => { const selected = option.value === value; return <button key={option.value} type="button" role="option" aria-selected={selected} onClick={() => { onChange(option.value); setOpen(false) }} className={selected ? "flex w-full items-center justify-between rounded-xl border border-orange-500/30 bg-orange-500/[0.12] px-4 py-2.5 text-left text-sm font-semibold text-orange-100" : "flex w-full items-center rounded-xl border border-transparent px-4 py-2.5 text-left text-sm font-semibold text-white/60 hover:border-white/[0.07] hover:bg-white/[0.04] hover:text-white/80"}><span className="flex-1 text-left">{option.label}</span>{selected && <Check size={14} className="shrink-0 text-orange-400" strokeWidth={3} />}</button> })}</div></div>}</div>;
}

export default function AjudaAdminClient() {
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [counts, setCounts] = useState<Counts>({ open: 0, answered: 0, closed: 0, all: 0 });
  const [tab, setTab] = useState<TabKey>("open");
  const [reason, setReason] = useState<HelpContactReason | "">("");
  const [period, setPeriod] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [saving, setSaving] = useState(false);
  const [studentOpen, setStudentOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const params = new URLSearchParams({ page: String(page), period });
    if (tab !== "all") params.set("status", tab);
    if (reason) params.set("contact_reason", reason);
    if (search.trim()) params.set("search", search.trim());
    const response = await adminFetch(`/api/admin/help-messages?${params}`);
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.ok) setError(json.message || "Não foi possível carregar os tickets.");
    else { setRows(json.items || []); if (json.counts) setCounts(json.counts); setTotal(json.total || 0) }
    setLoading(false);
  }, [page, period, tab, reason, search]);

  useEffect(() => { const timeout = window.setTimeout(() => void load(), search ? 350 : 0); return () => window.clearTimeout(timeout) }, [load, search]);

  const openDetail = useCallback(async (id: string) => {
    setDetailLoading(true); setError(null);
    const response = await adminFetch(`/api/admin/help-messages/${id}`);
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.ok) setError(json.message || "Não foi possível carregar o ticket.");
    else { setDetail(json.ticket); setNote(json.ticket.internal_note || ""); setReply(""); window.dispatchEvent(new Event("help-tickets:changed")) }
    setDetailLoading(false); await load();
  }, [load]);

  async function ticketAction(action: "reply" | "close" | "reopen" | "internal_note") {
    if (!detail) return;
    if ((action === "close" || action === "reopen") && !window.confirm(action === "close" ? `Encerrar ${detail.ticket_number}?` : `Reabrir ${detail.ticket_number}?`)) return;
    setSaving(true); setError(null);
    const body = action === "reply" ? { action, message: reply } : action === "internal_note" ? { action, internal_note: note } : { action };
    const response = await adminFetch(`/api/admin/help-messages/${detail.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok || !json.ok) return setError(json.message || "Não foi possível atualizar o ticket.");
    window.dispatchEvent(new Event("help-tickets:changed")); await openDetail(detail.id);
  }

  async function saveEdit(messageId: string) {
    if (!detail || !editingText.trim()) return;
    setSaving(true);
    const response = await adminFetch(`/api/admin/help-messages/${detail.id}/messages/${messageId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: editingText }) });
    const json = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok || !json.ok) return setError(json.message || "Não foi possível editar a resposta.");
    setEditingId(null); setEditingText(""); await openDetail(detail.id);
  }

  const tabs: Array<{ key: TabKey; label: string }> = [{ key: "open", label: "Abertos" }, { key: "answered", label: "Respondidos" }, { key: "closed", label: "Encerrados" }, { key: "all", label: "Todos" }];
  const totalPages = Math.max(1, Math.ceil(total / 25));
  const selectedStudent = detail ? studentRef(detail.students) : null;

  return (
    <main className="et-admin-dark-page px-4 pb-20 pt-6 md:px-8 md:pt-10">
      <div className="mx-auto max-w-7xl">
        <section className="rounded-[2rem] border border-white/[0.08] bg-white/[0.035] p-6 shadow-2xl shadow-black/30 md:p-8"><p className="text-[11px] font-black uppercase tracking-[0.22em] text-orange-300">Atendimento ao aluno</p><h1 className="mt-4 flex items-center gap-3 text-2xl font-semibold md:text-3xl"><LifeBuoy className="text-orange-300" /> Tickets de Ajuda</h1><p className="mt-2 text-sm text-slate-400">Fila compacta, conversa completa e histórico operacional em um único lugar.</p></section>
        <section className="mt-5 rounded-[1.75rem] border border-white/[0.07] bg-white/[0.03] p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_230px_170px]"><PremiumInput label="Buscar" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Ticket, aluno, e-mail ou mensagem" icon={<Search size={16} />} /><PremiumFilterDropdown label="Motivo" value={reason} onChange={(nextValue) => { setReason(nextValue as HelpContactReason | ""); setPage(1) }} options={[{ value: "", label: "Todos os motivos" }, ...HELP_CONTACT_REASONS]} /><PremiumFilterDropdown label="Período" value={period} onChange={(nextValue) => { setPeriod(nextValue); setPage(1) }} options={[{ value: "all", label: "Todo período" }, { value: "7", label: "Últimos 7 dias" }, { value: "30", label: "Últimos 30 dias" }, { value: "90", label: "Últimos 90 dias" }]} /></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-4">{tabs.map((item) => <button key={item.key} type="button" onClick={() => { setTab(item.key); setPage(1) }} className={`rounded-xl px-3 py-2.5 text-sm font-bold transition ${tab === item.key ? "bg-gradient-to-r from-orange-500 to-amber-400 text-slate-950" : "bg-white/[0.03] text-slate-400 hover:bg-white/[0.07] hover:text-white"}`}>{item.label} ({counts[item.key]})</button>)}</div>
        </section>
        <section className="mt-5 overflow-hidden rounded-[1.75rem] border border-white/[0.07] bg-white/[0.03]">
          <div className="hidden grid-cols-[140px_1fr_190px_160px_150px] gap-4 border-b border-white/[0.07] px-5 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 lg:grid"><span>Ticket</span><span>Aluno / resumo</span><span>Motivo</span><span>Status</span><span>Atualização</span></div>
          {loading ? <div className="flex justify-center py-16 text-orange-300"><Loader2 className="animate-spin" /></div> : error ? <div className="p-8 text-center text-sm text-red-300">{error}</div> : rows.length === 0 ? <div className="p-12 text-center text-sm text-slate-400">Nenhum ticket encontrado.</div> : rows.map((row) => { const student = studentRef(row.students); return <button key={row.id} type="button" onClick={() => openDetail(row.id)} className="grid w-full gap-3 border-b border-white/[0.06] px-5 py-4 text-left transition last:border-0 hover:bg-white/[0.04] lg:grid-cols-[140px_1fr_190px_160px_150px] lg:items-center lg:gap-4"><span className="flex items-center gap-2 text-sm font-black text-white">{!row.admin_seen_at && <span className="h-2 w-2 rounded-full bg-orange-400" />} {row.ticket_number}</span><span className="min-w-0"><span className="block text-sm font-bold text-slate-200">{student?.name || "Aluno"} <span className="font-normal text-slate-500">· {student?.email || "—"}</span></span><span className="mt-1 block truncate text-xs text-slate-500">{row.latest_message?.message || "Sem mensagem"}</span></span><span className="text-xs font-semibold text-orange-200">{getHelpContactReasonLabel(row.contact_reason)}</span><span className={`w-fit rounded-full px-3 py-1 text-[11px] font-bold ${row.status === "open" ? "bg-amber-500/10 text-amber-300" : row.status === "answered" ? "bg-emerald-500/10 text-emerald-300" : "bg-slate-500/10 text-slate-400"}`}>{statusLabel(row.status)}</span><span className="text-xs text-slate-500">{formatDate(row.updated_at)}</span></button> })}
        </section>
        <div className="mt-4 flex items-center justify-between text-xs text-slate-500"><span>{total} ticket(s)</span><div className="flex items-center gap-2"><PremiumButton variant="dark" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}><ChevronLeft size={15} /></PremiumButton><span>Página {page} de {totalPages}</span><PremiumButton variant="dark" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages}><ChevronRight size={15} /></PremiumButton></div></div>
      </div>

      {(detailLoading || detail) && <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm"><div className="flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#0B1422] shadow-2xl">{detailLoading && !detail ? <div className="flex justify-center p-20 text-orange-300"><Loader2 className="animate-spin" /></div> : detail && <><header className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-300">{detail.ticket_number}</p><h2 className="mt-1 text-xl font-black">{getHelpContactReasonLabel(detail.contact_reason)}</h2></div><button type="button" aria-label="Fechar" onClick={() => { setDetail(null); setStudentOpen(false) }} className="rounded-full border border-white/10 p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X size={17} /></button></header><div className="grid flex-1 overflow-y-auto lg:grid-cols-[1fr_320px]"><section className="p-5 sm:p-6"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><button type="button" onClick={() => setStudentOpen(true)} className="inline-flex items-center gap-2 text-sm font-bold text-white hover:text-orange-300"><User size={16} />{selectedStudent?.name || "Aluno"}</button><div className="flex gap-2"><PremiumButton variant="dark" onClick={() => ticketAction(detail.status === "closed" ? "reopen" : "close")} disabled={saving}>{detail.status === "closed" ? "Reabrir" : "Encerrar"}</PremiumButton></div></div><div className="space-y-3">{detail.messages.map((message) => <div key={message.id} className={`flex ${message.author_type === "admin" ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] rounded-2xl border px-4 py-3 ${message.author_type === "admin" ? "border-orange-400/20 bg-orange-500/10" : "border-white/10 bg-white/[0.04]"}`}>{editingId === message.id ? <div><textarea value={editingText} onChange={(event) => setEditingText(event.target.value)} rows={3} maxLength={5000} className="w-full rounded-xl border border-white/10 bg-[#07111F] p-3 text-sm outline-none focus:border-orange-400" /><div className="mt-2 flex justify-end gap-2"><PremiumButton variant="dark" onClick={() => setEditingId(null)}>Cancelar</PremiumButton><PremiumButton onClick={() => saveEdit(message.id)} disabled={saving}>Salvar</PremiumButton></div></div> : <><p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">{message.message}</p><div className="mt-2 flex items-center justify-between gap-3"><span className="text-[10px] text-slate-500">{formatDate(message.created_at)}{message.edited_at ? " · editada" : ""}</span>{message.author_type === "admin" && <button type="button" onClick={() => { setEditingId(message.id); setEditingText(message.message) }} className="text-slate-500 hover:text-orange-300" aria-label="Editar resposta"><Edit3 size={13} /></button>}</div></>}</div></div>)}</div>{detail.status === "open" && <div className="mt-5"><textarea value={reply} onChange={(event) => setReply(event.target.value)} rows={4} maxLength={5000} placeholder="Responder ao aluno..." className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm outline-none placeholder:text-slate-500 focus:border-orange-400" /><div className="mt-3 flex justify-end"><PremiumButton onClick={() => ticketAction("reply")} disabled={saving || !reply.trim()}>{saving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Enviar resposta</PremiumButton></div></div>}{detail.status === "answered" && <p className="mt-5 rounded-2xl bg-emerald-500/10 p-4 text-sm text-emerald-200">Resposta enviada. Aguarde uma nova mensagem do aluno ou encerre o atendimento.</p>}{detail.status === "closed" && <p className="mt-5 rounded-2xl bg-white/[0.04] p-4 text-sm text-slate-400">Ticket encerrado. Reabra antes de responder.</p>}{error && <p className="mt-4 text-sm text-red-300">{error}</p>}</section><aside className="border-t border-white/10 bg-white/[0.02] p-5 lg:border-l lg:border-t-0"><label className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Nota interna</label><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} maxLength={5000} className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-[#07111F] p-3 text-sm outline-none focus:border-orange-400" placeholder="Visível apenas para administradores" /><PremiumButton variant="dark" className="mt-2 w-full" onClick={() => ticketAction("internal_note")} disabled={saving}>Salvar nota</PremiumButton>{detail.technical_context && <details className="mt-5 rounded-2xl border border-white/10 p-4"><summary className="cursor-pointer text-sm font-bold text-slate-300">Contexto técnico</summary><dl className="mt-3 space-y-2 text-xs text-slate-500">{Object.entries(detail.technical_context).map(([key, value]) => value !== null && <div key={key}><dt className="font-bold text-slate-400">{key}</dt><dd className="break-all">{String(value)}</dd></div>)}</dl></details>}<details className="mt-5 rounded-2xl border border-white/10 p-4"><summary className="cursor-pointer text-sm font-bold text-slate-300">Linha do tempo ({detail.events.length})</summary><div className="mt-3 space-y-3">{detail.events.map((event) => <div key={event.id} className="flex gap-2 text-xs"><Clock3 size={13} className="mt-0.5 shrink-0 text-orange-300" /><div><p className="text-slate-300">{EVENT_LABELS[event.event_type] || event.event_type}</p><p className="text-slate-600">{formatDate(event.created_at)}</p></div></div>)}</div></details></aside></div></>}</div></div>}

      {studentOpen && detail && selectedStudent && <div className="fixed inset-0 z-[10010] flex items-center justify-center bg-slate-950/70 p-4"><div className="w-full max-w-md rounded-[1.75rem] border border-white/10 bg-[#0B1422] p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-300">Dados do aluno</p><h3 className="mt-2 text-xl font-black">{selectedStudent.name || "Aluno"}</h3></div><button type="button" onClick={() => setStudentOpen(false)} className="text-slate-400 hover:text-white"><X size={18} /></button></div><dl className="mt-5 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-xs text-slate-500">E-mail</dt><dd className="mt-1 break-all text-slate-200">{selectedStudent.email || "—"}</dd></div><div><dt className="text-xs text-slate-500">Telefone</dt><dd className="mt-1 text-slate-200">{selectedStudent.phone || "—"}</dd></div><div><dt className="text-xs text-slate-500">Status</dt><dd className="mt-1 text-slate-200">{selectedStudent.status || "—"}</dd></div><div><dt className="text-xs text-slate-500">Cadastro</dt><dd className="mt-1 text-slate-200">{selectedStudent.created_at ? formatDate(selectedStudent.created_at) : "—"}</dd></div><div><dt className="text-xs text-slate-500">Último acesso</dt><dd className="mt-1 text-slate-200">{selectedStudent.last_login_at ? formatDate(selectedStudent.last_login_at) : "Sem registro"}</dd></div><div><dt className="text-xs text-slate-500">Simulados concluídos</dt><dd className="mt-1 text-slate-200">{detail.student_summary.completed_simulados}</dd></div><div className="col-span-2"><dt className="text-xs text-slate-500">Jornadas ativas</dt><dd className="mt-1 text-slate-200">{detail.student_summary.active_journeys.length || "Nenhuma"}</dd></div></dl><Link href={`/admin/alunos/${detail.student_id}`} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 px-4 py-3 text-sm font-black text-slate-950"><ExternalLink size={16} /> Abrir perfil completo</Link></div></div>}
    </main>
  );
}
