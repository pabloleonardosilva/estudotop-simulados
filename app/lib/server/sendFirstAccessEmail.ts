import { Resend } from "resend";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { addHours, generateSecureToken, hashEmailActionToken } from "@/lib/security/registrationTokens";
import { getPublicAppUrl } from "@/lib/server/publicAppUrl";

const FROM_EMAIL = "EstudoTOP <estudotop@estudotop.com.br>";
const REPLY_TO_EMAIL = "estudotop@estudotop.com.br";
const FIRST_ACCESS_EXPIRATION_HOURS = 72;

export async function sendFirstAccessEmail(
  studentId: string,
  temporaryPassword?: string,
  options?: { preserveAccountStatus?: boolean },
) {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) throw new Error("RESEND_API_KEY não foi configurada no .env.local.");

  const supabase = createSupabaseAdminClient();
  const { data: student, error } = await supabase
    .from("students")
    .select("id, name, email")
    .eq("id", studentId)
    .single();

  if (error || !student?.email) throw new Error("Aluno não encontrado para envio do e-mail.");

  const rawToken = generateSecureToken();
  const firstAccessUrl = `${getPublicAppUrl()}/primeiro-acesso?token=${encodeURIComponent(rawToken)}`;

  const { error: invalidateError } = await supabase
    .from("student_registration_confirmations")
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", studentId)
    .eq("purpose", "first_access")
    .is("used_at", null);

  if (invalidateError) {
    throw new Error("Não foi possível invalidar os links anteriores de criação de senha.");
  }

  const { error: tokenError } = await supabase.from("student_registration_confirmations").insert({
    purpose: "first_access",
    user_id: studentId,
    full_name: student.name,
    email: student.email,
    token_hash: hashEmailActionToken(rawToken),
    expires_at: addHours(FIRST_ACCESS_EXPIRATION_HOURS),
    metadata: {
      generated_by: "admin",
      temporary_password: Boolean(temporaryPassword),
      preserve_account_status: Boolean(options?.preserveAccountStatus),
    },
  });

  if (tokenError) {
    throw new Error("Não foi possível gerar o link de criação de senha.");
  }

  const passBlock = temporaryPassword
    ? `<div style="margin:18px 0;padding:16px;border-radius:14px;background:#fff7ed;border:1px solid #fed7aa"><p style="margin:0 0 6px;font-size:13px;color:#9a3412;font-weight:700">Senha temporária</p><p style="margin:0;font-size:22px;letter-spacing:1px;font-weight:800;color:#111827">${temporaryPassword}</p><p style="margin:8px 0 0;font-size:12px;color:#9a3412">O aluno deverá trocar essa senha no próximo acesso.</p></div>`
    : "";

  const resend = new Resend(resendApiKey);
  const resetRequestedAt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());
  const { error: emailError } = await resend.emails.send({
    from: FROM_EMAIL,
    replyTo: REPLY_TO_EMAIL,
    to: student.email,
    subject: options?.preserveAccountStatus
      ? `Redefinição de senha solicitada em ${resetRequestedAt}`
      : "Acesso ao EstudoTOP Simulados — defina sua senha",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;padding:28px;color:#111827">
        <p style="font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#f97316;font-weight:800">EstudoTOP Simulados</p>
        <h1 style="margin:8px 0 12px;font-size:26px">Olá, ${student.name || "aluno"}.</h1>
        <p style="font-size:15px;line-height:1.6;color:#475569">Seu acesso foi atualizado. Use o botão abaixo para definir uma nova senha pessoal.</p>
        ${passBlock}
        <p style="margin:24px 0"><a href="${firstAccessUrl}" style="display:inline-block;background:#f97316;color:#111827;text-decoration:none;font-weight:800;padding:14px 20px;border-radius:14px">Definir nova senha</a></p>
        <p style="font-size:12px;line-height:1.5;color:#64748b">Este link expira em ${FIRST_ACCESS_EXPIRATION_HOURS} horas. Se você não solicitou essa alteração, ignore este e-mail.</p>
      </div>
    `,
  });

  if (emailError) {
    throw new Error("Não foi possível enviar o e-mail de criação de senha.");
  }

  await supabase
    .from("students")
    .update({ welcome_email_status: "sent", welcome_email_sent_at: new Date().toISOString(), welcome_email_error: null })
    .eq("id", studentId);

  return true;
}
