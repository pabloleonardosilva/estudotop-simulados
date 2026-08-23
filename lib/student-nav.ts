export type StudentNavAccess = {
  hasJornadas: boolean;
  hasEventOrigin: boolean;
  hasEvents: boolean;
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

// Home contextual do aluno: para quem é exclusivamente de Evento, a lista de
// Eventos é a home funcional — nunca o Painel genérico, que não tem conteúdo
// relevante para esse contexto.
export function studentHomePath(access: StudentNavAccess | null): string {
  return isEventOnlyStudent(access) ? "/meus-eventos" : "/aluno";
}
