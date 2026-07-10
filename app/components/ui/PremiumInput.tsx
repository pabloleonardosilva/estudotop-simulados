import { ReactNode } from "react";

export default function PremiumInput({
  label,
  icon,
  textarea = false,
  uppercase = false,
  onChange,
  className = "",
  variant = "light",
  ...props
}: {
  label?: string;
  icon?: ReactNode;
  textarea?: boolean;
  uppercase?: boolean;
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
