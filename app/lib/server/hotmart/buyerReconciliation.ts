import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { HotmartProductionCatalogError, type HotmartProductionSale } from "./productionCatalog";
import { evaluateHotmartJornadaCommercialDates, processHotmartEvent, reprocessHotmartTransaction } from "./processor";
import { recordHotmartHistory } from "./history";
import { sendHotmartTransactionEmail } from "./email";
import type { NormalizedHotmartEvent } from "./types";

// Reconciliação de compradores históricos de um produto vinculado. Nunca altera matrícula,
// participação, cronograma, tentativas, resultados ou TopCoins existentes: quem já está no
// destino é apenas classificado como "already_inserted". A concessão reutiliza o processor
// comercial (mesmas regras de data a partir da aprovação original), sem fabricar webhook.

// COMPLETE = compra paga cuja garantia expirou; o processor já concede acesso em PURCHASE_COMPLETE.
export const HOTMART_RECONCILIATION_ELIGIBLE_STATUSES = ["APPROVED", "COMPLETE"];

const FINANCIAL_BLOCK_STATUSES = ["blocked_financial", "refund_requested", "manual_refund_required", "refund_reconciliation_required"];
const REPROCESSABLE_STATUSES = ["received", "pending_mapping", "pending_destination", "processing_error"];

export type ReconciliationCategory = "ready" | "already_inserted" | "review" | "expired" | "not_eligible";

export type ReconciliationMapping = {
  id: string;
  hotmart_product_ucode: string;
  hotmart_product_name: string;
  destination_type: "jornada" | "event";
  jornada_id: string | null;
  event_id: string | null;
  status: string;
};

type ExistingTransaction = {
  id: string;
  transaction_code: string;
  hotmart_product_ucode: string;
  student_id: string | null;
  processing_status: string;
  processing_error_code: string | null;
  refund_status: string | null;
  refund_request_state: string | null;
  possible_duplicate_student_id: string | null;
  resolved_at: string | null;
};

type StudentRow = { id: string; email: string | null; status: string | null };
type EnrollmentRow = { id: string; student_id: string; status: string | null };

export type ReconciliationDestination =
  | { type: "jornada"; id: string; name: string; status: string; durationDays: number }
  | { type: "event"; id: string; name: string; status: string; startsAt: string | null; endsAt: string | null };

export type ReconciliationContext = {
  mapping: ReconciliationMapping;
  destination: ReconciliationDestination | null;
  transactionsByCode: Map<string, ExistingTransaction>;
  linkedTransactionIds: Set<string>;
  studentsByEmail: Map<string, StudentRow[]>;
  studentsById: Map<string, StudentRow>;
  enrollmentsByStudent: Map<string, EnrollmentRow>;
};

export type ReconciliationRow = {
  transaction: string;
  buyer_name: string | null;
  buyer_email: string | null;
  purchase_status: string;
  approved_at: string | null;
  ordered_at: string | null;
  category: ReconciliationCategory;
  reason: string | null;
  situation: string;
  access_start: string | null;
  access_end: string | null;
  transaction_registered: boolean;
};

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

const enrollmentLabels: Record<string, string> = { active: "ativo", paused: "pausado", expired: "expirado", cancelled: "cancelado" };

export function getImportBlockedReason(context: Pick<ReconciliationContext, "mapping" | "destination">) {
  if (context.mapping.status !== "active") return "O vínculo está inativo ou arquivado. Ative-o para inserir compradores.";
  if (!context.destination) return "O destino vinculado não foi encontrado.";
  if (context.destination.type === "jornada" && context.destination.status !== "published") return "A Jornada vinculada não está publicada. Publique-a para inserir compradores.";
  if (context.destination.type === "event" && !["scheduled", "active"].includes(context.destination.status)) return "O Evento vinculado não está agendado nem ativo.";
  return null;
}

