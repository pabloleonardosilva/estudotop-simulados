export const IMAGE_REQUIRED_PHRASE_REGEX =
  /imagem\s+associada\s+para\s+resolu[cç][aã]o\s+da\s+quest[aã]o/gi;

export const IMAGE_FILE_REFERENCE_REGEX =
  /\b[\w][\w\s.-]*\.(png|jpe?g|gif|bmp|webp|tiff?|svg)(?:\s*\(\d+\s*[×x]\s*\d+\))?/gi;

// Marcador de rejeição manual ("Não é uma imagem"): um <span data-image-ref="rejected"> envolvendo
// EXATAMENTE o trecho detectado, sem alterar o texto. Persiste porque faz parte do próprio HTML já
// salvo em statement/explanation_text/review_comment/alternativa — nenhuma coluna nova.
const IMAGE_REJECTED_SPAN_REGEX = /<span[^>]*\bdata-image-ref=["']rejected["'][^>]*>([\s\S]*?)<\/span>/gi;

// ─── Heurística contextual (reduz falso positivo de nome de arquivo citado no texto) ──────────────
//
// Não é uma regra absoluta ("se tem .png, nunca é imagem"): olha o texto ao redor de cada referência
// de arquivo detectada. Sinal positivo (frases que indicam imagem de fato) sempre prevalece sobre
// sinal negativo (enumeração de arquivos/extensões de documento por perto). Sem nenhum sinal, mantém
// o comportamento anterior (trata como possível imagem) — compatibilidade preservada.
const IMAGE_POSITIVE_CONTEXT_REGEX =
  /(observe|veja|analise|conforme|de acordo com)\s+(a\s+)?(imagem|figura|ilustra[cç][aã]o|gr[aá]fico|foto(?:grafia)?)\b|\b(imagem|figura)\s+(abaixo|a\s+seguir|ao\s+lado)\b/i;

// Sinal positivo mais simples: o substantivo aparece bem colado à referência (poucas palavras antes),
// mesmo sem um dos verbos acima — "... e a imagem grafico.png", "Anexo — figura relatorio.png" etc.
// Checado só numa janela curta ANTES do match (não a janela ampla de contexto), pra não confundir
// "imagem"/"figura" mencionada bem antes, numa frase anterior, com referência real a este arquivo.
const IMAGE_POSITIVE_NOUN_PROXIMITY_REGEX = /\b(imagem|figura|ilustra[cç][aã]o|gr[aá]fico|foto(?:grafia)?)\b/i;
const IMAGE_POSITIVE_PROXIMITY_WINDOW = 30;

const IMAGE_NEGATIVE_EXTENSION_REGEX =
  /\.(pdf|docx?|xlsx?|pptx?|txt|csv|zip|rar|7z|json|xml|html?|sql|mp3|mp4|avi|mov)\b/i;

const IMAGE_NEGATIVE_PHRASE_REGEX =
  /\b(arquivos?|extens(?:ã|a)o(?:es)?|nomes?\s+dos?\s+arquivos?|formato\s+do\s+arquivo|qual\s+aplicativo\s+abre|considere\s+os\s+arquivos)\b/i;

const IMAGE_CONTEXT_WINDOW = 90;

/** Exportada para o realce (RichTextEditor) usar exatamente a mesma decisão do contador. */
export function isLikelyRealImageReference(text: string, matchIndex: number, matchLength: number): boolean {
  const start = Math.max(0, matchIndex - IMAGE_CONTEXT_WINDOW);
  const end = Math.min(text.length, matchIndex + matchLength + IMAGE_CONTEXT_WINDOW);
  const window = text.slice(start, end);
  if (IMAGE_POSITIVE_CONTEXT_REGEX.test(window)) return true;
  const immediatelyBefore = text.slice(Math.max(0, matchIndex - IMAGE_POSITIVE_PROXIMITY_WINDOW), matchIndex);
  if (IMAGE_POSITIVE_NOUN_PROXIMITY_REGEX.test(immediatelyBefore)) return true;
  if (IMAGE_NEGATIVE_EXTENSION_REGEX.test(window) || IMAGE_NEGATIVE_PHRASE_REGEX.test(window)) return false;
  return true;
}

// IMAGE_FILE_REFERENCE_REGEX é reaproveitada (e duplicada) por vários outros pontos do sistema já
// existentes (ex.: app/lib/utils/image-marker.ts, question-formatting.ts, HtmlWithImageMarkers.tsx) —
// não alterada aqui para não mudar o comportamento desses consumidores não auditados nesta Sprint.
// Só que, por aceitar espaços na "parte do nome", ela é gulosa: em "Observe a imagem figura01.png"
// ela casa a frase inteira; em "imagem1.png ... imagem2.jpg" ela pode até fundir as duas referências
// num único match. Isso nunca importou antes (só a CONTAGEM de ocorrências era usada). Para a
// heurística de contexto e para a ação "Não é uma imagem" — que precisam de um trecho preciso e de
// cada referência isolada para poder rejeitar uma sem afetar as outras — usa-se aqui uma variante
// mais precisa: mesmas extensões, mas sem espaço no nome (cobre os exemplos reais do sistema —
// "logotipo.png", "figura01.png", "gastos_mensais.xlsx" — e nomes com espaço, ex. "captura de
// tela.png", ficam reduzidos ao último token antes da extensão, uma limitação conhecida e aceitável
// frente ao ganho de precisão). Não altera a regex original nem seus outros consumidores.
const IMAGE_FILE_TOKEN_REGEX = /\b[\w-]+\.(?:png|jpe?g|gif|bmp|webp|tiff?|svg)(?:\s*\(\d+\s*[×x]\s*\d+\))?/gi;

export type ImageOccurrence = { start: number; end: number; text: string; rejected: boolean };

function collectRejectedSpans(html: string) {
  const spans: Array<{ start: number; end: number; text: string }> = [];
  for (const match of html.matchAll(IMAGE_REJECTED_SPAN_REGEX)) {
    if (match.index === undefined) continue;
    spans.push({ start: match.index, end: match.index + match[0].length, text: match[1] });
  }
  return spans;
}

/**
 * Lista as referências de arquivo de imagem "candidatas" num campo (estatuto/explicação/comentário/
 * alternativa): já filtra pela heurística contextual (uma referência que a heurística já reconhece
 * com confiança como nome de arquivo citado — ex.: enumeração de arquivos — nem aparece aqui) e marca
 * quais já foram rejeitadas manualmente pelo professor. Usada tanto para contar (isQuestionImagePending)
 * quanto para desenhar a ação "Não é uma imagem" no editor.
 */
export function findCandidateImageOccurrences(html?: string | null): ImageOccurrence[] {
  const text = html || "";
  if (!text) return [];
  const rejectedSpans = collectRejectedSpans(text);
  const occurrences: ImageOccurrence[] = [];
  const consumedSpanStarts = new Set<number>();

  for (const match of text.matchAll(IMAGE_FILE_TOKEN_REGEX)) {
    if (match.index === undefined) continue;
    const containingSpan = rejectedSpans.find((span) => match.index! >= span.start && match.index! < span.end);
    if (containingSpan) {
      if (consumedSpanStarts.has(containingSpan.start)) continue;
      consumedSpanStarts.add(containingSpan.start);
      occurrences.push({ start: containingSpan.start, end: containingSpan.end, text: containingSpan.text, rejected: true });
      continue;
    }
    if (!isLikelyRealImageReference(text, match.index, match[0].length)) continue;
    occurrences.push({ start: match.index, end: match.index + match[0].length, text: match[0], rejected: false });
  }

  return occurrences;
}

/** Alterna a rejeição de UMA ocorrência específica (por posição), sem afetar as demais nem o texto. */
export function toggleImageOccurrenceRejection(html: string, occurrence: ImageOccurrence): string {
  if (occurrence.rejected) {
    const inner = html.slice(occurrence.start, occurrence.end).replace(/^<span[^>]*>/i, "").replace(/<\/span>\s*$/i, "");
    return html.slice(0, occurrence.start) + inner + html.slice(occurrence.end);
  }
  return `${html.slice(0, occurrence.start)}<span data-image-ref="rejected">${html.slice(occurrence.start, occurrence.end)}</span>${html.slice(occurrence.end)}`;
}

type AlternativeLike = {
  text?: string | null;
  image_url?: string | null;
  imageUrl?: string | null;
  statement_image_url?: string | null;
  images?: unknown[] | null;
};

type QuestionLike = {
  statement?: string | null;
  enunciado?: string | null;
  question_text?: string | null;
  text?: string | null;
  explanation_text?: string | null;
  review_comment?: string | null;
  image_url?: string | null;
  imageUrl?: string | null;
  statement_image_url?: string | null;
  images?: unknown[] | null;
  requires_image?: boolean | null;
  has_pending_image?: boolean | null;
  image_pending?: boolean | null;
  question_alternatives?: AlternativeLike[] | null;
  alternatives?: AlternativeLike[] | null;
};

function countMatches(value: string | null | undefined, regex: RegExp): number {
  const text = value || "";
  return Array.from(text.matchAll(regex)).length;
}

function countTextImageMarkers(value?: string | null): number {
  const phraseMarkers = countMatches(value, IMAGE_REQUIRED_PHRASE_REGEX);
  const fileMarkers = findCandidateImageOccurrences(value).filter((occurrence) => !occurrence.rejected).length;
  return phraseMarkers + fileMarkers;
}

function getAlternatives(question: QuestionLike): AlternativeLike[] {
  return question.question_alternatives || question.alternatives || [];
}

function countInsertedImages(question: QuestionLike): number {
  const statementImages = [question.image_url, question.imageUrl, question.statement_image_url]
    .filter((value) => typeof value === "string" && value.trim())
    .length;

  const collectionImages = Array.isArray(question.images) ? question.images.length : 0;

  const alternativeImages = getAlternatives(question).filter((alternative) =>
    Boolean(alternative.image_url && alternative.image_url.trim()),
  ).length;

  return statementImages + collectionImages + alternativeImages;
}

function countRequiredImageMarkers(question: QuestionLike): number {
  const textMarkers =
    countTextImageMarkers(question.statement) +
    countTextImageMarkers(question.enunciado) +
    countTextImageMarkers(question.question_text) +
    countTextImageMarkers(question.text) +
    countTextImageMarkers(question.explanation_text) +
    countTextImageMarkers(question.review_comment) +
    getAlternatives(question).reduce((total, alternative) => total + countTextImageMarkers(alternative.text), 0);

  return textMarkers || (question.requires_image === true ? 1 : 0);
}

export function isQuestionImagePending(question: QuestionLike): boolean {
  if (question.has_pending_image === true || question.image_pending === true) return true;

  const requiredImages = countRequiredImageMarkers(question);
  if (requiredImages <= 0) return false;

  return countInsertedImages(question) < requiredImages;
}

export function questionImagePendingCardClass(question: QuestionLike): string {
  return isQuestionImagePending(question)
    ? "border-blue-300 bg-blue-50 shadow-blue-950/5"
    : "";
}


export function questionImagePendingStatementClass(question: QuestionLike): string {
  return isQuestionImagePending(question)
    ? "border-blue-200 bg-blue-100/70 text-slate-900"
    : "";
}

export function questionImagePendingSoftSurfaceClass(question: QuestionLike): string {
  return isQuestionImagePending(question)
    ? "border-blue-200 bg-blue-100/60"
    : "";
}
