"use client";

import { useEffect, useState } from "react";
import { CalendarClock, LogOut } from "lucide-react";
import { supabase } from "@/app/lib/supabase/client";
import PremiumButton from "@/app/components/ui/PremiumButton";

type EventRow = { id: string; name: string; effective_status: string; starts_at: string; ends_at: string; simulados: { title?: string } | null };

export default function ProfessorEventosClient() {
  const [events, setEvents] = useState<EventRow[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { void supabase.auth.getSession().then(async ({ data }) => { if (!data.session) return; const response = await fetch("/api/professor/events", { headers: { Authorization: `Bearer ${data.session.access_token}` } }); const json = await response.json(); if (json.ok) setEvents(json.events); setLoading(false); }); }, []);
  const groups = ["active", "scheduled", "closed", "archived"].map((status) => ({ status, items: events.filter((event) => event.effective_status === status) })).filter((group) => group.items.length);
  const labels: Record<string, string> = { active: "Em andamento", scheduled: "Agendados", closed: "Encerrados", archived: "Histórico arquivado" };
  return <main className="min-h-dvh bg-[#050b14] px-4 py-8 text-white"><div className="mx-auto max-w-6xl"><div className="flex items-start justify-between"><div><p className="text-xs font-black uppercase tracking-[0.22em] text-orange-400">Área do professor</p><h1 className="mt-2 text-3xl font-black">Meus eventos</h1></div><PremiumButton variant="dark" onClick={() => void supabase.auth.signOut().then(() => location.assign("/login"))} icon={<LogOut size={16} />}>Sair</PremiumButton></div>{loading ? <p className="mt-8 text-slate-400">Carregando...</p> : groups.map((group) => <section key={group.status} className="mt-9"><h2 className="text-lg font-black text-slate-200">{labels[group.status]}</h2><div className="mt-4 grid gap-5 md:grid-cols-2">{group.items.map((event) => <article key={event.id} className="rounded-[1.7rem] border border-white/10 bg-white/[0.05] p-6"><CalendarClock className="text-orange-400" /><h3 className="mt-4 text-xl font-black">{event.name}</h3><p className="mt-2 text-sm text-slate-400">{event.simulados?.title || "Simulado ainda não vinculado"} · {labels[event.effective_status]}</p><div className="mt-5"><PremiumButton href={`/professor/eventos/${event.id}`} variant={event.effective_status === "active" ? "dark-primary" : "dark"}>{event.effective_status === "archived" ? "Consultar histórico" : "Abrir Evento"}</PremiumButton></div></article>)}</div></section>)}</div></main>;
}
