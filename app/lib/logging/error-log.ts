import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requestRoute, sanitizeLogMetadata } from "./sanitize";

type ErrorSeverity = "warning" | "error" | "critical";
type ActorType = "admin" | "student" | "system";

export type SystemErrorLogInput = {
  request?: Request | null;
  source: string;
  route?: string | null;
  method?: string | null;
  actorType?: ActorType | null;
  actorId?: string | null;
  errorCode?: string | null;
  errorMessage: string;
  safeDetails?: Record<string, unknown>;
  severity?: ErrorSeverity;
};

export async function logSystemError(input: SystemErrorLogInput) {
  try {
    const request = input.request || null;
    const supabase = createSupabaseAdminClient();

    await supabase.from("system_error_logs").insert({
      source: input.source,
      route: input.route ?? requestRoute(request),
      method: input.method ?? request?.method ?? null,
      actor_type: input.actorType || null,
      actor_id: input.actorId || null,
      error_code: input.errorCode || null,
      error_message: input.errorMessage,
      safe_details: sanitizeLogMetadata(input.safeDetails || {}),
      severity: input.severity || "error",
    });
  } catch (error) {
    console.warn("[audit-log] error log skipped", error);
  }
}
