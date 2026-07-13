export type PasswordPolicyContext = {
  fullName?: string | null;
  email?: string | null;
  cpf?: string | null;
  phone?: string | null;
};

export type PasswordRuleId = "length" | "uppercase" | "lowercase" | "number" | "symbol" | "number_sequence" | "repeated_characters" | "personal_data";

export type PasswordRuleResult = { id: PasswordRuleId; label: string; passed: boolean };
export type PasswordValidationResult = { valid: boolean; rules: PasswordRuleResult[]; errors: string[] };

export const PASSWORD_ERROR_MESSAGES: Record<string, string> = {
  PASSWORD_REQUIRED: "Informe a nova senha.",
  PASSWORD_TOO_SHORT: "A senha deve possuir pelo menos 8 caracteres.",
  PASSWORD_TOO_LONG: "A senha deve possuir no máximo 64 caracteres.",
  PASSWORD_UPPERCASE_REQUIRED: "A senha deve conter pelo menos uma letra maiúscula.",
  PASSWORD_LOWERCASE_REQUIRED: "A senha deve conter pelo menos uma letra minúscula.",
  PASSWORD_NUMBER_REQUIRED: "A senha deve conter pelo menos um número.",
  PASSWORD_SYMBOL_REQUIRED: "A senha deve conter pelo menos um símbolo especial.",
  PASSWORD_NUMBER_SEQUENCE_NOT_ALLOWED: "A senha não pode conter três números consecutivos em sequência.",
  PASSWORD_REPEATED_CHARACTERS_NOT_ALLOWED: "A senha não pode conter três caracteres iguais consecutivos.",
  PASSWORD_CONTAINS_PERSONAL_DATA: "A senha não pode conter seu nome, e-mail, CPF ou telefone.",
  PASSWORD_CONFIRMATION_MISMATCH: "A confirmação da senha está diferente da nova senha.",
  PASSWORD_POLICY_VIOLATION: "A senha não atende aos requisitos de segurança.",
};

const PARTICLES = new Set(["de", "da", "do", "das", "dos", "e"]);

export function normalizePersonalText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function hasAscendingOrDescendingNumberSequence(password: string): boolean {
  for (let index = 0; index <= password.length - 3; index++) {
    const group = password.slice(index, index + 3);
    if (!/^\d{3}$/.test(group)) continue;
    const [first, second, third] = group.split("").map(Number);
    if ((second === first + 1 && third === second + 1) || (second === first - 1 && third === second - 1)) return true;
  }
  return false;
}

export function hasTripleRepeatedCharacter(password: string): boolean {
  const characters = Array.from(password);
  return characters.some((character, index) => index >= 2 && character === characters[index - 1] && character === characters[index - 2]);
}

export function containsPersonalData(password: string, context: PasswordPolicyContext = {}): boolean {
  const normalizedPassword = normalizePersonalText(password);
  if (!normalizedPassword) return false;

  const candidates = new Set<string>();
  const nameParts = (context.fullName || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length >= 3 && !PARTICLES.has(part));
  nameParts.forEach((part) => candidates.add(part));
  if (nameParts.length > 1) candidates.add(nameParts.join(""));

  const emailLocal = (context.email || "").split("@")[0];
  const normalizedEmailLocal = normalizePersonalText(emailLocal);
  if (normalizedEmailLocal.length >= 3) candidates.add(normalizedEmailLocal);

  const cpf = (context.cpf || "").replace(/\D/g, "");
  if (cpf.length === 11) candidates.add(cpf);

  const phone = (context.phone || "").replace(/\D/g, "");
  if (phone.length >= 10) {
    candidates.add(phone);
    candidates.add(phone.slice(-11));
    candidates.add(phone.slice(-10));
  }

  return Array.from(candidates).some((candidate) => candidate.length >= 3 && normalizedPassword.includes(candidate));
}

export function getPasswordRuleResults(password: string, context: PasswordPolicyContext = {}): PasswordRuleResult[] {
  return [
    { id: "length", label: "De 8 a 64 caracteres", passed: password.length >= 8 && password.length <= 64 },
    { id: "uppercase", label: "Pelo menos uma letra maiúscula", passed: /[A-ZÀ-ÖØ-Þ]/u.test(password) },
    { id: "lowercase", label: "Pelo menos uma letra minúscula", passed: /[a-zà-öø-ÿ]/u.test(password) },
    { id: "number", label: "Pelo menos um número", passed: /\d/u.test(password) },
    { id: "symbol", label: "Pelo menos um símbolo especial", passed: /[^\p{L}\p{N}\s]/u.test(password) },
    { id: "number_sequence", label: "Não conter três números em sequência", passed: !hasAscendingOrDescendingNumberSequence(password) },
    { id: "repeated_characters", label: "Não conter três caracteres iguais consecutivos", passed: !hasTripleRepeatedCharacter(password) },
    { id: "personal_data", label: "Não conter seu nome, e-mail, CPF ou telefone", passed: !containsPersonalData(password, context) },
  ];
}

export function validatePassword(password: string, context: PasswordPolicyContext = {}): PasswordValidationResult {
  const rules = getPasswordRuleResults(password, context);
  const errors = rules.filter((rule) => !rule.passed).map((rule) => rule.id);
  return { valid: password.length > 0 && errors.length === 0, rules, errors };
}

export function passwordPolicyError(password: string, confirmation: string | undefined, context: PasswordPolicyContext = {}) {
  if (!password) return { code: "PASSWORD_REQUIRED", message: PASSWORD_ERROR_MESSAGES.PASSWORD_REQUIRED, violations: ["required"] };
  if (!confirmation || password !== confirmation) return { code: "PASSWORD_CONFIRMATION_MISMATCH", message: PASSWORD_ERROR_MESSAGES.PASSWORD_CONFIRMATION_MISMATCH, violations: ["confirmation"] };
  const validation = validatePassword(password, context);
  if (validation.valid) return null;
  const singleCodes: Partial<Record<PasswordRuleId, string>> = {
    length: password.length < 8 ? "PASSWORD_TOO_SHORT" : "PASSWORD_TOO_LONG",
    uppercase: "PASSWORD_UPPERCASE_REQUIRED",
    lowercase: "PASSWORD_LOWERCASE_REQUIRED",
    number: "PASSWORD_NUMBER_REQUIRED",
    symbol: "PASSWORD_SYMBOL_REQUIRED",
    number_sequence: "PASSWORD_NUMBER_SEQUENCE_NOT_ALLOWED",
    repeated_characters: "PASSWORD_REPEATED_CHARACTERS_NOT_ALLOWED",
    personal_data: "PASSWORD_CONTAINS_PERSONAL_DATA",
  };
  const code = validation.errors.length === 1 ? singleCodes[validation.errors[0] as PasswordRuleId] || "PASSWORD_POLICY_VIOLATION" : "PASSWORD_POLICY_VIOLATION";
  return { code, message: PASSWORD_ERROR_MESSAGES[code], violations: validation.errors };
}
