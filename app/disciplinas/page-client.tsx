"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import PageBackground from "../components/ui/PageBackground";
import PremiumButton from "../components/ui/PremiumButton";
import PremiumInput from "../components/ui/PremiumInput";
import PremiumLoadingOverlay from "../components/ui/PremiumLoadingOverlay";
import PremiumModal from "../components/ui/PremiumModal";
import { normalizeComparableName, normalizeEntityName } from "@/lib/utils/text";
import { adminFetch } from "@/app/lib/supabase/adminFetch";

type Discipline = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  subjects: { count: number }[];
  question_count?: number;
};

type Feedback = {
  type: "success" | "error" | "warning";
  message: string;
} | null;

type ConfirmState = {
  title: string;
  message: string;
  confirmLabel: string;
  variant?: "danger" | "primary";
  onConfirm: () => Promise<void> | void;
} | null;

export default function DisciplinasClient({
  initialData,
}: {
  initialData: Discipline[];
}) {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingDescription, setEditingDescription] = useState("");

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  useEffect(() => {
    if (!feedback) return;

    const timer = setTimeout(() => setFeedback(null), 3500);
    return () => clearTimeout(timer);
  }, [feedback]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();

    if (!term) return initialData;

    return initialData.filter((item) =>
      item.name.toLowerCase().includes(term)
    );
  }, [search, initialData]);

  const normalizedTypingName = normalizeEntityName(name);
  const existingDisciplineWhileTyping = normalizedTypingName
    ? initialData.find(
        (item) => normalizeComparableName(item.name) === normalizeComparableName(normalizedTypingName)
      )
    : null;

  async function requestJson(url: string, options: RequestInit) {
    const response = await adminFetch(url, options);
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.message || "Não foi possível concluir a operação.");
    }

    return result;
  }

  async function handleCreate() {
    const normalized = normalizeEntityName(name);

    if (!normalized) {
      setFeedback({
        type: "error",
        message: "Informe uma disciplina válida.",
      });
      return;
    }

    setSaving(true);

    try {
      const result = await requestJson("/api/admin/disciplines", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: normalized,
          description,
        }),
      });

      setFeedback({
        type: "success",
        message: result.message || "Disciplina cadastrada com sucesso.",
      });

      setName("");
      setDescription("");
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao cadastrar disciplina.",
      });
    } finally {
      setSaving(false);
    }
  }

  function startEdit(item: Discipline) {
    setExpandedId(item.id);
    setEditingId(item.id);
    setEditingName(item.name);
    setEditingDescription(item.description || "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName("");
    setEditingDescription("");
  }

  async function saveEdit(id: string) {
    const normalized = normalizeEntityName(editingName);

    if (!normalized) {
      setFeedback({
        type: "error",
        message: "Informe uma disciplina válida.",
      });
      return;
    }

    setSaving(true);

    try {
      const result = await requestJson("/api/admin/disciplines", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          name: normalized,
          description: editingDescription,
        }),
      });

      setFeedback({
        type: "success",
        message: result.message || "Disciplina atualizada com sucesso.",
      });

      cancelEdit();
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao atualizar disciplina.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item: Discipline) {
    setSaving(true);

    try {
      const result = await requestJson("/api/admin/disciplines", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: item.id,
          is_active: !item.is_active,
        }),
      });

      setFeedback({
        type: "success",
        message: result.message || "Status da disciplina atualizado.",
      });

      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao alterar status.",
      });
    } finally {
      setSaving(false);
      setConfirm(null);
    }
  }

  async function deleteDiscipline(id: string) {
    setSaving(true);

    try {
      const result = await requestJson(`/api/admin/disciplines?id=${id}`, {
        method: "DELETE",
      });

      setFeedback({
        type: "success",
        message: result.message || "Disciplina excluída com sucesso.",
      });

      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao excluir disciplina.",
      });
    } finally {
      setSaving(false);
      setConfirm(null);
    }
  }

  function toggleExpand(id: string) {
    setExpandedId((current) => (current === id ? null : id));
  }

  return (
    <PageBackground variant="jornada">
      <PremiumLoadingOverlay
        show={saving && !confirm}
        title="Processando..."
        message="Aguarde enquanto o sistema conclui esta ação."
      />

      {confirm && (
        <PremiumConfirm
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          variant={confirm.variant}
          onCancel={() => setConfirm(null)}
          onConfirm={confirm.onConfirm}
        />
      )}

      {feedback && <PremiumFeedback feedback={feedback} />}

      <section className="relative mb-8 min-h-[170px] overflow-hidden rounded-[2rem] border border-white/[0.08] bg-[linear-gradient(115deg,rgba(255,122,0,0.11)_0%,rgba(12,30,52,0.94)_48%,rgba(2,8,23,0.98)_100%)] px-6 py-8 shadow-[0_24px_80px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] sm:px-8 lg:px-10">
        <div className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full bg-blue-500/[0.10] blur-3xl" />
        <div className="pointer-events-none absolute -left-20 bottom-[-8rem] h-64 w-64 rounded-full bg-orange-500/[0.12] blur-3xl" />
        <div className="relative flex min-h-[106px] items-center justify-between gap-8">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-orange-400">EstudoTOP Simulados</p>
            <h1 className="mt-3 text-[34px] font-bold leading-[1.05] tracking-[-0.04em] text-white sm:text-[40px]">Disciplinas</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">Organize o banco de questões por disciplinas. Cada disciplina poderá receber vários assuntos.</p>
          </div>
          <div className="hidden h-20 w-20 shrink-0 items-center justify-center rounded-[1.6rem] border border-orange-400/25 bg-orange-500/[0.10] text-orange-300 shadow-[0_0_48px_rgba(249,115,22,0.16)] sm:flex"><BookOpen size={34} strokeWidth={1.7} /></div>
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="relative isolate rounded-[1.75rem] border border-white/[0.08] bg-[#0C1E34]/70 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.30)] backdrop-blur-xl sm:p-7">
          <div className="pointer-events-none absolute -inset-0.5 -z-10 rounded-[1.9rem] bg-gradient-to-b from-orange-400/[0.08] via-white/[0.02] to-transparent blur-2xl" />
          <div className="mb-7 flex items-start gap-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-orange-400/25 bg-orange-500/[0.10] text-orange-300"><Plus size={20} strokeWidth={2.4} /></div><div><h2 className="text-lg font-bold tracking-tight text-white">Nova disciplina</h2><p className="mt-1.5 text-[13px] leading-5 text-slate-400">Cadastre disciplinas com nome padronizado.</p></div></div>
          <div className="space-y-5">
            <PremiumInput
          variant="jornada"
              label="Nome"
              value={name}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
              placeholder="Ex.: Informática"
            />

            {existingDisciplineWhileTyping && (
              <div className="rounded-2xl border border-red-400/20 bg-red-500/[0.08] p-4 text-sm font-medium text-red-200">
                Já existe uma disciplina equivalente: {existingDisciplineWhileTyping.name}
              </div>
            )}

            <PremiumInput
          variant="jornada"
              label="Descrição"
              textarea
              value={description}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setDescription(event.target.value)}
              placeholder="Opcional"
            />

            <PremiumButton
              onClick={handleCreate}
              full
              variant="dark"
              icon={<span className="flex h-7 w-7 items-center justify-center rounded-xl border border-white/20 bg-white/15 shadow-inner shadow-white/10"><Plus size={15} strokeWidth={2.6} /></span>}
              className="relative h-[52px] overflow-hidden rounded-2xl border-orange-300/30 bg-[linear-gradient(135deg,#f97316_0%,#fb923c_52%,#f59e0b_100%)] text-sm font-extrabold text-white shadow-[0_16px_36px_rgba(249,115,22,0.28),inset_0_1px_0_rgba(255,255,255,0.25)] ring-1 ring-white/10 transition-all duration-300 after:pointer-events-none after:absolute after:inset-y-0 after:-left-1/3 after:w-1/4 after:-skew-x-12 after:bg-white/20 after:opacity-0 after:blur-sm after:transition-all after:duration-700 hover:-translate-y-0.5 hover:border-orange-200/50 hover:text-white hover:shadow-[0_20px_42px_rgba(249,115,22,0.36),inset_0_1px_0_rgba(255,255,255,0.30)] hover:after:left-[115%] hover:after:opacity-100 active:translate-y-0 active:scale-[0.99] disabled:after:hidden"
              disabled={saving || Boolean(existingDisciplineWhileTyping)}
            >
              Cadastrar disciplina
            </PremiumButton>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-white/[0.08] bg-[#0C1E34]/65 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.32)] backdrop-blur-xl sm:p-7">
          <div className="mb-7 flex items-start gap-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-orange-400/25 bg-orange-500/[0.10] text-orange-300"><BookOpen size={20} strokeWidth={2.2} /></div><div><h2 className="text-lg font-bold tracking-tight text-white">Disciplinas cadastradas</h2><p className="mt-1.5 text-[13px] leading-5 text-slate-400">Toque ou clique no card para expandir.</p></div></div>
          <div className="mb-6 rounded-[1.25rem] border border-white/[0.06] bg-[#020817]/25 p-4">
            <PremiumInput
          variant="jornada"
              label="Buscar"
              icon={<Search size={16} />}
              value={search}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
              placeholder="Pesquisar disciplina..."
            />
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-[1.25rem] border border-dashed border-slate-400/20 bg-white/[0.025] p-9 text-center">
              <BookOpen className="mx-auto text-slate-500" size={38} strokeWidth={1.5} />
              <p className="mt-4 text-base font-bold text-white">Nenhuma disciplina encontrada</p>
              <p className="mx-auto mt-2 max-w-md text-[13px] leading-5 text-slate-400">Cadastre uma nova disciplina ou ajuste a busca para visualizar os registros.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((item) => {
                const expanded = expandedId === item.id;
                const editing = editingId === item.id;
                const subjectCount = item.subjects?.[0]?.count || 0;
                const questionCount = item.question_count || 0;

                return (
                  <div
                    key={item.id}
                    className={
                      item.is_active
                        ? "overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.035] shadow-xl shadow-black/20 ring-1 ring-emerald-400/10 transition hover:-translate-y-0.5 hover:border-emerald-300/25 hover:bg-white/[0.055]"
                        : "overflow-hidden rounded-3xl border border-white/[0.06] bg-white/[0.025] opacity-75 shadow-lg shadow-black/20 transition hover:-translate-y-0.5 hover:border-white/[0.10]"
                    }
                  >
                    <button
                      type="button"
                      onClick={() => toggleExpand(item.id)}
                      className="flex w-full items-center justify-between gap-4 p-5 text-left"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-lg font-semibold text-white">
                            {item.name}
                          </p>

                          <span
                            className={
                              item.is_active
                                ? "rounded-full border border-emerald-400/25 bg-emerald-400/[0.12] px-3 py-1 text-xs font-semibold text-emerald-200"
                                : "rounded-full border border-red-400/20 bg-red-500/[0.08] px-3 py-1 text-xs font-semibold text-red-200"
                            }
                          >
                            {item.is_active ? "Ativa" : "Inativa"}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="rounded-full border border-white/[0.08] bg-white/[0.05] px-3 py-1 text-xs font-semibold text-slate-300">
                            {subjectCount} {subjectCount === 1 ? "assunto" : "assuntos"}
                          </span>
                          <span className="rounded-full border border-orange-400/20 bg-orange-500/[0.08] px-3 py-1 text-xs font-bold text-orange-200">
                            {questionCount} {questionCount === 1 ? "questão" : "questões"}
                          </span>
                        </div>
                      </div>

                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.06] text-white/55 shadow-sm">
                        <ChevronDown
                          size={18}
                          className={`transition ${expanded ? "rotate-180 text-orange-500" : ""}`}
                        />
                      </span>
                    </button>

                    {expanded && (
                      <div className="border-t border-white/[0.07] bg-black/15 p-5">
                        {editing ? (
                          <div className="space-y-4">
                            <PremiumInput
          variant="jornada"
                              label="Nome"
                              value={editingName}
                              onChange={(event: ChangeEvent<HTMLInputElement>) => setEditingName(event.target.value)}
                            />

                            <PremiumInput
          variant="jornada"
                              label="Descrição"
                              textarea
                              value={editingDescription}
                              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setEditingDescription(event.target.value)}
                            />

                            <div className="grid gap-2">
                              <PremiumButton onClick={() => saveEdit(item.id)} full disabled={saving}>
                                Salvar alterações
                              </PremiumButton>

                              <PremiumButton variant="dark" onClick={cancelEdit} full disabled={saving}>
                                Cancelar edição
                              </PremiumButton>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-sm leading-6 text-white/55">
                              {item.description || "Sem descrição."}
                            </p>

                            <div className="mt-5 grid gap-3">
                              <ActionButton
                                icon={<Pencil size={15} />}
                                label="Editar"
                                onClick={() => startEdit(item)}
                              />

                              <ActionButton
                                icon={item.is_active ? <EyeOff size={15} /> : <Eye size={15} />}
                                label={item.is_active ? "Inativar" : "Ativar"}
                                onClick={() =>
                                  setConfirm({
                                    title: item.is_active ? "Inativar disciplina" : "Ativar disciplina",
                                    message: item.is_active
                                      ? `Deseja inativar a disciplina "${item.name}"?`
                                      : `Deseja ativar a disciplina "${item.name}"?`,
                                    confirmLabel: item.is_active ? "Inativar" : "Ativar",
                                    onConfirm: () => toggleActive(item),
                                  })
                                }
                              />

                              <ActionButton
                                icon={<BookOpen size={15} />}
                                label="Ver assuntos"
                                onClick={() => {
                                  window.location.href = `/assuntos?disciplina=${item.id}`;
                                }}
                              />

                              <ActionButton
                                danger
                                icon={<Trash2 size={15} />}
                                label="Excluir"
                                onClick={() =>
                                  setConfirm({
                                    title: "Excluir disciplina",
                                    message:
                                      subjectCount > 0
                                        ? `A disciplina "${item.name}" possui ${subjectCount} assunto(s). Não será possível excluir enquanto houver assuntos vinculados.`
                                        : `Deseja realmente excluir a disciplina "${item.name}"? Essa ação não poderá ser desfeita.`,
                                    confirmLabel: "Excluir",
                                    variant: "danger",
                                    onConfirm: () => deleteDiscipline(item.id),
                                  })
                                }
                              />
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </PageBackground>
  );
}

function PremiumFeedback({ feedback }: { feedback: NonNullable<Feedback> }) {
  const config = {
    success: {
      icon: <CheckCircle2 size={20} />,
      className: "border-emerald-400/20 bg-emerald-500/[0.08] text-emerald-200",
    },
    error: {
      icon: <XCircle size={20} />,
      className: "border-red-400/20 bg-red-500/[0.08] text-red-200",
    },
    warning: {
      icon: <AlertTriangle size={20} />,
      className: "border-amber-400/20 bg-amber-500/[0.08] text-amber-200",
    },
  }[feedback.type];

  return (
    <div className={`mb-6 flex items-center gap-3 rounded-[2rem] border p-5 shadow-sm ${config.className}`}>
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.08] shadow-sm">
        {config.icon}
      </div>

      <p className="font-medium">{feedback.message}</p>
    </div>
  );
}

function PremiumConfirm({
  title,
  message,
  confirmLabel,
  variant = "primary",
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  variant?: "danger" | "primary";
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  const [processing, setProcessing] = useState(false);

  async function handleConfirm() {
    if (processing) return;

    setProcessing(true);

    try {
      await onConfirm();
    } finally {
      setProcessing(false);
    }
  }

  return (
    <PremiumModal
      open
      theme="dark"
      tone={variant === "danger" ? "error" : "info"}
      title={title}
      message={message}
      onClose={onCancel}
      dismissible={!processing}
      actions={
        <>
          <PremiumButton variant="dark" onClick={onCancel} disabled={processing}>
            Cancelar
          </PremiumButton>
          <PremiumButton
            variant={variant === "danger" ? "dark-danger" : "dark-primary"}
            onClick={handleConfirm}
            disabled={processing}
            icon={processing ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
          >
            {processing ? "Processando..." : confirmLabel}
          </PremiumButton>
        </>
      }
    />
  );
}

function ActionButton({
  label,
  icon,
  danger,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      className={
        danger
          ? "flex items-center justify-center gap-2 rounded-2xl border border-red-400/20 bg-red-500/[0.06] px-4 py-3 text-sm font-semibold text-red-200 transition hover:border-red-300/35 hover:bg-red-500/[0.12]"
          : "flex items-center justify-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white/65 transition hover:border-orange-400/30 hover:bg-orange-500/[0.08] hover:text-orange-200"
      }
    >
      {icon}
      {label}
    </button>
  );
}
