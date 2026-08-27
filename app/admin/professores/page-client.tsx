"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { GraduationCap, Loader2, Plus } from "lucide-react";
import { adminFetch } from "@/app/lib/supabase/adminFetch";
import PremiumButton from "@/app/components/ui/PremiumButton";
import PremiumInput from "@/app/components/ui/PremiumInput";

type Professor = { id: string; name: string; email: string; phone: string | null; status: string };

export default function ProfessoresAdminClient() {
  const [rows, setRows] = useState<Professor[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const response = await adminFetch("/api/admin/professors");
    const json = await response.json();
    if (json.ok) setRows(json.professors);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const response = await adminFetch("/api/admin/professors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.get("name"), email: form.get("email"), phone: form.get("phone") }) });
    const json = await response.json();
    setSaving(false);
    setMessage(json.message);
    if (json.ok) { setOpen(false); await load(); }
  }

  return <main className="et-admin-dark-page min-h-full px-4 py-8"><div className="mx-auto max-w-6xl"><div className="flex justify-between"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-orange-400">Gestão</p><h1 className="mt-2 text-3xl font-black">Professores</h1></div><PremiumButton onClick={() => setOpen((value) => !value)}><Plus size={17} /> Novo professor</PremiumButton></div>{message && <p className="mt-4 text-orange-200">{message}</p>}{open && <form onSubmit={submit} className="et-admin-dark-panel mt-6 grid gap-4 p-6 md:grid-cols-3"><PremiumInput name="name" label="Nome" required /><PremiumInput name="email" label="E-mail" type="email" required /><PremiumInput name="phone" label="WhatsApp" /><PremiumButton type="submit" disabled={saving}>{saving && <Loader2 size={16} className="animate-spin" />} Cadastrar</PremiumButton></form>}<div className="mt-8 grid gap-4 md:grid-cols-2">{rows.map((row) => <article key={row.id} className="et-admin-dark-card p-5"><GraduationCap className="text-orange-400" /><h2 className="mt-3 font-black">{row.name}</h2><p className="mt-1 text-sm text-slate-400">{row.email} · {row.status}</p></article>)}</div></div></main>;
}
