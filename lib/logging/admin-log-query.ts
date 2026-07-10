import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

export type LogTable = "system_activity_logs" | "security_events" | "system_error_logs" | "user_sessions";

const TABLE_SELECT: Record<LogTable, string> = {
  system_activity_logs: "*",
  security_events: "*",
  system_error_logs: "*",
  user_sessions: "*",
};

export async function listLogs(request: Request, table: LogTable) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const supabase = createSupabaseAdminClient();
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get("pageSize") || "30")));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const actorType = url.searchParams.get("actorType");
    const actorId = url.searchParams.get("actorId")?.trim();
    const search = url.searchParams.get("search")?.trim();
    const route = url.searchParams.get("route")?.trim();
    const action = url.searchParams.get("action")?.trim();
    const severity = url.searchParams.get("severity")?.trim();

    let query = supabase
      .from(table)
      .select(TABLE_SELECT[table], { count: "exact" })
      .order(table === "user_sessions" ? "last_seen_at" : "created_at", { ascending: false })
      .range(from, to);

    const dateColumn = table === "user_sessions" ? "last_seen_at" : "created_at";
    if (startDate) query = query.gte(dateColumn, `${startDate}T00:00:00.000Z`);
    if (endDate) query = query.lte(dateColumn, `${endDate}T23:59:59.999Z`);
    if (actorType && actorType !== "all") query = query.eq("actor_type", actorType);
    if (actorId) query = query.eq("actor_id", actorId);
    if (route) query = query.ilike("route", `%${route}%`);

    if (action && action !== "all") {
      if (table === "system_activity_logs") query = query.eq("action", action);
      if (table === "security_events") query = query.eq("event_type", action);
      if (table === "system_error_logs") query = query.eq("source", action);
    }

    if (severity && severity !== "all") {
      if (table === "security_events") query = query.eq("risk_level", severity);
      if (table === "system_activity_logs" || table === "system_error_logs") query = query.eq("severity", severity);
      if (table === "user_sessions" && severity === "active") query = query.eq("is_active", true);
      if (table === "user_sessions" && severity === "inactive") query = query.eq("is_active", false);
    }

    if (search) {
      if (table === "system_activity_logs") {
        query = query.or(`actor_name.ilike.%${search}%,actor_email.ilike.%${search}%,action.ilike.%${search}%,entity_type.ilike.%${search}%`);
      } else if (table === "security_events") {
        query = query.or(`actor_email.ilike.%${search}%,event_type.ilike.%${search}%,reason.ilike.%${search}%`);
      } else if (table === "system_error_logs") {
        query = query.or(`source.ilike.%${search}%,error_message.ilike.%${search}%,error_code.ilike.%${search}%`);
      } else {
        query = query.or(`actor_name.ilike.%${search}%,actor_email.ilike.%${search}%,last_route.ilike.%${search}%`);
      }
    }

    const { data, error, count } = await query;
    if (error) {
      console.error(`[admin-log-query] Falha ao consultar ${table}:`, error);
      if (error.code === "PGRST205" || /Could not find the table/i.test(error.message)) {
        return NextResponse.json(
          {
            ok: false,
            message: `A tabela "${table}" ainda não existe no banco de dados. Rode a migration de logs e auditoria no Supabase antes de usar esta tela.`,
          },
          { status: 503 },
        );
      }
      return NextResponse.json({ ok: false, message: "Não foi possível consultar os registros de log." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: data || [], count: count || 0, page, pageSize });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao buscar logs.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
