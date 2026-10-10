// ─── Exportação TXT em lote ─────────────────────────────────────────────────
// Formato único do "Exportar TXT" das telas administrativas de questões
// (Banco de Questões, inclusive a fila de publicação, e Revisar questões).
// Extraído sem alteração de app/questoes/page-client.tsx: mesmo conteúdo,
// separador, BOM, MIME, convenção de nome e limpeza do Blob.
// 100% client-side, a partir dos dados já carregados pela tela: nenhuma
// chamada de API e nenhuma mutação (status, conteúdo, vínculos ou ordem).

// "Quatro quebras de parágrafo" entre uma questão e outra: 1 \n fecha a
// última linha da questão anterior + 4 \n produzem 4 linhas em branco antes
// da próxima questão começar — 5 \n ao todo.
export const TXT_EXPORT_QUESTION_SEPARATOR = "\n\n\n\n\n";
// BOM UTF-8 (U+FEFF): sem ele, o Bloco de Notas do Windows pode exibir
// acentuação (ç, ã, é...) incorretamente ao abrir o .txt exportado.
export const TXT_EXPORT_BOM = String.fromCharCode(0xfeff);

// label/text aceitam null porque o tipo de alternativa da tela Revisar os
// declara opcionais; o formatador é o mesmo do Banco de Questões.
export type TxtExportAlternative = { label?: string | null; text?: string | null; is_correct?: boolean | null; order_number?: number | null };
export type TxtExportQuestion = { statement?: string | null; status?: string | null; question_alternatives?: TxtExportAlternative[] | null };

function stripHtmlForTxtExport(value?: string | null) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
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

export function formatQuestionForTxtExport(question: TxtExportQuestion): string {
  const alternatives = [...(question.question_alternatives || [])].sort(
    (a, b) => (a.order_number ?? 0) - (b.order_number ?? 0),
  );
  const lines = [stripHtmlForTxtExport(question.statement)];
  if (question.status === "annulled") lines.push("[QUESTÃO ANULADA]");
  lines.push("");
  for (const alt of alternatives) {
    // Asterisco vem sempre de is_correct (nunca reconstruído por label) —
    // uma questão anulada sem gabarito definido simplesmente não marca
    // nenhuma alternativa, nunca inventa uma correta.
    const prefix = alt.is_correct ? `*${alt.label})` : `${alt.label})`;
    lines.push(`${prefix} ${stripHtmlForTxtExport(alt.text)}`);
  }
  return lines.join("\n");
}

// ─── Identificação e numeração (2026-10-10) ─────────────────────────────────
// Primeira linha do arquivo: os filtros aplicados à listagem no momento da
// exportação (nomes legíveis, na ordem da tela). Sem filtros: linha neutra.
export const TXT_EXPORT_NO_FILTERS_LINE = "Todas as questões";

// Cada parte é um filtro ativo já resolvido para nomes legíveis (vazias são
// omitidas). Quebras de linha viram espaço: a identificação é sempre uma linha.
export function buildTxtExportFilterLine(parts: Array<string | null | undefined>) {
  const clean = parts.map((part) => String(part || "").replace(/\s+/g, " ").trim()).filter(Boolean);
  return clean.length > 0 ? clean.join(" - ") : TXT_EXPORT_NO_FILTERS_LINE;
}

// Numeração própria da exportação (independente do código da questão):
// 01), 02)... com no mínimo dois dígitos, sem truncar 100, 1000...
export function txtExportQuestionNumber(index: number) {
  return `${String(index + 1).padStart(2, "0")})`;
}

// Arquivo: linha de identificação, uma linha em branco e as questões numeradas
// na ordem recebida, separadas como antes. O texto de cada questão (enunciado,
// alternativas, gabarito, anulada) vem inalterado de formatQuestionForTxtExport.
export function buildQuestionsTxtContent(questions: TxtExportQuestion[], filterLine: string = TXT_EXPORT_NO_FILTERS_LINE) {
  const body = questions
    .map((question, index) => `${txtExportQuestionNumber(index)} ${formatQuestionForTxtExport(question)}`)
    .join(TXT_EXPORT_QUESTION_SEPARATOR);
  return `${buildTxtExportFilterLine([filterLine])}\n\n${body}`;
}

// questoes-<assunto>-<data>.txt quando exatamente um Assunto está filtrado;
// senão questoes-exportadas-<data>.txt.
export function buildTxtExportFileName(singleSubjectName?: string | null) {
  const datePart = new Date().toISOString().slice(0, 10);
  const slug = (singleSubjectName || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug) return `questoes-${slug}-${datePart}.txt`;
  return `questoes-exportadas-${datePart}.txt`;
}

// Seleção vazia: nada é gerado nem baixado.
export function downloadQuestionsTxt(questions: TxtExportQuestion[], fileName: string, filterLine: string = TXT_EXPORT_NO_FILTERS_LINE) {
  if (questions.length === 0) return;
  const content = buildQuestionsTxtContent(questions, filterLine);
  // BOM no início para o Bloco de Notas do Windows reconhecer UTF-8 e
  // exibir acentuação corretamente.
  const blob = new Blob([TXT_EXPORT_BOM + content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
