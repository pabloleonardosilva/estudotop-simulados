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
import { useRouter, useSearchParams } from "next/navigation";
import PageBackground from "../components/ui/PageBackground";
import PremiumButton from "../components/ui/PremiumButton";
import PremiumInput from "../components/ui/PremiumInput";
import PremiumSelect from "../components/ui/PremiumSelect";
import PremiumLoadingOverlay from "../components/ui/PremiumLoadingOverlay";
import PremiumModal from "../components/ui/PremiumModal";
import { normalizeComparableName, normalizeEntityName } from "@/lib/utils/text";
import { adminFetch } from "@/lib/supabase/adminFetch";

function normalizeDisplayName(value: string | null | undefined) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (!text) return "";

  const lowerWords = new Set(["a", "as", "o", "os", "e", "em", "no", "na", "nos", "nas", "de", "da", "das", "do", "dos", "para", "por", "com", "sem", "sob", "sobre", "entre"]);
  const acronyms = new Map([
    ["ia", "IA"], ["ti", "TI"], ["api", "API"], ["html", "HTML"], ["css", "CSS"], ["pdf", "PDF"],
    ["usb", "USB"], ["tcp", "TCP"], ["ip", "IP"], ["dns", "DNS"], ["ssd", "SSD"], ["hd", "HD"],
    ["ram", "RAM"], ["rom", "ROM"], ["wifi", "Wi-Fi"], ["wi-fi", "Wi-Fi"], ["macos", "macOS"],
  ]);

  return text.split(" ").map((token, index) => {
    const comparable = token.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (index > 0 && lowerWords.has(comparable)) return comparable;
    if (acronyms.has(comparable)) return acronyms.get(comparable) || token;
    return token
      .toLowerCase()
      .split(/([\-\/])/).map((part) => {
        if (part === "-" || part === "/" || !part) return part;
        const partComparable = part.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        if (acronyms.has(partComparable)) return acronyms.get(partComparable) || part;
        return part.charAt(0).toUpperCase() + part.slice(1);
      }).join("");
  }).join(" ");
}

type Discipline = { id: string; name: string; is_active: boolean };
type Subject = {
  id: string;
  name: string;
  is_active: boolean;
  discipline_id: string | null;
  disciplines: { id: string; name: string } | null;
  questions: { count: number }[];
};
type Feedback = { type: "success" | "error" | "warning"; message: string } | null;
type ConfirmState = {
  title: string;
  message: string;
  confirmLabel: string;
  variant?: "danger" | "primary";
  onConfirm: () => Promise<void> | void;
} | null;

