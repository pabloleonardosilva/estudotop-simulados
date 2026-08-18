"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, Camera, Check, ChevronRight, Database, LifeBuoy, Loader2, LockKeyhole, Mail, Map, ShieldCheck, Target, Trash2, User, X } from "lucide-react";
import { supabase } from "@/app/lib/supabase/client";
import { useAuth } from "@/app/contexts/AuthContext";
import PremiumButton from "@/app/components/ui/PremiumButton";
import PremiumInput from "@/app/components/ui/PremiumInput";
import PremiumModal from "@/app/components/ui/PremiumModal";
import { formatCpf } from "@/lib/utils/cpf";

type Contest = { id: string; name: string };
type ProfileData = { name: string; email: string; phone: string | null; cpf: string | null; desired_contests: string | null; last_login_at: string | null; created_at: string; avatar_url: string | null };
type Payload = { profile: ProfileData; interests: { saved_names: string[]; selected_contest_ids: string[]; catalog: Contest[] }; trajectory: { completed_simulados: number | null; answered_questions: number | null }; journeys: { active: number | null; completed: number | null } };

const card = "rounded-[1.35rem] border border-slate-200/80 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.055)] md:p-6";

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
  const inputRef = useRef<HTMLInputElement>(null);
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
  const selectedNames = useMemo(() => data?.interests.catalog.filter((contest) => selectedContests.includes(contest.id)).map((contest) => contest.name) || [], [data, selectedContests]);

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
      await refreshProfile(); await load(); setFeedback("Dados atualizados com sucesso.");
    } catch (caught) { setFeedback(caught instanceof Error ? caught.message : "Não foi possível salvar."); } finally { setSaving(false); }
  }

  async function saveInterests() {
    setSaving(true); setFeedback(null);
    try {
      const response = await authFetch("/api/student/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contest_ids: selectedContests }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.message || "Não foi possível salvar seus interesses.");
      setInterestOpen(false); await load(); setFeedback("Interesses atualizados com sucesso.");
    } catch (caught) { setFeedback(caught instanceof Error ? caught.message : "Não foi possível salvar seus interesses."); } finally { setSaving(false); }
  }

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setFeedback("Use uma imagem JPG, PNG ou WebP."); return; }
    if (file.size > 5 * 1024 * 1024) { setFeedback("A imagem deve ter no máximo 5 MB."); return; }
    setUploading(true); setFeedback(null);
    try {
      const form = new FormData(); form.append("avatar", file);
      const response = await authFetch("/api/profile/avatar", { method: "POST", body: form });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.message || "Não foi possível atualizar a foto.");
      await refreshProfile(); await load(); setFeedback("Foto atualizada com sucesso.");
    } catch (caught) { setFeedback(caught instanceof Error ? caught.message : "Não foi possível atualizar a foto."); } finally { setUploading(false); }
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

  const openHelp = () => window.dispatchEvent(new Event("estudotop:open-help-center"));
  const openPasswordRecovery = async () => {
    await signOut();
    router.push("/esqueci-senha");
  };

  if (loading) return <ProfileSkeleton />;
  if (error || !data) return <div className="min-h-full bg-[#faf8f5] p-6"><div className={`${card} mx-auto max-w-xl text-center`}><p className="text-sm text-red-600">{error}</p><PremiumButton className="mt-5" onClick={() => void load()}>Tentar novamente</PremiumButton></div></div>;

  return (
    <div className="min-h-full bg-[#faf8f5] px-4 py-6 md:px-7 lg:px-10">
      <div className="mx-auto max-w-[1240px] space-y-5">
        <section className={`${card} relative overflow-hidden`}>
          <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_80%_30%,rgba(249,115,22,0.10),transparent_48%)]" />
          <div className="relative flex flex-col items-center gap-5 sm:flex-row">
            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border-4 border-white bg-gradient-to-br from-orange-500 to-amber-300 shadow-lg">
              {data.profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.profile.avatar_url} alt={`Foto de ${data.profile.name}`} className="h-full w-full object-cover" />
              ) : <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-white">{initials(data.profile.name)}</span>}
            </div>
            <div className="min-w-0 flex-1 text-center sm:text-left"><p className="text-[11px] font-bold uppercase tracking-[0.22em] text-orange-600">Meu perfil</p><h1 className="mt-2 truncate text-2xl font-semibold text-slate-950">{data.profile.name}</h1><p className="mt-1 text-sm text-slate-600">Aluno EstudoTOP</p><p className="mt-1 break-all text-sm text-slate-500">{data.profile.email}</p><p className="mt-2 text-xs text-slate-400">Aluno desde {memberSince(data.profile.created_at)}</p></div>
            <div className="flex flex-wrap justify-center gap-2 sm:justify-end"><PremiumButton variant="secondary" onClick={() => inputRef.current?.click()} disabled={uploading}>{uploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />} Alterar foto</PremiumButton>{data.profile.avatar_url && <PremiumButton variant="ghost" onClick={() => setRemoveOpen(true)}><Trash2 size={16} /> Remover foto</PremiumButton>}</div>
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={uploadAvatar} />
          </div>
        </section>

        {feedback && <p role="status" className={`rounded-xl border px-4 py-3 text-sm font-semibold ${feedback.includes("sucesso") || feedback.includes("atualizad") || feedback.includes("removida") ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>{feedback}</p>}

        <div className="grid gap-5 lg:grid-cols-2">
          <section className={card}><CardTitle icon={<User size={18} />} title="Dados pessoais" text="Mantenha seus dados atualizados para identificarmos corretamente sua conta." /><div className="mt-5 space-y-4"><PremiumInput label="Nome completo" value={name} maxLength={120} onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)} /><PremiumInput label="Telefone" value={phone} maxLength={25} inputMode="tel" onChange={(event: ChangeEvent<HTMLInputElement>) => setPhone(event.target.value)} />{data.profile.cpf && <PremiumInput label="CPF" value={formatCpf(data.profile.cpf)} readOnly className="cursor-not-allowed bg-slate-50 text-slate-500" />}</div><PremiumButton className="mt-5" onClick={savePersonal} disabled={!changed || saving}>{saving && <Loader2 size={16} className="animate-spin" />} Salvar alterações</PremiumButton></section>
          <section className={card}><CardTitle icon={<ShieldCheck size={18} />} title="Minha conta" text="Informações de acesso e segurança da sua conta." /><dl className="mt-5 space-y-4"><AccountRow icon={<Mail size={16} />} label="E-mail de acesso" value={data.profile.email} /><AccountRow icon={<LockKeyhole size={16} />} label="Senha" value="••••••••••" /><AccountRow icon={<ShieldCheck size={16} />} label="Último acesso" value={dateTime(data.profile.last_login_at)} /></dl><div className="mt-5 rounded-2xl bg-slate-50 p-4"><p className="text-sm font-semibold text-slate-800">Segurança</p><p className="mt-1 text-xs leading-5 text-slate-500">Para redefinir sua senha com segurança, sua sessão atual será encerrada antes de abrir o fluxo oficial de recuperação.</p><PremiumButton variant="secondary" className="mt-3" onClick={openPasswordRecovery}>Redefinir senha com segurança</PremiumButton></div></section>
        </div>

        <section className={card}><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><CardTitle icon={<Target size={18} />} title="Meus interesses" text="Escolha os concursos que fazem parte dos seus objetivos de estudo." /><PremiumButton variant="secondary" onClick={() => setInterestOpen(true)}>Editar interesses</PremiumButton></div><div className="mt-5 flex flex-wrap gap-2">{data.interests.saved_names.length ? data.interests.saved_names.map((interest) => <span key={interest} className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700">{interest}</span>) : <p className="text-sm text-slate-500">Nenhum interesse cadastrado.</p>}</div></section>

        <div className="grid gap-5 lg:grid-cols-2"><section className={card}><CardTitle icon={<BarChart3 size={18} />} title="Minha trajetória" text="Um resumo simples da sua atividade no EstudoTOP." /><div className="mt-5 grid grid-cols-2 gap-3"><Metric value={data.trajectory.completed_simulados} label="Simulados concluídos" /><Metric value={data.trajectory.answered_questions} label="Questões respondidas" /></div><TextLink href="/meus-resultados">Ver meus resultados</TextLink></section><section className={card}><CardTitle icon={<Map size={18} />} title="Minhas Jornadas" text="Acompanhe seus caminhos de preparação." /><div className="mt-5 grid grid-cols-2 gap-3"><Metric value={data.journeys.active} label="Jornadas ativas" /><Metric value={data.journeys.completed} label="Jornadas concluídas" /></div><TextLink href="/minhas-jornadas">Ver minhas Jornadas</TextLink></section></div>

        <section className={card}><CardTitle icon={<Mail size={18} />} title="Preferências" text="Comunicações essenciais da sua conta." /><div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-sm font-semibold text-slate-800">Comunicações essenciais</p><p className="mt-1 text-xs leading-5 text-slate-500">Avisos de segurança, recuperação de acesso e informações operacionais permanecem ativos. Ainda não existem preferências opcionais persistidas para configurar.</p></div></section>

        <div className="grid gap-5 lg:grid-cols-2"><section className={card}><CardTitle icon={<Database size={18} />} title="Privacidade e dados" text="Faça solicitações relacionadas aos seus dados e à sua conta." /><div className="mt-4 divide-y divide-slate-100">{["Solicitar meus dados", "Solicitar correção de dados", "Solicitar exclusão da minha conta"].map((label) => <button key={label} type="button" onClick={openHelp} className="flex w-full items-center justify-between py-3 text-left text-sm font-medium text-slate-700 transition hover:text-orange-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">{label}<ChevronRight size={16} /></button>)}</div><p className="mt-3 text-xs text-slate-400">A Política de Privacidade será disponibilizada aqui quando houver uma rota pública oficial.</p></section><section className={card}><CardTitle icon={<LifeBuoy size={18} />} title="Precisa de ajuda?" text="Está com alguma dificuldade relacionada à sua conta ou aos seus dados?" /><PremiumButton className="mt-5" onClick={openHelp}><LifeBuoy size={16} /> Falar com o suporte</PremiumButton></section></div>
      </div>

      {interestOpen && <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"><div role="dialog" aria-modal="true" aria-labelledby="interest-title" className="max-h-[86vh] w-full max-w-xl overflow-hidden rounded-[2rem] border border-orange-200 bg-white shadow-2xl"><div className="flex items-start justify-between border-b border-slate-100 p-6"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">Objetivos</p><h2 id="interest-title" className="mt-2 text-xl font-semibold text-slate-950">Editar interesses</h2></div><button type="button" onClick={() => setInterestOpen(false)} aria-label="Fechar" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div><div className="max-h-[52vh] overflow-y-auto p-4 sm:p-6"><div className="grid gap-2 sm:grid-cols-2">{data.interests.catalog.map((contest) => { const checked = selectedContests.includes(contest.id); return <button key={contest.id} type="button" role="checkbox" aria-checked={checked} onClick={() => setSelectedContests((current) => checked ? current.filter((id) => id !== contest.id) : [...current, contest.id])} className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-medium transition ${checked ? "border-orange-300 bg-orange-50 text-orange-800" : "border-slate-200 text-slate-700 hover:border-orange-200"}`}>{contest.name}{checked && <Check size={16} />}</button>})}</div>{!data.interests.catalog.length && <p className="text-sm text-slate-500">Nenhum concurso ativo está disponível no catálogo.</p>}<p className="mt-4 text-xs text-slate-400">Selecionados: {selectedNames.length}</p></div><div className="flex flex-col-reverse gap-2 border-t border-slate-100 p-5 sm:flex-row sm:justify-end"><PremiumButton variant="secondary" onClick={() => { setSelectedContests(data.interests.selected_contest_ids); setInterestOpen(false); }}>Cancelar</PremiumButton><PremiumButton onClick={saveInterests} disabled={saving}>{saving && <Loader2 size={16} className="animate-spin" />} Salvar interesses</PremiumButton></div></div></div>}
      <PremiumModal open={removeOpen} theme="light" tone="warning" title="Remover sua foto?" message="Seu perfil voltará a exibir as iniciais do seu nome." onClose={() => setRemoveOpen(false)} actions={<><PremiumButton variant="secondary" onClick={() => setRemoveOpen(false)}>Cancelar</PremiumButton><PremiumButton variant="danger" onClick={removeAvatar} disabled={uploading}>Remover foto</PremiumButton></>} />
    </div>
  );
}

