import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { logSystemError } from "@/app/lib/server/auditLogger";

function getOwlHelpLimit(totalQuestions: number) {
  return Math.max(1, Math.floor(Math.max(0, totalQuestions) * 0.1));
}

function pickTwoWrong<T>(items: T[]) {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 2);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; attemptId: string }> },
) {
  const student = await getStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  }

  const { id: simuladoId, attemptId } = await params;
  const body = await request.json().catch(() => ({}));
  const simuladoQuestionId = String(body.simulado_question_id || "").trim();

  if (!simuladoQuestionId) {
    return NextResponse.json({ ok: false, message: "Questão não informada." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  const { data: attempt, error: attemptError } = await supabase
    .from("simulado_attempts")
    .select("id, simulado_id, student_id, status, total_questions, question_order, owl_help_used_count, owl_help_data")
    .eq("id", attemptId)
    .eq("simulado_id", simuladoId)
    .eq("student_id", student.id)
    .single();

  if (attemptError || !attempt) {
    return NextResponse.json({ ok: false, message: "Tentativa não encontrada." }, { status: 404 });
  }

  if (attempt.status !== "in_progress") {
    return NextResponse.json({ ok: false, message: "A ajuda só pode ser usada em tentativa em andamento." }, { status: 400 });
  }

  const { data: simulado, error: simuladoError } = await supabase
    .from("simulados")
    .select("id, owl_help_enabled")
    .eq("id", simuladoId)
    .single();

  if (simuladoError || !simulado || !(simulado as any).owl_help_enabled) {
    return NextResponse.json({ ok: false, message: "A Ajuda da Coruja não está habilitada neste simulado." }, { status: 403 });
  }

  const order = Array.isArray(attempt.question_order) ? attempt.question_order as { simulado_question_id: string; question_id: string }[] : [];
  const orderEntry = order.find((item) => item.simulado_question_id === simuladoQuestionId);
  if (!orderEntry) {
    return NextResponse.json({ ok: false, message: "Questão não pertence a esta tentativa." }, { status: 400 });
  }

  const currentData = (attempt.owl_help_data && typeof attempt.owl_help_data === "object" ? attempt.owl_help_data : {}) as Record<string, string[]>;
  if (Array.isArray(currentData[simuladoQuestionId])) {
    return NextResponse.json({
      ok: true,
      hiddenAlternativeIds: currentData[simuladoQuestionId],
      used: Number(attempt.owl_help_used_count || 0),
      limit: getOwlHelpLimit(Number(attempt.total_questions || 0)),
      reused: true,
    });
  }

  const limit = getOwlHelpLimit(Number(attempt.total_questions || 0));
  const used = Number(attempt.owl_help_used_count || 0);
  if (used >= limit) {
    return NextResponse.json({ ok: false, message: "Você já usou todas as ajudas disponíveis neste simulado." }, { status: 403 });
  }

  const { data: relation, error: relationError } = await supabase
    .from("simulado_questions")
    .select("id, question_id, questions:question_id(question_type, question_alternatives(id, is_correct))")
    .eq("id", simuladoQuestionId)
    .eq("simulado_id", simuladoId)
    .single();

  if (relationError || !relation) {
    return NextResponse.json({ ok: false, message: "Questão não encontrada." }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const questionType = String((relation as any).questions?.question_type || "").toLowerCase();
  if (questionType === "true_false") {
    return NextResponse.json({ ok: false, message: "A Ajuda da Coruja não pode ser usada em questões de certo ou errado." }, { status: 400 });
  }

  const alternatives = ((relation as any).questions?.question_alternatives || []) as { id: string; is_correct: boolean }[];
  const wrong = alternatives.filter((alt) => !alt.is_correct);
  const selected = pickTwoWrong(wrong).map((alt) => alt.id);

  if (selected.length < 2) {
    return NextResponse.json({ ok: false, message: "Não há alternativas erradas suficientes para eliminar." }, { status: 400 });
  }

  const nextData = { ...currentData, [simuladoQuestionId]: selected };
  const nextUsed = used + 1;

  const { error: updateError } = await supabase
    .from("simulado_attempts")
    .update({
      owl_help_used_count: nextUsed,
      owl_help_data: nextData,
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", attemptId)
    .eq("student_id", student.id);

  if (updateError) {
    void logSystemError({ source: "api.student.owl_help", error: updateError, request, metadata: { attempt_id: attemptId } });
    return NextResponse.json({ ok: false, message: "Não foi possível usar a ajuda agora." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    hiddenAlternativeIds: selected,
    used: nextUsed,
    limit,
  });
}
