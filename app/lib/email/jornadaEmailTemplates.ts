type JornadaEnrollmentParams = {
  studentName: string;
  jornadaTitle: string;
  studentAreaUrl?: string;
};

export function jornadaEnrollmentTemplate({ studentName, jornadaTitle, studentAreaUrl }: JornadaEnrollmentParams): string {
  const greeting = studentName ? `Olá, ${studentName}!` : "Olá!";

  const ctaButton = studentAreaUrl
    ? `
                  <div style="margin:28px 0 0;text-align:center;">
                    <a href="${studentAreaUrl}" style="display:inline-block;background:linear-gradient(90deg,#f97316,#facc15);color:#111827;text-decoration:none;font-weight:900;font-size:15px;padding:15px 28px;border-radius:999px;box-shadow:0 12px 30px rgba(249,115,22,0.25);">
                      Acessar minha área do aluno
                    </a>
                  </div>`
    : "";

  return `
  <!doctype html>
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>🦉 Você foi inserido(a) em uma Jornada de Simulados!</title>
    </head>
    <body style="margin:0;padding:0;background:#f6f8fc;font-family:Arial,Helvetica,sans-serif;color:#172033;-webkit-font-smoothing:antialiased;">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
        Você foi inserido(a) na Jornada ${jornadaTitle}. Acesse a plataforma e acompanhe sua evolução.
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
                    🦉 Temos uma ótima notícia!
                  </h1>
                </td>
              </tr>

              <tr>
                <td style="padding:0 40px 42px;background:#ffffff;">
                  <div style="height:1px;background:#eef2f7;margin:0 0 30px;"></div>

                  <p style="margin:0 0 20px;font-size:17px;line-height:1.85;color:#111827;font-weight:800;">
                    ${greeting}
                  </p>

                  <p style="margin:0 0 20px;font-size:16px;line-height:1.85;color:#334155;">
                    Você acaba de ser inserido(a) na jornada:
                  </p>

                  <div style="margin:0 0 28px;border-radius:20px;background:#fff7ed;border:1px solid #fed7aa;padding:21px 23px;text-align:center;">
                    <p style="margin:0;font-size:19px;line-height:1.5;color:#0f172a;font-weight:900;">
                      🎯 ${jornadaTitle}
                    </p>
                  </div>

                  <p style="margin:0 0 20px;font-size:16px;line-height:1.85;color:#334155;">
                    A partir de agora, você já pode acessar a plataforma <strong style="color:#0f172a;">EstudoTOP Simulados</strong> e acompanhar sua evolução dentro dessa jornada.
                  </p>

                  <p style="margin:0 0 20px;font-size:17px;line-height:1.85;color:#111827;font-weight:800;">
                    Mas afinal, o que é uma Jornada de Simulados?
                  </p>

                  <p style="margin:0 0 20px;font-size:16px;line-height:1.85;color:#334155;">
                    Uma jornada é um programa de treinamento composto por diversos simulados organizados de forma estratégica ao longo do tempo. Conforme a programação definida para a jornada, novos simulados serão liberados gradualmente para que você possa acompanhar seu desempenho, identificar oportunidades de melhoria e evoluir de forma consistente até a sua prova.
                  </p>

                  <p style="margin:0 0 20px;font-size:16px;line-height:1.85;color:#334155;">
                    📌 Todas as informações sobre sua jornada, simulados disponíveis, datas de liberação, resultados e relatórios de desempenho estão disponíveis dentro da plataforma.
                  </p>

                  <p style="margin:0 0 20px;font-size:16px;line-height:1.85;color:#334155;">
                    Agora é só acessar sua área do aluno e iniciar sua preparação.
                  </p>

                  <p style="margin:0 0 20px;font-size:16px;line-height:1.85;color:#334155;">
                    Desejamos muito sucesso nesta nova etapa da sua caminhada rumo à aprovação!
                  </p>

                  <p style="margin:0 0 6px;font-size:16px;line-height:1.85;color:#334155;">
                    Conte conosco.
                  </p>

                  <p style="margin:0 0 4px;font-size:16px;line-height:1.85;color:#0f172a;font-weight:900;">
                    Equipe EstudoTOP
                  </p>

                  <p style="margin:0;font-size:14px;line-height:1.85;color:#64748b;">
                    www.estudotop.com.br
                  </p>
                  ${ctaButton}
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

export function jornadaEnrollmentPlainText(studentName: string, jornadaTitle: string): string {
  const greeting = studentName ? `Olá, ${studentName}!` : "Olá!";

  return `${greeting}

Temos uma ótima notícia para você! 🦉

Você acaba de ser inserido(a) na jornada: ${jornadaTitle}

🎯

A partir de agora, você já pode acessar a plataforma EstudoTOP Simulados e acompanhar sua evolução dentro dessa jornada.

Mas afinal, o que é uma Jornada de Simulados?

Uma jornada é um programa de treinamento composto por diversos simulados organizados de forma estratégica ao longo do tempo. Conforme a programação definida para a jornada, novos simulados serão liberados gradualmente para que você possa acompanhar seu desempenho, identificar oportunidades de melhoria e evoluir de forma consistente até a sua prova.

📌 Todas as informações sobre sua jornada, simulados disponíveis, datas de liberação, resultados e relatórios de desempenho estão disponíveis dentro da plataforma.

Agora é só acessar sua área do aluno e iniciar sua preparação.

Desejamos muito sucesso nesta nova etapa da sua caminhada rumo à aprovação!

Conte conosco.

Equipe EstudoTOP
www.estudotop.com.br`;
}

type ScheduleItem = {
  order: number;
  title: string;
  scheduledReleaseAt: string | null;
  releasedAt?: string | null;
  status: string;
  highlight?: boolean;
};

type WelcomeParams = {
  studentName: string;
  jornadaTitle: string;
  startedAt: string;
  expiresAt: string;
  totalSimulados: number;
  examDate?: string | null;
  effectiveEndDate?: string | null;
  jornadaUrl: string;
  firstSimuladoTitle?: string | null;
  schedule?: ScheduleItem[];
};

type ReleasedParams = {
  studentName: string;
  simuladoTitle: string;
  jornadaTitle: string;
  position: number;
  total: number;
  expiresAt: string;
  simuladoUrl: string;
  schedule?: ScheduleItem[];
};

type ConsolidatedEnrollmentParams = WelcomeParams & {
  firstSimuladoUrl?: string | null;
};

type ConsolidatedApprovalParams = ConsolidatedEnrollmentParams & {
  firstAccessUrl: string;
  firstAccessExpiresInHours: number;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(value + "T00:00:00"));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusLabel(status: string): string {
  if (status === "completed") return "Concluído";
  if (status === "in_progress") return "Em andamento";
  if (status === "available") return "Disponível";
  if (status === "locked_late") return "Atrasado";
  if (status === "locked") return "Aguardando liberação";
  return status || "—";
}

function shell(title: string, preheader: string, body: string): string {
  return `
  <div style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
    <div style="max-width:720px;margin:0 auto;padding:28px 16px;">
      <div style="background:#0f172a;border-radius:28px 28px 0 0;padding:26px 28px;color:#fff;">
        <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#fb923c;font-weight:700;">EstudoTOP Simulados</div>
        <h1 style="margin:10px 0 0;font-size:24px;line-height:1.25;">${escapeHtml(title)}</h1>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 28px 28px;padding:28px;">
        ${body}
      </div>
      <p style="text-align:center;color:#94a3b8;font-size:12px;margin:18px 0 0;">Mensagem automática da plataforma EstudoTOP Simulados.</p>
    </div>
  </div>`;
}

function scheduleTable(schedule: ScheduleItem[] | undefined): string {
  if (!schedule || schedule.length === 0) return "";

  const rows = schedule.map((item) => `
    <tr style="background:${item.highlight ? "#fff7ed" : "#ffffff"};">
      <td style="padding:12px;border-bottom:1px solid #e2e8f0;font-weight:700;color:#0f172a;">${item.order}</td>
      <td style="padding:12px;border-bottom:1px solid #e2e8f0;color:#0f172a;">${escapeHtml(item.title)}</td>
      <td style="padding:12px;border-bottom:1px solid #e2e8f0;color:#475569;">${formatDate(item.scheduledReleaseAt)}</td>
      <td style="padding:12px;border-bottom:1px solid #e2e8f0;color:#475569;">${item.releasedAt ? formatDate(item.releasedAt.slice(0, 10)) : "—"}</td>
      <td style="padding:12px;border-bottom:1px solid #e2e8f0;font-weight:700;color:${item.highlight ? "#ea580c" : "#334155"};">${statusLabel(item.status)}</td>
    </tr>`).join("");

  return `
    <h2 style="font-size:18px;margin:26px 0 12px;color:#0f172a;">Cronograma da Jornada</h2>
    <div style="overflow:hidden;border:1px solid #e2e8f0;border-radius:18px;">
      <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f8fafc;color:#475569;text-align:left;">
            <th style="padding:12px;border-bottom:1px solid #e2e8f0;">#</th>
            <th style="padding:12px;border-bottom:1px solid #e2e8f0;">Simulado</th>
            <th style="padding:12px;border-bottom:1px solid #e2e8f0;">Previsto</th>
            <th style="padding:12px;border-bottom:1px solid #e2e8f0;">Liberado</th>
            <th style="padding:12px;border-bottom:1px solid #e2e8f0;">Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

export function jornadaWelcomeTemplate(params: WelcomeParams): string {
  const hasLinkedSimulados = Boolean(params.firstSimuladoTitle) || Boolean(params.schedule?.length);
  const firstSimulado = params.firstSimuladoTitle
    ? `<div style="margin:20px 0;padding:18px;border-radius:18px;background:#fff7ed;border:1px solid #fed7aa;">
        <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.14em;color:#ea580c;font-weight:800;">Primeiro simulado liberado</div>
        <p style="margin:8px 0 0;font-size:16px;font-weight:800;color:#0f172a;">${escapeHtml(params.firstSimuladoTitle)}</p>
      </div>`
    : "";

  const emptyNotice = !hasLinkedSimulados
    ? `<div style="margin:20px 0;padding:18px;border-radius:18px;background:#f8fafc;border:1px dashed #cbd5e1;color:#475569;">
        <strong style="color:#0f172a;">Ainda não há simulados disponíveis nesta Jornada.</strong><br />
        Assim que um simulado for liberado para você, enviaremos um novo aviso por email. Enquanto isso, acompanhe sua área do aluno e siga o cronograma da Jornada.
      </div>`
    : "";

  return shell(
    `Bem-vindo à ${params.jornadaTitle}`,
    `Você foi matriculado na Jornada ${params.jornadaTitle}.`,
    `
      <p style="margin:0 0 18px;font-size:16px;line-height:1.6;">Olá, <strong>${escapeHtml(params.studentName)}</strong>.</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#334155;">Sua matrícula na Jornada <strong>${escapeHtml(params.jornadaTitle)}</strong> foi criada com sucesso.</p>

      <div style="display:grid;gap:12px;margin:18px 0;">
        <div style="padding:14px;border-radius:16px;background:#f8fafc;border:1px solid #e2e8f0;"><strong>Início:</strong> ${formatDate(params.startedAt)}</div>
        <div style="padding:14px;border-radius:16px;background:#f8fafc;border:1px solid #e2e8f0;"><strong>Acesso até:</strong> ${formatDate(params.expiresAt)}</div>
        <div style="padding:14px;border-radius:16px;background:#f8fafc;border:1px solid #e2e8f0;"><strong>Total de simulados:</strong> ${params.totalSimulados}</div>
        ${params.examDate ? `<div style="padding:14px;border-radius:16px;background:#f8fafc;border:1px solid #e2e8f0;"><strong>Data da prova:</strong> ${formatDate(params.examDate)}</div>` : ""}
        ${params.effectiveEndDate ? `<div style="padding:14px;border-radius:16px;background:#f8fafc;border:1px solid #e2e8f0;"><strong>Liberação planejada até:</strong> ${formatDate(params.effectiveEndDate)}</div>` : ""}
      </div>

      ${firstSimulado}
      ${emptyNotice}

      <h2 style="font-size:18px;margin:26px 0 10px;color:#0f172a;">Como funciona</h2>
      <ul style="padding-left:20px;color:#334155;line-height:1.7;font-size:14px;">
        <li>Os simulados são liberados progressivamente.</li>
        <li>O ideal é concluir o simulado anterior para avançar com regularidade.</li>
        <li>Quando houver data de prova, o cronograma é organizado para antecipar as liberações.</li>
        <li>Após a expiração, novas tentativas não poderão ser iniciadas.</li>
      </ul>

      ${scheduleTable(params.schedule)}

      <div style="margin-top:28px;text-align:center;">
        <a href="${params.jornadaUrl}" style="display:inline-block;background:#ea580c;color:#fff;text-decoration:none;font-weight:800;border-radius:14px;padding:14px 20px;">Acessar minhas Jornadas</a>
      </div>
    `,
  );
}

function consolidatedJourneyBody(
  params: ConsolidatedEnrollmentParams,
  intro: string,
  ctaUrl: string,
  ctaLabel: string,
): string {
  const firstSimulado = params.firstSimuladoTitle
    ? `<div style="margin:22px 0;padding:20px;border-radius:18px;background:#fff7ed;border:1px solid #fed7aa;">
        <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.14em;color:#ea580c;font-weight:800;">Seu primeiro simulado já está disponível</div>
        <p style="margin:9px 0 5px;font-size:17px;font-weight:800;color:#0f172a;">${escapeHtml(params.firstSimuladoTitle)}</p>
        <p style="margin:0;color:#64748b;font-size:13px;">Simulado 1 de ${params.totalSimulados}</p>
      </div>`
    : `<div style="margin:22px 0;padding:18px;border-radius:18px;background:#f8fafc;border:1px dashed #cbd5e1;color:#475569;">
        Ainda não há simulados disponíveis nesta Jornada. Você receberá um aviso quando o primeiro for liberado.
      </div>`;

  return `
    <p style="margin:0 0 18px;font-size:16px;line-height:1.65;">Olá, <strong>${escapeHtml(params.studentName)}</strong>!</p>
    ${intro}

    <div style="margin:22px 0;padding:22px;border-radius:18px;background:#0f172a;color:#fff;text-align:center;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.16em;color:#fb923c;font-weight:800;">Sua Jornada</div>
      <p style="margin:10px 0 0;font-size:21px;line-height:1.4;font-weight:900;">${escapeHtml(params.jornadaTitle)}</p>
    </div>

    <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#334155;">
      Essa Jornada foi organizada para conduzir sua preparação de forma progressiva. Ao longo do cronograma, novos simulados serão liberados para que você acompanhe seu desempenho, identifique pontos de melhoria e evolua com consistência até a prova.
    </p>

    ${firstSimulado}

    <h2 style="font-size:18px;margin:26px 0 12px;color:#0f172a;">Dados da sua Jornada</h2>
    <div style="display:grid;gap:10px;margin:0 0 20px;">
      <div style="padding:14px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0;"><strong>Início:</strong> ${formatDate(params.startedAt)}</div>
      <div style="padding:14px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0;"><strong>Acesso disponível até:</strong> ${formatDate(params.expiresAt)}</div>
      <div style="padding:14px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0;"><strong>Total de simulados:</strong> ${params.totalSimulados}</div>
      ${params.firstSimuladoTitle ? `<div style="padding:14px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0;"><strong>Primeiro simulado:</strong> ${escapeHtml(params.firstSimuladoTitle)}</div>` : ""}
    </div>

    <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#334155;">
      Os próximos simulados serão disponibilizados progressivamente, conforme o cronograma da Jornada. Sempre que um novo simulado for liberado posteriormente, você receberá um aviso.
    </p>

    ${scheduleTable(params.schedule)}

    <div style="margin-top:28px;text-align:center;">
      <a href="${ctaUrl}" style="display:inline-block;background:#ea580c;color:#fff;text-decoration:none;font-weight:800;border-radius:14px;padding:15px 22px;">${ctaLabel}</a>
    </div>

    <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#64748b;">
      Se você não reconhece esta matrícula ou precisa de ajuda, responda a este e-mail para falar com nossa equipe.
    </p>
    <p style="margin:20px 0 0;font-size:15px;line-height:1.7;color:#334155;">
      Bons estudos e uma excelente Jornada!<br /><strong style="color:#0f172a;">Equipe EstudoTOP</strong>
    </p>
  `;
}

export function approvedStudentJornadaConsolidatedTemplate(params: ConsolidatedEnrollmentParams): string {
  return shell(
    "Sua nova Jornada já começou",
    "Você foi matriculado em uma nova Jornada e seu primeiro simulado já está liberado.",
    consolidatedJourneyBody(
      params,
      `<p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#334155;">Você acaba de ser matriculado em uma nova Jornada.</p>`,
      params.firstSimuladoUrl || params.jornadaUrl,
      params.firstSimuladoUrl ? "Acessar primeiro simulado" : "Acessar minha Jornada",
    ),
  );
}

export function pendingStudentJornadaConsolidatedTemplate(params: ConsolidatedApprovalParams): string {
  const firstAccessIntro = `
    <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#334155;">
      Temos uma ótima notícia: seu cadastro no <strong style="color:#0f172a;">EstudoTOP Simulados foi aprovado</strong> e seu acesso à plataforma já está liberado.
    </p>
    <div style="margin:22px 0;padding:20px;border-radius:18px;background:#eff6ff;border:1px solid #bfdbfe;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.14em;color:#1d4ed8;font-weight:800;">Primeiro acesso</div>
      <p style="margin:9px 0 0;font-size:14px;line-height:1.7;color:#334155;">
        Para acessar a plataforma pela primeira vez, crie sua senha pessoal pelo botão abaixo. O link é individual, seguro e válido por <strong>${params.firstAccessExpiresInHours} horas</strong>.
      </p>
    </div>`;

  return shell(
    "Seu acesso ao EstudoTOP foi liberado",
    "Seu cadastro foi aprovado, sua Jornada já está disponível e o primeiro simulado foi liberado.",
    consolidatedJourneyBody(
      params,
      firstAccessIntro,
      params.firstAccessUrl,
      "Criar minha senha e começar",
    ) + `
      <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#64748b;word-break:break-all;">
        Se o botão não funcionar, copie e cole este endereço no navegador:<br />${escapeHtml(params.firstAccessUrl)}
      </p>`,
  );
}

export function approvedStudentJornadaConsolidatedPlainText(params: ConsolidatedEnrollmentParams): string {
  return `Olá, ${params.studentName}!

Você acaba de ser matriculado na Jornada:

${params.jornadaTitle}

Essa Jornada foi organizada para conduzir sua preparação de forma progressiva.

${params.firstSimuladoTitle ? `Seu primeiro simulado já está disponível:\n${params.firstSimuladoTitle}\nSimulado 1 de ${params.totalSimulados}` : "Ainda não há simulados disponíveis nesta Jornada."}

Dados da sua Jornada:
- Início: ${formatDate(params.startedAt)}
- Acesso disponível até: ${formatDate(params.expiresAt)}
- Total de simulados: ${params.totalSimulados}
${params.firstSimuladoTitle ? `- Primeiro simulado: ${params.firstSimuladoTitle}` : ""}

Os próximos simulados serão disponibilizados progressivamente. Sempre que um novo simulado for liberado posteriormente, você receberá um aviso.

Acesse em: ${params.firstSimuladoUrl || params.jornadaUrl}

Se você não reconhece esta matrícula ou precisa de ajuda, responda a este e-mail.

Bons estudos e uma excelente Jornada!
Equipe EstudoTOP`;
}

export function pendingStudentJornadaConsolidatedPlainText(params: ConsolidatedApprovalParams): string {
  return `Olá, ${params.studentName}!

Temos uma ótima notícia: seu cadastro no EstudoTOP Simulados foi aprovado e seu acesso à plataforma já está liberado.

Você também foi matriculado na Jornada:

${params.jornadaTitle}

${params.firstSimuladoTitle ? `Seu primeiro simulado já está disponível:\n${params.firstSimuladoTitle}\nSimulado 1 de ${params.totalSimulados}` : "Ainda não há simulados disponíveis nesta Jornada."}

Dados da sua Jornada:
- Início: ${formatDate(params.startedAt)}
- Acesso disponível até: ${formatDate(params.expiresAt)}
- Total de simulados: ${params.totalSimulados}
${params.firstSimuladoTitle ? `- Primeiro simulado: ${params.firstSimuladoTitle}` : ""}

Primeiro acesso:
Crie sua senha pessoal pelo link individual abaixo. Ele é válido por ${params.firstAccessExpiresInHours} horas.

${params.firstAccessUrl}

Os próximos simulados serão disponibilizados progressivamente. Sempre que um novo simulado for liberado posteriormente, você receberá um aviso.

Se você não reconhece este cadastro ou precisa de ajuda, responda a este e-mail.

Bons estudos e seja muito bem-vindo(a) ao EstudoTOP Simulados!
Equipe EstudoTOP`;
}

export function simuladoReleasedTemplate(params: ReleasedParams): string {
  const greeting = params.studentName ? `Olá, ${escapeHtml(params.studentName)}!` : "Olá!";

  const scheduleSection = params.schedule?.length
    ? `
                  <div style="margin:30px 0 0;">
                    <p style="margin:0 0 14px;font-size:17px;line-height:1.6;color:#111827;font-weight:900;">
                      Cronograma da sua jornada
                    </p>
                    ${scheduleTable(params.schedule)}
                  </div>`
    : "";

  return `
  <!doctype html>
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>🎯 Novo simulado liberado!</title>
    </head>
    <body style="margin:0;padding:0;background:#f6f8fc;font-family:Arial,Helvetica,sans-serif;color:#172033;-webkit-font-smoothing:antialiased;">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
        O simulado ${escapeHtml(params.simuladoTitle)} foi liberado na Jornada ${escapeHtml(params.jornadaTitle)}.
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
                    🎯 Novo simulado liberado!
                  </h1>
                </td>
              </tr>

              <tr>
                <td style="padding:0 40px 42px;background:#ffffff;">
                  <div style="height:1px;background:#eef2f7;margin:0 0 30px;"></div>

                  <p style="margin:0 0 20px;font-size:17px;line-height:1.85;color:#111827;font-weight:800;">
                    ${greeting}
                  </p>

                  <p style="margin:0 0 20px;font-size:16px;line-height:1.85;color:#334155;">
                    Temos uma novidade para você! 🎯
                  </p>

                  <p style="margin:0 0 12px;font-size:16px;line-height:1.85;color:#334155;">
                    O simulado:
                  </p>

                  <div style="margin:0 0 24px;border-radius:20px;background:#fff7ed;border:1px solid #fed7aa;padding:20px 23px;text-align:center;">
                    <p style="margin:0;font-size:19px;line-height:1.5;color:#0f172a;font-weight:900;">
                      📚 ${escapeHtml(params.simuladoTitle)}
                    </p>
                    <p style="margin:7px 0 0;color:#64748b;font-size:14px;line-height:1.6;">
                      Simulado ${params.position} de ${params.total || params.position}
                    </p>
                  </div>

                  <p style="margin:0 0 12px;font-size:16px;line-height:1.85;color:#334155;">
                    pertencente à jornada:
                  </p>

                  <div style="margin:0 0 24px;border-radius:20px;background:#f8fafc;border:1px solid #e2e8f0;padding:20px 23px;text-align:center;">
                    <p style="margin:0;font-size:19px;line-height:1.5;color:#0f172a;font-weight:900;">
                      🚀 ${escapeHtml(params.jornadaTitle)}
                    </p>
                  </div>

                  <p style="margin:0 0 20px;font-size:16px;line-height:1.85;color:#334155;">
                    acaba de ser liberado em sua área do aluno.
                  </p>

                  <p style="margin:0 0 20px;font-size:16px;line-height:1.85;color:#334155;">
                    Este é mais um passo importante dentro da sua preparação e uma excelente oportunidade para testar seus conhecimentos, identificar pontos de melhoria e acompanhar sua evolução.
                  </p>

                  <p style="margin:0 0 20px;font-size:16px;line-height:1.85;color:#334155;">
                    Lembre-se de que os simulados fazem parte de um planejamento pensado para ajudá-lo(a) a chegar cada vez mais preparado(a) ao dia da prova.
                  </p>

                  <p style="margin:0 0 20px;font-size:16px;line-height:1.85;color:#334155;">
                    📌 Todas as informações sobre sua jornada, simulados disponíveis, cronograma, resultados e relatórios de desempenho podem ser consultadas diretamente na plataforma.
                  </p>

                  <p style="margin:0 0 20px;font-size:16px;line-height:1.85;color:#334155;">
                    Acesse sua área do aluno e confira o novo conteúdo liberado para você.
                  </p>

                  <p style="margin:0 0 20px;font-size:16px;line-height:1.85;color:#334155;">
                    Desejamos uma excelente prova e muito sucesso em sua preparação!
                  </p>

                  <p style="margin:0 0 6px;font-size:16px;line-height:1.85;color:#334155;">
                    Conte sempre conosco.
                  </p>

                  <p style="margin:0 0 4px;font-size:16px;line-height:1.85;color:#0f172a;font-weight:900;">
                    Equipe EstudoTOP
                  </p>

                  <div style="margin:30px 0 0;text-align:center;">
                    <a href="${params.simuladoUrl}" style="display:inline-block;background:linear-gradient(90deg,#f97316,#facc15);color:#111827;text-decoration:none;font-weight:900;font-size:15px;padding:15px 28px;border-radius:999px;box-shadow:0 12px 30px rgba(249,115,22,0.25);">
                      Acessar simulado liberado
                    </a>
                  </div>

                  <div style="margin:22px 0 0;padding:15px 18px;border-radius:18px;background:#f8fafc;border:1px solid #e2e8f0;color:#64748b;font-size:14px;line-height:1.7;text-align:center;">
                    Acesso à Jornada até: <strong style="color:#0f172a;">${formatDate(params.expiresAt)}</strong>
                  </div>

                  ${scheduleSection}
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

export function simuladoReleasedPlainText(params: ReleasedParams): string {
  const greeting = params.studentName ? `Olá, ${params.studentName}!` : "Olá!";
  const schedule = params.schedule?.length
    ? `

Cronograma da jornada:
${params.schedule
        .map((item) => `${item.order}. ${item.title} — ${statusLabel(item.status)} — previsão: ${formatDate(item.scheduledReleaseAt)}${item.releasedAt ? ` — liberado em: ${formatDate(item.releasedAt.slice(0, 10))}` : ""}`)
        .join("\n")}`
    : "";

  return `${greeting}

Temos uma novidade para você! 🎯

O simulado:

📚 ${params.simuladoTitle}

pertencente à jornada:

🚀 ${params.jornadaTitle}

acaba de ser liberado em sua área do aluno.

Este é mais um passo importante dentro da sua preparação e uma excelente oportunidade para testar seus conhecimentos, identificar pontos de melhoria e acompanhar sua evolução.

Lembre-se de que os simulados fazem parte de um planejamento pensado para ajudá-lo(a) a chegar cada vez mais preparado(a) ao dia da prova.

📌 Todas as informações sobre sua jornada, simulados disponíveis, cronograma, resultados e relatórios de desempenho podem ser consultadas diretamente na plataforma.

Acesse sua área do aluno e confira o novo conteúdo liberado para você.

Desejamos uma excelente prova e muito sucesso em sua preparação!

Conte sempre conosco.

Equipe EstudoTOP

Link do simulado: ${params.simuladoUrl}
Acesso à Jornada até: ${formatDate(params.expiresAt)}${schedule}`;
}
