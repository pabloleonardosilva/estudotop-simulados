const ENTITY_MAP: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

export function richTextToPlainText(value?: string | null) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6])>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (entity, code: string) => {
      const key = code.toLowerCase();

      if (key.startsWith("#x")) {
        const parsed = Number.parseInt(key.slice(2), 16);
        return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : entity;
      }

      if (key.startsWith("#")) {
        const parsed = Number.parseInt(key.slice(1), 10);
        return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : entity;
      }

      return ENTITY_MAP[key] ?? entity;
    })
    .replace(/\s+/g, " ")
    .trim();
}

export function hasMeaningfulRichText(value?: string | null, minLength = 1) {
  return richTextToPlainText(value).length >= minLength;
}
