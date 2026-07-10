import type { ReactNode } from "react";

export default function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  className = "",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm ring-1 ring-slate-100 sm:p-5 ${className}`}>
      <div className="absolute left-0 top-0 h-full w-1.5 bg-gradient-to-b from-orange-500 via-amber-400 to-slate-950" />
      <div className="relative flex flex-col gap-4 pl-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          {eyebrow && <p className="text-[11px] font-black uppercase tracking-[0.24em] text-orange-600">{eyebrow}</p>}
          <h2 className="mt-1 text-lg font-black tracking-tight text-slate-950">{title}</h2>
          {description && <p className="mt-1 text-sm leading-5 text-slate-500">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}
