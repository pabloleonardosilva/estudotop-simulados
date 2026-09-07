import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdmin } from "@/lib/server/authGuard";
import { setSimuladoQuestionAnnulment } from "@/lib/server/simuladoQuestionReprocessing";
import { logSystemError } from "@/app/lib/server/auditLogger";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; relationId: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id: simuladoId, relationId } = await params;
  const body = await request.json().catch(() => ({}));
  const targetStatus = body?.status === "active" ? "active" : body?.status === "annulled" ? "annulled" : null;
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 1000) || null : null;

  if (!targetStatus) {
    return NextResponse.json({ ok: false, message: "Informe o status desejado (active ou annulled)." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  const { data: relation, error: relationError } = await supabase
    .from("simulado_questions")
    .select("id, simulado_id")
    .eq("id", relationId)
    .eq("simulado_id", simuladoId)
    .maybeSingle();
  if (relationError) return NextResponse.json({ ok: false, message: "Não foi possível verificar a questão." }, { status: 500 });
  if (!relation) return NextResponse.json({ ok: false, message: "Questão não encontrada neste Simulado." }, { status: 404 });

  try {
    const result = await setSimuladoQuestionAnnulment(supabase, {
      simuladoQuestionId: relationId,
      targetStatus,
      reason,
      actorId: admin.id,
      actorName: admin.full_name || "Admin",
      actorType: "admin",
    });
    if (!result.ok) return NextResponse.json({ ok: false, message: result.message }, { status: 409 });

    // O status já mudou (compare-and-swap confirmado) mesmo quando o
    // reprocessamento fica pendente — não é um erro do ponto de vista do
    // aluno/Admin, é um estado recuperável (ver getPendingReconciliationSummary
    // / POST .../reconciliation). Nunca reportar como falha genérica.
    if (result.pendingReconciliation) {
      return NextResponse.json({
        ok: true,
        message:
          targetStatus === "annulled"
            ? "Questão anulada. O recálculo dos resultados afetados ficou pendente e será concluído automaticamente na próxima ação, ou pode ser retomado manualmente em Admin › Reconciliação."
            : "Questão desanulada. O recálculo dos resultados afetados ficou pendente e será concluído automaticamente na próxima ação, ou pode ser retomado manualmente em Admin › Reconciliação.",
        pending_reconciliation: true,
      });
    }

    return NextResponse.json({
      ok: true,
      message: targetStatus === "annulled" ? "Questão anulada. Os resultados afetados foram atualizados." : "Questão desanulada. Os resultados afetados foram recalculados.",
      attempts_reprocessed: result.attemptsReprocessed,
      results_changed: result.resultsChanged,
      notifications_created: result.notificationsCreated,
      pending_reconciliation: false,
    });
  } catch (error) {
    void logSystemError({ source: "api.admin.simulados.questions.annul", error, request, metadata: { simulado_id: simuladoId, relation_id: relationId, target_status: targetStatus } });
    return NextResponse.json({ ok: false, message: "Não foi possível concluir a operação. Tente novamente." }, { status: 500 });
  }
}
