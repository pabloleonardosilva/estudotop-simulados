// Regras de apresentação do relatório final do Raio-X, compartilhadas pela
// Versão Tela (page-client.tsx) e pela Versão PDF (app/lib/pdf/raio-x-report-pdf.ts).
// Funções puras, sem React: as duas versões leem exatamente os mesmos números,
// textos e ordenações. Os helpers foram movidos sem alteração de page-client.tsx.

import { insertListItemBreaks } from "@/app/components/ui/HtmlWithImageMarkers";

// Aparência da Versão Tela (não afeta o PDF). Cookie lido no servidor para renderizar o tema certo já no primeiro HTML.
export type ReportTheme = "dark" | "clean";
export const REPORT_THEME_COOKIE = "estudotop_raio_x_report_theme";

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

// ─── Conteúdo rico das questões (enunciado e alternativas) ───────────────────
// O HTML salvo pelo editor vira linhas de trechos (texto com negrito/itálico/sublinhado e
// imagens embutidas), na ordem original. Tela e PDF renderizam essa estrutura com
// componentes próprios: nenhum HTML do banco é injetado. Tokenizador tolerante a HTML
// malformado; conteúdo de script/style/iframe etc. é descartado, atributos são ignorados
// (exceto src/width/height de imagem) e só imagens PNG/JPEG embutidas (data URI) passam.

export type RichRun =
  | { kind: "text"; text: string; bold?: boolean; italic?: boolean; underline?: boolean }
  | { kind: "image"; src: string; width: number; height: number }
  | { kind: "unsupported-image" };

export type RichLine = { runs: RichRun[]; marker?: string; indent?: number };

export const UNSUPPORTED_IMAGE_TEXT = "[Imagem não exibida: formato não suportado no relatório]";

const SKIP_CONTENT_TAGS = new Set(["script", "style", "iframe", "object", "embed", "noscript", "template", "svg", "math", "textarea", "select", "head", "title", "video", "audio", "canvas", "frameset", "frame", "applet"]);
const BLOCK_TAGS = new Set(["p", "div", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "table", "thead", "tbody", "tfoot", "blockquote", "section", "article", "header", "footer", "pre", "hr", "dl", "dt", "dd", "figure", "figcaption", "caption"]);
const BOLD_TAGS = new Set(["b", "strong"]);
const ITALIC_TAGS = new Set(["i", "em"]);

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  agrave: "à", Agrave: "À", acirc: "â", ecirc: "ê", ocirc: "ô", Acirc: "Â", Ecirc: "Ê", Ocirc: "Ô",
  atilde: "ã", otilde: "õ", Atilde: "Ã", Otilde: "Õ", ccedil: "ç", Ccedil: "Ç", uuml: "ü", Uuml: "Ü",
  ordm: "º", ordf: "ª", deg: "°", ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»",
  ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", bull: "•", middot: "·", times: "×", divide: "÷",
  ge: "≥", le: "≤", ne: "≠", rarr: "→", larr: "←", copy: "©", reg: "®", trade: "™", sup2: "²", sup3: "³", frac12: "½", euro: "€",
};

