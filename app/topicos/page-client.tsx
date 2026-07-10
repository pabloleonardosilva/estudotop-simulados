"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Check, ChevronDown, Eye, EyeOff, Pencil, Plus, Search, Tags, Trash2 } from "lucide-react";
import PageBackground from "../components/ui/PageBackground";
import PageHeader from "../components/ui/PageHeader";
import PremiumButton from "../components/ui/PremiumButton";
import PremiumCard from "../components/ui/PremiumCard";
import PremiumInput from "../components/ui/PremiumInput";
import PremiumLoadingOverlay from "../components/ui/PremiumLoadingOverlay";
import PremiumModal from "../components/ui/PremiumModal";
import {
  PremiumTable,
  PremiumTableBody,
  PremiumTableCell,
  PremiumTableHead,
  PremiumTableHeader,
  PremiumTableRow,
} from "../components/ui/PremiumTable";
import { normalizeTopicComparableName, normalizeTopicName } from "@/lib/utils/text";
import { adminFetch } from "@/lib/supabase/adminFetch";

type Discipline = { id: string; name: string; is_active: boolean };
type Subject = { id: string; name: string; discipline_id: string | null; is_active: boolean };
type Topic = {
  id: string;
  name: string;
  normalized_name: string;
  subject_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  usage_count: number;
};
type Feedback = { tone: "success" | "error" | "warning"; title: string; message: string } | null;
type AffectedQuestion = { id: string; code: string };
type Confirmation =
  | { topic: Topic; action: "status" | "delete" }
  | { topic: Topic; action: "rename"; nextName: string; affectedQuestions: AffectedQuestion[] }
  | null;

