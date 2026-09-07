import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdmin } from "@/lib/server/authGuard";
import { logAdminAction, logSystemError } from "@/app/lib/server/auditLogger";
import { getPendingReconciliationSummary, processPendingReconciliationForSimulado, reconcileCurrentRevision } from "@/lib/server/simuladoQuestionReprocessing";

// Consulta/retomada MANUAL de reconciliação pendente — Admin-only. O fluxo
// normal de anulação/desanulação (Admin e Professor, via setSimuladoQuestionAnnulment)
// já tenta concluir automaticamente qualquer pendência antes de aceitar uma
// nova transição; este endpoint existe para o caso em que essa tentativa
// automática também falhou (ex.: indisponibilidade momentânea do banco) e a
// pendência precisa ser retomada explicitamente.

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await params;
    const supabase = createSupabaseAdminClient();
    const summary = await getPendingReconciliationSummary(supabase, id);

    return NextResponse.json({
      ok: true,
      message:
        summary.pendingCount === 0
          ? "Nenhuma reconciliação pendente neste Simulado."
          : `${summary.pendingCount} questão(ões) com reconciliação pendente neste Simulado.`,
      pending_count: summary.pendingCount,
      oldest_pending_at: summary.oldestPendingAt,
      relations: summary.relations.map((r) => ({
        id: r.id,
        question_id: r.questionId,
        status: r.status,
        status_revision_id: r.statusRevisionId,
        pending_since: r.pendingSince,
      })),
    });
  } catch (error) {
    void logSystemError({ source: "api.admin.simulados.reconciliation.get", error, request });
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro inesperado ao consultar reconciliação." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await params;
    const supabase = createSupabaseAdminClient();
    const body = await request.json().catch(() => ({}));

    // Caminho raro/manual: reprocessar uma revisão que já se marcou como
    // concluída (pending_reconciliation_at = null) mas cujo resultado há
    // motivo concreto para suspeitar estar incorreto (ex.: incidente já
    // corrigido no código). Exige simulado_question_id + revision_id
    // vigentes — nunca muda status, nunca gera revisão nova. Ver
    // reconcileCurrentRevision() para a validação de segurança completa.
    const simuladoQuestionId = typeof body?.simulado_question_id === "string" ? body.simulado_question_id.trim() : null;
    const expectedRevisionId = typeof body?.expected_revision_id === "string" ? body.expected_revision_id.trim() : null;

    if (simuladoQuestionId && expectedRevisionId) {
      const outcome = await reconcileCurrentRevision(supabase, {
        simuladoId: id,
        simuladoQuestionId,
        expectedRevisionId,
        actorId: admin.id,
        actorName: admin.full_name || "Admin",
        reasonText: typeof body?.reason === "string" ? body.reason.trim() || undefined : undefined,
      });

      if (!outcome.ok) return NextResponse.json({ ok: false, message: outcome.message }, { status: 409 });

      void logAdminAction({
        adminUserId: admin.id,
        action: "admin.simulado.reconciliation.forced_current_revision",
        entityType: "simulado_questions",
        entityId: simuladoQuestionId,
        request,
        metadata: { simulado_id: id, expected_revision_id: expectedRevisionId, ...outcome },
      });

      return NextResponse.json({
        ok: true,
        message: `Revisão ${expectedRevisionId} reprocessada. ${outcome.resultsChanged} resultado(s) corrigido(s).`,
        attempts_reprocessed: outcome.attemptsReprocessed,
        results_changed: outcome.resultsChanged,
        notifications_created: outcome.notificationsCreated,
      });
    }

    const outcome = await processPendingReconciliationForSimulado(supabase, id);

    void logAdminAction({
      adminUserId: admin.id,
      action: "admin.simulado.reconciliation.retried",
      entityType: "simulados",
      entityId: id,
      request,
      metadata: outcome,
    });

    return NextResponse.json({
      ok: true,
      message:
        outcome.reconciled === 0 && outcome.stillPending === 0
          ? "Nenhuma reconciliação pendente neste Simulado."
          : `${outcome.reconciled} reconciliação(ões) concluída(s); ${outcome.stillPending} ainda pendente(s).`,
      reconciled: outcome.reconciled,
      still_pending: outcome.stillPending,
    });
  } catch (error) {
    void logSystemError({ source: "api.admin.simulados.reconciliation.post", error, request });
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro inesperado ao retomar reconciliação." },
      { status: 500 },
    );
  }
}
