"use client";

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import PremiumButton from "./PremiumButton";

type PremiumModalTone = "success" | "error" | "warning" | "info";
type PremiumModalTheme = "dark" | "light";

const darkToneConfig = {
  success: { icon: CheckCircle2, color: "text-emerald-300", bg: "bg-emerald-400/10", ring: "ring-emerald-400/20", eyebrow: "Sucesso" },
  error: { icon: XCircle, color: "text-red-300", bg: "bg-red-400/10", ring: "ring-red-400/20", eyebrow: "Atenção" },
  warning: { icon: AlertTriangle, color: "text-amber-300", bg: "bg-amber-400/10", ring: "ring-amber-400/20", eyebrow: "Aviso" },
  info: { icon: Info, color: "text-orange-300", bg: "bg-orange-400/10", ring: "ring-orange-400/20", eyebrow: "Informação" },
};

const lightToneConfig = {
  success: { icon: CheckCircle2, color: "text-emerald-600", border: "border-emerald-200", bg: "bg-emerald-50", glow: "bg-emerald-400/10", accent: "from-emerald-500 via-green-400 to-teal-300", eyebrow: "Sucesso" },
  error: { icon: XCircle, color: "text-red-600", border: "border-red-200", bg: "bg-red-50", glow: "bg-red-400/10", accent: "from-red-500 via-rose-500 to-orange-400", eyebrow: "Atenção" },
  warning: { icon: AlertTriangle, color: "text-amber-600", border: "border-amber-200", bg: "bg-amber-50", glow: "bg-amber-400/10", accent: "from-orange-500 via-amber-400 to-yellow-300", eyebrow: "Aviso" },
  info: { icon: Info, color: "text-orange-600", border: "border-orange-200", bg: "bg-orange-50", glow: "bg-orange-400/10", accent: "from-orange-500 via-amber-400 to-yellow-300", eyebrow: "Informação" },
};

export default function PremiumModal({
  open,
  tone = "info",
  theme = "dark",
  icon,
  title,
  message,
  children,
  actions,
  onClose,
  closeLabel = "Entendi",
  dismissible = true,
}: {
  open: boolean;
  tone?: PremiumModalTone;
  theme?: PremiumModalTheme;
  icon?: ReactNode;
  title: string;
  message?: string;
  children?: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  dismissible?: boolean;
}) {
  if (!open) return null;

  if (theme === "light") {
    const config = lightToneConfig[tone];
    const Icon = config.icon;

    return (
      <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div className={`relative w-full max-w-lg overflow-hidden rounded-[2rem] border ${config.border} bg-white p-7 text-slate-950 shadow-2xl animate-in fade-in zoom-in-95 slide-in-from-bottom-3 duration-200`}>
          <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${config.accent}`} />
          <div className={`pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full ${config.glow} blur-3xl`} />

          <div className="relative flex items-start justify-between gap-4">
            <div className={`flex items-center justify-center rounded-2xl ${config.bg} ${config.color} ${icon ? "h-16 w-16" : "h-14 w-14"}`}>
              {icon || <Icon size={26} />}
            </div>

            {dismissible && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Fechar modal"
              >
                <X size={18} />
              </button>
            )}
          </div>

          <p className={`relative mt-5 text-xs font-bold uppercase tracking-[0.18em] ${config.color}`}>
            {config.eyebrow}
          </p>
          <h2 className="relative mt-2 text-2xl font-semibold text-slate-950">{title}</h2>

          {message && <p className="relative mt-3 text-sm leading-6 text-slate-600">{message}</p>}
          {children && <div className="relative mt-4 text-sm leading-6 text-slate-600">{children}</div>}

          <div className="relative mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            {actions || (
              <PremiumButton onClick={onClose} full>
                {closeLabel}
              </PremiumButton>
            )}
          </div>
        </div>
      </div>
    );
  }

  const config = darkToneConfig[tone];
  const Icon = config.icon;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/75 px-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg overflow-hidden rounded-[2rem] border border-orange-400/25 bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950 p-7 text-white shadow-2xl shadow-orange-950/40 animate-in fade-in zoom-in-95 slide-in-from-bottom-3 duration-200">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-orange-600 via-amber-400 to-yellow-300" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-orange-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-56 w-56 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div className={`flex items-center justify-center rounded-2xl border border-white/10 shadow-xl ${config.bg} ${config.color} ring-1 ${config.ring} ${icon ? "h-16 w-16" : "h-14 w-14"}`}>
            {icon || <Icon size={28} />}
          </div>

          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/10 hover:text-white"
              aria-label="Fechar modal"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <p className={`relative mt-5 text-xs font-black uppercase tracking-[0.22em] ${config.color}`}>
          {config.eyebrow}
        </p>
        <h2 className="relative mt-2 text-2xl font-black tracking-tight text-white">{title}</h2>

        {message && <p className="relative mt-3 text-sm leading-6 text-slate-300">{message}</p>}
        {children && <div className="relative mt-4 text-sm leading-6 text-slate-300">{children}</div>}

        <div className="relative mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          {actions || (
            <PremiumButton onClick={onClose} full>
              {closeLabel}
            </PremiumButton>
          )}
        </div>
      </div>
    </div>
  );
}
