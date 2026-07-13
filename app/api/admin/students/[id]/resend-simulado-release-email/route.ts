import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdmin } from "@/lib/server/authGuard";
import { simuladoReleasedPlainText, simuladoReleasedTemplate } from "@/app/lib/email/jornadaEmailTemplates";
import { logAdminAction, logSystemError } from "@/app/lib/server/auditLogger";
import { getPublicAppUrl } from "@/lib/server/publicAppUrl";

type StudentJornadaSimuladoRow = {
  id: string;
  simulado_id: string;
  order_number: number;
  status: string;
  student_jornadas: {
    expires_at: string;
    students: { id: string; name: string | null; email: string } | null;
    jornadas: { title: string; planned_simulados_count: number | null } | null;
  } | null;
  simulados: { title: string } | null;
};

type ScheduleRow = {
  id: string;
  order_number: number;
  scheduled_release_at: string;
  released_at: string | null;
  status: string;
  simulados: { title: string } | null;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id: studentId } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const studentJornadaId = String(body.student_jornada_id || "").trim();
    const studentJornadaSimuladoId = String(body.student_jornada_simulado_id || "").trim();

    if (!studentJornadaId || !studentJornadaSimuladoId) {
      return NextResponse.json({ ok: false, message: "Selecione um simulado liberado." }, { status: 400 });
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return NextResponse.json({ ok: false, message: "RESEND_API_KEY não foi configurada no .env.local." }, { status: 500 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: row, error: rowError } = await supabase
      .from("student_jornada_simulados")
      .select(`
        id,
        student_jornada_id,
        simulado_id,
        order_number,
        scheduled_release_at,
        released_at,
        status,
        student_jornadas:student_jornada_id(
          id,
          student_id,
          jornada_id,
          expires_at,
          students:student_id(id, name, email),
          jornadas:jornada_id(id, title, planned_simulados_count)
        ),
        simulados:simulado_id(id, title)
      `)
      .eq("id", studentJornadaSimuladoId)
      .eq("student_jornada_id", studentJornadaId)
      .maybeSingle();

    if (rowError) throw new Error(rowError.message);
    if (!row) {
      return NextResponse.json({ ok: false, message: "Simulado da matrícula não encontrado." }, { status: 404 });
    }

    const typedRow = row as unknown as StudentJornadaSimuladoRow;
    const enrollment = typedRow.student_jornadas;
    const student = enrollment?.students;
    const jornada = enrollment?.jornadas;
    const simulado = typedRow.simulados;

    if (!student || student.id !== studentId) {
      return NextResponse.json({ ok: false, message: "Este simulado não pertence ao aluno informado." }, { status: 403 });
    }

    if (!["available", "in_progress", "completed"].includes(typedRow.status)) {
      return NextResponse.json({ ok: false, message: "Apenas simulados já liberados podem ter este e-mail reenviado." }, { status: 400 });
    }

    const { data: scheduleRows, error: scheduleError } = await supabase
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
      .eq("student_jornada_id", studentJornadaId)
      .order("order_number", { ascending: true });

    if (scheduleError) throw new Error(scheduleError.message);

    const schedule = ((scheduleRows || []) as unknown as ScheduleRow[]).map((item) => ({
      order: item.order_number,
      title: item.simulados?.title || `Simulado ${item.order_number}`,
      scheduledReleaseAt: item.scheduled_release_at,
      releasedAt: item.released_at,
      status: item.status,
      highlight: item.id === typedRow.id,
    }));

    const total = jornada?.planned_simulados_count || schedule.length || typedRow.order_number || 0;
    const payload = {
      studentName: student.name || "Aluno",
      simuladoTitle: simulado?.title || `Simulado ${typedRow.order_number || ""}`.trim(),
      jornadaTitle: jornada?.title || "Jornada",
      position: typedRow.order_number || 1,
      total,
      expiresAt: enrollment.expires_at,
      simuladoUrl: `${getPublicAppUrl()}/meus-simulados/${typedRow.simulado_id}`,
      schedule,
    };

    const resend = new Resend(resendApiKey);
    const { error: emailError } = await resend.emails.send({
      from: "EstudoTOP <noreply@estudotop.com.br>",
      to: student.email,
      subject: `🎯 Novo simulado liberado — ${payload.jornadaTitle}`,
      html: simuladoReleasedTemplate(payload),
      text: simuladoReleasedPlainText(payload),
    });
    if (emailError) {
      await supabase
        .from("student_jornada_simulados")
        .update({ release_email_error: emailError.message })
        .eq("id", typedRow.id);
      throw emailError;
    }

    await supabase
      .from("student_jornada_simulados")
      .update({ release_email_sent_at: new Date().toISOString(), release_email_error: null })
      .eq("id", typedRow.id);

    void logAdminAction({ adminUserId: admin.id, action: "admin.student.simulado_release_email_resent", entityType: "student_jornada_simulado", entityId: studentJornadaSimuladoId, request, metadata: { student_id: studentId, student_jornada_id: studentJornadaId } });

    return NextResponse.json({
      ok: true,
      message: `E-mail de liberação do simulado "${payload.simuladoTitle}" reenviado com sucesso.`,
    });
  } catch (error) {
    void logSystemError({ source: "api.admin.students.resend_simulado_release_email", error, request, metadata: { student_id: studentId } });
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro inesperado ao reenviar e-mail de simulado liberado." },
      { status: 500 },
    );
  }
}
