"use client";

import { Scissors } from "lucide-react";

export default function PremiumScissorsIcon({ size = 22 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-400/30 bg-gradient-to-br from-white via-red-50 to-orange-50 text-red-500 shadow-[0_10px_24px_rgba(239,68,68,0.22),inset_0_1px_0_rgba(255,255,255,0.85)] transition duration-200 group-hover:scale-105 group-hover:border-red-400/55 group-hover:text-red-600 group-hover:shadow-[0_12px_28px_rgba(239,68,68,0.32),0_0_18px_rgba(248,113,113,0.20)]"
    >
      <span className="pointer-events-none absolute inset-[3px] rounded-full border border-white/70" />
      <span className="pointer-events-none absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-300/70 blur-[1px]" />
      <Scissors size={size} strokeWidth={2.45} className="relative z-10 drop-shadow-sm" />
    </span>
  );
}
