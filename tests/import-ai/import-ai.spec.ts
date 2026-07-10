import { expect, test, type APIRequestContext } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import {
  normalizeBoardLikeApp,
  normalizeEntityLikeApp,
  postJson,
  supabaseAdmin,
  type Finding,
} from "../master-registrations/helpers";

type ImportedAlternative = {
  label: string;
  text: string;
  is_correct: boolean;
};

type ImportedQuestion = {
  temp_id?: string;
  statement: string;
  question_type: "multiple_choice" | "true_false";
  board_name: string;
  year: number | null;
  difficulty_level?: number | null;
  explanation_text?: string;
  alternatives: ImportedAlternative[];
  is_duplicate?: boolean;
};

const client = supabaseAdmin();
const runId = process.env.IMPORT_AI_TEST_RUN_ID || new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const prefix = `QA Import IA ${runId}`;
const findings: Finding[] = [];

let disciplineId = "";
let subjectId = "";
let boardId = "";

function scoped(value: string) {
  return `${prefix} - ${value}`;
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function alternatives(labels: string[] = ["A", "B", "C", "D", "E"], correct = "C") {
  return labels.map((label) => ({
    label,
    text: scoped(`Texto da alternativa ${label} com Ação e Configuração`),
    is_correct: label === correct,
  }));
}

async function writeImportReport(reportName = "audit-report-import-ai") {
  const outputDir = path.join(process.cwd(), "test-results", "import-ai");
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, `${reportName}.json`),
    JSON.stringify({ generatedAt: new Date().toISOString(), findings }, null, 2),
  );
}

async function ensureDiscipline(name: string) {
  const normalized = normalizeEntityLikeApp(name);
  const { data: existing, error } = await client.from("disciplines").select("id, name");
  if (error) throw new Error(error.message);
  const found = (existing || []).find((item) => normalizeEntityLikeApp(item.name) === normalized);
  if (found?.id) return found.id as string;

  const { data, error: insertError } = await client
    .from("disciplines")
    .insert({ name: normalized, is_active: true })
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message);
  return data.id as string;
}

async function ensureSubject(name: string, discipline: string) {
  const normalized = normalizeEntityLikeApp(name);
  const { data: existing, error } = await client
    .from("subjects")
    .select("id, name, discipline_id")
    .eq("discipline_id", discipline);
  if (error) throw new Error(error.message);
  const found = (existing || []).find((item) => normalizeEntityLikeApp(item.name) === normalized);
  if (found?.id) return found.id as string;

  const { data, error: insertError } = await client
    .from("subjects")
    .insert({ name: normalized, discipline_id: discipline, is_active: true })
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message);
  return data.id as string;
}

async function ensureBoard(request: APIRequestContext, name: string) {
  const normalized = normalizeBoardLikeApp(name);
  const { data: existing, error } = await client.from("exam_boards").select("id, name");
  if (error) throw new Error(error.message);
  const found = (existing || []).find((item) => normalizeBoardLikeApp(item.name) === normalized);
  if (found?.id) return found.id as string;

  const result = await postJson(request, "/api/admin/exam-boards", { name });
  const board = result.json.board as { id?: string } | undefined;
  if (!board?.id) throw new Error(`Nao foi possivel criar banca ${name}: ${result.message}`);
  return board.id;
}

async function cleanupImportData() {
  const { data: questions } = await client.from("questions").select("id").ilike("statement", `${prefix}%`);
  const ids = (questions || []).map((item) => item.id);

  if (ids.length) {
    await client.from("question_alternatives").delete().in("question_id", ids);
    await client.from("question_subjects").delete().in("question_id", ids);
    await client.from("questions").delete().in("id", ids);
  }
}

async function analyzeBatch(request: APIRequestContext, text: string, blocks?: string[]) {
  return postJson(request, "/api/admin/questions/import/analyze-batch", {
    text,
    blocks,
    subject_id: subjectId,
    subject_ids: [subjectId],
    year: 2025,
    batch_index: 0,
  });
}

