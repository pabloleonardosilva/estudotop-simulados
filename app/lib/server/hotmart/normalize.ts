import "server-only";

import { HOTMART_PURCHASE_EVENTS, HotmartPayloadError, type HotmartPurchaseEvent, type NormalizedHotmartEvent } from "./types";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : typeof value === "number" ? String(value) : null;
}

export function normalizeHotmartDate(value: unknown): string | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value.trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function amount(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeHotmartPayload(payload: unknown): NormalizedHotmartEvent {
  const root = object(payload);
  const data = object(root.data);
  const product = object(data.product);
  const buyer = object(data.buyer);
  const purchase = object(data.purchase);
  const price = object(purchase.price);
  const payment = object(purchase.payment);

  const externalEventId = text(root.id);
  const rawEvent = text(root.event);
  const transactionCode = text(purchase.transaction);
  const productUcode = text(product.ucode);
  const productName = text(product.name);
  const buyerEmail = text(buyer.email)?.toLowerCase();

  if (!externalEventId) throw new HotmartPayloadError("missing_event_id", "Evento Hotmart sem id.");
  if (!rawEvent || !HOTMART_PURCHASE_EVENTS.includes(rawEvent as HotmartPurchaseEvent)) {
    throw new HotmartPayloadError("unsupported_event", "Evento Hotmart não suportado.");
  }
  if (!transactionCode) throw new HotmartPayloadError("missing_transaction", "Compra Hotmart sem transação.");
  if (!productUcode) throw new HotmartPayloadError("missing_product_ucode", "Produto Hotmart sem ucode.");
  if (!productName) throw new HotmartPayloadError("missing_product_name", "Produto Hotmart sem nome.");
  if (!buyerEmail) throw new HotmartPayloadError("missing_buyer_email", "Compra Hotmart sem e-mail do comprador.");

  const buyerPhone = object(buyer.phone);
  const phone = text(buyerPhone.number) || text(buyer.checkout_phone) || text(buyer.phone);
  const buyerDocument = object(buyer.document);

  return {
    externalEventId,
    event: rawEvent as HotmartPurchaseEvent,
    version: text(root.version),
    creationDate: normalizeHotmartDate(root.creation_date),
    transactionCode,
    product: {
      id: text(product.id),
      ucode: productUcode,
      name: productName,
      offerName: text(object(data.offer).name),
    },
    buyer: {
      name: text(buyer.name),
      email: buyerEmail,
      document: text(buyerDocument.value) || text(buyer.document),
      documentType: text(buyerDocument.type),
      phone,
    },
    purchase: {
      status: text(purchase.status) || rawEvent.replace("PURCHASE_", ""),
      approvedAt: normalizeHotmartDate(purchase.approved_date),
      createdAt: normalizeHotmartDate(purchase.order_date) || normalizeHotmartDate(root.creation_date),
      currency: text(price.currency_code) || text(price.currency),
      amount: amount(price.value),
      paymentType: text(payment.type),
      installments: amount(payment.installments_number),
    },
  };
}

export function sanitizeHotmartPayload(event: NormalizedHotmartEvent) {
  return {
    id: event.externalEventId,
    event: event.event,
    version: event.version,
    creation_date: event.creationDate,
    product: event.product,
    buyer: {
      name: event.buyer.name,
      email: event.buyer.email,
      document: event.buyer.document,
      document_type: event.buyer.documentType,
      phone: event.buyer.phone,
    },
    purchase: event.purchase,
    transaction: event.transactionCode,
  };
}
