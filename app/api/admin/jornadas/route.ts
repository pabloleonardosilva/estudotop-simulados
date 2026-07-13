import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdmin } from "@/lib/server/authGuard";
import { logAdminAction, logSystemError } from "@/app/lib/server/auditLogger";

const JORNADA_CATEGORIES = ["saude", "policial", "tribunais", "administrativo"] as const;

function normalizeCategory(value: unknown): typeof JORNADA_CATEGORIES[number] {
  const category = String(value || "").trim();
  if (!JORNADA_CATEGORIES.includes(category as typeof JORNADA_CATEGORIES[number])) {
    throw new Error("Selecione uma categoria válida para a Jornada.");
  }
  return category as typeof JORNADA_CATEGORIES[number];
}

const HIGHLIGHT_KEYS = [
  "simulados_ineditos",
  "correcao_comentada",
  "relatorios_desempenho",
  "comparacao_tentativas",
  "cronograma_progressivo",
  "estatisticas_assunto",
] as const;

function cleanText(value: unknown, maxLength = 4000): string | null {
  const text = String(value || "").trim();
  return text ? text.slice(0, maxLength) : null;
}

function normalizeHighlights(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((item) => String(item || "").trim())
    .filter((item) => HIGHLIGHT_KEYS.includes(item as typeof HIGHLIGHT_KEYS[number]));
}

