import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { pdf } from "@react-pdf/renderer";
import ts from "typescript";
import {
  RAIO_X_PDF_FONT_FAMILY,
  RAIO_X_PDF_ASSETS,
  RAIO_X_PDF_OVERSIZE_ERROR,
  RaioXReportDocument,
  buildRaioXPdfModel,
  estimateQuestionHeight,
  isQuestionUnbreakable,
  registerRaioXPdfFonts,
  renderWithOversizeGuard,
  splitLead,
  splitRichLead,
} from "@/app/lib/pdf/raio-x-report-pdf";
import * as reportModel from "@/app/admin/raio-x-provas/[id]/relatorio/report-model";
import { UNSUPPORTED_IMAGE_TEXT, buildReportSummary, cleanText, modulePercent, parseRichContent, richContentText, type ReportProps, type RichLine } from "@/app/admin/raio-x-provas/[id]/relatorio/report-model";

// PDF premium do Raio-X (Versão PDF de /admin/raio-x-provas/[id]/relatorio).
// Fixtures sintéticas em memória — nenhum dado real, nada persistido.

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8").replace(/\r\n/g, "\n");
const GENERATOR = "app/lib/pdf/raio-x-report-pdf.ts";
const TELA = "app/admin/raio-x-provas/[id]/relatorio/page-client.tsx";
const PAGE = "app/admin/raio-x-provas/[id]/relatorio/page.tsx";
const PDF_CLIENT = "app/admin/raio-x-provas/[id]/relatorio/pdf-version-client.tsx";
const DASHBOARD = "app/admin/raio-x-provas/[id]/page-client.tsx";
const OVERSIZE = "Node of type VIEW can't wrap between pages and it's bigger than available page height";

function words(n: number, seed: string) {
  const base = "A banca cobrou protocolos de rede, criptografia assimétrica e planilhas eletrônicas com foco em interpretação.";
  let text = seed;
  while (text.length < n) text += ` ${base}`;
  return text.slice(0, n);
}

function fixture(overrides: { questions?: number; statement?: string; parecer?: string; annulledEvery?: number } = {}): ReportProps {
  const total = overrides.questions ?? 6;
  const modules = ["Segurança da Informação", "Redes de Computadores", "Microsoft Excel"];
  const questions = Array.from({ length: total }, (_, i) => {
    const subject = modules[i % modules.length];
    const annulled = Boolean(overrides.annulledEvery && i % overrides.annulledEvery === 0);
    return {
      id: `q-${i}`,
      original_number: String(i + 1),
      statement: i === 0 && overrides.statement ? overrides.statement : `Questão ${i + 1}: ${words(380, "Enunciado de teste.")}`,
      alternatives: ["A", "B", "C", "D", "E"].map((label) => ({ label, text: `Alternativa ${label} da questão ${i + 1}, com acentuação: ação, já, você.`, is_correct: label === "B" })),
      answer_key: annulled ? null : "B",
      is_annulled: annulled,
      subject_name: subject,
      module_name: subject,
      difficulty_level: 2 + (i % 3),
      knowledge_points: [`Tópico ${i + 1}`, `Conceito ${i + 1}`],
      tags: [subject, `Tópico ${i + 1}`],
      has_image: i % 4 === 0,
    };
  });
  return {
    analysis: {
      id: "fixture",
      title: "RaioX - Prova - Concurso Fictício - Cargo Fictício - 2024 - Banca",
      contest_name: "Concurso Fictício",
      position_name: "Cargo Fictício",
      board_name: "Banca",
      final_summary_text: overrides.parecer ?? "Primeiro parágrafo do parecer.\n\nSegundo parágrafo do parecer.",
      updated_at: "2026-10-09T12:00:00.000Z",
    },
    effectiveModules: modules.map((module) => ({
      module,
      question_count: questions.filter((q) => q.subject_name === module).length,
      average_difficulty: 3,
      knowledge_points: [`Ponto de ${module}`],
      tags: [module, `Tag de ${module}`],
      question_numbers: questions.filter((q) => q.subject_name === module).map((q) => q.original_number),
    })),
    totalQuestions: total,
    avgDiff: 3,
    questions,
  };
}

