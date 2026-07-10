import OpenAI from "openai";
import { richTextToPlainText } from "./rich-text";
import { predictDifficulty } from "./question-difficulty";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type QuestionInput = {
  statement: string;
  alternatives?: { label?: string | null; text?: string | null; order_number?: number | null }[];
  question_type?: string | null;
};

const SYSTEM_PROMPT = `Você é especialista em concursos públicos brasileiros. Classifique a dificuldade da questão de 1 a 5:
1 - Muito fácil: conhecimento direto, factual
2 - Fácil: raciocínio simples, conhecimento básico
3 - Média: análise moderada ou conhecimento específico
4 - Difícil: raciocínio complexo, múltiplos conceitos
5 - Muito difícil: nível especialista, distinções sutis

Responda APENAS com um número inteiro de 1 a 5. Nenhum texto adicional.`;

function buildQuestionText(q: QuestionInput): string {
  const stmt = richTextToPlainText(q.statement);
  const alts = (q.alternatives || [])
    .sort((a, b) => (a.order_number || 0) - (b.order_number || 0))
    .map((a) => `${a.label || "?"}) ${richTextToPlainText(a.text)}`)
    .join("\n");
  return alts ? `${stmt}\n\n${alts}` : stmt;
}

export async function predictDifficultyAI(question: QuestionInput): Promise<number> {
  const plainText = richTextToPlainText(question.statement || "").trim();
  const wordCount = plainText.split(/\s+/).filter(Boolean).length;

  // Use local heuristic when there's enough text to extract features reliably
  if (wordCount >= 20) {
    return predictDifficulty(question);
  }

  // Short statements have little signal for the heuristic — use AI
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      max_tokens: 5,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildQuestionText(question) },
      ],
    });

    const raw = response.choices[0].message.content?.trim() || "";
    const level = parseInt(raw, 10);
    if (level >= 1 && level <= 5) return level;
  } catch {
    // fall through to heuristic
  }

  return predictDifficulty(question);
}

export async function predictDifficultyAIBatch(
  questions: QuestionInput[],
): Promise<number[]> {
  if (questions.length === 0) return [];

  try {
    const questionsText = questions
      .map((q, i) => `[${i + 1}]\n${buildQuestionText(q)}`)
      .join("\n\n---\n\n");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: `${SYSTEM_PROMPT}\n\nPara múltiplas questões, responda APENAS com um array JSON de inteiros, um por questão, na mesma ordem. Exemplo: [2,4,3,1,5]`,
        },
        { role: "user", content: questionsText },
      ],
    });

    const raw = response.choices[0].message.content?.trim() || "";
    const match = raw.match(/\[[\d,\s]+\]/);
    if (match) {
      const levels = JSON.parse(match[0]) as number[];
      if (levels.length === questions.length) {
        return levels.map((d) => Math.max(1, Math.min(5, Math.round(d))));
      }
    }
  } catch {
    // fall through to per-question heuristic
  }

  return questions.map((q) => predictDifficulty(q));
}
