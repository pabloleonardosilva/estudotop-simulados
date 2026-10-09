import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { pdf } from "@react-pdf/renderer";
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
} from "@/app/lib/pdf/raio-x-report-pdf";
import { buildReportSummary, modulePercent, type ReportProps } from "@/app/admin/raio-x-provas/[id]/relatorio/report-model";

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
