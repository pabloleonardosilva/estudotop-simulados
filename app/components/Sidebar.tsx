"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BadgeCheck,
  BarChart3,
  BookOpen,
  Camera,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Home,
  Layers,
  LibraryBig,
  LifeBuoy,
  Loader2,
  MapPin,
  ScanSearch,
  Settings,
  ShieldCheck,
  Trophy,
  Tags,
  Users,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { supabase } from "../lib/supabase/client";
import { useAuth } from "../contexts/AuthContext";

type AdminMenuGroup = "overview" | "management" | "questions" | "system" | "settings";

const ADMIN_MENU_STATE_KEY = "estudotop:admin-sidebar-open-group";

export default function Sidebar() {
  return <SidebarContent />;
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { profile, user, refreshProfile } = useAuth();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  // Nomes de canal realtime únicos por instância: abaixo de lg, o Sidebar
  // desktop (oculto por display:none) e o SidebarContent do drawer coexistem;
  // com nome fixo, o segundo colidia com o canal já inscrito e o Supabase
  // lançava "cannot add postgres_changes callbacks after subscribe()".
  const instanceId = useId();

  const isAdmin = profile?.role === "admin";
  const activeAdminGroup = useMemo<AdminMenuGroup>(() => {
    if (pathname === "/" || pathname.startsWith("/dashboard")) return "overview";

    if (
      pathname.startsWith("/admin/alunos") ||
      pathname.startsWith("/admin/jornadas") ||
      pathname.startsWith("/simulados") ||
      pathname.startsWith("/liberacoes")
    ) {
      return "management";
    }

    if (pathname.startsWith("/questoes") || pathname.startsWith("/admin/raio-x-provas")) {
      return "questions";
    }

    if (
      pathname.startsWith("/disciplinas") ||
      pathname.startsWith("/assuntos") ||
      pathname.startsWith("/topicos") ||
      pathname.startsWith("/bancas")
    ) {
      return "settings";
    }

    return "system";
  }, [pathname]);

  const [openAdminGroup, setOpenAdminGroup] = useState<AdminMenuGroup | null>(activeAdminGroup);
  const [reviewQueueCount, setReviewQueueCount] = useState<number | null>(null);
  const [publicationQueueCount, setPublicationQueueCount] = useState<number | null>(null);
  const [openHelpMessagesCount, setOpenHelpMessagesCount] = useState<number | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;

    const timer = window.setTimeout(() => {
      const savedGroup = window.sessionStorage.getItem(ADMIN_MENU_STATE_KEY) as AdminMenuGroup | null;
      setOpenAdminGroup(savedGroup || activeAdminGroup);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [activeAdminGroup, isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;

    let cancelled = false;

    async function loadQuestionQueueCounts() {
      const [{ count: reviewCount, error: reviewError }, { count: publicationCount, error: publicationError }] = await Promise.all([
        supabase
          .from("questions")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending_review"),
        supabase
          .from("questions")
          .select("id", { count: "exact", head: true })
          .eq("status", "ready_to_publish"),
      ]);

      if (cancelled) return;

      if (!reviewError) {
        setReviewQueueCount(reviewCount ?? 0);
      }

      if (!publicationError) {
        setPublicationQueueCount(publicationCount ?? 0);
      }
    }

    loadQuestionQueueCounts();

    const channel = supabase
      .channel(`sidebar-question-queue-counts-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "questions" },
        loadQuestionQueueCounts,
      )
      .subscribe();

    window.addEventListener("estudotop:publication-queue-updated", loadQuestionQueueCounts);

    return () => {
      cancelled = true;
      window.removeEventListener("estudotop:publication-queue-updated", loadQuestionQueueCounts);
      supabase.removeChannel(channel);
    };
  }, [isAdmin, instanceId]);

  useEffect(() => {
    if (!isAdmin) return;

    let cancelled = false;

    async function loadOpenHelpMessagesCount() {
      const { count, error } = await supabase
        .from("student_help_messages")
        .select("id", { count: "exact", head: true })
        .eq("status", "open");

      if (cancelled || error) return;
      setOpenHelpMessagesCount(count ?? 0);
    }

    loadOpenHelpMessagesCount();

    const channel = supabase
      .channel(`sidebar-help-messages-count-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "student_help_messages" },
        loadOpenHelpMessagesCount,
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [isAdmin, instanceId]);

  function toggleAdminGroup(group: AdminMenuGroup) {
    setOpenAdminGroup((current) => {
      const next = current === group ? null : group;

      if (next) {
        window.sessionStorage.setItem(ADMIN_MENU_STATE_KEY, next);
      } else {
        window.sessionStorage.removeItem(ADMIN_MENU_STATE_KEY);
      }

      return next;
    });
  }

  function isActive(path: string) {
    if (path === "/") return pathname === "/";
    return pathname === path || pathname.startsWith(`${path}/`);
  }

  function roleLabel(role?: string) {
    if (role === "admin") return "Administrador";
    if (role === "student") return "Aluno";
    return "Sem perfil";
  }

  const initials = (profile?.full_name || user?.email || "Usuario")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setAvatarError(null);

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setAvatarError("Use JPG, PNG ou WebP.");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setAvatarError("Imagem até 5 MB.");
      event.target.value = "";
      return;
    }

    setAvatarUploading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setAvatarError("Sessão expirada.");
        return;
      }

      const formData = new FormData();
      formData.append("avatar", file);

      const response = await fetch("/api/profile/avatar", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      const json = await response.json();
      if (!response.ok || !json.ok) {
        setAvatarError(json.message || "Não foi possível atualizar.");
        return;
      }

      await refreshProfile();
    } finally {
      setAvatarUploading(false);
      event.target.value = "";
    }
  }

  if (isAdmin) {
    return (
      <aside className="premium-sidebar-scroll no-print flex h-dvh w-72 shrink-0 flex-col overflow-y-auto border-r border-white/[0.07] bg-[#020811] px-4 py-4 text-white shadow-[18px_0_55px_rgba(0,0,0,0.45)]">
        <div className="pointer-events-none fixed left-0 top-0 h-72 w-72 bg-[radial-gradient(circle_at_20%_0%,rgba(245,158,11,0.16),transparent_36%),radial-gradient(circle_at_75%_15%,rgba(14,165,233,0.10),transparent_32%)]" />

        <div className="relative flex min-h-full flex-col rounded-[1.35rem] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(8,17,31,0.94),rgba(2,8,17,0.98))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_22px_70px_rgba(0,0,0,0.36)]">
          <div className="mb-5">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-amber-400/20 bg-amber-400/10 text-amber-400 shadow-[0_0_22px_rgba(245,158,11,0.18)]">
                <LibraryBig size={14} />
              </span>
              <p className="text-[10px] font-black uppercase tracking-[0.48em] text-amber-400">EstudoTOP</p>
            </div>
            <h2 className="mt-3 text-base font-black tracking-tight text-slate-100">Sistema de Simulados</h2>
            <div className="mt-3 h-0.5 w-8 rounded-full bg-gradient-to-r from-orange-500 to-amber-300 shadow-[0_0_18px_rgba(249,115,22,0.75)]" />
          </div>

          <div className="relative mb-5 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.045] p-3.5 shadow-[0_18px_42px_rgba(0,0,0,0.26)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(249,115,22,0.12),transparent_30%),radial-gradient(circle_at_90%_75%,rgba(245,158,11,0.08),transparent_28%)]" />
            <div className="relative flex items-center gap-3">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                className="group relative h-[58px] w-[58px] shrink-0 overflow-hidden rounded-full border border-amber-400/35 bg-[#07111f] shadow-[0_0_0_5px_rgba(245,158,11,0.06),0_0_28px_rgba(245,158,11,0.18)]"
                aria-label="Alterar foto do usuário"
              >
                {profile?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-lg font-black text-amber-300">
                    {initials || "A"}
                  </span>
                )}

                <span className="absolute inset-0 flex items-center justify-center bg-slate-950/62 opacity-0 transition group-hover:opacity-100">
                  {avatarUploading ? <Loader2 size={18} className="animate-spin text-amber-300" /> : <Camera size={18} className="text-amber-300" />}
                </span>
                <span className="absolute bottom-1 right-1 h-3 w-3 rounded-full border-2 border-[#08111f] bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.75)]" />
              </button>

              <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarChange} className="hidden" />

              <div className="min-w-0 flex-1 pr-7">
                <p className="text-[11px] font-semibold text-slate-400">Professor</p>
                <p className="text-[13px] font-black leading-4 text-white">{profile?.full_name || user?.email || "Usuario"}</p>
                <p className="mt-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-amber-400">{roleLabel(profile?.role)}</p>
                {avatarError ? <p className="mt-1 text-[10px] font-semibold text-red-300">{avatarError}</p> : null}
              </div>

              <span className="absolute right-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-400/20 bg-amber-400/10 text-amber-400">
                <ShieldCheck size={15} />
              </span>
            </div>
          </div>

          <nav className="relative space-y-2 text-sm">
            <AdminGroup icon={<Home size={15} />} title="Visão geral" open={openAdminGroup === "overview"} onToggle={() => toggleAdminGroup("overview")}>
              <NavLink href="/" active={isActive("/")} icon={<Home size={16} />} onNavigate={onNavigate}>
                Início
              </NavLink>

              <NavLink href="/dashboard" active={isActive("/dashboard")} icon={<BarChart3 size={16} />} onNavigate={onNavigate}>
                Dashboard
              </NavLink>
            </AdminGroup>

            <AdminGroup icon={<Users size={15} />} title="Gestão de Recursos" open={openAdminGroup === "management"} onToggle={() => toggleAdminGroup("management")}>
              <NavLink href="/admin/alunos" active={isActive("/admin/alunos") && pathname !== "/admin/alunos/novo"} icon={<Users size={16} />} onNavigate={onNavigate}>
                Alunos
              </NavLink>

              <NavLink href="/admin/jornadas" active={isActive("/admin/jornadas") && pathname !== "/admin/jornadas/nova"} icon={<MapPin size={16} />} onNavigate={onNavigate}>
                Jornadas
              </NavLink>

              <NavLink href="/simulados" active={isActive("/simulados") && pathname !== "/simulados/novo"} icon={<ClipboardList size={16} />} onNavigate={onNavigate}>
                Simulados
              </NavLink>

              <NavLink href="/liberacoes" active={isActive("/liberacoes")} icon={<Trophy size={16} />} onNavigate={onNavigate}>
                Liberações
              </NavLink>
            </AdminGroup>

            <AdminGroup icon={<LibraryBig size={15} />} title="Banco de questões" open={openAdminGroup === "questions"} onToggle={() => toggleAdminGroup("questions")}>
              <NavLink href="/questoes" active={pathname === "/questoes" && searchParams.get("status") !== "ready_to_publish"} icon={<LibraryBig size={16} />} onNavigate={onNavigate}>
                Questões
              </NavLink>

              <NavLink href="/questoes/revisar" active={isActive("/questoes/revisar")} icon={<ClipboardCheck size={16} />} badge={reviewQueueCount && reviewQueueCount > 0 ? reviewQueueCount : null} onNavigate={onNavigate}>
                Revisar
              </NavLink>

              <NavLink href="/questoes?status=ready_to_publish" active={pathname === "/questoes" && searchParams.get("status") === "ready_to_publish"} icon={<ClipboardList size={16} />} badge={publicationQueueCount && publicationQueueCount > 0 ? publicationQueueCount : null} onNavigate={onNavigate}>
                Fila de publicação
              </NavLink>

              <NavLink href="/admin/raio-x-provas" active={isActive("/admin/raio-x-provas") && pathname !== "/admin/raio-x-provas/nova"} icon={<ScanSearch size={16} />} onNavigate={onNavigate}>
                Raio-X de Provas
              </NavLink>
            </AdminGroup>

            <AdminGroup icon={<BarChart3 size={15} />} title="Relatórios & sistema" open={openAdminGroup === "system"} onToggle={() => toggleAdminGroup("system")}>
              <NavLink href="/resultados" active={isActive("/resultados")} icon={<BarChart3 size={16} />} onNavigate={onNavigate}>
                Desempenho
              </NavLink>

              <NavLink href="/tentativas" active={isActive("/tentativas")} icon={<Layers size={16} />} onNavigate={onNavigate}>
                Tentativas
              </NavLink>

              <NavLink href="/admin/logs" active={isActive("/admin/logs")} icon={<ShieldCheck size={16} />} onNavigate={onNavigate}>
                Segurança e Logs
              </NavLink>

              <NavLink
                href="/admin/ajuda"
                active={isActive("/admin/ajuda")}
                icon={<LifeBuoy size={16} />}
                badge={openHelpMessagesCount && openHelpMessagesCount > 0 ? openHelpMessagesCount : null}
                onNavigate={onNavigate}
              >
                Central de Ajuda
              </NavLink>

              <NavLink href="/usuarios" active={isActive("/usuarios")} icon={<Users size={16} />} onNavigate={onNavigate}>
                Usuários
              </NavLink>

            </AdminGroup>

            <AdminGroup icon={<Settings size={15} />} title="Configurações" open={openAdminGroup === "settings"} onToggle={() => toggleAdminGroup("settings")}>
              <NavLink href="/disciplinas" active={isActive("/disciplinas")} icon={<BookOpen size={16} />} onNavigate={onNavigate}>
                Disciplinas
              </NavLink>

              <NavLink href="/assuntos" active={isActive("/assuntos")} icon={<Layers size={16} />} onNavigate={onNavigate}>
                Assuntos
              </NavLink>

              <NavLink href="/topicos" active={isActive("/topicos")} icon={<Tags size={16} />} onNavigate={onNavigate}>
                Tópicos
              </NavLink>

              <NavLink href="/bancas" active={isActive("/bancas")} icon={<BadgeCheck size={16} />} onNavigate={onNavigate}>
                Bancas
              </NavLink>
            </AdminGroup>
          </nav>

          <div className="relative mt-auto pt-5">
            <div className="group flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.035] p-3.5 shadow-[0_18px_45px_rgba(0,0,0,0.22)] transition hover:border-amber-400/25 hover:bg-white/[0.055]">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-amber-400/25 bg-amber-400/10 text-amber-400 shadow-[0_0_24px_rgba(245,158,11,0.18)]">
                <Trophy size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-slate-100">Plano Premium</p>
                <p className="mt-0.5 truncate text-[10px] font-medium text-slate-500">Recursos avançados</p>
              </div>
              <ChevronRight size={16} className="text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-amber-300" />
            </div>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="no-print w-[236px] px-4 pb-6 pt-6 text-white lg:pl-5 lg:pt-0">
      <div className="relative isolate">
        <div className="pointer-events-none absolute -inset-2 -z-10 rounded-[1.8rem] bg-[radial-gradient(circle_at_28%_0%,rgba(245,158,11,0.22),transparent_58%),radial-gradient(circle_at_72%_100%,rgba(249,115,22,0.12),transparent_55%)] blur-xl" />
        <div className="rounded-[1.35rem] border border-white/[0.09] bg-[#020811]/80 p-3 shadow-[0_22px_70px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl">
          <p className="px-3.5 pb-2.5 pt-2 text-[10px] font-black uppercase tracking-[0.22em] text-amber-400">Área do Aluno</p>
          <nav className="space-y-1.5 text-sm">
            <NavLink href="/aluno" active={isActive("/aluno")} icon={<Home size={17} />} onNavigate={onNavigate} student>
              Painel
            </NavLink>
            <NavLink href="/minhas-jornadas" active={isActive("/minhas-jornadas")} icon={<MapPin size={17} />} onNavigate={onNavigate} student>
              Minhas Jornadas
            </NavLink>
            <NavLink href="/meus-simulados" active={isActive("/meus-simulados")} icon={<ClipboardList size={17} />} onNavigate={onNavigate} student>
              Meus Simulados
            </NavLink>
          </nav>
        </div>
      </div>
    </aside>
  );
}

