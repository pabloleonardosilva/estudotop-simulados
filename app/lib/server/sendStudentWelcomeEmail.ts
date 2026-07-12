import "server-only";

import { Resend } from "resend";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { generateTemporaryPassword } from "@/lib/utils/password";
import { studentWelcomePlainText, studentWelcomeTemplate } from "@/app/lib/email/studentWelcomeTemplate";

const FROM_EMAIL = "EstudoTOP <noreply@estudotop.com.br>";
const WELCOME_EMAIL_SUBJECT = "🦉 Bem-vindo(a) ao EstudoTOP Simulados!";

export type WelcomeEmailSource = "approval" | "manual_resend";

export type SendStudentWelcomeEmailResult =
  | { sent: true }
  | { sent: false; error: string };

/**
 * Função central de envio do e-mail institucional de boas-vindas.
 *
 * Chamada SOMENTE por: aprovação inicial do cadastro (source "approval") e
 * reenvio manual pelo admin (source "manual_resend"). Nunca por reativação,
 * mudança genérica de status, edição de dados, desativação, bloqueio ou
 * Jornadas — o e-mail de boas-vindas é disparado pelo EVENTO de aprovação,
 * não pelo status.
 *
 * Efeitos: gera nova senha temporária (invalida a anterior), marca
 * must_change_password, envia o template oficial e atualiza o rastreamento em
 * students (welcome_email_attempted_at sempre; welcome_email_sent_at apenas no
 * primeiro sucesso; welcome_email_error sanitizado, limpo em novo sucesso).
 * Nunca lança: retorna { sent, error? } para o chamador decidir a resposta.
 */
export async function sendStudentWelcomeEmail(params: {
  studentId: string;
  source: WelcomeEmailSource;
  loginUrl: string;
  performedByName?: string | null;
}): Promise<SendStudentWelcomeEmailResult> {
  const { studentId, source, loginUrl, performedByName } = params;
  const supabase = createSupabaseAdminClient();
  const attemptedAt = new Date().toISOString();

  try {
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      throw new Error("Serviço de e-mail não configurado.");
    }

    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("name, email, welcome_email_sent_at")
      .eq("id", studentId)
      .single();

    if (studentError || !student?.email) {
      throw new Error("Aluno não encontrado para envio do e-mail de boas-vindas.");
    }

    await supabase
      .from("students")
      .update({ welcome_email_status: "sending", welcome_email_attempted_at: attemptedAt, welcome_email_error: null })
      .eq("id", studentId);

    const temporaryPassword = generateTemporaryPassword();

    const { error: authError } = await supabase.auth.admin.updateUserById(studentId, {
      password: temporaryPassword,
      email_confirm: true,
    });

    if (authError) {
      throw new Error("Falha ao preparar a senha temporária do aluno.");
    }

    await supabase.from("profiles").update({ must_change_password: true }).eq("id", studentId);

    const resend = new Resend(resendApiKey);
    const { error: emailError } = await resend.emails.send({
      from: FROM_EMAIL,
      to: student.email,
      subject: WELCOME_EMAIL_SUBJECT,
      html: studentWelcomeTemplate({
        studentName: student.name,
        studentEmail: student.email,
        temporaryPassword,
        loginUrl,
      }),
      text: studentWelcomePlainText(student.name, student.email, temporaryPassword, loginUrl),
    });

    if (emailError) {
      throw new Error(emailError.message || "O provedor de e-mail recusou o envio.");
    }

    await supabase
      .from("students")
      .update({
        welcome_email_status: "sent",
        // Primeiro envio bem-sucedido; reenvios preservam a data original.
        welcome_email_sent_at: student.welcome_email_sent_at || new Date().toISOString(),
        welcome_email_error: null,
      })
      .eq("id", studentId);

    await supabase.from("student_activity_log").insert({
      student_id: studentId,
      event_type: source === "approval" ? "welcome_email_sent" : "welcome_email_resent",
      description: source === "approval"
        ? "E-mail de boas-vindas enviado na aprovação do cadastro."
        : "E-mail de boas-vindas reenviado manualmente.",
      details: { source, email: student.email },
      performed_by_name: performedByName || "Admin",
    });

    return { sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no envio do e-mail de boas-vindas.";

    await supabase
      .from("students")
      .update({ welcome_email_status: "failed", welcome_email_attempted_at: attemptedAt, welcome_email_error: message })
      .eq("id", studentId);

    await supabase.from("student_activity_log").insert({
      student_id: studentId,
      event_type: "welcome_email_failed",
      description: "Falha no envio do e-mail de boas-vindas.",
      details: { source, error: message },
      performed_by_name: performedByName || "Admin",
    });

    return { sent: false, error: message };
  }
}
