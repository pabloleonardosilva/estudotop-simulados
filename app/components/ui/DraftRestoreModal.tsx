"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileClock, Trash2, RotateCcw } from "lucide-react";
import PremiumButton from "./PremiumButton";

export default function DraftRestoreModal({
  open,
  savedAt,
  onContinue,
  onDiscard,
}: {
  open: boolean;
  savedAt?: string;
  onContinue: () => void;
  onDiscard: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!open || !mounted) return null;

  const savedLabel = savedAt
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(savedAt))
    : null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/75 px-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg overflow-hidden rounded-[2rem] border border-orange-400/25 bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950 p-7 text-white shadow-2xl shadow-orange-950/40 animate-in fade-in zoom-in-95 slide-in-from-bottom-3 duration-200">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-orange-600 via-amber-400 to-yellow-300" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-orange-500/15 blur-3xl" />
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-orange-400/10 text-orange-300 ring-1 ring-orange-400/20 shadow-xl">
          <FileClock size={28} />
        </div>

        <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-300">
          Rascunho encontrado
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-white">
          Continuar de onde parou?
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Existe um rascunho salvo neste navegador
          {savedLabel ? ` em ${savedLabel}` : ""}. Ele só será aplicado se você confirmar.
        </p>

        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <PremiumButton icon={<RotateCcw size={18} />} onClick={onContinue} full>
            Continuar de onde parei
          </PremiumButton>
          <PremiumButton variant="danger" icon={<Trash2 size={18} />} onClick={onDiscard} full>
            Descartar rascunho
          </PremiumButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
