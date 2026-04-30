import PageBackground from "../components/ui/PageBackground";
import PageHeader from "../components/ui/PageHeader";
import PremiumButton from "../components/ui/PremiumButton";
import PremiumCard from "../components/ui/PremiumCard";

export default function QuestoesPage() {
  return (
    <PageBackground>
      <PageHeader
        eyebrow="Banco de questões"
        title="Questões"
        description="Área planejada para cadastrar enunciado, alternativas, gabarito, comentário, assunto, banca, dificuldade e vínculo com simulados."
        action={<PremiumButton>Nova questão</PremiumButton>}
      />

      <PremiumCard>
        <h2 className="text-lg font-semibold text-slate-950">Modelo da questão</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Nesta fase inicial a página é demonstrativa. Na fase de banco de dados, criaremos formulário real com alternativas A, B, C, D e E, gabarito, explicação textual e vídeo de correção.
        </p>
        <div className="mt-5 rounded-2xl bg-slate-50 p-5 text-sm text-slate-700">
          <p className="font-semibold">Exemplo:</p>
          <p className="mt-2">No Microsoft Word, qual recurso permite criar uma lista automática de títulos?</p>
          <div className="mt-4 grid gap-2">
            {['A) Mala direta', 'B) Sumário automático', 'C) Comentários', 'D) Controle de alterações', 'E) Layout de impressão'].map((alt) => <div key={alt} className="rounded-xl bg-white p-3">{alt}</div>)}
          </div>
        </div>
      </PremiumCard>
    </PageBackground>
  );
}
