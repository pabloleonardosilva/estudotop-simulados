import { NextResponse, after } from "next/server";
import { Resend } from "resend";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import {
  approvedStudentJornadaConsolidatedPlainText,
  approvedStudentJornadaConsolidatedTemplate,
  pendingStudentJornadaConsolidatedPlainText,
  pendingStudentJornadaConsolidatedTemplate,
} from "@/app/lib/email/jornadaEmailTemplates";
import { logActivity } from "@/lib/logging/activity-log";
import { logSystemError } from "@/lib/logging/error-log";
import { getPublicAppUrl } from "@/lib/server/publicAppUrl";
import { calcReleaseSchedule, isWithinFinalExamWindow } from "@/app/admin/jornadas/utils";
import { addHours, generateSecureToken, hashEmailActionToken } from "@/lib/security/registrationTokens";
import { validateStudentAccountIntegrity } from "@/lib/server/studentAccountService";

const FIRST_ACCESS_EXPIRATION_HOURS = 72;

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function getLinkedSimuladoTitle(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const title = (value as { title?: unknown }).title;
  return typeof title === "string" && title.trim() ? title : null;
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
      .from("student_jornadas")
      .select(`
        id,
        student_id,
        started_at,
        expires_at,
        status,
        created_at,
        students:student_id(id, name, email),
        student_jornada_simulados(id, status, order_number, simulado_id, scheduled_release_at)
      `)
      .eq("jornada_id", id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enriched = (data || []).map((sj: any) => ({
      ...sj,
      progress: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        completed: (sj.student_jornada_simulados || []).filter((s: any) => s.status === "completed").length,
        total: (sj.student_jornada_simulados || []).length,
      },
    }));

    return NextResponse.json({ ok: true, students: enriched, message: "" });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro ao listar alunos." },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id: jornadaId } = await params;
  try {
    const body = await request.json();
    const studentId = String(body.student_id || "").trim();
    const startedAtRaw = String(body.started_at || "").trim() || toDateString(new Date());

    if (!studentId) {
      return NextResponse.json({ ok: false, message: "Informe o aluno." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: jornada, error: jErr } = await supabase
      .from("jornadas")
      .select("id, title, status, planned_simulados_count, duration_days, duration_months, release_duration_days, exam_date, effective_end_date")
      .eq("id", jornadaId)
      .single();

    if (jErr || !jornada) {
      return NextResponse.json({ ok: false, message: "Jornada não encontrada." }, { status: 404 });
    }

    if (jornada.status !== "published") {
      return NextResponse.json(
        { ok: false, message: "Só é possível atribuir alunos a jornadas publicadas." },
        { status: 400 },
      );
    }

    const { data: existingEnroll } = await supabase
      .from("student_jornadas")
      .select("id, status")
      .eq("student_id", studentId)
      .eq("jornada_id", jornadaId)
      .maybeSingle();

    if (existingEnroll && existingEnroll.status !== "cancelled") {
      return NextResponse.json(
        { ok: false, message: "Este aluno já está matriculado nesta jornada." },
        { status: 409 },
      );
    }

    const { data: student } = await supabase
      .from("students")
      .select("id, name, email, status, approved_at, welcome_email_sent_at")
      .eq("id", studentId)
      .single();

    if (!student) {
      return NextResponse.json({ ok: false, message: "Aluno não encontrado." }, { status: 404 });
    }

    const requiresApproval = student.status === "pending" && !student.approved_at;
    if (requiresApproval && !(await validateStudentAccountIntegrity(supabase, studentId))) {
      return NextResponse.json(
        {
          ok: false,
          code: "STUDENT_ACCOUNT_INCOMPLETE",
          message: "A conta do aluno está incompleta ou divergente e precisa ser regularizada antes da matrícula.",
        },
        { status: 409 },
      );
    }

    const { data: jornadaSimulados, error: jsErr } = await supabase
      .from("jornada_simulados")
      .select("id, simulado_id, order_number, simulados:simulado_id(id, title)")
      .eq("jornada_id", jornadaId)
      .order("order_number", { ascending: true });

    if (jsErr) {
      return NextResponse.json(
        { ok: false, message: jsErr.message || "Erro ao buscar simulados da jornada." },
        { status: 400 },
      );
    }

    const orderedSimulados = jornadaSimulados || [];
    const startedAt = new Date(startedAtRaw + "T00:00:00");
    // duration_days = validade da matrícula (expiração).
    const durationDays = Number(jornada.duration_days || jornada.duration_months * 30);
    const expiresAt = addDays(startedAt, durationDays);
    // release_duration_days = janela de liberação dos simulados (independente da duração).
    const releaseDurationDays = Number(jornada.release_duration_days || durationDays);
    const examDate = jornada.exam_date ? new Date(jornada.exam_date + "T00:00:00") : null;

    let releaseDates: Date[] = [];
    try {
      releaseDates = calcReleaseSchedule(
        startedAt,
        orderedSimulados.length,
        releaseDurationDays,
        examDate,
        jornada.planned_simulados_count || orderedSimulados.length,
      );
    } catch (err) {
      return NextResponse.json(
        { ok: false, message: err instanceof Error ? err.message : "Erro ao calcular datas de liberação." },
        { status: 400 },
      );
    }

    let sj: { id: string } | null = null;

    if (existingEnroll?.status === "cancelled") {
      const { error: deleteScheduleErr } = await supabase
        .from("student_jornada_simulados")
        .delete()
        .eq("student_jornada_id", existingEnroll.id);

      if (deleteScheduleErr) {
        return NextResponse.json(
          { ok: false, message: deleteScheduleErr.message || "Erro ao limpar cronograma anterior da matrícula cancelada." },
          { status: 400 },
        );
      }

      const { data: reactivated, error: reactivateErr } = await supabase
        .from("student_jornadas")
        .update({
          started_at: startedAtRaw,
          expires_at: toDateString(expiresAt),
          status: "active",
          welcome_email_sent_at: null,
          welcome_email_error: null,
        })
        .eq("id", existingEnroll.id)
        .select("id")
        .single();

      if (reactivateErr || !reactivated) {
        return NextResponse.json(
          { ok: false, message: reactivateErr?.message || "Erro ao reativar matrícula cancelada." },
          { status: 400 },
        );
      }

      sj = reactivated;
    } else {
      const { data: created, error: sjErr } = await supabase
        .from("student_jornadas")
        .insert({
          student_id: studentId,
          jornada_id: jornadaId,
          started_at: startedAtRaw,
          expires_at: toDateString(expiresAt),
          status: "active",
        })
        .select("id")
        .single();

      if (sjErr || !created) {
        return NextResponse.json(
          { ok: false, message: sjErr?.message || "Erro ao criar matrícula." },
          { status: 400 },
        );
      }

      sj = created;
    }

    if (!sj) {
      return NextResponse.json({ ok: false, message: "Erro ao preparar matrícula." }, { status: 400 });
    }

    const releaseAll = isWithinFinalExamWindow(startedAt, examDate);
    const releaseTimestamp = new Date().toISOString();

    const sjsRecords = orderedSimulados.map((js, i) => {
      const shouldReleaseNow = releaseAll || i === 0;
      return {
        student_jornada_id: sj.id,
        jornada_simulado_id: js.id,
        simulado_id: js.simulado_id,
        order_number: js.order_number,
        scheduled_release_at: toDateString(releaseDates[i]),
        status: shouldReleaseNow ? "available" : "locked",
        released_at: shouldReleaseNow ? releaseTimestamp : null,
      };
    });

    let insertedScheduleRows: Array<{
      id: string;
      simulado_id: string;
      order_number: number;
      scheduled_release_at: string;
      released_at: string | null;
      status: string;
    }> = [];

    if (sjsRecords.length > 0) {
      const { data: insertedRows, error: sjsErr } = await supabase
        .from("student_jornada_simulados")
        .insert(sjsRecords)
        .select("id, simulado_id, order_number, scheduled_release_at, released_at, status");

      if (sjsErr) {
        if (existingEnroll?.status === "cancelled") {
          await supabase.from("student_jornadas").update({ status: "cancelled" }).eq("id", sj.id);
        } else {
          await supabase.from("student_jornadas").delete().eq("id", sj.id);
        }
        return NextResponse.json({ ok: false, message: sjsErr.message }, { status: 400 });
      }

      insertedScheduleRows = insertedRows || [];
    }

    if (requiresApproval) {
      const { data: approvedRows, error: approveError } = await supabase
        .from("students")
        .update({ status: "active", approved_at: new Date().toISOString(), approved_by: admin.id })
        .eq("id", studentId)
        .eq("status", "pending")
        .is("approved_at", null)
        .select("id");

      if (approveError || !approvedRows?.length) {
        if (existingEnroll?.status === "cancelled") {
          await supabase.from("student_jornadas").update({ status: "cancelled" }).eq("id", sj.id);
        } else {
          await supabase.from("student_jornadas").delete().eq("id", sj.id);
        }
        return NextResponse.json(
          { ok: false, message: "Não foi possível concluir a aprovação formal do aluno." },
          { status: 409 },
        );
      }

      const { error: profileUpdateError } = await supabase
        .from("profiles")
        .update({ is_active: true, must_change_password: true })
        .eq("id", studentId);

      if (profileUpdateError) {
        await logSystemError({
          request,
          source: "jornada_assign_student_approval",
          actorType: "admin",
          errorMessage: `Aluno aprovado, mas falha ao ativar profile: ${profileUpdateError.message}`,
          safeDetails: { studentId, jornadaId },
          severity: "error",
        });
      }

      await supabase.from("student_activity_log").insert({
        student_id: studentId,
        event_type: "registration_approved",
        description: "Cadastro aprovado automaticamente durante a matrícula em Jornada. Acesso ativado.",
        details: {
          approved_by: admin.id,
          approved_by_name: admin.full_name || "Admin",
          source: "jornada_assignment",
          jornada_id: jornadaId,
        },
        performed_by_name: admin.full_name || "Admin",
      });

      await logActivity({
        request,
        actorType: "admin",
        actorName: admin.full_name || "Admin",
        action: "student_registration_approved",
        entityType: "student",
        entityId: studentId,
        metadata: { approved: true, source: "jornada_assignment", jornada_id: jornadaId },
      });
    } else if (student.status === "inactive") {
      await Promise.all([
        supabase.from("students").update({ status: "active" }).eq("id", studentId),
        supabase.from("profiles").update({ is_active: true }).eq("id", studentId),
      ]);
    }

    // Auditoria da atribuição registrada antes de responder (writes rápidos).
    await supabase.from("student_activity_log").insert({
      student_id: studentId,
      event_type: "jornada_assigned",
      description: `Atribuído à jornada "${jornada.title}"`,
      details: {
        jornada_id: jornadaId,
        jornada_title: jornada.title,
        started_at: startedAtRaw,
        expires_at: toDateString(expiresAt),
        simulados_count: orderedSimulados.length,
        planned_simulados_count: jornada.planned_simulados_count || orderedSimulados.length,
      },
      performed_by_name: "Admin",
    });

    await logActivity({
      request,
      actorType: "admin",
      actorName: "Admin",
      action: "jornada_assigned",
      entityType: "student_jornada",
      entityId: sj.id,
      metadata: {
        student_id: studentId,
        student_email: student.email,
        jornada_id: jornadaId,
        jornada_title: jornada.title,
        started_at: startedAtRaw,
        expires_at: toDateString(expiresAt),
        simulados_count: orderedSimulados.length,
      },
    });

    // E-mails enviados em segundo plano (after): a resposta HTTP não espera o
    // Resend nem o intervalo de espaçamento de 10s — a atribuição já está
    // persistida. O status de cada envio fica em student_jornadas /
    // student_jornada_simulados e é visível no cadastro do aluno (Reenvio de E-mails).
    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      after(async () => {
        try {
          const appUrl = getPublicAppUrl();
          const schedule = orderedSimulados.map((js, i) => {
            const shouldReleaseNow = releaseAll || i === 0;
            return {
              order: js.order_number,
              title: getLinkedSimuladoTitle(js.simulados) || `Simulado ${js.order_number}`,
              scheduledReleaseAt: releaseDates[i] ? toDateString(releaseDates[i]) : null,
              releasedAt: shouldReleaseNow ? releaseTimestamp : null,
              status: shouldReleaseNow ? "available" : "locked",
              highlight: shouldReleaseNow,
            };
          });

          const releasedRows = insertedScheduleRows.filter((row) => row.status === "available");
          const firstReleasedRow = releasedRows[0] || null;
          const firstReleasedSimulado = firstReleasedRow
            ? orderedSimulados.find((item) => item.simulado_id === firstReleasedRow.simulado_id)
            : null;
          const firstSimuladoTitle = firstReleasedRow
            ? getLinkedSimuladoTitle(firstReleasedSimulado?.simulados) || `Simulado ${firstReleasedRow.order_number}`
            : null;
          const firstSimuladoUrl = firstReleasedRow
            ? `${appUrl}/meus-simulados/${firstReleasedRow.simulado_id}`
            : null;
          const baseEmailParams = {
            studentName: student.name,
            jornadaTitle: jornada.title,
            startedAt: startedAtRaw,
            expiresAt: toDateString(expiresAt),
            totalSimulados: jornada.planned_simulados_count || orderedSimulados.length,
            examDate: jornada.exam_date,
            effectiveEndDate: jornada.effective_end_date,
            firstSimuladoTitle,
            firstSimuladoUrl,
            schedule,
            jornadaUrl: `${appUrl}/minhas-jornadas`,
          };

          let subject: string;
          let html: string;
          let text: string;

          if (requiresApproval) {
            const rawToken = generateSecureToken();
            const firstAccessUrl = `${appUrl}/primeiro-acesso?token=${encodeURIComponent(rawToken)}`;
            const attemptedAt = new Date().toISOString();

            const { error: invalidateError } = await supabase
              .from("student_registration_confirmations")
              .update({ used_at: attemptedAt })
              .eq("user_id", studentId)
              .eq("purpose", "first_access")
              .is("used_at", null);

            if (invalidateError) throw new Error("Não foi possível invalidar os links anteriores de primeiro acesso.");

            const { error: tokenError } = await supabase.from("student_registration_confirmations").insert({
              purpose: "first_access",
              user_id: studentId,
              full_name: student.name,
              email: student.email,
              token_hash: hashEmailActionToken(rawToken),
              expires_at: addHours(FIRST_ACCESS_EXPIRATION_HOURS),
              metadata: { generated_by: "admin", source: "jornada_assignment" },
            });

            if (tokenError) throw new Error("Não foi possível gerar o link de primeiro acesso.");

            await supabase
              .from("students")
              .update({
                welcome_email_status: "sending",
                welcome_email_attempted_at: attemptedAt,
                welcome_email_error: null,
              })
              .eq("id", studentId);

            const params = {
              ...baseEmailParams,
              firstAccessUrl,
              firstAccessExpiresInHours: FIRST_ACCESS_EXPIRATION_HOURS,
            };
            subject = "Seu acesso ao EstudoTOP foi liberado — comece sua Jornada";
            html = pendingStudentJornadaConsolidatedTemplate(params);
            text = pendingStudentJornadaConsolidatedPlainText(params);
          } else {
            subject = "Sua nova Jornada já começou — primeiro simulado disponível";
            html = approvedStudentJornadaConsolidatedTemplate(baseEmailParams);
            text = approvedStudentJornadaConsolidatedPlainText(baseEmailParams);
          }

          const resend = new Resend(resendApiKey);
          try {
            const { error: consolidatedEmailError } = await resend.emails.send({
              from: "EstudoTOP <estudotop@estudotop.com.br>",
              replyTo: "estudotop@estudotop.com.br",
              to: student.email,
              subject,
              html,
              text,
            });
            if (consolidatedEmailError) throw consolidatedEmailError;
            const sentAt = new Date().toISOString();
            await supabase.from("student_jornadas").update({ welcome_email_sent_at: sentAt, welcome_email_error: null }).eq("id", sj.id);
            if (releasedRows.length > 0) {
              await supabase
                .from("student_jornada_simulados")
                .update({ release_email_sent_at: sentAt, release_email_error: null })
                .in("id", releasedRows.map((row) => row.id));
            }
            if (requiresApproval) {
              await supabase
                .from("students")
                .update({
                  welcome_email_status: "sent",
                  welcome_email_sent_at: student.welcome_email_sent_at || sentAt,
                  welcome_email_error: null,
                })
                .eq("id", studentId);
            }
            await supabase.from("student_activity_log").insert({
              student_id: studentId,
              event_type: requiresApproval ? "approval_jornada_email_sent" : "jornada_welcome_email_sent",
              description: requiresApproval
                ? `E-mail consolidado de aprovação e entrada na jornada "${jornada.title}" enviado`
                : `E-mail consolidado de entrada na jornada "${jornada.title}" enviado`,
              details: {
                jornada_id: jornadaId,
                student_jornada_id: sj.id,
                source: requiresApproval ? "approval_and_jornada" : "jornada_assignment",
                covered_release_ids: releasedRows.map((row) => row.id),
              },
              performed_by_name: "Sistema",
            });
          } catch (err) {
            const message = (err instanceof Error ? err.message : "Erro desconhecido").slice(0, 500);
            await supabase.from("student_jornadas").update({ welcome_email_error: message }).eq("id", sj.id);
            if (releasedRows.length > 0) {
              await supabase
                .from("student_jornada_simulados")
                .update({ release_email_error: message })
                .in("id", releasedRows.map((row) => row.id));
            }
            if (requiresApproval) {
              await supabase
                .from("students")
                .update({
                  welcome_email_status: "failed",
                  welcome_email_attempted_at: new Date().toISOString(),
                  welcome_email_error: message,
                })
                .eq("id", studentId);
            }
            await logSystemError({
              request,
              source: "jornada_consolidated_email",
              actorType: "admin",
              errorMessage: message,
              safeDetails: { studentId, jornadaId, studentJornadaId: sj.id },
              severity: "warning",
            });
          }

        } catch (err) {
          const message = (err instanceof Error ? err.message : "Falha no envio de e-mails em segundo plano.").slice(0, 500);
          await supabase.from("student_jornadas").update({ welcome_email_error: message }).eq("id", sj.id);
          if (requiresApproval) {
            await supabase
              .from("students")
              .update({
                welcome_email_status: "failed",
                welcome_email_attempted_at: new Date().toISOString(),
                welcome_email_error: message,
              })
              .eq("id", studentId);
          }
          void logSystemError({
            request,
            source: "jornada_assign_emails_after",
            actorType: "admin",
            errorMessage: message,
            safeDetails: { studentId, jornadaId, studentJornadaId: sj.id },
            severity: "warning",
          });
        }
      });
    }

    return NextResponse.json(
      {
        ok: true,
        student_jornada_id: sj.id,
        message: `Aluno ${existingEnroll?.status === "cancelled" ? "reinserido" : "inserido"} com sucesso.${resendApiKey ? " O e-mail consolidado será enviado em instantes." : ""}`,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado.";
    await logSystemError({
      request,
      source: "jornada_assign_student_api",
      actorType: "admin",
      errorMessage: message,
      safeDetails: { jornadaId },
      severity: "error",
    });
    return NextResponse.json(
      { ok: false, message },
      { status: 500 },
    );
  }
}
