export type EventDestination =
  | { type: "none" }
  | { type: "single"; eventId: string }
  | { type: "multiple" };

export type StudentNavAccess = {
  hasJornadas: boolean;
  hasEventOrigin: boolean;
  hasEvents: boolean;
  eventDestination: EventDestination;
};

// Aluno "exclusivamente de Evento": possui participação real em Evento, não
// possui Jornada e não possui acesso normal ao módulo geral de Simulados
// (hasEventOrigin é o proxy já usado no restante do sistema para essa terceira
// condição). Deriva dinamicamente das relações reais — nunca persistido como
// flag; se o aluno ganhar Jornada ou acesso normal a Simulados, deixa de ser
// "somente Evento" na próxima resolução deste mesmo dado.
export function isEventOnlyStudent(access: StudentNavAccess | null): boolean {
  if (!access) return false;
  return access.hasEvents && !access.hasJornadas && access.hasEventOrigin;
}

// Home contextual do aluno logo após o login. Prioridade:
// 1. Exatamente um Evento relevante (active ou scheduled) → vai direto para
//    ele, independentemente de o aluno também ter Jornada — a prioridade vale
//    só para este destino inicial, nunca aprisiona a navegação depois.
// 2. Mais de um Evento relevante → sempre /meus-eventos, nunca escolhe um
//    automaticamente.
// 3. Nenhum Evento relevante → comportamento histórico já existente (aluno
//    exclusivamente de Evento, sem Eventos ativos no momento, cai em
//    /meus-eventos; os demais vão para o Painel /aluno).
export function studentHomePath(access: StudentNavAccess | null): string {
  if (access?.eventDestination.type === "single") return `/meus-eventos/${access.eventDestination.eventId}`;
  if (access?.eventDestination.type === "multiple") return "/meus-eventos";
  return isEventOnlyStudent(access) ? "/meus-eventos" : "/aluno";
}
