import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdmin } from "@/lib/server/authGuard";
import { logAdminAction, logSystemError } from "@/app/lib/server/auditLogger";
import { calcReleaseSchedule } from "@/app/admin/jornadas/utils";

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Recalcula scheduled_release_at APENAS dos simulados ainda bloqueados (status
// "locked") de todas as matrículas ativas. Simulados liberados, iniciados ou
// concluídos permanecem intocados. Usado quando exam_date ou release_duration_days
// muda depois de a jornada já ter alunos.
async function recalcFutureSchedules(
  supabase: SupabaseClient,
  jornadaId: string,
  releaseDurationDays: number,
  examDate: Date | null,
  plannedSimuladosCount: number,
): Promise<void> {
  const { data: enrollments } = await supabase
    .from("student_jornadas")
    .select("id, started_at, status, student_jornada_simulados(id, order_number, status)")
    .eq("jornada_id", jornadaId)
    .eq("status", "active");

  for (const sj of enrollments || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sjsList = ((sj as any).student_jornada_simulados || []) as Array<{ id: string; order_number: number; status: string }>;
    if (sjsList.length === 0) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const startedAt = new Date(String((sj as any).started_at).slice(0, 10) + "T00:00:00");
    const releaseDates = calcReleaseSchedule(
      startedAt,
      sjsList.length,
      releaseDurationDays,
      examDate,
      plannedSimuladosCount || sjsList.length,
    );

    for (const item of sjsList) {
      if (item.status !== "locked") continue;
      const newDate = releaseDates[item.order_number - 1];
      if (!newDate) continue;
      await supabase
        .from("student_jornada_simulados")
        .update({ scheduled_release_at: toDateString(newDate) })
        .eq("id", item.id)
        .eq("status", "locked");
    }
  }
}

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  try {
    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("jornadas")
      .select(`
        *,
        jornada_simulados(
          id,
          simulado_id,
          order_number,
          created_at,
          simulados:simulado_id(id, title, status, question_count)
        ),
        student_jornadas(
          id,
          student_id,
          started_at,
          expires_at,
          status,
          created_at,
          students:student_id(id, name, email),
          student_jornada_simulados(id, status)
        )
      `)
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json({ ok: false, message: "Jornada não encontrada." }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enriched = {
      ...data,
      scope_type: data.scope_type || "general",
      contest_name: data.contest_name || null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jornada_simulados: [...((data.jornada_simulados as any[]) || [])].sort(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (a: any, b: any) => a.order_number - b.order_number,
      ),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      student_jornadas: ((data.student_jornadas as any[]) || []).map((sj: any) => ({
        ...sj,
        progress: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          completed: (sj.student_jornada_simulados || []).filter((s: any) => s.status === "completed").length,
          total: (sj.student_jornada_simulados || []).length,
        },
      })),
    };

    return NextResponse.json({ ok: true, jornada: enriched, message: "" });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro ao buscar jornada." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  try {
    const body = await request.json();
    const supabase = createSupabaseAdminClient();

    const { data: existing, error: fetchError } = await supabase
      .from("jornadas")
      .select("id, title, status, category, planned_simulados_count, duration_days, duration_months, release_duration_days, exam_date, effective_end_date")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ ok: false, message: "Jornada não encontrada." }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};

    if (body.action === "publish") {
      if (existing.status !== "draft") {
        return NextResponse.json(
          { ok: false, message: "Apenas jornadas em rascunho podem ser publicadas." },
          { status: 400 },
        );
      }

      if (!String(existing.title || "").trim()) {
        return NextResponse.json({ ok: false, message: "Informe o nome da jornada antes de publicar." }, { status: 400 });
      }

      if (!Number.isInteger(existing.duration_days || existing.duration_months * 30) || (existing.duration_days || existing.duration_months * 30) <= 0) {
        return NextResponse.json({ ok: false, message: "Duração inválida." }, { status: 400 });
      }

      if (!Number.isInteger(existing.planned_simulados_count) || existing.planned_simulados_count <= 0) {
        return NextResponse.json({ ok: false, message: "Informe a quantidade de simulados da Jornada antes de publicar." }, { status: 400 });
      }

      if (existing.effective_end_date) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const effectiveEnd = new Date(existing.effective_end_date + "T00:00:00");
        if (effectiveEnd < today) {
          return NextResponse.json(
            { ok: false, message: "A data efetiva da jornada já passou. Atualize a data da prova antes de publicar." },
            { status: 400 },
          );
        }
      }

      updates.status = "published";
      updates.published_at = new Date().toISOString();
    } else if (body.action === "archive") {
      if (existing.status !== "published") {
        return NextResponse.json(
          { ok: false, message: "Apenas jornadas publicadas podem ser arquivadas." },
          { status: 400 },
        );
      }
      updates.status = "archived";
      updates.archived_at = new Date().toISOString();
    } else {
      if (body.title !== undefined) {
        const title = String(body.title || "").trim();
        if (!title) {
          return NextResponse.json({ ok: false, message: "Informe o nome da jornada." }, { status: 400 });
        }
        updates.title = title;
      }

      if (body.description !== undefined) {
        updates.description = String(body.description || "").trim() || null;
      }

      if (body.category !== undefined) {
        try {
          updates.category = normalizeCategory(body.category);
        } catch (err) {
          return NextResponse.json(
            { ok: false, message: err instanceof Error ? err.message : "Categoria inválida." },
            { status: 400 },
          );
        }
      }

      if (body.scope_type !== undefined || body.contest_name !== undefined) {
        try {
          const scope = normalizeScope(body);
          updates.scope_type = scope.scope_type;
          updates.contest_name = scope.contest_name;
        } catch (err) {
          return NextResponse.json(
            { ok: false, message: err instanceof Error ? err.message : "Abrangência inválida." },
            { status: 400 },
          );
        }
      }

      if (body.exam_name !== undefined) updates.exam_name = cleanText(body.exam_name, 180);
      if (body.exam_position !== undefined) updates.exam_position = cleanText(body.exam_position, 180);
      if (body.exam_board !== undefined) updates.exam_board = cleanText(body.exam_board, 120);
      if (body.welcome_title !== undefined) updates.welcome_title = cleanText(body.welcome_title, 160);
      if (body.welcome_message !== undefined) updates.welcome_message = cleanText(body.welcome_message);
      if (body.study_strategy !== undefined) updates.study_strategy = cleanText(body.study_strategy);
      if (body.important_guidelines !== undefined) updates.important_guidelines = cleanText(body.important_guidelines);
      if (body.journey_highlights !== undefined) updates.journey_highlights = normalizeHighlights(body.journey_highlights);

      if (body.duration_days !== undefined || body.duration_months !== undefined) {
        const durationDays = Number(body.duration_days ?? (Number(body.duration_months) * 30));
        if (!Number.isInteger(durationDays) || durationDays <= 0) {
          return NextResponse.json({ ok: false, message: "Duração inválida. Informe a duração em dias." }, { status: 400 });
        }
        updates.duration_days = durationDays;
        updates.duration_months = Math.max(1, Math.ceil(durationDays / 30));
      }

      if (body.release_duration_days !== undefined) {
        const releaseDurationDays = Number(body.release_duration_days);
        if (!Number.isInteger(releaseDurationDays) || releaseDurationDays <= 0) {
          return NextResponse.json({ ok: false, message: "Informe em quantos dias todos os simulados serão liberados." }, { status: 400 });
        }
        updates.release_duration_days = releaseDurationDays;
      }

      if (body.planned_simulados_count !== undefined) {
        const planned = Number(body.planned_simulados_count);
        if (!Number.isInteger(planned) || planned <= 0) {
          return NextResponse.json({ ok: false, message: "Quantidade de simulados inválida." }, { status: 400 });
        }

        const { count: linkedCount, error: linkedCountError } = await supabase
          .from("jornada_simulados")
          .select("id", { count: "exact", head: true })
          .eq("jornada_id", id);

        if (linkedCountError) {
          return NextResponse.json({ ok: false, message: linkedCountError.message }, { status: 400 });
        }

        if ((linkedCount || 0) > planned) {
          return NextResponse.json(
            { ok: false, message: `Esta Jornada já possui ${linkedCount} simulado(s) vinculado(s). A quantidade planejada não pode ser menor que isso.` },
            { status: 400 },
          );
        }

        updates.planned_simulados_count = planned;
      }

      if (body.exam_date !== undefined) {
        if (!body.exam_date) {
          updates.exam_date = null;
          updates.effective_end_date = null;
        } else {
          const examDateStr = String(body.exam_date).trim();
          const exam = new Date(examDateStr + "T00:00:00");
          const minDate = new Date();
          minDate.setDate(minDate.getDate() + 8);
          minDate.setHours(0, 0, 0, 0);
          if (exam < minDate) {
            return NextResponse.json(
              { ok: false, message: "A data da prova deve ser pelo menos 8 dias a partir de hoje." },
              { status: 400 },
            );
          }
          updates.exam_date = examDateStr;
          const effectiveEnd = new Date(exam);
          effectiveEnd.setDate(effectiveEnd.getDate() - 7);
          updates.effective_end_date = effectiveEnd.toISOString().slice(0, 10);
        }
      }
    }

    // Estado final após aplicar os updates (para validação cruzada e recálculo).
    const finalDurationDays = (updates.duration_days as number | undefined) ?? existing.duration_days ?? existing.duration_months * 30;
    const finalExamDateStr = body.exam_date !== undefined ? ((updates.exam_date as string | null) ?? null) : (existing.exam_date ?? null);
    const finalReleaseDuration = Number((updates.release_duration_days as number | undefined) ?? existing.release_duration_days);
    const finalPlannedCount = Number((updates.planned_simulados_count as number | undefined) ?? existing.planned_simulados_count);
    const scheduleAffecting = updates.release_duration_days !== undefined || updates.duration_days !== undefined || body.exam_date !== undefined;

    // A janela de liberação só é validada contra a duração sem data da prova
    // (com data da prova, exam_date é soberana e o campo é ignorado).
    if (scheduleAffecting && !finalExamDateStr && finalReleaseDuration > Number(finalDurationDays) - 7) {
      return NextResponse.json(
        { ok: false, message: "A duração destinada à liberação dos simulados deve terminar pelo menos sete dias antes do encerramento da Jornada." },
        { status: 400 },
      );
    }

    const { error: updateError } = await supabase.from("jornadas").update(updates).eq("id", id);

    if (updateError) {
      return NextResponse.json({ ok: false, message: updateError.message }, { status: 400 });
    }

    // Recálculo dos cronogramas futuros quando a distribuição muda (exam_date ou
    // release_duration_days). Preserva concluídos/iniciados/liberados; só mexe nos locked.
    const examChanged = body.exam_date !== undefined && ((updates.exam_date as string | null) ?? null) !== (existing.exam_date ?? null);
    const releaseChanged = updates.release_duration_days !== undefined && updates.release_duration_days !== existing.release_duration_days;
    if (examChanged || releaseChanged) {
      try {
        const examDate = finalExamDateStr ? new Date(finalExamDateStr + "T00:00:00") : null;
        await recalcFutureSchedules(supabase, id, finalReleaseDuration, examDate, finalPlannedCount);
      } catch (err) {
        void logSystemError({ source: "api.admin.jornadas.recalc_schedules", error: err, request, metadata: { jornadaId: id } });
      }
    }

    void logAdminAction({ adminUserId: admin.id, action: updates.status === "archived" ? "admin.jornada.archived" : "admin.jornada.updated", entityType: "jornada", entityId: id, request, metadata: { fields: Object.keys(updates) } });
    return NextResponse.json({ ok: true, message: "Jornada atualizada com sucesso." });
  } catch (error) {
    void logSystemError({ source: "api.admin.jornadas.update", error, request });
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro inesperado." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  try {
    const supabase = createSupabaseAdminClient();

    const { count } = await supabase
      .from("student_jornadas")
      .select("id", { count: "exact", head: true })
      .eq("jornada_id", id);

    if (count && count > 0) {
      return NextResponse.json(
        { ok: false, message: "Não é possível excluir uma jornada com alunos matriculados." },
        { status: 400 },
      );
    }

    const { error } = await supabase.from("jornadas").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    void logAdminAction({ adminUserId: admin.id, action: "admin.jornada.deleted", entityType: "jornada", entityId: id, severity: "warning", request });
    return NextResponse.json({ ok: true, message: "Jornada excluída com sucesso." });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro inesperado." },
      { status: 500 },
    );
  }
}
