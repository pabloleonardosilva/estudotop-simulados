import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  const body = await request.json().catch(() => null) as { status?: unknown; destination_type?: unknown; destination_id?: unknown } | null;
  const status = ["active", "inactive", "archived"].includes(String(body?.status)) ? String(body?.status) : null;
  const destinationType = body?.destination_type === "jornada" || body?.destination_type === "event" ? body.destination_type : null;
  const destinationId = typeof body?.destination_id === "string" ? body.destination_id.trim() : "";
  if (!status && !destinationType) return NextResponse.json({ ok: false, message: "Informe um status ou destino válido." }, { status: 400 });
  if (destinationType && !destinationId) return NextResponse.json({ ok: false, message: "Informe o novo destino." }, { status: 400 });
  const supabase = createSupabaseAdminClient();
  if (destinationType) {
    const table = destinationType === "jornada" ? "jornadas" : "simulado_events";
    const { data: destination } = await supabase.from(table).select("id").eq("id", destinationId).maybeSingle();
    if (!destination) return NextResponse.json({ ok: false, message: "Destino não encontrado." }, { status: 404 });
  }
  const updates = {
    ...(status ? { status } : {}),
    ...(destinationType ? {
      destination_type: destinationType,
      jornada_id: destinationType === "jornada" ? destinationId : null,
      event_id: destinationType === "event" ? destinationId : null,
    } : {}),
  };
  const { error } = await supabase.from("hotmart_product_mappings").update(updates).eq("id", id);
  if (error) return NextResponse.json({ ok: false, message: "Não foi possível atualizar o vínculo." }, { status: 500 });
  return NextResponse.json({ ok: true, message: "Vínculo atualizado." });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  const supabase = createSupabaseAdminClient();
  const { count } = await supabase.from("hotmart_transactions").select("id", { count: "exact", head: true }).eq("mapping_id", id);
  if (count) return NextResponse.json({ ok: false, message: "Vínculo usado não pode ser excluído; arquive-o." }, { status: 409 });
  const { error } = await supabase.from("hotmart_product_mappings").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, message: "Não foi possível excluir o vínculo." }, { status: 500 });
  return NextResponse.json({ ok: true, message: "Vínculo excluído." });
}
