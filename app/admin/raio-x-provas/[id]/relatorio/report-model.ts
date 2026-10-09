// Regras de apresentação do relatório final do Raio-X, compartilhadas pela
// Versão Tela (page-client.tsx) e pela Versão PDF (app/lib/pdf/raio-x-report-pdf.ts).
// Funções puras, sem React: as duas versões leem exatamente os mesmos números,
// textos e ordenações. Os helpers foram movidos sem alteração de page-client.tsx.

export const COLORS = ["#f97316", "#38bdf8", "#8b5cf6", "#22c55e", "#f59e0b", "#ec4899", "#14b8a6", "#ef4444"];

export const PARECER_FALLBACK = "Para esse perfil de prova, o aluno deve estudar com equilíbrio, reforçar os assuntos de maior dificuldade e treinar questões objetivas com regularidade.";

export type ModuleSummary = {
  module: string;
  question_count: number;
  percentage?: number;
  average_difficulty?: number | null;
  knowledge_points?: string[];
  tags?: string[];
  question_numbers?: string[];
};

export type ReportQuestion = {
  id: string;
  original_number?: string | null;
  statement?: string | null;
  alternatives?: Array<{ label?: string; text?: string; is_correct?: boolean }> | null;
  answer_key?: string | null;
  is_annulled?: boolean | null;
  module_name?: string | null;
  subject_name?: string | null;
  subtopic_name?: string | null;
  difficulty_level?: number | null;
  knowledge_points?: string[] | null;
  tags?: string[] | null;
  has_image?: boolean | null;
  charging_profile?: string | null;
  explanation_text?: string | null;
  teacher_opinion?: string | null;
};

export type ReportAlternative = NonNullable<ReportQuestion["alternatives"]>[number];

export type ReportProps = {
  // Contrato herdado de RelatorioClient: linha de exam_analyses como vem do Supabase.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analysis: any;
  effectiveModules?: ModuleSummary[];
  totalQuestions?: number;
  withImage?: number;
  avgDiff?: number;
  questions?: ReportQuestion[];
};

