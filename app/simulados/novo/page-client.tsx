"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileText,
  PlayCircle,
  Settings2,
  ShieldCheck,
  Target,
  Trophy,
  RotateCcw,
  Eye,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { adminFetch } from "@/app/lib/supabase/adminFetch";
import PremiumButton from "../../components/ui/PremiumButton";
import PremiumInput from "../../components/ui/PremiumInput";
import PremiumLoadingOverlay from "../../components/ui/PremiumLoadingOverlay";
import PremiumModal from "../../components/ui/PremiumModal";
import PremiumSelect from "../../components/ui/PremiumSelect";
import SimuladoCard from "../components/SimuladoCard";
import SimuladoShell from "../components/SimuladoShell";
import type { Discipline, SimuladoPayload } from "../types";
import { getDefaultOwlHelpLimit, resolveOwlHelpLimit } from "../utils";

const OWL_MARK = "\u{1F989}\uFE0F";

type Feedback = { type: "success" | "error"; title: string; message: string } | null;

function buildAutoDescription({
  disciplineName,
  questionCount,
  timeLimitMinutes,
  scoringModel,
  maxAttempts,
}: {
  disciplineName?: string;
  questionCount?: number | null;
  timeLimitMinutes?: number | null;
  scoringModel: "traditional" | "cebraspe";
  maxAttempts?: number | null;
}) {
  const subject = disciplineName ? `Simulado de ${disciplineName}` : "Simulado geral";
  const questions = questionCount ? `com ${questionCount} quest${questionCount > 1 ? "ões" : "ão"}` : "com meta de questões não definida";
  const duration = timeLimitMinutes ? `duração de ${timeLimitMinutes} minutos` : "sem limite de tempo";
  const model = scoringModel === "cebraspe" ? "modelo CEBRASPE" : "modelo tradicional";
  const attempts = maxAttempts
    ? `${maxAttempts} tentativa${maxAttempts > 1 ? "s" : ""} permitida${maxAttempts > 1 ? "s" : ""}`
    : "tentativas ilimitadas";

  return `${subject}, ${questions}, ${duration}, ${model}, ${attempts}.`;
}

const defaultForm: SimuladoPayload = {
  title: "",
  description: "",
  discipline_id: "",
  status: "draft",
  question_count: 50,
  time_limit_minutes: 60,
  max_attempts: 1,
  show_result_on_finish: true,
  show_answer_key_on_finish: false,
  instant_feedback_enabled: false,
  feedback_mode: "final_only",
  show_teacher_comment: true,
  correction_video_url: "",
  shuffle_questions: false,
  shuffle_alternatives: false,
  allow_blank_answers: false,
  scoring_model: "traditional",
  owl_help_enabled: false,
  owl_help_limit: null,
};

