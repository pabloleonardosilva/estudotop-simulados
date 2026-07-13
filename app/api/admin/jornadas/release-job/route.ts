import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { verifyCronSecret } from "@/app/lib/server/cronAuth";
import { simuladoReleasedPlainText, simuladoReleasedTemplate } from "@/app/lib/email/jornadaEmailTemplates";
import { logAdminAction, logSystemError } from "@/app/lib/server/auditLogger";
import { getPublicAppUrl } from "@/lib/server/publicAppUrl";

type ScheduleRow = {
  id: string;
  order_number: number;
  scheduled_release_at: string;
  released_at: string | null;
  status: string;
  simulados: { title: string } | null;
};

export async function GET(request: Request) {
  const cronError = verifyCronSecret(request);
  if (cronError) return cronError;

  const startedAt = Date.now();
  void logAdminAction({ action: "admin.cron.release_job.started", entityType: "cron", entityId: "release-job", request });

  try {
    const supabase = createSupabaseAdminClient();
    const today = new Date().toISOString().slice(0, 10);
    const appUrl = getPublicAppUrl();
    const resendApiKey = process.env.RESEND_API_KEY;

    const { data: candidates, error } = await supabase
      .from("student_jornada_simulados")
      .select(`
        id,
        student_jornada_id,
        jornada_simulado_id,
        simulado_id,
        order_number,
        scheduled_release_at,
        status,
        release_email_sent_at,
        student_jornadas!inner(
          id,
          student_id,
          jornada_id,
          expires_at,
          status,
          students:student_id(id, name, email),
          jornadas:jornada_id(id, title, planned_simulados_count)
        )
      `)
      .eq("status", "locked")
      .lte("scheduled_release_at", today);

    if (error) throw error;

    let released = 0;
    let skipped = 0;
    let emailsSent = 0;
    let errors = 0;

    for (const candidate of candidates || []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sj = candidate.student_jornadas as any;

      if (!sj || sj.status !== "active") {
        skipped++;
        continue;
      }

      let shouldRelease = false;

      if (candidate.order_number === 1) {
        shouldRelease = true;
      } else {
        const { data: prev } = await supabase
          .from("student_jornada_simulados")
          .select("id, status")
          .eq("student_jornada_id", candidate.student_jornada_id)
          .eq("order_number", candidate.order_number - 1)
          .single();

        if (prev?.status === "completed") {
          shouldRelease = true;
        } else {
          const { data: next } = await supabase
            .from("student_jornada_simulados")
            .select("id, scheduled_release_at")
            .eq("student_jornada_id", candidate.student_jornada_id)
            .eq("order_number", candidate.order_number + 1)
            .maybeSingle();

          if (!next || next.scheduled_release_at <= today) {
            shouldRelease = true;
          }
        }
      }

      if (!shouldRelease) {
        skipped++;
        continue;
      }

      const releaseTimestamp = new Date().toISOString();
      const { data: releasedRow, error: releaseErr } = await supabase
        .from("student_jornada_simulados")
        .update({ status: "available", released_at: releaseTimestamp })
        .eq("id", candidate.id)
        .eq("status", "locked")
        .select("id")
        .maybeSingle();

      if (releaseErr || !releasedRow) {
        if (releaseErr) {
          console.error(`Erro ao liberar SJS ${candidate.id}:`, releaseErr.message);
        }
        if (releaseErr) errors++;
        skipped++;
        continue;
      }

      released++;

      const { data: simulado } = await supabase
        .from("simulados")
        .select("id, title")
        .eq("id", candidate.simulado_id)
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
        .eq("student_jornada_id", candidate.student_jornada_id)
        .order("order_number", { ascending: true });

      const schedule = ((scheduleRows || []) as unknown as ScheduleRow[]).map((row) => ({
        order: row.order_number,
        title: row.simulados?.title || `Simulado ${row.order_number}`,
        scheduledReleaseAt: row.scheduled_release_at,
        releasedAt: row.id === candidate.id ? releaseTimestamp : row.released_at,
        status: row.id === candidate.id ? "available" : row.status,
        highlight: row.id === candidate.id,
      }));

      const total = sj.jornadas?.planned_simulados_count || schedule.length;

      if (resendApiKey && sj.students && simulado && !candidate.release_email_sent_at) {
        try {
          const resend = new Resend(resendApiKey);
          const { error: emailError } = await resend.emails.send({
              from: "EstudoTOP <noreply@estudotop.com.br>",
              to: sj.students.email,
              subject: `🎯 Novo simulado liberado — ${sj.jornadas.title}`,
              html: simuladoReleasedTemplate({
                studentName: sj.students.name,
                simuladoTitle: simulado.title,
                jornadaTitle: sj.jornadas.title,
                position: candidate.order_number,
                total: total || 0,
                expiresAt: sj.expires_at,
                simuladoUrl: `${appUrl}/meus-simulados/${candidate.simulado_id}`,
                schedule,
              }),
              text: simuladoReleasedPlainText({
                studentName: sj.students.name,
                simuladoTitle: simulado.title,
                jornadaTitle: sj.jornadas.title,
                position: candidate.order_number,
                total: total || 0,
                expiresAt: sj.expires_at,
                simuladoUrl: `${appUrl}/meus-simulados/${candidate.simulado_id}`,
                schedule,
              }),
          });
          if (emailError) throw emailError;
          await supabase
            .from("student_jornada_simulados")
            .update({ release_email_sent_at: new Date().toISOString(), release_email_error: null })
            .eq("id", candidate.id)
            .is("release_email_sent_at", null);
          emailsSent++;
        } catch (err) {
          errors++;
          void logSystemError({ source: "api.admin.jornadas.release_job.email", error: err, request, metadata: { student_jornada_simulado_id: candidate.id } });
          console.error(`Falha ao enviar email de liberação para SJS ${candidate.id}`);
          await supabase
            .from("student_jornada_simulados")
            .update({ release_email_error: err instanceof Error ? err.message : "Erro desconhecido" })
            .eq("id", candidate.id);
        }
      }
    }

    void logAdminAction({
      action: "admin.cron.release_job.finished",
      entityType: "cron",
      entityId: "release-job",
      request,
      metadata: {
        processed_count: (candidates || []).length,
        released_count: released,
        skipped_count: skipped,
        emails_sent_count: emailsSent,
        errors_count: errors,
        duration_ms: Date.now() - startedAt,
      },
    });

    return NextResponse.json({
      ok: true,
      released,
      skipped,
      message: `Job executado: ${released} simulado(s) liberado(s), ${skipped} ignorado(s).`,
    });
  } catch (error) {
    void logSystemError({ source: "api.admin.jornadas.release_job", error, request, metadata: { duration_ms: Date.now() - startedAt } });
    return NextResponse.json(
      { ok: false, message: "Não foi possível executar o job de liberação." },
      { status: 500 },
    );
  }
}
