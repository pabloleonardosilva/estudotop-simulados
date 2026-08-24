export type EventCoverKey = "saude" | "policial" | "tribunais" | "administrativo";

// Catálogo próprio do Evento — inicialmente aponta para os mesmos assets
// oficiais já usados pelas categorias de Jornada (public/jornadas/categories),
// mas sem nenhuma dependência funcional de app/admin/jornadas/utils.ts. Evento
// e Jornada continuam entidades independentes; isto é só reaproveitamento de
// imagem, não relação de negócio.
export const EVENT_COVERS: Array<{ value: EventCoverKey; label: string; description: string; image: string }> = [
  { value: "saude", label: "Área da Saúde", description: "Capa para Eventos de concursos e carreiras da saúde.", image: "/jornadas/categories/saude.webp" },
  { value: "policial", label: "Policial", description: "Capa para Eventos de carreiras policiais e de segurança pública.", image: "/jornadas/categories/policial.webp" },
  { value: "tribunais", label: "Tribunais", description: "Capa para Eventos de tribunais e carreiras jurídicas.", image: "/jornadas/categories/tribunais.webp" },
  { value: "administrativo", label: "Administrativo", description: "Capa para Eventos de prefeituras e carreiras administrativas.", image: "/jornadas/categories/administrativo.webp" },
];

const DEFAULT_COVER: EventCoverKey = "administrativo";

export function eventCoverLabel(key: string | null | undefined): string {
  return EVENT_COVERS.find((item) => item.value === key)?.label || "Capa padrão";
}

export function eventCoverImage(key: string | null | undefined): string {
  return EVENT_COVERS.find((item) => item.value === key)?.image
    || EVENT_COVERS.find((item) => item.value === DEFAULT_COVER)!.image;
}
