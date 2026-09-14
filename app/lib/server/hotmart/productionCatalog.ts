import "server-only";

// Consulta read-only ao catálogo REAL (produção) da Hotmart, isolada do fluxo comercial.
// Usa exclusivamente HOTMART_PRODUCTION_CLIENT_ID / HOTMART_PRODUCTION_CLIENT_SECRET /
// HOTMART_PRODUCTION_BASIC_TOKEN — nunca as credenciais Sandbox, independente da variável de
// ambiente global da integração, e mantém seu próprio cache de token, sem nenhuma dependência
// do módulo de OAuth do Sandbox (refund.ts).
// Não é usada pelo webhook, processor, refund ou criação de mapping.

type CachedToken = { value: string; expiresAt: number };
let cachedProductionToken: CachedToken | null = null;

export type HotmartProductionCatalogCode = "not_found" | "not_configured" | "unauthorized" | "timeout" | "unavailable";

export class HotmartProductionCatalogError extends Error {
  constructor(public readonly code: HotmartProductionCatalogCode) {
    super(`HOTMART_PRODUCTION_CATALOG_${code.toUpperCase()}`);
  }
}

function requiredProductionEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new HotmartProductionCatalogError("not_configured");
  return value;
}

function logProductionOauthDiagnostic(details: Record<string, unknown>) {
  console.error("[HOTMART_OAUTH_DIAGNOSTIC]", JSON.stringify({ phase: "oauth_token", environment: "production_catalog_readonly", ...details }));
}

async function getHotmartProductionAccessToken(forceRefresh = false) {
  if (!forceRefresh && cachedProductionToken && cachedProductionToken.expiresAt > Date.now() + 30_000) return cachedProductionToken.value;
  const clientId = requiredProductionEnv("HOTMART_PRODUCTION_CLIENT_ID");
  const clientSecret = requiredProductionEnv("HOTMART_PRODUCTION_CLIENT_SECRET");
  const basicToken = requiredProductionEnv("HOTMART_PRODUCTION_BASIC_TOKEN");

  const tokenUrl = new URL("https://api-sec-vlc.hotmart.com/security/oauth/token");
  tokenUrl.search = new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }).toString();
  let response: Response;
  try {
    response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${basicToken}` },
      cache: "no-store",
    });
  } catch (error) {
    logProductionOauthDiagnostic({ network_error: true, error_name: error instanceof Error ? error.name : "unknown" });
    throw new HotmartProductionCatalogError("unavailable");
  }
  if (!response.ok) {
    logProductionOauthDiagnostic({ status: response.status, status_text: response.statusText, code: "HOTMART_PRODUCTION_OAUTH_FAILED" });
    throw new HotmartProductionCatalogError(response.status === 401 || response.status === 403 ? "unauthorized" : "unavailable");
  }
  const payload = await response.json() as { access_token?: unknown; token_type?: unknown; expires_in?: unknown };
  if (typeof payload.access_token !== "string" || String(payload.token_type).toLowerCase() !== "bearer") {
    logProductionOauthDiagnostic({ status: response.status, status_text: response.statusText, code: "HOTMART_PRODUCTION_OAUTH_INVALID_RESPONSE" });
    throw new HotmartProductionCatalogError("unavailable");
  }
  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : Number(payload.expires_in) || 300;
  cachedProductionToken = { value: payload.access_token, expiresAt: Date.now() + expiresIn * 1000 };
  return cachedProductionToken.value;
}

export async function listHotmartProductionProducts() {
  let accessToken: string;
  try {
    accessToken = await getHotmartProductionAccessToken();
  } catch (error) {
    if (error instanceof HotmartProductionCatalogError) throw error;
    throw new HotmartProductionCatalogError("not_configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const products: { ucode: string; name: string }[] = [];
  let pageToken: string | null = null;
  try {
    for (let page = 0; page < 20; page += 1) {
      const url = new URL("https://developers.hotmart.com/products/api/v1/products");
      url.searchParams.set("max_results", "50");
      if (pageToken) url.searchParams.set("page_token", pageToken);
      const send = () => fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        signal: controller.signal,
        cache: "no-store",
      });
      let response = await send();
      if (response.status === 401) {
        try {
          accessToken = await getHotmartProductionAccessToken(true);
        } catch {
          throw new HotmartProductionCatalogError("unauthorized");
        }
        response = await send();
      }
      if (response.status === 401 || response.status === 403) throw new HotmartProductionCatalogError("unauthorized");
      if (!response.ok) throw new HotmartProductionCatalogError("unavailable");
      const payload = await response.json() as { items?: Array<{ ucode?: unknown; name?: unknown }>; page_info?: { next_page_token?: unknown } };
      if (Array.isArray(payload.items)) {
        for (const item of payload.items) {
          if (typeof item.ucode === "string" && typeof item.name === "string" && item.name.trim()) {
            products.push({ ucode: item.ucode.toLowerCase(), name: item.name.trim() });
          }
        }
      }
      pageToken = typeof payload.page_info?.next_page_token === "string" && payload.page_info.next_page_token
        ? payload.page_info.next_page_token
        : null;
      if (!pageToken) break;
    }
    return products;
  } catch (error) {
    if (error instanceof HotmartProductionCatalogError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new HotmartProductionCatalogError("timeout");
    throw new HotmartProductionCatalogError("unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

type HotmartProductionProductPage = {
  items?: Array<{ ucode?: unknown; name?: unknown }>;
  page_info?: { next_page_token?: unknown };
};

function productionProductFromPage(payload: HotmartProductionProductPage, ucode: string) {
  const product = Array.isArray(payload.items)
    ? payload.items.find((item) => typeof item.ucode === "string" && item.ucode.toLowerCase() === ucode.toLowerCase())
    : null;
  return product && typeof product.name === "string" && product.name.trim()
    ? { ucode: String(product.ucode).toLowerCase(), name: product.name.trim() }
    : null;
}

export async function lookupHotmartProductionProductByUcode(ucode: string) {
  let accessToken: string;
  try {
    accessToken = await getHotmartProductionAccessToken();
  } catch (error) {
    if (error instanceof HotmartProductionCatalogError) throw error;
    throw new HotmartProductionCatalogError("not_configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let pageToken: string | null = null;
  try {
    for (let page = 0; page < 20; page += 1) {
      const url = new URL("https://developers.hotmart.com/products/api/v1/products");
      url.searchParams.set("max_results", "50");
      if (pageToken) url.searchParams.set("page_token", pageToken);
      const send = () => fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        signal: controller.signal,
        cache: "no-store",
      });
      let response = await send();
      if (response.status === 401) {
        try {
          accessToken = await getHotmartProductionAccessToken(true);
        } catch {
          throw new HotmartProductionCatalogError("unauthorized");
        }
        response = await send();
      }
      if (response.status === 401 || response.status === 403) throw new HotmartProductionCatalogError("unauthorized");
      if (!response.ok) throw new HotmartProductionCatalogError("unavailable");
      const payload = await response.json() as HotmartProductionProductPage;
      const product = productionProductFromPage(payload, ucode);
      if (product) return product;
      pageToken = typeof payload.page_info?.next_page_token === "string" && payload.page_info.next_page_token
        ? payload.page_info.next_page_token
        : null;
      if (!pageToken) break;
    }
    throw new HotmartProductionCatalogError("not_found");
  } catch (error) {
    if (error instanceof HotmartProductionCatalogError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new HotmartProductionCatalogError("timeout");
    throw new HotmartProductionCatalogError("unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

export function resetHotmartProductionAccessTokenCache() {
  cachedProductionToken = null;
}
