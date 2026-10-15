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

export type HotmartProductionCatalogCode = "not_found" | "not_configured" | "unauthorized" | "timeout" | "unavailable" | "pagination_loop" | "pagination_limit" | "rate_limited" | "remote_rejected" | "remote_unavailable" | "invalid_response";

export type HotmartSalesDiagnosticFields = Record<string, string | number | boolean | null>;

// details guarda só metadados de diagnóstico (etapa, status HTTP remoto, página e, na Sales API, campos
// planos da query/erro/sondagens) — nunca tokens, credenciais ou payload de comprador.
export class HotmartProductionCatalogError extends Error {
  constructor(public readonly code: HotmartProductionCatalogCode, public readonly details: { phase?: string; status?: number; page?: number; diagnostics?: HotmartSalesDiagnosticFields } = {}) {
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

// Diagnóstico TEMPORÁRIO do HTTP 400 da Sales API (15/10/2026). Tudo vira campos planos em
// HotmartProductionCatalogError.details.diagnostics e é emitido numa única linha [HOTMART_SALES_DIAGNOSTIC]
// pela rota; nunca Authorization, token, credenciais ou dados de comprador.
function numericParam(value: string | null) {
  return value !== null && /^\d+$/.test(value) ? Number(value) : value;
}

function salesRequestDiagnostics(url: URL): HotmartSalesDiagnosticFields {
  const params = url.searchParams;
  return {
    request_pathname: url.pathname,
    request_max_results: numericParam(params.get("max_results")),
    request_start_date: numericParam(params.get("start_date")),
    request_end_date: numericParam(params.get("end_date")),
    request_transaction_status: params.get("transaction_status"),
    request_has_page_token: params.has("page_token"),
    request_has_transaction: params.has("transaction"),
  };
}

export function sanitizeHotmartErrorBody(body: string): HotmartSalesDiagnosticFields {
  const fields: HotmartSalesDiagnosticFields = { remote_error: null, remote_error_description: null, remote_message: null, remote_code: null, remote_body_format: "json" };
  if (!body.trim()) return { ...fields, remote_body_format: "empty" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ...fields, remote_body_format: "non_json" };
  }
  if (!parsed || typeof parsed !== "object") return { ...fields, remote_body_format: "unexpected" };
  const record = parsed as Record<string, unknown>;
  for (const key of ["error", "error_description", "message", "code"]) {
    const value = record[key];
    if (typeof value === "string" || typeof value === "number") fields[`remote_${key}`] = String(value).replace(/[^\s@]+@[^\s@]+/g, "[email]").slice(0, 300);
  }
  return fields;
}

// Eliminação somente leitura (GET) executada apenas após um 400 na 1ª página: o status de cada
// combinação mostra qual parâmetro torna a query inválida. Não altera o resultado da consulta.
async function probeHotmartSalesParameters(productId: number, endDate: number, accessToken: string, signal: AbortSignal): Promise<HotmartSalesDiagnosticFields> {
  const variants: Array<[string, Record<string, string>]> = [
    ["probe_product_id_only", { product_id: String(productId) }],
    ["probe_product_id_max_results", { product_id: String(productId), max_results: String(HOTMART_SALES_PAGE_SIZE) }],
    ["probe_product_id_start_date", { product_id: String(productId), start_date: String(HOTMART_SALES_HISTORY_START) }],
    ["probe_product_id_end_date", { product_id: String(productId), end_date: String(endDate) }],
    ["probe_product_id_start_end", { product_id: String(productId), start_date: String(HOTMART_SALES_HISTORY_START), end_date: String(endDate) }],
  ];
  const results: HotmartSalesDiagnosticFields = {};
  for (const [key, params] of variants) {
    try {
      const url = new URL("https://developers.hotmart.com/payments/api/v1/sales/history");
      for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
      const response = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "Content-Type": "application/json" }, signal, cache: "no-store" });
      await response.text().catch(() => "");
      results[key] = response.status;
    } catch {
      results[key] = null;
    }
  }
  return results;
}

const EMPTY_PROBES: HotmartSalesDiagnosticFields = { probe_product_id_only: null, probe_product_id_max_results: null, probe_product_id_start_date: null, probe_product_id_end_date: null, probe_product_id_start_end: null };

