"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { BookOpen, GraduationCap, MailCheck, ShieldCheck, Trophy } from "lucide-react";
import { formatCpf, isValidCpf, onlyDigits } from "@/lib/utils/cpf";

type Step = "form" | "code" | "done";

export default function CadastroPage() {
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

  const cpfDigits = onlyDigits(cpf);
  const cpfInvalid = cpfDigits.length > 0 && !isValidCpf(cpfDigits);

  async function handleRequestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    if (!cpfDigits) {
      setLoading(false);
      setErrorMessage("CPF é obrigatório para evitar cadastros duplicados.");
      return;
    }

    if (cpfInvalid) {
      setLoading(false);
      setErrorMessage("CPF inválido. Verifique os dígitos informados.");
      return;
    }

    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName,
        whatsapp,
        email,
        cpf: cpfDigits,
        desiredContests,
      }),
    });

    const data = (await response.json()) as { ok: boolean; message: string };
    setLoading(false);

    if (!data.ok) {
      setErrorMessage(data.message);
      return;
    }

    setSuccessMessage(data.message);
    setStep("code");
  }

  async function handleConfirmCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setErrorMessage("");

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
    };
    setLoading(false);

    if (!data.ok) {
      if (data.clear_code) setCode("");
      if (data.resend_message) setSuccessMessage(data.resend_message);
      setErrorMessage(data.message);
      return;
    }

    setSuccessMessage(data.message);
    setStep("done");
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#04060b] text-white">
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
              {step === "form" ? "Dados do aluno" : step === "code" ? "Confirmação" : "Cadastro confirmado"}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              {step === "form" ? "Cadastro de acesso" : step === "code" ? "Digite o código enviado" : "Cadastro efetivado"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {step === "form"
                ? "Preencha seus dados, confirme o código enviado ao e-mail e aguarde a liberação da equipe EstudoTOP. O CPF é obrigatório e evita cadastros duplicados."
                : step === "code"
                ? `Enviamos um código para ${email}. Confirme para efetivar o cadastro.`
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
              <form className="mt-6 space-y-4" onSubmit={handleRequestCode}>
                <input className="w-full rounded-2xl border border-white/10 bg-white/8 px-4 py-3.5 text-sm outline-none placeholder:text-slate-500 focus:border-orange-400" placeholder="Nome completo" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                <div className="grid gap-4 md:grid-cols-2">
                  <input className="w-full rounded-2xl border border-white/10 bg-white/8 px-4 py-3.5 text-sm outline-none placeholder:text-slate-500 focus:border-orange-400" placeholder="WhatsApp" type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} required />
                  <input className="w-full rounded-2xl border border-white/10 bg-white/8 px-4 py-3.5 text-sm outline-none placeholder:text-slate-500 focus:border-orange-400" placeholder="Melhor e-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <input className={cpfInvalid ? "w-full rounded-2xl border border-red-400 bg-red-500/10 px-4 py-3.5 text-sm outline-none placeholder:text-slate-500 focus:border-red-300" : "w-full rounded-2xl border border-white/10 bg-white/8 px-4 py-3.5 text-sm outline-none placeholder:text-slate-500 focus:border-orange-400"} placeholder="CPF obrigatório" type="text" value={cpf} onChange={(e) => setCpf(formatCpf(e.target.value))} required />
                {cpfInvalid && <p className="text-xs font-semibold text-red-300">CPF inválido. Verifique os dígitos.</p>}
                <textarea className="min-h-24 w-full resize-y rounded-2xl border border-white/10 bg-white/8 px-4 py-3.5 text-sm outline-none placeholder:text-slate-500 focus:border-orange-400" placeholder="Concursos desejados. Ex.: TJSP, Polícia Federal, GCM SP..." value={desiredContests} onChange={(e) => setDesiredContests(e.target.value)} required />
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

            {step === "done" && (
              <div className="mt-8 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-5 py-6">
                <div className="mb-3 inline-flex rounded-2xl bg-emerald-500/20 p-2 text-emerald-300">
                  <BookOpen size={20} />
                </div>
                <p className="font-semibold text-emerald-300">Tudo certo!</p>
                <p className="mt-2 text-sm leading-6 text-emerald-200/80">
                  Seu cadastro foi confirmado e ficará em análise. Depois da aprovação, enviaremos o link de primeiro acesso para você criar sua senha.
                </p>
                <div className="mt-5">
                  <Link href="/login" className="text-sm font-semibold text-orange-300 hover:text-orange-200">
                    Voltar para o login
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
