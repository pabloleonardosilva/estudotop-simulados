import { parseContextualSettings, reconcileJornadaResultReleases } from "@/lib/server/contextualSimuladoSettings";
import { resyncTopCoinEarnings } from "@/app/lib/server/topcoinsSync";
import { NextResponse, after } from "next/server";
import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdmin } from "@/lib/server/authGuard";
import { logAdminAction, logSystemError } from "@/app/lib/server/auditLogger";
import { calcReleaseSchedule, isReleaseWindowClosed } from "@/app/admin/jornadas/utils";
import { simuladoReleasedPlainText, simuladoReleasedTemplate } from "@/app/lib/email/jornadaEmailTemplates";
import { getPublicAppUrl } from "@/lib/server/publicAppUrl";

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

type RecalcReleasedItem = {
  id: string;
  student_jornada_id: string;
  simulado_id: string;
  order_number: number;
  release_email_sent_at: string | null;
  expires_at: string;
  student: { name: string | null; email: string | null } | null;
};

type RecalcScheduleRow = {
  id: string;
  order_number: number;
  scheduled_release_at: string;
  released_at: string | null;
  status: string;
  simulados: { title: string } | null;
};

// Recalcula scheduled_release_at APENAS dos simulados ainda bloqueados (status
// "locked") de todas as matrículas ativas. Simulados liberados, iniciados ou
// concluídos permanecem intocados. Usado quando exam_date ou duration_days muda
// depois de a jornada já ter alunos. Se a data-limite do aluno já chegou (e a
// matrícula ainda não expirou), os bloqueados são liberados imediatamente e
// devolvidos para comunicação ao aluno.
async function recalcFutureSchedules(
  supabase: SupabaseClient,
  jornadaId: string,
  examDate: Date | null,
  plannedSimuladosCount: number,
): Promise<RecalcReleasedItem[]> {
  const { data: enrollments } = await supabase
    .from("student_jornadas")
    .select("id, started_at, expires_at, status, students:student_id(name, email), student_jornada_simulados(id, order_number, status)")
    .eq("jornada_id", jornadaId)
    .eq("status", "active");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const releasedItems: RecalcReleasedItem[] = [];

  for (const sj of enrollments || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sjsList = ((sj as any).student_jornada_simulados || []) as Array<{ id: string; order_number: number; status: string }>;
    if (sjsList.length === 0) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const startedAt = new Date(String((sj as any).started_at).slice(0, 10) + "T00:00:00");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const expiresAt = new Date(String((sj as any).expires_at).slice(0, 10) + "T00:00:00");
    const releaseDates = calcReleaseSchedule(
      startedAt,
      sjsList.length,
      expiresAt,
      examDate,
      plannedSimuladosCount || sjsList.length,
    );
    const releaseNow = expiresAt > today && isReleaseWindowClosed(today, expiresAt, examDate);
    const releaseTimestamp = new Date().toISOString();

    for (const item of sjsList) {
      if (item.status !== "locked") continue;
      const newDate = releaseDates[item.order_number - 1];
      if (!newDate) continue;
      if (!releaseNow) {
        await supabase
          .from("student_jornada_simulados")
          .update({ scheduled_release_at: toDateString(newDate) })
          .eq("id", item.id)
          .eq("status", "locked");
        continue;
      }
      // Transição atômica locked → available: só quem a efetiva comunica o aluno.
      const { data: releasedRow } = await supabase
        .from("student_jornada_simulados")
        .update({ scheduled_release_at: toDateString(newDate), status: "available", released_at: releaseTimestamp })
        .eq("id", item.id)
        .eq("status", "locked")
        .select("id, student_jornada_id, simulado_id, order_number, release_email_sent_at")
        .maybeSingle();
      if (releasedRow) {
        releasedItems.push({
          ...(releasedRow as Omit<RecalcReleasedItem, "expires_at" | "student">),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          expires_at: String((sj as any).expires_at),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          student: ((sj as any).students as RecalcReleasedItem["student"]) || null,
        });
      }
    }
  }

  return releasedItems;
}

