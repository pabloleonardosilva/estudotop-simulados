# DOCUMENTAÇÃO OFICIAL INICIAL — JORNADAS

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

## 10.1 Jornada sem data de prova

Quando a Jornada não possui data de prova, o sistema distribui os simulados ao longo da duração total da Jornada.

```
intervalo = (duration_months * 30) / total_simulados
scheduled_release_at[N] = started_at + (N - 1) * intervalo
```

## 10.2 Jornada com data de prova

Quando a Jornada possui data de prova, o sistema considera a data efetiva:

```
data_efetiva = data_da_prova - 7 dias
intervalo = (data_efetiva - started_at) / total_simulados
scheduled_release_at[N] = started_at + (N - 1) * intervalo
```

A partir da data efetiva, todos os simulados devem estar liberados conforme as regras do sistema.

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
