"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, KeyRound, Loader2, ShieldAlert } from "lucide-react";

type ConfirmResponse = {
  ok: boolean;
  message?: string;
  firstAccessUrl?: string | null;
};

export default function ConfirmarCadastroPage() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Confirmando seu cadastro...");
  const [firstAccessUrl, setFirstAccessUrl] = useState<string | null>(null);

  const token = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("token") || "";
  }, []);

  useEffect(() => {
    async function confirmInvite() {
      if (!token) {
        setStatus("error");
        setMessage("Link de confirmação inválido ou incompleto.");
        return;
      }

      const response = await fetch("/api/auth/confirm-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const result = (await response.json()) as ConfirmResponse;
      setStatus(result.ok ? "success" : "error");
      setMessage(result.message || (result.ok ? "Cadastro confirmado." : "Não foi possível confirmar."));
      setFirstAccessUrl(result.firstAccessUrl || null);
    }

    confirmInvite();
  }, [token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080b12] px-4 py-10 text-white">
      <section className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 text-center shadow-2xl">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-white/10 text-orange-300">
          {status === "loading" ? (
            <Loader2 className="animate-spin" size={28} />
          ) : status === "success" ? (
            <CheckCircle2 size={30} />
          ) : (
            <ShieldAlert size={30} />
          )}
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-400">EstudoTOP Simulados</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          {status === "loading" ? "Confirmando cadastro" : status === "success" ? "Cadastro confirmado" : "Não foi possível confirmar"}
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-300">{message}</p>

        {firstAccessUrl ? (
          <a
            href={firstAccessUrl}
            className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 px-6 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-orange-500/20 transition hover:scale-[1.01]"
          >
            <KeyRound size={16} />
            Definir minha senha
          </a>
        ) : (
          <Link href="/login" className="mt-7 inline-flex rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 px-6 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-orange-500/20 transition hover:scale-[1.01]">
            Ir para o login
          </Link>
        )}
      </section>
    </main>
  );
}
