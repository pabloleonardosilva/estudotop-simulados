"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { ArrowLeft, Check, ChevronDown, LifeBuoy, Loader2, MessageCircle, Plus, Send, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { supabase } from "@/app/lib/supabase/client";
import PremiumButton from "@/app/components/ui/PremiumButton";
import { getHelpContactReasonLabel, HELP_CONTACT_REASONS, type HelpContactReason } from "@/lib/help-tickets";

const MAX_MESSAGE_LENGTH = 2000;
const RECAPTCHA_ACTION = "help_ticket_submit";

declare global {
  interface Window { grecaptcha?: { ready(callback: () => void): void; execute(siteKey: string, options: { action: string }): Promise<string> } }
}

type TicketStatus = "open" | "answered" | "closed";
type TicketSummary = {
  id: string; ticket_number: string; contact_reason: HelpContactReason | null; status: TicketStatus;
  student_seen_reply_at: string | null; created_at: string; updated_at: string; closed_at: string | null;
  latest_message: { author_type: "student" | "admin"; message: string; created_at: string } | null;
};
type TicketDetail = Omit<TicketSummary, "latest_message" | "student_seen_reply_at"> & {
  messages: Array<{ id: string; author_type: "student" | "admin"; message: string; created_at: string; edited_at: string | null }>;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function statusLabel(status: TicketStatus) {
  return status === "open" ? "Aguardando resposta" : status === "answered" ? "Respondido" : "Encerrado";
}

function HelpReasonDropdown({ value, onChange }: { value: HelpContactReason | ""; onChange: (value: HelpContactReason) => void }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedLabel = HELP_CONTACT_REASONS.find((reason) => reason.value === value)?.label;
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false) };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false) };
    document.addEventListener("mousedown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", escape) };
  }, [open]);
  return (
    <div ref={containerRef} className="relative">
      <label id="student-help-reason-label" className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Motivo do contato</label>
      <button type="button" aria-labelledby="student-help-reason-label" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}
        className="group flex h-12 w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 text-left text-sm font-semibold text-slate-700 shadow-sm outline-none transition hover:border-orange-300 focus:border-orange-400 focus:ring-4 focus:ring-orange-100">
        <span className={`truncate ${selectedLabel ? "text-slate-800" : "text-slate-400"}`}>{selectedLabel || "Selecione uma opção"}</span>
        <span className="flex items-center gap-2">{selectedLabel && <span className="h-2 w-2 rounded-full bg-orange-500" />}<ChevronDown size={16} className={`text-slate-400 transition ${open ? "rotate-180 text-orange-500" : ""}`} /></span>
      </button>
      {open && (
        <div role="listbox" aria-labelledby="student-help-reason-label" className="absolute left-0 top-full z-[10001] mt-2 w-full rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-900/15">
          {HELP_CONTACT_REASONS.map((reason) => {
            const selected = reason.value === value;
            return <button key={reason.value} type="button" role="option" aria-selected={selected} onClick={() => { onChange(reason.value); setOpen(false) }}
              className={`flex w-full items-center justify-between rounded-xl px-4 py-2.5 text-left text-sm font-semibold transition ${selected ? "bg-orange-50 text-orange-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}>
              {reason.label}{selected && <Check size={15} className="text-orange-500" />}
            </button>;
          })}
        </div>
      )}
    </div>
  );
}

export default function HelpCenterModal({ open, onClose, initialTicketId = null }: { open: boolean; onClose: () => void; initialTicketId?: string | null }) {
  const pathname = usePathname();
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [selected, setSelected] = useState<TicketDetail | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [contactReason, setContactReason] = useState<HelpContactReason | "">("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [captchaReady, setCaptchaReady] = useState(false);
  const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "";

  const getSession = useCallback(async () => (await supabase.auth.getSession()).data.session, []);
  const loadTickets = useCallback(async () => {
    setLoading(true); setError(null);
    const session = await getSession();
    if (!session) { setError("Sessão expirada. Recarregue a página."); setLoading(false); return }
    const response = await fetch("/api/student/help-messages", { headers: { Authorization: `Bearer ${session.access_token}` } });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.ok) setError(json.message || "Não foi possível carregar seus tickets."); else setTickets(json.messages || []);
    setLoading(false);
  }, [getSession]);
  const openTicket = useCallback(async (id: string) => {
    setLoading(true); setError(null); setShowNew(false);
    const session = await getSession();
    if (!session) { setError("Sessão expirada. Recarregue a página."); setLoading(false); return }
    const response = await fetch(`/api/student/help-messages/${id}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.ok) setError(json.message || "Não foi possível carregar este ticket."); else setSelected(json.ticket);
    setLoading(false);
  }, [getSession]);

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(async () => { await loadTickets(); if (initialTicketId) await openTicket(initialTicketId) }, 0);
    return () => window.clearTimeout(timeout);
  }, [open, initialTicketId, loadTickets, openTicket]);

  async function sendNew() {
    const text = draft.trim();
    if (!contactReason) return setFeedback("Selecione o motivo do contato.");
    if (!text) return setFeedback("Digite sua mensagem antes de enviar.");
    if (!recaptchaSiteKey || !captchaReady || !window.grecaptcha) return setFeedback("Não foi possível validar o envio. Tente novamente.");
    setSending(true); setFeedback(null);
    const session = await getSession();
    if (!session) { setFeedback("Sessão expirada. Recarregue a página."); setSending(false); return }
    let captchaToken = "";
    try { captchaToken = await window.grecaptcha.execute(recaptchaSiteKey, { action: RECAPTCHA_ACTION }) } catch { setFeedback("Não foi possível validar o envio. Tente novamente."); setSending(false); return }
    const technicalContext = contactReason === "system_malfunction" ? {
      route: pathname, occurred_at: new Date().toISOString(), viewport_width: window.innerWidth, viewport_height: window.innerHeight,
      screen_width: window.screen.width, screen_height: window.screen.height,
    } : null;
    const response = await fetch("/api/student/help-messages", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ contact_reason: contactReason, message: text, captcha_token: captchaToken, technical_context: technicalContext }) });
    const json = await response.json().catch(() => ({}));
    setSending(false);
    if (!response.ok || !json.ok) return setFeedback(json.message || "Não foi possível abrir o ticket.");
    setDraft(""); setContactReason(""); setFeedback(json.message); setShowNew(false); await loadTickets(); await openTicket(json.item.id);
  }

  async function sendContinuation() {
    if (!selected || !draft.trim()) return;
    setSending(true); setFeedback(null);
    const session = await getSession();
    if (!session) { setFeedback("Sessão expirada. Recarregue a página."); setSending(false); return }
    const response = await fetch(`/api/student/help-messages/${selected.id}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ message: draft.trim() }) });
    const json = await response.json().catch(() => ({}));
    setSending(false);
    if (!response.ok || !json.ok) return setFeedback(json.message || "Não foi possível enviar sua mensagem.");
    setDraft(""); setFeedback(json.message); await openTicket(selected.id); await loadTickets();
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/55 px-3 py-4 backdrop-blur-sm sm:px-4">
      {recaptchaSiteKey && <Script id="student-help-recaptcha" src={`https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(recaptchaSiteKey)}`} strategy="afterInteractive" onReady={() => setCaptchaReady(true)} onError={() => setCaptchaReady(false)} />}
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-white/80 bg-[#F8FAFC] shadow-2xl shadow-slate-950/30 sm:max-h-[90dvh]">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><LifeBuoy size={20} /></span><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-600">Central de Ajuda</p><h2 className="text-lg font-black text-slate-900">{selected ? selected.ticket_number : showNew ? "Novo atendimento" : "Seus atendimentos"}</h2></div></div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><X size={16} /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          {loading ? <div className="flex justify-center py-14 text-orange-500"><Loader2 className="animate-spin" /></div> : error ? <div className="py-10 text-center"><p className="text-sm text-red-600">{error}</p><PremiumButton className="mt-4" onClick={() => selected ? openTicket(selected.id) : loadTickets()}>Tentar novamente</PremiumButton></div> : selected ? (
            <div>
              <button type="button" onClick={() => { setSelected(null); setDraft(""); setFeedback(null) }} className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-orange-600"><ArrowLeft size={16} /> Voltar aos atendimentos</button>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-bold text-slate-900">{getHelpContactReasonLabel(selected.contact_reason)}</p><p className="mt-1 text-xs text-slate-500">Aberto em {formatDate(selected.created_at)}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${selected.status === "open" ? "bg-amber-100 text-amber-700" : selected.status === "answered" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{statusLabel(selected.status)}</span></div>
              <div className="space-y-3">{selected.messages.map((item) => <div key={item.id} className={`flex ${item.author_type === "student" ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] rounded-2xl px-4 py-3 shadow-sm ${item.author_type === "student" ? "bg-orange-500 text-white" : "border border-slate-200 bg-white text-slate-700"}`}><p className="whitespace-pre-wrap text-sm leading-6">{item.message}</p><p className={`mt-1 text-[10px] ${item.author_type === "student" ? "text-orange-100" : "text-slate-400"}`}>{formatDate(item.created_at)}{item.edited_at ? " · editada" : ""}</p></div></div>)}</div>
              {selected.status === "answered" && <div className="mt-5"><textarea value={draft} onChange={(event) => { setDraft(event.target.value); setFeedback(null) }} maxLength={MAX_MESSAGE_LENGTH} rows={3} placeholder="Responda neste mesmo atendimento..." className="w-full resize-none rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100" /><div className="mt-3 flex items-center justify-between"><span className="text-xs text-slate-400">{draft.length}/{MAX_MESSAGE_LENGTH}</span><PremiumButton onClick={sendContinuation} disabled={sending || !draft.trim()}>{sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Enviar</PremiumButton></div></div>}
              {selected.status === "open" && <p className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">Sua mensagem foi recebida. Você poderá continuar a conversa após a resposta da equipe.</p>}
              {selected.status === "closed" && <p className="mt-5 rounded-2xl bg-slate-100 p-4 text-sm text-slate-600">Este atendimento foi encerrado e permanece disponível apenas para consulta.</p>}
              {feedback && <p className="mt-3 text-sm font-semibold text-slate-600">{feedback}</p>}
              <button type="button" onClick={() => { setSelected(null); setShowNew(true); setDraft(""); setFeedback(null) }} className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-orange-600 hover:text-orange-700"><Plus size={16} /> Abrir novo atendimento para outro assunto</button>
            </div>
          ) : showNew ? (
            <div><button type="button" onClick={() => { setShowNew(false); setDraft(""); setFeedback(null) }} className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-orange-600"><ArrowLeft size={16} /> Voltar aos atendimentos</button><HelpReasonDropdown value={contactReason} onChange={(reason) => { setContactReason(reason); setFeedback(null) }} /><label htmlFor="student-help-message" className="mb-2 mt-5 block text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Sua mensagem</label><textarea id="student-help-message" value={draft} onChange={(event) => { setDraft(event.target.value); setFeedback(null) }} placeholder="Atenção: este recurso não deve ser usado para tirar dúvidas sobre as questões do simulado." rows={5} maxLength={MAX_MESSAGE_LENGTH} className="w-full resize-none rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100" /><div className="mt-2 flex justify-between gap-3"><div>{feedback && <p className="text-xs font-semibold text-red-600">{feedback}</p>}{!recaptchaSiteKey && <p className="text-xs font-semibold text-amber-700">Proteção anti-spam ainda não configurada.</p>}</div><span className="text-xs text-slate-400">{draft.length}/{MAX_MESSAGE_LENGTH}</span></div><div className="mt-4 flex flex-col items-end gap-2"><p className="text-[10px] text-slate-400">Este site é protegido pelo reCAPTCHA.</p><PremiumButton onClick={sendNew} disabled={sending}>{sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Abrir atendimento</PremiumButton></div></div>
          ) : (
            <div><div className="mb-5 flex items-center justify-between gap-3"><p className="text-sm text-slate-500">Acompanhe respostas e continue conversas abertas.</p><PremiumButton onClick={() => { setShowNew(true); setFeedback(null) }}><Plus size={16} /> Novo atendimento</PremiumButton></div>{tickets.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><MessageCircle className="mx-auto text-slate-300" /><p className="mt-3 text-sm text-slate-500">Você ainda não abriu nenhum atendimento.</p></div> : <div className="space-y-2">{tickets.map((ticket) => <button key={ticket.id} type="button" onClick={() => openTicket(ticket.id)} className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-orange-300 hover:shadow-md"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><p className="text-sm font-black text-slate-900">{ticket.ticket_number}</p>{ticket.status === "answered" && !ticket.student_seen_reply_at && <span className="h-2 w-2 rounded-full bg-orange-500" aria-label="Nova resposta" />}</div><p className="mt-1 truncate text-xs font-semibold text-orange-600">{getHelpContactReasonLabel(ticket.contact_reason)}</p><p className="mt-2 line-clamp-1 text-sm text-slate-500">{ticket.latest_message?.message || "Sem mensagens"}</p></div><div className="shrink-0 text-right"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${ticket.status === "open" ? "bg-amber-100 text-amber-700" : ticket.status === "answered" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{statusLabel(ticket.status)}</span><p className="mt-2 text-[10px] text-slate-400">{formatDate(ticket.updated_at)}</p></div></div></button>)}</div>}</div>
          )}
        </div>
      </div>
    </div>
  );
}
