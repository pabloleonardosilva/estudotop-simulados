"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { CalendarClock, Loader2, Mail, MailCheck } from "lucide-react";
import PremiumButton from "@/app/components/ui/PremiumButton";
import PremiumInput from "@/app/components/ui/PremiumInput";
import { supabase } from "@/app/lib/supabase/client";

type EventInfo = { name: string; status: string; starts_at: string; ends_at: string; teachers: Array<{ name?: string } | Array<{ name?: string }>> };
type ConfirmationState = "confirmation_email_sent" | "confirmation_pending";
declare global { interface Window { grecaptcha?: { ready(callback: () => void): void; execute(siteKey: string, options: { action: string }): Promise<string> } } }

function maskEmail(value: string) {
  const [local, domain] = value.split("@");
  if (!local || !domain) return value;
  return `${local.slice(0, 1)}***@${domain}`;
}

export default function EventoPublicClient({ slug }: { slug: string }) {
  const router = useRouter();
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [captchaReady, setCaptchaReady] = useState(false);
  const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "";

  useEffect(() => { void fetch(`/api/events/${slug}`).then((response) => response.json()).then((json) => { if (json.ok) setEvent(json.event); else setMessage(json.message); }).finally(() => setLoading(false)); }, [slug]);
  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const { data: auth } = await supabase.auth.getSession();
        if (!auth.session || new URLSearchParams(window.location.search).has("token")) return;
        const response = await fetch(`/api/events/${slug}`, { method: "PUT", headers: { Authorization: `Bearer ${auth.session.access_token}` } });
        const json = await response.json().catch(() => ({}));
        if (response.ok && json.ok && json.event_id) router.replace(`/meus-eventos/${json.event_id}`);
      } catch {
        // Verificação silenciosa de vínculo já existente — falha de rede aqui não deve travar a tela pública.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [router, slug]);
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) return;
    const timer = window.setTimeout(async () => {
      setSending(true);
      try {
        const response = await fetch(`/api/events/${slug}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json.ok) return setMessage(json.message || "Link de confirmação inválido ou expirado.");
        router.replace(json.next);
      } catch {
        setMessage("Não foi possível validar seu link agora. Verifique sua conexão e tente novamente.");
      } finally {
        setSending(false);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [router, slug]);

  async function requestConfirmation() {
    setSending(true); setMessage("");
    if (!recaptchaSiteKey || !captchaReady || !window.grecaptcha) { setSending(false); setMessage("Não foi possível validar o envio. Tente novamente."); return; }
    const grecaptcha = window.grecaptcha;
    let captchaToken = "";
    try {
      captchaToken = await new Promise<string>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => reject(new Error("recaptcha_timeout")), 10_000);
        grecaptcha.ready(() => {
          grecaptcha.execute(recaptchaSiteKey, { action: "event_join_request" })
            .then((token) => { window.clearTimeout(timeoutId); resolve(token); })
            .catch((error) => { window.clearTimeout(timeoutId); reject(error); });
        });
      });
    } catch { setSending(false); setMessage("Não foi possível validar o envio. Tente novamente."); return; }
    try {
      const response = await fetch(`/api/events/${slug}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, captcha_token: captchaToken }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) return setMessage(json.message || "Não foi possível continuar.");
      const confirmationState = json.state as ConfirmationState | undefined;
      if (confirmationState !== "confirmation_email_sent" && confirmationState !== "confirmation_pending") {
        return setMessage("Não foi possível confirmar o envio agora. Tente novamente.");
      }
      setMessage(json.message || "Enviamos um e-mail para você continuar sua inscrição neste Evento.");
      setSent(true);
    } catch {
      setMessage("Não foi possível continuar agora. Verifique sua conexão e tente novamente.");
    } finally {
      setSending(false);
    }
  }

  async function submit(submitEvent: FormEvent) { submitEvent.preventDefault(); await requestConfirmation(); }

  if (sent) {
    return <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-[#fffaf4] via-[#fbfaf8] to-[#f5f7fa] px-4 py-10">
      <section className="w-full max-w-lg rounded-[2rem] border border-orange-100/90 bg-white p-8 text-center shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-10">
        <span className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50 to-amber-50 text-orange-600">
          <MailCheck size={26} />
        </span>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.22em] text-orange-500">Inscrição para o Simulado</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Confira seu e-mail</h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-slate-600">
          Enviamos um e-mail para você continuar sua inscrição neste Evento
          {email && <> (<span className="font-semibold text-slate-800">{maskEmail(email)}</span>)</>}.
          O link possui validade curta. Abra sua caixa de entrada e confirme o acesso para continuar o cadastro.
        </p>
        <p className="mt-4 text-xs leading-6 text-slate-400">
          Se não encontrar a mensagem, verifique também as pastas Spam, Lixo eletrônico ou Promoções.
        </p>

        {message && <p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">{message}</p>}

        <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <PremiumButton variant="secondary" disabled={sending} onClick={() => void requestConfirmation()}>{sending && <Loader2 size={16} className="animate-spin" />} {sending ? "Enviando..." : "Reenviar e-mail"}</PremiumButton>
          <PremiumButton variant="ghost" onClick={() => { setSent(false); setEmail(""); setMessage(""); }}>Usar outro e-mail</PremiumButton>
        </div>
      </section>
    </main>;
  }

  return <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#050b14] px-4 py-10 text-white">
    <div className="pointer-events-none absolute left-1/3 top-0 h-80 w-80 rounded-full bg-orange-500/[0.07] blur-[110px]" />
    <div className="pointer-events-none absolute right-0 top-40 h-72 w-72 rounded-full bg-amber-300/[0.04] blur-[120px]" />
    {recaptchaSiteKey && <Script id="event-join-recaptcha" src={`https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(recaptchaSiteKey)}`} strategy="afterInteractive" onReady={() => setCaptchaReady(true)} onError={() => setCaptchaReady(false)} />}
    <section className="relative w-full max-w-xl overflow-hidden rounded-[2rem] border border-orange-300/15 bg-[#0b1422]/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.42),0_0_42px_rgba(249,115,22,0.08)] sm:p-9">
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-orange-500/10 blur-3xl" />
      <div className="relative">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-orange-400/20 bg-orange-500/10 text-orange-300 shadow-[0_0_24px_rgba(249,115,22,0.12)]"><CalendarClock size={24} /></span>
        {loading ? <p className="mt-6 text-slate-400">Carregando Evento...</p> : event ? <>
          <p className="mt-6 text-xs font-black uppercase tracking-[0.22em] text-orange-400">Inscrição para o Simulado</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{event.name}</h1>
          <p className="mt-3 text-sm text-slate-400">
            <span className="text-slate-300">Início:</span> {new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(event.starts_at))}
            <span className="mx-2 text-slate-600">·</span>
            <span className="font-semibold text-orange-300">Horário de Brasília</span>
          </p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            <PremiumInput variant="jornada" label="Seu e-mail" icon={<Mail size={16} />} type="email" required value={email} onChange={(change) => setEmail(change.target.value)} />
            <PremiumButton variant="dark-primary" className="w-full shadow-lg shadow-orange-500/20" disabled={sending || !captchaReady}>{sending && <Loader2 size={16} className="animate-spin" />} Continuar</PremiumButton>
            <p className="text-center text-[10px] uppercase tracking-[0.12em] text-slate-500">Este site é protegido pelo reCAPTCHA.</p>
          </form>
        </> : null}
        {message && <p className="mt-5 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200 shadow-[0_0_24px_rgba(239,68,68,0.06)]">{message}</p>}
      </div>
    </section>
  </main>;
}
