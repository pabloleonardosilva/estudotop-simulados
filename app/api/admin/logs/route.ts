import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { sanitizeLogMetadata } from "@/app/lib/server/auditLogger";

const LOG_CONFIG = {
  admin: { table: "admin_audit_logs", actionField: "action", actorField: "admin_user_id", metadataField: "metadata" },
  security: { table: "security_event_logs", actionField: "event", actorField: "actor_id", metadataField: "metadata" },
  system: { table: "system_error_logs", actionField: "source", actorField: null, metadataField: "metadata" },
  student: { table: "student_activity_log", actionField: "event_type", actorField: "student_id", metadataField: "details" },
} as const;

type LogType = keyof typeof LOG_CONFIG;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SEVERITIES = new Set(["info", "warning", "error", "critical"]);

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const searchParams = new URL(request.url).searchParams;
  const requestedType = searchParams.get("type") || "security";
  if (!(requestedType in LOG_CONFIG)) {
    return NextResponse.json({ ok: false, message: "Tipo de log inválido." }, { status: 400 });
  }

  const type = requestedType as LogType;
  const config = LOG_CONFIG[type];
  const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get("limit") || "50", 10) || 50));
  const fromIndex = (page - 1) * limit;
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from(config.table)
    .select("*")
    .order("created_at", { ascending: false })
    .range(fromIndex, fromIndex + limit);

  const severity = searchParams.get("severity");
  const text = searchParams.get("action") || searchParams.get("event");
  const actorId = searchParams.get("actor_id") || searchParams.get("student_id");
  const entityType = searchParams.get("entity_type");
  const entityId = searchParams.get("entity_id");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (severity && !SEVERITIES.has(severity)) {
    return NextResponse.json({ ok: false, message: "Severidade inválida." }, { status: 400 });
  }
  if (actorId && !UUID_PATTERN.test(actorId)) {
    return NextResponse.json({ ok: false, message: "ID do ator inválido." }, { status: 400 });
  }
  if ((from && Number.isNaN(Date.parse(from))) || (to && Number.isNaN(Date.parse(to)))) {
    return NextResponse.json({ ok: false, message: "Período inválido." }, { status: 400 });
  }
  if (from && to && Date.parse(from) > Date.parse(to)) {
    return NextResponse.json({ ok: false, message: "A data inicial deve ser anterior à data final." }, { status: 400 });
  }

  if (severity && type !== "student") query = query.eq("severity", severity);
  if (text) query = query.ilike(config.actionField, `%${text.slice(0, 120)}%`);
  if (actorId && config.actorField) query = query.eq(config.actorField, actorId);
  if (entityType && type !== "system") query = query.eq(type === "security" ? "resource_type" : "entity_type", entityType);
  if (entityId && type !== "system") query = query.eq(type === "security" ? "resource_id" : "entity_id", entityId);
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, message: "Não foi possível consultar os logs." }, { status: 500 });
  }

  const rows = data || [];
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map((row) => {
    const metadata = row[config.metadataField];
    return { ...row, [config.metadataField]: sanitizeLogMetadata(metadata && typeof metadata === "object" ? metadata : {}) };
  });

  return NextResponse.json({ ok: true, message: "Logs carregados com sucesso.", items, page, limit, hasMore });
}
