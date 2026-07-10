const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /senha/i,
  /token/i,
  /authorization/i,
  /cookie/i,
  /secret/i,
  /api[_-]?key/i,
  /service[_-]?role/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
];

export function sanitizeLogMetadata(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[max-depth]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > 1500 ? `${value.slice(0, 1500)}...` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => sanitizeLogMetadata(item, depth + 1));
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>).slice(0, 80)) {
      if (SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
        output[key] = "[redacted]";
        continue;
      }
      output[key] = sanitizeLogMetadata(nested, depth + 1);
    }
    return output;
  }
  return String(value);
}

export function requestIp(request?: Request | null) {
  if (!request) return null;
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    null
  );
}

export function requestUserAgent(request?: Request | null) {
  if (!request) return null;
  return request.headers.get("user-agent") || null;
}

export function requestRoute(request?: Request | null) {
  if (!request) return null;
  try {
    const url = new URL(request.url);
    return url.pathname;
  } catch {
    return null;
  }
}
