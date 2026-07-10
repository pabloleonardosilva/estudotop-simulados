"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  BadgeCheck,
  CheckCircle2,
  CircleAlert,
  CopyCheck,
  FileCheck2,
  HelpCircle,
  Loader2,
  Send,
  ShieldAlert,
  ShieldQuestion,
  TriangleAlert,
  X,
  XCircle,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import PremiumButton from "../ui/PremiumButton";

export type QuestionActionModalTone =
  | "success"
  | "error"
  | "warning"
  | "confirm"
  | "publish"
  | "review"
  | "duplicate";

export type QuestionActionModalState =
  | {
      open: true;
      tone: QuestionActionModalTone;
      title: string;
      message?: string;
      primaryLabel?: string;
      secondaryLabel?: string;
      loading?: boolean;
      steps?: string[];
      stepWeights?: number[];  // porcentagem individual de cada tarefa (soma ≤ 100)
      currentStep?: number;
      children?: ReactNode;
      onPrimary?: () => void | Promise<void>;
      onSecondary?: () => void;
      onClose?: () => void;
    }
  | null;

const toneConfig = {
  success: { icon: CheckCircle2, eyebrow: "Sucesso", color: "text-emerald-300", bg: "bg-emerald-400/10", ring: "ring-emerald-400/20" },
  error: { icon: XCircle, eyebrow: "Erro", color: "text-red-300", bg: "bg-red-400/10", ring: "ring-red-400/20" },
  warning: { icon: TriangleAlert, eyebrow: "Aviso", color: "text-amber-300", bg: "bg-amber-400/10", ring: "ring-amber-400/20" },
  confirm: { icon: ShieldQuestion, eyebrow: "Confirmação", color: "text-orange-300", bg: "bg-orange-400/10", ring: "ring-orange-400/20" },
  publish: { icon: BadgeCheck, eyebrow: "Publicação", color: "text-orange-300", bg: "bg-orange-400/10", ring: "ring-orange-400/20" },
  review: { icon: FileCheck2, eyebrow: "Revisão", color: "text-orange-300", bg: "bg-orange-400/10", ring: "ring-orange-400/20" },
  duplicate: { icon: CopyCheck, eyebrow: "Duplicidade", color: "text-amber-300", bg: "bg-amber-400/10", ring: "ring-amber-400/20" },
};

export function questionActionIcon(tone: QuestionActionModalTone) {
  if (tone === "publish") return Send;
  if (tone === "review") return FileCheck2;
  if (tone === "duplicate") return ShieldAlert;
  if (tone === "confirm") return HelpCircle;
  if (tone === "warning") return TriangleAlert;
  if (tone === "error") return CircleAlert;
  return CheckCircle2;
}

function StepPct({ active, done }: { active: boolean; done: boolean }) {
  const [pct, setPct] = useState(done ? 100 : 0);

  useEffect(() => {
    if (done) { setPct(100); return; }
    if (!active) { setPct(0); return; }
    let cur = 0;
    setPct(0);
    const id = setInterval(() => {
      cur += Math.random() * 4 + 1.5;
      if (cur >= 88) { clearInterval(id); setPct(88); return; }
      setPct(Math.round(cur));
    }, 90);
    return () => clearInterval(id);
  }, [active, done]);

  if (done) return <span className="text-xs font-black text-emerald-300">100%</span>;
  if (active) return <span className="text-xs font-black text-orange-300">{pct}%</span>;
  return <span className="text-xs font-bold text-slate-700">0%</span>;
}