async function saveImport(request: APIRequestContext, questions: ImportedQuestion[]) {
  return postJson(request, "/api/admin/questions/import/save", {
    questions,
    subject_id: subjectId,
    subject_ids: [subjectId],
    year: 2025,
  });
}

function questionBlock(index: number, marker: string) {
  return [
    `Q${1000 + index}`,
    "Ano: 2025 Banca: FGV Órgão: Prefeitura Prova: Analista",
    scoped(`Questão limpa ${index}. Ação, Configuração, Órgão e Sequência devem ser preservados.`),
    "Com base no texto acima, assinale a alternativa correta.",
    marker === "lines"
      ? ["Alternativas", "A", scoped(`Alternativa A ${index}`), "B", scoped(`Alternativa B ${index}`), "C", scoped(`Alternativa C ${index}`), "D", scoped(`Alternativa D ${index}`), "E", scoped(`Alternativa E ${index}`)].join("\n")
      : ["A", "B", "C", "D", "E"].map((label) => `${label}${marker} ${scoped(`Alternativa ${label} ${index}`)}`).join("\n"),
    "Gabarito: C",
  ].join("\n");
}

function record(scenario: string, passed: boolean, detail: string) {
  findings.push({
    area: "Normalizacao",
    severity: passed ? "pass" : "fail",
    scenario,
    detail,
  });
}

test.beforeAll(async ({ request }) => {
  disciplineId = await ensureDiscipline("Raciocínio Lógico");
  subjectId = await ensureSubject("Tabela Verdade Lógica", disciplineId);
  boardId = await ensureBoard(request, "FGV");
  await cleanupImportData();
});

test.setTimeout(180_000);

test.afterAll(async () => {
  await cleanupImportData();
  await writeImportReport();
});

test("importacao com texto limpo e texto sujo do QConcursos", async ({ request }) => {
  const cleanText = [questionBlock(1, ")"), questionBlock(2, "."), questionBlock(3, ":")].join("\n\n");
  const cleanResult = await analyzeBatch(request, cleanText);
  const cleanQuestions = (cleanResult.json.questions || []) as ImportedQuestion[];
  const cleanPassed =
    cleanResult.ok &&
    cleanQuestions.length === 3 &&
    cleanQuestions.every((question) => question.alternatives?.length === 5 && question.year === 2025 && normalizeText(question.board_name) === "fgv") &&
    cleanQuestions.every((question) => question.statement.includes("Com base no texto acima"));

  record(
    "texto limpo com 3 questoes",
    cleanPassed,
    `status=${cleanResult.status}, count=${cleanQuestions.length}, detalhes=${cleanQuestions.map((q) => `${q.year}/${q.board_name}/${q.alternatives?.length}`).join("|")}, mensagem=${cleanResult.message}`,
  );

  const dirtyText = [
    "Mentoria Qconcursos",
    "Home",
    "Concursos Públicos",
    "Questões",
    "Minhas Questões",
    "Nome do novo filtro",
    "Palavra Chave",
    "Foram encontradas 102 questões",
    questionBlock(4, ")"),
    "Comentários",
    "Estatísticas",
    "Responder",
    "Salvar",
    "Compartilhar",
    "Filtros",
    "Rodapé",
    "Links",
  ].join("\n");
  const dirtyResult = await analyzeBatch(request, dirtyText);
  const dirtyQuestion = ((dirtyResult.json.questions || []) as ImportedQuestion[])[0];
  const junk = ["Mentoria Qconcursos", "Home", "Concursos Públicos", "Comentários", "Estatísticas", "Responder", "Rodapé", "Links"];
  const dirtyPassed =
    dirtyResult.ok &&
    Boolean(dirtyQuestion) &&
    junk.every((item) => !dirtyQuestion.statement.includes(item)) &&
    dirtyQuestion.statement.includes("Questão limpa 4") &&
    dirtyQuestion.alternatives.length === 5 &&
    dirtyQuestion.year === 2025;

  record(
    "texto sujo QConcursos",
    dirtyPassed,
    `status=${dirtyResult.status}, statement="${dirtyQuestion?.statement?.slice(0, 180) || ""}", alternatives=${dirtyQuestion?.alternatives?.length || 0}, mensagem=${dirtyResult.message}`,
  );

  await writeImportReport();
  const failures = findings.filter((item) => item.scenario.includes("texto") && item.severity === "fail");
  expect(failures, failures.map((item) => `${item.scenario}: ${item.detail}`).join("\n")).toEqual([]);
});

