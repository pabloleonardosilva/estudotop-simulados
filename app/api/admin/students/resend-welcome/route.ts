import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdmin } from "@/lib/server/authGuard";
import { generateTemporaryPassword } from "@/lib/utils/password";
import { studentWelcomeTemplate, studentWelcomePlainText } from "@/app/lib/email/studentWelcomeTemplate";
import { logAdminAction, logSystemError } from "@/app/lib/server/auditLogger";

const FROM_EMAIL = "EstudoTOP <noreply@estudotop.com.br>";
const WELCOME_EMAIL_SUBJECT = "🦉 Bem-vindo(a) ao EstudoTOP Simulados!";

function getAppUrl(request: Request): string {
  return process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
}

type ResendPayload = {
  studentId: string;
};

async function sendInstitutionalWelcomeEmail(student: { name: string | null; email: string; temporaryPassword: string; loginUrl: string }) {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) throw new Error("RESEND_API_KEY não foi configurada no .env.local.");

  const resend = new Resend(resendApiKey);
  await resend.emails.send({
    from: FROM_EMAIL,
    to: student.email,
    subject: WELCOME_EMAIL_SUBJECT,
    html: studentWelcomeTemplate({
      studentName: student.name,
      studentEmail: student.email,
      temporaryPassword: student.temporaryPassword,
      loginUrl: student.loginUrl,
    }),
    text: studentWelcomePlainText(student.name, student.email, student.temporaryPassword, student.loginUrl),
  });
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  let studentId: string | null = null;
  const supabase = createSupabaseAdminClient();

  try {
    const payload = (await request.json()) as ResendPayload;
    studentId = payload.studentId;

    if (!studentId) {
      return NextResponse.json({ ok: false, message: "studentId é obrigatório." }, { status: 400 });
    }

    await supabase
      .from("students")
      .update({ welcome_email_status: "sending", welcome_email_error: null })
      .eq("id", studentId);

    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("name, email")
      .eq("id", studentId)
      .single();

    if (studentError || !student?.email) {
      throw new Error("Aluno não encontrado para envio do e-mail de boas-vindas.");
    }

    const temporaryPassword = generateTemporaryPassword();

    const { error: authError } = await supabase.auth.admin.updateUserById(studentId, {
      password: temporaryPassword,
      email_confirm: true,
    });

    if (authError) {
      throw new Error(authError.message || "Erro ao redefinir senha temporária.");
    }

    await supabase.from("profiles").update({ must_change_password: true }).eq("id", studentId);

    await sendInstitutionalWelcomeEmail({
      name: student.name,
      email: student.email,
      temporaryPassword,
      loginUrl: `${getAppUrl(request)}/login`,
    });

    await supabase
      .from("students")
      .update({
        welcome_email_status: "sent",
        welcome_email_sent_at: new Date().toISOString(),
        welcome_email_error: null,
      })
      .eq("id", studentId);

    void logAdminAction({ adminUserId: admin.id, action: "admin.student.welcome_resent", entityType: "student", entityId: studentId, request });

    return NextResponse.json({
      ok: true,
      message: "E-mail de boas-vindas reenviado com sucesso.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao reenviar e-mail de boas-vindas.";

    if (studentId) {
      await supabase
        .from("students")
        .update({ welcome_email_status: "failed", welcome_email_error: message })
        .eq("id", studentId);
    }

    void logSystemError({ source: "api.admin.students.resend_welcome", error, request, metadata: { student_id: studentId } });

    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
