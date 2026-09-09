// Formatação de nome para exibição no Ranking do Evento (tela e PDF) — só
// apresentação, nunca altera dado persistido (students.name, profiles.name
// etc.). Extraído para lib/ para ser importado tanto por
// app/professor/eventos/[id]/page-client.tsx ("use client") quanto por
// app/lib/pdf/event-ranking-pdf.ts, sem duplicar a regra.
//
// Regra: os dois primeiros componentes do nome aparecem por completo; a
// partir do próximo componente que NÃO seja uma partícula comum (da, de, do,
// das, dos, e), mostra-se apenas a inicial seguida de ".", e o restante do
// nome é descartado. Partículas encontradas nessa faixa são mantidas em
// minúsculas, coladas ao componente seguinte — nunca viram a própria
// abreviação (evita algo sem sentido como "de Souza" virar "D."). Exemplos
// reais conferidos (ver docs/Sprint-evento-de-simulado.md):
//   "MARIA EDUARDA SILVA"          → "Maria Eduarda S."
//   "joÃO peDRO silVA"             → "João Pedro S."
//   "ana clara ferreira santos"    → "Ana Clara F."
//   "João da Silva Pereira"        → "João da S."
//   "Maria" (1 componente)         → "Maria"
//   "Maria Silva" (2 componentes)  → "Maria Silva"
const NAME_PARTICLES = new Set(["da", "de", "do", "das", "dos", "e"]);

function capitalizeWord(word: string, isParticle: boolean): string {
  if (!word) return word;
  if (isParticle) return word.toLowerCase();
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function formatRankingName(fullName: string | null | undefined): string {
  const words = String(fullName || "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean);

  if (words.length === 0) return "";

  if (words.length <= 2) {
    return words
      .map((word, index) => capitalizeWord(word, index > 0 && NAME_PARTICLES.has(word.toLowerCase())))
      .join(" ");
  }

  const [first, second, ...rest] = words;
  const parts = [
    capitalizeWord(first, false),
    capitalizeWord(second, NAME_PARTICLES.has(second.toLowerCase())),
  ];

  for (const word of rest) {
    const lower = word.toLowerCase();
    if (NAME_PARTICLES.has(lower)) {
      parts.push(lower);
      continue;
    }
    parts.push(`${word.charAt(0).toUpperCase()}.`);
    break;
  }

  return parts.join(" ");
}
