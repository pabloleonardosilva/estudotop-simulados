"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  BarChart3,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Eye,
  Filter,
  Layers,
  MoreVertical,
  Pencil,
  Plus,
  Rocket,
  Search,
  Settings,
  UserPlus,
  Users,
  X,
  Pause,
  Play,
} from "lucide-react";
import PremiumButton from "../../../components/ui/PremiumButton";
import PremiumInput from "../../../components/ui/PremiumInput";
import { adminFetch } from "@/lib/supabase/adminFetch";
import PremiumLoadingOverlay from "../../../components/ui/PremiumLoadingOverlay";
import PremiumModal from "../../../components/ui/PremiumModal";
import PremiumSelect from "../../../components/ui/PremiumSelect";
import type { AvailableStudent, Jornada, JornadaSimulado, StudentJornada } from "../types";
import {
  calcReleaseSchedule,
  daysRemaining,
  enrollmentStatusLabel,
  formatDate,
  formatDateTime,
  jornadaDurationDays,
  scopeLabel,
  statusLabel,
} from "../utils";

type Feedback = { tone: "success" | "error" | "warning" | "info"; title: string; message: string } | null;
type ProgressFilter = "all" | "not_started" | "in_progress" | "completed";

const ASSET_BASE = "/jornadas/premium";
const headerBg = `${ASSET_BASE}/header-bg.webp`;
const owlMain = `${ASSET_BASE}/owl-main.webp`;
const owlBlue = `${ASSET_BASE}/owl-blue.webp`;
const owlOrange = `${ASSET_BASE}/owl-orange.webp`;