function CardTitle({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="flex gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">{icon}</span><div><h2 className="text-[17px] font-semibold text-slate-900">{title}</h2><p className="mt-1 text-sm leading-5 text-slate-500">{text}</p></div></div>; }
function AccountRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="flex gap-3"><span className="mt-0.5 text-orange-500">{icon}</span><div className="min-w-0"><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="mt-1 break-all text-sm text-slate-800">{value}</dd></div></div>; }
function Metric({ value, label }: { value: number | null; label: string }) { return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-2xl font-semibold text-slate-950">{value === null ? "—" : new Intl.NumberFormat("pt-BR").format(value)}</p><p className="mt-1 text-xs text-slate-500">{value === null ? "Indisponível agora" : label}</p></div>; }
function TextLink({ href, children }: { href: string; children: React.ReactNode }) { return <Link href={href} className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-orange-600 hover:text-orange-700">{children}<ChevronRight size={16} /></Link>; }
function ProfileSkeleton() { return <div className="min-h-full bg-[#faf8f5] p-6"><div className="mx-auto max-w-[1240px] space-y-5"><div className="h-48 animate-pulse rounded-[1.35rem] bg-white" /><div className="grid gap-5 lg:grid-cols-2"><div className="h-80 animate-pulse rounded-[1.35rem] bg-white" /><div className="h-80 animate-pulse rounded-[1.35rem] bg-white" /></div></div></div>; }
