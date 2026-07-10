/* eslint-disable @typescript-eslint/no-explicit-any */

type AdminPdfAlternative = {
  label: string;
  text: string;
  isCorrect?: boolean;
};

type AdminPdfQuestion = {
  orderNumber: number;
  code?: string | null;
  statement?: string | null;
  subject?: string | null;
  board?: string | null;
  year?: number | string | null;
  difficulty?: number | string | null;
  alternatives?: AdminPdfAlternative[];
};

type AdminPdfMeta = {
  title: string;
  status?: string | null;
  timeLimitMinutes?: number | null;
  maxAttempts?: number | null;
  scoringModel?: string | null;
  questionCount?: number | null;
  owlHelpEnabled?: boolean;
  owlHelpLimit?: number | null;
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 46;

const CP1252_SPECIAL: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

function stripHtml(value?: string | null) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeText(value?: string | null) {
  return String(value || "")
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u2028\u2029]/g, "\n");
}

function fmtStatus(status?: string | null) {
  if (status === "published") return "Publicado";
  if (status === "archived") return "Arquivado";
  return "Rascunho";
}

function cp1252Byte(char: string) {
  const code = char.codePointAt(0) || 32;
  if (code === 0x0a || code === 0x0d || code === 0x09) return 0x20;
  if (code >= 0x20 && code <= 0x7e) return code;
  if (code >= 0xa0 && code <= 0xff) return code;
  if (CP1252_SPECIAL[code] !== undefined) return CP1252_SPECIAL[code];

  const fallback = char.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const fallbackCode = fallback.codePointAt(0) || 0x3f;
  if (fallbackCode >= 0x20 && fallbackCode <= 0x7e) return fallbackCode;
  return 0x3f;
}

function pdfString(value: string) {
  const bytes = Array.from(sanitizeText(value), cp1252Byte);
  let out = "(";
  for (const byte of bytes) {
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) out += `\\${String.fromCharCode(byte)}`;
    else if (byte < 0x20 || byte > 0x7e) out += `\\${byte.toString(8).padStart(3, "0")}`;
    else out += String.fromCharCode(byte);
  }
  out += ")";
  return out;
}

function asciiBytes(value: string) {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) bytes[i] = value.charCodeAt(i) & 0xff;
  return bytes;
}

function wrapText(text: string, maxChars: number) {
  const output: string[] = [];
  const paragraphs = stripHtml(text).split(/\n+/);
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > maxChars && line) {
        output.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) output.push(line);
    if (paragraphs.length > 1) output.push("");
  }
  while (output[output.length - 1] === "") output.pop();
  return output;
}

type Page = { ops: string[]; y: number };

class PdfBuilder {
  pages: Page[] = [];
  current: Page;

  constructor() {
    this.current = this.newPage();
  }

  newPage() {
    const page = { ops: [], y: PAGE_H - MARGIN };
    this.pages.push(page);
    return page;
  }

  ensure(height: number) {
    if (this.current.y - height < MARGIN) this.current = this.newPage();
  }

  color(hex: string) {
    const clean = hex.replace("#", "");
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
  }

  text(value: string, x: number, y: number, size = 10, color = "#0F172A", bold = false) {
    const drawText = (dx = 0) => {
      this.current.ops.push("BT");
      this.current.ops.push(`${this.color(color)} rg`);
      this.current.ops.push(`/F1 ${size} Tf`);
      this.current.ops.push(`${(x + dx).toFixed(2)} ${y.toFixed(2)} Td`);
      this.current.ops.push(`${pdfString(value)} Tj`);
      this.current.ops.push("ET");
    };

    drawText();
    if (bold) drawText(0.24);
  }

  rect(x: number, y: number, w: number, h: number, fill = "#FFFFFF", stroke?: string) {
    this.current.ops.push("q");
    this.current.ops.push(`${this.color(fill)} rg`);
    if (stroke) this.current.ops.push(`${this.color(stroke)} RG`);
    this.current.ops.push(`${x} ${y} ${w} ${h} re ${stroke ? "B" : "f"}`);
    this.current.ops.push("Q");
  }

  line(x1: number, y1: number, x2: number, y2: number, color = "#E5E7EB", width = 0.7) {
    this.current.ops.push("q");
    this.current.ops.push(`${this.color(color)} RG`);
    this.current.ops.push(`${width} w`);
    this.current.ops.push(`${x1} ${y1} m ${x2} ${y2} l S`);
    this.current.ops.push("Q");
  }

  multiline(value: string, x: number, width: number, size = 9.5, color = "#334155", bold = false, leading = 13) {
    const maxChars = Math.max(28, Math.floor(width / (size * 0.52)));
    const lines = wrapText(value, maxChars);
    lines.forEach((line) => {
      this.ensure(leading + 4);
      this.text(line, x, this.current.y, size, color, bold);
      this.current.y -= leading;
    });
  }

  metricCard(x: number, y: number, w: number, h: number, label: string, value: string) {
    this.rect(x, y, w, h, "#F8FAFC", "#E2E8F0");
    this.text(label, x + 10, y + h - 19, 7, "#F97316", true);
    this.text(value, x + 10, y + 17, 12, "#0F172A", true);
  }

