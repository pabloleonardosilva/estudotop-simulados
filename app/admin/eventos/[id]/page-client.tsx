"use client";

import { ChangeEvent, FormEvent, MouseEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Archive, ArrowLeft, CalendarClock, CheckCircle2, ClipboardCopy, Copy, Loader2, Pencil, PlayCircle, RotateCcw, Save, Square, Unlock, X } from "lucide-react";
import { adminFetch } from "@/app/lib/supabase/adminFetch";
import PremiumButton from "@/app/components/ui/PremiumButton";
import PremiumInput from "@/app/components/ui/PremiumInput";
import PremiumSelect from "@/app/components/ui/PremiumSelect";
import SearchableSelect from "@/app/components/ui/SearchableSelect";

type EventData = {
  id: string;
  name: string;
  code: string;
  public_slug: string;
  registration_url: string | null;
  effective_status: string;
  result_policy: "blocked" | "released";
  simulado_id: string | null;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  simulados?: { title?: string } | null;
  simulado_event_professors: Array<{ professor_id: string }>;
  simulado_event_participants: Array<{ id: string; result_released_at: string | null; representative_attempt_id: string | null }>;
};

type Simulado = { id: string; title: string };
type Professor = { id: string; name: string; email: string; status: string };

type EditForm = {
  name: string;
  simuladoId: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  resultPolicy: "blocked" | "released";
  professorIds: string[];
};

