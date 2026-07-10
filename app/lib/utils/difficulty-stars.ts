export function difficultyStars(value?: number | string | null) {
  const level = Number(value || 0);
  if (!Number.isInteger(level) || level < 1 || level > 5) return "☆☆☆☆☆";
  return `${"★".repeat(level)}${"☆".repeat(5 - level)}`;
}

export function difficultyStarsClassName() {
  return "inline-flex items-center rounded-full border border-amber-300/70 bg-gradient-to-r from-white via-orange-50 to-amber-50 px-3.5 py-1.5 text-[15px] font-black tracking-[0.08em] text-orange-600 shadow-sm shadow-orange-500/10 ring-1 ring-white/70";
}
