export const IMAGE_REQUIRED_PHRASE_REGEX =
  /imagem\s+associada\s+para\s+resolu[cç][aã]o\s+da\s+quest[aã]o/gi;

export const IMAGE_FILE_REFERENCE_REGEX =
  /\b[\w][\w\s.-]*\.(png|jpe?g|gif|bmp|webp|tiff?|svg)(?:\s*\(\d+\s*[×x]\s*\d+\))?/gi;

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
  return (
    countMatches(value, IMAGE_REQUIRED_PHRASE_REGEX) +
    countMatches(value, IMAGE_FILE_REFERENCE_REGEX)
  );
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