async function renderPdf(props: ReportProps) {
  registerRaioXPdfFonts(`${resolve(root, "public/fonts")}/`);
  const model = buildRaioXPdfModel(props);
  const result = await renderWithOversizeGuard(async (safeMode) => {
    const stream = await pdf(React.createElement(RaioXReportDocument, { model, assets: {}, safeMode }) as Parameters<typeof pdf>[0]).toBuffer();
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  });
  const raw = result.output.toString("latin1");
  return { ...result, raw, pages: (raw.match(/\/Type \/Page\b/g) || []).length };
}

test.describe("Modelo do PDF reaproveita as regras da Versão Tela", () => {
  test("indicadores, percentuais e nome do arquivo vêm de report-model.ts", () => {
    const props = fixture();
    const model = buildRaioXPdfModel(props);
    const summary = buildReportSummary(props);
    expect(model.kpis.map((k) => k.value)).toEqual([String(summary.total), String(summary.modules.length), `${summary.averageDifficulty.toFixed(1)} / 5`, String(summary.annulledCount)]);
    expect(model.subjects.map((s) => s.percent)).toEqual(summary.modules.map((m) => modulePercent(m, summary.total)));
    expect(model.quickRead).toBe(summary.quickRead);
    expect(model.fileName).toBe("RaioX_-_Prova_-_Concurso_Ficticio_-_Cargo_Ficticio_-_2024_-_Banca.pdf");
  });

  test("anulada: sem alternativa correta destacada e gabarito 'Anulada' (mesma regra da Tela)", () => {
    const model = buildRaioXPdfModel(fixture({ annulledEvery: 2 }));
    const annulled = model.questions.filter((q) => q.annulled);
    expect(annulled.length).toBeGreaterThan(0);
    for (const q of annulled) {
      expect(q.correct).toBe("Anulada");
      expect(q.alternatives.some((a) => a.correct)).toBe(false);
    }
  });

  test("Versão Tela consome os mesmos helpers (sem cópia das regras)", () => {
    const tela = read(TELA);
    expect(tela).toContain('from "./report-model"');
    expect(tela).toContain("buildReportSummary({ analysis, effectiveModules, totalQuestions, avgDiff, questions })");
    expect(tela).not.toMatch(/function computeDominance\(/);
    expect(tela).not.toMatch(/function moduleTags\(/);
  });
});

test.describe("Paginação sem perda de conteúdo", () => {
  test("splitLead nunca descarta texto", () => {
    const cases = [words(3200, "Com frases."), "x".repeat(2000), `${"palavra ".repeat(400)}fim`, "curto"];
    for (const text of cases) {
      const [lead, rest] = splitLead(text);
      expect(`${lead} ${rest}`.replace(/\s+/g, "")).toBe(text.replace(/\s+/g, ""));
      expect(lead.length).toBeGreaterThan(0);
    }
  });

  test("guarda: aviso de bloco maior que a página refaz em modo seguro; persistindo, falha sem gerar arquivo", async () => {
    const attempts: boolean[] = [];
    const once = await renderWithOversizeGuard(async (safe) => {
      attempts.push(safe);
      if (!safe) console.warn(OVERSIZE);
      return "ok";
    });
    expect(once).toEqual({ output: "ok", safeMode: true });
    expect(attempts).toEqual([false, true]);
    await expect(renderWithOversizeGuard(async () => {
      console.warn(OVERSIZE);
      return "cortado";
    })).rejects.toThrow(RAIO_X_PDF_OVERSIZE_ERROR);
  });

  test("questão comum fica indivisível; enunciado enorme passa a quebrar entre páginas", () => {
    const small = buildRaioXPdfModel(fixture()).questions[0];
    const huge = buildRaioXPdfModel(fixture({ statement: words(7000, "Enunciado enorme.") })).questions[0];
    expect(isQuestionUnbreakable(small, false)).toBe(true);
    expect(isQuestionUnbreakable(huge, false)).toBe(false);
    expect(isQuestionUnbreakable(small, true)).toBe(false);
    expect(estimateQuestionHeight(huge)).toBeGreaterThan(estimateQuestionHeight(small));
  });

  for (const [name, props] of [
    ["prova curta", fixture({ questions: 1 })],
    ["45 questões", fixture({ questions: 45, annulledEvery: 9 })],
    ["enunciado de 7.000 caracteres", fixture({ statement: words(7000, "Enunciado maior que uma página.") })],
    ["parecer com mais de duas páginas", fixture({ parecer: Array.from({ length: 12 }, (_, i) => words(900, `Parágrafo ${i + 1}.`)).join("\n\n") })],
  ] as const) {
    test(`gera PDF real sem bloco cortado: ${name}`, async () => {
      const result = await renderPdf(props);
      expect(result.raw.startsWith("%PDF")).toBe(true);
      expect(result.safeMode).toBe(false);
      expect(result.pages).toBeGreaterThan(1);
    });
  }

  test("fontes estáticas: negrito real (Inter-Bold embutida) e família exclusiva", async () => {
    const { raw } = await renderPdf(fixture());
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+Inter-Bold/);
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+Inter-Regular/);
    expect(RAIO_X_PDF_FONT_FAMILY).not.toBe("Inter");
  });
});

