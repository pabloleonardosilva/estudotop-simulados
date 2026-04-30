"use client";

import Link from "next/link";
import { Clock, ShieldAlert } from "lucide-react";

const alternativas = [
  "É uma cópia completa e definitiva dos dados.",
  "É uma cópia incremental feita somente em nuvem.",
  "É um recurso usado para recuperar informações em caso de perda.",
  "É um antivírus nativo do Windows.",
  "É um protocolo de comunicação entre navegadores.",
];

export default function ExecucaoSimuladoPage() {
  return (
    <main className="min-h-screen bg-[#080b12] px-4 py-6 text-white sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-400">SES-MG Informática</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Questão 1 de 20</h1>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-3"><Clock size={17} className="text-orange-300" /> 01:42</div>
            <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-3"><ShieldAlert size={17} className="text-orange-300" /> Modo prova</div>
          </div>
        </header>

        <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 shadow-2xl sm:p-8">
          <div className="mb-6 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-[5%] rounded-full bg-gradient-to-r from-orange-500 to-amber-400" />
          </div>

          <p className="text-lg leading-8 text-slate-100">
            Sobre segurança da informação, assinale a alternativa que melhor representa a finalidade de um backup.
          </p>

          <div className="mt-7 grid gap-3">
            {alternativas.map((alt, index) => (
              <button key={alt} className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-left text-sm leading-6 text-slate-200 transition hover:border-orange-400 hover:bg-orange-500/10">
                <span className="mr-3 font-bold text-orange-300">{String.fromCharCode(65 + index)})</span>{alt}
              </button>
            ))}
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-between">
            <Link href="/aluno" className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-white/10">Sair</Link>
            <button className="rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-orange-500/20">Responder e avançar</button>
          </div>
        </section>
      </div>
    </main>
  );
}
