import { NextResponse } from "next/server";
import { logSecurityEvent } from "@/lib/logging/security-log";
import { logActivity } from "@/lib/logging/activity-log";
import { touchUserSession } from "@/lib/logging/session-log";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

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

    if (eventType === "session_touch" || eventType === "login_success") {
      const authHeader = request.headers.get("authorization") || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      const supabase = createSupabaseAdminClient();
      const { data: auth } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
      if (!auth.user) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });
      const { data: profile } = await supabase.from("profiles").select("id,full_name,role,is_active").eq("id", auth.user.id).maybeSingle();
      if (!profile?.is_active || !["admin", "student"].includes(profile.role)) return NextResponse.json({ ok: false, message: "Acesso negado." }, { status: 403 });
      const actorType = profile.role === "admin" ? "admin" : "student";
      await touchUserSession({
        request,
        actorType,
        actorId: auth.user.id,
        actorName: profile.full_name,
        actorEmail: auth.user.email || null,
        lastRoute: body.route || null,
        metadata: body.metadata || {},
      });
      if (eventType === "session_touch") return NextResponse.json({ ok: true });
      await logActivity({ request, actorType, actorId: auth.user.id, actorName: profile.full_name, actorEmail: auth.user.email || null, action: "login_success", entityType: "auth", route: body.route || "/login", metadata: body.metadata || {} });
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

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao registrar evento.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
