import { ReactNode } from "react";

type PageBackgroundVariant = "light" | "jornada";

export default function PageBackground({ children, variant = "light" }: { children: ReactNode; variant?: PageBackgroundVariant }) {
  if (variant === "jornada") {
    return (
      <main className="et-dark-admin-page relative min-h-screen overflow-hidden bg-[#03070D] px-4 py-6 text-slate-100 md:px-8 md:py-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_0%,rgba(249,115,22,0.12),transparent_30%),radial-gradient(circle_at_78%_5%,rgba(37,99,235,0.16),transparent_32%),linear-gradient(180deg,#03070D_0%,#050B14_48%,#03070D_100%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.055] [background-image:linear-gradient(rgba(255,255,255,.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.18)_1px,transparent_1px)] [background-size:72px_72px]" />
        <section className="relative mx-auto max-w-7xl">{children}</section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#eef0f4] px-4 py-6 md:px-8 md:py-8">
      <section className="mx-auto max-w-7xl">{children}</section>
    </main>
  );
}
