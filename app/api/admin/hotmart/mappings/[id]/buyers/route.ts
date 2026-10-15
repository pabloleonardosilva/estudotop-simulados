import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { findHotmartProductionProduct, listHotmartProductionSales } from "@/app/lib/server/hotmart/productionCatalog";
import { classifyHotmartSales, getImportBlockedReason, hotmartSalesErrorResponse, loadHotmartReconciliationContext, loadReconciliationMapping, summarizeReconciliationRows } from "@/app/lib/server/hotmart/buyerReconciliation";

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
  let sales;
  try {
    productId = (await findHotmartProductionProduct(mapping.hotmart_product_ucode)).id;
    if (!productId) return NextResponse.json({ ok: false, message: "A Hotmart não informou o ID numérico deste produto; não é possível consultar as vendas." }, { status: 502 });
    sales = (await listHotmartProductionSales({ productId })).filter((sale) => sale.productId === null || sale.productId === productId);
  } catch (catalogError) {
    return hotmartSalesErrorResponse(catalogError);
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
