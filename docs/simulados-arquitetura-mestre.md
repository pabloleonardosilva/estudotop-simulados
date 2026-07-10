# ARQUIVO MESTRE — MÓDULO ALUNOS + JORNADAS

**Produto:** EstudoTOP Simulados  
**Status do documento:** Decisões aprovadas — pronto para desenvolvimento  
**Escopo:** Arquitetura técnica e regras oficiais dos módulos de Cadastro de Aluno e Jornadas  
**Importante:** este documento não representa implementação, migration, rota criada ou tela criada. Ele é a fonte oficial de decisão antes do desenvolvimento.

---

## 1. VISÃO GERAL DO MÓDULO

Este documento define a arquitetura técnica e as regras de negócio dos módulos de **Cadastro de Aluno** e **Jornadas** do EstudoTOP Simulados.

Ele é a fonte oficial de decisão antes do desenvolvimento. Nenhuma migration, rota ou tela deve ser criada sem aprovação deste documento.

### 1.1 Contexto

O módulo de Simulados já foi modelado e aprovado. Este documento expande o sistema com dois novos módulos interdependentes:

- Cadastro e autenticação de alunos
- Jornadas — agrupamento sequencial de simulados com liberação progressiva

### 1.2 Premissas

- **Fase 1:** o admin libera o acesso manualmente após o pagamento externo (artesanal).
- **Fase 2 futura:** integração com gateway de pagamento para liberação automática.
- A modelagem deve suportar os dois cenários sem reescrever o núcleo.
- Um aluno pode estar em várias Jornadas simultaneamente.
- Uma Jornada é vista como um produto independente.

### 1.3 Fora do escopo deste documento

- Implementação de telas e componentes.
- Criação de migrations.
- Criação de rotas reais.
- Integração com gateway de pagamento (Fase 2).
- Implementação do dashboard administrativo.

---

## 2. MÓDULO: CADASTRO E AUTENTICAÇÃO DO ALUNO

### 2.1 Métodos de acesso

**Fase 1 (atual):** apenas cadastro e login manual com email e senha.

- O aluno preenche nome completo, email e senha.
- O email é o identificador único do aluno.

**Fase 2 (futura):** adição do Login com Google (OAuth).

- O sistema receberá nome, email e foto automaticamente.
- Se dados adicionais forem necessários (telefone, CPF), serão solicitados em tela de complemento após o primeiro login.
- Ao autenticar com Google, o sistema verificará se o email já existe e vinculará o `google_id` ao cadastro existente (merge de conta).
- A modelagem da tabela `students` já inclui o campo `google_id` para suportar a Fase 2 sem alteração estrutural.

### 2.2 Fluxo de cadastro

**Fluxo manual (Fase 1):**

1. Aluno acessa a página de cadastro via link enviado pelo admin ou por URL pública.
2. Preenche nome, email e senha.
3. Sistema cria a conta com status `pending` (aguardando liberação).
4. Admin visualiza o aluno no painel e atribui a uma Jornada.
5. Ao ser atribuído, o aluno ganha acesso e pode logar.

**Fluxo Google (Fase 2):**

1. Aluno clica em "Entrar com Google".
2. Sistema recebe nome, email e foto via OAuth.
3. Se o email já existe: faz login normalmente e vincula o `google_id`.
4. Se o email é novo: cria conta com status `pending`.
5. Admin libera atribuindo a uma Jornada.

### 2.3 Status do aluno

| Status | Descrição |
|---|---|
| `pending` | Cadastrado, aguardando liberação pelo admin. |
| `active` | Ativo, com acesso a pelo menos uma Jornada. |
| `blocked` | Bloqueado pelo admin. Não consegue logar. |
| `inactive` | Sem Jornadas ativas no momento. Pode logar mas não vê conteúdo. |

### 2.4 Dados do aluno

Dados coletados no cadastro:

