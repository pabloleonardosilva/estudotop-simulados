"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Plus, Search, X } from "lucide-react";
import { adminFetch } from "@/lib/supabase/adminFetch";

type SubjectOption = {
  id: string;
  name: string;
  discipline_id?: string | null;
};

type SubjectCreatedEvent = CustomEvent<SubjectOption>;

const SUBJECT_CREATED_EVENT = "estudotop:subject-created";

function normalizeSubjectName(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ");
}

function comparableName(value: string) {
  return normalizeSubjectName(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function uniqueById(subjects: SubjectOption[]) {
  const seen = new Set<string>();
  return subjects.filter((subject) => {
    if (!subject?.id || seen.has(subject.id)) return false;
    seen.add(subject.id);
    return true;
  });
}

export default function SubjectMultiSelect({
  label = "Assuntos",
  subjects,
  selectedIds,
  onChange,
  emptyLabel = "Selecione",
  dark = false,
  disciplineId,
  allowCreate = true,
}: {
  label?: string;
  subjects: SubjectOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  emptyLabel?: string;
  dark?: boolean;
  disciplineId?: string | null;
  allowCreate?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createdSubjects, setCreatedSubjects] = useState<SubjectOption[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const allSubjects = useMemo(
    () => uniqueById([...(subjects || []), ...createdSubjects]),
    [subjects, createdSubjects],
  );

  const selected = allSubjects.filter((s) => selectedIds.includes(s.id));
  const normalizedSearch = normalizeSubjectName(search);
  const filtered = allSubjects.filter(
    (s) => !normalizedSearch || s.name.toLowerCase().includes(normalizedSearch.toLowerCase()),
  );
  const exactMatch = allSubjects.some((s) => comparableName(s.name) === comparableName(normalizedSearch));
  const canOfferCreate = allowCreate && normalizedSearch.length >= 2 && !exactMatch;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
        setCreateError("");
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    function handleSubjectCreated(event: Event) {
      const subject = (event as SubjectCreatedEvent).detail;
      if (!subject?.id) return;
      setCreatedSubjects((current) => {
        if (current.some((item) => item.id === subject.id)) return current;
        return [...current, subject];
      });
    }

    window.addEventListener(SUBJECT_CREATED_EVENT, handleSubjectCreated as EventListener);
    return () => window.removeEventListener(SUBJECT_CREATED_EVENT, handleSubjectCreated as EventListener);
  }, []);

  function focusSearchSoon() {
    window.setTimeout(() => inputRef.current?.focus(), 30);
  }

  function openDropdown() {
    setOpen(true);
    setCreateError("");
    focusSearchSoon();
  }

  function toggle(id: string) {
    const nextIds = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];

    onChange(nextIds);
    setSearch("");
    setCreateError("");
    setOpen(true);
    focusSearchSoon();
  }

  function remove(id: string) {
    onChange(selectedIds.filter((x) => x !== id));
  }

  async function createSubject() {
    const name = normalizeSubjectName(search);

    if (!disciplineId) {
      setCreateError("Selecione uma disciplina antes de cadastrar o assunto.");
      focusSearchSoon();
      return;
    }

    if (name.length < 2 || creating) {
      focusSearchSoon();
      return;
    }

    setCreating(true);
    setCreateError("");

    try {
      const response = await adminFetch("/api/admin/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, discipline_id: disciplineId }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || "Não foi possível cadastrar o assunto.");
      }

      const subject: SubjectOption | undefined = payload.subject;
      if (!subject?.id) {
        throw new Error("Assunto cadastrado, mas o retorno não trouxe o ID.");
      }

      setCreatedSubjects((current) => uniqueById([...current, subject]));
      window.dispatchEvent(new CustomEvent(SUBJECT_CREATED_EVENT, { detail: subject }));
      onChange(Array.from(new Set([...selectedIds, subject.id])));
      setSearch("");
      setOpen(true);
      focusSearchSoon();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Erro inesperado ao cadastrar assunto.");
      focusSearchSoon();
    } finally {
      setCreating(false);
    }
  }

  const buttonClass = dark
    ? "flex h-12 w-full items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 text-left text-sm font-semibold text-white/70 shadow-sm outline-none transition duration-200 hover:-translate-y-0.5 hover:border-white/[0.14]"
    : "flex h-12 w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 text-left text-sm font-semibold text-slate-700 shadow-sm outline-none transition hover:border-orange-200 focus:border-orange-300 focus:ring-4 focus:ring-orange-100";

  const dropdownClass = dark
    ? "absolute left-0 top-full z-[9999] mt-2 w-full min-w-[240px] rounded-2xl border border-white/[0.09] bg-[#0D1B2E] p-2 shadow-2xl shadow-black/50 backdrop-blur-xl"
    : "absolute left-0 top-full z-[9999] mt-2 w-full min-w-[240px] rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-900/15";

  const searchWrapClass = dark
    ? "relative mb-2 px-1"
    : "relative mb-2 px-1";

  const inputClass = dark
    ? "h-9 w-full rounded-xl border border-white/[0.07] bg-white/[0.04] pl-8 pr-3 text-xs font-medium text-white/70 outline-none placeholder:text-white/25 focus:border-orange-400/40"
    : "h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs font-semibold text-slate-700 outline-none placeholder:text-slate-400 focus:border-orange-300 focus:bg-white focus:ring-4 focus:ring-orange-100";

  const labelClass = dark
    ? "mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40"
    : "mb-2 block text-sm font-medium text-slate-700";

  return (
    <div>
      {label && <label className={labelClass}>{label}</label>}

      <div ref={containerRef} className="relative">
        <button type="button" onClick={openDropdown} className={buttonClass}>
          <span className={`truncate ${selected.length > 0 ? (dark ? "text-white/90" : "text-slate-800") : ""}`}>
            {selected.length > 0
              ? `${selected.length} assunto${selected.length > 1 ? "s" : ""} selecionado${selected.length > 1 ? "s" : ""}`
              : emptyLabel}
          </span>
          <span className="flex items-center gap-2">
            {selected.length > 0 && <span className="h-2 w-2 rounded-full bg-orange-500" />}
            <ChevronDown
              size={16}
              className={`${dark ? "text-white/30" : "text-slate-400"} transition-transform duration-200 ${open ? "rotate-180 text-orange-400" : ""}`}
            />
          </span>
        </button>

        {open && (
          <div className={dropdownClass}>
            <div className={searchWrapClass}>
              <Search size={13} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${dark ? "text-white/30" : "text-slate-400"}`} />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCreateError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canOfferCreate) {
                    e.preventDefault();
                    void createSubject();
                  }
                }}
                placeholder="Buscar ou cadastrar assunto..."
                className={inputClass}
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            <div className="max-h-56 space-y-0.5 overflow-y-auto">
              {filtered.length === 0 && !canOfferCreate ? (
                <p className={`px-3 py-2 text-xs ${dark ? "text-white/30" : "text-slate-400"}`}>Nenhum assunto encontrado.</p>
              ) : (
                filtered.map((subject) => {
                  const isSelected = selectedIds.includes(subject.id);
                  return (
                    <button
                      key={subject.id}
                      type="button"
                      onClick={() => toggle(subject.id)}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition duration-150 ${
                        isSelected
                          ? dark
                            ? "bg-orange-500/[0.12] text-orange-300 ring-1 ring-orange-500/20"
                            : "bg-orange-50 text-orange-700 ring-1 ring-orange-200"
                          : dark
                            ? "text-white/60 hover:bg-white/[0.06] hover:text-white/90"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
                      <span className="flex-1 leading-snug">{subject.name}</span>
                      {isSelected && (
                        <Check size={13} className="shrink-0 text-orange-400" strokeWidth={3} />
                      )}
                    </button>
                  );
                })
              )}

              {canOfferCreate && (
                <button
                  type="button"
                  onClick={() => void createSubject()}
                  disabled={creating}
                  className={`mt-1 flex w-full items-center gap-2.5 rounded-xl border border-dashed px-3 py-2.5 text-left text-sm font-semibold transition ${
                    dark
                      ? "border-orange-400/30 bg-orange-500/[0.08] text-orange-200 hover:bg-orange-500/[0.12] disabled:opacity-60"
                      : "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 disabled:opacity-60"
                  }`}
                >
                  {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  <span className="min-w-0 flex-1 truncate">
                    {creating ? "Cadastrando" : `Cadastrar assunto “${normalizedSearch}”`}
                  </span>
                </button>
              )}
            </div>

            {createError && (
              <p className={`mt-2 rounded-xl px-3 py-2 text-xs font-semibold ${dark ? "bg-red-500/10 text-red-300" : "bg-red-50 text-red-700"}`}>
                {createError}
              </p>
            )}
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selected.map((subject) => (
            <span
              key={subject.id}
              className={
                dark
                  ? "inline-flex items-center gap-1.5 rounded-xl border border-violet-500/25 bg-violet-500/[0.10] px-2.5 py-1 text-xs font-semibold text-violet-300"
                  : "inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-800"
              }
            >
              {subject.name}
              <button
                type="button"
                onClick={() => remove(subject.id)}
                className={
                  dark
                    ? "rounded-full p-0.5 text-violet-400/60 transition hover:bg-violet-500/20 hover:text-violet-200"
                    : "rounded-full p-0.5 text-orange-400 hover:bg-orange-100 hover:text-orange-700"
                }
                aria-label={`Remover ${subject.name}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
