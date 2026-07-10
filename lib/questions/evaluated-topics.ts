export const EVALUATED_TOPICS_REQUIRED_MESSAGE = "Informe pelo menos um tópico avaliado pela questão.";
export const EVALUATED_TOPICS_PUBLISH_MESSAGE = "A questão não pode ser publicada sem tópicos avaliados.";
export const EVALUATED_TOPICS_SIMULADO_MESSAGE = "Esta questão ainda não possui tópicos avaliados. Informe os tópicos antes de adicioná-la ao simulado.";

export function normalizeEvaluatedTopics(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of raw) {
    const value = normalizeTopicName(String(item ?? ""));
    if (!value) continue;

    const clipped = value.slice(0, 80);
    const key = normalizeTopicComparableName(clipped);

    if (seen.has(key)) continue;

    seen.add(key);
    result.push(clipped);
  }

  return result;
}

export function hasEvaluatedTopics(input: unknown): boolean {
  return normalizeEvaluatedTopics(input).length > 0;
}
import { normalizeTopicComparableName, normalizeTopicName } from "@/lib/utils/text";
