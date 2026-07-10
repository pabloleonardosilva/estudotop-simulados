# Segurança de soft delete e arquivamento

## Estratégia por entidade

| Entidade | Estratégia recomendada |
|---|---|
| Aluno/perfil/Auth | `blocked` ou `inactive`; anonymização controlada, nunca delete comum |
| Jornada | `archived`; matrículas `cancelled`, `paused` ou `expired` |
| Simulado | `archived`; preservar tentativas e resultados |
| Questão usada | `archived`; preservar snapshot/histórico |
| Tentativas, respostas e resultados | retenção; sem delete pela UI comum |
| Notas e feedbacks | exclusão/anonymização apenas por pedido validado e política definida |
| Logs | retenção controlada; sem delete comum |
| Junções sem histórico | delete físico pode ser aceitável após verificar dependências |
| Rollback de criação incompleta | delete físico é aceitável dentro da mesma operação |

## Delete físico encontrado

- Críticos/risco: `questions`, `simulados`, `jornadas`, `exam_analyses` e rotas legadas de simulated tests.
- Relacionamentos: `question_subjects`, `question_alternatives`, `simulado_questions`, `jornada_simulados`, `student_jornada_simulados` e questões de análise.
- Rollback técnico: perfil/Auth ou matrícula recém-criados quando a operação seguinte falha.
- Duplicação/importação: remoção de registro parcial recém-criado.

## Proteções já existentes

- Questões, simulados e Jornadas possuem status `archived` em fluxos próprios.
- Alunos possuem `blocked` e `inactive`.
- Matrículas possuem estados de cancelamento, pausa e expiração.
- Jornada com matrícula e simulado ligado a Jornada possuem bloqueios antes do delete.
- Constraints/FKs podem impedir alguns deletes históricos, mas não substituem regra explícita.

## Alterações nesta sprint

Nenhum endpoint foi convertido silenciosamente de delete para archive. Essa mudança alteraria a semântica atual da UI e precisa de testes de todos os consumidores.

## Pendências

Criar sprint própria para substituir deletes críticos por arquivamento, definir quando rascunhos nunca usados podem ser apagados e bloquear explicitamente questões/simulados com histórico. Não criar `deleted_at` em massa antes de mapear queries e retenção.
