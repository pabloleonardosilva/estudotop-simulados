import "server-only";

/**
 * URL pública canônica do EstudoTOP Simulados para links enviados em e-mails.
 *
 * Fonte única: NEXT_PUBLIC_APP_URL. NUNCA usa a origem da request — e-mails
 * disparados a partir de localhost apontariam para localhost. Se a variável
 * não estiver configurada, falha de forma explícita em vez de enviar um link
 * inválido ao aluno.
 */
export function getPublicAppUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!raw) {
    throw new Error(
      "NEXT_PUBLIC_APP_URL não está configurada. Defina a URL pública oficial da aplicação antes de enviar e-mails."
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("NEXT_PUBLIC_APP_URL não é uma URL válida.");
  }

  // Sem barra final: os chamadores concatenam caminhos como `/login`.
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
}
