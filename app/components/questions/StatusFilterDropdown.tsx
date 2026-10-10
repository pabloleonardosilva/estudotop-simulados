"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

// Filtro de Status com multisseleção das listagens de questões (Banco e Revisar).
// Mesmo padrão visual e de interação dos filtros de Ano/Órgão (checkboxes, rascunho
// + Limpar/Aplicar, contador laranja). Lista vazia = "Todos" (sem restrição de status);
// vários status selecionados combinam-se por OU na tela que consome o valor.
export type StatusFilterOption = { value: string; label: string; count?: number };

export function toggleStatusSelection(current: string[], value: string) {
  return current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
}

export default function StatusFilterDropdown({
  options,
  selected,
  onChange,
  allLabel = "Todos",
  allCount,
}: {
  options: StatusFilterOption[];
  selected: string[];
  onChange: (statuses: string[]) => void;
  allLabel?: string;
  allCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(selected);
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

  function labelFor(value: string) {
    return options.find((option) => option.value === value)?.label || value;
  }

  function getLabel() {
    if (selected.length === 0) return allLabel;
    if (selected.length === 1) return labelFor(selected[0]);
    return `${selected.length} status selecionados`;
  }

  const allSelected = draft.length === 0;
  const rowClass = (isSelected: boolean) =>
    isSelected
      ? "flex w-full items-center gap-3 rounded-xl border border-orange-500/30 bg-orange-500/[0.12] px-4 py-3 text-left text-sm font-semibold text-orange-100"
      : "flex w-full items-center gap-3 rounded-xl border border-transparent px-4 py-3 text-left text-sm font-semibold text-white/60 hover:border-white/[0.07] hover:bg-white/[0.04] hover:text-white/80";
  const boxClass = (isSelected: boolean) =>
    isSelected ? "flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-orange-500 text-white" : "h-5 w-5 shrink-0 rounded-md border border-white/[0.15] bg-white/[0.04]";
  const countClass = (isSelected: boolean) =>
    isSelected ? "rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-black text-white" : "rounded-full border border-white/[0.08] bg-white/[0.05] px-2 py-0.5 text-[10px] font-black text-white/40";

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
        Status
      </label>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => { setDraft(selected); setOpen((o) => !o); }}
        className="group flex h-12 w-full items-center justify-between rounded-2xl border border-white/[0.08] bg-[#0D1926] px-4 text-left text-sm font-semibold text-white/80 outline-none transition hover:border-white/[0.15]"
      >
        <span className="truncate">{getLabel()}</span>
        <span className="flex items-center gap-2">
          {selected.length > 0 && (
            <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white">
              {selected.length}
            </span>
          )}
          <ChevronDown size={16} className={`text-white/30 transition duration-200 group-hover:text-orange-400 ${open ? "rotate-180 text-orange-400" : ""}`} />
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-[9999] mt-2 w-full min-w-48 rounded-2xl border border-white/[0.09] bg-[#0D1B2E] p-3 shadow-2xl shadow-black/50 backdrop-blur-xl">
          <div role="listbox" aria-multiselectable="true" aria-label="Status" className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {/* "Todos" = sem restrição: limpa as seleções individuais. */}
            <button type="button" role="option" aria-selected={allSelected} onClick={() => setDraft([])} className={rowClass(allSelected)}>
              <span className={boxClass(allSelected)}>{allSelected && <Check size={13} strokeWidth={3} />}</span>
              <span className="flex-1">{allLabel}</span>
              {allCount !== undefined && <span className={countClass(allSelected)}>{allCount}</span>}
            </button>
            {options.map((option) => {
              const isSelected = draft.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => setDraft((current) => toggleStatusSelection(current, option.value))}
                  className={rowClass(isSelected)}
                >
                  <span className={boxClass(isSelected)}>{isSelected && <Check size={13} strokeWidth={3} />}</span>
                  <span className="flex-1">{option.label}</span>
                  {option.count !== undefined && <span className={countClass(isSelected)}>{option.count}</span>}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex gap-2 border-t border-white/[0.07] pt-3">
            <button type="button" onClick={() => { setDraft([]); onChange([]); setOpen(false); }} className="flex-1 rounded-2xl border border-white/[0.07] bg-white/[0.04] px-3 py-2 text-xs font-bold text-white/50 hover:bg-white/[0.08] hover:text-white/70">
              Limpar
            </button>
            <button type="button" onClick={() => { onChange(draft); setOpen(false); }} className="flex-1 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-500 px-3 py-2 text-xs font-bold text-white shadow-sm shadow-orange-900/30">
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