export default function AssuntosClient({
  initialDisciplines,
  initialSubjects,
}: {
  initialDisciplines: Discipline[];
  initialSubjects: Subject[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const disciplineFromUrl = searchParams.get("disciplina");
  const firstDisciplineId = disciplineFromUrl || initialDisciplines[0]?.id || "";

  const [selectedDisciplineId, setSelectedDisciplineId] = useState(firstDisciplineId);
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [subjectsState, setSubjectsState] = useState<Subject[]>(initialSubjects);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 3500);
    return () => clearTimeout(timer);
  }, [feedback]);

  const activeDisciplines = initialDisciplines.filter((item) => item.is_active);
  const selectedDiscipline = initialDisciplines.find((item) => item.id === selectedDisciplineId);

  const subjectsFromSelectedDiscipline = subjectsState.filter(
    (item) => item.discipline_id === selectedDisciplineId
  );

  const normalizedTypingName = normalizeEntityName(name);

  const existingSubjectWhileTyping = normalizedTypingName
    ? subjectsFromSelectedDiscipline.find((item) =>
        normalizeComparableName(item.name) === normalizeComparableName(normalizedTypingName)
      )
    : null;

  const similarSubjectsWhileTyping =
    normalizedTypingName.length >= 2
      ? subjectsFromSelectedDiscipline.filter((item) =>
          item.name.toLowerCase().includes(normalizedTypingName.toLowerCase()) &&
          item.name.toLowerCase() !== normalizedTypingName.toLowerCase()
        )
      : [];

  const filteredSubjects = useMemo(() => {
    const term = search.toLowerCase().trim();

    return subjectsState.filter((item) => {
      const matchesDiscipline = item.discipline_id === selectedDisciplineId;
      const matchesSearch = !term || item.name.toLowerCase().includes(term);
      return matchesDiscipline && matchesSearch;
    });
  }, [subjectsState, search, selectedDisciplineId]);

  async function requestJson(url: string, options: RequestInit) {
    const response = await adminFetch(url, options);
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.message || "Não foi possível concluir a operação.");
    return result;
  }

  async function handleCreate() {
    const normalized = normalizeEntityName(name);

    if (!selectedDisciplineId) {
      setFeedback({ type: "error", message: "Selecione uma disciplina para cadastrar o assunto." });
      return;
    }

    if (!normalized) {
      setFeedback({ type: "error", message: "Informe um assunto válido." });
      return;
    }

    if (existingSubjectWhileTyping) {
      setFeedback({ type: "error", message: `O assunto "${normalizeDisplayName(existingSubjectWhileTyping.name)}" já existe nesta disciplina.` });
      return;
    }

    setSaving(true);

    try {
      const result = await requestJson("/api/admin/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: normalized, discipline_id: selectedDisciplineId }),
      });

      if (result.subject) {
        setSubjectsState((current) => [...current, { ...result.subject, questions: [{ count: 0 }], disciplines: selectedDiscipline ? { id: selectedDiscipline.id, name: selectedDiscipline.name } : null }]);
      }
      setFeedback({ type: "success", message: result.message || "Assunto cadastrado com sucesso." });
      setName("");
      router.refresh();
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro ao cadastrar assunto." });
    } finally {
      setSaving(false);
    }
  }

  function startEdit(item: Subject) {
    setExpandedId(item.id);
    setEditingId(item.id);
    setEditingName(item.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName("");
  }

  async function saveEdit(item: Subject) {
    const normalized = normalizeEntityName(editingName);
    if (!normalized) {
      setFeedback({ type: "error", message: "Informe um assunto válido." });
      return;
    }

    setSaving(true);
    try {
      const result = await requestJson("/api/admin/subjects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, name: normalized, discipline_id: item.discipline_id }),
      });

      if (result.subject) {
        setSubjectsState((current) => current.map((subject) => subject.id === item.id ? { ...subject, name: result.subject.name, discipline_id: result.subject.discipline_id ?? subject.discipline_id } : subject));
      } else {
        setSubjectsState((current) => current.map((subject) => subject.id === item.id ? { ...subject, name: normalized } : subject));
      }
      setFeedback({ type: "success", message: result.message || "Assunto atualizado com sucesso." });
      cancelEdit();
      router.refresh();
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro ao atualizar assunto." });
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item: Subject) {
    setSaving(true);
    try {
      const result = await requestJson("/api/admin/subjects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, discipline_id: item.discipline_id, is_active: !item.is_active }),
      });

      setSubjectsState((current) => current.map((subject) => subject.id === item.id ? { ...subject, is_active: !item.is_active } : subject));
      setFeedback({ type: "success", message: result.message || "Status do assunto atualizado." });
      router.refresh();
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro ao alterar status." });
    } finally {
      setSaving(false);
      setConfirm(null);
    }
  }

  async function deleteSubject(id: string) {
    setSaving(true);
    try {
      const result = await requestJson(`/api/admin/subjects?id=${id}`, { method: "DELETE" });
      setSubjectsState((current) => current.filter((subject) => subject.id !== id));
      setFeedback({ type: "success", message: result.message || "Assunto excluído com sucesso." });
      router.refresh();
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro ao excluir assunto." });
    } finally {
      setSaving(false);
      setConfirm(null);
    }
  }

  return (
    <PageBackground variant="jornada">
      <PremiumLoadingOverlay show={saving && !confirm} title="Processando..." message="Aguarde enquanto o sistema conclui esta ação." />

      {confirm && <PremiumConfirm {...confirm} onCancel={() => setConfirm(null)} />}

      {feedback && <PremiumFeedback feedback={feedback} />}

      <section className="et-admin-dark-hero mb-8 min-h-[190px] px-6 py-8 sm:px-8 lg:px-10">
        <div className="relative flex min-h-[126px] items-center justify-between gap-8">
          <div>
            <p className="et-admin-dark-label text-orange-400">EstudoTOP Simulados</p>
            <h1 className="et-admin-dark-page-title mt-3">Assuntos</h1>
            <p className="et-admin-dark-text mt-4 max-w-2xl">Cadastre assuntos dentro de cada disciplina para organizar o banco de questões.</p>
          </div>
          <div className="et-admin-dark-icon-box et-admin-dark-icon-box-orange hidden !h-20 !w-20 !rounded-[1.5rem] sm:flex">
            <BookOpen size={34} strokeWidth={1.7} />
          </div>
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(280px,30%)_minmax(0,70%)]">
        <section className="et-admin-dark-panel p-5 sm:p-7">
          <div className="mb-7 flex items-start gap-4">
            <div className="et-admin-dark-icon-box et-admin-dark-icon-box-orange"><Plus size={20} strokeWidth={2.4} /></div>
            <div><h2 className="et-admin-dark-section-title">Novo assunto</h2><p className="et-admin-dark-muted mt-1.5">O sistema verifica duplicidade enquanto você digita.</p></div>
          </div>
          <div className="space-y-5">
            <PremiumSelect variant="jornada" label="Disciplina" value={selectedDisciplineId} onChange={(event: ChangeEvent<HTMLSelectElement>) => setSelectedDisciplineId(event.target.value)}>
              {activeDisciplines.length === 0 ? <option value="">Nenhuma disciplina ativa</option> : activeDisciplines.map((discipline) => (
                <option key={discipline.id} value={discipline.id}>{discipline.name}</option>
              ))}
            </PremiumSelect>

            <PremiumInput variant="jornada" label="Nome do assunto" value={name} onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)} placeholder="Ex.: Microsoft Windows" />

            {existingSubjectWhileTyping && (
              <div className="rounded-2xl border border-red-400/20 bg-red-500/[0.08] p-4 text-sm font-medium text-red-200">
                Já existe um assunto com esse nome nesta disciplina: {normalizeDisplayName(existingSubjectWhileTyping.name)}
              </div>
            )}

            {!existingSubjectWhileTyping && similarSubjectsWhileTyping.length > 0 && (
              <div className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.08] p-4 text-sm text-amber-100">
                <p className="font-semibold">Assuntos parecidos encontrados:</p>
                <ul className="mt-2 list-inside list-disc">
                  {similarSubjectsWhileTyping.slice(0, 4).map((item) => <li key={item.id}>{normalizeDisplayName(item.name)}</li>)}
                </ul>
              </div>
            )}

            <PremiumButton
              onClick={handleCreate}
              full
              variant="dark-primary"
              icon={<Plus size={17} strokeWidth={2.6} />}
              disabled={saving || !selectedDisciplineId || Boolean(existingSubjectWhileTyping)}
            >
              Cadastrar assunto
            </PremiumButton>
          </div>
        </section>

        <section className="et-admin-dark-panel min-w-0 p-5 sm:p-7">
          <div className="mb-7 flex items-start gap-4">
            <div className="et-admin-dark-icon-box et-admin-dark-icon-box-orange"><BookOpen size={20} strokeWidth={2.2} /></div>
            <div className="min-w-0"><h2 className="et-admin-dark-section-title">Assuntos cadastrados</h2><p className="et-admin-dark-muted mt-1.5 truncate">{selectedDiscipline ? `Disciplina selecionada: ${selectedDiscipline.name}` : "Selecione uma disciplina."}</p></div>
          </div>
          <div className="et-admin-dark-card mb-6 grid gap-4 p-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <PremiumSelect variant="jornada" label="Filtrar por disciplina" value={selectedDisciplineId} onChange={(event: ChangeEvent<HTMLSelectElement>) => setSelectedDisciplineId(event.target.value)}>
              {initialDisciplines.map((discipline) => (
                <option key={discipline.id} value={discipline.id}>{discipline.name}{!discipline.is_active ? " (inativa)" : ""}</option>
              ))}
            </PremiumSelect>

            <PremiumInput variant="jornada" label="Buscar" icon={<Search size={16} />} value={search} onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)} placeholder="Pesquisar assunto..." />
          </div>

          {filteredSubjects.length === 0 ? (
            <div className="rounded-[1.25rem] border border-dashed border-slate-400/20 bg-white/[0.025] p-9 text-center">
              <BookOpen className="mx-auto text-slate-500" size={38} strokeWidth={1.5} />
              <p className="mt-4 text-base font-bold text-white">Nenhum assunto encontrado</p>
              <p className="mx-auto mt-2 max-w-md text-[13px] leading-5 text-slate-400">Cadastre um novo assunto ou ajuste os filtros para visualizar os registros.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredSubjects.map((item) => {
                const expanded = item.id === expandedId;
                const editing = item.id === editingId;
                const questionCount = item.questions?.[0]?.count || 0;
                const displayName = normalizeDisplayName(item.name);
                const disciplineDisplayName = normalizeDisplayName(item.disciplines?.name);

                return (
                  <div key={item.id} className={`et-admin-dark-list-card overflow-hidden transition hover:-translate-y-0.5 hover:border-white/[0.12] ${item.is_active ? "" : "opacity-70"}`}>
                    <button type="button" onClick={() => setExpandedId(expanded ? null : item.id)} className="flex w-full items-center justify-between gap-4 p-5 text-left">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="et-admin-dark-card-title truncate text-base" title={displayName}>{displayName}</p>
                          <span className={`et-admin-dark-badge ${item.is_active ? "et-admin-dark-badge-success" : "et-admin-dark-badge-neutral"}`}>
                            {item.is_active ? "Ativo" : "Inativo"}
                          </span>
                        </div>
                        <p className="et-admin-dark-muted mt-2">{questionCount} {questionCount === 1 ? "questão" : "questões"}</p>
                      </div>
                      <span className="et-admin-dark-button-outline flex h-9 w-9 shrink-0 items-center justify-center !rounded-xl">
                        <ChevronDown size={18} className={`transition ${expanded ? "rotate-180 text-orange-500" : ""}`} />
                      </span>
                    </button>

                    {expanded && (
                      <div className="border-t border-white/[0.07] bg-black/15 p-5">
                        {editing ? (
                          <div className="space-y-4">
                            <PremiumInput variant="jornada" label="Nome" value={editingName} onChange={(event: ChangeEvent<HTMLInputElement>) => setEditingName(event.target.value)} />
                            <div className="grid gap-2">
                              <PremiumButton variant="dark-primary" onClick={() => saveEdit(item)} full disabled={saving}>Salvar alterações</PremiumButton>
                              <PremiumButton variant="dark" onClick={cancelEdit} full disabled={saving}>Cancelar edição</PremiumButton>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-sm leading-6 text-white/55">Disciplina: {disciplineDisplayName || "Sem disciplina vinculada"}</p>
                            <div className="mt-5 grid gap-3">
                              <ActionButton icon={<Pencil size={15} />} label="Editar" onClick={() => startEdit(item)} />
                              <ActionButton icon={item.is_active ? <EyeOff size={15} /> : <Eye size={15} />} label={item.is_active ? "Inativar" : "Ativar"} onClick={() => setConfirm({ title: item.is_active ? "Inativar assunto" : "Ativar assunto", message: item.is_active ? `Deseja inativar o assunto "${displayName}"?` : `Deseja ativar o assunto "${displayName}"?`, confirmLabel: item.is_active ? "Inativar" : "Ativar", onConfirm: () => toggleActive(item) })} />
                              <ActionButton danger icon={<Trash2 size={15} />} label="Excluir" onClick={() => setConfirm({ title: "Excluir assunto", message: questionCount > 0 ? `O assunto "${displayName}" possui ${questionCount} questão(ões). Não será possível excluir enquanto houver questões vinculadas.` : `Deseja realmente excluir o assunto "${displayName}"? Essa ação não poderá ser desfeita.`, confirmLabel: "Excluir", variant: "danger", onConfirm: () => deleteSubject(item.id) })} />
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
    success: { icon: <CheckCircle2 size={20} />, className: "border-emerald-400/20 bg-emerald-500/[0.08] text-emerald-200" },
    error: { icon: <XCircle size={20} />, className: "border-red-400/20 bg-red-500/[0.08] text-red-200" },
    warning: { icon: <AlertTriangle size={20} />, className: "border-amber-400/20 bg-amber-500/[0.08] text-amber-200" },
  }[feedback.type];

  return <div className={`mb-6 flex items-center gap-3 rounded-[2rem] border p-5 shadow-sm ${config.className}`}><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.08] shadow-sm">{config.icon}</div><p className="font-medium">{feedback.message}</p></div>;
}

function PremiumConfirm({ title, message, confirmLabel, variant = "primary", onCancel, onConfirm }: { title: string; message: string; confirmLabel: string; variant?: "danger" | "primary"; onCancel: () => void; onConfirm: () => Promise<void> | void }) {
  const [processing, setProcessing] = useState(false);
  async function handleConfirm() {
    if (processing) return;
    setProcessing(true);
    try { await onConfirm(); } finally { setProcessing(false); }
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

function ActionButton({ label, icon, danger, onClick }: { label: string; icon: React.ReactNode; danger?: boolean; onClick: () => void }) {
  return <PremiumButton variant={danger ? "dark-danger" : "dark"} icon={icon} onClick={onClick} full>{label}</PremiumButton>;
}
