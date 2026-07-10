import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdmin } from "@/lib/server/authGuard";

export const maxDuration = 120;

type IncomingAlternative = {
  label: string;
  text: string;
  is_correct: boolean;
};

type IncomingQuestion = {
  statement: string;
  question_type: "multiple_choice" | "true_false";
  alternatives: IncomingAlternative[];
  subject_id: string | null;
  subject_ids?: string[];
  exam_board_id: string;
  year?: number;
  difficulty_level?: number;
  explanation_text?: string | null;
  module_name?: string | null;
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await params;
    const body = await request.json();
    const simuladoTitle = String(body.simulado_title || "").trim() || "Simulado Clone";
    const questions: IncomingQuestion[] = Array.isArray(body.questions) ? body.questions : [];

    if (!questions.length) {
      return NextResponse.json({ ok: false, message: "Nenhuma questão para salvar." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // Verify analysis exists
    const { data: analysis, error: analysisError } = await supabase
      .from("exam_analyses")
      .select("id, title, discipline_id, contest_name")
      .eq("id", id)
      .single();

    if (analysisError || !analysis) {
      return NextResponse.json({ ok: false, message: "Análise não encontrada." }, { status: 404 });
    }

    const savedQuestionIds: string[] = [];

    // Save each question to banco
    for (const q of questions) {
      const { data: savedQ, error: qError } = await supabase
        .from("questions")
        .insert({
          statement: q.statement,
          question_type: q.question_type,
          status: "published",
          difficulty_level: Math.max(1, Math.min(5, Number(q.difficulty_level ?? 3))),
          year: Number(q.year ?? new Date().getFullYear()),
          exam_board_id: q.exam_board_id || null,
          subject_id: q.subject_id || null,
          explanation_text: q.explanation_text || null,
          source_origin: "exam_clone",
          orgao: analysis.contest_name || null,
        })
        .select("id")
        .single();

      if (qError || !savedQ) {
        return NextResponse.json({ ok: false, message: `Erro ao salvar questão: ${qError?.message}` }, { status: 500 });
      }

      // Save alternatives
      const altsToInsert = (Array.isArray(q.alternatives) ? q.alternatives : []).map((alt, idx) => ({
        question_id: savedQ.id,
        label: String(alt.label || String.fromCharCode(65 + idx)).toUpperCase().slice(0, 2),
        text: String(alt.text || ""),
        is_correct: Boolean(alt.is_correct),
        order_number: idx + 1,
      }));

      if (altsToInsert.length) {
        const { error: altError } = await supabase.from("question_alternatives").insert(altsToInsert);
        if (altError) {
          return NextResponse.json({ ok: false, message: `Erro ao salvar alternativas: ${altError.message}` }, { status: 500 });
        }
      }

      // Save subject_ids to question_subjects junction (if multiple subjects)
      const subjectIds = Array.isArray(q.subject_ids) && q.subject_ids.length ? q.subject_ids : q.subject_id ? [q.subject_id] : [];
      if (subjectIds.length > 1) {
        const subjectRows = subjectIds.map((sid) => ({ question_id: savedQ.id, subject_id: sid }));
        await supabase.from("question_subjects").insert(subjectRows).select();
      }

      savedQuestionIds.push(savedQ.id);
    }

    // Create draft simulado
    const { data: simulado, error: simuladoError } = await supabase
      .from("simulados")
      .insert({
        title: simuladoTitle,
        status: "draft",
        scoring_model: "traditional",
        navigation_type: "open",
        feedback_mode: "final_only",
        question_count: savedQuestionIds.length,
        shuffle_questions: false,
        shuffle_alternatives: false,
        allow_blank_answers: true,
        source_exam_analysis_id: id,
      })
      .select("id")
      .single();

    if (simuladoError || !simulado) {
      return NextResponse.json({ ok: false, message: `Erro ao criar simulado: ${simuladoError?.message}` }, { status: 500 });
    }

    // Link questions to simulado
    const links = savedQuestionIds.map((qId, idx) => ({
      simulado_id: simulado.id,
      question_id: qId,
      order_number: idx + 1,
      points: 1,
      status: "active",
    }));

    const { error: linkError } = await supabase.from("simulado_questions").insert(links);
    if (linkError) {
      return NextResponse.json({ ok: false, message: `Erro ao vincular questões: ${linkError.message}` }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      simulado_id: simulado.id,
      simulado_title: simuladoTitle,
      question_count: savedQuestionIds.length,
      message: `Simulado criado com ${savedQuestionIds.length} questões.`,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Erro inesperado." },
      { status: 500 },
    );
  }
}
