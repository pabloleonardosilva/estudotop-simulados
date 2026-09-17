import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { recoverHotmartTransactionEmails } from "@/app/lib/server/hotmart/email";

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const body = await request.json().catch(() => null) as { limit?: unknown } | null;
  const limit = typeof body?.limit === "number" ? body.limit : 20;
  try {
    const result = await recoverHotmartTransactionEmails(createSupabaseAdminClient(), limit);
    return NextResponse.json({ ok: true, message: `${result.recovered} e-mail(s) recuperado(s).`, ...result });
  } catch {
    return NextResponse.json({ ok: false, message: "Não foi possível recuperar os e-mails pendentes." }, { status: 500 });
  }
}