export default function QuestionActionModal({ modal }: { modal: QuestionActionModalState }) {
  const open = Boolean(modal?.open);

  return (
    <AnimatePresence>
      {open && modal && (
        <motion.div
          className="fixed inset-0 z-[10000] flex items-center justify-center px-4"
          style={{ backgroundColor: "rgba(2,6,23,0.78)" }}
          initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
          animate={{ opacity: 1, backdropFilter: "blur(10px)" }}
          exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
          transition={{ duration: 0.18 }}
          onClick={() => {
            if (!modal.loading) modal.onClose?.();
          }}
        >
          <motion.div
            className="relative w-full max-w-lg overflow-hidden rounded-[2rem] border border-orange-400/25 bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950 p-7 text-white shadow-2xl shadow-orange-950/40"
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            onClick={(event) => event.stopPropagation()}
          >
            {!modal.loading && (
              <button
                type="button"
                onClick={modal.onClose}
                className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/10 hover:text-white"
                aria-label="Fechar modal"
              >
                <X size={18} />
              </button>
            )}

            <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-orange-600 via-amber-400 to-yellow-300" />
            <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-orange-500/15 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-24 h-56 w-56 rounded-full bg-amber-400/10 blur-3xl" />
            <ModalBody modal={modal} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ModalBody({ modal }: { modal: NonNullable<QuestionActionModalState> }) {
  const config = toneConfig[modal.tone];
  const hasSteps = Boolean(modal.steps?.length);
  const Icon = modal.loading ? Loader2 : config.icon;
  const primaryLabel = modal.primaryLabel || (modal.tone === "success" ? "Concluir" : "Entendi");

  const submittingRef = useRef(false);
  useEffect(() => {
    if (!modal.loading) submittingRef.current = false;
  }, [modal.loading, modal.title]);

  const current = modal.currentStep ?? 0;
  const progress = hasSteps ? Math.round(((current + 1) / modal.steps!.length) * 100) : undefined;

  return (
    <>
      <div className={`relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 shadow-xl ${modal.loading ? "bg-orange-500 text-white shadow-orange-500/25" : `${config.bg} ${config.color} ring-1 ${config.ring}`}`}>
        <Icon size={28} className={modal.loading ? "animate-spin" : ""} />
      </div>

      <p className={`relative mt-5 text-xs font-black uppercase tracking-[0.22em] ${modal.loading ? "text-orange-300" : config.color}`}>
        {config.eyebrow}
      </p>
      <h2 className="relative mt-2 text-2xl font-black tracking-tight text-white">{modal.title}</h2>
      {modal.message && (
        <p className="relative mt-3 text-sm leading-6 text-slate-300">{modal.message}</p>
      )}
      {!hasSteps && modal.children && (
        <div className="relative mt-4 text-sm leading-6 text-slate-300">{modal.children}</div>
      )}

      {hasSteps && (
        <>
          <div className="relative mt-6 h-3 overflow-hidden rounded-full bg-white/10 shadow-inner shadow-black/40">
            <div
              className={`h-full rounded-full transition-all duration-500 ${modal.tone === "error" ? "bg-red-500" : "bg-gradient-to-r from-orange-600 via-amber-400 to-yellow-300"}`}
              style={{ width: `${progress ?? 0}%` }}
            />
          </div>

          <div className="relative mt-5 grid gap-2">
            {modal.steps!.map((step, index) => {
              const done = index < current || !modal.loading;
              const active = index === current && Boolean(modal.loading);
              const fill = done ? "100%" : active ? "72%" : "0%";

              return (
                <div
                  key={step}
                  className={`relative overflow-hidden rounded-2xl border px-3 py-2.5 text-sm transition ${
                    done
                      ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100"
                      : active
                        ? "border-orange-400/35 bg-orange-500/10 text-orange-50 shadow-lg shadow-orange-950/20"
                        : "border-white/10 bg-white/[0.03] text-slate-400"
                  }`}
                >
                  <div
                    className={`absolute inset-y-0 left-0 transition-all duration-700 ${
                      done
                        ? "bg-emerald-500/25"
                        : active
                          ? "bg-gradient-to-r from-orange-600/45 via-amber-400/25 to-transparent"
                          : "bg-transparent"
                    }`}
                    style={{ width: fill }}
                  />
                  <div className="relative flex items-center gap-3">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black shadow-sm ${done ? "bg-emerald-400 text-slate-950" : active ? "bg-orange-400 text-slate-950" : "bg-white/10 text-slate-300"}`}>
                      {done ? <CheckCircle2 size={14} /> : index + 1}
                    </span>
                    <span className="flex-1 font-black">{step}</span>
                    <StepPct active={active} done={done} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {(!hasSteps || !modal.loading) && (
        <div className="relative mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          {modal.secondaryLabel && (
            <PremiumButton variant="secondary" onClick={modal.onSecondary || modal.onClose} disabled={modal.loading}>
              {modal.secondaryLabel}
            </PremiumButton>
          )}
          <PremiumButton
            variant={modal.tone === "error" ? "danger" : modal.tone === "warning" || modal.tone === "confirm" || modal.tone === "duplicate" ? "secondary" : "primary"}
            onClick={() => {
              if (submittingRef.current || modal.loading) return;
              submittingRef.current = true;
              void (modal.onPrimary || modal.onClose)?.();
            }}
            disabled={modal.loading}
            icon={modal.loading ? <Loader2 className="animate-spin" size={16} /> : undefined}
          >
            {primaryLabel}
          </PremiumButton>
        </div>
      )}
    </>
  );
}
