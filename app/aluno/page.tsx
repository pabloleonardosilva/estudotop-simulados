import PageBackground from "../components/ui/PageBackground";
import PageHeader from "../components/ui/PageHeader";
import PremiumButton from "../components/ui/PremiumButton";
import PremiumCard from "../components/ui/PremiumCard";
import MetricCard from "../components/ui/MetricCard";

export default function AreaAlunoPage() {
  return (
    <PageBackground>
      <PageHeader
        eyebrow="Área do aluno"
        title="Olá, Mariana. Seu simulado está liberado."
        description="Interface simples: o aluno entra e já encontra o simulado que você atribuiu no painel administrativo."
        action={<PremiumButton href="/aluno/simulado">Iniciar simulado</PremiumButton>}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Tentativas" value="0/1" detail="simulado completo" />
        <MetricCard label="Tempo" value="40 min" detail="tempo total previsto" />
        <MetricCard label="Questões" value="20" detail="prova objetiva" />
      </div>

      <PremiumCard className="mt-6">
        <h2 className="text-lg font-semibold text-slate-950">SES-MG Informática — Simulado 01</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Ao iniciar, evite sair da tela. Na versão final, o sistema poderá registrar troca de aba e aplicar a regra definida por você.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {['Correção por vídeo', 'Resultado final', 'Dashboard', 'Explicação por IA futura'].map((item) => <span key={item} className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">{item}</span>)}
        </div>
      </PremiumCard>
    </PageBackground>
  );
}
