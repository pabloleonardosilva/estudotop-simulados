# Sprint Simulados — Documentação Técnica e Funcional

> Documento de referência para todos os recursos desenvolvidos na Sprint Simulados do EstudoTOP Simulados.
> Inclui: funcionamento, regras de negócio, interface, banco de dados e APIs.

---

## Sumário

1. [Módulo de Simulados (Admin)](#1-módulo-de-simulados-admin)
2. [Banco de Questões](#2-banco-de-questões)
3. [Importação de Questões por IA](#3-importação-de-questões-por-ia)
4. [Revisão de Questões](#4-revisão-de-questões)
5. [Área do Aluno](#5-área-do-aluno)
6. [Banco de Dados](#6-banco-de-dados)
7. [APIs](#7-apis)
8. [Design System](#8-design-system)

---

## 1. Módulo de Simulados (Admin)

### 1.1 O que é um Simulado

Um simulado é uma prova configurável criada pelo admin e disponibilizada para alunos. Cada simulado tem um conjunto de configurações que controlam tempo, tentativas, pontuação, feedback e navegação.

### 1.2 Estados do Simulado

| Status | Descrição |
|---|---|
| `draft` | Rascunho — não visível para alunos |
| `published` | Publicado — alunos podem acessar e realizar |
| `archived` | Arquivado — desativado, histórico preservado |

Transições permitidas: `draft → published → archived`. Não há volta de `archived` para `published`.

### 1.3 Configurações de um Simulado

#### Identificação
| Campo | Tipo | Descrição |
|---|---|---|
| `title` | string | Título exibido ao aluno |
| `description` | string? | Descrição opcional |
| `discipline_id` | uuid? | Disciplina principal associada |
| `status` | enum | draft / published / archived |

#### Tempo e Tentativas
| Campo | Tipo | Descrição |
|---|---|---|
| `time_limit_minutes` | int? | Duração em minutos. `null` = sem limite |
| `max_attempts` | int? | Máximo de tentativas. `null` = ilimitado |
| `attempt_count_threshold_percent` | int? | % de resposta para contar uma tentativa (padrão: 50%) |

#### Modelo de Pontuação
| Valor | Nome | Regra |
|---|---|---|
| `traditional` | Tradicional | Acertos somam pontos. Erros e brancos não penalizam. |
| `cebraspe` | CEBRASPE | Acerto = +1 ponto. Erro = −1 ponto. Branco = 0 ponto. |

#### Navegação (`navigation_type`)
| Valor | Comportamento |
|---|---|
| `open` | Aluno navega livremente entre questões e confirma tudo ao finalizar |
| `closed` | Aluno confirma cada resposta antes de avançar — não pode voltar |

#### Feedback e Gabarito
| Campo | Tipo | Descrição |
|---|---|---|
| `feedback_mode` | enum | `instant` = feedback por questão / `final_only` = só ao finalizar |
| `show_result_on_finish` | bool | Exibir score ao finalizar |
| `show_answer_key_on_finish` | bool | Exibir gabarito completo ao finalizar |
| `show_teacher_comment` | bool | Exibir explicação do professor ao aluno |
| `correction_video_url` | string? | URL de vídeo de correção |
| `instant_feedback_enabled` | bool | Habilita feedback imediato após resposta (usado com `feedback_mode: instant`) |

#### Embaralhamento e Brancos
| Campo | Tipo | Descrição |
|---|---|---|
| `shuffle_questions` | bool | Embaralha ordem das questões por tentativa |
| `shuffle_alternatives` | bool | Embaralha alternativas de cada questão |
| `allow_blank_answers` | bool | Permite o aluno deixar questão em branco |

#### Ajuda e Gamificação
| Campo | Tipo | Descrição |
|---|---|---|
| `owl_help_enabled` | bool? | Habilita o assistente Coruja para o aluno |

### 1.4 Banco de Questões do Simulado

Cada simulado tem seu próprio conjunto de questões vinculadas via `simulado_questions`. A ordem é controlada por `order_number` e pode ser reordenada via drag-and-drop.

Cada vínculo questão-simulado tem:
- `points` — pontos que a questão vale neste simulado
- `status` — `active` (ativa) ou `annulled` (anulada sem punição)


### Atualização — Edição rápida do nome na listagem — 2026-07-08

Na listagem administrativa `/simulados`, os cards de simulados passam a exibir um pequeno lápis ao lado do nome do simulado. O clique no lápis abre um campo inline para edição rápida do título, sem navegar para a tela completa de edição.

Regras:

- `Enter` ou perda de foco salva automaticamente.
- `Esc` cancela a alteração.
- A ação chama `PATCH /api/admin/simulados/[id]`, alterando somente o `title` e preservando os demais campos do simulado.
- O input e o botão de lápis bloqueiam a propagação do clique/teclado para evitar abertura acidental do card.
- Não altera questões, tentativas, resultados, jornadas, status, configurações nem banco de dados estrutural.

### 1.5 Páginas do Módulo (Admin)

| Rota | Função |
|---|---|
| `/simulados` | Listagem com filtros por status, disciplina e busca por texto |
| `/simulados/novo` | Formulário de criação com todas as configurações |
| `/simulados/[id]` | Visualização completa do simulado (admin) |
| `/simulados/[id]/editar` | Edição de configurações + gerenciamento do banco de questões |
| `/simulados/[id]/preview` | Preview funcional completo como aluno (sem criar tentativa real) |


### 1.7 Duplicar simulado existente

Na listagem administrativa `/simulados`, o botão **Duplicar existente** fica ao lado de **Novo simulado**. Ele abre modal premium dark para o admin escolher o simulado base e confirmar o nome da cópia.

Regra implementada:

- A cópia é sempre criada com `status = "draft"`.
- Copia as configurações principais do simulado: disciplina, descrição, tempo, tentativas, feedback, gabarito, comentários, embaralhamento, pontuação e ajuda da coruja.
- Copia os vínculos de `simulado_questions`, preservando `question_id`, `order_number`, `points`, `status` e `is_required`.
- Não copia tentativas, respostas, resultados, execuções, histórico de alunos nem vínculos com Jornadas.
- Após duplicar, o admin é redirecionado para a edição da nova cópia.
- A API usada é `POST /api/admin/simulados/[id]/duplicate`, que aceita opcionalmente `{ "title": "Nome da cópia" }`.

### 1.6 Preview do Simulado

O preview (`/simulados/[id]/preview`) é a **página mais premium do sistema** — referência visual para o design de questões. Funciona como o simulado real mas sem persistir dados em `simulado_attempts`, `simulado_answers` ou `simulado_results`.

---

## 2. Banco de Questões

### 2.1 Estados da Questão

```
draft → pending_review → ready_to_publish → published
                                          ↘ archived
```

| Status | Descrição |
|---|---|
| `draft` | Rascunho criado mas não enviado |
| `pending_review` | Enviada para revisão humana — fila de revisão |
| `ready_to_publish` | Aprovada na revisão, aguardando publicação em lote |
| `published` | Publicada — disponível para vincular a simulados |
| `archived` | Descartada / removida de circulação |

### 2.2 Tipos de Questão

| Tipo | Alternativas | Labels |
|---|---|---|
| `multiple_choice` | 2 a 5 opções (A–E) | A, B, C, D, E |
| `true_false` | Exatamente 2 opções | Certo, Errado |

A detecção automática de `true_false` ocorre quando as alternativas extraídas forem exatamente "Certo" e "Errado", independente do que a IA retornar no campo `question_type`.

### 2.3 Campos da Questão

| Campo | Tipo | Descrição |
|---|---|---|
| `code` | string? | Código único de identificação |
| `statement` | text | Enunciado em HTML (gerado por RichTextEditor) |
| `question_type` | enum | multiple_choice / true_false |
| `status` | enum | Ver estados acima |
| `difficulty_level` | int (1–5) | 1 = Muito fácil, 5 = Muito difícil |
| `year` | int? | Ano da prova de origem |
| `exam_board_id` | uuid? | Banca examinadora |
| `subject_id` | uuid? | Assunto principal |
| `explanation_text` | text? | Explicação do professor (HTML) |
| `image_url` | string? | Imagem do enunciado |
| `source_origin` | string? | `import_ai` / `generate_ai` / `manual` |
| `question_fingerprint` | string? | Hash para detecção de duplicatas |
| `is_in_question_bank` | bool | Se está disponível para uso em simulados |
| `correct_alternative_label` | string? | Label da alternativa correta (cache) |

### 2.4 Alternativas

Cada questão tem de 2 a 5 alternativas em `question_alternatives`:

| Campo | Tipo | Descrição |
|---|---|---|
| `label` | string | A, B, C, D, E / Certo, Errado |
| `text` | text | Texto da alternativa (HTML) |
| `is_correct` | bool | Indica o gabarito |
| `order_number` | int | Posição de exibição |
| `image_url` | string? | Imagem da alternativa |

**A correção sempre usa o `id` da alternativa, nunca sua posição ou label.** Isso garante que embaralhamentos não afetam o gabarito.

### 2.5 Páginas do Banco de Questões (Admin)

| Rota | Função |
|---|---|
| `/questoes` | Banco master: listagem com filtros avançados, edição inline, ações em lote |
| `/questoes/nova` | Criação manual com RichTextEditor e seleção de assuntos |
| `/questoes/importar` | Importação em lote via texto colado + análise por IA |
| `/questoes/gerar-ia` | Geração de questões por IA (OpenAI) |
| `/questoes/revisar` | Fila de revisão: questões pending_review |
| `/questoes/duplicatas` | Detecção e resolução de pares de questões duplicadas |
| `/questoes/[id]/editar` | Edição completa de questão individual |
| `/questoes/[id]/preview` | Preview isolado da questão |

---

### 2.6 Relatório de uso da questão em simulados

Na rota `/questoes`, cada card de questão publicada deve informar em quais simulados aquela questão está vinculada atualmente.

Implementação atual:

- `app/questoes/page.tsx` carrega os vínculos por `simulado_questions` junto com os dados de `simulados`.
- `app/questoes/page-client.tsx` exibe a seção **Uso em simulados** na parte inferior do card, antes dos botões de ação.
- Cada simulado aparece como chip clicável para `/simulados/[id]`.

Regra de negócio:

- Mostrar apenas simulados com vínculo atual em `simulado_questions`.
- Se a questão foi inserida e depois removida de um simulado, ela não deve aparecer no relatório.
- A remoção atual apaga o vínculo em `simulado_questions`; por isso o relatório não precisa consultar histórico.

---

## 3. Importação de Questões por IA

### 3.1 Visão Geral do Fluxo

```
1. Admin cola texto bruto com questões
2. Sistema quebra em blocos por questão
3. OpenAI analisa cada bloco (statement, alternatives, type, board, year)
4. Verificação de duplicatas (batch + banco)
5. Admin pré-visualiza, ajusta e seleciona questões
6. Admin define: disciplina, assunto(s), banca, ano padrão
7. Admin clica "Enviar para revisão"
8. Questões são salvas com status pending_review
```

### 3.2 Análise por IA

O endpoint `/api/admin/questions/import/analyze-batch` envia cada bloco de texto para a OpenAI (modelo configurado por `OPENAI_IMPORT_MODEL`, padrão `gpt-4o-mini`) e recebe:

```json
{
  "statement": "Enunciado da questão",
  "question_type": "multiple_choice",
  "board_name": "CESPE / CEBRASPE",
  "year": 2023,
  "difficulty_level": 3,
  "explanation_text": "",
  "alternatives": [
    { "label": "A", "text": "texto", "is_correct": false },
    { "label": "B", "text": "texto", "is_correct": true }
  ]
}
```

O parser de texto (`extractQuestionParts`) também extrai alternativas diretamente do bloco bruto. O resultado final usa o **merge** das alternativas do parser (mais confiável para posição/texto) com as da IA (mais confiável para gabarito).

### 3.3 Detecção Automática de Tipo

| Condição | Resultado |
|---|---|
| IA retorna `question_type: "true_false"` | `true_false` |
| Alternativas extraídas são exatamente "Certo" e "Errado" | `true_false` (override automático) |
| Qualquer outro caso | `multiple_choice` |

### 3.4 Pré-processamento do Enunciado

O enunciado passa por `formatStatementForDisplay()` antes de ser exibido:

- **Quebras de parágrafo** inseridas antes de itens de lista romana (I-, II-, III-) e itens numerados (1., 2., 3.) quando colapsados em linha única
- **Negrito automático** em "Imagem associada" e frases similares
- **Remoção de metadados** de cabeçalho (linhas com "Ano:", "Banca:", "Cargo:") via `stripQuestionMetadataFromStatement()`
- **Limpeza de "Texto associado"** quando aparece logo após a linha de metadados

### 3.5 Detecção de Duplicatas

Dois tipos de duplicata são verificados:

#### Duplicata de lote (`batch`)
Questões idênticas ou muito similares dentro do mesmo lote importado. Detectada antes do envio para a IA.

#### Duplicata no banco (`database`)
Questão com alta similaridade a uma já existente no banco. Detectada por fingerprint + similaridade Jaccard.

| Tipo de duplicata | Comportamento |
|---|---|
| `batch` | Bloqueada automaticamente — não enviada |
| `database` | Exibida com aviso vermelho + opção "Ver comparação" |
| `possible` | Aviso de atenção + opção "Ver comparação" |

#### Regra de bloqueio no envio:
- Questões `is_duplicate: true` com `duplicate_type !== "possible"` são ignoradas no save
- Questões `possible` podem ser enviadas mesmo sendo similaridade alta

### 3.6 Configuração Obrigatória Antes de Enviar

| Campo | Obrigatoriedade |
|---|---|
| Disciplina | Obrigatória — selecionada no painel esquerdo |
| Assunto(s) | Obrigatório — mínimo 1 |
| Banca de cada questão | Obrigatória — identificada automaticamente ou selecionada manualmente |

Se qualquer um estiver faltando, o botão "Enviar para revisão" exibe um modal de erro centralizado.

### 3.7 Identificação de Banca

A banca é detectada automaticamente do texto via `extractBoardNameFromText()` que busca padrões como `Banca: CESPE`. Se não encontrada, o campo fica em branco e o admin deve selecionar manualmente via busca.

O sistema faz `findOrCreate` da banca: se o nome normalizado já existir no banco, usa o existente; se não, cria automaticamente.

---

## 4. Revisão de Questões

### 4.1 Fila de Revisão

A página `/questoes/revisar` exibe todas as questões com status `pending_review` ou `ready_to_publish`. O sistema busca em páginas de 1000 registros até obter todas (sem limite artificial).

### 4.2 Estatísticas em Tempo Real

| Contador | O que mede |
|---|---|
| Pendentes | Questões com `pending_review` na sessão atual |
| Na fila | Questões com `ready_to_publish` na sessão atual |
| Salvas | Questões salvas (sem publicar) nesta sessão |
| Publicadas | Questões publicadas nesta sessão |
| Descartadas | Questões arquivadas nesta sessão |

### 4.3 Ações por Questão

| Ação | Resultado |
|---|---|
| **Salvar** | Persiste edições + status permanece `pending_review` |
| **Adicionar à fila** | Marca para publicação em lote (local, visível na ghost bar) |
| **Confirmar fila** | Atualiza status para `ready_to_publish` via API |
| **Publicar** | Salva + atualiza status para `published` via API |
| **Descartar** | Atualiza status para `archived` via API |
| **Publicar toda a fila** | Publica em lote todas as `ready_to_publish` filtradas |

### 4.4 Filtros Disponíveis

- Status (Pendente revisão / Na fila / Todos)
- Banca
- Assunto
- Ano
- Busca por texto (enunciado, código, alternativas, nome da banca, assunto)

### 4.5 Edição na Revisão

Cada questão na fila pode ser editada inline:
- Enunciado via RichTextEditor
- Alternativas (texto + marcar gabarito)
- Explicação do professor via RichTextEditor
- Assunto(s) via SubjectMultiSelect
- Nível de dificuldade
- Ano e banca

Um rascunho local (`localStorage`) é salvo automaticamente para evitar perda de dados ao navegar.

---

## 5. Área do Aluno

### 5.1 Dashboard do Aluno

`/aluno` — resumo de desempenho geral do aluno com métricas de simulados realizados.

### 5.2 Lista de Simulados

`/meus-simulados` — exibe todos os simulados com status `published` disponíveis para o aluno. Mostra: título, progresso, tentativas realizadas vs. permitidas, resultado da última tentativa.

### 5.3 Fazendo o Simulado

`/meus-simulados/[id]` — interface de execução do simulado:

#### Inicialização
- Cria uma `simulado_attempt` com status `in_progress`
- Snapshot das configurações no momento (`settings_snapshot`)
- Timer iniciado no frontend baseado em `time_limit_minutes`
- Questões embaralhadas se `shuffle_questions = true`
- Alternativas embaralhadas por questão se `shuffle_alternatives = true`

#### Durante a Prova
- Respostas salvas em tempo real via API (`simulado_answers`)
- Timer regressivo visível quando há limite de tempo
- Violações de foco (troca de aba) registradas em `focus_violation_count`
- Navegação controlada por `navigation_type`:
  - `open`: aluno vai e volta livremente
  - `closed`: confirma uma por uma, sem retorno

#### Finalização
- Aluno clica "Finalizar" → API `/submit` calcula resultado
- `simulado_results` é gravado com snapshot completo
- Status da tentativa muda para `completed`

#### Regra de Contagem de Tentativas
Uma tentativa só é contada contra o limite (`max_attempts`) quando `answered_count / total_questions > 0.5` (mais da metade respondida).

### 5.4 Resultado

A documentação detalhada da experiência de resultado do aluno foi movida para o documento exclusivo da Sprint Resultados:

```text
docs/Sprint-resultados.md
```

Este documento mantém apenas a visão funcional geral do motor de Simulados. A rota `/meus-simulados/[id]/resultado` continua exibindo resultado consolidado, gabarito conforme configuração, comentários do professor quando liberados e avaliação do simulado.

Atualização 2026-07-07: a página de resultado do aluno passou a abrir o **resultado real** do simulado, definido como a primeira tentativa concluída válida (`status = completed` e `counts_toward_limit = true`). Não usar a última tentativa nem a melhor nota como fonte da rota `/meus-simulados/[id]/resultado`.

### 5.5 Modelos de Pontuação

#### Tradicional
```
score = Σ(pontos de cada questão acertada)
percentage = (acertos / total_questions) × 100
```

#### CEBRASPE
```
score = acertos − erros
percentage = (score / total_questions) × 100
Questão em branco = 0 pontos (não penaliza)
```

---

## 6. Banco de Dados

### 6.1 Tabelas do Módulo de Simulados

#### `simulados`
Configuração completa. Colunas principais: `id`, `title`, `status`, `scoring_model`, `navigation_type`, `time_limit_minutes`, `max_attempts`, `feedback_mode`, `shuffle_questions`, `shuffle_alternatives`, `allow_blank_answers`, `show_result_on_finish`, `show_answer_key_on_finish`, `show_teacher_comment`, `owl_help_enabled`.

#### `simulado_questions`
Vínculo simulado ↔ questão. Colunas: `id`, `simulado_id`, `question_id`, `order_number`, `points`, `status` (`active|annulled`).

#### `simulado_attempts`
Tentativa do aluno. Colunas: `id`, `simulado_id`, `student_id`, `attempt_number`, `status` (`in_progress|completed|disqualified|expired|abandoned`), `answered_count`, `total_questions`, `progress_percent`, `started_at`, `submitted_at`, `expires_at`, `tab_switch_count`, `focus_violation_count`, `question_order` (JSONB), `settings_snapshot` (JSONB).

**Índice único parcial:** apenas uma tentativa `in_progress` por `(simulado_id, student_id)`.

#### `simulado_answers`
Resposta por questão. Colunas: `attempt_id`, `question_id`, `simulado_question_id`, `selected_alternative_id`, `is_correct`, `is_locked`, `response_time_seconds`, `changed_count`, `alternative_order`.

#### `simulado_results`
Resultado calculado. Colunas: `attempt_id`, `simulado_id`, `student_id`, `total_questions`, `correct_count`, `wrong_count`, `blank_count`, `annulled_count`, `score`, `display_score`, `percentage`, `scoring_model`, `time_spent_seconds`, `result_snapshot` (JSONB).

`result_snapshot` preserva o gabarito e as respostas no momento da correção — edições futuras nas questões não alteram resultados históricos.

#### `simulado_feedbacks`
Avaliação do aluno. Colunas: `simulado_id`, `student_id`, `attempt_id`, `rating` (1–5), `comment`.

### 6.2 Tabelas do Banco de Questões

#### `questions`
Colunas: `id`, `code`, `statement`, `status`, `question_type`, `difficulty_level`, `year`, `exam_board_id`, `subject_id`, `image_url`, `explanation_text`, `source_origin`, `question_fingerprint`, `is_in_question_bank`, `correct_alternative_label`, `review_comment`.

#### `question_alternatives`
Colunas: `id`, `question_id`, `label`, `text`, `is_correct`, `order_number`, `image_url`.

#### `question_subjects`
Relacionamento many-to-many entre questão e múltiplos assuntos.

### 6.3 Tabelas de Taxonomia

| Tabela | Colunas principais |
|---|---|
| `disciplines` | `id`, `name` |
| `subjects` | `id`, `name`, `discipline_id` |
| `exam_boards` | `id`, `name`, `is_active` |

### 6.4 Tabela de Perfis

`profiles`: `id` (= `auth.users.id`), `full_name`, `role` (`admin|student`), `is_active`, `must_change_password`.

---

## 7. APIs

### 7.1 Admin — Simulados

| Endpoint | Método | Descrição |
|---|---|---|
| `/api/admin/simulados` | GET | Listar simulados com filtros |
| `/api/admin/simulados` | POST | Criar simulado |
| `/api/admin/simulados/[id]` | GET | Detalhe do simulado |
| `/api/admin/simulados/[id]` | PATCH | Atualizar configurações |
| `/api/admin/simulados/[id]` | DELETE | Excluir simulado |
| `/api/admin/simulados/[id]/duplicate` | POST | Duplicar simulado existente como rascunho |
| `/api/admin/simulados/[id]/questions` | GET | Listar questões vinculadas |
| `/api/admin/simulados/[id]/questions` | POST | Vincular questão ao simulado |
| `/api/admin/simulados/[id]/questions` | DELETE | Desvincular questão |
| `/api/admin/simulados/[id]/questions/reorder` | PATCH | Reordenar questões |

### 7.2 Admin — Questões

| Endpoint | Método | Descrição |
|---|---|---|
| `/api/admin/questions` | GET | Listar questões com filtros |
| `/api/admin/questions` | POST | Criar questão manualmente |
| `/api/admin/questions` | DELETE | Excluir questões em lote |
| `/api/admin/questions/bulk` | PATCH | Atualizar status em lote |
| `/api/admin/questions/[id]` | GET, PATCH, DELETE | CRUD individual |
| `/api/admin/questions/[id]/answer` | PATCH | Atualizar gabarito |
| `/api/admin/questions/[id]/difficulty` | PATCH | Atualizar dificuldade |
| `/api/admin/questions/check-duplicate` | POST | Verificar duplicata pontual |
| `/api/admin/questions/duplicates` | GET | Listar todos os pares de duplicatas |
| `/api/admin/questions/explain` | POST | Gerar explicação por IA |
| `/api/admin/questions/generate-ai` | POST | Gerar questão por IA |
| `/api/admin/questions/import/analyze` | POST | Analisar questão única |
| `/api/admin/questions/import/analyze-batch` | POST | Analisar lote de questões |
| `/api/admin/questions/import/save` | POST | Salvar questões importadas |
| `/api/admin/questions/review-comment` | POST | Adicionar comentário de revisão |
| `/api/admin/questions/classify-difficulty` | POST | Classificar dificuldade em lote |

### 7.3 Admin — Taxonomia

| Endpoint | Método | Descrição |
|---|---|---|
| `/api/admin/disciplines` | GET, POST | CRUD de disciplinas |
| `/api/admin/subjects` | GET, POST | CRUD de assuntos |
| `/api/admin/subjects/bulk` | POST | Importação em lote de assuntos |
| `/api/admin/exam-boards` | GET, POST | CRUD de bancas |
| `/api/admin/exam-boards/bulk` | POST | Importação em lote |
| `/api/admin/exam-boards/search` | GET | Busca de banca por nome |

### 7.4 Student — Simulados e Tentativas

| Endpoint | Método | Descrição |
|---|---|---|
| `/api/student/simulados` | GET | Listar simulados publicados |
| `/api/student/simulados/[id]` | GET | Detalhe do simulado |
| `/api/student/simulados/[id]/attempts` | GET, POST | Listar / iniciar tentativa |
| `/api/student/simulados/[id]/attempts/[aId]/answers` | GET, POST | Consultar / registrar respostas |
| `/api/student/simulados/[id]/attempts/[aId]/submit` | POST | Finalizar tentativa |
| `/api/student/simulados/[id]/attempts/[aId]/focus-violation` | POST | Registrar violação de foco |
| `/api/student/simulados/[id]/feedback` | GET | Feedback da tentativa |
| `/api/student/simulados/[id]/resultado` | GET | Resultado consolidado |

### 7.5 Padrão de Resposta das APIs

Todas as rotas retornam:
```json
{ "ok": true, "message": "...", ...dados }
```
ou em erro:
```json
{ "ok": false, "message": "Descrição do erro" }
```

Códigos HTTP: `200` (sucesso), `201` (criado), `400` (dados inválidos), `404` (não encontrado), `500` (erro interno).

---

## 8. Design System

### 8.1 Tokens de Questão (`lib/ui/question-tokens.ts`)

Fonte de verdade para o visual de cards de questão. Usar sempre `qCard.*` ao renderizar questões:

| Token | Uso |
|---|---|
| `qCard.wrapper` | Card externo |
| `qCard.statement` | Enunciado |
| `qCard.alts.block` | Container de alternativas |
| `qCard.alts.base` | Alternativa neutra |
| `qCard.alts.selected` | Alternativa selecionada |
| `qCard.alts.correct` | Alternativa correta |
| `qCard.alts.wrong` | Alternativa errada |
| `qCard.alts.labelBase/labelSelected/labelCorrect/labelWrong` | Bolinha com letra |
| `qCard.tags.*` | Chips de metadados (primary, neutral, brand, success, warning, info, muted) |

### 8.2 Componentes de UI Obrigatórios

| Componente | Uso |
|---|---|
| `PremiumButton` | Todos os botões |
| `PremiumInput` | Todos os inputs |
| `PremiumSelect` | Todos os selects |
| `PremiumCard` | Cards de conteúdo |
| `PremiumTable` | Tabelas de dados |
| `PremiumModal` | Modais de feedback |
| `PremiumLoadingOverlay` | Estados de carregamento global |
| `PageHeader` | Cabeçalhos de página |
| `PageBackground` | Wrapper de fundo |
| `SelectionGhostBar` | Barra flutuante de ações em seleção múltipla |
| `DraftRestoreModal` | Modal de restauração de rascunho |

### 8.3 Componentes de Questão

| Componente | Uso |
|---|---|
| `RichTextEditor` | Editor de enunciado e alternativas |
| `SubjectMultiSelect` | Seleção múltipla de assuntos |
| `QuestionActionModal` | Modal de ações/confirmações |
| `ExplanationAuthorCard` | Rodapé de autoria da explicação |

---

*Documento gerado ao final da Sprint Simulados — EstudoTOP, maio de 2026.*
### Atualização 2026-06-08 — Envio de questão para outro simulado e índice de acertos

Na edição do simulado (`/simulados/[id]/editar`), cada questão já vinculada pode ser enviada para outro simulado sem sair da página atual. Essa ação cria o vínculo no simulado de destino e mantém a questão no simulado original.

O card de questão na edição também exibe índice de acerto agregado da questão no banco, calculado a partir de `simulado_answers` por `question_id`:

- `correct_count`: respostas corretas.
- `wrong_count`: respostas erradas.
- `total_answered_count`: total de respostas corrigidas.
- `accuracy_rate`: percentual de acerto.

Esse índice considera respostas da questão em todos os simulados onde ela foi utilizada, não apenas no simulado atualmente aberto.

---

## Atualização — Seletor de questões na edição do simulado — 2026-06-10

Na tela `/simulados/[id]/editar`, o modal **Selecionar questões** passou por ajuste operacional fino:

- Filtros podem ser recolhidos/expandidos por botão próprio, economizando espaço vertical durante a seleção.
- Os cards de questões do modal foram compactados exclusivamente nesse contexto, com menor fonte, menor espaçamento e alternativas mais enxutas, para permitir visualizar mais questões na tela.
- Cada questão disponível no seletor passou a ter a ação **Usar como modelo**, que abre o fluxo de criação manual de questão já pré-preenchido a partir da questão escolhida.
- A ação **Usar como modelo** reaproveita o mesmo mecanismo do Banco de Questões: cria uma nova questão sem alterar a original e mantém as regras editoriais de ajustar banca/ano quando o modelo for editado.
- A tela `/simulados` foi ajustada para preservar a sidebar: as camadas decorativas de fundo deixaram de usar `position: fixed` e passaram a ficar restritas ao conteúdo da página.

Regra de manutenção: a compactação visual vale apenas para o modal de seleção de questões do simulado. O Banco de Questões, Revisar Questões, Preview do Simulado e Execução do aluno não devem receber essa redução de fonte/espaçamento sem pedido explícito.

---

## Atualização — execução do aluno: navegação e controle de foco (2026-06-15)

Foram consolidadas as seguintes regras na tela `/meus-simulados/[id]`:

- Simulados de navegação aberta permitem avançar e retornar livremente, inclusive quando a questão atual estiver em branco.
- A banca organizadora deixa de ser exibida durante a resolução, reduzindo informação administrativa desnecessária na prova.
- O limite de alternâncias de aba/janela passa a ser três ocorrências.
- A primeira e a segunda ocorrências exibem avisos obrigatórios.
- Na terceira ocorrência, a tentativa é encerrada por violação de foco e conta como utilizada.
- O contador persistido em `simulado_attempts.focus_violation_count` é a fonte de verdade para evitar inconsistência após recarregamento.

Arquivos relacionados:

- `app/meus-simulados/[id]/page-client.tsx`
- `app/meus-simulados/[id]/page.tsx`
- `app/api/student/simulados/[id]/route.ts`
- `app/api/student/simulados/[id]/attempts/route.ts`
- `app/api/student/simulados/[id]/attempts/[attemptId]/focus-violation/route.ts`

## Atualização — resultado real do aluno alinhado ao Preview administrativo (2026-06-15)

Detalhes da experiência de resultado foram centralizados em `docs/Sprint-resultados.md`. As regras de visibilidade permanecem preservadas: `show_answer_key_on_finish` controla os detalhes por questão e `show_teacher_comment` controla os comentários do professor.

## Correção — tentativa vencida piscando e autoenvio repetido (2026-06-18)

Na execução real do aluno, uma tentativa `in_progress` com `expires_at` vencido era retomada em `00:00`. O cliente acionava o envio automático, mas a API recusava por haver questões em branco; em seguida, o cliente voltava para a prova e repetia o envio, causando piscadas e a faixa recorrente "Enviando suas respostas...".

Correção aplicada:
- o cliente envia `auto_submission: true` quando o tempo termina;
- o endpoint de submit permite questões em branco apenas nesse autoenvio, contabilizando-as normalmente como brancas;
- foi adicionada trava local para o autoenvio ocorrer uma única vez por tentativa;
- a regra de bloqueio de questões em branco permanece intacta na finalização manual.

## Correção — botão Printar na edição e carregamento de perfil no F5 (2026-06-20)

Na tela `/simulados/[id]/editar`, o botão **Printar** do card **Ações Rápidas** deve permanecer visualmente ativo e coerente com o tema dark premium. Ele abre diretamente o modo de captura para slide em `/simulados/[id]/print?popup=1&mode=slide&question=1`.

Padrão visual aprovado:
- fundo dark translúcido com presença laranja discreta;
- borda laranja visível;
- texto e ícone em tom claro;
- hover mais luminoso;
- nunca usar aparência de botão desabilitado quando a ação estiver disponível.

Também foi corrigido o flash da tela **“Não foi possível carregar seu perfil”** ao atualizar uma página autenticada. O evento inicial do Supabase podia encerrar o estado global de carregamento antes de `profiles` terminar de carregar. O `AuthContext` agora mantém `loading=true` até a leitura do perfil terminar, evitando que o `AppShell` renderize o estado de erro durante um único frame.

Arquivos relacionados:
- `app/simulados/[id]/editar/page-client.tsx`
- `app/contexts/AuthContext.tsx`

## Atualização — captura para slide adaptativa (2026-06-20)

O modo `/simulados/[id]/print?mode=slide` passou a adaptar automaticamente largura, tipografia e espaçamento conforme o volume real de conteúdo da questão.

- Questões pequenas usam fonte maior, mais respiro e composição vertical centralizada.
- Questões médias preservam o padrão visual já aprovado para os slides.
- Questões grandes usam largura máxima de `1652px`, equivalente a 40% acima da largura padrão de `1180px`, com espaçamento vertical reduzido e rolagem quando necessário.
- A classificação considera enunciado, alternativas, maior alternativa, quebras de linha/parágrafo e itens romanos.
- A adaptação não altera conteúdo, ordem, gabarito nem HTML estrutural; parágrafos e afirmativas permanecem preservados.

---

## Ajuste — Modo Printar com posição fixa e fonte única real — 2026-06-21

O modo **Captura para slide** foi ajustado para preservar o comportamento adaptativo criado para questões pequenas, médias e grandes sem deixar cada questão aparecer em uma altura diferente da tela.

### Regras consolidadas

- O estágio do modo slide ocupa a altura útil fixa da viewport.
- A página não deve ter rolagem global no modo slide; questões grandes rolam apenas dentro do próprio bloco da questão.
- A fonte do modo Printar é `Aptos, "Aptos Display", Arial, Helvetica, sans-serif`.
- Cada questão possui um único tamanho de fonte para enunciado e alternativas.
- Tags e estilos internos do HTML rico devem herdar fonte, tamanho, altura de linha e cor do bloco principal.
- As letras das alternativas ficam em negrito, mas não maiores.
- O modo contínuo não foi alterado.

### Escala vigente

- Questão pequena: `27px`.
- Questão média: `26px`.
- Questão grande: `24px`.

---

## Atualização 2026-06-21 — Printar: ocupação máxima por fonte

No modo `/simulados/[id]/print?mode=slide`, a captura para slide deve priorizar ocupar o máximo possível da área útil antes de o usuário colar a imagem no PowerPoint.

Regras consolidadas:

- A largura aprovada para questões pequenas/médias é preservada em `1180px`.
- Quando houver folga vertical, a questão cresce prioritariamente pelo tamanho da fonte, não pela largura.
- Enunciado e alternativas continuam usando uma fonte única dentro da mesma questão.
- A fonte oficial permanece `Aptos, "Aptos Display", Arial, Helvetica, sans-serif`.
- Estilos internos do HTML rico, inclusive `style`, são removidos/neutralizados no modo printar para evitar fonte, cor ou opacidade divergente.
- Questões pequenas usam fonte maior e centralização vertical para não ficarem perdidas no slide.
- Questões médias usam fonte maior que a versão anterior para preencher melhor a altura útil sem mexer na largura aprovada.
- Questões grandes mantêm largura expandida e compactação vertical, com rolagem interna quando necessário.

---

## Atualização 2026-06-21 — Printar: medição real substitui fontes fixas

Os valores fixos de fonte por categoria (pequena `37px`, média `31px`, grande `25px`) foram substituídos por um ajuste client-side que mede a altura real do conteúdo renderizado.

Novo componente: `app/simulados/[id]/print/PrintSlideScaler.tsx`.

Como funciona:
- A categoria (`small`/`medium`/`large`, calculada por `getSlideQuestionSize`) continua definindo apenas largura, padding e limites de fonte — não mais um valor fixo de fonte.
- Limites por categoria: pequena `26px`–`42px`, média `24px`–`60px`, grande `20px`–`30px`. Apenas o teto da categoria média mudou (de `36px` para `60px`) — era o único caso real onde a busca binária batia no teto antes de preencher a altura útil, deixando sobra de espaço vazio simétrico (centralizado) no slide. Pequena e grande já ocupavam bem a área útil e não precisaram de ajuste.
- O componente mede a altura do bloco de enunciado + imagem + alternativas e busca, por busca binária, o maior tamanho de fonte que cabe na altura útil disponível dentro do `article` da questão.
- Se nem o mínimo couber, assume o mínimo e deixa a rolagem interna already existente cobrir o excesso (sem inventar rolagem nova).
- O espaçamento entre alternativas passou a usar `em` (relativo à fonte calculada), então compacta automaticamente em questões grandes e abre mais respiro em pequenas, sem lógica extra.
- O cabeçalho de metadados (`Questão X de Y`, assunto, pontuação) ficou fora do componente de medição e sempre ancorado no topo do `article`.
- O modo "Lista contínua" não foi alterado — continua sem `PrintSlideScaler`.

**Padrão definitivo de posição (mesma data):** removida a centralização vertical que existia para pequena/média. Agora todas as categorias usam `justify-start` — o enunciado sempre começa imediatamente abaixo da tag `Questão X de Y`, sem espaço vazio acima, e o texto permanece alinhado à esquerda. Isso garante posição previsível ao navegar entre questões pequenas, médias e grandes.

**Retângulo real 16:9 (mesma data):** a largura fixa por categoria (`1180px`/`1652px`) foi removida. Novo componente `app/simulados/[id]/print/PrintSlideFrame.tsx` calcula, a partir do espaço real disponível na janela, o maior retângulo possível com proporção exata `16:9` e centraliza a questão dentro dele. O `article` passa a ser `w-full h-full` desse retângulo, em vez de uma largura fixa em pixels — então questões médias com bastante texto (como a de "Hardware" com 5 alternativas) usam toda a largura disponível em vez de deixar uma faixa em branco à direita quando coladas num slide do PowerPoint. A categoria (`small`/`medium`/`large`) continua controlando apenas padding, metadados, limites de fonte e espaçamento — não mais a largura.

## Atualização — Resultado geral do aluno (dashboard pós-simulado)

Detalhes pedagógicos, faixas de parecer, Corujas, sinais comportamentais e implementação futura da Sprint Resultados foram movidos para `docs/Sprint-resultados.md`.

## Atualização — Tag de Jornada em Meus Simulados do aluno (2026-07-06)

Na rota `/meus-simulados`, os cards dos simulados vinculados a uma Jornada passam a exibir uma tag visual discreta com o nome da Jornada, por exemplo `Jornada PCMG`. A API `/api/student/simulados` foi enriquecida com `jornada_id` e `jornada_title` a partir do vínculo do aluno com `student_jornadas`/`student_jornada_simulados`.

A alteração não muda a regra de visibilidade: a tela `Meus Simulados` continua listando apenas simulados publicados e visíveis ao aluno. O cronograma completo, inclusive simulados programados ainda não publicados, permanece na tela interna da Jornada.

---

## Atualização — Tentativas completas e incompletas no aluno (2026-07-07)

Na área do aluno, a contagem de tentativas foi explicitada para evitar ambiguidade quando uma tentativa foi iniciada, mas não gerou resultado.

### Rotas impactadas

- `/meus-simulados`
- `/minhas-jornadas/[id]`
- `/meus-simulados/[id]` (texto de instruções antes de iniciar)

### Regras consolidadas

- O contador principal continua exibindo tentativas usadas sobre o limite total: `1/3`, `2/3` etc.
- A interface agora separa as tentativas usadas em:
  - **Concluídas**: tentativas com `status = "completed"` e `counts_toward_limit = true`.
  - **Incompletas**: tentativas contabilizadas no limite (`counts_toward_limit = true`) que não estão concluídas.
- Tentativas incompletas não geram resultado para revisão, mas continuam contando como tentativa utilizada.
- Um ícone de ajuda abre modal explicativo informando que, ao iniciar o simulado, a tentativa é registrada e, mesmo que não seja concluída, **é contabilizada** dentro do limite de tentativas.
- A tela de instruções do simulado reforça a mesma regra antes de o aluno iniciar.

### Arquivos impactados

- `app/api/student/simulados/route.ts`
- `app/api/student/jornadas/[id]/route.ts`
- `app/meus-simulados/page-client.tsx`
- `app/minhas-jornadas/[id]/page-client.tsx`
- `app/meus-simulados/[id]/page-client.tsx`

Nenhuma migration foi criada ou alterada.

## Correção — Caderno de anotações lateral durante o simulado — 2026-07-15

- **Problema:** na execução do simulado (`/meus-simulados/[id]`), o `NotesPanel` abria como modal/overlay (`fixed inset-0 z-50`, `backdrop-blur-sm`, fundo `bg-slate-950/30`), desfocando a prova e cobrindo a questão — impedindo consultar enunciado/alternativas enquanto anotava.
- **Correção (UX/layout apenas):** no desktop, o `NotesPanel` virou painel expansível dentro da coluna lateral direita, abaixo dos cards **Mapa da prova** e **Modo foco**. Sem overlay, blur ou `fixed inset-0`; não cobre nem empurra questão, alternativas ou navegação. Em telas estreitas, aparece como bloco recolhível no fluxo responsivo, pois não existe coluna lateral.
- O antigo botão flutuante foi substituído por um card premium **Caderno**, com ícone, seta de estado e animação discreta. O painel limita a própria altura e usa rolagem interna; também fecha pelo X e pelo botão "Fechar anotações". "Salvar" mantém o painel aberto com feedback "Anotações salvas".
- **Preservado:** carregamento e salvamento das anotações (`GET/PUT /api/student/simulados/[id]/notes`), associação por aluno/simulado, timer, respostas, navegação, tesourinha, anti-cheat — nada disso foi tocado.
- **Arquivo:** `app/meus-simulados/[id]/page-client.tsx` (componente `NotesPanel`, local a essa tela). Nenhuma migration; nenhuma alteração de banco/API.
