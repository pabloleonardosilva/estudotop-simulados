import { BookOpen, TrendingUp, UsersRound } from "lucide-react";
import PageBackground from "./components/ui/PageBackground";
import PageHeader from "./components/ui/PageHeader";
import PremiumCard from "./components/ui/PremiumCard";
import PremiumButton from "./components/ui/PremiumButton";
import MetricCard from "./components/ui/MetricCard";
import { requireAdminPage } from "@/lib/server/authGuard";

export default async function HomePage() {
  await requireAdminPage();
  return (
    <PageBackground>
      <PageHeader
        eyebrow="Produto educacional"
        title="EstudoTOP Simulados"
        description="Base inicial do sistema próprio de simulados para concursos: painel administrativo, área do aluno, controle de tentativas, correção por vídeo e futura explicação por IA."
        action={<PremiumButton href="/simulados">Gerenciar simulados</PremiumButton>}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Simulados" value="12" detail="Cadastrados no painel" icon={<BookOpen size={16} />} />
        <MetricCard label="Alunos" value="248" detail="Usuários com acesso" icon={<UsersRound size={16} />} />
        <MetricCard label="Aproveitamento" value="73%" detail="Média geral simulada" icon={<TrendingUp size={16} />} />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <PremiumCard>
          <h2 className="text-lg font-semibold text-slate-950">Fluxo do aluno</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            O aluno acessa com usuário e senha, visualiza o simulado atribuído, responde dentro das regras definidas e recebe resultado com vídeo de correção.
          </p>
          <div className="mt-5 grid gap-3 text-sm text-slate-700">
            <div className="rounded-2xl bg-slate-50 p-4">1. Login do aluno</div>
            <div className="rounded-2xl bg-slate-50 p-4">2. Simulado liberado</div>
            <div className="rounded-2xl bg-slate-50 p-4">3. Resultado + correção</div>
          </div>
        </PremiumCard>

        <PremiumCard>
          <h2 className="text-lg font-semibold text-slate-950">Fluxo administrativo</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            O administrador cadastra simulados, questões, alternativas, vídeos, alunos e permissões de acesso.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {['Simulados', 'Questões', 'Alunos', 'Tentativas', 'Dashboard', 'IA futura'].map((item) => (
              <span key={item} className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">{item}</span>
            ))}
          </div>
        </PremiumCard>
      </div>
    </PageBackground>
  );
}
