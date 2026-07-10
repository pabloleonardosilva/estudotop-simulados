"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Sparkles, X } from "lucide-react";

const STEPS = [
  {
    title: "Nossas corujas especialistas criam simulados realistas",
    image: "/images/comofunciona/001.png",
  },
  {
    title: "Montamos a Jornada focada no seu concurso",
    image: "/images/comofunciona/002.png",
  },
  {
    title: "Você é inserido no sistema e na sua Jornada",
    image: "/images/comofunciona/003.png",
  },
  {
    title: "Os simulados são liberados aos poucos",
    image: "/images/comofunciona/004.png",
  },
  {
    title: "Resolva, acompanhe seus resultados e evolua",
    image: "/images/comofunciona/005.png",
  },
  {
    title: "Então você aprende e vence!",
    image: "/images/comofunciona/006.png",
  },
];

export default function StudentJourneyExplainerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [transitionPhase, setTransitionPhase] = useState<"idle" | "out" | "in">("idle");
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeStep = STEPS[step];
  const isFirstStep = step === 0;
  const isLastStep = step === STEPS.length - 1;

  function clearTransitionTimer() {
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
  }

  function goToStep(nextStep: number) {
    const safeStep = Math.max(0, Math.min(nextStep, STEPS.length - 1));
    if (safeStep === step) return;

    clearTransitionTimer();
    setTransitionPhase("out");

    transitionTimerRef.current = setTimeout(() => {
      setStep(safeStep);
      setTransitionPhase("in");

      transitionTimerRef.current = setTimeout(() => {
        setTransitionPhase("idle");
        transitionTimerRef.current = null;
      }, 360);
    }, 150);
  }

  useEffect(() => {
    if (!open) return;
    clearTransitionTimer();
    setStep(0);
    setTransitionPhase("idle");
  }, [open]);

  useEffect(() => {
    return () => clearTransitionTimer();
  }, []);

  if (!open) return null;

  function goPrevious() {
    goToStep(step - 1);
  }

  function goNext() {
    if (isLastStep) {
      onClose();
      return;
    }

    goToStep(step + 1);
  }

  return (
    <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-[rgba(3,10,24,0.70)] px-4 py-4 backdrop-blur-[10px]">
      <div className="relative flex max-h-[calc(100dvh-32px)] min-h-0 w-full max-w-[1180px] flex-col overflow-hidden rounded-[28px] border border-white/60 bg-[radial-gradient(circle_at_top_left,rgba(255,138,0,0.055),transparent_30%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.065),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.985),rgba(248,250,252,0.985))] p-5 shadow-[0_30px_80px_rgba(15,23,42,0.30),0_12px_30px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.75)] sm:p-7 lg:min-h-[760px]">
        <div className="relative flex items-start justify-between gap-5">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full border border-orange-300/20 bg-gradient-to-b from-[#fff8ef] to-[#fff1df] text-orange-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_10px_18px_rgba(249,115,22,0.08)]">
              <Sparkles size={21} strokeWidth={2.3} />
            </span>
            <div className="min-w-0 pb-1">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-orange-500 sm:text-xs">Como o EstudoTOP funciona</p>
              <h2 className="mt-2 text-[1.65rem] font-black leading-[1.05] tracking-[-0.04em] text-slate-950 sm:text-[2.125rem]">
                Da sua matrícula aos seus resultados
              </h2>
              <p className="mt-2 max-w-3xl text-sm font-medium leading-[1.55] text-slate-500 sm:text-base">
                Avance pelas telas e entenda como sua Jornada organiza simulados, liberações e diagnósticos.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar explicação"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-orange-300/20 bg-gradient-to-b from-[#fff8ef] to-[#f6efe4] text-orange-500 shadow-[0_10px_24px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.75)] transition hover:scale-105 hover:border-orange-300/40 hover:text-orange-600 sm:h-14 sm:w-14"
          >
            <X size={24} strokeWidth={2.1} />
          </button>
        </div>

        <div className="relative mt-5 flex min-h-0 flex-1 flex-col sm:mt-[22px]">
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-10 py-2 sm:px-16 sm:py-3">
            <button
              type="button"
              onClick={goPrevious}
              disabled={isFirstStep}
              aria-label="Voltar tela"
              className="absolute left-0 top-1/2 z-20 hidden h-[56px] w-[56px] -translate-y-1/2 items-center justify-center rounded-full border border-slate-200/80 bg-gradient-to-b from-white to-slate-50 text-slate-500 shadow-[0_14px_30px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.90)] transition hover:-translate-x-0.5 hover:scale-105 hover:border-orange-200 hover:text-orange-500 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-x-0 disabled:hover:scale-100 sm:flex xl:left-1"
            >
              <ArrowLeft size={24} />
            </button>

            <div className="mx-auto w-full max-w-[920px]">
              <div
                className={`relative flex items-center justify-center will-change-transform transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  transitionPhase === "out"
                    ? "scale-[0.975] translate-y-2 opacity-0 blur-[5px]"
                    : transitionPhase === "in"
                      ? "scale-[1.012] -translate-y-1 opacity-0 blur-[4px]"
                      : "scale-100 translate-y-0 opacity-100 blur-0"
                }`}
              >
                <img
                  src={activeStep.image}
                  alt={activeStep.title}
                  className="block max-h-[calc(100dvh-250px)] w-full select-none rounded-[20px] object-contain shadow-[0_18px_45px_rgba(15,23,42,0.10)] sm:max-h-[530px]"
                  draggable={false}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={goNext}
              aria-label={isLastStep ? "Concluir explicação" : "Próxima tela"}
              className="absolute right-0 top-1/2 z-20 hidden h-[56px] w-[56px] -translate-y-1/2 items-center justify-center rounded-full border border-orange-400/70 bg-gradient-to-br from-[#ffb020] via-[#ff8a00] to-orange-500 text-white shadow-[0_16px_34px_rgba(249,115,22,0.24),inset_0_1px_0_rgba(255,255,255,0.28)] transition hover:translate-x-0.5 hover:scale-105 sm:flex xl:right-1"
            >
              {isLastStep ? <X size={23} /> : <ArrowRight size={24} />}
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex items-center justify-center gap-2 sm:justify-start">
              {STEPS.map((item, index) => {
                const isActive = index === step;
                const isDone = index < step;
                return (
                  <button
                    key={item.image}
                    type="button"
                    onClick={() => goToStep(index)}
                    aria-label={`Ir para a tela ${index + 1}`}
                    className={`rounded-full transition-all duration-300 ${
                      isActive
                        ? "h-3 w-[42px] bg-gradient-to-r from-[#ff8a00] to-orange-500 shadow-[0_6px_18px_rgba(249,115,22,0.18)]"
                        : isDone
                          ? "h-2.5 w-2.5 bg-emerald-500"
                          : "h-2.5 w-2.5 bg-slate-200 hover:bg-slate-300"
                    }`}
                  />
                );
              })}
            </div>

            <div className="flex items-center justify-center gap-2 sm:hidden">
              <button
                type="button"
                onClick={goPrevious}
                disabled={isFirstStep}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-600 shadow-sm transition disabled:cursor-not-allowed disabled:opacity-45"
              >
                <ArrowLeft size={16} />
                Voltar
              </button>
              <button
                type="button"
                onClick={goNext}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 px-5 text-sm font-black text-white shadow-[0_15px_30px_rgba(255,138,0,0.22)]"
              >
                {isLastStep ? "Entendi" : "Próximo"}
                {!isLastStep && <ArrowRight size={16} />}
              </button>
            </div>

            <span className="hidden text-sm font-extrabold text-slate-500 sm:block">
              <strong className="font-black text-slate-700">{step + 1}</strong> de {STEPS.length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
