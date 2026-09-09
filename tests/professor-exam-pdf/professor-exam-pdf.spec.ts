import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const EXAM_PDF_ROUTE = "app/api/professor/events/[id]/exam-pdf/route.ts";
const RENDERER = "app/lib/pdf/simulado-result-pdf.ts";
const PANEL = "app/professor/eventos/[id]/page-client.tsx";

test("exam-pdf route is guarded by requireEventManager (professor associated OR admin) — no ad-hoc auth", () => {
  const route = read(EXAM_PDF_ROUTE);
  expect(route).toContain('import { requireEventManager } from "@/lib/server/authGuard";');
  expect(route).toContain("const manager = await requireEventManager(request, id);");
  expect(route).toContain("if (manager instanceof NextResponse) return manager;");
});

test("exam-pdf route resolves the simulado from the Event server-side — never trusts a client-supplied simulado_id", () => {
  const route = read(EXAM_PDF_ROUTE);
  // O único simulado_id usado na query de questões vem do próprio Evento
  // carregado do banco (event.simulado_id), nunca de request.json()/query
  // string/params além do id do Evento.
  expect(route).toContain('.from("simulado_events")');
  expect(route).toContain('.eq("id", id)');
  expect(route).toContain('.eq("simulado_id", event.simulado_id)');
  expect(route).not.toMatch(/searchParams\.get\(["']simulado_id["']\)/);
  expect(route).not.toMatch(/body\.simulado_id/);
});

test("exam-pdf route returns the exact controlled error when the Event has no Simulado, without throwing", () => {
  const route = read(EXAM_PDF_ROUTE);
  expect(route).toContain(
    '{ ok: false, message: "Este evento não possui um simulado disponível para geração do PDF." }',
  );
  expect(route).toContain("status: 400");
});

test("exam-pdf route never reads or returns student/attempt/professor personal data (PDF neutro)", () => {
  const route = read(EXAM_PDF_ROUTE);

  // Nenhuma tabela de aluno/tentativa/participante é consultada.
  expect(route).not.toMatch(/from\(\s*["'`]simulado_attempts["'`]\s*\)/);
  expect(route).not.toMatch(/from\(\s*["'`]simulado_answers["'`]\s*\)/);
  expect(route).not.toMatch(/from\(\s*["'`]simulado_results["'`]\s*\)/);
  expect(route).not.toMatch(/from\(\s*["'`]simulado_event_participants["'`]\s*\)/);
  expect(route).not.toMatch(/from\(\s*["'`]students["'`]\s*\)/);
  expect(route).not.toMatch(/from\(\s*["'`]professors["'`]\s*\)/);

  // Nenhum identificador pessoal/sensível aparece em nenhum lugar do arquivo.
  const forbidden = [
    "cpf",
    "CPF",
    "student_id",
    "participant_id",
    "attempt_id",
    "representative_attempt_id",
    "professor_id",
    "user_id",
    "e-mail",
    "email",
    "phone",
    "telefone",
  ];
  for (const term of forbidden) {
    expect(route.toLowerCase().includes(term.toLowerCase())).toBe(false);
  }
});

test("exam-pdf route never selects or returns is_correct — the gabarito isn't even fetched from the bank", () => {
  const route = read(EXAM_PDF_ROUTE);
  const selectIndex = route.indexOf(".select(");
  expect(selectIndex).toBeGreaterThan(-1);
  const selectCall = route.slice(selectIndex, route.indexOf(")", route.indexOf(")", selectIndex) + 1) + 1);
  expect(selectCall.toLowerCase()).not.toContain("is_correct");

  const typeIndex = route.indexOf("type QuestionRow");
  expect(typeIndex).toBeGreaterThan(-1);
  const typeBlock = route.slice(typeIndex, route.indexOf("};", typeIndex) + 2);
  expect(typeBlock.toLowerCase()).not.toContain("is_correct");

  const mapIndex = route.indexOf(".map((alt) => ({");
  expect(mapIndex).toBeGreaterThan(-1);
  const mapBlock = route.slice(mapIndex, route.indexOf("})),", mapIndex) + 4);
  expect(mapBlock.toLowerCase()).not.toContain("is_correct");
});

test("exam-pdf route response shape carries only { ok, message, simulado: { title }, questions } — no extra personal fields", () => {
  const route = read(EXAM_PDF_ROUTE);
  const returnIndex = route.indexOf("return NextResponse.json({\n    ok: true,");
  expect(returnIndex).toBeGreaterThan(-1);
  const returnBlock = route.slice(returnIndex, returnIndex + 300);
  expect(returnBlock).toContain("simulado: { title: simulado.title }");
  expect(returnBlock).toContain("questions,");
});

test("shared PDF renderer: SimuladoQuestionsPdf treats student as optional and skips the watermark entirely when absent", () => {
  const renderer = read(RENDERER);
  expect(renderer).toContain("student?: PdfStudent | null");

  // A marca d'água (PdfWatermark) só é adicionada à página quando existe um
  // student real — nunca renderizada com placeholders tipo "não informado"
  // para o fluxo neutro.
  const watermarkGuardIndex = renderer.indexOf("...(student ? [");
  expect(watermarkGuardIndex).toBeGreaterThan(-1);
  const guardBlock = renderer.slice(watermarkGuardIndex, watermarkGuardIndex + 200);
  expect(guardBlock).toContain("React.createElement(PdfWatermark, { student }),");
  expect(guardBlock).toContain("React.createElement(PdfWatermark, { student, second: true }),");
  expect(guardBlock).toContain("] : [])");
});

test("downloadNeutralSimuladoPdf reuses the exact same renderer/component as the student PDF — no parallel template — with showAnswerKey: false", () => {
  const renderer = read(RENDERER);
  const neutralIndex = renderer.indexOf("export async function downloadNeutralSimuladoPdf(");
  expect(neutralIndex).toBeGreaterThan(-1);
  const neutralBlock = renderer.slice(neutralIndex, neutralIndex + 700);

  // Mesmo componente (SimuladoQuestionsPdf), sem student (neutro) e sem
  // gabarito — caderno de prova limpo.
  expect(neutralBlock).toContain("React.createElement(SimuladoQuestionsPdf, { meta, questions, student: null, showAnswerKey: false })");
  // Mesma rota de geração (pdf(...).toBlob()) e mesmo padrão de download —
  // nenhum segundo motor de renderização.
  expect(neutralBlock).toContain("await pdf(pdfDocument).toBlob();");
  expect(neutralBlock).toContain("document.createElement(\"a\");");

  // Metadata do PDF (título/autor) e nome do arquivo continuam apenas
  // institucionais — mesmo helper safeFileName do fluxo do aluno, nenhum
  // CPF/e-mail/ID pessoal no nome do arquivo.
  expect(renderer).toContain('author: "EstudoTOP Simulados"');
  expect(neutralBlock).toContain("a.download = `simulado-estudotop-${safeFileName(meta.title)}.pdf`;");
});

test("student PDF flow is untouched — downloadSimuladoResultPdf keeps sending the real student and showAnswerKey: true to the same renderer", () => {
  const renderer = read(RENDERER);
  const studentFnIndex = renderer.indexOf("export async function downloadSimuladoResultPdf(");
  expect(studentFnIndex).toBeGreaterThan(-1);
  const studentBlock = renderer.slice(studentFnIndex, studentFnIndex + 700);
  expect(studentBlock).toContain("React.createElement(SimuladoQuestionsPdf, { meta, questions, student, showAnswerKey: true })");
});

test("SimuladoQuestionsPdf only highlights the correct alternative when showAnswerKey is true — Professor/Admin caderno never shows the gabarito", () => {
  const renderer = read(RENDERER);
  expect(renderer).toContain("showAnswerKey?: boolean");
  expect(renderer).toContain("const highlightCorrect = showAnswerKey && Boolean(alternative.is_correct);");

  // Todo o estilo/marca de "correta" (destaque verde, coruja) é decidido
  // exclusivamente por `highlightCorrect`, nunca diretamente por
  // `alternative.is_correct` — garante que showAnswerKey:false neutraliza
  // 100% das alternativas, mesmo a que é a correta no banco. A única
  // ocorrência de `alternative.is_correct` no arquivo é a que alimenta
  // `highlightCorrect`.
  const occurrences = renderer.split("alternative.is_correct").length - 1;
  expect(occurrences).toBe(1);
});

test("the only visual marker for a correct alternative (OWL_MARK) is gated behind highlightCorrect — never rendered unconditionally", () => {
  const renderer = read(RENDERER);
  const occurrences = renderer.split("OWL_MARK").length - 1;
  // Declaração da constante + único uso no ternário `highlightCorrect ? OWL_MARK : ...`.
  expect(occurrences).toBe(2);
  expect(renderer).toContain("highlightCorrect ? OWL_MARK : alternative.label || String(alternativeIndex + 1)");
});

test("professor panel exposes 'Gerar prova em PDF' as a top-level, always-visible action — not tucked into a secondary menu", () => {
  const page = read(PANEL);
  const occurrences = page.split("Gerar prova em PDF").length - 1;
  // Aparece nas duas variações do cabeçalho (com e sem banner do professor),
  // sempre ao lado de "Ver como aluno" — nunca dentro de um menu à parte.
  expect(occurrences).toBe(2);
  expect(page).toContain("onClick={() => void generateExamPdf()}");
  expect(page).toContain(`fetch(\`/api/professor/events/\${id}/exam-pdf\``);
  expect(page).toContain('import("@/app/lib/pdf/simulado-result-pdf")');
  expect(page).toContain("downloadNeutralSimuladoPdf({ meta: json.simulado, questions: json.questions })");
});

test("generateExamPdf sends the professor's own session bearer token, same pattern as the other actions in this panel", () => {
  const page = read(PANEL);
  const fnIndex = page.indexOf("async function generateExamPdf()");
  expect(fnIndex).toBeGreaterThan(-1);
  const fnBlock = page.slice(fnIndex, fnIndex + 700);
  expect(fnBlock).toContain("await supabase.auth.getSession()");
  expect(fnBlock).toContain("Authorization: `Bearer ${auth.session.access_token}`");
});