function toDateTimeLocal(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formFromEvent(event: EventData): EditForm {
  return {
    name: event.name,
    simuladoId: event.simulado_id || "",
    startsAt: toDateTimeLocal(new Date(event.starts_at)),
    endsAt: toDateTimeLocal(new Date(event.ends_at)),
    durationMinutes: event.duration_minutes,
    resultPolicy: event.result_policy,
    professorIds: event.simulado_event_professors.map((item) => item.professor_id),
  };
}

function openDateTimePicker(event: MouseEvent<HTMLInputElement>) {
  event.currentTarget.showPicker?.();
}

export default function EventoAdminDetailClient({ id }: { id: string }) {
  const [event, setEvent] = useState<EventData | null>(null);
  const [simulados, setSimulados] = useState<Simulado[]>([]);
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [form, setForm] = useState<EditForm | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reopenEndsAt, setReopenEndsAt] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const load = useCallback(async () => {
    const [eventResponse, simuladoResponse, professorResponse] = await Promise.all([
      adminFetch(`/api/admin/events/${id}`),
      adminFetch("/api/admin/simulados"),
      adminFetch("/api/admin/professors"),
    ]);
    const eventJson = await eventResponse.json();
    const simuladoJson = await simuladoResponse.json();
    const professorJson = await professorResponse.json();
    if (eventJson.ok) {
      setEvent(eventJson.event);
      setForm(formFromEvent(eventJson.event));
    } else {
      setMessage(eventJson.message);
      setIsError(true);
    }
    if (simuladoJson.ok) setSimulados(simuladoJson.simulados || []);
    if (professorJson.ok) setProfessors((professorJson.professors || []).filter((item: Professor) => item.status === "active" || eventJson.event?.simulado_event_professors?.some((link: { professor_id: string }) => link.professor_id === item.id)));
  }, [id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function updateForm<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setForm((current) => current ? { ...current, [key]: value } : current);
  }

  function handleStartChange(value: string) {
    if (!form) return;
    const startTime = new Date(value).getTime();
    setForm({
      ...form,
      startsAt: value,
      endsAt: Number.isFinite(startTime) && form.durationMinutes > 0
        ? toDateTimeLocal(new Date(startTime + form.durationMinutes * 60_000))
        : form.endsAt,
    });
  }

  function handleEndChange(value: string) {
    if (!form) return;
    const duration = Math.round((new Date(value).getTime() - new Date(form.startsAt).getTime()) / 60_000);
    setForm({ ...form, endsAt: value, durationMinutes: duration > 0 ? duration : form.durationMinutes });
  }

  function handleDurationChange(value: number) {
    if (!form) return;
    const startTime = new Date(form.startsAt).getTime();
    setForm({
      ...form,
      durationMinutes: value,
      endsAt: Number.isFinite(startTime) && Number.isInteger(value) && value > 0
        ? toDateTimeLocal(new Date(startTime + value * 60_000))
        : form.endsAt,
    });
  }

  async function action(value: string, extra: Record<string, string> = {}) {
    setSaving(true);
    setMessage("");
    try {
      const response = await adminFetch(`/api/admin/events/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: value, ...extra }),
      });
      const json = await response.json();
      setMessage(json.message);
      setIsError(!json.ok);
      if (json.ok) await load();
    } finally {
      setSaving(false);
    }
  }

  async function reopenEvent(eventSubmit: FormEvent<HTMLFormElement>) {
    eventSubmit.preventDefault();
    if (!reopenEndsAt || new Date(reopenEndsAt).getTime() <= Date.now()) {
      setMessage("Informe um novo término futuro.");
      setIsError(true);
      return;
    }
    await action("reopen", { ends_at: new Date(reopenEndsAt).toISOString() });
    setReopening(false);
  }

  async function copyRegistrationLink() {
    if (!event?.registration_url) {
      setMessage("Configure NEXT_PUBLIC_APP_URL com a URL pública do sistema antes de copiar o link.");
      setIsError(true);
      return;
    }
    try {
      await navigator.clipboard.writeText(event.registration_url);
      setMessage("Link de cadastro copiado.");
      setIsError(false);
    } catch {
      setMessage("Não foi possível copiar o link de cadastro.");
      setIsError(true);
    }
  }

  async function save(eventSubmit: FormEvent<HTMLFormElement>) {
    eventSubmit.preventDefault();
    if (!form) return;
    const startDate = new Date(form.startsAt);
    const endDate = new Date(form.endsAt);
    if (form.name.trim().length < 3 || !Number.isInteger(form.durationMinutes) || form.durationMinutes <= 0 || endDate <= startDate) {
      setMessage("Informe nome, início, término e duração válidos.");
      setIsError(true);
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const response = await adminFetch(`/api/admin/events/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          simulado_id: form.simuladoId || null,
          starts_at: startDate.toISOString(),
          ends_at: endDate.toISOString(),
          duration_minutes: form.durationMinutes,
          result_policy: form.resultPolicy,
          professor_ids: form.professorIds,
        }),
      });
      const json = await response.json();
      setMessage(json.message);
      setIsError(!json.ok);
      if (json.ok) { setEditing(false); await load(); }
    } catch {
      setMessage("Não foi possível atualizar o Evento. Tente novamente.");
      setIsError(true);
    } finally {
      setSaving(false);
    }
  }

  if (!event || !form) return <main className="min-h-full bg-[#050b14] p-8 text-slate-300">{message || "Carregando..."}</main>;
  const pending = event.simulado_event_participants.filter((item) => item.representative_attempt_id && !item.result_released_at).length;

  return (
    <main className="relative min-h-full overflow-hidden bg-[#050b14] px-4 py-8 text-white">
      <div className="pointer-events-none absolute left-1/3 top-0 h-80 w-80 rounded-full bg-orange-500/[0.07] blur-[110px]" />
      <div className="relative mx-auto max-w-6xl">
        <Link href="/admin/eventos" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-400 transition hover:text-orange-300"><ArrowLeft size={16} />Voltar aos Eventos</Link>
        <section className="rounded-[2rem] border border-white/10 bg-[#0b1422]/90 p-6 shadow-2xl shadow-black/30 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-400">{event.code}</p>
              <h1 className="mt-2 text-3xl font-black sm:text-4xl">{event.name}</h1>
              {event.registration_url && <a href={event.registration_url} target="_blank" rel="noreferrer" className="mt-3 inline-block break-all text-sm text-slate-400 transition hover:text-orange-300">Link público: {event.registration_url}</a>}
            </div>
            {event.effective_status !== "archived" && <PremiumButton variant="dark-primary" onClick={() => { setEditing(true); setMessage(""); }} icon={<Pencil size={16} />}>Editar dados</PremiumButton>}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {event.effective_status === "scheduled" && event.simulado_id && <PremiumButton variant="dark-primary" disabled={saving} onClick={() => void action("start")} icon={<PlayCircle size={17} />}>Iniciar agora</PremiumButton>}
            {event.effective_status === "active" && <PremiumButton variant="dark-danger" disabled={saving} onClick={() => void action("close")} icon={<Square size={17} />}>Encerrar</PremiumButton>}
            {event.effective_status === "closed" && <PremiumButton variant="dark-primary" disabled={saving} onClick={() => { const suggested = new Date(Date.now() + 2 * 60 * 60 * 1000); setReopenEndsAt(toDateTimeLocal(suggested)); setReopening(true); }} icon={<RotateCcw size={17} />}>Reabrir evento</PremiumButton>}
            {pending > 0 && event.result_policy === "blocked" && <PremiumButton variant="dark-success" disabled={saving} onClick={() => void action("release_results")} icon={<Unlock size={17} />}>Liberar {pending} resultados</PremiumButton>}
            <PremiumButton variant="dark" onClick={() => void copyRegistrationLink()} icon={<ClipboardCopy size={17} />}>Copiar link de cadastro</PremiumButton>
            <PremiumButton variant="dark" disabled={saving} onClick={() => void action("duplicate")} icon={<Copy size={17} />}>Duplicar</PremiumButton>
            {event.effective_status !== "archived" && <PremiumButton variant="dark-warning" disabled={saving} onClick={() => void action("archive")} icon={<Archive size={17} />}>Arquivar</PremiumButton>}
          </div>
          {!event.simulado_id && <div className="mt-5 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 font-semibold text-amber-200">Evento sem Simulado vinculado. Início e aplicação estão bloqueados até a configuração ser concluída.</div>}
          {event.effective_status === "archived" && <div className="mt-5 rounded-2xl border border-slate-400/20 bg-white/[0.04] p-4 text-slate-300">Evento arquivado em modo histórico e somente leitura. A duplicação permanece disponível.</div>}
        </section>

        {message && <div className={`mt-5 flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${isError ? "border-red-400/20 bg-red-500/10 text-red-200" : "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"}`}><CheckCircle2 size={17} />{message}</div>}

        {reopening && <form onSubmit={reopenEvent} className="mt-6 rounded-[1.7rem] border border-orange-300/15 bg-[#0b1422]/95 p-5 shadow-[0_0_36px_rgba(249,115,22,0.08)]"><h2 className="text-lg font-black">Reabrir Evento</h2><p className="mt-1 text-sm text-slate-400">Defina o novo término em horário de Brasília. Todo o histórico será preservado.</p><div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]"><PremiumInput variant="jornada" label="Novo término" type="datetime-local" value={reopenEndsAt} onChange={(change: ChangeEvent<HTMLInputElement>) => setReopenEndsAt(change.target.value)} onClick={openDateTimePicker} className="[color-scheme:dark] cursor-pointer" required /><div className="flex items-end gap-2"><PremiumButton type="submit" variant="dark-primary" disabled={saving} icon={<RotateCcw size={16} />}>Confirmar reabertura</PremiumButton><PremiumButton variant="dark" onClick={() => setReopening(false)}>Cancelar</PremiumButton></div></div></form>}

        {editing && (
          <form onSubmit={save} className="mt-6 rounded-[2rem] border border-orange-300/15 bg-[#0b1422]/95 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.42),0_0_42px_rgba(249,115,22,0.08)] sm:p-7">
            <div className="mb-6 flex items-center justify-between border-b border-white/[0.08] pb-5">
              <div><h2 className="text-xl font-black">Editar dados do Evento</h2><p className="mt-1 text-xs text-slate-500">Horários exibidos no fuso de Brasília</p></div>
              <PremiumButton variant="dark" onClick={() => { setEditing(false); setForm(formFromEvent(event)); }} icon={<X size={16} />}>Cancelar</PremiumButton>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <PremiumInput variant="jornada" label="Nome do Evento" value={form.name} minLength={3} onChange={(change: ChangeEvent<HTMLInputElement>) => updateForm("name", change.target.value)} required />
              <SearchableSelect dark label="Simulado" value={form.simuladoId} onChange={(value) => updateForm("simuladoId", value)} options={simulados.map((item) => ({ value: item.id, label: item.title }))} placeholder="Selecione um simulado" />
              <PremiumInput variant="jornada" label="Início — horário de Brasília" type="datetime-local" value={form.startsAt} onChange={(change: ChangeEvent<HTMLInputElement>) => handleStartChange(change.target.value)} onClick={openDateTimePicker} className="[color-scheme:dark] cursor-pointer" required />
              <PremiumInput variant="jornada" label="Término — horário de Brasília" type="datetime-local" value={form.endsAt} min={form.startsAt} onChange={(change: ChangeEvent<HTMLInputElement>) => handleEndChange(change.target.value)} onClick={openDateTimePicker} className="[color-scheme:dark] cursor-pointer" required />
              <PremiumInput variant="jornada" label="Duração em minutos" type="number" min={1} step={1} value={form.durationMinutes} onChange={(change: ChangeEvent<HTMLInputElement>) => handleDurationChange(Number(change.target.value))} premiumStepper onStep={handleDurationChange} required />
              <PremiumSelect variant="jornada" label="Resultados" value={form.resultPolicy} onChange={(change: ChangeEvent<HTMLSelectElement>) => updateForm("resultPolicy", change.target.value as EditForm["resultPolicy"])}><option value="blocked">Bloqueados até a liberação</option><option value="released">Liberados após a conclusão</option></PremiumSelect>
              <fieldset className="md:col-span-2">
                <legend className="mb-2 text-sm font-medium text-slate-300">Professores responsáveis <span className="text-slate-500">(opcional)</span></legend>
                <div className="grid gap-2 rounded-2xl border border-white/10 bg-black/20 p-3 sm:grid-cols-2 lg:grid-cols-3">
                  {professors.length ? professors.map((professor) => { const selected = form.professorIds.includes(professor.id); return <label key={professor.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 transition ${selected ? "border-orange-400/40 bg-orange-500/10 text-orange-100" : "border-white/[0.07] bg-white/[0.03] text-slate-300 hover:border-white/15"}`}><input type="checkbox" checked={selected} onChange={() => updateForm("professorIds", selected ? form.professorIds.filter((professorId) => professorId !== professor.id) : [...form.professorIds, professor.id])} className="h-4 w-4 accent-orange-500" /><span className="min-w-0"><span className="block truncate text-sm font-bold">{professor.name}</span><span className="block truncate text-xs text-slate-500">{professor.email}</span></span></label>; }) : <p className="p-2 text-sm text-slate-500">Nenhum professor cadastrado.</p>}
                </div>
              </fieldset>
            </div>
            <div className="mt-6 flex justify-end"><PremiumButton type="submit" variant="dark-primary" disabled={saving} icon={saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}>{saving ? "Salvando..." : "Salvar alterações"}</PremiumButton></div>
          </form>
        )}

        <section className="mt-8 rounded-[1.7rem] border border-white/10 bg-white/[0.05] p-6">
          <div className="flex items-center gap-3"><CalendarClock className="text-orange-400" /><h2 className="text-xl font-black">Participantes</h2></div>
          <p className="mt-3 text-slate-400">{event.simulado_event_participants.length} inscritos · {pending} resultados pendentes</p>
        </section>
      </div>
    </main>
  );
}
