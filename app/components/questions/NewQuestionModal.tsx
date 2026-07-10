"use client";

import Link from "next/link";
import { ClipboardPaste, Pencil, Sparkles, X } from "lucide-react";

export default function NewQuestionModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/75 px-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-6xl overflow-hidden rounded-[2rem] border border-orange-400/25 bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950 p-7 text-white shadow-2xl shadow-orange-950/40"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-orange-600 via-amber-400 to-yellow-300" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-orange-500/15 blur-3xl" />
        <button
          type="button"
          onClick={onClose}
          className="absolute right-6 top-6 rounded-2xl p-2 text-slate-400 transition hover:bg-white/10 hover:text-white active:scale-95"
        >
          <X size={20} />
        </button>

        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">
          Nova questão
        </p>

        <h2 className="mt-3 text-3xl font-bold text-white">
          Como você quer criar a questão?
        </h2>

        <p className="mt-3 text-sm leading-6 text-slate-300">
          Escolha entre cadastrar manualmente, gerar questões com IA ou importar questões em massa com IA.
        </p>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <Link href="/questoes/nova" onClick={onClose}>
            <div className="h-full rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 transition hover:-translate-y-0.5 hover:border-orange-300/40 hover:bg-white/[0.09] hover:shadow-lg hover:shadow-orange-950/20 active:scale-[0.99]">
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-400/10 text-orange-300 shadow-sm ring-1 ring-orange-400/20">
                <Pencil size={25} />
              </div>

              <h3 className="text-lg font-bold text-white">
                Criar manualmente
              </h3>

              <p className="mt-4 text-sm leading-6 text-slate-300">
                Você digita enunciado, alternativas, gabarito, imagens e explicação.
              </p>
            </div>
          </Link>

          <Link href="/questoes/gerar-ia" onClick={onClose}>
            <div className="h-full rounded-[2rem] border border-orange-200 bg-orange-400/10 p-6 transition hover:-translate-y-0.5 hover:bg-white/[0.09] hover:shadow-lg hover:shadow-orange-950/20 active:scale-[0.99]">
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-400/10 text-orange-300 shadow-sm ring-1 ring-orange-400/20">
                <Sparkles size={25} />
              </div>

              <h3 className="text-lg font-bold text-white">
                Gerar com IA
              </h3>

              <p className="mt-4 text-sm leading-6 text-slate-300">
                A IA cria questões pendentes de revisão com base em banca, assunto e dificuldade.
              </p>
            </div>
          </Link>

          <Link href="/questoes/importar" onClick={onClose}>
            <div className="h-full rounded-[2rem] border border-emerald-400/25 bg-emerald-400/10 p-6 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-white/[0.09] hover:shadow-lg hover:shadow-orange-950/20 active:scale-[0.99]">
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-300 shadow-sm ring-1 ring-emerald-400/20">
                <ClipboardPaste size={25} />
              </div>

              <h3 className="text-lg font-bold text-white">
                Importar com IA
              </h3>

              <p className="mt-4 text-sm leading-6 text-slate-300">
                Cole várias questões em texto bruto e deixe a IA organizar enunciado, alternativas e banca.
              </p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
