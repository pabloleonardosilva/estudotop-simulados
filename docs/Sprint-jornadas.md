# DOCUMENTAÇÃO OFICIAL INICIAL — JORNADAS

## Regra vigente no código local — tentativas por contexto (2026-09-09)

**Migration preparada anteriormente; não executada pelo agente:** `supabase/migrations/20260909160000_move_attempt_limits_to_contexts.sql`. Esta seção substitui as descrições históricas abaixo que atribuem o limite ao Simulado, permitem novos inícios avulsos ou propõem herdar o limite antigo no backfill. A auditoria posterior abaixo atualiza o estado observado do schema remoto; não presumir que a migration continue pendente no banco.

- `jornadas.max_attempts` e `simulado_events.max_attempts`: inteiro positivo, obrigatório, default 3; editável pelo Admin. A duplicação copia o limite do contexto de origem.
- Todas as Jornadas e todos os Eventos existentes recebem 3, independentemente dos valores antigos dos Simulados. **PCMG - Informática: 3 tentativas para cada um dos 8 Simulados**, sem compartilhar um saldo de 3 entre eles.
- A migration preenche e valida ambos os contextos antes de remover `simulados.max_attempts`. O Simulado deixa de exibir ou persistir seletor de tentativas, inclusive na criação, edição, duplicação e resumo/PDF administrativo.
- `resolveAttemptLimit` em `lib/server/attemptLimit.ts` resolve o limite pelo vínculo autenticado da Jornada ou participação no Evento. Não existe fallback para o Simulado. `getContextualSimuladoAttempts` continua isolando o consumo por aluno, Simulado e contexto; consumir tentativas em um contexto não reduz o saldo de outro.
- O DTO de execução/listagem usa `attempt_limit`; os cadastros dos contextos usam `max_attempts`. Cards, regras, cronogramas e o servidor consultam o limite atual. Novos snapshots registram `attempt_limit`; snapshots históricos não são reescritos.
- Novas execuções exigem Jornada ou Evento. Histórico e resultados avulsos permanecem consultáveis; a retomada de uma tentativa existente mantém o fluxo anterior. Reduzir o limite não encerra uma tentativa em andamento nem apaga consumo histórico; aumentar o limite libera somente a diferença disponível.
- Permanecem as regras de `counts_toward_limit`, correção, resultado oficial, `representative_attempt_id`, ranking e TopCoins. Esta entrega não implementa limite individual substituto: propostas históricas de `max_attempts_override` não são fonte de autorização no fluxo atual.

**Aplicação futura:** coordenar a implantação do código com a mudança de schema, pois o código novo exige as colunas dos contextos e o código antigo pode consultar a coluna removida. Preservar backup dos valores antigos antes da aplicação: após o commit SQL, restaurar esses valores exige recuperação explícita. A transação cancela todas as suas alterações em caso de falha; não há `CASCADE`, alteração de RLS ou reclassificação de tentativas. Nenhuma migration existente foi modificada.

**Validação local:** TypeScript e build aprovados; nenhum diagnóstico adicional de lint por arquivo/regra em comparação com HEAD. Os 17 testes novos passaram. Suíte ampliada: 373 passaram e 1 falhou (`tests/event-operations/active-attempt-metric.spec.ts:219`, busca textual de `label="Realizando"` já incompatível com o painel do Professor em HEAD; painel e teste não alterados nesta entrega). `git diff --check` aprovado. A migration não foi executada, nem mesmo pelos testes. Não houve homologação visual ou integrada com o novo schema; esta depende de código e schema compatíveis. Sem commit, push ou deploy.

**Produto:** EstudoTOP Simulados
**Módulo:** Jornadas
**Status:** Documentação inicial oficial — decisões de negócio consolidadas
**Responsável pelo produto:** Professor Pablo Leonardo
**Objetivo:** Definir as regras oficiais iniciais do módulo de Jornadas e organizar as etapas de desenvolvimento antes da implementação ou dos ajustes técnicos no sistema.

---

# 1. Conceito de Jornada

Uma **Jornada** é um agrupamento organizado de simulados.

No EstudoTOP Simulados, os simulados continuam existindo como entidades independentes, mas podem ser inseridos dentro de uma Jornada para formar um percurso de estudo, revisão ou preparação para determinado concurso.

A Jornada funciona como um **produto independente**, com regras próprias de matrícula, duração, liberação de simulados, acompanhamento do aluno e comunicação por email.

---

# 2. Princípio arquitetural

A Jornada **não substitui** o módulo de Simulados.

O módulo de Simulados continua sendo o motor principal de questões, tentativas, resultados, notas e histórico.

A Jornada atua como uma camada organizadora, responsável por:

* Agrupar simulados;
* Ordenar simulados;
* Controlar liberação progressiva;
* Controlar matrícula do aluno;
* Controlar prazo de acesso;
* Exibir progresso do aluno dentro daquele percurso;
* Disparar comunicações relacionadas à Jornada.

Regra central:

> A Jornada organiza o acesso aos simulados, mas as tentativas, respostas, correções e resultados continuam pertencendo ao módulo de Simulados.

Isso permite que:

* Simulados avulsos continuem funcionando normalmente;
* Um mesmo simulado possa estar em mais de uma Jornada;
* O histórico do aluno seja preservado;
* A Jornada possa ser usada como produto comercial sem alterar o motor de simulados.

---

# 3. Estrutura geral da Jornada

Uma Jornada pode conter:

* Nome;
* Descrição;
* Duração em meses;
* Data de prova, se houver;
* Status administrativo;
* Lista de simulados vinculados;
* Ordem dos simulados;
* Alunos matriculados;
* Regras de liberação individual por aluno.

---

# 4. Status administrativo da Jornada

| Status técnico | Nome na interface | Significado                                      |
| -------------- | ----------------- | ------------------------------------------------ |
| `draft`        | Rascunho          | Jornada em criação ou ajuste.                    |
| `published`    | Publicada         | Jornada disponível para matrícula de alunos.     |
| `archived`     | Arquivada         | Jornada encerrada ou fora de uso administrativo. |

Uma Jornada publicada pode ou não ter simulados vinculados.

---

# 5. Publicação da Jornada

A Jornada pode ser publicada mesmo sem possuir simulados vinculados.

Essa decisão permite que o admin publique uma Jornada como produto ou estrutura comercial antes de todos os simulados estarem prontos.

## 5.1 Validações obrigatórias para publicar

Para publicar uma Jornada, o sistema deve validar:

* O nome não pode estar vazio;
* A duração precisa ser válida;
* Se houver data de prova, a data efetiva não pode estar no passado.

## 5.2 O que não é obrigatório para publicar

Não é obrigatório ter simulado vinculado para publicar a Jornada.

Regra oficial:

> Publicar Jornada sem simulados deve ser permitido.

## 5.3 Data efetiva da prova

Quando houver data de prova, a Jornada deve considerar uma data efetiva de preparação:

```
data_efetiva = data_da_prova - 7 dias
```

---

# 6. Simulados dentro da Jornada

Uma Jornada pode ter zero, um ou vários simulados vinculados.

Quando houver simulados, eles devem possuir uma ordem definida.

A ordem dos simulados é importante porque define o cronograma de liberação e a regra de progressão do aluno.

---

# 7. Matrícula do aluno na Jornada

