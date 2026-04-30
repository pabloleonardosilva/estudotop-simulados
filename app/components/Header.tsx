"use client";

import { Bell, Search, ShieldCheck } from "lucide-react";

export default function Header() {
  return (
    <header className="no-print sticky top-0 z-20 border-b border-slate-200/70 bg-[#e9e9ec]/85 px-6 py-4 backdrop-blur-xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-orange-500">EstudoTOP</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Sistema de Simulados</h1>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Campo visual para futura busca global. */}
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 shadow-sm">
            <Search size={17} className="text-slate-400" />
            <input
              className="w-56 bg-transparent text-sm outline-none placeholder:text-slate-400"
              placeholder="Buscar aluno, simulado..."
            />
          </div>

          <button className="rounded-2xl border border-slate-200 bg-white/80 p-3 text-slate-600 shadow-sm transition hover:bg-white hover:text-slate-950">
            <Bell size={18} />
          </button>

          <div className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm">
            <div className="rounded-xl bg-gradient-to-r from-orange-500 to-amber-400 p-2 text-slate-950">
              <ShieldCheck size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Admin</p>
              <p className="text-xs text-slate-500">Painel interno</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
