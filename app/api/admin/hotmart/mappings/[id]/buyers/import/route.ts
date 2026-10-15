import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { logAdminAction } from "@/app/lib/server/auditLogger";
import { findHotmartProductionProduct, listHotmartProductionSales } from "@/app/lib/server/hotmart/productionCatalog";
import { hotmartSalesErrorResponse, importHotmartHistoricalSale, loadReconciliationMapping, type ReconciliationImportOutcome, type ReconciliationRow } from "@/app/lib/server/hotmart/buyerReconciliation";
import { recordHotmartHistory } from "@/app/lib/server/hotmart/history";

export const maxDuration = 60;

const HOTMART_IMPORT_MAX_PER_REQUEST = 10;
const TRANSACTION_CODE_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;

// O navegador envia só os códigos de transação selecionados. Produto, destino, status e
// comprador vêm do mapping salvo e da própria Hotmart, revalidados aqui código a código.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  const body = await request.json().catch(() => null) as { transaction_codes?: unknown; send_access_email?: unknown } | null;
  const codes = Array.isArray(body?.transaction_codes) ? [...new Set(body.transaction_codes.filter((code): code is string => typeof code === "string").map((code) => code.trim()))] : [];
  if (!codes.length || codes.length > HOTMART_IMPORT_MAX_PER_REQUEST || codes.some((code) => !TRANSACTION_CODE_PATTERN.test(code))) {
    return NextResponse.json({ ok: false, message: `Envie de 1 a ${HOTMART_IMPORT_MAX_PER_REQUEST} códigos de transação válidos.` }, { status: 400 });
  }
  const sendAccessEmail = body?.send_access_email === true;

  const { supabase, mapping, error } = await loadReconciliationMapping(id);
  if (error) return NextResponse.json({ ok: false, message: "Não foi possível carregar o vínculo." }, { status: 500 });
  if (!mapping) return NextResponse.json({ ok: false, message: "Vínculo não encontrado." }, { status: 404 });
  if (mapping.status !== "active") return NextResponse.json({ ok: false, message: "O vínculo está inativo ou arquivado. Ative-o para inserir compradores." }, { status: 409 });

  let productId: number | null;
  try {
    productId = (await findHotmartProductionProduct(mapping.hotmart_product_ucode)).id;
  } catch (catalogError) {
    return hotmartSalesErrorResponse(catalogError);
  }
  if (!productId) return NextResponse.json({ ok: false, message: "A Hotmart não informou o ID numérico deste produto; não é possível validar as vendas." }, { status: 502 });

  const results: Array<{ transaction: string; outcome: ReconciliationImportOutcome; reason: string | null; row: ReconciliationRow | null }> = [];
  for (const code of codes) {
    let sale;
    try {
      sale = (await listHotmartProductionSales({ productId, transaction: code })).find((item) => item.transaction === code) || null;
    } catch {
      results.push({ transaction: code, outcome: "error", reason: "Não foi possível revalidar esta venda na Hotmart.", row: null });
      continue;
    }
    if (!sale) {
      results.push({ transaction: code, outcome: "not_found", reason: "Transação não encontrada para este produto na Hotmart.", row: null });
      continue;
    }
    if (sale.productId !== null && sale.productId !== productId) {
      results.push({ transaction: code, outcome: "not_eligible", reason: "A transação pertence a outro produto.", row: null });
      continue;
    }
    try {
      const result = await importHotmartHistoricalSale(supabase, { sale, mapping, productId, adminId: admin.id, sendAccessEmail });
      results.push({ transaction: code, outcome: result.outcome, reason: result.reason, row: result.row });
    } catch {
      results.push({ transaction: code, outcome: "error", reason: "Falha inesperada ao inserir este comprador.", row: null });
    }
  }

  const summary = {
    inserted: results.filter((item) => item.outcome === "inserted").length,
    already_inserted: results.filter((item) => item.outcome === "already_inserted").length,
    review: results.filter((item) => ["review", "expired", "not_eligible", "not_found"].includes(item.outcome)).length,
    errors: results.filter((item) => item.outcome === "error").length,
  };
  await recordHotmartHistory(supabase, {
    action: "historical_reconciliation_batch",
    actorType: "admin",
    actorId: admin.id,
    mappingId: mapping.id,
    metadata: { source: "hotmart_sales_history", requested: codes.length, ...summary, access_email_requested: sendAccessEmail, destination_type: mapping.destination_type, destination_id: mapping.jornada_id || mapping.event_id },
  });
  void logAdminAction({ adminUserId: admin.id, adminEmail: admin.email, action: "admin.hotmart.historical_reconciliation", entityType: "hotmart_product_mapping", entityId: mapping.id, metadata: { requested: codes.length, ...summary }, request });
  return NextResponse.json({ ok: true, message: `${summary.inserted} inserido(s), ${summary.already_inserted} já inserido(s), ${summary.review} para revisão, ${summary.errors} erro(s).`, summary, results });
}