export async function loadHotmartReconciliationContext(supabase: SupabaseClient, mapping: ReconciliationMapping, sales: HotmartProductionSale[]): Promise<ReconciliationContext> {
  let destination: ReconciliationDestination | null = null;
  if (mapping.destination_type === "jornada" && mapping.jornada_id) {
    const { data, error } = await supabase.from("jornadas").select("id,title,status,duration_days,duration_months").eq("id", mapping.jornada_id).maybeSingle();
    if (error) throw error;
    if (data) destination = { type: "jornada", id: data.id, name: data.title, status: data.status, durationDays: Number(data.duration_days || Number(data.duration_months || 0) * 30) };
  } else if (mapping.destination_type === "event" && mapping.event_id) {
    const { data, error } = await supabase.from("simulado_events").select("id,name,status,starts_at,ends_at").eq("id", mapping.event_id).maybeSingle();
    if (error) throw error;
    if (data) destination = { type: "event", id: data.id, name: data.name, status: data.status, startsAt: data.starts_at || null, endsAt: data.ends_at || null };
  }

  const transactionsByCode = new Map<string, ExistingTransaction>();
  for (const codes of chunk(sales.map((sale) => sale.transaction), 150)) {
    const { data, error } = await supabase.from("hotmart_transactions")
      .select("id,transaction_code,hotmart_product_ucode,student_id,processing_status,processing_error_code,refund_status,refund_request_state,possible_duplicate_student_id,resolved_at")
      .in("transaction_code", codes);
    if (error) throw error;
    for (const row of (data || []) as ExistingTransaction[]) transactionsByCode.set(row.transaction_code, row);
  }

  const linkedTransactionIds = new Set<string>();
  for (const ids of chunk([...transactionsByCode.values()].map((row) => row.id), 150)) {
    const { data, error } = await supabase.from("hotmart_access_links").select("hotmart_transaction_id").in("hotmart_transaction_id", ids);
    if (error) throw error;
    for (const row of data || []) linkedTransactionIds.add(row.hotmart_transaction_id);
  }

  // E-mail é comparado sem diferenciar maiúsculas: ilike entre aspas e conferência exata em memória
  // (o "_" de e-mails é curinga no ilike, então o filtro do banco é só uma pré-seleção).
  const studentsByEmail = new Map<string, StudentRow[]>();
  const studentsById = new Map<string, StudentRow>();
  const emails = [...new Set(sales.map((sale) => sale.buyerEmail).filter((email): email is string => Boolean(email)))];
  for (const group of chunk(emails, 40)) {
    const { data, error } = await supabase.from("students").select("id,email,status")
      .or(group.map((email) => `email.ilike."${email.replace(/"/g, "")}"`).join(","));
    if (error) throw error;
    for (const student of (data || []) as StudentRow[]) {
      const key = (student.email || "").toLowerCase();
      if (!group.includes(key)) continue;
      studentsByEmail.set(key, [...(studentsByEmail.get(key) || []).filter((item) => item.id !== student.id), student]);
      studentsById.set(student.id, student);
    }
  }
  const missingIds = [...new Set([...transactionsByCode.values()].map((row) => row.student_id).filter((id): id is string => Boolean(id) && !studentsById.has(id as string)))];
  for (const ids of chunk(missingIds, 150)) {
    const { data, error } = await supabase.from("students").select("id,email,status").in("id", ids);
    if (error) throw error;
    for (const student of (data || []) as StudentRow[]) studentsById.set(student.id, student);
  }

  const enrollmentsByStudent = new Map<string, EnrollmentRow>();
  if (destination) {
    for (const ids of chunk([...studentsById.keys()], 150)) {
      const { data, error } = destination.type === "jornada"
        ? await supabase.from("student_jornadas").select("id,student_id,status").eq("jornada_id", destination.id).in("student_id", ids)
        : await supabase.from("simulado_event_participants").select("id,student_id,access_status").eq("event_id", destination.id).in("student_id", ids);
      if (error) throw error;
      for (const row of (data || []) as Array<{ id: string; student_id: string; status?: string | null; access_status?: string | null }>) {
        enrollmentsByStudent.set(row.student_id, { id: row.id, student_id: row.student_id, status: row.status ?? row.access_status ?? null });
      }
    }
  }

  return { mapping, destination, transactionsByCode, linkedTransactionIds, studentsByEmail, studentsById, enrollmentsByStudent };
}

