import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdmin } from "@/lib/server/authGuard";
import { simuladoReleasedPlainText, simuladoReleasedTemplate } from "@/app/lib/email/jornadaEmailTemplates";
import { resyncTopCoinEarnings } from "@/app/lib/server/topcoinsSync";
import { getPublicAppUrl } from "@/lib/server/publicAppUrl";
import { logAdminAction, logSystemError } from "@/app/lib/server/auditLogger";

function todayDateOnly() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function getStudentJornadaSimulado(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  studentJornadaId: string,
  studentJornadaSimuladoId: string,
) {
  const { data, error } = await supabase
    .from("student_jornada_simulados")
    .select(`
      id,
      student_jornada_id,
      simulado_id,
      order_number,
      status,
      scheduled_release_at,
      released_at,
      completed_at,
      release_email_sent_at,
      student_jornadas:student_jornada_id(
        id,
        student_id,
        jornada_id,
        expires_at,
        status,
        students:student_id(id, name, email),
        jornadas:jornada_id(id, title, planned_simulados_count)
      )
    `)
    .eq("id", studentJornadaSimuladoId)
    .eq("student_jornada_id", studentJornadaId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as any | null;
}

async function hasAnyAttempt(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  studentId: string,
  simuladoId: string,
) {
  const { count, error } = await supabase
    .from("simulado_attempts")
    .select("id", { count: "exact", head: true })
    .eq("student_id", studentId)
    .eq("simulado_id", simuladoId);

  if (error) throw new Error(error.message);
  return Number(count || 0) > 0;
}

async function setAttemptsCount(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  studentId: string,
  simuladoId: string,
  targetCount: number,
) {
  const { data: attempts, error: attemptsError } = await supabase
    .from("simulado_attempts")
    .select("id, attempt_number, counts_toward_limit, created_at")
    .eq("student_id", studentId)
    .eq("simulado_id", simuladoId)
    .order("attempt_number", { ascending: true })
    .order("created_at", { ascending: true });

  if (attemptsError) throw new Error(attemptsError.message);

  const existing = attempts || [];
  const existingCount = existing.length;

  if (targetCount > existingCount) {
    const { count: questionCount, error: questionCountError } = await supabase
      .from("simulado_questions")
      .select("id", { count: "exact", head: true })
      .eq("simulado_id", simuladoId);

    if (questionCountError) throw new Error(questionCountError.message);

    const now = new Date().toISOString();
    const maxAttemptNumber = existing.reduce((max: number, row: any) => {
      const value = Number(row.attempt_number || 0);
      return Number.isFinite(value) && value > max ? value : max;
    }, existingCount);

    const placeholders = Array.from({ length: targetCount - existingCount }, (_, index) => ({
      simulado_id: simuladoId,
      student_id: studentId,
      attempt_number: maxAttemptNumber + index + 1,
      status: "abandoned",
      started_at: now,
      last_activity_at: now,
      submitted_at: now,
      total_questions: questionCount || 0,
      answered_count: 0,
      progress_percent: 0,
      time_spent_seconds: 0,
      counts_toward_limit: true,
      question_order: [],
      settings_snapshot: { admin_adjusted: true },
    }));

    const { error: insertError } = await supabase
      .from("simulado_attempts")
      .insert(placeholders);

    if (insertError) throw new Error(insertError.message);
  }

  const { data: freshAttempts, error: freshError } = await supabase
    .from("simulado_attempts")
    .select("id, attempt_number, created_at")
    .eq("student_id", studentId)
    .eq("simulado_id", simuladoId)
    .order("attempt_number", { ascending: true })
    .order("created_at", { ascending: true });

  if (freshError) throw new Error(freshError.message);

  const fresh = freshAttempts || [];
  const shouldCount = new Set(fresh.slice(0, targetCount).map((row: any) => row.id));
  const idsToTrue = fresh.filter((row: any) => shouldCount.has(row.id)).map((row: any) => row.id);
  const idsToFalse = fresh.filter((row: any) => !shouldCount.has(row.id)).map((row: any) => row.id);

  if (idsToTrue.length > 0) {
    const { error } = await supabase
      .from("simulado_attempts")
      .update({ counts_toward_limit: true })
      .in("id", idsToTrue);
    if (error) throw new Error(error.message);
  }

  if (idsToFalse.length > 0) {
    const { error } = await supabase
      .from("simulado_attempts")
      .update({ counts_toward_limit: false })
      .in("id", idsToFalse);
    if (error) throw new Error(error.message);
  }

  // TopCoins: tentativas que deixam de contar (idsToFalse) perdem as moedas
  // ganhas; tentativas que voltam a contar (idsToTrue) recuperam. O extrato
  // é sempre recalculado do zero a partir do estado atual de
  // counts_toward_limit — ver app/lib/server/topcoinsSync.ts.
  await resyncTopCoinEarnings(supabase, studentId, simuladoId);
}

async function resetSimuladoHistory(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  studentId: string,
  simuladoId: string,
) {
  const { data: attempts, error: attemptsError } = await supabase
    .from("simulado_attempts")
    .select("id")
    .eq("student_id", studentId)
    .eq("simulado_id", simuladoId);

  if (attemptsError) throw new Error(attemptsError.message);

  const attemptIds = (attempts || []).map((attempt) => attempt.id);
  if (attemptIds.length > 0) {
    // As três tabelas derivadas possuem FK attempt_id ON DELETE CASCADE.
    // Uma única exclusão evita deixar o histórico parcialmente apagado.
    const { error: deleteAttemptsError } = await supabase
      .from("simulado_attempts")
      .delete()
      .eq("student_id", studentId)
      .eq("simulado_id", simuladoId);

    if (deleteAttemptsError) throw new Error(deleteAttemptsError.message);
  }

  await resyncTopCoinEarnings(supabase, studentId, simuladoId);
  return attemptIds.length;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ studentJornadaId: string; studentJornadaSimuladoId: string }> },
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { studentJornadaId, studentJornadaSimuladoId } = await params;
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "");
  const supabase = createSupabaseAdminClient();

  try {
    const row = await getStudentJornadaSimulado(supabase, studentJornadaId, studentJornadaSimuladoId);
    if (!row) {
      return NextResponse.json({ ok: false, message: "Simulado da matrícula não encontrado." }, { status: 404 });
    }

    const studentId = row.student_jornadas?.student_id;
    if (!studentId) {
      return NextResponse.json({ ok: false, message: "Aluno da matrícula não identificado." }, { status: 400 });
    }

    if (action === "release_now") {
      if (row.status !== "locked") {
        return NextResponse.json({ ok: false, message: "Apenas simulados bloqueados podem ser liberados manualmente." }, { status: 400 });
      }

      const releaseTimestamp = new Date().toISOString();
      const { error } = await supabase
        .from("student_jornada_simulados")
        .update({ status: "available", released_at: releaseTimestamp })
        .eq("id", row.id);

      if (error) throw new Error(error.message);

      const enrollment = row.student_jornadas;
      const student = enrollment?.students;
      const jornada = enrollment?.jornadas;
      const resendApiKey = process.env.RESEND_API_KEY;
      const appUrl = getPublicAppUrl();
      let releaseEmailSent = false;

      if (resendApiKey && student?.email && jornada?.title && !row.release_email_sent_at) {
        const { data: simulado } = await supabase
          .from("simulados")
          .select("id, title")
          .eq("id", row.simulado_id)
          .single();

        const { data: scheduleRows } = await supabase
          .from("student_jornada_simulados")
          .select(`
            id,
            simulado_id,
            order_number,
            scheduled_release_at,
            released_at,
            status,
            simulados:simulado_id(id, title)
          `)
          .eq("student_jornada_id", row.student_jornada_id)
          .order("order_number", { ascending: true });

        const schedule = (scheduleRows || []).map((item: any) => ({
          order: item.order_number,
          title: item.simulados?.title || `Simulado ${item.order_number}`,
          scheduledReleaseAt: item.scheduled_release_at,
          releasedAt: item.id === row.id ? releaseTimestamp : item.released_at,
          status: item.id === row.id ? "available" : item.status,
          highlight: item.id === row.id,
        }));

        const total = jornada.planned_simulados_count || schedule.length || row.order_number || 0;
        const releaseEmailPayload = {
          studentName: student.name,
          simuladoTitle: simulado?.title || `Simulado ${row.order_number || ""}`.trim(),
          jornadaTitle: jornada.title,
          position: row.order_number || 1,
          total,
          expiresAt: enrollment.expires_at,
          simuladoUrl: `${appUrl}/meus-simulados/${row.simulado_id}`,
          schedule,
        };

        try {
          const resend = new Resend(resendApiKey);
          const { error: emailError } = await resend.emails.send({
            from: "EstudoTOP <noreply@estudotop.com.br>",
            to: student.email,
            subject: `🎯 Novo simulado liberado — ${jornada.title}`,
            html: simuladoReleasedTemplate(releaseEmailPayload),
            text: simuladoReleasedPlainText(releaseEmailPayload),
          });
          if (emailError) throw emailError;
          await supabase
            .from("student_jornada_simulados")
            .update({ release_email_sent_at: new Date().toISOString(), release_email_error: null })
            .eq("id", row.id);
          releaseEmailSent = true;
        } catch (err) {
          console.error(`Falha ao enviar email de liberação manual para SJS ${row.id}`);
          await supabase
            .from("student_jornada_simulados")
            .update({ release_email_error: err instanceof Error ? err.message : "Erro desconhecido" })
            .eq("id", row.id);
        }
      }

      return NextResponse.json({
        ok: true,
        message: releaseEmailSent
          ? "Simulado liberado manualmente para este aluno. E-mail de liberação enviado."
          : "Simulado liberado manualmente para este aluno, mas o e-mail de liberação não foi enviado.",
      });
    }

    if (action === "unrelease") {
      if (row.status !== "available" || !row.released_at) {
        return NextResponse.json({ ok: false, message: "Apenas simulados atualmente liberados podem voltar ao estado bloqueado." }, { status: 400 });
      }

      const blockedByAttempt = await hasAnyAttempt(supabase, studentId, row.simulado_id);
      if (blockedByAttempt) {
        return NextResponse.json({ ok: false, message: "Não é possível desliberar enquanto o Total real de tentativas for maior que zero. Zere e confirme a limpeza do histórico primeiro." }, { status: 400 });
      }

      const { error } = await supabase
        .from("student_jornada_simulados")
        .update({ status: "locked", released_at: null })
        .eq("id", row.id);

      if (error) throw new Error(error.message);
      void logAdminAction({
        action: "admin.student_simulado.release_reverted",
        entityType: "student_jornada_simulado",
        entityId: row.id,
        request,
        metadata: {
          student_id: studentId,
          simulado_id: row.simulado_id,
          student_jornada_id: studentJornadaId,
          scheduled_release_at: row.scheduled_release_at,
        },
      });
      return NextResponse.json({ ok: true, message: "Liberação revertida. O simulado voltou ao estado bloqueado e seguirá novamente a progressão da Jornada." });
    }

    if (action === "set_attempts") {
      const attempts = Number(body?.attempts);
      if (!Number.isInteger(attempts) || attempts < 0) {
        return NextResponse.json({ ok: false, message: "Informe um número inteiro e não negativo de tentativas." }, { status: 400 });
      }

      if (attempts === 0) {
        const wasReleased = Boolean(row.released_at) || ["available", "in_progress", "completed"].includes(row.status);
        const resetStatus = wasReleased ? "available" : "locked";
        const { error: resetProgressError } = await supabase
          .from("student_jornada_simulados")
          .update({ status: resetStatus, completed_at: null })
          .eq("id", row.id)
          .eq("student_jornada_id", studentJornadaId);

        if (resetProgressError) throw new Error(resetProgressError.message);

        let removedAttempts = 0;
        try {
          removedAttempts = await resetSimuladoHistory(supabase, studentId, row.simulado_id);
        } catch (resetError) {
          await supabase
            .from("student_jornada_simulados")
            .update({ status: row.status, completed_at: row.completed_at })
            .eq("id", row.id)
            .eq("student_jornada_id", studentJornadaId);
          throw resetError;
        }

        void logAdminAction({
          action: "admin.student_simulado.attempts_reset",
          entityType: "student_jornada_simulado",
          entityId: row.id,
          request,
          metadata: {
            student_id: studentId,
            simulado_id: row.simulado_id,
            student_jornada_id: studentJornadaId,
            removed_attempts: removedAttempts,
            status_after_reset: resetStatus,
          },
        });

        return NextResponse.json({
          ok: true,
          message: "Tentativas zeradas. O histórico deste simulado foi removido para este aluno.",
          schedule_item: {
            id: row.id,
            status: resetStatus,
            released_at: row.released_at,
            completed_at: null,
            attempts_total: 0,
            attempts_counting: 0,
          },
        });
      }

      await setAttemptsCount(supabase, studentId, row.simulado_id, attempts);
      return NextResponse.json({ ok: true, message: "Número de tentativas ajustado para este aluno." });
    }

    return NextResponse.json({ ok: false, message: "Ação inválida." }, { status: 400 });
  } catch (error) {
    void logSystemError({
      source: "api.admin.student_jornada_simulado.update",
      error,
      request,
      metadata: { student_jornada_id: studentJornadaId, student_jornada_simulado_id: studentJornadaSimuladoId, action },
    });
    return NextResponse.json(
      { ok: false, message: "Não foi possível atualizar o cronograma individual." },
      { status: 500 },
    );
  }
}
