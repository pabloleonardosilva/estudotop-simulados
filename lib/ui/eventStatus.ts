export type SimuladoEventStatus = "scheduled" | "active" | "closed" | "archived";

const eventStatusLabels: Record<SimuladoEventStatus, string> = {
  scheduled: "Agendado",
  active: "Em andamento",
  closed: "Encerrado",
  archived: "Arquivado",
};

export function eventStatusLabel(status: string): string {
  return eventStatusLabels[status as SimuladoEventStatus] || status;
}
