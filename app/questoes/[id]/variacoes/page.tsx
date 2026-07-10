import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import PremiumButton from "../../../components/ui/PremiumButton";
import GerarVariacoesQuestaoClient from "./page-client";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function GerarVariacoesQuestaoPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = createSupabaseAdminClient();

  const { data: question, error } = await supabase
    .from("questions")
    .select(
      `
      id,
      code,
      statement,
      status,
      question_type,
      difficulty_level,
      year,
      explanation_text,
      exam_boards:exam_board_id (
        id,
        name
      ),
      subjects:subject_id (
        id,
        name,
        disciplines:discipline_id (
          id,
          name
        )
      ),
      question_subjects (
        subjects (
          id,
          name,
          disciplines:discipline_id (
            id,
            name
          )
        )
      ),
      question_alternatives (
        id,
        label,
        text,
        is_correct,
        order_number
      )
    `,
    )
    .eq("id", id)
    .single();

  if (error || !question) {
    return (
      <main className="min-h-screen bg-slate-100 px-6 py-10 text-slate-950">
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-red-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-600">
            Questão não encontrada
          </p>

          <h1 className="mt-2 text-2xl font-black text-slate-950">
            Não foi possível carregar a tela de variações.
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            Verifique se a questão existe no banco e tente novamente.
          </p>

          <div className="mt-6">
            <Link href="/questoes">
              <PremiumButton variant="secondary">
                Voltar para questões
              </PremiumButton>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const sortedAlternatives = [...(question.question_alternatives || [])].sort(
    (a: any, b: any) =>
      Number(a.order_number || 0) - Number(b.order_number || 0),
  );

  return (
    <GerarVariacoesQuestaoClient
      question={
        {
          ...question,
          question_alternatives: sortedAlternatives,
        } as unknown as any
      }
    />
  );
}
