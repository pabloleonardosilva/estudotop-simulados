import Link from "next/link";
import { ReactNode } from "react";

export default function PremiumButton({
  children,
  icon,
  variant = "primary",
  full = false,
  href,
  className = "",
  onClick,
  type = "button",
  disabled = false,
}: {
  children: ReactNode;
  icon?: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "dark" | "dark-danger" | "dark-warning" | "dark-success" | "dark-primary";
  full?: boolean;
  href?: string;
  className?: string;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition";

  const variants = {
    primary:
      "bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950 shadow-lg shadow-orange-500/20 hover:-translate-y-0.5 hover:shadow-xl",
    secondary:
      "border border-slate-200 bg-white text-slate-800 hover:bg-slate-100",
    ghost:
      "text-slate-600 hover:bg-slate-100",
    danger:
      "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
    dark:
      "border border-white/[0.09] bg-white/[0.06] text-white/70 hover:border-white/[0.15] hover:bg-white/[0.10] hover:text-white/90",
    "dark-danger":
      "border border-red-500/25 bg-red-500/[0.08] text-red-400 hover:border-red-500/40 hover:bg-red-500/[0.14] hover:text-red-300",
    "dark-warning":
      "border border-amber-500/25 bg-amber-500/[0.08] text-amber-400 hover:border-amber-500/40 hover:bg-amber-500/[0.14] hover:text-amber-300",
    "dark-success":
      "border border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-400 hover:border-emerald-500/40 hover:bg-emerald-500/[0.14] hover:text-emerald-300",
    "dark-primary":
      "bg-gradient-to-r from-orange-500 to-amber-400 text-slate-950 shadow-md shadow-orange-900/40 hover:from-orange-600 hover:to-amber-500 active:scale-[0.98]",
  };

  const buttonClass = `${base} ${variants[variant]} ${full ? "w-full" : ""} ${
    disabled ? "cursor-not-allowed opacity-60 hover:translate-y-0 hover:shadow-none" : ""
  } ${className}`;

  const content = (
    <>
      {icon && <span>{icon}</span>}
      {children}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        onClick={disabled ? undefined : onClick}
        aria-disabled={disabled}
        className={`${buttonClass} ${disabled ? "pointer-events-none" : ""}`}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={buttonClass}
    >
      {content}
    </button>
  );
}
