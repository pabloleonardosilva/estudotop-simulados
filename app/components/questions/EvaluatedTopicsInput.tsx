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

const topicCatalogCache = new Map<string, TopicSuggestion[]>();
const topicCatalogRequests = new Map<string, Promise<TopicSuggestion[]>>();
const transientTopicCatalog = new Map<string, TopicSuggestion[]>();
const TRANSIENT_TOPIC_EVENT = "evaluated-topics:transient-topic-added";

function mergeTopicCatalog(...catalogs: TopicSuggestion[][]) {
  const merged = new Map<string, TopicSuggestion>();

  for (const topic of catalogs.flat()) {
    const comparable = normalizeTopicComparableName(topic.name);
    if (comparable && !merged.has(comparable)) merged.set(comparable, topic);
  }

  return Array.from(merged.values());
}

function addTransientTopic(subjectId: string, name: string) {
  const comparable = normalizeTopicComparableName(name);
  if (!comparable) return;

  const current = transientTopicCatalog.get(subjectId) || [];
  if (current.some((topic) => normalizeTopicComparableName(topic.name) === comparable)) return;

  const topic = { id: `transient:${subjectId}:${comparable}`, name };
  transientTopicCatalog.set(subjectId, [...current, topic]);
  topicCatalogCache.set(subjectId, mergeTopicCatalog(topicCatalogCache.get(subjectId) || [], [topic]));
  window.dispatchEvent(new CustomEvent(TRANSIENT_TOPIC_EVENT, { detail: { subjectId, topic } }));
}

function loadTopicCatalog(subjectId: string) {
  const cached = topicCatalogCache.get(subjectId);
  if (cached) return Promise.resolve(cached);

  const pending = topicCatalogRequests.get(subjectId);
  if (pending) return pending;

  const request = adminFetch(`/api/admin/topics?subject_id=${encodeURIComponent(subjectId)}&active=true`)
    .then(async (response) => {
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Não foi possível carregar os tópicos.");

      const databaseTopics = (result.topics || []).map((topic: TopicSuggestion) => ({ id: topic.id, name: topic.name }));
      const topics = mergeTopicCatalog(databaseTopics, transientTopicCatalog.get(subjectId) || []);
      topicCatalogCache.set(subjectId, topics);
      return topics;
    })
    .finally(() => topicCatalogRequests.delete(subjectId));

  topicCatalogRequests.set(subjectId, request);
  return request;
}

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
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [retryCatalog, setRetryCatalog] = useState(0);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const topics = normalizeEvaluatedTopics(value);
  const showError = error || (required && topics.length === 0 ? "Informe pelo menos um tópico avaliado." : null);
  const dark = variant === "dark";

  useEffect(() => {
    if (!subjectId) return;

    let active = true;
    Promise.resolve()
      .then(() => {
        if (!active) return;
        setCatalogLoading(true);
        setCatalogError(null);
        return loadTopicCatalog(subjectId);
      })
      .then((topics) => {
        if (!active || !topics) return;
        setCatalog(topics);
        setCatalogSubjectId(subjectId);
      })
      .catch((error) => {
        if (!active) return;
        setCatalog([]);
        setCatalogSubjectId(null);
        setCatalogError(error instanceof Error ? error.message : "Não foi possível carregar os tópicos.");
      })
      .finally(() => {
        if (active) setCatalogLoading(false);
      });

    return () => {
      active = false;
    };
  }, [retryCatalog, subjectId]);

  useEffect(() => {
    function handleTransientTopic(event: Event) {
      const detail = (event as CustomEvent<{ subjectId: string; topic: TopicSuggestion }>).detail;
      if (detail.subjectId !== subjectId) return;

      setCatalog((current) => mergeTopicCatalog(current, [detail.topic]));
      setCatalogSubjectId(detail.subjectId);
    }

    window.addEventListener(TRANSIENT_TOPIC_EVENT, handleTransientTopic);
    return () => window.removeEventListener(TRANSIENT_TOPIC_EVENT, handleTransientTopic);
  }, [subjectId]);

  const suggestions = useMemo(() => {
    const term = normalizeTopicComparableName(draft);
    if (!term || catalogSubjectId !== subjectId) return [];

    const selectedKeys = new Set(topics.map(normalizeTopicComparableName));
    return catalog
      .filter((topic) => !selectedKeys.has(normalizeTopicComparableName(topic.name)))
      .filter((topic) => normalizeTopicComparableName(topic.name).includes(term))
      .sort((left, right) => {
        const leftName = normalizeTopicComparableName(left.name);
        const rightName = normalizeTopicComparableName(right.name);
        const leftRank = leftName === term ? 0 : leftName.startsWith(term) ? 1 : 2;
        const rightRank = rightName === term ? 0 : rightName.startsWith(term) ? 1 : 2;
        return leftRank - rightRank || leftName.localeCompare(rightName, "pt-BR");
      })
      .slice(0, 6);
  }, [catalog, catalogSubjectId, draft, subjectId, topics]);

  function commitDraft(raw = draft) {
    const parts = raw.split(";").map((part) => {
      const typed = part.trim();
      const comparable = normalizeTopicComparableName(typed);
      return catalog.find((topic) => normalizeTopicComparableName(topic.name) === comparable)?.name || typed;
    });
    const next = normalizeEvaluatedTopics([...topics, ...parts]);
    if (subjectId) {
      const existingKeys = new Set(catalog.map((topic) => normalizeTopicComparableName(topic.name)));
      for (const topic of next) {
        if (!existingKeys.has(normalizeTopicComparableName(topic))) addTransientTopic(subjectId, topic);
      }
    }
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
        {subjectId && catalogLoading && <p className={dark ? "mt-2 text-xs font-semibold text-slate-400" : "mt-2 text-xs font-semibold text-slate-500"}>Carregando sugestões...</p>}
        {subjectId && catalogError && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className={dark ? "text-xs font-semibold text-amber-300" : "text-xs font-semibold text-amber-700"}>{catalogError}</p>
            <button
              type="button"
              onClick={() => setRetryCatalog((current) => current + 1)}
              disabled={disabled || catalogLoading}
              className={dark ? "text-xs font-black text-orange-300 underline underline-offset-2 disabled:opacity-40" : "text-xs font-black text-orange-700 underline underline-offset-2 disabled:opacity-40"}
            >
              Tentar novamente
            </button>
          </div>
        )}
      </div>
      {showError && <p className={dark ? "text-xs font-semibold text-red-300" : "text-xs font-semibold text-red-600"}>{showError}</p>}
    </div>
  );
}
