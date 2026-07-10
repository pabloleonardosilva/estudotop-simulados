import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  cleanupMasterTestData,
  normalizeBoardLikeApp,
  normalizeEntityLikeApp,
  postJson,
  supabaseAdmin,
  type Finding,
  writeAuditReport,
} from "../master-registrations/helpers";

type AlternativeInput = {
  label: string;
  text: string;
  is_correct: boolean;
};

const client = supabaseAdmin();
const runId = process.env.QUESTION_TEST_RUN_ID || new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const prefix = `QA Banco ${runId}`;
const findings: Finding[] = [];

const baseQuestionStatement =
  "Na lógica proposicional, considerando as afirmações abaixo, assinale a alternativa correta.";

const baseAlternatives: AlternativeInput[] = [
  { label: "A", text: 'A conjunção representa o operador "e".', is_correct: false },
  { label: "B", text: 'A disjunção representa o operador "ou".', is_correct: false },
  { label: "C", text: "A negação altera o valor lógico da proposição.", is_correct: true },
  { label: "D", text: "A condicional representa uma implicação.", is_correct: false },
  { label: "E", text: "A bicondicional representa equivalência lógica.", is_correct: false },
];

function scopedStatement(statement: string) {
  return `${prefix} - ${statement}`;
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

async function ensureSubject(name: string, disciplineId: string) {
  const normalized = normalizeEntityLikeApp(name);
  const { data: existing, error } = await client
    .from("subjects")
    .select("id, name, discipline_id")
    .eq("discipline_id", disciplineId);
  if (error) throw new Error(error.message);

  const found = (existing || []).find((item) => normalizeEntityLikeApp(item.name) === normalized);
  if (found?.id) return found.id as string;

  const { data, error: insertError } = await client
    .from("subjects")
    .insert({ name: normalized, discipline_id: disciplineId, is_active: true })
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

async function createQuestion(
  request: APIRequestContext,
  body: {
    statement: string;
    subjectId: string;
    boardId: string;
    alternatives?: AlternativeInput[];
    year?: number | null;
    difficulty?: number | null;
    status?: string;
  },
) {
  return postJson(request, "/api/admin/questions", {
    question_type: "multiple_choice",
    subject_id: body.subjectId,
    subject_ids: [body.subjectId],
    exam_board_id: body.boardId,
    statement: body.statement,
    year: body.year === undefined ? 2025 : body.year,
    difficulty_level: body.difficulty === undefined ? 3 : body.difficulty,
    status: body.status === undefined ? "pending_review" : body.status,
    alternatives: body.alternatives ?? baseAlternatives,
  });
}

async function fetchQuestion(questionId: string) {
  const { data, error } = await client
    .from("questions")
    .select(`
      id,
      statement,
      year,
      status,
      difficulty_level,
      subject_id,
      exam_board_id,
      correct_alternative_label,
      subjects:subject_id (
        id,
        name,
        discipline_id,
        disciplines:discipline_id (
          id,
          name
        )
      ),
      exam_boards:exam_board_id (
        id,
        name
      ),
      question_alternatives (
        label,
        text,
        is_correct,
        order_number
      )
    `)
    .eq("id", questionId)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function cleanupQuestionBankData() {
  const { data: questions } = await client
    .from("questions")
    .select("id")
    .ilike("statement", `${prefix}%`);

  const questionIds = (questions || []).map((item) => item.id);

  if (questionIds.length > 0) {
    await client.from("question_alternatives").delete().in("question_id", questionIds);
    await client.from("question_subjects").delete().in("question_id", questionIds);
    await client.from("questions").delete().in("id", questionIds);
  }

  await cleanupMasterTestData(client, prefix);
}

async function recordAndWrite(area: Finding["area"], reportName: string) {
  await writeAuditReport(findings.filter((item) => item.area === area), reportName);
}

let disciplineId = "";
let subjectId = "";
let boardId = "";
let secondDisciplineId = "";
let secondSubjectId = "";
let secondBoardId = "";

test.beforeAll(async () => {
  await cleanupQuestionBankData();
});

test.beforeEach(async ({ request }) => {
  disciplineId = await ensureDiscipline("Raciocínio Lógico");
  subjectId = await ensureSubject("Tabela Verdade Lógica", disciplineId);
  boardId = await ensureBoard(request, "FGV");
  secondDisciplineId = await ensureDiscipline(`${prefix} Disciplina Editada`);
  secondSubjectId = await ensureSubject(`${prefix} Assunto Editado`, secondDisciplineId);
  secondBoardId = await ensureBoard(request, `${prefix} Banca Editada`);
});

test.afterAll(async () => {
  await cleanupQuestionBankData();
});

test("cadastro normal, persistencia e preview", async ({ request, page }) => {
  const result = await createQuestion(request, {
    statement: scopedStatement(baseQuestionStatement),
    subjectId,
    boardId,
    year: 2025,
  });
  const questionId = result.json.questionId as string | undefined;

  if (!result.ok || !questionId) {
    findings.push({
      area: "Normalizacao",
      severity: "fail",
      scenario: "cadastro normal",
      detail: `Falha ao cadastrar: status ${result.status}, mensagem=${result.message}`,
    });
  } else {
    const question = await fetchQuestion(questionId);
    const alternatives = [...(question.question_alternatives || [])].sort(
      (a, b) => (a.order_number || 0) - (b.order_number || 0),
    );
    const correct = alternatives.filter((alternative) => alternative.is_correct);
    const subject = Array.isArray(question.subjects) ? question.subjects[0] : question.subjects;
    const discipline = Array.isArray(subject?.disciplines) ? subject.disciplines[0] : subject?.disciplines;
    const board = Array.isArray(question.exam_boards) ? question.exam_boards[0] : question.exam_boards;

    const checks = [
      question.statement === scopedStatement(baseQuestionStatement),
      discipline?.name === "Raciocínio Lógico",
      subject?.name === "Tabela Verdade Lógica",
      board?.name === "FGV",
      question.year === 2025,
      correct.length === 1 && correct[0].label === "C",
    ];

    findings.push({
      area: "Normalizacao",
      severity: checks.every(Boolean) ? "pass" : "fail",
      scenario: "cadastro normal persiste dados",
      detail: `disciplina=${discipline?.name}, assunto=${subject?.name}, banca=${board?.name}, ano=${question.year}, correta=${correct.map((item) => item.label).join(",") || "(nenhuma)"}`,
    });

    await page.goto(`/questoes/${questionId}/preview`);
    const content = await page.textContent("body");
    const previewBlockedByAuth = Boolean(content?.includes("Carregando ambiente"));

    if (previewBlockedByAuth) {
      findings.push({
        area: "Normalizacao",
        severity: "info",
        scenario: "preview modo aluno",
        detail: "Preview visual não foi validado porque a rota exige sessão autenticada no navegador de teste.",
      });
    } else {
      const previewHasStatement = Boolean(content?.includes(baseQuestionStatement));
      const previewHasAlternatives = baseAlternatives.every((alternative) => content?.includes(alternative.text));
      const previewLeaksCorrect = Boolean(content?.includes("Alternativa correta"));

      findings.push({
        area: "Normalizacao",
        severity: previewHasStatement && previewHasAlternatives && !previewLeaksCorrect ? "pass" : "fail",
        scenario: "preview modo aluno",
        detail: `enunciado=${previewHasStatement}, alternativas=${previewHasAlternatives}, mostraCorreta=${previewLeaksCorrect}`,
      });
    }
  }

  await recordAndWrite("Normalizacao", "audit-report-question-create-preview");
  const failures = findings.filter((item) => item.area === "Normalizacao" && item.severity === "fail");
  expect(failures, failures.map((item) => `${item.scenario}: ${item.detail}`).join("\n")).toEqual([]);
});

test("validacoes de enunciado e alternativas", async ({ request }) => {
  const longText = `${prefix} ${"Texto muito grande com conteúdo válido. ".repeat(300)}`;
  const scenarios = [
    { name: "enunciado vazio", statement: "", alternatives: baseAlternatives, shouldCreate: false },
    { name: "enunciado vazio em editor rico", statement: "<p><br></p>", alternatives: baseAlternatives, shouldCreate: false },
    { name: "enunciado apenas espaços", statement: "   ", alternatives: baseAlternatives, shouldCreate: false },
    { name: "enunciado uma letra", statement: "A", alternatives: baseAlternatives, shouldCreate: false },
    {
      name: "enunciado com acentos",
      statement: scopedStatement("Ação, Configuração, Órgão, João, Sequência"),
      alternatives: baseAlternatives,
      shouldCreate: true,
    },
    {
      name: "enunciado com caracteres especiais",
      statement: scopedStatement("@ # % & * ( ) [ ] { } / \\ < >"),
      alternatives: baseAlternatives,
      shouldCreate: true,
    },
    { name: "enunciado muito grande", statement: longText, alternatives: baseAlternatives, shouldCreate: true },
    { name: "sem alternativas", statement: scopedStatement("Questão sem alternativas suficientes."), alternatives: [], shouldCreate: false },
    {
      name: "uma alternativa",
      statement: scopedStatement("Questão com apenas uma alternativa."),
      alternatives: [{ label: "A", text: "Única", is_correct: true }],
      shouldCreate: false,
    },
    {
      name: "duas alternativas",
      statement: scopedStatement("Questão com duas alternativas."),
      alternatives: [
        { label: "A", text: "Certa", is_correct: true },
        { label: "B", text: "Errada", is_correct: false },
      ],
      shouldCreate: false,
    },
    {
      name: "sem ano",
      statement: scopedStatement("Questão sem ano obrigatório."),
      alternatives: baseAlternatives,
      year: null,
      shouldCreate: false,
    },
    {
      name: "sem dificuldade",
      statement: scopedStatement("Questão sem dificuldade obrigatória."),
      alternatives: baseAlternatives,
      difficulty: null,
      shouldCreate: false,
    },
    {
      name: "sem status",
      statement: scopedStatement("Questão sem status obrigatório."),
      alternatives: baseAlternatives,
      status: "",
      shouldCreate: false,
    },
    {
      name: "alternativa vazia",
      statement: scopedStatement("Questão com alternativa vazia."),
      alternatives: [
        { label: "A", text: "", is_correct: true },
        { label: "B", text: "Errada", is_correct: false },
      ],
      shouldCreate: false,
    },
    {
      name: "alternativa só espaços",
      statement: scopedStatement("Questão com alternativa só espaços."),
      alternatives: [
        { label: "A", text: "   ", is_correct: true },
        { label: "B", text: "Errada", is_correct: false },
      ],
      shouldCreate: false,
    },
    {
      name: "alternativas duplicadas",
      statement: scopedStatement("Questão com todas as alternativas duplicadas."),
      alternatives: ["A", "B", "C", "D", "E"].map((label) => ({
        label,
        text: "Verdadeiro",
        is_correct: label === "A",
      })),
      shouldCreate: false,
    },
  ];

  for (const scenario of scenarios) {
    const result = await createQuestion(request, {
      statement: scenario.statement,
      subjectId,
      boardId,
      alternatives: scenario.alternatives,
      year: "year" in scenario ? scenario.year : 2025,
      difficulty: "difficulty" in scenario ? scenario.difficulty : 3,
      status: "status" in scenario ? scenario.status : "pending_review",
    });
    const created = result.ok && Boolean(result.json.questionId);
    const ok = scenario.shouldCreate ? created : !created;
    const duplicateMessageOk =
      scenario.name !== "alternativas duplicadas" ||
      (String(result.message).includes("A") && String(result.message).includes("B"));

    findings.push({
      area: "Disciplinas",
      severity: ok && duplicateMessageOk ? "pass" : "fail",
      scenario: scenario.name,
      detail: `status=${result.status}, ok=${result.ok}, questionId=${String(result.json.questionId || "")}, mensagem=${result.message}`,
    });
  }

  await recordAndWrite("Disciplinas", "audit-report-question-validations");
  const failures = findings.filter((item) => item.area === "Disciplinas" && item.severity === "fail");
  expect(failures, failures.map((item) => `${item.scenario}: ${item.detail}`).join("\n")).toEqual([]);
});

test("alternativa correta e edicao persistem apos reload logico", async ({ request }) => {
  const createResult = await createQuestion(request, {
    statement: scopedStatement("Questão para testar edição completa e alternativa correta."),
    subjectId,
    boardId,
    year: 2025,
    difficulty: 2,
  });
  const questionId = createResult.json.questionId as string | undefined;
  if (!questionId) throw new Error(`Falha ao criar questão base: ${createResult.message}`);

  const noneCorrect = await request.patch(`/api/admin/questions/${questionId}`, {
    data: {
      question_type: "multiple_choice",
      subject_id: subjectId,
      subject_ids: [subjectId],
      exam_board_id: boardId,
      statement: scopedStatement("Tentativa sem correta marcada."),
      alternatives: baseAlternatives.map((alternative) => ({ ...alternative, is_correct: false })),
    },
  });

  findings.push({
    area: "Assuntos",
    severity: noneCorrect.status() >= 400 ? "pass" : "fail",
    scenario: "nenhuma correta marcada",
    detail: `status=${noneCorrect.status()}`,
  });

  const editedAlternatives = [
    { label: "A", text: "Alternativa A editada", is_correct: false },
    { label: "B", text: "Alternativa B agora correta e editada", is_correct: true },
    { label: "C", text: "Alternativa C deixou de ser correta", is_correct: false },
    { label: "D", text: "Alternativa D mantida", is_correct: false },
    { label: "E", text: "Alternativa E mantida", is_correct: false },
  ];
  const patchResult = await request.patch(`/api/admin/questions/${questionId}`, {
    data: {
      question_type: "multiple_choice",
      subject_id: secondSubjectId,
      subject_ids: [secondSubjectId],
      exam_board_id: secondBoardId,
      statement: scopedStatement("Enunciado editado com acentos: Ação e Sequência."),
      alternatives: editedAlternatives,
      year: 2026,
      difficulty_level: 4,
      status: "published",
    },
  });

  const question = await fetchQuestion(questionId);
  const alternatives = question.question_alternatives || [];
  const correct = alternatives.filter((alternative) => alternative.is_correct);

  const persisted =
    patchResult.ok() &&
    question.statement === scopedStatement("Enunciado editado com acentos: Ação e Sequência.") &&
    question.exam_board_id === secondBoardId &&
    question.subject_id === secondSubjectId &&
    question.year === 2026 &&
    question.difficulty_level === 4 &&
    correct.length === 1 &&
    correct[0].label === "B" &&
    correct[0].text === "Alternativa B agora correta e editada";

  findings.push({
    area: "Assuntos",
    severity: persisted ? "pass" : "fail",
    scenario: "edicao completa persiste dados",
    detail: `statusPatch=${patchResult.status()}, subject=${question.subject_id}, board=${question.exam_board_id}, year=${question.year}, dificuldade=${question.difficulty_level}, correta=${correct.map((item) => `${item.label}:${item.text}`).join("|")}`,
  });

  await recordAndWrite("Assuntos", "audit-report-question-editing");
  const failures = findings.filter((item) => item.area === "Assuntos" && item.severity === "fail");
  expect(failures, failures.map((item) => `${item.scenario}: ${item.detail}`).join("\n")).toEqual([]);
});

test("duplicidade por texto igual, caixa, espacos e acentos", async ({ request }) => {
  const originalStatement = scopedStatement("Questão duplicada com Ação e Sequência para comparação.");
  const createResult = await createQuestion(request, {
    statement: originalStatement,
    subjectId,
    boardId,
    year: 2025,
  });
  const questionId = createResult.json.questionId as string | undefined;
  if (!questionId) throw new Error(`Falha ao criar questão original: ${createResult.message}`);

  const duplicateScenarios = [
    { name: "texto igual", statement: originalStatement },
    { name: "texto em maiúsculas", statement: originalStatement.toUpperCase() },
    { name: "texto com espaços extras", statement: originalStatement.replace("duplicada", "duplicada     ") },
    { name: "texto sem acentos", statement: originalStatement.normalize("NFD").replace(/[\u0300-\u036f]/g, "") },
  ];

  for (const scenario of duplicateScenarios) {
    const result = await createQuestion(request, {
      statement: scenario.statement,
      subjectId,
      boardId,
      year: 2025,
    });
    const blocked = result.status === 409 || result.message.toLowerCase().includes("existe");

    findings.push({
      area: "Bancas",
      severity: blocked ? "pass" : "fail",
      scenario: scenario.name,
      detail: `status=${result.status}, ok=${result.ok}, mensagem=${result.message}`,
    });
  }

  await recordAndWrite("Bancas", "audit-report-question-duplicates");
  const failures = findings.filter((item) => item.area === "Bancas" && item.severity === "fail");
  expect(failures, failures.map((item) => `${item.scenario}: ${item.detail}`).join("\n")).toEqual([]);
});
