import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { logSystemError } from "@/app/lib/server/auditLogger";
import { isHelpContactReason } from "@/lib/help-tickets";

const STATUSES = new Set(["open", "answered", "closed"]);
const PERIODS = new Set(["7", "30", "90", "all"]);
const PAGE_SIZE = 25;

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const searchParams = new URL(request.url).searchParams;
  const status = searchParams.get("status");
  const contactReason = searchParams.get("contact_reason");
  const period = searchParams.get("period") || "all";
  const search = (searchParams.get("search") || "").trim().slice(0, 200);
  if (status && !STATUSES.has(status)) return NextResponse.json({ ok: false, message: "Status inválido." }, { status: 400 });
  if (contactReason && !isHelpContactReason(contactReason)) return NextResponse.json({ ok: false, message: "Motivo de contato inválido." }, { status: 400 });
  if (!PERIODS.has(period)) return NextResponse.json({ ok: false, message: "Período inválido." }, { status: 400 });
  const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
  const supabase = createSupabaseAdminClient();

  let matchingTicketIds: string[] | null = null;
  let matchingStudentIds: string[] = [];
  if (search) {
    const escaped = search.replace(/[%_,()]/g, " ");
    const [studentsResult, messagesResult] = await Promise.all([
      supabase.from("students").select("id").or(`name.ilike.%${escaped}%,email.ilike.%${escaped}%`).limit(500),
      supabase.from("student_help_ticket_messages").select("ticket_id").ilike("message", `%${escaped}%`).limit(1000),
    ]);
    if (studentsResult.error || messagesResult.error) {
      void logSystemError({ source: "api.admin.help_messages.search", error: studentsResult.error || messagesResult.error, request });
      return NextResponse.json({ ok: false, message: "Não foi possível pesquisar os tickets." }, { status: 500 });
    }
    matchingStudentIds = (studentsResult.data || []).map((item) => item.id);
    matchingTicketIds = [...new Set((messagesResult.data || []).map((item) => item.ticket_id))];
  }

  let query = supabase.from("student_help_messages").select(`
    id, ticket_number, contact_reason, status, admin_seen_at, created_at, updated_at, student_id,
    students ( name, email )
  `);
  if (status) query = query.eq("status", status);
  if (contactReason) query = query.eq("contact_reason", contactReason);
  if (period !== "all") {
    const since = new Date();
    since.setDate(since.getDate() - Number(period));
    query = query.gte("created_at", since.toISOString());
  }
  if (search) {
    const escaped = search.replace(/[%_,()]/g, " ");
    const conditions = [`ticket_number.ilike.%${escaped}%`];
    if (matchingStudentIds.length) conditions.push(`student_id.in.(${matchingStudentIds.join(",")})`);
    if (matchingTicketIds?.length) conditions.push(`id.in.(${matchingTicketIds.join(",")})`);
    query = query.or(conditions.join(","));
  }
  const [itemsResult, openCountResult, answeredCountResult, closedCountResult, allCountResult, newCountResult] = await Promise.all([
    query.order("updated_at", { ascending: false }),
    supabase.from("student_help_messages").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("student_help_messages").select("id", { count: "exact", head: true }).eq("status", "answered"),
    supabase.from("student_help_messages").select("id", { count: "exact", head: true }).eq("status", "closed"),
    supabase.from("student_help_messages").select("id", { count: "exact", head: true }),
    supabase.from("student_help_messages").select("id", { count: "exact", head: true }).eq("status", "open").is("admin_seen_at", null),
  ]);
  const error = itemsResult.error || openCountResult.error || answeredCountResult.error || closedCountResult.error || allCountResult.error || newCountResult.error;
  if (error) {
    void logSystemError({ source: "api.admin.help_messages.list", error, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar os tickets." }, { status: 500 });
  }
  const statusPriority = { open: 0, answered: 1, closed: 2 } as const;
  const sorted = [...(itemsResult.data || [])].sort((a, b) => {
    const statusDifference = statusPriority[a.status as keyof typeof statusPriority] - statusPriority[b.status as keyof typeof statusPriority];
    return statusDifference || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
  const from = (page - 1) * PAGE_SIZE;
  const ticketIds = sorted.slice(from, from + PAGE_SIZE).map((item) => item.id);
  const { data: latestMessages, error: latestError } = ticketIds.length
    ? await supabase.from("student_help_ticket_messages").select("ticket_id, message, author_type, created_at").in("ticket_id", ticketIds).order("created_at", { ascending: false })
    : { data: [], error: null };
  if (latestError) {
    void logSystemError({ source: "api.admin.help_messages.latest", error: latestError, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar os resumos." }, { status: 500 });
  }
  const latestByTicket = new Map<string, (typeof latestMessages)[number]>();
  for (const item of latestMessages || []) if (!latestByTicket.has(item.ticket_id)) latestByTicket.set(item.ticket_id, item);
  const pageItems = sorted.slice(from, from + PAGE_SIZE).map((item) => ({ ...item, latest_message: latestByTicket.get(item.id) || null }));
  return NextResponse.json({
    ok: true, message: "Tickets carregados com sucesso.", items: pageItems,
    counts: { open: openCountResult.count ?? 0, answered: answeredCountResult.count ?? 0, closed: closedCountResult.count ?? 0, all: allCountResult.count ?? 0, new: newCountResult.count ?? 0 },
    page, limit: PAGE_SIZE, total: sorted.length, hasMore: from + PAGE_SIZE < sorted.length,
  });
}
