export function normalizeEvaluatedTopics(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of raw) {
    const value = String(item ?? "").trim().replace(/\s+/g, " ");
    if (!value) continue;

    const clipped = value.slice(0, 80);
    const key = clipped.toLocaleLowerCase("pt-BR");
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(clipped);
  }

  return result;
}