function decodeEntities(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

function parseAttributes(source: string) {
  const attrs: Record<string, string> = {};
  let i = 0;
  while (i < source.length) {
    while (i < source.length && /[\s/]/.test(source[i])) i++;
    const nameStart = i;
    while (i < source.length && !/[\s=/>]/.test(source[i])) i++;
    const name = source.slice(nameStart, i).toLowerCase();
    if (!name) { i++; continue; }
    while (i < source.length && /\s/.test(source[i])) i++;
    let value = "";
    if (source[i] === "=") {
      i++;
      while (i < source.length && /\s/.test(source[i])) i++;
      const quote = source[i];
      if (quote === '"' || quote === "'") {
        const end = source.indexOf(quote, i + 1);
        value = source.slice(i + 1, end < 0 ? source.length : end);
        i = end < 0 ? source.length : end + 1;
      } else {
        const valueStart = i;
        while (i < source.length && !/\s/.test(source[i])) i++;
        value = source.slice(valueStart, i);
      }
    }
    if (!(name in attrs)) attrs[name] = decodeEntities(value);
  }
  return attrs;
}

function decodeBase64Prefix(base64: string, maxBytes: number) {
  const chars = base64.slice(0, Math.ceil(maxBytes / 3) * 4);
  const binary = atob(chars.slice(0, chars.length - (chars.length % 4)));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Dimensões naturais lidas do próprio arquivo (cabeçalho PNG / marcador SOF do JPEG).
// Também confirma que o conteúdo é do formato declarado: o React PDF falha com imagem inválida.
function embeddedImageSize(format: "png" | "jpeg", base64: string) {
  try {
    if (format === "png") {
      const b = decodeBase64Prefix(base64, 24);
      const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
      if (b.length < 24 || signature.some((byte, i) => b[i] !== byte)) return null;
      const width = ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0;
      const height = ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0;
      return width > 0 && height > 0 ? { width, height } : null;
    }
    const b = decodeBase64Prefix(base64, 262144);
    if (b[0] !== 0xff || b[1] !== 0xd8) return null;
    let o = 2;
    while (o + 9 < b.length) {
      if (b[o] !== 0xff) return null;
      const marker = b[o + 1];
      if (marker === 0xff) { o++; continue; }
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const height = (b[o + 5] << 8) | b[o + 6];
        const width = (b[o + 7] << 8) | b[o + 8];
        return width > 0 && height > 0 ? { width, height } : null;
      }
      o += 2 + ((b[o + 2] << 8) | b[o + 3]);
    }
    return null;
  } catch {
    return null;
  }
}

function cssPixels(style: string | undefined, property: "width" | "height") {
  const match = style?.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([\\d.]+)px`, "i"));
  return match ? Number(match[1]) : NaN;
}

function imageRun(attrs: Record<string, string>): RichRun {
  const src = String(attrs.src || "").replace(/\s+/g, "");
  const match = src.match(/^data:image\/(png|jpe?g);base64,([a-z0-9+/]+={0,2})$/i);
  if (!match) return { kind: "unsupported-image" };
  const natural = embeddedImageSize(match[1].toLowerCase() === "png" ? "png" : "jpeg", match[2]);
  if (!natural) return { kind: "unsupported-image" };
  const declaredW = Number(attrs.width) || cssPixels(attrs.style, "width");
  const declaredH = Number(attrs.height) || cssPixels(attrs.style, "height");
  const width = declaredW > 0 ? declaredW : declaredH > 0 ? (declaredH * natural.width) / natural.height : natural.width;
  const height = declaredH > 0 ? declaredH : (width * natural.height) / natural.width;
  return { kind: "image", src, width: Math.round(width), height: Math.round(height) };
}

export function parseRichContent(value?: string | null, fallback = ""): RichLine[] {
  // Mesma preparação da Revisão (HtmlWithImageMarkers): em texto sem tags de bloco, "\n" e
  // itens "I –" / "1." viram quebras de linha.
  const html = insertListItemBreaks(String(value ?? ""));
  const lines: RichLine[] = [];
  let line: RichLine = { runs: [] };
  let bold = 0;
  let italic = 0;
  let underline = 0;
  const lists: Array<{ ordered: boolean; count: number }> = [];

  const isEmpty = (l: RichLine) => !l.runs.length && !l.marker;
  const breakLine = () => { lines.push(line); line = { runs: [] }; };
  const blockBoundary = () => { if (!isEmpty(line)) breakLine(); };
  const pushText = (raw: string) => {
    let text = raw.replace(/[ \t\n\r\f]+/g, " ");
    const last = line.runs[line.runs.length - 1];
    if (!last || (last.kind === "text" && last.text.endsWith(" "))) text = text.replace(/^ /, "");
    text = decodeEntities(text);
    if (!text) return;
    const style = { bold: bold > 0, italic: italic > 0, underline: underline > 0 };
    if (last?.kind === "text" && Boolean(last.bold) === style.bold && Boolean(last.italic) === style.italic && Boolean(last.underline) === style.underline) {
      last.text += text;
      return;
    }
    line.runs.push({ kind: "text", text, ...(style.bold ? { bold: true } : {}), ...(style.italic ? { italic: true } : {}), ...(style.underline ? { underline: true } : {}) });
  };

  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) { pushText(html.slice(i)); break; }
    if (lt > i) pushText(html.slice(i, lt));
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    const tagMatch = /^<(\/?)([a-z][a-z0-9-]*)/i.exec(html.slice(lt, lt + 40));
    if (!tagMatch) {
      if (html[lt + 1] === "!" || html[lt + 1] === "?") {
        const end = html.indexOf(">", lt);
        i = end < 0 ? html.length : end + 1;
      } else {
        pushText("<");
        i = lt + 1;
      }
      continue;
    }
    // Fim da tag respeitando atributos entre aspas.
    let j = lt + tagMatch[0].length;
    let quote = "";
    while (j < html.length && (quote || html[j] !== ">")) {
      if (quote) { if (html[j] === quote) quote = ""; } else if (html[j] === '"' || html[j] === "'") quote = html[j];
      j++;
    }
    if (j >= html.length) { pushText(html.slice(lt)); break; }
    const closing = tagMatch[1] === "/";
    const name = tagMatch[2].toLowerCase();
    i = j + 1;

    if (!closing && SKIP_CONTENT_TAGS.has(name)) {
      const end = html.toLowerCase().indexOf(`</${name}`, i);
      if (end < 0) { i = html.length; continue; }
      const close = html.indexOf(">", end);
      i = close < 0 ? html.length : close + 1;
      continue;
    }
    if (name === "br") { breakLine(); continue; }
    if (name === "img") {
      if (!closing) line.runs.push(imageRun(parseAttributes(html.slice(lt + tagMatch[0].length, j))));
      continue;
    }
    const delta = closing ? -1 : 1;
    if (BOLD_TAGS.has(name)) { bold = Math.max(0, bold + delta); continue; }
    if (ITALIC_TAGS.has(name)) { italic = Math.max(0, italic + delta); continue; }
    if (name === "u") { underline = Math.max(0, underline + delta); continue; }
    if (name === "ul" || name === "ol") {
      blockBoundary();
      if (closing) lists.pop();
      else lists.push({ ordered: name === "ol", count: 0 });
      continue;
    }
    if (name === "li") {
      blockBoundary();
      if (!closing) {
        const list = lists[lists.length - 1];
        if (list) list.count++;
        line.marker = list?.ordered ? `${list.count}.` : "•";
        if (lists.length > 1) line.indent = lists.length - 1;
      }
      continue;
    }
    if ((name === "td" || name === "th") && !closing) {
      if (line.runs.length) pushText(" | ");
      continue;
    }
    if (BLOCK_TAGS.has(name)) blockBoundary();
  }
  if (!isEmpty(line)) lines.push(line);

  for (const l of lines) {
    const last = l.runs[l.runs.length - 1];
    if (last?.kind === "text") {
      last.text = last.text.replace(/ +$/, "");
      if (!last.text) l.runs.pop();
    }
  }
  while (lines.length && isEmpty(lines[0])) lines.shift();
  while (lines.length && isEmpty(lines[lines.length - 1])) lines.pop();
  if (!lines.length && fallback) return [{ runs: [{ kind: "text", text: fallback }] }];
  return lines;
}

export function richLineText(line: RichLine) {
  return line.runs.map((run) => (run.kind === "text" ? run.text : run.kind === "unsupported-image" ? UNSUPPORTED_IMAGE_TEXT : "")).join("");
}

// Texto puro da estrutura (uma linha por quebra), para estimativas e verificações.
export function richContentText(lines: RichLine[]) {
  return lines.map((line) => `${line.marker ? `${line.marker} ` : ""}${richLineText(line)}`).join("\n");
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