A matrícula representa a relação entre um aluno e uma Jornada.

Um aluno pode estar matriculado em várias Jornadas ao mesmo tempo.

Uma Jornada pode ter vários alunos matriculados.

A matrícula deve registrar:

* Aluno;
* Jornada;
* Data de entrada;
* Data de expiração;
* Status da matrícula;
* Admin responsável pela atribuição, quando aplicável;
* Datas de criação e atualização.

---

# 8. Estados da matrícula do aluno na Jornada

| Status técnico | Nome na interface | Significado                                                   |
| -------------- | ----------------- | ------------------------------------------------------------- |
| `active`       | Ativa             | Aluno tem acesso à Jornada conforme regras de liberação.      |
| `expired`      | Expirada          | Prazo de acesso terminou. Histórico permanece visível.        |
| `cancelled`    | Cancelada         | Matrícula encerrada pelo admin.                               |
| `paused`       | Pausada           | Acesso temporariamente suspenso, sem cancelamento definitivo. |

Regra prática:

> Somente matrícula `active` permite acesso aos simulados da Jornada.

Quando a matrícula está `paused`, o aluno perde temporariamente o acesso aos simulados da Jornada, mas o histórico permanece preservado.

---

# 9. Liberação individual dos simulados

A liberação dos simulados é calculada individualmente por aluno.

Isso significa que dois alunos na mesma Jornada podem ter calendários diferentes, dependendo da data em que foram inseridos.

Cada simulado dentro da matrícula do aluno deve possuir:

* Ordem na Jornada;
* Data prevista de liberação para aquele aluno;
* Data real de liberação;
* Status atual;
* Data de conclusão, quando houver;
* Resultado/desempenho, quando houver.

Atualização 2026-07-07: nos cards de simulados da Jornada, o campo visual **Resultado real** substitui "Melhor resultado". Ele deve exibir a nota da primeira tentativa completa válida do aluno naquele simulado, não a maior nota entre repetições. O ícone de ajuda explica que, embora cada tentativa concluída gere um resultado, a primeira tentativa completa é a mais realista por ser inédita e é ela que fica registrada como resultado real. A coluna lateral de ação do card também deve exibir o mesmo resultado real, não o resultado da última tentativa.

Campo central:

```
scheduled_release_at = data prevista de liberação daquele simulado para aquele aluno
```

Campo de liberação real:

```
released_at = data em que o simulado foi efetivamente liberado
```

---

# 10. Regra de liberação progressiva

> **Regra vigente desde 01/10/2026.** Substitui as fórmulas anteriores (`duration_months * 30 / total`, `release_duration_days` manual e "data da prova soberana" sem considerar a expiração). Detalhes técnicos: `docs/INDICE_FUNCOES_SISTEMA.md`, seção 9.2.1.

## 10.1 Data-limite do aluno

A duração (`duration_days`) define o acesso do aluno: `expires_at = started_at + duration_days`, e o acesso termina quando `expires_at <= hoje`. O período de liberação não é configurado pelo administrador: é calculado para cada aluno.

```
limite_base     = menor(expires_at, data_da_prova se houver)
data_limite     = limite_base - 7 dias          (RELEASE_LEAD_DAYS)
```

Se a Jornada acaba antes da prova, manda a expiração. Se a prova vem antes, manda a prova. Sem prova, manda só a expiração.

## 10.2 Distribuição

```
janela = data_limite - started_at (em dias)
scheduled_release_at[N] = started_at + floor((N - 1) * janela / (total_planejado - 1)) dias
```

O 1º simulado sai na entrada e o último planejado cai exatamente na data-limite. Pode haver mais de um simulado no mesmo dia, mas nenhum depois da data-limite. Com 1 simulado planejado, ou sem janela (data-limite já passou ou é o próprio dia da entrada), todos são liberados imediatamente.

## 10.3 Recálculo

Ao inserir ou alterar a data da prova, ou ao alterar a duração, os simulados ainda bloqueados das matrículas ativas são reprogramados. Liberados, iniciados e concluídos nunca mudam. Se a data-limite do aluno já chegou e a matrícula ainda vale, os bloqueados são liberados na hora, e cada liberação efetiva gera o e-mail "Novo simulado liberado" (uma vez por simulado, sem reenvio em retry).

## 10.4 Expiração

Jornada expirada não permite iniciar, retomar nem responder simulados (bloqueio no servidor), inclusive simulados liberados e nunca feitos. O cron diário (`release-job`) não libera simulados nem envia e-mail para matrícula expirada. Resultados e histórico das tentativas realizadas continuam acessíveis.

---

# 11. Regra de progressão entre simulados

Regra oficial:

> Um simulado é liberado quando o anterior for concluído **OU** quando chegar a data de liberação do simulado seguinte.

Essa regra evita que o aluno fique travado para sempre, mas ainda preserva a lógica de progressão.

---

# 12. Estados do simulado dentro da Jornada

| Status        | Nome na interface | Significado                                           |
| ------------- | ----------------- | ----------------------------------------------------- |
| `locked`      | Bloqueado         | Ainda não pode ser acessado.                          |
| `locked_late` | Atrasado          | A data prevista já passou, mas há pendência anterior. |
| `available`   | Disponível        | Pode ser iniciado.                                    |
| `in_progress` | Em andamento      | O aluno iniciou e ainda não concluiu.                 |
| `completed`   | Concluído         | O aluno finalizou.                                    |
| `expired`     | Expirado          | A Jornada expirou antes da conclusão.                 |

---

# 13. Simulado atrasado

Um simulado deve ser marcado como atrasado quando:

```
scheduled_release_at <= hoje
E
status ainda não é available/in_progress/completed
E
existe pendência de conclusão do simulado anterior
```

Na interface do admin, deve ficar claro:

* Qual simulado está atrasado;
* Qual simulado anterior está impedindo a liberação;
* Desde quando está atrasado;
* Qual seria a data prevista de liberação.

---

# 14. Perfil do aluno — Aba Jornadas

No cadastro/detalhe do aluno, deve existir uma aba específica chamada **Jornadas**.

Essa aba deve funcionar como um raio-x completo da participação do aluno em cada Jornada.

Rota esperada:

```
/admin/alunos/[id]
```

## 14.1 O que a aba Jornadas deve mostrar

Para cada Jornada do aluno, o admin deve visualizar:

* Nome da Jornada;
* Status da matrícula;
* Data de entrada;
* Data de expiração;
* Tempo restante;
* Quantidade total de simulados;
* Quantidade de simulados concluídos;
* Quantidade de simulados disponíveis;
* Quantidade de simulados bloqueados;
* Quantidade de simulados atrasados;
* Desempenho geral;
* Nota média, quando aplicável.

## 14.2 Dentro de cada Jornada do aluno

Ao expandir ou abrir uma Jornada específica do aluno, o sistema deve mostrar todos os simulados daquela Jornada com:

* Ordem do simulado;
* Nome do simulado;
* Data prevista de liberação para aquele aluno (`scheduled_release_at`);
* Data real de liberação (`released_at`);
* Status atual;
* Se foi resolvido;
* Data de conclusão;
* Nota;
* Percentual de acertos;
* Tempo gasto, se houver;
* Indicação de atraso, quando houver;
* Motivo do bloqueio, quando houver.

