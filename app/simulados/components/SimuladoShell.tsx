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
          ? "relative min-h-screen overflow-hidden bg-[#03070D] px-5 py-4 text-white sm:px-6 lg:px-8"
          : "min-h-screen bg-[#eef0f4] px-4 py-6 md:px-8 md:py-8"
      }
    >
      {isDark && (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(249,115,22,0.10),transparent_28%),radial-gradient(circle_at_82%_5%,rgba(37,99,235,0.16),transparent_34%),linear-gradient(180deg,#03070D_0%,#050B14_48%,#03070D_100%)]" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.18)_1px,transparent_1px)] [background-size:72px_72px]" />
        </>
      )}

      <section className={isDark ? "relative mx-auto max-w-[1600px]" : "mx-auto max-w-7xl"}>
        <header
          className={
            isDark
              ? "relative isolate mb-5 overflow-hidden rounded-[1.35rem] border border-white/[0.11] bg-[#07111F]/80 px-6 py-6 shadow-2xl shadow-black/35 sm:px-8"
              : "relative mb-7 overflow-hidden rounded-2xl border border-slate-200/80 bg-white px-5 py-5 shadow-sm ring-1 ring-slate-100 md:px-8 md:py-7"
          }
        >
          {isDark ? (
            <>
              <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_12%_50%,rgba(249,115,22,0.24),transparent_34%),radial-gradient(circle_at_72%_28%,rgba(37,99,235,0.18),transparent_38%)]" />
              <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#05080D] via-[#061426]/88 to-[#05080D]/90" />
              <div className="absolute inset-y-0 left-0 -z-10 w-72 bg-[radial-gradient(circle_at_20%_50%,rgba(249,115,22,0.22),transparent_58%)]" />
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