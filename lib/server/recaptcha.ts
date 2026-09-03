import "server-only";

const RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
const DEFAULT_RECAPTCHA_MIN_SCORE = 0.5;

type RecaptchaResponse = {
  success?: boolean;
  score?: number;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
};

type RecaptchaDiagnostics = {
  captchaSuccess: boolean;
  score: number | null;
  action: string | null;
  hostname: string | null;
  errorCodes: string[];
};

export async function verifyRecaptchaToken(
  token: string,
  expectedAction: string,
  options: { minScore?: number } = {},
) {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return { ok: false as const, reason: "recaptcha_not_configured" };
  const minScore = options.minScore ?? DEFAULT_RECAPTCHA_MIN_SCORE;

  try {
    const body = new URLSearchParams({ secret, response: token });
    const response = await fetch(RECAPTCHA_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    const result = (await response.json().catch(() => null)) as RecaptchaResponse | null;
    const diagnostics: RecaptchaDiagnostics = {
      captchaSuccess: result?.success === true,
      score: typeof result?.score === "number" ? result.score : null,
      action: typeof result?.action === "string" ? result.action : null,
      hostname: typeof result?.hostname === "string" ? result.hostname : null,
      errorCodes: Array.isArray(result?.["error-codes"])
        ? result["error-codes"].filter((code): code is string => typeof code === "string")
        : [],
    };
    const ok = Boolean(
      response.ok
      && result?.success
      && result.action === expectedAction
      && typeof result.score === "number"
      && result.score >= minScore,
    );

    return ok
      ? { ok: true as const, diagnostics }
      : { ok: false as const, reason: "recaptcha_rejected", diagnostics };
  } catch {
    return { ok: false as const, reason: "recaptcha_unavailable" };
  }
}