- Nome completo (obrigatório)
- Email (obrigatório, único)
- Senha (obrigatório no cadastro manual; não se aplica ao Google)
- Foto de perfil (opcional; preenchida automaticamente pelo Google na Fase 2)
- Telefone (opcional; pode ser coletado em tela de complemento)
- CPF (opcional; pode ser coletado conforme necessidade do negócio)

### 2.5 Permissões do aluno

**Pode:**

- Acessar Jornadas às quais foi atribuído pelo admin.
- Visualizar e responder simulados liberados dentro dessas Jornadas.
- Ver seus próprios resultados conforme configuração do simulado.
- Atualizar seus próprios dados de perfil.

**Não pode:**

- Acessar Jornadas de outros alunos.
- Ver resultados de outros alunos.
- Acessar o painel administrativo.
- Atribuir a si mesmo a uma Jornada.
- Cancelar a própria matrícula em uma Jornada.

---

## 3. MÓDULO: JORNADAS

### 3.1 O que é uma Jornada

Uma Jornada é um **produto independente** composto por um conjunto ordenado de simulados, com regras de liberação progressiva e prazo definido.

Exemplos:
- Jornada Delegado AL — 10 simulados, 10 meses
- Jornada Delegado PE — 8 simulados, 8 meses

Um aluno pode estar matriculado em mais de uma Jornada simultaneamente.

### 3.2 Configuração da Jornada

O admin define ao criar ou editar uma Jornada:

- Nome da Jornada.
- Descrição.
- Duração em meses (ex: 10 meses).
- Data limite da prova (opcional).
- Simulados vinculados e sua ordem.
- Status: `draft`, `published` ou `archived`.

### 3.3 Regra de liberação dos simulados

A lógica de liberação é **calculada individualmente por aluno**, a partir da data em que foi atribuído à Jornada.

#### Cenário A — Sem data limite da prova

- O sistema divide a duração total da Jornada pelo número de simulados.
- Cada simulado recebe uma data de liberação proporcional.
- Exemplo: 10 meses / 10 simulados = 1 simulado por mês.

```
data_liberacao_simulado_N = data_inicio_aluno + (N - 1) * intervalo_dias
```

#### Cenário B — Com data limite da prova

- O sistema usa como data efetiva: `data_limite_prova - 7 dias`.
- Calcula os dias disponíveis entre a data de atribuição do aluno e a data efetiva.
- Distribui os simulados nesse intervalo.
- A partir da data efetiva, todos os simulados já estão liberados.
- O aluno continua acessando a Jornada até o fim da duração total.

```
data_efetiva         = data_limite_prova - 7 dias
intervalo_por_simul. = (data_efetiva - data_inicio_aluno) / total_simulados
data_liberacao_N     = data_inicio_aluno + (N - 1) * intervalo
```

#### Regra de progressão

- O Simulado 2 só é liberado após o Simulado 1 ser finalizado **OU** após a data de liberação do Simulado 3 chegar — o que vier primeiro.
- Quando a data de liberação do próximo simulado chegar, o atual é desbloqueado mesmo sem o anterior ter sido concluído.
- A regra se propaga: ao liberar o 2 por tempo, o 3 passa a depender da conclusão do 2.

**Exemplo prático:**

- Dia 0: Simulado 1 liberado ✅
- Dia 7: Data de liberação do Simulado 2. Aluno não concluiu o 1. Simulado 2 permanece bloqueado. Modal de aviso exibido.
- Dia 14: Data de liberação do Simulado 3. Simulado 2 é liberado automaticamente. Simulado 3 fica bloqueado aguardando conclusão do 2. Modal de aviso exibido.
- Aluno conclui o 2: Simulado 3 é liberado imediatamente ✅

#### Modal de aviso de atraso

- Exibido quando o aluno acessa a Jornada e há simulados bloqueados por pendência de conclusão com data de liberação já passada.
- Informa qual simulado precisa ser concluído para desbloquear o próximo.
- Não impede o aluno de continuar simulados já desbloqueados.

### 3.4 Atribuição de aluno a uma Jornada