export function classifyHotmartSale(sale: HotmartProductionSale, context: ReconciliationContext, now = new Date()): ReconciliationRow {
  const existing = context.transactionsByCode.get(sale.transaction) || null;
  const base = {
    transaction: sale.transaction,
    buyer_name: sale.buyerName,
    buyer_email: sale.buyerEmail,
    purchase_status: sale.status,
    approved_at: sale.approvedAt,
    ordered_at: sale.orderedAt,
    access_start: null as string | null,
    access_end: null as string | null,
    transaction_registered: Boolean(existing),
  };
  const row = (category: ReconciliationCategory, situation: string, reason: string | null = null): ReconciliationRow => ({ ...base, category, situation, reason });

  if (!HOTMART_RECONCILIATION_ELIGIBLE_STATUSES.includes(sale.status)) return row("not_eligible", "Não elegível", `Status Hotmart ${sale.status || "desconhecido"} não concede acesso.`);
  if (existing && existing.hotmart_product_ucode.toLowerCase() !== context.mapping.hotmart_product_ucode.toLowerCase()) {
    return row("review", "Revisão necessária", "A transação já está registrada para outro produto.");
  }
  if (existing && context.linkedTransactionIds.has(existing.id)) return row("already_inserted", "Já inserido", "Acesso já concedido por esta transação.");
  if (existing && (existing.refund_status === "confirmed" || existing.refund_request_state || FINANCIAL_BLOCK_STATUSES.includes(existing.processing_status))) {
    return row("not_eligible", "Não elegível", "Há bloqueio financeiro ou pedido de estorno registrado para esta transação.");
  }

  const student = existing?.student_id ? context.studentsById.get(existing.student_id) || null : null;
  const emailMatches = sale.buyerEmail ? context.studentsByEmail.get(sale.buyerEmail) || [] : [];
  if (student) {
    const enrollment = context.enrollmentsByStudent.get(student.id);
    if (enrollment) return row("already_inserted", "Já inserido", `Matrícula existente (${enrollmentLabels[enrollment.status || ""] || enrollment.status || "registrada"}); nada será alterado.`);
  }
  for (const match of emailMatches) {
    const enrollment = context.enrollmentsByStudent.get(match.id);
    if (enrollment) return row("already_inserted", "Já inserido", `Matrícula existente (${enrollmentLabels[enrollment.status || ""] || enrollment.status || "registrada"}); nada será alterado.`);
  }

  if (!sale.buyerEmail || !sale.buyerEmail.includes("@")) return row("review", "Revisão necessária", "A Hotmart não informou um e-mail identificável para o comprador.");
  if (existing?.student_id && !student) return row("review", "Revisão necessária", "A transação aponta para uma conta que não foi encontrada.");
  if (student && (student.email || "").toLowerCase() !== sale.buyerEmail) return row("review", "Revisão necessária", "A conta já associada à transação tem e-mail diferente do e-mail da compra.");
  if (!student && emailMatches.length > 1) return row("review", "Revisão necessária", "Mais de uma conta corresponde ao e-mail da compra.");
  if (existing?.possible_duplicate_student_id && !existing.resolved_at) return row("review", "Revisão necessária", "Possível cadastro duplicado (CPF ou telefone de outra conta) aguardando decisão.");
  const account = student || emailMatches[0] || null;
  if (account?.status === "blocked") return row("review", "Revisão necessária", "A conta do comprador está bloqueada.");
  if (existing && !REPROCESSABLE_STATUSES.includes(existing.processing_status)) {
    return row("review", "Revisão necessária", existing.processing_status === "processing" ? "A transação está em processamento." : "A transação já tem uma situação comercial que exige tratamento em Pendências.");
  }

  const destination = context.destination;
  if (destination?.type === "jornada") {
    const dates = evaluateHotmartJornadaCommercialDates(sale.approvedAt, destination.durationDays, now);
    if (!dates.ok && dates.reason !== "expired") return row("review", "Revisão necessária", "A Hotmart não informou uma data de aprovação válida.");
    base.access_start = dates.approvedAt;
    base.access_end = dates.expiresAt;
    if (!dates.ok) return row("expired", "Acesso expirado", "O prazo calculado a partir da data original da compra já terminou; nenhum novo prazo é concedido.");
  } else if (destination?.type === "event") {
    if (!sale.approvedAt) return row("review", "Revisão necessária", "A Hotmart não informou uma data de aprovação válida.");
    base.access_start = sale.approvedAt;
    base.access_end = destination.endsAt;
  }
  return row("ready", account ? "Pronto para inserir (conta existente)" : "Pronto para inserir (nova conta)");
}

