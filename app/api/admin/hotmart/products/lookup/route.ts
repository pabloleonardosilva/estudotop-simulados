import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { HOTMART_UCODE_PATTERN, HotmartProductLookupError, lookupHotmartProductByUcode } from "@/app/lib/server/hotmart/products";

function lookupErrorResponse(error: HotmartProductLookupError) {
  if (error.code === "not_found") return NextResponse.json({ ok: false, message: "Produto não encontrado na sua conta Hotmart." }, { status: 404 });
  if (error.code === "not_configured" || error.code === "unauthorized") {
    return NextResponse.json({ ok: false, message: "A integração Hotmart não está configurada corretamente." }, { status: 503 });
  }
  if (error.code === "timeout") return NextResponse.json({ ok: false, message: "A consulta à Hotmart excedeu o tempo limite. Tente novamente." }, { status: 504 });
  return NextResponse.json({ ok: false, message: "Não foi possível consultar a Hotmart agora." }, { status: 502 });
}

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const rawUcode = new URL(request.url).searchParams.get("ucode")?.trim() || "";
  if (!HOTMART_UCODE_PATTERN.test(rawUcode)) return NextResponse.json({ ok: false, message: "Informe um Product UCODE válido." }, { status: 400 });
  const ucode = rawUcode.toLowerCase();

  const supabase = createSupabaseAdminClient();
  const { data: existing, error: existingError } = await supabase.from("hotmart_product_mappings")
    .select("id,destination_type,jornadas:jornada_id(title),simulado_events:event_id(name)")
    .eq("hotmart_product_ucode", ucode).maybeSingle();
  if (existingError) return NextResponse.json({ ok: false, message: "Não foi possível verificar os vínculos existentes." }, { status: 500 });
  if (existing) {
    const jornada = existing.jornadas as unknown as { title?: string } | null;
    const event = existing.simulado_events as unknown as { name?: string } | null;
    const destination = jornada?.title || event?.name;
    return NextResponse.json({ ok: false, message: destination ? `Este produto já possui um vínculo com ${destination}.` : "Este produto já possui um vínculo." }, { status: 409 });
  }

  try {
    const product = await lookupHotmartProductByUcode(ucode);
    return NextResponse.json({ ok: true, message: "Produto encontrado.", product });
  } catch (error) {
    return lookupErrorResponse(error instanceof HotmartProductLookupError ? error : new HotmartProductLookupError("unavailable"));
  }
}