export default function TopicosClient({
  initialDisciplines,
  initialSubjects,
  initialTopics,
}: {
  initialDisciplines: Discipline[];
  initialSubjects: Subject[];
  initialTopics: Topic[];
}) {
  const firstDisciplineId = initialDisciplines.find((item) => item.is_active)?.id || initialDisciplines[0]?.id || "";
  const firstSubjectId = initialSubjects.find((item) => item.discipline_id === firstDisciplineId && item.is_active)?.id
    || initialSubjects.find((item) => item.discipline_id === firstDisciplineId)?.id
    || "";
  const [disciplineId, setDisciplineId] = useState(firstDisciplineId);
  const [subjectId, setSubjectId] = useState(firstSubjectId);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [topics, setTopics] = useState(initialTopics);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);

  const subjects = useMemo(
    () => initialSubjects.filter((item) => item.discipline_id === disciplineId),
    [disciplineId, initialSubjects],
  );

  function selectDiscipline(nextDisciplineId: string) {
    const nextSubjects = initialSubjects.filter((item) => item.discipline_id === nextDisciplineId);
    setDisciplineId(nextDisciplineId);
    setSubjectId(nextSubjects.find((item) => item.is_active)?.id || nextSubjects[0]?.id || "");
  }

  const selectedDiscipline = initialDisciplines.find((item) => item.id === disciplineId);
  const selectedSubject = initialSubjects.find((item) => item.id === subjectId);
  const normalizedName = normalizeTopicName(name);
  const duplicate = normalizedName
    ? topics.find((topic) => topic.subject_id === subjectId && normalizeTopicComparableName(topic.name) === normalizeTopicComparableName(normalizedName))
    : null;

  const filteredTopics = useMemo(() => {
    const term = search.trim().toLowerCase();
    return topics.filter((topic) => topic.subject_id === subjectId && (!term || topic.name.toLowerCase().includes(term)));
  }, [search, subjectId, topics]);

  async function requestJson(url: string, options: RequestInit) {
    const response = await adminFetch(url, options);
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.message || "Não foi possível concluir a operação.");
    return result;
  }

  async function createTopic() {
    if (!subjectId) {
      setFeedback({ tone: "error", title: "Assunto obrigatório", message: "Selecione um assunto para cadastrar o tópico." });
      return;
    }
    if (normalizedName.length < 2) {
      setFeedback({ tone: "error", title: "Tópico inválido", message: "Informe um nome válido para o tópico." });
      return;
    }
    if (duplicate) {
      setFeedback({ tone: "warning", title: "Tópico já cadastrado", message: `O tópico "${duplicate.name}" já existe neste assunto.` });
      return;
    }

    setSaving(true);
    try {
      const result = await requestJson("/api/admin/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: normalizedName, subject_id: subjectId }),
      });
      setTopics((current) => [...current, { ...result.topic, usage_count: 0 }]);
      setName("");
      setFeedback({ tone: "success", title: "Tópico cadastrado", message: result.message });
    } catch (error) {
      setFeedback({ tone: "error", title: "Não foi possível cadastrar", message: error instanceof Error ? error.message : "Erro inesperado." });
    } finally {
      setSaving(false);
    }
  }

  async function saveTopic(topic: Topic, confirmQuestionUpdate = false, requestedName = editingName) {
    const normalized = normalizeTopicName(requestedName);
    if (normalized.length < 2) {
      setFeedback({ tone: "error", title: "Tópico inválido", message: "Informe um nome válido para o tópico." });
      return;
    }

    setSaving(true);
    try {
      const response = await adminFetch("/api/admin/topics", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: topic.id,
          name: normalized,
          subject_id: topic.subject_id,
          confirm_question_update: confirmQuestionUpdate,
        }),
      });
      const result = await response.json();

      if (response.status === 409 && result.requires_confirmation) {
        setConfirmation({
          topic,
          action: "rename",
          nextName: normalized,
          affectedQuestions: result.affected_questions || [],
        });
        return;
      }

      if (!response.ok || !result.ok) throw new Error(result.message || "Não foi possível atualizar o tópico.");

      setTopics((current) => current.map((item) => item.id === topic.id ? { ...item, ...result.topic } : item));
      setEditingId(null);
      setEditingName("");
      setConfirmation(null);
      setFeedback({ tone: "success", title: "Tópico atualizado", message: result.message });
    } catch (error) {
      setFeedback({ tone: "error", title: "Não foi possível atualizar", message: error instanceof Error ? error.message : "Erro inesperado." });
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(topic: Topic) {
    setSaving(true);
    try {
      const result = await requestJson("/api/admin/topics", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: topic.id, is_active: !topic.is_active }),
      });
      setTopics((current) => current.map((item) => item.id === topic.id ? { ...item, ...result.topic } : item));
      setFeedback({ tone: "success", title: "Status atualizado", message: result.message });
    } catch (error) {
      setFeedback({ tone: "error", title: "Não foi possível atualizar", message: error instanceof Error ? error.message : "Erro inesperado." });
    } finally {
      setSaving(false);
      setConfirmation(null);
    }
  }

  async function deleteTopic(topic: Topic) {
    setSaving(true);
    try {
      const result = await requestJson(`/api/admin/topics?id=${topic.id}`, { method: "DELETE" });
      setTopics((current) => current.filter((item) => item.id !== topic.id));
      setFeedback({ tone: "success", title: "Tópico excluído", message: result.message });
    } catch (error) {
      setFeedback({ tone: "error", title: "Não foi possível excluir", message: error instanceof Error ? error.message : "Erro inesperado." });
    } finally {
      setSaving(false);
      setConfirmation(null);
    }
  }

  function confirmationTitle() {
    if (!confirmation) return "Confirmar ação";
    if (confirmation.action === "delete") return "Excluir tópico";
    if (confirmation.action === "rename") return "Atualizar questões vinculadas";
    return confirmation.topic.is_active ? "Inativar tópico" : "Ativar tópico";
  }

  function confirmationMessage() {
    if (!confirmation) return "";
    if (confirmation.action === "delete") return `Confirma a exclusão de "${confirmation.topic.name}"?`;
    if (confirmation.action === "rename") {
      const codes = confirmation.affectedQuestions.map((question) => question.code).join(", ");
      return `${confirmation.affectedQuestions.length} ${confirmation.affectedQuestions.length === 1 ? "questão utiliza" : "questões utilizam"} este tópico (${codes}). Ao confirmar, o nome também será alterado nessas questões.`;
    }
    return `Confirma a alteração de status de "${confirmation.topic.name}"?`;
  }

  function confirmAction() {
    if (!confirmation) return;
    if (confirmation.action === "delete") {
      deleteTopic(confirmation.topic);
      return;
    }
    if (confirmation.action === "rename") {
      saveTopic(confirmation.topic, true, confirmation.nextName);
      return;
    }
    changeStatus(confirmation.topic);
  }

  return (
    <PageBackground variant="jornada">
      <PremiumLoadingOverlay show={saving} title="Processando..." message="Aguarde enquanto o sistema conclui esta ação." />

      <PremiumModal
        open={Boolean(feedback)}
        tone={feedback?.tone || "info"}
        title={feedback?.title || "Aviso"}
        message={feedback?.message}
        onClose={() => setFeedback(null)}
      />

      <PremiumModal
        open={Boolean(confirmation)}
        tone={confirmation?.action === "delete" || confirmation?.action === "rename" ? "warning" : "info"}
        title={confirmationTitle()}
        message={confirmationMessage()}
        onClose={() => setConfirmation(null)}
        actions={confirmation && (
          <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <PremiumButton variant="dark" onClick={() => setConfirmation(null)}>Cancelar</PremiumButton>
            <PremiumButton
              variant={confirmation.action === "delete" ? "dark-danger" : "dark-primary"}
              onClick={confirmAction}
            >
              Confirmar
            </PremiumButton>
          </div>
        )}
      />

      <PageHeader
        variant="jornada"
        title="Tópicos"
        description="Organize os tópicos específicos dentro de cada assunto do banco de questões."
      />

      <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
        <PremiumCard variant="jornada" title="Novo tópico" description="Os nomes são normalizados e verificados dentro do assunto." icon={<Plus size={18} />}>
          <div className="space-y-4">
            <SimpleSelectDropdown
              label="Disciplina"
              value={disciplineId}
              onChange={selectDiscipline}
              options={initialDisciplines.map((discipline) => ({ value: discipline.id, label: `${discipline.name}${!discipline.is_active ? " (inativa)" : ""}` }))}
            />

            <SimpleSelectDropdown
              label="Assunto"
              value={subjectId}
              onChange={setSubjectId}
              options={subjects.length === 0
                ? [{ value: "", label: "Nenhum assunto cadastrado" }]
                : subjects.map((subject) => ({ value: subject.id, label: `${subject.name}${!subject.is_active ? " (inativo)" : ""}` }))}
            />

            <PremiumInput variant="jornada" label="Nome do tópico" value={name} onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)} placeholder="Ex.: Barra de tarefas" />

            {duplicate && (
              <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.08] p-4 text-sm font-medium text-amber-100">
                Já existe neste assunto: {duplicate.name}
              </div>
            )}

            <PremiumButton full icon={<Plus size={17} />} onClick={createTopic} disabled={saving || !subjectId || Boolean(duplicate)}>
              Cadastrar tópico
            </PremiumButton>
          </div>
        </PremiumCard>

        <PremiumCard
          variant="jornada"
          title="Tópicos cadastrados"
          description={selectedSubject ? `${selectedDiscipline?.name || "Disciplina"} · ${selectedSubject.name}` : "Selecione um assunto."}
          icon={<Tags size={18} />}
        >
          <div className="mb-5 grid gap-4 md:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.2fr)]">
            <SimpleSelectDropdown
              label="Filtrar por assunto"
              value={subjectId}
              onChange={setSubjectId}
              options={subjects.map((subject) => ({ value: subject.id, label: subject.name }))}
            />
            <PremiumInput variant="jornada" label="Buscar" icon={<Search size={16} />} value={search} onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)} placeholder="Pesquisar tópico..." />
          </div>

          {filteredTopics.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-9 text-center">
              <Tags className="mx-auto text-white/25" size={30} />
              <p className="mt-3 text-sm font-semibold text-white/50">Nenhum tópico encontrado neste assunto.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl [&_table]:min-w-[760px]">
              <PremiumTable variant="jornada">
                <PremiumTableHead variant="jornada">
                  <tr>
                    <PremiumTableHeader variant="jornada">Tópico</PremiumTableHeader>
                    <PremiumTableHeader variant="jornada">Status</PremiumTableHeader>
                    <PremiumTableHeader variant="jornada">Uso</PremiumTableHeader>
                    <PremiumTableHeader variant="jornada" align="right">Ações</PremiumTableHeader>
                  </tr>
                </PremiumTableHead>
                <PremiumTableBody variant="jornada">
                  {filteredTopics.map((topic, index) => {
                    const editing = editingId === topic.id;
                    return (
                      <PremiumTableRow key={topic.id} index={index} variant="jornada">
                        <PremiumTableCell variant="jornada">
                          {editing ? (
                            <PremiumInput variant="jornada" value={editingName} onChange={(event: ChangeEvent<HTMLInputElement>) => setEditingName(event.target.value)} />
                          ) : (
                            <span className="font-semibold text-white/90">{topic.name}</span>
                          )}
                        </PremiumTableCell>
                        <PremiumTableCell variant="jornada">
                          <span className={topic.is_active ? "inline-flex rounded-full border border-emerald-500/25 bg-emerald-500/[0.12] px-2.5 py-1 text-xs font-semibold text-emerald-300" : "inline-flex rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-semibold text-white/40"}>
                            {topic.is_active ? "Ativo" : "Inativo"}
                          </span>
                        </PremiumTableCell>
                        <PremiumTableCell variant="jornada">
                          <span className="font-semibold text-white/70">{topic.usage_count}</span>
                          <span className="ml-1 text-xs text-white/40">{topic.usage_count === 1 ? "questão" : "questões"}</span>
                        </PremiumTableCell>
                        <PremiumTableCell variant="jornada" align="right">
                          <div className="flex justify-end gap-2">
                            {editing ? (
                              <>
                                <PremiumButton variant="dark" className="px-3 py-2 text-xs" onClick={() => { setEditingId(null); setEditingName(""); }}>Cancelar</PremiumButton>
                                <PremiumButton className="px-3 py-2 text-xs" onClick={() => saveTopic(topic)}>Salvar</PremiumButton>
                              </>
                            ) : (
                              <>
                                <PremiumButton variant="dark" className="px-3 py-2 text-xs" icon={<Pencil size={14} />} onClick={() => { setEditingId(topic.id); setEditingName(topic.name); }}>Editar</PremiumButton>
                                <PremiumButton variant="dark-warning" className="px-3 py-2 text-xs" icon={topic.is_active ? <EyeOff size={14} /> : <Eye size={14} />} onClick={() => setConfirmation({ topic, action: "status" })}>
                                  {topic.is_active ? "Inativar" : "Ativar"}
                                </PremiumButton>
                                <PremiumButton variant="dark-danger" className="px-3 py-2 text-xs" icon={<Trash2 size={14} />} onClick={() => setConfirmation({ topic, action: "delete" })}>Excluir</PremiumButton>
                              </>
                            )}
                          </div>
                        </PremiumTableCell>
                      </PremiumTableRow>
                    );
                  })}
                </PremiumTableBody>
              </PremiumTable>
            </div>
          )}
        </PremiumCard>
      </div>
    </PageBackground>
  );
}

