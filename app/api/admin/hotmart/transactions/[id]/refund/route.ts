import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { HotmartRefundRequestError, requestHotmartRefund } from "@/app/lib/server/hotmart/refund";
import { recordHotmartHistory } from "@/app/lib/server/hotmart/history";
import { logSystemError } from "@/app/lib/server/auditLogger";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  const supabase = createSupabaseAdminClient();
  const { data: transaction } = await supabase.from("hotmart_transactions")
    .select("id,transaction_code,student_id,refund_status,purchase_status").eq("id", id).maybeSingle();
  if (!transaction) return NextResponse.json({ ok: false, message: "Transação não encontrada." }, { status: 404 });
  if (["requested", "confirmed"].includes(transaction.refund_status || "")) return NextResponse.json({ ok: false, message: "Esta transação já possui reembolso solicitado ou confirmado." }, { status: 409 });
  const { data: started, error: beginError } = await supabase.rpc("begin_hotmart_refund_request", { p_transaction_id: id, p_admin_id: admin.id });
  if (beginError) return NextResponse.json({ ok: false, message: beginError.code === "PGRST202" ? "A proteção financeira requer a migration complementar desta etapa." : "Não foi possível iniciar a solicitação de reembolso." }, { status: 409 });
  if (!started) return NextResponse.json({ ok: false, code: "REFUND_RECONCILIATION_REQUIRED", message: "Já existe solicitação, tratamento manual ou reconciliação de reembolso. Não repita a operação financeira." }, { status: 409 });

  let outcome: "accepted" | "rejected" | "uncertain";
  try {
    const result = await requestHotmartRefund(transaction.transaction_code);
    outcome = result.outcome;
  } catch (error) {
    void logSystemError({ source: "api.admin.hotmart.refund", error, request, metadata: { transaction_id: id } });
    outcome = error instanceof HotmartRefundRequestError && error.certainty === "not_sent" ? "rejected" : "uncertain";
  }

  const { error: finalizeError } = await supabase.rpc("finalize_hotmart_refund_request", { p_transaction_id: id, p_admin_id: admin.id, p_outcome: outcome });
  if (finalizeError) {
    void logSystemError({ source: "api.admin.hotmart.refund.reconciliation", error: finalizeError, request, metadata: { transaction_id: id, external_outcome: outcome } });
    return NextResponse.json({ ok: false, code: "REFUND_RECONCILIATION_REQUIRED", message: "A operação pode ter sido aceita pela Hotmart, mas a confirmação local falhou. Não repita o reembolso; aguarde reconciliação ou webhook." }, { status: 503 });
  }
  if (outcome === "accepted") {
    await recordHotmartHistory(supabase, { action: "refund_requested", actorType: "admin", actorId: admin.id, studentId: transaction.student_id, transactionId: id });
    return NextResponse.json({ ok: true, message: "Reembolso solicitado. A confirmação dependerá do evento REFUNDED da Hotmart." });
  }
  if (outcome === "rejected") return NextResponse.json({ ok: false, code: "MANUAL_REFUND_REQUIRED", message: "A solicitação automática não foi aceita. Faça o procedimento manual na Hotmart e aguarde o webhook de confirmação." }, { status: 409 });
  return NextResponse.json({ ok: false, code: "REFUND_RECONCILIATION_REQUIRED", message: "O resultado externo é incerto. Não repita o reembolso; aguarde verificação ou webhook da Hotmart." }, { status: 503 });
}
