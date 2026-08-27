"use client";

import { type ChangeEvent, useEffect, useState } from "react";
import { CalendarRange, ImageIcon, Presentation, Trash2, Upload } from "lucide-react";
import PageBackground from "@/app/components/ui/PageBackground";
import PageHeader from "@/app/components/ui/PageHeader";
import PremiumButton from "@/app/components/ui/PremiumButton";
import PremiumInput from "@/app/components/ui/PremiumInput";
import PremiumModal from "@/app/components/ui/PremiumModal";
import { adminFetch } from "@/app/lib/supabase/adminFetch";
import type { SystemImage, SystemImageType } from "@/lib/system-images";

const TABS: Array<{ type: SystemImageType; label: string }> = [
  { type: "journey_card", label: "Cards de Jornadas" },
  { type: "event_card", label: "Cards de Eventos" },
  { type: "professor_event_banner", label: "Banner da área do professor" },
];

export default function SystemImagesClient() {
  const [type, setType] = useState<SystemImageType>("journey_card");
  const [images, setImages] = useState<SystemImage[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SystemImage | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    adminFetch(`/api/admin/system-images?type=${type}`).then((response) => response.json()).then((json) => {
      if (active) setImages(json.ok ? json.images : []);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [type]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] || null;
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(next ? URL.createObjectURL(next) : null);
  }

  async function upload() {
    if (!file || !name.trim()) return setMessage({ tone: "error", text: "Selecione uma imagem e informe o nome administrativo." });
    setSaving(true);
    const body = new FormData();
    body.append("file", file);
    body.append("name", name.trim());
    body.append("type", type);
    try {
      const response = await adminFetch("/api/admin/system-images", { method: "POST", body });
      const json = await response.json();
      if (!json.ok) return setMessage({ tone: "error", text: json.message });
      setImages((current) => [...current, json.image].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
      setFile(null); setName(""); setPreview(null);
      setMessage({ tone: "success", text: json.message });
    } finally { setSaving(false); }
  }

  async function deleteImage() {
    if (!deleteTarget || deletingId) return;
    setDeletingId(deleteTarget.id);
    try {
      const response = await adminFetch(`/api/admin/system-images?id=${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" });
      const json = await response.json();
      if (!json.ok) {
        setDeleteTarget(null);
        return setMessage({ tone: "error", text: json.message });
      }
      setImages((current) => current.filter((image) => image.id !== deleteTarget.id));
      setDeleteTarget(null);
      setMessage({ tone: "success", text: json.message });
    } catch {
      setDeleteTarget(null);
      setMessage({ tone: "error", text: "Não foi possível concluir a exclusão. Tente novamente." });
    } finally { setDeletingId(null); }
  }

  return <PageBackground variant="jornada"><div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
    <PageHeader eyebrow="Configurações" title="Imagens do Sistema" description="Gerencie as bibliotecas visuais usadas nos cards e no banner do professor." />
    <div className="mt-8 grid gap-2 rounded-2xl border border-white/10 bg-[#08111f]/90 p-2 md:grid-cols-3">
      {TABS.map((tab) => {
        const active = type === tab.type;
        const icon = tab.type === "journey_card" ? <CalendarRange size={17} /> : tab.type === "event_card" ? <ImageIcon size={17} /> : <Presentation size={17} />;
        return <PremiumButton key={tab.type} full icon={icon} variant={active ? "dark-primary" : "dark"} className={active ? "ring-2 ring-orange-300/70 shadow-[0_12px_32px_rgba(249,115,22,0.35)]" : "hover:border-orange-300/30"} onClick={() => { setLoading(true); setType(tab.type); setFile(null); setPreview(null); }}>{tab.label}</PremiumButton>;
      })}
    </div>
    <section className="mt-6 rounded-[1.75rem] border border-white/10 bg-[#08111f]/90 p-6 shadow-2xl">
      <h2 className="text-lg font-bold text-white">Adicionar imagem</h2><p className="mt-1 text-sm text-slate-400">JPEG, PNG ou WebP, com até 5 MB.</p>
      <div className="mt-5 grid gap-5 lg:grid-cols-[220px_1fr_auto] lg:items-end">
        <label className="flex h-32 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-white/20 bg-white/[0.03] text-slate-400 hover:border-orange-400/50">{preview ? <img src={preview} alt="Prévia" className="h-full w-full object-cover" /> : <span className="flex flex-col items-center gap-2 text-xs"><Upload size={22} />Selecionar arquivo</span>}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={chooseFile} /></label>
        <PremiumInput variant="jornada" label="Nome administrativo" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Área da Saúde" />
        <PremiumButton variant="dark-primary" icon={<Upload size={16} />} disabled={saving || !file || !name.trim()} onClick={() => void upload()}>{saving ? "Enviando..." : "Adicionar"}</PremiumButton>
      </div>
    </section>
    <section className="mt-6"><h2 className="text-lg font-bold text-white">Biblioteca</h2>{loading ? <p className="mt-4 text-sm text-slate-400">Carregando imagens...</p> : images.length === 0 ? <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-slate-400"><ImageIcon className="mx-auto mb-3" />Nenhuma imagem cadastrada nesta biblioteca.</div> : <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{images.map((image) => <article key={image.id} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#0b1626] shadow-xl"><img src={image.url} alt={image.name} className="h-40 w-full object-cover" /><PremiumButton variant="dark-danger" className="absolute right-3 top-3 h-9 w-9 !border-white/25 !bg-slate-950/45 !p-0 text-red-100 shadow-[0_0_0_1px_rgba(248,113,113,0.16),0_6px_20px_rgba(239,68,68,0.32)] backdrop-blur-md transition-all hover:scale-105 hover:!border-red-300/55 hover:!bg-red-950/65 hover:text-white hover:shadow-[0_0_0_1px_rgba(252,165,165,0.28),0_8px_26px_rgba(239,68,68,0.48)]" icon={<Trash2 size={16} strokeWidth={2} />} disabled={deletingId === image.id} onClick={() => setDeleteTarget(image)}><span className="sr-only">Excluir {image.name}</span></PremiumButton><p className="p-4 text-sm font-semibold text-white">{image.name}</p></article>)}</div>}</section>
    {deleteTarget && <PremiumModal open title="Excluir imagem?" message="Esta ação removerá definitivamente a imagem da biblioteca do sistema." tone="warning" dismissible={!deletingId} onClose={() => { if (!deletingId) setDeleteTarget(null); }} actions={<><PremiumButton variant="dark" disabled={Boolean(deletingId)} onClick={() => setDeleteTarget(null)}>Cancelar</PremiumButton><PremiumButton variant="dark-danger" icon={<Trash2 size={16} />} disabled={Boolean(deletingId)} onClick={() => void deleteImage()}>{deletingId ? "Excluindo..." : "Excluir imagem"}</PremiumButton></>} />}
    {message && <PremiumModal open title={message.tone === "success" ? "Operação concluída" : "Não foi possível concluir"} message={message.text} tone={message.tone} onClose={() => setMessage(null)} />}
  </div></PageBackground>;
}
