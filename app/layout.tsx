import type { Metadata } from "next";
import "./globals.css";
import AppShell from "./components/AppShell";

export const metadata: Metadata = {
  title: "EstudoTOP Simulados",
  description: "Sistema de simulados para concursos públicos da EstudoTOP.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {/* AppShell controla a moldura visual do sistema: menu lateral, topo e rodapé. */}
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
