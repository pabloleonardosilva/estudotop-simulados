import PageBackground from "../components/ui/PageBackground";
import PageHeader from "../components/ui/PageHeader";
import PremiumButton from "../components/ui/PremiumButton";
import PremiumCard from "../components/ui/PremiumCard";

const alunos = [
  { nome: "Mariana Souza", email: "mariana@email.com", acesso: "SES-MG Simulado 01", status: "Ativo" },
  { nome: "Rafael Lima", email: "rafael@email.com", acesso: "TJSP Word e Windows", status: "Ativo" },
  { nome: "Camila Torres", email: "camila@email.com", acesso: "GCM SP Segurança", status: "Pendente" },
];

export default function AlunosPage() {
  return (
    <PageBackground>
      <PageHeader
        eyebrow="Controle de acesso"
        title="Alunos"
        description="Tela inicial para cadastro de alunos, geração de usuário/senha e atribuição manual dos simulados comprados."
        action={<PremiumButton>Novo aluno</PremiumButton>}
      />

      <PremiumCard>
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-widest text-slate-500">
              <tr><th className="p-4">Aluno</th><th className="p-4">E-mail</th><th className="p-4">Simulado</th><th className="p-4">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {alunos.map((aluno) => (
                <tr key={aluno.email}><td className="p-4 font-semibold text-slate-800">{aluno.nome}</td><td className="p-4 text-slate-600">{aluno.email}</td><td className="p-4 text-slate-600">{aluno.acesso}</td><td className="p-4 text-slate-600">{aluno.status}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </PremiumCard>
    </PageBackground>
  );
}