Regra obrigatória:

> No perfil do aluno, dentro da Jornada dele, deve aparecer a data em que cada simulado será liberado especificamente para aquele aluno.

---

# 15. Atribuição do aluno à Jornada

Quando o admin inserir um aluno em uma Jornada, o sistema deve:

1. Criar a matrícula do aluno na Jornada;
2. Definir `started_at`;
3. Calcular `expires_at`;
4. Verificar se a Jornada possui simulados;
5. Se houver simulados, criar os registros individuais de liberação;
6. Calcular `scheduled_release_at` de cada simulado;
7. Liberar imediatamente o primeiro simulado;
8. Enviar email de boas-vindas com as informações da Jornada;
9. Registrar a atividade no histórico do aluno.

---

# 16. Jornada publicada sem simulados

Uma Jornada pode ser publicada e pode receber aluno mesmo sem simulados vinculados.

Nesse caso:

* A matrícula do aluno é criada normalmente;
* O aluno recebe email de boas-vindas;
* O email informa que ainda não há simulados disponíveis;
* O aluno deve ser informado de que será avisado quando os simulados forem liberados;
* O sistema deve orientar que ele acompanhe o cronograma da Jornada.

Quando simulados forem adicionados posteriormente, o sistema deverá gerar os registros de liberação para os alunos já matriculados, conforme a regra definida para a Jornada.

---

# 17. Email de boas-vindas da Jornada

Quando o aluno for inserido em uma Jornada, ele deve receber um email de boas-vindas com todas as informações da matrícula.

Esse email deve conter:

* Nome do aluno;
* Nome da Jornada;
* Descrição da Jornada, se houver;
* Data de entrada;
* Data de expiração;
* Status inicial da matrícula;
* Quantidade de simulados;
* Data da prova, se houver;
* Calendário previsto de liberação dos simulados;
* Regras de liberação progressiva;
* Regra de conclusão do simulado anterior;
* Link de acesso à área do aluno.

## 17.1 Se a Jornada já tiver simulados

O email de boas-vindas deve informar também o primeiro simulado liberado.

Não é necessário enviar dois emails no momento da matrícula.

O email inicial deve cumprir dois papéis:

* Boas-vindas à Jornada;
* Aviso de primeiro simulado liberado.

## 17.2 Se a Jornada não tiver simulados

O email deve informar:

* Que o aluno já está matriculado na Jornada;
* Que ainda não há simulados disponíveis;
* Que ele será avisado quando houver liberação;
* Que deve acompanhar o cronograma e sua área do aluno.

---

# 18. Email de liberação de novo simulado

Sempre que um novo simulado for liberado para o aluno dentro de uma Jornada, o aluno deve receber um email.

Esse email deve conter:

* Nome do aluno;
* Nome da Jornada;
* Nome do simulado recém-liberado;
* Posição do simulado na Jornada;
* Data da liberação;
* Link de acesso;
* Data de expiração da Jornada;
* Cronograma atualizado da Jornada daquele aluno.

## 18.1 Cronograma dentro do email

O email de liberação não deve informar apenas o novo simulado.

Ele deve trazer o cronograma completo do aluno naquela Jornada, mostrando:

* Simulados já liberados;
* Simulados concluídos;
* Simulado liberado agora;
* Simulados disponíveis;
* Simulados bloqueados;
* Simulados atrasados;
* Simulados ainda previstos;
* Datas previstas de liberação (`scheduled_release_at`);
* Datas reais de liberação (`released_at`), quando houver.

Regra oficial:

> Todo email de liberação de simulado deve conter o cronograma atualizado da Jornada daquele aluno.

---

# 19. Controle de envio de emails

O envio de email nunca deve bloquear uma operação principal.

A matrícula, liberação ou atualização deve ser salva mesmo que o email falhe.

O sistema deve registrar logs para evitar envio duplicado.

Referências técnicas:

* Campo `welcome_email_sent_at` na matrícula;
* Campo `release_email_sent_at` no controle de simulado do aluno;
* Ou tabela própria de logs de email.

O job de liberação deve ser idempotente.

---

# 20. Etapas de desenvolvimento da Sprint de Jornadas

Esta seção organiza a Sprint de Jornadas em etapas práticas de implementação.

A regra geral é: **não misturar tudo de uma vez**. Cada etapa deve entregar uma parte testável do sistema.

---

## Etapa 1 — Revisão e ajuste do banco de dados

**Objetivo:** Garantir que a estrutura do banco suporte todas as regras atuais da Jornada.

O que faremos:
* Revisar a migration atual de Jornadas;
* Ajustar `student_jornadas.status` para aceitar `paused`;
* Garantir que Jornada publicada possa existir sem simulados;
* Avaliar campos de controle de email;
* Avaliar campos de log para emails de boas-vindas e liberação;
* Garantir índices para consultas no perfil do aluno;
* Garantir que `scheduled_release_at` e `released_at` estejam preservados por aluno.

**Critério de pronto:** O banco aceita todos os estados oficiais e permite representar Jornada com ou sem simulados, matrícula pausada, cronograma individual e controle de emails.

---

## Etapa 2 — Ajuste das regras de publicação da Jornada

**Objetivo:** Atualizar a publicação da Jornada conforme a decisão aprovada.

O que faremos:
* Remover bloqueio de publicação sem simulados;
* Manter validação de nome obrigatório;
* Manter validação de duração válida;
* Manter validação de data efetiva, se houver data de prova;
* Ajustar mensagens de erro no frontend e backend.

**Critério de pronto:** O admin consegue publicar uma Jornada sem simulados, desde que nome, duração e data efetiva estejam válidos.

---

## Etapa 3 — Ajuste dos estados da matrícula

**Objetivo:** Implementar o estado `paused` na matrícula do aluno.

O que faremos:
* Incluir `paused` nas validações de backend;
* Criar ação administrativa para pausar matrícula;
* Criar ação administrativa para reativar matrícula pausada;
* Bloquear acesso do aluno aos simulados quando a matrícula estiver pausada;
* Exibir status "Pausada" no admin;
* Registrar log de pausa e reativação.

**Critério de pronto:** Uma matrícula pode ser pausada e reativada sem apagar histórico e sem permitir acesso aos simulados enquanto estiver pausada.

---

## Etapa 4 — Atribuição de aluno a Jornada com ou sem simulados

**Objetivo:** Garantir que a atribuição funcione corretamente nos dois cenários.

O que faremos:
* Ajustar API de atribuição;
* Se a Jornada tiver simulados, criar `student_jornada_simulados` normalmente;
* Se a Jornada não tiver simulados, criar apenas `student_jornadas`;
* Calcular `expires_at` normalmente;
* Atualizar status do aluno, se necessário;
* Registrar atividade no histórico;
* Preparar envio do email correto conforme o cenário.

**Critério de pronto:** O admin consegue matricular aluno em Jornada publicada, mesmo que ela ainda não tenha simulados.

---

## Etapa 5 — Geração do cronograma individual do aluno

**Objetivo:** Centralizar o cálculo e a consulta do cronograma individual do aluno dentro de cada Jornada.

O que faremos:
* Criar ou revisar função utilitária de cálculo de datas;
* Garantir cálculo com data de prova;
* Garantir cálculo sem data de prova;
* Garantir liberação imediata do primeiro simulado quando existir;
* Garantir preservação de simulados já liberados em recálculos;
* Preparar função de leitura do cronograma para perfil do aluno e emails.

