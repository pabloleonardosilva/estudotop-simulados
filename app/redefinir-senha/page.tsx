"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { supabase } from "../lib/supabase/client";
import { PasswordRequirements } from "@/app/components/auth/PasswordRequirements";
import { validatePassword } from "@/lib/auth/passwordPolicy";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [serverViolations, setServerViolations] = useState<string[]>([]);
  const [recoveryAccessToken, setRecoveryAccessToken] = useState("");
  const [privateRecoveryToken, setPrivateRecoveryToken] = useState("");
  const [checkingRecovery, setCheckingRecovery] = useState(true);
  const passwordValidation = validatePassword(password);
  const canSubmit = Boolean(recoveryAccessToken || privateRecoveryToken) && passwordValidation.valid && confirmPassword.length > 0 && password === confirmPassword && !loading && !checkingRecovery;

  useEffect(() => {
    let mounted = true;
    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
    const privateToken = url.searchParams.get("token");
    const code = url.searchParams.get("code");
    const tokenHash = url.searchParams.get("token_hash");
    const recoveryType = url.searchParams.get("type") || hashParams.get("type");

    if (privateToken) {
      queueMicrotask(() => {
        if (!mounted) return;
        if (/^[0-9a-f]{64}$/i.test(privateToken)) {
          setPrivateRecoveryToken(privateToken);
          setCheckingRecovery(false);
          window.history.replaceState({}, "", "/redefinir-senha");
        } else {
          setErrorMessage("Este link é inválido ou expirou. Solicite uma nova redefinição de senha.");
          setCheckingRecovery(false);
          window.history.replaceState({}, "", "/redefinir-senha");
        }
      });
      return () => { mounted = false; };
    }

    function acceptRecoverySession(session: Session | null) {
      if (!mounted || !session?.access_token) return false;
      setRecoveryAccessToken(session.access_token);
      setErrorMessage("");
      setCheckingRecovery(false);
      window.history.replaceState({}, "", "/redefinir-senha");
      return true;
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") acceptRecoverySession(session);
    });

    void (async () => {
      const callbackError = url.searchParams.get("error_description") || hashParams.get("error_description");
      if (callbackError) {
        if (mounted) {
          setErrorMessage("O link de redefinição é inválido ou expirou. Solicite um novo link.");
          setCheckingRecovery(false);
        }
        return;
      }

      if (tokenHash && recoveryType === "recovery") {
        const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
        if (!error && acceptRecoverySession(data.session)) return;
      } else if (code) {
        const { data: current } = await supabase.auth.getSession();
        if (acceptRecoverySession(current.session)) return;
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error && acceptRecoverySession(data.session)) return;
      } else {
        const { data } = await supabase.auth.getSession();
        if (acceptRecoverySession(data.session)) return;
      }

      if (mounted) {
        setErrorMessage("Sua sessão de alteração de senha expirou. Solicite um novo acesso.");
        setCheckingRecovery(false);
      }
    })();

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  async function handleUpdatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setErrorMessage("");

    if (!passwordValidation.valid || password !== confirmPassword) {
      setLoading(false);
      setErrorMessage(password !== confirmPassword ? "A confirmação da senha está diferente da nova senha." : "A senha não atende aos requisitos de segurança.");
      return;
    }

    const accessToken = recoveryAccessToken;
    if (!accessToken && !privateRecoveryToken) {
      setLoading(false);
      setErrorMessage("Sua sessão de alteração de senha expirou. Solicite um novo acesso.");
      return;
    }

    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password, confirmPassword, ...(privateRecoveryToken ? { token: privateRecoveryToken } : {}) }),
    });
    const result = (await response.json()) as { ok: boolean; code?: string; message: string; violations?: string[] };

    setLoading(false);

    if (!result.ok) {
      setServerViolations(result.violations || []);
      if (result.code === "PASSWORD_TOKEN_INVALID") {
        setPrivateRecoveryToken("");
        window.history.replaceState({}, "", "/redefinir-senha");
      }
      setErrorMessage(result.message || "Não foi possível alterar a senha. Abra novamente o link recebido por e-mail ou solicite outro link.");
      return;
    }

    setMessage("Senha alterada com sucesso. Redirecionando para o login...");
    window.history.replaceState({}, "", "/redefinir-senha");

    setTimeout(async () => {
      await supabase.auth.signOut();
      router.replace("/login");
    }, 1200);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080b12] px-4 py-10 text-white">
      <section className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 shadow-2xl">
        <div className="mb-8 inline-flex rounded-2xl bg-white/10 p-3 text-orange-300">
          <KeyRound />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-400">Nova senha</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Redefinir senha</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Digite uma nova senha para sua conta. Esta tela funciona quando aberta pelo link enviado por e-mail.
        </p>

        {checkingRecovery && <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">Validando seu link de redefinição...</div>}

        <form className="mt-8 space-y-4" onSubmit={handleUpdatePassword}>
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

          {message && <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div>}
          {errorMessage && <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{errorMessage}</div>}
          {errorMessage && !checkingRecovery && !recoveryAccessToken && !privateRecoveryToken && (
            <Link href="/esqueci-senha" className="block text-center text-sm font-semibold text-orange-300 hover:text-orange-200">
              Solicitar novo link
            </Link>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 px-5 py-4 text-sm font-semibold text-slate-950 shadow-lg shadow-orange-500/20 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Salvando..." : "Salvar nova senha"}
          </button>
        </form>

        <Link href="/login" className="mt-6 block text-center text-sm font-semibold text-orange-300 hover:text-orange-200">
          Voltar para o login
        </Link>
      </section>
    </main>
  );
}
