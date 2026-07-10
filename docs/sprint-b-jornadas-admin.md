# SPRINT B — JORNADAS (ADMIN)

**Produto:** EstudoTOP Simulados  
**Depende de:** Sprint A concluído (tabela `students`, autenticação do aluno)  
**Referência arquitetural:** `alunos-jornadas-arquitetura-mestre.md`  
**Status:** Pronto para desenvolvimento

---

## OBJETIVO DO SPRINT

Permitir que o admin crie e gerencie Jornadas completas, vincule simulados, atribua alunos e dispare os emails automáticos de boas-vindas e liberação.

---

## 1. BANCO DE DADOS — MIGRATIONS

### 1.1 Tabela: `jornadas`

```sql
CREATE TABLE jornadas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text NOT NULL CHECK (trim(title) != ''),
  description       text,
  status            text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'published', 'archived')),
  duration_months   integer NOT NULL CHECK (duration_months > 0),
  exam_date         date,
  effective_end_date date,
  created_by        uuid REFERENCES admins(id),
  published_at      timestamptz,
  archived_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_jornadas_status      ON jornadas(status);
CREATE INDEX idx_jornadas_exam_date   ON jornadas(exam_date);
CREATE INDEX idx_jornadas_created_at  ON jornadas(created_at);
```

**Regra:** ao salvar, se `exam_date` for informada, calcular e persistir `effective_end_date = exam_date - 7 dias`.

---

### 1.2 Tabela: `jornada_simulados`

```sql
CREATE TABLE jornada_simulados (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jornada_id   uuid NOT NULL REFERENCES jornadas(id) ON DELETE CASCADE,
  simulado_id  uuid NOT NULL REFERENCES simulados(id),
  order_number integer NOT NULL CHECK (order_number > 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  UNIQUE(jornada_id, simulado_id),
  UNIQUE(jornada_id, order_number)
);

CREATE INDEX idx_jornada_simulados_jornada_id  ON jornada_simulados(jornada_id);
CREATE INDEX idx_jornada_simulados_simulado_id ON jornada_simulados(simulado_id);
CREATE INDEX idx_jornada_simulados_order       ON jornada_simulados(jornada_id, order_number);
```

---

### 1.3 Tabela: `student_jornadas`

```sql
CREATE TABLE student_jornadas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL REFERENCES students(id),
  jornada_id  uuid NOT NULL REFERENCES jornadas(id),
  started_at  date NOT NULL DEFAULT CURRENT_DATE,
  expires_at  date NOT NULL,
  status      text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'expired', 'cancelled')),
  assigned_by uuid REFERENCES admins(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE(student_id, jornada_id),
  CHECK (expires_at > started_at)
);

CREATE INDEX idx_student_jornadas_student_id ON student_jornadas(student_id);
CREATE INDEX idx_student_jornadas_jornada_id ON student_jornadas(jornada_id);
CREATE INDEX idx_student_jornadas_status     ON student_jornadas(status);
CREATE INDEX idx_student_jornadas_expires_at ON student_jornadas(expires_at);
```

---

### 1.4 Tabela: `student_jornada_simulados`

```sql
CREATE TABLE student_jornada_simulados (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_jornada_id   uuid NOT NULL REFERENCES student_jornadas(id) ON DELETE CASCADE,
  jornada_simulado_id  uuid NOT NULL REFERENCES jornada_simulados(id),
  simulado_id          uuid NOT NULL REFERENCES simulados(id),
  order_number         integer NOT NULL,
  scheduled_release_at date NOT NULL,
  released_at          timestamptz,
  status               text NOT NULL DEFAULT 'locked'
                         CHECK (status IN ('locked', 'available', 'in_progress', 'completed')),
  completed_at         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  UNIQUE(student_jornada_id, jornada_simulado_id)
);

CREATE INDEX idx_sjs_student_jornada_id   ON student_jornada_simulados(student_jornada_id);
CREATE INDEX idx_sjs_simulado_id          ON student_jornada_simulados(simulado_id);
CREATE INDEX idx_sjs_status               ON student_jornada_simulados(status);
CREATE INDEX idx_sjs_scheduled_release_at ON student_jornada_simulados(scheduled_release_at);
```

