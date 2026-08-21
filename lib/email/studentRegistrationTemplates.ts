import { shell } from "@/app/lib/email/jornadaEmailTemplates";

type PublicRegistrationCodeEmailProps = {
  studentName: string;
  code: string;
  expiresInMinutes: number;
};

type AdminInviteEmailProps = {
  studentName: string;
  email: string;
  confirmUrl: string;
  expiresInHours: number;
};

type EventContinueRegistrationEmailProps = {
  eventName: string;
  continueUrl: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const shellStart = `
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin:0;padding:0;background:#050816;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#050816;padding:32px 16px;">
      <tr>
        <td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#0b1020;border:1px solid rgba(255,255,255,0.10);border-radius:24px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.45);">
            <tr>
              <td style="height:5px;background:linear-gradient(90deg,#ff6b00,#f7c76b,#ff6b00);"></td>
            </tr>
            <tr>
              <td style="padding:34px 34px 10px;text-align:center;">
                <div style="font-size:13px;letter-spacing:7px;color:#f7c76b;font-weight:700;margin-bottom:16px;">ESTUDOTOP</div>`;

const shellEnd = `
              </td>
            </tr>
          </table>
          <p style="font-size:12px;line-height:1.6;color:#7f8aa3;margin:20px 0 0;">
            EstudoTOP Simulados — Plataforma de preparação para concursos públicos.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

export function publicRegistrationCodeTemplate({
  studentName,
  code,
  expiresInMinutes,
}: PublicRegistrationCodeEmailProps) {
  return shell(
    "Confirme seu cadastro",
    `Use o código abaixo para confirmar seu cadastro no EstudoTOP.`,
    `
    <p style="margin:0 0 18px;font-size:16px;line-height:1.65;">Olá, <strong>${escapeHtml(studentName)}</strong>!</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#334155;">Use o código abaixo para confirmar seu cadastro na plataforma EstudoTOP Simulados.</p>
    <div style="margin:22px 0;padding:22px;border-radius:18px;background:#fff7ed;border:1px solid #fed7aa;text-align:center;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.16em;color:#ea580c;font-weight:800;">Código de confirmação</div>
      <div style="margin:10px 0 0;font-size:36px;letter-spacing:8px;font-weight:900;color:#0f172a;">${code}</div>
    </div>
    <p style="margin:0;font-size:14px;line-height:1.7;color:#64748b;">Este código expira em ${expiresInMinutes} minutos. Não compartilhe este código com ninguém.</p>
    <p style="margin:18px 0 0;font-size:15px;line-height:1.7;color:#334155;">Depois da confirmação, seu cadastro ficará registrado para análise da equipe EstudoTOP.</p>
    `,
  );
}

export function adminInviteConfirmationTemplate({
  studentName,
  email,
  confirmUrl,
  expiresInHours,
}: AdminInviteEmailProps) {
  return `${shellStart}
                <h1 style="font-size:28px;line-height:1.25;margin:0;color:#ffffff;">Confirme seu acesso</h1>
                <p style="font-size:15px;line-height:1.7;color:#b8c2d8;margin:16px 0 0;">
                  Olá, <strong style="color:#ffffff;">${studentName}</strong>. Seu acesso à plataforma EstudoTOP Simulados foi criado. Para ativar o cadastro, confirme pelo botão abaixo.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 34px;">
                <div style="background:linear-gradient(135deg,rgba(247,199,107,0.13),rgba(49,130,206,0.08));border:1px solid rgba(247,199,107,0.25);border-radius:18px;padding:22px;">
                  <p style="font-size:14px;color:#f7c76b;font-weight:700;margin:0 0 12px;letter-spacing:1px;text-transform:uppercase;">Confirmação do cadastro</p>
                  <p style="font-size:15px;line-height:1.7;color:#d9e2f1;margin:0;">
                    <strong style="color:#ffffff;">E-mail:</strong> ${email}<br />
                    Depois da confirmação e liberação, você receberá um link para definir sua senha pessoal.
                  </p>
                </div>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:8px 34px 34px;">
                <a href="${confirmUrl}" style="display:inline-block;background:linear-gradient(135deg,#f7c76b,#ff6b00);color:#111827;text-decoration:none;font-weight:900;font-size:15px;padding:15px 28px;border-radius:999px;box-shadow:0 12px 30px rgba(247,199,107,0.25);">
                  Confirmar meu cadastro
                </a>
                <p style="font-size:12px;line-height:1.6;color:#7f8aa3;margin:22px 0 0;">
                  Este link expira em ${expiresInHours} horas. Se o botão não funcionar, copie e cole este endereço no navegador:<br />
                  <span style="color:#aeb9d2;word-break:break-all;">${confirmUrl}</span>
                </p>${shellEnd}`;
}

export function eventContinueRegistrationTemplate({ eventName, continueUrl }: EventContinueRegistrationEmailProps) {
  const safeEventName = escapeHtml(eventName);
  return shell(
    "Continue sua inscrição no Evento",
    `Continue sua inscrição no Evento ${eventName}.`,
    `
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#334155;">Recebemos uma solicitação para participar do Evento <strong style="color:#0f172a;">${safeEventName}</strong>.</p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#334155;">Clique no botão abaixo para continuar seu cadastro no EstudoTOP.</p>
    <div style="text-align:center;">
      <a href="${continueUrl}" style="display:inline-block;background:#ea580c;color:#fff;text-decoration:none;font-weight:800;border-radius:14px;padding:15px 22px;">Continuar cadastro</a>
    </div>
    <p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#64748b;">Por segurança, este link possui validade limitada. Se o botão não funcionar, copie e cole este endereço no navegador:<br /><span style="word-break:break-all;">${continueUrl}</span></p>
    `,
  );
}

export function eventContinueRegistrationPlainText({ eventName, continueUrl }: EventContinueRegistrationEmailProps) {
  return `Continue sua inscrição no Evento ${eventName}

Recebemos uma solicitação para participar do Evento ${eventName}. Acesse o link abaixo para continuar seu cadastro no EstudoTOP.

${continueUrl}

Por segurança, este link possui validade limitada.

EstudoTOP Simulados`;
}
