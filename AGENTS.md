<!-- BEGIN:nextjs-agent-rules -->

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
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# EstudoTOP Simulados — Agent Rules

Este arquivo é a lei compartilhada para todos os agentes de IA que trabalham neste repositório.
Claude Code e qualquer outro agente devem ler e seguir estas regras antes de escrever qualquer código.

---

## Stack

| Camada | Tecnologia | Versão |
|---|---|---|
| Framework | Next.js (App Router) | 16.2.4 |
| Linguagem | TypeScript | 5 |
| UI | React | 19.2.4 |
| Estilização | Tailwind CSS | 4 |
| Banco / Auth | Supabase (PostgreSQL + RLS) | 2.x |
| Ícones | lucide-react | ^1.14.0 |
| Animações | framer-motion | ^12.38.0 |
| IA | openai SDK | ^6.36.0 |
| E-mail | resend | ^6.12.2 |
| PDF | @react-pdf/renderer | ^4.5.1 |
| Testes | Playwright | ^1.56.1 |

---

## Estrutura de Arquivos

### Páginas

Toda rota segue o padrão de dois arquivos:

- `page.tsx` — **Apenas Server Component.** Busca dados com `createSupabaseAdminClient`. Passa dados como props. Sem `"use client"`, sem state, sem hooks.
- `page-client.tsx` — **Client Component.** Começa com `"use client"`. Toda lógica de UI, estado e interações do usuário vivem aqui.

### Rotas de API

Todas as rotas de API admin ficam em `app/api/admin/`.
Todas as rotas de API do aluno ficam em `app/api/student/`.

Cada arquivo exporta métodos HTTP nomeados: `GET`, `POST`, `PATCH`, `DELETE`.

Sempre retornar `NextResponse.json({ ok: boolean, message: string, ...data })`.

Usar códigos HTTP corretos: `200`, `201`, `400`, `404`, `500`.

### Types e Utilitários

Módulos com complexidade suficiente ganham:

- `types.ts` — Tipos TypeScript para aquele módulo (ex: `app/simulados/types.ts`).
- `utils.ts` — Funções puras sem side effects (ex: `app/simulados/utils.ts`).

### Clientes Supabase

- **Browser:** `import { supabase } from "@/lib/supabase/client"` — usar em Client Components.
- **Server:** `import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin"` — usar em Server Components e rotas de API. Nunca importar em arquivos `"use client"`.

### Aliases de Path

Use `@/` para `app/`. Exemplo: `@/components/ui/PremiumButton`.
Configurado em `tsconfig.json`: `"@/*" → "./*"`.

---

## Mapa Completo de Rotas

### Autenticação / Acesso
| Rota | Arquivos | Descrição |
|---|---|---|
| `/login` | page.tsx | Login com redirecionamento por role (admin/aluno) |
| `/esqueci-senha` | page.tsx | Solicitação de redefinição de senha |
| `/redefinir-senha` | page.tsx | Formulário para redefinir senha via link de e-mail |
| `/alterar-senha` | page.tsx | Alteração de senha forçada (primeiro acesso) |

### Área do Aluno
| Rota | Arquivos | Descrição |
|---|---|---|
| `/aluno` | page.tsx | Dashboard do aluno com resumo de desempenho |
| `/meus-simulados` | page.tsx + page-client.tsx | Lista de simulados disponíveis para o aluno |
| `/meus-simulados/[id]` | page.tsx + page-client.tsx | Tela de simulado: iniciar, responder e finalizar |
| `/meus-simulados/[id]/resultado` | page.tsx + page-client.tsx | Resultado consolidado da tentativa |

### Painel Admin — Simulados
| Rota | Arquivos | Descrição |
|---|---|---|
| `/simulados` | page.tsx + page-client.tsx | Listagem com filtros (status, disciplina, busca) |
| `/simulados/novo` | page.tsx + page-client.tsx | Formulário de criação de simulado |
| `/simulados/[id]` | page.tsx | Visualização admin do simulado |
| `/simulados/[id]/editar` | page.tsx + page-client.tsx | Edição completa: configurações + banco de questões |
| `/simulados/[id]/preview` | page.tsx + page-client.tsx | Preview funcional sem criar tentativa real |

