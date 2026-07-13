import { NextResponse } from "next/server";
import { Resend } from "resend";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { jornadaWelcomeTemplate } from "@/lib/email/jornadaEmailTemplates";
import { simuladoReleasedPlainText, simuladoReleasedTemplate } from "@/app/lib/email/jornadaEmailTemplates";
import { logActivity } from "@/lib/logging/activity-log";
import { logSystemError } from "@/lib/logging/error-log";
import { getPublicAppUrl } from "@/lib/server/publicAppUrl";

const JORNADA_EMAIL_INTERVAL_MS = 10_000;

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function isWithinFinalExamWindow(startedAt: Date, examDate: Date | null): boolean {
  if (!examDate) return false;
  const effectiveEnd = new Date(examDate);
  effectiveEnd.setDate(effectiveEnd.getDate() - 7);
  effectiveEnd.setHours(0, 0, 0, 0);
  const start = new Date(startedAt);
  start.setHours(0, 0, 0, 0);
  return start >= effectiveEnd;
}

function calcReleaseSchedule(
  startedAt: Date,
  linkedSimuladoCount: number,
  durationDays: number,
  examDate: Date | null,
  plannedSimuladosCount = linkedSimuladoCount,
): Date[] {
  if (linkedSimuladoCount === 0) return [];

  const calculationBase = Math.max(1, plannedSimuladosCount || linkedSimuladoCount);

  if (isWithinFinalExamWindow(startedAt, examDate)) {
    return Array.from({ length: linkedSimuladoCount }, () => new Date(startedAt));
  }

  let intervalDays: number;

  if (examDate) {
    const effectiveEnd = new Date(examDate);
    effectiveEnd.setDate(effectiveEnd.getDate() - 7);
    const availableDays = Math.round(
      (effectiveEnd.getTime() - startedAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (availableDays <= 0) {
      return Array.from({ length: linkedSimuladoCount }, () => new Date(startedAt));
    }
    intervalDays = availableDays / calculationBase;
  } else {
    intervalDays = durationDays / calculationBase;
  }

  return Array.from({ length: linkedSimuladoCount }, (_, i) => {
    const ms = startedAt.getTime() + Math.floor(i * intervalDays) * 24 * 60 * 60 * 1000;
    return new Date(ms);
  });
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
      .select("id, title, status, planned_simulados_count, duration_days, duration_months, exam_date, effective_end_date")
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
      .select("id, name, email, status")
      .eq("id", studentId)
      .single();

    if (!student) {
      return NextResponse.json({ ok: false, message: "Aluno não encontrado." }, { status: 404 });
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
    const durationDays = Number(jornada.duration_days || jornada.duration_months * 30);
    const expiresAt = addDays(startedAt, durationDays);
    const examDate = jornada.exam_date ? new Date(jornada.exam_date + "T00:00:00") : null;

    let releaseDates: Date[] = [];
    try {
      releaseDates = calcReleaseSchedule(
        startedAt,
        orderedSimulados.length,
        durationDays,
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

    if (["pending", "inactive"].includes(student.status)) {
      await supabase.from("students").update({ status: "active" }).eq("id", studentId);
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    let jornadaEmailSent = false;
    let releaseEmailsSent = 0;
    let emailFailures = 0;
    if (resendApiKey) {
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

      const resend = new Resend(resendApiKey);
      try {
        const { error: welcomeEmailError } = await resend.emails.send({
            from: "EstudoTOP <noreply@estudotop.com.br>",
            to: student.email,
            subject: `Bem-vindo à ${jornada.title} — EstudoTOP`,
            html: jornadaWelcomeTemplate({
              studentName: student.name,
              jornadaTitle: jornada.title,
              startedAt: startedAtRaw,
              expiresAt: toDateString(expiresAt),
              totalSimulados: jornada.planned_simulados_count || orderedSimulados.length,
              examDate: jornada.exam_date,
              effectiveEndDate: jornada.effective_end_date,
              firstSimuladoTitle: orderedSimulados.length > 0 ? getLinkedSimuladoTitle(orderedSimulados[0].simulados) : null,
              schedule,
              jornadaUrl: `${appUrl}/minhas-jornadas`,
            }),
        });
        if (welcomeEmailError) throw welcomeEmailError;
        const sentAt = new Date().toISOString();
        await supabase.from("student_jornadas").update({ welcome_email_sent_at: sentAt, welcome_email_error: null }).eq("id", sj.id);
        await supabase.from("student_activity_log").insert({
          student_id: studentId,
          event_type: "jornada_welcome_email_sent",
          description: `E-mail de entrada na jornada "${jornada.title}" enviado`,
          details: { jornada_id: jornadaId, student_jornada_id: sj.id },
          performed_by_name: "Sistema",
        });
        jornadaEmailSent = true;
      } catch (err) {
        emailFailures++;
        const message = err instanceof Error ? err.message : "Erro desconhecido";
        await supabase.from("student_jornadas").update({ welcome_email_error: message }).eq("id", sj.id);
        await logSystemError({
          request,
          source: "jornada_welcome_email",
          actorType: "admin",
          errorMessage: message,
          safeDetails: { studentId, jornadaId, studentJornadaId: sj.id },
          severity: "warning",
        });
      }

      if (insertedScheduleRows.some((row) => row.status === "available")) {
        await new Promise((resolve) => setTimeout(resolve, JORNADA_EMAIL_INTERVAL_MS));
      }

      for (const releasedRow of insertedScheduleRows.filter((row) => row.status === "available")) {
        const linked = orderedSimulados.find((item) => item.simulado_id === releasedRow.simulado_id);
        const simuladoTitle = getLinkedSimuladoTitle(linked?.simulados) || `Simulado ${releasedRow.order_number}`;
        const payload = {
          studentName: student.name,
          simuladoTitle,
          jornadaTitle: jornada.title,
          position: releasedRow.order_number,
          total: jornada.planned_simulados_count || orderedSimulados.length,
          expiresAt: toDateString(expiresAt),
          simuladoUrl: `${appUrl}/meus-simulados/${releasedRow.simulado_id}`,
          schedule: schedule.map((item) => ({ ...item, highlight: item.order === releasedRow.order_number })),
        };

        try {
          const { error: releaseEmailError } = await resend.emails.send({
            from: "EstudoTOP <noreply@estudotop.com.br>",
            to: student.email,
            subject: `🎯 Novo simulado liberado — ${jornada.title}`,
            html: simuladoReleasedTemplate(payload),
            text: simuladoReleasedPlainText(payload),
          });
          if (releaseEmailError) throw releaseEmailError;
          const sentAt = new Date().toISOString();
          await supabase.from("student_jornada_simulados").update({ release_email_sent_at: sentAt, release_email_error: null }).eq("id", releasedRow.id);
          await supabase.from("student_activity_log").insert({
            student_id: studentId,
            event_type: "simulado_release_email_sent",
            description: `E-mail de liberação do simulado "${simuladoTitle}" enviado`,
            details: { jornada_id: jornadaId, student_jornada_id: sj.id, student_jornada_simulado_id: releasedRow.id, simulado_id: releasedRow.simulado_id },
            performed_by_name: "Sistema",
          });
          releaseEmailsSent++;
        } catch (err) {
          emailFailures++;
          const message = err instanceof Error ? err.message : "Erro desconhecido";
          await supabase.from("student_jornada_simulados").update({ release_email_error: message }).eq("id", releasedRow.id);
          await logSystemError({
            request,
            source: "jornada_simulado_release_email",
            actorType: "admin",
            errorMessage: message,
            safeDetails: { studentId, jornadaId, studentJornadaId: sj.id, studentJornadaSimuladoId: releasedRow.id },
            severity: "warning",
          });
        }
      }
    }

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

    return NextResponse.json(
      {
        ok: true,
        student_jornada_id: sj.id,
        email_summary: {
          jornada_email_sent: jornadaEmailSent,
          release_emails_sent: releaseEmailsSent,
          failures: emailFailures,
        },
        message: emailFailures > 0 || !resendApiKey
          ? "Aluno inserido na Jornada, mas um ou mais e-mails não puderam ser enviados. Consulte o cadastro do aluno para reenviar."
          : `Aluno ${existingEnroll?.status === "cancelled" ? "reinserido" : "inserido"} com sucesso. E-mail da Jornada enviado${releaseEmailsSent > 0 ? ` e ${releaseEmailsSent} e-mail(s) de liberação enviado(s)` : ""}.`,
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