---

## 2. ROTAS E PÁGINAS

### 2.1 `/admin/jornadas` — Listagem de Jornadas

**O que exibe:**
- Tabela com todas as Jornadas.
- Colunas: nome, status (badge colorido), total de simulados, total de alunos matriculados, data da prova (se houver), data de criação.
- Filtros: por status (`draft`, `published`, `archived`).
- Busca por nome.
- Ordenação por data de criação (padrão: mais recente primeiro).
- Botão **"Nova Jornada"** no topo.
- Botão de ação em cada linha: **Ver**, **Editar**, **Arquivar**.

**Badges de status:**
- `draft` → cinza → "Rascunho"
- `published` → verde → "Publicada"
- `archived` → vermelho → "Arquivada"

---

### 2.2 `/admin/jornadas/nova` — Criar Jornada

**Campos do formulário:**

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| Nome | text | Sim | Não pode ser vazio após trim. |
| Descrição | textarea | Não | Livre. |
| Duração (meses) | number | Sim | Inteiro positivo > 0. |
| Data da prova | date | Não | Se informada, deve ser pelo menos 8 dias a partir de hoje (para que `exam_date - 7 >= hoje`). |

**Comportamento ao salvar:**
- Salva com `status = draft`.
- Se `exam_date` informada, calcula e persiste `effective_end_date = exam_date - 7`.
- Redireciona para `/admin/jornadas/[id]/editar` para vincular simulados.

---

### 2.3 `/admin/jornadas/[id]` — Detalhe da Jornada

**Seção 1 — Informações gerais:**
- Nome, descrição, status (badge), duração, data da prova, data efetiva de liberação.
- Botão **"Editar"**.
- Botão **"Publicar"** (se `draft`).
- Botão **"Arquivar"** (se `published`).

**Seção 2 — Simulados da Jornada:**
- Lista ordenada dos simulados vinculados com: posição, nome do simulado, data prevista de liberação (calculada para referência).
- Botão **"Gerenciar Simulados"** → vai para `/admin/jornadas/[id]/editar`.

**Seção 3 — Alunos matriculados:**
- Tabela com: nome do aluno, data de início, data de expiração, tempo restante, progresso (X de Y simulados concluídos), status da matrícula.
- Botão **"Atribuir Aluno"**.
- Ação em cada linha: **Ver perfil**, **Cancelar matrícula**, **Adicionar dias**.

---

### 2.4 `/admin/jornadas/[id]/editar` — Editar Jornada + Gerenciar Simulados

**Aba 1 — Informações gerais:**
- Mesmos campos do formulário de criação.
- Salvar atualiza `updated_at`.
- Se `exam_date` alterada e houver alunos ativos: recalcular `scheduled_release_at` de simulados ainda não liberados e exibir aviso: _"X alunos serão impactados. Deseja continuar?"_

**Aba 2 — Simulados:**

**Painel esquerdo — Simulados na Jornada (ordem atual):**
- Lista drag-and-drop para reordenar.
- Cada item exibe: posição, nome do simulado, botão remover.
- Botão **"+ Novo simulado"** → abre modal com duas opções:
  - **Criar novo** → redireciona para `/admin/simulados/novo?jornada_id=[id]` (ao salvar, volta e já vincula).
  - **Incluir existente** → abre busca de simulados do banco.

**Painel direito — Busca de simulados existentes:**
- Campo de busca por nome.
- Lista os simulados disponíveis com botão **"Incluir"**.
- Simulados já vinculados à Jornada aparecem desabilitados com badge "Já incluído".

**Regras de remoção:**
- Não permite remover simulado com `status = in_progress` ou `completed` em qualquer `student_jornada_simulados` ativo.
- Se houver alunos afetados, exibe lista: _"Os alunos abaixo estão neste simulado. Não é possível removê-lo."_

**Validação ao publicar:**
- A Jornada precisa ter pelo menos 1 simulado vinculado.
- Se `exam_date` informada, `effective_end_date` deve ser >= hoje.
- Exibe lista de erros impeditivos antes de publicar.