#### Fase 1 — Manual (atual)

1. O admin seleciona o aluno no painel.
2. Atribui a uma Jornada publicada.
3. Define a data de início (padrão: hoje).
4. O sistema calcula automaticamente as datas de liberação de cada simulado.
5. O sistema dispara automaticamente o email de boas-vindas.
6. O aluno recebe acesso imediato.

#### Fase 2 — Automática (futura)

- Gateway de pagamento dispara evento de compra aprovada.
- Sistema cria a atribuição automaticamente com `data_inicio = data do pagamento`.
- Sem alteração nas regras de liberação ou no modelo de dados.

### 3.5 Expiração da Jornada

- A Jornada expira na data: `data_inicio_aluno + duration_months`.
- Após a expiração, o aluno **não consegue** mais iniciar novas tentativas.
- Tentativas em andamento e resultados históricos são preservados.

**Após a expiração, o aluno pode:**

- Visualizar o dashboard da Jornada com histórico de resultados.
- Ver notas, acertos, erros e percentuais de tentativas anteriores.

**Após a expiração, o aluno não pode:**

- Abrir ou iniciar qualquer simulado.
- Exportar PDF do dashboard.
- Iniciar novas tentativas.

### 3.6 Extensão de acesso por adição de dias

- No perfil do aluno (visão admin), há uma lista de Jornadas inscritas com o tempo restante de acesso em cada uma.
- Um botão **"Adicionar dias"** abre um modal para informar a quantidade de dias.
- O sistema soma os dias ao `expires_at` atual: `novo_expires_at = expires_at + N dias`.
- As datas de liberação dos simulados **não são recalculadas**.
- A regra de progressão continua valendo normalmente.
- Pode ser usado em Jornadas ativas ou já expiradas.

---

## 4. MODELAGEM DE BANCO

Esta seção descreve a modelagem proposta. Nenhuma migration deve ser criada antes da aprovação.

### 4.1 Tabela: `students`

Responsabilidade: guardar o cadastro e autenticação do aluno.

| Coluna | Tipo | Obrigatório | Descrição |
|---|---:|---:|---|
| `id` | `uuid` | Sim | Identificador único. |
| `name` | `text` | Sim | Nome completo do aluno. |
| `email` | `text` | Sim | Email único. Identificador principal. |
| `password_hash` | `text` | Não | Hash da senha. Nulo para login Google. |
| `google_id` | `text` | Não | ID único do Google. Nulo para cadastro manual. |
| `avatar_url` | `text` | Não | URL da foto de perfil. |
| `phone` | `text` | Não | Telefone opcional. |
| `cpf` | `text` | Não | CPF opcional. |
| `status` | `text` | Sim | `pending`, `active`, `blocked` ou `inactive`. |
| `last_login_at` | `timestamptz` | Não | Data do último login. |
| `created_at` | `timestamptz` | Sim | Data de criação. |
| `updated_at` | `timestamptz` | Sim | Data de atualização. |

Constraints:

- `unique(email)`
- `unique(google_id) where google_id is not null`
- `status in ('pending', 'active', 'blocked', 'inactive')`
- `password_hash is not null or google_id is not null` — pelo menos um deve existir

Índices:

- `idx_students_email` em `email`
- `idx_students_status` em `status`
- `idx_students_google_id` em `google_id`

---

### 4.2 Tabela: `jornadas`

Responsabilidade: guardar a configuração principal de cada Jornada.

| Coluna | Tipo | Obrigatório | Descrição |
|---|---:|---:|---|
| `id` | `uuid` | Sim | Identificador único. |
| `title` | `text` | Sim | Nome da Jornada. |
| `description` | `text` | Não | Descrição administrativa. |
| `status` | `text` | Sim | `draft`, `published` ou `archived`. |
| `duration_months` | `integer` | Sim | Duração total da Jornada em meses. |
| `exam_date` | `date` | Não | Data da prova. Quando informada, define a distribuição de liberação. |
| `effective_end_date` | `date` | Não | Calculado: `exam_date - 7 dias`. Nulo se sem data de prova. |
| `created_by` | `uuid` | Não | Admin que criou a Jornada. |
| `published_at` | `timestamptz` | Não | Data de publicação. |
| `archived_at` | `timestamptz` | Não | Data de arquivamento. |
| `created_at` | `timestamptz` | Sim | Data de criação. |
| `updated_at` | `timestamptz` | Sim | Data de atualização. |

