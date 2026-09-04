"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, Loader2 } from "lucide-react";
import PremiumButton from "@/app/components/ui/PremiumButton";
import PremiumModal from "@/app/components/ui/PremiumModal";

export type ReminderInfo = {
  can_send: boolean;
  state: "available" | "cooldown" | "sending";
  last_sent_at: string | null;
  next_available_at: string | null;
};

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function formatLastSent(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

export default function ReminderButton({
  reminder,
  participantCount,
  onSend,
}: {
  reminder: ReminderInfo;
  participantCount: number;
  onSend: () => Promise<{ ok: boolean; message: string }>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const isCooldown = reminder.state === "cooldown";
  const isSendingInProgress = reminder.state === "sending";
  const isDisabled = isCooldown || isSendingInProgress;
  const nextAvailableAt = reminder.next_available_at ? new Date(reminder.next_available_at).getTime() : null;

  useEffect(() => {
    if (!isCooldown) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [isCooldown]);

  const remainingLabel = useMemo(() => (nextAvailableAt ? formatCountdown(nextAvailableAt - now) : ""), [nextAvailableAt, now]);

  if (!reminder.can_send) return null;

  async function confirmSend() {
    setSending(true);
    setError("");
    try {
      const result = await onSend();
      if (result.ok) {
        setConfirming(false);
      } else {
        setError(result.message);
      }
    } finally {
      setSending(false);
    }
  }

  const helperText = isSendingInProgress
    ? "Envio de lembrete em andamento..."
    : isCooldown
      ? <>Novo lembrete disponível em <span className="tabular-nums text-slate-200">{remainingLabel}</span></>
      : null;

  return (
    <div className="flex flex-col items-start gap-2">
      {helperText && (
        <p className="text-xs font-semibold text-slate-400" title={isCooldown ? "Um lembrete foi enviado recentemente." : "Aguarde o envio atual terminar."}>
          {helperText}
        </p>
      )}
      <span title={isDisabled ? (isCooldown ? "Um lembrete foi enviado recentemente." : "Aguarde o envio atual terminar.") : undefined}>
        <PremiumButton
          variant="dark"
          disabled={isDisabled}
          onClick={() => { if (!isDisabled) setConfirming(true); }}
          icon={<BellRing size={17} />}
        >
          Enviar lembrete agora
        </PremiumButton>
      </span>
      {reminder.last_sent_at && (
        <p className="text-[11px] text-slate-500">Último lembrete: {formatLastSent(reminder.last_sent_at)}</p>
      )}

      <PremiumModal
        open={confirming}
        theme="dark"
        title="Enviar lembrete agora?"
        message="Este lembrete será enviado aos participantes elegíveis do Evento."
        dismissible={!sending}
        onClose={() => { if (!sending) { setConfirming(false); setError(""); } }}
        actions={
          <>
            <PremiumButton variant="dark" disabled={sending} onClick={() => { setConfirming(false); setError(""); }}>Cancelar</PremiumButton>
            <PremiumButton variant="dark-primary" disabled={sending} onClick={() => void confirmSend()} icon={sending ? <Loader2 size={16} className="animate-spin" /> : <BellRing size={16} />}>
              {sending ? "Enviando..." : "Enviar lembrete"}
            </PremiumButton>
          </>
        }
      >
        <p className="text-sm text-slate-300">Aproximadamente {participantCount} participante(s) elegível(is) receberão este lembrete por e-mail.</p>
        {error && <p role="alert" className="mt-3 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-300">{error}</p>}
      </PremiumModal>
    </div>
  );
}
