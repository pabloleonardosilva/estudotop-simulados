export function normalizeForSimilarity(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function questionFingerprint(value: string) {
  return normalizeForSimilarity(value).slice(0, 240);
}

export function similarityScore(a: string, b: string) {
  const left = normalizeForSimilarity(a);
  const right = normalizeForSimilarity(b);

  if (!left || !right) return 0;
  if (left === right) return 1;

  const leftWords = new Set(left.split(" ").filter(Boolean));
  const rightWords = new Set(right.split(" ").filter(Boolean));

  const intersection = [...leftWords].filter((word) => rightWords.has(word)).length;
  const union = new Set([...leftWords, ...rightWords]).size;

  return union === 0 ? 0 : intersection / union;
}
