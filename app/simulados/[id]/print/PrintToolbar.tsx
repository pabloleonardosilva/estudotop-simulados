"use client";

import { ArrowLeft, ChevronLeft, ChevronRight, Files, Monitor, Printer } from "lucide-react";

function buildHref(simuladoId: string, mode: "slide" | "continuous", question?: number) {
  const params = new URLSearchParams({ popup: "1", mode });
  if (mode === "slide" && question) params.set("question", String(question));
  return `/simulados/${simuladoId}/print?${params.toString()}`;
}

export default function PrintToolbar({
  simuladoId,
  mode,
  currentQuestion,
  totalQuestions,
}: {
  simuladoId: string;
  mode: "slide" | "continuous";
  currentQuestion: number;
  totalQuestions: number;
}) {
  const previousQuestion = Math.max(1, currentQuestion - 1);
  const nextQuestion = Math.min(totalQuestions, currentQuestion + 1);

  function leavePrintMode() {
    const fallbackUrl = `/simulados/${simuladoId}`;

    window.close();
    window.setTimeout(() => {
      if (!window.closed) window.location.assign(fallbackUrl);
    }, 150);
  }

  return (
    <div className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1640px] flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={leavePrintMode}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
        >
          <ArrowLeft size={17} />
          Sair do modo printar
        </button>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <a
            href={buildHref(simuladoId, "slide", currentQuestion)}
            className={`inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-bold transition ${
              mode === "slide"
                ? "border-orange-500 bg-orange-50 text-orange-700"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Monitor size={17} />
            Captura para slide
          </a>
          <a
            href={buildHref(simuladoId, "continuous")}
            className={`inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-bold transition ${
              mode === "continuous"
                ? "border-orange-500 bg-orange-50 text-orange-700"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Files size={17} />
            Lista contínua
          </a>
        </div>

        <div className="flex items-center gap-2">
          {mode === "slide" ? (
            <>
              <a
                aria-disabled={currentQuestion <= 1}
                href={buildHref(simuladoId, "slide", previousQuestion)}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition ${
                  currentQuestion <= 1
                    ? "pointer-events-none border-slate-200 bg-slate-100 text-slate-300"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
                title="Questão anterior"
              >
                <ChevronLeft size={18} />
              </a>
              <span className="min-w-[84px] text-center text-sm font-bold text-slate-600">
                {currentQuestion} / {totalQuestions}
              </span>
              <a
                aria-disabled={currentQuestion >= totalQuestions}
                href={buildHref(simuladoId, "slide", nextQuestion)}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition ${
                  currentQuestion >= totalQuestions
                    ? "pointer-events-none border-slate-200 bg-slate-100 text-slate-300"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
                title="Próxima questão"
              >
                <ChevronRight size={18} />
              </a>
            </>
          ) : null}

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-slate-800"
          >
            <Printer size={17} />
            Imprimir
          </button>
        </div>
      </div>
    </div>
  );
}