test.describe("Capa oficial e identificação", () => {
  test("capa oficial configurada, existente e em proporção A4 (sem distorção)", () => {
    expect(RAIO_X_PDF_ASSETS.coverImage).toBe("/images/pdf/capa_raiox.png");
    const png = readFileSync(resolve(root, "public/images/pdf/capa_raiox.png"));
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    expect(Math.abs(width / height - 595.28 / 841.89)).toBeLessThan(0.002);
  });

  test("selo usa título e ID reais do registro (nada fixo no código)", () => {
    const model = buildRaioXPdfModel(fixture());
    expect(model.title).toBe("RaioX - Prova - Concurso Fictício - Cargo Fictício - 2024 - Banca");
    expect(model.recordId).toBe("fixture");
    const generator = read(GENERATOR);
    expect(generator).not.toMatch(/a00bf8ee|PC-MG|PCMG/);
  });

  test("capa por imagem não aciona a guarda de paginação (imagem de página inteira)", async () => {
    registerRaioXPdfFonts(`${resolve(root, "public/fonts")}/`);
    const model = buildRaioXPdfModel(fixture());
    const coverImage = `data:image/png;base64,${readFileSync(resolve(root, "public/images/pdf/capa_raiox.png")).toString("base64")}`;
    const result = await renderWithOversizeGuard(async (safeMode) => {
      await pdf(React.createElement(RaioXReportDocument, { model, assets: { coverImage }, safeMode }) as Parameters<typeof pdf>[0]).toBuffer();
      return "ok";
    });
    expect(result.safeMode).toBe(false);
  });
});

test.describe("Isolamento e integração", () => {
  test("gerador não altera registros globais do React PDF usados pelos outros PDFs", () => {
    const generator = read(GENERATOR);
    expect(generator).not.toContain("Font.registerHyphenationCallback(");
    expect(generator).not.toContain("Font.registerEmojiSource(");
    expect(generator).not.toMatch(/family:\s*"Inter"/);
    expect(generator).not.toContain("window.print");
    for (const other of ["simulado-result-pdf.ts", "student-notes-pdf.ts", "event-ranking-pdf.ts", "simulado-admin-pdf.ts"]) {
      expect(read(`app/lib/pdf/${other}`)).not.toContain(RAIO_X_PDF_FONT_FAMILY);
    }
  });

  test("Versão PDF usa a mesma rota, a mesma autorização e o mesmo carregamento de dados da Tela", () => {
    const page = read(PAGE);
    expect(page).toContain("await requireAdminPage();");
    expect(page).toContain('if (versao === "pdf")');
    expect(page.match(/getQuestionsWithSubjects\(id\)/g)?.length).toBe(1);
  });

  test("pré-visualização é o próprio Blob baixado em 'Gerar PDF'", () => {
    const client = read(PDF_CLIENT);
    expect(client).toContain("URL.createObjectURL(result.blob)");
    expect(client).toContain("downloadPdfBlob(generated.blob, generated.fileName)");
    expect(client).toContain("Tentar novamente");
  });

  test("Resultado final oferece Versão Tela e Versão PDF", () => {
    const dashboard = read(DASHBOARD);
    expect(dashboard).toContain("/relatorio`} target=\"_blank\"");
    // Card "Relatório final do Raio-X" e botão do topo ("Ver relatório final") levam também à Versão PDF.
    expect(dashboard.split("/relatorio?versao=pdf`}").length - 1).toBe(2);
    expect(dashboard).toContain("Versão Tela");
    expect(dashboard).toContain("Versão PDF");
  });
});

