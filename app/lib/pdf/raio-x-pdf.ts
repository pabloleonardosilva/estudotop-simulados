/* eslint-disable @typescript-eslint/no-explicit-any */

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 42;
const MARGIN_TOP = 54;
const MARGIN_BOTTOM = 62;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const BRAND_DARK = "#050C16";
const BRAND_DARK_2 = "#0A1626";
const BRAND_ORANGE = "#F97316";
const TEXT_DARK = "#0F172A";
const TEXT = "#334155";
const MUTED = "#64748B";
const LINE = "#E2E8F0";
const PANEL = "#FFFFFF";

const CP1252_SPECIAL: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
};

type FontKey = "regular" | "bold" | "serif" | "serifBold";
type Page = { ops: string[]; y: number; number: number };
type PdfImage = { name: string; width: number; height: number; binary: string };

type TopicItem = {
  module?: string;
  name?: string;
  question_count?: number;
  percentage?: number;
  average_difficulty?: number | string | null;
  charging_profile?: string | null;
  knowledge_points?: string[];
  subtopics?: Array<{ name?: string; knowledge_points?: string[] }>;
};

export type RaioXPdfData = {
  title: string;
  contestName?: string | null;
  positionName?: string | null;
  boardName?: string | null;
  examYear?: string | number | null;
  disciplineName?: string | null;
  dashboard?: {
    total_it_questions?: number;
    top_module?: string;
    average_difficulty?: number | string;
    total_images?: number;
    distinct_subjects?: number;
  };
  modulesSummary?: TopicItem[];
  finalSummary?: string | null;
  insights?: string[];
};

const OWL_JPEG_BASE64 = "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";

function normalizeText(value?: string | number | null) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
    .replace(/[\u2600-\u27BF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(value?: string | null) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripMd(value: string) {
  return stripHtml(value)
    .replace(/^#{1,6}\s+/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/^>\s*/g, "")
    .trim();
}

function cp1252Byte(char: string) {
  const code = char.codePointAt(0) || 32;
  if (code === 0x0a || code === 0x0d || code === 0x09) return 0x20;
  if (code >= 0x20 && code <= 0x7e) return code;
  if (code >= 0xa0 && code <= 0xff) return code;
  if (CP1252_SPECIAL[code] !== undefined) return CP1252_SPECIAL[code];
  const fallback = char.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const fbCode = fallback.codePointAt(0) || 0x3f;
  return fbCode >= 0x20 && fbCode <= 0x7e ? fbCode : 0x20;
}

function pdfString(value: string) {
  const bytes = Array.from(normalizeText(value), cp1252Byte);
  let out = "(";
  for (const b of bytes) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) out += `\\${String.fromCharCode(b)}`;
    else if (b < 0x20 || b > 0x7e) out += `\\${b.toString(8).padStart(3, "0")}`;
    else out += String.fromCharCode(b);
  }
  return out + ")";
}

function asciiBytes(value: string) {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) bytes[i] = value.charCodeAt(i) & 0xff;
  return bytes;
}

function base64ToBinary(base64: string) {
  if (typeof atob === "function") return atob(base64);
  const maybeBuffer = (globalThis as any).Buffer;
  if (maybeBuffer) return maybeBuffer.from(base64, "base64").toString("latin1");
  throw new Error("Base64 decoder indisponível neste ambiente.");
}

function fontFactor(font: FontKey, size: number) {
  if (font === "serif" || font === "serifBold") return size * 0.48;
  return size * 0.51;
}

function wrapText(text: string, maxWidth: number, size: number, font: FontKey = "regular") {
  const out: string[] = [];
  const charW = fontFactor(font, size);
  const maxChars = Math.max(12, Math.floor(maxWidth / charW));
  const paragraphs = stripHtml(text).split(/\n+/).map((p) => p.trim()).filter(Boolean);

  for (const paragraph of paragraphs.length ? paragraphs : [""]) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      if (word.length > maxChars) {
        if (line) { out.push(line); line = ""; }
        for (let i = 0; i < word.length; i += maxChars) out.push(word.slice(i, i + maxChars));
        continue;
      }
      const next = line ? `${line} ${word}` : word;
      if (next.length > maxChars && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    if (line) out.push(line);
  }
  return out;
}