### Painel Admin — Questões
| Rota | Arquivos | Descrição |
|---|---|---|
| `/questoes` | page.tsx + page-client.tsx | Banco master com filtros, edição inline, ações em lote |
| `/questoes/nova` | page.tsx + page-client.tsx | Criação manual de questão |
| `/questoes/importar` | page.tsx + page-client.tsx | Importação em lote (análise por IA) |
| `/questoes/gerar-ia` | page.tsx + page-client.tsx | Geração de questões por IA (OpenAI) |
| `/questoes/revisar` | page.tsx + page-client.tsx | Revisão de questões pendentes com navegação questão a questão |
| `/questoes/duplicatas` | page.tsx + page-client.tsx | Detecção e resolução de questões duplicadas |
| `/questoes/[id]/editar` | page.tsx + page-client.tsx | Edição completa de questão individual |
| `/questoes/[id]/preview` | page.tsx + page-client.tsx | Preview da questão isolada |

### Painel Admin — Gestão
| Rota | Arquivos | Descrição |
|---|---|---|
| `/` (home) | page.tsx | Dashboard admin com métricas gerais |
| `/alunos` | page.tsx | Listagem de alunos com filtros e ações |
| `/alunos/novo` | page.tsx | Formulário de criação de aluno |
| `/alunos/[id]` | page.tsx | Detalhes e gestão do aluno |
| `/assuntos` | page.tsx + page-client.tsx | CRUD de assuntos vinculados a disciplinas |
| `/assuntos/importar` | page.tsx + page-client.tsx | Importação em lote de assuntos |
| `/disciplinas` | page.tsx + page-client.tsx | CRUD de disciplinas |
| `/bancas` | page.tsx + page-client.tsx | CRUD de bancas examinadoras |
| `/bancas/importar` | page.tsx + page-client.tsx | Importação em lote de bancas |

---

## Mapa Completo de APIs

### Admin — Simulados
| Endpoint | Métodos | Descrição |
|---|---|---|
| `/api/admin/simulados` | GET, POST | Listar / criar simulado |
| `/api/admin/simulados/[id]` | GET, PATCH, DELETE | Ler / atualizar / excluir simulado |
| `/api/admin/simulados/[id]/questions` | GET, POST, DELETE | Listar / vincular / remover questão do simulado |
| `/api/admin/simulados/[id]/questions/reorder` | PATCH | Reordenar questões do simulado |

### Admin — Questões
| Endpoint | Métodos | Descrição |
|---|---|---|
| `/api/admin/questions` | GET, POST, DELETE | Listar / criar / excluir questão |
| `/api/admin/questions/bulk` | PATCH, DELETE | Operações em lote (status, exclusão) |
| `/api/admin/questions/[id]` | GET, PATCH, DELETE | Ler / atualizar / excluir questão individual |
| `/api/admin/questions/[id]/answer` | PATCH | Atualizar gabarito da questão |
| `/api/admin/questions/[id]/difficulty` | PATCH | Atualizar nível de dificuldade |
| `/api/admin/questions/check-duplicate` | POST | Verificar se questão é duplicata |
| `/api/admin/questions/duplicates` | GET | Listar todos os pares de duplicatas |
| `/api/admin/questions/explain` | POST | Gerar explicação por IA (OpenAI) |
| `/api/admin/questions/generate-ai` | POST | Gerar nova questão por IA |
| `/api/admin/questions/import/analyze` | POST | Analisar questão para importação |
| `/api/admin/questions/import/analyze-batch` | POST | Análise em lote para importação |
| `/api/admin/questions/import/save` | POST | Salvar questões importadas |
| `/api/admin/questions/review-comment` | POST | Adicionar comentário de revisão |
| `/api/admin/questions/classify-difficulty` | POST | Classificar dificuldade em lote por IA |

### Admin — Taxonomia
| Endpoint | Métodos | Descrição |
|---|---|---|
| `/api/admin/disciplines` | GET, POST | CRUD de disciplinas |
| `/api/admin/subjects` | GET, POST | CRUD de assuntos |
| `/api/admin/subjects/bulk` | POST | Importação em lote de assuntos |
| `/api/admin/exam-boards` | GET, POST | CRUD de bancas |
| `/api/admin/exam-boards/bulk` | POST | Importação em lote de bancas |
| `/api/admin/exam-boards/search` | GET | Busca de bancas por nome |

