"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import { normalizeEvaluatedTopics } from "@/lib/questions/evaluated-topics";
import { normalizeTopicComparableName } from "@/lib/utils/text";
import { adminFetch } from "@/lib/supabase/adminFetch";

type EvaluatedTopicsInputProps = {
  value: string[];
  onChange: (topics: string[]) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string | null;
  variant?: "light" | "dark";
  placeholder?: string;
  subjectId?: string | null;
};

type TopicSuggestion = { id: string; name: string };

export default function EvaluatedTopicsInput({
  value,
  onChange,
  required = false,
  disabled = false,
  error = null,
  variant = "light",
  placeholder = "Digite um tópico avaliado",
  subjectId = null,
}: EvaluatedTopicsInputProps) {
  const [draft, setDraft] = useState("");
  const [catalog, setCatalog] = useState<TopicSuggestion[]>([]);
  const [catalogSubjectId, setCatalogSubjectId] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const topics = normalizeEvaluatedTopics(value);
  const showError = error || (required && topics.length === 0 ? "Informe pelo menos um tópico avaliado." : null);
  const dark = variant === "dark";

  useEffect(() => {
    if (!subjectId) return;

    const controller = new AbortController();
    adminFetch(`/api/admin/topics?subject_id=${encodeURIComponent(subjectId)}&active=true`, { signal: controller.signal })
      .then((response) => response.json())
      .then((result) => {
        if (!result.ok) return;
        setCatalog((result.topics || []).map((topic: TopicSuggestion) => ({ id: topic.id, name: topic.name })));
        setCatalogSubjectId(subjectId);
      })
      .catch((error) => {
        if (error instanceof Error && error.name === "AbortError") return;
      });

    return () => controller.abort();
  }, [subjectId]);

  const suggestions = useMemo(() => {
    const term = normalizeTopicComparableName(draft);
    if (!term || catalogSubjectId !== subjectId) return [];

    const selectedKeys = new Set(topics.map(normalizeTopicComparableName));
    return catalog
      .filter((topic) => !selectedKeys.has(normalizeTopicComparableName(topic.name)))
      .filter((topic) => normalizeTopicComparableName(topic.name).includes(term))
      .slice(0, 6);
  }, [catalog, catalogSubjectId, draft, subjectId, topics]);

  function commitDraft(raw = draft) {
    const parts = raw.split(";").map((part) => {
      const typed = part.trim();
      const comparable = normalizeTopicComparableName(typed);
      return catalog.find((topic) => normalizeTopicComparableName(topic.name) === comparable)?.name || typed;
    });
    const next = normalizeEvaluatedTopics([...topics, ...parts]);
    onChange(next);
    setDraft("");
  }

  function removeTopic(topic: string) {
    onChange(topics.filter((item) => item !== topic));
  }

  function handleDraftChange(nextDraft: string) {
    setDraft(nextDraft);
    setHighlightedIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (suggestions.length > 0 && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setHighlightedIndex((current) => {
        const next = current + direction;
        if (next < 0) return suggestions.length - 1;
        if (next >= suggestions.length) return 0;
        return next;
      });
      return;
    }

    if (event.key === "Enter" || event.key === ";") {
      event.preventDefault();
      const highlighted = highlightedIndex >= 0 ? suggestions[highlightedIndex] : null;
      commitDraft(highlighted ? highlighted.name : event.currentTarget.value);
      setHighlightedIndex(-1);
      return;
    }

    if (event.key === "Escape" && highlightedIndex >= 0) {
      setHighlightedIndex(-1);
    }
  }

  const wrapperClass = dark
    ? "rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3"
    : "rounded-2xl border border-slate-200 bg-white p-3";
  const chipClass = dark
    ? "border-white/[0.10] bg-white/[0.06] text-slate-100"
    : "border-slate-200 bg-slate-50 text-slate-700";
  const inputClass = dark
    ? "h-10 min-w-[180px] flex-1 rounded-xl border border-white/[0.08] bg-black/20 px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-orange-400/50"
    : "h-10 min-w-[180px] flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400 focus:border-orange-300";

  return (
    <div className="space-y-2">
      <div className={wrapperClass}>
        <div className="flex flex-wrap gap-2">
          {topics.map((topic) => (
            <span key={topic} className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-bold ${chipClass}`}>
              {topic}
              <button type="button" onClick={() => removeTopic(topic)} disabled={disabled} className="rounded-full p-0.5 opacity-70 transition hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40" aria-label={`Remover ${topic}`}>
                <X size={13} />
              </button>
            </span>
          ))}
          {!topics.length && <span className={dark ? "text-xs font-semibold text-slate-500" : "text-xs font-semibold text-slate-400"}>Nenhum tópico informado.</span>}
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-[180px] flex-1">
            <input
              type="text"
              value={draft}
              onChange={(event) => handleDraftChange(event.target.value)}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              placeholder={placeholder}
              className={`${inputClass} w-full`}
              autoComplete="off"
              role="combobox"
              aria-expanded={suggestions.length > 0}
              aria-controls="evaluated-topics-listbox"
              aria-activedescendant={highlightedIndex >= 0 ? `evaluated-topic-suggestion-${highlightedIndex}` : undefined}
            />
            {suggestions.length > 0 && (
              <div id="evaluated-topics-listbox" role="listbox" className={dark ? "absolute inset-x-0 top-11 z-30 overflow-hidden rounded-xl border border-white/10 bg-slate-950 shadow-2xl" : "absolute inset-x-0 top-11 z-30 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"}>
                {suggestions.map((suggestion, index) => {
                  const highlighted = index === highlightedIndex;
                  const base = dark
                    ? "block w-full border-b border-white/[0.06] px-3 py-2.5 text-left text-sm font-semibold transition last:border-b-0"
                    : "block w-full border-b border-slate-100 px-3 py-2.5 text-left text-sm font-semibold transition last:border-b-0";
                  const tone = dark
                    ? highlighted ? "bg-white/[0.10] text-orange-200" : "text-slate-200 hover:bg-white/[0.07]"
                    : highlighted ? "bg-orange-50 text-orange-700" : "text-slate-700 hover:bg-orange-50";
                  return (
                    <button
                      key={suggestion.id}
                      id={`evaluated-topic-suggestion-${index}`}
                      type="button"
                      role="option"
                      aria-selected={highlighted}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      onClick={() => { commitDraft(suggestion.name); setHighlightedIndex(-1); }}
                      className={`${base} ${tone}`}
                    >
                      {suggestion.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => commitDraft()}
            disabled={disabled || !draft.trim()}
            className={dark ? "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-orange-400/30 bg-orange-500/15 px-4 text-xs font-black text-orange-200 transition hover:bg-orange-500/20 disabled:cursor-not-allowed disabled:opacity-40" : "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 text-xs font-black text-orange-700 transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-40"}
          >
            <Plus size={14} /> Adicionar
          </button>
        </div>
      </div>
      {showError && <p className={dark ? "text-xs font-semibold text-red-300" : "text-xs font-semibold text-red-600"}>{showError}</p>}
    </div>
  );
}
