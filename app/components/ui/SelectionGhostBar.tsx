"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

type GhostBarAction = {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
};

const actionClasses: Record<NonNullable<GhostBarAction["variant"]>, string> = {
  primary:
    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-orange-500 to-amber-400 px-4 text-[12px] font-bold text-white shadow-md shadow-orange-500/20 transition hover:brightness-110 active:scale-95 disabled:pointer-events-none disabled:opacity-50",
  secondary:
    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-4 text-[12px] font-semibold text-white/90 transition hover:bg-white/20 active:scale-95 disabled:pointer-events-none disabled:opacity-50",
  danger:
    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-red-400/40 bg-red-500/20 px-4 text-[12px] font-semibold text-red-300 transition hover:bg-red-500/30 active:scale-95 disabled:pointer-events-none disabled:opacity-50",
};

export default function SelectionGhostBar({
  count,
  actions,
}: {
  count: number;
  actions: GhostBarAction[];
}) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.97 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-4 left-1/2 z-[9000] w-[min(96vw,1120px)] -translate-x-1/2 rounded-2xl border border-white/10 bg-slate-900/95 px-4 py-2.5 shadow-2xl shadow-slate-950/40 backdrop-blur-2xl ring-1 ring-white/5"
        >
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex shrink-0 items-center gap-2 border-r border-white/10 pr-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-500/20 text-orange-400">
                <CheckCircle2 size={15} />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/40">Seleção</span>
                <span className="text-sm font-black text-white">{count}</span>
              </div>
            </div>

            <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
              {actions.map((action, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={action.onClick}
                  disabled={action.disabled}
                  className={actionClasses[action.variant ?? "secondary"]}
                >
                  {action.icon}
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