### Admin — Alunos
| Endpoint | Métodos | Descrição |
|---|---|---|
| `/api/admin/students/create` | POST | Criar aluno (cria conta Supabase Auth + perfil) |
| `/api/admin/students/resend-welcome` | POST | Reenviar e-mail de boas-vindas |

### Student — Simulados e Tentativas
| Endpoint | Métodos | Descrição |
|---|---|---|
| `/api/student/simulados` | GET | Listar simulados publicados disponíveis |
| `/api/student/simulados/[id]` | GET | Detalhes do simulado para o aluno |
| `/api/student/simulados/[id]/attempts` | GET, POST | Listar / iniciar tentativa |
| `/api/student/simulados/[id]/attempts/[attemptId]/answers` | GET, POST | Registrar / consultar respostas |
| `/api/student/simulados/[id]/attempts/[attemptId]/submit` | POST | Finalizar tentativa e calcular resultado |
| `/api/student/simulados/[id]/attempts/[attemptId]/focus-violation` | POST | Registrar troca de aba / violação de foco |
| `/api/student/simulados/[id]/feedback` | GET | Feedback da tentativa finalizada |
| `/api/student/simulados/[id]/resultado` | GET | Resultado consolidado com desempenho por assunto |

---

## Componentes de UI

### Obrigatórios — use sempre estes, nunca crie alternativas

| Componente | Caminho | Quando usar |
|---|---|---|
| `PremiumButton` | `@/components/ui/PremiumButton` | Todos os botões |
| `PremiumInput` | `@/components/ui/PremiumInput` | Todos os inputs de texto |
| `PremiumSelect` | `@/components/ui/PremiumSelect` | Todos os selects |
| `PremiumCard` | `@/components/ui/PremiumCard` | Cards de conteúdo |
| `PremiumTable` | `@/components/ui/PremiumTable` | Tabelas de dados |
| `PremiumModal` | `@/components/ui/PremiumModal` | Modais de feedback (success/error/warning) |
| `PremiumLoadingOverlay` | `@/components/ui/PremiumLoadingOverlay` | Estados de carregamento |
| `PageHeader` | `@/components/ui/PageHeader` | Cabeçalhos de página (eyebrow + título + descrição + ação) |
| `PageBackground` | `@/components/ui/PageBackground` | Wrapper de fundo de página |
| `MetricCard` | `@/components/ui/MetricCard` | Cards de métricas com ícone + valor |
| `SelectionGhostBar` | `@/components/ui/SelectionGhostBar` | Barra flutuante de ações em seleção múltipla |
| `DraftRestoreModal` | `@/components/ui/DraftRestoreModal` | Modal para restaurar rascunho salvo |

### Componentes de Questões

| Componente | Caminho | Quando usar |
|---|---|---|
| `RichTextEditor` | `@/components/questions/RichTextEditor` | Editor de enunciado e alternativas |
| `SubjectMultiSelect` | `@/components/questions/SubjectMultiSelect` | Seleção múltipla de assuntos |
| `QuestionTemplatePicker` | `@/components/questions/QuestionTemplatePicker` | Seletor de template de questão |
| `QuestionActionModal` | `@/components/questions/QuestionActionModal` | Modal de ações (avisos, confirmações) |
| `NewQuestionModal` | `@/components/questions/NewQuestionModal` | Modal rápido de criação |
| `ExplanationAuthorCard` | `@/components/questions/ExplanationAuthorCard` | Rodapé de autoria da explicação (admin) |
| `StudentExplanationAuthorCard` | `@/components/questions/StudentExplanationAuthorCard` | Rodapé de autoria (aluno) |

### Componentes de Layout

| Componente | Caminho | Descrição |
|---|---|---|
| `AppShell` | `@/components/AppShell` | Wrapper geral (sidebar + header + main) |
| `Header` | `@/components/Header` | Header com menu de usuário |
| `Sidebar` | `@/components/Sidebar` | Navegação lateral (desktop) |
| `MobileSidebar` | `@/components/MobileSidebar` | Navegação lateral (mobile, drawer) |

### Componentes de Módulo

Componentes exclusivos do módulo de simulados ficam em `app/simulados/components/`.
Não criar novos componentes compartilhados sem instrução explícita.

---

## Design System — Design Tokens de Questão

O arquivo `lib/ui/question-tokens.ts` é a fonte de verdade para o visual de cards de questão.
**Referência visual:** `/simulados/[id]/preview` é a página mais premium do sistema — use como referência.

