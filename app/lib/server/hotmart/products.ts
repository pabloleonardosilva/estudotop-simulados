import "server-only";

import { getHotmartApiBaseUrl } from "./config";
import { getHotmartAccessToken } from "./refund";

type HotmartProduct = { ucode?: unknown; name?: unknown };
type HotmartProductPage = {
  items?: HotmartProduct[];
  page_info?: { next_page_token?: unknown };
};

export type HotmartProductLookupCode = "not_found" | "not_configured" | "unauthorized" | "timeout" | "unavailable";

export class HotmartProductLookupError extends Error {
  constructor(public readonly code: HotmartProductLookupCode) {
    super(`HOTMART_PRODUCT_LOOKUP_${code.toUpperCase()}`);
  }
}

function productFromPage(payload: HotmartProductPage, ucode: string) {
  const product = Array.isArray(payload.items)
    ? payload.items.find((item) => typeof item.ucode === "string" && item.ucode.toLowerCase() === ucode.toLowerCase())
    : null;
  return product && typeof product.name === "string" && product.name.trim()
    ? { ucode: String(product.ucode), name: product.name.trim() }
    : null;
}

export async function lookupHotmartProductByUcode(ucode: string) {
  let apiBaseUrl: string;
  let accessToken: string;
  try {
    apiBaseUrl = getHotmartApiBaseUrl();
    accessToken = await getHotmartAccessToken();
  } catch {
    throw new HotmartProductLookupError("not_configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let pageToken: string | null = null;
  try {
    for (let page = 0; page < 20; page += 1) {
      const url = new URL(`${apiBaseUrl}/products/api/v1/products`);
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
          accessToken = await getHotmartAccessToken(true);
        } catch {
          throw new HotmartProductLookupError("unauthorized");
        }
        response = await send();
      }
      if (response.status === 401 || response.status === 403) throw new HotmartProductLookupError("unauthorized");
      if (!response.ok) throw new HotmartProductLookupError("unavailable");
      const payload = await response.json() as HotmartProductPage;
      const product = productFromPage(payload, ucode);
      if (product) return product;
      pageToken = typeof payload.page_info?.next_page_token === "string" && payload.page_info.next_page_token
        ? payload.page_info.next_page_token
        : null;
      if (!pageToken) break;
    }
    throw new HotmartProductLookupError("not_found");
  } catch (error) {
    if (error instanceof HotmartProductLookupError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new HotmartProductLookupError("timeout");
    throw new HotmartProductLookupError("unavailable");
  } finally {
    clearTimeout(timeout);
  }
}