// ─── Conteúdo rico das questões (enunciado/alternativas com formatação e imagens) ───

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(data: Buffer) {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// PNG real (RGB sólido) montado em memória, nas dimensões pedidas.
function pngDataUri(width: number, height: number, rgb: [number, number, number] = [249, 115, 22]) {
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set(rgb, 1 + x * 3);
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed));
    return Buffer.concat([length, typed, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))), chunk("IEND", Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

// JPEG real 40×30 (gerado por canvas).
const JPEG_40x30 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAeACgDASIAAhEBAxEB/8QAFwABAQEBAAAAAAAAAAAAAAAAAAYEBf/EACQQAAEDBAAGAwAAAAAAAAAAAAABAwUCBBESFTVBUYKyVKLR/8QAFgEBAQEAAAAAAAAAAAAAAAAABAMF/8QAHxEAAQQCAwEBAAAAAAAAAAAAAgABAxIEERMhMWHh/9oADAMBAAIRAxEAPwDQASE7zd/x9UMWCHmKu9Lcnm4RtrarwQB0ILm7Hl6qJPBqLlbz4jBnWJhr79/FXgAAtBCclou8uZF11lnairGF2ROiJ3KMFYpSiKwqU0IyjUlIcEkfj/en9NkTF3ltItOvM60U5yuyL0VO5RgsWbIQuLs3agOFGJMTO/SAAImL/9k=";

// Mesmo formato do enunciado real que motivou a correção (Q2 PCMG/FUMARC: ícones colados
// entre spans de marcador vermelho, itens separados por <br><br>).
const MARKER = '<span data-image-marker="true" style="font-weight:700;color:#dc2626;font-size:1.3em">';
const ICONS = [pngDataUri(31, 33, [10, 120, 60]), pngDataUri(36, 36, [200, 40, 40]), pngDataUri(37, 36, [90, 90, 90]), pngDataUri(36, 33, [40, 90, 200])];
const Q2_LIKE = `Correlacione as colunas a seguir:<br><br>Ícone<br><br>${["I", "II", "III", "IV"].map((n, i) => `${n}. ${MARKER}${MARKER}<img src="${ICONS[i]}" alt="Imagem colada" style="display:inline-block;max-width:100%;height:auto;cursor:nwse-resize;" data-pasted-image="true" draggable="false"></span></span>`).join("<br><br>")}<br><br>Descrição<br><br>(  )  Atualizar Sumário<br><br>(  )  Inserir Nota de Fim<br><br>Está CORRETA a seguinte sequência:`;

const imagesOf = (lines: RichLine[]) => lines.flatMap((line) => line.runs).filter((run) => run.kind === "image");
const textsOf = (lines: RichLine[]) => lines.map((line) => line.runs.map((run) => (run.kind === "text" ? run.text : run.kind === "image" ? "[img]" : "[x]")).join(""));

test.describe("parseRichContent — estrutura segura compartilhada pela Tela e pelo PDF", () => {
  test("enunciado no formato da Q2: quatro imagens na ordem, quebras e linhas em branco preservadas, sem marcador vermelho", () => {
    const lines = parseRichContent(Q2_LIKE);
    expect(imagesOf(lines).map((run) => run.kind === "image" && run.src)).toEqual(ICONS);
    expect(imagesOf(lines).map((run) => run.kind === "image" && `${run.width}x${run.height}`)).toEqual(["31x33", "36x36", "37x36", "36x33"]);
    expect(textsOf(lines)).toEqual(["Correlacione as colunas a seguir:", "", "Ícone", "", "I. [img]", "", "II. [img]", "", "III. [img]", "", "IV. [img]", "", "Descrição", "", "( ) Atualizar Sumário", "", "( ) Inserir Nota de Fim", "", "Está CORRETA a seguinte sequência:"]);
    expect(JSON.stringify(lines)).not.toMatch(/dc2626|data-image-marker|style|cursor/);
  });

  test("PNG e JPEG embutidos aceitos com dimensões reais; largura declarada mantém a proporção", () => {
    const lines = parseRichContent(`<p>Antes <img src="${JPEG_40x30}"> meio <img src="${pngDataUri(200, 100)}" style="width: 80px; height: auto"> fim</p>`);
    const [jpeg, png] = imagesOf(lines);
    expect(jpeg).toMatchObject({ kind: "image", width: 40, height: 30 });
    expect(png).toMatchObject({ kind: "image", width: 80, height: 40 });
    expect(textsOf(lines)).toEqual(["Antes [img] meio [img] fim"]);
  });

  test("negrito, itálico, sublinhado, parágrafos e listas", () => {
    const lines = parseRichContent("<p>Texto <strong>forte <em>e itálico</em></strong> <u>sub</u></p><ol><li>Um</li><li>Dois</li></ol><ul><li>Item</li></ul><div>Fim</div>");
    expect(lines[0].runs).toEqual([
      { kind: "text", text: "Texto " },
      { kind: "text", text: "forte ", bold: true },
      { kind: "text", text: "e itálico", bold: true, italic: true },
      { kind: "text", text: " " },
      { kind: "text", text: "sub", underline: true },
    ]);
    expect(lines.slice(1).map((line) => `${line.marker ?? ""} ${textsOf([line])[0]}`)).toEqual(["1. Um", "2. Dois", "• Item", " Fim"]);
  });

  test("texto puro com \\n e afirmativas I – / II –: mesmas quebras da Revisão (insertListItemBreaks)", () => {
    expect(textsOf(parseRichContent("Linha um\n\nLinha dois"))).toEqual(["Linha um", "", "Linha dois"]);
    const roman = parseRichContent("Analise:\n\nI – primeira.\n\nII – segunda.\n\nEstão corretas:");
    expect(textsOf(roman)).toEqual(["Analise:", "I – primeira.", "II – segunda.", "", "Estão corretas:"]);
    expect(roman[1].runs[0]).toEqual({ kind: "text", text: "I", bold: true });
  });

  test("HTML malformado não perde texto", () => {
    const lines = parseRichContent("<p>Aberto <strong>sem fechar<br>continua</em> depois 3 < 5 e <b>x</p> final <span");
    expect(richContentText(lines)).toBe("Aberto sem fechar\ncontinua depois 3 < 5 e x\nfinal <span");
  });

  test("conteúdo perigoso é descartado; URLs e formatos não permitidos viram aviso explícito", () => {
    const html = `<script>alert(1)</script><style>p{color:red}</style><iframe src="https://x.test"></iframe>`
      + `<p onclick="alert(2)">Texto <a href="javascript:alert(3)">link</a></p>`
      + `<img src="x" onerror="alert(4)"><img src="https://cdn.test/a.png"><img src="javascript:alert(5)">`
      + `<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">`
      + `<img src="data:image/png;base64,${JPEG_40x30.split(",")[1]}"><img src="data:image/png;base64,@@@">`;
    const lines = parseRichContent(html);
    const serialized = JSON.stringify(lines);
    expect(serialized).not.toMatch(/alert|onerror|onclick|javascript|script|iframe|svg|gif|https/);
    expect(textsOf(lines)[0]).toBe("Texto link");
    expect(lines.flatMap((line) => line.runs).filter((run) => run.kind === "unsupported-image")).toHaveLength(7);
    expect(richContentText(lines)).toContain(UNSUPPORTED_IMAGE_TEXT);
  });

  test("entidades e caracteres especiais", () => {
    expect(richContentText(parseRichContent("a&nbsp;b &amp;lt;b&amp;gt; &lt;b&gt;não é tag&lt;/b&gt; &#8211; &#x2192; &aacute;rea a&ccedil;&atilde;o ≥ ½"))).toBe("a b &lt;b&gt; <b>não é tag</b> – → área ação ≥ ½");
  });

  test("vazio ou só conteúdo descartado usa o texto de reserva; cleanText segue igual para os demais usos", () => {
    expect(textsOf(parseRichContent("", "Enunciado não disponível."))).toEqual(["Enunciado não disponível."]);
    expect(textsOf(parseRichContent("<script>x</script>", "Alternativa sem texto."))).toEqual(["Alternativa sem texto."]);
    expect(cleanText("<p>a</p><br>b &amp; <img src=x>c")).toBe("a b & c");
  });
});

function richFixture(statement: string, alternatives?: string[]): ReportProps {
  const props = fixture({ questions: 3 });
  const [first, ...others] = props.questions ?? [];
  return {
    ...props,
    questions: [{ ...first, statement, alternatives: alternatives ? alternatives.map((text, i) => ({ label: "ABCDE"[i], text, is_correct: i === 1 })) : first.alternatives }, ...others],
  };
}

async function renderRichPdf(props: ReportProps) {
  const result = await renderPdf(props);
  return { ...result, images: (result.raw.match(/\/Subtype \/Image/g) || []).length };
}

test.describe("Versão PDF — conteúdo rico e paginação", () => {
  test("modelo usa a mesma estrutura da Tela para enunciado e alternativas", () => {
    const model = buildRaioXPdfModel(richFixture(Q2_LIKE, ["<b>II</b>, IV", `Ícone <img src="${ICONS[0]}">`]));
    expect(model.questions[0].statement).toEqual(parseRichContent(Q2_LIKE));
    expect(model.questions[0].alternatives[1].content).toEqual(parseRichContent(`Ícone <img src="${ICONS[0]}">`));
  });

  test("imagens e quebras entram na estimativa de altura", () => {
    const plain = buildRaioXPdfModel(richFixture("Correlacione as colunas a seguir: Ícone I. II. III. IV.")).questions[0];
    const rich = buildRaioXPdfModel(richFixture(Q2_LIKE)).questions[0];
    const big = buildRaioXPdfModel(richFixture(`Veja: <img src="${pngDataUri(1600, 2400)}">`)).questions[0];
    expect(estimateQuestionHeight(rich)).toBeGreaterThan(estimateQuestionHeight(plain) + 150);
    expect(estimateQuestionHeight(big)).toBeGreaterThan(estimateQuestionHeight(plain) + 300);
  });

  test("splitRichLead nunca descarta linhas, imagens ou texto", () => {
    const longLine = parseRichContent(words(3200, "Linha única <b>com negrito</b>."));
    const many = parseRichContent(Array.from({ length: 40 }, (_, i) => `Item ${i + 1} <img src="${ICONS[i % 4]}"> ${words(160, "texto.")}`).join("<br>"));
    for (const lines of [longLine, many, parseRichContent(Q2_LIKE)]) {
      const [lead, rest] = splitRichLead(lines, 200);
      expect(lead.length).toBeGreaterThan(0);
      expect(imagesOf([...lead, ...rest])).toEqual(imagesOf(lines));
      expect(richContentText([...lead, ...rest]).replace(/\s+/g, "")).toBe(richContentText(lines).replace(/\s+/g, ""));
    }
  });

  for (const [name, props, minImages] of [
    ["formato da Q2 com quatro ícones PNG", richFixture(Q2_LIKE), 4],
    ["PNG e JPEG no meio do texto, negrito e itálico", richFixture(`<p><b>I</b> – O ícone <img src="${JPEG_40x30}"> corresponde à opção <i>“Do Slide Atual”</i>, ação já testada.</p><p><b>II</b> – O ícone <img src="${pngDataUri(39, 33)}"> corresponde à opção <em>Testar</em>.</p>`, ["<i>Itálico</i> e <b>negrito</b>", `Ícone <img src="${pngDataUri(20, 20, [1, 2, 3])}">`]), 3],
    ["imagem grande (1600×2400) limitada à página", richFixture(`Observe a figura:<br><img src="${pngDataUri(1600, 2400)}"><br>Responda.`), 1],
    ["vinte imagens distintas", richFixture(Array.from({ length: 20 }, (_, i) => `Item ${i + 1}: <img src="${pngDataUri(30 + i, 30, [i * 10, 100, 200 - i * 5])}">`).join("<br>")), 20],
    ["enunciado de 7.000 caracteres com imagens", richFixture(`${words(3500, "Abertura longa.")}<br><img src="${pngDataUri(300, 200)}"><br>${words(3500, "Continuação longa.")}<br><img src="${pngDataUri(320, 180)}">`), 2],
    ["imagem não suportada", richFixture(`Antes <img src="https://cdn.test/a.png"> depois <img src="data:image/webp;base64,UklGRg==">`), 0],
  ] as const) {
    test(`gera PDF real sem bloco cortado: ${name}`, async () => {
      const result = await renderRichPdf(props);
      expect(result.raw.startsWith("%PDF")).toBe(true);
      expect(result.safeMode).toBe(false);
      expect(result.images).toBeGreaterThanOrEqual(minImages);
    });
  }

  test("itálico usa Helvetica Oblique padrão do PDF; texto fora da WinAnsi segue em Inter (sem falha)", async () => {
    const { raw } = await renderRichPdf(richFixture("Normal <i>itálico em português</i> e <i>seta → fora da WinAnsi</i>."));
    expect(raw).toMatch(/\/BaseFont \/Helvetica-Oblique/);
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+Inter-Regular/);
  });

  test("modo seguro (todos os blocos quebráveis) também gera o documento com imagens", async () => {
    registerRaioXPdfFonts(`${resolve(root, "public/fonts")}/`);
    const model = buildRaioXPdfModel(richFixture(Q2_LIKE));
    const stream = await pdf(React.createElement(RaioXReportDocument, { model, assets: {}, safeMode: true }) as Parameters<typeof pdf>[0]).toBuffer();
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString("latin1").startsWith("%PDF")).toBe(true);
  });
});

