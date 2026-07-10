export const qCard = {
  wrapper:
    "rounded-[2rem] border border-slate-200 bg-white p-0 shadow-sm shadow-slate-950/5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl",
  wrapperImagePending:
    "rounded-[2rem] border border-blue-300 bg-blue-50 p-0 shadow-sm shadow-blue-950/5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl",
  wrapperSelected:
    "rounded-[2rem] border border-orange-300 bg-orange-50 p-0 shadow-sm shadow-orange-950/10 ring-1 ring-orange-100 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl",
  statement:
    "mt-4 rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-4 text-sm leading-7 text-slate-800 md:text-[15px]",
  footer:
    "flex flex-col gap-3 rounded-b-[2rem] border-t border-slate-100 bg-white/95 px-6 py-4 backdrop-blur-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-end",
  tags: {
    row: "flex flex-wrap items-center gap-2",
    primary: "rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white shadow-sm",
    success: "rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-bold text-emerald-700",
    warning: "rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-bold text-amber-700",
    brand: "rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700",
    neutral: "rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600",
    muted: "rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-400",
  },
  alts: {
    base: "rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 transition",
    selected: "rounded-2xl border-2 border-orange-400 bg-orange-50 px-4 py-3 text-sm text-slate-800 ring-4 ring-orange-100 transition",
    correct: "rounded-2xl border border-emerald-300 bg-emerald-50/90 px-4 py-3 text-sm font-semibold text-emerald-900 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.10)] transition",
    wrong: "rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 transition",
    labelBase: "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-black text-slate-600",
    labelSelected: "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-orange-500 bg-orange-500 text-xs font-black text-white",
    labelCorrect: "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-emerald-500 bg-emerald-500 text-xs font-black text-white shadow-sm",
    labelWrong: "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-red-500 bg-red-500 text-xs font-black text-white",
    text: "prose prose-slate max-w-none text-sm leading-6",
  },
};
