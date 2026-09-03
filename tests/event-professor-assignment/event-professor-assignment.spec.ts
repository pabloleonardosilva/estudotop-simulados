import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

test("admin event PATCH already supports zero/one/many professors — applies additions before removals, no migration needed", () => {
  const route = read("app/api/admin/events/[id]/route.ts");

  // Backend já aceita professor_ids como lista (0, 1 ou N), valida todos os
  // UUIDs contra a tabela professors antes de aplicar qualquer coisa.
  expect(route).toContain(
    'const professorIds = Array.isArray(body.professor_ids) ? [...new Set(body.professor_ids.filter((value): value is string => typeof value === "string"))] : null;',
  );
  expect(route).toContain('supabase.from("professors").select("id").in("id", professorIds)');

  const additionsIndex = route.indexOf("if (additions.length) {");
  const removalsIndex = route.indexOf("if (removals.length) {");
  expect(additionsIndex).toBeGreaterThan(-1);
  expect(removalsIndex).toBeGreaterThan(additionsIndex);

  // (event_id, professor_id) já é único no schema — remoção é escopada ao
  // Evento atual, nunca afeta vínculos de outros Eventos.
  expect(route).toContain('.from("simulado_event_professors").delete().eq("event_id", id).in("professor_id", removals)');
  expect(route).toContain('.from("simulado_event_professors").insert(additions.map((professorId) => ({ event_id: id, professor_id: professorId })))');

  // Guard: só Admin altera o Evento (e, portanto, os professores atribuídos).
  expect(route).toContain("const admin = await requireAdmin(request);");
});

test("event duplication keeps copying assigned professors, unchanged by this UI-only change", () => {
  const route = read("app/api/admin/events/[id]/route.ts");
  const duplicateIndex = route.indexOf('body.action === "duplicate"');
  const copyAssignmentsIndex = route.indexOf('supabase.from("simulado_event_professors").select("professor_id").eq("event_id", id)', duplicateIndex);
  const insertCopyIndex = route.indexOf("event_id: duplicated.id, professor_id: item.professor_id", copyAssignmentsIndex);
  expect(duplicateIndex).toBeGreaterThan(-1);
  expect(copyAssignmentsIndex).toBeGreaterThan(duplicateIndex);
  expect(insertCopyIndex).toBeGreaterThan(copyAssignmentsIndex);
});

test("admin professor listing stays admin-only and only exposes id/name/email to the assignment UI (no phone/whatsapp)", () => {
  const professorsRoute = read("app/api/admin/professors/route.ts");
  expect(professorsRoute).toContain("const admin = await requireAdmin(request);");

  const eventRoute = read("app/api/admin/events/[id]/route.ts");
  expect(eventRoute).toContain(
    "simulado_event_professors(professor_id,professors:professor_id(id,name,email))",
  );
  expect(eventRoute).not.toMatch(/professors:professor_id\([^)]*phone/);
});

test("ProfessorAssignmentPicker never duplicates an already-selected professor and removal is purely local (no autosave)", () => {
  const picker = read("app/admin/eventos/[id]/ProfessorAssignmentPicker.tsx");

  // Resultados da busca excluem quem já está selecionado.
  expect(picker).toContain(".filter((professor) => !selectedIds.includes(professor.id))");
  // Adicionar/remover só chamam onChange (estado do formulário pai) — nunca
  // fetch/adminFetch dentro do próprio componente.
  expect(picker).toContain("onChange([...selectedIds, id]);");
  expect(picker).toContain("onChange(selectedIds.filter((professorId) => professorId !== id));");
  expect(picker).not.toContain("fetch(");
  expect(picker).not.toContain("adminFetch");

  // Busca é case-insensitive por nome OU e-mail.
  expect(picker).toContain("professor.name.toLowerCase().includes(term) || professor.email.toLowerCase().includes(term)");

  // Placeholder exato pedido.
  expect(picker).toContain('placeholder="Buscar professor por nome ou e-mail"');

  // Acessibilidade mínima: label associado ao campo de busca, combobox com
  // listbox e aria-label nos botões de remoção.
  expect(picker).toContain('htmlFor="professor-assignment-search"');
  expect(picker).toContain('id="professor-assignment-search"');
  expect(picker).toContain('role="combobox"');
  expect(picker).toContain('role="listbox"');
  expect(picker).toContain("aria-label={`Remover ${professor.name}");

  // Resultados limitados (sem paginação complexa) para listas grandes.
  expect(picker).toContain(".slice(0, 30);");
});

