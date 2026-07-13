"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { MailCheck } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setErrorMessage("");

    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const result = (await response.json()) as { ok: boolean; message: string };

    setLoading(false);

    if (!result.ok) {
      setErrorMessage(result.message || "Não foi possível processar a solicitação agora. Tente novamente.");
      return;
    }

    setMessage(result.message);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080b12] px-4 py-10 text-white">
      <section className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 shadow-2xl">
        <div className="mb-8 inline-flex rounded-2xl bg-white/10 p-3 text-orange-300">
          <MailCheck />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-400">Recuperação de acesso</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Esqueci minha senha</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Informe seu e-mail. Se a conta já estiver aprovada, enviaremos um link seguro para você criar uma nova senha.
        </p>

        <form className="mt-8 space-y-4" onSubmit={handleResetPassword}>
          <input
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm outline-none placeholder:text-slate-500 focus:border-orange-400"
            placeholder="Seu e-mail"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          {message && <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div>}
          {errorMessage && <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{errorMessage}</div>}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 px-5 py-4 text-sm font-semibold text-slate-950 shadow-lg shadow-orange-500/20 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Enviando..." : "Enviar link de recuperação"}
          </button>
        </form>

        <Link href="/login" className="mt-6 block text-center text-sm font-semibold text-orange-300 hover:text-orange-200">
          Voltar para o login
        </Link>
      </section>
    </main>
  );
}