Constraints:

- `status in ('draft', 'published', 'archived')`
- `duration_months > 0`
- `effective_end_date = exam_date - 7` (calculado e persistido ao salvar)
- `title` não pode ser vazio após trim

Índices:

- `idx_jornadas_status` em `status`
- `idx_jornadas_exam_date` em `exam_date`
- `idx_jornadas_created_at` em `created_at`

---

### 4.3 Tabela: `jornada_simulados`

Responsabilidade: vincular simulados a uma Jornada, definindo ordem e sequência de liberação.

| Coluna | Tipo | Obrigatório | Descrição |
|---|---:|---:|---|
| `id` | `uuid` | Sim | Identificador único. |
| `jornada_id` | `uuid` | Sim | Jornada à qual o simulado pertence. |
| `simulado_id` | `uuid` | Sim | Simulado vinculado. |
| `order_number` | `integer` | Sim | Posição do simulado na Jornada. Define a sequência de liberação. |
| `created_at` | `timestamptz` | Sim | Data de criação. |
| `updated_at` | `timestamptz` | Sim | Data de atualização. |

Relacionamentos:

- `jornada_id` referencia `jornadas(id)`.
- `simulado_id` referencia `simulados(id)`.

Constraints:

- `unique(jornada_id, simulado_id)`
- `unique(jornada_id, order_number)`
- `order_number > 0`

Índices:

- `idx_jornada_simulados_jornada_id` em `jornada_id`
- `idx_jornada_simulados_simulado_id` em `simulado_id`
- `idx_jornada_simulados_order` em `(jornada_id, order_number)`

---

### 4.4 Tabela: `student_jornadas`

Responsabilidade: registrar a matrícula de um aluno em uma Jornada e controlar o acesso e expiração.

| Coluna | Tipo | Obrigatório | Descrição |
|---|---:|---:|---|
| `id` | `uuid` | Sim | Identificador único. |
| `student_id` | `uuid` | Sim | Aluno matriculado. |
| `jornada_id` | `uuid` | Sim | Jornada vinculada. |
| `started_at` | `date` | Sim | Data de início do aluno na Jornada. Base para cálculo de liberação. |
| `expires_at` | `date` | Sim | Calculado: `started_at + duration_months`. Data de expiração do acesso. |
| `status` | `text` | Sim | `active`, `expired` ou `cancelled`. |
| `assigned_by` | `uuid` | Não | Admin que realizou a atribuição. Nulo se automático (Fase 2). |
| `created_at` | `timestamptz` | Sim | Data de criação do registro. |
| `updated_at` | `timestamptz` | Sim | Data de atualização. |

Relacionamentos:

- `student_id` referencia `students(id)`.
- `jornada_id` referencia `jornadas(id)`.
- `assigned_by` referencia a tabela de admins.

Constraints:

- `unique(student_id, jornada_id)`
- `status in ('active', 'expired', 'cancelled')`
- `expires_at > started_at`

Índices:

- `idx_student_jornadas_student_id` em `student_id`
- `idx_student_jornadas_jornada_id` em `jornada_id`
- `idx_student_jornadas_status` em `status`
- `idx_student_jornadas_expires_at` em `expires_at`

---

### 4.5 Tabela: `student_jornada_simulados`

Responsabilidade: controlar o status de liberação e progresso de cada simulado para cada aluno dentro de uma Jornada.

