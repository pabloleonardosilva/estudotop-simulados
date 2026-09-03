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
  expect(route).toContain('`${getPublicAppUrl()}/redefinir-senha?token=');
  expect(route).toContain("sendPasswordRecoveryEmail");
  expect(route).toContain('supabase.rpc("create_password_recovery_request"');
  expect(route).toContain('supabase.rpc("mark_password_recovery_email_sent"');
  expect(route).not.toContain("resetPasswordForEmail");
});

test("public response does not enumerate pending or unknown accounts", () => {
  const route = read("app/api/auth/forgot-password/route.ts");
  expect(route).toContain("Se este e-mail pertencer a uma conta ativa");
  expect(route).toContain("if (!account) return NextResponse.json({ ok: true, message: PUBLIC_MESSAGE })");
  expect(route).toContain('event: "password_recovery_rate_limited"');
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
  expect(page).toContain("privateRecoveryToken");
  expect(page).toContain('url.searchParams.get("token")');
  expect(page).toContain('href="/esqueci-senha"');
  expect(page).toContain('window.history.replaceState({}, "", "/redefinir-senha")');
  expect(page.indexOf("useEffect(")).toBeLessThan(page.indexOf("handleUpdatePassword"));
});

test("private recovery uses an atomic claim and only consumes after Auth succeeds", () => {
  const route = read("app/api/auth/reset-password/route.ts");
  const policy = route.indexOf("const policyError = passwordPolicyError", route.indexOf("resetWithPrivateToken"));
  const claim = route.indexOf('supabase.rpc("claim_password_recovery_request"', policy);
  const authUpdate = route.indexOf("auth.admin.updateUserById", claim);
  const complete = route.indexOf('supabase.rpc("complete_password_recovery_request"', authUpdate);
  expect(policy).toBeGreaterThan(-1);
  expect(claim).toBeGreaterThan(policy);
  expect(authUpdate).toBeGreaterThan(claim);
  expect(complete).toBeGreaterThan(authUpdate);
  expect(route).toContain('supabase.rpc("release_password_recovery_claim"');
  expect(route).toContain('event: "password_recovery_completed"');
});

test("password recovery migration enforces lifecycle, rate limits, lease and server-only access", () => {
  const migration = read("supabase/migrations/20260903120000_create_password_recovery_requests.sql");
  expect(migration).toContain("create table if not exists public.password_recovery_requests");
  expect(migration).toContain("references auth.users(id) on delete cascade");
  expect(migration).toContain("unique (token_hash)");
  expect(migration).toContain("status in ('pending', 'processing', 'used', 'failed')");
  expect(migration).toContain("interval '60 seconds'");
  expect(migration).toContain("interval '1 hour'");
  expect(migration).toContain(">= 5");
  expect(migration).toContain("interval '5 minutes'");
  expect(migration).toContain("pg_advisory_xact_lock");
  expect(migration).toContain("unique_password_recovery_requests_active_user");
  expect(migration).toContain("recovery.email_sent_at is not null");
  expect(migration).toContain("status = 'used', used_at = clock_timestamp()");
  expect(migration).toContain("status = case when expires_at > clock_timestamp() then 'pending' else 'failed' end");
  expect(migration).toContain("enable row level security");
  expect(migration).toContain("from public, anon, authenticated");
  expect(migration).toContain("to service_role");
});

test("admin reset and first access keep their dedicated first-access flow", () => {
  expect(read("app/api/admin/students/[id]/reset-password/route.ts")).toContain("sendFirstAccessEmail");
  expect(read("app/api/auth/first-access/route.ts")).toContain('.eq("purpose", "first_access")');
});
