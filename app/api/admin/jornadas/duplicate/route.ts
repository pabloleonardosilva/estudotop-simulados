import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdmin } from "@/lib/server/authGuard";
import { logAdminAction, logSystemError } from "@/app/lib/server/auditLogger";

function cleanTitle(value: unknown): string {
  return String(value || "").trim().slice(0, 180);
}

async function makeUniqueTitle(supabase: ReturnType<typeof createSupabaseAdminClient>, desiredTitle: string) {
  const baseTitle = cleanTitle(desiredTitle) || "Jornada duplicada";
  const { data, error } = await supabase
    .from("jornadas")
    .select("title")
    .ilike("title", `${baseTitle}%`);

  if (error) throw error;

  const existingTitles = new Set((data || []).map((row) => String(row.title || "").trim().toLowerCase()));
  if (!existingTitles.has(baseTitle.toLowerCase())) return baseTitle;

  for (let index = 2; index <= 99; index += 1) {
    const candidate = `${baseTitle} (${index})`;
    if (!existingTitles.has(candidate.toLowerCase())) return candidate;
  }

  return `${baseTitle} (${Date.now()})`;
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await request.json();
    const sourceJornadaId = String(body.source_jornada_id || "").trim();

    if (!sourceJornadaId) {
      return NextResponse.json({ ok: false, message: "Informe qual Jornada deve ser duplicada." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: source, error: sourceError } = await supabase
      .from("jornadas")
      .select(`
        id,
        title,
        description,
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
        effective_end_date
      `)
      .eq("id", sourceJornadaId)
      .single();

    if (sourceError || !source) {
      return NextResponse.json({ ok: false, message: "Jornada de origem não encontrada." }, { status: 404 });
    }

    const requestedTitle = cleanTitle(body.title);
    const newTitle = await makeUniqueTitle(supabase, requestedTitle || `${source.title} — cópia`);

    const { data: created, error: createError } = await supabase
      .from("jornadas")
      .insert({
        title: newTitle,
        description: source.description,
        status: "draft",
        scope_type: source.scope_type || "general",
        category: source.category || "administrativo",
        contest_name: source.contest_name,
        exam_name: source.exam_name,
        exam_position: source.exam_position,
        exam_board: source.exam_board,
        welcome_title: source.welcome_title,
        welcome_message: source.welcome_message,
        study_strategy: source.study_strategy,
        important_guidelines: source.important_guidelines,
        journey_highlights: Array.isArray(source.journey_highlights) ? source.journey_highlights : [],
        planned_simulados_count: source.planned_simulados_count,
        duration_days: source.duration_days,
        duration_months: source.duration_months,
        release_duration_days: source.release_duration_days,
        exam_date: source.exam_date,
        effective_end_date: source.effective_end_date,
      })
      .select("id, title")
      .single();

    if (createError || !created) {
      return NextResponse.json(
        { ok: false, message: createError?.message || "Erro ao criar a cópia da Jornada." },
        { status: 400 },
      );
    }

    const { data: sourceLinks, error: linksError } = await supabase
      .from("jornada_simulados")
      .select("simulado_id, order_number")
      .eq("jornada_id", sourceJornadaId)
      .order("order_number", { ascending: true });

    if (linksError) {
      await supabase.from("jornadas").delete().eq("id", created.id);
      return NextResponse.json({ ok: false, message: linksError.message }, { status: 400 });
    }

    if (sourceLinks && sourceLinks.length > 0) {
      const { error: copyLinksError } = await supabase.from("jornada_simulados").insert(
        sourceLinks.map((link) => ({
          jornada_id: created.id,
          simulado_id: link.simulado_id,
          order_number: link.order_number,
        })),
      );

      if (copyLinksError) {
        await supabase.from("jornadas").delete().eq("id", created.id);
        return NextResponse.json({ ok: false, message: copyLinksError.message }, { status: 400 });
      }
    }

    void logAdminAction({
      adminUserId: admin.id,
      action: "admin.jornada.duplicated",
      entityType: "jornada",
      entityId: created.id,
      request,
      metadata: { source_jornada_id: sourceJornadaId, copied_simulados: sourceLinks?.length || 0 },
    });

    return NextResponse.json(
      {
        ok: true,
        id: created.id,
        title: created.title,
        message: `Jornada duplicada como rascunho: ${created.title}.`,
      },
      { status: 201 },
    );
  } catch (error) {
    void logSystemError({ source: "api.admin.jornadas.duplicate", error, request });
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro inesperado ao duplicar Jornada." },
      { status: 500 },
    );
  }
}
