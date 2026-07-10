const SIZES = { sm: 22, md: 30, lg: 40, xl: 56 } as const;

export default function TopCoinStack({
  size = "sm",
  className = "",
}: {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const px = SIZES[size];

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/images/pilha-moedas.png"
      alt=""
      aria-hidden="true"
      width={px}
      height={px}
      className={`inline-block shrink-0 object-contain drop-shadow-[0_2px_3px_rgba(120,53,15,0.35)] ${className}`}
    />
  );
}
