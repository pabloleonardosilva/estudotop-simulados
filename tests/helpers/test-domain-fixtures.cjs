/* eslint-disable @typescript-eslint/no-require-imports */
const { createHash, randomUUID } = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");
const { loadSafeSupabaseTestEnvironment, assertSafeSupabaseTestEnvironment } = require("./supabase-test-environment.cjs");

function createTestDomainFixtures(runId = randomUUID()) {
  const config = loadSafeSupabaseTestEnvironment();
  if (!/^[a-zA-Z0-9-]{16,64}$/.test(runId)) throw new Error("Invalid fixture runId.");
  const guard = () => {
    const current = assertSafeSupabaseTestEnvironment();
    if (JSON.stringify(current) !== JSON.stringify(config)) throw new Error("Fixture environment changed.");
  };
  guard();
  const client = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const id = (name) => {
    const hex = createHash("sha256").update("QA-6B3/" + runId + "/" + name).digest("hex");
    return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-5" + hex.slice(13, 16) + "-a" + hex.slice(17, 20) + "-" + hex.slice(20, 32);
  };
  const names = Object.freeze({ discipline: "QA 6B3 Disciplina " + runId, subject: "QA 6B3 Assunto " + runId, board: "QA 6B3 Banca " + runId, statement: "QA 6B3 Questao " + runId + ": qual alternativa representa uma verdade logica?" });
  const ids = Object.freeze({ discipline: id("discipline"), subject: id("subject"), board: id("board"), question: id("question") });
  const rows = [
    ["disciplines", { id: ids.discipline, name: names.discipline, is_active: true }, "name"],
    ["subjects", { id: ids.subject, name: names.subject, discipline_id: ids.discipline, is_active: true }, "name"],
    ["exam_boards", { id: ids.board, name: names.board, is_active: true }, "name"],
    ["questions", { id: ids.question, statement: names.statement, subject_id: ids.subject, exam_board_id: ids.board, question_type: "multiple_choice", status: "draft", difficulty_level: 3, evaluated_topics: [], correct_alternative_label: "A", is_in_question_bank: true }, "statement"],
    ["question_subjects", { id: id("link"), question_id: ids.question, subject_id: ids.subject }, "question_id"],
    ["question_alternatives", { id: id("alternative-a"), question_id: ids.question, label: "A", text: "Uma proposicao ou sua negacao e verdadeira.", is_correct: true, order_number: 1 }, "question_id"],
    ["question_alternatives", { id: id("alternative-b"), question_id: ids.question, label: "B", text: "Toda proposicao e sempre falsa.", is_correct: false, order_number: 2 }, "question_id"],
  ];
  const owned = new Set();
  async function create() {
    for (const [table, row, scope] of rows) {
      guard();
      const { data, error } = await client.from(table).select("id," + scope).eq("id", row.id).maybeSingle();
      if (error || (data && data[scope] !== row[scope])) throw new Error("Fixture ownership check failed: " + table);
      owned.add(row.id);
      if (!data) {
        guard();
        const result = await client.from(table).insert(row);
        if (result.error) throw new Error("Fixture creation failed: " + table + " (" + String(result.error.code || "unknown").replace(/[^A-Z0-9]/gi, "") + ")");
      }
    }
    return { runId, ids, names };
  }
  async function cleanup() {
    for (const [table, row, scope] of [...rows].reverse()) {
      if (!owned.has(row.id)) continue;
      guard();
      const { error } = await client.from(table).delete().eq("id", row.id).eq(scope, row[scope]);
      if (error) throw new Error("Fixture cleanup failed: " + table);
    }
    for (const [table, row] of rows) {
      if (!owned.has(row.id)) continue;
      guard();
      const { data, error } = await client.from(table).select("id").eq("id", row.id).maybeSingle();
      if (error || data) throw new Error("Fixture residue detected: " + table);
    }
    return { domainResidues: 0, runId };
  }
  return { runId, ids, names, create, cleanup };
}
module.exports = { createTestDomainFixtures };