### Usar `qCard` de `@/lib/ui/question-tokens` para:

| Token | Descrição |
|---|---|
| `qCard.wrapper` | Card externo: borda clara, ring, hover suave |
| `qCard.padding` | Padding interno padrão `p-6 md:p-8` |
| `qCard.tags.row` | Container das tags/chips no topo |
| `qCard.tags.primary` | Chip escuro — número/código da questão |
| `qCard.tags.neutral` | Chip neutro — assunto, ano, disciplina |
| `qCard.tags.brand` | Chip laranja — banca, categoria |
| `qCard.tags.success` | Chip verde — pontos, gabarito |
| `qCard.tags.warning` | Chip âmbar — anulada, pendente |
| `qCard.tags.info` | Chip azul — fila de publicação |
| `qCard.tags.muted` | Chip cinza — arquivado, sem dado |
| `qCard.statement` | Enunciado: prose limpo, sem caixa |
| `qCard.alts.block` | Container das alternativas |
| `qCard.alts.base` | Alternativa neutra (hover laranja) |
| `qCard.alts.selected` | Alternativa selecionada (laranja) |
| `qCard.alts.correct` | Alternativa correta (verde) |
| `qCard.alts.wrong` | Alternativa errada (vermelho) |
| `qCard.alts.labelBase` | Bolinha com letra — neutra |
| `qCard.alts.labelSelected` | Bolinha com letra — selecionada |
| `qCard.alts.labelCorrect` | Bolinha com letra — correta |
| `qCard.alts.labelWrong` | Bolinha com letra — errada |
| `qCard.teacherComment` | Box do comentário do professor |
| `qCard.footer` | Rodapé de ações (com sangria automática) |
| `qNavigator.wrapper` | Card do navegador de paginação |
| `qNavigator.dotCurrent` | Bolinha — questão atual |
| `qNavigator.dotAnswered` | Bolinha — respondida |
| `qNavigator.dotUnanswered` | Bolinha — não respondida |
| `qNavigator.btnPrev` | Botão "Anterior" |
| `qNavigator.btnNext` | Botão "Próxima / Finalizar" |

### Padrão de alternativas (estrutura obrigatória)

```tsx
<div className={qCard.alts.block}>
  {alternatives.map((alt, index) => (
    <div key={alt.id} className={alt.is_correct ? qCard.alts.correct : qCard.alts.base}>
      <span className={alt.is_correct ? qCard.alts.labelCorrect : qCard.alts.labelBase}>
        {alt.label || String(index + 1)}
      </span>
      <div
        className={`${qCard.alts.text} min-w-0 flex-1`}
        dangerouslySetInnerHTML={{ __html: alt.text }}
      />
    </div>
  ))}
</div>
```

A letra fica **dentro** da bolinha (`labelBase/labelCorrect`). Não use o padrão `A)` como prefixo de texto.

---

## Styling

Use apenas classes Tailwind CSS. Sem inline styles. Sem CSS modules. Sem styled-components.

O arquivo `app/globals.css` contém:
- Variáveis de tema Tailwind
- Keyframe `modalIn` (usado pela classe `.animate-modal-in`)
- Reset e base styles

---

## Banco de Dados

### Migrações

- Todas as migrações ficam em `migrations/` (na raiz) ou `supabase/migrations/`.
- Nomenclatura: `YYYYMMDDHHMMSS_descricao_curta.sql`.
- Toda migração deve ser encapsulada em `begin; ... commit;`.
- Nunca alterar ou excluir migrações existentes. Sempre adicionar uma nova.
- Usar `create table if not exists`, `create index if not exists`, `create or replace function`.

### Tabelas Principais

#### `simulados`
Configuração completa do simulado: título, status, regras de tempo, tentativas, pontuação, feedback, navegação.

Colunas chave: `id`, `title`, `status` (`draft|published|archived`), `scoring_model` (`traditional|cebraspe`), `navigation_type` (`open|closed`), `question_count`, `time_limit_minutes`, `feedback_mode` (`instant|final_only`), `shuffle_questions`, `shuffle_alternatives`, `allow_blank_answers`.

#### `simulado_questions`
Vínculo entre simulado e questão. Colunas: `id`, `simulado_id`, `question_id`, `order_number`, `points`, `status` (`active|annulled`).

