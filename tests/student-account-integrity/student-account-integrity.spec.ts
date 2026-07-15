import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

test("migration protects normalized email and CPF", () => {
  const sql = read("supabase/migrations/20260713090000_student_account_integrity.sql");
  expect(sql).toContain("students_email_normalized_unique");
  expect(sql).toContain("lower(btrim(email))");
  expect(sql).toContain("students_cpf_normalized_unique");
  expect(sql).toContain("where cpf is not null");
});

test("diagnostic classifies account integrity states and admins", () => {
  const sql = read("supabase/migrations/20260713090000_student_account_integrity.sql");
  for (const classification of ["COMPLETE", "AUTH_WITHOUT_STUDENT", "PROFILE_WITHOUT_STUDENT", "CONFIRMATION_WITHOUT_ACCOUNT", "STUDENT_WITHOUT_AUTH", "EMAIL_MISMATCH", "ROLE_MISMATCH", "ADMIN"]) {
    expect(sql).toContain(`'${classification}'`);
  }
});

test("cleanup excludes admins and defaults to rollback", () => {
  const sql = read("scripts/sql/student-account-integrity-cleanup.sql");
  expect(sql).toContain("coalesce(i.role, 'student') <> 'admin'");
  expect(sql.trim().toLowerCase()).toMatch(/rollback;$/);
  expect(sql.toLowerCase()).not.toContain("delete from auth.users");
});

test("service exposes stable safe error codes and compensating rollback", () => {
  const source = read("lib/server/studentAccountService.ts");
  for (const code of ["STUDENT_EMAIL_ALREADY_EXISTS", "STUDENT_EMAIL_USED_BY_ADMIN", "STUDENT_CPF_ALREADY_EXISTS", "STUDENT_AUTH_CREATION_FAILED", "STUDENT_PROFILE_CREATION_FAILED", "STUDENT_RECORD_CREATION_FAILED", "STUDENT_ACCOUNT_INCOMPLETE", "STUDENT_EMAIL_UPDATE_FAILED", "STUDENT_UPDATE_ROLLBACK_FAILED", "INTERNAL_ERROR"]) {
    expect(source).toContain(`"${code}"`);
  }
  expect(source).toContain("rollbackCreatedAccount");
  expect(source).not.toContain("service_role");
});

test("creation routes use the central account service", () => {
  expect(read("app/api/admin/students/create/route.ts")).toContain("createStudentAccount");
  expect(read("app/api/auth/confirm-registration/route.ts")).toContain("createStudentAccount");
  expect(read("app/api/admin/students/[id]/route.ts")).toContain("updateStudentAccountEmail");
  expect(read("app/api/admin/students/[id]/approve/route.ts")).toContain("validateStudentAccountIntegrity");
});

test("auth lookup isolates unreadable users when a batch fails", () => {
  const source = read("lib/server/studentAccountRepair.ts");
  expect(source).toContain("LIST_USERS_SINGLE_ITEM_PAGE_SIZE");
  expect(source).toContain("singleUserError) continue");
  expect(source).toContain("page: position");
});

test("invalid public signup code is cleared and replaced automatically", () => {
  const route = read("app/api/auth/confirm-registration/route.ts");
  const page = read("app/cadastro/page.tsx");
  expect(route).toContain("INVALID_CODE_NEW_CODE_SENT");
  expect(route).toContain("INVALID_CODE_RESEND_COOLDOWN");
  expect(route).toContain('metadata: { source: "invalid_code_resend" }');
  expect(page).toContain('if (data.clear_code) setCode("")');
  expect(page).toContain("data.resend_message");
});

test("journey enrollment sends and tracks the journey and released-simulado emails", () => {
  const assignmentRoute = read("app/api/admin/jornadas/[id]/students/route.ts");
  const studentPage = read("app/admin/alunos/[id]/page.tsx");
  const studentClient = read("app/admin/alunos/[id]/page-client.tsx");
  const journeyClient = read("app/admin/jornadas/[id]/page-client.tsx");

  expect(assignmentRoute).toContain("simuladoReleasedTemplate");
  expect(assignmentRoute).toContain("simulado_release_email_sent");
  expect(assignmentRoute).toContain("release_email_sent_at");
  expect(assignmentRoute).toContain("if (releaseEmailError) throw releaseEmailError");
  expect(assignmentRoute).toContain("JORNADA_EMAIL_INTERVAL_MS = 10_000");
  expect(assignmentRoute).toContain("setTimeout(resolve, JORNADA_EMAIL_INTERVAL_MS)");
  expect(studentPage).toContain("welcome_email_sent_at");
  expect(studentPage).toContain("release_email_sent_at");
  expect(studentClient).toContain("Simulado —");
  expect(journeyClient).toContain("`/admin/alunos/${sj.student_id}`");
});

