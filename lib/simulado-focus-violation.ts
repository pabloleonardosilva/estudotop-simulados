// Regra oficial de controle de foco durante a tentativa (ver
// docs/Sprint-simulados.md, "controle de foco"): na terceira violação a
// tentativa é encerrada por desclassificação. `simulado_attempts.focus_violation_count`
// é a fonte de verdade da contagem; esta constante existe apenas para evitar
// divergência entre a regra aplicada nas rotas de tentativa e o texto exibido
// ao aluno (ex.: detalhe do Evento). Não existe coluna de limite configurável
// por Simulado — o valor é fixo e global.
export const FOCUS_VIOLATION_LIMIT = 3;
