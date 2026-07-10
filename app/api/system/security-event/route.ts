import { NextResponse } from "next/server";
import { logSecurityEvent } from "@/lib/logging/security-log";
import { logActivity } from "@/lib/logging/activity-log";
import { touchUserSession } from "@/lib/logging/session-log";

type Payload = {
  eventType?: string;
  actorType?: "admin" | "student" | "system";
  actorId?: string;
  actorName?: string;
  actorEmail?: string;
  riskLevel?: "low" | "medium" | "high" | "critical";
  blocked?: boolean;
  reason?: string;
  route?: string;
  metadata?: Record<string, unknown>;
};

const ALLOWED_EVENTS = new Set([
  "login_success",
  "login_failed",
  "login_denied_inactive",
  "logout",
  "session_touch",
  "unauthorized_access",
  "forbidden_access",
  "invalid_session",
  "suspicious_request",
]);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Payload;
    const eventType = body.eventType || "suspicious_request";

    if (!ALLOWED_EVENTS.has(eventType)) {
      return NextResponse.json({ ok: false, message: "Evento não permitido." }, { status: 400 });
    }

    if (eventType === "session_touch" && body.actorType !== "system" && body.actorId) {
      await touchUserSession({
        request,
        actorType: body.actorType === "admin" ? "admin" : "student",
        actorId: body.actorId,
        actorName: body.actorName || null,
        actorEmail: body.actorEmail || null,
        lastRoute: body.route || null,
        metadata: body.metadata || {},
      });
      return NextResponse.json({ ok: true });
    }

    await logSecurityEvent({
      request,
      eventType,
      actorType: body.actorType || null,
      actorId: body.actorId || null,
      actorEmail: body.actorEmail || null,
      riskLevel: body.riskLevel || (eventType === "login_failed" ? "medium" : "low"),
      blocked: Boolean(body.blocked),
      reason: body.reason || null,
      route: body.route || null,
      metadata: body.metadata || {},
    });

    if (eventType === "login_success" && body.actorType !== "system" && body.actorId) {
      await logActivity({
        request,
        actorType: body.actorType || "student",
        actorId: body.actorId,
        actorName: body.actorName || null,
        actorEmail: body.actorEmail || null,
        action: "login_success",
        entityType: "auth",
        route: body.route || "/login",
        metadata: body.metadata || {},
      });

      await touchUserSession({
        request,
        actorType: body.actorType === "admin" ? "admin" : "student",
        actorId: body.actorId,
        actorName: body.actorName || null,
        actorEmail: body.actorEmail || null,
        lastRoute: body.route || "/login",
        metadata: body.metadata || {},
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao registrar evento.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
