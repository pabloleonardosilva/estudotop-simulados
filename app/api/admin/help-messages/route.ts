import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { logSystemError } from "@/app/lib/server/auditLogger";

const STATUSES = new Set(["open", "answered"]);

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const searchParams = new URL(request.url).searchParams;
  const status = searchParams.get("status");
  if (status && !STATUSES.has(status)) {
    return NextResponse.json({ ok: false, message: "Status inválido." }, { status: 400 });
  }

  const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get("limit") || "50", 10) || 50));
  const fromIndex = (page - 1) * limit;

  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("student_help_messages")
    .select(
      `
        id,
        message,
        status,
        admin_reply,
        replied_at,
        created_at,
        student_id,
        students ( name, email )
      `,
    )
    .order("created_at", { ascending: false })
    .range(fromIndex, fromIndex + limit);

  if (status) query = query.eq("status", status);

  const { data, error } = await query;

  if (error) {
    void logSystemError({ source: "api.admin.help_messages.list", error, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar as mensagens." }, { status: 500 });
  }

  const rows = data || [];
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);

  return NextResponse.json({ ok: true, message: "Mensagens carregadas com sucesso.", items, page, limit, hasMore });
}
