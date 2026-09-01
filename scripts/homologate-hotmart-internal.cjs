/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { loadEnvConfig } = require("@next/env");
const { createClient } = require("@supabase/supabase-js");

loadEnvConfig(process.cwd());
if (process.env.HOTMART_HOMOLOGATION_CONFIRM !== "HOTMART_HOMOLOG_20260830") {
  throw new Error("Defina HOTMART_HOMOLOGATION_CONFIRM=HOTMART_HOMOLOG_20260830 para executar.");
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !serviceKey || !anonKey) throw new Error("Configuração Supabase incompleta.");

const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const prefix = `HOTMART_HOMOLOG_20260830_${Date.now()}`;
const created = { users: [], jornadas: [], events: [] };
const results = new Map();
const pass = (name) => { results.set(name, "PASS"); };
const fail = (name, error) => { results.set(name, `FAIL: ${error instanceof Error ? error.message : "erro"}`); };

async function count(table) {
  const { count: value, error } = await db.from(table).select("id", { count: "exact", head: true });
  if (error) throw error;
  return value || 0;
}
async function rpc(name, args) {
  const response = await db.rpc(name, args);
  if (response.error) throw response.error;
  return response.data;
}
async function makeStudent(label) {
  const email = `${prefix.toLowerCase()}_${label}@example.invalid`;
  const password = `Ht!${crypto.randomBytes(12).toString("hex")}Aa1`;
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `${prefix}_${label}` } });
  if (error || !data.user) throw error || new Error("auth fixture");
  const id = data.user.id;
  created.users.push({ id, email, password });
  const { error: profileError } = await db.from("profiles").insert({ id, full_name: `${prefix}_${label}`, role: "student", is_active: true, must_change_password: false });
  if (profileError) throw profileError;
  const { error: studentError } = await db.from("students").insert({ id, name: `${prefix}_${label}`, email, status: "active", origin: "Hotmart" });
  if (studentError) throw studentError;
  return id;
}
async function makeJornada(label, days = 30) {
  const { data, error } = await db.from("jornadas").insert({
    title: `${prefix}_${label}`, description: prefix, status: "published",
    scope_type: "general", category: "administrativo", planned_simulados_count: 1,
    duration_months: 1, duration_days: days, release_duration_days: Math.max(1, days - 7),
  }).select("id").single();
  if (error) throw error;
  created.jornadas.push(data.id);
  return data.id;
}
async function makeMapping(label, jornadaId, status = "active") {
  const { data, error } = await db.from("hotmart_product_mappings").insert({
    hotmart_product_ucode: `${prefix}_${label}`, hotmart_product_name: `${prefix}_${label}`,
    destination_type: "jornada", jornada_id: jornadaId, status,
  }).select("id,hotmart_product_ucode").single();
  if (error) throw error;
  return data;
}
async function makeTransaction(label, extra = {}) {
  const { data, error } = await db.from("hotmart_transactions").insert({
    transaction_code: `${prefix}-${label}`, hotmart_product_ucode: extra.hotmart_product_ucode || `${prefix}_${label}`,
    product_name_snapshot: `${prefix}_${label}`, buyer_email: `${prefix.toLowerCase()}_${label}@example.invalid`,
    purchase_status: "APPROVED", ...extra,
  }).select("*").single();
  if (error) throw error;
  return data;
}
async function makeEnrollment(studentId, jornadaId, extra = {}) {
  const { data, error } = await db.from("student_jornadas").insert({
    student_id: studentId, jornada_id: jornadaId, started_at: "2026-09-01", expires_at: "2026-10-01",
    status: "active", access_origin: "hotmart", ...extra,
  }).select("*").single();
  if (error) throw error;
  return data;
}
async function expectRpcError(name, args) {
  const { error } = await db.rpc(name, args);
  assert.ok(error);
}

