"use client";

import { useCallback, useEffect, useState } from "react";
import { LifeBuoy, Loader2, Send, X } from "lucide-react";
import { supabase } from "@/app/lib/supabase/client";
import PremiumButton from "@/app/components/ui/PremiumButton";

type HelpMessage = {
  id: string;
  message: string;
  status: "open" | "answered";
  admin_reply: string | null;
  replied_at: string | null;
  created_at: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export default function HelpCenterModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<HelpMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setError("Sessão expirada. Recarregue a página.");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/student/help-messages", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json.ok) {
      setError(json.message || "Não foi possível carregar suas mensagens.");
      setLoading(false);
      return;
    }

    setMessages(json.messages || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  async function handleSend() {
    const text = draft.trim();
    if (!text) return;

    setSending(true);
    setSendError(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setSendError("Sessão expirada. Recarregue a página.");
      setSending(false);
      return;
    }

    const res = await fetch("/api/student/help-messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ message: text }),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json.ok) {
      setSendError(json.message || "Não foi possível enviar sua mensagem.");
      setSending(false);
      return;
    }

    setDraft("");
    setSending(false);
    await load();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm">
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#0B111C] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-300">
              <LifeBuoy size={20} />
            </span>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-orange-300">Central de Ajuda</p>
              <h2 className="text-lg font-black text-white">Fale com a gente</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="border-b border-white/10 px-6 py-5">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Escreva sua dúvida ou mensagem..."
            rows={3}
            maxLength={2000}
            className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-orange-300/60 focus:ring-4 focus:ring-orange-500/10"
          />
          {sendError ? <p className="mt-2 text-xs font-semibold text-red-300">{sendError}</p> : null}
          <div className="mt-3 flex justify-end">
            <PremiumButton variant="dark-primary" onClick={handleSend} disabled={sending || !draft.trim()}>
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              Enviar mensagem
            </PremiumButton>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <p className="mb-3 text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Histórico</p>

          {loading ? (
            <p className="py-8 text-center text-sm text-slate-400">Carregando...</p>
          ) : error ? (
            <p className="py-8 text-center text-sm text-red-300">{error}</p>
          ) : messages.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Você ainda não enviou nenhuma mensagem.</p>
          ) : (
            <div className="space-y-4">
              {messages.map((item) => (
                <div key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={
                        item.status === "answered"
                          ? "inline-flex items-center rounded-full border border-emerald-500/25 bg-emerald-500/[0.08] px-3 py-1 text-[11px] font-bold text-emerald-300"
                          : "inline-flex items-center rounded-full border border-amber-500/25 bg-amber-500/[0.08] px-3 py-1 text-[11px] font-bold text-amber-300"
                      }
                    >
                      {item.status === "answered" ? "Respondida" : "Aguardando resposta"}
                    </span>
                    <span className="text-xs text-slate-500">{formatDate(item.created_at)}</span>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-slate-200">{item.message}</p>

                  {item.admin_reply ? (
                    <div className="mt-3 rounded-2xl border border-orange-400/20 bg-orange-500/[0.06] p-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-orange-300">
                        Resposta{item.replied_at ? ` · ${formatDate(item.replied_at)}` : ""}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-200">{item.admin_reply}</p>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