| Coluna | Tipo | Obrigatório | Descrição |
|---|---:|---:|---|
| `id` | `uuid` | Sim | Identificador único. |
| `student_jornada_id` | `uuid` | Sim | Matrícula do aluno na Jornada. |
| `jornada_simulado_id` | `uuid` | Sim | Vínculo jornada-simulado. |
| `simulado_id` | `uuid` | Sim | Simulado referenciado (desnormalizado para queries diretas). |
| `order_number` | `integer` | Sim | Posição na sequência (desnormalizado). |
| `scheduled_release_at` | `date` | Sim | Data calculada de liberação prevista. |
| `released_at` | `timestamptz` | Não | Data real de liberação. Nulo se ainda bloqueado. |
| `status` | `text` | Sim | `locked`, `available`, `in_progress` ou `completed`. |
| `completed_at` | `timestamptz` | Não | Data em que o aluno finalizou o simulado. |
| `created_at` | `timestamptz` | Sim | Data de criação. |
| `updated_at` | `timestamptz` | Sim | Data de atualização. |

Relacionamentos:

- `student_jornada_id` referencia `student_jornadas(id)`.
- `jornada_simulado_id` referencia `jornada_simulados(id)`.
- `simulado_id` referencia `simulados(id)`.

Constraints:

- `unique(student_jornada_id, jornada_simulado_id)`
- `status in ('locked', 'available', 'in_progress', 'completed')`

Índices:

- `idx_sjs_student_jornada_id` em `student_jornada_id`
- `idx_sjs_simulado_id` em `simulado_id`
- `idx_sjs_status` em `status`
- `idx_sjs_scheduled_release_at` em `scheduled_release_at`

---

## 5. RELACIONAMENTOS ENTRE ENTIDADES

### Relação principal

- Um `student` pode ter várias `student_jornadas` (N:N com `jornadas`).
- Uma `jornada` pode ter vários `jornada_simulados` (N:N com `simulados`).
- Um `simulado` pode estar em várias Jornadas sem duplicar dados.
- O controle de liberação por aluno vive em `student_jornada_simulados`.
- As tentativas (`simulado_attempts`) continuam vinculadas ao aluno e ao simulado, sem dependência da Jornada.

### Diagrama lógico

```
students
  └── student_jornadas
        └── student_jornada_simulados
              └── simulado_attempts (módulo de simulados, independente)

jornadas
  └── jornada_simulados
        └── simulados
              └── simulado_questions
                    └── questions

student_jornadas
  ├── students
  └── jornadas
```

### Preparação para Fase 2

```
pagamento_aprovado (webhook)
  └── cria student_jornadas automaticamente
        └── mesma lógica de cálculo de datas
```

---

## 6. LÓGICA DE LIBERAÇÃO — ALGORITMO

### 6.1 Cálculo das datas de liberação (ao atribuir o aluno)

Ao criar um registro em `student_jornadas`, o sistema executa:

```
SE jornada.exam_date IS NOT NULL:
    data_efetiva     = jornada.exam_date - 7 dias
    dias_disponíveis = data_efetiva - started_at
    intervalo        = dias_disponíveis / total_simulados
SENÃO:
    intervalo = (duration_months * 30) / total_simulados

PARA cada simulado N em ordem (1 a total):
    scheduled_release_at = started_at + (N - 1) * intervalo
```

O resultado é persistido em `student_jornada_simulados.scheduled_release_at` para cada linha.

O primeiro simulado (`order_number = 1`) sempre tem `scheduled_release_at = started_at` e é liberado imediatamente com `status = available`.

### 6.2 Verificação de liberação (job periódico)

Um job periódico (ou trigger no login do aluno) verifica:

```
PARA cada simulado com status = 'locked':

    SE scheduled_release_at <= hoje:

        simulado_anterior = simulado de order_number - 1

        SE simulado_anterior.status = 'completed':
            → liberar este simulado
              status = 'available'
              released_at = agora

        SENÃO:
            proximo = simulado de order_number + 1

            SE proximo.scheduled_release_at <= hoje:
                → liberar este simulado
                  status = 'available'
                  released_at = agora
                  (o próximo ficará bloqueado até este ser concluído)
```

