export default function PageBackground({ children }: { children: React.ReactNode }) {
  // Fundo cinza premium com respiro visual igual ao padrão aprovado no EstudoTOP OS.
  return <section className="px-4 py-6 sm:px-6 lg:px-8">{children}</section>;
}
