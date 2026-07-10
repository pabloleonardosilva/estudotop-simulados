import { AtSign, ExternalLink, Globe2, GraduationCap } from "lucide-react";

export default function StudentExplanationAuthorCard() {
  return (
    <aside className="mt-5 overflow-hidden rounded-3xl border border-orange-200 bg-white shadow-xl shadow-orange-950/10 ring-1 ring-orange-100/60">
      <div className="bg-slate-950 px-5 py-5 text-white">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-400 text-2xl shadow-lg shadow-orange-500/25">
            🦉
          </div>

          <div className="min-w-0">
            <p className="text-base font-black tracking-tight">
              🦉 Análise do Professor Pablo Leonardo
            </p>
            <p className="mt-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-orange-200/90">
              <GraduationCap size={14} />
              Curadoria editorial EstudoTOP
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <a
          href="https://www.instagram.com/professorpabloleonardo"
          target="_blank"
          rel="noopener noreferrer"
          className="group rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 transition hover:-translate-y-0.5 hover:border-orange-200 hover:bg-orange-50 hover:shadow-md"
        >
          <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
            <AtSign size={15} className="text-pink-600" />
            Instagram
          </span>
          <span className="mt-1 flex min-w-0 items-center gap-2 text-sm font-black text-slate-950">
            <span className="truncate">professorpabloleonardo</span>
            <ExternalLink
              size={14}
              className="shrink-0 text-orange-600 opacity-70 transition group-hover:opacity-100"
            />
          </span>
        </a>

        <a
          href="https://www.estudotop.com.br"
          target="_blank"
          rel="noopener noreferrer"
          className="group rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 transition hover:-translate-y-0.5 hover:border-orange-200 hover:bg-orange-50 hover:shadow-md"
        >
          <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
            <Globe2 size={15} className="text-orange-600" />
            Site
          </span>
          <span className="mt-1 flex min-w-0 items-center gap-2 text-sm font-black text-slate-950">
            <span className="truncate">www.estudotop.com.br</span>
            <ExternalLink
              size={14}
              className="shrink-0 text-orange-600 opacity-70 transition group-hover:opacity-100"
            />
          </span>
        </a>
      </div>
    </aside>
  );
}