---

### 2.5 Fluxo: incluir simulado em Jornada a partir do banco de simulados

**Dentro de `/admin/simulados` (listagem):**
- Cada simulado tem botão **"Incluir em Jornada"**.
- Abre modal com lista de Jornadas com `status = published` ou `draft`.
- Admin seleciona a Jornada → simulado é adicionado ao final da lista (último `order_number`).
- Toast de confirmação: _"Simulado incluído na Jornada X."_

**Dentro de `/admin/simulados/[id]` (detalhe do simulado):**
- Seção **"Jornadas"** lista em quais Jornadas este simulado já está incluído.
- Botão **"Incluir em outra Jornada"** → mesmo modal acima.

---

## 3. ATRIBUIÇÃO DE ALUNO À JORNADA

### 3.1 Modal de atribuição

Acessível por:
- `/admin/jornadas/[id]` → botão "Atribuir Aluno"
- `/admin/alunos/[id]` → botão "Atribuir a Jornada"

**Campos do modal:**

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| Aluno | select com busca | Sim | Lista alunos com `status = active` ou `pending`. |
| Jornada | select com busca | Sim | Lista Jornadas com `status = published`. Pré-selecionada se aberto de dentro de uma Jornada. |
| Data de início | date | Sim | Padrão: hoje. Admin pode alterar. |

**Ao confirmar:**

1. Validar que o aluno ainda não está matriculado nessa Jornada.
2. Calcular `expires_at = started_at + duration_months`.
3. Calcular `scheduled_release_at` para cada simulado (algoritmo da seção 6.1 do arquivo mestre).
4. Criar registro em `student_jornadas`.
5. Criar registros em `student_jornada_simulados` para cada simulado da Jornada.
6. Liberar imediatamente o primeiro simulado (`status = available`, `released_at = now()`).
7. Disparar email de boas-vindas de forma **assíncrona** (não bloqueia a resposta).
8. Atualizar `status` do aluno para `active` se estava `pending`.
9. Exibir toast: _"Aluno atribuído com sucesso. Email de boas-vindas enviado."_

---

## 4. ALGORITMO DE CÁLCULO DAS DATAS DE LIBERAÇÃO

Executado no momento da atribuição do aluno à Jornada.

```
ENTRADA:
  started_at       = data de início do aluno
  duration_months  = duração da Jornada em meses
  exam_date        = data da prova (opcional)
  simulados        = lista ordenada de simulados da Jornada

SE exam_date IS NOT NULL:
    effective_end_date = exam_date - 7 dias
    dias_disponíveis   = effective_end_date - started_at

    SE dias_disponíveis <= 0:
        ERRO: "Data da prova muito próxima para calcular liberações."

    intervalo = dias_disponíveis / total_simulados

SENÃO:
    intervalo = (duration_months * 30) / total_simulados

PARA cada simulado N (1 até total):
    scheduled_release_at[N] = started_at + (N - 1) * intervalo

RESULTADO:
    scheduled_release_at[1] = started_at  → liberar imediatamente
    scheduled_release_at[2] = started_at + intervalo
    scheduled_release_at[3] = started_at + 2 * intervalo
    ...
```

---

## 5. EMAIL DE BOAS-VINDAS

Disparado automaticamente ao atribuir o aluno a uma Jornada.

**Assunto:** `Bem-vindo à [Nome da Jornada] — EstudoTOP`

**Conteúdo do email:**

- Nome do aluno.
- Nome da Jornada.
- Data de início do acesso.
- Data de expiração do acesso.
- Total de simulados.
- Data da prova (se informada).
- Data efetiva de início das liberações (se com data de prova).
- Regras resumidas:
  - _"Os simulados serão liberados progressivamente."_
  - _"Você só acessa o próximo após concluir o anterior."_
  - _"7 dias antes da prova todos os simulados estarão disponíveis."_ (se aplicável)
- Link direto para `/minhas-jornadas`.

**Regras de envio:**
- Disparado de forma assíncrona (não bloqueia a atribuição).
- Se falhar, registrar o erro em log mas não reverter a atribuição.
- Admin tem botão de **reenvio manual** no perfil do aluno.

