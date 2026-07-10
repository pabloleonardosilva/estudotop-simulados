type JornadaWelcomeProps = {
  studentName: string;
  jornadaTitle: string;
  startedAt: string;
  expiresAt: string;
  totalSimulados: number;
  firstSimuladoTitle?: string | null;
  schedule?: unknown;
  examDate?: string | null;
  effectiveEndDate?: string | null;
  jornadaUrl: string;
};

function fmtDate(d: string): string {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(d + "T00:00:00"));
}

export function jornadaWelcomeTemplate({
  studentName,
  jornadaTitle,
  startedAt,
  expiresAt,
  totalSimulados,
  examDate,
  effectiveEndDate,
  jornadaUrl,
}: JornadaWelcomeProps): string {
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Bem-vindo à ${jornadaTitle} — EstudoTOP</title></head>
<body style="margin:0;padding:0;background:#050816;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#050816;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#0b1020;border:1px solid rgba(255,255,255,0.10);border-radius:24px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.45);">
  <tr><td style="height:5px;background:linear-gradient(90deg,#ff6b00,#f7c76b,#ff6b00);"></td></tr>
  <tr>
    <td style="padding:34px 34px 10px;text-align:center;">
      <div style="font-size:13px;letter-spacing:7px;color:#f7c76b;font-weight:700;margin-bottom:16px;">ESTUDOTOP</div>
      <h1 style="font-size:26px;line-height:1.25;margin:0;color:#ffffff;">Bem-vindo à ${jornadaTitle}!</h1>
      <p style="font-size:15px;line-height:1.7;color:#b8c2d8;margin:16px 0 0;">
        Olá, <strong style="color:#ffffff;">${studentName}</strong>. Seu acesso à jornada <strong style="color:#f7c76b;">${jornadaTitle}</strong> foi liberado.
      </p>
    </td>
  </tr>
  <tr>
    <td style="padding:22px 34px;">
      <div style="background:linear-gradient(135deg,rgba(247,199,107,0.13),rgba(255,107,0,0.08));border:1px solid rgba(247,199,107,0.25);border-radius:18px;padding:22px;">
        <p style="font-size:14px;color:#f7c76b;font-weight:700;margin:0 0 12px;letter-spacing:1px;text-transform:uppercase;">Detalhes da sua Jornada</p>
        <p style="font-size:14px;color:#d9e2f1;margin:0;line-height:1.9;">
          <strong style="color:#fff;">Início:</strong> ${fmtDate(startedAt)}<br>
          <strong style="color:#fff;">Acesso até:</strong> ${fmtDate(expiresAt)}<br>
          <strong style="color:#fff;">Total de simulados:</strong> ${totalSimulados}${examDate ? `<br><strong style="color:#fff;">Data da prova:</strong> ${fmtDate(examDate)}` : ""}${effectiveEndDate ? `<br><strong style="color:#fff;">Liberação final dos simulados:</strong> ${fmtDate(effectiveEndDate)}` : ""}
        </p>
      </div>
    </td>
  </tr>
  <tr>
    <td style="padding:12px 34px 10px;">
      <div style="background:#131c2e;border-radius:14px;padding:18px;">
        <p style="font-size:13px;color:#aeb9d2;margin:0;line-height:1.9;">
          • Os simulados serão liberados progressivamente.<br>
          • Você só acessa o próximo após concluir o anterior.${effectiveEndDate ? "<br>• 7 dias antes da prova todos os simulados estarão disponíveis." : ""}
        </p>
      </div>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:24px 34px 34px;">
      <a href="${jornadaUrl}" style="display:inline-block;background:linear-gradient(135deg,#f7c76b,#ff6b00);color:#111827;text-decoration:none;font-weight:900;font-size:15px;padding:15px 28px;border-radius:999px;box-shadow:0 12px 30px rgba(247,199,107,0.25);">
        Acessar minha Jornada
      </a>
    </td>
  </tr>
</table>
<p style="font-size:12px;color:#7f8aa3;margin:20px 0 0;">EstudoTOP Simulados — Plataforma de preparação para concursos públicos.</p>
</td></tr>
</table>
</body></html>`;
}

type SimuladoReleasedProps = {
  studentName: string;
  simuladoTitle: string;
  jornadaTitle: string;
  position: number;
  total: number;
  expiresAt: string;
  simuladoUrl: string;
};

export function simuladoReleasedTemplate({
  studentName,
  simuladoTitle,
  jornadaTitle,
  position,
  total,
  expiresAt,
  simuladoUrl,
}: SimuladoReleasedProps): string {
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Novo simulado liberado — ${jornadaTitle}</title></head>
<body style="margin:0;padding:0;background:#050816;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#050816;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#0b1020;border:1px solid rgba(255,255,255,0.10);border-radius:24px;overflow:hidden;">
  <tr><td style="height:5px;background:linear-gradient(90deg,#ff6b00,#f7c76b,#ff6b00);"></td></tr>
  <tr>
    <td style="padding:34px 34px 10px;text-align:center;">
      <div style="font-size:13px;letter-spacing:7px;color:#f7c76b;font-weight:700;margin-bottom:16px;">ESTUDOTOP</div>
      <h1 style="font-size:24px;line-height:1.25;margin:0;color:#ffffff;">Novo simulado disponível!</h1>
      <p style="font-size:15px;line-height:1.7;color:#b8c2d8;margin:16px 0 0;">
        Olá, <strong style="color:#fff;">${studentName}</strong>. O <strong style="color:#f7c76b;">Simulado ${position} de ${total}</strong> da jornada <strong style="color:#fff;">${jornadaTitle}</strong> foi liberado.
      </p>
    </td>
  </tr>
  <tr>
    <td style="padding:22px 34px;">
      <div style="background:#131c2e;border-radius:14px;padding:20px;">
        <p style="font-size:16px;color:#ffffff;font-weight:700;margin:0 0 6px;">${simuladoTitle}</p>
        <p style="font-size:13px;color:#aeb9d2;margin:0;">Seu acesso à jornada expira em: ${fmtDate(expiresAt)}</p>
      </div>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:16px 34px 34px;">
      <a href="${simuladoUrl}" style="display:inline-block;background:linear-gradient(135deg,#f7c76b,#ff6b00);color:#111827;text-decoration:none;font-weight:900;font-size:15px;padding:15px 28px;border-radius:999px;">
        Fazer simulado agora
      </a>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body></html>`;
}
