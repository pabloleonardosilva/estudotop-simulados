import "server-only";

import crypto from "node:crypto";

function getTokenSecret() {
  const secret = process.env.REGISTRATION_TOKEN_SECRET;
  if (!secret) {
    throw new Error("REGISTRATION_TOKEN_SECRET não configurado.");
  }
  return secret;
}

export function generateNumericCode(length = 6) {
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;
  return String(crypto.randomInt(min, max + 1));
}

export function generateSecureToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function hashRegistrationValue(value: string) {
  return crypto.createHmac("sha256", getTokenSecret()).update(value).digest("hex");
}

export function hashEmailActionToken(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function emailActionTokenHashCandidates(value: string) {
  const candidates = [hashEmailActionToken(value)];
  try {
    candidates.push(hashRegistrationValue(value));
  } catch {
    // Links novos não dependem mais do segredo; o HMAC existe apenas para compatibilidade legada.
  }
  return Array.from(new Set(candidates));
}

export function addMinutes(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

export function addHours(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}
