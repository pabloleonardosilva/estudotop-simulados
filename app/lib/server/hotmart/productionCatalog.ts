import "server-only";

// Consulta read-only ao catálogo REAL (produção) da Hotmart, isolada do fluxo comercial.
// Usa exclusivamente HOTMART_PRODUCTION_CLIENT_ID / HOTMART_PRODUCTION_CLIENT_SECRET /
// HOTMART_PRODUCTION_BASIC_TOKEN — nunca as credenciais Sandbox, independente da variável de
// ambiente global da integração, e mantém seu próprio cache de token, sem nenhuma dependência
// do módulo de OAuth do Sandbox (refund.ts).
// Não é usada pelo webhook, processor ou refund. Na criação de mapping, serve apenas para
// revalidar (somente leitura) um produto que o Admin escolheu no catálogo Produção; na
// reconciliação de compradores, lê o histórico de vendas (somente GET).

type CachedToken = { value: string; expiresAt: number };
let cachedProductionToken: CachedToken | null = null;

export type HotmartProductionCatalogCode = "not_found" | "not_configured" | "unauthorized" | "timeout" | "unavailable" | "pagination_loop" | "pagination_limit";

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
  items?: Array<{ ucode?: unknown; name?: unknown; id?: unknown }>;
  page_info?: { next_page_token?: unknown };
};

function productionProductFromPage(payload: HotmartProductionProductPage, ucode: string) {
  const product = Array.isArray(payload.items)
    ? payload.items.find((item) => typeof item.ucode === "string" && item.ucode.toLowerCase() === ucode.toLowerCase())
    : null;
  return product && typeof product.name === "string" && product.name.trim()
    ? { ucode: String(product.ucode).toLowerCase(), name: product.name.trim(), id: typeof product.id === "number" || (typeof product.id === "string" && /^\d+$/.test(product.id)) ? Number(product.id) : null }
    : null;
}

export async function lookupHotmartProductionProductByUcode(ucode: string) {
  const product = await findHotmartProductionProduct(ucode);
  return { ucode: product.ucode, name: product.name };
}

// A Sales API da Hotmart filtra por product_id numérico (7 dígitos); o mapping guarda o UCODE.
// O catálogo /products devolve os dois, então o id é resolvido aqui em tempo de consulta.
export async function findHotmartProductionProduct(ucode: string) {
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

export type HotmartProductionSale = {
  transaction: string;
  status: string;
  productId: number | null;
  productName: string | null;
  buyerName: string | null;
  buyerEmail: string | null;
  approvedAt: string | null;
  orderedAt: string | null;
  amount: number | null;
  currency: string | null;
  paymentType: string | null;
  installments: number | null;
};

type HotmartSalesHistoryPage = {
  items?: Array<{
    product?: { id?: unknown; name?: unknown };
    buyer?: { name?: unknown; email?: unknown };
    purchase?: {
      transaction?: unknown; status?: unknown; approved_date?: unknown; order_date?: unknown;
      price?: { value?: unknown; currency_code?: unknown };
      payment?: { type?: unknown; installments_number?: unknown };
    };
  }>;
  page_info?: { next_page_token?: unknown };
};

export const HOTMART_SALES_PAGE_SIZE = 50;
export const HOTMART_SALES_MAX_PAGES = 200;
// Sem start_date/end_date a API não garante o período retornado; a janela é sempre explícita.
export const HOTMART_SALES_HISTORY_START = Date.UTC(2010, 0, 1);

function millisToIso(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isFinite(number) || number <= 0) return null;
  const date = new Date(number);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function textOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parseHotmartProductionSale(item: NonNullable<HotmartSalesHistoryPage["items"]>[number]): HotmartProductionSale | null {
  const transaction = textOrNull(item.purchase?.transaction);
  if (!transaction) return null;
  const productId = item.product?.id;
  const amount = item.purchase?.price?.value;
  const installments = item.purchase?.payment?.installments_number;
  return {
    transaction,
    status: (textOrNull(item.purchase?.status) || "").toUpperCase(),
    productId: typeof productId === "number" || (typeof productId === "string" && /^\d+$/.test(productId)) ? Number(productId) : null,
    productName: textOrNull(item.product?.name),
    buyerName: textOrNull(item.buyer?.name),
    buyerEmail: textOrNull(item.buyer?.email)?.toLowerCase() || null,
    approvedAt: millisToIso(item.purchase?.approved_date),
    orderedAt: millisToIso(item.purchase?.order_date),
    amount: typeof amount === "number" ? amount : null,
    currency: textOrNull(item.purchase?.price?.currency_code),
    paymentType: textOrNull(item.purchase?.payment?.type),
    installments: typeof installments === "number" && installments > 0 ? installments : null,
  };
}

// Histórico de vendas REAL (somente leitura), com as mesmas credenciais HOTMART_PRODUCTION_* do catálogo.
// Percorre todas as páginas via next_page_token, com limite de páginas e detecção de token repetido.
// Sem `transaction`, a Hotmart devolve só APPROVED e COMPLETE; com `transaction`, devolve qualquer status.
export async function listHotmartProductionSales(input: { productId: number; transaction?: string; now?: number }) {
  let accessToken: string;
  try {
    accessToken = await getHotmartProductionAccessToken();
  } catch (error) {
    if (error instanceof HotmartProductionCatalogError) throw error;
    throw new HotmartProductionCatalogError("not_configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  const sales = new Map<string, HotmartProductionSale>();
  const seenTokens = new Set<string>();
  let pageToken: string | null = null;
  try {
    for (let page = 0; page < HOTMART_SALES_MAX_PAGES; page += 1) {
      const url = new URL("https://developers.hotmart.com/payments/api/v1/sales/history");
      url.searchParams.set("product_id", String(input.productId));
      url.searchParams.set("max_results", String(HOTMART_SALES_PAGE_SIZE));
      if (input.transaction) {
        url.searchParams.set("transaction", input.transaction);
      } else {
        url.searchParams.set("start_date", String(HOTMART_SALES_HISTORY_START));
        url.searchParams.set("end_date", String(input.now ?? Date.now()));
      }
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
      const payload = await response.json() as HotmartSalesHistoryPage;
      for (const item of Array.isArray(payload.items) ? payload.items : []) {
        const sale = parseHotmartProductionSale(item);
        if (sale) sales.set(sale.transaction, sale);
      }
      const nextToken = typeof payload.page_info?.next_page_token === "string" && payload.page_info.next_page_token
        ? payload.page_info.next_page_token
        : null;
      if (!nextToken) return [...sales.values()];
      if (seenTokens.has(nextToken)) throw new HotmartProductionCatalogError("pagination_loop");
      seenTokens.add(nextToken);
      pageToken = nextToken;
    }
    throw new HotmartProductionCatalogError("pagination_limit");
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
