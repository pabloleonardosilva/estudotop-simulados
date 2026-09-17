import { NextResponse, after } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { logSecurityEvent, logSystemError } from "@/app/lib/server/auditLogger";
import { validateHotmartHottok } from "@/app/lib/server/hotmart/auth";
import { normalizeHotmartPayload, sanitizeHotmartPayload } from "@/app/lib/server/hotmart/normalize";
import { processHotmartEvent } from "@/app/lib/server/hotmart/processor";
import { HotmartPayloadError } from "@/app/lib/server/hotmart/types";
import { sendHotmartTransactionEmail } from "@/app/lib/server/hotmart/email";

export async function POST(request: Request) {
  const auth = validateHotmartHottok(request.headers.get("x-hotmart-hottok"));
  if (!auth.ok) {
    if (auth.code !== "missing_server_secret") {
      void logSecurityEvent({ event: "hotmart.invalid_hottok", actorType: "external", request, metadata: { reason: auth.code } });
    }
    return NextResponse.json(
      { ok: false, message: auth.code === "missing_server_secret" ? "Integração Hotmart não configurada." : "Webhook não autorizado." },
      { status: auth.code === "missing_server_secret" ? 500 : 401 },
    );
  }

  try {
    const event = normalizeHotmartPayload(await request.json());
    const supabase = createSupabaseAdminClient();
    const { data: ledger, error: ledgerError } = await supabase.rpc("register_hotmart_webhook_event", {
      p_external_event_id: event.externalEventId,
      p_transaction_code: event.transactionCode,
      p_hotmart_event: event.event,
      p_hotmart_version: event.version,
      p_hotmart_creation_date: event.creationDate,
      p_payload_sanitized: sanitizeHotmartPayload(event),
    });
    if (ledgerError || !ledger?.[0]) throw ledgerError || new Error("Falha ao registrar webhook Hotmart.");
    const entry = ledger[0] as { event_id: string; delivery_count: number; is_first_delivery: boolean };
    if (!entry.is_first_delivery) {
      return NextResponse.json({ ok: true, message: "Evento já recebido anteriormente.", duplicate: true, delivery_count: entry.delivery_count });
    }

    const processingStatus = await processHotmartEvent(supabase, event);
    await supabase.from("hotmart_webhook_events").update({ processing_status: processingStatus, processed_at: new Date().toISOString() }).eq("id", entry.event_id);
    const { data: transaction } = await supabase.from("hotmart_transactions").select("id").eq("transaction_code", event.transactionCode).maybeSingle();
    if (transaction && (processingStatus === "processed" || processingStatus.startsWith("pending"))) {
      after(async () => { await sendHotmartTransactionEmail(supabase, transaction.id, processingStatus !== "processed"); });
    }
    return NextResponse.json({ ok: true, message: "Evento Hotmart recebido.", processing_status: processingStatus });
  } catch (error) {
    if (error instanceof HotmartPayloadError) {
      return NextResponse.json({ ok: false, message: error.message, code: error.code }, { status: 400 });
    }
    void logSystemError({ source: "api.webhooks.hotmart", error, request });
    return NextResponse.json({ ok: false, message: "Não foi possível processar o webhook." }, { status: 500 });
  }
}
