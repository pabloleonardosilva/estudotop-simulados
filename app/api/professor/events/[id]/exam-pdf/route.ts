import { NextResponse } from "next/server";
import { requireEventManager } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

// Dados neutros para o PDF da prova gerado por Professor/Admin a partir do
// Evento: nenhuma tentativa, aluno, resposta ou dado pessoal é lido ou
// retornado aqui — apenas o Simulado vinculado ao Evento e suas questões
// (mesmo formato consumido pelo renderer compartilhado em
// app/lib/pdf/simulado-result-pdf.ts). O gabarito (`is_correct`) nem é
// selecionado do banco aqui — o renderer já é chamado em modo neutro
// (`showAnswerKey: false`, ver downloadNeutralSimuladoPdf), então essa rota
// simplesmente nunca busca nem devolve a resposta correta.
type QuestionRow = {
  id: string;
  order_number: number;
  status: string;
  questions: {
    statement: string | null;
    question_alternatives: { id: string; label: string | null; text: string | null }[];
    subjects: { name: string | null } | null;
  } | null;
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const manager = await requireEventManager(request, id);
  if (manager instanceof NextResponse) return manager;

  const supabase = createSupabaseAdminClient();

  const { data: event, error: eventError } = await supabase
    .from("simulado_events")
    .select("simulado_id, simulados:simulado_id(id,title)")
    .eq("id", id)
    .maybeSingle();

  if (eventError) {
    return NextResponse.json({ ok: false, message: "Não foi possível carregar o Evento." }, { status: 500 });
  }
  if (!event) {
    return NextResponse.json({ ok: false, message: "Evento não encontrado." }, { status: 404 });
  }

  const simulado = Array.isArray(event.simulados) ? event.simulados[0] : event.simulados;
  if (!event.simulado_id || !simulado) {
    return NextResponse.json({ ok: false, message: "Este evento não possui um simulado disponível para geração do PDF." }, { status: 400 });
  }

  const { data: questionRows, error: questionsError } = await supabase
    .from("simulado_questions")
    .select(
      "id, order_number, status, questions:question_id(statement, question_alternatives(id,label,text), subjects:subject_id(name))",
    )
    .eq("simulado_id", event.simulado_id)
    .order("order_number", { ascending: true });

  if (questionsError) {
    return NextResponse.json({ ok: false, message: "Não foi possível carregar as questões do simulado." }, { status: 500 });
  }

  const questions = ((questionRows || []) as unknown as QuestionRow[]).map((row) => ({
    simulado_question_id: row.id,
    order_number: row.order_number,
    statement: row.questions?.statement || null,
    subject: row.questions?.subjects?.name || null,
    alternatives: (row.questions?.question_alternatives || []).map((alt) => ({
      id: alt.id,
      label: alt.label || "",
      text: alt.text || "",
    })),
  }));

  return NextResponse.json({
    ok: true,
    message: "Dados da prova carregados.",
    simulado: { title: simulado.title },
    questions,
  });
}
