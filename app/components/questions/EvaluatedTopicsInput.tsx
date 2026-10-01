"use client";
import { sortByPtBrLabel } from "@/app/lib/utils/sort";


import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
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
  disciplineId?: string | null;
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

// Com Assunto o catálogo é o do Assunto; sem Assunto, somente os tópicos diretos da Disciplina.
function topicCatalogKey(subjectId: string | null, disciplineId: string | null) {
  if (subjectId) return `subject:${subjectId}`;
  if (disciplineId) return `discipline:${disciplineId}`;
  return null;
}

function topicCatalogUrl(catalogKey: string) {
  const [scope, id] = catalogKey.split(":");
  return scope === "subject"
    ? `/api/admin/topics?subject_id=${encodeURIComponent(id)}&active=true`
    : `/api/admin/topics?discipline_id=${encodeURIComponent(id)}&direct=true&active=true`;
}

function addTransientTopic(catalogKey: string, name: string) {
  const comparable = normalizeTopicComparableName(name);
  if (!comparable) return;

  const current = transientTopicCatalog.get(catalogKey) || [];
  if (current.some((topic) => normalizeTopicComparableName(topic.name) === comparable)) return;

  const topic = { id: `transient:${catalogKey}:${comparable}`, name };
  transientTopicCatalog.set(catalogKey, [...current, topic]);
  topicCatalogCache.set(catalogKey, mergeTopicCatalog(topicCatalogCache.get(catalogKey) || [], [topic]));
  window.dispatchEvent(new CustomEvent(TRANSIENT_TOPIC_EVENT, { detail: { catalogKey, topic } }));
}