// Histórico de vendas REAL (somente leitura), com as mesmas credenciais HOTMART_PRODUCTION_* do catálogo.
// Percorre todas as páginas via next_page_token, com limite de páginas e detecção de token repetido.
// Sem `transaction`, a Hotmart devolve só APPROVED e COMPLETE; com `transaction`, devolve qualquer status.
// Cada falha carrega etapa e status HTTP remoto para o log de diagnóstico do servidor.
export async function listHotmartProductionSales(input: { productId: number; transaction?: string; now?: number; retryDelayMs?: number }) {
  let accessToken: string;
  try {
    accessToken = await getHotmartProductionAccessToken();
  } catch (error) {
    if (error instanceof HotmartProductionCatalogError) throw new HotmartProductionCatalogError(error.code, { phase: "oauth" });
    throw new HotmartProductionCatalogError("not_configured", { phase: "oauth" });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  const sales = new Map<string, HotmartProductionSale>();
  const seenTokens = new Set<string>();
  const retryDelayMs = input.retryDelayMs ?? 1_500;
  let pageToken: string | null = null;
  let page = 0;
  try {
    for (; page < HOTMART_SALES_MAX_PAGES; page += 1) {
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
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "Content-Type": "application/json" },
        signal: controller.signal,
        cache: "no-store",
      });
      let response = await send();
      if (response.status === 401) {
        try {
          accessToken = await getHotmartProductionAccessToken(true);
        } catch {
          throw new HotmartProductionCatalogError("unauthorized", { phase: "oauth", status: 401, page });
        }
        response = await send();
      }
      if (response.status === 429 || response.status >= 500) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        response = await send();
      }
      const requestDiagnostics = salesRequestDiagnostics(url);
      if (response.status === 401 || response.status === 403) throw new HotmartProductionCatalogError("unauthorized", { phase: "sales_request", status: response.status, page, diagnostics: requestDiagnostics });
      if (response.status === 429) throw new HotmartProductionCatalogError("rate_limited", { phase: "sales_request", status: 429, page, diagnostics: requestDiagnostics });
      if (response.status >= 500) throw new HotmartProductionCatalogError("remote_unavailable", { phase: "sales_request", status: response.status, page, diagnostics: requestDiagnostics });
      if (!response.ok) {
        // Corpo lido uma única vez; sondagens só no 400 da 1ª página da listagem completa.
        const remoteFields = sanitizeHotmartErrorBody(await response.text().catch(() => ""));
        const probes = response.status === 400 && page === 0 && !input.transaction
          ? await probeHotmartSalesParameters(input.productId, Number(url.searchParams.get("end_date")), accessToken, controller.signal)
          : EMPTY_PROBES;
        throw new HotmartProductionCatalogError("remote_rejected", { phase: "sales_request", status: response.status, page, diagnostics: { ...requestDiagnostics, ...remoteFields, ...probes } });
      }
      // A Hotmart pode responder 200/204 sem corpo quando não há dados; isso é uma página vazia, não erro.
      const body = (await response.text()).trim();
      let payload: HotmartSalesHistoryPage;
      try {
        payload = body ? JSON.parse(body) as HotmartSalesHistoryPage : {};
      } catch {
        throw new HotmartProductionCatalogError("invalid_response", { phase: "parsing", status: response.status, page });
      }
      if (!payload || typeof payload !== "object" || (payload.items !== undefined && !Array.isArray(payload.items))) {
        throw new HotmartProductionCatalogError("invalid_response", { phase: "parsing", status: response.status, page });
      }
      for (const item of payload.items || []) {
        const sale = item && typeof item === "object" ? parseHotmartProductionSale(item) : null;
        if (sale) sales.set(sale.transaction, sale);
      }
      const nextToken = typeof payload.page_info?.next_page_token === "string" && payload.page_info.next_page_token
        ? payload.page_info.next_page_token
        : null;
      if (!nextToken) return [...sales.values()];
      if (seenTokens.has(nextToken)) throw new HotmartProductionCatalogError("pagination_loop", { phase: "pagination", page });
      seenTokens.add(nextToken);
      pageToken = nextToken;
    }
    throw new HotmartProductionCatalogError("pagination_limit", { phase: "pagination", page });
  } catch (error) {
    if (error instanceof HotmartProductionCatalogError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new HotmartProductionCatalogError("timeout", { phase: "sales_request", page });
    throw new HotmartProductionCatalogError("unavailable", { phase: "sales_request", page });
  } finally {
    clearTimeout(timeout);
  }
}

export function resetHotmartProductionAccessTokenCache() {
  cachedProductionToken = null;
}