export function cleanText(value?: string | null) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanBlockText(value?: string | null) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function clampText(value: string, max = 220) {
  const clean = cleanText(value);
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).trim()}...`;
}

export function difficultyLabel(value?: number | null) {
  const n = Number(value || 0);
  if (!n) return "Não informada";
  if (n < 2.5) return "Moderada";
  if (n < 3.6) return "Moderada";
  return "Difícil";
}

export function difficultyTone(value?: number | null) {
  const n = Number(value || 0);
  if (!n) return "#94a3b8";
  if (n < 2.5) return "#38bdf8";
  if (n < 3.6) return "#22c55e";
  return "#fb923c";
}

export function safeFileName(value: string) {
  return (value || "RaioX")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9\-_]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

export function unique(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = cleanText(raw || "");
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

export function getQuestionTags(question: ReportQuestion) {
  return unique([
    question.subject_name,
    question.module_name,
    question.subtopic_name,
    ...(question.tags || []),
    ...(question.knowledge_points || []),
  ]);
}

export function moduleTags(module: ModuleSummary, questions: ReportQuestion[]) {
  const moduleKey = cleanText(module.module).toLowerCase();
  const related = questions.filter((q) => {
    const names = [q.subject_name, q.module_name].map((v) => cleanText(v).toLowerCase());
    return names.includes(moduleKey);
  });
  return unique([
    module.module,
    ...(module.tags || []),
    ...(module.knowledge_points || []),
    ...related.flatMap((q) => getQuestionTags(q)),
  ]).filter((tag) => tag.toLowerCase() !== moduleKey);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parecerText(value: string | null | undefined, analysis: any, fallback: string) {
  const raw = cleanBlockText(value || analysis.final_summary_text || analysis.teacher_notes || analysis.summary_text || fallback);
  if (!raw) return fallback;
  return raw;
}

export function paragraphList(value: string) {
  const source = cleanBlockText(value);
  const paragraphs = source
    .split(/\n\s*\n+/)
    .map((p) => cleanText(p))
    .filter(Boolean);
  return paragraphs.length ? paragraphs : [cleanText(value)];
}

export function computeDominance(modules: ModuleSummary[], total: number) {
  const sorted = [...modules].sort((a, b) => Number(b.question_count || 0) - Number(a.question_count || 0));
  const topCount = Number(sorted[0]?.question_count || 0);
  const tied = sorted.filter((m) => Number(m.question_count || 0) === topCount && topCount > 0);
  const pct = total > 0 && topCount > 0 ? Math.round((topCount / total) * 100) : 0;
  const hasDominant = tied.length === 1 && topCount > Number(sorted[1]?.question_count || 0);
  return { sorted, topCount, tied, pct, hasDominant };
}

// Indicadores derivados do relatório (antes calculados inline em RelatorioClient).
export function buildReportSummary({ analysis, effectiveModules = [], totalQuestions, avgDiff, questions = [] }: ReportProps) {
  const modules = [...effectiveModules].sort((a, b) => Number(b.question_count || 0) - Number(a.question_count || 0));
  const total = Number(totalQuestions ?? analysis.dashboard?.total_it_questions ?? modules.reduce((s, m) => s + Number(m.question_count || 0), 0));
  const annulledCount = questions.filter((q) => q.is_annulled).length;
  const averageDifficulty = Number(avgDiff ?? analysis.dashboard?.average_difficulty ?? 0);
  const dominance = computeDominance(modules, total);
  const generatedAt = analysis.updated_at ? new Date(analysis.updated_at).toLocaleDateString("pt-BR") : new Date().toLocaleDateString("pt-BR");

  const distributionLabel = dominance.hasDominant ? "Concentrada" : "Equilibrada";
  const distributionText = dominance.hasDominant
    ? `Maior peso em ${dominance.tied[0]?.module || "um assunto"}`
    : `${dominance.tied.length || modules.length} assuntos com peso semelhante`;
  const quickRead = dominance.hasDominant
    ? `A prova concentrou ${dominance.pct}% da cobrança em ${dominance.tied[0]?.module}. Os demais assuntos tiveram participação menor no recorte de Informática.`
    : `A prova apresentou distribuição equilibrada: ${dominance.tied.length || modules.length} assuntos ficaram com o mesmo peso quantitativo, representando ${dominance.pct || 0}% da cobrança cada. Portanto, não houve predominância estatística isolada.`;
  const allTags = unique([
    ...modules.flatMap((m) => [...(m.tags || []), ...(m.knowledge_points || [])]),
    ...questions.flatMap((q) => getQuestionTags(q)),
  ]);

  return { modules, total, annulledCount, averageDifficulty, dominance, generatedAt, distributionLabel, distributionText, quickRead, allTags };
}

export function profileIndicators(moduleCount: number, averageDifficulty: number) {
  return {
    diversityLabel: moduleCount >= 5 ? "Alta" : moduleCount >= 3 ? "Média" : "Baixa",
    demandLabel: averageDifficulty >= 3.8 ? "Elevado" : averageDifficulty >= 2.4 ? "Intermediário" : "Básico",
    demandText: averageDifficulty >= 3.8 ? "Exige domínio técnico mais firme" : averageDifficulty >= 2.4 ? "Exige atenção aos fundamentos" : "Cobrança de base conceitual",
  };
}

export function modulePercent(mod: ModuleSummary, total: number) {
  return total > 0 ? Math.round((Number(mod.question_count || 0) / total) * 100) : Number(mod.percentage || 0);
}

export function moduleRelatedNumbers(mod: ModuleSummary, questions: ReportQuestion[]) {
  return unique([...(mod.question_numbers || []), ...questions.filter((q) => cleanText(q.subject_name || q.module_name).toLowerCase() === cleanText(mod.module).toLowerCase()).map((q, i) => q.original_number || String(i + 1))]);
}

export function questionDisplayNumber(q: ReportQuestion, index: number) {
  return q.original_number || String(index + 1);
}

export function questionCorrectLabel(q: ReportQuestion) {
  return q.is_annulled ? "Anulada" : q.answer_key || q.alternatives?.find((a) => a.is_correct)?.label || "—";
}

export function alternativeLabel(alt: ReportAlternative, altIndex: number) {
  return alt.label || String.fromCharCode(65 + altIndex);
}

export function isAlternativeCorrect(q: ReportQuestion, alt: ReportAlternative, label: string) {
  return Boolean(!q.is_annulled && (alt.is_correct || label === q.answer_key));
}