test("the professor assignment list is wired into the existing Evento edit form — same submit, no separate save button", () => {
  const page = read("app/admin/eventos/[id]/page-client.tsx");
  const pickerIndex = page.indexOf("<ProfessorAssignmentPicker");
  const formOpenIndex = page.indexOf('<form onSubmit={save}');
  const saveButtonIndex = page.indexOf('type="submit" variant="dark-primary" disabled={saving}', pickerIndex);

  expect(pickerIndex).toBeGreaterThan(-1);
  expect(formOpenIndex).toBeGreaterThan(-1);
  expect(formOpenIndex).toBeLessThan(pickerIndex);
  expect(saveButtonIndex).toBeGreaterThan(pickerIndex);

  // O payload de PATCH continua enviando professor_ids junto com os demais
  // campos do Evento, no mesmo submit — sem endpoint/autosave separado.
  expect(page).toContain("professor_ids: form.professorIds,");

  // Estado inicial: professores já vinculados carregam a partir do próprio
  // Evento (persistência após reload), nunca de um estado vazio fixo.
  expect(page).toContain("professorIds: event.simulado_event_professors.map((item) => item.professor_id),");
});

test("professor inactive after being assigned stays visible for removal, but cannot be newly assigned (existing rule, unchanged)", () => {
  const page = read("app/admin/eventos/[id]/page-client.tsx");
  expect(page).toContain(
    'setProfessors((professorJson.professors || []).filter((item: Professor) => item.status === "active" || eventJson.event?.simulado_event_professors?.some((link: { professor_id: string }) => link.professor_id === item.id)));',
  );
});

test("professor cannot alter event professors — professor-facing routes never write simulado_event_professors", () => {
  const eventsRoute = read("app/api/professor/events/route.ts");
  const eventDetailRoute = read("app/api/professor/events/[id]/route.ts");
  expect(eventsRoute).not.toMatch(/simulado_event_professors["'`]\)\s*\.\s*(insert|update|delete|upsert)/);
  expect(eventDetailRoute).not.toMatch(/simulado_event_professors["'`]\)\s*\.\s*(insert|update|delete|upsert)/);

  // Guards inalterados: professor só enxerga Eventos aos quais foi
  // atribuído; acesso a um Evento específico exige a mesma atribuição.
  expect(eventsRoute).toContain('supabase.from("simulado_event_professors").select("event_id,simulado_events:event_id(*,simulados:simulado_id(id,title))").eq("professor_id", professor.id)');
  const authGuard = read("lib/server/authGuard.ts");
  const requireEventManagerIndex = authGuard.indexOf("export async function requireEventManager(request: Request, eventId: string)");
  const assignmentSelectIndex = authGuard.indexOf('.from("simulado_event_professors")', requireEventManagerIndex);
  const eventIdEqIndex = authGuard.indexOf('.eq("event_id", eventId)', assignmentSelectIndex);
  const professorIdEqIndex = authGuard.indexOf('.eq("professor_id", professor.id)', eventIdEqIndex);
  const deniedIndex = authGuard.indexOf('if (!assignment) return NextResponse.json({ ok: false, message: "Acesso negado a este Evento." }, { status: 403 });', professorIdEqIndex);
  expect(requireEventManagerIndex).toBeGreaterThan(-1);
  expect(assignmentSelectIndex).toBeGreaterThan(requireEventManagerIndex);
  expect(eventIdEqIndex).toBeGreaterThan(assignmentSelectIndex);
  expect(professorIdEqIndex).toBeGreaterThan(eventIdEqIndex);
  expect(deniedIndex).toBeGreaterThan(professorIdEqIndex);
});
