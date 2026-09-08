import { sortByPtBrLabel } from "@/app/lib/utils/sort";
import { Children, isValidElement, type ReactNode } from "react";

export default function PremiumSelect({
  sortOptions = false,
  label,
  icon,
  children,
  className = "",
  variant = "light",
  ...props
}: {
  sortOptions?: boolean;
  label?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  variant?: "light" | "jornada";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}) {
  if (sortOptions) {
    const nodes = Children.toArray(children);
    const isChoice = (node: ReactNode) => isValidElement<{ value?: string; children?: ReactNode }>(node) && node.type === "option" && node.props.value !== "";
    const sorted = sortByPtBrLabel(nodes.filter(isChoice), (node) => isValidElement<{ children?: ReactNode }>(node) ? Children.toArray(node.props.children).join("") : "");
    let index = 0;
    children = nodes.map((node) => isChoice(node) ? sorted[index++] : node);
  }
  const dark = variant === "jornada";

  return (
    <div className={dark ? undefined : "et-clean-field-group"}>
      {label && (
        <label className={dark ? "et-admin-dark-label mb-2 flex items-center gap-2" : "et-clean-label mb-2 flex items-center gap-2 text-sm font-medium text-slate-700"}>
          {icon && <span className={dark ? "text-orange-300" : "text-slate-400"}>{icon}</span>}
          {label}
        </label>
      )}

      <select
        {...props}
        className={`${dark ? "et-admin-dark-select h-12 w-full px-4 text-sm outline-none transition focus:border-orange-400/50 focus:ring-4 focus:ring-orange-500/10" : "et-clean-field h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"} ${className}`}
      >
        {children}
      </select>
    </div>
  );
}
