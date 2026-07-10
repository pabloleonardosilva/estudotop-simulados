import { difficultyStars } from "@/lib/utils/difficulty-stars";

export default function PremiumDifficultyStars({
  value,
  compact = false,
  className = "",
}: {
  value?: number | string | null;
  compact?: boolean;
  className?: string;
}) {
  const level = Number(value || 0);
  const safeLevel = Number.isInteger(level) && level >= 1 && level <= 5 ? level : 0;
  const text = difficultyStars(safeLevel);

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full border border-amber-300/70 bg-gradient-to-r from-white via-orange-50 to-amber-50 ${compact ? "px-2.5 py-1 text-[13px]" : "px-3.5 py-1.5 text-[15px]"} font-black tracking-[0.08em] shadow-sm shadow-orange-500/10 ring-1 ring-white/70 ${className}`}
      title={text}
      aria-label={text}
    >
      {Array.from({ length: 5 }).map((_, index) => {
        const filled = index < safeLevel;
        return (
          <span
            key={index}
            className={
              filled
                ? "bg-gradient-to-b from-amber-300 via-orange-500 to-orange-700 bg-clip-text text-transparent drop-shadow-[0_1px_0_rgba(251,146,60,0.18)]"
                : "text-amber-200/80"
            }
          >
            {filled ? "★" : "☆"}
          </span>
        );
      })}
    </span>
  );
}

export { PremiumDifficultyStars };