function blockTextHeight(text: string, width: number, size: number, leading = size * 1.65, font: FontKey = "regular") {
  return Math.max(leading, wrapText(text, width, size, font).length * leading);
}

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  return [0, 2, 4].map((i) => (parseInt(clean.slice(i, i + 2), 16) / 255).toFixed(3)).join(" ");
}

class PdfBuilder {
  pages: Page[] = [];
  current: Page;
  images: PdfImage[] = [];

  constructor() {
    this.current = this.addPage();
  }

  addPage() {
    const page: Page = { ops: [], y: PAGE_H - MARGIN_TOP, number: this.pages.length + 1 };
    this.pages.push(page);
    this.current = page;
    return page;
  }

  registerJpeg(name: string, base64: string, width: number, height: number) {
    if (this.images.some((img) => img.name === name)) return;
    this.images.push({ name, width, height, binary: base64ToBinary(base64) });
  }

  ensure(height: number, keepWithNext = 0) {
    if (this.current.y - height - keepWithNext < MARGIN_BOTTOM) this.addPage();
  }

  setFill(hex: string) { this.current.ops.push(`${hexToRgb(hex)} rg`); }
  setStroke(hex: string) { this.current.ops.push(`${hexToRgb(hex)} RG`); }

  fontName(font: FontKey) {
    if (font === "bold") return "/F2";
    if (font === "serif") return "/F3";
    if (font === "serifBold") return "/F4";
    return "/F1";
  }

  text(value: string, x: number, y: number, size = 10, color = TEXT, font: FontKey = "regular") {
    const clean = normalizeText(value);
    if (!clean) return;
    this.current.ops.push("BT");
    this.current.ops.push(`${hexToRgb(color)} rg`);
    this.current.ops.push(`${this.fontName(font)} ${size} Tf`);
    this.current.ops.push(`${x.toFixed(2)} ${y.toFixed(2)} Td`);
    this.current.ops.push(`${pdfString(clean)} Tj`);
    this.current.ops.push("ET");
  }

