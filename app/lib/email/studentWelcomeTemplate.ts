import { shell } from "./jornadaEmailTemplates";

type StudentWelcomeEmailProps = {
  studentName?: string | null;
  studentEmail: string;
  temporaryPassword: string;
  loginUrl: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * Template HTML do primeiro e-mail institucional do aluno.
 *
 * Confirma que o cadastro foi criado no EstudoTOP Simulados e traz os dados de
 * acesso (e-mail + senha temporária) e o link de login. No primeiro acesso, o
 * aluno é redirecionado para criar sua senha definitiva.
 */
export function studentWelcomeTemplate({ studentName, studentEmail, temporaryPassword, loginUrl }: StudentWelcomeEmailProps) {
  const greeting = studentName ? `Olá, ${escapeHtml(studentName)}!` : "Olá!";

  return shell(
    "Você chegou!",
    "Seja muito bem-vindo(a) ao EstudoTOP Simulados. Seu cadastro foi criado em nossa plataforma.",
    `
      <p style="margin:0 0 18px;font-size:16px;line-height:1.65;">${greeting}</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#334155;">Seja muito bem-vindo(a) ao <strong style="color:#0f172a;">EstudoTOP Simulados</strong>! 🦉 Use os dados abaixo para fazer o primeiro acesso.</p>
      <div style="margin:0 0 22px;padding:20px;border-radius:18px;background:#fff7ed;border:1px solid #fed7aa;">
        <p style="margin:0 0 12px;font-size:12px;text-transform:uppercase;letter-spacing:0.14em;color:#ea580c;font-weight:800;">Seus dados de acesso</p>
        <p style="margin:0 0 4px;font-size:13px;color:#9a3412;font-weight:600;">E-mail</p>
        <p style="margin:0 0 14px;font-size:16px;color:#0f172a;font-weight:800;">${escapeHtml(studentEmail)}</p>
        <p style="margin:0 0 4px;font-size:13px;color:#9a3412;font-weight:600;">Senha temporária</p>
        <p style="margin:0;font-size:19px;letter-spacing:1px;color:#0f172a;font-weight:800;">${escapeHtml(temporaryPassword)}</p>
      </div>
      <div style="text-align:center;margin:0 0 22px;">
        <a href="${loginUrl}" style="display:inline-block;background:#ea580c;color:#fff;text-decoration:none;font-weight:800;border-radius:14px;padding:15px 22px;">Acessar a plataforma</a>
      </div>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#334155;">No primeiro acesso, você será solicitado a criar sua senha definitiva.</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#334155;">O EstudoTOP Simulados é o ambiente onde disponibilizamos simulados, jornadas de simulados, relatórios de desempenho e outras ferramentas que auxiliam nossos alunos na preparação para concursos públicos.</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#334155;">Neste momento, o seu cadastro foi criado, mas isso não significa necessariamente que você já possui acesso a algum conteúdo, jornada ou simulado específico. Caso você seja matriculado em uma Jornada de Simulados ou receba acesso a algum produto dentro da plataforma, enviaremos um novo e-mail com todas as orientações necessárias.</p>
      <div style="margin:0 0 18px;padding:16px 18px;border-radius:14px;background:#eff6ff;border:1px solid #bfdbfe;">
        <p style="margin:0;font-size:13px;line-height:1.7;color:#1d4ed8;font-weight:700;">⚠️ Importante: este e-mail não representa confirmação de compra, pagamento ou matrícula em qualquer curso, jornada ou simulado.</p>
      </div>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#334155;">Para concluir o primeiro acesso, entre com o e-mail e a senha temporária acima. Em seguida, o sistema exigirá a criação da sua senha definitiva.</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#334155;">Obrigado por fazer parte da comunidade EstudoTOP!</p>
      <p style="margin:0;font-size:15px;line-height:1.7;color:#334155;">Um grande abraço e conte conosco em sua preparação.<br /><strong style="color:#0f172a;">Equipe EstudoTOP</strong></p>
    `,
  );
}

export function studentWelcomePlainText(studentName: string | null | undefined, studentEmail: string, temporaryPassword: string, loginUrl: string) {
  const greeting = studentName ? `Olá, ${studentName}!` : "Olá!";

  return `${greeting}

Seja muito bem-vindo(a) ao EstudoTOP Simulados! 🦉

Seus dados de acesso:
E-mail: ${studentEmail}
Senha temporária: ${temporaryPassword}

Acesse a plataforma em: ${loginUrl}

No primeiro acesso, você será solicitado a criar sua senha definitiva.

O EstudoTOP Simulados é o ambiente onde disponibilizamos simulados, jornadas de simulados, relatórios de desempenho e outras ferramentas que auxiliam nossos alunos na preparação para concursos públicos.

Neste momento, o seu cadastro foi criado, mas isso não significa necessariamente que você já possui acesso a algum conteúdo, jornada ou simulado específico.

Para concluir o primeiro acesso, entre com o e-mail e a senha temporária acima. Em seguida, o sistema exigirá a criação da sua senha definitiva.

Caso você seja matriculado em uma Jornada de Simulados ou receba acesso a algum produto dentro da plataforma, enviaremos um novo e-mail com todas as orientações necessárias para o seu acesso.

⚠️ Importante: este e-mail não representa confirmação de compra, pagamento ou matrícula em qualquer curso, jornada ou simulado.

Obrigado por fazer parte da comunidade EstudoTOP!

Um grande abraço e conte conosco em sua preparação.

Equipe EstudoTOP
www.estudotop.com.br`;
}