test("formatos de alternativas, frases finais e acentos", async ({ request }) => {
  const markers = ["lines", ")", ".", " -", ":"];
  const formatResults = [];

  for (const [index, marker] of markers.entries()) {
    const result = await analyzeBatch(request, questionBlock(index + 10, marker), [questionBlock(index + 10, marker)]);
    const question = ((result.json.questions || []) as ImportedQuestion[])[0];
    const passed =
      result.ok &&
      question?.alternatives?.length === 5 &&
      question.alternatives.every((alternative, altIndex) => alternative.label === ["A", "B", "C", "D", "E"][altIndex]) &&
      !/\nA\s*[).:\-]/.test(question.statement);
    formatResults.push({ marker, passed, status: result.status, count: question?.alternatives?.length || 0, statement: question?.statement || "" });
  }

  record(
    "formatos A/B/C/D/E",
    formatResults.every((item) => item.passed),
    formatResults.map((item) => `${item.marker}: status=${item.status}, alternatives=${item.count}`).join(" | "),
  );

  const endings = [
    "Assinale a resposta correta.",
    "A sequência correta é:",
    "Analise os itens a seguir.",
    "Considere as afirmativas.",
    "Julgue o item.",
    "É correto afirmar que:",
    "Está correto o que se afirma em:",
    "Com base no texto acima, assinale a alternativa correta.",
    "Considerando as informações apresentadas, assinale a opção correta.",
  ];
  const phraseBlocks = endings.map((ending, index) =>
    [
      `Q${2000 + index}`,
      "Ano: 2025 Banca: FGV Órgão: Câmara Prova: Técnico",
      scoped(`Frase final ${index}. ${ending}`),
      ["A", "B", "C", "D", "E"].map((label) => `${label}) ${scoped(`Opção ${label} ${index}`)}`).join("\n"),
      "Gabarito: C",
    ].join("\n"),
  );
  const phraseResult = await analyzeBatch(request, phraseBlocks.join("\n\n"), phraseBlocks);
  const phraseQuestions = (phraseResult.json.questions || []) as ImportedQuestion[];
  const phrasesPassed =
    phraseResult.ok &&
    phraseQuestions.length === endings.length &&
    endings.every((ending) => phraseQuestions.some((question) => question.statement.includes(ending)));

  record(
    "frases que nao podem ser cortadas",
    phrasesPassed,
    `status=${phraseResult.status}, count=${phraseQuestions.length}, preservadas=${endings.filter((ending) => phraseQuestions.some((question) => question.statement.includes(ending))).length}`,
  );

  const accentText = [
    "Q3001",
    "Ano: 2025 Banca: FGV Órgão: Secretaria Prova: Auditor",
    scoped("Ação Configuração Órgão Usuário Sequência Informática Raciocínio Lógico Tabela Verdade Lógica “aspas curvas” – travessão ç ã õ é í ó ú."),
    "A) Ação e Configuração",
    "B) Órgão e Usuário",
    "C) Sequência e Informática",
    "D) Raciocínio Lógico",
    "E) Tabela Verdade Lógica",
    "Gabarito: C",
  ].join("\n");
  const accentResult = await analyzeBatch(request, accentText, [accentText]);
  const accentQuestion = ((accentResult.json.questions || []) as ImportedQuestion[])[0];
  const accentExpected = ["Ação", "Configuração", "Órgão", "Usuário", "Sequência", "Informática", "Raciocínio Lógico", "Tabela Verdade Lógica", "ç", "ã", "õ", "é", "í", "ó", "ú"];
  const accentPassed =
    accentResult.ok &&
    Boolean(accentQuestion) &&
    accentExpected.every((item) => `${accentQuestion.statement} ${accentQuestion.alternatives.map((alt) => alt.text).join(" ")}`.includes(item)) &&
    !`${accentQuestion.statement} ${accentQuestion.alternatives.map((alt) => alt.text).join(" ")}`.includes("Ã");

  record(
    "acentos e caracteres",
    accentPassed,
    `status=${accentResult.status}, statement="${accentQuestion?.statement?.slice(0, 160) || ""}"`,
  );

  await writeImportReport();
  const failures = findings.filter((item) =>
    ["formatos A/B/C/D/E", "frases que nao podem ser cortadas", "acentos e caracteres"].includes(item.scenario) && item.severity === "fail",
  );
  expect(failures, failures.map((item) => `${item.scenario}: ${item.detail}`).join("\n")).toEqual([]);
});

