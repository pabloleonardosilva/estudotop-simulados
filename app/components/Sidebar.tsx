"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpenCheck, GraduationCap, Home, ListChecks, Settings, Sparkles, Users } from "lucide-react";

export default function Sidebar() {
  const pathname = usePathname();

  function isActive(path: string) {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  }

  function itemClass(active: boolean) {
    return active
      ? "flex items-center gap-3 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-3 text-slate-950 font-semibold shadow-lg shadow-orange-500/20"
      : "flex items-center gap-3 rounded-2xl px-4 py-3 text-slate-400 font-medium transition hover:bg-white/10 hover:text-white";
  }

  return (
    <aside className="no-print hidden min-h-screen w-72 shrink-0 self-stretch border-r border-white/10 bg-[#080b12] px-5 py-6 text-white lg:block">
      <div className="mb-8 border-b border-white/10 pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-400">EstudoTOP</p>
        <h2 className="mt-2 text-lg font-semibold tracking-tight text-white">Simulados</h2>

        <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="truncate text-sm font-semibold text-white">Professor Pablo</p>
          <p className="mt-1 text-xs font-medium text-slate-500">Administrador</p>
        </div>

        <div className="mt-4 h-1 w-16 rounded-full bg-gradient-to-r from-orange-500 to-amber-400" />
      </div>

      <nav className="space-y-7 text-sm">
        <MenuGroup title="Gestão">
          <Link href="/" className={itemClass(isActive("/") )}><Home size={18} />Início</Link>
          <Link href="/dashboard" className={itemClass(isActive("/dashboard"))}><BarChart3 size={18} />Dashboard</Link>
          <Link href="/simulados" className={itemClass(isActive("/simulados"))}><BookOpenCheck size={18} />Simulados</Link>
        </MenuGroup>

        <MenuGroup title="Cadastros">
          <Link href="/alunos" className={itemClass(isActive("/alunos"))}><Users size={18} />Alunos</Link>
          <Link href="/questoes" className={itemClass(isActive("/questoes"))}><ListChecks size={18} />Questões</Link>
          <Link href="/aluno" className={itemClass(isActive("/aluno"))}><GraduationCap size={18} />Área do Aluno</Link>
        </MenuGroup>

        <MenuGroup title="Futuro">
          <a href="#" className={itemClass(false)}><Sparkles size={18} />IA do Professor</a>
          <a href="#" className={itemClass(false)}><Settings size={18} />Configurações</a>
        </MenuGroup>
      </nav>
    </aside>
  );
}

function MenuGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 px-4 text-[11px] font-semibold uppercase tracking-widest text-slate-500">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
