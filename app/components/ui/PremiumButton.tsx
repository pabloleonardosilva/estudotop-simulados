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
      "et-admin-dark-button-secondary",
    "dark-danger":
      "et-admin-dark-button-danger",
    "dark-warning":
      "et-admin-dark-button-warning",
    "dark-success":
      "et-admin-dark-button-success",
    "dark-primary":
      "et-admin-dark-button-primary active:scale-[0.98]",
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
