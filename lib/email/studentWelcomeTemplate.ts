import { shell } from "@/app/lib/email/jornadaEmailTemplates";

type StudentWelcomeEmailProps = {
  studentName: string;
  email: string;
  firstAccessUrl: string;
  expiresInHours?: number;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function studentWelcomeTemplate({
  studentName,
  email,
  firstAccessUrl,
  expiresInHours = 72,
}: StudentWelcomeEmailProps) {
  return shell(
    "Seu acesso foi liberado",
    `Seu cadastro na plataforma EstudoTOP Simulados foi aprovado.`,
    `
      <p style="margin:0 0 18px;font-size:16px;line-height:1.65;">Olá, <strong>${escapeHtml(studentName)}</strong>!</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#334155;">Seu cadastro na plataforma <strong style="color:#0f172a;">EstudoTOP Simulados</strong> foi aprovado.</p>
      <div style="margin:0 0 22px;padding:20px;border-radius:18px;background:#fff7ed;border:1px solid #fed7aa;">
        <p style="margin:0 0 12px;font-size:12px;text-transform:uppercase;letter-spacing:0.14em;color:#ea580c;font-weight:800;">Primeiro acesso</p>
        <p style="margin:0;font-size:15px;line-height:1.7;color:#334155;"><strong style="color:#0f172a;">Login:</strong> ${escapeHtml(email)}<br />Defina sua senha pessoal clicando no botão abaixo.</p>
        <p style="margin:12px 0 0;font-size:13px;color:#64748b;">Este link expira em ${expiresInHours} horas.</p>
      </div>
      <div style="text-align:center;">
        <a href="${firstAccessUrl}" style="display:inline-block;background:#ea580c;color:#fff;text-decoration:none;font-weight:800;border-radius:14px;padding:15px 22px;">Definir minha senha</a>
      </div>
      <p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#64748b;">Se o botão não funcionar, copie e cole este endereço no navegador:<br /><span style="word-break:break-all;">${firstAccessUrl}</span></p>
    `,
  );
}
