import "server-only";

import { getHotmartApiBaseUrl, getHotmartExternalConfig } from "./config";

type CachedToken = { value: string; expiresAt: number };
let cachedToken: CachedToken | null = null;

export class HotmartRefundRequestError extends Error {
  constructor(message: string, public readonly certainty: "not_sent" | "uncertain") { super(message); }
}

export function classifyHotmartRefundHttpStatus(status: number): "accepted" | "rejected" | "uncertain" {
  if (status >= 200 && status < 300) return "accepted";
  if (status >= 400 && status < 500 && ![408, 409, 429].includes(status)) return "rejected";
  return "uncertain";
}

async function getAccessToken(forceRefresh = false) {
  if (!forceRefresh && cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;
  let config: ReturnType<typeof getHotmartExternalConfig>;
  try {
    config = getHotmartExternalConfig();
  } catch {
    throw new HotmartRefundRequestError("HOTMART_OAUTH_NOT_CONFIGURED", "not_sent");
  }
  const tokenUrl = new URL(config.oauthUrl);
  tokenUrl.search = new URLSearchParams({ grant_type: "client_credentials", client_id: config.clientId, client_secret: config.clientSecret }).toString();
  let response: Response;
  try {
    response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: config.basicAuthorization },
      cache: "no-store",
    });
  } catch {
    throw new HotmartRefundRequestError("HOTMART_OAUTH_FAILED", "not_sent");
  }
  if (!response.ok) throw new HotmartRefundRequestError("HOTMART_OAUTH_FAILED", "not_sent");
  const payload = await response.json() as { access_token?: unknown; token_type?: unknown; expires_in?: unknown };
  if (typeof payload.access_token !== "string" || String(payload.token_type).toLowerCase() !== "bearer") throw new HotmartRefundRequestError("HOTMART_OAUTH_INVALID_RESPONSE", "not_sent");
  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : Number(payload.expires_in) || 300;
  cachedToken = { value: payload.access_token, expiresAt: Date.now() + expiresIn * 1000 };
  return cachedToken.value;
}

export async function requestHotmartRefund(transactionCode: string) {
  let apiBaseUrl: string;
  try {
    apiBaseUrl = getHotmartApiBaseUrl();
  } catch {
    throw new HotmartRefundRequestError("HOTMART_ENVIRONMENT_NOT_CONFIGURED", "not_sent");
  }
  let accessToken = await getAccessToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const refundUrl = `${apiBaseUrl}/payments/api/v1/sales/${encodeURIComponent(transactionCode)}/refund`;
    const send = () => fetch(refundUrl, { method: "PUT", headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }, signal: controller.signal, cache: "no-store" });
    let response = await send();
    if (response.status === 401) {
      cachedToken = null;
      accessToken = await getAccessToken(true);
      response = await send();
    }
    const outcome = classifyHotmartRefundHttpStatus(response.status);
    if (outcome === "uncertain") throw new HotmartRefundRequestError("HOTMART_REFUND_RESULT_UNCERTAIN", "uncertain");
    return { outcome, status: response.status };
  } catch (error) {
    if (error instanceof HotmartRefundRequestError) throw error;
    throw new HotmartRefundRequestError("HOTMART_REFUND_RESULT_UNCERTAIN", "uncertain");
  } finally {
    clearTimeout(timeout);
  }
}

export function resetHotmartAccessTokenCache() {
  cachedToken = null;
}
