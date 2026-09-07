import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireEventManager } from "@/lib/server/authGuard";
import { setSimuladoQuestionAnnulment } from "@/lib/server/simuladoQuestionReprocessing";
import { logSystemError } from "@/app/lib/server/auditLogger";

// Professor só pode anular/desanular questões do Simulado vinculado ao
// Evento ao qual está associado (guard abaixo). O efeito da ação, porém, é
// sobre o vínculo simulado_questions em si — se o mesmo Simulado estiver
// vinculado a outro Evento (ou Jornada/avulso), ele também é afetado, pois
// anulação é por Simulado, não por Evento (ver docs/Sprint-evento-de-simulado.md).
// Professor nunca altera questions.status nem question_alternatives (gabarito
// global) — só o vínculo deste Simulado, via setSimuladoQuestionAnnulment.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; relationId: string }> }) {
  const { id: eventId, relationId } = await params;
  const manager = await requireEventManager(request, eventId);
  if (manager instanceof NextResponse) return manager;

  const body = await request.json().catch(() => ({}));
  const targetStatus = body?.status === "active" ? "active" : body?.status === "annulled" ? "annulled" : null;
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 1000) || null : null;

  if (!targetStatus) {
    return NextResponse.json({ ok: false, message: "Informe o status desejado (active ou annulled)." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  const { data: event, error: eventError } = await supabase
    .from("simulado_events")
    .select("id, simulado_id")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError) return NextResponse.json({ ok: false, message: "Não foi possível carregar o Evento." }, { status: 500 });
  if (!event || !event.simulado_id) return NextResponse.json({ ok: false, message: "Este Evento não possui Simulado vinculado." }, { status: 404 });

  const { data: relation, error: relationError } = await supabase
    .from("simulado_questions")
    .select("id, simulado_id")
    .eq("id", relationId)
    .eq("simulado_id", event.simulado_id)
    .maybeSingle();
  if (relationError) return NextResponse.json({ ok: false, message: "Não foi possível verificar a questão." }, { status: 500 });
  if (!relation) return NextResponse.json({ ok: false, message: "Questão não encontrada no Simulado deste Evento." }, { status: 404 });

  try {
    const result = await setSimuladoQuestionAnnulment(supabase, {
      simuladoQuestionId: relationId,
      targetStatus,
      reason,
      actorId: manager.actor.id,
      actorName: manager.actor.full_name,
      actorType: manager.role,
    });
    if (!result.ok) return NextResponse.json({ ok: false, message: result.message }, { status: 409 });

    // O status já mudou (compare-and-swap confirmado) mesmo quando o
    // reprocessamento fica pendente — não é um erro do ponto de vista do
    // Professor/aluno, é um estado recuperável (getPendingReconciliationSummary
    // / POST .../reconciliation, Admin-only). Nunca reportar como falha genérica.
    if (result.pendingReconciliation) {
      return NextResponse.json({
        ok: true,
        message:
          targetStatus === "annulled"
            ? "Questão anulada. O recálculo dos resultados afetados ficou pendente e será concluído automaticamente na próxima ação — se persistir, avise um Admin."
            : "Questão desanulada. O recálculo dos resultados afetados ficou pendente e será concluído automaticamente na próxima ação — se persistir, avise um Admin.",
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
    void logSystemError({ source: "api.professor.events.questions.annul", error, request, metadata: { event_id: eventId, relation_id: relationId, target_status: targetStatus } });
    return NextResponse.json({ ok: false, message: "Não foi possível concluir a operação. Tente novamente." }, { status: 500 });
  }
}