async function cleanup() {
  await db.from("hotmart_history").delete().like("metadata->>homologation", `${prefix}%`);
  const { data: txs } = await db.from("hotmart_transactions").select("id").like("transaction_code", `${prefix}%`);
  const txIds = (txs || []).map((row) => row.id);
  if (txIds.length) {
    await db.from("hotmart_history").delete().in("transaction_id", txIds);
    await db.from("hotmart_access_links").delete().in("hotmart_transaction_id", txIds);
    await db.from("hotmart_transactions").delete().in("id", txIds);
  }
  await db.from("hotmart_product_mappings").delete().like("hotmart_product_ucode", `${prefix}%`);
  for (const eventId of created.events) {
    await db.from("simulado_event_participants").delete().eq("event_id", eventId);
    await db.from("simulado_events").delete().eq("id", eventId);
  }
  if (created.jornadas.length) {
    await db.from("student_jornadas").delete().in("jornada_id", created.jornadas);
    await db.from("jornadas").delete().in("id", created.jornadas);
  }
  for (const user of created.users) {
    await db.from("student_registration_confirmations").delete().eq("user_id", user.id);
    await db.from("students").delete().eq("id", user.id);
    await db.from("profiles").delete().eq("id", user.id);
    await db.auth.admin.deleteUser(user.id);
  }
}

