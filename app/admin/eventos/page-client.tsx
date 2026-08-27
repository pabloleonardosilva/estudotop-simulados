"use client";

import { FormEvent, MouseEvent, useCallback, useEffect, useState } from "react";
import { CalendarClock, Check, CheckCircle2, Clock3, ImageIcon, Link2, Loader2, Plus, Sparkles } from "lucide-react";
import { adminFetch } from "@/app/lib/supabase/adminFetch";
import PremiumButton from "@/app/components/ui/PremiumButton";
import PremiumInput from "@/app/components/ui/PremiumInput";
import PremiumSelect from "@/app/components/ui/PremiumSelect";
import SearchableSelect from "@/app/components/ui/SearchableSelect";
import { EVENT_COVERS, type EventCoverKey } from "./utils";
import ImageLibraryPicker, { loadSystemImages } from "@/app/admin/configuracoes/imagens-do-sistema/ImageLibraryPicker";
import type { SystemImage } from "@/lib/system-images";

type EventRow = { id: string; name: string; public_slug: string; registration_url: string | null; effective_status: string; starts_at: string; ends_at: string; duration_minutes: number; result_policy: string; simulados?: { title?: string } | null };
type Simulado = { id: string; title: string };
type Professor = { id: string; name: string; email: string; status: string };

const DEFAULT_DURATION_MINUTES = 120;

