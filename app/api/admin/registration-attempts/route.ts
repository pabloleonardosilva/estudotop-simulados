import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { logSystemError } from "@/app/lib/server/auditLogger";

// Nunca trata como lead um e-mail que colidiu com uma identidade não-aluno
// já existente (admin/professor) — o próprio fluxo de confirmação já
// protege essa identidade (createStudentAccount → STUDENT_EMAIL_USED_BY_ADMIN,
// cobre qualquer profiles.role <> "student"); aqui só garantimos que esse
// registro nunca apareça como lead recuperável normal na central.
const PROTECTED_IDENTITY_FAILURE_CODE = "STUDENT_EMAIL_USED_BY_ADMIN";

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const supabase = createSupabaseAdminClient();
    const url = new URL(request.url);

    const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") || "25")));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const search = url.searchParams.get("search")?.trim();
    const status = url.searchParams.get("status")?.trim();
    const stage = url.searchParams.get("stage")?.trim();
    const period = url.searchParams.get("period")?.trim();

    let query = supabase
      .from("student_registration_attempts")
      .select("*", { count: "exact" })
      // .neq trataria NULL como "não bate" e excluiria toda linha sem falha
      // registrada (a maioria) — precisa do .or explícito para manter as
      // linhas com last_failure_code nulo.
      .or(`last_failure_code.is.null,last_failure_code.neq.${PROTECTED_IDENTITY_FAILURE_CODE}`)
      .order("last_activity_at", { ascending: false })
      .range(from, to);

    if (status && status !== "all") query = query.eq("status", status);
    if (stage && stage !== "all") query = query.eq("stage", stage);

    if (period && period !== "all") {
      const now = Date.now();
      const since = period === "today"
        ? new Date(new Date().setHours(0, 0, 0, 0))
        : period === "7d"
          ? new Date(now - 7 * 24 * 60 * 60 * 1000)
          : period === "30d"
            ? new Date(now - 30 * 24 * 60 * 60 * 1000)
            : null;
      if (since) query = query.gte("last_activity_at", since.toISOString());
    }

    if (search) {
      const term = `%${search.replace(/[%_]/g, "\\$&")}%`;
      query = query.or(
        `full_name.ilike.${term},email.ilike.${term},email_normalized.ilike.${term},phone.ilike.${term},phone_normalized.ilike.${term}`,
      );
    }

    const identityGuard = `last_failure_code.is.null,last_failure_code.neq.${PROTECTED_IDENTITY_FAILURE_CODE}`;
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Métricas globais (não dependem da página/filtro atual) — 4 consultas
    // fixas de contagem (head:true, sem trazer linhas), em paralelo. Não é
    // N+1: é um número fixo de agregações, independente da quantidade de
    // tentativas.
    const [{ data, error, count }, openCount, last24hCount, contactedCount, completedCount] = await Promise.all([
      query,
      supabase.from("student_registration_attempts").select("*", { count: "exact", head: true }).eq("status", "open").or(identityGuard),
      supabase.from("student_registration_attempts").select("*", { count: "exact", head: true }).gte("last_activity_at", last24h).or(identityGuard),
      supabase.from("student_registration_attempts").select("*", { count: "exact", head: true }).eq("status", "contacted").or(identityGuard),
      supabase.from("student_registration_attempts").select("*", { count: "exact", head: true }).eq("status", "completed").or(identityGuard),
    ]);

    if (error) {
      void logSystemError({ source: "api.admin.registration_attempts.list", error, request });
      return NextResponse.json({ ok: false, message: "Não foi possível carregar as tentativas de cadastro." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      data: data || [],
      count: count || 0,
      page,
      pageSize,
      metrics: {
        open: openCount.count || 0,
        last24h: last24hCount.count || 0,
        contacted: contactedCount.count || 0,
        completed: completedCount.count || 0,
      },
    });
  } catch (error) {
    void logSystemError({ source: "api.admin.registration_attempts.list", error, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar as tentativas de cadastro." }, { status: 500 });
  }
}
