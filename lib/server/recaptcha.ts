import "server-only";

const RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
const RECAPTCHA_MIN_SCORE = 0.5;

type RecaptchaResponse = {
  success?: boolean;
  score?: number;
  action?: string;
};

export async function verifyRecaptchaToken(token: string, expectedAction: string) {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return { ok: false as const, reason: "recaptcha_not_configured" };

  try {
    const body = new URLSearchParams({ secret, response: token });
    const response = await fetch(RECAPTCHA_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    const result = (await response.json().catch(() => null)) as RecaptchaResponse | null;
    const ok = Boolean(
      response.ok
      && result?.success
      && result.action === expectedAction
      && typeof result.score === "number"
      && result.score >= RECAPTCHA_MIN_SCORE,
    );

    return ok ? { ok: true as const } : { ok: false as const, reason: "recaptcha_rejected" };
  } catch {
    return { ok: false as const, reason: "recaptcha_unavailable" };
  }
}
