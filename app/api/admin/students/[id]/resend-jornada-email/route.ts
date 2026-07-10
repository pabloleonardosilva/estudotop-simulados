import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdmin } from "@/lib/server/authGuard";
import { jornadaEnrollmentTemplate, jornadaEnrollmentPlainText } from "@/app/lib/email/jornadaEmailTemplates";
import { logAdminAction, logSystemError } from "@/app/lib/server/auditLogger";

function getAppUrl(request: Request): string {
  return process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;

  try {
    const body = await request.json();
    const jornadaId = String(body.jornada_id || "").trim();

    if (!jornadaId) {
      return NextResponse.json({ ok: false, message: "Selecione uma Jornada." }, { status: 400 });
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return NextResponse.json({ ok: false, message: "RESEND_API_KEY não foi configurada no .env.local." }, { status: 500 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id, name, email")
      .eq("id", id)
      .single();

    if (studentError || !student) {
      return NextResponse.json({ ok: false, message: "Aluno não encontrado." }, { status: 404 });
    }

    const { data: enrollment, error: enrollmentError } = await supabase
      .from("student_jornadas")
      .select("id, jornadas:jornada_id(id, title)")
      .eq("student_id", id)
      .eq("jornada_id", jornadaId)
      .maybeSingle();

    if (enrollmentError || !enrollment) {
      return NextResponse.json({ ok: false, message: "Este aluno não está matriculado nesta Jornada." }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jornadaTitle = (enrollment.jornadas as any)?.title || "Jornada";
    const appUrl = getAppUrl(request);

    const resend = new Resend(resendApiKey);
    await resend.emails.send({
      from: "EstudoTOP <noreply@estudotop.com.br>",
      to: student.email,
      subject: `🦉 Você foi inserido(a) na Jornada ${jornadaTitle}!`,
      html: jornadaEnrollmentTemplate({
        studentName: student.name,
        jornadaTitle,
        studentAreaUrl: `${appUrl}/meus-simulados`,
      }),
      text: jornadaEnrollmentPlainText(student.name, jornadaTitle),
    });

    void logAdminAction({ adminUserId: admin.id, action: "admin.student.jornada_email_resent", entityType: "student", entityId: id, request, metadata: { jornada_id: jornadaId } });

    return NextResponse.json({
      ok: true,
      message: `E-mail da Jornada "${jornadaTitle}" reenviado com sucesso.`,
    });
  } catch (error) {
    void logSystemError({ source: "api.admin.students.resend_jornada_email", error, request, metadata: { student_id: id } });
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro inesperado ao reenviar e-mail da Jornada." },
      { status: 500 },
    );
  }
}