**Critério de pronto:** O sistema consegue montar o cronograma completo de uma Jornada para um aluno específico, incluindo `scheduled_release_at`, `released_at`, status, conclusão e desempenho.

---

## Etapa 6 — Aba Jornadas no perfil do aluno

**Objetivo:** Transformar o perfil do aluno em um painel completo de acompanhamento das Jornadas dele.

O que faremos:
* Criar ou ajustar aba "Jornadas" em `/admin/alunos/[id]`;
* Listar todas as Jornadas do aluno com resumo;
* Mostrar progresso geral por Jornada;
* Exibir o cronograma completo dentro de cada Jornada;
* Mostrar data prevista e real de liberação de cada simulado;
* Mostrar nota, percentual e conclusão, quando houver;
* Mostrar motivo de bloqueio ou atraso.

**Critério de pronto:** No perfil do aluno, o admin consegue entender exatamente em quais Jornadas ele está, o que já foi liberado, o que falta liberar, quais simulados foram resolvidos, quais estão atrasados e qual foi o desempenho.

---

## Etapa 7 — Email de boas-vindas da Jornada

**Objetivo:** Enviar ao aluno um email completo no momento em que ele for inserido em uma Jornada.

O que faremos:
* Criar template premium de email de boas-vindas;
* Incluir dados da Jornada, datas e cronograma individual;
* Se houver primeiro simulado liberado, destacar no email;
* Se não houver simulados, informar que o aluno será avisado;
* Registrar log de envio;
* Permitir reenvio manual pelo admin.

**Critério de pronto:** Ao matricular um aluno em uma Jornada, ele recebe um email completo e coerente com a situação real da Jornada.

---

## Etapa 8 — Email de liberação de novo simulado

**Objetivo:** Avisar o aluno sempre que um novo simulado for liberado, incluindo o cronograma atualizado.

O que faremos:
* Criar template de email de novo simulado liberado;
* Destacar o simulado recém-liberado com link de acesso;
* Incluir cronograma completo atualizado;
* Registrar controle para evitar envio duplicado;
* Integrar com job de liberação.

**Critério de pronto:** Sempre que um simulado for liberado, o aluno recebe um email único com o novo simulado e o cronograma completo da Jornada.

---

## Etapa 9 — Job de liberação progressiva

**Objetivo:** Garantir que simulados sejam liberados automaticamente conforme as regras da Jornada.

O que faremos:
* Revisar endpoint/job existente;
* Garantir que ele respeite matrícula `active`;
* Impedir liberação para matrícula `paused`, `cancelled` ou `expired`;
* Aplicar regra de progressão (conclusão anterior OU data chegou);
* Disparar email de liberação;
* Garantir idempotência;
* Preparar configuração de cron em produção.

**Critério de pronto:** O job pode rodar repetidas vezes sem duplicar emails ou corromper status, liberando apenas o que deve ser liberado.

---

## Etapa 10 — Acesso do aluno às Jornadas

**Objetivo:** Preparar a experiência do aluno dentro das Jornadas.

O que faremos:
* Criar/ajustar `/minhas-jornadas`;
* Criar detalhe `/minhas-jornadas/[id]`;
* Mostrar progresso, simulados disponíveis, bloqueados, atrasados e concluídos;
* Bloquear acesso se matrícula estiver pausada, cancelada ou expirada;
* Exibir aviso de atraso quando houver pendência.

**Critério de pronto:** O aluno consegue ver suas Jornadas e acessar apenas os simulados liberados conforme seu status e cronograma individual.

---

## Etapa 11 — Integração com tentativas e resultados

**Objetivo:** Garantir que o status dos simulados dentro da Jornada acompanhe o uso real do aluno.

O que faremos:
* Atualizar status para `in_progress` quando o aluno iniciar tentativa;
* Atualizar status para `completed` quando concluir;
* Registrar `completed_at`, nota, percentual e tempo gasto;
* Liberar próximo simulado quando a conclusão permitir.

**Critério de pronto:** Quando o aluno resolve um simulado, a Jornada reflete corretamente conclusão, nota, progresso e eventual liberação do próximo.

---

## Etapa 12 — Testes e validações finais

**Objetivo:** Validar os fluxos críticos antes de considerar a Sprint de Jornadas concluída.

O que testaremos:
* Publicar Jornada sem simulados e com simulados;
* Matricular aluno em Jornada sem e com simulados;
* Emails de boas-vindas (ambos os cenários);
* Cronograma individual por aluno;
* Pausar, reativar, expirar e cancelar matrícula;
* Liberação por conclusão e por tempo;
* Simulado atrasado;
* Idempotência do job (sem email duplicado);
* Perfil do admin — aba Jornadas;
* Área do aluno — acesso e bloqueios.

**Critério de pronto:** A Sprint de Jornadas é considerada pronta quando admin e aluno conseguem operar a Jornada inteira sem inconsistência de acesso, status, cronograma, email ou resultado.

---

# 21. Critério de pronto geral da Sprint de Jornadas

A Sprint de Jornadas estará pronta quando:

* O admin conseguir criar, editar, publicar e arquivar Jornadas;
* A Jornada puder ser publicada sem simulados;
* O admin conseguir matricular alunos em Jornadas com ou sem simulados;
* A matrícula aceitar os estados `active`, `expired`, `cancelled` e `paused`;
* O sistema bloquear corretamente acesso em matrículas pausadas, expiradas ou canceladas;
* O perfil do aluno exibir a aba Jornadas com cronograma individual completo;
* Cada simulado mostrar data prevista de liberação para aquele aluno;
* Cada simulado mostrar data real de liberação, quando houver;
* O sistema identificar simulados concluídos, disponíveis, bloqueados e atrasados;
* O email de boas-vindas da Jornada for enviado com todas as informações;
* O email de liberação de simulado for enviado com cronograma atualizado;
* O job de liberação funcionar de forma idempotente;
* A integração com tentativas e resultados estiver funcionando;
* Os fluxos principais estiverem testados.

---

# 22. Observação final

A Jornada deve ser tratada como uma estrutura estratégica do EstudoTOP Simulados.

Ela não é apenas uma pasta de simulados. Ela representa um produto, uma trilha de preparação, um cronograma individual e uma experiência de acompanhamento para o aluno.

Por isso, a implementação deve priorizar clareza, rastreabilidade, comunicação automática e visão administrativa completa.

---

*Documentação oficial consolidada — EstudoTOP Simulados, maio de 2026.*

---

# Atualização — Categorias e miniaturas automáticas das Jornadas — 2026-06-13

## Objetivo

Classificar cada Jornada em uma categoria editorial e usar a categoria para selecionar automaticamente a arte exibida no card da listagem.

## Categorias implementadas

- Área da Saúde (`saude`)
- Policial (`policial`)
- Tribunais (`tribunais`)
- Administrativo (`administrativo`)

## Comportamento

- Na criação, o admin seleciona uma categoria por cards visuais com prévia da imagem.
- A categoria é obrigatória no frontend e validada novamente pela API.
- Na edição, a categoria pode ser alterada para Jornadas já existentes.
- A listagem deixa de alternar imagens pela posição do card e passa a usar a imagem oficial da categoria persistida.
- A troca de categoria altera automaticamente a miniatura exibida no card.