// Comunica as liberações efetivadas pelo recálculo com o mesmo template, as
// mesmas flags (release_email_sent_at / release_email_error) e o mesmo
// tratamento de falha do release-job e da conclusão de simulado. A falha de
// e-mail não desfaz a liberação.
async function sendRecalcReleaseEmails(
  supabase: SupabaseClient,
  releasedItems: RecalcReleasedItem[],
  jornadaTitle: string,
  plannedSimuladosCount: number,
): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) return;
  const resend = new Resend(resendApiKey);
  const appUrl = getPublicAppUrl();

  for (const item of releasedItems) {
    if (item.release_email_sent_at || !item.student?.email) continue;
    try {
      const [{ data: releasedSimulado }, { data: scheduleRows }] = await Promise.all([
        supabase.from("simulados").select("title").eq("id", item.simulado_id).single(),
        supabase
          .from("student_jornada_simulados")
          .select("id, order_number, scheduled_release_at, released_at, status, simulados:simulado_id(title)")
          .eq("student_jornada_id", item.student_jornada_id)
          .order("order_number", { ascending: true }),
      ]);
      if (!releasedSimulado) continue;

      const schedule = ((scheduleRows || []) as unknown as RecalcScheduleRow[]).map((row) => ({
        order: row.order_number,
        title: row.simulados?.title || `Simulado ${row.order_number}`,
        scheduledReleaseAt: row.scheduled_release_at,
        releasedAt: row.released_at,
        status: row.status,
        highlight: row.id === item.id,
      }));
      const emailParams = {
        studentName: item.student.name || "Aluno",
        simuladoTitle: releasedSimulado.title,
        jornadaTitle,
        position: item.order_number,
        total: plannedSimuladosCount || schedule.length,
        expiresAt: item.expires_at,
        simuladoUrl: `${appUrl}/meus-simulados/${item.simulado_id}`,
        schedule,
      };
      const { error: emailError } = await resend.emails.send({
        from: "EstudoTOP <estudotop@estudotop.com.br>",
        replyTo: "estudotop@estudotop.com.br",
        to: item.student.email,
        subject: `Novo simulado liberado — ${jornadaTitle}`,
        html: simuladoReleasedTemplate(emailParams),
        text: simuladoReleasedPlainText(emailParams),
      });
      if (emailError) throw emailError;

      await supabase
        .from("student_jornada_simulados")
        .update({ release_email_sent_at: new Date().toISOString(), release_email_error: null })
        .eq("id", item.id)
        .is("release_email_sent_at", null);
    } catch (emailError) {
      const message = emailError instanceof Error ? emailError.message : "Falha ao enviar e-mail de liberação.";
      await supabase
        .from("student_jornada_simulados")
        .update({ release_email_error: message.slice(0, 500) })
        .eq("id", item.id);
      void logSystemError({ source: "api.admin.jornadas.recalc_release_email", error: emailError, metadata: { student_jornada_simulado_id: item.id } });
    }
  }
}

