type StudentWelcomeEmailProps = {
  studentName?: string | null;
  studentEmail: string;
  temporaryPassword: string;
  loginUrl: string;
};

/**
 * Template HTML do primeiro e-mail institucional do aluno.
 *
 * Confirma que o cadastro foi criado no EstudoTOP Simulados e traz os dados de
 * acesso (e-mail + senha temporária) e o link de login. No primeiro acesso, o
 * aluno é redirecionado para criar sua senha definitiva.
 */
export function studentWelcomeTemplate({ studentName, studentEmail, temporaryPassword, loginUrl }: StudentWelcomeEmailProps) {
  const greeting = studentName ? `Olá, ${studentName}!` : "Olá!";

  return `
  <!doctype html>
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>🦉 Bem-vindo(a) ao EstudoTOP Simulados!</title>
    </head>
    <body style="margin:0;padding:0;background:#f6f8fc;font-family:Arial,Helvetica,sans-serif;color:#172033;-webkit-font-smoothing:antialiased;">
      <!-- ESTUDOTOP_WELCOME_CLEAN_V4 -->
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
        Seja muito bem-vindo(a) ao EstudoTOP Simulados. Seu cadastro foi criado em nossa plataforma.
      </div>

      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f6f8fc;padding:34px 14px;">
        <tr>
          <td align="center">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:680px;background:#ffffff;border:1px solid #e6edf6;border-radius:28px;overflow:hidden;box-shadow:0 22px 70px rgba(15,23,42,0.10);">
              <tr>
                <td style="height:7px;background:linear-gradient(90deg,#f97316,#facc15,#f97316);"></td>
              </tr>

              <tr>
                <td style="padding:42px 40px 28px;text-align:center;background:#ffffff;">
                  <div style="display:inline-block;margin-bottom:18px;border-radius:999px;background:#fff7ed;border:1px solid #fed7aa;padding:9px 16px;font-size:11px;line-height:1;letter-spacing:3px;text-transform:uppercase;color:#c2410c;font-weight:800;">
                    EstudoTOP Simulados
                  </div>

                  <h1 style="margin:0;font-size:34px;line-height:1.18;color:#0f172a;font-weight:900;letter-spacing:-0.8px;">
                    🦉 Você chegou!
                  </h1>

                  <p style="margin:16px auto 0;max-width:510px;font-size:17px;line-height:1.75;color:#64748b;font-weight:500;">
                    Seu cadastro foi criado em nossa plataforma. Use os dados abaixo para fazer o primeiro acesso.
                  </p>
                </td>
              </tr>

              <tr>
                <td style="padding:0 40px 42px;background:#ffffff;">
                  <div style="height:1px;background:#eef2f7;margin:0 0 30px;"></div>

                  <p style="margin:0 0 20px;font-size:17px;line-height:1.85;color:#111827;font-weight:800;">
                    ${greeting}
                  </p>

                  <p style="margin:0 0 20px;font-size:16px;line-height:1.85;color:#334155;">
                    Seja muito bem-vindo(a) ao <strong style="color:#0f172a;">EstudoTOP Simulados</strong>! 🦉
                  </p>

                  <div style="margin:0 0 24px;border-radius:20px;background:#fff7ed;border:1px solid #fed7aa;padding:24px 26px;">
                    <p style="margin:0 0 14px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#c2410c;font-weight:800;">
                      Seus dados de acesso
                    </p>
                    <p style="margin:0 0 4px;font-size:14px;line-height:1.5;color:#9a3412;font-weight:600;">E-mail</p>
                    <p style="margin:0 0 16px;font-size:17px;line-height:1.4;color:#0f172a;font-weight:800;">${studentEmail}</p>
                    <p style="margin:0 0 4px;font-size:14px;line-height:1.5;color:#9a3412;font-weight:600;">Senha temporária</p>
                    <p style="margin:0;font-size:20px;line-height:1.4;letter-spacing:1px;color:#0f172a;font-weight:800;">${temporaryPassword}</p>
                  </div>

                  <p style="margin:0 0 24px;text-align:center;">
                    <a href="${loginUrl}" style="display:inline-block;background:linear-gradient(90deg,#f97316,#facc15);color:#111827;text-decoration:none;font-weight:800;padding:16px 34px;border-radius:14px;font-size:15px;">
                      Acessar a plataforma
                    </a>
                  </p>

                  <p style="margin:0 0 20px;font-size:16px;line-height:1.85;color:#334155;">
                    No primeiro acesso, você será solicitado a criar sua senha definitiva.
                  </p>

                  <p style="margin:0 0 20px;font-size:16px;line-height:1.85;color:#334155;">
                    O EstudoTOP Simulados é o ambiente onde disponibilizamos simulados, jornadas de simulados, relatórios de desempenho e outras ferramentas que auxiliam nossos alunos na preparação para concursos públicos.
                  </p>

                  <p style="margin:0 0 20px;font-size:16px;line-height:1.85;color:#334155;">
                    Neste momento, o seu cadastro foi criado, mas isso não significa necessariamente que você já possui acesso a algum conteúdo, jornada ou simulado específico.
                  </p>

                  <p style="margin:0 0 20px;font-size:16px;line-height:1.85;color:#334155;">
                    Caso você seja matriculado em uma Jornada de Simulados ou receba acesso a algum produto dentro da plataforma, enviaremos um novo e-mail com todas as orientações necessárias para o seu acesso.
                  </p>

                  <div style="margin:28px 0;border-radius:20px;background:#fff7ed;border:1px solid #fed7aa;padding:21px 23px;">
                    <p style="margin:0;font-size:15px;line-height:1.75;color:#9a3412;font-weight:800;">
                      ⚠️ Importante: este e-mail não representa confirmação de compra, pagamento ou matrícula em qualquer curso, jornada ou simulado.
                    </p>
                  </div>

                  <p style="margin:0 0 20px;font-size:16px;line-height:1.85;color:#334155;">
                    Para concluir o primeiro acesso, entre com o e-mail e a senha temporária acima. Em seguida, o sistema exigirá a criação da sua senha definitiva.
                  </p>

                  <p style="margin:0 0 20px;font-size:16px;line-height:1.85;color:#334155;">
                    Obrigado por fazer parte da comunidade EstudoTOP!
                  </p>

                  <p style="margin:0 0 6px;font-size:16px;line-height:1.85;color:#334155;">
                    Um grande abraço e conte conosco em sua preparação.
                  </p>

                  <p style="margin:0 0 4px;font-size:16px;line-height:1.85;color:#0f172a;font-weight:900;">
                    Equipe EstudoTOP
                  </p>

                  <p style="margin:0;font-size:14px;line-height:1.85;color:#64748b;">
                    www.estudotop.com.br
                  </p>
                </td>
              </tr>
            </table>

            <p style="max-width:620px;margin:22px auto 0;font-size:12px;line-height:1.7;color:#94a3b8;text-align:center;">
              EstudoTOP Simulados — Plataforma de preparação para concursos públicos.
            </p>
          </td>
        </tr>
      </table>
    </body>
  </html>`;
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
