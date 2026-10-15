import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { findHotmartProductionProduct, listHotmartProductionSales } from "@/app/lib/server/hotmart/productionCatalog";
import { classifyHotmartSales, getImportBlockedReason, hotmartSalesErrorResponse, loadHotmartReconciliationContext, loadReconciliationMapping, logHotmartSalesDiagnostic, summarizeReconciliationRows } from "@/app/lib/server/hotmart/buyerReconciliation";

export const maxDuration = 60;

const categoryOrder = { ready: 0, expired: 1, review: 2, already_inserted: 3, not_eligible: 4 };

// Somente leitura: histórico de vendas REAL (HOTMART_PRODUCTION_*) + banco. Nada é gravado.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  const { supabase, mapping, error } = await loadReconciliationMapping(id);
  if (error) return NextResponse.json({ ok: false, message: "Não foi possível carregar o vínculo." }, { status: 500 });
  if (!mapping) return NextResponse.json({ ok: false, message: "Vínculo não encontrado." }, { status: 404 });

  let productId: number | null;
  try {
    productId = (await findHotmartProductionProduct(mapping.hotmart_product_ucode)).id;
  } catch (catalogError) {
    logHotmartSalesDiagnostic(catalogError, { mappingId: mapping.id, productUcode: mapping.hotmart_product_ucode, phase: "product_resolution" });
    return hotmartSalesErrorResponse(catalogError);
  }
  if (!productId) {
    logHotmartSalesDiagnostic(null, { mappingId: mapping.id, productUcode: mapping.hotmart_product_ucode, phase: "product_resolution_missing_id" });
    return NextResponse.json({ ok: false, message: "A Hotmart não informou o ID numérico deste produto; não é possível consultar as vendas." }, { status: 502 });
  }
  let sales;
  try {
    sales = (await listHotmartProductionSales({ productId })).filter((sale) => sale.productId === null || sale.productId === productId);
  } catch (salesError) {
    logHotmartSalesDiagnostic(salesError, { mappingId: mapping.id, productUcode: mapping.hotmart_product_ucode, productId });
    return hotmartSalesErrorResponse(salesError);
  }

  try {
    const context = await loadHotmartReconciliationContext(supabase, mapping, sales);
    const rows = classifyHotmartSales(sales, context)
      .sort((a, b) => categoryOrder[a.category] - categoryOrder[b.category] || (b.approved_at || "").localeCompare(a.approved_at || ""));
    return NextResponse.json({
      ok: true,
      message: "Compradores Hotmart carregados.",
      mapping: { id: mapping.id, product_name: mapping.hotmart_product_name, product_ucode: mapping.hotmart_product_ucode, status: mapping.status },
      destination: context.destination ? { type: context.destination.type, name: context.destination.name, status: context.destination.status } : null,
      import_blocked_reason: getImportBlockedReason(context),
      summary: summarizeReconciliationRows(rows),
      rows,
    });
  } catch {
    return NextResponse.json({ ok: false, message: "Não foi possível comparar as vendas com o destino vinculado." }, { status: 500 });
  }
}
