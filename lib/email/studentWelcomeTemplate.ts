type StudentWelcomeEmailProps = {
  studentName: string;
  email: string;
  firstAccessUrl: string;
  expiresInHours?: number;
};

export function studentWelcomeTemplate({
  studentName,
  email,
  firstAccessUrl,
  expiresInHours = 24,
}: StudentWelcomeEmailProps) {
  return `
  <!doctype html>
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Defina sua senha — EstudoTOP Simulados</title>
    </head>
    <body style="margin:0;padding:0;background:#050816;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#050816;padding:32px 16px;">
        <tr>
          <td align="center">
            <table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#0b1020;border:1px solid rgba(255,255,255,0.10);border-radius:24px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.45);">
              <tr><td style="height:5px;background:linear-gradient(90deg,#ff6b00,#f7c76b,#ff6b00);"></td></tr>
              <tr>
                <td style="padding:34px 34px 10px;text-align:center;">
                  <div style="font-size:13px;letter-spacing:7px;color:#f7c76b;font-weight:700;margin-bottom:16px;">ESTUDOTOP</div>
                  <h1 style="font-size:28px;line-height:1.25;margin:0;color:#ffffff;">Seu acesso foi liberado</h1>
                  <p style="font-size:15px;line-height:1.7;color:#b8c2d8;margin:16px 0 0;">
                    Olá, <strong style="color:#ffffff;">${studentName}</strong>. Seu cadastro na plataforma <strong>EstudoTOP Simulados</strong> foi aprovado.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:22px 34px;">
                  <div style="background:linear-gradient(135deg,rgba(247,199,107,0.13),rgba(255,107,0,0.08));border:1px solid rgba(247,199,107,0.25);border-radius:18px;padding:22px;">
                    <p style="font-size:14px;color:#f7c76b;font-weight:700;margin:0 0 12px;letter-spacing:1px;text-transform:uppercase;">Primeiro acesso</p>
                    <p style="font-size:15px;line-height:1.7;color:#d9e2f1;margin:0;">
                      <strong style="color:#ffffff;">Login:</strong> ${email}<br />
                      Defina sua senha pessoal clicando no botão abaixo.
                    </p>
                    <p style="font-size:13px;color:#aeb9d2;margin:14px 0 0;">Este link expira em ${expiresInHours} horas.</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:8px 34px 34px;">
                  <a href="${firstAccessUrl}" style="display:inline-block;background:linear-gradient(135deg,#f7c76b,#ff6b00);color:#111827;text-decoration:none;font-weight:900;font-size:15px;padding:15px 28px;border-radius:999px;box-shadow:0 12px 30px rgba(247,199,107,0.25);">
                    Definir minha senha
                  </a>
                  <p style="font-size:12px;line-height:1.6;color:#7f8aa3;margin:22px 0 0;">
                    Se o botão não funcionar, copie e cole este endereço no navegador:<br />
                    <span style="color:#aeb9d2;word-break:break-all;">${firstAccessUrl}</span>
                  </p>
                </td>
              </tr>
            </table>
            <p style="font-size:12px;line-height:1.6;color:#7f8aa3;margin:20px 0 0;">EstudoTOP Simulados — Plataforma de preparação para concursos públicos.</p>
          </td>
        </tr>
      </table>
    </body>
  </html>`;
}
