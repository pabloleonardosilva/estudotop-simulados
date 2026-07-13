import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isApprovedStudentForPasswordRecovery } from "../../lib/auth/passwordRecoveryPolicy";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

test("only an approved active student with active student profile is eligible", () => {
  const approved = { status: "active", approved_at: "2026-07-13T12:00:00Z" };
  const activeProfile = { role: "student", is_active: true };
  expect(isApprovedStudentForPasswordRecovery(approved, activeProfile)).toBeTruthy();
  expect(isApprovedStudentForPasswordRecovery({ ...approved, status: "pending" }, activeProfile)).toBeFalsy();
  expect(isApprovedStudentForPasswordRecovery({ ...approved, approved_at: null }, activeProfile)).toBeFalsy();
  expect(isApprovedStudentForPasswordRecovery(approved, { ...activeProfile, is_active: false })).toBeFalsy();
  expect(isApprovedStudentForPasswordRecovery(approved, { role: "admin", is_active: true })).toBeFalsy();
  expect(isApprovedStudentForPasswordRecovery(null, activeProfile)).toBeFalsy();
});

test("forgot-password request is server mediated and uses the canonical public URL", () => {
  const page = read("app/esqueci-senha/page.tsx");
  const route = read("app/api/auth/forgot-password/route.ts");
  expect(page).toContain('/api/auth/forgot-password');
  expect(page).not.toContain("resetPasswordForEmail");
  expect(page).not.toContain("window.location.origin");
  expect(route).toContain("getApprovedStudentForPasswordRecovery");
  expect(route).toContain("getPublicAppUrl()");
  expect(route).toContain('`${getPublicAppUrl()}/redefinir-senha`');
  expect(route).toContain("resetPasswordForEmail(student.email");
});

test("public response does not enumerate pending or unknown accounts", () => {
  const route = read("app/api/auth/forgot-password/route.ts");
  expect(route).toContain("Se este e-mail pertencer a um aluno aprovado");
  expect(route).toContain("if (!student) return NextResponse.json({ ok: true, message: PUBLIC_MESSAGE })");
  expect(route).not.toContain("Aluno pendente");
});

test("password update endpoint rechecks approval before changing Auth", () => {
  const route = read("app/api/auth/reset-password/route.ts");
  const eligibilityIndex = route.indexOf("getApprovedStudentForPasswordRecovery");
  const updateIndex = route.indexOf("updateUserById");
  expect(eligibilityIndex).toBeGreaterThan(-1);
  expect(updateIndex).toBeGreaterThan(eligibilityIndex);
  expect(route).toContain("PASSWORD_RECOVERY_NOT_ALLOWED");
  expect(route).not.toContain("must_change_password:");
  expect(route).not.toContain('status: "active"');
});

test("reset page processes every supported recovery callback before submitting", () => {
  const page = read("app/redefinir-senha/page.tsx");
  expect(page).toContain("PASSWORD_RECOVERY");
  expect(page).toContain("verifyOtp({ token_hash: tokenHash, type: \"recovery\" })");
  expect(page).toContain("exchangeCodeForSession(code)");
  expect(page).toContain("new URLSearchParams(url.hash");
  expect(page).toContain("recoveryAccessToken");
  expect(page).toContain('window.history.replaceState({}, "", "/redefinir-senha")');
  expect(page.indexOf("useEffect(")).toBeLessThan(page.indexOf("handleUpdatePassword"));
});
