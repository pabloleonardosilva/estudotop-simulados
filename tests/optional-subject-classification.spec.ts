/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

// Disciplina obrigatória, Assunto opcional, Tópicos diretos da Disciplina.
// Executa o código real (transpilado) com Supabase em memória: nenhum banco é tocado.

type Row = Record<string, any>;

// Somente bibliotecas puras são carregadas de verdade; demais imports viram stubs.
const PURE_MODULE_PREFIXES = ["@/lib/utils/", "@/lib/questions/", "@/lib/topicDifficulty", "@/app/lib/utils/"];

function loadModule(file: string, overrides: Record<string, unknown>, cache = new Map<string, any>()): { exports: any; context: any } {
  const source = fs.readFileSync(file, "utf8");
  const code = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const moduleRecord = { exports: {} as any };
  const context: any = {
    module: moduleRecord,
    exports: moduleRecord.exports,
    Request, Response, URL, console, setTimeout, clearTimeout,
    require: (name: string) => {
      if (name in overrides) return overrides[name];
      if (PURE_MODULE_PREFIXES.some((prefix) => name.startsWith(prefix))) {
        const base = name.slice(2);
        const resolved = [`${base}.ts`, `${base}.tsx`].find((candidate) => fs.existsSync(candidate));
        if (!resolved) return {};
        if (!cache.has(resolved)) cache.set(resolved, loadModule(resolved, overrides, cache).exports);
        return cache.get(resolved);
      }
      return {};
    },
  };
  vm.runInNewContext(code, context, { filename: path.basename(file) });
  return { exports: moduleRecord.exports, context };
}

function database(tables: Record<string, Row[]>) {
  const writes: Array<{ table: string; op: string; payload?: any; filters: Array<[string, string, unknown]> }> = [];
  let idSeq = 0;
  const db = {
    writes,
    tables,
    rpc: async () => ({ data: [{ affected_count: 0 }], error: null }),
    from(table: string) {
      const filters: Array<[string, string, unknown]> = [];
      let op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
      let payload: any = null;
      let headCount = false;
      const matches = (row: Row) => filters.every(([kind, key, value]) => {
        if (kind === "eq") return row[key] === value;
        if (kind === "neq") return row[key] !== value;
        if (kind === "is") return (row[key] ?? null) === value;
        if (kind === "in") return (value as unknown[]).includes(row[key]);
        return true;
      });
      const run = () => {
        const rows = tables[table] || (tables[table] = []);
        if (op === "insert") {
          const inserted = (Array.isArray(payload) ? payload : [payload]).map((item: Row) => ({ id: `${table}-${++idSeq}`, ...item }));
          rows.push(...inserted);
          writes.push({ table, op, payload, filters: [...filters] });
          return { data: inserted, error: null, count: null };
        }
        if (op === "update") {
          const target = rows.filter(matches);
          target.forEach((row) => Object.assign(row, payload));
          writes.push({ table, op, payload, filters: [...filters] });
          return { data: target, error: null, count: null };
        }
        if (op === "delete") {
          const keep = rows.filter((row) => !matches(row));
          writes.push({ table, op, filters: [...filters] });
          tables[table] = keep;
          return { data: null, error: null, count: null };
        }
        const data = rows.filter(matches);
        return { data: headCount ? null : data, error: null, count: data.length };
      };
      const q: any = {
        select(_columns?: string, options?: { count?: string; head?: boolean }) { if (options?.head) headCount = true; return q; },
        insert(value: any) { op = "insert"; payload = value; return q; },
        upsert(value: any) { op = "upsert"; payload = value; return q; },
        update(value: any) { op = "update"; payload = value; return q; },
        delete() { op = "delete"; return q; },
        eq(key: string, value: unknown) { filters.push(["eq", key, value]); return q; },
        neq(key: string, value: unknown) { filters.push(["neq", key, value]); return q; },
        is(key: string, value: unknown) { filters.push(["is", key, value]); return q; },
        in(key: string, value: unknown[]) { filters.push(["in", key, value]); return q; },
        order() { return q; },
        range() { return q; },
        limit() { return q; },
        single: async () => { const result = run(); return { data: (result.data || [])[0] || null, error: null }; },
        maybeSingle: async () => { const result = run(); return { data: (result.data || [])[0] || null, error: null }; },
        then: (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) => Promise.resolve().then(run).then(resolve, reject),
      };
      return q;
    },
  };
  return db;
}

const INFO = "disc-informatica";
const DIREITO = "disc-direito";
const WINDOWS = "subj-windows";
const REDES = "subj-redes";
const CONSTITUCIONALISMO = "subj-constitucionalismo";

function baseTables(): Record<string, Row[]> {
  return {
    disciplines: [{ id: INFO, name: "Informática" }, { id: DIREITO, name: "Direito Constitucional" }],
    subjects: [
      { id: WINDOWS, name: "Windows", discipline_id: INFO },
      { id: REDES, name: "Redes", discipline_id: INFO },
      { id: CONSTITUCIONALISMO, name: "Constitucionalismo", discipline_id: DIREITO },
    ],
    topics: [
      { id: "t-win-atalhos", name: "Atalhos", subject_id: WINDOWS, discipline_id: INFO },
      { id: "t-dir-adi", name: "ADI", subject_id: null, discipline_id: DIREITO },
      { id: "t-con-poder", name: "Poder Constituinte", subject_id: CONSTITUCIONALISMO, discipline_id: DIREITO },
    ],
    questions: [],
    question_subjects: [],
  };
}

function modules(db: any) {
  return {
    "next/server": { NextResponse: Response },
    "@/lib/server/supabaseAdmin": { createSupabaseAdminClient: () => db },
    "@/lib/server/authGuard": { requireAdmin: async () => ({ id: "admin-1", full_name: "Admin" }) },
    "@/app/lib/server/auditLogger": { logAdminAction: async () => {}, logSystemError: async () => {} },
    "@/lib/server/simuladoQuestionReprocessing": { reprocessAfterAnswerKeyChange: async () => {} },
    "node:crypto": { randomUUID: () => "revision-1" },
  };
}