function itemClass(active: boolean, student = false) {
  if (student) {
    return active
      ? "student-nav-active flex h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-bold"
      : "student-nav-idle flex h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-bold transition";
  }

  return active
    ? "relative flex items-center gap-3 overflow-hidden rounded-xl border border-amber-300/35 bg-gradient-to-r from-orange-600 via-orange-500 to-amber-400 px-3 py-2.5 text-white font-black shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset,0_10px_28px_rgba(249,115,22,0.42)] before:absolute before:inset-0 before:bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.22),transparent)] before:opacity-40"
    : "flex items-center gap-3 rounded-xl px-3 py-2.5 text-slate-500 font-semibold transition hover:bg-white/[0.055] hover:text-slate-200";
}

function NavLink({
  href,
  active,
  icon,
  children,
  onNavigate,
  student = false,
  badge,
}: {
  href: string;
  active: boolean;
  icon: ReactNode;
  children: ReactNode;
  onNavigate?: () => void;
  student?: boolean;
  badge?: number | null;
}) {
  return (
    <Link href={href} onClick={() => onNavigate?.()} className={`${itemClass(active, student)} justify-between`}>
      <span className="relative z-10 flex min-w-0 items-center gap-3">
        <span className={active && !student ? "text-white" : ""}>{icon}</span>
        <span className="truncate">{children}</span>
      </span>

      {badge ? (
        <span className="relative z-10 ml-2 inline-flex min-w-5 items-center justify-center rounded-full border border-yellow-200/60 bg-yellow-300 px-1.5 py-0.5 text-[10px] font-black text-slate-950 shadow-[0_0_18px_rgba(250,204,21,0.38)]">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

function AdminGroup({
  icon,
  title,
  open,
  onToggle,
  children,
}: {
  icon: ReactNode;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border p-1.5 transition ${
        open
          ? "border-amber-400/20 bg-[#07111f] shadow-[0_0_0_1px_rgba(245,158,11,0.04)_inset,0_16px_36px_rgba(0,0,0,0.20)]"
          : "border-white/[0.055] bg-white/[0.025] hover:border-white/[0.09]"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition ${
          open ? "text-amber-300" : "text-slate-500 hover:bg-white/[0.035] hover:text-slate-300"
        }`}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className={open ? "text-amber-400" : "text-slate-500"}>{icon}</span>
          <span className="truncate text-[9px] font-black uppercase tracking-[0.18em]">{title}</span>
        </span>

        <ChevronDown size={14} className={`shrink-0 transition ${open ? "rotate-180 text-amber-400" : ""}`} />
      </button>

      {open && <div className="mt-1.5 space-y-1">{children}</div>}
    </div>
  );
}
