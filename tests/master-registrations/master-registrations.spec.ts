import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  assertNoUnexpectedLogicalDuplicates,
  cleanupMasterTestData,
  listNames,
  normalizeBoardLikeApp,
  normalizeEntityLikeApp,
  postJson,
  recordValidationResult,
  supabaseAdmin,
  type AttemptResult,
  type Finding,
  writeAuditReport,
} from "./helpers";

const client = supabaseAdmin();
const runId = process.env.MASTER_TEST_RUN_ID || new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const prefix = `QA Mestres ${runId}`;
const findings: Finding[] = [];

async function attemptDiscipline(request: APIRequestContext, input: string): Promise<AttemptResult> {
  const normalized = normalizeEntityLikeApp(input);
  const existingBefore = await listNames(client, "disciplines", prefix);

  findings.push({
    area: "Disciplinas",
    severity: "info",
    scenario: `pre-check disciplina "${input || "(vazio)"}"`,
    detail: `Registros de teste existentes antes da tentativa: ${existingBefore.length}.`,
  });

  const result = await postJson(request, "/api/admin/disciplines", { name: input });
  const rowsAfter = await listNames(client, "disciplines", prefix);

  return { input, normalized, ...result, rowsAfter };
}

async function attemptSubject(
  request: APIRequestContext,
  input: string,
  disciplineId: string,
): Promise<AttemptResult> {
  const normalized = normalizeEntityLikeApp(input);
  const existingBefore = await listNames(client, "subjects", prefix, disciplineId);

  findings.push({
    area: "Assuntos",
    severity: "info",
    scenario: `pre-check assunto "${input || "(vazio)"}"`,
    detail: `Registros de teste existentes antes da tentativa nessa disciplina: ${existingBefore.length}.`,
  });

  const result = await postJson(request, "/api/admin/subjects", {
    name: input,
    discipline_id: disciplineId,
  });
  const rowsAfter = await listNames(client, "subjects", prefix, disciplineId);

  return { input, normalized, ...result, rowsAfter };
}

async function attemptBoard(request: APIRequestContext, input: string): Promise<AttemptResult> {
  const normalized = normalizeBoardLikeApp(input);
  const existingBefore = await listNames(client, "exam_boards", prefix.toUpperCase());

  findings.push({
    area: "Bancas",
    severity: "info",
    scenario: `pre-check banca "${input || "(vazio)"}"`,
    detail: `Registros de teste existentes antes da tentativa: ${existingBefore.length}.`,
  });

  const result = await postJson(request, "/api/admin/exam-boards", { name: input });
  const rowsAfter = await listNames(client, "exam_boards", prefix.toUpperCase());

  return { input, normalized, ...result, rowsAfter };
}

async function getSingleId(table: string, name: string) {
  const { data, error } = await client.from(table).select("id").eq("name", name).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error(`Registro nao encontrado em ${table}: ${name}`);
  return data.id as string;
}

test.beforeAll(async () => {
  await cleanupMasterTestData(client, prefix);
});

test.afterAll(async () => {
  await cleanupMasterTestData(client, prefix);
  await writeAuditReport(findings, "audit-report-master");
});

