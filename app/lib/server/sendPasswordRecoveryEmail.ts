import "server-only";

import { Resend } from "resend";
import { shell } from "@/app/lib/email/jornadaEmailTemplates";
import { FROM_EMAIL, REPLY_TO_EMAIL } from "@/app/lib/server/sendFirstAccessEmail";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendPasswordRecoveryEmail(input: {
  recipientEmail: string;
  recipientName?: string | null;
  recoveryUrl: string;
  expiresInMinutes: number;
}) {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) throw new Error("RESEND_API_KEY não configurada.");

  const greeting = input.recipientName ? `Olá, <strong>${escapeHtml(input.recipientName)}</strong>.` : "Olá.";
  const html = shell(
    "Redefina sua senha",
    "Recebemos uma solicitação para redefinir sua senha do EstudoTOP Simulados.",
    `
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#334155;">${greeting}</p>
      <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#334155;">Recebemos uma solicitação para redefinir sua senha. Clique no botão abaixo para criar uma nova senha pessoal.</p>
      <div style="text-align:center;">
        <a href="${escapeHtml(input.recoveryUrl)}" style="display:inline-block;background:#ea580c;color:#fff;text-decoration:none;font-weight:800;border-radius:14px;padding:15px 22px;">Redefinir minha senha</a>
      </div>
      <p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#64748b;">Este link expira em ${input.expiresInMinutes} minutos e só pode ser utilizado uma vez. Se você não solicitou esta alteração, ignore este e-mail; sua senha atual continuará funcionando.</p>
    `,
  );
  const text = `${input.recipientName ? `Olá, ${input.recipientName}.` : "Olá."}

Recebemos uma solicitação para redefinir sua senha do EstudoTOP Simulados.

Redefina sua senha pelo link abaixo:
${input.recoveryUrl}

Este link expira em ${input.expiresInMinutes} minutos e só pode ser utilizado uma vez. Se você não solicitou esta alteração, ignore este e-mail; sua senha atual continuará funcionando.`;

  const { data, error } = await new Resend(resendApiKey).emails.send({
    from: FROM_EMAIL,
    replyTo: REPLY_TO_EMAIL,
    to: input.recipientEmail,
    subject: "Redefina sua senha do EstudoTOP",
    html,
    text,
  });

  if (error) throw new Error(`RESEND_PASSWORD_RECOVERY_FAILED:${error.name || "unknown"}`);
  return { providerMessageId: data?.id || null };
}
