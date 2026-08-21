"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, CheckCircle2, Clock3, IdCard, Images, Loader2, LockKeyhole, Mail, Pencil, Phone, Search, ShieldCheck, Sparkles, Target, Trash2, User, X } from "lucide-react";
import { supabase } from "@/app/lib/supabase/client";
import { useAuth } from "@/app/contexts/AuthContext";
import PremiumButton from "@/app/components/ui/PremiumButton";
import PremiumInput from "@/app/components/ui/PremiumInput";
import PremiumModal from "@/app/components/ui/PremiumModal";
import { formatCpf } from "@/lib/utils/cpf";

type Contest = { id: string; name: string };
type ProfileData = { name: string; email: string; phone: string | null; cpf: string | null; desired_contests: string | null; last_login_at: string | null; created_at: string; avatar_url: string | null };
type Payload = { profile: ProfileData; interests: { saved_names: string[]; selected_contest_ids: string[]; catalog: Contest[] } };

const card = "rounded-[26px] border border-white/90 bg-white/90 p-5 shadow-[0_20px_65px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/65 backdrop-blur-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_26px_75px_rgba(15,23,42,0.11)] md:p-7";
const avatarOptions = Array.from({ length: 128 }, (_, index) => {
  const id = `avatar-${String(index + 1).padStart(3, "0")}`;
  return { id, src: `/images/profile-avatars/${id}.webp`, category: index < 90 ? "Corujas EstudoTOP" : "Pessoas" };
});
const avatarGroups = ["Corujas EstudoTOP", "Pessoas"].map((category) => ({ category, options: avatarOptions.filter((avatar) => avatar.category === category) }));

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "A";
}

function dateTime(value: string | null) {
  if (!value) return "Sem registro confiável";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function memberSince(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(value));
}