(async () => {
  const tables = ["jornadas", "simulado_events", "students", "student_jornadas", "simulado_event_participants"];
  const baseline = Object.fromEntries(await Promise.all(tables.map(async (table) => [table, await count(table)])));
  let fixtureCounts = null;
  try {
    const { data: admin, error: adminError } = await db.from("profiles").select("id").eq("role", "admin").eq("is_active", true).limit(1).single();
    if (adminError || !admin) throw adminError || new Error("Admin ativo não encontrado");
    const student = await makeStudent("STUDENT_A");
    const duplicateStudent = await makeStudent("STUDENT_B");
    const jornada = await makeJornada("JORNADA_A");

    try {
      const tx = await makeTransaction("ATTEMPT");
      assert.equal(tx.processing_attempt_count, 0);
      assert.deepEqual(await rpc("increment_hotmart_processing_attempt", { p_transaction_id: tx.id }), 1);
      assert.deepEqual(await rpc("increment_hotmart_processing_attempt", { p_transaction_id: tx.id }), 2);
      assert.deepEqual(await rpc("increment_hotmart_processing_attempt", { p_transaction_id: tx.id }), 3);
      const { data: after } = await db.from("hotmart_transactions").select("processing_attempt_count,last_processing_attempt_at").eq("id", tx.id).single();
      assert.equal(after.processing_attempt_count, 3); assert.ok(after.last_processing_attempt_at); pass("1");
      await expectRpcError("increment_hotmart_processing_attempt", { p_transaction_id: crypto.randomUUID() }); pass("2");
    } catch (error) { fail("1/2", error); }

    try {
      const tx = await makeTransaction("CLAIM_SUCCESS");
      const first = (await rpc("claim_hotmart_transaction_email", { p_transaction_id: tx.id, p_email_type: "access", p_lease_seconds: 900 }))[0];
      assert.equal(first.claimed, true); assert.equal(first.attempt_count, 1); pass("3");
      const second = (await rpc("claim_hotmart_transaction_email", { p_transaction_id: tx.id, p_email_type: "access", p_lease_seconds: 900 }))[0];
      assert.equal(second.claimed, false); assert.equal(second.attempt_count, 1); pass("4");
      assert.equal(await rpc("complete_hotmart_transaction_email", { p_transaction_id: tx.id, p_email_type: "access", p_claimed_at: first.claimed_at, p_success: true, p_error: null }), true);
      const { data: done } = await db.from("hotmart_transactions").select("access_email_sent_at,access_email_claimed_at,access_email_error").eq("id", tx.id).single();
      assert.ok(done.access_email_sent_at); assert.equal(done.access_email_claimed_at, null); assert.equal(done.access_email_error, null);
      const third = (await rpc("claim_hotmart_transaction_email", { p_transaction_id: tx.id, p_email_type: "access", p_lease_seconds: 900 }))[0]; assert.equal(third.claimed, false); pass("5");
    } catch (error) { fail("3/4/5", error); }

    try {
      const tx = await makeTransaction("CLAIM_WRONG");
      const claim = (await rpc("claim_hotmart_transaction_email", { p_transaction_id: tx.id, p_email_type: "access", p_lease_seconds: 60 }))[0];
      assert.equal(await rpc("complete_hotmart_transaction_email", { p_transaction_id: tx.id, p_email_type: "access", p_claimed_at: "2000-01-01T00:00:00Z", p_success: true, p_error: null }), false);
      const { data: unchanged } = await db.from("hotmart_transactions").select("access_email_sent_at,access_email_claimed_at").eq("id", tx.id).single(); assert.equal(unchanged.access_email_sent_at, null); assert.equal(unchanged.access_email_claimed_at, claim.claimed_at); pass("6");
      assert.equal(await rpc("complete_hotmart_transaction_email", { p_transaction_id: tx.id, p_email_type: "access", p_claimed_at: claim.claimed_at, p_success: false, p_error: "HOMOLOGATION_FAILURE" }), true);
      const { data: failed } = await db.from("hotmart_transactions").select("access_email_sent_at,access_email_claimed_at,access_email_error").eq("id", tx.id).single(); assert.equal(failed.access_email_sent_at, null); assert.equal(failed.access_email_claimed_at, null); assert.equal(failed.access_email_error, "HOMOLOGATION_FAILURE"); pass("7");
      const reclaim1 = (await rpc("claim_hotmart_transaction_email", { p_transaction_id: tx.id, p_email_type: "access", p_lease_seconds: 60 }))[0];
      await db.from("hotmart_transactions").update({ access_email_claimed_at: "2000-01-01T00:00:00Z" }).eq("id", tx.id);
      const reclaim2 = (await rpc("claim_hotmart_transaction_email", { p_transaction_id: tx.id, p_email_type: "access", p_lease_seconds: 60 }))[0]; assert.equal(reclaim1.claimed, true); assert.equal(reclaim2.claimed, true); assert.equal(reclaim2.attempt_count, 3); pass("8");
      await db.from("hotmart_transactions").update({ access_email_attempt_count: 5, access_email_claimed_at: null, processing_status: "processed" }).eq("id", tx.id);
      const { data: eligible } = await db.from("hotmart_transactions").select("id").eq("id", tx.id).is("access_email_sent_at", null).lt("access_email_attempt_count", 5); assert.equal(eligible.length, 0); pass("9");
    } catch (error) { fail("6/7/8/9", error); }

    try {
      const tx = await makeTransaction("SEPARATE", { student_id: student, possible_duplicate_student_id: duplicateStudent, duplicate_match_reason: "phone", processing_status: "pending_duplicate_student" });
      assert.equal(await rpc("resolve_hotmart_duplicate_student_separate", { p_transaction_id: tx.id, p_admin_id: admin.id }), true);
      assert.equal(await rpc("resolve_hotmart_duplicate_student_separate", { p_transaction_id: tx.id, p_admin_id: admin.id }), false);
      const { data: resolved } = await db.from("hotmart_transactions").select("resolution_type,resolved_at,resolved_by").eq("id", tx.id).single(); assert.equal(resolved.resolution_type, "kept_separate"); assert.ok(resolved.resolved_at); assert.equal(resolved.resolved_by, admin.id);
      const { count: histories } = await db.from("hotmart_history").select("id", { count: "exact", head: true }).eq("transaction_id", tx.id).eq("action", "duplicate_students_kept_separate"); assert.equal(histories, 1); pass("10");
      await expectRpcError("resolve_hotmart_duplicate_student_separate", { p_transaction_id: tx.id, p_admin_id: crypto.randomUUID() }); pass("11");
    } catch (error) { fail("10/11", error); }

    async function extensionCase(label, enrollmentExtra = {}, mappingStatus = "active", mismatch = false) {
      const j = await makeJornada(`J_${label}`);
      const enrollment = await makeEnrollment(student, j, enrollmentExtra);
      const mapping = await makeMapping(`MAP_${label}`, mismatch ? jornada : j, mappingStatus);
      const tx = await makeTransaction(`EXT_${label}`, { student_id: student, mapping_id: mapping.id, destination_type: "jornada", jornada_id: j, hotmart_product_ucode: mapping.hotmart_product_ucode, processing_status: "pending_duplicate_purchase" });
      return { j, enrollment, mapping, tx };
    }
    try {
      const fixture = await extensionCase("VALID");
      const started = fixture.enrollment.started_at;
      const first = (await rpc("extend_hotmart_duplicate_jornada", { p_transaction_id: fixture.tx.id, p_admin_id: admin.id }))[0]; assert.equal(first.applied, true); assert.equal(first.new_expires_at, "2026-10-31");
      const second = (await rpc("extend_hotmart_duplicate_jornada", { p_transaction_id: fixture.tx.id, p_admin_id: admin.id }))[0]; assert.equal(second.applied, false);
      const { data: enrollmentAfter } = await db.from("student_jornadas").select("started_at,expires_at").eq("id", fixture.enrollment.id).single(); assert.equal(enrollmentAfter.started_at, started); assert.equal(enrollmentAfter.expires_at, "2026-10-31");
      const { count: histories } = await db.from("hotmart_history").select("id", { count: "exact", head: true }).eq("transaction_id", fixture.tx.id).eq("action", "duplicate_purchase_extended"); assert.equal(histories, 1); pass("12"); pass("13");
      const concurrent = await extensionCase("CONCURRENT");
      const calls = await Promise.all([db.rpc("extend_hotmart_duplicate_jornada", { p_transaction_id: concurrent.tx.id, p_admin_id: admin.id }), db.rpc("extend_hotmart_duplicate_jornada", { p_transaction_id: concurrent.tx.id, p_admin_id: admin.id })]);
      assert.ok(calls.every((call) => !call.error)); const applied = calls.map((call) => call.data[0].applied).sort(); assert.deepEqual(applied, [false, true]);
      const { data: concurrentAfter } = await db.from("student_jornadas").select("expires_at").eq("id", concurrent.enrollment.id).single(); assert.equal(concurrentAfter.expires_at, "2026-10-31"); pass("14");
    } catch (error) { fail("12/13/14", error); }

    const negativeCases = [
      ["15", "EXPIRED", { started_at: "2026-01-01", expires_at: "2026-08-01" }, "active", false],
      ["16", "PAUSED", { status: "paused" }, "active", false],
      ["17", "CANCELLED", { status: "cancelled" }, "active", false],
      ["18", "MANUAL", { access_origin: "manual" }, "active", false],
      ["19", "BLOCKED", { commercial_block_reason: "homologation", commercial_blocked_at: new Date().toISOString() }, "active", false],
      ["20", "INACTIVE_MAPPING", {}, "inactive", false],
      ["21", "MISMATCH", {}, "active", true],
    ];
    for (const [number, label, enrollmentExtra, mappingStatus, mismatch] of negativeCases) {
      try { const fixture = await extensionCase(label, enrollmentExtra, mappingStatus, mismatch); await expectRpcError("extend_hotmart_duplicate_jornada", { p_transaction_id: fixture.tx.id, p_admin_id: admin.id }); const { data: row } = await db.from("student_jornadas").select("expires_at").eq("id", fixture.enrollment.id).single(); assert.equal(row.expires_at, enrollmentExtra.expires_at || "2026-10-01"); pass(number); } catch (error) { fail(number, error); }
    }

    async function refundFixture(label) { return makeTransaction(`REFUND_${label}`, { student_id: student, processing_status: "processed" }); }
    try {
      const tx = await refundFixture("BEGIN"); assert.equal(await rpc("begin_hotmart_refund_request", { p_transaction_id: tx.id, p_admin_id: admin.id }), true); assert.equal(await rpc("begin_hotmart_refund_request", { p_transaction_id: tx.id, p_admin_id: admin.id }), false); pass("22"); pass("23");
      const accepted = await refundFixture("ACCEPTED"); await rpc("begin_hotmart_refund_request", { p_transaction_id: accepted.id, p_admin_id: admin.id }); await rpc("finalize_hotmart_refund_request", { p_transaction_id: accepted.id, p_admin_id: admin.id, p_outcome: "accepted" }); const { data: acceptedAfter } = await db.from("hotmart_transactions").select("refund_request_state,refund_status,refund_external_accepted_at,refund_confirmed_at").eq("id", accepted.id).single(); assert.equal(acceptedAfter.refund_request_state, "accepted"); assert.equal(acceptedAfter.refund_status, "requested"); assert.ok(acceptedAfter.refund_external_accepted_at); assert.equal(acceptedAfter.refund_confirmed_at, null); pass("24"); pass("25");
      const uncertain = await refundFixture("UNCERTAIN"); await rpc("begin_hotmart_refund_request", { p_transaction_id: uncertain.id, p_admin_id: admin.id }); await rpc("finalize_hotmart_refund_request", { p_transaction_id: uncertain.id, p_admin_id: admin.id, p_outcome: "uncertain" }); assert.equal(await rpc("begin_hotmart_refund_request", { p_transaction_id: uncertain.id, p_admin_id: admin.id }), false); const { data: uncertainAfter } = await db.from("hotmart_transactions").select("refund_request_state,resolution_type").eq("id", uncertain.id).single(); assert.equal(uncertainAfter.refund_request_state, "reconciliation_required"); assert.equal(uncertainAfter.resolution_type, null); pass("26");
      const rejected = await refundFixture("REJECTED"); await rpc("begin_hotmart_refund_request", { p_transaction_id: rejected.id, p_admin_id: admin.id }); await rpc("finalize_hotmart_refund_request", { p_transaction_id: rejected.id, p_admin_id: admin.id, p_outcome: "rejected" }); const { data: rejectedAfter } = await db.from("hotmart_transactions").select("refund_request_state,resolution_type,refund_status").eq("id", rejected.id).single(); assert.equal(rejectedAfter.refund_request_state, "manual_required"); assert.equal(rejectedAfter.resolution_type, "manual_refund"); assert.notEqual(rejectedAfter.refund_status, "confirmed"); pass("27");
      const invalid = await refundFixture("INVALID_ADMIN"); await expectRpcError("begin_hotmart_refund_request", { p_transaction_id: invalid.id, p_admin_id: crypto.randomUUID() }); const { data: invalidAfter } = await db.from("hotmart_transactions").select("refund_request_state").eq("id", invalid.id).single(); assert.equal(invalidAfter.refund_request_state, null); pass("28");
    } catch (error) { fail("22-28", error); }

    try {
      const checkTx = await makeTransaction("CHECKS");
      for (const invalid of [{ processing_attempt_count: -1 }, { duplicate_match_reason: "invalid" }, { resolution_type: "invalid" }, { refund_request_state: "invalid" }]) {
        const { error } = await db.from("hotmart_transactions").update(invalid).eq("id", checkTx.id); assert.ok(error);
      }
      pass("29");
      const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
      const { error: anonError } = await anon.rpc("increment_hotmart_processing_attempt", { p_transaction_id: checkTx.id }); assert.ok(anonError);
      const fixtureUser = created.users[0]; const authenticated = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } }); const { error: signInError } = await authenticated.auth.signInWithPassword({ email: fixtureUser.email, password: fixtureUser.password }); assert.equal(signInError, null); const { error: authRpcError } = await authenticated.rpc("increment_hotmart_processing_attempt", { p_transaction_id: checkTx.id }); assert.ok(authRpcError); pass("30");
      const linkJ = await makeJornada("LINK_UNIQUE"); const enrollment = await makeEnrollment(student, linkJ); const linkTx = await makeTransaction("LINK_UNIQUE", { student_id: student, destination_type: "jornada", jornada_id: linkJ }); const firstLink = await db.from("hotmart_access_links").insert({ hotmart_transaction_id: linkTx.id, student_id: student, destination_type: "jornada", student_jornada_id: enrollment.id }); assert.equal(firstLink.error, null); const secondLink = await db.from("hotmart_access_links").insert({ hotmart_transaction_id: linkTx.id, student_id: student, destination_type: "jornada", student_jornada_id: enrollment.id }); assert.ok(secondLink.error); pass("31");
    } catch (error) { fail("29/30/31", error); }

    try {
      const j1 = await makeJornada("PRODUCT_A"); const j2 = await makeJornada("PRODUCT_B"); const e1 = await makeEnrollment(duplicateStudent, j1); const e2 = await makeEnrollment(duplicateStudent, j2); await db.from("student_jornadas").update({ status: "paused", commercial_block_reason: "homologation", commercial_blocked_at: new Date().toISOString() }).eq("id", e1.id); const { data: untouched } = await db.from("student_jornadas").select("status,commercial_block_reason").eq("id", e2.id).single(); assert.equal(untouched.status, "active"); assert.equal(untouched.commercial_block_reason, null); pass("32");
    } catch (error) { fail("32", error); }

    try {
      const { data: event, error } = await db.from("simulado_events").insert({ name: `${prefix}_EVENT`, status: "scheduled", starts_at: "2026-09-01T12:00:00Z", ends_at: "2026-09-01T13:00:00Z", duration_minutes: 60, result_policy: "blocked", code: `${prefix}_EVENT`, created_by: admin.id }).select("id").single(); if (error) throw error; created.events.push(event.id);
      const { data: participant, error: participantError } = await db.from("simulado_event_participants").insert({ event_id: event.id, student_id: student, source: "hotmart", access_origin: "hotmart", access_status: "active" }).select("id").single(); if (participantError) throw participantError;
      await db.from("simulado_event_participants").update({ access_status: "paused", commercial_block_reason: "homologation", commercial_blocked_at: new Date().toISOString() }).eq("id", participant.id); const { data: paused } = await db.from("simulado_event_participants").select("access_status").eq("id", participant.id).single(); assert.equal(paused.access_status, "paused"); await db.from("simulado_event_participants").update({ access_status: "cancelled" }).eq("id", participant.id); const { data: cancelled } = await db.from("simulado_event_participants").select("access_status").eq("id", participant.id).single(); assert.equal(cancelled.access_status, "cancelled"); pass("33");
    } catch (error) { fail("33", error); }

    fixtureCounts = { transactions: (await db.from("hotmart_transactions").select("id").like("transaction_code", `${prefix}%`)).data?.length || 0, jornadas: created.jornadas.length, students: created.users.length, events: created.events.length };
  } finally {
    try { await cleanup(); pass("34"); } catch (error) { fail("34", error); }
    try { const after = Object.fromEntries(await Promise.all(tables.map(async (table) => [table, await count(table)]))); assert.deepEqual(after, baseline); pass("35"); } catch (error) { fail("35", error); }
    console.log(JSON.stringify({ prefix, baseline, fixtureCounts, results: Object.fromEntries(results) }, null, 2));
  }
})().catch((error) => { console.error(JSON.stringify({ fatal: error.message })); process.exitCode = 1; });