## Banco de dados

Migration criada:

`app/supabase_migrations/011_jornadas_categoria.sql`

A migration:

1. adiciona `jornadas.category`;
2. preenche Jornadas antigas com `administrativo`;
3. cria constraint com os quatro valores oficiais;
4. torna o campo obrigatório;
5. cria índice por categoria.

## Assets oficiais

- `public/jornadas/categories/saude.webp`
- `public/jornadas/categories/policial.webp`
- `public/jornadas/categories/tribunais.webp`
- `public/jornadas/categories/administrativo.webp`

## Atenção operacional

A migration deve ser executada no Supabase antes de testar criação, edição ou listagem com o novo campo.

---

# Atualização — Área do aluno: cronograma com resultado alinhado

Na rota `/minhas-jornadas/[id]`, a tabela **Liberações individuais** deve sinalizar visualmente quando um simulado já foi concluído pelo aluno.

Regra visual oficial:

* Simulado concluído deve aparecer com botão verde **Resolvido**.
* Na mesma célula de status deve aparecer o botão **Ver resultado**.
* Quando o simulado concluído ainda tiver tentativas disponíveis (`!attempts_exhausted`), a mesma célula também deve exibir **Resolver novamente**, após **Ver resultado**, apontando para `simulado.simulado_url`.
* Se o limite de tentativas estiver esgotado, **Resolver novamente** não deve aparecer.
* Os botões da célula devem manter altura, alinhamento e formato de pill; a coluna de status pode ser mais larga para comportar os três estados sem quebrar texto.
* O cabeçalho da tabela deve permanecer alinhado com as colunas: Etapa, Simulado, Status e Data prevista.
* O ajuste é apenas visual/navegacional; não altera cálculo de liberação, status da matrícula, tentativas ou resultado.

Arquivos relacionados:

* `app/minhas-jornadas/[id]/page-client.tsx`
* `app/globals.css`

---

## Atualização — Tentativas completas/incompletas nos cards da Jornada do aluno (2026-07-07)

Na aba **Simulados** da rota `/minhas-jornadas/[id]`, o card de cada simulado passa a exibir a separação das tentativas usadas entre **concluídas** e **incompletas**.

A API `/api/student/jornadas/[id]` envia agora `attempts_completed` e `attempts_incomplete` para cada simulado da Jornada. A contagem considera apenas tentativas com `counts_toward_limit = true`.

O botão de ajuda no card abre modal explicativo com a regra oficial: cada vez que o aluno inicia o simulado, uma tentativa é registrada; mesmo que não seja concluída, abandonada, expirada pelo tempo ou interrompida, ela **é contabilizada** dentro do limite de tentativas.

A alteração é informativa e não muda a regra de liberação, progressão, resultado ou consumo de tentativas.

---

## Atualização — Dobra superior premium do detalhe da Jornada do aluno (2026-07-08)

Na rota `/minhas-jornadas/[id]`, a dobra superior foi redesenhada visualmente conforme referência aprovada:

* breadcrumb discreto no topo;
* título e descrição à esquerda, com título forte porém mais refinado;
* badge **Jornada em andamento** à direita;
* faixa horizontal de métricas à esquerda e card **Progresso geral** à direita;
* toggle **Simulados / Jornadas** foi removido posteriormente por redundância;
* card amplo **Trilha da Jornada** abaixo, com quatro etapas e **Etapa 02 · Simulados** ativa por padrão.

O ajuste foi exclusivamente visual em `app/minhas-jornadas/[id]/page-client.tsx` e `app/globals.css`. Não houve mudança em lógica, APIs, dados, rotas, regras de liberação, consumo de tentativas, timeline ou cards de simulados.
---

## Ajuste UX — detalhe da Jornada do aluno (2026-07-08)

Na rota `/minhas-jornadas/[id]`, a dobra superior da Jornada do aluno recebeu ajustes visuais/informacionais pontuais:

- Removido o seletor redundante **Simulados/Jornadas** que ficava abaixo do card de progresso. A navegação global já existe no menu lateral/superior e a própria página já possui a trilha interna Sobre/Simulados/Resultados/Informações.
- O título da Jornada teve o peso visual reduzido (`font-bold`, 36/38px) para ficar mais refinado e adequado a uma tela interna da área do aluno, sem aparência de landing page.
- O card **Data efetiva** foi substituído por **Acesso até**, usando `jornada.expires_at` da matrícula do aluno. A data efetiva permanece regra técnica interna para cálculo de liberação quando há prova; para o aluno, a informação relevante é até quando ele possui acesso à Jornada.

Arquivos impactados: `app/minhas-jornadas/[id]/page-client.tsx` e `docs/INDICE_FUNCOES_SISTEMA.md`. Não houve alteração de API, banco, regras de liberação, status, tentativas, resultados ou cards/timeline de simulados.
---

## Ajuste visual — altura do card Progresso geral na Jornada do aluno (2026-07-08)

Na rota `/minhas-jornadas/[id]`, o card escuro **Progresso geral** teve apenas ajuste dimensional para se aproximar melhor da altura da faixa de métricas à esquerda.

A aparência premium do card foi preservada: fundo escuro, degradês, anel de progresso, textos internos e barra de progresso continuam no mesmo estilo. O ajuste reduziu altura/padding do card, anel circular e barra inferior para encaixar melhor na composição da dobra superior.

Não houve alteração em lógica, APIs, cálculo de progresso, liberação de simulados, resultados, tentativas ou dados da Jornada.



## Ajuste visual — Card Progresso geral na Jornada do Aluno (2026-07-08)

- O card escuro de Progresso geral em `/minhas-jornadas/[id]` mantém altura compacta e passa a centralizar verticalmente anel, textos e barra.
- Alteração visual apenas em `app/globals.css`; sem impacto em API, cálculo de progresso, banco ou regras da Jornada.

---

## Ajuste visual — Animação da Trilha da Jornada do aluno (2026-07-08)

Na rota `/minhas-jornadas/[id]`, a trilha interna **Sobre / Simulados / Resultados / Informações** recebeu microinterações premium:

- cards da trilha têm feedback de clique com leve `scale` via `framer-motion`;
- etapa ativa recebe animação curta e discreta ao ser selecionada;
- a linha inferior da etapa ativa anima da esquerda para a direita;
- o conteúdo da aba selecionada entra com `fade + leve subida`, usando `AnimatePresence`;
- a animação respeita `prefers-reduced-motion` no CSS.

A mudança é exclusivamente visual/UX em `app/minhas-jornadas/[id]/page-client.tsx` e `app/globals.css`. Não houve alteração em API, banco, regras de liberação, tentativas, resultados, progresso ou cards de simulados.

### Ajuste visual — Hover/focus da Trilha da Jornada do aluno (2026-07-08)

- Arquivo impactado: `app/globals.css`.
- Na rota `/minhas-jornadas/[id]`, os cards da Trilha da Jornada receberam correção de contraste em hover/focus.
- Cards inativos em hover/focus agora usam fundo claro levemente quente/cinza, borda laranja suave, ícone laranja e textos escuros preservados.
- Card ativo mantém o degradê laranja também em hover/focus, com textos e ícones brancos.
- Não houve alteração de layout, conteúdo, API, regras da Jornada, tentativas, resultados ou banco de dados.