function normalizeScope(body: any): { scope_type: "general" | "contest"; contest_name: string | null } {
  const scopeType = body.scope_type === "contest" ? "contest" : "general";
  const contestName = String(body.contest_name || "").trim();

  if (scopeType === "contest" && !contestName) {
    throw new Error("Informe o concurso da jornada ou marque como Jornada Geral.");
  }

  return {
    scope_type: scopeType,
    contest_name: scopeType === "contest" ? contestName : null,
  };
}

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("jornadas")
      .select(`
        id,
        title,
        description,
        status,
        scope_type,
        category,
        contest_name,
        exam_name,
        exam_position,
        exam_board,
        welcome_title,
        welcome_message,
        study_strategy,
        important_guidelines,
        journey_highlights,
        planned_simulados_count,
        duration_days,
        duration_months,
        release_duration_days,
        exam_date,
        effective_end_date,
        created_at,
        updated_at,
        jornada_simulados(id),
        student_jornadas(id)
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const jornadas = (data || []).map((j) => ({
      id: j.id,
      title: j.title,
      description: j.description,
      status: j.status,
      scope_type: j.scope_type || "general",
      category: j.category || null,
      contest_name: j.contest_name || null,
      exam_name: j.exam_name || null,
      exam_position: j.exam_position || null,
      exam_board: j.exam_board || null,
      welcome_title: j.welcome_title || null,
      welcome_message: j.welcome_message || null,
      study_strategy: j.study_strategy || null,
      important_guidelines: j.important_guidelines || null,
      journey_highlights: Array.isArray(j.journey_highlights) ? j.journey_highlights : [],
      planned_simulados_count: j.planned_simulados_count || 0,
      duration_days: j.duration_days ?? null,
      duration_months: j.duration_months,
      release_duration_days: j.release_duration_days,
      exam_date: j.exam_date,
      effective_end_date: j.effective_end_date,
      created_at: j.created_at,
      updated_at: j.updated_at,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      simulado_count: ((j.jornada_simulados as any[]) || []).length,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      student_count: ((j.student_jornadas as any[]) || []).length,
    }));

    return NextResponse.json({ ok: true, jornadas, message: "" });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro ao listar jornadas." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await request.json();
    const title = String(body.title || "").trim();
    const description = String(body.description || "").trim() || null;
    const durationDays = Number(body.duration_days ?? (Number(body.duration_months) * 30));
    const durationMonths = Math.max(1, Math.ceil(durationDays / 30));
    const releaseDurationDays = Number(body.release_duration_days);
    const plannedSimuladosCount = Number(body.planned_simulados_count);
    const examDateRaw = body.exam_date ? String(body.exam_date).trim() : null;
    let scope: { scope_type: "general" | "contest"; contest_name: string | null };
    let category: typeof JORNADA_CATEGORIES[number];

    try {
      scope = normalizeScope(body);
      category = normalizeCategory(body.category);
    } catch (err) {
      return NextResponse.json(
        { ok: false, message: err instanceof Error ? err.message : "Abrangência inválida." },
        { status: 400 },
      );
    }

    if (!title) {
      return NextResponse.json({ ok: false, message: "Informe o nome da jornada." }, { status: 400 });
    }

    if (!Number.isInteger(durationDays) || durationDays <= 0) {
      return NextResponse.json(
        { ok: false, message: "Duração deve ser um número inteiro positivo de dias." },
        { status: 400 },
      );
    }

    if (!Number.isInteger(plannedSimuladosCount) || plannedSimuladosCount <= 0) {
      return NextResponse.json(
        { ok: false, message: "Informe a quantidade de simulados planejada para a Jornada." },
        { status: 400 },
      );
    }

    if (!Number.isInteger(releaseDurationDays) || releaseDurationDays <= 0) {
      return NextResponse.json(
        { ok: false, message: "Informe em quantos dias todos os simulados serão liberados." },
        { status: 400 },
      );
    }

    // A janela de liberação só é validada contra a duração quando NÃO há data da
    // prova (com data da prova ela é ignorada no cálculo — exam_date é soberana).
    if (!examDateRaw && releaseDurationDays > durationDays - 7) {
      return NextResponse.json(
        { ok: false, message: "A duração destinada à liberação dos simulados deve terminar pelo menos sete dias antes do encerramento da Jornada." },
        { status: 400 },
      );
    }

    let examDate: string | null = null;
    let effectiveEndDate: string | null = null;

    if (examDateRaw) {
      const exam = new Date(examDateRaw + "T00:00:00");
      const minDate = new Date();
      minDate.setDate(minDate.getDate() + 8);
      minDate.setHours(0, 0, 0, 0);
      if (exam < minDate) {
        return NextResponse.json(
          { ok: false, message: "A data da prova deve ser pelo menos 8 dias a partir de hoje." },
          { status: 400 },
        );
      }
      examDate = examDateRaw;
      const effectiveEnd = new Date(exam);
      effectiveEnd.setDate(effectiveEnd.getDate() - 7);
      effectiveEndDate = effectiveEnd.toISOString().slice(0, 10);
    }

    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("jornadas")
      .insert({
        title,
        description,
        status: "draft",
        scope_type: scope.scope_type,
        category,
        contest_name: scope.contest_name,
        exam_name: cleanText(body.exam_name, 180),
        exam_position: cleanText(body.exam_position, 180),
        exam_board: cleanText(body.exam_board, 120),
        welcome_title: cleanText(body.welcome_title, 160),
        welcome_message: cleanText(body.welcome_message),
        study_strategy: cleanText(body.study_strategy),
        important_guidelines: cleanText(body.important_guidelines),
        journey_highlights: normalizeHighlights(body.journey_highlights),
        planned_simulados_count: plannedSimuladosCount,
        duration_days: durationDays,
        duration_months: durationMonths,
        release_duration_days: releaseDurationDays,
        exam_date: examDate,
        effective_end_date: effectiveEndDate,
      })
      .select("id")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, message: error?.message || "Erro ao criar jornada." },
        { status: 400 },
      );
    }

    void logAdminAction({ adminUserId: admin.id, action: "admin.jornada.created", entityType: "jornada", entityId: data.id, request, metadata: { status } });

    return NextResponse.json(
      { ok: true, id: data.id, message: "Jornada criada com sucesso." },
      { status: 201 },
    );
  } catch (error) {
    void logSystemError({ source: "api.admin.jornadas.create", error, request });
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro inesperado." },
      { status: 500 },
    );
  }
}
