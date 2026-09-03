"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Trophy } from "lucide-react";
import Header from "./Header";
import Sidebar from "./Sidebar";
import MobileSidebar from "./MobileSidebar";
import HelpCenterModal from "./HelpCenterModal";
import StudentJourneyExplainerModal from "./StudentJourneyExplainerModal";
import PremiumModal from "./ui/PremiumModal";
import PremiumButton from "./ui/PremiumButton";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase/client";
import { getHelpContactReasonLabel, type HelpContactReason } from "@/lib/help-tickets";
import { isEventOnlyStudent, studentHomePath } from "@/lib/student-nav";

type UnseenHelpReply = {
  id: string;
  ticket_number: string;
  latest_message: { message: string };
  contact_reason: HelpContactReason | null;
  count: number;
};

type ResultNotification = {
  id: string;
  type: "event_result_released";
  title: string;
  action_url: string | null;
  metadata: { event_name?: string; simulado_name?: string } | null;
};

const JOURNEY_EXPLAINER_AUTO_COUNT_LIMIT = 10;
const JOURNEY_EXPLAINER_COUNT_PREFIX = "estudotop:journey-explainer:auto-open-count";
const JOURNEY_EXPLAINER_LAST_LOGIN_PREFIX = "estudotop:journey-explainer:last-login";
const JOURNEY_EXPLAINER_SHOWN_LOGIN_PREFIX = "estudotop:journey-explainer:shown-login";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, loading, studentNavAccess } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [focusedHelpTicketId, setFocusedHelpTicketId] = useState<string | null>(null);
  const [journeyExplainerOpen, setJourneyExplainerOpen] = useState(false);
  const [unseenHelpReply, setUnseenHelpReply] = useState<UnseenHelpReply | null>(null);
  const [resultNotification, setResultNotification] = useState<ResultNotification | null>(null);
  const [resultNotificationProcessing, setResultNotificationProcessing] = useState<"read" | "dismiss" | null>(null);
  const [resultNotificationError, setResultNotificationError] = useState<string | null>(null);
  const [topCoinsBalance, setTopCoinsBalance] = useState<number | null>(null);
  const [navAccessTimedOut, setNavAccessTimedOut] = useState(false);

  useEffect(() => {
    const openHelpCenter = () => {
      setFocusedHelpTicketId(null);
      setHelpOpen(true);
    };
    window.addEventListener("estudotop:open-help-center", openHelpCenter);
    return () => window.removeEventListener("estudotop:open-help-center", openHelpCenter);
  }, []);
  const publicRoutes = ["/login", "/esqueci-senha", "/redefinir-senha", "/cadastro", "/primeiro-acesso"];
  const isPublicRoute = publicRoutes.includes(pathname) || pathname.startsWith("/cadastro/confirmar") || pathname.startsWith("/evento/");
  // Rotas de aquisição/continuação de cadastro (link de e-mail do Evento e o
  // próprio /cadastro): uma sessão já autenticada no navegador não pode
  // sequestrar essas rotas — nem para a home do usuário logado, nem para
  // /alterar-senha. A própria página resolve a intenção do link (inclusive
  // conflito de sessão) antes de qualquer navegação.
  const isEventAcquisitionRoute = pathname === "/cadastro" || pathname.startsWith("/cadastro/confirmar") || pathname.startsWith("/evento/");
  const isPublicViewRoute = pathname.startsWith("/r/");
  const isChangePasswordRoute = pathname === "/alterar-senha";
  const isStudentExamPage = pathname.startsWith("/aluno/simulado");
  const [isPopupRoute, setIsPopupRoute] = useState(false);
  const isFocusRoute =
    /^\/simulados\/[^/]+\/preview/.test(pathname) ||
    /^\/meus-simulados\/[^/]+(\/resultado)?$/.test(pathname) ||
    /^\/admin\/raio-x-provas\/[^/]+\/relatorio/.test(pathname);
  const isStudentSimulationRoute = /^\/meus-simulados\/[^/]+$/.test(pathname);
  // Logo após o login (rota pública → home por role), o aluno precisa que
  // studentNavAccess já esteja resolvido para decidir entre /aluno e
  // /meus-eventos sem piscar uma tela e trocar para outra. Um timeout de
  // segurança evita travar indefinidamente se a chamada nunca resolver.
  const isResolvingStudentHome = Boolean(
    user && profile?.role === "student" && !profile.must_change_password && isPublicRoute && !isEventAcquisitionRoute && !studentNavAccess,
  );
  const awaitingStudentHome = isResolvingStudentHome && !navAccessTimedOut;

  useEffect(() => {
    if (!isResolvingStudentHome) return;
    const timer = window.setTimeout(() => setNavAccessTimedOut(true), 4000);
    return () => {
      window.clearTimeout(timer);
      setNavAccessTimedOut(false);
    };
  }, [isResolvingStudentHome]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = window.setTimeout(() => setIsPopupRoute(new URLSearchParams(window.location.search).get("popup") === "1"), 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    if (!loading && user?.id && profile?.role) {
      void supabase.auth.getSession().then(({ data }) => data.session && fetch("/api/system/security-event", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({
          eventType: "session_touch",
          route: pathname,
        }),
      }).catch(() => undefined));
    }
  }, [loading, user?.id, user?.email, profile?.role, profile?.full_name, pathname]);

  useEffect(() => {
    if (loading) return;

    if (!user && !isPublicRoute && !isPublicViewRoute) {
      router.replace("/login");
      return;
    }

    if (user && profile?.must_change_password && !isChangePasswordRoute && !isEventAcquisitionRoute) {
      router.replace("/alterar-senha");
      return;
    }

    if (user && profile && isPublicRoute && !isEventAcquisitionRoute) {
      if (profile.role === "student") {
        // Aguarda studentNavAccess resolver (ou o timeout de segurança) antes de
        // decidir entre /aluno e /meus-eventos, evitando piscar uma home errada.
        if (awaitingStudentHome) return;
        router.replace(studentHomePath(studentNavAccess));
        return;
      }
      router.replace(profile.role === "admin" ? "/dashboard" : "/professor/eventos");
      return;
    }

    const isAllowedStudentRoute =
      pathname.startsWith("/aluno") ||
      pathname.startsWith("/minhas-jornadas") ||
      pathname.startsWith("/meus-simulados") ||
      pathname.startsWith("/minhas-anotacoes") ||
      pathname.startsWith("/meus-resultados") ||
      pathname.startsWith("/meus-eventos") ||
      pathname.startsWith("/meu-perfil") ||
      pathname.startsWith("/extrato-topcoins");

    if (user && profile?.role === "student" && !isChangePasswordRoute && !isAllowedStudentRoute && !isEventAcquisitionRoute) {
      // Aluno exclusivamente de Evento cai em /meus-eventos; demais mantêm o
      // destino padrão já existente (/minhas-jornadas) — comportamento inalterado.
      router.replace(isEventOnlyStudent(studentNavAccess) ? "/meus-eventos" : "/minhas-jornadas");
    }

    if (user && profile?.role === "professor" && !isChangePasswordRoute && !pathname.startsWith("/professor") && !isEventAcquisitionRoute) {
      router.replace("/professor/eventos");
    }
  }, [loading, user, profile, pathname, isPublicRoute, isPublicViewRoute, isChangePasswordRoute, router, awaitingStudentHome, studentNavAccess, isEventAcquisitionRoute]);

  useEffect(() => {
    if (loading || !user?.id || profile?.role !== "student" || profile?.must_change_password) return;
    if (isPublicRoute || isPublicViewRoute || isChangePasswordRoute || isStudentExamPage || isFocusRoute) return;
    if (typeof window === "undefined") return;
    // Aguarda a resolução do contexto de navegação do aluno (Jornadas/origem de
    // Evento) antes de decidir. Aluno exclusivamente de Evento não recebe o
    // tutorial neste contexto — supressão contextual, sem marcar como visto.
    if (!studentNavAccess) return;
    if (isEventOnlyStudent(studentNavAccess)) return;

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
    studentNavAccess,
  ]);

  useEffect(() => {
    if (loading || !user?.id || profile?.role !== "student") return;

    if (profile.must_change_password || isPublicRoute || isPublicViewRoute || isChangePasswordRoute || isStudentExamPage || isFocusRoute || isStudentSimulationRoute) return;
    let cancelled = false;
    let checking = false;

    async function checkResultNotification() {
      if (checking || resultNotification || helpOpen || unseenHelpReply) return;
      checking = true;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || cancelled) return;
        const res = await fetch("/api/student/notifications", { headers: { Authorization: `Bearer ${session.access_token}` } });
        const json = await res.json().catch(() => ({}));
        if (cancelled || !res.ok || !json.ok) return;
        if (json.notification?.type === "event_result_released") {
          setJourneyExplainerOpen(false);
          setResultNotification(json.notification as ResultNotification);
        }
      } finally {
        checking = false;
      }
    }

    void checkResultNotification();
    const interval = window.setInterval(() => void checkResultNotification(), 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [loading, user?.id, profile?.role, profile?.must_change_password, pathname, isPublicRoute, isPublicViewRoute, isChangePasswordRoute, isStudentExamPage, isFocusRoute, isStudentSimulationRoute, resultNotification, helpOpen, unseenHelpReply]);

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

      const unseenItems = (json.messages || []).filter(
        (item: { status: string; latest_message: { author_type: string; message: string } | null; student_seen_reply_at: string | null }) =>
          item.status === "answered" && item.latest_message?.author_type === "admin" && !item.student_seen_reply_at,
      );
      const unseen = unseenItems[0] as Omit<UnseenHelpReply, "count"> | undefined;

      if (unseen) {
        setUnseenHelpReply({ ...unseen, count: unseenItems.length });
      } else {
        setUnseenHelpReply(null);
      }
    }

    void checkUnseenReply();
    const interval = window.setInterval(() => void checkUnseenReply(), 30_000);
    const handleFocus = () => void checkUnseenReply();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void checkUnseenReply();
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loading, user?.id, profile?.role, pathname]);

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

  async function acknowledgeHelpReply(openHelp: boolean) {
    const ticketId = unseenHelpReply?.id || null;
    setUnseenHelpReply(null);

    if (openHelp && ticketId) {
      setFocusedHelpTicketId(ticketId);
      setHelpOpen(true);
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      if (openHelp) setHelpOpen(true);
      return;
    }

    if (ticketId) await fetch("/api/student/help-messages/mark-seen", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ ticket_id: ticketId }),
    }).catch(() => undefined);
  }

  async function handleResultNotification(action: "read" | "dismiss") {
    if (!resultNotification || resultNotificationProcessing) return;
    setResultNotificationProcessing(action);
    setResultNotificationError(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setResultNotificationError("Não foi possível concluir esta ação. Tente novamente.");
      setResultNotificationProcessing(null);
      return;
    }
    const res = await fetch(`/api/student/notifications/${resultNotification.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 404) {
      setResultNotification(null);
      setResultNotificationProcessing(null);
      return;
    }
    if (!res.ok || !json.ok) {
      setResultNotificationError("Não foi possível concluir esta ação. Tente novamente.");
      setResultNotificationProcessing(null);
      return;
    }
    const actionUrl = resultNotification.action_url;
    setResultNotification(null);
    setResultNotificationProcessing(null);
    if (action === "read" && actionUrl?.startsWith("/") && !actionUrl.startsWith("//")) {
      const separator = actionUrl.includes("?") ? "&" : "?";
      router.push(`${actionUrl}${separator}releasedNotification=1`);
    }
  }

  if (awaitingStudentHome) {
    return <LoadingScreen message="Carregando ambiente..." />;
  }

  if (isStudentSimulationRoute || isStudentExamPage) {
    return <div className="et-student-font min-h-dvh">{children}</div>;
  }

  if (isPopupRoute || isPublicRoute || isFocusRoute || isPublicViewRoute) {
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

  if (profile.role === "professor") {
    return (
      <div className="et-interface-clean teacher-theme et-teacher-font min-h-dvh bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_48%,#f1f5f9_100%)] text-slate-900">
        <main className="min-h-dvh">{children}</main>
      </div>
    );
  }

  if (isStudentArea) {
    const isPainel = pathname === "/aluno";

    return (
      <div className="et-interface-clean student-theme et-student-font student-dark-shell min-h-dvh">
        <Header
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onOpenHelp={() => { setFocusedHelpTicketId(unseenHelpReply?.id || null); setUnseenHelpReply(null); setHelpOpen(true); }}
          hasUnseenHelpReply={Boolean(unseenHelpReply)}
          topCoinsBalance={topCoinsBalance}
        />

        <MobileSidebar open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />

        <HelpCenterModal open={helpOpen && !resultNotification} initialTicketId={focusedHelpTicketId} onClose={() => { setHelpOpen(false); setFocusedHelpTicketId(null); }} />
        <StudentJourneyExplainerModal open={journeyExplainerOpen && !resultNotification && !unseenHelpReply} onClose={() => setJourneyExplainerOpen(false)} />

        <PremiumModal
          open={Boolean(resultNotification)}
          theme="light"
          tone="success"
          icon={<Trophy size={28} />}
          title={resultNotification?.title || "Seu resultado foi liberado"}
          message="O professor liberou o resultado do seu Evento de Simulado. Você já pode consultar seu desempenho completo."
          dismissible={false}
          onClose={() => undefined}
          actions={
            <>
              <PremiumButton variant="secondary" disabled={Boolean(resultNotificationProcessing)} onClick={() => void handleResultNotification("dismiss")}>
                {resultNotificationProcessing === "dismiss" ? "Salvando..." : "Ver depois"}
              </PremiumButton>
              <PremiumButton disabled={Boolean(resultNotificationProcessing)} onClick={() => void handleResultNotification("read")}>
                {resultNotificationProcessing === "read" ? "Abrindo..." : "Ver Agora"}
              </PremiumButton>
            </>
          }
        >
          {resultNotification && (
            <div className="rounded-2xl border border-orange-100 bg-orange-50/70 p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-orange-600">Evento de Simulado</p>
              <p className="mt-2 font-semibold text-slate-900">{resultNotification.metadata?.event_name || "Evento"}</p>
              <p className="mt-1 text-sm text-slate-600">{resultNotification.metadata?.simulado_name || "Simulado"}</p>
              {resultNotificationError && <p className="mt-3 text-sm font-semibold text-red-600">{resultNotificationError}</p>}
            </div>
          )}
        </PremiumModal>

        <PremiumModal
          open={Boolean(unseenHelpReply) && !resultNotification && !helpOpen}
          theme="dark"
          tone="success"
          title={unseenHelpReply?.count === 1 ? "Você recebeu uma resposta" : `Você recebeu ${unseenHelpReply?.count || 0} novas respostas`}
          message="Nossa equipe respondeu ao seu ticket na Central de Ajuda."
          onClose={() => acknowledgeHelpReply(false)}
          actions={
            <>
              <PremiumButton variant="dark" onClick={() => acknowledgeHelpReply(false)}>Fechar</PremiumButton>
              <PremiumButton variant="dark-primary" onClick={() => acknowledgeHelpReply(true)}>Ver resposta</PremiumButton>
            </>
          }
        >
          {unseenHelpReply && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-300">
                {unseenHelpReply.ticket_number} · {getHelpContactReasonLabel(unseenHelpReply.contact_reason)}
              </p>
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-300">{unseenHelpReply.latest_message.message}</p>
            </div>
          )}
        </PremiumModal>

        <div className="relative flex min-h-[calc(100dvh-88px)] flex-col lg:min-h-[calc(100dvh-136px)] xl:min-h-[calc(100dvh-92px)] 2xl:min-h-[calc(100dvh-112px)]">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Abrir menu"
            className="absolute left-3.5 top-4 z-40 hidden h-[52px] w-[52px] items-center justify-center rounded-2xl bg-[#000610] text-white shadow-[0_8px_20px_rgba(0,6,16,0.35)] transition hover:bg-[#0A1424] lg:flex"
          >
            <Menu size={22} />
          </button>

          <main className={isPainel ? "et-laptop-density min-w-0 flex-1" : "et-laptop-density student-content-frame min-w-0 flex-1"}>
            {children}
          </main>

          <footer className="bg-[#faf8f5] px-4 pb-5 pt-6 md:px-6">
            <div className="rounded-2xl border border-slate-200/80 bg-white/85 px-5 py-4 text-center text-xs text-slate-500 shadow-[0_12px_36px_rgba(15,23,42,0.07)] ring-1 ring-white/80 backdrop-blur">
              <p className="font-bold tracking-[0.16em] text-orange-500/80">
                ESTUDOTOP SIMULADOS v0.3
              </p>
              <p className="mt-1">
                Desenvolvido por <span className="font-semibold text-slate-700">Pablo Leonardo</span> - EstudoTOP
              </p>
            </div>
          </footer>
        </div>
      </div>
    );
  }

  return (
    <div className="et-interface-dark min-h-dvh bg-[#03070D] lg:h-dvh lg:overflow-hidden">
      <div className="flex min-h-dvh lg:h-dvh">
        <div className="et-admin-sidebar-slot hidden lg:block lg:h-dvh lg:shrink-0">
          <Sidebar />
        </div>

        <MobileSidebar open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />

        <div className="flex min-h-dvh min-w-0 flex-1 flex-col lg:h-dvh lg:overflow-y-auto">
          <Header onOpenMobileMenu={() => setMobileMenuOpen(true)} />

          <main className="et-admin-dark-content et-laptop-density min-w-0 flex-1">{children}</main>

          {(
            <footer className="bg-transparent px-4 pb-5 pt-6 md:px-6">
              <div
                className="rounded-2xl border border-white/[0.08] bg-[#0B111C]/90 px-5 py-4 text-center text-xs text-slate-500 shadow-[0_18px_45px_rgba(0,0,0,0.22)] backdrop-blur"
              >
                <p
                  className="font-semibold tracking-[0.16em] text-orange-300/80"
                >
                  ESTUDOTOP SIMULADOS v0.3
                </p>

                <p className="mt-1 text-slate-400">
                  Desenvolvido por <span className="font-semibold text-slate-200">Pablo Leonardo</span> - EstudoTOP
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