function jsonRequest(url: string, method: string, body: unknown) {
  return new Request(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

test.describe("classificação: resolveQuestionDiscipline", () => {
  const { exports: lib } = loadModule("lib/questions/question-subjects.ts", {});

  test("V01/S03 — sem Disciplina e sem Assunto é inválido", async () => {
    const result = await lib.resolveQuestionDiscipline({ supabase: database(baseTables()), disciplineId: null, subjectIds: [] });
    expect(result).toEqual({ ok: false, message: "Selecione a disciplina da questão." });
  });

  test("V03/S01 — Disciplina sem Assunto é válida", async () => {
    const result = await lib.resolveQuestionDiscipline({ supabase: database(baseTables()), disciplineId: DIREITO, subjectIds: [] });
    expect(result).toEqual({ ok: true, disciplineId: DIREITO });
  });

  test("S02 — com Assunto a Disciplina é derivada (fluxo antigo sem discipline_id)", async () => {
    const result = await lib.resolveQuestionDiscipline({ supabase: database(baseTables()), subjectIds: [WINDOWS, REDES] });
    expect(result).toEqual({ ok: true, disciplineId: INFO });
  });

  test("V05 — Assunto de outra Disciplina é rejeitado", async () => {
    const result = await lib.resolveQuestionDiscipline({ supabase: database(baseTables()), disciplineId: DIREITO, subjectIds: [WINDOWS] });
    expect(result.ok).toBe(false);
  });

  test("multiassunto de Disciplinas diferentes é rejeitado", async () => {
    const result = await lib.resolveQuestionDiscipline({ supabase: database(baseTables()), subjectIds: [WINDOWS, CONSTITUCIONALISMO] });
    expect(result).toEqual({ ok: false, message: "Os assuntos da questão devem pertencer a uma mesma disciplina." });
  });

  test("Disciplina inexistente é rejeitada", async () => {
    const result = await lib.resolveQuestionDiscipline({ supabase: database(baseTables()), disciplineId: "nao-existe", subjectIds: [] });
    expect(result.ok).toBe(false);
  });

  test("getQuestionDisciplineIds usa a Disciplina própria e formatQuestionSubjects não inventa 'Sem assunto'", () => {
    expect(lib.getQuestionDisciplineIds({ discipline_id: DIREITO, subjects: null })).toEqual([DIREITO]);
    expect(lib.formatQuestionSubjects({ subjects: null, question_subjects: [] })).toBe("");
  });
});

test.describe("API de tópicos", () => {
  function topicsRoute(db: any) {
    return loadModule("app/api/admin/topics/route.ts", modules(db)).exports;
  }

  test("N01 — cadastra tópico direto da Disciplina (subject_id nulo)", async () => {
    const db = database(baseTables());
    const response = await topicsRoute(db).POST(jsonRequest("http://x/api/admin/topics", "POST", { name: "Controle concentrado", discipline_id: DIREITO, subject_id: null }));
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body.topic.subject_id).toBeNull();
    expect(body.topic.discipline_id).toBe(DIREITO);
  });

  test("tópico com Assunto recebe a Disciplina do Assunto e rejeita Disciplina divergente", async () => {
    const db = database(baseTables());
    const ok = await topicsRoute(db).POST(jsonRequest("http://x/api/admin/topics", "POST", { name: "Pastas", subject_id: WINDOWS }));
    expect(ok.status).toBe(201);
    expect((await ok.json()).topic.discipline_id).toBe(INFO);
    const divergent = await topicsRoute(db).POST(jsonRequest("http://x/api/admin/topics", "POST", { name: "Pastas 2", subject_id: WINDOWS, discipline_id: DIREITO }));
    expect(divergent.status).toBe(400);
  });

  test("sem Disciplina e sem Assunto o cadastro é recusado", async () => {
    const response = await topicsRoute(database(baseTables())).POST(jsonRequest("http://x/api/admin/topics", "POST", { name: "Solto" }));
    expect(response.status).toBe(400);
  });

  test("duplicidade: direto na mesma Disciplina bloqueia; mesmo nome em Assunto não conflita", async () => {
    const db = database(baseTables());
    const duplicate = await topicsRoute(db).POST(jsonRequest("http://x/api/admin/topics", "POST", { name: "adi", discipline_id: DIREITO }));
    expect(duplicate.status).toBe(409);
    const inSubject = await topicsRoute(db).POST(jsonRequest("http://x/api/admin/topics", "POST", { name: "ADI", subject_id: CONSTITUCIONALISMO }));
    expect(inSubject.status).toBe(201);
  });

  test("GET com direct=true lista somente tópicos diretos da Disciplina", async () => {
    const response = await topicsRoute(database(baseTables())).GET(new Request(`http://x/api/admin/topics?discipline_id=${DIREITO}&direct=true`));
    const body = await response.json();
    expect(body.topics.map((topic: Row) => topic.id)).toEqual(["t-dir-adi"]);
  });
});

test.describe("PATCH de questão: Tópicos da classificação anterior", () => {
  function questionRow(overrides: Row = {}) {
    return {
      id: "q-1", code: "ET1", correct_alternative_label: "A", subject_id: WINDOWS, discipline_id: INFO,
      evaluated_topics: ["Atalhos"], ...overrides,
    };
  }
  function body(overrides: Row = {}) {
    return {
      statement: "Enunciado suficientemente longo para validar.", exam_board_id: "board-1", status: "pending_review",
      question_type: "multiple_choice", evaluated_topics: ["Atalhos"],
      alternatives: ["A", "B", "C", "D"].map((label) => ({ label, text: `Texto ${label}`, is_correct: label === "A" })),
      ...overrides,
    };
  }
  function patch(db: any, payload: Row) {
    const route = loadModule("app/api/admin/questions/[id]/route.ts", modules(db)).exports;
    return route.PATCH(jsonRequest("http://x/api/admin/questions/q-1", "PATCH", payload), { params: Promise.resolve({ id: "q-1" }) });
  }

  test("C06/S04 — trocar Disciplina mantendo tópico antigo inexistente no novo catálogo é recusado (sem remapear)", async () => {
    const tables = baseTables();
    tables.questions.push(questionRow());
    const db = database(tables);
    const response = await patch(db, body({ discipline_id: DIREITO, subject_ids: [] }));
    const result = await response.json();
    expect(response.status).toBe(400);
    expect(result.message).toContain("classificação anterior");
    expect(db.writes.some((write) => write.table === "questions" && write.op === "update")).toBe(false);
  });

  test("S01 — salvar Disciplina + tópico direto sem Assunto grava discipline_id e subject_id nulo", async () => {
    const tables = baseTables();
    tables.questions.push(questionRow({ subject_id: null, discipline_id: DIREITO, evaluated_topics: ["ADI"] }));
    const db = database(tables);
    const response = await patch(db, body({ discipline_id: DIREITO, subject_ids: [], evaluated_topics: ["ADI"] }));
    expect(response.status).toBe(200);
    const saved = tables.questions.find((row) => row.id === "q-1");
    expect(saved?.discipline_id).toBe(DIREITO);
    expect(saved?.subject_id).toBeNull();
  });

  test("tópico reselecionado que existe no novo catálogo é aceito", async () => {
    const tables = baseTables();
    tables.questions.push(questionRow({ subject_id: null, discipline_id: DIREITO, evaluated_topics: ["ADI"] }));
    tables.topics.push({ id: "t-con-adi", name: "ADI", subject_id: CONSTITUCIONALISMO, discipline_id: DIREITO });
    const response = await patch(database(tables), body({ discipline_id: DIREITO, subject_ids: [CONSTITUCIONALISMO], evaluated_topics: ["ADI"] }));
    expect(response.status).toBe(200);
  });

  test("V02/S04 — sem tópico continua bloqueado; V01 — sem Disciplina continua bloqueado", async () => {
    const tables = baseTables();
    tables.questions.push(questionRow());
    expect((await patch(database(tables), body({ discipline_id: INFO, subject_ids: [WINDOWS], evaluated_topics: [] }))).status).toBe(400);
    expect((await patch(database(tables), body({ subject_ids: [] }))).status).toBe(400);
  });
});

test.describe("edição em massa", () => {
  function bulk(db: any, payload: Row) {
    const route = loadModule("app/api/admin/questions/bulk/route.ts", modules(db)).exports;
    return route.PATCH(jsonRequest("http://x/api/admin/questions/bulk", "PATCH", payload));
  }
  function tables() {
    const t = baseTables();
    t.questions.push(
      { id: "q-win", subject_id: WINDOWS, discipline_id: INFO, evaluated_topics: ["Atalhos"], status: "published" },
      { id: "q-red", subject_id: REDES, discipline_id: INFO, evaluated_topics: ["DNS"], status: "published" },
    );
    return t;
  }

  test("B02/B05 — trocar Assunto limpa tópicos só das questões cujo Assunto principal muda", async () => {
    const t = tables();
    const response = await bulk(database(t), { ids: ["q-win", "q-red"], metadata: { subject_ids: [WINDOWS] } });
    const result = await response.json();
    expect(result.topicsClearedIds).toEqual(["q-red"]);
    expect(t.questions.find((q) => q.id === "q-win")?.evaluated_topics).toEqual(["Atalhos"]);
    expect(t.questions.find((q) => q.id === "q-red")?.evaluated_topics).toEqual([]);
    expect(t.questions.find((q) => q.id === "q-red")?.subject_id).toBe(WINDOWS);
  });

  test("B04 — trocar Disciplina limpa Assuntos e Tópicos", async () => {
    const t = tables();
    const response = await bulk(database(t), { ids: ["q-win"], metadata: { discipline_id: DIREITO } });
    const result = await response.json();
    expect(result.topicsClearedIds).toEqual(["q-win"]);
    const question = t.questions.find((q) => q.id === "q-win");
    expect(question).toMatchObject({ subject_id: null, discipline_id: DIREITO, evaluated_topics: [] });
    expect(t.question_subjects.filter((row) => row.question_id === "q-win")).toEqual([]);
  });

  test("Assuntos de Disciplinas diferentes em massa são rejeitados sem alterar nada", async () => {
    const t = tables();
    const response = await bulk(database(t), { ids: ["q-win"], metadata: { subject_ids: [WINDOWS, CONSTITUCIONALISMO] } });
    expect(response.status).toBe(400);
    expect(t.questions.find((q) => q.id === "q-win")?.evaluated_topics).toEqual(["Atalhos"]);
  });

  test("N06 — publicação exige Disciplina, não Assunto", async () => {
    const t = baseTables();
    t.questions.push(
      { id: "q-direta", subject_id: null, discipline_id: DIREITO, evaluated_topics: ["ADI"], status: "ready_to_publish" },
      { id: "q-legado", subject_id: null, discipline_id: null, evaluated_topics: ["X"], status: "ready_to_publish" },
    );
    t.question_alternatives = [
      { question_id: "q-direta", is_correct: true },
      { question_id: "q-legado", is_correct: true },
    ];
    const response = await bulk(database(t), { ids: ["q-direta", "q-legado"], status: "published" });
    const result = await response.json();
    expect(result.updatedIds).toEqual(["q-direta"]);
    expect(result.blockedSubjectIds).toEqual(["q-legado"]);
  });
});

test.describe("resultado do aluno — Disciplina mista", () => {
  const { context } = loadModule("app/meus-simulados/[id]/resultado/page-client.tsx", {});
  const build = context.buildSubjectTopicPerformance as (questions: Row[]) => Row[];

  function question(id: string, overrides: Row) {
    return { simulado_question_id: id, status: "active", selected_alternative_id: "alt", is_correct: true, evaluated_topics: [], subject: null, discipline: null, ...overrides };
  }

  const questions = [
    question("q1", { subject: "Poder Constituinte", discipline: "Direito Constitucional", evaluated_topics: ["Poder Constituinte Originário"], is_correct: true }),
    question("q2", { subject: null, discipline: "Direito Constitucional", evaluated_topics: ["ADI"], is_correct: false }),
    question("q3", { subject: null, discipline: "Direito Constitucional", evaluated_topics: ["Controle concentrado"], selected_alternative_id: null, is_correct: null }),
    question("q4", { subject: "Windows", discipline: "Informática", evaluated_topics: ["Atalhos"], is_correct: true }),
    question("q5", { subject: "Windows", discipline: "Informática", evaluated_topics: ["Atalhos"], status: "annulled" }),
  ];

  test("R01–R09/M06–M08 — cada questão entra em um único grupo, com totais corretos", () => {
    const groups = build(questions);
    const byKey = Object.fromEntries(groups.map((group) => [group.key, group]));
    expect(Object.keys(byKey).sort()).toEqual(["discipline:Direito Constitucional", "subject:Poder Constituinte", "subject:Windows"]);
    expect(byKey["discipline:Direito Constitucional"]).toMatchObject({ level: "discipline", total: 2, correct: 0, wrong: 1, blank: 1, percent: 0 });
    expect(byKey["subject:Poder Constituinte"]).toMatchObject({ level: "subject", total: 1, correct: 1, percent: 100 });
    expect(byKey["subject:Windows"]).toMatchObject({ total: 2, correct: 1, annulled: 1, percent: 100 });
    expect(groups.reduce((sum, group) => sum + group.total, 0)).toBe(questions.length);
  });

  test("R07/R14 — tópicos diretos aparecem no grupo da Disciplina", () => {
    const direct = build(questions).find((group) => group.level === "discipline");
    expect(direct?.reviewTopics.map((topic: Row) => topic.label).sort()).toEqual(["ADI", "Controle concentrado"]);
  });

  test("R10–R12 — nenhum null, undefined, NaN ou 'Sem assunto'", () => {
    const serialized = JSON.stringify(build(questions));
    expect(serialized).not.toMatch(/Sem assunto|undefined|:null|NaN/);
    for (const group of build(questions)) expect(Number.isFinite(group.percent)).toBe(true);
  });
});

test.describe("filtros do Banco de Questões", () => {
  const { context } = loadModule("app/questoes/page-client.tsx", {});
  const topics = baseTables().topics as any[];
  topics.push({ id: "t-con-adi", name: "ADI", subject_id: CONSTITUCIONALISMO, discipline_id: DIREITO });

  test("N09/M05 — Disciplina sem Assunto oferece só tópicos diretos; com Assunto, só os do Assunto", () => {
    const scope = (disciplineId: string, subjectIds: string[]) => topics.filter((topic) => context.topicInFilterScope(topic, disciplineId, subjectIds)).map((topic) => topic.id);
    expect(scope(DIREITO, [])).toEqual(["t-dir-adi"]);
    expect(scope(DIREITO, [CONSTITUCIONALISMO]).sort()).toEqual(["t-con-adi", "t-con-poder"]);
    expect(scope("", [])).toEqual([]);
  });

  test("tópico homônimo: questão direta liga ao tópico direto; questão com Assunto, ao do Assunto", () => {
    const map = context.buildTopicIdsByQuestion([
      { id: "q-direta", discipline_id: DIREITO, evaluated_topics: ["ADI"], question_subjects: [], subjects: null },
      { id: "q-assunto", discipline_id: DIREITO, evaluated_topics: ["ADI"], question_subjects: [{ subjects: { id: CONSTITUCIONALISMO } }] },
    ], topics);
    expect(map.get("q-direta")).toEqual(["t-dir-adi"]);
    expect(map.get("q-assunto")).toEqual(["t-con-adi"]);
  });
});

test.describe("EvaluatedTopicsInput — catálogo", () => {
  const { context } = loadModule("app/components/questions/EvaluatedTopicsInput.tsx", {});

  test("com Assunto usa o catálogo do Assunto; sem Assunto, o catálogo direto da Disciplina", () => {
    expect(context.topicCatalogKey(WINDOWS, INFO)).toBe(`subject:${WINDOWS}`);
    expect(context.topicCatalogKey(null, DIREITO)).toBe(`discipline:${DIREITO}`);
    expect(context.topicCatalogKey(null, null)).toBeNull();
    expect(context.topicCatalogUrl(`subject:${WINDOWS}`)).toBe(`/api/admin/topics?subject_id=${WINDOWS}&active=true`);
    expect(context.topicCatalogUrl(`discipline:${DIREITO}`)).toBe(`/api/admin/topics?discipline_id=${DIREITO}&direct=true&active=true`);
  });
});

test.describe("estado canônico após salvar (SS)", () => {
  const { exports: lib } = loadModule("lib/questions/question-subjects.ts", {});
  const subjectRow = (id: string) => baseTables().subjects.find((subject) => subject.id === id)!;

  function payload(overrides: Row) {
    return {
      statement: "Enunciado suficientemente longo para validar.", exam_board_id: "board-1", status: "pending_review",
      question_type: "multiple_choice",
      alternatives: ["A", "B", "C", "D"].map((label) => ({ label, text: `Texto ${label}`, is_correct: label === "A" })),
      ...overrides,
    };
  }
  function patch(db: any, body: Row) {
    const route = loadModule("app/api/admin/questions/[id]/route.ts", modules(db)).exports;
    return route.PATCH(jsonRequest("http://x/api/admin/questions/q-1", "PATCH", body), { params: Promise.resolve({ id: "q-1" }) });
  }
  // Formato que o Banco/Revisar mantêm em memória (relações embutidas do select das listas).
  function listShape(row: Row) {
    const subject = row.subject_id ? subjectRow(row.subject_id) : null;
    return { ...row, subjects: subject, question_subjects: subject ? [{ subjects: subject }] : [] };
  }

  test("SS01 — PATCH devolve a questão relida após salvar", async () => {
    const tables = baseTables();
    tables.questions.push({ id: "q-1", code: "ET1", correct_alternative_label: "A", subject_id: WINDOWS, discipline_id: INFO, evaluated_topics: ["Atalhos"] });
    const response = await patch(database(tables), payload({ discipline_id: DIREITO, subject_ids: [CONSTITUCIONALISMO], evaluated_topics: ["Poder Constituinte"] }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.question).toMatchObject({ id: "q-1", discipline_id: DIREITO, subject_id: CONSTITUCIONALISMO, evaluated_topics: ["Poder Constituinte"] });
  });

  test("SS02/SS03 — três salvamentos seguidos sem recarregar, sempre a partir do estado canônico", async () => {
    const tables = baseTables();
    tables.questions.push({ id: "q-1", code: "ET1", correct_alternative_label: "A", subject_id: WINDOWS, discipline_id: INFO, evaluated_topics: ["Atalhos"] });
    const db = database(tables);
    let local: Row = listShape(tables.questions[0]);
    const steps = [
      { discipline_id: DIREITO, subject_ids: [CONSTITUCIONALISMO], evaluated_topics: ["Poder Constituinte"] },
      { discipline_id: DIREITO, subject_ids: [], evaluated_topics: ["ADI"] },
      { discipline_id: INFO, subject_ids: [WINDOWS], evaluated_topics: ["Atalhos"] },
    ];
    for (const step of steps) {
      // O editor reaberto lê a classificação da cópia local.
      expect(lib.extractQuestionSubjectIds(local)).toEqual(lib.extractQuestionSubjectIds(listShape(tables.questions[0])));
      const response = await patch(db, payload(step));
      expect(response.status).toBe(200);
      const body = await response.json();
      local = { ...local, ...step, ...listShape(body.question) };
      expect(lib.extractQuestionSubjectIds(local)).toEqual(step.subject_ids);
    }
  });

  test("SS04 — causa reproduzida: mesclar só os campos editados deixa a relação de Assunto antiga", () => {
    const stale = listShape({ id: "q-1", subject_id: WINDOWS, discipline_id: INFO });
    const merged = { ...stale, discipline_id: DIREITO, subject_id: CONSTITUCIONALISMO };
    expect(lib.extractQuestionSubjects(merged).map((subject: Row) => subject.id)).toEqual([WINDOWS]);
  });

  test("SS05 — proteção mantida: classificação realmente desatualizada continua recusada", async () => {
    const tables = baseTables();
    tables.questions.push({ id: "q-1", code: "ET1", correct_alternative_label: "A", subject_id: CONSTITUCIONALISMO, discipline_id: DIREITO, evaluated_topics: ["Poder Constituinte"] });
    const db = database(tables);
    const response = await patch(db, payload({ discipline_id: INFO, subject_ids: [WINDOWS], evaluated_topics: ["Poder Constituinte"] }));
    expect(response.status).toBe(400);
    expect((await response.json()).message).toContain("classificação anterior");
    expect(db.writes.some((write) => write.table === "questions" && write.op === "update")).toBe(false);
  });
});

test.describe("Usar como modelo no Criador Manual (UM)", () => {
  const picker = loadModule("app/components/questions/QuestionTemplatePicker.tsx", {}).exports;
  const { context } = loadModule("app/questoes/nova/page-client.tsx", { "../../components/questions/QuestionTemplatePicker": picker });
  const boards = [{ id: "b-et", name: "Estudo TOP" }, { id: "b-fgv", name: "FGV" }, { id: "b-cesp", name: "Cebraspe" }];
  function template(overrides: Row = {}) {
    return {
      id: "11111111-1111-1111-1111-111111111111", code: "Q100", statement: "<p>Enunciado</p>", question_type: "multiple_choice",
      difficulty_level: 4, image_url: null, orgao: "PCMG", evaluated_topics: ["Atalhos"], discipline_id: INFO, subject_id: WINDOWS,
      exam_board_id: "b-fgv", exam_boards: { id: "b-fgv", name: "FGV" }, inspiration_board: null,
      subjects: { id: WINDOWS, name: "Windows", discipline_id: INFO }, question_subjects: [{ subjects: { id: WINDOWS, name: "Windows", discipline_id: INFO } }],
      question_alternatives: [
        { label: "B", text: "Beta", image_url: null, is_correct: true, order_number: 2 },
        { label: "A", text: "Alfa", image_url: null, is_correct: false, order_number: 1 },
      ],
      ...overrides,
    };
  }

  test("UM01–UM08 — nova questão Estudo TOP com classificação, tópicos, órgão e alternativas da modelo", () => {
    const state = context.bankTemplateInitialState(template(), boards);
    expect(state).toMatchObject({
      boardId: "b-et", disciplineId: INFO, subjectIds: [WINDOWS], evaluatedTopics: ["Atalhos"], difficulty: 4,
      orgao: "PCMG", inspirationBoardId: "b-fgv", estudoTopFound: true, statement: "<p>Enunciado</p>",
    });
    expect(state.alternatives.map((alt: Row) => [alt.label, alt.text, alt.is_correct])).toEqual([["A", "Alfa", false], ["B", "Beta", true]]);
    expect(state).not.toHaveProperty("id");
    expect(state).not.toHaveProperty("code");
  });

  test("UM09 — Disciplina sem Assunto é preservada", () => {
    const state = context.bankTemplateInitialState(template({ subject_id: null, subjects: null, question_subjects: [], discipline_id: DIREITO, evaluated_topics: ["ADI"] }), boards);
    const { normalizeEvaluatedTopics } = loadModule("lib/questions/evaluated-topics.ts", {}).exports;
    expect(state).toMatchObject({ disciplineId: DIREITO, subjectIds: [], evaluatedTopics: normalizeEvaluatedTopics(["ADI"]) });
  });

  test("UM10–UM12 — cadeia de Inspiração", () => {
    expect(context.templateInspirationBoardId(template())).toBe("b-fgv");
    expect(context.templateInspirationBoardId(template({ exam_board_id: "b-et", exam_boards: { id: "b-et", name: "Estudo TOP" }, inspiration_board: { id: "b-cesp", name: "Cebraspe" } }))).toBe("b-cesp");
    expect(context.templateInspirationBoardId(template({ exam_board_id: "b-et", exam_boards: { id: "b-et", name: "Estudo TOP" }, inspiration_board: null }))).toBeNull();
  });

  test("UM13 — sem banca Estudo TOP cadastrada a banca fica vazia (o Criador avisa antes de salvar)", () => {
    const state = context.bankTemplateInitialState(template(), boards.filter((board) => board.id !== "b-et"));
    expect(state).toMatchObject({ boardId: "", estudoTopFound: false });
  });

  test("UM14 — sem modelo o Criador não é inicializado", () => {
    expect(context.bankTemplateInitialState(null, boards)).toBeNull();
  });
});

// Editor inline do Banco com React 19 real em StrictMode (como no `next dev`), no navegador.
test.describe("editor inline do Banco — abrir não salva nem fecha (E)", () => {
  const transpileForBrowser = (code: string, fileName: string) => ts.transpileModule(code, {
    fileName,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;

  function browserModules() {
    const read = (file: string) => fs.readFileSync(file, "utf8");
    const modules: Record<string, string> = {
      react: read("node_modules/react/cjs/react.development.js"),
      "react/jsx-runtime": read("node_modules/react/cjs/react-jsx-runtime.development.js"),
      "react-dom": read("node_modules/react-dom/cjs/react-dom.development.js"),
      "react-dom/client": read("node_modules/react-dom/cjs/react-dom-client.development.js"),
      scheduler: read("node_modules/scheduler/cjs/scheduler.development.js"),
      target: `${transpileForBrowser(read("app/questoes/page-client.tsx"), "page-client.tsx")}\nmodule.exports.__InlineQuestionEditor = InlineQuestionEditor;`,
    };
    const pureImport = /require\("(@\/(?:lib|app\/lib\/utils)\/[^"]+)"\)/g;
    const addPure = (name: string) => {
      if (modules[name]) return;
      const file = [`${name.slice(2)}.ts`, `${name.slice(2)}.tsx`].find((candidate) => fs.existsSync(candidate));
      if (!file) return;
      modules[name] = transpileForBrowser(read(file), file);
      for (const match of modules[name].matchAll(pureImport)) addPure(match[1]);
    };
    for (const match of modules.target.matchAll(pureImport)) addPure(match[1]);
    return modules;
  }

  async function run(page: any, scenario: { strict: boolean; initialTrigger: number; barClicks: number }) {
    await page.setContent("<div></div>");
    return page.evaluate(async ({ modules, strict, initialTrigger, barClicks }: any) => {
      const w = window as any;
      w.process = { env: { NODE_ENV: "development" } };
      const calls = { patch: 0, saved: 0, cancel: 0, errors: [] as string[] };
      const Stub = () => null;
      const stub = new Proxy({}, { get: (_target, key) => (key === "__esModule" ? true : Stub) });
      const cache: Record<string, { exports: any }> = {};
      const req = (name: string): any => {
        if (cache[name]) return cache[name].exports;
        if (name === "@/app/lib/supabase/adminFetch") {
          return {
            adminFetch: async (_url: string, init?: RequestInit) => {
              if (init?.method === "PATCH") calls.patch += 1;
              return { ok: true, json: async () => ({ ok: true, message: "ok", question: null }) };
            },
          };
        }
        if (!(name in modules)) return stub;
        const record = { exports: {} };
        cache[name] = record;
        new Function("module", "exports", "require", "process", modules[name])(record, record.exports, req, w.process);
        return record.exports;
      };
      const React = req("react");
      const { createRoot } = req("react-dom/client");
      const Editor = req("target").__InlineQuestionEditor;
      const subject = { id: "s-1", name: "Windows", discipline_id: "d-1" };
      const question = {
        id: "q-1", code: "ET1", statement: "<p>Enunciado</p>", question_type: "multiple_choice", status: "published",
        discipline_id: "d-1", exam_board_id: "b-1", year: 2025, difficulty_level: 3, evaluated_topics: ["Atalhos"],
        subjects: subject, question_subjects: [{ subjects: subject }],
        question_alternatives: ["A", "B", "C", "D"].map((label, i) => ({ id: `a-${i}`, label, text: label, is_correct: i === 0, order_number: i + 1 })),
      };
      let bump = () => {};
      function Harness() {
        const [trigger, setTrigger] = React.useState(initialTrigger);
        bump = () => setTrigger((value: number) => value + 1);
        return React.createElement(Editor, {
          question, disciplines: [{ id: "d-1", name: "Informática" }], subjects: [subject], boards: [{ id: "b-1", name: "FGV" }],
          saveAllTrigger: trigger,
          onCancel: () => { calls.cancel += 1; },
          onSaved: () => { calls.saved += 1; },
          setActionModal: (modal: any) => { if (modal?.tone === "error") calls.errors.push(modal.title); },
        });
      }
      const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const root = createRoot(document.body.firstElementChild);
      const tree = React.createElement(Harness);
      root.render(strict ? React.createElement(React.StrictMode, null, tree) : tree);
      await wait(400);
      const afterOpen = { ...calls };
      for (let i = 0; i < barClicks; i += 1) {
        bump();
        await wait(150);
      }
      root.unmount();
      return { afterOpen, final: calls };
    }, { modules: browserModules(), ...scenario });
  }

  for (const strict of [true, false]) {
    test(`E01/E04 — abrir e aguardar: nenhum PATCH, onSaved ou onCancel (${strict ? "StrictMode" : "sem StrictMode"})`, async ({ page }) => {
      for (const initialTrigger of [0, 1, 3]) {
        const { afterOpen } = await run(page, { strict, initialTrigger, barClicks: 0 });
        expect(afterOpen).toEqual({ patch: 0, saved: 0, cancel: 0, errors: [] });
      }
    });

    test(`barra "Salvar questão": cada clique salva exatamente uma vez (${strict ? "StrictMode" : "sem StrictMode"})`, async ({ page }) => {
      const { final } = await run(page, { strict, initialTrigger: 1, barClicks: 3 });
      expect(final).toMatchObject({ patch: 3, saved: 3, cancel: 0 });
    });
  }
});

// Resultado do aluno com Assunto opcional (RS): o Raio-X recebe os tópicos diretos da
// Disciplina sem depender do gabarito; a liberação do gabarito continua sendo regra do Simulado.
test.describe("resultado do aluno — API com tópicos diretos (RS)", () => {
  const STUDENT = "stu-1";
  const SIM = "sim-1";
  const info = { id: INFO, name: "Informática" };
  const direito = { id: DIREITO, name: "Direito Constitucional" };
  const windows = { id: WINDOWS, name: "Windows", disciplines: info };

  function sq(id: string, order: number, question: Row, status = "active") {
    return {
      id, simulado_id: SIM, order_number: order, status, points: 1, question_id: question.id,
      questions: {
        statement: "<p>Enunciado</p>", explanation_text: null, question_type: "multiple_choice", exam_boards: null, subjects: null, discipline: null, evaluated_topics: [],
        question_alternatives: [{ id: `${question.id}-a`, label: "A", text: "A", is_correct: true }, { id: `${question.id}-b`, label: "B", text: "B", is_correct: false }],
        ...question,
      },
    };
  }

  function entry(sqId: string, questionId: string, selected: "a" | "b" | null, status = "active") {
    return {
      simulado_question_id: sqId, question_id: questionId, points: 1, status,
      selected_alternative_id: selected ? `${questionId}-${selected}` : null, selected_alternative_label: selected ? selected.toUpperCase() : null,
      is_correct: status === "annulled" || !selected ? null : selected === "a",
      correct_alternative_id: `${questionId}-a`, correct_alternative_label: "A", score_delta: 0,
    };
  }

  function result(attemptId: string, overrides: Row = {}) {
    return {
      id: `res-${attemptId}`, attempt_id: attemptId, simulado_id: SIM, total_questions: 5, answered_questions: 4, correct_count: 1, wrong_count: 2, blank_count: 1, annulled_count: 1,
      score: 2, display_score: 2, max_score: 5, percentage: 40, display_percentage: 40, scoring_model: "traditional", time_spent_seconds: 300, finished_at: "2026-10-01T20:00:00Z",
      result_snapshot: { entries: [entry("sq-1", "q-win", "a"), entry("sq-2", "q-dir-1", "b"), entry("sq-3", "q-dir-2", "a", "annulled"), entry("sq-4", "q-info", null), entry("sq-5", "q-legado", "b")] },
      ...overrides,
    };
  }

  function attempt(id: string, overrides: Row = {}) {
    return {
      id, simulado_id: SIM, student_id: STUDENT, status: "completed", counts_toward_limit: true, attempt_context: "standalone", event_participant_id: null, student_jornada_simulado_id: null,
      submitted_at: "2026-10-01T20:00:00Z", time_spent_seconds: 300, tab_switch_count: 0, focus_violation_count: 0, inactivity_event_count: 0, scissors_used_question_ids: [], owl_help_used_count: 0,
      ...overrides,
    };
  }

  // Cenário C (misto): Assunto + tópicos diretos na mesma Disciplina (Informática), outra
  // Disciplina só com tópicos diretos, tópico homônimo ("Atalhos") em escopos diferentes,
  // múltiplos tópicos, anulada, em branco e um legado sem Disciplina.
  function tables(showAnswerKey: boolean): Record<string, Row[]> {
    return {
      students: [{ id: STUDENT, name: "Aluno", email: "aluno@example.com", cpf: null }],
      simulados: [{ id: SIM, title: "Simulado misto", description: null, scoring_model: "traditional", show_answer_key_on_finish: showAnswerKey, show_teacher_comment: true, correction_video_url: null, instant_feedback_enabled: false, feedback_mode: "final_only", owl_help_enabled: false }],
      simulado_attempts: [
        attempt("att-nao-conta", { counts_toward_limit: false }),
        attempt("att-jornada", { attempt_context: "jornada", student_jornada_simulado_id: "sjs-1" }),
        attempt("att-evento", { attempt_context: "event", event_participant_id: "part-1" }),
        attempt("att-oficial"),
        attempt("att-segunda"),
        attempt("att-outro-aluno", { student_id: "stu-2" }),
      ],
      simulado_results: ["att-nao-conta", "att-jornada", "att-evento", "att-oficial", "att-segunda"].map((id) => result(id, id === "att-segunda" ? { correct_count: 3, display_percentage: 60 } : {})),
      topcoin_earnings: [],
      simulado_answers: [],
      simulado_questions: [
        sq("sq-1", 1, { id: "q-win", subjects: windows, discipline: info, evaluated_topics: ["Atalhos"] }),
        sq("sq-2", 2, { id: "q-dir-1", discipline: direito, evaluated_topics: ["ADI", "Controle concentrado"] }),
        sq("sq-3", 3, { id: "q-dir-2", discipline: direito, evaluated_topics: ["adi"] }, "annulled"),
        sq("sq-4", 4, { id: "q-info", discipline: info, evaluated_topics: ["Atalhos"] }),
        sq("sq-5", 5, { id: "q-legado", discipline: null, evaluated_topics: ["Tópico legado"] }),
      ],
      student_jornadas: [{ id: "sj-1", student_id: STUDENT, jornadas: { title: "Jornada" }, student_jornada_simulados: [{ simulado_id: SIM }] }],
      student_jornada_simulados: [{ id: "sjs-1", student_jornada_id: "sj-1", simulado_id: SIM, student_jornadas: { student_id: STUDENT, status: "active", expires_at: null } }],
      simulado_event_participants: [{ id: "part-1", event_id: "ev-1", student_id: STUDENT, representative_attempt_id: "att-evento", result_released_at: "2026-10-01T21:00:00Z", access_status: "active" }],
    };
  }

  function route(db: any) {
    return loadModule("app/api/student/simulados/[id]/resultado/route.ts", {
      ...modules(db),
      "@/lib/server/supabaseStudentAuth": { getStudentFromRequest: async () => ({ id: STUDENT, email: "aluno@example.com", user_metadata: {} }) },
      "@/app/lib/server/auditLogger": { logStudentActivity: async () => {}, logSystemError: async () => {} },
    }).exports;
  }

  async function get(t: Record<string, Row[]>, query = "") {
    const response = await route(database(t)).GET(new Request(`http://localhost/api/student/simulados/${SIM}/resultado${query}`), { params: Promise.resolve({ id: SIM }) });
    return { status: response.status, body: await response.json() };
  }

  const build = loadModule("app/meus-simulados/[id]/resultado/page-client.tsx", {}).context.buildSubjectTopicPerformance as (questions: Row[]) => Row[];

  test("T02/T03/T06/T07/T19 — tópicos diretos por Disciplina, homônimos isolados, legado sem grupo", async () => {
    const { status, body } = await get(tables(true));
    expect(status).toBe(200);
    expect(body.subjects).toEqual(["Windows"]);
    expect(body.direct_topics).toEqual([
      { discipline: "Direito Constitucional", topics: ["ADI", "Controle concentrado"] },
      { discipline: "Informática", topics: ["Atalhos"] },
    ]);
    expect(JSON.stringify(body.direct_topics)).not.toMatch(/Tópico legado|Sem assunto|null|undefined/);
  });

  test("T11 — Raio-X recebe os conteúdos mesmo com gabarito bloqueado; T13 — gabarito continua protegido", async () => {
    const { body } = await get(tables(false));
    expect(body.simulado.show_answer_key_on_finish).toBe(false);
    expect(body.gabarito).toEqual([]);
    expect(JSON.stringify(body)).not.toMatch(/is_correct|correct_alternative/);
    expect(body.direct_topics.map((group: Row) => group.discipline)).toEqual(["Direito Constitucional", "Informática"]);
  });

  test("T04/T05/T08/T09/T12 — desempenho misto sem duplicidade, anulada e em branco preservadas", async () => {
    const { body } = await get(tables(true));
    const groups = build(body.gabarito);
    const byKey = Object.fromEntries(groups.map((group) => [group.key, group]));
    expect(Object.keys(byKey).sort()).toEqual(["discipline:Direito Constitucional", "discipline:Informática", "subject:Windows"]);
    expect(byKey["subject:Windows"]).toMatchObject({ total: 1, correct: 1, wrong: 0, blank: 0, annulled: 0, percent: 100 });
    expect(byKey["discipline:Direito Constitucional"]).toMatchObject({ total: 2, correct: 0, wrong: 1, blank: 0, annulled: 1, percent: 0 });
    expect(byKey["discipline:Informática"]).toMatchObject({ total: 1, correct: 0, wrong: 0, blank: 1, percent: 0 });
    expect(byKey["discipline:Direito Constitucional"].reviewTopics.map((topic: Row) => [topic.label, topic.total])).toEqual([["ADI", 1], ["Controle concentrado", 1]]);
    expect(byKey["discipline:Informática"].reviewTopics.map((topic: Row) => topic.label)).toEqual(["Atalhos"]);
    expect(byKey["subject:Windows"].masteredTopics.map((topic: Row) => topic.label)).toEqual(["Atalhos"]);
    // Cada questão com Assunto ou Disciplina entra em um único grupo; o legado sem ambos fica só nos totais gerais.
    expect(groups.reduce((sum, group) => sum + group.total, 0)).toBe(4);
  });

  test("T01 — cenário A (todas com Assunto): sem tópicos diretos, comportamento anterior", async () => {
    const t = tables(true);
    t.simulado_questions = t.simulado_questions.slice(0, 1);
    const { body } = await get(t);
    expect(body.subjects).toEqual(["Windows"]);
    expect(body.direct_topics).toEqual([]);
    expect(build(body.gabarito).map((group) => group.key)).toEqual(["subject:Windows"]);
  });

  test("E — questão sem Assunto e sem tópicos não cria grupo vazio no Raio-X; o desempenho usa o rótulo existente", async () => {
    const t = tables(true);
    t.simulado_questions = [
      sq("sq-1", 1, { id: "q-win", subjects: windows, discipline: info, evaluated_topics: ["Atalhos"] }),
      sq("sq-2", 2, { id: "q-dir-1", discipline: direito, evaluated_topics: [] }),
    ];
    const { body } = await get(t);
    expect(body.subjects).toEqual(["Windows"]);
    expect(body.direct_topics).toEqual([]);
    const direct = build(body.gabarito).find((group) => group.key === "discipline:Direito Constitucional");
    expect(direct).toMatchObject({ total: 1, wrong: 1 });
    expect(direct?.reviewTopics.map((topic: Row) => topic.label)).toEqual(["Tópico não informado"]);
  });

  test("T10/T15 — resultado oficial é a tentativa avulsa que conta, com totais persistidos intactos", async () => {
    const { body } = await get(tables(true));
    expect(body.attempt.id).toBe("att-oficial");
    expect(body.result).toMatchObject({ total_questions: 5, answered_questions: 4, correct_count: 1, wrong_count: 2, blank_count: 1, annulled_count: 1, display_score: 2, display_percentage: 40 });
  });

  test("T14 — resultado imediato usa a tentativa pedida; tentativa de outro aluno é recusada", async () => {
    const own = await get(tables(true), "?attemptId=att-segunda");
    expect(own.body.attempt.id).toBe("att-segunda");
    expect(own.body.result.correct_count).toBe(3);
    const other = await get(tables(true), "?attemptId=att-outro-aluno");
    expect(other.status).toBe(404);
  });

  test("T17 — resultado acessado por Jornada usa a tentativa da Jornada", async () => {
    const { status, body } = await get(tables(true), "?jornada=sj-1");
    expect(status).toBe(200);
    expect(body.attempt.id).toBe("att-jornada");
    expect(body.jornada).toEqual({ student_jornada_id: "sj-1", title: "Jornada" });
    expect(body.direct_topics).toHaveLength(2);
  });

  test("T18 — Evento liberado usa a tentativa representativa; sem liberação continua bloqueado", async () => {
    const released = await get(tables(false), "?event=ev-1");
    expect(released.body.attempt.id).toBe("att-evento");
    expect(released.body.simulado.show_answer_key_on_finish).toBe(true);
    expect(released.body.gabarito).toHaveLength(5);
    const t = tables(false);
    t.simulado_event_participants[0].result_released_at = null;
    const blocked = await get(t, "?event=ev-1");
    expect(blocked.status).toBe(403);
    expect(blocked.body).toEqual({ ok: false, code: "EVENT_RESULT_BLOCKED", message: "Seu resultado foi calculado e aguarda liberação pelo professor." });
  });

  test("T20 — contrato anterior preservado; direct_topics é aditivo", async () => {
    const { body } = await get(tables(true));
    for (const key of ["ok", "message", "student", "simulado", "attempt", "behavior_metrics", "result", "earned_topcoins", "average_display_percentage", "total_results", "subjects", "gabarito", "jornada"]) expect(body).toHaveProperty(key);
    expect(Object.keys(body.gabarito[1]).sort()).toEqual(["alternatives", "correct_alternative_id", "correct_alternative_label", "discipline", "evaluated_topics", "exam_board", "explanation_text", "is_correct", "order_number", "points", "question_type", "selected_alternative_id", "selected_alternative_label", "simulado_question_id", "statement", "status", "subject"]);
    expect(body.gabarito[1]).toMatchObject({ subject: null, discipline: "Direito Constitucional" });
  });
});

test.describe("resultado do aluno — Raio-X e Desempenho renderizados (RS)", () => {
  const Icon = () => null;
  const { context } = loadModule("app/meus-simulados/[id]/resultado/page-client.tsx", {
    "react/jsx-runtime": jsxRuntime,
    "lucide-react": new Proxy({}, { get: (_target, key) => (key === "__esModule" ? true : Icon) }),
  });
  const result = { id: "r", total_questions: 10, answered_questions: 10, correct_count: 0, wrong_count: 10, blank_count: 0, annulled_count: 0, score: 0, display_score: 0, max_score: 10, percentage: 0, display_percentage: 0, scoring_model: "traditional", time_spent_seconds: 600, finished_at: "2026-10-01T20:55:20Z" };
  const xray = (subjects: string[], directTopics: Row[]) => renderToStaticMarkup(jsxRuntime.jsx(context.ResultExamXRay, { result, subjects, directTopics, simuladoTitle: "Simulado de Português", scoringModel: "traditional", finishedAt: result.finished_at }));
  const portugues = { discipline: "Português", topics: ["Crase", "Pontuação no Período Simples", "Voz Passiva"] };

  test("T11 — cenário B (só tópicos diretos): conteúdos identificados, sem mensagem de vazio", () => {
    const html = xray([], [portugues]);
    expect(html).toContain("Tópicos da disciplina · Português");
    for (const topic of portugues.topics) expect(html).toContain(topic);
    expect(html).toContain("0 assunto(s)");
    expect(html).toContain("3 tópico(s) da disciplina");
    expect(html).toContain("A prova abordou 3 tópicos avaliados diretamente na disciplina Português.");
    expect(html).not.toContain("Nenhum assunto foi identificado");
  });

  test("T11 — cenário C (misto); cenário A (só Assuntos) e vazio mantêm o texto original", () => {
    const mixed = xray(["Windows"], [{ discipline: "Informática", topics: ["Atalhos"] }]);
    expect(mixed).toContain("A prova abordou 1 assunto específico e 1 tópico avaliado diretamente na disciplina Informática.");
    const subjectsOnly = xray(["Windows"], []);
    expect(subjectsOnly).toContain("A prova abordou 1 assunto específico.");
    expect(subjectsOnly).not.toContain("Tópicos da disciplina");
    expect(subjectsOnly).not.toContain("tópico(s) da disciplina");
    expect(xray([], [])).toContain("Nenhum assunto foi identificado neste simulado.");
  });

  test("T13 — Desempenho continua bloqueado quando o gabarito não é liberado", () => {
    const html = renderToStaticMarkup(jsxRuntime.jsx(context.ResultSubjects, { performance: [], subjects: [], answerKeyVisible: false, onGoToReview: () => {} }));
    expect(html).toContain("O gabarito e os detalhes por questão não estão disponíveis para este simulado.");
  });
});
