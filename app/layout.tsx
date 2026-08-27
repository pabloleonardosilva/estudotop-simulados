import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import AppShell from "./components/AppShell";
import { AuthProvider } from "./contexts/AuthContext";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-estudotop-inter",
});

export const metadata: Metadata = {
  title: "EstudoTOP Simulados",
  description: "Sistema de simulados para concursos públicos da EstudoTOP.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.variable} ${inter.className}`}>
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
