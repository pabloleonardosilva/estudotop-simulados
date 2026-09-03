"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

export type ProfessorAssignmentOption = { id: string; name: string; email: string; status: string };

type Props = {
  professors: ProfessorAssignmentOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
};

export default function ProfessorAssignmentPicker({ professors, selectedIds, onChange }: Props) {
  const [search, setSearch] = useState("");

  const selected = useMemo(
    () => selectedIds
      .map((id) => professors.find((professor) => professor.id === id))
      .filter((item): item is ProfessorAssignmentOption => Boolean(item)),
    [professors, selectedIds],
  );

  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    return professors
      .filter((professor) => !selectedIds.includes(professor.id))
      .filter((professor) => !term || professor.name.toLowerCase().includes(term) || professor.email.toLowerCase().includes(term))
      .slice(0, 30);
  }, [professors, selectedIds, search]);

  function addProfessor(id: string) {
    if (selectedIds.includes(id)) return;
    onChange([...selectedIds, id]);
    setSearch("");
  }

  function removeProfessor(id: string) {
    onChange(selectedIds.filter((professorId) => professorId !== id));
  }

  return (
    <div className="space-y-3">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((professor) => (
            <span key={professor.id} className="flex items-center gap-2 rounded-xl border border-orange-400/40 bg-orange-500/10 py-2 pl-3 pr-2 text-orange-100">
              <span className="min-w-0">
                <span className="block max-w-[14rem] truncate text-sm font-bold leading-tight">{professor.name}</span>
                <span className="block max-w-[14rem] truncate text-xs text-orange-200/70">{professor.email}</span>
              </span>
              <button
                type="button"
                onClick={() => removeProfessor(professor.id)}
                aria-label={`Remover ${professor.name} dos professores responsáveis`}
                className="shrink-0 rounded-full p-1 text-orange-200/70 transition hover:bg-orange-500/20 hover:text-orange-100"
              >
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <label htmlFor="professor-assignment-search" className="sr-only">
          Buscar professor por nome ou e-mail
        </label>
        <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 focus-within:border-orange-400/40">
          <Search size={14} className="shrink-0 text-slate-500" />
          <input
            id="professor-assignment-search"
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar professor por nome ou e-mail"
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-500"
            role="combobox"
            aria-expanded={search.trim().length > 0}
            aria-controls="professor-assignment-results"
            autoComplete="off"
          />
        </div>

        {search.trim().length > 0 && (
          <div
            id="professor-assignment-results"
            role="listbox"
            aria-label="Resultados da busca de professores"
            className="absolute left-0 right-0 top-full z-10 mt-2 max-h-56 overflow-y-auto rounded-xl border border-white/[0.08] bg-[#0D1B2E] p-2 shadow-2xl shadow-black/50"
          >
            {results.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-500">Nenhum professor encontrado.</p>
            ) : (
              results.map((professor) => (
                <button
                  key={professor.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => addProfessor(professor.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition hover:bg-white/[0.06]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-200">{professor.name}</span>
                    <span className="block truncate text-xs text-slate-500">{professor.email}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {professors.length === 0 && <p className="text-sm text-slate-500">Nenhum professor cadastrado.</p>}
    </div>
  );
}
