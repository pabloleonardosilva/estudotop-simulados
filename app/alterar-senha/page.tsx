"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import { supabase } from "../lib/supabase/client";
import { useAuth } from "../contexts/AuthContext";

export default function ChangePasswordPage() {
  const router = useRouter();
  const { session, refreshProfile, signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(5);

  useEffect(() => {
    if (!passwordChanged) return;

    const intervalId = window.setInterval(() => {
      setRedirectCountdown((current) => Math.max(current - 1, 0));
    }, 1000);

    const redirectId = window.setTimeout(async () => {
      await signOut();
      router.replace("/login?senha_alterada=1");
      router.refresh();
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(redirectId);
    };
  }, [passwordChanged, router, signOut]);

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setErrorMessage("");

    if (password.length < 6) {
      setLoading(false);
      setErrorMessage("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setLoading(false);
      setErrorMessage("As senhas nao conferem.");
      return;
    }

    const { error: passwordError } = await supabase.auth.updateUser({ password });

    if (passwordError) {
      setLoading(false);
      setErrorMessage("Nao foi possivel alterar a senha. Tente novamente.");
      return;
    }

    if (!session?.access_token) {
      setLoading(false);
      setErrorMessage("Nao foi possivel localizar sua sessao. Entre em contato com o suporte.");
      return;
    }

    const response = await fetch("/api/auth/complete-password-change", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    const result = (await response.json()) as { ok: boolean; message: string };

    if (!result.ok) {
      setLoading(false);
      setErrorMessage("Senha alterada, mas nao foi possivel liberar seu perfil. Entre em contato com o suporte.");
      return;
    }

    await refreshProfile();
    setLoading(false);
    setPasswordChanged(true);
    setRedirectCountdown(5);
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
    router.refresh();
  }

  if (passwordChanged) {
    const progressPercent = ((5 - redirectCountdown) / 5) * 100;

    return (
      <main className="flex min-h-screen items-center justify-center overflow-hidden bg-[#eef0f4] px-4 py-10">
        <section className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-emerald-100 bg-white p-8 text-center shadow-xl shadow-slate-200/70 ring-1 ring-white">
          <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-emerald-200/45 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 h-52 w-52 rounded-full bg-orange-200/45 blur-3xl" />

          <div className="relative mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
            <div className="absolute inset-0 animate-ping rounded-full bg-emerald-300/25" />
            <CheckCircle2 className="relative" size={44} strokeWidth={2.4} />
          </div>

          <p className="mt-7 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-600">
            Senha atualizada
          </p>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Sua senha foi modificada com sucesso
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-600">
            Agora você poderá entrar novamente usando sua senha definitiva. Por segurança, vamos encerrar este primeiro acesso.
          </p>

          <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-center justify-center gap-2 text-sm font-semibold text-slate-700">
              <ShieldCheck size={18} className="text-orange-500" />
              Redirecionando para o login em
            </div>

            <div className="mx-auto mt-4 flex h-20 w-20 items-center justify-center rounded-full border border-orange-100 bg-white text-4xl font-semibold text-orange-500 shadow-sm">
              {redirectCountdown}
            </div>

            <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-1000 ease-linear"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={async () => {
              await signOut();
              router.replace("/login?senha_alterada=1");
              router.refresh();
            }}
            className="mt-6 text-sm font-semibold text-slate-500 transition hover:text-orange-600"
          >
            Ir para o login agora
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef0f4] px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm ring-1 ring-slate-100">
        <div className="mb-7 inline-flex rounded-xl bg-orange-50 p-3 text-orange-600 ring-1 ring-orange-100">
          <KeyRound />
        </div>

        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-600">
          Primeiro acesso
        </p>

        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          Crie sua nova senha
        </h1>

        <p className="mt-3 text-sm leading-6 text-slate-600">
          Por seguranca, a senha provisoria precisa ser substituida antes de continuar.
        </p>

        <form className="mt-8 space-y-4" onSubmit={handleChangePassword}>
          <div className="relative">
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 pr-12 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
              placeholder="Nova senha"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-orange-500"
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <div className="relative">
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 pr-12 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
              placeholder="Confirmar nova senha"
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((prev) => !prev)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-orange-500"
              aria-label={showConfirmPassword ? "Ocultar senha" : "Mostrar senha"}
            >
              {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {errorMessage && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 px-5 py-4 text-sm font-semibold text-slate-950 shadow-lg shadow-orange-500/20 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Salvando..." : "Salvar nova senha"}
          </button>
        </form>

        <button
          type="button"
          onClick={handleSignOut}
          className="mt-6 block w-full text-center text-sm font-semibold text-slate-500 transition hover:text-slate-800"
        >
          Sair e voltar depois
        </button>
      </section>
    </main>
  );
}