---

## Atualização — Duplicar Jornada existente — 2026-07-08

- Na listagem administrativa `/admin/jornadas`, foi criado o botão **Duplicar existente** ao lado de **Nova Jornada**.
- O botão abre modal premium dark para o admin selecionar qual Jornada será usada como base e confirmar o nome da nova cópia.
- A duplicação cria uma nova Jornada com `status = draft`.
- São copiados: dados editoriais/configurações da Jornada, duração, quantidade planejada, data da prova/data efetiva, categoria, abrangência, textos de boas-vindas/estratégia/orientações/destaques e vínculos ordenados em `jornada_simulados`.
- Não são copiados: alunos matriculados, matrículas, cronogramas individuais, progresso, liberações, resultados ou qualquer registro de `student_jornadas`/`student_jornada_simulados`.
- API criada: `POST /api/admin/jornadas/duplicate`.
- Nenhuma migration é necessária.

---

## Correção — busca de aluno na Jornada e organização de Atividades atribuídas — 2026-08-21

- Confirmado que o gerenciamento de Jornadas do aluno (modal, cancelamento com preservação de histórico, reinserção de matrícula cancelada) já estava implementado conforme documentado; não foi criado nenhum sistema paralelo.
- Corrigida a apresentação da busca de aluno em `/admin/jornadas/[id]`: a filtragem já era correta, mas alimentava um `<select>` fechado sem retorno visual; passou a ser uma lista de resultados com ação por linha.
- Adicionado toggle Expandir/Recolher por Jornada na aba "Atividades atribuídas" do perfil do aluno, para não exibir o cronograma completo de todas as Jornadas simultaneamente.
- Renomeado "Gerenciar Jornadas" para "Gerenciar Atividades" no perfil do aluno (rótulo e cabeçalho do modal), mesma lógica e mesma API.
- Nenhuma migration foi criada ou alterada.

## Correção arquitetural — mesmo Simulado em Jornadas distintas — 2026-08-25

- Cada `student_jornada_simulados` constitui uma vida independente do Simulado para o aluno.
- Tentativas novas de Jornada persistem `attempt_context = 'jornada'` e `student_jornada_simulado_id`; uma tentativa da Jornada A não reduz limite, não cria retomada e não define resultado/progresso na Jornada B.
- Conclusão, liberação sequencial, cronograma administrativo, ajuste/zeragem de tentativas, listagem e detalhe da Jornada passaram a consultar o item individual da matrícula, nunca apenas `student_id + simulado_id`.
- Registros históricos de Jornada são associados automaticamente apenas quando existe um único item candidato para aquele aluno/Simulado. Casos ambíguos são preservados sem atribuição por suposição.
- Migration criada: `supabase/migrations/20260825080000_contextualize_simulado_attempts.sql`. Não executada nesta entrega.

## Auditoria de acesso à Jornada — 2026-09-09

Contrato canônico preservado: `/minhas-jornadas/[studentJornadaId]` e `GET /api/student/jornadas/[id]` usam **`student_jornadas.id`**, nunca `jornadas.id`. A listagem retorna `id` da matrícula e `jornada_id` da definição; o card usa `id`. O Server Component repassa o parâmetro sem conversão e o client chama a API com o mesmo valor. A API filtra `student_jornadas.id` e `student_id` autenticado. Não há tentativa alternativa de resolução por ID da definição.

SELECT remoto autorizado comprovou que `cd23889d-f091-4fca-911c-cd6c789c5853` é uma matrícula `active`, vinculada à Jornada de Teste (`3d618a08-7259-467e-8211-9cbf72b2e250`), com 3 itens no cronograma. O schema observado já tem `jornadas.max_attempts = 3` e não tem `simulados.max_attempts`: a consulta de detalhe em HEAD falha com `42703` nessa coluna removida; a consulta local da sprint de tentativas retorna a matrícula. Não foi verificada a revisão efetivamente implantada em produção; a incompatibilidade foi reproduzida executando o SELECT do HEAD. Nenhuma migration ou escrita remota foi executada nesta auditoria.

A API antes convertia inclusive erro SQL em 404. Agora erros de consulta, de tentativas e de resultados retornam 500 genérico com registro técnico; matrícula inexistente/de outro aluno ou cancelada mantém 404 seguro. `paused` retorna 403 com mensagem explícita e preserva os registros históricos; `expired` mantém a consulta histórica e bloqueia itens não concluídos. Falhas de rede no client encerram o carregamento com erro explícito. Não existe fallback de limite para a coluna antiga nem para tentativas ilimitadas.

A busca global encontrou quatro construtores de retorno/detalhe: card de Minhas Jornadas e card do dashboard usam o `id` da matrícula; Voltar do Simulado usa `?jornada=` (ID da matrícula); resultado usa `payload.jornada.student_jornada_id`. Todos seguem o mesmo contrato. Não foram encontrados construtores adicionais para essa rota em e-mails/notificações. Links administrativos por `jornada_id` continuam identificando a definição administrativa, não a matrícula.

Removidos o CTA “Ver simulados avulsos”, a sugestão de resolver novo avulso e sua contagem de disponibilidade no dashboard. Histórico, resultados, anotações e retomada legada são preservados. Descrições antigas que permitiam novas execuções avulsas estão superadas pela regra de Jornada/Evento. O bloqueio servidor de novo início avulso permanece na API de tentativas.

Correção de acesso: `app/api/student/jornadas/[id]/route.ts`, `app/minhas-jornadas/page-client.tsx`, `app/minhas-jornadas/[id]/page-client.tsx`, `app/api/student/dashboard/route.ts`. Testes: `tests/student-journey-access.spec.ts` (13 casos); suíte de limites contextual preservada. A conclusão em produção depende da implantação coordenada do código compatível, não autorizada nesta tarefa. A migration de tentativas preexistente não deve ser reexecutada automaticamente.

Validação desta correção: TypeScript e build aprovados; lint sem novos diagnósticos comparado ao início da tarefa; diff-check aprovado. Foram executados 105 testes: 101 passaram, incluindo os 13 novos de acesso e 17 de limites; 4 falharam. Três são expectativas textuais já incompatíveis com HEAD (painel Realizando, reenvio de código de cadastro e e-mail de matrícula); a quarta é timeout de interface em cadastro público, fora do fluxo alterado, sem causa atribuída a esta correção. Não declarar a suíte ampliada integralmente aprovada. O fluxo de Jornada foi validado por testes da API com mocks e contratos de links; o SELECT real confirmou a matrícula e o cronograma, sem autenticar/impersonar o aluno. Não houve homologação visual autenticada em produção. Arquivo protegido de nova questão preservado por SHA-256; sem nova migration, escrita remota, commit, push ou deploy.

## Fechamento autorizado — código compatível com o schema observado

Confirmados novamente por SELECT: `jornadas.max_attempts` e `simulado_events.max_attempts` existem (amostra 3); `simulados.max_attempts` não existe. A migration local é somente um artefato versionado nesta entrega: não executar nem reparar seu histórico. A consulta ao histórico por API retornou PGRST106, pois `supabase_migrations` não está exposto; o registro da aplicação permanece uma pendência operacional.

