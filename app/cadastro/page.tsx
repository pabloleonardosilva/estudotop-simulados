"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { FormEvent, useEffect, useState } from "react";
import { BookOpen, Eye, EyeOff, GraduationCap, KeyRound, MailCheck, ShieldCheck, Trophy } from "lucide-react";
import { formatCpf, isValidCpf, onlyDigits } from "@/lib/utils/cpf";
import { supabase } from "../lib/supabase/client";
import { PasswordRequirements } from "@/app/components/auth/PasswordRequirements";
import { validatePassword } from "@/lib/auth/passwordPolicy";

type Step = "form" | "code" | "password" | "done";
type RegistrationField = "fullName" | "whatsapp" | "email" | "cpf" | "desiredContests";
const RECAPTCHA_ACTION = "public_registration";

declare global {
  interface Window {
    grecaptcha?: {
      ready(callback: () => void): void;
      execute(siteKey: string, options: { action: string }): Promise<string>;
    };
  }
}

const FIELD_LABELS: Record<RegistrationField, string> = {
  fullName: "nome completo",
  whatsapp: "WhatsApp",
  email: "melhor e-mail",
  cpf: "CPF",
  desiredContests: "concursos desejados",
};

function formatRequiredFields(fields: RegistrationField[]) {
  const labels = fields.map((field) => FIELD_LABELS[field]);
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} e ${labels.at(-1)}`;
}

export default function CadastroPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("form");
  const [fullName, setFullName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [desiredContests, setDesiredContests] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [invalidFields, setInvalidFields] = useState<RegistrationField[]>([]);
  const [eventSignup, setEventSignup] = useState(false);
  const [eventId, setEventId] = useState<string | null>(null);
  const [passwordSetupToken, setPasswordSetupToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordViolations, setPasswordViolations] = useState<string[]>([]);
  const [passwordCreated, setPasswordCreated] = useState(false);
  const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "";
  const passwordValidation = validatePassword(password, { fullName, email });
  const canCreatePassword = passwordValidation.valid && confirmPassword.length > 0 && password === confirmPassword && !loading;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams(window.location.search);
      const eventEmail = query.get("email");
      setEventSignup(Boolean(query.get("event")));
      if (eventEmail) setEmail(eventEmail);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const cpfDigits = onlyDigits(cpf);
  const cpfInvalid = cpfDigits.length > 0 && !isValidCpf(cpfDigits);
  const emailInvalid = email.trim().length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function handleRequestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    const missingFields = [
      !fullName.trim() ? "fullName" : null,
      !whatsapp.trim() ? "whatsapp" : null,
      !email.trim() ? "email" : null,
      !cpfDigits ? "cpf" : null,
      !desiredContests.trim() ? "desiredContests" : null,
    ].filter((field): field is RegistrationField => field !== null);

    if (missingFields.length > 0) {
      setLoading(false);
      setInvalidFields(missingFields);
      setErrorMessage(`Preencha os campos obrigatórios: ${formatRequiredFields(missingFields)}.`);
      return;
    }

    if (cpfInvalid) {
      setLoading(false);
      setInvalidFields(["cpf"]);
      setErrorMessage("CPF inválido. Verifique os dígitos informados.");
      return;
    }

    if (emailInvalid) {
      setLoading(false);
      setInvalidFields(["email"]);
      setErrorMessage("O e-mail informado não é válido.");
      return;
    }

    if (!recaptchaSiteKey || !window.grecaptcha) {
      setLoading(false);
      setErrorMessage("Não foi possível validar o envio. Tente novamente.");
      return;
    }

    try {
      const grecaptcha = window.grecaptcha;
      const captchaToken = await new Promise<string>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => reject(new Error("recaptcha_timeout")), 10_000);
        grecaptcha.ready(() => {
          grecaptcha.execute(recaptchaSiteKey, { action: RECAPTCHA_ACTION })
            .then((token) => {
              window.clearTimeout(timeoutId);
              resolve(token);
            })
            .catch((error) => {
              window.clearTimeout(timeoutId);
              reject(error);
            });
        });
      });
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          whatsapp,
          email,
          cpf: cpfDigits,
          desiredContests,
          captcha_token: captchaToken,
        }),
      });

      const data = (await response.json()) as { ok: boolean; message: string; fields?: RegistrationField[] };

      if (!data.ok) {
        setInvalidFields(data.fields || []);
        setErrorMessage(data.message);
        return;
      }

      setInvalidFields([]);
      setSuccessMessage(data.message);
      setStep("code");
    } catch {
      setErrorMessage("Não foi possível enviar o código agora. Verifique sua conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  function clearFieldError(field: RegistrationField) {
    setInvalidFields((current) => current.filter((item) => item !== field));
  }

  function fieldClass(field: RegistrationField, extraInvalid = false) {
    return invalidFields.includes(field) || extraInvalid
      ? "w-full rounded-2xl border border-red-400 bg-red-500/10 px-4 py-3.5 text-sm outline-none placeholder:text-red-200/60 focus:border-red-300"
      : "w-full rounded-2xl border border-white/10 bg-white/8 px-4 py-3.5 text-sm outline-none placeholder:text-slate-500 focus:border-orange-400";
  }

  async function handleConfirmCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/auth/confirm-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });

      const data = (await response.json()) as {
        ok: boolean;
        code?: string;
        message: string;
        resend_message?: string;
        clear_code?: boolean;
        event_id?: string | null;
        password_setup_token?: string | null;
      };

      if (!data.ok) {
        if (data.clear_code) setCode("");
        if (data.resend_message) setSuccessMessage(data.resend_message);
        setErrorMessage(data.message);
        return;
      }

      setSuccessMessage(data.message);
      if (data.event_id && data.password_setup_token) {
        setEventId(data.event_id);
        setPasswordSetupToken(data.password_setup_token);
        setStep("password");
        return;
      }
      setStep("done");
    } catch {
      setErrorMessage("Não foi possível confirmar o código agora. Verifique sua conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (!passwordSetupToken) {
      setErrorMessage("Sua sessão de definição de senha expirou. Solicite um novo cadastro.");
      return;
    }
    if (!passwordValidation.valid || password !== confirmPassword) {
      setErrorMessage(password !== confirmPassword ? "A confirmação da senha está diferente da nova senha." : "A senha não atende aos requisitos de segurança.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/first-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: passwordSetupToken, password, confirmPassword }),
      });

      const data = (await response.json()) as { ok: boolean; message: string; violations?: string[] };

      if (!data.ok) {
        setPasswordViolations(data.violations || []);
        setErrorMessage(data.message || "Não foi possível definir sua senha.");
        return;
      }

      setPasswordCreated(true);
      const { data: authData } = await supabase.auth.signInWithPassword({ email, password });
      setSuccessMessage("Cadastro concluído.");

      if (authData?.session && eventId) {
        router.replace(`/meus-eventos/${eventId}`);
        return;
      }
      setStep("done");
    } catch {
      setErrorMessage("Não foi possível concluir agora. Verifique sua conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#04060b] text-white">
      {recaptchaSiteKey && (
        <Script
          id="public-registration-recaptcha"
          src={`https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(recaptchaSiteKey)}`}
          strategy="afterInteractive"
        />
      )}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-95"
        style={{ backgroundImage: "url('/images/cadastro-wallpaper-estudotop.png')" }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-black/10" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_left,rgba(255,107,0,0.18),transparent_42%)]" />

      <div className="relative z-10 flex min-h-screen items-center px-4 py-8 lg:px-12">
        <div className="grid w-full max-w-7xl gap-8 lg:grid-cols-[minmax(420px,520px)_1fr] lg:items-center">
          <section className="rounded-[2rem] border border-white/10 bg-[#070a11]/88 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
            <div className="mb-6 inline-flex rounded-2xl bg-orange-500/15 p-3 text-orange-300">
              <MailCheck />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-400">
              {step === "form" ? "Dados do aluno" : step === "code" ? "Confirmação" : step === "password" ? "Segurança" : "Cadastro confirmado"}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              {step === "form" ? "Cadastro de acesso" : step === "code" ? "Digite o código enviado" : step === "password" ? "Crie sua senha" : "Cadastro efetivado"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {step === "form"
                ? "Preencha seus dados, confirme o código enviado ao e-mail e aguarde a liberação da equipe EstudoTOP. O CPF é obrigatório e evita cadastros duplicados."
                : step === "code"
                ? `Enviamos um código para ${email}. Confirme para efetivar o cadastro. Esse código possui validade limitada.`
                : step === "password"
                ? "E-mail confirmado com sucesso. Agora crie sua senha de acesso para concluir o cadastro."
                : eventSignup
                ? (passwordCreated ? "Sua senha foi criada e o cadastro foi concluído." : "Sua conta está ativa. Use \"Esqueci minha senha\" na tela de login para criar sua senha de acesso.")
                : "Seu e-mail foi confirmado. Depois da aprovação, você receberá um link para definir sua senha de primeiro acesso."}
            </p>

            {successMessage && (
              <div className="mt-5 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {successMessage}
              </div>
            )}

            {errorMessage && (
              <div className="mt-5 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {errorMessage}
              </div>
            )}

            {step === "form" && (
              <form className="mt-6 space-y-4" onSubmit={handleRequestCode} noValidate>
                <input className={fieldClass("fullName")} aria-invalid={invalidFields.includes("fullName")} placeholder="Nome completo" type="text" value={fullName} onChange={(e) => { setFullName(e.target.value); clearFieldError("fullName"); }} />
                <div className="grid gap-4 md:grid-cols-2">
                  <input className={fieldClass("whatsapp")} aria-invalid={invalidFields.includes("whatsapp")} placeholder="WhatsApp" type="tel" value={whatsapp} onChange={(e) => { setWhatsapp(e.target.value); clearFieldError("whatsapp"); }} />
                  <input className={fieldClass("email", emailInvalid)} aria-invalid={invalidFields.includes("email") || emailInvalid} placeholder="Melhor e-mail" type="email" value={email} readOnly={eventSignup} onChange={(e) => { setEmail(e.target.value); clearFieldError("email"); }} />
                </div>
                <input className={fieldClass("cpf", cpfInvalid)} aria-invalid={invalidFields.includes("cpf") || cpfInvalid} placeholder="CPF obrigatório" type="text" value={cpf} onChange={(e) => { setCpf(formatCpf(e.target.value)); clearFieldError("cpf"); }} />
                {cpfInvalid && <p className="text-xs font-semibold text-red-300">CPF inválido. Verifique os dígitos.</p>}
                <textarea className={`${fieldClass("desiredContests")} min-h-24 resize-y`} aria-invalid={invalidFields.includes("desiredContests")} placeholder="Concursos desejados. Ex.: TJSP, Polícia Federal, GCM SP..." value={desiredContests} onChange={(e) => { setDesiredContests(e.target.value); clearFieldError("desiredContests"); }} />
                <button type="submit" disabled={loading} className="flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 px-5 py-4 text-sm font-semibold text-slate-950 shadow-lg shadow-orange-500/20 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60">
                  {loading ? "Enviando código..." : "Enviar código de confirmação"}
                </button>
              </form>
            )}

            {step === "code" && (
              <form className="mt-6 space-y-4" onSubmit={handleConfirmCode}>
                <input className="w-full rounded-2xl border border-white/10 bg-white/8 px-4 py-4 text-center text-2xl font-black tracking-[0.35em] outline-none placeholder:text-slate-500 focus:border-orange-400" placeholder="000000" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} required minLength={6} maxLength={6} />
                <button type="submit" disabled={loading} className="flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 px-5 py-4 text-sm font-semibold text-slate-950 shadow-lg shadow-orange-500/20 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60">
                  {loading ? "Confirmando..." : "Confirmar e efetivar cadastro"}
                </button>
                <button type="button" disabled={loading} onClick={() => setStep("form")} className="w-full rounded-2xl border border-white/10 px-5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/5">
                  Corrigir dados
                </button>
              </form>
            )}

            {step === "password" && (
              <form className="mt-6 space-y-4" onSubmit={handleCreatePassword}>
                <div className="mb-2 inline-flex rounded-2xl bg-orange-500/15 p-2.5 text-orange-300">
                  <KeyRound size={18} />
                </div>
                <div className="relative">
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-white/8 px-4 py-3.5 pr-12 text-sm outline-none placeholder:text-slate-500 focus:border-orange-400"
                    placeholder="Senha"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setPasswordViolations([]); }}
                    required
                  />
                  <button type="button" onClick={() => setShowPassword((prev) => !prev)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-orange-300" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                <PasswordRequirements password={password} context={{ fullName, email }} serverViolations={passwordViolations} dark />
                <div className="relative">
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-white/8 px-4 py-3.5 pr-12 text-sm outline-none placeholder:text-slate-500 focus:border-orange-400"
                    placeholder="Confirmar senha"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                  <button type="button" onClick={() => setShowConfirmPassword((prev) => !prev)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-orange-300" aria-label={showConfirmPassword ? "Ocultar senha" : "Mostrar senha"}>
                    {showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                {confirmPassword.length > 0 && password !== confirmPassword && <p className="text-xs font-semibold text-red-300">A confirmação da senha está diferente da nova senha.</p>}
                <button type="submit" disabled={!canCreatePassword} className="flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 px-5 py-4 text-sm font-semibold text-slate-950 shadow-lg shadow-orange-500/20 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60">
                  {loading ? "Salvando..." : "Criar senha e continuar"}
                </button>
              </form>
            )}

            {step === "done" && (
              <div className="mt-8 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-5 py-6">
                <div className="mb-3 inline-flex rounded-2xl bg-emerald-500/20 p-2 text-emerald-300">
                  <BookOpen size={20} />
                </div>
                <p className="font-semibold text-emerald-300">Tudo certo!</p>
                <p className="mt-2 text-sm leading-6 text-emerald-200/80">
                  {eventSignup
                    ? (passwordCreated ? "Sua participação no Evento foi confirmada e sua senha já está ativa." : "Sua participação foi confirmada e sua conta já está ativa. Use \"Esqueci minha senha\" na tela de login para criar sua senha de acesso.")
                    : "Seu cadastro foi confirmado e ficará em análise. Depois da aprovação, enviaremos o link de primeiro acesso para você criar sua senha."}
                </p>
                <div className="mt-5">
                  <Link href="/login" className="text-sm font-semibold text-orange-300 hover:text-orange-200">
                    {passwordCreated ? "Entrar agora" : "Voltar para o login"}
                  </Link>
                </div>
              </div>
            )}

            <div className="mt-6 text-center">
              <Link href="/login" className="text-sm font-semibold text-orange-300 hover:text-orange-200">
                Já tenho conta — fazer login
              </Link>
            </div>
          </section>

          <section className="hidden lg:block">
            <div className="ml-auto max-w-xl rounded-[2rem] border border-white/10 bg-black/25 p-7 backdrop-blur-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-300">EstudoTOP Simulados</p>
              <h2 className="mt-3 text-4xl font-semibold leading-tight">Seu próximo treino começa aqui.</h2>
              <p className="mt-4 text-sm leading-7 text-slate-300">
                Cadastre-se, confirme seu e-mail e aguarde a liberação para acessar jornadas, simulados e relatórios de desempenho.
              </p>
              <div className="mt-6 grid gap-3">
                <InfoItem icon={<GraduationCap size={18} />} title="Simulados oficiais" description="Questões selecionadas e corrigidas pela equipe pedagógica." />
                <InfoItem icon={<Trophy size={18} />} title="Resultado completo" description="Dashboard, diagnóstico e relatório de desempenho." />
                <InfoItem icon={<ShieldCheck size={18} />} title="Cadastro seguro" description="CPF obrigatório, e-mail confirmado e acesso liberado pela equipe." />
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function InfoItem({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
      <div className="mb-2 text-orange-300">{icon}</div>
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
    </div>
  );
}
