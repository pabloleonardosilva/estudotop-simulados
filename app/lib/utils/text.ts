const LOWERCASE_WORDS = new Set([
  "a", "as", "o", "os", "e", "em", "no", "na", "nos", "nas", "de", "da", "das", "do", "dos", "du", "del", "della", "di", "para", "por", "com", "sem", "sob", "sobre", "entre"
]);

const ACRONYMS = new Set([
  "ai", "api", "bios", "css", "dns", "ftp", "gpu", "hd", "html", "http", "https", "ia", "ip", "lan", "lgpd", "linux", "macos", "pdf", "ram", "rom", "ssd", "tcp", "ti", "usb", "vpn", "wan", "wi-fi", "wifi", "xml"
]);

function stripDiacritics(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function titleCaseToken(token: string, index: number) {
  const comparable = stripDiacritics(token).toLowerCase();
  if (index > 0 && LOWERCASE_WORDS.has(comparable)) return comparable;
  if (ACRONYMS.has(comparable)) {
    if (comparable === "wifi") return "Wi-Fi";
    if (comparable === "wi-fi") return "Wi-Fi";
    if (comparable === "macos") return "macOS";
    return comparable.toUpperCase();
  }

  return token
    .toLowerCase()
    .split(/([\-\/])/)
    .map((part) => {
      if (part === "-" || part === "/") return part;
      if (!part) return part;
      const partComparable = stripDiacritics(part).toLowerCase();
      if (ACRONYMS.has(partComparable)) return partComparable.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join("");
}

export function normalizeEntityName(value: string) {
  const cleaned = String(value || "")
    .trim()
    .replace(/\s+/g, " ");

  if (!cleaned) return "";

  return cleaned
    .split(" ")
    .map((token, index) => titleCaseToken(token, index))
    .join(" ");
}

export function normalizeComparableName(value: string) {
  return stripDiacritics(String(value || ""))
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}


/**
 * Normaliza apenas a exibição de nomes já existentes no banco.
 * Útil para corrigir conectivos/preposições que ficaram com inicial maiúscula
 * em registros antigos, sem forçar alteração imediata no banco.
 */
export function normalizeDisplayName(value: string | null | undefined) {
  return normalizeEntityName(String(value || ""));
}