export default function NovoSimuladoClient({ disciplines }: { disciplines: Discipline[] }) {
  const router = useRouter();
  const [form, setForm] = useState<SimuladoPayload>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const disciplineName = disciplines.find((item) => item.id === form.discipline_id)?.name;
  const autoDescription = useMemo(
    () =>
      buildAutoDescription({
        disciplineName,
        questionCount: form.question_count,
        timeLimitMinutes: form.time_limit_minutes,
        scoringModel: form.scoring_model,
        maxAttempts: form.max_attempts,
      }),
    [disciplineName, form.question_count, form.time_limit_minutes, form.scoring_model, form.max_attempts],
  );

  function update<K extends keyof SimuladoPayload>(key: K, value: SimuladoPayload[K]) {
    setForm((current) => {
      if (key === "feedback_mode") {
        const mode = value === "instant" ? "instant" : "final_only";
        return { ...current, feedback_mode: mode as any, instant_feedback_enabled: mode === "instant" };
      }
      return { ...current, [key]: value };
    });
  }

  function updateOwlHelpEnabled(enabled: boolean) {
    setForm((current) => ({
      ...current,
      owl_help_enabled: enabled,
      owl_help_limit: enabled
        ? resolveOwlHelpLimit(current.owl_help_limit, current.question_count)
        : null,
    }));
  }

  async function submit() {
    setFeedback(null);

    if (!form.title.trim()) {
      setFeedback({ type: "error", title: "Nome obrigatório", message: "Informe o nome do simulado." });
      return;
    }

    if (form.question_count !== null && form.question_count !== undefined && (!Number.isInteger(form.question_count) || form.question_count <= 0)) {
      setFeedback({ type: "error", title: "Numero de questoes invalido", message: "Informe um numero inteiro positivo maior que zero." });
      return;
    }

    if (form.owl_help_enabled && (!Number.isInteger(Number(form.owl_help_limit)) || Number(form.owl_help_limit) < 1)) {
      setFeedback({ type: "error", title: "Quantidade de ajudas inválida", message: "Informe um número inteiro maior que zero ou desabilite a Ajuda da Coruja." });
      return;
    }

    setSaving(true);

    try {
      const response = await adminFetch("/api/admin/simulados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, description: autoDescription }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Erro ao criar simulado.");
      }

      router.push(`/simulados/${result.id}/editar`);
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        title: "Nao foi possivel criar",
        message: error instanceof Error ? error.message : "Erro ao criar simulado.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SimuladoShell
      variant="dark"
      eyebrow="Simulados"
      title="Novo Simulado"
      description="Configure o motor administrativo do simulado antes de selecionar as questões."
      action={
        <Link href="/simulados">
          <PremiumButton variant="secondary" icon={<ArrowLeft size={18} />}>Voltar</PremiumButton>
        </Link>
      }
    >
      <PremiumLoadingOverlay show={saving} title="Criando simulado..." message="Salvando configurações iniciais." />
      <PremiumModal
        open={Boolean(feedback)}
        tone="error"
        title={feedback?.title || ""}
        message={feedback?.message}
        onClose={() => setFeedback(null)}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,460px)]">
        <div className="space-y-6">
          <SimuladoCard variant="dark" title="Dados básicos" description="Nome, descrição e disciplina opcional." icon={<FileText size={18} />}>
            <div className="grid gap-5 dark-form">
              <PremiumInput
                label="Nome do simulado"
                value={form.title}
                onChange={(event: any) => update("title", event.target.value)}
                placeholder="Ex.: Simulado 01 — Delegado AL"
              />

              <PremiumInput label="Descrição automática" textarea value={autoDescription} readOnly />

              <PremiumSelect
                label="Disciplina opcional"
                value={form.discipline_id || ""}
                onChange={(event: any) => update("discipline_id", event.target.value)}
              >
                <option value="">Sem disciplina principal</option>
                {disciplines.map((discipline) => (
                  <option key={discipline.id} value={discipline.id}>{discipline.name}</option>
                ))}
              </PremiumSelect>

              <div className="rounded-2xl border border-orange-400/20 bg-orange-500/[0.06] p-4 shadow-sm shadow-orange-950/20">
                <PremiumInput
                  label="Número de questões do simulado"
                  type="number"
                  min={1}
                  step={1}
                  icon={<Target size={15} />}
                  value={form.question_count ?? ""}
                  onChange={(event: any) => update("question_count", event.target.value ? Number(event.target.value) : null)}
                  placeholder="Ex.: 50"
                />
                <p className="mt-2 text-xs font-semibold text-slate-400">
                  Define a meta visual usada para montar o simulado no banco de questões.
                </p>
              </div>
            </div>
          </SimuladoCard>

          <SimuladoCard variant="dark" title="Configurações" description="Regras oficiais de tempo, tentativas, pontuação e finalização." icon={<Settings2 size={18} />}>
            <div className="grid gap-5 md:grid-cols-2 dark-form">
              <PremiumSelect label="Status" value={form.status} onChange={(event: any) => update("status", event.target.value)}>
                <option value="draft">Rascunho</option>
                <option value="published">Publicado</option>
                <option value="archived">Arquivado</option>
              </PremiumSelect>

              <PremiumInput
                label="Tempo de prova (minutos)"
                type="number"
                min={1}
                step={1}
                icon={<Clock3 size={15} />}
                value={form.time_limit_minutes ?? ""}
                onChange={(event: any) => update("time_limit_minutes", event.target.value ? Number(event.target.value) : null)}
                placeholder="Ex.: 90"
              />

              <PremiumSelect
                label="Tentativas"
                value={form.max_attempts ?? ""}
                onChange={(event: any) => update("max_attempts", event.target.value ? Number(event.target.value) : null)}
              >
                <option value="1">1 tentativa</option>
                <option value="2">2 tentativas</option>
                <option value="3">3 tentativas</option>
                <option value="">Ilimitado</option>
              </PremiumSelect>

              <PremiumSelect
                label="Sistema de pontuação"
                value={form.scoring_model}
                onChange={(event: any) => update("scoring_model", event.target.value)}
              >
                <option value="traditional">Tradicional</option>
                <option value="cebraspe">CEBRASPE</option>
              </PremiumSelect>

              <Toggle label="Pode deixar questões em branco?" value={form.allow_blank_answers} onChange={(value) => update("allow_blank_answers", value)} />
              <Toggle label="Exibir resultado ao finalizar?" value={form.show_result_on_finish} onChange={(value) => update("show_result_on_finish", value)} />
              <Toggle label="Mostrar gabarito ao finalizar?" value={form.show_answer_key_on_finish} onChange={(value) => update("show_answer_key_on_finish", value)} />
              <PremiumSelect
                label="Modo de feedback"
                value={form.feedback_mode || (form.instant_feedback_enabled ? "instant" : "final_only")}
                onChange={(event: any) => update("feedback_mode", event.target.value)}
              >
                <option value="instant">Feedback imediato</option>
                <option value="final_only">Navegação aberta / feedback ao final</option>
              </PremiumSelect>
              <Toggle label="Mostrar comentário do professor?" value={form.show_teacher_comment} onChange={(value) => update("show_teacher_comment", value)} />
              <Toggle label="Ajuda da Coruja?" value={Boolean(form.owl_help_enabled)} onChange={updateOwlHelpEnabled}>
                {form.owl_help_enabled && (
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(150px,0.42fr)] sm:items-end">
                    <p className="text-xs font-semibold leading-5 text-slate-400">
                      Sugestão automática: {getDefaultOwlHelpLimit(form.question_count)} ajuda(s). O número informado será o limite deste simulado.
                    </p>
                  <PremiumInput
                    label="Quantidade de ajudas"
                    type="number"
                    min={1}
                    step={1}
                    value={form.owl_help_limit ?? ""}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => update("owl_help_limit", event.target.value ? Number(event.target.value) : null)}
                    placeholder={String(getDefaultOwlHelpLimit(form.question_count))}
                    variant="jornada"
                    className="!h-10 !rounded-xl !border-orange-300/20 !bg-black/20 text-center !font-black"
                  />
                  </div>
                )}
              </Toggle>
              <Toggle label="Embaralhar questões?" value={form.shuffle_questions} onChange={(value) => update("shuffle_questions", value)} />
              <Toggle label="Embaralhar alternativas?" value={form.shuffle_alternatives} onChange={(value) => update("shuffle_alternatives", value)} />
            </div>
          </SimuladoCard>

          <SimuladoCard variant="dark" title="Correção" description="Vídeo opcional de correção." icon={<PlayCircle size={18} />}>
            <div className="dark-form">
            <PremiumInput
              label="URL Vimeo"
              value={form.correction_video_url || ""}
              onChange={(event: any) => update("correction_video_url", event.target.value)}
              placeholder="https://vimeo.com/..."
            />
            </div>
          </SimuladoCard>
        </div>

        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <div className="overflow-hidden rounded-[2rem] border border-slate-900 bg-slate-950 shadow-2xl shadow-slate-950/20 ring-1 ring-orange-400/20">
            <div className="relative overflow-hidden border-b border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-orange-950/70 p-5">
              <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-orange-400/20 blur-2xl" />
              <div className="relative flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-amber-300 text-slate-950 shadow-lg shadow-orange-500/30">
                  <ShieldCheck size={21} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-200">Resumo operacional</p>
                  <h3 className="mt-1 text-lg font-black text-white">Configuração do simulado</h3>
                  <p className="mt-1 text-xs font-medium leading-5 text-slate-300">Regras que serão apresentadas ao aluno antes da tentativa.</p>
                </div>
              </div>
            </div>
            <div className="space-y-3 p-4">
              <Rule label="Tempo" value={form.time_limit_minutes ? `${form.time_limit_minutes} min` : "Sem limite"} icon={<Clock3 size={15} />} />
              <Rule label="Questões" value={form.question_count ? String(form.question_count) : "Não definido"} icon={<Target size={15} />} />
              <Rule label="Tentativas" value={form.max_attempts ? `${form.max_attempts}` : "Ilimitado"} icon={<RotateCcw size={15} />} />
              <Rule label="Pontuação" value={form.scoring_model === "cebraspe" ? "CEBRASPE" : "Tradicional"} icon={<Trophy size={15} />} />
              <Rule label="Em branco" value={form.allow_blank_answers ? "Permitido" : "Obrigatório responder"} icon={<CheckCircle2 size={15} />} />
              <Rule label="Feedback" value={(form.feedback_mode || (form.instant_feedback_enabled ? "instant" : "final_only")) === "instant" ? "Imediato" : "Ao final"} icon={<Eye size={15} />} />
              <Rule label="Ajuda da Coruja" value={form.owl_help_enabled ? `${resolveOwlHelpLimit(form.owl_help_limit, form.question_count)} uso(s)` : "Desabilitada"} icon={<span className="text-sm">{OWL_MARK}</span>} accent={form.owl_help_enabled ?? false} />
            </div>
            <div className="border-t border-white/10 p-4">
              <PremiumButton full icon={<CheckCircle2 size={18} />} onClick={submit} disabled={saving}>
                Criar simulado
              </PremiumButton>
            </div>
          </div>
        </aside>
      </div>
      <style jsx global>{`
        .dark-form label { color: rgb(203 213 225) !important; }
        .dark-form input,
        .dark-form textarea,
        .dark-form select {
          border-color: rgba(255,255,255,0.10) !important;
          background: rgba(255,255,255,0.045) !important;
          color: rgb(248 250 252) !important;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
        }
        .dark-form input::placeholder,
        .dark-form textarea::placeholder { color: rgb(100 116 139) !important; }
        .dark-form input:focus,
        .dark-form textarea:focus,
        .dark-form select:focus {
          border-color: rgba(255,138,0,0.75) !important;
          box-shadow: 0 0 0 4px rgba(255,138,0,0.13) !important;
        }
        .dark-form option { background: #0B111C; color: #F8FAFC; }
      `}</style>
    </SimuladoShell>
  );
}

