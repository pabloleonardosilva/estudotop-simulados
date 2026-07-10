import "server-only";

import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

export type AuditSeverity = "info" | "warning" | "error" | "critical";

type LogMetadata = Record<string, unknown>;

const SENSITIVE_KEY_PATTERN = /password|senha|token|authorization|cookie|secret|api[_-]?key|service[_-]?role|cron_secret|registration_token_secret|openai_api_key|resend_api_key/i;

function redactText(value: string) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, "Bearer [redacted]")
    .replace(/(password|senha|token|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]");
}

export function getRequestContext(request?: Request) {
  if (!request) {
    return { ip_address: null, user_agent: null, request_path: null, request_method: null };
  }

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ip_address: (
      request.headers.get("cf-connecting-ip")
      || request.headers.get("x-real-ip")
      || forwardedFor
      || null
    )?.slice(0, 128) ?? null,
    user_agent: request.headers.get("user-agent")?.slice(0, 512) ?? null,
    request_path: new URL(request.url).pathname.slice(0, 512),
    request_method: request.method.slice(0, 16),
  };
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > 4) return "[truncated]";
  if (typeof value === "string") return redactText(value).slice(0, 2000);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeValue(item, depth + 1));
  if (typeof value === "object" && value) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 100)
        .map(([key, item]) => [key, SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : sanitizeValue(item, depth + 1)]),
    );
  }
  return String(value).slice(0, 2000);
}

export function sanitizeLogMetadata(metadata?: LogMetadata): LogMetadata {
  return (sanitizeValue(metadata || {}, 0) || {}) as LogMetadata;
}

async function safeInsert(table: string, payload: Record<string, unknown>) {
  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from(table).insert(payload);
    if (error) console.error(`[auditLogger] Falha ao inserir em ${table}: ${error.message}`);
  } catch {
    // Logging must never break the primary operation.
  }
}

export function logAdminAction(input: {
  adminUserId?: string | null;
  adminEmail?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  severity?: AuditSeverity;
  metadata?: LogMetadata;
  request?: Request;
}) {
  return safeInsert("admin_audit_logs", {
    admin_user_id: input.adminUserId ?? null,
    admin_email: input.adminEmail ?? null,
    action: input.action,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    severity: input.severity ?? "info",
    metadata: sanitizeLogMetadata(input.metadata),
    ...getRequestContext(input.request),
  });
}

export function logSecurityEvent(input: {
  event: string;
  actorType?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  severity?: AuditSeverity;
  metadata?: LogMetadata;
  request?: Request;
}) {
  return safeInsert("security_event_logs", {
    actor_type: input.actorType ?? null,
    actor_id: input.actorId ?? null,
    actor_email: input.actorEmail ?? null,
    event: input.event,
    severity: input.severity ?? "warning",
    resource_type: input.resourceType ?? null,
    resource_id: input.resourceId ?? null,
    metadata: sanitizeLogMetadata(input.metadata),
    ...getRequestContext(input.request),
  });
}

export function logSystemError(input: {
  source: string;
  error: unknown;
  severity?: "warning" | "error" | "critical";
  metadata?: LogMetadata;
  request?: Request;
}) {
  const error = input.error instanceof Error ? input.error : new Error(String(input.error));
  const context = getRequestContext(input.request);
  return safeInsert("system_error_logs", {
    source: input.source,
    message: redactText(error.message).slice(0, 2000),
    stack: error.stack ? redactText(error.stack).slice(0, 8000) : null,
    severity: input.severity ?? "error",
    request_path: context.request_path,
    request_method: context.request_method,
    metadata: sanitizeLogMetadata(input.metadata),
  });
}

export function logStudentActivity(input: {
  studentId: string;
  action: string;
  description?: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: LogMetadata;
  request?: Request;
}) {
  const context = getRequestContext(input.request);
  return safeInsert("student_activity_log", {
    student_id: input.studentId,
    event_type: input.action,
    description: input.description ?? input.action,
    details: sanitizeLogMetadata(input.metadata),
    performed_by_name: null,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    ip_address: context.ip_address,
    user_agent: context.user_agent,
  });
}