function SimpleSelectDropdown({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const currentLabel = options.find((o) => o.value === value)?.label ?? options[0]?.label ?? label;
  const isFiltered = value !== "";

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="group flex h-12 w-full items-center justify-between rounded-2xl border border-white/[0.08] bg-[#0D1926] px-4 text-left text-sm font-semibold text-white/80 outline-none transition hover:border-white/[0.15]"
      >
        <span className={`truncate ${isFiltered ? "text-white/90" : ""}`}>{currentLabel}</span>
        <span className="flex items-center gap-2">
          {isFiltered && <span className="h-2 w-2 rounded-full bg-orange-500" />}
          <ChevronDown
            size={16}
            className={`text-white/30 transition duration-200 group-hover:text-orange-400 ${open ? "rotate-180 text-orange-400" : ""}`}
          />
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-[9999] mt-2 w-full rounded-2xl border border-white/[0.09] bg-[#0D1B2E] p-2 shadow-2xl shadow-black/50 backdrop-blur-xl">
          <div className="max-h-72 space-y-0.5 overflow-y-auto">
            {options.map((opt) => {
              const selected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className={
                    selected
                      ? "flex w-full items-center justify-between rounded-xl border border-orange-500/30 bg-orange-500/[0.12] px-4 py-2.5 text-left text-sm font-semibold text-orange-100"
                      : "flex w-full items-center rounded-xl border border-transparent px-4 py-2.5 text-left text-sm font-semibold text-white/60 hover:border-white/[0.07] hover:bg-white/[0.04] hover:text-white/80"
                  }
                >
                  <span className="flex-1 text-left">{opt.label}</span>
                  {selected && <Check size={14} className="shrink-0 text-orange-400" strokeWidth={3} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
