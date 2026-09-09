// Extraído de app/meus-simulados/[id]/resultado/page-client.tsx (lógica
// IDÊNTICA, só movida) para ser reaproveitado também pelo modal "Ver" do
// Ranking do Professor (GET /api/professor/events/[id]) — mesma
// canonicalização/contagem de tópicos por incidência de erro usada na tela
// de resultados do aluno, sem duplicar nem reinterpretar a regra.
export type TopicRollup = {
  label: string;
  aliases: string[];
  correct: number;
  wrong: number;
  blank: number;
  total: number;
};

export function normalizeTextKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(protocolo|conceito|conceitos|nocao|nocoes|sobre|de|da|do|dos|das|em)\b/g, " ")
    .replace(/[^a-z0-9+/#.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalizeTopicLabel(rawTopic: string): { key: string; label: string } {
  const original = String(rawTopic || "").trim().replace(/\s+/g, " ");
  const key = normalizeTextKey(original);
  if (!key) return { key: "", label: "" };

  const compact = key.replace(/[\s-]/g, "");
  const aliases: Array<[RegExp, string, string]> = [
    [/^(ram|memoriaram)$/i, "memoria ram", "Memória RAM"],
    [/^(cache|memoriacache)$/i, "memoria cache", "Memória Cache"],
    [/^(placamae|motherboard)$/i, "placa mae", "Placa-mãe"],
    [/^(hd|hdd|discorigido)$/i, "hd hdd", "HD/HDD"],
    [/^(ssd|unidadessd)$/i, "ssd", "SSD"],
    [/^(bios|uefi|biosuefi)$/i, "bios uefi", "BIOS/UEFI"],
    [/^(http|https|httphttps)$/i, "http https", "HTTP/HTTPS"],
    [/^(tcpip|tcp\/ip)$/i, "tcp ip", "TCP/IP"],
    [/^(ip|enderecoip|enderecamentoip)$/i, "endereco ip", "Endereço IP"],
    [/^(dns|sistemadns)$/i, "dns", "DNS"],
    [/^(dhcp)$/i, "dhcp", "DHCP"],
    [/^(url|uri)$/i, "url uri", "URL/URI"],
  ];

  for (const [pattern, canonicalKey, label] of aliases) {
    if (pattern.test(compact)) return { key: canonicalKey, label };
  }

  const semanticKey = key
    .replace(/^protocolo\s+/, "")
    .replace(/\s+protocolo$/, "")
    .replace(/\bmemoria\s+ram\b/, "memoria ram")
    .replace(/\bmemoria\s+cache\b/, "memoria cache")
    .trim();

  return { key: semanticKey || key, label: original };
}

export function addTopicRollup(map: Map<string, TopicRollup>, topic: string, status: "correct" | "wrong" | "blank") {
  const canonical = canonicalizeTopicLabel(topic);
  if (!canonical.key) return;
  if (!map.has(canonical.key)) {
    map.set(canonical.key, { label: canonical.label, aliases: [], correct: 0, wrong: 0, blank: 0, total: 0 });
  }
  const item = map.get(canonical.key)!;
  if (!item.aliases.some((alias) => normalizeTextKey(alias) === normalizeTextKey(topic))) item.aliases.push(topic.trim());
  item.total += 1;
  if (status === "correct") item.correct += 1;
  if (status === "wrong") item.wrong += 1;
  if (status === "blank") item.blank += 1;
}

// Lista achatada (sem agrupar por assunto, ao contrário de
// buildSubjectTopicPerformance na tela de resultados) dos tópicos com
// incidência de erro (wrong>0 || blank>0), ordenada por incidência
// decrescente e depois por rótulo — mesma regra de "tópicos para revisar"
// já usada na tela de resultados do aluno. O chamador é responsável por
// excluir questões anuladas da lista de entrada (nunca contam como erro),
// exatamente como a tela de resultados já faz.
export function buildDifficultyTopics(
  entries: { topics: string[]; status: "correct" | "wrong" | "blank" }[],
): TopicRollup[] {
  const map = new Map<string, TopicRollup>();
  entries.forEach(({ topics, status }) => {
    topics.forEach((topic) => addTopicRollup(map, topic, status));
  });
  return Array.from(map.values())
    .filter((topic) => topic.wrong > 0 || topic.blank > 0)
    .sort((a, b) => (b.wrong + b.blank) - (a.wrong + a.blank) || a.label.localeCompare(b.label));
}