function Toggle({ label, value, onChange, children }: { label: string; value: boolean; onChange: (value: boolean) => void; children?: React.ReactNode }) {
  const activeClass = value
    ? "border-orange-400/45 bg-orange-500/15 text-orange-100 ring-4 ring-orange-500/10"
    : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-orange-400/25 hover:bg-white/[0.07]";

  if (children) {
    return (
      <div className={`overflow-hidden rounded-2xl border transition ${activeClass}`}>
        <button
          type="button"
          onClick={() => onChange(!value)}
          className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold"
        >
          <span>{label}</span>
          <span className={`h-5 w-9 rounded-full p-0.5 transition ${value ? "bg-orange-500" : "bg-slate-700"}`}>
            <span className={`block h-4 w-4 rounded-full bg-white transition ${value ? "translate-x-4" : ""}`} />
          </span>
        </button>
        <div className="border-t border-orange-200/10 bg-black/10 px-4 py-3">{children}</div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`flex min-h-12 items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${activeClass}`}
    >
      <span>{label}</span>
      <span className={`h-5 w-9 rounded-full p-0.5 transition ${value ? "bg-orange-500" : "bg-slate-700"}`}>
        <span className={`block h-4 w-4 rounded-full bg-white transition ${value ? "translate-x-4" : ""}`} />
      </span>
    </button>
  );
}

function Rule({ label, value, icon, accent = false }: { label: string; value: string; icon?: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`group flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-3 shadow-sm transition ${accent ? "border-orange-300/40 bg-orange-400/15 shadow-orange-500/10" : "border-white/10 bg-white/[0.06] hover:bg-white/[0.09]"}`}>
      <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-300">
        <span className={`flex h-7 w-7 items-center justify-center rounded-xl ${accent ? "bg-orange-400 text-slate-950" : "bg-white/10 text-orange-200"}`}>{icon}</span>
        {label}
      </span>
      <span className={`text-right text-sm font-black ${accent ? "text-orange-200" : "text-white"}`}>{value}</span>
    </div>
  );
}