test("disciplinas bloqueiam vazios e duplicidades logicas", async ({ request }) => {
  const base = `${prefix} Raciocínio Lógico`;
  const equivalentInputs = [
    base,
    `${prefix} Raciocinio Logico`,
    `${prefix} RACIOCÍNIO LÓGICO`,
    `${prefix} raciocínio lógico`,
    ` ${base}`,
    `${base} `,
    `${prefix} Raciocínio  Lógico`,
  ];

  const attempts = [
    { input: "", shouldCreate: false, scenario: "campo vazio" },
    { input: "   ", shouldCreate: false, scenario: "campo apenas com espacos" },
    { input: equivalentInputs[0], shouldCreate: true, scenario: "nome valido" },
    { input: equivalentInputs[0], shouldCreate: false, scenario: "repetido exatamente igual" },
    { input: equivalentInputs[2], shouldCreate: false, scenario: "repetido com caixa diferente" },
    { input: equivalentInputs[1], shouldCreate: false, scenario: "repetido com acento/sem acento" },
    { input: equivalentInputs[4], shouldCreate: false, scenario: "repetido com espaco antes" },
    { input: equivalentInputs[5], shouldCreate: false, scenario: "repetido com espaco depois" },
    { input: equivalentInputs[6], shouldCreate: false, scenario: "repetido com espaco duplo interno" },
    { input: `${prefix} Raciocínio Lógico Básico.`, shouldCreate: true, scenario: "nome com caractere especial" },
    { input: `${prefix} Raciocínio Lógico Básico`, shouldCreate: true, scenario: "nome parecido permitido" },
    { input: `${prefix} Raciocínio Lógico 2026`, shouldCreate: true, scenario: "nome com numero" },
  ];

  for (const attempt of attempts) {
    const result = await attemptDiscipline(request, attempt.input);
    recordValidationResult(findings, "Disciplinas", attempt.scenario, result, attempt.shouldCreate);
  }

  const savedNames = await listNames(client, "disciplines", prefix);
  assertNoUnexpectedLogicalDuplicates(
    "Disciplinas",
    "grupo equivalente Raciocinio Logico",
    savedNames,
    equivalentInputs,
    findings,
  );

  const cleanName = normalizeEntityLikeApp(` ${base} `);
  expect.soft(savedNames).toContain(cleanName);
  expect.soft(savedNames.some((name) => name.startsWith(" ") || name.endsWith(" "))).toBe(false);

  const failures = findings.filter((item) => item.area === "Disciplinas" && item.severity === "fail");
  await writeAuditReport(findings.filter((item) => item.area === "Disciplinas"), "audit-report-disciplinas");
  expect(failures, failures.map((item) => `${item.scenario}: ${item.detail}`).join("\n")).toEqual([]);
});

test("assuntos bloqueiam vazios e duplicidades logicas dentro da disciplina", async ({ request }) => {
  const disciplineName = `${prefix} Raciocínio Lógico Para Assuntos`;
  const otherDisciplineName = `${prefix} Direito Constitucional Para Assuntos`;

  await postJson(request, "/api/admin/disciplines", { name: disciplineName });
  await postJson(request, "/api/admin/disciplines", { name: otherDisciplineName });

  const disciplineId = await getSingleId("disciplines", normalizeEntityLikeApp(disciplineName));
  const otherDisciplineId = await getSingleId("disciplines", normalizeEntityLikeApp(otherDisciplineName));

  const base = `${prefix} Tabela Verdade Lógica`;
  const equivalentInputs = [
    base,
    `${prefix} Tabela Verdade Logica`,
    `${prefix} TABELA VERDADE LÓGICA`,
    `${prefix} tabela verdade lógica`,
    ` ${base}`,
    `${base} `,
    `${prefix} Tabela  Verdade Lógica`,
  ];

  const attempts = [
    { input: "", shouldCreate: false, scenario: "campo vazio" },
    { input: "   ", shouldCreate: false, scenario: "campo apenas com espacos" },
    { input: equivalentInputs[0], shouldCreate: true, scenario: "nome valido" },
    { input: equivalentInputs[0], shouldCreate: false, scenario: "repetido exatamente igual" },
    { input: equivalentInputs[2], shouldCreate: false, scenario: "repetido com caixa diferente" },
    { input: equivalentInputs[1], shouldCreate: false, scenario: "repetido com acento/sem acento" },
    { input: equivalentInputs[4], shouldCreate: false, scenario: "repetido com espaco antes" },
    { input: equivalentInputs[5], shouldCreate: false, scenario: "repetido com espaco depois" },
    { input: equivalentInputs[6], shouldCreate: false, scenario: "repetido com espaco duplo interno" },
    { input: `${prefix} Tabela-Verdade Lógica`, shouldCreate: true, scenario: "nome com hifen" },
    { input: `${prefix} Tabela Verdade`, shouldCreate: true, scenario: "nome menor parecido" },
    { input: `${prefix} Tabela Verdade Lógica Básica`, shouldCreate: true, scenario: "nome parecido permitido" },
  ];

  for (const attempt of attempts) {
    const result = await attemptSubject(request, attempt.input, disciplineId);
    recordValidationResult(findings, "Assuntos", attempt.scenario, result, attempt.shouldCreate);
  }

  const sameSubjectOtherDiscipline = await attemptSubject(request, base, otherDisciplineId);
  findings.push({
    area: "Assuntos",
    severity: "info",
    scenario: "mesmo assunto em disciplinas diferentes",
    detail: `Status ${sameSubjectOtherDiscipline.status}, ok=${sameSubjectOtherDiscipline.ok}. Mensagem: ${sameSubjectOtherDiscipline.message || "(sem mensagem)"}`,
  });

  const savedNames = await listNames(client, "subjects", prefix, disciplineId);
  assertNoUnexpectedLogicalDuplicates(
    "Assuntos",
    "grupo equivalente Tabela Verdade Logica dentro da disciplina",
    savedNames,
    equivalentInputs,
    findings,
  );

  const cleanName = normalizeEntityLikeApp(` ${base} `);
  expect.soft(savedNames).toContain(cleanName);
  expect.soft(savedNames.some((name) => name.startsWith(" ") || name.endsWith(" "))).toBe(false);

  const failures = findings.filter((item) => item.area === "Assuntos" && item.severity === "fail");
  await writeAuditReport(findings.filter((item) => item.area === "Assuntos"), "audit-report-assuntos");
  expect(failures, failures.map((item) => `${item.scenario}: ${item.detail}`).join("\n")).toEqual([]);
});

