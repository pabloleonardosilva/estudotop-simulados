import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { calcReleaseSchedule, isWithinFinalExamWindow } from "@/app/admin/jornadas/utils";
import { createStudentAccount } from "@/lib/server/studentAccountService";
import { generateTemporaryPassword } from "@/lib/utils/password";
import type { NormalizedHotmartEvent } from "./types";
import { recordHotmartHistory } from "./history";

type Mapping = {
  id: string;
  status: "active" | "inactive" | "archived";
  destination_type: "jornada" | "event";
  jornada_id: string | null;
  event_id: string | null;
};

export function shouldApplyHotmartFinancialTransition(
  currentOrigin: string,
  currentState: string,
  currentReason: string | null,
  nextState: string,
  nextReason: string,
) {
  return currentOrigin === "hotmart" && (currentState !== nextState || currentReason !== nextReason);
}

export function isHotmartRefundAlreadyConfirmed(refundStatus: string | null, refundRequestState: string | null) {
  return refundStatus === "confirmed" && refundRequestState === "confirmed";
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

async function resolveStudent(supabase: SupabaseClient, event: NormalizedHotmartEvent, transactionId: string) {
  const { data: existing, error } = await supabase
    .from("students")
    .select("id,email")
    .ilike("email", event.buyer.email)
    .maybeSingle();
  if (error) throw error;
  if (existing) return { id: existing.id, created: false, possibleDuplicate: false };

  const document = event.buyer.document?.replace(/\D/g, "") || null;
  const phone = event.buyer.phone?.replace(/\D/g, "") || null;
  const duplicateFilters = [document ? `cpf.eq.${document}` : null, phone ? `phone.eq.${phone}` : null].filter(Boolean);
  const { data: duplicate } = duplicateFilters.length
    ? await supabase.from("students").select("id,cpf,phone").or(duplicateFilters.join(",")).limit(1).maybeSingle()
    : { data: null };

  const account = await createStudentAccount(supabase, {
    fullName: event.buyer.name || event.buyer.email.split("@")[0],
    email: event.buyer.email,
    cpf: duplicate ? null : document,
    phone,
    desiredContests: null,
    temporaryPassword: generateTemporaryPassword(),
    status: "active",
    extraStudentFields: { origin: "Hotmart" },
  });
  await supabase.from("profiles").update({ is_active: true, must_change_password: true }).eq("id", account.userId);
  if (duplicate) {
    const sameCpf = Boolean(document && duplicate.cpf?.replace(/\D/g, "") === document);
    const samePhone = Boolean(phone && duplicate.phone?.replace(/\D/g, "") === phone);
    await supabase.from("hotmart_transactions").update({
      possible_duplicate_student_id: duplicate.id,
      duplicate_match_reason: sameCpf && samePhone ? "cpf_and_phone" : sameCpf ? "cpf" : "phone",
    }).eq("id", transactionId);
  }
  await recordHotmartHistory(supabase, {
    action: "student_created",
    actorType: "hotmart",
    studentId: account.userId,
    transactionId,
    metadata: { possible_duplicate: Boolean(duplicate), duplicate_student_id: duplicate?.id || null },
  });
  return { id: account.userId, created: true, possibleDuplicate: Boolean(duplicate) };
}

async function grantJornada(supabase: SupabaseClient, event: NormalizedHotmartEvent, transactionId: string, mapping: Mapping, studentId: string) {
  const { data: jornada } = await supabase.from("jornadas")
    .select("id,title,status,duration_days,duration_months,release_duration_days,planned_simulados_count,exam_date")
    .eq("id", mapping.jornada_id).maybeSingle();
  if (!jornada || jornada.status !== "published") return { status: "pending_destination" as const };

  const { data: existing } = await supabase.from("student_jornadas")
    .select("id,status,access_origin,started_at,expires_at")
    .eq("student_id", studentId).eq("jornada_id", jornada.id).maybeSingle();
  if (existing?.access_origin === "hotmart" && existing.status !== "expired") {
    return { status: "pending_duplicate_purchase" as const };
  }

  const approvedAt = new Date(event.purchase.approvedAt || event.creationDate || new Date().toISOString());
  const startedAt = isoDate(approvedAt);
  const durationDays = Number(jornada.duration_days || jornada.duration_months * 30);
  const expires = new Date(approvedAt);
  expires.setUTCDate(expires.getUTCDate() + durationDays);

  const { data: schedule } = await supabase.from("jornada_simulados")
    .select("id,simulado_id,order_number")
    .eq("jornada_id", jornada.id).order("order_number");
  const ordered = schedule || [];
  const examDate = jornada.exam_date ? new Date(`${jornada.exam_date}T00:00:00Z`) : null;
  const releaseDates = calcReleaseSchedule(
    approvedAt,
    ordered.length,
    Number(jornada.release_duration_days || durationDays),
    examDate,
    Number(jornada.planned_simulados_count || ordered.length),
  );

  let enrollmentId: string;
  if (existing) {
    enrollmentId = existing.id;
    await supabase.from("student_jornadas").update({
      started_at: startedAt, expires_at: isoDate(expires), status: "active", access_origin: "hotmart",
      commercial_block_reason: null, commercial_blocked_at: null,
    }).eq("id", existing.id);
  } else {
    const { data, error } = await supabase.from("student_jornadas").insert({
      student_id: studentId, jornada_id: jornada.id, started_at: startedAt, expires_at: isoDate(expires),
      status: "active", access_origin: "hotmart",
    }).select("id").single();
    if (error || !data) throw error || new Error("Falha ao criar matrícula Hotmart.");
    enrollmentId = data.id;
  }

  if (ordered.length) {
    const releaseAll = isWithinFinalExamWindow(approvedAt, examDate);
    const { data: currentSchedule } = await supabase.from("student_jornada_simulados")
      .select("id,jornada_simulado_id,status,released_at")
      .eq("student_jornada_id", enrollmentId);
    const currentByJornadaSimulado = new Map((currentSchedule || []).map((item) => [item.jornada_simulado_id, item]));
    const safeRows = ordered.flatMap((item, index) => {
      const current = currentByJornadaSimulado.get(item.id);
      if (current && current.status !== "locked") return [];
      return [{
      student_jornada_id: enrollmentId,
      jornada_simulado_id: item.id,
      simulado_id: item.simulado_id,
      order_number: item.order_number,
      scheduled_release_at: isoDate(releaseDates[index]),
      status: releaseAll || index === 0 ? "available" : "locked",
      released_at: releaseAll || index === 0 ? new Date().toISOString() : null,
      }];
    });
    if (safeRows.length) await supabase.from("student_jornada_simulados").upsert(safeRows, { onConflict: "student_jornada_id,jornada_simulado_id" });
  }

  const { data: link, error: linkError } = await supabase.from("hotmart_access_links").insert({
    hotmart_transaction_id: transactionId, student_id: studentId, destination_type: "jornada",
    student_jornada_id: enrollmentId, current_origin: "hotmart", access_state: "active",
    access_started_at: event.purchase.approvedAt || event.creationDate, access_expires_at: expires.toISOString(),
  }).select("id").single();
  if (linkError || !link) throw linkError || new Error("Falha ao vincular acesso Hotmart.");
  await recordHotmartHistory(supabase, { action: existing ? "manual_access_converted_to_hotmart" : "jornada_access_granted", actorType: "hotmart", studentId, transactionId, mappingId: mapping.id, accessLinkId: link.id });
  return { status: "processed" as const };
}

async function grantEvent(supabase: SupabaseClient, transactionId: string, mapping: Mapping, studentId: string) {
  const { data: event } = await supabase.from("simulado_events").select("id,status,starts_at,ends_at")
    .eq("id", mapping.event_id).maybeSingle();
  if (!event || !["scheduled", "active"].includes(event.status)) return { status: "pending_destination" as const };
  const { data: existing } = await supabase.from("simulado_event_participants")
    .select("id,access_origin").eq("event_id", event.id).eq("student_id", studentId).maybeSingle();
  if (existing?.access_origin === "hotmart") return { status: "pending_duplicate_purchase" as const };
  const { data: participant, error } = existing
    ? await supabase.from("simulado_event_participants").update({ access_origin: "hotmart", access_status: "active", commercial_block_reason: null, commercial_blocked_at: null }).eq("id", existing.id).select("id").single()
    : await supabase.from("simulado_event_participants").insert({ event_id: event.id, student_id: studentId, source: "hotmart", access_origin: "hotmart" }).select("id").single();
  if (error || !participant) throw error || new Error("Falha ao criar participação Hotmart.");
  const { data: link, error: linkError } = await supabase.from("hotmart_access_links").insert({
    hotmart_transaction_id: transactionId, student_id: studentId, destination_type: "event",
    event_participant_id: participant.id, current_origin: "hotmart", access_state: "active",
  }).select("id").single();
  if (linkError || !link) throw linkError || new Error("Falha ao vincular participação Hotmart.");
  await recordHotmartHistory(supabase, { action: existing ? "manual_event_converted_to_hotmart" : "event_access_granted", actorType: "hotmart", studentId, transactionId, mappingId: mapping.id, accessLinkId: link.id });
  return { status: "processed" as const };
}

async function applyFinancialState(supabase: SupabaseClient, event: NormalizedHotmartEvent, transactionId: string) {
  const { data: link } = await supabase.from("hotmart_access_links")
    .select("id,student_id,student_jornada_id,event_participant_id,current_origin,access_state,block_reason")
    .eq("hotmart_transaction_id", transactionId).maybeSingle();
  if (!link || link.current_origin !== "hotmart") return "pending_destination";
  const delayed = event.event === "PURCHASE_DELAYED";
  const reason = delayed ? "hotmart_overdue" : event.event === "PURCHASE_REFUNDED" ? "hotmart_refund" : event.event === "PURCHASE_CHARGEBACK" ? "hotmart_chargeback" : "hotmart_cancelled";
  const status = delayed ? "paused" : "cancelled";
  if (!shouldApplyHotmartFinancialTransition(link.current_origin, link.access_state, link.block_reason, status, reason)) {
    return "blocked_financial";
  }
  const blockedAt = new Date().toISOString();
  if (link.student_jornada_id) await supabase.from("student_jornadas").update({ status, commercial_block_reason: reason, commercial_blocked_at: blockedAt }).eq("id", link.student_jornada_id);
  if (link.event_participant_id) await supabase.from("simulado_event_participants").update({ access_status: status, commercial_block_reason: reason, commercial_blocked_at: blockedAt }).eq("id", link.event_participant_id);
  await supabase.from("hotmart_access_links").update({ access_state: status, blocked_at: blockedAt, block_reason: reason }).eq("id", link.id);
  await recordHotmartHistory(supabase, { action: reason, actorType: "hotmart", studentId: link.student_id, transactionId, accessLinkId: link.id });
  return "blocked_financial";
}

async function reactivateOverdueAccess(supabase: SupabaseClient, transactionId: string) {
  const { data: link } = await supabase.from("hotmart_access_links")
    .select("id,student_id,student_jornada_id,event_participant_id,current_origin,block_reason")
    .eq("hotmart_transaction_id", transactionId).maybeSingle();
  if (!link || link.current_origin !== "hotmart" || link.block_reason !== "hotmart_overdue") return false;
  if (link.student_jornada_id) await supabase.from("student_jornadas").update({ status: "active", commercial_block_reason: null, commercial_blocked_at: null }).eq("id", link.student_jornada_id);
  if (link.event_participant_id) await supabase.from("simulado_event_participants").update({ access_status: "active", commercial_block_reason: null, commercial_blocked_at: null }).eq("id", link.event_participant_id);
  await supabase.from("hotmart_access_links").update({ access_state: "active", blocked_at: null, block_reason: null }).eq("id", link.id);
  await supabase.from("hotmart_transactions").update({ processing_status: "processed", processed_at: new Date().toISOString() }).eq("id", transactionId);
  await recordHotmartHistory(supabase, { action: "financial_access_reactivated", actorType: "hotmart", studentId: link.student_id, transactionId, accessLinkId: link.id });
  return true;
}

export async function processHotmartEvent(supabase: SupabaseClient, event: NormalizedHotmartEvent) {
  const transactionPayload = {
    transaction_code: event.transactionCode,
    hotmart_product_ucode: event.product.ucode,
    hotmart_product_id: event.product.id,
    product_name_snapshot: event.product.name,
    offer_name_snapshot: event.product.offerName,
    buyer_name: event.buyer.name,
    buyer_email: event.buyer.email,
    buyer_document: event.buyer.document,
    buyer_document_type: event.buyer.documentType,
    buyer_phone: event.buyer.phone,
    purchase_status: event.purchase.status,
    purchase_approved_at: event.purchase.approvedAt,
    purchase_created_at: event.purchase.createdAt,
    currency: event.purchase.currency,
    amount: event.purchase.amount,
    payment_type: event.purchase.paymentType,
    installments: event.purchase.installments,
  };
  const { data: transaction, error } = await supabase.from("hotmart_transactions")
    .upsert(transactionPayload, { onConflict: "transaction_code" }).select("id,student_id,processing_status,refund_status,refund_request_state,refund_confirmed_at").single();
  if (error || !transaction) throw error || new Error("Falha ao registrar transação Hotmart.");

  if (["PURCHASE_DELAYED", "PURCHASE_REFUNDED", "PURCHASE_CHARGEBACK", "PURCHASE_CANCELED"].includes(event.event)) {
    if (event.event === "PURCHASE_REFUNDED" && isHotmartRefundAlreadyConfirmed(transaction.refund_status, transaction.refund_request_state)) {
      return "blocked_financial";
    }
    const status = await applyFinancialState(supabase, event, transaction.id);
    await supabase.from("hotmart_transactions").update({ processing_status: status, processed_at: new Date().toISOString(), refund_status: event.event === "PURCHASE_REFUNDED" ? "confirmed" : undefined, refund_confirmed_at: event.event === "PURCHASE_REFUNDED" ? transaction.refund_confirmed_at || new Date().toISOString() : undefined, refund_request_state: event.event === "PURCHASE_REFUNDED" ? "confirmed" : undefined }).eq("id", transaction.id);
    return status;
  }

  if (!["PURCHASE_APPROVED", "PURCHASE_COMPLETE"].includes(event.event)) return "received";
  if (transaction.processing_status === "processed") return "processed";
  if (await reactivateOverdueAccess(supabase, transaction.id)) return "processed";

  const student = transaction.student_id
    ? { id: transaction.student_id, created: false, possibleDuplicate: false }
    : await resolveStudent(supabase, event, transaction.id);
  const { data: mapping } = await supabase.from("hotmart_product_mappings")
    .select("id,status,destination_type,jornada_id,event_id").eq("hotmart_product_ucode", event.product.ucode).maybeSingle();
  if (!mapping || mapping.status !== "active") {
    const status = "pending_mapping";
    await supabase.from("hotmart_transactions").update({ student_id: student.id, processing_status: status }).eq("id", transaction.id);
    return status;
  }
  await supabase.from("hotmart_transactions").update({
    student_id: student.id, mapping_id: mapping.id, destination_type: mapping.destination_type,
    jornada_id: mapping.jornada_id, event_id: mapping.event_id,
  }).eq("id", transaction.id);
  const result = mapping.destination_type === "jornada"
    ? await grantJornada(supabase, event, transaction.id, mapping as Mapping, student.id)
    : await grantEvent(supabase, transaction.id, mapping as Mapping, student.id);
  await supabase.from("hotmart_transactions").update({ processing_status: result.status, processed_at: result.status === "processed" ? new Date().toISOString() : null }).eq("id", transaction.id);
  return result.status;
}

export async function reprocessHotmartTransaction(supabase: SupabaseClient, transactionId: string) {
  const { data: transaction, error } = await supabase.from("hotmart_transactions").select(`
    id, transaction_code, hotmart_product_ucode, hotmart_product_id,
    product_name_snapshot, offer_name_snapshot, student_id,
    buyer_name, buyer_email, buyer_document, buyer_document_type, buyer_phone,
    purchase_status, purchase_approved_at, purchase_created_at, currency, amount,
    payment_type, installments, processing_status
  `).eq("id", transactionId).maybeSingle();
  if (error || !transaction) throw error || new Error("Transação Hotmart não encontrada.");
  if (["processed", "resolved", "refund_requested", "manual_refund_required", "blocked_financial"].includes(transaction.processing_status)) return transaction.processing_status;
  const { error: attemptError } = await supabase.rpc("increment_hotmart_processing_attempt", { p_transaction_id: transactionId });
  if (attemptError) {
    await recordHotmartHistory(supabase, { action: "transaction_reprocess_attempt_failed", actorType: "system", transactionId, metadata: { error_code: attemptError.code || "RPC_ERROR" } });
    throw new Error("Não foi possível registrar a tentativa de reprocessamento.");
  }
  const normalized: NormalizedHotmartEvent = {
    externalEventId: `reprocess:${transaction.id}`,
    event: "PURCHASE_APPROVED",
    version: null,
    creationDate: transaction.purchase_created_at,
    transactionCode: transaction.transaction_code,
    product: { id: transaction.hotmart_product_id, ucode: transaction.hotmart_product_ucode, name: transaction.product_name_snapshot, offerName: transaction.offer_name_snapshot },
    buyer: { name: transaction.buyer_name, email: transaction.buyer_email, document: transaction.buyer_document, documentType: transaction.buyer_document_type, phone: transaction.buyer_phone },
    purchase: { status: transaction.purchase_status, approvedAt: transaction.purchase_approved_at, createdAt: transaction.purchase_created_at, currency: transaction.currency, amount: transaction.amount, paymentType: transaction.payment_type, installments: transaction.installments },
  };
  return processHotmartEvent(supabase, normalized);
}