// Várias compras do mesmo comprador: só a aprovação mais recente fica selecionável; as demais vão para revisão.
export function classifyHotmartSales(sales: HotmartProductionSale[], context: ReconciliationContext, now = new Date()) {
  const rows = sales.map((sale) => classifyHotmartSale(sale, context, now));
  const latestReadyByEmail = new Map<string, ReconciliationRow>();
  for (const row of rows) {
    if (row.category !== "ready" || !row.buyer_email) continue;
    const current = latestReadyByEmail.get(row.buyer_email);
    if (!current || (row.approved_at || "") > (current.approved_at || "")) latestReadyByEmail.set(row.buyer_email, row);
  }
  return rows.map((row) => row.category === "ready" && row.buyer_email && latestReadyByEmail.get(row.buyer_email) !== row
    ? { ...row, category: "review" as const, situation: "Revisão necessária", reason: "Outra compra mais recente deste comprador já está disponível para inserção." }
    : row);
}

export function summarizeReconciliationRows(rows: ReconciliationRow[]) {
  return {
    eligible: rows.filter((row) => row.category !== "not_eligible").length,
    already_inserted: rows.filter((row) => row.category === "already_inserted").length,
    not_inserted: rows.filter((row) => row.category === "ready").length,
    review: rows.filter((row) => row.category === "review").length,
    expired: rows.filter((row) => row.category === "expired").length,
    not_eligible: rows.filter((row) => row.category === "not_eligible").length,
  };
}

function normalizedHistoricalEvent(sale: HotmartProductionSale, mapping: ReconciliationMapping, productId: number): NormalizedHotmartEvent {
  return {
    externalEventId: `historical-reconciliation:${sale.transaction}`,
    event: sale.status === "COMPLETE" ? "PURCHASE_COMPLETE" : "PURCHASE_APPROVED",
    version: null,
    creationDate: sale.approvedAt,
    transactionCode: sale.transaction,
    product: { id: String(productId), ucode: mapping.hotmart_product_ucode.toLowerCase(), name: sale.productName || mapping.hotmart_product_name, offerName: null },
    buyer: { name: sale.buyerName, email: sale.buyerEmail as string, document: null, documentType: null, phone: null },
    purchase: { status: sale.status, approvedAt: sale.approvedAt, createdAt: sale.orderedAt, currency: sale.currency, amount: sale.amount, paymentType: sale.paymentType, installments: sale.installments },
  };
}

export type ReconciliationImportOutcome = "inserted" | ReconciliationCategory | "not_found" | "error";

// Importa UMA venda já revalidada na Hotmart pelo servidor. Reclassifica com o estado atual do banco
// (idempotência): só "ready" escreve. Transação já registrada é reprocessada a partir dos próprios
// dados; transação ausente é registrada pelo processor, sem criar hotmart_webhook_events.
export async function importHotmartHistoricalSale(supabase: SupabaseClient, input: {
  sale: HotmartProductionSale;
  mapping: ReconciliationMapping;
  productId: number;
  adminId: string;
  sendAccessEmail: boolean;
  now?: Date;
}): Promise<{ outcome: ReconciliationImportOutcome; reason: string | null; row: ReconciliationRow | null; emailSent: boolean }> {
  const context = await loadHotmartReconciliationContext(supabase, input.mapping, [input.sale]);
  const blocked = getImportBlockedReason(context);
  const row = classifyHotmartSale(input.sale, context, input.now);
  if (row.category !== "ready") return { outcome: row.category, reason: row.reason, row, emailSent: false };
  if (blocked) return { outcome: "review", reason: blocked, row: { ...row, category: "review", situation: "Revisão necessária", reason: blocked }, emailSent: false };

  const existing = context.transactionsByCode.get(input.sale.transaction) || null;
  let status: string;
  try {
    status = existing
      ? await reprocessHotmartTransaction(supabase, existing.id)
      : await processHotmartEvent(supabase, normalizedHistoricalEvent(input.sale, input.mapping, input.productId));
  } catch {
    status = "processing_error";
  }
  const { data: transaction } = await supabase.from("hotmart_transactions").select("id,student_id").eq("transaction_code", input.sale.transaction).maybeSingle();
  const emailSent = status === "processed" && input.sendAccessEmail && transaction ? await sendHotmartTransactionEmail(supabase, transaction.id, false) : false;
  await recordHotmartHistory(supabase, {
    action: "historical_buyer_reconciled",
    actorType: "admin",
    actorId: input.adminId,
    studentId: transaction?.student_id || null,
    transactionId: transaction?.id || null,
    mappingId: input.mapping.id,
    metadata: {
      source: "hotmart_sales_history",
      result_status: status,
      transaction_registered_before: Boolean(existing),
      destination_type: input.mapping.destination_type,
      destination_id: input.mapping.jornada_id || input.mapping.event_id,
      access_email_requested: input.sendAccessEmail,
      access_email_sent: emailSent,
    },
  });
  if (status === "processed") {
    return { outcome: "inserted", reason: null, row: { ...row, category: "already_inserted", situation: "Já inserido", reason: "Inserido agora pela reconciliação." }, emailSent };
  }
  const reason = status === "processing_error" ? "Falha no processamento comercial; a transação ficou em Pendências." : "O processamento não concedeu o acesso; verifique em Pendências.";
  return { outcome: status === "processing_error" ? "error" : "review", reason, row: { ...row, category: "review", situation: "Revisão necessária", reason }, emailSent };
}

