"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Ban, GraduationCap, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { adminFetch } from "@/app/lib/supabase/adminFetch";
import PremiumButton from "@/app/components/ui/PremiumButton";
import PremiumInput from "@/app/components/ui/PremiumInput";
import PremiumSelect from "@/app/components/ui/PremiumSelect";
import PremiumModal from "@/app/components/ui/PremiumModal";

type Professor = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  simulado_event_professors: Array<{ event_id: string; simulado_events: { id: string; name: string; status: string } | null }>;
};

const statusLabel: Record<string, string> = { active: "Ativo", inactive: "Inativo" };

export default function ProfessoresAdminClient() {
  const [rows, setRows] = useState<Professor[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const [editing, setEditing] = useState<Professor | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editStatus, setEditStatus] = useState("active");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<Professor | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

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
    setIsError(!json.ok);
    if (json.ok) { setOpen(false); await load(); }
  }

  function openEdit(row: Professor) {
    setEditing(row);
    setEditName(row.name);
    setEditEmail(row.email);
    setEditPhone(row.phone || "");
    setEditStatus(row.status);
    setEditError("");
  }

  async function confirmEdit() {
    if (!editing) return;
    setEditSaving(true);
    setEditError("");
    const response = await adminFetch(`/api/admin/professors/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, email: editEmail, phone: editPhone, status: editStatus }),
    });
    const json = await response.json();
    setEditSaving(false);
    if (json.ok) { setEditing(null); await load(); }
    else setEditError(json.message);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    const response = await adminFetch(`/api/admin/professors/${deleteTarget.id}`, { method: "DELETE" });
    const json = await response.json();
    setDeleting(false);
    if (json.ok) { setDeleteTarget(null); await load(); }
    else setDeleteError(json.message);
  }

  async function deactivateInstead() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    const response = await adminFetch(`/api/admin/professors/${deleteTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "inactive" }),
    });
    const json = await response.json();
    setDeleting(false);
    if (json.ok) { setDeleteTarget(null); await load(); }
    else setDeleteError(json.message);
  }

  return <main className="et-admin-dark-page min-h-full px-4 py-8"><div className="mx-auto max-w-6xl">
    <div className="flex justify-between"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-orange-400">Gestão</p><h1 className="mt-2 text-3xl font-black">Professores</h1></div><PremiumButton onClick={() => setOpen((value) => !value)}><Plus size={17} /> Novo professor</PremiumButton></div>
    {message && <p className={`mt-4 ${isError ? "text-red-300" : "text-orange-200"}`}>{message}</p>}
    {open && <form onSubmit={submit} className="et-admin-dark-panel mt-6 grid gap-4 p-6 md:grid-cols-3"><PremiumInput name="name" label="Nome" required /><PremiumInput name="email" label="E-mail" type="email" required /><PremiumInput name="phone" label="WhatsApp" /><PremiumButton type="submit" disabled={saving}>{saving && <Loader2 size={16} className="animate-spin" />} Cadastrar</PremiumButton></form>}
    <div className="mt-8 grid gap-4 md:grid-cols-2">
      {rows.map((row) => {
        const eventCount = row.simulado_event_professors?.length || 0;
        return (
          <article key={row.id} className="et-admin-dark-card p-5">
            <div className="flex items-start justify-between gap-3">
              <GraduationCap className="text-orange-400" />
              <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${row.status === "active" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-slate-500/20 bg-slate-500/10 text-slate-300"}`}>{statusLabel[row.status] || row.status}</span>
            </div>
            <h2 className="mt-3 font-black">{row.name}</h2>
            <p className="mt-1 text-sm text-slate-400">{row.email}{row.phone ? ` · ${row.phone}` : ""}</p>
            <p className="mt-1 text-xs text-slate-500">{eventCount > 0 ? `Vinculado a ${eventCount} Evento(s)` : "Sem Eventos vinculados"}</p>
            <div className="mt-4 flex items-center gap-2">
              <PremiumButton variant="dark" onClick={() => openEdit(row)} icon={<Pencil size={14} />} className="!px-3 !py-1.5 !text-xs">Editar</PremiumButton>
              <PremiumButton variant="danger" onClick={() => { setDeleteTarget(row); setDeleteError(""); }} icon={<Trash2 size={14} />} className="!px-3 !py-1.5 !text-xs">Excluir</PremiumButton>
            </div>
          </article>
        );
      })}
    </div>
  </div>

    <PremiumModal
      open={Boolean(editing)}
      theme="dark"
      title="Editar professor"
      dismissible={!editSaving}
      onClose={() => { if (!editSaving) setEditing(null); }}
      actions={
        <>
          <PremiumButton variant="dark" disabled={editSaving} onClick={() => setEditing(null)}>Cancelar</PremiumButton>
          <PremiumButton variant="dark-primary" disabled={editSaving} onClick={() => void confirmEdit()} icon={editSaving ? <Loader2 size={16} className="animate-spin" /> : undefined}>{editSaving ? "Salvando..." : "Salvar"}</PremiumButton>
        </>
      }
    >
      <div className="grid gap-4">
        <PremiumInput label="Nome" value={editName} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setEditName(event.target.value)} required minLength={3} />
        <PremiumInput label="E-mail" type="email" value={editEmail} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setEditEmail(event.target.value)} required />
        <PremiumInput label="WhatsApp" value={editPhone} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setEditPhone(event.target.value)} />
        <PremiumSelect label="Status" value={editStatus} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setEditStatus(event.target.value)}>
          <option value="active">Ativo</option>
          <option value="inactive">Inativo</option>
        </PremiumSelect>
        {editError && <p role="alert" className="text-sm font-semibold text-red-300">{editError}</p>}
      </div>
    </PremiumModal>

    <PremiumModal
      open={Boolean(deleteTarget)}
      theme="dark"
      tone="warning"
      title="Excluir professor?"
      message={deleteTarget ? `Tem certeza que deseja excluir "${deleteTarget.name}"? Essa ação pode afetar vínculos com Eventos e não pode ser desfeita.` : ""}
      dismissible={!deleting}
      onClose={() => { if (!deleting) { setDeleteTarget(null); setDeleteError(""); } }}
      actions={
        <>
          <PremiumButton variant="dark" disabled={deleting} onClick={() => { setDeleteTarget(null); setDeleteError(""); }}>Cancelar</PremiumButton>
          <PremiumButton variant="danger" disabled={deleting} onClick={() => void confirmDelete()} icon={deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}>{deleting ? "Excluindo..." : "Excluir"}</PremiumButton>
        </>
      }
    >
      {deleteTarget && (deleteTarget.simulado_event_professors?.length || 0) > 0 && (
        <p className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Este professor está vinculado a {deleteTarget.simulado_event_professors.length} Evento(s). Se a exclusão for bloqueada, considere desativar o acesso em vez disso.
        </p>
      )}
      {deleteError && (
        <div className="mt-3 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-300">
          <p>{deleteError}</p>
          <PremiumButton variant="dark" disabled={deleting} onClick={() => void deactivateInstead()} icon={<Ban size={14} />} className="mt-3 !px-3 !py-1.5 !text-xs">Desativar professor em vez de excluir</PremiumButton>
        </div>
      )}
    </PremiumModal>
  </main>;
}
