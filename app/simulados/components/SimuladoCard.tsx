import type { ReactNode } from "react";

export default function SimuladoCard({
  title,
  description,
  icon,
  action,
  children,
  className = "",
  variant = "light",
}: {
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  variant?: "light" | "dark";
}) {
  const isDark = variant === "dark";

  return (
    <section className={`${isDark ? "relative isolate overflow-hidden rounded-[1.35rem] border border-white/[0.11] bg-[#07111F]/82 p-5 shadow-2xl shadow-black/30 backdrop-blur-xl ring-1 ring-orange-400/10 md:p-6" : "rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ring-white md:p-6"} ${className}`}>
      {(title || description || icon || action) && (
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            {icon && (
              <div className={isDark ? "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-orange-400/20 bg-orange-500/10 text-orange-300 shadow-lg shadow-orange-500/10" : "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0b0f19] text-amber-300 shadow-sm"}>
                {icon}
              </div>
            )}
            <div className="min-w-0">
              {title && <h2 className={isDark ? "text-lg font-black text-white" : "text-lg font-semibold text-slate-950"}>{title}</h2>}
              {description && <p className={isDark ? "mt-1 text-sm leading-6 text-slate-400" : "mt-1 text-sm leading-6 text-slate-500"}>{description}</p>}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}

      {children}
    </section>
  );
}