// Tela real: page-client.tsx transpilado (JSX do React) e renderizado no servidor.
function renderTela(props: ReportProps) {
  const requireFromRoot = createRequire(resolve(root, "package.json"));
  const { outputText } = ts.transpileModule(read(TELA), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } });
  const stubs: Record<string, unknown> = {
    "./report-model": reportModel,
    "@/lib/supabase/adminFetch": { adminFetch: async () => new Response("{}") },
    "next/navigation": { useRouter: () => ({ refresh() {}, push() {} }) },
  };
  const mod = { exports: {} as { default?: React.ComponentType<ReportProps> } };
  new Function("require", "module", "exports", outputText)((name: string) => stubs[name] ?? requireFromRoot(name), mod, mod.exports);
  return renderToStaticMarkup(React.createElement(mod.exports.default!, props));
}

test.describe("Versão Tela — conteúdo rico com componentes React", () => {
  test("enunciado e alternativas usam parseRichContent; sem dangerouslySetInnerHTML nem texto achatado", () => {
    const tela = read(TELA);
    expect(tela).toContain('parseRichContent(q.statement, "Enunciado não disponível.")');
    expect(tela).toContain('parseRichContent(alt.text, "Alternativa sem texto.")');
    expect(tela).not.toContain("dangerouslySetInnerHTML");
    expect(tela).not.toMatch(/cleanText\((q\.statement|alt\.text)/);
    expect(read(GENERATOR)).not.toMatch(/cleanText\((q\.statement|alt\.text)/);
  });

  test("renderiza imagens limpas, quebras, negrito e itálico; descarta conteúdo perigoso", () => {
    const html = renderTela(richFixture(`${Q2_LIKE}<br><b>Forte</b> <i>leve</i><script>alert(1)</script><img src="x" onerror="alert(2)">`, ["<b>II</b>, IV, I, III.", `Ícone <img src="${JPEG_40x30}">`]));
    const start = html.indexOf('<article class="rx-question-card');
    const card = html.slice(start, html.indexOf('class="rx-question-foot"', start));
    expect(card.match(/<img class="rx-rich-image"/g)).toHaveLength(5);
    for (const src of ICONS) expect(card).toContain(`src="${src}"`);
    expect(card.indexOf(ICONS[0])).toBeLessThan(card.indexOf(ICONS[1]));
    expect(card.indexOf(ICONS[2])).toBeLessThan(card.indexOf(ICONS[3]));
    expect(card).toContain('<span class="rx-rich-line"><br/></span>');
    expect(card).toContain("<strong>Forte</strong>");
    expect(card).toContain("<em>leve</em>");
    expect(card).toContain("<strong>II</strong>, IV, I, III.");
    expect(card).toContain(UNSUPPORTED_IMAGE_TEXT);
    expect(card).not.toMatch(/data-image-marker|dc2626|onerror|alert|<script/);
  });
});
