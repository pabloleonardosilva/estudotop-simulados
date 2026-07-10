<!-- BEGIN:nextjs-agent-rules -->
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

Colunas chave: `id`, `title`, `status` (`draft|published|archived`), `scoring_model` (`traditional|cebraspe`), `navigation_type` (`open|closed`), `question_count`, `time_limit_minutes`, `max_attempts`, `feedback_mode` (`instant|final_only`), `shuffle_questions`, `shuffle_alternatives`, `allow_blank_answers`.

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
- `max_attempts = null` → tentativas ilimitadas.
- Uma tentativa só conta para o limite quando `answered_count / total_questions > 0.5`.
- Pode haver no máximo uma tentativa `in_progress` por aluno por simulado (índice único parcial).
- O modo preview nunca grava em `simulado_attempts`, `simulado_answers` ou `simulado_results`.
- A correção usa o `id` da alternativa, nunca sua posição visual ou label.
- `simulado_results` armazena `result_snapshot` (JSONB) para que edições futuras nas questões não alterem resultados históricos.
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
