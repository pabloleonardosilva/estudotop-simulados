/* eslint-disable @typescript-eslint/no-explicit-any */

type PdfQuestion = {
  order_number?: number;
  statement?: string | null;
  subject?: string | null;
  alternatives?: Array<{ id: string; label: string; text: string; is_correct?: boolean }>;
  simulado_question_id?: string;
};

type PdfAnswer = {
  alternativeId?: string;
  label?: string;
  isCorrect?: boolean | null;
};

type PdfResult = {
  displayScore: number;
  maxScore: number;
  percentage: number;
  correct: number;
  wrong: number;
  blank: number;
};

type PdfMeta = {
  title: string;
  max_attempts?: number | null;
  scoring_model?: string;
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 46;

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

function fmtNumber(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function utf16Hex(value: string) {
  let hex = "FEFF";
  for (const ch of value) {
    const code = ch.codePointAt(0) || 32;
    if (code > 0xffff) {
      // Basic fallback for emoji/surrogate-only glyphs unsupported by standard PDF fonts.
      hex += "0020";
    } else {
      hex += code.toString(16).padStart(4, "0").toUpperCase();
    }
  }
  return `<${hex}>`;
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

  rect(x: number, y: number, w: number, h: number, fill = "#FFFFFF", stroke?: string) {
    this.current.ops.push("q");
    this.current.ops.push(`${this.color(fill)} rg`);
    if (stroke) this.current.ops.push(`${this.color(stroke)} RG`);
    this.current.ops.push(`${x} ${y} ${w} ${h} re ${stroke ? "B" : "f"}`);
    this.current.ops.push("Q");
  }

  line(x1: number, y1: number, x2: number, y2: number, color = "#E5E7EB", width = 1) {
    this.current.ops.push("q");
    this.current.ops.push(`${this.color(color)} RG`);
    this.current.ops.push(`${width} w`);
    this.current.ops.push(`${x1} ${y1} m ${x2} ${y2} l S`);
    this.current.ops.push("Q");
  }

  text(text: string, x: number, y: number, size = 10, color = "#111827", bold = false) {
    this.current.ops.push("BT");
    this.current.ops.push(`${this.color(color)} rg`);
    this.current.ops.push(`/${bold ? "F2" : "F1"} ${size} Tf`);
    this.current.ops.push(`${x} ${y} Td`);
    this.current.ops.push(`${utf16Hex(text)} Tj`);
    this.current.ops.push("ET");
  }

  multiline(text: string, x: number, width: number, size = 10, color = "#111827", bold = false, lineHeight = size * 1.45) {
    const maxChars = Math.max(24, Math.floor(width / (size * 0.48)));
    const lines = wrapText(text, maxChars);
    this.ensure(lines.length * lineHeight + 8);
    for (const line of lines) {
      if (line) this.text(line, x, this.current.y, size, color, bold);
      this.current.y -= lineHeight;
    }
    return lines.length;
  }

  sectionTitle(label: string, title: string) {
    this.ensure(54);
    this.text(label.toUpperCase(), MARGIN, this.current.y, 8, "#F97316", true);
    this.current.y -= 18;
    this.text(title, MARGIN, this.current.y, 18, "#0F172A", true);
    this.current.y -= 22;
  }

  metricCard(x: number, y: number, w: number, h: number, label: string, value: string, accent = "#F8FAFC") {
    this.rect(x, y, w, h, accent, "#E5E7EB");
    this.text(label.toUpperCase(), x + 12, y + h - 20, 7.5, "#64748B", true);
    this.text(value, x + 12, y + 17, 16, "#020617", true);
  }

  build() {
    const objects: string[] = [];
    const add = (body: string) => {
      objects.push(body);
      return objects.length;
    };

    const font1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    const font2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
    const pageIds: number[] = [];

    for (const page of this.pages) {
      const stream = page.ops.join("\n");
      const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      const pageId = add(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> >> /Contents ${contentId} 0 R >>`);
      pageIds.push(pageId);
    }

    const pagesId = add(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
    for (const id of pageIds) objects[id - 1] = objects[id - 1].replace("/Parent 0 0 R", `/Parent ${pagesId} 0 R`);
    const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

    let pdf = "%PDF-1.4\n%\u00E2\u00E3\u00CF\u00D3\n";
    const offsets = [0];
    objects.forEach((body, idx) => {
      offsets.push(pdf.length);
      pdf += `${idx + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach((offset) => {
      pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
    });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return pdf;
  }
}

function subjectStats(questions: PdfQuestion[], answers: Record<string, PdfAnswer>) {
  const map = new Map<string, { correct: number; wrong: number; blank: number; total: number }>();
  questions.forEach((question) => {
    const key = question.subject || "Assunto não informado";
    const current = map.get(key) || { correct: 0, wrong: 0, blank: 0, total: 0 };
    const answer = answers[question.simulado_question_id || ""];
    current.total += 1;
    if (!answer?.alternativeId) current.blank += 1;
    else if (answer.isCorrect) current.correct += 1;
    else current.wrong += 1;
    map.set(key, current);
  });
  return Array.from(map.entries()).map(([subject, stats]) => ({ subject, ...stats }));
}

function plural(value: number, singular: string, pluralText: string) {
  return `${value} ${value === 1 ? singular : pluralText}`;
}

function profileFor(result: PdfResult, timeSpent: number, questions: PdfQuestion[]) {
  const avg = questions.length ? timeSpent / questions.length : 0;
  if (result.percentage >= 80 && avg <= 90) return { name: "Estratégico", description: "Você demonstrou equilíbrio entre velocidade e precisão. Mantenha esse padrão e refine os tópicos em que ainda houve erro." };
  if (avg <= 35 && result.wrong > result.correct) return { name: "Impulsivo", description: "Você respondeu rápido demais para o nível de erro observado. Reduza a pressa e leia alternativas com mais atenção." };
  if (avg >= 90) return { name: "Analítico", description: "Você tende a analisar com profundidade antes de decidir. Isso ajuda, mas exige controle para não perder ritmo." };
  if (result.blank > 0) return { name: "Conservador", description: "Você evitou riscos em algumas questões. Treine tomada de decisão para confiar mais no que sabe." };
  return { name: "Decisor rápido", description: "Você respondeu com boa velocidade. Seu principal desafio é evitar decisões impulsivas em enunciados longos." };
}

export function downloadSimuladoResultPdf({
  meta,
  result,
  questions,
  answers,
  timeSpent,
}: {
  meta: PdfMeta;
  result: PdfResult;
  questions: PdfQuestion[];
  answers: Record<string, PdfAnswer>;
  timeSpent: number;
}) {
  const pdf = new PdfBuilder();
  const stats = subjectStats(questions, answers);
  const weak = stats.filter((s) => s.wrong > 0 || s.blank > 0);
  const profile = profileFor(result, timeSpent, questions);

  // Cover / executive summary
  pdf.rect(0, PAGE_H - 115, PAGE_W, 115, "#0B1020");
  pdf.text("RELATÓRIO DE PERFORMANCE ESTUDOTOP", MARGIN, PAGE_H - 44, 8, "#FDBA74", true);
  pdf.text("Resultado do Simulado", MARGIN, PAGE_H - 76, 25, "#FFFFFF", true);
  pdf.text(meta.title || "Simulado", MARGIN, PAGE_H - 98, 10, "#CBD5E1");

  pdf.current.y = PAGE_H - 150;
  pdf.sectionTitle("Resumo executivo", "Visão geral da tentativa");
  const cardY = pdf.current.y - 74;
  const gap = 10;
  const w = (PAGE_W - MARGIN * 2 - gap * 3) / 4;
  pdf.metricCard(MARGIN, cardY, w, 64, "Pontuação", `${fmtNumber(result.displayScore)} / ${fmtNumber(result.maxScore)} pts`, "#FFF7ED");
  pdf.metricCard(MARGIN + (w + gap), cardY, w, 64, "Aproveitamento", `${fmtNumber(result.percentage)}%`, "#F0FDF4");
  pdf.metricCard(MARGIN + (w + gap) * 2, cardY, w, 64, "Tempo total", fmtTime(timeSpent), "#F8FAFC");
  pdf.metricCard(MARGIN + (w + gap) * 3, cardY, w, 64, "Tempo médio por questão", fmtTime(questions.length ? timeSpent / questions.length : 0), "#F8FAFC");
  pdf.current.y = cardY - 35;

  pdf.sectionTitle("Desempenho", "Acertos, erros e domínio por assunto");
  const barX = MARGIN;
  const barW = 285;
  const scoreItems = [
    ["Acertos", result.correct, "#22C55E"],
    ["Erros", result.wrong, "#EF4444"],
    ["Em branco", result.blank, "#94A3B8"],
  ] as const;
  scoreItems.forEach(([label, value, color]) => {
    pdf.text(`${label}: ${value}`, barX, pdf.current.y, 11, "#0F172A", true);
    pdf.rect(barX + 115, pdf.current.y - 3, barW, 5, "#E5E7EB");
    pdf.rect(barX + 115, pdf.current.y - 3, Math.max(2, barW * (Number(value) / Math.max(1, questions.length))), 5, color);
    pdf.current.y -= 24;
  });

  pdf.current.y -= 8;
  stats.forEach((item) => {
    pdf.ensure(38);
    const pct = item.total ? Math.round((item.correct / item.total) * 100) : 0;
    pdf.text(item.subject, MARGIN, pdf.current.y, 11, "#0F172A", true);
    pdf.text(`${pct}%`, PAGE_W - MARGIN - 35, pdf.current.y, 10, "#0F172A", true);
    pdf.current.y -= 11;
    pdf.rect(MARGIN, pdf.current.y, PAGE_W - MARGIN * 2, 4, "#E5E7EB");
    pdf.rect(MARGIN, pdf.current.y, (PAGE_W - MARGIN * 2) * (pct / 100), 4, "#F97316");
    pdf.current.y -= 17;
    pdf.text(`${plural(item.correct, "acerto", "acertos")}, ${plural(item.wrong, "erro", "erros")}, ${plural(item.blank, "em branco", "em branco")}`, MARGIN, pdf.current.y, 8, "#64748B");
    pdf.current.y -= 18;
  });

  pdf.sectionTitle("Diagnóstico", "Perfil de prova e pontos de revisão");
  pdf.text(profile.name, MARGIN, pdf.current.y, 18, "#0F172A", true);
  pdf.current.y -= 18;
  pdf.multiline(profile.description, MARGIN, PAGE_W - MARGIN * 2, 10, "#334155", false);
  pdf.current.y -= 12;
  pdf.text("Onde revisar", MARGIN, pdf.current.y, 13, "#0F172A", true);
  pdf.current.y -= 18;
  if (weak.length === 0) {
    pdf.multiline("Excelente desempenho: nenhum ponto fraco crítico foi identificado neste simulado.", MARGIN, PAGE_W - MARGIN * 2, 10, "#334155");
  } else {
    weak.forEach((item, idx) => {
      pdf.ensure(30);
      pdf.text(`${idx + 1}. ${item.subject}`, MARGIN, pdf.current.y, 11, "#0F172A", true);
      pdf.current.y -= 14;
      pdf.multiline(`Revise ${item.subject}. Neste simulado houve ${plural(item.wrong, "erro", "erros")} e ${plural(item.blank, "questão em branco", "questões em branco")} nesse tópico.`, MARGIN + 14, PAGE_W - MARGIN * 2 - 14, 9, "#475569");
      pdf.current.y -= 6;
    });
  }

  // Questions
  pdf.current = pdf.newPage();
  pdf.sectionTitle("Questões comentadas", "Questões do simulado");
  questions.forEach((question, qIndex) => {
    const answer = answers[question.simulado_question_id || ""];
    const correct = question.alternatives?.find((alt) => alt.is_correct);
    const selected = question.alternatives?.find((alt) => alt.id === answer?.alternativeId);
    pdf.ensure(105);
    pdf.text(`Questão ${qIndex + 1}${question.subject ? ` · ${question.subject}` : ""}`, MARGIN, pdf.current.y, 13, "#0F172A", true);
    pdf.current.y -= 18;
    pdf.multiline(question.statement || "", MARGIN, PAGE_W - MARGIN * 2, 9.5, "#111827", false, 13.5);
    pdf.current.y -= 6;
    (question.alternatives || []).forEach((alt) => {
      pdf.multiline(`${alt.label}) ${stripHtml(alt.text)}`, MARGIN + 8, PAGE_W - MARGIN * 2 - 8, 9, "#334155", false, 12.5);
    });
    pdf.current.y -= 5;
    const resultText = !answer?.alternativeId ? "Em branco" : answer.isCorrect ? "Acertou" : "Errou";
    pdf.text(`Sua resposta: ${selected ? `Alternativa ${selected.label}` : "Em branco"}`, MARGIN, pdf.current.y, 9.5, "#334155", true);
    pdf.text(`Gabarito: ${correct ? `Alternativa ${correct.label}` : "Não informado"}`, MARGIN + 190, pdf.current.y, 9.5, "#334155", true);
    pdf.text(`Resultado: ${resultText}`, MARGIN + 380, pdf.current.y, 9.5, answer?.isCorrect ? "#16A34A" : "#DC2626", true);
    pdf.current.y -= 22;
    pdf.line(MARGIN, pdf.current.y, PAGE_W - MARGIN, pdf.current.y, "#E5E7EB");
    pdf.current.y -= 18;
  });

  const blob = new Blob([pdf.build()], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeTitle = (meta.title || "simulado").toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  a.href = url;
  a.download = `relatorio-estudotop-${safeTitle || "simulado"}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
