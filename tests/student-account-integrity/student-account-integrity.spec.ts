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
