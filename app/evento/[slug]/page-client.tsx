"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { CalendarClock, Loader2, Mail } from "lucide-react";
import PremiumButton from "@/app/components/ui/PremiumButton";
import PremiumInput from "@/app/components/ui/PremiumInput";
import { supabase } from "@/app/lib/supabase/client";

type EventInfo = { name: string; status: string; starts_at: string; ends_at: string; teachers: Array<{ name?: string } | Array<{ name?: string }>> };
declare global { interface Window { grecaptcha?: { ready(callback: () => void): void; execute(siteKey: string, options: { action: string }): Promise<string> } } }

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
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session || new URLSearchParams(window.location.search).has("token")) return;
      const response = await fetch(`/api/events/${slug}`, { method: "PUT", headers: { Authorization: `Bearer ${auth.session.access_token}` } });
      const json = await response.json().catch(() => ({}));
      if (response.ok && json.ok && json.event_id) router.replace(`/meus-eventos/${json.event_id}`);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [router, slug]);
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) return;
    const timer = window.setTimeout(async () => {
      setSending(true);
      const response = await fetch(`/api/events/${slug}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const json = await response.json().catch(() => ({}));
      setSending(false);
      if (!response.ok || !json.ok) return setMessage(json.message || "Link de confirmação inválido ou expirado.");
      router.replace(json.next);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [router, slug]);

  async function requestConfirmation() {
    setSending(true); setMessage("");
    if (!recaptchaSiteKey || !captchaReady || !window.grecaptcha) { setSending(false); setMessage("Não foi possível validar o envio. Tente novamente."); return; }
    let captchaToken = "";
    try { captchaToken = await window.grecaptcha.execute(recaptchaSiteKey, { action: "event_join_request" }); } catch { setSending(false); setMessage("Não foi possível validar o envio. Tente novamente."); return; }
    const response = await fetch(`/api/events/${slug}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, captcha_token: captchaToken }) });
    const json = await response.json().catch(() => ({})); setSending(false);
    if (!response.ok || !json.ok) return setMessage(json.message || "Não foi possível continuar.");
    setSent(true); setMessage(json.message);
  }

  async function submit(submitEvent: FormEvent) { submitEvent.preventDefault(); await requestConfirmation(); }

  return <main className="flex min-h-dvh items-center justify-center bg-[#050b14] px-4 py-10 text-white">
    {recaptchaSiteKey && <Script id="event-join-recaptcha" src={`https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(recaptchaSiteKey)}`} strategy="afterInteractive" onReady={() => setCaptchaReady(true)} onError={() => setCaptchaReady(false)} />}
    <section className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 shadow-2xl sm:p-9">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500 text-white"><CalendarClock /></span>
      {loading ? <p className="mt-6 text-slate-400">Carregando Evento...</p> : event ? <>
        <p className="mt-6 text-xs font-black uppercase tracking-[0.22em] text-orange-400">Evento de Simulado</p><h1 className="mt-2 text-3xl font-black">{event.name}</h1>
        <p className="mt-3 text-sm text-slate-400">Início: {new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(event.starts_at))} · Horário de Brasília</p>
        {sent ? <div className="mt-8 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-5 text-emerald-100"><strong>Confira seu e-mail para continuar.</strong><p className="mt-2 text-sm text-emerald-200/80">O link de confirmação expira em 24 horas.</p><div className="mt-4 flex flex-wrap gap-2"><PremiumButton variant="dark" disabled={sending} onClick={() => void requestConfirmation()}>{sending ? "Enviando..." : "Reenviar e-mail"}</PremiumButton><PremiumButton variant="dark" onClick={() => { setSent(false); setEmail(""); setMessage(""); }}>Usar outro e-mail</PremiumButton></div></div> :
          <form onSubmit={submit} className="mt-8 space-y-4"><PremiumInput label="Seu e-mail" icon={<Mail size={16} />} type="email" required value={email} onChange={(change) => setEmail(change.target.value)} /><PremiumButton className="w-full" disabled={sending || !captchaReady}>{sending && <Loader2 size={16} className="animate-spin" />} Continuar</PremiumButton><p className="text-center text-[10px] text-slate-500">Este site é protegido pelo reCAPTCHA.</p></form>}
      </> : null}
      {message && !sent && <p className="mt-5 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">{message}</p>}
    </section>
  </main>;
}
