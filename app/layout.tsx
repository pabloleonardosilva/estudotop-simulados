import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import AppShell from "./components/AppShell";
import { AuthProvider } from "./contexts/AuthContext";

export const metadata: Metadata = {
  title: "EstudoTOP Simulados",
  description: "Sistema de simulados para concursos públicos da EstudoTOP.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {/* AuthProvider mantém sessão, usuário e perfil disponíveis no sistema inteiro. */}
        <AuthProvider>
          {/* AppShell controla menu lateral, topo, rodapé e proteção de rotas. */}
          <Suspense fallback={null}>
            <AppShell>{children}</AppShell>
          </Suspense>
        </AuthProvider>
      </body>
    </html>
  );
}
