export default function PremiumCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  // Card base usado em dashboards, tabelas e blocos de cadastro.
  return (
    <div className={`rounded-3xl border border-white/70 bg-white/80 p-5 shadow-sm backdrop-blur ${className}`}>
      {children}
    </div>
  );
}
