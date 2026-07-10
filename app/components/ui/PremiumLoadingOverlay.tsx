"use client";

import { Loader2 } from "lucide-react";

export default function PremiumLoadingOverlay({
  show,
  title = "Processando...",
  message = "Aguarde enquanto o sistema conclui esta ação.",
}: {
  show: boolean;
  title?: string;
  message?: string;
}) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/75 px-4">
      <div className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-white/15 bg-[#080b12] p-7 text-center text-white shadow-2xl">
        <div className="pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full bg-orange-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -right-14 h-44 w-44 rounded-full bg-amber-400/20 blur-3xl" />

        <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-orange-500 to-amber-400 text-slate-950 shadow-xl shadow-orange-500/25">
          <Loader2 className="animate-spin" size={28} />
        </div>

        <p className="relative mt-5 text-[11px] font-semibold uppercase tracking-[0.28em] text-orange-300">
          EstudoTOP Simulados
        </p>

        <h2 className="relative mt-2 text-xl font-semibold tracking-tight text-white">
          {title}
        </h2>

        <p className="relative mt-2 text-sm leading-6 text-slate-300">
          {message}
        </p>

        <div className="relative mt-6 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-orange-500 to-amber-400" />
        </div>
      </div>
    </div>
  );
}
