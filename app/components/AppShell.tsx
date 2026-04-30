"use client";

import { usePathname } from "next/navigation";
import Header from "./Header";
import Sidebar from "./Sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Páginas públicas ou focadas não usam sidebar para não poluir a experiência.
  const isLoginPage = pathname === "/login";
  const isStudentExamPage = pathname.startsWith("/aluno/simulado");

  if (isLoginPage || isStudentExamPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-[#e9e9ec]">
      <Sidebar />

      <div className="flex min-h-screen flex-1 flex-col">
        <Header />

        <main className="flex-1">{children}</main>

        <footer className="px-6 pb-5 pt-6">
          <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-5 py-4 text-center text-xs text-slate-500 shadow-sm backdrop-blur">
            <p className="font-semibold tracking-[0.16em] text-slate-400">
              ESTUDOTOP SIMULADOS v0.1
            </p>
            <p className="mt-1">
              Desenvolvido por <span className="font-semibold text-slate-700">Pablo Leonardo</span> · EstudoTOP
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
