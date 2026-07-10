import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requestIp, requestRoute, requestUserAgent, sanitizeLogMetadata } from "./sanitize";

type ActivitySeverity = "info" | "warning" | "error" | "critical";
type ActorType = "admin" | "student" | "system";

export type ActivityLogInput = {
  request?: Request | null;
  actorType?: ActorType;
  actorId?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  route?: string | null;
  method?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  severity?: ActivitySeverity;
  metadata?: Record<string, unknown>;
};

export async function logActivity(input: ActivityLogInput) {
  try {
    const request = input.request || null;
    const supabase = createSupabaseAdminClient();

    await supabase.from("system_activity_logs").insert({
      actor_type: input.actorType || "system",
      actor_id: input.actorId || null,
      actor_name: input.actorName || null,
      actor_email: input.actorEmail || null,
      action: input.action,
      entity_type: input.entityType || null,
      entity_id: input.entityId || null,
      route: input.route ?? requestRoute(request),
      method: input.method ?? request?.method ?? null,
      ip_address: input.ipAddress ?? requestIp(request),
      user_agent: input.userAgent ?? requestUserAgent(request),
      severity: input.severity || "info",
      metadata: sanitizeLogMetadata(input.metadata || {}),
    });
  } catch (error) {
    console.warn("[audit-log] activity log skipped", error);
  }
}
