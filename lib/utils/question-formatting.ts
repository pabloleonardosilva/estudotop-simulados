/**
 * Regras editoriais oficiais para texto de questões.
 *
 * Use antes de persistir enunciados, alternativas e comentários/explicações.
 * O objetivo é aplicar as mesmas correções que a importação com IA usa na prévia,
 * inclusive lacunas como (____) -> (     ).
 */
export function applyQuestionTextRules(value?: string | null): string {
  if (!value) return "";

  let result = String(value)
    .replace(/\r/g, "")
    .replace(/\(\s*[_ ]+\s*\)/g, "(     )");

  // Padroniza itens numerados/romanos que vierem colados no texto.
  result = result.replace(/^([ivx]{1,5})([-.:])(\S)/gim, "$1$2 $3");
  result = result.replace(/^(\d{1,2})([-.:])(\S)/gm, "$1$2 $3");

  // Quando uma lacuna aparece depois de uma palavra, joga a lacuna para linha própria.
  // Não interfere em lacunas que já fazem parte de itens numerados/romanos.
  result = result.replace(/(\w)\s+(\(     \))/g, "$1\n$2");


  // Se listas numeradas/romanas vierem coladas no mesmo parágrafo, separamos visualmente.
  // Ex.: "... a seguir: I. Texto. II. Texto" -> itens em linhas próprias.
  result = result.replace(/\s+((?:[IVX]{1,6}|\d{1,2})[.)]\s+)/g, "\n\n$1");

  // Mantém comandos típicos de banca em bloco próprio quando vierem grudados no texto.
  result = result.replace(
    /\s+(Assinale\s+a\s+(?:alternativa|op[cç][aã]o)\s+(?:correta|incorreta|que|apresenta)|Está\s+correto\s+o\s+que\s+se\s+afirma|A\s+sequ[êe]ncia\s+correta\s+[ée]|Julgue\s+o\s+item|Considerando\s+as\s+informa[cç][õo]es)/gi,
    "\n\n$1",
  );

  // Evita excesso de linhas quando a regra for aplicada mais de uma vez.
  result = result.replace(/\n{3,}/g, "\n\n");

  const isListItemStart = (line: string): boolean => {
    const t = line.trim();
    if (!t) return false;
    return (
      t.startsWith("(     )") ||
      /^[ivx]{1,5}\s*[-.:]\s*\S/i.test(t) ||
      /^\d{1,2}[.:]\s*\S/.test(t)
    );
  };

  const lines = result.split("\n");
  const out: string[] = [];

  for (const line of lines) {
    if (isListItemStart(line) && out.length > 0 && out[out.length - 1].trim() !== "") {
      out.push("");
    }
    out.push(line);
  }

  result = out.join("\n").trim();

  result = result.replace(
    /imagem\s+associada\s+para\s+resolu[cç][aã]o\s+da\s+quest[aã]o/gi,
    (match) => `<strong>${match}</strong>`,
  );

  result = result.replace(
    /\b([\wÀ-ÿ][\wÀ-ÿ\s.-]*\.(png|jpe?g|gif|bmp|webp|tiff?|svg)(?:\s*\(\d+\s*[×x]\s*\d+\))?)/gi,
    (match) => `<strong>${match}</strong>`,
  );

  return result;
}
