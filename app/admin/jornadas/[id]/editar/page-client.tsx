"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Reorder } from "framer-motion";
import {
  ArrowLeft,
  CalendarDays,
  FileText,
  Globe2,
  CheckCircle2,
  Clock3,
  GripVertical,
  Hash,
  Info,
  ListChecks,
  Plus,
  Save,
  Search,
  Settings2,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import PageBackground from "../../../../components/ui/PageBackground";
import PageHeader from "../../../../components/ui/PageHeader";
import PremiumButton from "../../../../components/ui/PremiumButton";
import PremiumCard from "../../../../components/ui/PremiumCard";
import PremiumInput from "../../../../components/ui/PremiumInput";
import PremiumLoadingOverlay from "../../../../components/ui/PremiumLoadingOverlay";
import PremiumModal from "../../../../components/ui/PremiumModal";
import type { AvailableSimulado, Jornada, JornadaCategory, JornadaSimulado } from "../../types";
import { JORNADA_CATEGORIES } from "../../utils";
import { adminFetch } from "@/lib/supabase/adminFetch";

type Feedback = { tone: "success" | "error" | "warning"; title: string; message: string } | null;
type Tab = "info" | "simulados";

const HIGHLIGHTS = [
  { value: "simulados_ineditos", label: "Simulados inéditos" },
  { value: "correcao_comentada", label: "Correção comentada" },
  { value: "relatorios_desempenho", label: "Relatórios de desempenho" },
  { value: "comparacao_tentativas", label: "Comparação entre tentativas" },
  { value: "cronograma_progressivo", label: "Cronograma progressivo" },
  { value: "estatisticas_assunto", label: "Estatísticas por assunto" },
];

export default function EditarJornadaClient({
  jornada,
  initialSimulados,
  allSimulados,
}: {
  jornada: Jornada;
  initialSimulados: JornadaSimulado[];
  allSimulados: AvailableSimulado[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab: Tab = searchParams.get("tab") === "simulados" ? "simulados" : "info";
  const [tab, setTab] = useState<Tab>(initialTab);

  const [feedback, setFeedback] = useState<Feedback>(null);
  const [saving, setSaving] = useState(false);

  // Info form
  const [form, setForm] = useState({
    title: jornada.title,
    description: jornada.description || "",
    scope_type: jornada.scope_type || "general",
    contest_name: jornada.contest_name || "",
    exam_name: jornada.exam_name || "",
    exam_position: jornada.exam_position || "",
    exam_board: jornada.exam_board || "",
    welcome_title: jornada.welcome_title || "Bem-vindo(a) à sua Jornada de Simulados",
    welcome_message: jornada.welcome_message || "",
    study_strategy: jornada.study_strategy || "",
    important_guidelines: jornada.important_guidelines || "",
    journey_highlights: Array.isArray(jornada.journey_highlights) ? jornada.journey_highlights : [],
    category: (jornada.category || "administrativo") as JornadaCategory,
    duration_days: jornada.duration_days || jornada.duration_months * 30,
    release_duration_days: jornada.release_duration_days || jornada.duration_days || jornada.duration_months * 30,
    planned_simulados_count: jornada.planned_simulados_count || Math.max(1, initialSimulados.length),
    exam_date: jornada.exam_date || "",
  });

  // Simulados state (mutable list for DnD)
  const [simulados, setSimulados] = useState<JornadaSimulado[]>(initialSimulados);
  const [orderDirty, setOrderDirty] = useState(false);
  const [simuladoSearch, setSimuladoSearch] = useState("");
  const [addingSimuladoId, setAddingSimuladoId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const linkedIds = useMemo(() => new Set(simulados.map((s) => s.simulado_id)), [simulados]);

  const filteredBank = useMemo(() => {
    const term = simuladoSearch.toLowerCase().trim();
    return allSimulados.filter(
      (s) => !term || s.title.toLowerCase().includes(term),
    );
  }, [allSimulados, simuladoSearch]);

  async function saveInfo() {
    if (!form.title.trim()) {
      setFeedback({ tone: "error", title: "Nome obrigatório", message: "Informe o nome da jornada." });
      return;
    }
    if (form.scope_type === "contest" && !form.contest_name.trim()) {
      setFeedback({ tone: "error", title: "Concurso obrigatório", message: "Informe o concurso ou marque a Jornada como Geral." });
      return;
    }
    if (!form.category) {
      setFeedback({ tone: "error", title: "Categoria obrigatória", message: "Selecione a categoria da Jornada." });
      return;
    }
    if (!form.duration_days || form.duration_days <= 0) {
      setFeedback({ tone: "error", title: "Duração inválida", message: "Informe uma duração em dias maior que zero." });
      return;
    }
    if (!form.planned_simulados_count || form.planned_simulados_count <= 0) {
      setFeedback({ tone: "error", title: "Quantidade inválida", message: "Informe quantos simulados esta Jornada terá." });
      return;
    }
    if (form.planned_simulados_count < simulados.length) {
      setFeedback({ tone: "error", title: "Quantidade incompatível", message: `A Jornada já possui ${simulados.length} simulado(s) vinculado(s). A quantidade planejada não pode ser menor que isso.` });
      return;
    }
    if (!form.release_duration_days || form.release_duration_days <= 0) {
      setFeedback({ tone: "error", title: "Liberação inválida", message: "Informe em quantos dias todos os simulados serão liberados." });
      return;
    }
    if (!form.exam_date && Number(form.release_duration_days) > Number(form.duration_days) - 7) {
      setFeedback({ tone: "error", title: "Janela de liberação inválida", message: "A duração destinada à liberação dos simulados deve terminar pelo menos sete dias antes do encerramento da Jornada." });
      return;
    }
    setSaving(true);
    try {
      const res = await adminFetch(`/api/admin/jornadas/${jornada.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || null,
          scope_type: form.scope_type,
          contest_name: form.scope_type === "contest" ? form.contest_name.trim() : null,
          exam_name: form.exam_name.trim() || null,
          exam_position: form.exam_position.trim() || null,
          exam_board: form.exam_board.trim() || null,
          welcome_title: form.welcome_title.trim() || null,
          welcome_message: form.welcome_message.trim() || null,
          study_strategy: form.study_strategy.trim() || null,
          important_guidelines: form.important_guidelines.trim() || null,
          journey_highlights: form.journey_highlights,
          category: form.category,
          duration_days: Number(form.duration_days),
          release_duration_days: Number(form.release_duration_days),
          planned_simulados_count: Number(form.planned_simulados_count),
          exam_date: form.exam_date || null,
        }),
      });
      const result = await res.json();
      if (!result.ok) throw new Error(result.message);
      router.push(`/admin/jornadas/${jornada.id}`);
      router.refresh();
    } catch (err) {
      setFeedback({ tone: "error", title: "Erro ao salvar", message: err instanceof Error ? err.message : "Erro inesperado." });
    } finally {
      setSaving(false);
    }
  }

  async function saveOrder() {
    setSaving(true);
    try {
      const orderedIds = simulados.map((s) => s.id);
      const res = await adminFetch(`/api/admin/jornadas/${jornada.id}/simulados/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordered_ids: orderedIds }),
      });
      const result = await res.json();
      if (!result.ok) throw new Error(result.message);
      setOrderDirty(false);
      router.push(`/admin/jornadas/${jornada.id}`);
      router.refresh();
    } catch (err) {
      setFeedback({ tone: "error", title: "Erro ao salvar ordem", message: err instanceof Error ? err.message : "Erro inesperado." });
    } finally {
      setSaving(false);
    }
  }

  async function addSimulado(simuladoId: string) {
    setAddingSimuladoId(simuladoId);
    try {
      const res = await adminFetch(`/api/admin/jornadas/${jornada.id}/simulados`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simulado_id: simuladoId }),
      });
      const result = await res.json();
      if (!result.ok) throw new Error(result.message);
      // Optimistically add to list
      if (result.jornada_simulado) {
        const bank = allSimulados.find((s) => s.id === simuladoId);
        const newEntry: JornadaSimulado = {
          ...result.jornada_simulado,
          jornada_id: jornada.id,
          created_at: new Date().toISOString(),
          simulados: bank ? { id: bank.id, title: bank.title, status: bank.status, question_count: bank.question_count } : null,
        };
        setSimulados((prev) => [...prev, newEntry]);
      }
      router.refresh();
    } catch (err) {
      setFeedback({ tone: "error", title: "Erro ao adicionar", message: err instanceof Error ? err.message : "Erro inesperado." });
    } finally {
      setAddingSimuladoId(null);
    }
  }

  async function removeSimulado(js: JornadaSimulado) {
    setRemovingId(js.id);
    try {
      const res = await adminFetch(`/api/admin/jornadas/${jornada.id}/simulados`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jornada_simulado_id: js.id }),
      });
      const result = await res.json();
      if (!result.ok) throw new Error(result.message);
      setSimulados((prev) => prev.filter((s) => s.id !== js.id));
      router.refresh();
    } catch (err) {
      setFeedback({ tone: "error", title: "Erro ao remover", message: err instanceof Error ? err.message : "Erro inesperado." });
    } finally {
      setRemovingId(null);
    }
  }

  function handleReorder(newOrder: JornadaSimulado[]) {
    setSimulados(newOrder);
    setOrderDirty(true);
  }

  const plannedCount = Number(jornada.planned_simulados_count || 0);
  const linkedCount = simulados.length;
  const hasSimuladosOverflow = plannedCount > 0 && linkedCount > plannedCount;

  return (
    <PageBackground variant="jornada">
      <PremiumLoadingOverlay show={saving} title="Salvando…" message="Aguarde um momento." />

      <PremiumModal
        open={Boolean(feedback)}
        tone={feedback?.tone || "info"}
        title={feedback?.title || ""}
        message={feedback?.message}
        onClose={() => setFeedback(null)}
      />

      <PageHeader
        variant="jornada"
        eyebrow="Jornadas"
        title={`Editar: ${jornada.title}`}
        action={
          <Link href={`/admin/jornadas/${jornada.id}`}>
            <PremiumButton variant="dark" icon={<ArrowLeft size={18} />}>
              Voltar
            </PremiumButton>
          </Link>
        }
      />

      {/* Tabs */}
      <div className="mb-6 flex gap-2 border-b border-white/[0.08]">
        {(["info", "simulados"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
              tab === t
                ? "border-orange-400 text-orange-300"
                : "border-transparent text-slate-500 hover:text-slate-200"
            }`}
          >
            {t === "info" ? <Settings2 size={15} /> : <Plus size={15} />}
            {t === "info" ? "Informações" : "Simulados"}
          </button>
        ))}
      </div>

      {hasSimuladosOverflow && (
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-red-500/30 bg-red-500/[0.08] p-4 text-red-200 sm:flex-row sm:items-start sm:gap-4">
          <Info size={20} className="mt-0.5 shrink-0 text-red-300" />
          <p className="text-sm leading-6">
            <strong>Quantidade de simulados acima do planejado:</strong> esta jornada tem {linkedCount} simulado(s) vinculado(s), mas está configurada para {plannedCount}.
            Aumente a &ldquo;Quantidade de simulados&rdquo; para {linkedCount} na aba Informações, ou remova {linkedCount - plannedCount} simulado(s) excedente(s) na aba Simulados.
          </p>
        </div>
      )}

      {/* Tab: Informações */}
      {tab === "info" && (
        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <PremiumCard variant="jornada" title="Dados da Jornada" icon={<Settings2 size={18} />}>
            <div className="grid gap-5">
              <PremiumInput
                variant="jornada"
                label="Nome da jornada"
                value={form.title}
                onChange={(e: any) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Nome da jornada"
              />

              <PremiumInput
                variant="jornada"
                label="Descrição (opcional)"
                textarea
                value={form.description}
                onChange={(e: any) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Descreva o objetivo da jornada…"
              />

              <div className="grid gap-3 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, scope_type: "general", contest_name: "" }))}
                  className={`rounded-2xl border p-4 text-left transition ${form.scope_type === "general" ? "border-blue-400/45 bg-blue-500/[0.10] text-white ring-1 ring-blue-400/20" : "border-white/[0.09] bg-white/[0.04] text-slate-300 hover:border-white/[0.16] hover:bg-white/[0.07]"}`}
                >
                  <Globe2 size={18} />
                  <p className="mt-2 font-semibold">Jornada Geral</p>
                  <p className={`mt-1 text-xs ${form.scope_type === "general" ? "text-slate-500" : "text-slate-500"}`}>Não vinculada a um concurso específico.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, scope_type: "contest" }))}
                  className={`rounded-2xl border p-4 text-left transition ${form.scope_type === "contest" ? "border-orange-400/55 bg-orange-500/[0.12] text-orange-200 ring-1 ring-orange-400/20" : "border-white/[0.09] bg-white/[0.04] text-slate-300 hover:border-white/[0.16] hover:bg-white/[0.07]"}`}
                >
                  <Trophy size={18} />
                  <p className="mt-2 font-semibold">Concurso específico</p>
                  <p className="mt-1 text-xs text-slate-500">Vinculada a um concurso definido.</p>
                </button>
              </div>

              {form.scope_type === "contest" && (
                <PremiumInput
                  variant="jornada"
                  label="Nome do concurso"
                  icon={<Trophy size={15} />}
                  value={form.contest_name}
                  onChange={(e: any) => setForm((p) => ({ ...p, contest_name: e.target.value }))}
                  placeholder="Ex.: TJMG, GCM SP, Polícia Penal MG"
                />
              )}

              <div className="grid gap-5 md:grid-cols-3">
                <PremiumInput
                  variant="jornada"
                  label="Concurso exibido ao aluno"
                  icon={<Trophy size={15} />}
                  value={form.exam_name}
                  onChange={(e: any) => setForm((p) => ({ ...p, exam_name: e.target.value }))}
                  placeholder="Ex.: Polícia Civil de Minas Gerais"
                />
                <PremiumInput
                  variant="jornada"
                  label="Cargo exibido ao aluno"
                  icon={<Trophy size={15} />}
                  value={form.exam_position}
                  onChange={(e: any) => setForm((p) => ({ ...p, exam_position: e.target.value }))}
                  placeholder="Ex.: Investigador"
                />
                <PremiumInput
                  variant="jornada"
                  label="Banca exibida ao aluno"
                  icon={<FileText size={15} />}
                  value={form.exam_board}
                  onChange={(e: any) => setForm((p) => ({ ...p, exam_board: e.target.value }))}
                  placeholder="Ex.: FGV"
                />
              </div>

              <PremiumInput
                variant="jornada"
                label="Título da aba Dados da Jornada"
                icon={<Info size={15} />}
                value={form.welcome_title}
                onChange={(e: any) => setForm((p) => ({ ...p, welcome_title: e.target.value }))}
                placeholder="Ex.: Bem-vindo(a) à Jornada PCMG"
              />

              <PremiumInput
                variant="jornada"
                label="Mensagem de apresentação para o aluno"
                textarea
                value={form.welcome_message}
                onChange={(e: any) => setForm((p) => ({ ...p, welcome_message: e.target.value }))}
                placeholder="Explique o objetivo da Jornada, para quem ela foi criada e como o aluno deve usar esta trilha."
              />

              <div>
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300"><ListChecks size={15} /> O que o aluno encontrará</p>
                <HighlightChecklist
                  values={form.journey_highlights}
                  onChange={(values) => setForm((p) => ({ ...p, journey_highlights: values }))}
                />
                <p className="mt-2 text-xs text-slate-500">Os itens selecionados aparecem automaticamente como cards na aba Dados da Jornada.</p>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <PremiumInput
                  variant="jornada"
                  label="Estratégia recomendada"
                  textarea
                  value={form.study_strategy}
                  onChange={(e: any) => setForm((p) => ({ ...p, study_strategy: e.target.value }))}
                  placeholder="Ex.: Faça um simulado por semana, revise os comentários e acompanhe sua evolução por assunto."
                />
                <PremiumInput
                  variant="jornada"
                  label="Orientações importantes"
                  textarea
                  value={form.important_guidelines}
                  onChange={(e: any) => setForm((p) => ({ ...p, important_guidelines: e.target.value }))}
                  placeholder="Ex.: Respeite o tempo de prova, evite consultas e revise os erros após finalizar."
                />
              </div>

              <div>
                <p className="mb-3 text-sm font-semibold text-slate-300">Categoria da Jornada</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {JORNADA_CATEGORIES.map((category) => {
                    const active = form.category === category.value;
                    return (
                      <button
                        key={category.value}
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, category: category.value }))}
                        className={`overflow-hidden rounded-2xl border text-left transition ${
                          active ? "border-orange-500 ring-2 ring-orange-400/25" : "border-white/[0.09] hover:border-white/[0.16]"
                        }`}
                      >
                        <div className="relative h-28 bg-cover bg-center" style={{ backgroundImage: `url(${category.image})` }}>
                          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/35 to-transparent" />
                          {active ? <CheckCircle2 className="absolute right-3 top-3 text-orange-400" size={22} /> : null}
                          <div className="absolute inset-x-0 bottom-0 p-3">
                            <p className="text-sm font-bold text-white">{category.label}</p>
                            <p className="mt-0.5 line-clamp-1 text-xs text-white/65">{category.description}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-slate-500">A categoria define a imagem exibida no card da Jornada.</p>
              </div>

              <div className="grid gap-5 md:grid-cols-3">
                <PremiumInput
                  variant="jornada"
                  label="Duração (dias)"
                  type="number"
                  min={1}
                  step={1}
                  icon={<Clock3 size={15} />}
                  value={form.duration_days}
                  onChange={(e: any) => setForm((p) => ({ ...p, duration_days: Number(e.target.value) }))}
                />

                <PremiumInput
                  variant="jornada"
                  label="Quantidade de simulados"
                  type="number"
                  min={simulados.length || 1}
                  step={1}
                  icon={<Hash size={15} />}
                  value={form.planned_simulados_count}
                  onChange={(e: any) => setForm((p) => ({ ...p, planned_simulados_count: Number(e.target.value) }))}
                />

                <PremiumInput
                  variant="jornada"
                  label="Data da prova (opcional)"
                  type="date"
                  icon={<CalendarDays size={15} />}
                  value={form.exam_date}
                  onChange={(e: any) => setForm((p) => ({ ...p, exam_date: e.target.value }))}
                />
              </div>

              <div className="mt-5 md:max-w-xs">
                <PremiumInput
                  variant="jornada"
                  label="Todos os simulados serão liberados em (dias)"
                  type="number"
                  min={1}
                  step={1}
                  icon={<Clock3 size={15} />}
                  value={form.release_duration_days}
                  disabled={Boolean(form.exam_date)}
                  onChange={(e: any) => setForm((p) => ({ ...p, release_duration_days: Number(e.target.value) }))}
                />
                <p className="mt-2 text-xs text-slate-500">
                  {form.exam_date
                    ? "A distribuição será calculada automaticamente utilizando a data da prova."
                    : "O último simulado é liberado no dia informado, contando o dia da entrada do aluno como dia 1. Independente da duração da Jornada; deve terminar ao menos 7 dias antes do fim."}
                </p>
              </div>

              {form.exam_date && (
                <div className="rounded-2xl border border-orange-400/25 bg-orange-500/[0.08] p-4 text-sm text-orange-200">
                  <p className="font-semibold">Data efetiva de liberação</p>
                  <p className="mt-1">
                    Simulados liberados até{" "}
                    <strong>
                      {new Intl.DateTimeFormat("pt-BR").format(
                        new Date(new Date(form.exam_date + "T00:00:00").getTime() - 7 * 24 * 60 * 60 * 1000),
                      )}
                    </strong>{" "}
                    (7 dias antes da prova).
                  </p>
                </div>
              )}
            </div>
          </PremiumCard>

          <aside>
            <PremiumCard variant="jornada" title="Salvar" icon={<Save size={18} />}>
              <p className="mb-5 text-sm text-slate-500">
                Status atual:{" "}
                <strong className="text-white">
                  {jornada.status === "published" ? "Publicada" : jornada.status === "archived" ? "Arquivada" : "Rascunho"}
                </strong>
              </p>
              <PremiumButton full variant="dark-primary" icon={<CheckCircle2 size={18} />} onClick={saveInfo} disabled={saving}>
                Salvar informações
              </PremiumButton>
            </PremiumCard>
          </aside>
        </div>
      )}

      {/* Tab: Simulados */}
      {tab === "simulados" && (
        <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
          {/* Left: Simulados na Jornada */}
          <PremiumCard
            variant="jornada"
            title={`Simulados na Jornada (${simulados.length})`}
            description="Arraste para reordenar. Salve após reorganizar."
            icon={<Settings2 size={18} />}
            action={
              orderDirty ? (
                <PremiumButton variant="dark-primary" icon={<Save size={15} />} onClick={saveOrder} disabled={saving}>
                  Salvar ordem
                </PremiumButton>
              ) : undefined
            }
          >
            {simulados.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.035] p-10 text-center text-sm text-slate-400">
                Nenhum simulado vinculado. Use o painel à direita para incluir.
              </div>
            ) : (
              <Reorder.Group
                axis="y"
                values={simulados}
                onReorder={handleReorder}
                className="space-y-2"
              >
                {simulados.map((js, i) => (
                  <Reorder.Item key={js.id} value={js} className="cursor-grab active:cursor-grabbing">
                    <div className="flex items-center gap-3 rounded-2xl border border-white/[0.09] bg-white/[0.035] px-4 py-3 shadow-lg shadow-black/20 hover:border-orange-400/35 hover:bg-white/[0.055]">
                      <GripVertical size={16} className="shrink-0 text-slate-500" />
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-bold text-white">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">
                          {(js.simulados as any)?.title || "Simulado sem nome"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {(js.simulados as any)?.question_count ?? 0} questões
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeSimulado(js)}
                        disabled={removingId === js.id}
                        className="shrink-0 rounded-xl p-1.5 text-slate-500 transition hover:bg-red-500/[0.10] hover:text-red-300 disabled:opacity-50"
                        title="Remover"
                      >
                        {removingId === js.id ? (
                          <span className="text-xs">…</span>
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    </div>
                  </Reorder.Item>
                ))}
              </Reorder.Group>
            )}
          </PremiumCard>

          {/* Right: Search and add */}
          <aside>
            <PremiumCard variant="jornada" title="Incluir simulado existente" icon={<Search size={18} />}>
              <PremiumInput
                variant="jornada"
                placeholder="Buscar simulado…"
                icon={<Search size={15} />}
                value={simuladoSearch}
                onChange={(e: any) => setSimuladoSearch(e.target.value)}
                className="mb-4"
              />

              <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                {filteredBank.length === 0 && (
                  <p className="py-6 text-center text-sm text-slate-500">Nenhum simulado encontrado.</p>
                )}
                {filteredBank.map((s) => {
                  const linked = linkedIds.has(s.id);
                  return (
                    <div
                      key={s.id}
                      className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm transition ${
                        linked
                          ? "border-emerald-400/25 bg-emerald-500/[0.08]"
                          : "border-white/[0.09] bg-white/[0.035] hover:border-orange-400/35 hover:bg-white/[0.055]"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className={`truncate font-semibold ${linked ? "text-emerald-300" : "text-white"}`}>
                          {s.title}
                        </p>
                        <p className="text-xs text-slate-500">{s.question_count ?? 0} questões · {s.status}</p>
                      </div>
                      {linked ? (
                        <span className="flex items-center gap-1 rounded-full border border-emerald-400/35 bg-emerald-500/[0.12] px-3 py-1 text-xs font-semibold text-emerald-300">
                          <CheckCircle2 size={12} /> Incluído
                        </span>
                      ) : (
                        <PremiumButton
                          variant="dark"
                          icon={<Plus size={13} />}
                          disabled={addingSimuladoId === s.id}
                          onClick={() => addSimulado(s.id)}
                        >
                          {addingSimuladoId === s.id ? "…" : "Incluir"}
                        </PremiumButton>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 border-t border-white/[0.08] pt-4">
                <Link href={`/simulados/novo`}>
                  <PremiumButton full variant="dark" icon={<Plus size={15} />}>
                    Criar novo simulado
                  </PremiumButton>
                </Link>
                <p className="mt-2 text-center text-xs text-slate-500">
                  Após criar, volte aqui para incluir na jornada.
                </p>
              </div>
            </PremiumCard>
          </aside>
        </div>
      )}
    </PageBackground>
  );
}


function HighlightChecklist({ values, onChange }: { values: string[]; onChange: (values: string[]) => void }) {
  function toggle(value: string) {
    onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {HIGHLIGHTS.map((item) => {
        const active = values.includes(item.value);
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => toggle(item.value)}
            className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
              active
                ? "border-orange-400/45 bg-orange-500/[0.12] text-orange-200"
                : "border-white/[0.09] bg-white/[0.04] text-slate-300 hover:border-white/[0.16] hover:bg-white/[0.07]"
            }`}
          >
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${active ? "border-orange-500 bg-orange-500 text-white" : "border-slate-600 text-slate-500"}`}>
              {active ? <CheckCircle2 size={14} /> : null}
            </span>
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
