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

type EventReminderEmailProps = {
  eventName: string;
  startsAtLabel: string;
  professorNames: string[];
  eventUrl: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

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
  return shell(
    "Confirme seu acesso",
    "Seu acesso à plataforma EstudoTOP Simulados foi criado.",
    `
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#334155;">Olá, <strong style="color:#0f172a;">${escapeHtml(studentName)}</strong>. Seu acesso à plataforma EstudoTOP Simulados foi criado. Para ativar o cadastro, confirme pelo botão abaixo.</p>
    <div style="margin:0 0 22px;padding:20px;border-radius:18px;background:#fff7ed;border:1px solid #fed7aa;">
      <p style="margin:0 0 12px;font-size:12px;text-transform:uppercase;letter-spacing:0.14em;color:#ea580c;font-weight:800;">Confirmação do cadastro</p>
      <p style="margin:0;font-size:15px;line-height:1.7;color:#334155;"><strong style="color:#0f172a;">E-mail:</strong> ${escapeHtml(email)}<br />Depois da confirmação e liberação, você receberá um link para definir sua senha pessoal.</p>
    </div>
    <div style="text-align:center;">
      <a href="${confirmUrl}" style="display:inline-block;background:#ea580c;color:#fff;text-decoration:none;font-weight:800;border-radius:14px;padding:15px 22px;">Confirmar meu cadastro</a>
    </div>
    <p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#64748b;">Este link expira em ${expiresInHours} horas. Se o botão não funcionar, copie e cole este endereço no navegador:<br /><span style="word-break:break-all;">${confirmUrl}</span></p>
    `,
  );
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

export function eventReminderTemplate({ eventName, startsAtLabel, professorNames, eventUrl }: EventReminderEmailProps) {
  const safeEventName = escapeHtml(eventName);
  const professorLine = professorNames.length
    ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#64748b;">${professorNames.length > 1 ? "Professores" : "Professor"}: ${escapeHtml(professorNames.join(", "))}</p>`
    : "";
  return shell(
    "Seu Evento está chegando",
    `O Evento ${eventName} começa em breve.`,
    `
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#334155;">O Evento <strong style="color:#0f172a;">${safeEventName}</strong> está chegando.</p>
    <div style="margin:0 0 22px;padding:20px;border-radius:18px;background:#fff7ed;border:1px solid #fed7aa;text-align:center;">
      <p style="margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:0.14em;color:#ea580c;font-weight:800;">Início</p>
      <p style="margin:0;font-size:20px;font-weight:900;color:#0f172a;">${escapeHtml(startsAtLabel)}</p>
      <p style="margin:6px 0 0;font-size:12px;color:#64748b;">Horário de Brasília</p>
    </div>
    ${professorLine}
    <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#334155;">Recomendamos entrar com alguns minutos de antecedência para evitar imprevistos de última hora.</p>
    <div style="text-align:center;">
      <a href="${eventUrl}" style="display:inline-block;background:#ea580c;color:#fff;text-decoration:none;font-weight:800;border-radius:14px;padding:15px 22px;">Ver meu Evento</a>
    </div>
    `,
  );
}

export function eventReminderPlainText({ eventName, startsAtLabel, professorNames, eventUrl }: EventReminderEmailProps) {
  const professorLine = professorNames.length ? `\n${professorNames.length > 1 ? "Professores" : "Professor"}: ${professorNames.join(", ")}\n` : "";
  return `Seu Evento está chegando

O Evento ${eventName} começa em breve.

Início: ${startsAtLabel} (Horário de Brasília)
${professorLine}
Recomendamos entrar com alguns minutos de antecedência.

${eventUrl}

EstudoTOP Simulados`;
}