// Recalcula expires_at (validade da matrícula) das matrículas ativas quando a
// duração da Jornada muda. expires_at = started_at + duration_days. Sem isso, a
// alteração da duração não propagava para quem já estava matriculado.
async function recalcEnrollmentExpirations(
  supabase: SupabaseClient,
  jornadaId: string,
  durationDays: number,
): Promise<void> {
  const { data: enrollments } = await supabase
    .from("student_jornadas")
    .select("id, started_at")
    .eq("jornada_id", jornadaId)
    .eq("status", "active");

  const rows = (enrollments || []) as Array<{ id: string; started_at: string }>;
  for (const sj of rows) {
    const started = new Date(String(sj.started_at).slice(0, 10) + "T00:00:00");
    const expires = new Date(started);
    expires.setDate(expires.getDate() + durationDays);
    await supabase.from("student_jornadas").update({ expires_at: toDateString(expires) }).eq("id", sj.id);
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
          order_number, owl_help_enabled_override,owl_help_limit_override,
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
      .select("id, title, status, category, planned_simulados_count, duration_days, duration_months, exam_date, effective_end_date, feedback_mode,navigation_override,owl_help_enabled,owl_help_limit,result_policy")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ ok: false, message: "Jornada não encontrada." }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    if (["feedback_mode","navigation_override","owl_help_enabled","owl_help_limit"].some((key) => body[key] !== undefined)) {
      try { Object.assign(updates, parseContextualSettings(body, existing)); } catch (error) { return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Configuracao invalida." }, { status: 400 }); }
    }
    if (body.result_policy !== undefined) {
      if (body.result_policy !== "released" && body.result_policy !== "blocked") return NextResponse.json({ ok: false, message: "Politica de resultado invalida." }, { status: 400 });
      updates.result_policy = body.result_policy;
    }

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

      if (body.card_image_id !== undefined) {
        const cardImageId = typeof body.card_image_id === "string" && body.card_image_id ? body.card_image_id : null;
        if (cardImageId) {
          const { data: image } = await supabase.from("system_images").select("id").eq("id", cardImageId).eq("image_type", "journey_card").maybeSingle();
          if (!image) return NextResponse.json({ ok: false, message: "Selecione uma imagem válida da biblioteca de Jornadas." }, { status: 400 });
        }
        updates.card_image_id = cardImageId;
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
    if (body.max_attempts !== undefined) {
      const maxAttempts = body.max_attempts;
      if (typeof maxAttempts !== "number" || !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 2147483647) return NextResponse.json({ ok: false, message: "Tentativas permitidas deve ser um inteiro maior ou igual a 1." }, { status: 400 });
      updates.max_attempts = maxAttempts;
    }
    const finalDurationDays = (updates.duration_days as number | undefined) ?? existing.duration_days ?? existing.duration_months * 30;
    const finalExamDateStr = body.exam_date !== undefined ? ((updates.exam_date as string | null) ?? null) : (existing.exam_date ?? null);
    const finalPlannedCount = Number((updates.planned_simulados_count as number | undefined) ?? existing.planned_simulados_count);

    const { error: updateError } = await supabase.from("jornadas").update(updates).eq("id", id);

    if (updateError) {
      return NextResponse.json({ ok: false, message: updateError.message }, { status: 400 });
    }
    if (!updateError && updates.result_policy === "released") {
      const { data: links, error: linkError } = await supabase.from("student_jornadas").select("student_id,student_jornada_simulados(id,simulado_id)").eq("jornada_id", id);
      if (linkError) throw linkError;
      await reconcileJornadaResultReleases(supabase, (links || []).flatMap((enrollment) => (enrollment.student_jornada_simulados || []).map((item) => item.id)));
      for (const enrollment of links || []) for (const item of enrollment.student_jornada_simulados || []) await resyncTopCoinEarnings(supabase, enrollment.student_id, item.simulado_id);
    }


    // Alterar a duração recalcula a validade (expires_at) das matrículas ativas:
    // expires_at = started_at + nova duração. Vem antes do cronograma, que
    // depende da expiração de cada aluno.
    const durationChanged = updates.duration_days !== undefined && updates.duration_days !== existing.duration_days;
    if (durationChanged) {
      try {
        await recalcEnrollmentExpirations(supabase, id, Number(finalDurationDays));
      } catch (err) {
        void logSystemError({ source: "api.admin.jornadas.recalc_expirations", error: err, request, metadata: { jornadaId: id } });
      }
    }

    // Recálculo dos cronogramas futuros quando a data-limite muda (exam_date ou
    // duration_days). Preserva concluídos/iniciados/liberados; só mexe nos locked.
    const examChanged = body.exam_date !== undefined && ((updates.exam_date as string | null) ?? null) !== (existing.exam_date ?? null);
    if (examChanged || durationChanged) {
      try {
        const examDate = finalExamDateStr ? new Date(finalExamDateStr + "T00:00:00") : null;
        const releasedItems = await recalcFutureSchedules(supabase, id, examDate, finalPlannedCount);
        if (releasedItems.length) {
          const jornadaTitle = String((updates.title as string | undefined) ?? existing.title ?? "");
          after(() => sendRecalcReleaseEmails(supabase, releasedItems, jornadaTitle, finalPlannedCount));
        }
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

    // Histórico comercial Hotmart bloqueia exclusão mesmo sem matrícula ativa
    // (ex.: transação registrada, mas nunca resolvida em student_jornadas):
    // hotmart_transactions.jornada_id usa "on delete restrict", então o
    // banco já rejeitaria a exclusão — este check só antecipa a resposta com
    // mensagem amigável (nunca expor erro bruto de FK ao Admin).
    const { count: hotmartCount } = await supabase
      .from("hotmart_transactions")
      .select("id", { count: "exact", head: true })
      .eq("jornada_id", id);
    if (hotmartCount) {
      return NextResponse.json(
        { ok: false, message: "Esta Jornada possui histórico Hotmart e não pode ser excluída. Arquive-a." },
        { status: 409 },
      );
    }

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
