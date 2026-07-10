"use client";

import { type ChangeEvent, type ReactNode, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  FileText,
  Globe2,
  Hash,
  Info,
  ListChecks,
  MapPin,
  PlusCircle,
  Route,
  Search,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import PremiumLoadingOverlay from "../../../components/ui/PremiumLoadingOverlay";
import PremiumModal from "../../../components/ui/PremiumModal";
import { adminFetch } from "@/lib/supabase/adminFetch";
import { JORNADA_CATEGORIES, jornadaCategoryLabel } from "../utils";

type Feedback = { tone: "success" | "error"; title: string; message: string } | null;

const defaultForm = {
  title: "",
  description: "",
  scope_type: "contest" as "general" | "contest",
  contest_name: "",
  exam_name: "",
  exam_position: "",
  exam_board: "",
  welcome_title: "Bem-vindo(a) à sua Jornada de Simulados",
  welcome_message: "",
  study_strategy: "",
  important_guidelines: "",
  journey_highlights: ["cronograma_progressivo", "relatorios_desempenho", "correcao_comentada"] as string[],
  category: "policial" as "saude" | "policial" | "tribunais" | "administrativo",
  duration_days: 90,
  planned_simulados_count: 10,
  exam_date: "",
};

const headerBg = "/jornadas/page/header-bg.webp";

const HIGHLIGHTS = [
  { value: "simulados_ineditos", label: "Simulados inéditos" },
  { value: "correcao_comentada", label: "Correção comentada" },
  { value: "relatorios_desempenho", label: "Relatórios de desempenho" },
  { value: "comparacao_tentativas", label: "Comparação entre tentativas" },
  { value: "cronograma_progressivo", label: "Cronograma progressivo" },
  { value: "estatisticas_assunto", label: "Estatísticas por assunto" },
];

export default function NovaJornadaClient() {
  const router = useRouter();
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  function update<K extends keyof typeof defaultForm>(key: K, value: (typeof defaultForm)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit() {
    setFeedback(null);

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

    setSaving(true);
    try {
      const res = await adminFetch("/api/admin/jornadas", {
        method: "POST",
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
          planned_simulados_count: Number(form.planned_simulados_count),
          exam_date: form.exam_date || null,
        }),
      });
      const result = await res.json();
      if (!result.ok) throw new Error(result.message);
      router.push(`/admin/jornadas/${result.id}/editar`);
      router.refresh();
    } catch (err) {
      setFeedback({
        tone: "error",
        title: "Erro ao criar",
        message: err instanceof Error ? err.message : "Erro inesperado.",
      });
    } finally {
      setSaving(false);
    }
  }

  const examDateFormatted = useMemo(() => {
    if (!form.exam_date) return null;
    return new Intl.DateTimeFormat("pt-BR").format(new Date(`${form.exam_date}T00:00:00`));
  }, [form.exam_date]);

  const releaseDateFormatted = useMemo(() => {
    if (!form.exam_date) return null;
    const examDate = new Date(`${form.exam_date}T00:00:00`);
    const effective = new Date(examDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    return new Intl.DateTimeFormat("pt-BR").format(effective);
  }, [form.exam_date]);

  const journeyMonthsLabel = useMemo(() => {
    const days = Number(form.duration_days || 0);
    if (!days) return "";
    const months = Math.max(1, Math.round(days / 30));
    return months === 1 ? "1 mês de jornada" : `${months} meses de jornada`;
  }, [form.duration_days]);

  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-[#03070D] text-white">
      <PremiumLoadingOverlay show={saving} title="Criando jornada…" message="Salvando configurações iniciais." />
      <PremiumModal
        open={Boolean(feedback)}
        tone={feedback?.tone || "error"}
        title={feedback?.title || ""}
        message={feedback?.message}
        onClose={() => setFeedback(null)}
      />

      <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_18%_8%,rgba(249,115,22,0.10),transparent_28%),radial-gradient(circle_at_82%_5%,rgba(37,99,235,0.16),transparent_34%),linear-gradient(180deg,#03070D_0%,#050B14_48%,#03070D_100%)]" />
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.18)_1px,transparent_1px)] [background-size:72px_72px]" />

      <main className="relative mx-auto max-w-[1600px] px-5 py-4 sm:px-6 lg:px-8">
        <HeroHeader />
        <StepProgress />

        <section className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,520px)]">
          <JornadaFormCard form={form} update={update} />
          <SummaryCard
            form={form}
            examDateFormatted={examDateFormatted}
            releaseDateFormatted={releaseDateFormatted}
            journeyMonthsLabel={journeyMonthsLabel}
            saving={saving}
            onSubmit={submit}
          />
        </section>
      </main>
    </div>
  );
}

