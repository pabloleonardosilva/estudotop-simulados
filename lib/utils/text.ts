/**
 * Normaliza nomes de entidades como disciplinas e assuntos.
 * Ex.: "   direito   constitucional " -> "Direito Constitucional"
 */
export function normalizeEntityName(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .split(" ")
    .map((word) => {
      if (!word) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

export function normalizeComparableName(value: string) {
  return normalizeEntityName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function normalizeBoardName(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*\/\s*/g, "/")
    .toUpperCase();
}

export function normalizeBoardComparableName(value: string) {
  return normalizeBoardName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const TOPIC_LOWER_WORDS = new Set([
  "a", "as", "o", "os", "e", "em", "no", "na", "nos", "nas", "de", "da", "das", "do", "dos", "para", "por", "com", "sem", "sob", "sobre", "entre",
]);

const TOPIC_SPECIAL_NAMES = new Map([
  ["/etc", "/etc"], ["api", "API"], ["cpu", "CPU"], ["css", "CSS"], ["dns", "DNS"],
  ["ftp", "FTP"], ["hd", "HD"], ["hdd", "HDD"], ["html", "HTML"], ["http", "HTTP"],
  ["https", "HTTPS"], ["ia", "IA"], ["iaas", "IaaS"], ["imap", "IMAP"], ["ip", "IP"],
  ["ipv4", "IPv4"], ["ipv6", "IPv6"], ["paas", "PaaS"], ["pdf", "PDF"], ["pop3", "POP3"],
  ["ram", "RAM"], ["rom", "ROM"], ["saas", "SaaS"], ["smtp", "SMTP"], ["ssd", "SSD"],
  ["ssh", "SSH"], ["ssl", "SSL"], ["tcp", "TCP"], ["tcp/ip", "TCP/IP"], ["ti", "TI"],
  ["url", "URL"], ["usb", "USB"], ["vpn", "VPN"], ["wi-fi", "Wi-Fi"], ["wifi", "Wi-Fi"],
  ["widows", "Windows"], ["onedrive", "OneDrive"], ["powerpoint", "PowerPoint"], ["macos", "macOS"],
]);

export function normalizeTopicName(value: string) {
  const cleaned = String(value || "").trim().replace(/^[\s.,:;-]+|[\s.,:;-]+$/g, "").replace(/\s+/g, " ");
  if (!cleaned) return "";

  return cleaned.split(" ").map((word, index) => {
    const comparable = word.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const special = TOPIC_SPECIAL_NAMES.get(comparable);
    if (special) return special;
    if (index > 0 && TOPIC_LOWER_WORDS.has(comparable)) return word.toLowerCase();

    return word.toLowerCase().split(/([\/-])/).map((part) => {
      if (!part || part === "/" || part === "-") return part;
      const partComparable = part.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      return TOPIC_SPECIAL_NAMES.get(partComparable) || `${part.charAt(0).toUpperCase()}${part.slice(1)}`;
    }).join("");
  }).join(" ");
}

export function normalizeTopicComparableName(value: string) {
  return normalizeTopicName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