export function hotmartSalesErrorResponse(error: unknown) {
  const code = error instanceof HotmartProductionCatalogError ? error.code : "unavailable";
  const status = error instanceof HotmartProductionCatalogError ? error.details.status : undefined;
  const remote = status ? ` (HTTP ${status})` : "";
  if (code === "not_found") return NextResponse.json({ ok: false, message: "Produto não encontrado no catálogo de produção da Hotmart." }, { status: 404 });
  if (code === "not_configured" || code === "unauthorized") return NextResponse.json({ ok: false, message: `A credencial de produção da Hotmart não está configurada corretamente ou não tem acesso às vendas${remote}.` }, { status: 503 });
  if (code === "timeout") return NextResponse.json({ ok: false, message: "A consulta às vendas da Hotmart excedeu o tempo limite. Tente novamente." }, { status: 504 });
  if (code === "pagination_loop" || code === "pagination_limit") return NextResponse.json({ ok: false, message: "A paginação do histórico de vendas da Hotmart não terminou de forma segura. Nenhum dado foi alterado." }, { status: 502 });
  if (code === "rate_limited") return NextResponse.json({ ok: false, message: "A Hotmart limitou temporariamente as consultas (HTTP 429). Aguarde alguns minutos e tente novamente." }, { status: 503 });
  if (code === "remote_rejected") return NextResponse.json({ ok: false, message: `A Hotmart recusou a consulta de vendas${remote}. Nenhum dado foi alterado.` }, { status: 502 });
  if (code === "remote_unavailable") return NextResponse.json({ ok: false, message: `A Hotmart está instável no momento${remote}. Tente novamente em instantes.` }, { status: 502 });
  if (code === "invalid_response") return NextResponse.json({ ok: false, message: "A Hotmart retornou as vendas em um formato inesperado. Nenhum dado foi alterado." }, { status: 502 });
  return NextResponse.json({ ok: false, message: "Não foi possível consultar as vendas reais da Hotmart agora." }, { status: 502 });
}

// Fonte ÚNICA do log [HOTMART_SALES_DIAGNOSTIC] (Vercel): etapa, código, status remoto, vínculo/produto e,
// quando houver, os campos planos da query/erro/sondagens. Nunca inclui token, credencial ou dados de comprador.
export function logHotmartSalesDiagnostic(error: unknown, context: { mappingId: string; productUcode: string; productId?: number | null; phase?: string }) {
  const details = error instanceof HotmartProductionCatalogError ? error.details : {};
  console.error("[HOTMART_SALES_DIAGNOSTIC]", JSON.stringify({
    phase: details.phase || context.phase || "unknown",
    code: error instanceof HotmartProductionCatalogError ? error.code : "unexpected_error",
    remote_status: details.status ?? null,
    page: details.page ?? null,
    mapping_id: context.mappingId,
    product_ucode: context.productUcode,
    product_id: context.productId ?? null,
    ...(details.diagnostics || {}),
  }));
}

export async function loadReconciliationMapping(id: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("hotmart_product_mappings")
    .select("id,hotmart_product_ucode,hotmart_product_name,destination_type,jornada_id,event_id,status")
    .eq("id", id).maybeSingle();
  return { supabase, mapping: data as ReconciliationMapping | null, error };
}
