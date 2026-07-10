"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LifeBuoy, Loader2, Send, Sparkles } from "lucide-react";
import { adminFetch } from "@/app/lib/supabase/adminFetch";

type StudentRef = { name: string | null; email: string | null };

export type HelpMessageRow = {
  id: string;
  message: string;
  status: "open" | "answered";
  admin_reply: string | null;
  replied_at: string | null;
  created_at: string;
  student_id: string;
  students: StudentRef | StudentRef[] | null;
};

type TabKey = "open" | "answered" | "all";

function studentRef(value: HelpMessageRow["students"]): StudentRef | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export default function AjudaAdminClient({ initialMessages }: { initialMessages: HelpMessageRow[] }) {
  const [messages, setMessages] = useState<HelpMessageRow[]>(initialMessages);
  const [activeTab, setActiveTab] = useState<TabKey>("open");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);

  const load = useCallback(async (tab: TabKey) => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (tab !== "all") params.set("status", tab);

    const res = await adminFetch(`/api/admin/help-messages?${params.toString()}`);
    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json.ok) {
      setError(json.message || "Não foi possível carregar as mensagens.");
      setLoading(false);
      return;
    }

    setMessages(json.items || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load(activeTab);
  }, [activeTab, load]);

  const counts = useMemo(
    () => ({
      open: messages.filter((item) => item.status === "open").length,
      answered: messages.filter((item) => item.status === "answered").length,
      all: messages.length,
    }),
    [messages],
  );

  async function handleReply(id: string) {
    const text = (replyDrafts[id] || "").trim();
    if (!text) return;

    setSendingId(id);
    setError(null);

    const res = await adminFetch(`/api/admin/help-messages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_reply: text }),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json.ok) {
      setError(json.message || "Não foi possível enviar a resposta.");
      setSendingId(null);
      return;
    }

    setReplyDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setSendingId(null);
    await load(activeTab);
  }

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "open", label: `Abertas (${counts.open})` },
    { key: "answered", label: `Respondidas (${counts.answered})` },
    { key: "all", label: `Todas (${counts.all})` },
  ];

  return (
    <main className="min-h-screen bg-[#07111F] px-4 pb-20 pt-6 text-white md:px-8 md:pt-10">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[-10%] top-[-10%] h-96 w-96 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="absolute right-[-10%] top-[20%] h-[28rem] w-[28rem] rounded-full bg-blue-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl">
        <section className="overflow-hidden rounded-[2rem] border border-white/[0.08] bg-white/[0.035] p-6 shadow-2xl shadow-black/30 backdrop-blur-xl md:p-8">
          <p className="inline-flex items-center gap-2 rounded-full border border-orange-400/20 bg-orange-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-orange-200">
            <Sparkles size={13} /> Central de Ajuda
          </p>
          <h1 className="mt-5 flex items-center gap-3 text-2xl font-semibold tracking-tight text-white md:text-3xl">
            <LifeBuoy className="text-orange-300" size={26} />
            Mensagens dos alunos
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Veja e responda as mensagens enviadas pelos alunos pelo botão &quot;Ajuda&quot; do menu superior.
          </p>
        </section>

        <section className="mt-5 rounded-[1.75rem] border border-white/[0.07] bg-white/[0.03] p-2 shadow-xl shadow-black/20 backdrop-blur-sm">
          <div className="grid gap-2 md:grid-cols-3">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-2xl px-4 py-3 text-sm font-bold transition ${
                  activeTab === tab.key
                    ? "bg-gradient-to-r from-orange-500 to-amber-400 text-slate-950 shadow-lg shadow-orange-500/20"
                    : "text-slate-400 hover:bg-white/[0.05] hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-5 space-y-4">
          {loading ? (
            <div className="rounded-[1.75rem] border border-white/[0.07] bg-white/[0.03] p-10 text-center text-sm text-slate-400">
              Carregando mensagens...
            </div>
          ) : error ? (
            <div className="rounded-[1.75rem] border border-red-400/20 bg-red-500/10 p-6 text-sm text-red-200">{error}</div>
          ) : messages.length === 0 ? (
            <div className="rounded-[1.75rem] border border-dashed border-white/15 bg-white/[0.03] p-10 text-center text-sm text-slate-400">
              Nenhuma mensagem nesta categoria.
            </div>
          ) : (
            messages.map((item) => {
              const student = studentRef(item.students);
              return (
                <article key={item.id} className="rounded-[1.75rem] border border-white/[0.07] bg-white/[0.03] p-5 shadow-xl shadow-black/20">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-white">{student?.name || "Aluno"}</p>
                      <p className="text-xs text-slate-500">{student?.email || "—"}</p>
                    </div>
                    <div className="flex items-center gap-3">
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
                  </div>

                  <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-slate-200">
                    {item.message}
                  </p>

                  {item.admin_reply ? (
                    <div className="mt-3 rounded-2xl border border-orange-400/20 bg-orange-500/[0.06] p-4">
                      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-orange-300">
                        Sua resposta{item.replied_at ? ` · ${formatDate(item.replied_at)}` : ""}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-200">{item.admin_reply}</p>
                    </div>
                  ) : (
                    <div className="mt-4">
                      <textarea
                        value={replyDrafts[item.id] || ""}
                        onChange={(event) =>
                          setReplyDrafts((current) => ({ ...current, [item.id]: event.target.value }))
                        }
                        placeholder="Escreva sua resposta..."
                        rows={3}
                        className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-orange-300/60 focus:ring-4 focus:ring-orange-500/10"
                      />
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleReply(item.id)}
                          disabled={sendingId === item.id || !(replyDrafts[item.id] || "").trim()}
                          className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-orange-500/20 transition disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {sendingId === item.id ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                          Enviar resposta
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </section>
      </div>
    </main>
  );
}
