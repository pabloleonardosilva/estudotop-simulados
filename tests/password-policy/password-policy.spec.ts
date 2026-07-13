import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { containsPersonalData, hasAscendingOrDescendingNumberSequence, hasTripleRepeatedCharacter, passwordPolicyError, validatePassword } from "../../lib/auth/passwordPolicy";
import { generateTemporaryPassword } from "../../lib/utils/password";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

test("enforces length and required composition", () => {
  expect(validatePassword("Aa@1bcx").valid).toBeFalsy();
  expect(validatePassword("Aa@1bcxy").valid).toBeTruthy();
  expect(validatePassword("Aa@1" + "bC2!".repeat(15)).valid).toBeTruthy();
  expect(validatePassword("Aa@1" + "bC2!".repeat(15) + "z").valid).toBeFalsy();
  expect(validatePassword("aa@1bcxy").valid).toBeFalsy();
  expect(validatePassword("AA@1BCXY").valid).toBeFalsy();
  expect(validatePassword("Aa@bcxyz").valid).toBeFalsy();
  expect(validatePassword("Aa12bcxy").valid).toBeFalsy();
  expect(validatePassword("").valid).toBeFalsy();
  expect(validatePassword("        ").valid).toBeFalsy();
  expect(validatePassword("Aa@1 bcD").valid).toBeTruthy();
});

test("detects only adjacent ascending and descending numeric sequences", () => {
  for (const value of ["012", "123", "234", "345", "456", "567", "678", "789", "987", "876", "765", "654", "543", "432", "321", "210", "1234", "6543"]) {
    expect(hasAscendingOrDescendingNumberSequence(`Aa@x${value}`)).toBeTruthy();
  }
  expect(hasAscendingOrDescendingNumberSequence("Aa@135x")).toBeFalsy();
  expect(hasAscendingOrDescendingNumberSequence("Aa@1a2b3")).toBeFalsy();
});

test("detects exact triple repetition with Unicode support", () => {
  for (const value of ["aaa", "AAA", "111", "@@@", "!!!", "ééé"]) expect(hasTripleRepeatedCharacter(`X${value}y`)).toBeTruthy();
  for (const value of ["aa", "@@", "AaA"]) expect(hasTripleRepeatedCharacter(`X${value}y`)).toBeFalsy();
});

test("blocks normalized personal data without blocking short particles", () => {
  const context = { fullName: "Pablo Leonardo da Silva", email: "pablo.leonardo@gmail.com", cpf: "987.654.321-00", phone: "+55 (11) 99876-5432" };
  for (const password of ["Pablo@27Voa", "Leonardo@27X", "Silva@27Voa", "Pablo.Leonardo@27X", "X@98765432100a", "X@11998765432a"]) {
    expect(containsPersonalData(password, context)).toBeTruthy();
  }
  expect(containsPersonalData("Dado@27Voa", context)).toBeFalsy();
  expect(validatePassword("Coruja@27Voa").valid).toBeTruthy();
  expect(validatePassword("Águia§27Voa").valid).toBeTruthy();
});

test("matches the required acceptance examples", () => {
  expect(validatePassword("Coruja@27Voa").valid).toBeTruthy();
  expect(validatePassword("coruja@27voa").valid).toBeFalsy();
  expect(validatePassword("Coruja27Voa").valid).toBeFalsy();
  expect(validatePassword("Coruja@Voa").valid).toBeFalsy();
  expect(validatePassword("Coruja@123Voa").valid).toBeFalsy();
  expect(validatePassword("Coruja@@@27Voa").valid).toBeFalsy();
  expect(passwordPolicyError("Coruja@27Voa", undefined)?.code).toBe("PASSWORD_CONFIRMATION_MISMATCH");
  expect(passwordPolicyError("Coruja@27Voa", "Outra@27Voa")?.code).toBe("PASSWORD_CONFIRMATION_MISMATCH");
});

test("temporary passwords are cryptographically generated and policy compliant", () => {
  const passwords = Array.from({ length: 25 }, () => generateTemporaryPassword());
  for (const password of passwords) {
    expect(password.length).toBeGreaterThanOrEqual(12);
    expect(validatePassword(password).valid).toBeTruthy();
  }
  expect(new Set(passwords).size).toBe(passwords.length);
  expect(read("lib/utils/password.ts")).not.toContain("Math.random");
});

test("every definitive-password backend uses the central policy", () => {
  for (const path of ["app/api/auth/first-access/route.ts", "app/api/auth/complete-password-change/route.ts", "app/api/auth/reset-password/route.ts"]) {
    expect(read(path)).toContain("passwordPolicyError");
    expect(read(path)).toContain("getPasswordPolicyContext");
  }
});

test("every password screen uses the shared requirements and disables invalid submit", () => {
  for (const path of ["app/primeiro-acesso/page.tsx", "app/alterar-senha/page.tsx", "app/redefinir-senha/page.tsx"]) {
    const source = read(path);
    expect(source).toContain("PasswordRequirements");
    expect(source).toContain("validatePassword");
    expect(source).toContain("disabled={!canSubmit}");
  }
  expect(read("app/alterar-senha/page.tsx")).not.toContain("supabase.auth.updateUser");
  expect(read("app/redefinir-senha/page.tsx")).not.toContain("supabase.auth.updateUser({ password");
});

test("password values are not returned or added to activity logs", () => {
  expect(read("app/api/admin/students/[id]/reset-password/route.ts")).not.toMatch(/return NextResponse\.json\(\{\s*ok: true,[\s\S]*?\n\s*password:/);
  for (const path of ["app/api/auth/first-access/route.ts", "app/api/auth/complete-password-change/route.ts", "app/api/auth/reset-password/route.ts"]) {
    const source = read(path);
    for (const details of source.match(/details:\s*\{[^}]*\}/g) || []) expect(details).not.toMatch(/password|senha/i);
    expect(source).not.toMatch(/console\.log\([^)]*password/);
  }
});

test("first-access interface updates requirements and only enables a valid matching password", async ({ page }) => {
  await page.goto("/primeiro-acesso?token=test-token");
  const submit = page.getByRole("button", { name: "Salvar senha e liberar acesso" });
  await expect(submit).toBeDisabled();
  await page.getByPlaceholder("Nova senha", { exact: true }).fill("Coruja@123Voa");
  await page.getByPlaceholder("Confirmar nova senha", { exact: true }).fill("Coruja@123Voa");
  await expect(page.getByLabel("Não permitido: Não conter três números em sequência")).toBeVisible();
  await expect(submit).toBeDisabled();
  await page.getByPlaceholder("Nova senha", { exact: true }).fill("Coruja@27Voa");
  await page.getByPlaceholder("Confirmar nova senha", { exact: true }).fill("Coruja@27Voa");
  await expect(page.getByLabel("Atendido: Não conter três números em sequência")).toBeVisible();
  await expect(submit).toBeEnabled();
});
