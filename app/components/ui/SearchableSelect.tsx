"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

export type SearchableSelectOption = {
  value: string;
  label: string;
  group?: string;
};

type Props = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  dark?: boolean;
  className?: string;
};

export default function SearchableSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "Selecione",
  dark = false,
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? "";
  const filtered = search.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  function handleOpen() {
    setOpen(true);
    setSearch("");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleSelect(opt: SearchableSelectOption) {
    onChange(opt.value);
    setOpen(false);
    setSearch("");
  }

  // ─── Dark theme (QuestionEditor, raio-x) ───────────────────────────────────
  if (dark) {
    return (
      <div ref={containerRef} className={`relative ${className}`}>
        {label && (
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
            {label}
          </label>
        )}
        <button
          type="button"
          onClick={handleOpen}
          className="group flex h-12 w-full items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 text-left text-sm font-semibold text-white/70 shadow-sm outline-none transition duration-200 hover:-translate-y-0.5 hover:border-white/[0.14]"
        >
          <span className={`truncate ${value ? "text-white/90" : "text-white/30"}`}>
            {selectedLabel || placeholder}
          </span>
          <span className="flex items-center gap-2">
            {value && <span className="h-2 w-2 rounded-full bg-orange-500" />}
            <ChevronDown
              size={16}
              className={`text-white/30 transition duration-200 group-hover:text-orange-400 ${open ? "rotate-180 text-orange-400" : ""}`}
            />
          </span>
        </button>

        {open && (
          <div className="absolute left-0 top-full z-[9999] mt-2 w-full min-w-[220px] rounded-2xl border border-white/[0.09] bg-[#0D1B2E] shadow-2xl shadow-black/50 backdrop-blur-xl">
            <div className="border-b border-white/[0.07] px-3 py-2">
              <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.06] px-3 py-1.5">
                <Search size={13} className="shrink-0 text-white/30" />
                <input
                  ref={inputRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar..."
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-white/80 outline-none placeholder:text-white/25"
                />
              </div>
            </div>
            <div className="max-h-60 overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <p className="px-3 py-2 text-xs text-white/30">Nenhum resultado</p>
              ) : (
                filtered.map((opt, idx) => {
                  const selected = opt.value === value;
                  const showGroupHeader = !!opt.group && opt.group !== filtered[idx - 1]?.group;
                  return (
                    <div key={opt.value}>
                      {showGroupHeader && (
                        <div className={idx > 0 ? "mt-2 border-t border-white/[0.07] pt-2" : ""}>
                          <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">
                            {opt.group}
                          </p>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => handleSelect(opt)}
                        className={
                          selected
                            ? "flex w-full items-center justify-between rounded-xl border border-orange-500/30 bg-orange-500/[0.12] px-4 py-2.5 text-left text-sm font-semibold text-orange-100"
                            : "flex w-full items-center rounded-xl border border-transparent px-4 py-2.5 text-left text-sm font-semibold text-white/60 hover:border-white/[0.07] hover:bg-white/[0.04] hover:text-white/80"
                        }
                      >
                        <span className="flex-1 text-left">{opt.label}</span>
                        {selected && <Check size={14} className="shrink-0 text-orange-400" strokeWidth={3} />}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Light theme (importar, PremiumSelect contexts) ────────────────────────
  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label className="mb-2 block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <button
        type="button"
        onClick={handleOpen}
        className="flex h-12 w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 text-left text-sm font-semibold text-slate-700 shadow-sm outline-none transition hover:border-orange-200 focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
      >
        <span className={`truncate ${value ? "text-slate-800" : "text-slate-400"}`}>
          {selectedLabel || placeholder}
        </span>
        <ChevronDown size={14} className={`ml-1 shrink-0 text-slate-400 transition ${open ? "rotate-180 text-orange-500" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-[9999] mt-1.5 w-full min-w-[200px] rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
          <div className="border-b border-slate-100 px-3 py-2">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5">
              <Search size={13} className="shrink-0 text-slate-400" />
              <input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-700 outline-none placeholder:text-slate-400"
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-400">Nenhum resultado</p>
            ) : (
              filtered.map((opt) => {
                const selected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt)}
                    className={
                      selected
                        ? "flex w-full items-center justify-between rounded-xl bg-orange-50 px-3 py-2 text-left text-sm font-semibold text-orange-700"
                        : "flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                    }
                  >
                    <span className="flex-1 truncate text-left">{opt.label}</span>
                    {selected && <Check size={13} className="shrink-0 text-orange-500" strokeWidth={3} />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