---

## 6. EMAIL DE LIBERAÇÃO DE SIMULADO

Disparado automaticamente quando um simulado é liberado para o aluno.

**Trigger:** job periódico ou trigger no momento em que `status` muda para `available`.

**Assunto:** `Novo simulado liberado — [Nome da Jornada]`

**Conteúdo:**
- Nome do aluno.
- Nome do simulado liberado.
- Posição na Jornada (ex: "Simulado 3 de 10").
- Nome da Jornada.
- Link direto para o simulado.
- Data de expiração da Jornada (lembrete).

**Regras:**
- Enviado apenas uma vez por liberação.
- Se falhar, registrar em log e tentar novamente na próxima execução do job.
- Não enviar se a Jornada do aluno estiver com `status = cancelled`.

---

## 7. JOB DE VERIFICAÇÃO DE LIBERAÇÃO

Job periódico que verifica e libera simulados conforme as regras de progressão.

**Frequência recomendada:** a cada 1 hora (ou 1 vez por dia à meia-noite, dependendo da necessidade).

**Algoritmo:**

```
PARA cada student_jornada_simulados com status = 'locked':

    SE scheduled_release_at <= hoje:

        simulado_anterior = registro com order_number - 1
                            no mesmo student_jornada_id

        SE simulado_anterior.status = 'completed':
            → LIBERAR
              status       = 'available'
              released_at  = now()
              → disparar email de liberação (assíncrono)

        SENÃO:
            proximo = registro com order_number + 1
                      no mesmo student_jornada_id

            SE proximo IS NULL
            OU proximo.scheduled_release_at <= hoje:
                → LIBERAR
                  status       = 'available'
                  released_at  = now()
                  → disparar email de liberação (assíncrono)
```

**Regra em uma frase:** um simulado é liberado quando o anterior for concluído **OU** quando chegar a data de liberação do simulado seguinte — o que ocorrer primeiro.

---

## 8. CANCELAMENTO DE MATRÍCULA

Acessível pelo admin no perfil do aluno ou na tela da Jornada.

**Comportamento:**
- Altera `status` em `student_jornadas` para `cancelled`.
- Não deleta registros de `student_jornada_simulados`.
- Não deleta tentativas (`simulado_attempts`) já realizadas.
- Aluno perde acesso imediato à Jornada.
- Se o aluno não tiver mais nenhuma Jornada `active`, seu `status` muda para `inactive`.
- Exibir confirmação: _"Tem certeza que deseja cancelar a matrícula de [Nome] na Jornada [Nome]? Esta ação não pode ser desfeita."_

---

## 9. ADIÇÃO DE DIAS À MATRÍCULA

Acessível pelo admin no perfil do aluno (por Jornada) e na tela da Jornada (por aluno).

**Modal:**
- Campo: quantidade de dias (inteiro positivo > 0).
- Exibe o `expires_at` atual e o novo `expires_at` calculado em tempo real.
- Botão confirmar.

**Comportamento:**
- `novo_expires_at = expires_at_atual + N dias`.
- Nada mais é alterado.
- `scheduled_release_at` dos simulados bloqueados permanece igual.
- Se a Jornada estava `expired`, o `status` volta para `active` automaticamente.
- Toast: _"Acesso estendido até [nova data]."_

---

## 10. FLUXO COMPLETO — VISÃO DO ADMIN

```
Admin cria Jornada (draft)
  └── Define nome, duração, data da prova (opcional)

Admin adiciona simulados
  └── Cria novo simulado → vai para tela de criação → volta vinculado
  └── Inclui existente  → busca no banco → adiciona ao final
  └── Reordena via drag-and-drop

Admin publica a Jornada
  └── Validações: tem simulados? data da prova ok?
  └── status → published

Admin atribui aluno
  └── Seleciona aluno + Jornada + data de início
  └── Sistema calcula datas de liberação
  └── Cria student_jornadas e student_jornada_simulados
  └── Libera simulado 1 imediatamente
  └── Dispara email de boas-vindas (assíncrono)

Job periódico roda
  └── Verifica simulados bloqueados com data passada
  └── Libera conforme regra de progressão
  └── Dispara email de liberação (assíncrono)

Admin acompanha
  └── Na tela da Jornada: progresso de cada aluno
  └── No perfil do aluno: Jornadas, tempo restante, ações
```

