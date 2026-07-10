"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Edit3,
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
import PageHeader from "../components/ui/PageHeader";
import PremiumButton from "../components/ui/PremiumButton";
import PremiumCard from "../components/ui/PremiumCard";
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

      <PageHeader
        variant="jornada"
        title="Disciplinas"
        description="Organize o banco de questões por disciplinas. Cada disciplina poderá receber vários assuntos."
      />

      {feedback && <PremiumFeedback feedback={feedback} />}

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <PremiumCard
          variant="jornada"
          title="Nova disciplina"
          description="Cadastre disciplinas com nome padronizado."
          icon={<Plus size={18} />}
        >
          <div className="space-y-4">
            <PremiumInput
          variant="jornada"
              label="Nome"
              value={name}
              onChange={(event: any) => setName(event.target.value)}
              placeholder="Ex.: Informática"
            />

            {existingDisciplineWhileTyping && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
                Já existe uma disciplina equivalente: {existingDisciplineWhileTyping.name}
              </div>
            )}

            <PremiumInput
          variant="jornada"
              label="Descrição"
              textarea
              value={description}
              onChange={(event: any) => setDescription(event.target.value)}
              placeholder="Opcional"
            />

            <PremiumButton onClick={handleCreate} full disabled={saving}>
              Cadastrar disciplina
            </PremiumButton>
          </div>
        </PremiumCard>

        <PremiumCard
          variant="jornada"
          title="Disciplinas cadastradas"
          description="Toque ou clique no card para expandir."
          icon={<BookOpen size={18} />}
        >
          <div className="mb-5">
            <PremiumInput
          variant="jornada"
              label="Buscar"
              icon={<Search size={16} />}
              value={search}
              onChange={(event: any) => setSearch(event.target.value)}
              placeholder="Pesquisar disciplina..."
            />
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
              Nenhuma disciplina encontrada.
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
                        ? "overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-sm ring-1 ring-emerald-50 transition hover:-translate-y-0.5 hover:shadow-md"
                        : "overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 shadow-sm opacity-90 transition hover:-translate-y-0.5 hover:shadow-md"
                    }
                  >
                    <button
                      type="button"
                      onClick={() => toggleExpand(item.id)}
                      className="flex w-full items-center justify-between gap-4 p-5 text-left"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-lg font-semibold text-slate-950">
                            {item.name}
                          </p>

                          <span
                            className={
                              item.is_active
                                ? "rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                                : "rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"
                            }
                          >
                            {item.is_active ? "Ativa" : "Inativa"}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                            {subjectCount} {subjectCount === 1 ? "assunto" : "assuntos"}
                          </span>
                          <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700">
                            {questionCount} {questionCount === 1 ? "questão" : "questões"}
                          </span>
                        </div>
                      </div>

                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm">
                        <ChevronDown
                          size={18}
                          className={`transition ${expanded ? "rotate-180 text-orange-500" : ""}`}
                        />
                      </span>
                    </button>

                    {expanded && (
                      <div className="border-t border-slate-100 bg-white/70 p-5">
                        {editing ? (
                          <div className="space-y-4">
                            <PremiumInput
          variant="jornada"
                              label="Nome"
                              value={editingName}
                              onChange={(event: any) => setEditingName(event.target.value)}
                            />

                            <PremiumInput
          variant="jornada"
                              label="Descrição"
                              textarea
                              value={editingDescription}
                              onChange={(event: any) => setEditingDescription(event.target.value)}
                            />

                            <div className="grid gap-2">
                              <PremiumButton onClick={() => saveEdit(item.id)} full disabled={saving}>
                                Salvar alterações
                              </PremiumButton>

                              <PremiumButton variant="secondary" onClick={cancelEdit} full disabled={saving}>
                                Cancelar edição
                              </PremiumButton>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-sm leading-6 text-slate-600">
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
        </PremiumCard>
      </div>
    </PageBackground>
  );
}

function PremiumFeedback({ feedback }: { feedback: NonNullable<Feedback> }) {
  const config = {
    success: {
      icon: <CheckCircle2 size={20} />,
      className: "border-emerald-200 bg-gradient-to-r from-emerald-50 to-white text-emerald-800",
    },
    error: {
      icon: <XCircle size={20} />,
      className: "border-red-200 bg-gradient-to-r from-red-50 to-white text-red-800",
    },
    warning: {
      icon: <AlertTriangle size={20} />,
      className: "border-amber-200 bg-gradient-to-r from-amber-50 to-white text-amber-800",
    },
  }[feedback.type];

  return (
    <div className={`mb-6 flex items-center gap-3 rounded-[2rem] border p-5 shadow-sm ${config.className}`}>
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm">
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
      theme="light"
      tone={variant === "danger" ? "error" : "info"}
      title={title}
      message={message}
      onClose={onCancel}
      dismissible={!processing}
      actions={
        <>
          <PremiumButton variant="secondary" onClick={onCancel} disabled={processing}>
            Cancelar
          </PremiumButton>
          <PremiumButton
            variant={variant === "danger" ? "danger" : "primary"}
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
          ? "flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-600 transition hover:border-red-300 hover:bg-red-50"
          : "flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
      }
    >
      {icon}
      {label}
    </button>
  );
}