test("duplicidade na importacao", async ({ request }) => {
  const baseStatement = scoped("Duplicidade importação: Na lógica proposicional, assinale a alternativa correta.");
  const seed = await postJson(request, "/api/admin/questions", {
    question_type: "multiple_choice",
    subject_id: subjectId,
    subject_ids: [subjectId],
    exam_board_id: boardId,
    statement: baseStatement,
    year: 2025,
    difficulty_level: 3,
    status: "pending_review",
    alternatives: alternatives(),
  });

  const variants = [
    baseStatement,
    baseStatement.toUpperCase(),
    baseStatement.replace(/\s+/g, "   "),
    baseStatement.replace(",", ",\n"),
    baseStatement.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
  ];
  const blocks = variants.map((statement, index) =>
    [
      `Q40${index}`,
      "Ano: 2025 Banca: FGV Órgão: Tribunal Prova: Analista",
      statement,
      ["A", "B", "C", "D", "E"].map((label) => `${label}) ${scoped(`Texto da alternativa ${label} com Ação e Configuração`)}`).join("\n"),
      "Gabarito: C",
    ].join("\n"),
  );

  const result = await analyzeBatch(request, blocks.join("\n\n"), blocks);
  const questions = (result.json.questions || []) as ImportedQuestion[];
  const markedDuplicates = questions.filter((question) => question.is_duplicate).length;
  const preservedText = questions.every((question, index) => normalizeText(question.statement).includes(normalizeText(variants[index]).slice(0, 40)));
  const saveDuplicate = await saveImport(request, questions);

  const passed =
    seed.ok &&
    result.ok &&
    questions.length === variants.length &&
    markedDuplicates === variants.length &&
    preservedText &&
    saveDuplicate.ok &&
    Number(saveDuplicate.json.saved_count || 0) === 0 &&
    Number(saveDuplicate.json.ignored_count || 0) === variants.length;

  record(
    "duplicidade na importacao",
    passed,
    `seed=${seed.status}/${seed.ok}, analyze=${result.status}/${questions.length}, duplicadas=${markedDuplicates}, save=${saveDuplicate.status}, saved=${saveDuplicate.json.saved_count}, ignored=${saveDuplicate.json.ignored_count}`,
  );

  await writeImportReport();
  const failures = findings.filter((item) => item.scenario === "duplicidade na importacao" && item.severity === "fail");
  expect(failures, failures.map((item) => item.detail).join("\n")).toEqual([]);
});