#### `simulado_attempts`
Tentativa do aluno. Colunas: `id`, `simulado_id`, `student_id`, `attempt_number`, `status` (`in_progress|completed|disqualified|expired|abandoned`), `answered_count`, `total_questions`, `progress_percent`, `started_at`, `submitted_at`, `expires_at`, `tab_switch_count`, `focus_violation_count`, `question_order` (JSONB), `settings_snapshot` (JSONB).

Índice único parcial: apenas um `in_progress` por `(simulado_id, student_id)`.

#### `simulado_answers`
Resposta por questão. Colunas: `id`, `attempt_id`, `question_id`, `simulado_question_id`, `selected_alternative_id`, `is_correct`, `is_locked`, `response_time_seconds`, `changed_count`, `alternative_order`.

#### `simulado_results`
Resultado calculado. Colunas: `attempt_id`, `simulado_id`, `student_id`, `total_questions`, `correct_count`, `wrong_count`, `blank_count`, `annulled_count`, `score`, `display_score`, `percentage`, `scoring_model`, `time_spent_seconds`, `result_snapshot` (JSONB).

#### `simulado_feedbacks`
Avaliação do aluno. Colunas: `simulado_id`, `student_id`, `attempt_id`, `rating` (1–5), `comment`.

#### `profiles`
Dados do usuário. Colunas: `id` (= `auth.users.id`), `full_name`, `role` (`admin|student`), `is_active`, `must_change_password`.

#### `questions`
Questão do banco. Colunas: `id`, `code`, `statement`, `explanation_text`, `status` (`draft|pending_review|ready_to_publish|published|archived`), `question_type` (`multiple_choice|true_false`), `difficulty_level` (1–5), `year`, `exam_board_id`, `subject_id`, `image_url`.

#### `question_alternatives`
Alternativas. Colunas: `id`, `question_id`, `label`, `text`, `is_correct`, `order_number`, `image_url`.

### Convenções de Nomenclatura

- Tabelas: `snake_case`, plural (`simulados`, `simulado_questions`).
- Colunas: `snake_case`.
- Índices: `idx_tablename_columnname`.
- Índices únicos: `unique_tablename_descricao`.
- Constraints: `tablename_columnname_check`.
- Triggers: `trg_tablename_evento`.

### IDs

Todas as chaves primárias são `uuid`, geradas com `gen_random_uuid()`.

### Timestamps

Toda tabela tem `created_at timestamptz not null default now()` e `updated_at timestamptz not null default now()`.
`updated_at` é mantido por trigger usando `public.set_updated_at()`.

---

## Regras de Domínio

- `time_limit_minutes = null` → sem limite de tempo.
- Jornada/Evento definem `max_attempts >= 1`, default 3; o Simulado não define limite de tentativas (schema remoto confirmado; migration não executada pelo agente).
- Uma tentativa só conta para o limite quando `answered_count / total_questions > 0.5`.
- Pode haver no máximo uma tentativa `in_progress` por aluno por simulado (índice único parcial).
- O modo preview nunca grava em `simulado_attempts`, `simulado_answers` ou `simulado_results`.
- A correção usa o `id` da alternativa quando ele resolve para uma alternativa atual; nunca a posição visual. Para reprocessamento retroativo (dias/semanas depois, possivelmente após a questão ter sido editada — o que apaga e recria `question_alternatives` com novos UUIDs), o `label` (A/B/C/D/E) é o identificador estável usado como critério — ver `lib/simuladoScoring.ts`.
- `simulado_results` armazena `result_snapshot` (JSONB) para que **edições editoriais comuns** (enunciado, comentário, explicação, formatação, assunto, banca, órgão) nunca alterem resultados históricos. Há três exceções pedagógicas que **propagam e recalculam deliberadamente**: alteração de gabarito, anulação de questão no Simulado e desanulação — ver `lib/server/simuladoQuestionReprocessing.ts` e a matriz em `docs/Sprint-resultados.md`. O reprocessamento nunca soma/subtrai em cima do resultado anterior: sempre reconstrói do zero a partir da resposta originalmente selecionada + gabarito/status vigentes, o que impede dupla bonificação mesmo depois de uma correção manual de dados.
- Simulados não têm coluna `jornada_id`. A associação a jornadas usa a futura tabela `jornada_simulados`.
- `navigation_type = 'open'` → aluno navega livremente, confirma tudo ao final. `'closed'` → confirma cada resposta antes de avançar.