---

## 11. ESTADOS E TRANSIÇÕES DA JORNADA

```
draft
  └── [publicar]    → published
  └── [deletar]     → (delete físico, só se não tiver alunos)

published
  └── [arquivar]    → archived
  └── [editar]      → continua published (com recálculo se necessário)

archived
  └── sem transição de volta (decisão de negócio)
```

---

## 12. VALIDAÇÕES E REGRAS DE NEGÓCIO

| Situação | Regra |
|---|---|
| Publicar Jornada sem simulados | Bloquear. Exibir erro. |
| Publicar com `exam_date` já passada | Bloquear. Exibir erro. |
| Publicar com `effective_end_date < hoje` | Bloquear. Exibir erro. |
| Atribuir aluno já matriculado na mesma Jornada | Bloquear. Exibir erro. |
| Atribuir aluno a Jornada `draft` ou `archived` | Bloquear. Exibir erro. |
| Remover simulado com aluno `in_progress` ou `completed` | Bloquear. Listar alunos afetados. |
| Alterar `exam_date` com alunos ativos | Permitir com confirmação. Recalcular datas futuras. |
| Adicionar 0 dias ou valor negativo | Bloquear. Validar no frontend e backend. |
| Cancelar matrícula | Apenas admin. Confirmação obrigatória. Irreversível. |

---

## 13. PONTOS DE ATENÇÃO PARA O DESENVOLVIMENTO

- O cálculo de `scheduled_release_at` deve ser uma função utilitária reutilizável — será usada na atribuição, no recálculo por edição de `started_at` e na edição de `exam_date`.
- O disparo de email nunca deve bloquear uma operação principal. Sempre assíncrono.
- O job de liberação deve ser idempotente — rodar duas vezes não pode liberar o mesmo simulado duas vezes.
- Ao arquivar uma Jornada, não cancelar automaticamente as matrículas ativas — alunos já matriculados continuam com acesso até o `expires_at`.
- A reordenação de simulados via drag-and-drop deve atualizar todos os `order_number` em uma única transação.
- Desnormalizar `simulado_id` e `order_number` em `student_jornada_simulados` é intencional — facilita queries de progresso sem joins desnecessários.

---

## 14. CRITÉRIO DE PRONTO

O Sprint B está concluído quando:

- [ ] Migrations das 4 tabelas criadas e aplicadas.
- [ ] Admin consegue criar, editar, publicar e arquivar uma Jornada.
- [ ] Admin consegue adicionar simulados à Jornada (criar novo ou incluir existente).
- [ ] Admin consegue reordenar simulados via drag-and-drop.
- [ ] Simulados têm botão "Incluir em Jornada" na listagem e no detalhe.
- [ ] Admin consegue atribuir aluno a uma Jornada publicada.
- [ ] Sistema calcula datas de liberação corretamente nos dois cenários (com e sem `exam_date`).
- [ ] Email de boas-vindas disparado automaticamente na atribuição.
- [ ] Job de liberação progressiva rodando e liberando simulados conforme regras.
- [ ] Email de liberação disparado quando simulado é liberado.
- [ ] Admin consegue cancelar matrícula de aluno.
- [ ] Admin consegue adicionar dias ao `expires_at` de uma matrícula.
- [ ] Admin vê progresso dos alunos na tela da Jornada.
- [ ] Todas as validações de negócio implementadas e testadas.

---

## Adendo — Categoria visual da Jornada — 2026-06-13

A tabela `jornadas` passa a possuir o campo obrigatório `category`, com os valores:

```text
saude | policial | tribunais | administrativo
```

A categoria é informada na criação, editável posteriormente e define automaticamente a miniatura do card administrativo. A implementação e o backfill estão em `app/supabase_migrations/011_jornadas_categoria.sql`.
