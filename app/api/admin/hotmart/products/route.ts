import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { HotmartProductLookupError, listHotmartSandboxProducts } from "@/app/lib/server/hotmart/products";

// Rota administrativa temporária e read-only para homologação Hotmart.
// Lista somente name/ucode dos produtos retornados pela API Hotmart (sandbox ou production,
// conforme HOTMART_ENVIRONMENT). Não grava nada no banco.
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  try {
    const products = await listHotmartSandboxProducts();
    return NextResponse.json({ ok: true, message: "Produtos Hotmart carregados.", products });
  } catch (error) {
    if (error instanceof HotmartProductLookupError && (error.code === "not_configured" || error.code === "unauthorized")) {
      return NextResponse.json({ ok: false, message: "A integração Hotmart não está configurada corretamente." }, { status: 503 });
    }
    if (error instanceof HotmartProductLookupError && error.code === "timeout") {
      return NextResponse.json({ ok: false, message: "A consulta à Hotmart excedeu o tempo limite. Tente novamente." }, { status: 504 });
    }
    return NextResponse.json({ ok: false, message: "Não foi possível consultar a Hotmart agora." }, { status: 502 });
  }
}
