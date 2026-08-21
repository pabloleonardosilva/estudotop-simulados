"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, LockKeyhole, PlayCircle, ShieldCheck, Users } from "lucide-react";
import { supabase } from "@/app/lib/supabase/client";
import PremiumButton from "@/app/components/ui/PremiumButton";

type Attempt = { id: string; status: string; counts_toward_limit: boolean };
type Payload = { participant: { representative_attempt_id: string | null; result_released_at: string | null; simulado_events: { id: string; name: string; starts_at: string; ends_at: string; simulado_id: string | null; result_policy: string; effective_status: string; simulados: { title: string; max_attempts: number | null; time_limit_minutes: number | null; focus_violation_limit: number | null } | null; simulado_event_professors: Array<{ professors: { name: string } | null }> } }; attempts: Attempt[] };

function countdown(target: string, now: number) {
  const seconds = Math.max(0, Math.ceil((new Date(target).getTime() - now) / 1_000));
  return `${Math.floor(seconds / 3600)}h ${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}min ${String(seconds % 60).padStart(2, "0")}s`;
}

export default function EventoAlunoClient({ id }: { id: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getSession();
    if (!auth.session) return;
    const response = await fetch(`/api/student/events/${id}`, { headers: { Authorization: `Bearer ${auth.session.access_token}` } });
    const json = await response.json();
    if (json.ok) setData(json); else setMessage(json.message);
  }, [id]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const refresh = window.setInterval(() => void load(), 10_000);
    const clock = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => { window.clearTimeout(initial); window.clearInterval(refresh); window.clearInterval(clock); };
  }, [load]);

  useEffect(() => {
    async function heartbeat() {
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) return;
      await fetch(`/api/student/events/${id}/heartbeat`, { method: "POST", headers: { Authorization: `Bearer ${auth.session.access_token}` } }).catch(() => undefined);
    }
    void heartbeat();
    const timer = window.setInterval(() => void heartbeat(), 30_000);
    return () => window.clearInterval(timer);
  }, [id]);

  const formatter = useMemo(() => new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo" }), []);
  if (!data) return <main className="min-h-full bg-slate-50 p-8 text-slate-600">{message || "Carregando Evento..."}</main>;
  const event = data.participant.simulado_events;
  const running = data.attempts.find((attempt) => attempt.status === "in_progress");
  const used = data.attempts.filter((attempt) => attempt.counts_toward_limit).length;
  const remaining = event.simulados?.max_attempts == null ? null : Math.max(0, event.simulados.max_attempts - used);
  const professors = event.simulado_event_professors.map((item) => item.professors?.name).filter(Boolean).join(", ") || "A definir";
  const simuladoUrl = event.simulado_id ? `/meus-simulados/${event.simulado_id}?event=${id}` : null;

  return <main className="min-h-full bg-slate-50 px-4 py-8"><div className="mx-auto max-w-4xl"><section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-9">
    <CalendarClock className="text-orange-500" /><p className="mt-5 text-xs font-black uppercase tracking-[0.2em] text-orange-600">Evento de Simulado</p><h1 className="mt-2 text-3xl font-black text-slate-950">{event.name}</h1>
    <p className="mt-3 text-sm text-slate-500">{formatter.format(new Date(event.starts_at))} até {formatter.format(new Date(event.ends_at))} · Horário de Brasília</p>
    <p className="mt-2 flex items-center gap-2 text-sm text-slate-600"><Users size={16} className="text-orange-500" /> Professores: {professors}</p>
    {event.effective_status === "scheduled" && <div className="mt-8 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-blue-800"><strong>Começa em {countdown(event.starts_at, now)}</strong><p className="mt-1 text-sm">Esta tela atualiza automaticamente quando o professor iniciar o Evento.</p></div>}
    {!event.simulado_id && <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 font-semibold text-amber-800">O Simulado ainda não foi vinculado. O Evento permanece em preparação e não pode ser iniciado.</div>}
    {event.effective_status === "closed" && !running && <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-slate-700">Evento encerrado. Não é possível iniciar uma nova tentativa.</div>}
    {event.effective_status === "closed" && running && <div className="mt-8 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-blue-800"><strong>Evento encerrado, tentativa preservada</strong><p className="mt-1 text-sm">Você pode continuar a tentativa iniciada dentro da janela. Novas tentativas estão bloqueadas.</p></div>}
    {event.simulados && <div className="mt-6 grid gap-3 sm:grid-cols-2"><Rule label="Tentativas" value={`${event.simulados.max_attempts ?? "Ilimitadas"} · usadas ${used}${remaining === null ? "" : ` · restantes ${remaining}`}`} /><Rule label="Tempo da prova" value={event.simulados.time_limit_minutes ? `${event.simulados.time_limit_minutes} minutos` : "Sem limite"} /><Rule label="Resultado" value={event.result_policy === "blocked" ? "Após liberação do professor" : "Disponível após concluir"} /><Rule label="Controle de foco" value={event.simulados.focus_violation_limit ? `Monitorado · limite de ${event.simulados.focus_violation_limit} violações` : "Saídas de foco são registradas"} /></div>}
    {simuladoUrl && ((event.effective_status === "active" && (remaining === null || remaining > 0 || Boolean(running))) || Boolean(running)) && <div className="mt-6"><PremiumButton href={simuladoUrl} variant="primary" icon={<PlayCircle size={18} />}>{running ? "Continuar Simulado" : "Iniciar Simulado"}</PremiumButton></div>}
    {data.participant.representative_attempt_id && (data.participant.result_released_at ? <div className="mt-4"><PremiumButton href={`/meus-simulados/${event.simulado_id}/resultado?attemptId=${data.participant.representative_attempt_id}`} variant="secondary">Ver meus resultados</PremiumButton></div> : !running && <div className="mt-5 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800"><LockKeyhole size={17} /> Respostas registradas. Resultado aguardando liberação.</div>)}
  </section></div></main>;
}

function Rule({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500"><ShieldCheck size={15} className="text-orange-500" />{label}</p><p className="mt-2 text-sm font-bold text-slate-800">{value}</p></div>;
}
