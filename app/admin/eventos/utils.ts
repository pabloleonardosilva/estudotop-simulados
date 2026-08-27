export type EventCoverKey = "saude" | "policial" | "tribunais" | "administrativo";

export const EVENT_COVERS: Array<{ value: EventCoverKey; label: string; image: string }> = [
  { value: "saude", label: "Área da Saúde", image: "/jornadas/categories/saude.webp" },
  { value: "policial", label: "Policial", image: "/jornadas/categories/policial.webp" },
  { value: "tribunais", label: "Tribunais", image: "/jornadas/categories/tribunais.webp" },
  { value: "administrativo", label: "Administrativo", image: "/jornadas/categories/administrativo.webp" },
];

export function eventCoverImage(key: string | null | undefined): string {
  return EVENT_COVERS.find((item) => item.value === key)?.image
    || "/jornadas/categories/administrativo.webp";
}