**Regra em uma frase:** um simulado é liberado quando o anterior for concluído **OU** quando chegar a data de liberação do simulado seguinte — o que ocorrer primeiro.

### 6.3 Recálculo ao editar `started_at`

Quando o admin altera a data de início de um aluno:

```
novo_expires_at = novo_started_at + duration_months

PARA cada simulado com released_at IS NULL:
    recalcular scheduled_release_at com nova base

Simulados com released_at IS NOT NULL → não alterar
Simulados com status = 'completed'    → não alterar
```

### 6.4 Extensão de acesso (adicionar dias)

```
novo_expires_at = expires_at_atual + N dias

Nada mais é alterado.
scheduled_release_at de simulados bloqueados permanece igual.
```

---

## 7. ROTAS

As rotas abaixo são a arquitetura de navegação prevista. Nenhuma rota deve ser criada antes da aprovação.

### 7.1 Autenticação

| Rota | Objetivo | Acesso |
|---|---|---|
| `/cadastro` | Formulário de cadastro manual do aluno. | Público |
| `/login` | Login manual com email e senha. | Público |
| `/auth/google/callback` | Callback OAuth do Google (Fase 2). | Público |
| `/perfil` | O aluno visualiza e edita seus dados. | Aluno autenticado |

### 7.2 Aluno — Jornadas e Simulados

| Rota | Objetivo | Acesso |
|---|---|---|
| `/minhas-jornadas` | Lista de Jornadas do aluno com status e progresso geral. | Aluno autenticado |
| `/minhas-jornadas/[id]` | Detalhe da Jornada com simulados e status de cada um. | Aluno com acesso |
| `/meus-simulados/[id]` | Iniciar ou retomar tentativa (módulo já existente). | Aluno com acesso |
| `/meus-simulados/[id]/resultado` | Ver resultado da tentativa (módulo já existente). | Aluno dono |

### 7.3 Admin — Jornadas e Alunos

| Rota | Objetivo | Acesso |
|---|---|---|
| `/admin/jornadas` | Listar e filtrar Jornadas por status e disciplina. | Admin |
| `/admin/jornadas/nova` | Criar nova Jornada. | Admin |
| `/admin/jornadas/[id]` | Ver detalhes, simulados vinculados e alunos matriculados. | Admin |
| `/admin/jornadas/[id]/editar` | Editar Jornada, vincular simulados, reordenar. | Admin |
| `/admin/alunos` | Listar alunos com filtros por status e Jornada. | Admin |
| `/admin/alunos/[id]` | Ver perfil, Jornadas inscritas, tempo restante e histórico. | Admin |
| `/admin/alunos/[id]/atribuir` | Atribuir aluno a uma Jornada publicada. | Admin |

---

## 8. ESTADOS DO FRONTEND

### Estados do simulado dentro da Jornada (visão do aluno)

| Estado | Condição | Ação disponível |
|---|---|---|
| `locked` | Data de liberação ainda não chegou e anterior não concluído. | Nenhuma. Exibe cadeado. |
| `locked_late` | Data já passou mas anterior ainda não concluído. | Exibe modal de aviso de atraso. |
| `available` | Liberado e não iniciado. | Iniciar tentativa. |
| `in_progress` | Tentativa em andamento. | Retomar tentativa. |
| `completed` | Finalizado. | Ver resultado. |
| `expired` | Jornada expirou antes de concluir. | Ver resultado parcial se houver. |

### Estados da Jornada (visão do aluno)

| Estado | Condição | Comportamento |
|---|---|---|
| `active` | `expires_at > hoje` | Acesso completo conforme liberação dos simulados. |
| `expired` | `expires_at <= hoje` | Dashboard em leitura. Sem abrir simulados. Sem exportar PDF. |
| `cancelled` | Cancelado pelo admin. | Sem acesso. |

---

## 9. PONTOS DE RISCO

### 9.1 Falha no envio do email de boas-vindas