---

## Regras de Codificação

1. **Não refatorar código não solicitado.** Corrigir apenas o que foi pedido.
2. **Não criar abstrações, helpers ou camadas extras** além do necessário.
3. **Não adicionar comentários** a menos que o motivo seja não óbvio para qualquer leitor.
4. **Não criar novos arquivos** sem instrução explícita.
5. **Não modificar migrações existentes.** Adicionar novas.
6. **Não inventar funcionalidades** não descritas neste documento.
7. **Não usar `any` em TypeScript** sem necessidade — ao usar, suprimir com `// eslint-disable-next-line @typescript-eslint/no-explicit-any` na linha acima.
8. **Não criar arquivos de documentação** (`.md`, `.txt`) sem solicitação explícita.
9. **Validar apenas em fronteiras de API.** Não adicionar validação defensiva em funções internas.
10. **Respostas de API sempre usam `{ ok: boolean, message: string }`.** Nunca expor erros brutos ao cliente.

---

## Estado Atual do Projeto

### Concluído

- [x] Tabela `simulados` + índices.
- [x] Tabela `simulado_questions` + índices.
- [x] Tabela `simulado_attempts` + índices + unique parcial.
- [x] Tabela `simulado_answers` + índices.
- [x] Tabela `simulado_results` + índices.
- [x] Tabela `simulado_feedbacks` + índices.
- [x] Campo `navigation_type` em `simulados` (`open|closed`).
- [x] API completa de simulados (CRUD + questões + reordenação).
- [x] API completa de questões (CRUD + bulk + IA + duplicatas + importação).
- [x] API de alunos (criar + reenviar e-mail).
- [x] API student: simulados disponíveis, tentativas, respostas, submit, resultado.
- [x] Página `/simulados` — listagem premium com filtros.
- [x] Página `/simulados/novo` — formulário de criação.
- [x] Página `/simulados/[id]` — detalhe admin.
- [x] Página `/simulados/[id]/editar` — edição + banco de questões.
- [x] Página `/simulados/[id]/preview` — preview funcional (referência visual premium).
- [x] Página `/questoes` — banco master com filtros, edição inline, ações em lote.
- [x] Página `/questoes/revisar` — revisão de questões pendentes.
- [x] Página `/questoes/duplicatas` — detecção e resolução de duplicatas.
- [x] Página `/questoes/importar` — importação com análise por IA.
- [x] Página `/questoes/gerar-ia` — geração por IA.
- [x] Página `/questoes/[id]/editar` — edição completa.
- [x] Página `/meus-simulados` — listagem do aluno.
- [x] Página `/meus-simulados/[id]` — fazer simulado (timer, navegação, respostas).
- [x] Página `/meus-simulados/[id]/resultado` — resultado consolidado.
- [x] Página `/alunos` + `/alunos/novo` + `/alunos/[id]` — gestão de alunos.
- [x] Páginas de taxonomia: `/disciplinas`, `/assuntos`, `/bancas` (CRUD + importação).
- [x] Design tokens em `lib/ui/question-tokens.ts` — padrão visual de cards de questão.
- [x] AuthContext com `useAuth()` — sessão, perfil, role, redirecionamento.
- [x] AppShell com sidebar responsiva (desktop + mobile drawer).
- [x] Módulo de Jornadas completo (admin + área do aluno) — ver índice seção 9.
- [x] Central de Ajuda (mensagens aluno ↔ admin) — botão "Ajuda" no menu do aluno, painel `/admin/ajuda` — ver índice seção 21.
- [x] Página `/meus-resultados` — lista de simulados concluídos com link para o resultado — ver índice seção 22.
- [x] Redesenho do menu superior da área do aluno (header institucional dark premium) + fonte Open Sans unificada — ver índice seção 9.5.
- [x] Redesenho de `/minhas-anotacoes` — caderno premium com abas por simulado, editor rico, notas numeradas automaticamente — ver índice seção 8.

### Pendente / Próximos Passos

- [ ] Aplicar `qCard` tokens em todas as páginas que exibem questões (revisar, importar, gerar-ia, editar).
- [ ] Página `/simulados/estatisticas` — ligada no botão do header de simulados.
- [ ] Testes Playwright: expandir cobertura além de registrations, question-bank, import-ai.

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
