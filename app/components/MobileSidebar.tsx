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
        className="animate-drawer-fade-in absolute inset-0 bg-slate-950/45"
      />

      {isStudent ? (
        <div className="absolute left-3 top-1/2 max-w-[86vw] -translate-y-1/2">
          <div className="animate-drawer-in relative">
            <button
              type="button"
              onClick={onClose}
              className="absolute -right-2 -top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[#0A1322] text-white shadow-lg transition hover:bg-white/15"
              aria-label="Fechar menu"
            >
              <X size={16} />
            </button>

            <SidebarContent onNavigate={onClose} />
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