function HeroHeader() {
  return (
    <header className="relative isolate overflow-hidden rounded-[1.35rem] border border-white/[0.11] bg-[#07111F]/80 px-6 py-6 shadow-2xl shadow-black/35 sm:px-8">
      <div
        className="absolute inset-0 -z-20 bg-cover bg-center opacity-75"
        style={{ backgroundImage: `url(${headerBg})` }}
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#05080D] via-[#061426]/88 to-[#05080D]/90" />
      <div className="absolute inset-y-0 left-0 -z-10 w-72 bg-[radial-gradient(circle_at_20%_50%,rgba(249,115,22,0.24),transparent_58%)]" />
      <div className="absolute inset-0 -z-10 backdrop-blur-[1px]" />

      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-orange-500/35 bg-orange-500/[0.08] text-orange-400 shadow-[0_0_38px_rgba(249,115,22,0.22)]">
            <Route size={42} strokeWidth={1.55} />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-400">Jornadas</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-white md:text-5xl">Nova Jornada</h1>
            <p className="mt-3 max-w-4xl text-sm leading-relaxed text-white/72 md:text-base">
              Configure uma trilha de simulados com duração, abrangência, cronograma e quantidade planejada de simulados.
            </p>
          </div>
        </div>

        <Link
          href="/admin/jornadas"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/25 bg-white/[0.06] px-6 text-sm font-bold text-white/90 shadow-lg shadow-black/20 transition hover:-translate-y-0.5 hover:border-white/40 hover:bg-white/[0.10]"
        >
          <ArrowLeft size={18} />
          Voltar
        </Link>
      </div>
    </header>
  );
}

function StepProgress() {
  return (
    <section className="mt-5 rounded-[1.35rem] border border-white/[0.10] bg-[#07111F]/76 px-5 py-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
      <div className="grid items-center gap-4 lg:grid-cols-[1fr_76px_1fr_76px_1fr]">
        <StepItem number="1" title="Criar Jornada" subtitle="Defina as regras principais" active />
        <StepConnector active />
        <StepItem number="2" title="Adicionar Simulados" subtitle="Vincule e ordene os simulados" />
        <StepConnector />
        <StepItem number="3" title="Atribuir Alunos" subtitle="Libere para os alunos iniciarem" />
      </div>
    </section>
  );
}

