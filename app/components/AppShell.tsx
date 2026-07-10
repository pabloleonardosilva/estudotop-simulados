"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import { Open_Sans } from "next/font/google";
import Header from "./Header";
import Sidebar from "./Sidebar";
import MobileSidebar from "./MobileSidebar";
import HelpCenterModal from "./HelpCenterModal";
import StudentJourneyExplainerModal from "./StudentJourneyExplainerModal";
import PremiumModal from "./ui/PremiumModal";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase/client";

const openSans = Open_Sans({
  subsets: ["latin"],
  display: "swap",
});

type UnseenHelpReply = { id: string; admin_reply: string };

const JOURNEY_EXPLAINER_AUTO_COUNT_LIMIT = 10;
const JOURNEY_EXPLAINER_COUNT_PREFIX = "estudotop:journey-explainer:auto-open-count";
const JOURNEY_EXPLAINER_LAST_LOGIN_PREFIX = "estudotop:journey-explainer:last-login";
const JOURNEY_EXPLAINER_SHOWN_LOGIN_PREFIX = "estudotop:journey-explainer:shown-login";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [journeyExplainerOpen, setJourneyExplainerOpen] = useState(false);
  const [unseenHelpReply, setUnseenHelpReply] = useState<UnseenHelpReply | null>(null);
  const [topCoinsBalance, setTopCoinsBalance] = useState<number | null>(null);

  const publicRoutes = ["/login", "/esqueci-senha", "/redefinir-senha", "/cadastro", "/primeiro-acesso"];
  const isPublicRoute = publicRoutes.includes(pathname) || pathname.startsWith("/cadastro/confirmar");
  const isPublicViewRoute = pathname.startsWith("/r/");
  const isChangePasswordRoute = pathname === "/alterar-senha";
  const isStudentExamPage = pathname.startsWith("/aluno/simulado");
  const [isPopupRoute, setIsPopupRoute] = useState(false);
  const isFocusRoute =
    /^\/simulados\/[^/]+\/preview/.test(pathname) ||
    /^\/meus-simulados\/[^/]+(\/resultado)?$/.test(pathname) ||
    /^\/admin\/raio-x-provas\/[^/]+\/relatorio/.test(pathname);
  const isDarkSimuladosRoute = pathname.startsWith("/simulados");
  const isDarkPremiumRoute =
    isDarkSimuladosRoute ||
    pathname.startsWith("/admin/jornadas") ||
    pathname.startsWith("/admin/raio-x-provas") ||
    pathname.startsWith("/questoes") ||
    pathname.startsWith("/admin/alunos") ||
    pathname.startsWith("/admin/logs") ||
    pathname.startsWith("/admin/ajuda") ||
    pathname.startsWith("/disciplinas") ||
    pathname.startsWith("/assuntos") ||
    pathname.startsWith("/bancas");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsPopupRoute(new URLSearchParams(window.location.search).get("popup") === "1");
  }, [pathname]);

  useEffect(() => {
    if (!loading && user?.id && profile?.role) {
      fetch("/api/system/security-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "session_touch",
          actorType: profile.role,
          actorId: user.id,
          actorName: profile.full_name,
          actorEmail: user.email,
          route: pathname,
        }),
      }).catch(() => undefined);
    }
  }, [loading, user?.id, user?.email, profile?.role, profile?.full_name, pathname]);

  useEffect(() => {
    if (loading) return;

    if (!user && !isPublicRoute && !isPublicViewRoute) {
      router.replace("/login");
      return;
    }

    if (user && profile?.must_change_password && !isChangePasswordRoute) {
      router.replace("/alterar-senha");
      return;
    }

    if (user && profile && isPublicRoute && pathname !== "/cadastro" && !pathname.startsWith("/cadastro/confirmar")) {
      router.replace(profile.role === "admin" ? "/dashboard" : "/aluno");
      return;
    }

    const isAllowedStudentRoute =
      pathname.startsWith("/aluno") ||
      pathname.startsWith("/minhas-jornadas") ||
      pathname.startsWith("/meus-simulados") ||
      pathname.startsWith("/minhas-anotacoes") ||
      pathname.startsWith("/meus-resultados") ||
      pathname.startsWith("/extrato-topcoins");

    if (user && profile?.role === "student" && !isChangePasswordRoute && !isAllowedStudentRoute) {
      router.replace("/minhas-jornadas");
    }
  }, [loading, user, profile, pathname, isPublicRoute, isPublicViewRoute, isChangePasswordRoute, router]);

  useEffect(() => {
    if (loading || !user?.id || profile?.role !== "student" || profile?.must_change_password) return;
    if (isPublicRoute || isPublicViewRoute || isChangePasswordRoute || isStudentExamPage || isFocusRoute) return;
    if (typeof window === "undefined") return;

    const userId = user.id;
    let cancelled = false;

    async function maybeOpenJourneyExplainer() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled || !session) return;

      const userKey = userId;
      const loginSignature = session.user.last_sign_in_at || session.user.created_at || session.user.id;
      const countKey = `${JOURNEY_EXPLAINER_COUNT_PREFIX}:${userKey}`;
      const lastLoginKey = `${JOURNEY_EXPLAINER_LAST_LOGIN_PREFIX}:${userKey}`;
      const shownLoginKey = `${JOURNEY_EXPLAINER_SHOWN_LOGIN_PREFIX}:${userKey}`;

      const storedCount = Number.parseInt(window.localStorage.getItem(countKey) || "0", 10);
      let loginCount = Number.isFinite(storedCount) && storedCount > 0 ? storedCount : 0;

      if (window.localStorage.getItem(lastLoginKey) !== loginSignature) {
        loginCount += 1;
        window.localStorage.setItem(countKey, String(loginCount));
        window.localStorage.setItem(lastLoginKey, loginSignature);
      }

      if (loginCount <= JOURNEY_EXPLAINER_AUTO_COUNT_LIMIT && window.localStorage.getItem(shownLoginKey) !== loginSignature) {
        window.localStorage.setItem(shownLoginKey, loginSignature);
        setJourneyExplainerOpen(true);
      }
    }

    maybeOpenJourneyExplainer().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [
    loading,
    user?.id,
    profile?.role,
    profile?.must_change_password,
    pathname,
    isPublicRoute,
    isPublicViewRoute,
    isChangePasswordRoute,
    isStudentExamPage,
    isFocusRoute,
  ]);

  useEffect(() => {
    if (loading || !user?.id || profile?.role !== "student") return;

    let cancelled = false;

    async function checkUnseenReply() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session || cancelled) return;

      const res = await fetch("/api/student/help-messages", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (cancelled || !res.ok || !json.ok) return;

      const unseen = (json.messages || []).find(
        (item: { status: string; admin_reply: string | null; student_seen_reply_at: string | null }) =>
          item.status === "answered" && item.admin_reply && !item.student_seen_reply_at,
      );

      if (unseen) {
        setUnseenHelpReply({ id: unseen.id, admin_reply: unseen.admin_reply });
      }
    }

    checkUnseenReply();

    return () => {
      cancelled = true;
    };
  }, [loading, user?.id, profile?.role]);

  useEffect(() => {
    if (loading || !user?.id || profile?.role !== "student") return;

    let cancelled = false;

    async function loadTopCoinsBalance() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session || cancelled) return;

      const res = await fetch("/api/student/topcoins", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (cancelled || !res.ok || !json.ok) return;

      setTopCoinsBalance(typeof json.balance === "number" ? json.balance : 0);
    }

    loadTopCoinsBalance();

    return () => {
      cancelled = true;
    };
  }, [loading, user?.id, profile?.role, pathname]);

  async function acknowledgeHelpReply() {
    setUnseenHelpReply(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    await fetch("/api/student/help-messages/mark-seen", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    }).catch(() => undefined);
  }

  if (isPopupRoute || isPublicRoute || isStudentExamPage || isFocusRoute || isPublicViewRoute) {
    return <>{children}</>;
  }

  if (loading) {
    return <LoadingScreen message="Carregando ambiente..." />;
  }

  if (!user || !profile) {
    return null;
  }

  if (isChangePasswordRoute) {
    return <>{children}</>;
  }

  const isStudentArea = profile.role === "student";

  if (isStudentArea) {
    const isPainel = pathname === "/aluno";

    return (
      <div className={`student-theme student-dark-shell min-h-dvh ${openSans.className}`}>
        <Header
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onOpenHelp={() => setHelpOpen(true)}
          hasUnseenHelpReply={Boolean(unseenHelpReply)}
          topCoinsBalance={topCoinsBalance}
        />

        <MobileSidebar open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />

        <HelpCenterModal open={helpOpen} onClose={() => setHelpOpen(false)} />
        <StudentJourneyExplainerModal open={journeyExplainerOpen} onClose={() => setJourneyExplainerOpen(false)} />

        <PremiumModal
          open={Boolean(unseenHelpReply)}
          theme="dark"
          tone="success"
          title="Sua mensagem foi respondida!"
          message={unseenHelpReply?.admin_reply}
          closeLabel="Ver resposta"
          onClose={() => {
            acknowledgeHelpReply();
            setHelpOpen(true);
          }}
        />

        <div className="relative flex min-h-[calc(100dvh-88px)] flex-col lg:min-h-[calc(100dvh-112px)]">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Abrir menu"
            className="absolute left-3.5 top-4 z-40 hidden h-[52px] w-[52px] items-center justify-center rounded-2xl bg-[#000610] text-white shadow-[0_8px_20px_rgba(0,6,16,0.35)] transition hover:bg-[#0A1424] lg:flex"
          >
            <Menu size={22} />
          </button>

          <main className={isPainel ? "min-w-0 flex-1" : "student-content-frame min-w-0 flex-1"}>
            {children}
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-dvh ${isDarkPremiumRoute ? "bg-[#03070D]" : "bg-[#eef0f4]"} lg:h-dvh lg:overflow-hidden`}>
      <div className="flex min-h-dvh lg:h-dvh">
        <div className="hidden lg:block lg:h-dvh lg:shrink-0">
          <Sidebar />
        </div>

        <MobileSidebar open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />

        <div className="flex min-h-dvh min-w-0 flex-1 flex-col lg:h-dvh lg:overflow-y-auto">
          <Header onOpenMobileMenu={() => setMobileMenuOpen(true)} />

          <main className="min-w-0 flex-1">{children}</main>

          {(
            <footer className={`px-4 pb-5 pt-6 md:px-6 ${isDarkPremiumRoute ? "bg-transparent" : ""}`}>
              <div
                className={
                  isDarkPremiumRoute
                    ? "rounded-2xl border border-white/[0.08] bg-[#0B111C]/90 px-5 py-4 text-center text-xs text-slate-500 shadow-[0_18px_45px_rgba(0,0,0,0.22)] backdrop-blur"
                    : "rounded-2xl border border-slate-200/80 bg-white/70 px-5 py-4 text-center text-xs text-slate-500 shadow-sm backdrop-blur"
                }
              >
                <p
                  className={
                    isDarkPremiumRoute
                      ? "font-semibold tracking-[0.16em] text-orange-300/80"
                      : "font-semibold tracking-[0.16em] text-slate-400"
                  }
                >
                  ESTUDOTOP SIMULADOS v0.3
                </p>

                <p className={isDarkPremiumRoute ? "mt-1 text-slate-400" : "mt-1"}>
                  Desenvolvido por <span className={isDarkPremiumRoute ? "font-semibold text-slate-200" : "font-semibold text-slate-700"}>Pablo Leonardo</span> - EstudoTOP
                </p>
              </div>
            </footer>
          )}
        </div>
      </div>
    </div>
  );
}

function LoadingScreen({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080b12] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 px-8 py-7 text-center text-white shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-orange-400">
          EstudoTOP Simulados
        </p>

        <p className="mt-3 text-sm text-slate-300">{message}</p>
      </div>
    </main>
  );
}
