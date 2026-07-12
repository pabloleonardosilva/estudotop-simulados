"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { LockKeyhole, Target } from "lucide-react";
import { supabase } from "../lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");


  function logClientSecurityEvent(payload: Record<string, unknown>) {
    fetch("/api/system/security-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ route: "/login", ...payload }),
    }).catch(() => undefined);
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      logClientSecurityEvent({
        eventType: "login_failed",
        actorEmail: email.trim().toLowerCase(),
        riskLevel: "medium",
        blocked: true,
        reason: "Credenciais inválidas",
      });
      setLoading(false);
      setErrorMessage("E-mail ou senha inválidos. Confira os dados e tente novamente.");
      return;
    }

    // Busca o perfil para decidir se envia ao painel admin ou ao painel do aluno.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, is_active, full_name, must_change_password")
      .eq("id", data.user.id)
      .single();

    if (profileError || !profile) {
      logClientSecurityEvent({
        eventType: "invalid_session",
        actorId: data.user.id,
        actorEmail: data.user.email,
        riskLevel: "high",
        blocked: true,
        reason: "Usuário autenticado sem perfil cadastrado",
      });
      await supabase.auth.signOut();
      setLoading(false);
      setErrorMessage("Usuário autenticado, mas sem perfil cadastrado. Verifique o cadastro no painel administrativo.");
      return;
    }

    if (profile.role === "student" && profile.must_change_password) {
      logClientSecurityEvent({
        eventType: "login_first_access_required",
        actorType: "student",
        actorId: data.user.id,
        actorName: profile.full_name,
        actorEmail: data.user.email,
        riskLevel: "low",
        metadata: { destination: "/alterar-senha" },
      });

      router.replace("/alterar-senha");
      return;
    }

    if (!profile.is_active) {
      // Para alunos, verificar o status específico para dar mensagem precisa
      if (profile.role === "student") {
        const { data: student } = await supabase
          .from("students")
          .select("status")
          .eq("id", data.user.id)
          .maybeSingle();

        logClientSecurityEvent({
          eventType: "login_denied_inactive",
          actorType: "student",
          actorId: data.user.id,
          actorEmail: data.user.email,
          riskLevel: "medium",
          blocked: true,
          reason: student?.status || "inactive_profile",
        });

        await supabase.auth.signOut();
        setLoading(false);

        if (student?.status === "pending") {
          setErrorMessage("Seu cadastro ainda está em análise. Aguarde a aprovação do administrador.");
        } else if (student?.status === "blocked") {
          setErrorMessage("Seu acesso está bloqueado. Entre em contato com o suporte.");
        } else {
          setErrorMessage("Este usuário está inativo. Entre em contato com o suporte.");
        }
        return;
      }

      logClientSecurityEvent({
        eventType: "login_denied_inactive",
        actorType: profile.role,
        actorId: data.user.id,
        actorEmail: data.user.email,
        riskLevel: "medium",
        blocked: true,
        reason: "inactive_profile",
      });
      await supabase.auth.signOut();
      setLoading(false);
      setErrorMessage("Este usuário está inativo. Entre em contato com o suporte.");
      return;
    }

    logClientSecurityEvent({
      eventType: "login_success",
      actorType: profile.role,
      actorId: data.user.id,
      actorName: profile.full_name,
      actorEmail: data.user.email,
      riskLevel: "low",
      metadata: { destination: profile.role === "admin" ? "/dashboard" : "/aluno" },
    });

    router.replace(profile.role === "admin" ? "/dashboard" : "/aluno");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080b12] px-4 py-10 text-white">
      <div className="grid w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] shadow-2xl lg:grid-cols-2">
        <section className="relative bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-300 p-8 text-slate-950 sm:p-10 lg:min-h-[620px]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.5),transparent_35%)]" />
          <div className="relative z-10 flex h-full flex-col justify-between gap-10 lg:gap-12">
            <div>
              <Image
                src="/images/Logo 04 -transp.png"
                alt="EstudoTOP"
                width={1053}
                height={430}
                priority
                className="h-16 w-auto object-contain sm:h-20"
              />
              <h1 className="mt-8 max-w-md text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
                Simulados com cara de aprovação.
              </h1>
            </div>
            <div className="rounded-3xl border border-white/10 bg-slate-950/85 p-6 text-white shadow-xl backdrop-blur-sm sm:p-7">
              <span className="inline-flex rounded-xl bg-white/10 p-2.5 text-amber-300">
                <Target size={20} />
              </span>
              <p className="mt-4 text-xl font-semibold leading-snug sm:text-2xl">
                Correção + Resultado + Diagnóstico = Aprovação
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                O aluno resolve o simulado, recebe as correções, tem um diagnóstico personalizado e obtém sucesso na prova.
              </p>
            </div>
          </div>
        </section>

        <section className="p-6 sm:p-10">
          <div className="mx-auto max-w-md py-8">
            <div className="mb-8 inline-flex rounded-2xl bg-white/10 p-3 text-orange-300">
              <LockKeyhole />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-400">Acesso</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Entrar no sistema</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Use o e-mail e a senha cadastrados para acessar seus simulados ou o painel administrativo.
            </p>

            <form className="mt-8 space-y-4" onSubmit={handleLogin}>
              <input
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm outline-none placeholder:text-slate-500 focus:border-orange-400"
                placeholder="E-mail"
                aria-label="E-mail"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <input
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm outline-none placeholder:text-slate-500 focus:border-orange-400"
                placeholder="Senha"
                aria-label="Senha"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />

              {errorMessage && (
                <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {errorMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 px-5 py-4 text-sm font-semibold text-slate-950 shadow-lg shadow-orange-500/20 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Entrando..." : "Entrar"}
              </button>

              <div className="flex flex-col items-center gap-2 text-center">
                <Link href="/esqueci-senha" className="text-sm font-semibold text-orange-300 hover:text-orange-200">
                  Esqueci minha senha
                </Link>
                <span className="text-xs text-slate-500">
                  Não tem conta?{" "}
                  <Link href="/cadastro" className="font-semibold text-orange-300 hover:text-orange-200">
                    Cadastre-se
                  </Link>
                </span>
              </div>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
