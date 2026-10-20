export const QUESTION_PRESENTATION_BLOCKED_MESSAGE =
  "O navegador bloqueou a janela de apresentação. Permita pop-ups para este site e clique em Visualizar novamente.";

export function getQuestionPresentationPath(questionId: string) {
  return `/questoes/${encodeURIComponent(questionId)}/preview`;
}

// Precisa ser chamada diretamente no handler do clique: fora de um gesto do
// usuário o navegador bloqueia a janela. Sem "noopener" nas features, pois só
// a referência retornada permite detectar o bloqueio; o opener é desfeito logo
// em seguida.
export function openQuestionPresentationWindow(questionId: string): boolean {
  const width = Math.min(1440, window.screen.availWidth);
  const height = Math.min(960, window.screen.availHeight);
  const left = Math.max(0, Math.round((window.screen.availWidth - width) / 2));
  const top = Math.max(0, Math.round((window.screen.availHeight - height) / 2));

  const popup = window.open(
    getQuestionPresentationPath(questionId),
    `estudotop-apresentacao-${questionId}`,
    `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`,
  );

  if (!popup) return false;

  popup.opener = null;
  popup.focus();
  return true;
}
