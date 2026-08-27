import { ReactNode } from "react";

export default function PremiumCard({
  title,
  description,
  icon,
  children,
  action,
  className = "",
  variant = "jornada",
}: {
  title?: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  variant?: "light" | "jornada";
}) {
  const dark = variant === "jornada";
  return (
    <div className={`${dark ? "et-admin-dark-panel relative overflow-visible p-5 transition hover:border-white/[0.12] md:p-6" : "relative overflow-visible rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm ring-1 ring-slate-100 transition hover:shadow-md md:p-6"} ${className}`}>
      {(title || description || icon || action) && (
        <div className="relative mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            {icon && (
              <div className={dark ? "et-admin-dark-icon-box et-admin-dark-icon-box-orange" : "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600 ring-1 ring-orange-100"}>
                {icon}
              </div>
            )}

            <div className="min-w-0">
              {title && (
                <h2 className={dark ? "et-admin-dark-section-title" : "text-lg font-medium text-slate-950"}>{title}</h2>
              )}

              {description && (
                <p className={dark ? "et-admin-dark-muted mt-1" : "mt-1 text-sm text-slate-500"}>{description}</p>
              )}
            </div>
          </div>

          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}

      <div className="relative">{children}</div>
    </div>
  );
}
