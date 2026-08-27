import type { ReactNode } from "react";

export default function SimuladoShell({
  eyebrow = "Módulo de Simulados",
  title,
  description,
  action,
  children,
  variant = "light",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  variant?: "light" | "dark";
}) {
  const isDark = variant === "dark";

  return (
    <main
      className={
        isDark
          ? "et-admin-dark-page relative overflow-hidden px-5 py-4 sm:px-6 lg:px-8"
          : "min-h-screen bg-[#eef0f4] px-4 py-6 md:px-8 md:py-8"
      }
    >
      <section className={isDark ? "relative mx-auto max-w-[1600px]" : "mx-auto max-w-7xl"}>
        <header
          className={
            isDark
              ? "et-admin-dark-hero relative isolate mb-5 overflow-hidden px-6 py-6 sm:px-8"
              : "relative mb-7 overflow-hidden rounded-2xl border border-slate-200/80 bg-white px-5 py-5 shadow-sm ring-1 ring-slate-100 md:px-8 md:py-7"
          }
        >
          {isDark ? (
            <>
              <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_13%_47%,rgba(249,115,22,.18),transparent_28%)]" />
              <div className="absolute bottom-0 left-0 h-px w-full bg-gradient-to-r from-orange-400/70 via-white/10 to-transparent" />
            </>
          ) : (
            <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-orange-500/5 blur-3xl" />
          )}

          <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 max-w-4xl">
              <p
                className={
                  isDark
                    ? "text-xs font-black uppercase tracking-[0.28em] text-orange-400"
                    : "text-xs font-semibold uppercase tracking-[0.24em] text-orange-600"
                }
              >
                {eyebrow}
              </p>
              <h1
                className={
                  isDark
                    ? "mt-1 text-3xl font-black tracking-tight text-white md:text-5xl"
                    : "mt-3 text-2xl font-semibold tracking-tight text-slate-950"
                }
              >
                {title}
              </h1>
              {description && (
                <p
                  className={
                    isDark
                      ? "mt-3 max-w-4xl text-sm leading-relaxed text-white/72 md:text-base"
                      : "mt-3 max-w-2xl text-sm leading-6 text-slate-500"
                  }
                >
                  {description}
                </p>
              )}
            </div>

            {action && <div className="shrink-0">{action}</div>}
          </div>
        </header>

        <div>{children}</div>
      </section>
    </main>
  );
}
