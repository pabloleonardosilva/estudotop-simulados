import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getHotmartReadiness } from "@/app/lib/server/hotmart/config";

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const supabase = createSupabaseAdminClient();
  const [{ data: mappings, error: mappingsError }, enhancedTransactions, { data: history, error: historyError }] = await Promise.all([
    supabase.from("hotmart_product_mappings").select("id,hotmart_product_ucode,hotmart_product_id,hotmart_product_name,destination_type,jornada_id,event_id,status,created_at,jornadas:jornada_id(title),simulado_events:event_id(name)").order("created_at", { ascending: false }),
    supabase.from("hotmart_transactions").select("id,transaction_code,hotmart_product_ucode,product_name_snapshot,buyer_email,buyer_document,buyer_phone,purchase_status,processing_status,amount,currency,created_at,purchase_approved_at,student_id,destination_type,jornada_id,event_id,possible_duplicate_student_id,duplicate_match_reason,resolved_at,students:student_id(name,email,cpf,phone),possible_duplicate:possible_duplicate_student_id(name,email,cpf,phone),jornadas:jornada_id(title,duration_days,duration_months),simulado_events:event_id(name),hotmart_access_links(id,current_origin,access_state,student_jornada_id,event_participant_id,access_started_at,access_expires_at,student_jornadas:student_jornada_id(started_at,expires_at,status),simulado_event_participants:event_participant_id(access_status))").order("created_at", { ascending: false }).limit(100),
    supabase.from("hotmart_history").select("id,action,actor_type,transaction_id,student_id,created_at,metadata").order("created_at", { ascending: false }).limit(100),
  ]);
  let transactions: unknown = enhancedTransactions.data;
  let transactionsError = enhancedTransactions.error;
  let adminWorkflowsReady = true;
  if (transactionsError) {
    const fallback = await supabase.from("hotmart_transactions").select("id,transaction_code,hotmart_product_ucode,product_name_snapshot,buyer_email,buyer_document,buyer_phone,purchase_status,processing_status,amount,currency,created_at,purchase_approved_at,student_id,destination_type,jornada_id,event_id,students:student_id(name,email,cpf,phone),jornadas:jornada_id(title,duration_days,duration_months),simulado_events:event_id(name),hotmart_access_links(id,current_origin,access_state,student_jornada_id,event_participant_id,access_started_at,access_expires_at,student_jornadas:student_jornada_id(started_at,expires_at,status),simulado_event_participants:event_participant_id(access_status))").order("created_at", { ascending: false }).limit(100);
    transactions = fallback.data;
    transactionsError = fallback.error;
    adminWorkflowsReady = false;
  }
  if (mappingsError || transactionsError || historyError) return NextResponse.json({ ok: false, message: "Não foi possível carregar a integração Hotmart." }, { status: 500 });
  const readiness = getHotmartReadiness();
  return NextResponse.json({ ok: true, message: "Integração Hotmart carregada.", configured: readiness.hottok, readiness, admin_workflows_ready: adminWorkflowsReady, mappings: mappings || [], transactions: transactions || [], history: history || [] });
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const ucode = typeof body?.hotmart_product_ucode === "string" ? body.hotmart_product_ucode.trim() : "";
  const name = typeof body?.hotmart_product_name === "string" ? body.hotmart_product_name.trim() : "";
  const type = body?.destination_type === "jornada" || body?.destination_type === "event" ? body.destination_type : null;
  const destinationId = typeof body?.destination_id === "string" ? body.destination_id.trim() : "";
  if (!ucode || !name || !type || !destinationId) return NextResponse.json({ ok: false, message: "Informe ucode, nome, tipo e destino." }, { status: 400 });
  const supabase = createSupabaseAdminClient();
  const destinationTable = type === "jornada" ? "jornadas" : "simulado_events";
  const { data: destination } = await supabase.from(destinationTable).select("id").eq("id", destinationId).maybeSingle();
  if (!destination) return NextResponse.json({ ok: false, message: "Destino não encontrado." }, { status: 404 });
  const { data, error } = await supabase.from("hotmart_product_mappings").insert({
    hotmart_product_ucode: ucode,
    hotmart_product_id: typeof body?.hotmart_product_id === "string" ? body.hotmart_product_id.trim() || null : null,
    hotmart_product_name: name,
    destination_type: type,
    jornada_id: type === "jornada" ? destinationId : null,
    event_id: type === "event" ? destinationId : null,
    status: "active",
    created_by: admin.id,
  }).select("id").single();
  if (error) return NextResponse.json({ ok: false, message: error.code === "23505" ? "Este product.ucode já está vinculado." : "Não foi possível criar o vínculo." }, { status: error.code === "23505" ? 409 : 500 });
  return NextResponse.json({ ok: true, message: "Produto Hotmart vinculado.", mapping: data }, { status: 201 });
}