test("student simulados exclude cancelled journeys and completion advances journey progress", () => {
  const listRoute = read("app/api/student/simulados/route.ts");
  const submitRoute = read("app/api/student/simulados/[id]/attempts/[attemptId]/submit/route.ts");
  const releaseJob = read("app/api/admin/jornadas/release-job/route.ts");
  const vercelConfig = JSON.parse(read("vercel.json")) as { crons: Array<{ path: string; schedule: string }> };

  expect(listRoute).toContain('.eq("status", "active")');
  expect(listRoute).toContain('.gt("expires_at"');
  expect(submitRoute).toContain('.update({ status: "completed", completed_at: finishedAt })');
  expect(submitRoute).toContain('.eq("order_number", completedItem.order_number + 1)');
  expect(submitRoute).toContain('.lte("scheduled_release_at", today)');
  expect(submitRoute).toContain('.update({ status: "available", released_at: releaseTimestamp })');
  expect(submitRoute).toContain("after(async () =>");
  expect(submitRoute).toContain("simuladoReleasedTemplate(emailParams)");
  expect(releaseJob).toContain('.from("simulado_attempts")');
  expect(releaseJob).toContain('.eq("counts_toward_limit", true)');
  expect(releaseJob).not.toContain('.eq("order_number", candidate.order_number + 1)');
  expect(vercelConfig.crons).toContainEqual({
    path: "/api/admin/jornadas/release-job",
    schedule: "0 7 * * *",
  });
});

test("admin reset removes attempt history and completed journeys remain available for retakes", () => {
  const adminRoute = read("app/api/admin/student-jornadas/[studentJornadaId]/simulados/[studentJornadaSimuladoId]/route.ts");
  const assertions = read("lib/server/studentAssertions.ts");
  const attemptsRoute = read("app/api/student/simulados/[id]/attempts/route.ts");
  const adminClient = read("app/admin/alunos/[id]/page-client.tsx");

  expect(adminRoute).toContain("resetSimuladoHistory");
  expect(adminRoute).toContain('.from("simulado_attempts")');
  expect(adminRoute).toContain("ON DELETE CASCADE");
  expect(adminRoute).toContain("resyncTopCoinEarnings(supabase, studentId, simuladoId)");
  expect(adminRoute).toContain('.update({ status: resetStatus, completed_at: null })');
  expect(adminRoute).toContain("Tentativas zeradas. O histórico deste simulado foi removido para este aluno.");
  expect(assertions).toContain('const START_STATUSES = ["available", "in_progress", "completed"]');
  expect(assertions).toContain("allowedStatuses.includes(row.status) || Boolean(row.released_at)");
  expect(attemptsRoute).toContain('(!jornadaSimulado.released_at && !["available", "in_progress", "completed"].includes(jornadaSimulado.status))');
  expect(adminClient).toContain("Sim, zerar tentativas");
  expect(adminClient).toContain("As anotações do caderno serão preservadas.");
});

test("public registration identifies every duplicated field without exposing account data", () => {
  const route = read("app/api/auth/register/route.ts");
  expect(route).toContain('duplicate_fields: duplicateFields');
  expect(route).toContain("O e-mail e o CPF informados já estão vinculados a uma conta.");
  expect(route).toContain("O e-mail informado já está vinculado a uma conta.");
  expect(route).toContain("O CPF informado já está vinculado a uma conta.");
  expect(route).not.toContain("duplicate_values");
});

test("public registration reports and highlights every missing required field", () => {
  const route = read("app/api/auth/register/route.ts");
  const page = read("app/cadastro/page.tsx");
  expect(route).toContain("fields: missingFields");
  expect(page).toContain("Preencha os campos obrigatórios:");
  expect(page).toContain('setInvalidFields(missingFields)');
  expect(page).toContain('aria-invalid={invalidFields.includes("fullName")}');
  expect(page).toContain('aria-invalid={invalidFields.includes("whatsapp")}');
  expect(page).toContain('aria-invalid={invalidFields.includes("email") || emailInvalid}');
  expect(page).toContain('aria-invalid={invalidFields.includes("cpf") || cpfInvalid}');
  expect(page).toContain('aria-invalid={invalidFields.includes("desiredContests")}');
});

test("empty public registration highlights all required inputs in the interface", async ({ page }) => {
  await page.goto("/cadastro");
  await page.getByRole("button", { name: "Enviar código de confirmação" }).click();

  await expect(page.getByText("Preencha os campos obrigatórios: nome completo, WhatsApp, melhor e-mail, CPF e concursos desejados.")).toBeVisible();
  await expect(page.locator('form input[aria-invalid="true"], form textarea[aria-invalid="true"]')).toHaveCount(5);
});
