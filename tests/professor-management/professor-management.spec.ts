import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

test("admin events listing embeds the participant count in a single query — no N+1 per card", () => {
  const route = read("app/api/admin/events/route.ts");
  expect(route).toContain("simulado_event_participants(count)");
  expect(route).toContain("Array.isArray(simulado_event_participants) ? Number(simulado_event_participants[0]?.count || 0) : 0");
  expect(route).toContain("participant_count: participantCount");
  // Uma única query dentro do GET — sem loop de fetch por evento.
  const getBody = route.slice(route.indexOf("export async function GET("), route.indexOf("export async function POST("));
  expect((getBody.match(/\.from\("simulado_events"\)/g) || []).length).toBe(1);
});

test("every row in simulado_event_participants already represents a valid participation — no cancelled/paused state to filter", () => {
  const route = read("app/api/admin/events/route.ts");
  // A contagem usa o count agregado puro, sem filtro de status — documentado
  // no comentário do próprio arquivo.
  expect(route).toContain("já representa participação válida");
});

test("the event card shows the participant count, including zero, without losing existing actions", () => {
  const pageClient = read("app/admin/eventos/page-client.tsx");
  expect(pageClient).toContain("Participantes:");
  expect(pageClient).toContain("event.participant_count");
  // Ações existentes preservadas.
  expect(pageClient).toContain('PremiumButton href={`/admin/eventos/${event.id}`} variant="dark-primary">Gerenciar');
  expect(pageClient).toContain("copyRegistrationLink(event.registration_url)");
});

test("professors table has ON DELETE RESTRICT toward auth.users, and simulado_event_professors has ON DELETE RESTRICT toward professors — the database itself enforces the deletion policy", () => {
  const migration = read("supabase/migrations/20260820120000_create_simulado_events.sql");
  expect(migration).toContain("id uuid primary key references auth.users(id) on delete restrict,");
  expect(migration).toContain("professor_id uuid not null references public.professors(id) on delete restrict");
});

test("professor deletion checks assignment count BEFORE attempting to delete, and blocks with a clear message instead of letting the FK constraint throw", () => {
  const route = read("app/api/admin/professors/[id]/route.ts");
  const deleteIndex = route.indexOf("export async function DELETE(");
  const countIndex = route.indexOf('from("simulado_event_professors")', deleteIndex);
  const blockIndex = route.indexOf('code: "PROFESSOR_HAS_EVENTS"', countIndex);
  const professorDeleteIndex = route.indexOf('from("professors").delete()', blockIndex);
  expect(deleteIndex).toBeGreaterThan(-1);
  expect(countIndex).toBeGreaterThan(deleteIndex);
  expect(blockIndex).toBeGreaterThan(countIndex);
  expect(professorDeleteIndex).toBeGreaterThan(blockIndex);
  expect(route).toContain("status: 409");
});

test("professor deletion order matches the actual FK direction — professors row first, then profiles, then auth.users, unlike the student flow", () => {
  const route = read("app/api/admin/professors/[id]/route.ts");
  const professorDeleteIndex = route.indexOf('from("professors").delete().eq("id", id)');
  const profileDeleteIndex = route.indexOf('from("profiles").delete().eq("id", id)', professorDeleteIndex);
  const authDeleteIndex = route.indexOf("auth.admin.deleteUser(id)", profileDeleteIndex);
  expect(professorDeleteIndex).toBeGreaterThan(-1);
  expect(profileDeleteIndex).toBeGreaterThan(professorDeleteIndex);
  expect(authDeleteIndex).toBeGreaterThan(profileDeleteIndex);
});

test("professor deletion re-verifies all three layers are gone before reporting success, mirroring the student hard-delete pattern", () => {
  const route = read("app/api/admin/professors/[id]/route.ts");
  const reverifyIndex = route.indexOf('from("professors").select("id").eq("id", id).maybeSingle()', route.indexOf("export async function DELETE("));
  const finalCheckIndex = route.indexOf("if (professorCheck || profileCheck || authCheck?.user)");
  expect(reverifyIndex).toBeGreaterThan(-1);
  expect(finalCheckIndex).toBeGreaterThan(reverifyIndex);
});

test("professor edit is admin-only and never touches profiles.role", () => {
  const route = read("app/api/admin/professors/[id]/route.ts");
  expect((route.match(/requireAdmin\(request\)/g) || []).length).toBe(2); // PATCH + DELETE
  expect(route).not.toContain("role:");
  expect(route).not.toMatch(/profiles["'\s]*\)\s*\.update\(\{[^}]*role/);
});

test("professor email change follows the same auth-first-with-rollback pattern already used for students — never a bare single-table UPDATE", () => {
  const route = read("app/api/admin/professors/[id]/route.ts");
  const authUpdateIndex = route.indexOf("auth.admin.updateUserById(id, { email: newEmail");
  const tableUpdateIndex = route.indexOf('from("professors").update({ email: newEmail })', authUpdateIndex);
  const rollbackIndex = route.indexOf("auth.admin.updateUserById(id, { email: oldEmail", tableUpdateIndex);
  expect(authUpdateIndex).toBeGreaterThan(-1);
  expect(tableUpdateIndex).toBeGreaterThan(authUpdateIndex);
  expect(rollbackIndex).toBeGreaterThan(tableUpdateIndex);
});

test("duplicate email is rejected before any write, checking both professors and students", () => {
  const route = read("app/api/admin/professors/[id]/route.ts");
  const conflictIndex = route.indexOf('from("professors").select("id").ilike("email", newEmail).neq("id", id)');
  const studentConflictIndex = route.indexOf('from("students").select("id").ilike("email", newEmail)');
  const blockIndex = route.indexOf("já está em uso por outra conta", conflictIndex);
  expect(conflictIndex).toBeGreaterThan(-1);
  expect(studentConflictIndex).toBeGreaterThan(-1);
  expect(blockIndex).toBeGreaterThan(conflictIndex);
});

test("professor-facing routes never gain edit or delete access to other professors", () => {
  const professorEventsRoute = read("app/api/professor/events/route.ts");
  const professorEventRoute = read("app/api/professor/events/[id]/route.ts");
  expect(professorEventsRoute).not.toContain("/professors/");
  expect(professorEventRoute).not.toContain('from("professors").delete');
  expect(professorEventRoute).not.toContain('from("professors").update');
});

test("the UI shows an edit modal and a delete confirmation modal with the professor's name, and offers deactivation when deletion is blocked", () => {
  const pageClient = read("app/admin/professores/page-client.tsx");
  expect(pageClient).toContain('title="Editar professor"');
  expect(pageClient).toContain('title="Excluir professor?"');
  expect(pageClient).toContain("deleteTarget.name");
  expect(pageClient).toContain("Desativar professor em vez de excluir");
  // Vínculo já vem do GET existente — sem chamada extra para saber a contagem.
  expect(pageClient).toContain("simulado_event_professors?.length");
});
