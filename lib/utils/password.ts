import crypto from "crypto";

export function generateTemporaryPassword() {
  return crypto.randomBytes(12).toString("base64url") + "A1!";
}
