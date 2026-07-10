import { AtSign, ExternalLink, Globe2, GraduationCap } from "lucide-react";

export default function ExplanationAuthorCard() {
  return (
    <aside className="mt-4 overflow-hidden rounded-2xl border border-orange-200 bg-white shadow-sm">
      <div className="bg-slate-950 px-5 py-4 text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500 text-white shadow-lg shadow-orange-500/20">
            <GraduationCap size={22} />
          </div>

          <div>
            <p className="text-sm font-black">Comentario feito pelo Professor Pablo Leonardo</p>
            <p className="mt-0.5 text-xs text-white/60">EstudoTOP</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <a
          href="https://www.instagram.com/professorpabloleonardo"
          target="_blank"
          rel="noopener noreferrer"
          className="group rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 transition hover:border-orange-200 hover:bg-orange-50"
        >
          <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
            <AtSign size={15} className="text-pink-600" />
            Instagram
          </span>
          <span className="mt-1 flex items-center gap-2 text-sm font-black text-slate-950">
            professorpabloleonardo
            <ExternalLink size={14} className="text-orange-600 opacity-0 transition group-hover:opacity-100" />
          </span>
        </a>

        <a
          href="https://www.estudotop.com.br"
          target="_blank"
          rel="noopener noreferrer"
          className="group rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 transition hover:border-orange-200 hover:bg-orange-50"
        >
          <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
            <Globe2 size={15} className="text-orange-600" />
            Site
          </span>
          <span className="mt-1 flex items-center gap-2 text-sm font-black text-slate-950">
            www.estudotop.com.br
            <ExternalLink size={14} className="text-orange-600 opacity-0 transition group-hover:opacity-100" />
          </span>
        </a>
      </div>
    </aside>
  );
}
