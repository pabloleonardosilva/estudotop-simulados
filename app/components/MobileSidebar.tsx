"use client";

import { X } from "lucide-react";
import { SidebarContent } from "./Sidebar";
import { useAuth } from "../contexts/AuthContext";

export default function MobileSidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const isStudent = profile?.role === "student";

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] h-dvh">
      <button
        type="button"
        aria-label="Fechar menu"
        onClick={onClose}
        className="animate-drawer-fade-in absolute inset-0 bg-slate-950/35 backdrop-blur-[3px]"
      />

      {isStudent ? (
        <div className="animate-drawer-in absolute inset-y-3 left-3 w-[min(320px,calc(100vw-24px))] sm:inset-y-5 sm:left-5">
          <div className="relative h-full">
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white/85 text-slate-500 shadow-sm backdrop-blur transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600"
              aria-label="Fechar menu"
            >
              <X size={18} />
            </button>

            <SidebarContent onNavigate={onClose} studentDrawer />
          </div>
        </div>
      ) : (
        <div className="animate-drawer-in absolute left-0 top-0 h-dvh max-w-[86vw] shadow-2xl">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-white backdrop-blur transition hover:bg-white/20"
            aria-label="Fechar menu"
          >
            <X size={18} />
          </button>

          <SidebarContent onNavigate={onClose} />
        </div>
      )}
    </div>
  );
}