**Risco:** o serviço de email falha ao atribuir o aluno a uma Jornada e ele não recebe as instruções de acesso.

**Mitigação:**
- O envio de email não deve bloquear a atribuição.
- A atribuição é salva primeiro; o email é disparado de forma assíncrona.
- O admin deve ter um botão de reenvio manual no perfil do aluno.

### 9.2 Cálculo de liberação com dias negativos

**Risco:** data da prova já passou ou é muito próxima, gerando intervalo negativo ou zero.

**Mitigação:**
- Validar no admin que `exam_date - 7` deve ser maior que a data de hoje ao publicar.
- Exibir aviso caso contrário e impedir a publicação.

### 9.3 Aluno atribuído a Jornada não publicada

**Risco:** admin tenta atribuir aluno a Jornada com status `archived` ou `draft`.

**Mitigação:**
- O endpoint de atribuição deve rejeitar Jornadas que não estejam com `status = published`.

### 9.4 Expiração da Jornada durante tentativa ativa

**Risco:** Jornada expira enquanto aluno está respondendo um simulado.

**Mitigação:**
- A expiração da Jornada não cancela tentativas em andamento.
- A tentativa segue até ser finalizada ou expirar pelo próprio tempo limite do simulado.
- O resultado é preservado e visível no dashboard em modo leitura.

### 9.5 Alteração de `exam_date` após atribuições existentes

**Risco:** admin altera `exam_date` e os cálculos de liberação ficam desatualizados para alunos já matriculados.

**Mitigação:**
- Ao alterar `exam_date` em uma Jornada publicada com alunos ativos, o sistema deve recalcular `scheduled_release_at` apenas para simulados ainda não liberados (`released_at IS NULL`).
- Simulados já liberados não são afetados.
- Exibir aviso ao admin informando quantos alunos serão impactados.

### 9.6 Remoção de simulado de Jornada com alunos ativos

**Risco:** admin remove um simulado da Jornada enquanto algum aluno está com ele `in_progress`.

**Mitigação:**
- Não permitir remoção de simulado com `status = in_progress` ou `completed` em qualquer `student_jornada_simulados` ativo.
- Exibir lista de alunos afetados para o admin decidir.

### 9.7 Adição de dias com `expires_at` no passado distante

**Risco:** admin esquece o campo e adiciona 0 dias, ou insere valor negativo.

**Mitigação:**
- Validar no modal que o valor informado deve ser um inteiro positivo maior que zero.

---

## 10. DECISÕES APROVADAS

Todas as decisões abaixo foram confirmadas e devem ser seguidas na implementação.

### D1 — Cancelamento de matrícula

**Decisão:** somente o admin pode cancelar a matrícula de um aluno em uma Jornada. O aluno não possui essa opção.

### D2 — Acesso após expiração da Jornada

**Decisão:** após a expiração, o aluno ainda acessa o dashboard da Jornada em modo leitura.

- ✅ Permitido: visualizar dashboard com histórico, notas, acertos, erros e percentuais.
- ❌ Bloqueado: abrir simulados, iniciar tentativas, exportar PDF do dashboard.

### D3 — Extensão de acesso por adição de dias

**Decisão:** o admin pode adicionar dias ao `expires_at` de qualquer matrícula, incluindo Jornadas já expiradas.

- O sistema soma os dias ao `expires_at` atual.
- As datas de liberação dos simulados **não são recalculadas**.
- A regra de progressão continua valendo normalmente.

### D4 — Login com Google

**Decisão:** Login com Google fica para **Fase 2**. Na Fase 1, apenas cadastro e login manual com email e senha.

### D5 — Email de boas-vindas

**Decisão:** ao ser atribuído a uma Jornada, o aluno recebe automaticamente um email com:

- Nome da Jornada.
- Data de início do acesso.
- Data de expiração do acesso.
- Total de simulados da Jornada.
- Data da prova, se informada.
- Regras de liberação progressiva resumidas.
- Link de acesso direto à Jornada.