export default function JornadaDetailClient({
  jornada,
  jornadaSimulados,
  studentJornadas,
  availableStudents,
}: {
  jornada: Jornada;
  jornadaSimulados: JornadaSimulado[];
  studentJornadas: StudentJornada[];
  availableStudents: AvailableStudent[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);

  const [assignModal, setAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState({
    student_id: "",
    started_at: new Date().toISOString().slice(0, 10),
  });
  const [assignStudentSearch, setAssignStudentSearch] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>("all");
  const [assigning, setAssigning] = useState(false);

  const [cancelTarget, setCancelTarget] = useState<StudentJornada | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const [addDaysTarget, setAddDaysTarget] = useState<StudentJornada | null>(null);
  const [daysToAdd, setDaysToAdd] = useState(30);
  const [addingDays, setAddingDays] = useState(false);

  const enrolledStudentIds = useMemo(
    () => new Set(studentJornadas.filter((sj) => sj.status !== "cancelled").map((sj) => sj.student_id)),
    [studentJornadas],
  );

  const filteredAvailableStudents = useMemo(() => {
    const term = assignStudentSearch.toLowerCase().trim();
    return availableStudents.filter((student) => {
      if (enrolledStudentIds.has(student.id)) return false;
      return (
        !term ||
        student.name.toLowerCase().includes(term) ||
        student.email.toLowerCase().includes(term)
      );
    });
  }, [availableStudents, assignStudentSearch, enrolledStudentIds]);

  const filteredStudentJornadas = useMemo(() => {
    const term = studentSearch.toLowerCase().trim();
    return studentJornadas.filter((sj) => {
      const name = sj.students?.name?.toLowerCase() || "";
      const email = sj.students?.email?.toLowerCase() || "";
      const status = enrollmentStatusLabel(sj.status).toLowerCase();
      const completed = sj.progress?.completed ?? 0;
      const total = sj.progress?.total ?? 0;
      const percent = total > 0 ? completed / total : 0;

      const matchesTerm = !term || name.includes(term) || email.includes(term) || status.includes(term);
      const matchesStatus = statusFilter === "all" || sj.status === statusFilter;
      const matchesProgress =
        progressFilter === "all" ||
        (progressFilter === "not_started" && completed === 0) ||
        (progressFilter === "in_progress" && completed > 0 && percent < 1) ||
        (progressFilter === "completed" && total > 0 && completed >= total);

      return matchesTerm && matchesStatus && matchesProgress;
    });
  }, [studentJornadas, studentSearch, statusFilter, progressFilter]);

  async function handlePublish() {
    setLoading(true);
    try {
      const res = await adminFetch(`/api/admin/jornadas/${jornada.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish" }),
      });
      const result = await res.json();
      if (!result.ok) throw new Error(result.message);
      setFeedback({ tone: "success", title: "Jornada publicada!", message: result.message });
      router.refresh();
    } catch (err) {
      setFeedback({ tone: "error", title: "Erro ao publicar", message: err instanceof Error ? err.message : "Erro inesperado." });
    } finally {
      setLoading(false);
      setConfirmPublish(false);
    }
  }

  async function handleArchive() {
    setLoading(true);
    try {
      const res = await adminFetch(`/api/admin/jornadas/${jornada.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive" }),
      });
      const result = await res.json();
      if (!result.ok) throw new Error(result.message);
      setFeedback({ tone: "success", title: "Jornada arquivada", message: result.message });
      router.refresh();
    } catch (err) {
      setFeedback({ tone: "error", title: "Erro ao arquivar", message: err instanceof Error ? err.message : "Erro inesperado." });
    } finally {
      setLoading(false);
      setConfirmArchive(false);
    }
  }

  async function handleAssign() {
    if (!assignForm.student_id) {
      setFeedback({ tone: "error", title: "Aluno obrigatório", message: "Selecione o aluno." });
      return;
    }
    setAssigning(true);
    try {
      const res = await adminFetch(`/api/admin/jornadas/${jornada.id}/students`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(assignForm),
      });
      const result = await res.json();
      if (!result.ok) throw new Error(result.message);
      setAssignModal(false);
      setAssignForm({ student_id: "", started_at: new Date().toISOString().slice(0, 10) });
      setAssignStudentSearch("");
      setFeedback({ tone: "success", title: "Aluno incluído!", message: result.message });
      router.refresh();
    } catch (err) {
      setFeedback({ tone: "error", title: "Erro ao atribuir", message: err instanceof Error ? err.message : "Erro inesperado." });
    } finally {
      setAssigning(false);
    }
  }

  async function handleCancel() {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const res = await adminFetch(`/api/admin/jornadas/${jornada.id}/students/${cancelTarget.student_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const result = await res.json();
      if (!result.ok) throw new Error(result.message);
      setCancelTarget(null);
      setFeedback({ tone: "success", title: "Matrícula cancelada", message: result.message });
      router.refresh();
    } catch (err) {
      setFeedback({ tone: "error", title: "Erro ao cancelar", message: err instanceof Error ? err.message : "Erro inesperado." });
    } finally {
      setCancelling(false);
    }
  }

  async function handlePauseResume(target: StudentJornada, action: "pause" | "resume") {
    setLoading(true);
    try {
      const res = await adminFetch(`/api/admin/jornadas/${jornada.id}/students/${target.student_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await res.json();
      if (!result.ok) throw new Error(result.message);
      setFeedback({
        tone: "success",
        title: action === "pause" ? "Matrícula pausada" : "Matrícula reativada",
        message: result.message,
      });
      router.refresh();
    } catch (err) {
      setFeedback({ tone: "error", title: "Erro", message: err instanceof Error ? err.message : "Erro inesperado." });
    } finally {
      setLoading(false);
    }
  }

  async function handleAddDays() {
    if (!addDaysTarget) return;
    if (!daysToAdd || daysToAdd <= 0) {
      setFeedback({ tone: "error", title: "Dias inválido", message: "Informe um número positivo de dias." });
      return;
    }
    setAddingDays(true);
    try {
      const res = await adminFetch(`/api/admin/jornadas/${jornada.id}/students/${addDaysTarget.student_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_days", days: daysToAdd }),
      });
      const result = await res.json();
      if (!result.ok) throw new Error(result.message);
      setAddDaysTarget(null);
      setDaysToAdd(30);
      setFeedback({ tone: "success", title: "Acesso estendido!", message: result.message });
      router.refresh();
    } catch (err) {
      setFeedback({ tone: "error", title: "Erro", message: err instanceof Error ? err.message : "Erro inesperado." });
    } finally {
      setAddingDays(false);
    }
  }

  const newExpiresPreview =
    addDaysTarget && daysToAdd > 0
      ? (() => {
          const d = new Date(addDaysTarget.expires_at + "T00:00:00");
          d.setDate(d.getDate() + daysToAdd);
          return new Intl.DateTimeFormat("pt-BR").format(d);
        })()
      : null;

  const plannedCount = Math.max(0, Number(jornada.planned_simulados_count || 0));
  const linkedCount = jornadaSimulados.length;
  const durationDays = Math.max(1, jornadaDurationDays(jornada));
  const activeStudents = studentJornadas.filter((sj) => sj.status === "active").length;
  const pausedStudents = studentJornadas.filter((sj) => sj.status === "paused").length;
  const completedSum = studentJornadas.reduce((sum, sj) => sum + (sj.progress?.completed ?? 0), 0);
  const totalProgressSum = studentJornadas.reduce((sum, sj) => sum + (sj.progress?.total ?? 0), 0);
  const averageCompletion = totalProgressSum > 0 ? Math.round((completedSum / totalProgressSum) * 100) : 0;

  // Prévia do cronograma usando a MESMA regra oficial da atribuição
  // (calcReleaseSchedule): janela = release_duration_days ("Todos os simulados
  // serão liberados em X dias") ou exam_date - 7 dias quando houver data da
  // prova; intervalo = janela / (total - 1). A âncora é a criação da Jornada
  // (o cronograma real de cada aluno conta a partir da matrícula dele).
  const releaseAnchor = new Date((jornada.created_at || new Date().toISOString()).slice(0, 10) + "T08:00:00");
  const releasePreviewSchedule = calcReleaseSchedule(
    releaseAnchor,
    linkedCount,
    Math.max(0, Number(jornada.release_duration_days || 0)),
    jornada.exam_date ? new Date(`${jornada.exam_date}T08:00:00`) : null,
    plannedCount || linkedCount,
  );

  function scheduleDateFor(orderNumber: number): Date {
    const safeOrder = Math.max(1, Number(orderNumber || 1));
    const index = Math.min(safeOrder, Math.max(1, releasePreviewSchedule.length)) - 1;
    return releasePreviewSchedule[index] || new Date(releaseAnchor);
  }

  function relativeReleaseDay(orderNumber: number): number {
    const diffDays = Math.round(
      (scheduleDateFor(orderNumber).getTime() - releaseAnchor.getTime()) / (1000 * 60 * 60 * 24),
    );
    return Math.max(1, diffDays + 1);
  }

  function openAssignStudentModal() {
    if (jornada.status !== "published") {
      setFeedback({
        tone: "warning",
        title: "Publique a Jornada primeiro",
        message: "Só é possível incluir alunos depois que a Jornada estiver publicada.",
      });
      return;
    }
    setAssignModal(true);
  }

  const heroSubtitle = `${plannedCount || linkedCount || 0} simulados • ${studentJornadas.length} alunos • Liberação progressiva`;

  return (
    <div className="min-h-screen bg-[#010308] text-slate-100">
      <PremiumLoadingOverlay show={loading} title="Processando…" message="Aguarde um momento." />

      <PremiumModal
        open={Boolean(feedback)}
        tone={feedback?.tone || "info"}
        title={feedback?.title || ""}
        message={feedback?.message}
        onClose={() => setFeedback(null)}
      />

      <PremiumModal
        open={confirmPublish}
        tone="info"
        title="Publicar Jornada"
        message={`Deseja publicar "${jornada.title}"? Ela poderá receber alunos mesmo sem simulados vinculados.`}
        onClose={() => setConfirmPublish(false)}
        actions={
          <div className="flex gap-3">
            <PremiumButton variant="secondary" onClick={() => setConfirmPublish(false)}>Cancelar</PremiumButton>
            <PremiumButton onClick={handlePublish} disabled={loading}>Publicar</PremiumButton>
          </div>
        }
      />

      <PremiumModal
        open={confirmArchive}
        tone="warning"
        title="Arquivar Jornada"
        message={`Deseja arquivar "${jornada.title}"? Alunos já matriculados continuam com acesso até o vencimento.`}
        onClose={() => setConfirmArchive(false)}
        actions={
          <div className="flex gap-3">
            <PremiumButton variant="secondary" onClick={() => setConfirmArchive(false)}>Cancelar</PremiumButton>
            <PremiumButton variant="danger" onClick={handleArchive} disabled={loading}>Arquivar</PremiumButton>
          </div>
        }
      />

      {assignModal && (
        <DarkOverlay onClose={() => setAssignModal(false)}>
          <div className="w-full max-w-xl rounded-[28px] border border-orange-500/25 bg-[#050911] p-7 shadow-[0_28px_80px_rgba(0,0,0,.75)]">
            <ModalHeader eyebrow="Atribuição" title="Atribuir aluno à Jornada" onClose={() => setAssignModal(false)} />
            <div className="mt-6 space-y-4">
              <PremiumInput
                label="Pesquisar aluno"
                icon={<Search size={15} />}
                placeholder="Digite nome ou email…"
                value={assignStudentSearch}
                onChange={(e: any) => setAssignStudentSearch(e.target.value)}
              />
              <PremiumSelect
                label="Aluno"
                value={assignForm.student_id}
                onChange={(e: any) => setAssignForm((p) => ({ ...p, student_id: e.target.value }))}
              >
                <option value="">Selecione o aluno…</option>
                {filteredAvailableStudents.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} — {s.email}</option>
                ))}
              </PremiumSelect>
              <PremiumInput
                label="Data de início"
                type="date"
                value={assignForm.started_at}
                onChange={(e: any) => setAssignForm((p) => ({ ...p, started_at: e.target.value }))}
              />
            </div>
            <div className="mt-7 flex gap-3">
              <PremiumButton variant="secondary" full onClick={() => setAssignModal(false)}>Cancelar</PremiumButton>
              <PremiumButton full icon={<CheckCircle2 size={16} />} onClick={handleAssign} disabled={assigning}>
                {assigning ? "Incluindo…" : "Atribuir aluno"}
              </PremiumButton>
            </div>
          </div>
        </DarkOverlay>
      )}

      <PremiumModal
        open={Boolean(cancelTarget)}
        tone="error"
        title="Cancelar Matrícula"
        message={`Tem certeza que deseja cancelar a matrícula de "${cancelTarget?.students?.name}" nesta jornada? Esta ação não pode ser desfeita.`}
        onClose={() => setCancelTarget(null)}
        actions={
          <div className="flex gap-3">
            <PremiumButton variant="secondary" onClick={() => setCancelTarget(null)}>Voltar</PremiumButton>
            <PremiumButton variant="danger" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? "Cancelando…" : "Cancelar matrícula"}
            </PremiumButton>
          </div>
        }
      />

      {addDaysTarget && (
        <DarkOverlay onClose={() => setAddDaysTarget(null)}>
          <div className="w-full max-w-md rounded-[28px] border border-orange-500/25 bg-[#050911] p-7 shadow-[0_28px_80px_rgba(0,0,0,.75)]">
            <ModalHeader eyebrow="Extensão" title="Adicionar dias ao acesso" subtitle={addDaysTarget.students?.name} onClose={() => setAddDaysTarget(null)} />
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-white/[0.075] bg-white/[0.022] p-4 text-sm">
                <p className="text-slate-500">Vencimento atual</p>
                <p className="mt-1 font-semibold text-white">{formatDate(addDaysTarget.expires_at)}</p>
              </div>
              <PremiumInput
                label="Quantidade de dias"
                type="number"
                min={1}
                step={1}
                value={daysToAdd}
                onChange={(e: any) => setDaysToAdd(Number(e.target.value))}
              />
              {newExpiresPreview && (
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm">
                  <p className="text-emerald-300">Novo vencimento</p>
                  <p className="mt-1 font-semibold text-emerald-50">{newExpiresPreview}</p>
                </div>
              )}
            </div>
            <div className="mt-7 flex gap-3">
              <PremiumButton variant="secondary" full onClick={() => setAddDaysTarget(null)}>Cancelar</PremiumButton>
              <PremiumButton full icon={<CheckCircle2 size={16} />} onClick={handleAddDays} disabled={addingDays}>
                {addingDays ? "Salvando…" : "Confirmar extensão"}
              </PremiumButton>
            </div>
          </div>
        </DarkOverlay>
      )}

      <div className="relative overflow-hidden px-5 py-7 sm:px-8 lg:px-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(15,23,42,.20),transparent_34%),radial-gradient(circle_at_85%_18%,rgba(249,115,22,.055),transparent_30%),linear-gradient(180deg,#010308,#030711_45%,#010308)]" />
        <div className="pointer-events-none absolute inset-0 opacity-[.045] [background-image:linear-gradient(rgba(255,255,255,.032)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.032)_1px,transparent_1px)] [background-size:72px_72px]" />

        <main className="relative mx-auto max-w-[1600px] space-y-6">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Link href="/admin/jornadas" className="transition hover:text-white">Jornadas</Link>
            <ChevronRight size={15} />
            <span className="text-slate-300">{jornada.title}</span>
          </div>

          <section className="relative overflow-hidden rounded-[24px] border border-white/[0.065] bg-[#040A12]/92 shadow-[0_24px_90px_rgba(0,0,0,.48)] backdrop-blur-xl">
            <div
              className="absolute inset-0 bg-cover bg-center opacity-70"
              style={{ backgroundImage: `linear-gradient(90deg,rgba(3,5,9,.96) 0%,rgba(3,5,9,.78) 45%,rgba(3,5,9,.54) 100%), url(${headerBg})` }}
            />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_13%_47%,rgba(249,115,22,.18),transparent_28%)]" />
            <div className="relative grid gap-6 p-6 lg:grid-cols-[200px_1fr_auto] lg:items-center xl:p-7">
              <div className="flex justify-center lg:justify-start">
                <div className="relative h-[190px] w-[190px] overflow-visible">
                  <div className="pointer-events-none absolute inset-6 rounded-full bg-orange-500/18 blur-3xl" />
                  <div className="pointer-events-none absolute inset-8 rounded-full border border-orange-300/18 bg-orange-500/[0.025] shadow-[0_0_42px_rgba(249,115,22,.18)]" />
                  <img
                    src={owlMain}
                    alt="Coruja EstudoTOP"
                    className="relative z-10 h-full w-full object-contain drop-shadow-[0_0_34px_rgba(249,115,22,.32)]"
                  />
                </div>
              </div>

              <div className="min-w-0">
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <StatusBadge status={jornada.status} />
                  <span className="rounded-full border border-white/[0.075] bg-white/[0.022] px-3 py-1 text-xs font-semibold text-slate-300">
                    {scopeLabel(jornada.scope_type, jornada.contest_name)}
                  </span>
                </div>
                <h1 className="max-w-3xl text-4xl font-black tracking-[-0.05em] text-white sm:text-[3.15rem] sm:leading-[1.02]">
                  {jornada.title}
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
                  {jornada.description || "Jornada de simulados com liberação progressiva para preparação estratégica."}
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-5 text-sm text-slate-400">
                  <span className="inline-flex items-center gap-2"><Clock3 size={15} /> Criada em {formatDate(jornada.created_at)}</span>
                  <span className="inline-flex items-center gap-2"><Users size={15} /> {heroSubtitle}</span>
                </div>
              </div>

              <div className="flex flex-wrap justify-start gap-3 lg:max-w-[540px] lg:justify-end lg:self-start">
                <Link href="/admin/jornadas">
                  <HeroButton icon={<ArrowLeft size={17} />}>Voltar</HeroButton>
                </Link>
                <Link href={`/admin/jornadas/${jornada.id}/editar`}>
                  <HeroButton icon={<Pencil size={17} />}>Editar</HeroButton>
                </Link>
                <HeroButton accent icon={<UserPlus size={17} />} onClick={openAssignStudentModal}>Atribuir aluno</HeroButton>
                {jornada.status === "draft" && (
                  <HeroButton solid icon={<Rocket size={17} />} onClick={() => setConfirmPublish(true)}>Publicar</HeroButton>
                )}
                {jornada.status === "published" && (
                  <HeroButton icon={<Ban size={17} />} onClick={() => setConfirmArchive(true)}>Arquivar</HeroButton>
                )}
              </div>
            </div>
          </section>

          {plannedCount > 0 && linkedCount > plannedCount && (
            <div className="flex flex-col gap-3 rounded-[20px] border border-red-400/30 bg-red-500/10 p-5 shadow-[0_14px_44px_rgba(0,0,0,.34)] sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-red-400/30 bg-red-500/15 text-red-300">
                  <AlertTriangle size={20} />
                </span>
                <div>
                  <p className="font-black text-red-200">Quantidade de simulados acima do planejado</p>
                  <p className="mt-1 text-sm text-red-200/80">
                    Esta jornada tem {linkedCount} simulado(s) vinculado(s), mas foi configurada para apenas {plannedCount}.
                    Aumente a quantidade planejada para {linkedCount} na edição da jornada, ou remova {linkedCount - plannedCount} simulado(s) excedente(s) na aba Simulados.
                  </p>
                </div>
              </div>
              <Link href={`/admin/jornadas/${jornada.id}/editar`} className="shrink-0">
                <HeroButton icon={<Pencil size={16} />}>Corrigir agora</HeroButton>
              </Link>
            </div>
          )}

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard icon={<Layers size={20} />} tone="violet" label="Simulados planejados" value={`${plannedCount || linkedCount}`} sub="Simulados vinculados" />
            <MetricCard icon={<Clock3 size={20} />} tone="blue" label="Duração total" value={`${durationDays} dias`} sub={`${Math.max(1, Math.round(durationDays / 30))} meses de jornada`} />
            <MetricCard icon={<CalendarDays size={20} />} tone="amber" label="Data da prova" value={jornada.exam_date ? formatDate(jornada.exam_date) : "Sem data"} sub={jornada.exam_date ? "Data limite definida" : "Defina uma data limite"} />
            <MetricCard icon={<CalendarPlus size={20} />} tone="green" label="Liberação final" value={jornada.effective_end_date ? formatDate(jornada.effective_end_date) : "—"} sub={jornada.effective_end_date ? "Data efetiva calculada" : "Não definida"} />
            <MetricCard icon={<Users size={20} />} tone="purple" label="Alunos matriculados" value={`${studentJornadas.length}`} sub={`${activeStudents} alunos ativos`} />
          </section>

          <section className="grid gap-5 xl:grid-cols-[1fr_520px]">
            <SimuladosPanel
              jornadaId={jornada.id}
              jornadaSimulados={jornadaSimulados}
              linkedCount={linkedCount}
              plannedCount={plannedCount}
              relativeReleaseDay={relativeReleaseDay}
              scheduleDateFor={scheduleDateFor}
            />

            <AlunosPanel
              students={filteredStudentJornadas}
              total={studentJornadas.length}
              search={studentSearch}
              setSearch={setStudentSearch}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              progressFilter={progressFilter}
              setProgressFilter={setProgressFilter}
              onAssign={openAssignStudentModal}
              onAddDays={(sj) => { setAddDaysTarget(sj); setDaysToAdd(30); }}
              onPauseResume={handlePauseResume}
              onCancel={setCancelTarget}
            />
          </section>

          <section className="grid gap-5 xl:grid-cols-[1fr_360px]">
            <ProgressPanel averageCompletion={averageCompletion} completedSum={completedSum} activeStudents={activeStudents} pausedStudents={pausedStudents} totalStudents={studentJornadas.length} />
            <AsidePanel jornada={jornada} durationDays={durationDays} studentJornadas={studentJornadas} />
          </section>
        </main>
      </div>
    </div>
  );
}

function HeroButton({ children, icon, onClick, accent = false, solid = false }: { children: React.ReactNode; icon?: React.ReactNode; onClick?: () => void; accent?: boolean; solid?: boolean }) {
  const base = "inline-flex h-12 items-center justify-center gap-2 rounded-xl border px-5 text-sm font-bold transition duration-200";
  const cls = solid
    ? "border-orange-400 bg-gradient-to-r from-orange-500 to-orange-400 text-black shadow-[0_0_36px_rgba(249,115,22,.28)] hover:translate-y-[-1px]"
    : accent
      ? "border-orange-500/70 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20 hover:text-orange-100"
      : "border-white/[0.11] bg-white/[0.022] text-white hover:border-white/[0.18] hover:bg-white/[0.06]";
  return <button type="button" onClick={onClick} className={`${base} ${cls}`}>{icon}{children}</button>;
}

function StatusBadge({ status }: { status: string }) {
  const published = status === "published";
  const archived = status === "archived";
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.08em] ${published ? "border-orange-300/50 bg-orange-500 text-white shadow-[0_0_24px_rgba(249,115,22,.35)]" : archived ? "border-slate-400/30 bg-slate-700/80 text-slate-200" : "border-amber-300/40 bg-amber-500/20 text-amber-200"}`}>
      <Rocket size={13} /> {statusLabel(status)}
    </span>
  );
}

function MetricCard({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub: string; tone: "violet" | "blue" | "amber" | "green" | "purple" }) {
  const tones = {
    violet: "from-violet-500/25 to-violet-500/5 text-violet-200",
    blue: "from-sky-500/25 to-sky-500/5 text-sky-200",
    amber: "from-orange-500/25 to-orange-500/5 text-orange-200",
    green: "from-emerald-500/25 to-emerald-500/5 text-emerald-200",
    purple: "from-fuchsia-500/25 to-fuchsia-500/5 text-fuchsia-200",
  } as const;
  return (
    <div className="rounded-[20px] border border-white/[0.065] bg-[#040A12]/90 px-4 py-4 shadow-[0_14px_44px_rgba(0,0,0,.34)] backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${tones[tone]} shadow-[inset_0_1px_0_rgba(255,255,255,.08)]`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="truncate whitespace-nowrap text-[10px] font-black uppercase tracking-[0.14em] text-slate-400" title={label}>{label}</p>
          <p className="mt-0.5 truncate text-xl font-black tracking-[-0.04em] text-white">{value}</p>
          <p className="mt-0.5 truncate text-xs text-slate-400">{sub}</p>
        </div>
      </div>
    </div>
  );
}

function SimuladosPanel({ jornadaId, jornadaSimulados, linkedCount, plannedCount, relativeReleaseDay, scheduleDateFor }: { jornadaId: string; jornadaSimulados: JornadaSimulado[]; linkedCount: number; plannedCount: number; relativeReleaseDay: (order: number) => number; scheduleDateFor: (order: number) => Date }) {
  const display = jornadaSimulados;
  const now = new Date();
  return (
    <section className="rounded-[24px] border border-white/[0.065] bg-[#040A12]/92 p-6 shadow-[0_18px_65px_rgba(0,0,0,.42)] backdrop-blur-xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-[-0.04em] text-white">Simulados da Jornada ({linkedCount}/{plannedCount || linkedCount})</h2>
          <p className="mt-1 text-sm text-slate-400">Lista ordenada dos simulados vinculados à jornada.</p>
        </div>
        <Link href={`/admin/jornadas/${jornadaId}/editar?tab=simulados`}>
          <HeroButton icon={<Settings size={16} />}>Gerenciar simulados</HeroButton>
        </Link>
      </div>

      {jornadaSimulados.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-white/[0.11] bg-white/[0.022] p-10 text-center text-sm text-slate-400">
          Nenhum simulado vinculado. <Link href={`/admin/jornadas/${jornadaId}/editar?tab=simulados`} className="font-semibold text-orange-300 hover:text-orange-200">Adicionar simulados</Link>
        </div>
      ) : (
        <div className="relative pl-8">
          <div className="absolute left-[21px] top-2 h-[calc(100%-34px)] w-px bg-gradient-to-b from-sky-400 via-orange-400 to-slate-700" />
          <div className="space-y-4">
            {display.map((js, index) => {
              const order = Number(js.order_number || index + 1);
              const scheduleDate = scheduleDateFor(order);
              const state: "released" | "scheduled" = scheduleDate <= now ? "released" : "scheduled";
              return <SimuladoRow key={js.id} js={js} order={order} state={state} releaseDay={relativeReleaseDay(order)} scheduleDate={scheduleDate} />;
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function SimuladoRow({ js, order, state, releaseDay, scheduleDate }: { js: JornadaSimulado; order: number; state: "released" | "scheduled"; releaseDay: number; scheduleDate: Date }) {
  const simuladoId = js.simulados?.id || js.simulado_id;
  const simuladoTitle = js.simulados?.title || "Simulado sem nome";
  const config = {
    released: {
      border: "border-sky-400/70 shadow-[0_0_38px_rgba(14,165,233,.15)]",
      circle: "border-sky-400 bg-[#06243A] text-sky-200 shadow-[0_0_30px_rgba(14,165,233,.35)]",
      image: owlBlue,
      badge: "border-sky-400/30 bg-sky-400/10 text-sky-200",
      date: "text-emerald-300",
      statusIcon: <CheckCircle2 size={21} />,
      statusLabel: "Liberado",
      statusSub: "Disponível para alunos",
      statusClass: "text-emerald-300",
      action: "Abrir simulado",
    },
    scheduled: {
      border: "border-orange-400/70 shadow-[0_0_38px_rgba(249,115,22,.12)]",
      circle: "border-orange-400 bg-[#321A05] text-orange-200 shadow-[0_0_30px_rgba(249,115,22,.35)]",
      image: owlOrange,
      badge: "border-orange-400/35 bg-orange-400/10 text-orange-200",
      date: "text-orange-300",
      statusIcon: <Clock3 size={21} />,
      statusLabel: "Programado",
      statusSub: "Aguardando liberação",
      statusClass: "text-orange-300",
      action: null,
    },
  }[state];

  return (
    <div className="relative">
      <div className={`absolute -left-[42px] top-8 z-10 flex h-12 w-12 items-center justify-center rounded-full border-2 text-base font-black ${config.circle}`}>{order}</div>
      <Link
        href={`/simulados/${simuladoId}`}
        aria-label={`Abrir simulado ${simuladoTitle}`}
        className={`group grid gap-4 rounded-[18px] border bg-[#030811]/94 p-3.5 transition hover:-translate-y-0.5 hover:bg-[#060D17] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/70 md:grid-cols-[104px_1fr_210px] ${config.border}`}
      >
        <div className="h-24 overflow-hidden rounded-xl border border-white/[0.065] bg-black/55 shadow-[inset_0_0_18px_rgba(255,255,255,.03)]">
          <img src={config.image} alt="Miniatura do simulado" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 py-1">
          <h3 className="line-clamp-2 text-lg font-black tracking-[-0.03em] text-white transition group-hover:text-orange-200">{simuladoTitle}</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <MiniTag>{js.simulados?.question_count ?? 0} questões</MiniTag>
            <MiniTag>30 min</MiniTag>
            <MiniTag>Informática</MiniTag>
            <span className={`rounded-lg border px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] ${config.badge}`}>Liberado no dia {releaseDay}</span>
          </div>
          <p className={`mt-4 flex items-center gap-2 text-sm font-bold ${config.date}`}>
            <CalendarDays size={15} />
            {state === "released" ? "Liberado em" : "Liberação programada para"} {formatDateTime(scheduleDate.toISOString())}
          </p>
        </div>
        <div className="flex flex-col justify-center border-t border-white/[0.075] pt-4 md:border-l md:border-t-0 md:pl-5 md:pt-0">
          <div className={`flex items-center gap-3 font-black ${config.statusClass}`}>
            {config.statusIcon}
            {config.statusLabel}
          </div>
          <p className="mt-1 text-sm text-slate-400">{config.statusSub}</p>
          {config.action && (
            <span className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.022] px-4 text-sm font-bold text-white transition group-hover:bg-white/[0.06]">
              {config.action} <ChevronRight size={17} />
            </span>
          )}
        </div>
      </Link>
    </div>
  );
}

function MiniTag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-lg border border-white/[0.09] bg-white/[0.022] px-3 py-1 text-xs font-medium text-slate-200">{children}</span>;
}

function AlunosPanel({ students, total, search, setSearch, statusFilter, setStatusFilter, progressFilter, setProgressFilter, onAssign, onAddDays, onPauseResume, onCancel }: { students: StudentJornada[]; total: number; search: string; setSearch: (value: string) => void; statusFilter: string; setStatusFilter: (value: string) => void; progressFilter: ProgressFilter; setProgressFilter: (value: ProgressFilter) => void; onAssign: () => void; onAddDays: (sj: StudentJornada) => void; onPauseResume: (sj: StudentJornada, action: "pause" | "resume") => void; onCancel: (sj: StudentJornada) => void }) {
  const shown = students.slice(0, 5);
  return (
    <section className="rounded-[24px] border border-white/[0.065] bg-[#040A12]/92 p-6 shadow-[0_18px_65px_rgba(0,0,0,.42)] backdrop-blur-xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-[-0.04em] text-white">Alunos matriculados ({total})</h2>
          <p className="mt-1 text-sm text-slate-400">Acompanhe o progresso dos alunos nesta jornada.</p>
        </div>
        <button type="button" onClick={onAssign} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-orange-500/40 bg-orange-500/10 px-4 text-sm font-bold text-orange-300 transition hover:bg-orange-500/20">
          <UserPlus size={16} /> Atribuir aluno
        </button>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="relative">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar aluno..."
            className="h-12 w-full rounded-xl border border-white/[0.075] bg-black/50 px-4 pr-11 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-orange-400/50"
          />
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
        </div>
        <div className="flex gap-2">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-12 rounded-xl border border-white/[0.075] bg-[#050B13] px-3 text-sm font-semibold text-slate-200 outline-none">
            <option value="all">Status</option>
            <option value="active">Ativa</option>
            <option value="paused">Pausada</option>
            <option value="expired">Expirada</option>
            <option value="cancelled">Cancelada</option>
          </select>
          <select value={progressFilter} onChange={(e) => setProgressFilter(e.target.value as ProgressFilter)} className="h-12 rounded-xl border border-white/[0.075] bg-[#050B13] px-3 text-sm font-semibold text-slate-200 outline-none">
            <option value="all">Progresso</option>
            <option value="not_started">Não iniciado</option>
            <option value="in_progress">Em andamento</option>
            <option value="completed">Concluído</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        {shown.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/[0.11] bg-white/[0.022] p-8 text-center text-sm text-slate-400">
            Nenhum aluno encontrado.
          </div>
        ) : shown.map((sj, index) => <StudentRow key={sj.id} sj={sj} index={index} onAddDays={onAddDays} onPauseResume={onPauseResume} onCancel={onCancel} />)}
      </div>

      {total > 5 && (
        <button type="button" className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/[0.075] bg-white/[0.022] text-sm font-black text-orange-300 transition hover:bg-white/[0.07]">
          <Users size={16} /> Ver todos os {total} alunos
        </button>
      )}
    </section>
  );
}

function StudentRow({ sj, index, onAddDays, onPauseResume, onCancel }: { sj: StudentJornada; index: number; onAddDays: (sj: StudentJornada) => void; onPauseResume: (sj: StudentJornada, action: "pause" | "resume") => void; onCancel: (sj: StudentJornada) => void }) {
  const completed = sj.progress?.completed ?? 0;
  const total = sj.progress?.total ?? 0;
  const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  const initials = getInitials(sj.students?.name || "Aluno");
  const tone = index % 3 === 0 ? "from-sky-400/25" : index % 3 === 1 ? "from-orange-400/25" : "from-slate-300/20";
  return (
    <div className="grid gap-3 rounded-[16px] border border-white/[0.075] bg-white/[0.025] p-3 transition hover:border-white/[0.14] hover:bg-white/[0.04] sm:grid-cols-[1fr_150px_42px] sm:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/[0.11] bg-gradient-to-br ${tone} to-black text-sm font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,.08)]`}>{initials}</div>
        <div className="min-w-0">
          <Link href={`/admin/alunos/${sj.student_id}`} className="block truncate text-sm font-black text-white transition hover:text-orange-300 hover:underline">
            {sj.students?.name || "—"}
          </Link>
          <p className="truncate text-xs text-slate-400">Iniciado em {formatDate(sj.started_at)}</p>
          <p className="truncate text-[11px] text-slate-500">{sj.students?.email || "—"}</p>
        </div>
      </div>
      <div>
        <div className="flex justify-between text-xs text-slate-400"><span>Progresso</span><span className="font-bold text-white">{completed}/{total}</span></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/50">
          <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-200 shadow-[0_0_16px_rgba(249,115,22,.25)]" style={{ width: `${percent}%` }} />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <EnrollmentPill status={sj.status} />
          <span className="text-[11px] text-slate-500">{daysRemaining(sj.expires_at)}</span>
        </div>
      </div>
      <div className="flex gap-1 sm:justify-end">
        <Link href={`/admin/alunos/${sj.student_id}`} title="Ver perfil" className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.075] bg-black/50 text-slate-300 transition hover:text-white"><Eye size={16} /></Link>
        <button title="Adicionar dias" onClick={() => onAddDays(sj)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.075] bg-black/50 text-slate-300 transition hover:text-white"><CalendarPlus size={16} /></button>
        {sj.status === "active" && <button title="Pausar" onClick={() => onPauseResume(sj, "pause")} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.075] bg-black/50 text-slate-300 transition hover:text-white"><Pause size={16} /></button>}
        {sj.status === "paused" && <button title="Reativar" onClick={() => onPauseResume(sj, "resume")} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.075] bg-black/50 text-slate-300 transition hover:text-white"><Play size={16} /></button>}
        {sj.status !== "cancelled" && <button title="Cancelar matrícula" onClick={() => onCancel(sj)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.075] bg-black/50 text-slate-300 transition hover:text-red-300"><MoreVertical size={16} /></button>}
      </div>
    </div>
  );
}

function EnrollmentPill({ status }: { status: string }) {
  const cls = status === "active" ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200" : status === "paused" ? "border-slate-300/20 bg-slate-300/10 text-slate-200" : status === "expired" ? "border-orange-300/20 bg-orange-300/10 text-orange-200" : "border-red-300/20 bg-red-300/10 text-red-200";
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${cls}`}>{enrollmentStatusLabel(status)}</span>;
}

function ProgressPanel({ averageCompletion, completedSum, activeStudents, pausedStudents, totalStudents }: { averageCompletion: number; completedSum: number; activeStudents: number; pausedStudents: number; totalStudents: number }) {
  return (
    <section className="rounded-[24px] border border-white/[0.075] bg-[#060D16]/86 p-6 shadow-[0_18px_65px_rgba(0,0,0,.26)] backdrop-blur-xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-[-0.04em] text-white">Progresso Geral da Jornada</h2>
          <p className="mt-1 text-sm text-slate-400">Acompanhamento consolidado da evolução dos alunos.</p>
        </div>
        <div className="rounded-2xl border border-white/[0.075] bg-white/[0.022] px-5 py-3 text-right">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Conclusão média</p>
          <p className="text-3xl font-black text-white">{averageCompletion}%</p>
        </div>
      </div>
      <div className="mt-6 h-24 rounded-2xl border border-white/[0.075] bg-[linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.015))] p-4">
        <div className="flex h-full items-end gap-2">
          {[34, 48, 42, 58, 64, 55, 70, averageCompletion || 38].map((height, i) => (
            <div key={i} className="flex-1 rounded-t-lg bg-gradient-to-t from-slate-500/20 to-slate-200/60 shadow-[0_0_18px_rgba(255,255,255,.04)]" style={{ height: `${Math.max(12, height)}%` }} />
          ))}
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <SmallKpi label="Concluídos" value={`${completedSum}`} />
        <SmallKpi label="Alunos ativos" value={`${activeStudents}`} />
        <SmallKpi label="Pausados" value={`${pausedStudents}`} />
        <SmallKpi label="Total" value={`${totalStudents}`} />
      </div>
    </section>
  );
}

function SmallKpi({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/[0.075] bg-white/[0.025] p-4"><p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-1 text-xl font-black text-white">{value}</p></div>;
}

function AsidePanel({ jornada, durationDays, studentJornadas }: { jornada: Jornada; durationDays: number; studentJornadas: StudentJornada[] }) {
  const latestStudents = studentJornadas.slice(0, 4);
  return (
    <aside className="space-y-5">
      <div className="rounded-[24px] border border-white/[0.075] bg-[#060D16]/86 p-5 shadow-[0_18px_65px_rgba(0,0,0,.26)] backdrop-blur-xl">
        <h3 className="text-lg font-black text-white">Atividade Recente</h3>
        <div className="mt-4 space-y-4">
          {latestStudents.length === 0 ? <p className="text-sm text-slate-500">Nenhuma atividade recente.</p> : latestStudents.map((sj) => (
            <div key={sj.id} className="flex gap-3 border-b border-white/[0.075] pb-3 last:border-0 last:pb-0">
              <span className="mt-1 flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.075] bg-white/[0.022] text-orange-300"><Users size={14} /></span>
              <div>
                <p className="text-sm font-semibold text-slate-200">{sj.students?.name || "Aluno"} foi atribuído</p>
                <p className="text-xs text-slate-500">Início em {formatDate(sj.started_at)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-[24px] border border-white/[0.075] bg-[#060D16]/86 p-5 shadow-[0_18px_65px_rgba(0,0,0,.26)] backdrop-blur-xl">
        <h3 className="text-lg font-black text-white">Configurações</h3>
        <div className="mt-4 space-y-3">
          <ConfigLine label="Duração" value={`${durationDays} dias`} />
          <ConfigLine label="Data da prova" value={jornada.exam_date ? formatDate(jornada.exam_date) : "Sem data"} />
          <ConfigLine label="Progressão" value="Sequencial" />
          <ConfigLine label="Tipo" value={scopeLabel(jornada.scope_type, jornada.contest_name)} />
        </div>
      </div>
    </aside>
  );
}

function ConfigLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.075] bg-white/[0.025] px-4 py-3"><span className="text-sm text-slate-500">{label}</span><span className="text-right text-sm font-bold text-slate-200">{value}</span></div>;
}

function DarkOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 px-4 backdrop-blur-md">
      <button type="button" aria-label="Fechar" className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full">{children}</div>
    </div>
  );
}

function ModalHeader({ eyebrow, title, subtitle, onClose }: { eyebrow: string; title: string; subtitle?: string | null; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-300">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-white">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      <button type="button" onClick={onClose} className="rounded-xl border border-white/[0.075] p-2 text-slate-400 transition hover:bg-white/[0.06] hover:text-white">
        <X size={18} />
      </button>
    </div>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
