import { ReactNode } from "react";

type Variant = "light" | "jornada";

export function PremiumTable({ children, variant = "light" }: { children: ReactNode; variant?: Variant }) {
  const dark = variant === "jornada";
  return (
    <div className={dark ? "overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D1926] shadow-sm" : "overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100"}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function PremiumTableHead({ children, variant = "light" }: { children: ReactNode; variant?: Variant }) {
  const dark = variant === "jornada";
  return <thead className={dark ? "bg-gradient-to-r from-white/[0.05] to-white/[0.02] text-white/40" : "bg-gradient-to-r from-slate-50 to-slate-100/60 text-slate-500"}>{children}</thead>;
}

export function PremiumTableHeader({
  children,
  align = "left",
  variant = "light",
}: {
  children: ReactNode;
  align?: "left" | "right";
  variant?: Variant;
}) {
  const dark = variant === "jornada";
  return (
    <th className={`${dark ? "border-b border-white/[0.08] text-white/40" : "border-b border-slate-200 text-slate-500"} px-4 py-3 text-[11px] font-bold uppercase tracking-wider ${align === "right" ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

export function PremiumTableBody({ children, variant = "light" }: { children: ReactNode; variant?: Variant }) {
  const dark = variant === "jornada";
  return <tbody className={dark ? "divide-y divide-white/[0.06]" : "divide-y divide-slate-100"}>{children}</tbody>;
}

export function PremiumTableRow({ children, index, variant = "light" }: { children: ReactNode; index?: number; variant?: Variant }) {
  const dark = variant === "jornada";
  const odd = index !== undefined && index % 2 === 1;

  if (dark) {
    return <tr className={`transition ${odd ? "bg-white/[0.05]" : "bg-white/[0.02]"} hover:!bg-orange-500/[0.08]`}>{children}</tr>;
  }

  return <tr className={`transition ${odd ? "bg-slate-50/70" : "bg-white"} hover:!bg-orange-50/60`}>{children}</tr>;
}

export function PremiumTableCell({
  children,
  align = "left",
  colSpan,
  variant = "light",
}: {
  children: ReactNode;
  align?: "left" | "right";
  colSpan?: number;
  variant?: Variant;
}) {
  const dark = variant === "jornada";
  return (
    <td
      colSpan={colSpan}
      className={`px-4 py-4 ${dark ? "text-white/70" : "text-slate-600"} ${align === "right" ? "text-right" : "text-left"}`}
    >
      {children}
    </td>
  );
}