  rect(x: number, y: number, w: number, h: number, fill = PANEL, stroke?: string, strokeWidth = 0.7) {
    this.current.ops.push("q");
    this.setFill(fill);
    if (stroke) {
      this.setStroke(stroke);
      this.current.ops.push(`${strokeWidth} w`);
    }
    this.current.ops.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${stroke ? "B" : "f"}`);
    this.current.ops.push("Q");
  }

  line(x1: number, y1: number, x2: number, y2: number, color = LINE, width = 0.7) {
    this.current.ops.push("q");
    this.setStroke(color);
    this.current.ops.push(`${width} w`);
    this.current.ops.push(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
    this.current.ops.push("Q");
  }

  circle(x: number, y: number, r: number, fill: string) {
    const c = r * 0.5522847498;
    this.current.ops.push("q");
    this.setFill(fill);
    this.current.ops.push(`${(x + r).toFixed(2)} ${y.toFixed(2)} m`);
    this.current.ops.push(`${(x + r).toFixed(2)} ${(y + c).toFixed(2)} ${(x + c).toFixed(2)} ${(y + r).toFixed(2)} ${x.toFixed(2)} ${(y + r).toFixed(2)} c`);
    this.current.ops.push(`${(x - c).toFixed(2)} ${(y + r).toFixed(2)} ${(x - r).toFixed(2)} ${(y + c).toFixed(2)} ${(x - r).toFixed(2)} ${y.toFixed(2)} c`);
    this.current.ops.push(`${(x - r).toFixed(2)} ${(y - c).toFixed(2)} ${(x - c).toFixed(2)} ${(y - r).toFixed(2)} ${x.toFixed(2)} ${(y - r).toFixed(2)} c`);
    this.current.ops.push(`${(x + c).toFixed(2)} ${(y - r).toFixed(2)} ${(x + r).toFixed(2)} ${(y - c).toFixed(2)} ${(x + r).toFixed(2)} ${y.toFixed(2)} c f`);
    this.current.ops.push("Q");
  }

  drawImage(name: string, x: number, y: number, w: number, h: number) {
    this.current.ops.push("q");
    this.current.ops.push(`${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm`);
    this.current.ops.push(`/${name} Do`);
    this.current.ops.push("Q");
  }

  multiline(value: string, x: number, width: number, size = 9.5, color = TEXT, font: FontKey = "regular", leading = size * 1.65) {
    const lines = wrapText(value, width, size, font);
    for (const line of lines) {
      this.ensure(leading + 2);
      this.text(line, x, this.current.y, size, color, font);
      this.current.y -= leading;
    }
  }

  sectionTitle(title: string, subtitle?: string) {
    const h = subtitle ? 52 : 36;
    this.ensure(h, 30);
    this.current.y -= 8;
    this.rect(MARGIN_X, this.current.y - 24, 5, subtitle ? 36 : 30, BRAND_ORANGE);
    this.text(title, MARGIN_X + 18, this.current.y + 1, 17, TEXT_DARK, "bold");
    if (subtitle) this.text(subtitle, MARGIN_X + 18, this.current.y - 18, 9.4, MUTED);
    this.current.y -= h;
  }

  build() {
    const objects: string[] = [];
    const add = (body: string) => { objects.push(body); return objects.length; };
    const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const f3 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>");
    const f4 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>");

    const imageIds: Record<string, number> = {};
    for (const image of this.images) {
      imageIds[image.name] = add(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.binary.length} >>\nstream\n${image.binary}\nendstream`);
    }
    const xObjectRef = Object.keys(imageIds).length
      ? `/XObject << ${Object.entries(imageIds).map(([name, id]) => `/${name} ${id} 0 R`).join(" ")} >>`
      : "";