  build() {
    const objects: string[] = [];
    const add = (body: string) => {
      objects.push(body);
      return objects.length;
    };

    const font1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const pageIds: number[] = [];

    for (const page of this.pages) {
      const stream = page.ops.join("\n");
      const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      const pageId = add(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${font1} 0 R >> >> /Contents ${contentId} 0 R >>`);
      pageIds.push(pageId);
    }

    const pagesId = add(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
    for (const id of pageIds) objects[id - 1] = objects[id - 1].replace("/Parent 0 0 R", `/Parent ${pagesId} 0 R`);
    const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

    let pdf = "%PDF-1.4\n%PDF-SAFE-ASCII\n";
    const offsets: number[] = [];
    objects.forEach((body, idx) => {
      offsets.push(pdf.length);
      pdf += `${idx + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.forEach((offset) => {
      pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
    });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return asciiBytes(pdf);
  }
}

export function downloadSimuladoAdminPdf({ meta, questions }: { meta: AdminPdfMeta; questions: AdminPdfQuestion[] }) {
  const pdf = new PdfBuilder();

  pdf.rect(0, PAGE_H - 112, PAGE_W, 112, "#0B1020");
  pdf.text("ESTUDOTOP SIMULADOS", MARGIN, PAGE_H - 42, 8, "#FDBA74", true);
  pdf.text("Caderno administrativo do simulado", MARGIN, PAGE_H - 70, 22, "#FFFFFF", true);
  pdf.text(meta.title || "Simulado", MARGIN, PAGE_H - 94, 10, "#CBD5E1");

  pdf.current.y = PAGE_H - 148;
  const gap = 10;
  const w = (PAGE_W - MARGIN * 2 - gap * 3) / 4;
  pdf.metricCard(MARGIN, pdf.current.y - 64, w, 58, "STATUS", fmtStatus(meta.status));
  pdf.metricCard(MARGIN + (w + gap), pdf.current.y - 64, w, 58, "QUESTÕES", String(meta.questionCount ?? questions.length));
  pdf.metricCard(MARGIN + (w + gap) * 2, pdf.current.y - 64, w, 58, "TEMPO", meta.timeLimitMinutes ? `${meta.timeLimitMinutes} min` : "Sem limite");
  pdf.metricCard(MARGIN + (w + gap) * 3, pdf.current.y - 64, w, 58, "TENTATIVAS", meta.maxAttempts ? String(meta.maxAttempts) : "Ilimitado");
  pdf.current.y -= 96;

  pdf.text("Configurações", MARGIN, pdf.current.y, 15, "#0F172A", true);
  pdf.current.y -= 18;
  pdf.multiline(`Pontuação: ${meta.scoringModel || "Não informado"}. Ajuda da Coruja: ${meta.owlHelpEnabled ? `${meta.owlHelpLimit || 1} uso(s)` : "desabilitada"}.`, MARGIN, PAGE_W - MARGIN * 2, 10, "#334155");
  pdf.current.y -= 12;
  pdf.line(MARGIN, pdf.current.y, PAGE_W - MARGIN, pdf.current.y, "#E2E8F0");
  pdf.current.y -= 24;

  if (!questions.length) {
    pdf.multiline("Nenhuma questão vinculada ao simulado.", MARGIN, PAGE_W - MARGIN * 2, 11, "#334155");
  }

  questions.forEach((question) => {
    pdf.ensure(120);
    pdf.text(`Questão ${question.orderNumber}${question.code ? ` · ${question.code}` : ""}`, MARGIN, pdf.current.y, 13, "#0F172A", true);
    pdf.text(question.subject || "Sem assunto", PAGE_W - MARGIN - 150, pdf.current.y, 9, "#64748B");
    pdf.current.y -= 16;
    const metadata = [question.board, question.year ? `Ano ${question.year}` : null, question.difficulty ? `Dificuldade ${question.difficulty}` : null].filter(Boolean).join(" · ");
    if (metadata) {
      pdf.text(metadata, MARGIN, pdf.current.y, 8.5, "#64748B");
      pdf.current.y -= 16;
    }
    pdf.multiline(question.statement || "Enunciado não informado.", MARGIN, PAGE_W - MARGIN * 2, 9.5, "#111827", false, 13.5);
    pdf.current.y -= 5;
    (question.alternatives || []).forEach((alternative) => {
      const prefix = alternative.isCorrect ? "GABARITO" : "";
      pdf.multiline(`${prefix ? `${prefix} · ` : ""}${alternative.label}) ${stripHtml(alternative.text)}`, MARGIN + 10, PAGE_W - MARGIN * 2 - 10, 9, alternative.isCorrect ? "#15803D" : "#334155", Boolean(alternative.isCorrect), 12.5);
    });
    pdf.current.y -= 8;
    pdf.line(MARGIN, pdf.current.y, PAGE_W - MARGIN, pdf.current.y, "#E5E7EB");
    pdf.current.y -= 18;
  });

  const blob = new Blob([pdf.build()], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeTitle = (meta.title || "simulado").toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  a.href = url;
  a.download = `simulado-estudotop-${safeTitle || "admin"}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
