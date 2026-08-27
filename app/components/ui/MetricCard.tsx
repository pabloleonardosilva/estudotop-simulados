import type { ReactNode } from "react";

export default function MetricCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon?: ReactNode;
}) {
  return (
    <div className="et-admin-dark-card px-4 py-4">
      <div className="flex items-center gap-3">
        {icon && <div className="et-admin-dark-icon-box et-admin-dark-icon-box-orange">{icon}</div>}
        <div className="min-w-0">
          <p className="et-admin-dark-label truncate whitespace-nowrap" title={label}>{label}</p>
          <p className="mt-0.5 truncate text-xl font-black tracking-[-0.04em] text-white">{value}</p>
          <p className="et-admin-dark-muted mt-0.5 truncate">{detail}</p>
        </div>
      </div>
    </div>
  );
}