    const pageIds: number[] = [];
    for (const page of this.pages) {
      const stream = page.ops.join("\n");
      const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      const pageId = add(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R /F3 ${f3} 0 R /F4 ${f4} 0 R >> ${xObjectRef} >> /Contents ${contentId} 0 R >>`);
      pageIds.push(pageId);
    }
    const pagesId = add(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
    for (const id of pageIds) objects[id - 1] = objects[id - 1].replace("/Parent 0 0 R", `/Parent ${pagesId} 0 R`);
    const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

    let pdf = "%PDF-1.4\n%PDF-ESTUDOTOP\n";
    const offsets: number[] = [];
    objects.forEach((body, index) => {
      offsets.push(pdf.length);
      pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return asciiBytes(pdf);
  }
}

const BAR_COLORS = ["#F97316", "#0EA5E9", "#10B981", "#8B5CF6", "#F59E0B", "#EC4899", "#14B8A6", "#A855F7", "#EF4444", "#06B6D4"];

function subjectName(item: TopicItem) {
  return normalizeText(item.module || item.name || "Assunto não classificado") || "Assunto não classificado";
}

function itemPoints(item: TopicItem) {
  const direct = Array.isArray(item.knowledge_points) ? item.knowledge_points : [];
  const nested = Array.isArray(item.subtopics) ? item.subtopics.flatMap((s) => s.knowledge_points || []) : [];
  const points = [...direct, ...nested].map((p) => normalizeText(p)).filter(Boolean);
  return Array.from(new Set(points)).slice(0, 8);
}

function pctFor(item: TopicItem, total: number) {
  const count = Number(item.question_count || 0);
  if (total > 0) return Math.round((count / total) * 100);
  return Math.round(Number(item.percentage || 0));
}

function difficulty(item: TopicItem) {
  return Number(item.average_difficulty || 0);
}

function dominance(modules: TopicItem[], total: number) {
  const topCount = Number(modules[0]?.question_count || 0);
  const tied = modules.filter((m) => Number(m.question_count || 0) === topCount && topCount > 0);
  const pct = total > 0 && topCount > 0 ? Math.round((topCount / total) * 100) : 0;
  const hasDominant = tied.length === 1 && topCount > Number(modules[1]?.question_count || 0);
  return {
    hasDominant,
    topCount,
    pct,
    tied,
    label: hasDominant ? subjectName(tied[0]) : tied.length > 1 ? "Empate técnico" : subjectName(modules[0] || {}),
    note: hasDominant
      ? `${pct}% da prova`
      : tied.length > 1
        ? `${tied.length} assuntos com ${pct}% cada`
        : "Sem distribuição",
  };
}

function addFooters(pdf: PdfBuilder, title: string) {
  const saved = pdf.current;
  const date = new Date().toLocaleDateString("pt-BR");
  const shortTitle = normalizeText(title).slice(0, 62);
  const totalPages = pdf.pages.length;
  for (const page of pdf.pages) {
    pdf.current = page;
    pdf.rect(0, 0, PAGE_W, 34, "#F8FAFC");
    pdf.line(MARGIN_X, 34, PAGE_W - MARGIN_X, 34, LINE, 0.6);
    pdf.text("EstudoTOP Simulados | Raio-X de Provas", MARGIN_X, 15, 7.5, MUTED, "bold");
    pdf.text(`${shortTitle} | ${date}`, MARGIN_X + 190, 15, 7.2, "#94A3B8");
    pdf.text(`${page.number}/${totalPages}`, PAGE_W - MARGIN_X - 22, 15, 7.5, MUTED, "bold");
  }
  pdf.current = saved;
}

function executiveCards(pdf: PdfBuilder, cards: Array<{ label: string; value: string; note?: string; color: string; font?: FontKey }>) {
  const gap = 12;
  const cardW = (CONTENT_W - gap * 2) / 3;
  const cardH = 88;
  cards.forEach((card, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = MARGIN_X + col * (cardW + gap);
    const top = pdf.current.y - row * (cardH + 15);
    const bottom = top - cardH;
    pdf.rect(x, bottom, cardW, cardH, PANEL, "#E5E7EB", 0.75);
    pdf.rect(x, top - 5, cardW, 5, card.color);
    pdf.text(card.label.toUpperCase(), x + 14, top - 22, 7.4, card.color, "bold");
    const font = card.font || "bold";
    const lines = wrapText(card.value, cardW - 28, card.value.length > 24 ? 11.2 : 15, font).slice(0, 3);
    let y = top - 45;
    for (const line of lines) {
      pdf.text(line, x + 14, y, card.value.length > 24 ? 11.2 : 15, TEXT_DARK, font);
      y -= card.value.length > 24 ? 13.5 : 15.5;
    }
    if (card.note) pdf.text(card.note, x + 14, bottom + 13, 8, MUTED);
  });
  const rows = Math.ceil(cards.length / 3);
  pdf.current.y -= rows * (cardH + 15) + 10;
}

function drawCoverPage(pdf: PdfBuilder, data: RaioXPdfData, total: number, modules: TopicItem[], avgDiff: number, dom: ReturnType<typeof dominance>, withImage: number) {
  const heroH = 300;
  pdf.rect(0, PAGE_H - heroH, PAGE_W, heroH, BRAND_DARK);
  pdf.rect(0, PAGE_H - heroH, PAGE_W, 12, BRAND_ORANGE);
  pdf.rect(PAGE_W - 250, PAGE_H - heroH, 250, heroH, BRAND_DARK_2);
  pdf.rect(PAGE_W - 250, PAGE_H - heroH, 250, heroH, "#08131F");
  pdf.drawImage("Owl", PAGE_W - 232, PAGE_H - 260, 210, 210);
  pdf.rect(PAGE_W - 300, PAGE_H - heroH, 86, heroH, BRAND_DARK);
  pdf.rect(0, PAGE_H - heroH, PAGE_W, 1.2, "#12253B");

  pdf.text("ESTUDOTOP", MARGIN_X, PAGE_H - 44, 8.3, "#FDBA74", "bold");
  pdf.text("RAIO-X DE PROVAS", MARGIN_X, PAGE_H - 66, 22, "#FFFFFF", "bold");
  pdf.text("Laudo analítico de cobrança, dificuldade e perfil editorial da prova", MARGIN_X, PAGE_H - 88, 9.5, "#CBD5E1");

  const titleLines = wrapText(data.title || "Raio-X da Prova", CONTENT_W - 160, 17.2, "serifBold").slice(0, 4);
  let y = PAGE_H - 124;
  for (const line of titleLines) {
    pdf.text(line, MARGIN_X, y, 17.2, "#FFFFFF", "serifBold");
    y -= 21;
  }

  const meta = [data.contestName, data.positionName, data.boardName, data.examYear && String(data.examYear), data.disciplineName || "Informática"]
    .filter(Boolean)
    .map((v) => normalizeText(v as string));
  pdf.text(meta.join("  |  "), MARGIN_X, PAGE_H - 232, 8.4, "#A9B8CC");

  pdf.text("DIAGNÓSTICO", MARGIN_X, PAGE_H - 262, 8, "#FDBA74", "bold");
  pdf.text(`${total || 0} questões de Informática`, MARGIN_X + 72, PAGE_H - 262, 9, "#FFFFFF", "bold");
  pdf.text(`${modules.length} assuntos mapeados`, MARGIN_X + 210, PAGE_H - 262, 8.5, "#CBD5E1");
  pdf.text(`Dificuldade média: ${avgDiff ? avgDiff.toFixed(1) : "0.0"}/5`, MARGIN_X + 335, PAGE_H - 262, 8.5, "#CBD5E1");

  pdf.current.y = PAGE_H - heroH - 30;
  pdf.sectionTitle("Resumo executivo", "Principais indicadores consolidados do recorte de Informática.");

  const cards = [
    { label: "Banca", value: normalizeText(data.boardName || "—"), note: "Organizadora", color: BRAND_ORANGE },
    { label: "Concurso", value: normalizeText(data.contestName || "—"), note: "Certame analisado", color: "#0EA5E9" },
    { label: "Questões de Informática", value: String(total || "—"), note: "Total analisado", color: "#10B981" },
    { label: "Cargo", value: normalizeText(data.positionName || "—"), note: "Função/cargo", color: "#8B5CF6" },
    { label: "Ano", value: normalizeText(data.examYear || "—"), note: "Ano da prova", color: "#F59E0B" },
    { label: "Dificuldade média", value: avgDiff ? `${avgDiff.toFixed(1)} / 5` : "—", note: avgDiff < 2 ? "Baixa" : avgDiff < 3.5 ? "Moderada" : "Alta", color: "#EC4899" },
    { label: dom.hasDominant ? "Assunto dominante" : "Maior incidência", value: dom.label, note: dom.note, color: BRAND_ORANGE },
    { label: "Assuntos mapeados", value: String(modules.length || 0), note: `Imagens no recorte: ${withImage}`, color: "#0EA5E9" },
  ];
  executiveCards(pdf, cards);
}

function drawDistributionPage(pdf: PdfBuilder, modules: TopicItem[], total: number) {
  if (!modules.length) return;
  pdf.addPage();
  pdf.sectionTitle("Mapa de cobrança");
  const barW = CONTENT_W - 236;

  for (const [index, item] of modules.entries()) {
    const name = subjectName(item);
    const count = Number(item.question_count || 0);
    const pct = pctFor(item, total);
    const diff = difficulty(item);
    const color = BAR_COLORS[index % BAR_COLORS.length];
    const lines = wrapText(name, 160, 10.5, "bold");
    const rowH = Math.max(66, lines.length * 14 + 34);
    pdf.ensure(rowH + 14);
    const top = pdf.current.y;
    const bottom = top - rowH;

    pdf.rect(MARGIN_X, bottom, CONTENT_W, rowH, index % 2 === 0 ? "#FFFFFF" : "#FBFDFF", "#E3EAF2", 0.7);
    pdf.circle(MARGIN_X + 17, top - 22, 4.4, color);
    let textY = top - 16;
    lines.slice(0, 3).forEach((line) => {
      pdf.text(line, MARGIN_X + 32, textY, 10.5, TEXT_DARK, "bold");
      textY -= 13;
    });

    const metaX = MARGIN_X + 190;
    pdf.text(`${count} ${count === 1 ? "questão" : "questões"}`, metaX, top - 17, 9.6, TEXT_DARK, "bold");
    pdf.text(`Dificuldade ${diff ? diff.toFixed(1) : "—"}/5`, metaX, top - 34, 8.8, MUTED);
    const barX = MARGIN_X + 190;
    const barY = bottom + 15;
    pdf.rect(barX, barY, barW, 12, "#EAF0F6");
    pdf.rect(barX, barY, Math.max(8, barW * (pct / 100)), 12, color);
    pdf.text(`${pct}%`, barX + barW + 14, barY + 2, 10, color, "bold");
    pdf.current.y = bottom - 16;
  }
}

function hasUsefulProfile(value?: string | null) {
  const profile = normalizeText(value || "").toLowerCase();
  if (!profile) return false;
  return !["perfil não informado", "perfil nao informado", "não informado", "nao informado", "—", "-"].includes(profile);
}

function drawTopicCardsPage(pdf: PdfBuilder, modules: TopicItem[], total: number) {
  if (!modules.length) return;
  pdf.addPage();
  pdf.sectionTitle("O que foi cobrado em cada assunto");

  for (const [index, item] of modules.entries()) {
    const name = subjectName(item);
    const count = Number(item.question_count || 0);
    const pct = pctFor(item, total);
    const diff = difficulty(item);
    const points = itemPoints(item);
    const profile = hasUsefulProfile(item.charging_profile) ? normalizeText(item.charging_profile) : "";
    const firstSubtopic = normalizeText(item.subtopics?.[0]?.name || "");
    const color = BAR_COLORS[index % BAR_COLORS.length];
    const pointsList = points.length ? points : ["Conhecimentos específicos não informados no mapeamento."];

    const nameLines = wrapText(name, CONTENT_W - 120, 14, "bold");
    const subLines = firstSubtopic ? wrapText(firstSubtopic, CONTENT_W - 120, 9.4, "regular") : [];
    const pointLinesCount = pointsList.reduce((acc, point) => acc + wrapText(point, CONTENT_W - 86, 10.3, "regular").length, 0);
    const profileLines = profile ? wrapText(profile, CONTENT_W - 86, 9.6, "regular") : [];

    const h = Math.max(
      182,
      86 + nameLines.length * 16 + subLines.length * 12 + pointLinesCount * 17 + pointsList.length * 7 + (profile ? 42 + profileLines.length * 14 : 0),
    );

    pdf.ensure(h + 28);
    const top = pdf.current.y;
    const bottom = top - h;
    pdf.rect(MARGIN_X, bottom, CONTENT_W, h, PANEL, "#E5E7EB", 0.8);
    pdf.rect(MARGIN_X, top - 6, CONTENT_W, 6, color);
    pdf.rect(MARGIN_X + 16, top - 48, 40, 40, "#FFF7ED", "#FED7AA", 0.65);
    pdf.text(`#${index + 1}`, MARGIN_X + 26, top - 32, 13, BRAND_ORANGE, "bold");

    let y = top - 20;
    nameLines.forEach((line) => {
      pdf.text(line, MARGIN_X + 70, y, 14, TEXT_DARK, "bold");
      y -= 16;
    });
    subLines.forEach((line) => {
      pdf.text(line, MARGIN_X + 70, y, 9.4, MUTED);
      y -= 12;
    });

    y -= 6;
    pdf.text(`${count} ${count === 1 ? "questão" : "questões"}`, MARGIN_X + 70, y, 9.2, color, "bold");
    pdf.text(`${pct}% da prova`, MARGIN_X + 160, y, 9.2, TEXT, "bold");
    pdf.text(`Dificuldade ${diff ? diff.toFixed(1) : "—"}/5`, MARGIN_X + 286, y, 9.2, MUTED, "bold");

    y -= 24;
    pdf.line(MARGIN_X + 22, y, MARGIN_X + CONTENT_W - 22, y, "#EDF2F7", 0.7);
    y -= 22;
    pdf.text("Conhecimentos cobrados", MARGIN_X + 24, y, 8.8, BRAND_ORANGE, "bold");
    y -= 18;

    for (const point of pointsList) {
      const lines = wrapText(point, CONTENT_W - 86, 10.3, "regular");
      pdf.circle(MARGIN_X + 34, y + 3, 2.7, color);
      for (const line of lines) {
        pdf.text(line, MARGIN_X + 48, y, 10.3, TEXT);
        y -= 16.5;
      }
      y -= 8;
    }

    if (profile) {
      y -= 6;
      const boxH = 34 + profileLines.length * 14;
      pdf.rect(MARGIN_X + 24, y - boxH + 12, CONTENT_W - 48, boxH, "#F8FAFC", "#E2E8F0", 0.65);
      pdf.text("Perfil de cobrança", MARGIN_X + 38, y - 8, 8.6, "#0EA5E9", "bold");
      let py = y - 24;
      for (const line of profileLines) {
        pdf.text(line, MARGIN_X + 38, py, 9.6, MUTED);
        py -= 14;
      }
    }

    pdf.current.y = bottom - 24;
  }
}

function uniqueSentences(texts: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of texts) {
    const clean = normalizeText(raw);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function extractConclusionText(finalSummary?: string | null) {
  const raw = stripHtml(finalSummary || "");
  if (!raw) return "";
  const match = raw.match(/Conclus[aã]o(?:\s+e\s+Recomenda[cç][õo]es)?\s*\n([\s\S]+)/i);
  if (match?.[1]) return match[1].trim();
  const paragraphs = raw.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  return paragraphs.slice(-3).join(" ");
}

function buildPanoramaHighlights(data: RaioXPdfData, modules: TopicItem[], total: number, avgDiff: number, dom: ReturnType<typeof dominance>) {
  const insights = uniqueSentences(
    (data.insights || [])
      .map((i) => stripMd(i))
      .filter((i) => !/mais cobrado|dominante|concentraram|dificuldade|diversidade|assuntos distintos/i.test(i)),
  );
  const derived: string[] = [];
  if (dom.hasDominant) {
    derived.push(`O assunto dominante foi ${dom.label}, com ${dom.pct}% da prova.`);
  } else if (dom.tied.length > 1) {
    const names = dom.tied.map(subjectName).join(", ");
    derived.push(`Não houve assunto dominante isolado: ${dom.tied.length} assuntos ficaram empatados com ${dom.pct}% cada (${names}).`);
  }
  if (avgDiff) derived.push(`A dificuldade média do conjunto ficou em ${avgDiff.toFixed(1)}/5, indicando nível ${avgDiff < 2 ? "baixo" : avgDiff < 3.5 ? "moderado" : "elevado"}.`);
  if (modules.length) derived.push(`Foram identificados ${modules.length} assuntos distintos, o que mostra ${modules.length >= 5 ? "boa diversidade temática" : "uma concentração temática mais definida"}.`);
  return uniqueSentences([...derived, ...insights]).slice(0, 5);
}

function drawPanoramaPage(pdf: PdfBuilder, data: RaioXPdfData, modules: TopicItem[], total: number, avgDiff: number, dom: ReturnType<typeof dominance>) {
  pdf.addPage();
  pdf.sectionTitle("Panorama geral");

  const highlights = buildPanoramaHighlights(data, modules, total, avgDiff, dom);
  const conclusion = extractConclusionText(data.finalSummary);
  const top = pdf.current.y;

  const metricH = 92;
  pdf.rect(MARGIN_X, top - metricH, CONTENT_W, metricH, BRAND_DARK, BRAND_DARK_2, 0.8);
  pdf.text("FECHAMENTO DO LAUDO", MARGIN_X + 22, top - 25, 8.5, "#FDBA74", "bold");
  pdf.text("Síntese final da prova", MARGIN_X + 22, top - 49, 18, "#FFFFFF", "serifBold");
  pdf.text(`${normalizeText(data.boardName || "Banca não informada")}  |  ${normalizeText(data.contestName || "Concurso não informado")}  |  ${total} questões de Informática`, MARGIN_X + 22, top - 73, 8.8, "#CBD5E1");

  pdf.current.y = top - metricH - 28;

  const panelH = 230;
  pdf.ensure(panelH + 36);
  const pTop = pdf.current.y;
  pdf.rect(MARGIN_X, pTop - panelH, CONTENT_W, panelH, PANEL, "#E2E8F0", 0.8);
  pdf.rect(MARGIN_X, pTop - panelH, 6, panelH, BRAND_ORANGE);
  pdf.text("Leitura conclusiva", MARGIN_X + 24, pTop - 26, 14, TEXT_DARK, "bold");

  let y = pTop - 58;
  for (const [i, item] of highlights.entries()) {
    pdf.circle(MARGIN_X + 30, y + 3, 3.1, BAR_COLORS[i % BAR_COLORS.length]);
    const lines = wrapText(item, CONTENT_W - 70, 9.8, "regular");
    for (const line of lines) {
      pdf.text(line, MARGIN_X + 44, y, 9.8, TEXT);
      y -= 15.5;
    }
    y -= 10;
  }

  pdf.current.y = pTop - panelH - 28;

  if (conclusion) {
    const lines = wrapText(conclusion, CONTENT_W - 44, 9.9, "regular").slice(0, 18);
    const h = 48 + lines.length * 16;
    pdf.ensure(h + 12);
    const cTop = pdf.current.y;
    pdf.rect(MARGIN_X, cTop - h, CONTENT_W, h, "#FFF7ED", "#FED7AA", 0.8);
    pdf.text("Conclusão técnica", MARGIN_X + 22, cTop - 24, 12, "#C2410C", "bold");
    let cy = cTop - 50;
    for (const line of lines) {
      pdf.text(line, MARGIN_X + 22, cy, 9.9, TEXT);
      cy -= 16;
    }
    pdf.current.y = cTop - h - 18;
  }
}

function safeFileName(value: string) {
  return (normalizeText(value) || "RaioX")
    .replace(/[^a-zA-Z0-9\-_]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 110);
}

export function downloadRaioXPdf(data: RaioXPdfData) {
  const pdf = new PdfBuilder();
  pdf.registerJpeg("Owl", OWL_JPEG_BASE64, 260, 260);

  const modules = [...(data.modulesSummary || [])]
    .filter((m) => subjectName(m))
    .sort((a, b) => {
      const diff = Number(b.question_count || 0) - Number(a.question_count || 0);
      return diff !== 0 ? diff : subjectName(a).localeCompare(subjectName(b), "pt-BR");
    });
  const dash = data.dashboard || {};
  const total = Number(dash.total_it_questions || modules.reduce((sum, item) => sum + Number(item.question_count || 0), 0));
  const avgDiff = Number(dash.average_difficulty || 0);
  const dom = dominance(modules, total);
  const withImage = Number(dash.total_images || 0);

  drawCoverPage(pdf, data, total, modules, avgDiff, dom, withImage);
  drawDistributionPage(pdf, modules, total);
  drawTopicCardsPage(pdf, modules, total);
  drawPanoramaPage(pdf, data, modules, total, avgDiff, dom);
  addFooters(pdf, data.title || "Raio-X da Prova");

  const bytes = pdf.build();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFileName(data.title || "RaioX")}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 800);
}
