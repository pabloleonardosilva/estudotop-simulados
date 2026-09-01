import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { logAdminAction } from "@/app/lib/server/auditLogger";
import { recordHotmartHistory } from "@/app/lib/server/hotmart/history";
import { reprocessHotmartTransaction } from "@/app/lib/server/hotmart/processor";

type Action = "reprocess" | "extend_jornada" | "keep_separate" | "admin_cancel" | "admin_reactivate" | "grant_manual" | "add_days";

function extensionErrorMessage(error: { code?: string; message?: string }) {
  if (error.code === "PGRST202" || error.message?.includes("Could not find the function")) return "A extensão idempotente requer a migration complementar desta etapa.";
  if (error.message?.includes("HOTMART_ADMIN_INVALID")) return "Administrador inválido ou inativo.";
  if (error.message?.includes("HOTMART_TRANSACTION_NOT_FOUND")) return "Transação não encontrada.";
  if (error.message?.includes("HOTMART_TRANSACTION_NOT_EXTENDABLE")) return "A transação não está elegível para extensão.";
  if (error.message?.includes("HOTMART_MAPPING_DESTINATION_MISMATCH")) return "O mapping não corresponde à Jornada da transação.";
  if (error.message?.includes("HOTMART_ENROLLMENT_NOT_FOUND")) return "Matrícula correspondente não encontrada.";
  if (error.message?.includes("HOTMART_ENROLLMENT_NOT_ELIGIBLE")) return "A matrícula precisa estar ativa, vigente, regular e com origem Hotmart.";
  return "Não foi possível estender a matrícula.";
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  const body = await request.json().catch(() => null) as { action?: unknown; days?: unknown; reason?: unknown } | null;
  const action = typeof body?.action === "string" ? body.action as Action : null;
  if (!action || !["reprocess", "extend_jornada", "keep_separate", "admin_cancel", "admin_reactivate", "grant_manual", "add_days"].includes(action)) {
    return NextResponse.json({ ok: false, message: "Ação inválida." }, { status: 400 });
  }
  const supabase = createSupabaseAdminClient();
  if (action === "reprocess") {
    try {
      const status = await reprocessHotmartTransaction(supabase, id);
      await recordHotmartHistory(supabase, { action: "transaction_reprocessed", actorType: "admin", actorId: admin.id, transactionId: id, metadata: { processing_status: status } });
      return NextResponse.json({ ok: true, message: status === "processed" ? "Transação reprocessada com sucesso." : `Reprocessamento concluído com estado ${status}.`, processing_status: status });
    } catch {
      return NextResponse.json({ ok: false, message: "Não foi possível registrar ou concluir o reprocessamento." }, { status: 500 });
    }
  }
  if (action === "extend_jornada") {
    const { data, error } = await supabase.rpc("extend_hotmart_duplicate_jornada", { p_transaction_id: id, p_admin_id: admin.id });
    if (error) return NextResponse.json({ ok: false, message: extensionErrorMessage(error) }, { status: error.code === "PGRST202" ? 409 : 400 });
    const result = data?.[0] as { applied?: boolean; new_expires_at?: string } | undefined;
    return NextResponse.json({ ok: true, message: result?.applied ? `Matrícula estendida até ${result.new_expires_at}.` : "Esta transação já havia sido aplicada; nenhuma nova extensão ocorreu.", applied: Boolean(result?.applied) });
  }

  const { data: transaction } = await supabase.from("hotmart_transactions").select("id,student_id,processing_status").eq("id", id).maybeSingle();
  if (!transaction) return NextResponse.json({ ok: false, message: "Transação não encontrada." }, { status: 404 });
  if (action === "keep_separate") {
    const { data: applied, error: duplicateError } = await supabase.rpc("resolve_hotmart_duplicate_student_separate", { p_transaction_id: id, p_admin_id: admin.id });
    if (duplicateError) return NextResponse.json({ ok: false, message: duplicateError.code === "PGRST202" ? "A resolução requer a migration complementar desta etapa." : "Não foi possível resolver esta possível duplicidade." }, { status: 409 });
    return NextResponse.json({ ok: true, message: applied ? "Cadastros mantidos separados." : "Esta decisão já havia sido registrada; nenhuma alteração foi feita.", applied: Boolean(applied) });
  }

  const { data: link } = await supabase.from("hotmart_access_links").select("id,student_id,current_origin,access_state,block_reason,student_jornada_id,event_participant_id").eq("hotmart_transaction_id", id).maybeSingle();
  if (!link) return NextResponse.json({ ok: false, message: "Acesso vinculado não encontrado." }, { status: 404 });
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";

  if (action === "add_days") {
    const days = Number(body?.days);
    if (!link.student_jornada_id || !Number.isInteger(days) || days <= 0 || days > 3650) return NextResponse.json({ ok: false, message: "Informe de 1 a 3650 dias para uma Jornada." }, { status: 400 });
    const { data: enrollment } = await supabase.from("student_jornadas").select("expires_at").eq("id", link.student_jornada_id).single();
    const previous = enrollment?.expires_at;
    if (!previous) return NextResponse.json({ ok: false, message: "Matrícula não encontrada." }, { status: 404 });
    const next = new Date(`${previous}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + days);
    const nextDate = next.toISOString().slice(0, 10);
    await supabase.from("student_jornadas").update({ expires_at: nextDate }).eq("id", link.student_jornada_id);
    await supabase.from("hotmart_access_links").update({ access_expires_at: next.toISOString() }).eq("id", link.id);
    await recordHotmartHistory(supabase, { action: "admin_days_added", actorType: "admin", actorId: admin.id, studentId: link.student_id, transactionId: id, accessLinkId: link.id, previousData: { expires_at: previous }, newData: { expires_at: nextDate }, metadata: { days, reason } });
    return NextResponse.json({ ok: true, message: `${days} dia(s) adicionados à matrícula.` });
  }

  const now = new Date().toISOString();
  if (action === "admin_cancel") {
    if (link.student_jornada_id) await supabase.from("student_jornadas").update({ status: "cancelled", commercial_block_reason: "admin_cancelled", commercial_blocked_at: now }).eq("id", link.student_jornada_id);
    if (link.event_participant_id) await supabase.from("simulado_event_participants").update({ access_status: "cancelled", commercial_block_reason: "admin_cancelled", commercial_blocked_at: now }).eq("id", link.event_participant_id);
    await supabase.from("hotmart_access_links").update({ access_state: "cancelled", block_reason: "admin_cancelled", blocked_at: now }).eq("id", link.id);
  } else if (action === "admin_reactivate") {
    if (link.block_reason !== "admin_cancelled") return NextResponse.json({ ok: false, message: "Somente cancelamento administrativo pode ser reativado como Hotmart." }, { status: 409 });
    if (link.student_jornada_id) await supabase.from("student_jornadas").update({ status: "active", commercial_block_reason: null, commercial_blocked_at: null }).eq("id", link.student_jornada_id);
    if (link.event_participant_id) await supabase.from("simulado_event_participants").update({ access_status: "active", commercial_block_reason: null, commercial_blocked_at: null }).eq("id", link.event_participant_id);
    await supabase.from("hotmart_access_links").update({ access_state: "active", block_reason: null, blocked_at: null }).eq("id", link.id);
  } else if (action === "grant_manual") {
    if (!link.block_reason?.startsWith("hotmart_")) return NextResponse.json({ ok: false, message: "A conversão manual exige bloqueio financeiro Hotmart." }, { status: 409 });
    if (link.student_jornada_id) await supabase.from("student_jornadas").update({ status: "active", access_origin: "manual", commercial_block_reason: null, commercial_blocked_at: null }).eq("id", link.student_jornada_id);
    if (link.event_participant_id) await supabase.from("simulado_event_participants").update({ access_status: "active", access_origin: "manual", commercial_block_reason: null, commercial_blocked_at: null }).eq("id", link.event_participant_id);
    await supabase.from("hotmart_access_links").update({ access_state: "active", current_origin: "manual", block_reason: null, blocked_at: null }).eq("id", link.id);
  }
  await recordHotmartHistory(supabase, { action, actorType: "admin", actorId: admin.id, studentId: link.student_id, transactionId: id, accessLinkId: link.id, metadata: { reason } });
  void logAdminAction({ adminUserId: admin.id, action: `admin.hotmart.${action}`, entityType: "hotmart_transaction", entityId: id, request, metadata: { reason } });
  return NextResponse.json({ ok: true, message: "Ação aplicada com sucesso." });
}
