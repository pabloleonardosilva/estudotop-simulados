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
  return `${shellStart}
                <h1 style="font-size:28px;line-height:1.25;margin:0;color:#ffffff;">Confirme seu cadastro</h1>
                <p style="font-size:15px;line-height:1.7;color:#b8c2d8;margin:16px 0 0;">
                  Olá, <strong style="color:#ffffff;">${studentName}</strong>. Use o código abaixo para confirmar seu cadastro na plataforma EstudoTOP Simulados.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 34px;">
                <div style="background:linear-gradient(135deg,rgba(247,199,107,0.14),rgba(255,107,0,0.08));border:1px solid rgba(247,199,107,0.30);border-radius:20px;padding:26px;text-align:center;">
                  <p style="font-size:12px;color:#f7c76b;font-weight:800;margin:0 0 12px;letter-spacing:2px;text-transform:uppercase;">Código de confirmação</p>
                  <div style="font-size:40px;letter-spacing:10px;font-weight:900;color:#ffffff;">${code}</div>
                  <p style="font-size:13px;color:#aeb9d2;margin:16px 0 0;">Este código expira em ${expiresInMinutes} minutos.</p>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 34px 34px;">
                <p style="font-size:14px;line-height:1.7;color:#b8c2d8;margin:0;">
                  Depois da confirmação, seu cadastro ficará registrado para análise da equipe EstudoTOP.
                </p>${shellEnd}`;
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
