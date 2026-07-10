import "server-only";

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { logSecurityEvent, logSystemError } from "@/app/lib/server/auditLogger";

export function verifyCronSecret(request: Request): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    void logSystemError({ source: "api.admin.jornadas.release_job", error: new Error("CRON_SECRET não configurado."), request });
    return NextResponse.json(
      { ok: false, message: "Cron não configurado." },
      { status: 500 },
    );
  }

  const authorization = request.headers.get("authorization") || "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);

  if (
    expectedBuffer.length !== suppliedBuffer.length
    || !timingSafeEqual(expectedBuffer, suppliedBuffer)
  ) {
    void logSecurityEvent({ event: "cron.invalid_secret", actorType: "system", resourceType: "cron", resourceId: "release-job", request });
    return NextResponse.json(
      { ok: false, message: "Não autorizado." },
      { status: 401 },
    );
  }

  return null;
}
