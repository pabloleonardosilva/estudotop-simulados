export function difficultyStars(value?: number | string | null) {
  const level = Number(value || 0);
  if (!Number.isInteger(level) || level < 1 || level > 5) return "☆☆☆☆☆";
  return `${"★".repeat(level)}${"☆".repeat(5 - level)}`;
}

export function difficultyStarsClassName() {
  return "inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black tracking-[0.08em] text-amber-600 shadow-sm shadow-amber-500/10";
}