test("envio individual, lote e clique duplo para revisao", async ({ request }) => {
  const individual: ImportedQuestion = {
    temp_id: "individual-1",
    statement: scoped("Envio individual para revisão preserva metadados."),
    question_type: "multiple_choice",
    board_name: "FGV",
    year: 2025,
    difficulty_level: 3,
    explanation_text: "Explicação com Ação, Órgão e Sequência.",
    alternatives: alternatives(["A", "B", "C", "D", "E"], "C"),
  };

  const individualResult = await saveImport(request, [individual]);
  const individualId = ((individualResult.json.ids || []) as string[])[0];
  const { data: individualRow } = individualId
    ? await client
        .from("questions")
        .select("id, statement, year, status, exam_boards:exam_board_id(name), question_alternatives(label, text, is_correct)")
        .eq("id", individualId)
        .single()
    : { data: null };
  const individualPassed =
    individualResult.ok &&
    individualResult.json.saved_count === 1 &&
    individualRow?.status === "pending_review" &&
    individualRow?.year === 2025 &&
    individualRow?.question_alternatives?.length === 5 &&
    individualRow?.question_alternatives?.some((alt: { label: string; is_correct: boolean }) => alt.label === "C" && alt.is_correct);

  record(
    "envio individual para revisao",
    individualPassed,
    `status=${individualResult.status}, saved=${individualResult.json.saved_count}, id=${individualId || ""}`,
  );

  const batchStatements = [
    "Envio lote algebra proposicional com conectivos compostos.",
    "Envio lote contagem combinatoria com arranjos simples.",
    "Envio lote tabela verdade com condicional composta.",
    "Envio lote diagramas logicos com conjuntos disjuntos.",
    "Envio lote equivalencias logicas com negacao de proposicoes.",
  ];
  const batch = batchStatements.map((statement, index) => ({
    temp_id: `batch-${index}`,
    statement: scoped(statement),
    question_type: "multiple_choice" as const,
    board_name: "FGV",
    year: 2025,
    difficulty_level: 3,
    explanation_text: "",
    alternatives: alternatives(["A", "B", "C", "D", "E"], "C"),
  }));
  const selected = [batch[0], batch[2], batch[4]];
  const batchResult = await saveImport(request, selected);
  const { count: batchSavedCount } = await client
    .from("questions")
    .select("id", { count: "exact", head: true })
    .like("statement", `${prefix} - Envio lote%`);
  const batchPassed = batchResult.ok && batchResult.json.saved_count === 3 && batchSavedCount === 3;

  record(
    "envio em lote selecionado",
    batchPassed,
    `status=${batchResult.status}, saved=${batchResult.json.saved_count}, banco=${batchSavedCount}`,
  );

  const doubleQuestion: ImportedQuestion = {
    temp_id: "double-click-1",
    statement: scoped("Clique duplo não deve criar duas cópias."),
    question_type: "multiple_choice",
    board_name: "FGV",
    year: 2025,
    difficulty_level: 3,
    explanation_text: "",
    alternatives: alternatives(["A", "B", "C", "D", "E"], "C"),
  };

  const [firstDouble, secondDouble] = await Promise.all([
    saveImport(request, [doubleQuestion]),
    saveImport(request, [doubleQuestion]),
  ]);
  const { count: doubleCount } = await client
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("statement", doubleQuestion.statement);
  const doublePassed =
    firstDouble.ok &&
    secondDouble.ok &&
    doubleCount === 1 &&
    Number(firstDouble.json.saved_count || 0) + Number(secondDouble.json.saved_count || 0) === 1;

  record(
    "clique duplo envio revisao",
    doublePassed,
    `first saved=${firstDouble.json.saved_count}/ignored=${firstDouble.json.ignored_count}, second saved=${secondDouble.json.saved_count}/ignored=${secondDouble.json.ignored_count}, banco=${doubleCount}`,
  );

  await writeImportReport();
  const failures = findings.filter((item) =>
    ["envio individual para revisao", "envio em lote selecionado", "clique duplo envio revisao"].includes(item.scenario) &&
    item.severity === "fail",
  );
  expect(failures, failures.map((item) => `${item.scenario}: ${item.detail}`).join("\n")).toEqual([]);
});