O usuário autorizou um único commit e push para `origin/main`, com verificação posterior do deployment automático da Vercel. As afirmações anteriores “sem commit/push/deploy” descrevem as etapas anteriores. Nenhum deploy manual está autorizado. A alteração do Criador Manual e seus trechos documentais permanecem fora deste commit. Regressão repetida: 101/105 passaram, incluindo 30/30 focais; as mesmas quatro falhas anteriores permaneceram. Não há nova falha identificada no escopo. Homologação autenticada depende de navegador/sessão disponível; não criar sessões por impersonação.

## Cross-referência — engine de tentativas blindada transacionalmente (2026-09-10)

`resolveAttemptLimit`/`getContextualSimuladoAttempts` (base do contrato de limite por Jornada consolidado nesta seção) não foram alterados. A camada de baixo nível que consome o limite (`simulado_attempts`/`counts_toward_limit`) passou a operar com lock por tentativa e transações atômicas para salvar resposta, abandonar, registrar violação de foco e finalizar — mais um botão explícito "Abandonar simulado" na tela de execução. Nenhuma mudança na forma como Jornada/Evento armazenam `max_attempts`; nenhuma mudança de contagem por contexto. Detalhes completos: `docs/Sprint-simulados.md`, "Engine de tentativas blindada transacionalmente + fluxo de abandono".

## 21/09/2026 — Homologação funcional de produção da Jornada + Simulado

Fluxo completo validado em produção na Jornada QA `6ccf1499-dd75-4280-833e-9bdfaeab24c5` (matrícula `f04f487e-ff71-4c39-9a36-fd938f32eddd`): matrícula administrativa, cronograma individual, liberação de Simulado, pause/resume, tentativa real, resposta, conclusão, resultado, TopCoins, bloqueios de acesso e preservação histórica. Resultado: 1 questão, 1 acerto, 0 erros, 0 brancos, score 1.00 (100%), TopCoins gerados conforme a regra da Jornada, nenhum e-mail inesperado, nenhum acionamento de Hotmart, nenhuma duplicação, nenhum HTTP 5xx.

Fatos permanentes confirmados nesta homologação:

- Pause/resume não envia e-mail, não recria cronograma, não recria matrícula e preserva os IDs existentes.
- Pause/resume não cria `attempt`, `result` ou `TopCoins`.
- Pausar uma matrícula **não estende** `expires_at`; uma eventual extensão de prazo deve usar o mecanismo oficial apropriado (não pause/resume).
- Estado final conhecido da matrícula QA: `paused`. `paused` aparece em Minhas Jornadas mas bloqueia início/continuação (já documentado na auditoria de acesso de 2026-09-09, acima); `cancelled` não aparece em Minhas Jornadas.
- Histórico de `student_jornadas` é preservado; hard delete de uma Jornada com `student_jornadas` vinculadas é bloqueado pela API/constraint de FK.

A Jornada QA é histórica/controlada: não tentar hard-delete de `student_jornadas` para "limpeza". Fechamento exclusivamente funcional: nenhuma migration executada, nenhum código alterado, nenhum commit/push/deploy nesta rodada.

## 02/10/2026 - Configuracoes contextuais, Fase B local

Jornada passa a definir feedback, excecao de navegacao, politica de resultados e padrao de Coruja. Vinculos admitem excecao permanente da Coruja e retorno ao padrao. Duplicacao copia padroes e excecoes. Liberacao de resultado por tentativa e definitiva e separada da liberacao da prova. Historico existente permanece autorizado; novos resultados podem aguardar liberacao. Admin salva politica released para liberar pendencias e reconciliar TopCoins. Novas tentativas congelam regras de execucao; consumo e pontuacao historicos preservados. Implementacao depende da migration preparada e NAO EXECUTADA 20261002120000_contextual_simulado_settings.sql. Modelo, inventario, testes e implantacao: docs/Sprint-simulados.md, Fase B de 02/10/2026.

## 08/10/2026 - Ajuste de consumo preserva o resultado oficial

`setAttemptsCount` (`app/api/admin/student-jornadas/[studentJornadaId]/simulados/[studentJornadaSimuladoId]/route.ts`) continua contabilizando as tentativas mais antigas do item da matrícula ao receber `set_attempts > 0`, mas a primeira `completed` + `counts_toward_limit` (ordem `submitted_at`, a mesma da rota de resultado) sempre ocupa uma das vagas. Assim, reduzir o consumo não descontabiliza o resultado oficial e aumentar não recontabiliza uma conclusão anterior que o substituiria; quando preciso, mais placeholders `abandoned` garantem a contagem exata. Cronograma, TopCoins (`resyncTopCoinEarnings`) e resultados seguem a oficial preservada. `set_attempts = 0` mantém a exclusão integral. Política de resultados da Jornada inalterada. Testes: `tests/admin-attempt-adjustments.spec.ts`.

## 08/10/2026 - Configuracoes contextuais em producao (banco)

A migration da Fase B foi executada pelo proprietario e verificada por leitura: 5 Jornadas com `result_policy = released`, `feedback_mode = final_only` e sem excecao de navegacao; 16 vinculos com a Coruja do Simulado de origem; 4/4 conclusoes historicas liberadas. A reconciliacao da corrida C1 e a preservacao da tentativa oficial seguem o codigo publicado neste ciclo. Registro: `docs/status-atual.md` (08/10/2026).

## 08/10/2026 - Correcao da secao "Configuracoes desta aplicacao" (criacao/edicao de Jornada)

**Causa do campo de navegacao "bloqueado":** o tooltip de ajuda era exibido por `group-hover` no bloco do cabecalho e ficava sobre a primeira linha de campos; ao descer o mouse do cabecalho, o cursor entrava no proprio tooltip, que permanecia aberto e recebia o clique, impedindo abrir a Navegacao. O `disabled` existente e legitimo e foi mantido: com feedback imediato, a navegacao e obrigatoriamente fechada (tambem garantido no servidor).

**Correcao:** tooltip aberto apenas por hover/foco do gatilho (`peer`) e com `pointer-events-none`; opcoes renomeadas para "Herdar do Simulado", "Navegacao aberta" e "Navegacao fechada", sem mudar os valores (`null`, `open`, `closed`); com feedback imediato, o campo exibe o motivo do bloqueio. Novas Jornadas continuam com heranca (`navigation_override = null`). Alinhamento: Feedback, Navegacao e Tentativas permitidas na mesma linha e Ajuda da Coruja e Liberacao de resultados na seguinte (grade de 3 colunas no desktop, 2 no tablet, 1 no celular), rotulos no mesmo estilo e controles de 48 px. "Ajudas por tentativa" (exibido com a Coruja habilitada) usava o rotulo interno do PremiumInput (16 px, contra 24 px dos selects) e ficava 8 px acima; passou a usar o rotulo da secao, associado ao campo por id. Duracao, quantidade de simulados e data da prova inalterados. Eventos recebem os novos rotulos e o tooltip corrigido, mantendo a grade de 2 colunas.

**Arquivos:** `app/simulados/components/ContextSettingsFields.tsx`, `app/admin/jornadas/nova/page-client.tsx`, `app/admin/jornadas/[id]/editar/page-client.tsx`.

