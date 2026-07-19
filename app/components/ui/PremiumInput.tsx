import { ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export default function PremiumInput({
  label,
  icon,
  textarea = false,
  uppercase = false,
  premiumStepper = false,
  onStep,
  onChange,
  className = "",
  variant = "light",
  ...props
}: {
  label?: string;
  icon?: ReactNode;
  textarea?: boolean;
  uppercase?: boolean;
  premiumStepper?: boolean;
  onStep?: (value: number) => void;
  onChange?: (e: any) => void;
  className?: string;
  variant?: "light" | "jornada";
  [key: string]: any;
}) {
  function handleChange(e: any) {
    if (uppercase) {
      e.target.value = e.target.value.toUpperCase();
    }

    if (onChange) onChange(e);
  }

  const dark = variant === "jornada";
  const numericValue = Number(props.value);
  const minimum = Number.isFinite(Number(props.min)) ? Number(props.min) : Number.NEGATIVE_INFINITY;
  const maximum = Number.isFinite(Number(props.max)) ? Number(props.max) : Number.POSITIVE_INFINITY;
  const step = Number.isFinite(Number(props.step)) && Number(props.step) > 0 ? Number(props.step) : 1;

  function handleStep(direction: 1 | -1) {
    const fallback = Number.isFinite(minimum) ? minimum : 0;
    const current = Number.isFinite(numericValue) ? numericValue : fallback;
    onStep?.(Math.min(maximum, Math.max(minimum, current + direction * step)));
  }

  return (
    <div>
      {label && (
        <label className={dark ? "mb-2 flex items-center gap-2 text-sm font-medium text-slate-300" : "mb-2 flex items-center gap-2 text-sm font-medium text-slate-700"}>
          {icon && <span className={dark ? "text-blue-300" : "text-slate-400"}>{icon}</span>}
          {label}
        </label>
      )}

      {textarea ? (
        <textarea
          {...props}
          onChange={handleChange}
          className={`${dark ? "min-h-32 w-full resize-none rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-orange-400/50 focus:ring-4 focus:ring-orange-500/10" : "min-h-32 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100"} ${className}`}
        />
      ) : premiumStepper ? (
        <div className="relative">
          <input
            {...props}
            onChange={handleChange}
            className={`${dark ? "h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 pr-12 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-orange-400/50 focus:ring-4 focus:ring-orange-500/10" : "h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 pr-12 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100"} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${className}`}
          />
          <div className={`absolute bottom-1 right-1 top-1 flex w-8 flex-col overflow-hidden rounded-[10px] border shadow-sm ${
            dark
              ? "border-orange-300/15 bg-white/[0.045] shadow-black/20"
              : "border-slate-200 bg-slate-50 shadow-slate-200/60"
          }`}>
            <button
              type="button"
              onClick={() => handleStep(1)}
              disabled={numericValue >= maximum}
              aria-label={`Aumentar ${label || "valor"}`}
              className={`flex min-h-0 flex-1 items-center justify-center border-b transition disabled:cursor-not-allowed disabled:opacity-30 ${
                dark
                  ? "border-orange-300/10 text-slate-400 hover:bg-orange-500/15 hover:text-orange-200 focus:bg-orange-500/15 focus:text-orange-200 focus:outline-none"
                  : "border-slate-200 text-slate-400 hover:bg-orange-50 hover:text-orange-600 focus:bg-orange-50 focus:text-orange-600 focus:outline-none"
              }`}
            >
              <ChevronUp size={13} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={() => handleStep(-1)}
              disabled={numericValue <= minimum}
              aria-label={`Diminuir ${label || "valor"}`}
              className={`flex min-h-0 flex-1 items-center justify-center transition disabled:cursor-not-allowed disabled:opacity-30 ${
                dark
                  ? "text-slate-400 hover:bg-orange-500/15 hover:text-orange-200 focus:bg-orange-500/15 focus:text-orange-200 focus:outline-none"
                  : "text-slate-400 hover:bg-orange-50 hover:text-orange-600 focus:bg-orange-50 focus:text-orange-600 focus:outline-none"
              }`}
            >
              <ChevronDown size={13} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      ) : (
        <input
          {...props}
          onChange={handleChange}
          className={`${dark ? "h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-orange-400/50 focus:ring-4 focus:ring-orange-500/10" : "h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100"} ${className}`}
        />
      )}
    </div>
  );
}