const eventStatusBadge: Record<string, { label: string; className: string }> = {
  scheduled: { label: "Agendado", className: "border-blue-500/20 bg-blue-500/10 text-blue-300" },
  active: { label: "Em andamento", className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" },
  closed: { label: "Encerrado", className: "border-amber-500/20 bg-amber-500/10 text-amber-300" },
  archived: { label: "Arquivado", className: "border-slate-500/20 bg-slate-500/10 text-slate-300" },
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function formatDurationHours(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours <= 0) return `${remainder}min`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}min`;
}

function toDateTimeLocal(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function initialSchedule() {
  const startsAt = new Date(Math.ceil(Date.now() / 1_800_000) * 1_800_000 + 3_600_000);
  return {
    startsAt: toDateTimeLocal(startsAt),
    endsAt: toDateTimeLocal(new Date(startsAt.getTime() + DEFAULT_DURATION_MINUTES * 60_000)),
  };
}

function openDateTimePicker(event: MouseEvent<HTMLInputElement>) {
  event.currentTarget.showPicker?.();
}

export default function EventosAdminClient() {
  const schedule = initialSchedule();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [simulados, setSimulados] = useState<Simulado[]>([]);
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [name, setName] = useState("");
  const [simuladoId, setSimuladoId] = useState("");
  const [startsAt, setStartsAt] = useState(schedule.startsAt);
  const [endsAt, setEndsAt] = useState(schedule.endsAt);
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_DURATION_MINUTES);
  const [resultPolicy, setResultPolicy] = useState("blocked");
  const [professorIds, setProfessorIds] = useState<string[]>([]);
  const [coverKey, setCoverKey] = useState<EventCoverKey>("administrativo");
  const [cardImageId, setCardImageId] = useState<string | null>(null);
  const [bannerImageId, setBannerImageId] = useState<string | null>(null);
  const [cardImages, setCardImages] = useState<SystemImage[]>([]);
  const [bannerImages, setBannerImages] = useState<SystemImage[]>([]);
  useEffect(() => { void Promise.all([loadSystemImages("event_card"), loadSystemImages("professor_event_banner")]).then(([cards, banners]) => { setCardImages(cards); setBannerImages(banners); }); }, []);

  const load = useCallback(async () => {
    const [eventResponse, simuladoResponse, professorResponse] = await Promise.all([
      adminFetch("/api/admin/events"),
      adminFetch("/api/admin/simulados"),
      adminFetch("/api/admin/professors"),
    ]);
    const eventJson = await eventResponse.json();
    const simuladoJson = await simuladoResponse.json();
    const professorJson = await professorResponse.json();
    if (eventJson.ok) setEvents(eventJson.events);
    if (simuladoJson.ok) setSimulados(simuladoJson.simulados || simuladoJson.data || []);
    if (professorJson.ok) setProfessors((professorJson.professors || []).filter((item: Professor) => item.status === "active"));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function resetForm() {
    const nextSchedule = initialSchedule();
    setName("");
    setSimuladoId("");
    setStartsAt(nextSchedule.startsAt);
    setEndsAt(nextSchedule.endsAt);
    setDurationMinutes(DEFAULT_DURATION_MINUTES);
    setResultPolicy("blocked");
    setProfessorIds([]);
    setCoverKey("administrativo");
    setCardImageId(null); setBannerImageId(null);
  }

  function handleStartChange(value: string) {
    setStartsAt(value);
    const startTime = new Date(value).getTime();
    if (Number.isFinite(startTime) && durationMinutes > 0) {
      setEndsAt(toDateTimeLocal(new Date(startTime + durationMinutes * 60_000)));
    }
  }

  function handleEndChange(value: string) {
    setEndsAt(value);
    const nextDuration = Math.round((new Date(value).getTime() - new Date(startsAt).getTime()) / 60_000);
    if (Number.isFinite(nextDuration) && nextDuration > 0) setDurationMinutes(nextDuration);
  }

  function handleDurationChange(value: number) {
    setDurationMinutes(value);
    const startTime = new Date(startsAt).getTime();
    if (Number.isFinite(startTime) && Number.isInteger(value) && value > 0) {
      setEndsAt(toDateTimeLocal(new Date(startTime + value * 60_000)));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsError(false);
    const startDate = new Date(startsAt);
    const endDate = new Date(endsAt);

    if (!name.trim() || !startsAt || !endsAt || !Number.isInteger(durationMinutes) || durationMinutes <= 0 || endDate <= startDate) {
      setMessage("Preencha o nome e mantenha término e duração posteriores ao início.");
      setIsError(true);
      return;
    }

    setSaving(true);
    try {
      const response = await adminFetch("/api/admin/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), simulado_id: simuladoId || null,
          starts_at: startDate.toISOString(), ends_at: endDate.toISOString(),
          duration_minutes: durationMinutes, result_policy: resultPolicy,
          professor_ids: professorIds, cover_key: coverKey, card_image_id: cardImageId, professor_banner_image_id: bannerImageId,
        }),
      });
      const json = await response.json();
      setMessage(json.message);
      setIsError(!json.ok);
      if (json.ok) { setOpen(false); resetForm(); await load(); }
    } catch {
      setMessage("Não foi possível criar o Evento. Tente novamente.");
      setIsError(true);
    } finally {
      setSaving(false);
    }
  }

  async function copyRegistrationLink(registrationUrl: string | null) {
    if (!registrationUrl) {
      setMessage("Configure NEXT_PUBLIC_APP_URL com a URL pública do sistema antes de copiar o link.");
      setIsError(true);
      return;
    }
    try {
      await navigator.clipboard.writeText(registrationUrl);
      setMessage("Link de cadastro copiado.");
      setIsError(false);
    } catch {
      setMessage("Não foi possível copiar o link de cadastro.");
      setIsError(true);
    }
  }

  return (
    <main className="relative min-h-full overflow-hidden bg-[#050b14] px-4 py-8 text-white">
      <div className="pointer-events-none absolute left-1/3 top-0 h-80 w-80 rounded-full bg-orange-500/[0.07] blur-[110px]" />
      <div className="pointer-events-none absolute right-0 top-40 h-72 w-72 rounded-full bg-amber-300/[0.04] blur-[120px]" />
      <div className="relative mx-auto max-w-7xl">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-400">Gestão</p>
            <h1 className="mt-2 text-3xl font-black sm:text-4xl">Eventos de Simulado</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Programe aplicações, defina a janela de realização e controle a liberação dos resultados.</p>
          </div>
          <PremiumButton variant="dark-primary" onClick={() => { setMessage(""); setOpen((value) => !value); }} icon={<Plus size={17} />} className="shadow-lg shadow-orange-500/20">Novo Evento</PremiumButton>
        </div>

        {message && <div className={`mt-5 flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${isError ? "border-red-400/20 bg-red-500/10 text-red-200" : "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"}`}><CheckCircle2 size={17} />{message}</div>}

        {open && (
          <form onSubmit={submit} className="relative mt-7 overflow-hidden rounded-[2rem] border border-orange-300/15 bg-[#0b1422]/95 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.42),0_0_42px_rgba(249,115,22,0.08)] sm:p-7">
            <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-orange-500/10 blur-3xl" />
            <div className="relative mb-6 flex items-center gap-3 border-b border-white/[0.08] pb-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-orange-400/20 bg-orange-500/10 text-orange-300 shadow-[0_0_24px_rgba(249,115,22,0.12)]"><Sparkles size={20} /></div>
              <div><h2 className="font-black text-white">Configuração do Evento</h2><p className="mt-0.5 text-xs text-slate-500">Horários exibidos no fuso de Brasília</p></div>
            </div>

            <div className="relative grid gap-5 md:grid-cols-2">
              <PremiumInput variant="jornada" label="Nome do Evento" value={name} minLength={3} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setName(event.target.value)} required />
              <SearchableSelect dark label="Simulado" value={simuladoId} onChange={setSimuladoId} options={simulados.map((item) => ({ value: item.id, label: item.title }))} placeholder="Selecione um simulado" />
              <PremiumInput variant="jornada" label="Início — horário de Brasília" type="datetime-local" value={startsAt} onChange={(event: React.ChangeEvent<HTMLInputElement>) => handleStartChange(event.target.value)} onClick={openDateTimePicker} required className="[color-scheme:dark] cursor-pointer" />
              <PremiumInput variant="jornada" label="Término — horário de Brasília" type="datetime-local" value={endsAt} min={startsAt} onChange={(event: React.ChangeEvent<HTMLInputElement>) => handleEndChange(event.target.value)} onClick={openDateTimePicker} required className="[color-scheme:dark] cursor-pointer" />
              <PremiumInput variant="jornada" label="Duração em minutos" type="number" min={1} step={1} value={durationMinutes} onChange={(event: React.ChangeEvent<HTMLInputElement>) => handleDurationChange(Number(event.target.value))} premiumStepper onStep={handleDurationChange} required />
              <PremiumSelect variant="jornada" label="Resultados" value={resultPolicy} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setResultPolicy(event.target.value)}><option value="blocked">Bloqueados até a liberação</option><option value="released">Liberados após a conclusão</option></PremiumSelect>
              <fieldset className="md:col-span-2">
                <legend className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-300"><ImageIcon size={15} className="text-orange-400" />Imagem do Evento</legend>
                <p className="mb-3 text-xs text-slate-500">Escolha a imagem que será exibida no card do Evento para o aluno.</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {EVENT_COVERS.map((cover) => {
                    const active = coverKey === cover.value;
                    return (
                      <button
                        key={cover.value}
                        type="button"
                        onClick={() => setCoverKey(cover.value)}
                        className={`group relative overflow-hidden rounded-2xl border text-left transition duration-300 ${
                          active
                            ? "border-orange-400/70 ring-2 ring-orange-400/20 shadow-[0_0_28px_rgba(249,115,22,0.18)]"
                            : "border-white/[0.10] hover:border-white/[0.22]"
                        }`}
                      >
                        <div className="relative h-24 bg-cover bg-center" style={{ backgroundImage: `url(${cover.image})` }}>
                          <div className="absolute inset-0 bg-gradient-to-t from-[#050A12] via-[#050A12]/35 to-transparent" />
                          {active ? (
                            <span className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-[#050A12] shadow-lg">
                              <Check size={14} strokeWidth={3} />
                            </span>
                          ) : null}
                          <div className="absolute inset-x-0 bottom-0 p-2.5">
                            <p className="text-xs font-black text-white">{cover.label}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <fieldset className="md:col-span-2"><legend className="mb-2 text-sm font-medium text-slate-300">Imagem do card — biblioteca</legend><ImageLibraryPicker images={cardImages} value={cardImageId} onChange={setCardImageId} /></fieldset>
              <fieldset className="md:col-span-2"><legend className="mb-2 text-sm font-medium text-slate-300">Banner da área do professor</legend><ImageLibraryPicker images={bannerImages} value={bannerImageId} onChange={setBannerImageId} allowEmpty /></fieldset>
              <fieldset className="md:col-span-2">
                <legend className="mb-2 text-sm font-medium text-slate-300">Professores responsáveis <span className="text-slate-500">(opcional)</span></legend>
                <div className="grid gap-2 rounded-2xl border border-white/10 bg-black/20 p-3 sm:grid-cols-2 lg:grid-cols-3">
                  {professors.length ? professors.map((professor) => { const selected = professorIds.includes(professor.id); return <label key={professor.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 transition ${selected ? "border-orange-400/40 bg-orange-500/10 text-orange-100" : "border-white/[0.07] bg-white/[0.03] text-slate-300 hover:border-white/15"}`}><input type="checkbox" checked={selected} onChange={() => setProfessorIds((current) => selected ? current.filter((id) => id !== professor.id) : [...current, professor.id])} className="h-4 w-4 accent-orange-500" /><span className="min-w-0"><span className="block truncate text-sm font-bold">{professor.name}</span><span className="block truncate text-xs text-slate-500">{professor.email}</span></span></label>; }) : <p className="p-2 text-sm text-slate-500">Nenhum professor ativo cadastrado.</p>}
                </div>
              </fieldset>
            </div>

            <div className="relative mt-6 flex flex-col gap-4 rounded-2xl border border-white/[0.07] bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3 text-sm text-slate-400"><Clock3 size={18} className="text-orange-300" />Alterar o término recalcula a duração; alterar a duração recalcula o término.</div>
              <PremiumButton type="submit" variant="dark-primary" disabled={saving} icon={saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} className="shrink-0 shadow-lg shadow-orange-500/20">{saving ? "Criando..." : "Criar Evento"}</PremiumButton>
            </div>
          </form>
        )}

        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {events.map((event) => { const badge = eventStatusBadge[event.effective_status] || { label: event.effective_status, className: "border-slate-500/20 bg-slate-500/10 text-slate-300" }; return <article key={event.id} className="rounded-[1.7rem] border border-white/10 bg-white/[0.05] p-6"><div className="flex items-start justify-between gap-3"><CalendarClock className="text-orange-400" /><span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${badge.className}`}>{badge.label}</span></div><h2 className="mt-4 text-xl font-black">{event.name}</h2><p className="mt-2 text-sm text-slate-400">{event.simulados?.title || "Sem Simulado"}</p><div className="mt-3 space-y-1 text-xs text-slate-500"><p>Início: <span className="text-slate-300">{formatDateTime(event.starts_at)}</span></p><p>Término: <span className="text-slate-300">{formatDateTime(event.ends_at)}</span></p><p>Duração: <span className="text-slate-300">{formatDurationHours(event.duration_minutes)}</span></p></div>{!event.simulados && <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm font-semibold text-amber-200">Configuração incompleta: vincule um Simulado antes de iniciar.</div>}<div className="mt-5 flex items-center gap-2"><PremiumButton href={`/admin/eventos/${event.id}`} variant="dark-primary">Gerenciar</PremiumButton><PremiumButton variant="dark" onClick={() => void copyRegistrationLink(event.registration_url)} className="h-10 w-10 !rounded-xl !p-0" icon={<Link2 size={17} />}><span className="sr-only">Copiar link de cadastro pro evento</span></PremiumButton></div></article>; })}
        </div>
      </div>
    </main>
  );
}
