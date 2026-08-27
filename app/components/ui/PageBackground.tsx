import { ReactNode } from "react";

type PageBackgroundVariant = "light" | "jornada";

export default function PageBackground({ children, variant = "jornada" }: { children: ReactNode; variant?: PageBackgroundVariant }) {
  if (variant === "jornada") {
    return (
      <main className="et-admin-dark-page min-h-screen px-4 py-6 md:px-8 md:py-8">
        <section className="mx-auto max-w-7xl">{children}</section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#eef0f4] px-4 py-6 md:px-8 md:py-8">
      <section className="mx-auto max-w-7xl">{children}</section>
    </main>
  );
}
