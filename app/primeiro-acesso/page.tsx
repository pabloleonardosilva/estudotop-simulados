"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import { PasswordRequirements } from "@/app/components/auth/PasswordRequirements";
import { validatePassword } from "@/lib/auth/passwordPolicy";

export default function PrimeiroAcessoPage() {
  const token = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("token") || "";
  }, []);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [done, setDone] = useState(false);
  const [serverViolations, setServerViolations] = useState<string[]>([]);
  const passwordValidation = validatePassword(password);
  const canSubmit = Boolean(token) && passwordValidation.valid && confirmPassword.length > 0 && password === confirmPassword && !loading;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setMessage("");

    if (!token) {
      setErrorMessage("Link de primeiro acesso inválido ou incompleto.");
      return;
    }

    if (!passwordValidation.valid || password !== confirmPassword) {
      setErrorMessage(password !== confirmPassword ? "A confirmação da senha está diferente da nova senha." : "A senha não atende aos requisitos de segurança.");
      return;
    }

    setLoading(true);
    const response = await fetch("/api/auth/first-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password, confirmPassword }),
    });

    const result = (await response.json()) as { ok: boolean; message: string; violations?: string[] };
    setLoading(false);

    if (!result.ok) {
      setServerViolations(result.violations || []);
      setErrorMessage(result.message || "Não foi possível definir sua senha.");
      return;
    }

    setMessage(result.message || "Senha definida com sucesso.");
    setDone(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080b12] px-4 py-10 text-white">
      <section className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.05] p-8 shadow-2xl">
        <div className="mb-7 inline-flex rounded-2xl bg-orange-500/15 p-3 text-orange-300">
          {done ? <ShieldCheck /> : <KeyRound />}
        </div>

        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-400">Primeiro acesso</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Defina sua senha</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Crie uma senha pessoal para acessar sua área de aluno no EstudoTOP Simulados.
        </p>

        {message && (
          <div className="mt-6 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {message}
          </div>
        )}

        {errorMessage && (
          <div className="mt-6 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {errorMessage}
          </div>
        )}

        {!done ? (
          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            <div className="relative">
              <input
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 pr-12 text-sm outline-none placeholder:text-slate-500 focus:border-orange-400"
                placeholder="Nova senha"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => { setPassword(event.target.value); setServerViolations([]); }}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-orange-300"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <PasswordRequirements password={password} serverViolations={serverViolations} dark />
            <div className="relative">
              <input
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 pr-12 text-sm outline-none placeholder:text-slate-500 focus:border-orange-400"
                placeholder="Confirmar nova senha"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-orange-300"
                aria-label={showConfirmPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {confirmPassword.length > 0 && password !== confirmPassword && <p className="text-xs font-semibold text-red-300">A confirmação da senha está diferente da nova senha.</p>}
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 px-5 py-4 text-sm font-semibold text-slate-950 shadow-lg shadow-orange-500/20 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Salvando..." : "Salvar senha e liberar acesso"}
            </button>
          </form>
        ) : (
          <Link href="/login" className="mt-7 inline-flex w-full justify-center rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 px-5 py-4 text-sm font-bold text-slate-950 shadow-lg shadow-orange-500/20 transition hover:scale-[1.01]">
            Ir para o login
          </Link>
        )}
      </section>
    </main>
  );
}
