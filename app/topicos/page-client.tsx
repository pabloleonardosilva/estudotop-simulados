"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Check, ChevronDown, Eye, EyeOff, FileQuestion, ListTree, Pencil, Plus, Search, Tags, Trash2 } from "lucide-react";
import PageBackground from "../components/ui/PageBackground";
import PremiumButton from "../components/ui/PremiumButton";
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
type TopicQuestion = { id: string; code: string; status: string };
type Topic = {
  id: string;
  name: string;
  normalized_name: string;
  subject_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  usage_count: number;
  questions: TopicQuestion[];
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
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);

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
      setTopics((current) => [...current, { ...result.topic, usage_count: 0, questions: [] }]);
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

  function questionStatusLabel(status: string) {
    if (status === "pending_review") return "Em revisão";
    if (status === "ready_to_publish") return "Pronta para publicação";
    if (status === "published" || status === "active") return "Publicada";
    if (status === "archived") return "Arquivada";
    if (status === "annulled") return "Anulada";
    return "Rascunho";
  }

  const refreshQuestionTopicUsage = useCallback(async (questionId: string) => {
    const response = await adminFetch(`/api/admin/questions/${questionId}`, { method: "GET" });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.message || "Não foi possível atualizar a questão.");
    const question = result.question as { id: string; code?: string | null; status?: string | null; subject_id?: string | null; evaluated_topics?: string[] | null };
    const evaluatedTopics = Array.isArray(question.evaluated_topics) ? question.evaluated_topics : [];

    setTopics((current) => current.map((topic) => {
      const belongs = topic.subject_id === question.subject_id
        && evaluatedTopics.some((name) => normalizeTopicComparableName(name) === normalizeTopicComparableName(topic.name));
      const withoutQuestion = topic.questions.filter((item) => item.id !== questionId);
      const questions = belongs
        ? [...withoutQuestion, { id: questionId, code: question.code || questionId.slice(0, 8), status: question.status || "draft" }]
          .sort((left, right) => left.code.localeCompare(right.code, "pt-BR", { numeric: true }))
        : withoutQuestion;
      return { ...topic, questions, usage_count: questions.length };
    }));

    setSelectedTopic((current) => {
      if (!current) return null;
      const belongs = current.subject_id === question.subject_id
        && evaluatedTopics.some((name) => normalizeTopicComparableName(name) === normalizeTopicComparableName(current.name));
      const withoutQuestion = current.questions.filter((item) => item.id !== questionId);
      const questions = belongs
        ? [...withoutQuestion, { id: questionId, code: question.code || questionId.slice(0, 8), status: question.status || "draft" }]
          .sort((left, right) => left.code.localeCompare(right.code, "pt-BR", { numeric: true }))
        : withoutQuestion;
      return { ...current, questions, usage_count: questions.length };
    });
  }, []);

  function closeTopicQuestions() {
    setSelectedTopic(null);
  }

  useEffect(() => {
    if (!selectedTopic) return;
    function handleQuestionSaved(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.source !== "estudotop-question-popup" || event.data?.type !== "question-saved") return;
      if (typeof event.data.questionId !== "string") return;
      void refreshQuestionTopicUsage(event.data.questionId).catch((error) => {
        setFeedback({ tone: "error", title: "Não foi possível atualizar", message: error instanceof Error ? error.message : "Erro inesperado." });
      });
    }
    window.addEventListener("message", handleQuestionSaved);
    return () => window.removeEventListener("message", handleQuestionSaved);
  }, [selectedTopic, refreshQuestionTopicUsage]);

  return (
    <PageBackground variant="jornada">
      <PremiumLoadingOverlay show={saving} title="Processando..." message="Aguarde enquanto o sistema conclui esta ação." />

      <PremiumModal
        open={Boolean(feedback)}
        theme="dark"
        tone={feedback?.tone || "info"}
        title={feedback?.title || "Aviso"}
        message={feedback?.message}
        onClose={() => setFeedback(null)}
      />

      <PremiumModal
        open={Boolean(confirmation)}
        theme="dark"
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

      <PremiumModal
        open={Boolean(selectedTopic)}
        theme="dark"
        size="wide"
        tone="info"
        title={selectedTopic?.name || "Questões do tópico"}
        message={selectedTopic ? `${selectedTopic.usage_count} ${selectedTopic.usage_count === 1 ? "questão vinculada" : "questões vinculadas"} a este tópico.` : undefined}
        onClose={closeTopicQuestions}
        actions={(
          <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <PremiumButton variant="dark" onClick={closeTopicQuestions}>Fechar</PremiumButton>
            {selectedTopic?.usage_count === 0 && (
              <PremiumButton
                variant="dark-danger"
                icon={<Trash2 size={14} />}
                onClick={() => {
                  setConfirmation({ topic: selectedTopic, action: "delete" });
                  setSelectedTopic(null);
                }}
              >
                Excluir tópico
              </PremiumButton>
            )}
          </div>
        )}
      >
        {selectedTopic && selectedTopic.questions.length > 0 ? (
          <div className="max-h-[72vh] space-y-6 overflow-y-auto pr-2">
            {selectedTopic.questions.map((question) => (
              <div key={question.id} className="overflow-hidden rounded-3xl border border-white/[0.1] bg-[#07111F]">
                <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-3">
                  <p className="font-semibold text-white">{question.code}</p>
                  <p className="text-xs font-medium text-white/45">{questionStatusLabel(question.status)}</p>
                </div>
                <iframe
                  src={`/questoes/${question.id}/editar?popup=1`}
                  loading="lazy"
                  className="h-[70vh] min-h-[640px] w-full bg-[#07111F]"
                  title={`Editar questão ${question.code}`}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-6 text-center text-sm font-semibold text-white/50">
            Este tópico não está vinculado a nenhuma questão e pode ser excluído.
          </div>
        )}
      </PremiumModal>

      <section className="relative mb-8 min-h-[170px] overflow-hidden rounded-[2rem] border border-white/[0.08] bg-[linear-gradient(115deg,rgba(255,122,0,0.11)_0%,rgba(12,30,52,0.94)_48%,rgba(2,8,23,0.98)_100%)] px-6 py-8 shadow-[0_24px_80px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] sm:px-8 lg:px-10">
        <div className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full bg-blue-500/[0.10] blur-3xl" />
        <div className="pointer-events-none absolute -left-20 bottom-[-8rem] h-64 w-64 rounded-full bg-orange-500/[0.12] blur-3xl" />
        <div className="relative flex min-h-[106px] items-center justify-between gap-8">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-orange-400">EstudoTOP Simulados</p>
            <h1 className="mt-3 text-[34px] font-bold leading-[1.05] tracking-[-0.04em] text-white sm:text-[40px]">Tópicos</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              Organize os tópicos específicos dentro de cada assunto do banco de questões.
            </p>
          </div>
          <div className="hidden h-20 w-20 shrink-0 items-center justify-center rounded-[1.6rem] border border-orange-400/25 bg-orange-500/[0.10] text-orange-300 shadow-[0_0_48px_rgba(249,115,22,0.16)] sm:flex">
            <ListTree size={34} strokeWidth={1.7} />
          </div>
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="relative isolate rounded-[1.75rem] border border-white/[0.08] bg-[#0C1E34]/70 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.30)] backdrop-blur-xl sm:p-7">
          <div className="pointer-events-none absolute -inset-0.5 -z-10 rounded-[1.9rem] bg-gradient-to-b from-orange-400/[0.08] via-white/[0.02] to-transparent blur-2xl" />
          <div className="mb-7 flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-orange-400/25 bg-orange-500/[0.10] text-orange-300">
              <Plus size={20} strokeWidth={2.4} />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-white">Novo tópico</h2>
              <p className="mt-1.5 text-[13px] leading-5 text-slate-400">Os nomes são normalizados e verificados dentro do assunto.</p>
            </div>
          </div>

          <div className="space-y-5">
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

            <PremiumInput variant="jornada" label="Nome do tópico" value={name} onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)} placeholder="Ex.: Barra de tarefas" className="border-white/[0.08] bg-[#020817]/55 focus:border-orange-400/55" />

            {duplicate && (
              <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.08] p-4 text-sm font-medium text-amber-100">
                Já existe neste assunto: {duplicate.name}
              </div>
            )}

            <PremiumButton
              full
              variant="dark"
              icon={<span className="flex h-7 w-7 items-center justify-center rounded-xl border border-white/20 bg-white/15 shadow-inner shadow-white/10"><Plus size={15} strokeWidth={2.6} /></span>}
              className="relative h-[52px] overflow-hidden rounded-2xl border-orange-300/30 bg-[linear-gradient(135deg,#f97316_0%,#fb923c_52%,#f59e0b_100%)] text-sm font-extrabold text-white shadow-[0_16px_36px_rgba(249,115,22,0.28),inset_0_1px_0_rgba(255,255,255,0.25)] ring-1 ring-white/10 transition-all duration-300 after:pointer-events-none after:absolute after:inset-y-0 after:-left-1/3 after:w-1/4 after:-skew-x-12 after:bg-white/20 after:opacity-0 after:blur-sm after:transition-all after:duration-700 hover:-translate-y-0.5 hover:border-orange-200/50 hover:text-white hover:shadow-[0_20px_42px_rgba(249,115,22,0.36),inset_0_1px_0_rgba(255,255,255,0.30)] hover:after:left-[115%] hover:after:opacity-100 active:translate-y-0 active:scale-[0.99] disabled:after:hidden"
              onClick={createTopic}
              disabled={saving || !subjectId || Boolean(duplicate)}
            >
              Cadastrar tópico
            </PremiumButton>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-white/[0.08] bg-[#0C1E34]/65 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.32)] backdrop-blur-xl sm:p-7">
          <div className="mb-7 flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-orange-400/25 bg-orange-500/[0.10] text-orange-300">
              <Tags size={20} strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold tracking-tight text-white">Tópicos cadastrados</h2>
              <p className="mt-1.5 truncate text-[13px] leading-5 text-slate-400">
                {selectedSubject ? `${selectedDiscipline?.name || "Disciplina"} · ${selectedSubject.name}` : "Selecione uma disciplina e um assunto para visualizar os tópicos."}
              </p>
            </div>
          </div>

          <div className="mb-6 grid gap-4 rounded-[1.25rem] border border-white/[0.06] bg-[#020817]/25 p-4 md:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.2fr)]">
            <SimpleSelectDropdown
              label="Filtrar por assunto"
              value={subjectId}
              onChange={setSubjectId}
              options={subjects.map((subject) => ({ value: subject.id, label: subject.name }))}
            />
            <PremiumInput variant="jornada" label="Buscar" icon={<Search size={16} />} value={search} onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)} placeholder="Pesquisar tópico..." className="border-white/[0.08] bg-[#020817]/55 focus:border-orange-400/55" />
          </div>

          {filteredTopics.length === 0 ? (
            <div className="rounded-[1.25rem] border border-dashed border-slate-400/20 bg-white/[0.025] p-9 text-center">
              <Tags className="mx-auto text-slate-500" size={38} strokeWidth={1.5} />
              <p className="mt-4 text-base font-bold text-white">Nenhum tópico encontrado</p>
              <p className="mx-auto mt-2 max-w-md text-[13px] leading-5 text-slate-400">Cadastre um novo tópico ou ajuste os filtros para visualizar os registros.</p>
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
                            <PremiumInput variant="jornada" aria-label={`Editar ${topic.name}`} value={editingName} onChange={(event: ChangeEvent<HTMLInputElement>) => setEditingName(event.target.value)} className="bg-[#020817]/55" />
                          ) : (
                            <button
                              type="button"
                              onClick={() => setSelectedTopic(topic)}
                              className="inline-flex max-w-[310px] items-center gap-2.5 py-2 text-left text-[13px] font-bold leading-5 text-slate-50 transition-colors duration-200 hover:text-orange-200 focus:rounded-lg focus:outline-none focus:ring-4 focus:ring-orange-500/10"
                            >
                              <FileQuestion size={14} className="shrink-0 text-slate-400" />
                              <span className="line-clamp-2">{topic.name}</span>
                            </button>
                          )}
                        </PremiumTableCell>
                        <PremiumTableCell variant="jornada">
                          <span className={topic.is_active ? "inline-flex rounded-full border border-emerald-500/25 bg-emerald-500/[0.12] px-3 py-1.5 text-xs font-extrabold text-emerald-300" : "inline-flex rounded-full border border-red-500/25 bg-red-500/[0.10] px-3 py-1.5 text-xs font-extrabold text-red-300"}>
                            {topic.is_active ? "Ativo" : "Inativo"}
                          </span>
                        </PremiumTableCell>
                        <PremiumTableCell variant="jornada">
                          <button type="button" onClick={() => setSelectedTopic(topic)} className="group min-w-16 py-2 text-left focus:rounded-lg focus:outline-none focus:ring-4 focus:ring-orange-500/10">
                            <span className="block text-sm font-extrabold text-white transition-colors duration-200 group-hover:text-orange-200">{topic.usage_count}</span>
                            <span className="block text-[11px] font-semibold text-slate-400 transition-colors duration-200 group-hover:text-orange-300/70">{topic.usage_count === 1 ? "questão" : "questões"}</span>
                          </button>
                        </PremiumTableCell>
                        <PremiumTableCell variant="jornada" align="right">
                          <div className="flex flex-nowrap justify-end gap-2">
                            {editing ? (
                              <>
                                <PremiumButton variant="dark" className="px-3 py-2 text-xs" onClick={() => { setEditingId(null); setEditingName(""); }}>Cancelar</PremiumButton>
                                <PremiumButton className="px-3 py-2 text-xs" onClick={() => saveTopic(topic)}>Salvar</PremiumButton>
                              </>
                            ) : (
                              <>
                                <PremiumButton variant="dark" className="h-10 rounded-[14px] px-3.5 text-xs transition-all duration-200 hover:-translate-y-px" icon={<Pencil size={14} />} onClick={() => { setEditingId(topic.id); setEditingName(topic.name); }}>Editar</PremiumButton>
                                <PremiumButton variant={topic.is_active ? "dark-warning" : "dark-success"} className="h-10 rounded-[14px] px-3.5 text-xs transition-all duration-200 hover:-translate-y-px" icon={topic.is_active ? <EyeOff size={14} /> : <Eye size={14} />} onClick={() => setConfirmation({ topic, action: "status" })}>
                                  {topic.is_active ? "Inativar" : "Ativar"}
                                </PremiumButton>
                                <PremiumButton variant="dark-danger" className="h-10 rounded-[14px] px-3.5 text-xs transition-all duration-200 hover:-translate-y-px" icon={<Trash2 size={14} />} onClick={() => setConfirmation({ topic, action: "delete" })}>Excluir</PremiumButton>
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
        </section>
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
      <label className="mb-2 block text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-300/65">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="group flex h-12 w-full items-center justify-between rounded-2xl border border-slate-400/[0.18] bg-[#0B1828] px-4 text-left text-sm font-semibold text-slate-200 outline-none transition-all duration-200 hover:border-orange-400/35 focus:border-orange-400/55 focus:ring-4 focus:ring-orange-500/10"
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
