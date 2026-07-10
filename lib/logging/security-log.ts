import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requestIp, requestRoute, requestUserAgent, sanitizeLogMetadata } from "./sanitize";

type RiskLevel = "low" | "medium" | "high" | "critical";
type ActorType = "admin" | "student" | "system";

export type SecurityLogInput = {
  request?: Request | null;
  eventType: string;
  actorType?: ActorType | null;
  actorId?: string | null;
  actorEmail?: string | null;
  route?: string | null;
  method?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  riskLevel?: RiskLevel;
  blocked?: boolean;
  reason?: string | null;
  metadata?: Record<string, unknown>;
};

export async function logSecurityEvent(input: SecurityLogInput) {
  try {
    const request = input.request || null;
    const supabase = createSupabaseAdminClient();

    await supabase.from("security_events").insert({
      event_type: input.eventType,
      actor_type: input.actorType || null,
      actor_id: input.actorId || null,
      actor_email: input.actorEmail || null,
      route: input.route ?? requestRoute(request),
      method: input.method ?? request?.method ?? null,
      ip_address: input.ipAddress ?? requestIp(request),
      user_agent: input.userAgent ?? requestUserAgent(request),
      risk_level: input.riskLevel || "low",
      blocked: input.blocked || false,
      reason: input.reason || null,
      metadata: sanitizeLogMetadata(input.metadata || {}),
    });
  } catch (error) {
    console.warn("[audit-log] security log skipped", error);
  }
}
