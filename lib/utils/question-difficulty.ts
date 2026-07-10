import { richTextToPlainText } from "./rich-text";

type AlternativeInput = { text?: string | null };

type QuestionInput = {
  statement: string;
  alternatives?: AlternativeInput[];
  question_type?: string | null;
};

type ReferenceQuestion = QuestionInput & { difficulty_level: number };

// Words that indicate higher cognitive demand or negation-based logic
const NEGATION_WORDS = [
  "exceto", "salvo", "somente", "apenas", "incorreto", "incorreta",
  "errado", "falso", "nao", "jamais", "nunca",
];

// Conditional/complex conjunction patterns
const COMPLEX_CONJUNCTIONS = [
  "desde que", "caso contrario", "uma vez que", "tendo em vista",
  "nao obstante", "contanto que", "ressalvado", "senao",
];

// High-order cognitive verbs (Bloom's taxonomy levels 4-6)
const HIGH_COGNITIVE_VERBS = [
  "analise", "avalie", "critique", "justifique", "elabore",
  "sintetize", "proponha", "discuta", "compare", "explique",
  "demonstre", "desenvolva", "construa",
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFeatures(q: QuestionInput): number[] {
  const plain = normalize(richTextToPlainText(q.statement || ""));
  const words = plain.split(" ").filter(Boolean);

  // f0: statement length, normalized to [0,1] at 150 words
  const f0 = Math.min(words.length / 150, 1);

  // f1: negation / exclusion words presence
  const f1 = Math.min(
    NEGATION_WORDS.filter((w) => plain.includes(w)).length / 4,
    1,
  );

  // f2: complex conditional conjunctions
  const f2 = Math.min(
    COMPLEX_CONJUNCTIONS.filter((w) => plain.includes(w)).length / 2,
    1,
  );

  // f3: high-order cognitive verbs (0 or 1)
  const f3 = HIGH_COGNITIVE_VERBS.some((w) => plain.includes(w)) ? 1 : 0;

  // f4: average alternative length (normalized at 30 words)
  const alts = q.alternatives || [];
  const totalAltWords = alts.reduce((sum, alt) => {
    return (
      sum +
      normalize(richTextToPlainText(alt.text || ""))
        .split(" ")
        .filter(Boolean).length
    );
  }, 0);
  const avgAltLen = alts.length ? totalAltWords / alts.length : 0;
  const f4 = Math.min(avgAltLen / 30, 1);

  // f5: numbers / percentages / formulas (signals quantitative complexity)
  const f5 = /\d{2,}|%|r\$/.test(plain) ? 1 : 0;

  // f6: legal / normative references (art., lei, §, inciso, paragrafo)
  const f6 =
    /\bart\b|\blei\b|paragrafo|inciso/.test(plain) ? 0.5 : 0;

  return [f0, f1, f2, f3, f4, f5, f6];
}

function euclidean(a: number[], b: number[]): number {
  return Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));
}

function heuristicDifficulty(features: number[]): number {
  const score = features.reduce((s, v) => s + v, 0);
  if (score >= 3.8) return 5;
  if (score >= 2.6) return 4;
  if (score >= 1.6) return 3;
  if (score >= 0.7) return 2;
  return 1;
}

/**
 * Predicts difficulty (1–5) for a question.
 *
 * When referenceQuestions is provided and has ≥10 entries, uses k-nearest
 * neighbour (k=7, weighted by inverse distance) over the reference set.
 * Otherwise falls back to a pure feature heuristic.
 *
 * Inputs: statement (HTML or plain), optional alternatives, optional question_type.
 * Outputs: integer 1–5.
 */
export function predictDifficulty(
  question: QuestionInput,
  referenceQuestions?: ReferenceQuestion[],
): number {
  const features = extractFeatures(question);

  if (referenceQuestions && referenceQuestions.length >= 10) {
    const neighbors = referenceQuestions
      .filter((r) => r.difficulty_level >= 1 && r.difficulty_level <= 5)
      .map((r) => ({
        d: r.difficulty_level,
        dist: euclidean(features, extractFeatures(r)),
      }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 7);

    let wSum = 0;
    let wTotal = 0;
    for (const n of neighbors) {
      const w = 1 / (n.dist + 0.1);
      wSum += n.d * w;
      wTotal += w;
    }
    return Math.round(Math.max(1, Math.min(5, wSum / wTotal)));
  }

  return heuristicDifficulty(features);
}
