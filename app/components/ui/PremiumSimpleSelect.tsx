"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";

// Dropdown premium para listas curtas (poucas opções, sem necessidade de
// busca) — mesma linguagem visual/interação de SearchableSelect (trigger +
// painel customizado, nunca <select> nativo), só sem o campo de busca.
// Usar SearchableSelect quando a lista tiver mais de 5 opções.
export type PremiumSimpleSelectOption = readonly [string, string];

type Props = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly PremiumSimpleSelectOption[];
  dark?: boolean;
  className?: string;
  /**
   * Variante compacta (h-8, texto xs) para grades densas de edição inline
   * (ex.: cards de revisão em lote) — mesma interação/acessibilidade,
   * dimensões menores para não inflar linhas ao lado de inputs compactos
   * equivalentes já existentes nessas telas. Só afeta o tema dark.
   */
  compact?: boolean;
  disabled?: boolean;
};

export default function PremiumSimpleSelect({ label, value, onChange, options, dark = false, className = "", compact = false, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listboxId = `premium-simple-select-listbox-${useId()}`;

  const selectedIndex = options.findIndex(([optionValue]) => optionValue === value);
  const selectedLabel = selectedIndex >= 0 ? options[selectedIndex][1] : "";

  useEffect(() => {
    if (!open) return;
    function handleOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  function openMenu() {
    if (disabled) return;
    setOpen(true);
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }

  function handleSelect(optionValue: string) {
    onChange(optionValue);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openMenu();
      }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setHighlightedIndex((current) => {
        const next = current + direction;
        if (next < 0) return options.length - 1;
        if (next >= options.length) return 0;
        return next;
      });
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < options.length) handleSelect(options[highlightedIndex][0]);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
    }
  }

  if (dark) {
    return (
      <div ref={containerRef} className={`relative ${className}`}>
        {label && (
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">{label}</label>
        )}
        <button
          ref={buttonRef}
          type="button"
          onClick={() => (open ? setOpen(false) : openMenu())}
          onKeyDown={handleTriggerKeyDown}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          className={`${
            compact
              ? "flex h-8 w-full items-center justify-between rounded-lg border border-white/[0.08] bg-[#0D1B2A] px-2 text-left text-xs font-semibold text-slate-300 outline-none transition focus:border-orange-400/40 focus:ring-2 focus:ring-orange-400/[0.08]"
              : "flex h-12 w-full items-center justify-between rounded-2xl border border-white/[0.08] bg-[#050b13] px-4 text-left text-sm font-semibold text-white/80 outline-none transition focus:border-orange-400/40 focus:ring-2 focus:ring-orange-400/[0.08]"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronDown size={compact ? 13 : 16} className={`shrink-0 text-white/30 transition duration-200 ${open ? "rotate-180 text-orange-400" : ""}`} />
        </button>
        {open && (
          <div id={listboxId} role="listbox" className={`absolute left-0 top-full z-[9999] mt-2 w-full min-w-[180px] max-h-60 overflow-y-auto rounded-2xl border border-white/[0.09] bg-[#0D1B2E] shadow-2xl shadow-black/50 backdrop-blur-xl ${compact ? "p-1.5" : "p-2"}`}>
            {options.map(([optionValue, optionLabel], index) => {
              const selected = optionValue === value;
              const highlighted = index === highlightedIndex;
              return (
                <button
                  key={optionValue}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => handleSelect(optionValue)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={
                    compact
                      ? selected
                        ? "flex w-full items-center justify-between rounded-lg border border-orange-500/30 bg-orange-500/[0.12] px-3 py-1.5 text-left text-xs font-semibold text-orange-100"
                        : highlighted
                          ? "flex w-full items-center rounded-lg border border-white/[0.07] bg-white/[0.06] px-3 py-1.5 text-left text-xs font-semibold text-white/85"
                          : "flex w-full items-center rounded-lg border border-transparent px-3 py-1.5 text-left text-xs font-semibold text-white/60 hover:border-white/[0.07] hover:bg-white/[0.04] hover:text-white/80"
                      : selected
                        ? "flex w-full items-center justify-between rounded-xl border border-orange-500/30 bg-orange-500/[0.12] px-4 py-2.5 text-left text-sm font-semibold text-orange-100"
                        : highlighted
                          ? "flex w-full items-center rounded-xl border border-white/[0.07] bg-white/[0.06] px-4 py-2.5 text-left text-sm font-semibold text-white/85"
                          : "flex w-full items-center rounded-xl border border-transparent px-4 py-2.5 text-left text-sm font-semibold text-white/60 hover:border-white/[0.07] hover:bg-white/[0.04] hover:text-white/80"
                  }
                >
                  <span className="flex-1 text-left">{optionLabel}</span>
                  {selected && <Check size={compact ? 12 : 14} className="shrink-0 text-orange-400" strokeWidth={3} />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`et-clean-field-group relative ${className}`}>
      {label && <label className="et-clean-label mb-2 block text-sm font-medium text-slate-700">{label}</label>}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        className="et-clean-field flex h-12 w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 text-left text-sm font-semibold text-slate-700 shadow-sm outline-none transition hover:border-orange-200 focus:border-orange-300 focus:ring-4 focus:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown size={14} className={`ml-1 shrink-0 text-slate-400 transition ${open ? "rotate-180 text-orange-500" : ""}`} />
      </button>
      {open && (
        <div id={listboxId} role="listbox" className="et-clean-popover absolute left-0 top-full z-[9999] mt-1.5 w-full min-w-[180px] max-h-60 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10">
          {options.map(([optionValue, optionLabel], index) => {
            const selected = optionValue === value;
            const highlighted = index === highlightedIndex;
            return (
              <button
                key={optionValue}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => handleSelect(optionValue)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={
                  selected
                    ? "flex w-full items-center justify-between rounded-xl bg-orange-50 px-3 py-2 text-left text-sm font-semibold text-orange-700"
                    : highlighted
                      ? "flex w-full items-center rounded-xl bg-slate-100 px-3 py-2 text-left text-sm font-semibold text-slate-800"
                      : "flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                }
              >
                <span className="flex-1 truncate text-left">{optionLabel}</span>
                {selected && <Check size={13} className="shrink-0 text-orange-500" strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