function loadTopicCatalog(catalogKey: string) {
  const cached = topicCatalogCache.get(catalogKey);
  if (cached) return Promise.resolve(cached);

  const pending = topicCatalogRequests.get(catalogKey);
  if (pending) return pending;

  const request = adminFetch(topicCatalogUrl(catalogKey))
    .then(async (response) => {
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Não foi possível carregar os tópicos.");

      const databaseTopics = (result.topics || []).map((topic: TopicSuggestion) => ({ id: topic.id, name: topic.name }));
      const topics = mergeTopicCatalog(databaseTopics, transientTopicCatalog.get(catalogKey) || []);
      topicCatalogCache.set(catalogKey, topics);
      return topics;
    })
    .finally(() => topicCatalogRequests.delete(catalogKey));

  topicCatalogRequests.set(catalogKey, request);
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
  disciplineId = null,
}: EvaluatedTopicsInputProps) {
  const catalogKey = topicCatalogKey(subjectId, disciplineId);
  const [draft, setDraft] = useState("");
  const [catalog, setCatalog] = useState<TopicSuggestion[]>([]);
  const [loadedCatalogKey, setLoadedCatalogKey] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [retryCatalog, setRetryCatalog] = useState(0);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const inputWrapperRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const topics = normalizeEvaluatedTopics(value);
  const showError = error || (required && topics.length === 0 ? "Informe pelo menos um tópico avaliado." : null);
  const dark = variant === "dark";

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!catalogKey) return;

    let active = true;
    Promise.resolve()
      .then(() => {
        if (!active) return;
        setCatalogLoading(true);
        setCatalogError(null);
        return loadTopicCatalog(catalogKey);
      })
      .then((topics) => {
        if (!active || !topics) return;
        setCatalog(topics);
        setLoadedCatalogKey(catalogKey);
      })
      .catch((error) => {
        if (!active) return;
        setCatalog([]);
        setLoadedCatalogKey(null);
        setCatalogError(error instanceof Error ? error.message : "Não foi possível carregar os tópicos.");
      })
      .finally(() => {
        if (active) setCatalogLoading(false);
      });

    return () => {
      active = false;
    };
  }, [retryCatalog, catalogKey]);

  useEffect(() => {
    function handleTransientTopic(event: Event) {
      const detail = (event as CustomEvent<{ catalogKey: string; topic: TopicSuggestion }>).detail;
      if (detail.catalogKey !== catalogKey) return;

      setCatalog((current) => mergeTopicCatalog(current, [detail.topic]));
      setLoadedCatalogKey(detail.catalogKey);
    }

    window.addEventListener(TRANSIENT_TOPIC_EVENT, handleTransientTopic);
    return () => window.removeEventListener(TRANSIENT_TOPIC_EVENT, handleTransientTopic);
  }, [catalogKey]);

  const suggestions = useMemo(() => {
    const term = normalizeTopicComparableName(draft);
    if (loadedCatalogKey !== catalogKey) return [];

    const selectedKeys = new Set(topics.map(normalizeTopicComparableName));
    return sortByPtBrLabel(catalog, (item) => item.name)
      .filter((topic) => !selectedKeys.has(normalizeTopicComparableName(topic.name)))
      .filter((topic) => !term || normalizeTopicComparableName(topic.name).includes(term));
  }, [catalog, loadedCatalogKey, draft, catalogKey, topics]);

  useEffect(() => {
    const menuVisible = suggestionsOpen && suggestions.length > 0;
    if (!menuVisible) return;

    function updatePosition() {
      const el = inputWrapperRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom;
      const safeMargin = 12;

      // O menu sempre abre para baixo — nunca para cima, mesmo com pouco
      // espaço. Prioridade de UX: pode sobrepor a próxima questão (fica
      // acima dela por z-index/portal), mas nunca cobre a questão atual.
      // Com pouco espaço, encolhe (min 120px) e rola internamente.
      setMenuStyle({
        position: "fixed",
        left: rect.left,
        width: rect.width,
        top: rect.bottom + 4,
        maxHeight: Math.min(420, Math.max(spaceBelow - safeMargin, 120)),
      });
    }

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [suggestionsOpen, suggestions.length]);

  function commitDraft(raw = draft) {
    const parts = raw.split(";").map((part) => {
      const typed = part.trim();
      const comparable = normalizeTopicComparableName(typed);
      return catalog.find((topic) => normalizeTopicComparableName(topic.name) === comparable)?.name || typed;
    });
    const next = normalizeEvaluatedTopics([...topics, ...parts]);
    if (catalogKey) {
      const existingKeys = new Set(catalog.map((topic) => normalizeTopicComparableName(topic.name)));
      for (const topic of next) {
        if (!existingKeys.has(normalizeTopicComparableName(topic))) addTransientTopic(catalogKey, topic);
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
    setSuggestionsOpen(true);
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

    if (event.key === "Escape") {
      setHighlightedIndex(-1);
      setSuggestionsOpen(false);
    }
  }

  const wrapperClass = dark
    ? "rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3"
    : "et-clean-topics rounded-2xl border border-slate-200 bg-white p-3";
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
          <div className="relative min-w-[180px] flex-1" ref={inputWrapperRef}>
            <input
              type="text"
              value={draft}
              onChange={(event) => handleDraftChange(event.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setSuggestionsOpen(true)}
              onBlur={() => setSuggestionsOpen(false)}
              disabled={disabled}
              placeholder={placeholder}
              className={`${inputClass} w-full`}
              autoComplete="off"
              role="combobox"
              aria-expanded={suggestionsOpen && suggestions.length > 0}
              aria-controls={listboxId}
              aria-activedescendant={highlightedIndex >= 0 ? `${listboxId}-option-${highlightedIndex}` : undefined}
            />
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
        {catalogKey && catalogLoading && <p className={dark ? "mt-2 text-xs font-semibold text-slate-400" : "mt-2 text-xs font-semibold text-slate-500"}>Carregando sugestões...</p>}
        {catalogKey && catalogError && (
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
      {portalReady && suggestionsOpen && suggestions.length > 0 && menuStyle && createPortal(
        <div
          id={listboxId}
          role="listbox"
          style={menuStyle}
          className={
            // Dark: mesma família azul premium do card "Tópicos avaliados"
            // que hospeda este campo (border-blue-400/30, glow azul —
            // ver QuestionEditor.tsx e questoes/page-client.tsx) — o menu
            // precisa ler como continuação dessa superfície, nunca como uma
            // caixa preta genérica desconectada.
            dark
              ? "premium-sidebar-scroll z-[9999] overflow-y-auto rounded-2xl border border-blue-400/30 bg-[linear-gradient(180deg,rgba(30,58,138,0.32)_0%,rgba(7,17,31,0.97)_55%,rgba(3,9,20,0.98)_100%)] shadow-[inset_0_1px_0_rgba(147,197,253,0.14),0_18px_45px_-14px_rgba(2,6,23,0.7),0_0_30px_-6px_rgba(59,130,246,0.35)] backdrop-blur-sm"
              : "z-[9999] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl"
          }
        >
          {suggestions.map((suggestion, index) => {
            const highlighted = index === highlightedIndex;
            const base = dark
              ? "block w-full border-b border-blue-400/[0.10] px-3 py-2.5 text-left text-sm font-semibold transition last:border-b-0"
              : "block w-full border-b border-slate-100 px-3 py-2.5 text-left text-sm font-semibold transition last:border-b-0";
            const tone = dark
              ? `${highlighted ? "bg-blue-400/[0.18] text-orange-200" : "text-white/95 hover:bg-blue-400/[0.10]"} [text-shadow:0_0_5px_rgba(255,255,255,0.28),0_0_10px_rgba(255,255,255,0.12)]`
              : highlighted ? "bg-orange-50 text-orange-700" : "text-slate-700 hover:bg-orange-50";
            return (
              <button
                key={suggestion.id}
                id={`${listboxId}-option-${index}`}
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
        </div>,
        document.body,
      )}
    </div>
  );
}
