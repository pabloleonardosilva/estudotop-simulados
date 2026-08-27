"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Clock3, Loader2, RotateCcw, Settings2, Square, Unlock } from "lucide-react";
import PremiumButton from "@/app/components/ui/PremiumButton";
import PremiumInput from "@/app/components/ui/PremiumInput";
import PremiumModal from "@/app/components/ui/PremiumModal";

type ControlAction = "manual" | "immediate" | "close" | "reopen";

function localDateTime(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

const statusLabels: Record<string, string> = { scheduled: "Aguardando", active: "Em andamento", closed: "Encerrado", archived: "Arquivado" };

export default function SimuladoControlMenu({
  status,
  resultPolicy,
  busy,
  onAction,
}: {
  status: string;
  resultPolicy: string;
  busy: boolean;
  onAction: (action: ControlAction, payload?: Record<string, string>) => Promise<{ ok: boolean; message: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<ControlAction | null>(null);
  const [reopenEndsAt, setReopenEndsAt] = useState("");
  const [reopenMinimum, setReopenMinimum] = useState("");
  const [actionError, setActionError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function closeMenu(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (confirmation) setConfirmation(null);
      else if (open) { setOpen(false); buttonRef.current?.focus(); }
    }
    document.addEventListener("mousedown", closeMenu);
    window.addEventListener("keydown", handleEscape);
    return () => { document.removeEventListener("mousedown", closeMenu); window.removeEventListener("keydown", handleEscape); };
  }, [confirmation, open]);

  function request(action: ControlAction) {
    setOpen(false);
    setActionError("");
    if (action === "reopen") {
      const currentTime = new Date();
      setReopenMinimum(localDateTime(currentTime));
      setReopenEndsAt(localDateTime(new Date(currentTime.getTime() + 2 * 60 * 60 * 1000)));
    }
    setConfirmation(action);
  }

  async function confirm() {
    if (!confirmation) return;
    const payload: Record<string, string> = confirmation === "manual"
      ? { action: "set_result_policy", result_policy: "blocked" }
      : confirmation === "immediate"
        ? { action: "set_result_policy", result_policy: "released" }
        : confirmation === "reopen"
          ? { action: "reopen", ends_at: new Date(reopenEndsAt).toISOString() }
          : { action: "close" };
    const result = await onAction(confirmation, payload);
    if (result.ok) {
      setConfirmation(null);
      window.setTimeout(() => buttonRef.current?.focus(), 0);
    } else {
      setActionError(result.message);
    }
  }

  const modal = confirmation ? {
    manual: { title: "Ativar liberação manual?", message: "O aluno poderá concluir normalmente, mas resultados ainda pendentes aguardarão uma liberação posterior. Resultados que já foram liberados permanecem disponíveis.", label: "Ativar liberação manual", tone: "info" as const },
    immediate: { title: "Ativar liberação imediata?", message: "O aluno terá acesso ao resultado assim que concluir. Ao confirmar, resultados pendentes de alunos que já concluíram também serão liberados pelo fluxo oficial.", label: "Ativar liberação imediata", tone: "info" as const },
    close: { title: "Encerrar simulado?", message: "Novas tentativas serão bloqueadas. Participantes que já estejam realizando poderão concluir normalmente, e tentativas e resultados existentes serão preservados.", label: "Encerrar simulado", tone: "warning" as const },
    reopen: { title: "Reabrir simulado?", message: "O Evento voltará a aceitar acessos até o novo término. Participantes, tentativas, resultados, liberações e histórico serão preservados.", label: "Reabrir simulado", tone: "info" as const },
  }[confirmation] : null;

  return <>
    <div ref={rootRef} className="relative">
      <button ref={buttonRef} type="button" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((current) => !current)} className={`inline-flex min-h-12 items-center gap-2 rounded-[15px] border bg-white px-4 text-sm font-bold text-slate-700 shadow-[0_10px_26px_rgba(15,23,42,0.06)] transition hover:border-orange-200 hover:text-orange-700 focus:outline-none focus:ring-4 focus:ring-orange-100 ${open ? "border-orange-200 ring-4 ring-orange-50" : "border-slate-200"}`}>
        <Settings2 size={17} /> Controle do simulado <ChevronDown size={15} className={`transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div role="menu" className="absolute left-0 z-50 mt-2 w-[min(340px,calc(100vw-40px))] overflow-hidden rounded-[22px] border border-slate-200 bg-white p-3 shadow-[0_24px_70px_rgba(15,23,42,0.16)] sm:left-auto sm:right-0">
        <div className="px-3 pb-3 pt-2"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Controle do simulado</p><div className="mt-3 flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">Status</span><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{statusLabels[status] || status}</span></div></div>
        <div className="border-t border-slate-100 px-1 py-3"><p className="px-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Liberação dos resultados</p>{(["blocked", "released"] as const).map((policy) => { const active = resultPolicy === policy; return <button key={policy} role="menuitemradio" aria-checked={active} disabled={busy || status === "archived"} onClick={() => !active && request(policy === "blocked" ? "manual" : "immediate")} className={`mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-55 ${active ? "bg-orange-50 text-orange-800" : "text-slate-700 hover:bg-slate-50"}`}><span className={`flex h-5 w-5 items-center justify-center rounded-full border ${active ? "border-orange-500 bg-orange-500 text-white" : "border-slate-300"}`}>{active && <Check size={12} strokeWidth={3} />}</span>{policy === "blocked" ? "Liberação manual" : "Liberação imediata"}</button>; })}</div>
        {status !== "archived" && <div className="border-t border-slate-100 p-1 pt-3">{status === "active" ? <button role="menuitem" disabled={busy} onClick={() => request("close")} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"><Square size={16} /> Encerrar simulado</button> : status === "closed" ? <button role="menuitem" disabled={busy} onClick={() => request("reopen")} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"><RotateCcw size={16} /> Reabrir simulado</button> : null}</div>}
      </div>}
    </div>
    <PremiumModal open={Boolean(modal)} theme="light" tone={modal?.tone} title={modal?.title || ""} message={modal?.message} dismissible={!busy} onClose={() => { if (!busy) { setConfirmation(null); setActionError(""); } }} actions={<><PremiumButton variant="secondary" disabled={busy} onClick={() => { setConfirmation(null); setActionError(""); }}>Cancelar</PremiumButton><PremiumButton variant={confirmation === "close" ? "danger" : "primary"} disabled={busy || (confirmation === "reopen" && (!reopenEndsAt || reopenEndsAt <= reopenMinimum))} onClick={() => void confirm()} icon={busy ? <Loader2 size={16} className="animate-spin" /> : confirmation === "close" ? <Square size={16} /> : confirmation === "reopen" ? <RotateCcw size={16} /> : <Unlock size={16} />}>{busy ? "Salvando..." : modal?.label}</PremiumButton></>}>
      {confirmation === "reopen" && <div className="mt-4"><PremiumInput label="Novo término — horário local" type="datetime-local" min={reopenMinimum} value={reopenEndsAt} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setReopenEndsAt(event.target.value)} icon={<Clock3 size={15} />} /></div>}
      {actionError && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{actionError}</p>}
    </PremiumModal>
  </>;
}
