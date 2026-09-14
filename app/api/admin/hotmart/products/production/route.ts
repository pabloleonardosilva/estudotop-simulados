import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { HotmartProductionCatalogError, listHotmartProductionProducts } from "@/app/lib/server/hotmart/productionCatalog";

// Rota administrativa temporária e read-only: consulta o catálogo REAL (produção) da Hotmart,
// usando credenciais isoladas (HOTMART_PRODUCTION_*), independente de HOTMART_ENVIRONMENT.
// Não grava no banco, não cria mapping, não participa de webhook/refund/processor.
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  try {
    const products = await listHotmartProductionProducts();
    return NextResponse.json({ ok: true, message: "Produtos reais da Hotmart carregados.", products });
  } catch (error) {
    if (error instanceof HotmartProductionCatalogError && (error.code === "not_configured" || error.code === "unauthorized")) {
      return NextResponse.json({ ok: false, message: "A credencial de produção da Hotmart não está configurada corretamente." }, { status: 503 });
    }
    if (error instanceof HotmartProductionCatalogError && error.code === "timeout") {
      return NextResponse.json({ ok: false, message: "A consulta à Hotmart excedeu o tempo limite. Tente novamente." }, { status: 504 });
    }
    return NextResponse.json({ ok: false, message: "Não foi possível consultar o catálogo real da Hotmart agora." }, { status: 502 });
  }
}
