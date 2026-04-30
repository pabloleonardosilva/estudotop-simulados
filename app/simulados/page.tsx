import PageBackground from "../components/ui/PageBackground";
import PageHeader from "../components/ui/PageHeader";
import PremiumButton from "../components/ui/PremiumButton";
import PremiumCard from "../components/ui/PremiumCard";
import StatusPill from "../components/ui/StatusPill";

const simulados = [
  { nome: "SES-MG Informática — Simulado 01", questoes: 20, tempo: "40 min", status: "Publicado" },
  { nome: "TJSP Escrevente — Word e Windows", questoes: 15, tempo: "30 min", status: "Rascunho" },
  { nome: "GCM SP — Internet e Segurança", questoes: 25, tempo: "50 min", status: "Publicado" },
];

export default function SimuladosPage() {
  return (
    <PageBackground>
      <PageHeader
        eyebrow="Gestão de provas"
        title="Simulados cadastrados"
        description="Aqui ficarão os simulados que você venderá ou liberará manualmente para cada aluno. Nesta primeira base, a tela ainda está estática."
        action={<PremiumButton>Novo simulado</PremiumButton>}
      />

      <div className="grid gap-4">
        {simulados.map((simulado) => (
          <PremiumCard key={simulado.nome}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <StatusPill>{simulado.status}</StatusPill>
                <h2 className="mt-3 text-lg font-semibold text-slate-950">{simulado.nome}</h2>
                <p className="mt-1 text-sm text-slate-500">{simulado.questoes} questões · {simulado.tempo} · vídeo de correção Vimeo futuro</p>
              </div>
              <div className="flex gap-2">
                <PremiumButton variant="secondary">Editar</PremiumButton>
                <PremiumButton variant="secondary">Atribuir aluno</PremiumButton>
              </div>
            </div>
          </PremiumCard>
        ))}
      </div>
    </PageBackground>
  );
}
