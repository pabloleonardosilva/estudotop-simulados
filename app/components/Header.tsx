"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bell,
  ChevronDown,
  ClipboardList,
  Home,
  LifeBuoy,
  LogOut,
  Map,
  Menu,
  NotebookText,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import TopCoinStack from "./gamification/TopCoinStack";

function getInitials(name: string | null | undefined): string {
  const clean = (name || "").trim();
  if (!clean) return "A";
  return clean
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function Header({
  onOpenMobileMenu,
  onOpenHelp,
  hasUnseenHelpReply,
  topCoinsBalance,
}: {
  onOpenMobileMenu?: () => void;
  onOpenHelp?: () => void;
  hasUnseenHelpReply?: boolean;
  topCoinsBalance?: number | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, signOut } = useAuth();

  const isAdmin = profile?.role === "admin";

  function menuClass(active: boolean) {
    return active
      ? "rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-3 text-slate-950 shadow-lg shadow-orange-500/20"
      : "rounded-2xl px-5 py-3 text-slate-300 transition hover:bg-white/10 hover:text-white";
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  if (!isAdmin) {
    return (
      <header className="no-print">
        {/* Mobile / tablet (< lg): header compacto, inalterado. */}
        <div className="student-dark-header sticky top-0 z-50 overflow-hidden border-b lg:hidden">
          <div className="relative flex h-[72px] w-full items-center gap-4 px-4 md:h-[88px] md:px-10">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={onOpenMobileMenu}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 text-slate-300 transition hover:bg-white/10 hover:text-white"
                aria-label="Abrir menu"
              >
                <Menu size={20} />
              </button>

              <Link href="/aluno" className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-[52px] shrink-0 items-center justify-center gap-1 rounded-xl border-2 border-white/85">
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-white/85" />
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-white/85" />
                </span>
                <span className="truncate text-lg font-extrabold uppercase tracking-[0.06em] text-white md:text-xl">
                  Estudo<span className="text-[#FF5300]">TOP</span>
                </span>
              </Link>
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              className="ml-auto inline-flex h-11 shrink-0 items-center justify-center rounded-full border border-white/[0.14] bg-[#050A11] px-4 text-xs font-semibold text-white transition hover:bg-white/10"
            >
              Sair
            </button>
          </div>
        </div>

        {/* Desktop (lg+): header institucional dark premium. */}
        <div className="student-header relative hidden lg:block">
          <div className="mx-auto grid h-[112px] max-w-[1980px] grid-cols-[230px_1fr_auto] items-center gap-7 px-8 xl:grid-cols-[280px_1fr_auto]">
            <div className="relative flex items-center justify-start">
              <div
                aria-hidden
                className="pointer-events-none absolute left-0 h-[76px] w-[220px] rounded-full bg-[radial-gradient(circle,rgba(255,138,0,0.10),transparent_66%)] blur-xl"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/Logo%2004%20-transp.png"
                alt="EstudoTOP Simulados"
                className="relative z-[1] h-[76px] w-auto object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,0.35)] xl:h-[88px]"
              />
            </div>

            <nav className="flex h-full min-w-0 items-center justify-center gap-5 xl:gap-[30px]" aria-label="Menu principal do aluno">
              <DesktopNavItem href="/aluno" active={pathname.startsWith("/aluno")}>
                <Home size={21} strokeWidth={2.2} />
                <span>Meu Painel</span>
              </DesktopNavItem>
              <DesktopNavItem href="/minhas-jornadas" active={pathname.startsWith("/minhas-jornadas")}>
                <Map size={21} strokeWidth={2.2} />
                <span>Minhas Jornadas</span>
              </DesktopNavItem>
              <DesktopNavItem href="/meus-simulados" active={pathname.startsWith("/meus-simulados")}>
                <ClipboardList size={21} strokeWidth={2.2} />
                <span>Meus Simulados</span>
              </DesktopNavItem>
              <DesktopNavItem href="/minhas-anotacoes" active={pathname.startsWith("/minhas-anotacoes")}>
                <NotebookText size={21} strokeWidth={2.2} />
                <span>Minhas Anotações</span>
              </DesktopNavItem>
              <DesktopNavItem href="/meus-resultados" active={pathname.startsWith("/meus-resultados")}>
                <BarChart3 size={21} strokeWidth={2.2} />
                <span>Resultados</span>
              </DesktopNavItem>
              <DesktopNavItem active={false} onClick={onOpenHelp}>
                <LifeBuoy size={21} strokeWidth={2.2} />
                <span>Ajuda</span>
              </DesktopNavItem>
            </nav>

            <div className="flex items-center justify-end gap-[18px]">
              <div aria-hidden className="h-[34px] w-px shrink-0 bg-gradient-to-b from-transparent via-white/[0.22] to-transparent" />

              <Link
                href="/extrato-topcoins"
                title="Ver extrato de TopCoins"
                className="inline-flex h-[42px] shrink-0 items-center gap-2 rounded-2xl border border-orange-400/25 bg-orange-400/10 px-3 text-[15px] font-black text-orange-200 transition hover:border-orange-400/45 hover:bg-orange-400/15"
              >
                <TopCoinStack size="lg" />
                {topCoinsBalance ?? 0}
              </Link>

              <button
                type="button"
                onClick={onOpenHelp}
                aria-label="Notificações"
                className="relative inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-2xl text-white/[0.82] transition hover:bg-white/[0.055] hover:text-white"
              >
                <Bell size={20} />
                {hasUnseenHelpReply && (
                  <span
                    aria-hidden
                    className="absolute right-[9px] top-2 h-2 w-2 rounded-full bg-orange-500 shadow-[0_0_10px_rgba(255,138,0,0.70)]"
                  />
                )}
              </button>

              <button
                type="button"
                className="inline-flex h-[46px] shrink-0 items-center gap-[10px] px-2 text-[15px] font-extrabold text-white/[0.90] transition hover:text-white"
              >
                {profile?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.avatar_url}
                    alt=""
                    className="h-[38px] w-[38px] shrink-0 rounded-full border border-white/[0.12] object-cover shadow-[0_0_0_2px_rgba(255,138,0,0.08),0_8px_18px_rgba(0,0,0,0.28)]"
                  />
                ) : (
                  <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border border-white/[0.12] bg-gradient-to-br from-orange-500 to-amber-400 text-sm font-black text-slate-950 shadow-[0_0_0_2px_rgba(255,138,0,0.08),0_8px_18px_rgba(0,0,0,0.28)]">
                    {getInitials(profile?.full_name)}
                  </span>
                )}
                <span className="max-w-[120px] truncate">{(profile?.full_name || "Aluno").split(/\s+/)[0]}</span>
                <ChevronDown size={16} className="shrink-0 text-white/[0.62]" />
              </button>

              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex h-[52px] shrink-0 items-center gap-[10px] rounded-2xl border border-white/[0.12] bg-[#080c14]/60 bg-gradient-to-b from-white/[0.045] to-white/[0.018] px-[22px] text-[15px] font-extrabold text-white/[0.92] shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_10px_22px_rgba(0,0,0,0.22)] transition hover:-translate-y-0.5 hover:border-orange-400/[0.42] hover:text-white hover:shadow-[0_0_22px_rgba(255,138,0,0.12),inset_0_1px_0_rgba(255,255,255,0.10)]"
              >
                <LogOut size={20} />
                Sair
              </button>
            </div>
          </div>

          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-[rgba(255,138,0,0.95)] via-[rgba(255,138,0,0.55)] to-[rgba(255,138,0,0.95)] shadow-[0_0_14px_rgba(255,138,0,0.42),0_2px_10px_rgba(255,138,0,0.22)]"
          />
        </div>
      </header>
    );
  }

  return (
    <header className="no-print sticky top-0 z-50 border-b border-white/[0.07] bg-[#03060B] shadow-[0_14px_45px_rgba(0,0,0,.35)]">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-6 md:py-5">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 text-slate-300 transition hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Abrir menu"
          >
            <Menu size={20} />
          </button>

          <div className="min-w-0">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-400 md:text-xs md:tracking-[0.28em]">
              EstudoTOP
            </p>
            <h1 className="truncate text-lg font-semibold tracking-tight text-white md:text-2xl">
              Sistema de Simulados
            </h1>
          </div>
        </div>

        <nav className="hidden items-center gap-2 text-sm font-medium lg:flex">
          <Link href="/" className={menuClass(pathname === "/")}>
            Inicio
          </Link>
          <Link href="/admin/alunos" className={menuClass(pathname.startsWith("/admin/alunos"))}>
            Alunos
          </Link>
          <Link href="/simulados" className={menuClass(pathname.startsWith("/simulados"))}>
            Simulados
          </Link>
          <Link href="/dashboard" className={menuClass(pathname === "/dashboard")}>
            Dashboard
          </Link>

          <button
            type="button"
            onClick={handleSignOut}
            className="ml-2 inline-flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <LogOut size={16} />
            Sair
          </button>
        </nav>

        <button
          type="button"
          onClick={handleSignOut}
          className="inline-flex h-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 px-3 text-xs font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white lg:hidden"
        >
          Sair
        </button>
      </div>
    </header>
  );
}

function DesktopNavItem({
  href,
  active,
  children,
  onClick,
}: {
  href?: string;
  active: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  const className = `relative inline-flex h-[52px] shrink-0 items-center gap-[10px] whitespace-nowrap rounded-xl px-1.5 text-[15px] font-extrabold tracking-[-0.015em] transition ${
    active
      ? "text-[#ff8a00]"
      : "text-white/[0.78] hover:-translate-y-px hover:bg-white/[0.035] hover:text-white/[0.96]"
  }`;

  const content = (
    <>
      {children}
      {active && (
        <span
          aria-hidden
          className="absolute bottom-[-34px] left-1/2 h-1 w-[78px] -translate-x-1/2 rounded-full bg-gradient-to-r from-transparent via-orange-500 to-transparent shadow-[0_0_18px_rgba(255,138,0,0.75),0_-4px_18px_rgba(255,138,0,0.20)]"
        />
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}