**Validacao:** harness isolado com os componentes reais e o CSS do build (Playwright/Chromium, chamadas de API interceptadas, sem banco): antes, o clique apos passar pelo cabecalho caia no tooltip; depois, abre o menu em 1440 px e 390 px. Controles da mesma linha com topo identico. 12/12 cenarios funcionais (padrao da nova Jornada, tres opcoes, reabrir valores salvos, payload do PATCH, bloqueio em feedback imediato, tooltip). TypeScript, build, `git diff --check`, lint sem diagnostico novo; 73/73 testes de Jornadas/contexto e 175/175 de Eventos. A regra entregue ao aluno nao mudou (mesma resolucao em `resolveContextualSettings`). Pendente: conferencia visual autenticada em producao.

## 08/10/2026 - Ajuda da Coruja por Simulado da Jornada

**Causa:** o recurso ja existia de ponta a ponta (colunas `jornada_simulados.owl_help_enabled_override`/`owl_help_limit_override`, `PATCH /api/admin/jornadas/[id]/simulados`, `resolveContextualSettings` e `consume_student_owl_help`), mas o card do vinculo mostrava "Padrao da Jornada"/"Excecao: habilitada/desabilitada", o campo "neste vinculo" ficava espremido ao lado do titulo, sem quebra no celular, e a heranca exibia o padrao do formulario ainda nao salvo.

**Correcao (somente `app/admin/jornadas/[id]/editar/page-client.tsx`):** seletor "Ajuda da Coruja neste Simulado" com "Usar configuracao da Jornada (N ajudas)", "Personalizar neste Simulado" e "Desabilitar neste Simulado"; campo "Quantidade de ajudas por tentativa" apenas ao personalizar, iniciando com o padrao da Jornada; heranca exibida a partir do padrao salvo; bloco abaixo do titulo no celular e com largura propria no desktop. Valores, validacoes da API e regras de consumo inalterados; sem migration. Vinculos existentes em producao receberam no backfill da Fase B a configuracao do Simulado de origem, portanto aparecem como "Personalizar" ou "Desabilitar" ate que o administrador escolha herdar.

**Validacao:** PostgreSQL 17.6 local com rota PATCH, resolucao e rota `owl-help` reais (11/11): Jornada com 3 ajudas, S1 com 2, S2 herdando 3, S3 desabilitado; persistencia; isolamento entre vinculos e outra Jornada (404); limite 0 recusado; Simulados e padrao da Jornada inalterados; padrao atualizado para 5 so muda a heranca; terceira ajuda em S1 e quarta em S2 bloqueadas (403) por chamada direta; reuso sem consumo; S3 negado sem consumo. Harness de interface com o componente real e o CSS do build: opcoes, reabertura, envio isolado por vinculo, campo condicional, arrastar e soltar, menus nao encobertos e rotulos sem truncamento em 1440/768/390 px. Transbordamento horizontal da aba Simulados corrigido em seguida (ver abaixo). Pendente: conferencia visual autenticada.

## 08/10/2026 - Refinamento visual premium da configuracao da Jornada

**Organizacao:** a secao foi dividida em dois paineis com o mesmo acabamento (`JornadaSettingsPanel` em `app/simulados/components/ContextSettingsFields.tsx`): "Configuracoes dos Simulados" (Feedback, Navegacao nesta aplicacao, Tentativas permitidas, Ajuda da Coruja, Ajudas por tentativa, Liberacao de resultados; icone `SlidersHorizontal` e gatilho do tooltip ao lado do titulo) e "Planejamento da Jornada" (Duracao, Quantidade de simulados, Data da prova; icone `CalendarRange`). Os textos auxiliares ficam junto dos campos e as notas pedagogicas/operacionais no rodape de cada painel, incluindo o aviso da data efetiva na edicao. Na criacao, o rotulo "Quantidade planejada de simulados" passou a "Quantidade de simulados", como na edicao, para nao quebrar linha; o texto auxiliar foi mantido.

**Contraste (local, sem alterar globals nem componentes globais):** painel com fundo branco a 2%, borda a 8% e raio de 20 px; campos mais claros que o painel (branco a 4,5%), borda a 12% e 20% no hover; rotulos em slate-300 a 85% (antes branco a 40%); brilho laranja discreto apenas no foco. Como `.et-admin-dark-input` e CSS global fora das camadas do Tailwind, os ajustes de fundo/borda dos inputs usam o modificador de importancia somente dentro do painel. Grade: 3 colunas a partir de 1360 px (desktop de referencia, ~1440 px), 2 de 768 a 1359 px (evita truncar valores em notebooks de 1280 px) e 1 no celular; faixas sem sobreposicao porque o Tailwind gera `min-[1360px]` antes de `md`. Eventos usam o mesmo formulario sem o modo Jornada e mantem a aparencia anterior.

**Preservacao:** nenhum valor, validacao, API, banco ou regra alterados (feedback, navegacao e bloqueio por feedback imediato, tentativas, Coruja e personalizacao por vinculo, liberacao, duracao/cronograma, quantidade e data da prova).

**Validacao:** harness com os componentes reais e o CSS do build (Playwright/Chromium, sem banco), telas de criacao e edicao em 1440, 768 e 390 px, Coruja habilitada e desabilitada: controles da mesma linha com o mesmo topo e 48 px de altura nos dois paineis, sem rolagem horizontal (12/12); nenhum valor truncado em 1440, 1280, 1024, 768 e 390 px; estilos computados, hover, foco, desabilitado com motivo e tooltip sem interceptar cliques (4/4); formulario e navegacao (12/12) e Coruja por Simulado (13/14 nesta etapa; a falha restante, o transbordamento da aba Simulados, foi corrigida em seguida). TypeScript, build, `git diff --check`, lint sem diagnostico novo e 248/248 testes direcionados. Pendente: conferencia visual autenticada.

## 08/10/2026 - Transbordamento horizontal da aba Simulados (celular)

**Causa:** em `app/admin/jornadas/[id]/editar/page-client.tsx`, o conteiner `grid gap-6 xl:grid-cols-[1fr_400px]` nao declarava colunas abaixo de `xl`; a coluna implicita (`auto`) crescia ate a largura minima de conteudo do painel "Simulados na Jornada" (381 px), imposta pelo seletor da Coruja com "Usar configuracao da Jornada (3 ajudas)" em linha unica, e empurrava os dois paineis da aba (inclusive "Incluir simulado existente") para alem da tela: 7 px em 390 px e 22 px em 375 px.

**Correcao:** `grid-cols-1` (`minmax(0, 1fr)`) no conteiner, mantendo `xl:grid-cols-[1fr_400px]`; no bloco da Coruja de cada card, o texto do seletor pode quebrar linha (altura minima de 48 px preservada) para nao truncar a quantidade herdada. Sem `overflow-x: hidden` e sem alterar componentes globais.

**Validacao (componentes reais e CSS do build):** 390, 375, 768, 1280 e 1440 px sem transbordamento, sem controle cortado e sem seletor truncado; menus abrindo sem sobreposicao; Coruja por vinculo preservada; arrastar e soltar funcionando em 390 e 1440 px; em 768, 1280 e 1440 px o layout e identico ao anterior (posicoes comparadas elemento a elemento); aba Informacoes sem transbordamento nas cinco larguras. TypeScript, build, `git diff --check`, lint sem diagnostico novo e testes direcionados aprovados. Pendente: conferencia visual autenticada.
