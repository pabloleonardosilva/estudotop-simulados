import PageBackground from "../components/ui/PageBackground";
import PageHeader from "../components/ui/PageHeader";
import PremiumCard from "../components/ui/PremiumCard";
import MetricCard from "../components/ui/MetricCard";
import { requireAdminPage } from "@/lib/server/authGuard";

const desempenho = [
  { nome: "SES-MG Informática", media: "81%", alunos: 76 },
  { nome: "TJSP Escrevente", media: "68%", alunos: 42 },
  { nome: "GCM São Paulo", media: "74%", alunos: 31 },
];

export default async function DashboardPage() {
  await requireAdminPage();
  return (
    <PageBackground>
      <PageHeader
        eyebrow="Painel administrativo"
        title="Dashboard de desempenho"
        description="Visão executiva para acompanhar alunos, simulados, aproveitamento, erros recorrentes e evolução da plataforma."
      />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Alunos ativos" value="248" detail="com acesso liberado" />
        <MetricCard label="Tentativas" value="391" detail="registradas no mês" />
        <MetricCard label="Média geral" value="73%" detail="aproveitamento" />
        <MetricCard label="Questões" value="860" detail="na base futura" />
      </div>

      <PremiumCard className="mt-6">
        <h2 className="text-lg font-semibold text-slate-950">Simulados com maior movimentação</h2>
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-widest text-slate-500">
              <tr><th className="p-4">Simulado</th><th className="p-4">Média</th><th className="p-4">Alunos</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {desempenho.map((item) => (
                <tr key={item.nome}><td className="p-4 font-semibold text-slate-800">{item.nome}</td><td className="p-4 text-slate-600">{item.media}</td><td className="p-4 text-slate-600">{item.alunos}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </PremiumCard>
    </PageBackground>
  );
}