### D6 — Edição da data de início pelo admin

**Decisão:** o admin pode editar `started_at` de um aluno já matriculado.

- O sistema recalcula `expires_at` e todos os `scheduled_release_at` de simulados ainda não liberados.
- Simulados já liberados (`released_at IS NOT NULL`) não são afetados.
- Simulados já concluídos permanecem com `status = completed` sem alteração.

---

## 11. ROADMAP

### Sprint A — Cadastro de Aluno

**Objetivo:** construir o cadastro, login e gestão administrativa de alunos.

**Entregas:**

- Tabela `students` com status.
- Tela de cadastro manual (nome, email, senha).
- Tela de login manual.
- Tela de perfil do aluno.
- Listagem de alunos no admin com filtros por status e Jornada.
- Tela de detalhe do aluno no admin com lista de Jornadas e tempo restante em cada uma.
- Botão e modal de adição de dias por Jornada.
- Edição de `started_at` com recálculo automático de datas de liberação futuras.

**Critério de pronto:**

- Admin consegue ver, criar e gerenciar alunos.
- Aluno consegue se cadastrar e logar.
- Admin consegue estender o acesso de um aluno a uma Jornada.

---

### Sprint B — Jornadas (Admin)

**Objetivo:** permitir que o admin crie e gerencie Jornadas e atribua alunos.

**Entregas:**

- Tabelas `jornadas`, `jornada_simulados`, `student_jornadas` e `student_jornada_simulados`.
- CRUD de Jornadas no admin.
- Vinculação e ordenação de simulados na Jornada.
- Configuração de duração e data da prova com validação de data efetiva.
- Publicação da Jornada.
- Atribuição manual de aluno com cálculo automático das datas de liberação.
- Disparo automático de email de boas-vindas ao aluno com todos os parâmetros da Jornada.

**Critério de pronto:**

- Admin cria uma Jornada completa, atribui aluno e o aluno recebe o email automaticamente.

---

### Sprint C — Jornadas (Aluno)

**Objetivo:** construir a experiência do aluno dentro das Jornadas.

**Entregas:**

- Tela `/minhas-jornadas` com lista de Jornadas e progresso.
- Tela de detalhe da Jornada com simulados e status de cada um.
- Lógica de liberação progressiva com job periódico de verificação.
- Modal de aviso de atraso para simulados com data passada e anterior não concluído.
- Estados visuais: `locked`, `locked_late`, `available`, `in_progress`, `completed`, `expired`.
- Dashboard em modo leitura após expiração (sem abrir simulados, sem exportar PDF).

**Critério de pronto:**

- Aluno vê sua Jornada, simulados liberados, recebe aviso de atraso e acessa histórico após expiração.

---

### Sprint D — Fase 2: Google + Pagamento Automático (futuro)

**Objetivo:** automatizar o acesso e adicionar login social.

**Entregas:**

- Integração OAuth Google para login e cadastro.
- Merge de conta para email já existente no cadastro manual.
- Integração com gateway de pagamento.
- Webhook de compra aprovada com criação automática de `student_jornadas`.
- Sem alteração no motor de liberação, resultados ou regras de progressão.

**Critério de pronto:**

- Aluno compra e é matriculado automaticamente sem intervenção do admin.
- Login com Google disponível.

---

## PRINCÍPIO ARQUITETURAL FINAL

O módulo de Alunos e Jornadas deve ser **independente** do motor de Simulados.

A Jornada é apenas um organizador com regras de liberação. As tentativas, respostas e resultados continuam vivendo nas tabelas do módulo de Simulados, sem qualquer dependência de Jornada.

Isso garante que:

- Simulados avulsos (sem Jornada) continuam funcionando sem alteração.
- A liberação por pagamento automático na Fase 2 é apenas uma nova origem de `student_jornadas` — sem reescrever o motor de liberação.
- O histórico do aluno é auditável e preservado mesmo após expiração ou cancelamento da Jornada.