export default function MeuPerfilClient() {
  const router = useRouter();
  const { refreshProfile, signOut } = useAuth();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [interestOpen, setInterestOpen] = useState(false);
  const [selectedContests, setSelectedContests] = useState<string[]>([]);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [pendingAvatarId, setPendingAvatarId] = useState<string | null>(null);
  const [personalEditing, setPersonalEditing] = useState(false);
  const [interestQuery, setInterestQuery] = useState("");
  const [draftCustomInterests, setDraftCustomInterests] = useState<Contest[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) { router.replace("/login"); return; }
    const response = await fetch("/api/student/profile", { headers: { Authorization: `Bearer ${sessionData.session.access_token}` } });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.ok) { setError(json.message || "Não foi possível carregar seu perfil."); setLoading(false); return; }
    const payload = json as Payload & { ok: true };
    setData(payload); setName(payload.profile.name || ""); setPhone(payload.profile.phone || ""); setSelectedContests(payload.interests.selected_contest_ids); setLoading(false);
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const changed = Boolean(data && (name.trim().replace(/\s+/g, " ") !== data.profile.name || phone.trim() !== (data.profile.phone || "")));
  const interestOptions = useMemo(() => [...(data?.interests.catalog || []), ...draftCustomInterests], [data, draftCustomInterests]);
  const selectedNames = useMemo(() => interestOptions.filter((contest) => selectedContests.includes(contest.id)).map((contest) => contest.name), [interestOptions, selectedContests]);
  const filteredInterestOptions = useMemo(() => {
    const term = interestQuery.trim().toLocaleLowerCase("pt-BR");
    return term ? interestOptions.filter((contest) => contest.name.toLocaleLowerCase("pt-BR").includes(term)) : interestOptions;
  }, [interestOptions, interestQuery]);
  const normalizedInterestQuery = interestQuery.trim().replace(/\s+/g, " ");
  const canAddCustomInterest = normalizedInterestQuery.length >= 2
    && normalizedInterestQuery.length <= 100
    && !/[,;\n\r]/.test(normalizedInterestQuery)
    && !interestOptions.some((contest) => contest.name.localeCompare(normalizedInterestQuery, "pt-BR", { sensitivity: "base" }) === 0);

  async function authFetch(url: string, init: RequestInit) {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) throw new Error("Sessão expirada.");
    return fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${sessionData.session.access_token}` } });
  }

  async function savePersonal() {
    setSaving(true); setFeedback(null);
    try {
      const response = await authFetch("/api/student/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, phone }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.message || "Não foi possível salvar.");
      await refreshProfile(); await load(); setPersonalEditing(false); setFeedback("Dados atualizados com sucesso.");
    } catch (caught) { setFeedback(caught instanceof Error ? caught.message : "Não foi possível salvar."); } finally { setSaving(false); }
  }

  async function saveInterests() {
    setSaving(true); setFeedback(null);
    try {
      const response = await authFetch("/api/student/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contest_ids: selectedContests }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.message || "Não foi possível salvar seus interesses.");
      setInterestOpen(false); setInterestQuery(""); setDraftCustomInterests([]); await load(); setFeedback("Interesses atualizados com sucesso.");
    } catch (caught) { setFeedback(caught instanceof Error ? caught.message : "Não foi possível salvar seus interesses."); } finally { setSaving(false); }
  }

  async function saveAvatar() {
    if (!pendingAvatarId) return;
    setUploading(true); setFeedback(null);
    try {
      const response = await authFetch("/api/profile/avatar", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ avatar_id: pendingAvatarId }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.message || "Não foi possível atualizar o avatar.");
      setAvatarOpen(false); await refreshProfile(); await load(); setFeedback("Avatar atualizado com sucesso.");
    } catch (caught) { setFeedback(caught instanceof Error ? caught.message : "Não foi possível atualizar o avatar."); } finally { setUploading(false); }
  }

  function openAvatarPicker() {
    setPendingAvatarId(avatarOptions.find((avatar) => avatar.src === data?.profile.avatar_url)?.id || null);
    setAvatarOpen(true);
  }

  function closeAvatarPicker() {
    setPendingAvatarId(null);
    setAvatarOpen(false);
  }

  function cancelPersonalEdit() {
    setName(data?.profile.name || "");
    setPhone(data?.profile.phone || "");
    setPersonalEditing(false);
  }

  function addCustomInterest() {
    if (!canAddCustomInterest || selectedContests.length >= 30) return;
    const interest = { id: `custom:${encodeURIComponent(normalizedInterestQuery)}`, name: normalizedInterestQuery };
    setDraftCustomInterests((current) => [...current, interest]);
    setSelectedContests((current) => [...current, interest.id]);
    setInterestQuery("");
  }

  async function removeAvatar() {
    setUploading(true);
    try {
      const response = await authFetch("/api/profile/avatar", { method: "DELETE" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.message || "Não foi possível remover a foto.");
      setRemoveOpen(false); await refreshProfile(); await load(); setFeedback("Foto removida com sucesso.");
    } catch (caught) { setFeedback(caught instanceof Error ? caught.message : "Não foi possível remover a foto."); } finally { setUploading(false); }
  }

  const openPasswordRecovery = async () => {
    await signOut();
    router.push("/esqueci-senha");
  };

  if (loading) return <ProfileSkeleton />;
  if (error || !data) return <div className="min-h-full bg-gradient-to-br from-[#fffaf4] via-[#fbfaf8] to-[#f5f7fa] p-6"><div className={`${card} mx-auto max-w-xl text-center`}><p className="text-sm text-red-600">{error}</p><PremiumButton className="mt-5" onClick={() => void load()}>Tentar novamente</PremiumButton></div></div>;

  return (
    <div className="relative min-h-full overflow-hidden bg-gradient-to-br from-[#fff9f2] via-[#fbfaf8] to-[#f1f5f9] px-4 py-6 md:px-7 md:py-9 lg:px-10 lg:py-11">
      <div className="pointer-events-none absolute -left-32 top-72 h-80 w-80 rounded-full bg-orange-200/25 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 top-20 h-96 w-96 rounded-full bg-amber-100/40 blur-3xl" />
      <div className="relative mx-auto max-w-[1200px] space-y-6">
        <section className="relative min-h-[168px] overflow-hidden rounded-[28px] border border-orange-100/90 bg-white px-5 py-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] md:px-8">
          <div className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full bg-orange-200/30 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/3 h-28 w-72 rounded-full bg-amber-100/45 blur-3xl" />
          <div className="relative flex min-h-[116px] flex-col items-center gap-5 sm:flex-row md:gap-7">
            <div className="relative h-[112px] w-[112px] shrink-0 overflow-hidden rounded-full border-[5px] border-white bg-gradient-to-br from-orange-500 to-amber-300 shadow-[0_16px_35px_rgba(249,115,22,0.26)] md:h-[124px] md:w-[124px]">
              {data.profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.profile.avatar_url} alt={`Foto de ${data.profile.name}`} className="h-full w-full object-cover" />
              ) : <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-white">{initials(data.profile.name)}</span>}
            </div>
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start"><p className="text-[11px] font-extrabold uppercase tracking-[0.24em] text-orange-600">Meu perfil</p><span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700"><CheckCircle2 size={13} /> Conta ativa</span></div>
              <h1 className="mt-2 truncate text-[26px] font-bold tracking-[-0.025em] text-slate-950 md:text-[30px]">{data.profile.name}</h1>
              <p className="mt-1 text-sm font-semibold text-slate-600">Aluno EstudoTOP</p>
              <div className="mt-3 flex flex-col items-center gap-1.5 text-sm text-slate-500 sm:items-start"><span className="inline-flex min-w-0 items-center gap-2"><Mail size={15} className="shrink-0 text-orange-500" /><span className="break-all">{data.profile.email}</span></span><span className="inline-flex items-center gap-2"><CalendarDays size={15} className="text-orange-500" />Aluno desde {memberSince(data.profile.created_at)}</span></div>
            </div>
            <div className="flex flex-wrap justify-center gap-2 sm:max-w-[190px] sm:justify-end"><PremiumButton className="min-h-11 rounded-[14px]" onClick={openAvatarPicker} disabled={uploading}>{uploading ? <Loader2 size={16} className="animate-spin" /> : <Images size={16} />} Alterar avatar</PremiumButton>{data.profile.avatar_url && <PremiumButton variant="ghost" className="min-h-10 rounded-[14px]" onClick={() => setRemoveOpen(true)}><Trash2 size={16} /> Remover</PremiumButton>}</div>
          </div>
        </section>

        {feedback && <p role="status" className={`rounded-xl border px-4 py-3 text-sm font-semibold ${feedback.includes("sucesso") || feedback.includes("atualizad") || feedback.includes("removida") ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>{feedback}</p>}

        <div className="grid gap-5 lg:grid-cols-2">
          <section className={card}><div className="flex items-start justify-between gap-3"><CardTitle icon={<User size={18} />} title="Dados pessoais" text="Mantenha seus dados atualizados para identificarmos corretamente sua conta." />{!personalEditing && <button type="button" onClick={() => setPersonalEditing(true)} aria-label="Editar dados pessoais" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-orange-100 bg-orange-50 text-orange-600 shadow-sm transition hover:border-orange-200 hover:bg-orange-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"><Pencil size={15} /></button>}</div>{personalEditing ? <><div className="mt-6 space-y-4"><PremiumInput label="Nome completo" icon={<User size={15} />} value={name} maxLength={120} className="rounded-[14px]" onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)} /><PremiumInput label="Telefone" icon={<Phone size={15} />} value={phone} maxLength={25} inputMode="tel" className="rounded-[14px]" onChange={(event: ChangeEvent<HTMLInputElement>) => setPhone(event.target.value)} />{data.profile.cpf && <PremiumInput label="CPF" icon={<IdCard size={15} />} value={formatCpf(data.profile.cpf)} readOnly className="cursor-not-allowed rounded-[14px] bg-slate-50 text-slate-500" />}</div><div className="mt-6 flex flex-wrap gap-2"><PremiumButton className="min-h-11 rounded-[14px]" onClick={savePersonal} disabled={!changed || saving}>{saving && <Loader2 size={16} className="animate-spin" />} Salvar alterações</PremiumButton><PremiumButton variant="secondary" className="min-h-11 rounded-[14px]" onClick={cancelPersonalEdit} disabled={saving}>Cancelar</PremiumButton></div></> : <dl className="mt-6 space-y-3"><AccountRow icon={<User size={16} />} label="Nome completo" value={data.profile.name} /><AccountRow icon={<Phone size={16} />} label="Telefone" value={data.profile.phone || "Não informado"} />{data.profile.cpf && <AccountRow icon={<IdCard size={16} />} label="CPF" value={formatCpf(data.profile.cpf)} />}</dl>}</section>
          <section className={card}><CardTitle icon={<ShieldCheck size={18} />} title="Minha conta" text="Informações de acesso e segurança da sua conta." /><dl className="mt-6 space-y-3"><AccountRow icon={<Mail size={16} />} label="E-mail de acesso" value={data.profile.email} /><AccountRow icon={<LockKeyhole size={16} />} label="Senha" value="••••••••••" /><AccountRow icon={<Clock3 size={16} />} label="Último acesso" value={dateTime(data.profile.last_login_at)} /></dl><div className="mt-5 rounded-[18px] border border-orange-100 bg-gradient-to-br from-orange-50/80 to-amber-50/40 p-4"><p className="flex items-center gap-2 text-sm font-bold text-slate-800"><ShieldCheck size={16} className="text-orange-600" /> Segurança</p><p className="mt-1.5 text-xs leading-5 text-slate-500">Para redefinir sua senha com segurança, sua sessão atual será encerrada antes de abrir o fluxo oficial de recuperação.</p><PremiumButton variant="secondary" className="mt-3 min-h-10 rounded-[14px]" onClick={openPasswordRecovery}>Redefinir senha com segurança</PremiumButton></div></section>
        </div>

        <section className={`${card} relative overflow-hidden`}><div className="pointer-events-none absolute -right-14 -top-20 h-48 w-48 rounded-full bg-orange-100/70 blur-3xl" /><div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><CardTitle icon={<Target size={18} />} title="Meus interesses" text="Escolha os concursos que fazem parte dos seus objetivos de estudo." /><PremiumButton variant="secondary" className="min-h-10 rounded-[14px]" onClick={() => { setInterestQuery(""); setDraftCustomInterests([]); setInterestOpen(true); }}><Pencil size={15} /> Editar interesses</PremiumButton></div><div className="relative mt-6 flex min-h-14 flex-wrap items-center gap-2.5 rounded-[18px] border border-slate-100 bg-slate-50/65 p-3">{data.interests.saved_names.length ? data.interests.saved_names.map((interest) => <span key={interest} className="rounded-full border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 px-3.5 py-2 text-xs font-bold text-orange-700 shadow-sm">{interest}</span>) : <p className="px-1 text-sm text-slate-500">Nenhum interesse cadastrado.</p>}</div></section>

      </div>

      {avatarOpen && <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-md sm:p-5"><div role="dialog" aria-modal="true" aria-labelledby="avatar-title" className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-orange-200 bg-gradient-to-br from-white via-[#fffaf5] to-orange-50 shadow-[0_30px_100px_rgba(15,23,42,0.35)]"><div className="flex items-start justify-between gap-4 border-b border-orange-100 px-5 py-5 sm:px-7"><div className="flex gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-lg shadow-orange-200"><Sparkles size={20} /></span><div><p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-orange-600">Seu estilo</p><h2 id="avatar-title" className="mt-1 text-xl font-bold tracking-[-0.02em] text-slate-950 sm:text-2xl">Escolha seu avatar</h2><p className="mt-1 text-sm text-slate-500">Selecione uma opção e confirme para aplicar ao perfil.</p></div></div><button type="button" onClick={closeAvatarPicker} aria-label="Fechar seleção de avatares" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"><X size={19} /></button></div><div className="space-y-7 overflow-y-auto p-4 sm:p-6">{avatarGroups.map((group) => <section key={group.category}><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-bold text-slate-800">{group.category}</h3><span className="text-xs font-semibold text-slate-400">{group.options.length} opções</span></div><div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">{group.options.map((avatar) => { const index = avatarOptions.findIndex((option) => option.id === avatar.id); const selected = pendingAvatarId === avatar.id; return <button key={avatar.id} type="button" aria-label={`Selecionar avatar ${index + 1}`} aria-pressed={selected} disabled={uploading} onClick={() => setPendingAvatarId(avatar.id)} className={`group relative aspect-square overflow-hidden rounded-[18px] border-2 bg-white p-1.5 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-orange-400 hover:shadow-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-200 disabled:cursor-wait disabled:opacity-60 ${selected ? "border-orange-500 ring-4 ring-orange-100" : "border-white"}`}><Image src={avatar.src} alt="" width={256} height={256} className="h-full w-full rounded-[13px] object-cover transition duration-200 group-hover:scale-105" />{selected && <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-white shadow-md"><Check size={14} strokeWidth={3} /></span>}</button>})}</div></section>)}</div><div className="flex flex-col gap-3 border-t border-orange-100 bg-white/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7"><p className="text-xs font-medium text-slate-500">128 avatares disponíveis</p><div className="flex flex-col-reverse gap-2 sm:flex-row"><PremiumButton variant="secondary" className="min-h-10 rounded-[14px]" onClick={closeAvatarPicker} disabled={uploading}>Cancelar</PremiumButton><PremiumButton className="min-h-10 rounded-[14px]" onClick={saveAvatar} disabled={!pendingAvatarId || uploading}>{uploading && <Loader2 size={16} className="animate-spin" />} Salvar avatar</PremiumButton></div></div></div></div>}

      {interestOpen && <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"><div role="dialog" aria-modal="true" aria-labelledby="interest-title" className="flex max-h-[86vh] w-full max-w-xl flex-col overflow-hidden rounded-[2rem] border border-orange-200 bg-white shadow-2xl"><div className="flex items-start justify-between border-b border-slate-100 p-6"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">Objetivos</p><h2 id="interest-title" className="mt-2 text-xl font-semibold text-slate-950">Editar interesses</h2><p className="mt-1 text-sm text-slate-500">Busque entre os concursos presentes no banco de questões.</p></div><button type="button" onClick={() => { setSelectedContests(data.interests.selected_contest_ids); setDraftCustomInterests([]); setInterestQuery(""); setInterestOpen(false); }} aria-label="Fechar" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div><div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"><PremiumInput label="Buscar ou informar interesse" icon={<Search size={15} />} value={interestQuery} maxLength={100} placeholder="Ex.: TRT, Polícia Federal..." className="rounded-[14px]" onChange={(event: ChangeEvent<HTMLInputElement>) => setInterestQuery(event.target.value)} />{canAddCustomInterest && <button type="button" onClick={addCustomInterest} className="mt-3 flex w-full items-center justify-between rounded-2xl border border-dashed border-orange-300 bg-orange-50 px-4 py-3 text-left text-sm font-semibold text-orange-700 transition hover:bg-orange-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"><span>Adicionar “{normalizedInterestQuery}” como interesse personalizado</span><Check size={16} /></button>}<div className="mt-4 grid gap-2 sm:grid-cols-2">{filteredInterestOptions.map((contest) => { const checked = selectedContests.includes(contest.id); return <button key={contest.id} type="button" role="checkbox" aria-checked={checked} onClick={() => setSelectedContests((current) => checked ? current.filter((id) => id !== contest.id) : current.length < 30 ? [...current, contest.id] : current)} className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-medium transition ${checked ? "border-orange-300 bg-orange-50 text-orange-800" : "border-slate-200 text-slate-700 hover:border-orange-200"}`}><span>{contest.name}{contest.id.startsWith("custom:") && <span className="ml-1 text-[10px] uppercase tracking-wide text-slate-400">Personalizado</span>}</span>{checked && <Check size={16} />}</button>})}</div>{!filteredInterestOptions.length && !canAddCustomInterest && <p className="mt-4 text-sm text-slate-500">Nenhum interesse encontrado. Digite ao menos dois caracteres para cadastrar um interesse personalizado.</p>}<p className="mt-4 text-xs text-slate-400">Selecionados: {selectedNames.length}/30</p></div><div className="flex flex-col-reverse gap-2 border-t border-slate-100 p-5 sm:flex-row sm:justify-end"><PremiumButton variant="secondary" onClick={() => { setSelectedContests(data.interests.selected_contest_ids); setDraftCustomInterests([]); setInterestQuery(""); setInterestOpen(false); }}>Cancelar</PremiumButton><PremiumButton onClick={saveInterests} disabled={saving}>{saving && <Loader2 size={16} className="animate-spin" />} Salvar interesses</PremiumButton></div></div></div>}
      <PremiumModal open={removeOpen} theme="light" tone="warning" title="Remover seu avatar?" message="Seu perfil voltará a exibir as iniciais do seu nome." onClose={() => setRemoveOpen(false)} actions={<><PremiumButton variant="secondary" onClick={() => setRemoveOpen(false)}>Cancelar</PremiumButton><PremiumButton variant="danger" onClick={removeAvatar} disabled={uploading}>Remover avatar</PremiumButton></>} />
    </div>
  );
}

function CardTitle({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="flex gap-3.5"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-orange-100 bg-gradient-to-br from-orange-50 to-amber-50 text-orange-600 shadow-sm">{icon}</span><div><h2 className="text-[17px] font-bold tracking-[-0.01em] text-slate-900">{title}</h2><p className="mt-1 text-sm leading-5 text-slate-500">{text}</p></div></div>; }
function AccountRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="flex min-h-[58px] items-center gap-3 rounded-[16px] border border-slate-100 bg-slate-50/70 px-4 py-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-orange-500 shadow-sm">{icon}</span><div className="min-w-0"><dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">{label}</dt><dd className="mt-1 break-all text-sm font-medium text-slate-800">{value}</dd></div></div>; }
function ProfileSkeleton() { return <div className="min-h-full bg-gradient-to-br from-[#fffaf4] via-[#fbfaf8] to-[#f4f7fa] p-6"><div className="mx-auto max-w-[1200px] space-y-6"><div className="h-[168px] animate-pulse rounded-[28px] border border-orange-100 bg-white shadow-sm" /><div className="grid gap-5 lg:grid-cols-2"><div className="h-80 animate-pulse rounded-[24px] bg-white" /><div className="h-80 animate-pulse rounded-[24px] bg-white" /></div><div className="h-40 animate-pulse rounded-[24px] bg-white" /></div></div>; }