test("bancas bloqueiam vazios e duplicidades logicas", async ({ request }) => {
  const groups = [
    {
      scenario: "grupo FGV",
      inputs: [`${prefix} FGV`, `${prefix} fgv`, `${prefix} Fgv`, ` ${prefix} FGV`, `${prefix} FGV `],
    },
    {
      scenario: "grupo Fundacao Getulio Vargas",
      inputs: [
        `${prefix} Fundação Getulio Vargas`,
        `${prefix} Fundação Getúlio Vargas`,
        `${prefix} Fundacao Getulio Vargas`,
      ],
    },
    {
      scenario: "grupo CEBRASPE",
      inputs: [`${prefix} CEBRASPE`, `${prefix} Cebraspe`],
    },
    {
      scenario: "grupo CESPE",
      inputs: [`${prefix} CESPE`, `${prefix} Cespe`],
    },
    {
      scenario: "grupo CESPE/CEBRASPE",
      inputs: [
        `${prefix} CESPE/CEBRASPE`,
        `${prefix} cespe/cebraspe`,
        `${prefix} CESPE / CEBRASPE`,
        `${prefix} Cespe / Cebraspe`,
        ` ${prefix} CESPE / CEBRASPE`,
        `${prefix} CESPE / CEBRASPE `,
      ],
    },
    {
      scenario: "grupo VUNESP",
      inputs: [`${prefix} VUNESP`, `${prefix} Vunesp`],
    },
  ];

  for (const invalid of ["", "   "]) {
    const result = await attemptBoard(request, invalid);
    recordValidationResult(
      findings,
      "Bancas",
      invalid ? "campo apenas com espacos" : "campo vazio",
      result,
      false,
    );
  }

  for (const group of groups) {
    for (const [index, input] of group.inputs.entries()) {
      const result = await attemptBoard(request, input);
      recordValidationResult(
        findings,
        "Bancas",
        `${group.scenario} tentativa ${index + 1}`,
        result,
        index === 0,
      );
    }
  }

  const savedNames = await listNames(client, "exam_boards", prefix.toUpperCase());

  for (const group of groups) {
    assertNoUnexpectedLogicalDuplicates(
      "Bancas",
      group.scenario,
      savedNames,
      group.inputs.map((item) => normalizeBoardLikeApp(item)),
      findings,
      { slashSpaces: true },
    );
  }

  const accentSearch = await request.get(
    `/api/admin/exam-boards/search?q=${encodeURIComponent(`${prefix} Fundacao Getulio Vargas`)}`,
  );
  const accentSearchResult = await accentSearch.json();
  const accentSearchNames = ((accentSearchResult.boards || []) as Array<{ name: string }>).map((board) => board.name);
  const foundAccentEquivalent = accentSearchNames.some((name) =>
    name.includes(prefix.toUpperCase()) && name.includes("FUNDAÇÃO GETULIO VARGAS")
  );

  findings.push({
    area: "Bancas",
    severity: foundAccentEquivalent ? "pass" : "fail",
    scenario: "busca de banca sem acento encontra equivalente com acento",
    detail: `Busca por Fundacao Getulio Vargas retornou: ${accentSearchNames.join(" | ") || "(nenhum resultado)"}`,
  });

  const deleteDisciplineName = `${prefix} Disciplina Para Excluir Banca`;
  const deleteSubjectName = `${prefix} Assunto Para Excluir Banca`;
  const deleteBoardName = `${prefix} Banca Com Questao Para Excluir`;
  await postJson(request, "/api/admin/disciplines", { name: deleteDisciplineName });
  const deleteDisciplineId = await getSingleId("disciplines", normalizeEntityLikeApp(deleteDisciplineName));
  await postJson(request, "/api/admin/subjects", {
    name: deleteSubjectName,
    discipline_id: deleteDisciplineId,
  });
  const deleteSubjectId = await getSingleId("subjects", normalizeEntityLikeApp(deleteSubjectName));
  const deleteBoardResult = await postJson(request, "/api/admin/exam-boards", { name: deleteBoardName });
  const deleteBoardId = (deleteBoardResult.json.board as { id?: string } | undefined)?.id;

  if (!deleteBoardId) {
    throw new Error("Nao foi possivel criar banca para testar exclusao.");
  }

  const questionResult = await postJson(request, "/api/admin/questions", {
    question_type: "multiple_choice",
    subject_id: deleteSubjectId,
    subject_ids: [deleteSubjectId],
    exam_board_id: deleteBoardId,
    statement: `${prefix} enunciado controlado para testar exclusao de banca com migracao segura.`,
    status: "pending_review",
    alternatives: [
      { label: "A", text: "Alternativa correta controlada", is_correct: true },
      { label: "B", text: "Alternativa incorreta controlada", is_correct: false },
    ],
  });
  const questionId = questionResult.json.questionId as string | undefined;

  if (!questionId) {
    throw new Error(`Nao foi possivel criar questao para testar exclusao: ${questionResult.message}`);
  }

  const deleteResponse = await request.delete(`/api/admin/exam-boards?id=${deleteBoardId}`);
  const deleteResponseJson = await deleteResponse.json();

  const { data: movedQuestion, error: movedQuestionError } = await client
    .from("questions")
    .select("id, exam_board_id, exam_boards:exam_board_id(name)")
    .eq("id", questionId)
    .single();

  if (movedQuestionError) throw new Error(movedQuestionError.message);

  const movedBoard = Array.isArray(movedQuestion.exam_boards)
    ? movedQuestion.exam_boards[0]
    : movedQuestion.exam_boards;
  const movedToFallback =
    deleteResponse.ok() &&
    deleteResponseJson.ok &&
    movedBoard?.name &&
    normalizeBoardLikeApp(movedBoard.name) === "ANÔNIMA";

  findings.push({
    area: "Bancas",
    severity: movedToFallback ? "pass" : "fail",
    scenario: "excluir banca com questao vinculada",
    detail: movedToFallback
      ? `Questao ${questionId} movida para ${movedBoard.name}. Mensagem: ${deleteResponseJson.message}`
      : `Falha ao mover questao. Status ${deleteResponse.status()}, resposta=${JSON.stringify(deleteResponseJson)}, banca atual=${movedBoard?.name || "(sem banca)"}`,
  });

  await client.from("questions").delete().eq("id", questionId);

  expect.soft(savedNames.some((name) => name.startsWith(" ") || name.endsWith(" "))).toBe(false);

  const failures = findings.filter((item) => item.area === "Bancas" && item.severity === "fail");
  await writeAuditReport(findings.filter((item) => item.area === "Bancas"), "audit-report-bancas");
  expect(failures, failures.map((item) => `${item.scenario}: ${item.detail}`).join("\n")).toEqual([]);
});
