import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { logSystemError } from "@/app/lib/server/auditLogger";
import { isHelpContactReason } from "@/lib/help-tickets";

const STATUSES = new Set(["open", "answered"]);

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const searchParams = new URL(request.url).searchParams;
  const status = searchParams.get("status");
  const contactReason = searchParams.get("contact_reason");
  if (status && !STATUSES.has(status)) {
    return NextResponse.json({ ok: false, message: "Status inválido." }, { status: 400 });
  }
  if (contactReason && !isHelpContactReason(contactReason)) {
    return NextResponse.json({ ok: false, message: "Motivo de contato inválido." }, { status: 400 });
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
        contact_reason,
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
  if (contactReason) query = query.eq("contact_reason", contactReason);

  const [itemsResult, openCountResult, answeredCountResult, allCountResult] = await Promise.all([
    query,
    supabase.from("student_help_messages").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("student_help_messages").select("id", { count: "exact", head: true }).eq("status", "answered"),
    supabase.from("student_help_messages").select("id", { count: "exact", head: true }),
  ]);

  const { data, error } = itemsResult;
  const countError = openCountResult.error || answeredCountResult.error || allCountResult.error;

  if (error || countError) {
    void logSystemError({ source: "api.admin.help_messages.list", error: error || countError, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar as mensagens." }, { status: 500 });
  }

  const rows = data || [];
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);

  return NextResponse.json({
    ok: true,
    message: "Tickets carregados com sucesso.",
    items,
    counts: {
      open: openCountResult.count ?? 0,
      answered: answeredCountResult.count ?? 0,
      all: allCountResult.count ?? 0,
    },
    page,
    limit,
    hasMore,
  });
}
