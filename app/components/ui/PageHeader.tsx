import { ReactNode } from "react";

type PageHeaderVariant = "light" | "jornada";

export default function PageHeader({
  eyebrow = "EstudoTOP Simulados",
  title,
  description,
  action,
  variant = "jornada",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  variant?: PageHeaderVariant;
}) {
  if (variant === "jornada") {
    return (
      <header className="et-admin-dark-hero relative isolate mb-7 overflow-hidden p-5 md:p-7">
        <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="et-admin-dark-label text-orange-400">{eyebrow}</p>
            <h1 className="et-admin-dark-page-title mt-3">{title}</h1>
            {description && <p className="et-admin-dark-text mt-3 max-w-3xl">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      </header>
    );
  }

  return (
    <header className="relative mb-7 overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm ring-1 ring-slate-100 md:p-7">
      <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-600">
            {eyebrow}
          </p>

          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 md:text-4xl">
            {title}
          </h1>

          {description && (
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              {description}
            </p>
          )}
        </div>

        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}