function StepItem({ number, title, subtitle, active = false }: { number: string; title: string; subtitle: string; active?: boolean }) {
  return (
    <div className="flex items-center gap-4">
      <div
        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border text-xl font-black shadow-lg transition ${
          active
            ? "border-orange-400 bg-orange-500/15 text-orange-300 shadow-orange-500/30 ring-4 ring-orange-500/10"
            : "border-slate-500/60 bg-slate-900/45 text-slate-400"
        }`}
      >
        {number}
      </div>
      <div>
        <p className={`text-base font-black ${active ? "text-orange-300" : "text-slate-300"}`}>{title}</p>
        <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>
      </div>
    </div>
  );
}

function StepConnector({ active = false }: { active?: boolean }) {
  return (
    <div
      className={`hidden h-px lg:block ${
        active
          ? "bg-gradient-to-r from-orange-400 via-orange-500 to-transparent shadow-[0_0_18px_rgba(249,115,22,0.70)]"
          : "bg-gradient-to-r from-slate-700 via-slate-500/50 to-transparent"
      }`}
    />
  );
}

function JornadaFormCard({
  form,
  update,
}: {
  form: typeof defaultForm;
  update: <K extends keyof typeof defaultForm>(key: K, value: (typeof defaultForm)[K]) => void;
}) {
  return (
    <section className="relative isolate overflow-hidden rounded-[1.35rem] border border-white/[0.11] bg-[#07111F]/82 p-6 shadow-2xl shadow-black/35 backdrop-blur-xl sm:p-8">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_6%_0%,rgba(59,130,246,0.18),transparent_35%),radial-gradient(circle_at_100%_100%,rgba(249,115,22,0.11),transparent_28%)]" />

      <SectionTitle
        icon={<FileText size={30} strokeWidth={1.65} />}
        title="Dados da Jornada"
        subtitle="Defina a identidade, o tipo e as regras iniciais da Jornada."
      />

      <div className="mt-7 space-y-6">
        <DarkField label="Nome da Jornada" icon={<FileText size={16} />}>
          <DarkInput
            placeholder="Ex.: Jornada Delegado AL 2026"
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
          />
        </DarkField>

        <DarkField label="Descrição (opcional)" icon={<FileText size={16} />}>
          <DarkTextarea
            placeholder="Descreva o objetivo, o público-alvo e os diferenciais desta jornada..."
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            maxLength={300}
            rows={4}
          />
        </DarkField>

        <div>
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-300">
            <Trophy size={16} className="text-slate-400" />
            <span>Tipo da Jornada</span>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <JourneyTypeCard
              active={form.scope_type === "general"}
              icon={<Globe2 size={48} strokeWidth={1.55} />}
              title="Jornada Geral"
              description="Jornada livre, não vinculada a um concurso específico."
              onClick={() => update("scope_type", "general")}
              tone="blue"
            />
            <JourneyTypeCard
              active={form.scope_type === "contest"}
              icon={<Target size={48} strokeWidth={1.55} />}
              title="Concurso específico"
              description="Jornada vinculada a um concurso, cargo ou prova definida."
              onClick={() => update("scope_type", "contest")}
              tone="orange"
            />
          </div>
        </div>

        <DarkField label="Nome do concurso, caso o tipo seja Concurso específico" icon={<MapPin size={16} />}>
          <DarkInput
            placeholder="Ex.: TJMG, PCDF, Delegado AL, etc."
            value={form.contest_name}
            onChange={(e) => update("contest_name", e.target.value)}
            rightIcon={<Search size={19} />}
            disabled={form.scope_type !== "contest"}
          />
        </DarkField>

        <DarkField label="Categoria da Jornada" icon={<Route size={16} />} helper="A categoria define automaticamente a miniatura exibida no card da Jornada.">
          <div className="grid gap-4 sm:grid-cols-2">
            {JORNADA_CATEGORIES.map((category) => {
              const active = form.category === category.value;
              return (
                <button
                  key={category.value}
                  type="button"
                  onClick={() => update("category", category.value)}
                  className={`group relative overflow-hidden rounded-2xl border text-left transition duration-300 ${
                    active
                      ? "border-orange-400/70 ring-2 ring-orange-400/20 shadow-[0_0_28px_rgba(249,115,22,0.18)]"
                      : "border-white/[0.10] hover:border-white/[0.22]"
                  }`}
                >
                  <div className="relative h-28 bg-cover bg-center" style={{ backgroundImage: `url(${category.image})` }}>
                    <div className="absolute inset-0 bg-gradient-to-t from-[#050A12] via-[#050A12]/35 to-transparent" />
                    {active ? (
                      <span className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-orange-500 text-[#050A12] shadow-lg">
                        <Check size={16} strokeWidth={3} />
                      </span>
                    ) : null}
                    <div className="absolute inset-x-0 bottom-0 p-3">
                      <p className="text-sm font-black text-white">{category.label}</p>
                      <p className="mt-0.5 line-clamp-1 text-xs text-white/65">{category.description}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </DarkField>

        <div className="grid gap-5 lg:grid-cols-3">
          <DarkField label="Concurso exibido ao aluno" icon={<Trophy size={16} />} helper="Opcional. Use quando quiser separar o nome comercial da Jornada do concurso oficial.">
            <DarkInput
              placeholder="Ex.: Polícia Civil de Minas Gerais"
              value={form.exam_name}
              onChange={(e) => update("exam_name", e.target.value)}
            />
          </DarkField>

          <DarkField label="Cargo exibido ao aluno" icon={<Target size={16} />}>
            <DarkInput
              placeholder="Ex.: Investigador"
              value={form.exam_position}
              onChange={(e) => update("exam_position", e.target.value)}
            />
          </DarkField>

          <DarkField label="Banca exibida ao aluno" icon={<FileText size={16} />}>
            <DarkInput
              placeholder="Ex.: FGV, CEBRASPE, VUNESP"
              value={form.exam_board}
              onChange={(e) => update("exam_board", e.target.value)}
            />
          </DarkField>
        </div>

        <DarkField label="Título da aba Dados da Jornada" icon={<Info size={16} />}>
          <DarkInput
            placeholder="Ex.: Bem-vindo(a) à Jornada PCMG"
            value={form.welcome_title}
            onChange={(e) => update("welcome_title", e.target.value)}
          />
        </DarkField>

        <DarkField label="Mensagem de apresentação para o aluno" icon={<FileText size={16} />} helper="Este texto abre a nova aba Dados da Jornada.">
          <DarkTextarea
            placeholder="Explique o objetivo da Jornada, para quem ela foi criada e o que o aluno deve esperar desta trilha."
            value={form.welcome_message}
            onChange={(e) => update("welcome_message", e.target.value)}
            rows={5}
          />
        </DarkField>

        <DarkField label="O que o aluno encontrará" icon={<ListChecks size={16} />} helper="Esses itens serão exibidos automaticamente como cards na aba Dados da Jornada.">
          <HighlightChecklist
            values={form.journey_highlights}
            onChange={(values) => update("journey_highlights", values)}
          />
        </DarkField>

        <div className="grid gap-5 lg:grid-cols-2">
          <DarkField label="Estratégia recomendada" icon={<Target size={16} />}>
            <DarkTextarea
              placeholder="Ex.: Faça os simulados no prazo indicado, revise os comentários e acompanhe os assuntos com maior incidência de erro."
              value={form.study_strategy}
              onChange={(e) => update("study_strategy", e.target.value)}
              rows={4}
            />
          </DarkField>

          <DarkField label="Orientações importantes" icon={<Info size={16} />}>
            <DarkTextarea
              placeholder="Ex.: Respeite o tempo de prova, evite consultas durante a tentativa e revise seus erros após finalizar."
              value={form.important_guidelines}
              onChange={(e) => update("important_guidelines", e.target.value)}
              rows={4}
            />
          </DarkField>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <DarkField label="Duração da Jornada" icon={<Clock3 size={16} />} helper="Período total de acesso do aluno.">
            <DarkNumberInput
              value={form.duration_days}
              onChange={(value) => update("duration_days", value)}
              suffix="dias"
            />
          </DarkField>

          <DarkField label="Quantidade planejada de simulados" icon={<Hash size={16} />} helper="Total de simulados que serão vinculados.">
            <DarkNumberInput
              value={form.planned_simulados_count}
              onChange={(value) => update("planned_simulados_count", value)}
            />
          </DarkField>

          <DarkField label="Data da prova (opcional)" icon={<CalendarDays size={16} />} helper="Se informada, usaremos D-7 como data efetiva.">
            <DarkInput
              type="date"
              value={form.exam_date}
              onChange={(e) => update("exam_date", e.target.value)}
              rightIcon={<CalendarDays size={18} />}
            />
          </DarkField>
        </div>
      </div>
    </section>
  );
}

function SummaryCard({
  form,
  examDateFormatted,
  releaseDateFormatted,
  journeyMonthsLabel,
  saving,
  onSubmit,
}: {
  form: typeof defaultForm;
  examDateFormatted: string | null;
  releaseDateFormatted: string | null;
  journeyMonthsLabel: string;
  saving: boolean;
  onSubmit: () => void;
}) {
  return (
    <aside className="relative isolate overflow-hidden rounded-[1.35rem] border border-white/[0.11] bg-[#07111F]/82 p-6 shadow-2xl shadow-black/35 backdrop-blur-xl sm:p-7">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_0%_0%,rgba(59,130,246,0.16),transparent_36%),radial-gradient(circle_at_100%_75%,rgba(249,115,22,0.10),transparent_36%)]" />

      <SectionTitle
        icon={<ListChecks size={30} strokeWidth={1.65} />}
        title="Resumo da Jornada"
        subtitle="Prévia das regras iniciais da Jornada."
        compact
      />

      <div className="mt-6 space-y-3">
        <SummaryRow icon={<FileText size={20} />} label="Nome" value={form.title.trim() || "Não informado"} />
        <SummaryRow
          icon={<Target size={20} />}
          label="Abrangência"
          value={form.scope_type === "contest" ? "Concurso específico" : "Jornada Geral"}
          highlight
        />
        <SummaryRow icon={<Route size={20} />} label="Categoria" value={jornadaCategoryLabel(form.category)} highlight />
        <SummaryRow
          icon={<Trophy size={20} />}
          label="Concurso"
          value={form.scope_type === "contest" ? form.contest_name.trim() || "Não informado" : "Não se aplica"}
        />
        <SummaryRow icon={<Target size={20} />} label="Cargo" value={form.exam_position.trim() || "Não informado"} />
        <SummaryRow icon={<FileText size={20} />} label="Banca" value={form.exam_board.trim() || "Não informada"} />
        <SummaryRow icon={<Clock3 size={20} />} label="Duração" value={`${form.duration_days || 0} dias`} highlight />
        <SummaryRow
          icon={<Hash size={20} />}
          label="Simulados planejados"
          value={`${form.planned_simulados_count || 0} simulados`}
          highlight
        />
        <SummaryRow icon={<CalendarDays size={20} />} label="Data da prova" value={examDateFormatted || "Sem data"} />
        <SummaryRow icon={<CalendarDays size={20} />} label="Data efetiva (D-7)" value={releaseDateFormatted || "Sem data"} muted={!releaseDateFormatted} />
        <SummaryRow icon={<Check size={20} />} label="Status inicial" value="Rascunho" badge />
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={saving}
        className="mt-7 inline-flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-orange-500 via-orange-500 to-amber-500 px-5 text-base font-black text-white shadow-[0_0_34px_rgba(249,115,22,0.38)] transition hover:-translate-y-0.5 hover:shadow-[0_0_46px_rgba(249,115,22,0.52)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <PlusCircle size={22} />
        Criar e adicionar simulados
        <ArrowRight size={22} />
      </button>

      <div className="mt-4 rounded-2xl border border-sky-400/10 bg-sky-400/[0.045] p-4">
        <div className="flex items-start gap-3 text-sm leading-relaxed text-slate-300">
          <Info size={18} className="mt-0.5 shrink-0 text-sky-300" />
          <p>
            A Jornada será criada como rascunho. Você poderá publicar mesmo sem simulados, conforme regra atual do sistema.
            {journeyMonthsLabel ? <span className="mt-1 block text-slate-400">Duração aproximada: {journeyMonthsLabel}.</span> : null}
          </p>
        </div>
      </div>
    </aside>
  );
}

function SectionTitle({ icon, title, subtitle, compact = false }: { icon: ReactNode; title: string; subtitle: string; compact?: boolean }) {
  return (
    <div className="flex items-start gap-5">
      <div
        className={`flex shrink-0 items-center justify-center rounded-2xl border border-orange-500/40 bg-orange-500/[0.07] text-orange-400 shadow-[0_0_28px_rgba(249,115,22,0.16)] ${
          compact ? "h-14 w-14" : "h-14 w-14"
        }`}
      >
        {icon}
      </div>
      <div>
        <h2 className="text-xl font-black tracking-tight text-white md:text-2xl">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">{subtitle}</p>
      </div>
    </div>
  );
}

function JourneyTypeCard({
  active,
  icon,
  title,
  description,
  onClick,
  tone,
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  tone: "blue" | "orange";
}) {
  const isOrange = tone === "orange";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative min-h-[132px] overflow-hidden rounded-2xl border p-5 text-left transition duration-300 ${
        active
          ? isOrange
            ? "border-orange-500 bg-orange-500/[0.08] shadow-[0_0_34px_rgba(249,115,22,0.18)]"
            : "border-blue-400/60 bg-blue-500/[0.055] shadow-[0_0_26px_rgba(59,130,246,0.12)]"
          : "border-white/[0.10] bg-white/[0.035] hover:border-white/[0.18] hover:bg-white/[0.055]"
      }`}
    >
      {active && (
        <span className="absolute right-4 top-[-1px] rounded-b-xl border-x border-b border-orange-500/45 bg-orange-500/15 px-3 py-1 text-xs font-bold text-orange-300">
          Selecionado
        </span>
      )}
      <div className="flex items-center gap-5">
        <div
          className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-full border ${
            isOrange
              ? "border-orange-500/25 bg-orange-500/[0.10] text-orange-400"
              : "border-blue-500/25 bg-blue-500/[0.10] text-blue-400"
          }`}
        >
          {icon}
        </div>
        <div className="pr-7">
          <p className="text-lg font-black text-white">{title}</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">{description}</p>
        </div>
      </div>
      <div
        className={`absolute right-4 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border ${
          active
            ? isOrange
              ? "border-orange-400 bg-orange-500 text-slate-950"
              : "border-blue-400 bg-blue-500 text-slate-950"
            : isOrange
              ? "border-orange-400/40 text-orange-300/50"
              : "border-blue-400/60 text-blue-300/50"
        }`}
      >
        {active ? <Check size={16} strokeWidth={3} /> : null}
      </div>
    </button>
  );
}

function HighlightChecklist({ values, onChange }: { values: string[]; onChange: (values: string[]) => void }) {
  function toggle(value: string) {
    onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {HIGHLIGHTS.map((item) => {
        const active = values.includes(item.value);
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => toggle(item.value)}
            className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-bold transition ${
              active
                ? "border-orange-400/60 bg-orange-500/[0.12] text-orange-100 shadow-[0_0_22px_rgba(249,115,22,0.12)]"
                : "border-white/[0.11] bg-white/[0.035] text-slate-300 hover:border-white/[0.20] hover:bg-white/[0.055]"
            }`}
          >
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${active ? "border-orange-400 bg-orange-500 text-slate-950" : "border-slate-500 text-slate-500"}`}>
              {active ? <Check size={14} strokeWidth={3} /> : null}
            </span>
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function DarkField({ label, icon, children, helper }: { label: string; icon?: ReactNode; children: ReactNode; helper?: string }) {
  return (
    <div>
      <label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-300">
        {icon ? <span className="text-slate-400">{icon}</span> : null}
        <span>{label}</span>
      </label>
      {children}
      {helper ? <p className="mt-2 text-sm text-slate-400">{helper}</p> : null}
    </div>
  );
}

function DarkInput({
  type = "text",
  value,
  onChange,
  placeholder,
  rightIcon,
  disabled = false,
}: {
  type?: string;
  value?: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  rightIcon?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className="h-12 w-full rounded-xl border border-white/[0.16] bg-[#06111F]/70 px-4 pr-12 text-base font-medium text-white/85 outline-none transition placeholder:text-slate-500 hover:border-white/[0.24] focus:border-orange-400/70 focus:ring-4 focus:ring-orange-500/10 disabled:cursor-not-allowed disabled:opacity-50 [color-scheme:dark]"
      />
      {rightIcon ? (
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-300/80">{rightIcon}</span>
      ) : null}
    </div>
  );
}

function DarkNumberInput({ value, onChange, suffix }: { value: number; onChange: (value: number) => void; suffix?: string }) {
  return (
    <div className="relative">
      <input
        type="number"
        value={String(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`h-12 w-full rounded-xl border border-white/[0.16] bg-[#06111F]/70 px-4 ${suffix ? "pr-20" : "pr-4"} text-base font-medium text-white/85 outline-none transition placeholder:text-slate-500 hover:border-white/[0.24] focus:border-orange-400/70 focus:ring-4 focus:ring-orange-500/10 [color-scheme:dark]`}
      />
      {suffix ? (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-lg bg-white/[0.06] px-2 py-1 text-xs font-bold text-slate-300">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

function DarkTextarea({
  value,
  onChange,
  placeholder,
  maxLength,
  rows = 4,
}: {
  value?: string;
  onChange?: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
}) {
  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={rows}
        className="w-full resize-none rounded-xl border border-white/[0.16] bg-[#06111F]/70 px-4 pb-8 pt-4 text-base font-medium leading-relaxed text-white/85 outline-none transition placeholder:text-slate-500 hover:border-white/[0.24] focus:border-orange-400/70 focus:ring-4 focus:ring-orange-500/10"
      />
      {maxLength !== undefined && value !== undefined ? (
        <span className="pointer-events-none absolute bottom-3 right-4 text-xs text-slate-500">
          {value.length}/{maxLength}
        </span>
      ) : null}
    </div>
  );
}

function SummaryRow({
  icon,
  label,
  value,
  highlight = false,
  muted = false,
  badge = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
  muted?: boolean;
  badge?: boolean;
}) {
  return (
    <div className="flex min-h-[54px] items-center justify-between gap-4 rounded-xl border border-white/[0.09] bg-white/[0.035] px-4 py-3">
      <div className="flex items-center gap-3 text-slate-300">
        <span className="text-blue-400">{icon}</span>
        <span className="text-sm font-medium text-slate-300">{label}</span>
      </div>
      {badge ? (
        <span className="rounded-lg border border-blue-300/10 bg-blue-300/[0.12] px-3 py-1 text-sm font-semibold text-blue-100">
          {value}
        </span>
      ) : (
        <span
          className={`max-w-[210px] truncate text-right text-sm font-black ${
            muted ? "text-slate-500" : highlight ? "text-orange-400" : "text-white/92"
          }`}
          title={value}
        >
          {value}
        </span>
      )}
    </div>
  );
}
