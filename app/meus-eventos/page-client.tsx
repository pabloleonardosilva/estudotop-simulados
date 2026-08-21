"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Users } from "lucide-react";
import { supabase } from "@/app/lib/supabase/client";
import PremiumButton from "@/app/components/ui/PremiumButton";
import { eventStatusLabel } from "@/lib/ui/eventStatus";

type Row = { id: string; representative_attempt_id: string | null; result_released_at: string | null; attempts: Array<{ id: string; status: string }>; simulado_events: { id: string; name: string; starts_at: string; ends_at: string; simulado_id: string | null; effective_status: string; simulados?: { title?: string } | null; simulado_event_professors: Array<{ professors: { name: string } | null }> } };

const eventStatusChipClass: Record<string, string> = {
  scheduled: "border-blue-200 bg-blue-50 text-blue-700",
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  closed: "border-slate-200 bg-slate-100 text-slate-600",
  archived: "border-slate-200 bg-slate-100 text-slate-500",
};

function formatEventDateTime(iso: string) {
  const datePart = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" }).format(new Date(iso));
  const timePart = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(iso)).replace(":", "h");
  return `${datePart} · ${timePart}`;
}

export default function MeusEventosClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      const response = await fetch("/api/student/events", { headers: { Authorization: `Bearer ${data.session.access_token}` } });
      const json = await response.json();
      if (json.ok) setRows(json.events);
      setLoading(false);
    });
  }, []);

  return (
    <main className="min-h-full bg-slate-50 px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-600">Área do aluno</p>
        <h1 className="mt-2 text-3xl font-black text-slate-950">Meus Eventos</h1>

        {loading ? (
          <p className="mt-8 text-slate-500">Carregando...</p>
        ) : rows.length ? (
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {rows.map((row) => {
              const event = row.simulado_events;
              const running = row.attempts.some((attempt) => attempt.status === "in_progress");
              const completed = row.attempts.some((attempt) => ["completed", "disqualified", "expired"].includes(attempt.status));
              const isClosed = event.effective_status === "closed" || event.effective_status === "archived";

              const situation = running
                ? "Em andamento"
                : completed
                ? (row.result_released_at ? "Resultado disponível" : "Resultado aguardando liberação")
                : isClosed
                ? "Não realizado"
                : "Não iniciado";

              let ctaLabel: string | null = null;
              if (running) ctaLabel = "Continuar simulado";
              else if (completed) ctaLabel = row.result_released_at ? "Ver meus resultados" : null;
              else if (event.effective_status === "scheduled") ctaLabel = "Ver evento";
              else if (event.effective_status === "active") ctaLabel = "Entrar no evento";

              const professorNames = event.simulado_event_professors.map((item) => item.professors?.name).filter(Boolean) as string[];

              return (
                <article key={row.id} className="flex flex-col rounded-[1.7rem] border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-orange-600">
                      <CalendarClock size={16} />
                      Evento de Simulado
                    </span>
                    <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${eventStatusChipClass[event.effective_status] || "border-slate-200 bg-slate-100 text-slate-600"}`}>
                      {eventStatusLabel(event.effective_status)}
                    </span>
                  </div>

                  <h2 className="mt-3 text-xl font-black text-slate-950">{event.name}</h2>

                  <div className="mt-4 space-y-3 text-sm">
                    {professorNames.length > 0 && (
                      <div>
                        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
                          <Users size={13} />
                          {professorNames.length > 1 ? "Professores" : "Professor"}
                        </p>
                        <p className="mt-0.5 font-semibold text-slate-700">{professorNames.join(", ")}</p>
                      </div>
                    )}

                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Data e horário</p>
                      <p className="mt-0.5 font-semibold text-slate-700">{formatEventDateTime(event.starts_at)}</p>
                      <p className="text-xs text-slate-400">Horário de Brasília</p>
                    </div>

                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Sua situação</p>
                      <p className="mt-0.5 font-semibold text-slate-700">{situation}</p>
                    </div>
                  </div>

                  {ctaLabel && (
                    <div className="mt-5">
                      <PremiumButton href={`/meus-eventos/${event.id}`} variant={running ? "primary" : "secondary"}>{ctaLabel}</PremiumButton>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <p className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 text-slate-500">Você ainda não participa de nenhum Evento.</p>
        )}
      </div>
    </main>
  );
}
