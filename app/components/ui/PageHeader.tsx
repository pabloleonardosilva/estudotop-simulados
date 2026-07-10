import { ReactNode } from "react";

type PageHeaderVariant = "light" | "jornada";

export default function PageHeader({
  eyebrow = "EstudoTOP Simulados",
  title,
  description,
  action,
  variant = "light",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  variant?: PageHeaderVariant;
}) {
  if (variant === "jornada") {
    return (
      <header className="relative isolate mb-7 overflow-hidden rounded-[1.35rem] border border-white/[0.11] bg-[#07111F]/80 p-5 shadow-2xl shadow-black/35 ring-1 ring-white/[0.03] md:p-7">
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_9%_20%,rgba(249,115,22,0.22),transparent_24%),radial-gradient(circle_at_82%_5%,rgba(37,99,235,0.20),transparent_35%),linear-gradient(135deg,#05080D,#061426_48%,#05080D)]" />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(3,7,13,0.36),rgba(3,7,13,0.76))] backdrop-blur-[1px]" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-400">{eyebrow}</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white md:text-4xl">{title}</h1>
            {description && <p className="mt-3 max-w-3xl text-sm leading-6 text-white/68">{description}</p>}
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
