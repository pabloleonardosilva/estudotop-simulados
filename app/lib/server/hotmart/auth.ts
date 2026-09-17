import "server-only";

import { timingSafeEqual } from "node:crypto";

export type HotmartAuthResult =
  | { ok: true }
  | { ok: false; code: "missing_server_secret" | "missing_header" | "invalid_header" };

export function validateHotmartHottok(headerValue: string | null): HotmartAuthResult {
  const secret = process.env.HOTMART_HOTTOK;
  if (!secret) return { ok: false, code: "missing_server_secret" };
  if (!headerValue) return { ok: false, code: "missing_header" };

  const received = Buffer.from(headerValue, "utf8");
  const expected = Buffer.from(secret, "utf8");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return { ok: false, code: "invalid_header" };
  }
  return { ok: true };
}
