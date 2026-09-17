export const HOTMART_PURCHASE_EVENTS = [
  "PURCHASE_APPROVED",
  "PURCHASE_COMPLETE",
  "PURCHASE_CANCELED",
  "PURCHASE_REFUNDED",
  "PURCHASE_CHARGEBACK",
  "PURCHASE_EXPIRED",
  "PURCHASE_DELAYED",
  "PURCHASE_PROTEST",
] as const;

export type HotmartPurchaseEvent = (typeof HOTMART_PURCHASE_EVENTS)[number];

export type NormalizedHotmartEvent = {
  externalEventId: string;
  event: HotmartPurchaseEvent;
  version: string | null;
  creationDate: string | null;
  transactionCode: string;
  product: { id: string | null; ucode: string; name: string; offerName: string | null };
  buyer: {
    name: string | null;
    email: string;
    document: string | null;
    documentType: string | null;
    phone: string | null;
  };
  purchase: {
    status: string;
    approvedAt: string | null;
    createdAt: string | null;
    currency: string | null;
    amount: number | null;
    paymentType: string | null;
    installments: number | null;
  };
};

export class HotmartPayloadError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}
