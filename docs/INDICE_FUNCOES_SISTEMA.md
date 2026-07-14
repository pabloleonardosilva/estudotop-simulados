# ARQUIVO MESTRE — ÍNDICE DE FUNÇÕES E DEPENDÊNCIAS

**Projeto:** EstudoTOP Simulados  
**Arquivo:** `docs/INDICE_FUNCOES_SISTEMA.md`  
**Status:** versão inicial — mapa funcional para manutenção  
**Objetivo:** orientar qualquer alteração futura no sistema, indicando onde cada função aparece, quais arquivos são impactados, quais regras devem ser preservadas e quais áreas precisam ser testadas.

---

## 0. REGRA OFICIAL DE MANUTENÇÃO

Antes de alterar qualquer recurso do sistema:

1. Consultar este índice.
2. Identificar todas as telas, componentes e APIs relacionadas ao recurso.
3. Alterar somente os arquivos necessários.
4. Evitar corrigir uma tela isolada quando o mesmo comportamento existe em outras telas.
5. Validar a sintaxe e o pacote final.
6. Atualizar este arquivo sempre que uma função for criada, alterada, removida, movida ou padronizada.
7. Sempre que for enviado um ZIP com alterações no sistema, enviar também a pasta `docs/` com este arquivo atualizado.

Regra prática:

> Se uma função aparece em mais de uma tela, ela deve ser tratada como função compartilhada, mesmo que hoje esteja duplicada no código.

---

## 0.1 GOVERNANÇA TÉCNICA OFICIAL

**Função:** definir as normas permanentes para desenvolvimento, documentação, versionamento, banco de dados, assets, Sprints e deploy do EstudoTOP Simulados.

**Diretório oficial:** `docs/`

**Regra de precedência:** em caso de conflito entre instruções antigas, documentos de Sprint, práticas informais ou histórico de conversas, prevalece `docs/00-CONSTITUICAO-TECNICA.md` e, em seguida, a política especializada aplicável.

### Documentos oficiais

| Documento | Função |
|---|---|
| `docs/00-CONSTITUICAO-TECNICA.md` | Autoridade máxima da governança técnica; define princípios, fontes oficiais e o Estado Oficial do Projeto. |
| `docs/01-POLITICA-GIT.md` | Regras oficiais de versionamento para alterações por ZIP, Codex e Claude Code, incluindo commit, push e rastreabilidade. |
| `docs/02-POLITICA-MIGRATIONS.md` | Normas para banco e migrations; define `supabase/migrations/` como único diretório oficial para novas migrations. |
| `docs/03-POLITICA-ASSETS.md` | Organização dos recursos visuais; define `public/` como única estrutura oficial de assets usados em runtime. |
| `docs/04-POLITICA-DESENVOLVIMENTO.md` | Fluxo oficial de desenvolvimento, incluindo as 10 etapas obrigatórias de toda Sprint e a regra de alterações cirúrgicas. |
| `docs/05-POLITICA-DOCUMENTACAO.md` | Normas para criação, atualização e organização da documentação técnica e do índice funcional. |
| `docs/06-POLITICA-DEPLOY.md` | Processo oficial de homologação, publicação, segurança, monitoramento e rollback. |
| `docs/07-CHECKLIST-SPRINT.md` | Checklist obrigatório para encerramento de qualquer Sprint. |
| `docs/08-CHECKLIST-DEPLOY.md` | Checklist obrigatório antes, durante e depois de qualquer deploy. |

### Fontes oficiais consolidadas

- **Código:** raiz oficial do projeto em `Sistema/`.
- **Assets públicos:** `public/`.
- **Novas migrations:** `supabase/migrations/`.
- **Documentação:** `docs/`.
- **Índice funcional:** `docs/INDICE_FUNCOES_SISTEMA.md`.
- **Banco operacional:** projeto Supabase atualmente utilizado pelo sistema.

### Regras de manutenção

- Toda pessoa ou ferramenta de IA deve consultar a Constituição, a política especializada e este índice antes de alterar o projeto.
- Documento aprovado permanece estável e só deve ser alterado quando surgir uma mudança permanente na regra correspondente.
- Código e documentação devem evoluir juntos.
- Toda Sprint deve informar explicitamente se criou ou alterou migration.
- Commit, push, migration e deploy exigem os níveis de autorização definidos nas políticas oficiais.

### Consolidações realizadas (2026-07-10)

- O SQL avulso `performance-indexes.sql` (raiz do projeto) foi convertido na migration oficial `supabase/migrations/20260710120000_add_question_performance_indexes.sql` (índices de performance do módulo de questões: listagem administrativa, classify-difficulty e detecção de duplicatas por fingerprint) e removido da raiz. Dois índices de `question_subjects` do arquivo original foram omitidos por redundância com `question_subjects_question_id_idx` e `question_subjects_subject_id_idx`, já existentes no banco operacional. **A migration ainda NÃO foi executada; sua execução depende de autorização explícita (MIG-012).**

### Sprint Segurança do Banco — migrations preparadas (2026-07-10)

Correções dos quatro bloqueadores críticos de segurança identificados na auditoria de produção, preparadas como migrations oficiais em `supabase/migrations/`:

| Migration | Bloqueador corrigido |
|---|---|
| `20260710124000_restrict_admin_update_auth_user_email.sql` | RPC `admin_update_auth_user_email` executável por PUBLIC/anon/authenticated (account takeover); passa a ser exclusiva de `service_role`. A RPC não possui consumidores no código atual — a alteração de e-mail usa `auth.admin.updateUserById`. |
| `20260710124100_protect_exam_contests_and_positions.sql` | Policies `USING true` e grants de anon/authenticated em `exam_contests` e `exam_positions`; tabelas passam a ser acessíveis apenas via service role (APIs `/api/admin/exam-contests` e `/api/admin/exam-positions`, protegidas por `requireAdmin`). |
| `20260710124200_protect_question_alternatives_answer_key.sql` | Exposição pública de `question_alternatives.is_correct` (gabarito); remove a policy pública de SELECT e os grants de anon/authenticated. Nenhum cliente browser consulta a tabela — alternativas chegam ao aluno somente por `/api/student/**`. |

**Atualização 2026-07-10:** as três migrations foram **executadas manualmente no SQL Editor do Supabase** (ordem 124000 → 124100 → 124200) e **revalidadas por SELECT em catálogos**: ACLs finais `{postgres, service_role}` na função e nas três tabelas, policies abertas removidas, policy administrativa `is_admin()` preservada em `question_alternatives`. **Os quatro bloqueadores críticos estão encerrados; banco pronto para preview.** Produção segue pendente de homologação (DEP-003/DEP-012) e dos objetos funcionais ausentes (`student_help_messages`, `profile-avatars`). As versões não constam no ledger `supabase_migrations.schema_migrations` (execução manual não registra; ver `docs/status-atual.md`).

---

## 1. ARQUIVOS GLOBAIS DO SISTEMA

### 1.0.1 Assets públicos estáticos

- `public/` é a única pasta de assets estáticos servida pelo Next.js.
- URLs `/images/...` resolvem arquivos em `public/images/...`.
- URLs `/jornadas/...` resolvem arquivos em `public/jornadas/...`.
- A estrutura incorreta `app/public` foi removida.
- O header específico da tela Nova Jornada fica em `public/jornadas/page/header-bg.webp` e é servido por `/jornadas/page/header-bg.webp`.

### 1.0 Tipografia e escala de fonte (padronizada 2026-06-04)

**Arquivo principal:** `app/globals.css`

**Fonte:** `Arial, Helvetica, sans-serif` em todo o sistema. `--font-sans` no `@theme inline` foi atualizado para Arial (antes apontava para Geist undefined). Nenhuma fonte customizada (Geist, Inter) deve ser usada nas páginas admin.

**Escala tipográfica — hierarquia oficial:**

| Uso | Classe Tailwind | CSS |
|---|---|---|
| H1 de página | `text-2xl font-semibold tracking-tight` | 24px / 600 / -0.6px |
| H2 de seção | `text-lg font-semibold tracking-tight` | 18px / 600 / -0.45px |
| Label uppercase | `text-[10px] font-black tracking-widest uppercase` | 10px / 900 / 1.2px |
| Corpo principal | `text-base font-normal` | 16px / 400 |
| Corpo secundário | `text-sm font-normal` | 14px / 400 |
| Texto auxiliar | `text-xs font-normal` | 12px / 400 |
| Botão primário | `text-sm font-bold` | 14px / 700 |
| Botão secundário | `text-sm font-semibold` | 14px / 600 |
| Valor de destaque | `text-sm font-bold` | 14px / 700 |
| Número de métrica (cards) | `text-3xl font-black` | 30px / 900 (display) |

**Classes utilitárias CSS** (definidas em `globals.css` como `.et-h1`, `.et-h2`, `.et-label`, `.et-btn-primary`, `.et-btn-secondary`, `.et-value`, `.et-muted`, `.et-nav-label`): usam `!important` implícito por especificidade — válidas como alternativa para padronizar sem alterar classes Tailwind no JSX.

**Arquivos já corrigidos (2026-06-04):**
- `app/admin/raio-x-provas/nova/page-client.tsx` — H1 `text-3xl font-black md:text-4xl` → `text-2xl font-semibold`
- `app/admin/alunos/page-client.tsx` — H1 `text-3xl font-bold` → `text-2xl font-semibold`
- `app/admin/alunos/novo/page.tsx` — H1 `text-3xl font-bold` → `text-2xl font-semibold`
- `app/admin/alunos/[id]/page-client.tsx` — H1 `text-3xl font-bold` → `text-2xl font-semibold`
- `app/questoes/page-client.tsx` — H1 `text-2xl font-bold md:text-4xl` → `text-2xl font-semibold`
- `app/simulados/[id]/editar/page-client.tsx` — H1 `text-3xl font-black md:text-4xl` → `text-2xl font-semibold`
- `app/simulados/components/SimuladoShell.tsx` — H1 modo dark `font-black md:text-4xl` → `font-semibold` (sem md:text-4xl)

**Regra:** nunca usar `text-3xl`, `text-4xl`, `text-5xl` ou `font-black` / `font-extrabold` em títulos H1 de página. Esses pesos/tamanhos são reservados para números de display em cards de métricas.

---

### 1.1 Layout, shell, navegação e footer

**Função:** estrutura global do sistema autenticado, menu lateral, topo, área principal e rodapé.

**Arquivos envolvidos:**

- `app/layout.tsx`
- `app/components/AppShell.tsx`
- `app/components/Header.tsx`
- `app/components/Sidebar.tsx`
- `app/components/MobileSidebar.tsx`
- `app/globals.css`

**Regras de manutenção:**

- Alterações de tonalidade global, sidebar, header, footer e fundo principal devem começar por esses arquivos.
- Se o footer ficar com tonalidade diferente da página, verificar primeiro `AppShell.tsx` e depois `globals.css`.
- Se a barra de rolagem da sidebar ficar grosseira, verificar `Sidebar.tsx`, `AppShell.tsx` e `globals.css`.
- Não alterar rotas do menu sem revisar `Sidebar.tsx` e `MobileSidebar.tsx`.
- **`isActive` no Sidebar:** a função usa `pathname === path || pathname.startsWith(path + "/")`. Para rotas pai (ex: `/admin/alunos`) que têm subrotas filhas com item próprio no menu (ex: `/admin/alunos/novo`), usar `isActive("/admin/alunos") && pathname !== "/admin/alunos/novo"` para evitar que o item pai fique ativo na página filha. Padrão já aplicado em: Jornadas, Alunos.
- **`isDarkPremiumRoute` (atualizado 2026-07-12):** flag usada para aplicar fundo `bg-[#03070D]` no shell e estilo dark no footer. Cobre: `/simulados/**`, `/admin/jornadas/**`, `/admin/raio-x-provas/**`, `/questoes/**`, `/admin/alunos/**`, `/admin/logs/**`, `/admin/ajuda/**`, `/disciplinas/**`, `/assuntos/**`, `/topicos/**` e `/bancas/**`. Footer dark: `border border-white/[0.08] bg-[#0B111C]/90 backdrop-blur`. Páginas dentro dessas rotas que usam `PageBackground` (light) convivem com o shell dark — apenas o fundo externo e o footer ficam dark.
- **Footer da área do aluno (adicionado 2026-07-12):** o ramo compartilhado de aluno no `AppShell.tsx` renderiza um rodapé claro após o conteúdo, com fundo `#faf8f5`, cartão branco translúcido, borda slate e identificação institucional em laranja. Ele aparece nas páginas comuns da área do aluno; rotas de execução e resultado que usam layout focado continuam sem o shell global.
- **Regra:** se uma nova página usar fundo `bg-[#07111F]` customizado, adicionar seu prefixo em `isDarkPremiumRoute` no `AppShell.tsx`.


**Checklist de teste:**

- [ ] Página inicial/admin carrega com sidebar.
- [ ] Menu lateral desktop funciona.
- [ ] Menu mobile funciona.
- [ ] Footer mantém o mesmo fundo externo da página.
- [ ] Páginas claras não foram escurecidas por engano.
- [ ] Páginas escuras continuam com fundo premium.

---

## 2. SISTEMA VISUAL / INTERFACES

### 2.0 Página de Login (`/login`)

**Função:** tela pública de acesso, com autenticação via `supabase.auth.signInWithPassword`, redirecionamento por role (`/dashboard` admin, `/aluno` estudante), tratamento de `must_change_password` (→ `/alterar-senha`) e de perfis inativos/bloqueados, e log de eventos via `/api/system/security-event`.

**Bloqueio explícito (2026-07-13):** para perfis de aluno, o login consulta `students.status` antes de encaminhar ao fluxo de primeiro acesso. Quando o status é `blocked`, encerra imediatamente a sessão recém-criada e informa: “Seu cadastro está bloqueado em nosso sistema. Por isso, seu acesso não é possível.” A verificação também permanece no tratamento de perfil inativo, cobrindo inconsistências entre `students.status` e `profiles.is_active`.

**Arquivo único:** `app/login/page.tsx` (client component autossuficiente; sem AppShell/Sidebar/Header).

**Estrutura visual (Sprint Login 2026-07-11):** duas colunas — esquerda institucional (gradiente laranja) com a logo oficial `public/images/Logo 04 -transp.png` renderizada via `next/image` (o nome com espaços funciona; o otimizador `/_next/image` foi validado), frase "Simulados com cara de aprovação." e card escuro "Correção + Resultado + Diagnóstico = Aprovação"; direita com o formulário ("Entrar no sistema", e-mail, senha, Entrar, links `/esqueci-senha` e `/cadastro`). No mobile as colunas empilham (institucional primeiro) — a coluna esquerda deixou de ser `hidden` em telas pequenas. Lógica de autenticação, redirecionamentos e links inalterados.

### 2.1 Interface escura de Questões (implementada)

**Função:** visual dark premium do Banco de Questões, filtros, cards de questões, seleção em massa e dashboard estatística.

**Status:** ✅ Interface dark aplicada em 2026-05-28.

**Arquivos principais:**

- `app/questoes/page-client.tsx`
- `app/questoes/page.tsx`
- `app/components/questions/SubjectMultiSelect.tsx`
- `app/components/questions/RichTextEditor.tsx`
- `app/components/ui/SelectionGhostBar.tsx`
- `app/components/ui/PremiumModal.tsx`
- `app/components/ui/PremiumButton.tsx`

**Padrão de tokens:**

- O arquivo `page-client.tsx` define um `const darkCard` local (dentro do componente `QuestoesClient`) que substitui o uso do `qCard` de `lib/ui/question-tokens.ts`.
- Os componentes globais (`PageBackground`, `PageHeader`, `PremiumCard`, `PremiumSelect`) **não foram modificados** — foram substituídos por HTML/divs customizados diretamente no JSX da página.

**Componentes auxiliares locais (todos atualizados para dark):**

- `QuestionStatCard` — 4 tons: `orange`, `amber`, `green`, `purple`.
- `PremiumSearch` — input de busca com `bg-white/[0.04]` e bordas translúcidas.
- `SubjectFilterDropdown` — dropdown de assuntos com fundo `#0D1B2E`, itens dark e **busca por texto** (input de pesquisa dentro do dropdown, adicionado em 2026-05-28). **Bug corrigido (2026-06-11):** o botão (caixa) tinha classes extras `focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10` que não existem em `SimpleSelectDropdown` (Disciplina) nem em `BoardFilterDropdown` (Banca), deixando a caixa "Assuntos" visualmente diferente das demais na mesma linha de filtros. Removidas para que as três caixas usem exatamente a mesma classe (`group flex h-12 w-full items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 text-left text-sm font-semibold text-white/70 shadow-sm outline-none transition duration-200 hover:-translate-y-0.5 hover:border-white/[0.14]`).
- **Dropdown "Dificuldade" (linha 2 dos filtros) — Bug corrigido (2026-06-11):** o botão e o painel usavam `bg-[#0D1926]` (sólido), destoando das demais caixas da mesma linha (Órgão, Ano, Status) que usam `bg-white/[0.04]` no botão e `bg-[#0D1B2E]` no painel. Botão padronizado para a mesma classe de `YearFilterDropdown`/`SimpleSelectDropdown` (acima); painel padronizado para `absolute left-0 top-full z-[9999] mt-2 w-full min-w-0 rounded-2xl border border-white/[0.09] bg-[#0D1B2E] p-3 shadow-2xl shadow-black/50 backdrop-blur-xl sm:min-w-72`.
- ~~`SortControl`~~ — **removido em 2026-06-04**; substituído pela barra premium de ordenação (toggle buttons) posicionada abaixo do card de filtros.
- `FeedbackBox` — feedback de sucesso/aviso/erro com cores translúcidas (10% opacidade).

**Dashboard estatística (5 métricas — ordem atualizada 2026-06-04):**

- Questões filtradas (`filteredQuestions.length`) — tom violeta — 1º card. *(substituiu a faixa "Os filtros encontraram X questões")*
- Publicadas (`published`) — tom verde — 2º card.
- Na fila (`ready_to_publish`) — tom âmbar — 3º card.
- Aguardando revisão (`pending_review`) — tom roxo/violeta — 4º card.
- Rascunho (`draft`) — tom laranja — 5º card.

Grid: `sm:grid-cols-2 lg:grid-cols-5`. A faixa violeta "Os filtros encontraram X questões" foi removida do card de filtros.

**Separação visual entre cards (efeito LED):**

- Cada card está dentro de `<div className="relative isolate">` com um `<div>` de glow absoluto posicionado atrás (`-z-10`).
- Glow padrão (laranja): `absolute -inset-[3px] -z-10 rounded-[2.25rem] bg-gradient-to-b from-orange-400/[0.07] via-white/[0.025] to-transparent blur-[14px]`.
- Glow azul (questão com imagem pendente): dois layers — externo `blur-[32px] from-blue-400/30` + interno `blur-[8px] from-blue-300/50`.
- Efeito: luz ambiente laranja suave emana do topo de cada card, criando separação visual no scroll sem bordas visíveis extras.
- Aplicado em 2026-05-28. Não remover sem substituir por separador equivalente.

**Padrão gold standard de card de questão (aplicado em 2026-06-04 a todos os locais dark):**

Card wrapper:
```
rounded-[2rem] border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm shadow-xl shadow-black/30 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.12]
```

Footer (rodapé sticky do card):
```
border-t border-white/[0.06] bg-black/10 backdrop-blur-sm
```

**Locais que aplicam este padrão (atualizado 2026-06-04):**

| Arquivo | Componente | Antes | Depois |
|---|---|---|---|
| `questoes/page-client.tsx` | `const darkCard` | — | Gold standard (referência) |
| `components/questions/QuestionEditor.tsx` | `<article>` | `bg-[#0A1525]` sólido, sem blur, sem hover | `bg-white/[0.03] backdrop-blur-sm`, hover lift, transition 300ms |
| `admin/raio-x-provas/[id]/page-client.tsx` | `QuestionCard` | `bg-[#0C1E34]` sólido, sem glow LED | `bg-white/[0.03] backdrop-blur-sm` + `relative isolate` + glow LED adicionado |

**Regra permanente:** qualquer novo card de questão em interface dark deve seguir o padrão gold standard: `bg-white/[0.03] backdrop-blur-sm`, envolvido por `<div className="relative isolate">` com o glow gradient absoluto.

**Regras:**

- A tela usa fundo `#07111F` com glows decorativos.
- A dashboard estatística pertence à página `Questões`, não à página `Revisar questões`.
- A interface deve continuar compatível com: filtros, seleção múltipla, edição em massa, mudança de resposta, envio para fila, publicação/despublicação, exclusão.
- Quando houver mudança visual em alternativas, replicar a lógica também em Revisar Questões, Preview do Simulado e Execução do Simulado.

---

### 2.2 Interface escura de Revisar Questões (implementada)

**Função:** visual dark premium da tela de Revisar Questões, idêntico ao padrão de Questões.

**Status:** ✅ Interface dark aplicada em 2026-05-28.

**Arquivos principais:**

- `app/questoes/revisar/page-client.tsx` — migrado para dark completo em 2026-05-28
- `app/questoes/revisar/page.tsx`
- `app/components/questions/RichTextEditor.tsx`
- `app/components/questions/SubjectMultiSelect.tsx`
- `app/components/ui/SelectionGhostBar.tsx`

**Padrão implementado:**

- `PageBackground`, `PageHeader`, `PremiumCard` **removidos do import** — substituídos por HTML/divs dark customizados.
- `qCard` de `lib/ui/question-tokens.ts` **removido** — substituído por classes dark inline.
- Fundo: `#07111F` com overlay `#0A1525` nos cards.

**Efeito LED (separação de cards):**

- Mesmo padrão de Questões: `<div className="relative isolate">` com glow absoluto.
- **Laranja** (`from-orange-400/[0.07]`) — questões normais.
- **Azul** (`from-blue-400/[0.07]`) — questões com `isQuestionImagePending(question) === true`.
- A variável `imagePending` é computada no início do `return` de `ReviewQuestionCard`.

**Filtro (atualizado 2026-06-11 — paridade total com Questões):**

Layout do card de filtros idêntico ao de Questões (mesma ordem, mesma grid, mesmos componentes):

- **Row 1:** `RevisarSearch` (busca) · `SimpleSelectDropdown` (Disciplina) · `FilterSubjectDropdown` (Assunto) · `BoardFilterDropdown` (Banca)
- **Row 2:** `OrgaoFilterDropdown` (Órgão) · `YearFilterDropdown` (Ano) · Dificuldade (dropdown inline) · `SimpleSelectDropdown` (Status)
- **Chips bar:** assuntos selecionados exibidos como chips removíveis, com botão X em cada chip (`onClick → setFilterSubjectIds(current.filter(id => id !== s.id))`)
- **Botão Limpar** (direita, standalone): `hasActiveFilters` controla o disabled. A faixa violeta "Os filtros encontraram X questões" foi removida em 2026-06-04 — a contagem agora fica no 1º card do dashboard.

Componentes locais definidos no arquivo, na ordem: `RevisarSearch` → `SimpleSelectDropdown` → `BoardFilterDropdown` → `YearFilterDropdown` → `FilterSubjectDropdown` → `OrgaoFilterDropdown`.

Estados correspondentes: `filterText: string`, `filterBoardIds: string[]`, `filterOrgaos: string[]`, `filterSubjectIds: string[]`, `filterDisciplineId: string`, `filterDifficultyLevels: string[]`, `filterYears: string[]`, `filterStatus: string`.

URL persistida via `params.append()` para arrays: `banca`, `assunto`, `dificuldade`, `ano`.

**Questões de imagem pendente:**

- Usar `isQuestionImagePending` de `@/lib/questions/image-pending`.
- Chip azul "⚠ Imagem ausente" no header do card.
- Dois layers de glow: halo externo `blur-[32px] from-blue-400/30` + halo interno `blur-[8px] from-blue-300/50`.
- Card com `border-blue-400/60 ring-2 ring-blue-400/25 shadow-2xl shadow-blue-900/40`.

**Regras:**

- O padrão visual das alternativas deve ser idêntico entre Questões, Revisar Questões, Preview e Execução.
- Não criar um terceiro padrão visual de alternativas.
- Qualquer novo filtro adicionado em Questões deve ser replicado em Revisar Questões.

---

### 2.3 Interface escura de Simulados

**Função:** visual premium dark das telas de simulados, listagem, detalhe, preview e execução.

**Arquivos principais:**

- `app/simulados/page-client.tsx`
- `app/simulados/page.tsx`
- `app/simulados/components/SimuladoCard.tsx`
- `app/simulados/components/SimuladoShell.tsx`
- `app/simulados/[id]/page.tsx`
- `app/simulados/[id]/editar/page-client.tsx`
- `app/simulados/[id]/preview/page-client.tsx`
- `app/meus-simulados/[id]/page-client.tsx`
- `app/meus-simulados/[id]/resultado/page-client.tsx`

**Atualização visual — 2026-06-09:**

- A interface de **Consultar Simulados** (`app/simulados/page-client.tsx`) passou a usar o mesmo esquema visual premium da Sprint Jornadas: fundo preto/azul profundo, grid sutil, hero superior com acento laranja/azul, card de filtros glassmorphism e botão primário em gradiente laranja para criar novo simulado.
- A interface de **Novo Simulado** (`app/simulados/novo/page-client.tsx`) passou a usar `SimuladoShell variant="dark"`, cards dark, campos dark e resumo lateral no mesmo padrão premium.
- O componente `app/simulados/components/SimuladoShell.tsx` foi refinado para usar o novo fundo premium nas telas dark de Simulados. Essa alteração impacta as telas que já usam `variant="dark"`, especialmente detalhe do simulado.
- O componente `app/simulados/components/SimuladoCard.tsx` recebeu ajuste de variante dark para aproximar cards administrativos do novo padrão visual.
- A tela de **Editar Simulado** (`app/simulados/[id]/editar/page-client.tsx`) recebeu ajuste de fundo/hero para manter consistência com o novo padrão.
- A abertura de `/simulados/[id]/editar` carrega somente o simulado, suas questões vinculadas e taxonomias. O banco completo de questões publicadas, as métricas e as exclusões por Jornada são buscados sob demanda por `GET /api/admin/questions?context=simulado-editor`, protegido por `requireAdmin`, ao abrir **Selecionar questões** ou **Criar questão**. Os filtros e a seleção existentes permanecem inalterados.

**Regras:**

- Card de simulado na listagem deve ser clicável e abrir o simulado.
- Botões internos do card devem manter suas ações usando `stopPropagation` quando necessário.
- Preview do Simulado e Execução do Simulado devem exibir alternativas com o mesmo padrão visual.
- Questões de múltipla escolha devem exibir letra da alternativa.
- Questões Certo/Errado não devem ser tratadas como A/B/C/D.

---

### 2.4 Interface escura de Jornada

**Função:** visual premium dark das Jornadas no admin.

**Arquivos principais:**

- `app/admin/jornadas/page-client.tsx`
- `app/admin/jornadas/page.tsx`
- `app/admin/jornadas/[id]/page-client.tsx`
- `app/admin/jornadas/[id]/page.tsx`
- `app/admin/jornadas/[id]/editar/page-client.tsx`
- `app/admin/jornadas/nova/page-client.tsx`
- `app/admin/jornadas/types.ts`
- `app/admin/jornadas/utils.ts`
- `app/components/AppShell.tsx`
- `app/components/Sidebar.tsx`

**Regras:**

- Cards de Jornadas na listagem devem ser clicáveis e abrir `/admin/jornadas/[id]`.
- Botões internos do card devem manter suas ações próprias.
- Detalhe da Jornada deve manter:
  - hero premium;
  - coruja integrada ao topo;
  - cards superiores compactos;
  - lista de simulados com liberação por dia;
  - alunos matriculados;
  - progresso geral;
  - configurações.
- Na lista administrativa de simulados da Jornada, os estados visuais devem representar apenas o cronograma geral: simulados com data já vencida aparecem como **Liberado**; todos os simulados futuros aparecem como **Programado**. Não usar **Bloqueado** nessa lista administrativa, porque bloqueio depende de matrícula/progressão individual do aluno e deve aparecer apenas em contextos do aluno/matrícula.
- Na tela de detalhe `/admin/jornadas/[id]`, todo o card de cada simulado vinculado é clicável e abre o detalhe administrativo em `/simulados/[id]`, tanto para itens liberados quanto programados. O card usa um único link acessível; a indicação interna “Abrir simulado” não deve ser transformada em link aninhado.
- Footer em Jornada deve usar o mesmo fundo externo da página.
- A tela `/admin/jornadas/[id]/editar` deve permanecer no padrão dark premium de Jornadas, inclusive nas abas **Informações** e **Simulados**. O gerenciamento da ordem dos simulados não deve voltar para interface clean/clara.

**Atualização aplicada — Nova Jornada premium (2026-06-09):**

- A rota `/admin/jornadas/nova` passa a usar interface dark premium específica para criação de Jornada, baseada no layout aprovado da sprint.
- Arquivo impactado: `app/admin/jornadas/nova/page-client.tsx`.
- A tela possui hero superior com textura/imagem `header-bg.webp`, overlay escuro, ícone de rotas/jornadas e botão Voltar.
- Abaixo do hero, há esteira de progresso em 3 etapas: `Criar Jornada`, `Adicionar Simulados`, `Atribuir Alunos`; somente a primeira etapa fica ativa nessa tela.
- O formulário principal exibe: Nome da Jornada, Descrição, Tipo da Jornada, Nome do concurso, Duração da Jornada em dias, Quantidade planejada de simulados e Data da prova opcional.
- O seletor de tipo da Jornada usa cards premium: `Jornada Geral` e `Concurso específico`. O tipo padrão é `contest`, mantendo o comportamento da tela planejada; se o usuário escolher `general`, o concurso é limpo/desabilitado.
- A coluna lateral `Resumo da Jornada` reflete em tempo real: nome, abrangência, concurso, duração, simulados planejados, data da prova, data efetiva D-7 e status inicial `Rascunho`.
- O botão principal continua criando a Jornada via `POST /api/admin/jornadas` e redirecionando para `/admin/jornadas/[id]/editar`, sem alterar API ou regra de negócio.
- Não foram alteradas APIs, banco de dados, listagem de jornadas, detalhe da jornada ou edição da jornada.

---

## 3. QUESTÕES — FUNÇÕES PRINCIPAIS

### 3.1 Banco de Questões

**Função:** listar, filtrar, selecionar, editar, publicar/despublicar, excluir e enviar questões para simulados.

**Arquivos principais:**

- `app/questoes/page-client.tsx`
- `app/questoes/page.tsx`
- `app/api/admin/questions/route.ts`
- `app/api/admin/questions/[id]/route.ts`
- `app/api/admin/questions/[id]/answer/route.ts`
- `app/api/admin/questions/[id]/difficulty/route.ts`
- `app/api/admin/questions/bulk/route.ts`
- `app/api/admin/simulados/[id]/questions/route.ts`

**Funções internas relevantes em `page-client.tsx`:**

- filtros por busca, disciplina, assunto, banca, dificuldade, status, ano e resposta;
- seleção múltipla;
- publicação/despublicação;
- edição em massa;
- exclusão em massa;
- mudança de resposta correta;
- classificação de dificuldade;
- modo uma por vez / múltiplas;
- **editor inline dark** (`InlineQuestionEditor`) — redesenhado em 2026-05-28.

**Editor inline (`InlineQuestionEditor`) — detalhes:**

- Componente: `function InlineQuestionEditor` dentro de `app/questoes/page-client.tsx`.
- Visual: dark glass (`bg-[#0A1322]`), mesmo tema da página de Questões.
- Layout: container com barra superior (eyebrow laranja + ações) + corpo com seções empilhadas.
- Seções: grade de metadados (Tipo/Disciplina/Assuntos/Banca/Ano) → Dificuldade+Status → Enunciado (RichTextEditor) → Alternativas → Comentário do professor.
- Alternativas dark: múltipla escolha = borda/fundo emerald translúcido na correta; Certo/Errado = botões com emerald/red translúcidos.
- Gerar com IA: botão violeta → chama `/api/admin/questions/explain`; `generatingAI` state controla loading.
- Salvar: chama `save()` com modal de confirmação via `setActionModal`; Publicar: chama `save("published")`.
- Indicador de rodapé: "As alterações são salvas automaticamente." (decorativo — indicador de contexto).

**Regras:**

- Filtro de assuntos deve permitir seleção múltipla.
- Filtro de assuntos deve mostrar contagem com base nos demais filtros aplicados.
- **Chips de assunto no filtro** têm botão X para remover individualmente (`onClick → setSubjectIds(current.filter(id => id !== subject.id))`). Padrão replicado em `questoes/revisar/page-client.tsx` com `setFilterSubjectIds`.
- Filtros e buscas não devem limitar artificialmente a 300 registros quando a regra esperada for buscar em todo o banco.
- Edição em massa deve salvar e atualizar a tela imediatamente.
- **"Preparar para fila" NÃO existe no Banco de Questões (`/questoes`).** Essa opção é exclusiva da tela `/questoes/revisar`. Foi removida do rodapé dos cards em `questoes/page-client.tsx` em 2026-06-08. O workflow correto é: questões chegam à fila de publicação apenas pelo fluxo de revisão.
- **"Editar em massa" (BulkEditModal)** só aparece na barra fantasma quando `selectedIds.length > 1`. Com apenas 1 selecionada, a opção não faz sentido.
- **BulkEditModal** tem três abas: Status / Assunto / Banca. Na aba Assunto usa `SubjectMultiSelect` (multi-select dark) para selecionar múltiplos assuntos, igual ao restante do sistema. A aba Banca mantém lista de radio. Envia via `metadata.subject_ids` ou `metadata.exam_board_id` para `/api/admin/questions/bulk` (caminho `metadata` já suportado).
- **Edição inline simultânea (`inlineEditingIds: string[]`)**: substituiu `inlineEditingId: string | null`. Múltiplos editores podem estar abertos ao mesmo tempo. O botão "Salvar" integrado na `SelectionGhostBar`:
  - `inlineEditingIds.length > 1` → "Salvar todas as alterações" (primeira ação da barra) — `setSaveAllTrigger(t + 1)` dispara `saveImmediate()` em todos os editores abertos sem modal de confirmação
  - `inlineEditingIds.length === 1` → "Salvar questão" (mesmo mecanismo)
  - O `count` da `SelectionGhostBar` inclui `inlineEditingIds.length` para manter a barra visível mesmo sem seleção
- Questões Certo/Errado não devem exibir A/B/C/D.
- Alternativa correta deve ter marca visual da corujinha quando aplicável.
- **Botão "Arquivar"/"Desarquivar" (adicionado 2026-06-10):** no rodapé do card de cada questão em `questoes/page-client.tsx`, função `toggleQuestionArchiveStatus` alterna `status` entre `archived` e `draft` via `PATCH /api/admin/questions/bulk`. Questões `archived`: (1) não aparecem no seletor "Selecionar questões" de `/simulados/[id]/editar` (que já busca apenas `status="published"`); (2) são bloqueadas no backend ao tentar vincular a um simulado — `POST /api/admin/simulados/[id]/questions` rejeita `status === "archived"` com a mensagem "Questões arquivadas não podem ser adicionadas a simulados."; (3) continuam sendo retornadas pela busca de duplicatas (`/api/admin/questions/check-duplicate` não filtra por `status`), permitindo detectar duplicidade contra questões arquivadas durante a importação.
- **Rodapé do card "Banco de Questões" — restilizado (2026-06-10):** removido o botão "Voltar para revisão" (estado de `toggleQuestionPublishStatus` quando `status === "published"`) — agora o botão "Publicar" só aparece quando `status !== "published"`, já que "Editar" cobre a edição de questões publicadas. Todos os botões do rodapé passaram a usar as novas variantes "premium" (escuras) do `PremiumButton`, no mesmo padrão visual do rodapé do `QuestionEditor.tsx`: `dark` (Editar, Visualizar, Simulado, Usar como modelo, Desarquivar), `dark-primary` (Publicar — gradiente laranja), `dark-warning`/`dark-success` (Anular/Reativar), `dark-danger` (Arquivar, Excluir).
- **`PremiumButton` (`@/components/ui/PremiumButton`) — novas variantes (2026-06-10):** além de `primary | secondary | ghost | danger`, agora suporta `dark`, `dark-danger`, `dark-warning`, `dark-success`, `dark-primary` — réplicas do esquema de cores escuro usado nos botões de rodapé do `QuestionEditor.tsx` (neutro translúcido, vermelho, âmbar, verde-esmeralda e gradiente laranja/âmbar). Usar essas variantes em rodapés de cards escuros (`darkCard`); as variantes originais continuam claras/neutras para uso em formulários e páginas claras.
- **`QuestionEditor.tsx` — botão "Arquivar"/"Desarquivar" no rodapé (adicionado 2026-06-10):** novo `<button>` no rodapé (entre "Anular/Reativar" e "Salvar"), estilizado igual ao botão "Salvar" (neutro translúcido). Função `toggleArchiveQuestion` alterna `status` entre `archived` e `draft` via `PATCH /api/admin/questions/bulk`; ao arquivar, chama `onArchived?.(question.id)` (em `/questoes/revisar` isso remove a questão da fila de revisão via `handleArchived`). Diferente do botão "Descartar" (que sempre arquiva e fecha o modal de confirmação), este é um toggle direto sem modal, dando paridade com o botão equivalente do Banco de Questões.
- **Questões `pending_review` NÃO aparecem no Banco de Questões** — gerenciadas exclusivamente em `/questoes/revisar`. **Questões `ready_to_publish` são acessíveis via URL `?status=ready_to_publish`** — o link "Ver fila de publicação" na sidebar aponta para `/questoes?status=ready_to_publish`, ativando o item corretamente via `isPublicationQueueActive = pathname === "/questoes" && searchParams.get("status") === "ready_to_publish"`. O dropdown de status só exibe: Todos / Rascunho / Publicada / Arquivada (sem `ready_to_publish`). No servidor (`page.tsx`), `QUESTION_STATUSES = ["draft", "published", "active", "archived", "ready_to_publish"]` — inclui `ready_to_publish` para validar o URL param, mas a query padrão (sem status) ainda exclui `pending_review` e `ready_to_publish`. No cliente (`questionMatchesFilters`): `if (!fStatus && (qStatus === "pending_review" || qStatus === "ready_to_publish")) return false`.

**Bug corrigido (2026-05-29) — sidebar "fila de publicação" ativava ao digitar:** ao navegar de `/questoes?status=ready_to_publish` para `/questoes` via soft-navigation do Next.js, o state `status` não era redefinido, causando o URL sync effect incluir `status=ready_to_publish` sempre que qualquer outro filtro mudava (ex: digitação na busca). Corrigido com `useEffect(() => { setStatus(initialFilters?.status ?? ""); }, [initialFilters?.status])` logo após o effect de `setQuestions`.

**Bug corrigido (2026-05-29) — busca não encontrava questões com HTML no enunciado:** `questionMatchesFilters` usava `question.statement` bruto no `searchable`, quebrando com formatação de negrito/itálico ou entidades HTML. Corrigido com função `stripHtml` local que remove tags e decodifica entidades antes do `includes()`. Função `stripHtml` definida imediatamente antes de `questionMatchesFilters` em `page-client.tsx`.

**Bug corrigido (2026-05-29) — publicação silenciosa sem aviso de bloqueio:** `publishSelectedQueueItems` e `publishAllCurrentQueueItems` ignoravam `result.blockedIds` da API bulk. Quando a API rejeita questões sem gabarito único (reseta para `pending_review` silenciosamente), o UI agora exibe modal `"warning"` com códigos das questões bloqueadas. Códigos obtidos buscando em `questions` por ID. Contagem real usa `result.updatedCount ?? result.updatedIds?.length ?? 0`.

**Checklist:**

- [ ] Buscar por texto/código/enunciado.
- [ ] Filtrar por banca.
- [ ] Filtrar por disciplina.
- [ ] Filtrar por vários assuntos.
- [ ] Ver contagem por assunto com filtros aplicados.
- [ ] Filtrar por status.
- [ ] Filtrar por dificuldade.
- [ ] Filtrar por ano.
- [ ] Filtrar por resposta.
- [ ] Selecionar uma questão.
- [ ] Selecionar várias questões.
- [ ] Editar em massa e atualizar tela.
- [ ] Adicionar selecionadas a simulado.
- [ ] Excluir selecionadas.
- [ ] Enviar publicadas para rascunho/despublicar.

---

### 3.2 Revisar Questões

**Função:** revisar questões pendentes ou em fila, corrigir enunciado, alternativas, comentário, metadados e publicar.

**Arquivos principais:**

- `app/questoes/revisar/page-client.tsx`
- `app/questoes/revisar/page.tsx`
- `app/api/admin/questions/[id]/route.ts`
- `app/api/admin/questions/review-comment/route.ts`
- `app/api/admin/questions/explain/route.ts`
- `app/components/questions/RichTextEditor.tsx`
- `app/components/questions/QuestionActionModal.tsx`

**Regras:**

- Dashboard estatística própria da Revisar Questões (atualizado 2026-06-04): 4 cards — Questões filtradas (violet, `filteredQueue.length`) · Pendente de revisão (orange, `stats.pendingReview`) · Na fila (amber, `stats.readyToPublish`) · Em rascunho (slate, `stats.saved`). Grid: `sm:grid-cols-2 md:grid-cols-4`. A faixa violeta "Os filtros encontraram X questões" foi removida — a contagem fica no 1º card. O `StatCard` local aceita `tone: "violet"` (adicionado em 2026-06-04).
- Tesourinha deve funcionar nas alternativas.
- Alternativas Certo/Errado devem usar padrão próprio.
- Alterações feitas no modal devem refletir imediatamente na tela.
- O visual das alternativas deve ser compatível com Questões e Simulados.
- **Alternativas image-only:** `AlternativeEditor` usa `hasContent = hasText || Boolean(image_url?.trim())` para controlar expand/collapse. Estado colapsado mostra `[ imagem ] — clique para editar` quando há imagem mas sem texto.

**Auto-save antes de ações de publicação (atualizado 2026-05-29):**

- `saveHandlersRef` — `useRef<Record<string, { code: string; save: () => Promise<{ ok: boolean; message? }> }>>({})` — registry de save handlers por questão.
- `formPublicationQueue` — itera `saveHandlersRef.current` para cada questão da fila antes de enviar para `ready_to_publish`. Falhas coletadas impedem questões problemáticas de avançar.
- `publishAllReadyQueue` — itera `saveHandlersRef.current` para cada questão do filtro antes de chamar bulk `published`. Mesma lógica: falhas de save coletadas, questões com erro excluídas do batch, resultado mostra contagem real publicada + aviso de ignoradas.
- Publish individual (`publishQuestion` em `ReviewQuestionCard`) — chama `persistQuestion("published")` que salva antes de mudar status.
- **Regra:** nunca publicar ou enviar para fila sem antes tentar salvar tudo não salvo.

**Bug corrigido (2026-05-29) — publicação silenciosa sem aviso de bloqueio:** `publishAllReadyQueue` ignorava `result.blockedIds`. Corrigido: lê `result.blockedIds`, mapeia IDs em códigos via `filteredQueue`/`saveHandlersRef`, exibe modal `"warning"` com lista de bloqueadas. Contagem real usa `result.updatedCount ?? result.updatedIds?.length ?? 0`. `setApprovedCount` incrementa pela contagem real, não pelo total enviado.

---

### 3.3 Criar / Editar Questão

**Função:** criação e edição completa de questão, incluindo tipo, enunciado, alternativas, gabarito, comentário, banca, disciplina, assuntos, ano, dificuldade e status.

**Padrão da criação manual (atualizado 2026-07-12):** ao abrir `/questoes/nova` sem restaurar rascunho ou carregar modelo, o formulário seleciona automaticamente a banca cadastrada equivalente a `ESTUDO TOP` e preenche o ano corrente do navegador. Ambos os campos permanecem editáveis; se a banca não estiver cadastrada entre as bancas ativas, nenhuma banca é selecionada automaticamente.

**Composição visual da criação manual (atualizada 2026-07-12):** `/questoes/nova` usa integralmente o tema dark premium e replica a linguagem do editor inline (`QuestionEditor.tsx`): fundo `#03070D`, card `#081321`, filtros pesquisáveis dark na ordem Tipo → Disciplina → Assuntos → Banca → Ano, linha de Dificuldade e Status, editor rico escuro, alternativas com estados dark, `Tópicos avaliados` em bloco azul e ação de salvar em rodapé sticky laranja. A antiga linha visual de pontuação fixa foi removida. As regras de validação, rascunho, duplicidade, geração de explicação e salvamento permanecem inalteradas.

**Arquivos principais:**

- `app/questoes/nova/page-client.tsx`
- `app/questoes/nova/page.tsx`
- `app/questoes/[id]/editar/page-client.tsx`
- `app/questoes/[id]/editar/page.tsx`
- `app/components/questions/RichTextEditor.tsx`
- `app/components/questions/SubjectMultiSelect.tsx`
- `app/api/admin/questions/route.ts`
- `app/api/admin/questions/[id]/route.ts`

**Regras:**

- `multiple_choice` usa alternativas com letras A/B/C/D/E quando houver.
- `true_false` usa apenas Certo/Errado.
- Não permitir salvar múltipla escolha sem exatamente uma correta.
- Não permitir alternativas duplicadas quando a validação estiver ativa.
- Tesourinha deve existir na edição quando houver preview/listagem de alternativas cortáveis.
- Editor rico deve preservar conteúdo ao alternar entre visual e HTML.
- **Alternativas podem conter apenas imagem, sem texto.** A validação deve aceitar `alt.text.trim() || alt.image_url?.trim()` — nunca rejeitar alternativa com imagem mas sem texto.

**Regra de validação de alternativas (atualizado 2026-06-03):**

| Arquivo | Condição correta |
|---|---|
| `questoes/nova/page-client.tsx` | `!alt.text.trim() && !alt.image_url?.trim()` |
| `questoes/[id]/editar/page-client.tsx` | `!alt.text.trim() && !alt.image_url?.trim()` |
| `questoes/revisar/page-client.tsx` | `!stripHtml(alt.text).trim() && !alt.image_url?.trim()` |
| `api/admin/questions/route.ts` | `.filter(alt => Boolean(alt.text \|\| alt.image_url))` |
| `api/admin/questions/[id]/route.ts` | `.filter(alt => alt.label && (alt.text \|\| alt.image_url))` |
| `api/admin/questions/import/save/route.ts` | `.filter(alt => alt.text \|\| alt.image_url)` |

**Detecção de duplicatas em `api/admin/questions/route.ts` e `[id]/route.ts` (getDuplicateAlternativeLabelGroups):**
- `normalizeText` substitui `<img>` por `"xximagemxx"` antes de stripHtml — isso faz alternativas só-imagem normalizarem para `"xximagemxx"` (string não vazia).
- A condição de skip deve ser: `!normalized || !normalized.replace(/xximagemxx/g, "").trim()` — pula alternativas cujo conteúdo seja exclusivamente imagens.
- **Bug corrigido (2026-06-04) — falso positivo de duplicata com formatações HTML diferentes:** Alternativas com o mesmo texto mas formatação HTML diferente (ex: uma com `<b>`, outra com `<i>`, outra sem tag) eram incorretamente sinalizadas como duplicatas porque `normalizeText` e `lightNormalizeText` strippam todo HTML. Correção: adicionado `rawHtml` como terceiro nível de agrupamento. A chave de comparação final é `lightNorm + "__" + rawHtml` (HTML normalizado de espaços e lowercased). Alternativas com mesmo texto mas HTML diferente ficam em buckets distintos e NÃO são sinalizadas. Aplicado em ambas as rotas.

`simulados/[id]/editar/page-client.tsx` usa `ManualAlternative` (sem `image_url`) — validação original mantida pois este formulário não suporta imagem em alternativas.

**"Usar como modelo" (implementado 2026-06-08):**

- **Status:** ✅ Implementado em `questoes/page-client.tsx`.
- **Componente:** `UseAsTemplateModal` — função local definida antes de `InlineQuestionEditor`.
- **Trigger:** botão "Usar como modelo" (ícone Copy) no rodapé de cada card de questão no Banco de Questões. Estado `useAsTemplateQuestion: any | null` controla abertura.
- **Comportamento:** abre overlay dark `z-[200]` com cópia da questão pré-preenchida: mesmo enunciado, mesmas alternativas, mesmos assuntos (`extractQuestionSubjects`), mesma dificuldade. Banca fixada em "Estudo TOP" (lookup por `/estudo\s*top/i` na lista `boards`), ano fixado no ano atual. Permite editar tudo antes de salvar.
- **Salvar:** POST `/api/admin/questions` com `status: "draft"`, `source_origin: "bank"`, `orgao: question.orgao || null`. Ao concluir, exibe feedback de sucesso com o código da nova questão via `setFeedback`.
- **Regra:** se a banca "Estudo TOP" não estiver cadastrada em `exam_boards`, o modal exibe erro orientando o usuário a cadastrá-la.
- **Propagação de `orgao` (2026-06-09):** o campo `orgao` da questão original é enviado junto ao criar a cópia. O mesmo vale para variações do Raio-X e clones de prova — todos usam `analysis.contest_name` como `orgao` ao salvar no banco.

---

### 3.4 Importar Questões com IA / Lote

**Função:** analisar texto colado, separar questões, detectar metadados, detectar duplicidades, editar antes de enviar para revisão.

**Arquivos principais:**

- `app/questoes/importar/page-client.tsx`
- `app/questoes/importar/page.tsx`
- `app/api/admin/questions/import/analyze-batch/route.ts`
- `app/api/admin/questions/import/analyze/route.ts`
- `app/api/admin/questions/import/save/route.ts`
- `app/api/admin/questions/check-duplicate/route.ts`
- `app/components/questions/RichTextEditor.tsx`
- `app/components/questions/SubjectMultiSelect.tsx`
- `app/components/ui/SelectionGhostBar.tsx`

**Regras:**

- Preservar ordem das questões importadas.
- Remover lixo de portal sem remover metadados úteis.
- Detectar duplicidade por enunciado e alternativas.
- Frase `Imagem associada para resolução da questão` deve destacar a questão como requer imagem.
- Botões de seleção devem seguir o mesmo padrão visual dos demais fluxos.
- **Órgão detectado automaticamente (2026-06-02):** o importador extrai `Órgão:` / `Orgao:` do texto bruto, preenche `orgao` no card, permite edição manual antes do envio e salva o valor em `questions.orgao`. As questões antigas podem permanecer com `orgao` nulo.

---

### 3.5 Gerar Questões com IA

**Função:** gerar variações ou questões novas por IA, revisar, editar e enviar para revisão.

**Arquivos principais:**

- `app/questoes/gerar-ia/page-client.tsx`
- `app/questoes/gerar-ia/page.tsx`
- `app/api/admin/questions/generate-ai/route.ts`
- `app/api/admin/questions/import/save/route.ts`
- `app/components/questions/RichTextEditor.tsx`
- `app/components/questions/SubjectMultiSelect.tsx`

**Redesign visual (2026-06-08) — tema dark, cards sempre expandidos:**

- `GeneratedQuestionCard` foi redesenhado com tema dark idêntico ao `gerar-ia` / `revisar`:
  - Card wrapper: `rounded-[2rem] border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm shadow-xl shadow-black/30 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.12]`
  - Card selecionado: `border-orange-400/40 bg-white/[0.04] ring-1 ring-orange-400/20`
  - Card duplicado: `border-red-500/40 bg-red-500/[0.06]`
  - Header: chips `border-orange-500/30 bg-orange-500/[0.12]` (banca), `border-white/[0.09] bg-white/[0.05]` (tipo/disciplina/assunto)
  - `PremiumDifficultyStars` para exibir/editar dificuldade
  - Enunciado: `RichTextEditor` sempre visível (sem collapse), dark-styled
  - Alternativas múltipla: `GeneratedAlternativeEditor` com `PremiumScissorsIcon` + `isEliminated` state (`opacity-60` no container + `[&_*]:line-through`)
  - Alternativas Certo/Errado: botões emerald/red dark com OWL_MARK na correta
  - "Resposta correta:" ao final das alternativas, verde ou vermelho conforme gabarito
  - Explicação: seção colapsável se `explanation_text` existe
  - Footer: `PremiumButton variant="secondary"` Descartar + `PremiumButton` Enviar para revisão
- `GeneratedAlternativeEditor`: sub-componente local em `gerar-ia/page-client.tsx`
  - `isEliminated` state: opacidade 60% no container, strikethrough em todos os elementos internos via `[&_*]:line-through [&_*]:decoration-red-500`
  - Botão de gabarito mostra OWL_MARK (correta) ou letra clicável (incorreta)
  - PremiumScissorsIcon: visível ao hover ou quando ativo

**Regras:**

- Recurso de gerar variações com IA não deve desaparecer em alterações de UI.
- Modal animado deve seguir o padrão premium já usado em revisão.
- Nível variado deve poder ser selecionado quando previsto.
- Questões geradas só entram no banco ao enviar para revisão.
- Não regredir para cards colapsáveis: questões sempre exibem editor completo.

---



### 3.6 Raio-X de Provas (documentação consolidada em 2026-06-09)

**Função:** transformar uma prova colada em texto bruto em uma análise editorial completa: questões diagramadas, revisão questão por questão, mapa de cobrança, parecer EstudoTOP, relatório final em landing page/PDF, variações de questões e clone de prova.

**Documentação principal:** `docs/Sprint-raio-x.md` — manual técnico, funcional e operacional completo do módulo.

**Rotas principais:**

| Rota | Função | Arquivos |
|---|---|---|
| `/admin/raio-x-provas` | Listagem das análises, filtros, métricas, ordenação e exclusão. | `app/admin/raio-x-provas/page.tsx`, `app/admin/raio-x-provas/page-client.tsx` |
| `/admin/raio-x-provas/nova` | Nova análise a partir de texto bruto. | `app/admin/raio-x-provas/nova/page.tsx`, `app/admin/raio-x-provas/nova/page-client.tsx` |
| `/admin/raio-x-provas/[id]` | Revisão de questões, Raio-X final, parecer, variações e clone. | `app/admin/raio-x-provas/[id]/page.tsx`, `app/admin/raio-x-provas/[id]/page-client.tsx` |
| `/admin/raio-x-provas/[id]/relatorio` | Relatório final em landing page e exportação PDF. | `app/admin/raio-x-provas/[id]/relatorio/page.tsx`, `app/admin/raio-x-provas/[id]/relatorio/page-client.tsx` |

**Arquivos principais do módulo:**

- `app/admin/raio-x-provas/page-client.tsx` — listagem dark premium, filtros (`FilterSelect`), ordenação por coluna, métricas e exclusão.
- `app/admin/raio-x-provas/nova/page-client.tsx` — formulário de nova análise, normalização, autocomplete/cadastro inline, validação, `StepPct` e overlay de processamento.
- `app/admin/raio-x-provas/[id]/page-client.tsx` — arquivo central do módulo: revisão, `QuestionCard`, `QuestionNavigator`, publicação direta, variações, Raio-X final, Parecer EstudoTOP, relatório e clone.
- `app/admin/raio-x-provas/[id]/relatorio/page-client.tsx` — landing page final do relatório, backgrounds oficiais, infográficos e PDF.
- `app/admin/raio-x-provas/types.ts` — tipos do módulo.
- `app/admin/raio-x-provas/utils.ts` — labels, status e helpers visuais.
- `app/components/Sidebar.tsx` — item “Raio-X de Provas”.
- `app/components/AppShell.tsx` — rota `/admin/raio-x-provas/**` incluída em `isDarkPremiumRoute`.

**APIs principais:**

| Endpoint | Arquivo | Função |
|---|---|---|
| `POST /api/admin/exam-analyses/analyze` | `app/api/admin/exam-analyses/analyze/route.ts` | Cria análise, quebra texto em blocos, chama IA, salva análise/questões/dashboard. |
| `GET/PATCH/DELETE /api/admin/exam-analyses/[id]` | `app/api/admin/exam-analyses/[id]/route.ts` | Lê, atualiza, consolida resumo ou exclui análise. |
| `POST /api/admin/exam-analyses/[id]/reprocess` | `app/api/admin/exam-analyses/[id]/reprocess/route.ts` | Reprocessa `summary`, `report` ou `full`. |
| `PATCH /api/admin/exam-analyses/[id]/questions/[questionId]` | `app/api/admin/exam-analyses/[id]/questions/[questionId]/route.ts` | Atualiza questão analisada. |
| `POST /api/admin/exam-analyses/[id]/questions/[questionId]/variations` | `app/api/admin/exam-analyses/[id]/questions/[questionId]/variations/route.ts` | Gera variações de questão. |
| `POST /api/admin/exam-analyses/[id]/clone` | `app/api/admin/exam-analyses/[id]/clone/route.ts` | Gera clone da prova sem salvar no banco. |
| `POST /api/admin/exam-analyses/[id]/clone/variation` | `app/api/admin/exam-analyses/[id]/clone/variation/route.ts` | Gera variação dentro do clone. |
| `POST /api/admin/exam-analyses/[id]/clone/finalize` | `app/api/admin/exam-analyses/[id]/clone/finalize/route.ts` | Salva questões aprovadas e cria simulado clone. |
| `POST/DELETE /api/admin/exam-analyses/[id]/publish` | `app/api/admin/exam-analyses/[id]/publish/route.ts` | Gera/remove token de publicação/link público. |

**Banco/tabelas envolvidas:**

- `exam_analyses` — cabeçalho da análise, metadados, status, dashboard, resumos e relatório.
- `exam_analysis_questions` — questões diagramadas/revisadas, alternativas em JSON, assuntos, gabarito, anulação, imagem e parecer.
- `exam_contests` e `exam_positions` — autocomplete/cadastro inline de concurso e cargo.
- `exam_boards`, `disciplines`, `subjects` — classificação e metadados.
- `questions`, `question_alternatives`, `question_subjects` — destino da publicação direta no banco.
- `simulados`, `simulado_questions` — destino da finalização do clone de prova.

**Regras permanentes do Raio-X:**

- Entrada oficial atual: texto bruto; não há upload/OCR de PDF como fluxo principal.
- Título da análise é automático: `RaioX - Prova - [Concurso] - [Cargo] - [Ano] - [Banca]`.
- Concurso, Cargo, Ano, Banca e Disciplina são obrigatórios.
- O backend sempre normaliza metadados antes de salvar.
- `splitIntoQuestionBlocks()` em `app/lib/utils/question-splitter.ts` é usado no cliente para prévia e no servidor como fonte real da análise.
- **Análise em blocos:** se N blocos forem detectados, o backend deve tentar gerar N questões. Não voltar para chamada única com a prova inteira.
- **Afirmativas I/II/III:** tudo antes das alternativas A-E pertence ao `statement`. Não transformar afirmativas longas em alternativas.
- **`original_number`:** sempre sequencial pela posição (`index + 1`), ignorando número devolvido pela IA.
- **Assunto final:** `subject_ids`/`subject_id` definidos pelo professor têm prioridade sobre `module_name` da IA.
- **Compatibilidade de assuntos:** manter `subject_ids` como fonte principal e `subject_id` como primeiro item para compatibilidade.
- Questões descartadas (`discarded`) não entram nas métricas, dashboard ou relatório.
- Questões anuladas entram como anuladas; ao anular, `answer_key` deve ser limpo.
- `teacher_opinion` é parecer editorial, não tag técnica. Não usar como tag na dobra “O que foi cobrado”.
- **Publicação direta:** questões do Raio-X não devem ir para fila de revisão; publicar com `status: "published"`.
- `orgao` das questões publicadas/variações/clones deve receber `analysis.contest_name || null`.
- `visual_analysis_status` aceita somente `none | pending | applied | review_required | failed`. Nunca usar `not_required` ou `needs_review`.
- PDF oficial do Raio-X fica na rota `/admin/raio-x-provas/[id]/relatorio`; não recriar PDF do dashboard operacional sem autorização.

**Funções e componentes críticos em `[id]/page-client.tsx`:**

| Função/componente | Responsabilidade |
|---|---|
| `saveMetadata` | Atualiza dados editoriais da análise e regenera título. |
| `updateQuestion` | Atualiza estado local de uma questão. |
| `detectDatabaseDuplicates` | Consulta duplicatas no banco e marca questões já existentes. |
| `patchQuestion` | Persiste uma questão analisada. |
| `persistQuestions` | Salva várias questões. |
| `canMarkReviewedWithoutRegeneration` | Decide se análise pode voltar a `reviewed` sem regeneração manual. |
| `saveAnalysis` | Salva status/resumo/metadados da análise. |
| `openRaioXFinal` | Alterna para o modo final validando pendências. |
| `discardQuestion` | Marca questão como descartada. |
| `sendToBank` | Publica questões diretamente no banco via fluxo de import/save. |
| `sendToBankWithModal` | Valida duplicatas/assunto/status e exibe modal antes de publicar. |
| `checkClassification` | Valida se as questões estão classificadas para o relatório. |
| `checkTeacherOpinion` | Valida existência de parecer/insumo editorial. |
| `generateReport` | Gera relatório completo via reprocessamento `report`. |
| `regenerateFinalRaioX` | Regera/consolida a leitura final. |
| `reprocess` | Chama endpoint de reprocessamento. |
| `refazerComNovoTexto` | Reanalisa prova nova a partir de outro texto bruto. |
| `generateVariations` | Gera variações da questão ativa. |
| `RaioXFinalView` | Dashboard final, Parecer EstudoTOP, mapa, relatório e clone. |
| `QuestionCard` | Card de revisão da questão. |
| `VariationReviewPanel` | Revisão/publicação de variações. |
| `CloneProvaModal` | Configuração inicial do clone. |
| `CloneProgressModal` | Progresso de geração do clone. |
| `CloneReviewPanel` | Revisão final do clone antes de salvar. |
| `CloneAlternativeEditor` | Editor de alternativas do clone. |

**Clone de Prova:**

- Recurso implementado em fluxo de duas fases: gerar sem salvar → revisar → aprovar e persistir.
- `POST /clone` gera questões e retorna JSON para revisão, sem gravar no banco.
- `CloneReviewPanel` permite editar enunciado, alternativas, gabarito, dificuldade, assuntos, adicionar questão manual/IA e gerar variações.
- `POST /clone/finalize` salva questões aprovadas, cria simulado e vínculos.
- Simulado clone deve ser rascunho e não deve ser vinculado automaticamente a Jornada.
- Nenhuma questão do clone deve ser salva antes do clique final de aprovação.

**Relatório final / landing:**

- Arquivo central: `app/admin/raio-x-provas/[id]/relatorio/page-client.tsx`.
- Usa backgrounds oficiais em `public/images/raio-x/`.
- Constantes relevantes: `HERO_BG`, `SECTION_BLUE_BG`, `SECTION_ORANGE_BG`, `COLORS`.
- Funções auxiliares relevantes: `cleanText`, `cleanBlockText`, `clampText`, `difficultyLabel`, `difficultyTone`, `safeFileName`, `unique`, `getQuestionTags`, `moduleTags`.
- Exportação PDF deve capturar a landing final, não o dashboard admin.

**Pontos de risco:**

- `app/admin/raio-x-provas/[id]/page-client.tsx` é muito grande e concentra vários fluxos; alterar apenas a função/local necessário.
- Renderização de alternativas existe em questão original, variações e clone; testar todos se mudar gabarito, tesourinha, C/E ou RichTextEditor.
- Publicação usa fluxo compartilhado com importação de questões; qualquer mudança no payload deve preservar `temp_id`, `subject_ids`, `subject_id`, `status: "published"` e `orgao`.
- Não confundir `report_content`/relatório final com `dashboard` operacional.
- Reprocessamento `full` pode recriar questões; validar para não misturar prova antiga com prova nova.

**Checklist específico antes de entregar alteração no Raio-X:**

- [ ] Nova análise cria uma análise com N blocos = N questões.
- [ ] Afirmativas e listas permanecem no enunciado.
- [ ] Questão Certo/Errado não vira A/B.
- [ ] Navegação mostra 1..N.
- [ ] Editar enunciado, alternativa, gabarito, dificuldade e assunto funciona.
- [ ] Anular/Desanular funciona e limpa gabarito ao anular.
- [ ] Descartar remove da análise final.
- [ ] Publicar individual e em lote publica direto no banco.
- [ ] Duplicata existente bloqueia publicação e mostra aviso.
- [ ] `orgao` é propagado como concurso da análise.
- [ ] Variações podem ser geradas, editadas, descartadas e publicadas.
- [ ] Raio-X final prioriza assuntos do banco.
- [ ] Relatório abre em `/relatorio` e PDF exporta corretamente.
- [ ] Clone gera sem salvar, permite revisar e só salva no `finalize`.
- [ ] `docs/Sprint-raio-x.md` e este índice foram atualizados quando houver mudança de comportamento.

---


### 3.7 Duplicatas

**Função:** localizar e tratar questões duplicadas.

**Arquivos principais:**

- `app/questoes/duplicatas/page-client.tsx`
- `app/questoes/duplicatas/page.tsx`
- `app/api/admin/questions/duplicates/route.ts`
- `app/api/admin/questions/check-duplicate/route.ts`
- `app/lib/utils/question-formatting.ts`

**Regras:**

- Comparar enunciado e alternativas.
- Considerar normalização de texto.
- Evitar excluir questões sem confirmação.

**Critério de bloqueio (`isBlockingDuplicate`) — ajustado em 2026-06-11:**

- `calculateDuplicateScore` é duplicada localmente em três arquivos: `lib/questions/duplicate-service.ts` (compartilhada por `findBlockingDuplicate`, usada em `generate-ai/route.ts` e `import/save/route.ts`), `app/api/admin/questions/check-duplicate/route.ts` e `app/api/admin/questions/route.ts`.
- **Critério padrão (mantido em todos os fluxos, sem alteração):** bloqueia com base em similaridade de Jaccard — `statementSimilarity >= 0.9`, ou `>= 0.78` com pelo menos 3 alternativas equivalentes, ou `>= 0.72` com 4+ alternativas e `alternativesSimilarity >= 0.9` (ignorando casos genéricos Certo/Errado). Esse critério continua valendo para `/questoes/importar`, `/admin/raio-x-provas`, `/questoes/duplicatas`, `/questoes/gerar-ia`, criação manual em `/questoes/nova` e criação de questão pelo editor de simulado.
- **Exceção — fluxo "Usar como modelo" (`app/questoes/page-client.tsx`, `UseAsTemplateModal`):** o POST para `/api/admin/questions` envia `use_as_template: true`. Apenas nesse caso, `app/api/admin/questions/route.ts` usa `exactMatchOnly` em `calculateDuplicateScore`/`findBlockingDuplicate`, exigindo enunciado normalizado 100% idêntico (`normalizeText`), TODAS as alternativas normalizadas 100% idênticas (mesma quantidade, comparação 1:1 após `normalizeAlternatives` que ordena o array) E mesma `exam_board_id` (banca). Isso evita falso positivo de "questão já existe" ao duplicar uma questão como modelo e alterar seu conteúdo.
- `lib/questions/duplicate-service.ts` e `app/api/admin/questions/check-duplicate/route.ts` permanecem com o critério padrão original, inalterados.
- Ao alterar o critério padrão, replicar em `lib/questions/duplicate-service.ts`, `app/api/admin/questions/check-duplicate/route.ts` e no branch `else` (não-`exactMatchOnly`) de `app/api/admin/questions/route.ts`.

**Bug corrigido (2026-06-12) — `getDuplicatePayload` ignorava questões além da linha 1000:** as buscas em `questions` e `question_alternatives` em `app/api/admin/questions/duplicates/route.ts` não usavam `.range()`, então o limite padrão de 1000 linhas do PostgREST/Supabase truncava o resultado. Com 3.202 questões no banco, as ~2.200 mais recentes (por `created_at`) nunca eram comparadas, deixando duplicatas recentes invisíveis em `/questoes/duplicatas`. Corrigido com paginação em blocos de `FETCH_PAGE_SIZE = 1000` (loop com `.range(from, to)` até a página retornar menos que o tamanho do bloco) para ambas as tabelas.

---

## 4. ALTERNATIVAS / RENDERIZAÇÃO DE QUESTÕES

### 4.1 Renderização de múltipla escolha

**Função:** exibir alternativas com letras e estado visual correto.

**Arquivos onde aparece hoje:**

- `app/questoes/page-client.tsx`
- `app/questoes/revisar/page-client.tsx`
- `app/questoes/[id]/editar/page-client.tsx`
- `app/questoes/[id]/preview/page-client.tsx`
- `app/simulados/[id]/page.tsx`
- `app/simulados/[id]/preview/page-client.tsx`
- `app/meus-simulados/[id]/page-client.tsx`
- `app/meus-simulados/[id]/resultado/page-client.tsx`
- `app/lib/pdf/simulado-result-pdf.ts`

**Regra oficial:**

- Múltipla escolha deve mostrar letras A/B/C/D/E.
- A letra deve seguir o mesmo padrão visual em Questões, Revisar Questões, Preview e Execução.
- Alternativa correta, quando exibida em modo admin/revisão/resultado, deve ter corujinha.

**Ponto de risco:**

- A renderização está duplicada em várias telas. Mudanças futuras devem considerar todas as telas acima.

---

### 4.2 Renderização de Certo/Errado

**Função:** exibir questões Certo/Errado sem tratar como alternativas A/B/C/D.

**Arquivos onde aparece hoje:**

- `app/questoes/page-client.tsx`
- `app/questoes/revisar/page-client.tsx`
- `app/questoes/nova/page-client.tsx`
- `app/questoes/[id]/editar/page-client.tsx`
- `app/questoes/importar/page-client.tsx`
- `app/questoes/gerar-ia/page-client.tsx`
- `app/simulados/[id]/preview/page-client.tsx`
- `app/meus-simulados/[id]/page-client.tsx`

**Regra oficial (atualizada):**

- Certo/Errado deve mostrar apenas `Certo` e `Errado` — nunca A/B/C/D.
- **Layout obrigatório:** Certo à esquerda, Errado à direita, lado a lado (`flex gap-3`).
- **Cores:** Certo correto = verde (`border-emerald-300 bg-emerald-50 text-emerald-800`). Errado correto = vermelho (`border-red-300 bg-red-50 text-red-800`). Não selecionado = neutro (`border-slate-200 bg-slate-50 text-slate-500`).
- **Corujinha:** a alternativa correta exibe `🦉` dentro da bolinha em vez da letra C/E.
- **Modo edição/seleção:** ao clicar numa alternativa assertiva, ela deve se tornar a correta imediatamente (usando `markCorrect` no InlineEditor ou `setAnswerDraft` no card view).
- **Detecção:** função `isTrueFalseQuestion(question)` detecta por `question_type === "true_false"` OU 2 alternativas com labels "c"/"certo" e "e"/"errado".
- **Implementado em:** card VIEW + modo "Mudar resposta" do `page-client.tsx` de Questões; bloco `InlineQuestionEditor` do mesmo arquivo.
- **Pendente de padronização:** `revisar/page-client.tsx`, `simulados/[id]/preview/page-client.tsx`, `meus-simulados/[id]/page-client.tsx` (fora do escopo atual).

---

### 4.3 Tesourinha para cortar alternativas

**Função:** permitir cortar visualmente uma alternativa sem selecionar resposta.

**Arquivos onde deve existir:**

- `app/questoes/page-client.tsx`
- `app/questoes/revisar/page-client.tsx`
- `app/questoes/[id]/editar/page-client.tsx`
- `app/simulados/[id]/preview/page-client.tsx`
- `app/meus-simulados/[id]/page-client.tsx`

**Regra oficial:**

- Deve ser um botão real.
- Deve usar `stopPropagation` quando estiver dentro de área clicável.
- Não pode marcar resposta.
- Deve aplicar risco/opacidade no conteúdo da alternativa.
- Deve funcionar em todas as telas acima, não apenas em Revisar Questões.

**Checklist:**

- [ ] Funciona em Questões.
- [ ] Funciona em Revisar Questões.
- [ ] Funciona em Editar Questão.
- [ ] Funciona no Preview do Simulado.
- [ ] Funciona no Simulado do Aluno.

---

### 4.4 Corujinha da alternativa correta

**Função:** marcar visualmente a alternativa correta com corujinha.

**Arquivos afetados:**

- `app/questoes/page-client.tsx`
- `app/questoes/revisar/page-client.tsx`
- `app/questoes/[id]/editar/page-client.tsx`
- `app/simulados/[id]/page.tsx`
- `app/simulados/[id]/preview/page-client.tsx`
- `app/meus-simulados/[id]/resultado/page-client.tsx`

**Regra:**

- Em áreas administrativas, a alternativa correta pode ser indicada por corujinha.
- Em execução de prova, a corujinha só deve aparecer se a configuração permitir feedback/gabarito.
- Em questões assertivas (Certo/Errado), a corujinha aparece **dentro da bolinha** substituindo a letra C/E quando a alternativa é a correta.
- Constante: `OWL_MARK = "\u{1F989}️"` — definida no topo do arquivo `page-client.tsx` de cada módulo.

---

## 5. FILTROS E BUSCAS

### 5.1 Filtros do Banco de Questões

**Arquivos:**

- `app/questoes/page-client.tsx`
- `app/questoes/page.tsx`
- `app/components/questions/SubjectMultiSelect.tsx`

**Regras:**

- Busca considera código, nome/enunciado e texto relevante.
- Assuntos permitem múltipla seleção (multi-select com busca).
- **Banca permite múltipla seleção** (multi-select com busca — `BoardFilterDropdown`, atualizado 2026-05-28).
- **Dificuldade permite múltipla seleção** (multi-select com checkboxes, inline no componente).
- **Ano permite múltipla seleção** (`YearFilterDropdown`, atualizado 2026-05-28).
- **Disciplina e Status:** single-select via `SimpleSelectDropdown` (dropdown customizado dark premium — substituídos de `<select>` nativo em 2026-05-29). Mesma aparência visual dos demais filtros.
- **`SimpleSelectDropdown`:** componente local (duplicado em `questoes/page-client.tsx` e `questoes/revisar/page-client.tsx`). Props: `label`, `value`, `onChange`, `options: { value, label }[]`. Fecha ao selecionar. Checkmark laranja na opção ativa. Sem Limpar/Aplicar. **Deve ser usado para TODOS os selects nessas páginas — nenhum `<select>` nativo deve aparecer no tema dark.** Em `page-client.tsx`, cobre: Tipo, Disciplina, Banca (no `InlineQuestionEditor`) + Status (nos filtros). Em `revisar/page-client.tsx`, cobre: Tipo, Disciplina, Banca (no `ReviewQuestionCard`) + Status (nos filtros de topo).
- Contagem por assunto, disciplina, banca e ano respeitam os filtros ativos (cascata).
- **Ordem dos filtros (atualizada 2026-06-11):** busca → disciplina → assunto → banca → (segunda linha) órgão → ano → dificuldade → status.
- **Grid de filtros (atualizado 2026-05-29):** ambas as linhas usam `grid gap-4 md:grid-cols-2 xl:grid-cols-4`, produzindo colunas de largura igual e alinhamento visual perfeito. A busca não tem mais a largura inflada do padrão anterior `lg:grid-cols-[minmax(260px,1.25fr)_repeat(3,minmax(0,1fr))]`.
- **Regra de alinhamento:** todo grid de filtros deve usar colunas iguais — proibido usar `minmax(260px,...) repeat(N,...)`. Aplicar: 4 itens → `md:grid-cols-2 xl:grid-cols-4`; 3 itens → `md:grid-cols-3`; 2 itens → `md:grid-cols-2`.
- Todos os status incluindo `pending_review` são carregáveis no Banco de Questões.
- Sem limite artificial: `page.tsx` usa `fetchAllQuestionPages()` com loop de 1000/página.
- Anos disponíveis no dropdown são calculados respeitando todos os outros filtros ativos.
- `yearCounts` (adicionado 2026-06-11) — contagem por ano, respeita tudo exceto ano. Exibida como badge em cada opção do `YearFilterDropdown`, mesmo padrão de `boardCounts`/`subjectCounts`.
- Estados: `boardIds: string[]`, `yearFilters: string[]`, `difficultyLevels: string[]`, `subjectIds: string[]`.
- URL params: `banca`, `ano`, `dificuldade`, `assunto` são todos multi-value (append).
- Container de filtros **não deve usar `overflow-hidden`** — ver seção 14.5.



**Padronização visual oficial dos filtros/cards dark — 2026-06-11:**

As telas dark de Questões, Revisar Questões e o seletor de questões dentro de Editar Simulado devem usar o padrão visual da tela `/questoes/revisar` como referência de largura e campos.

**Container da página/listagem:**
- Usar largura total da área útil do admin, sem `max-w-7xl`/container estreito quando a tela for operacional de banco/revisão.
- Padding base: `px-4 pb-20 pt-6 md:px-8 md:pt-10`.
- Fundo: `#07111F`.

**Card de filtros:**
- `relative z-20 mb-6 rounded-[1.75rem] border border-white/[0.07] bg-white/[0.03] p-5 shadow-xl shadow-black/20 backdrop-blur-sm md:p-6`.
- Grid: `grid gap-4 md:grid-cols-2 xl:grid-cols-4`.
- Não usar `overflow-hidden` em card que contém dropdown.

**Labels de filtro:**
- `mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40`.

**Inputs/selects/dropdowns fechados:**
- Altura: `h-12`.
- Radius: `rounded-2xl`.
- Fundo: `bg-[#0D1926]`.
- Borda: `border-white/[0.08]`.
- Texto: `text-sm font-semibold text-white/80`.
- Hover: `hover:border-white/[0.15]`.
- Foco: `focus:border-orange-400/40 focus:ring-2 focus:ring-orange-400/[0.08]`.
- Não usar `hover:-translate-y-0.5` em campos de filtro; campos devem ficar estáveis.

**Menus dropdown:**
- Fundo: `#0D1B2E`.
- Borda: `border-white/[0.09]`.
- Sombra: `shadow-2xl shadow-black/50`.
- `z-[9999]` ou maior, sem wrapper pai com z-index que crie stacking problemático.

**Cards de questão:**
- Devem ocupar toda a largura útil da tela operacional.
- Usar padrão gold standard dark: `rounded-[2rem] border border-white/[0.07] bg-white/[0.03] shadow-xl shadow-black/30 backdrop-blur-sm`.
- Espaço vertical entre cards: `gap-4` ou `space-y-5`, conforme a lista, mantendo respiro de aproximadamente 16–20px.

**Arquivos sincronizados nesta padronização:**
- `app/questoes/page-client.tsx` — removido container estreito `max-w-7xl`; filtros/campos alinhados ao padrão oficial.
- `app/questoes/revisar/page-client.tsx` — filtros reafirmados como padrão oficial.
- `app/simulados/[id]/editar/page-client.tsx` — modal Selecionar Questões alinhado ao mesmo padrão de filtros.

**Regra permanente:** ao alterar filtros/cards em uma dessas três áreas, conferir e manter paridade visual nas outras duas.


**Mapa de todas as seções de filtro no sistema (atualizado 2026-05-29):**

| Página | Arquivo | Itens | Grid | Observação |
|---|---|---|---|---|
| Banco de Questões | `questoes/page-client.tsx` | 4+4 (2 linhas) | `md:grid-cols-2 xl:grid-cols-4` | Linha 1: busca/disciplina/assunto/banca · Linha 2: órgão/ano/dificuldade/status |
| Revisar Questões | `questoes/revisar/page-client.tsx` | 4+4 (2 linhas) | `md:grid-cols-2 xl:grid-cols-4` | Mesmo padrão de Questões |
| Simulados | `simulados/page-client.tsx` | 4 | `md:grid-cols-2 xl:grid-cols-4` | Busca/Status/Disciplina/Jornada — `SimpleSelectDropdown` (atualizado 2026-06-11) |
| Jornadas | `admin/jornadas/page-client.tsx` | tabs | `sm:grid-cols-4` | Status-tabs (não dropdown) — não é filtro convencional |
| Alunos | `admin/alunos/page-client.tsx` | tabs | `sm:grid-cols-2 xl:grid-cols-4` | Abas de status + busca textual — não é grid de filtros dropdown |

**Regra de alinhamento de filtros (implementada 2026-05-29):** nunca usar `lg:grid-cols-[minmax(260px,1.25fr)_repeat(N,...)]`. Usar sempre colunas iguais: 4 itens → `md:grid-cols-2 xl:grid-cols-4`; 3 itens → `md:grid-cols-3`; 2 itens → `md:grid-cols-2`.

**Funções internas relevantes:**

- `stripHtml(html)` — definida antes de `questionMatchesFilters` em `questoes/page-client.tsx`. Remove tags HTML e decodifica entidades (`&nbsp;`, `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`). Usada dentro de `questionMatchesFilters` para tornar o enunciado pesquisável mesmo com formatação rich text.
- `questionMatchesFilters(question, opts)` — helper centralizado de filtro, definido antes do componente em `page-client.tsx`. Usa `stripHtml(question.statement || "")` no `searchable` (corrigido 2026-05-29).

**Bug corrigido (2026-06-12) — busca não encontrava texto presente apenas em alternativas:** `searchable` em `questionMatchesFilters` incluía apenas `questionCode`, `title`, `name`, `orgao` e `stripHtml(statement)`. Texto presente somente no enunciado de uma alternativa (ex: a alternativa correta de uma questão criada via "Usar como modelo") não era pesquisável, mesmo a questão estando `published`. Corrigido: `searchable` agora também inclui `stripHtml(alt.text)` de cada item em `question.question_alternatives`.
- `disciplineCounts` — contagem por disciplina, respeita apenas busca.
- `boardCounts` — contagem por banca, respeita busca + disciplina + outros (exceto banca).
- `subjectCounts` — contagem por assunto, respeita tudo exceto assunto.
- `availableYears` — anos disponíveis, respeita todos os filtros exceto ano.

**Componentes com busca em enunciado (HTML) — inventário de `stripHtml`/`normalize`:**

| Arquivo | Função/Variável | Trata HTML? |
|---|---|---|
| `questoes/page-client.tsx` | `questionMatchesFilters` → `stripHtml()` | ✅ tags + entidades |
| `questoes/revisar/page-client.tsx` | `stripHtml()` (já existia) | ✅ tags + entidades |
| `simulados/[id]/editar/page-client.tsx` | `stripHtml(question.statement)` | ✅ tags + entidades |
| `components/questions/QuestionTemplatePicker.tsx` | `normalize()` | ✅ tags + entidades (entidades adicionadas 2026-05-29) |

---

### 5.1.1 Barra de ordenação por ano (adicionada 2026-06-04)

**Presente em:**
- `app/questoes/page-client.tsx` — posicionada entre o card de filtros e o seletor "Uma por vez / Múltiplas"
- `app/questoes/revisar/page-client.tsx` — posicionada entre o dashboard de métricas e a lista de questões

**Estado:** `sortOrder: "newest" | "oldest"` — `useState("newest")` puro, sem URL param, sem localStorage. Reseta ao navegar para outra rota e voltar.

**Opções:** "Mais recentes" (ano descendente, padrão) · "Mais antigas" (ano ascendente)

**Campo de sort:** `question.year` (número inteiro). Questões sem `year` são enviadas para o final em ambos os modos.

**Comportamento:**
- Sort aplicado dentro do `filteredQuestions`/`filteredQueue` useMemo — `sortOrder` é dependência.
- Mudança de `sortOrder` reseta `currentPage` para 1 (via useEffect de paginação).
- Não persiste em URL — trocar filtros com sort ativo mantém o sort; sair e voltar reseta para "Mais recentes".
- Em `questoes/page.tsx` o order server-side foi simplificado para `created_at DESC` fixo (o sort de exibição é 100% client-side por `year`).

**Visual:** card `rounded-[2rem] border border-white/[0.07] bg-white/[0.03]` com ícone `Calendar` + label "Ordenar por ano" à esquerda; toggle de dois botões `rounded-xl bg-white/[0.04] p-1` à direita. Ativo: `bg-orange-500 shadow-orange-500/30`. Inativo: `text-white/40 hover:bg-white/[0.06]`.

---

### 5.2 Filtros de Revisar Questões

**Arquivos:**

- `app/questoes/revisar/page-client.tsx`
- `app/api/admin/questions/route.ts`

**Regras:**

- A lógica deve ser compatível com Banco de Questões.
- Se filtros forem unificados, testar as duas telas.
- **Filtro de assunto usa `FilterSubjectDropdown`** — componente local **multi-select** com busca e draftIds. Aceita prop `counts: Record<string, number>` para exibir badge de contagem por assunto. Estado: `filterSubjectIds: string[]`. Posicionado na primeira linha, entre Disciplina e Banca (atualizado 2026-06-11).
- **Filtro de banca usa `BoardFilterDropdown`** — componente local multi-select com busca. Aceita prop `counts: Record<string, number>` para exibir badge de contagem por banca. Estado: `filterBoardIds: string[]`.
- **Filtro de órgão usa `OrgaoFilterDropdown`** — componente local multi-select com busca. Estado: `filterOrgaos: string[]`. Posicionado no início da segunda linha (atualizado 2026-06-11).
- **Filtro de ano usa `YearFilterDropdown`** — componente local multi-select. Estado: `filterYears: string[]`. Aceita prop `counts: Record<string, number>` (adicionado 2026-06-11) para exibir badge de contagem por ano, mesmo padrão de `BoardFilterDropdown`/`FilterSubjectDropdown`. Posicionado na segunda linha, após Órgão.
- **Contadores de questões (atualizado 2026-06-11):** `disciplineCounts`, `boardCounts`, `subjectCounts`, `orgaoCounts`, `yearCounts` computados via `useMemo` — mesmo padrão do Banco de Questões. `disciplineCounts` filtra apenas por busca; cada um dos demais filtra por tudo exceto o próprio campo.
- Todos os filtros usam arrays (`string[]`) e URL params com `append` (multi-valor). Padrão idêntico ao Banco de Questões.
- Container de filtros **não deve usar `overflow-hidden`** — ver seção 14.5.

---

### 5.3 Filtros de Simulados

**Arquivos:**

- `app/simulados/page-client.tsx`
- `app/api/admin/simulados/route.ts`
- `app/api/admin/simulated-tests/route.ts`

**Detalhes:**

- Componente de filtro: `FilterPanel` (definido localmente em `simulados/page-client.tsx`).
- 4 itens: Busca (texto) · Status · Disciplina · Jornada.
- Grid (atualizado 2026-06-11): `grid gap-4 md:grid-cols-2 xl:grid-cols-4` — 4 colunas iguais.
- **Status, Disciplina e Jornada usam `SimpleSelectDropdown`** (atualizado 2026-06-11) — mesmo componente dropdown customizado dark premium do Banco de Questões (`Check`/`ChevronDown` de `lucide-react`, menu `absolute z-[9999]`). Duplicado localmente em `simulados/page-client.tsx`. Antes usavam `<select>` nativo.
- Container `<section>` do `FilterPanel` usa `relative z-20 overflow-visible` (não usar `isolate` nem `overflow-hidden`) para que o menu `z-[9999]` do dropdown fique acima da listagem de cards abaixo — ver seção 14.5.

**Regras:**

- Busca/listagem não deve limitar artificialmente os resultados quando houver mais dados.
- Card do simulado deve ser clicável.

---

### 5.4 Painel "Distribuição por assunto" (adicionado 2026-06-11)

**Função:** quadro no lado direito mostrando a quantidade de questões vinculadas ao simulado, agrupadas por assunto (mesmo padrão visual de barra do `SelecaoStatusBar`).

**Arquivos:**

- `app/simulados/[id]/page.tsx` — server component. Computa `subjectDistribution` a partir de `questions[].questions.subjects.name` (via `normalizeSubjectDisplayName`, copiada localmente — função pura sem hooks). Renderizado como card extra no `<aside>`, entre "Insights" e `SimuladoDetailActions`, com o mesmo estilo `overflow-hidden rounded-[1.55rem] border border-slate-900 bg-slate-950 ... ring-1 ring-orange-400/20`.
- `app/simulados/[id]/editar/page-client.tsx` — `currentSubjectDistribution` (`useMemo`, depende de `relations`), definido logo após `subjectCounts`. Renderizado em novo `SidebarPanel` ("Banco de Questões" / "Distribuição por assunto"), entre "Performance e Analytics" e "Ações Rápidas".

**Regras:**

- Distribuição calculada a partir das questões **atualmente vinculadas** ao simulado (`relations`/`simulado_questions`), não da seleção do modal "Selecionar questões" (esse painel já existia, em `SelecaoStatusBar`, e não foi alterado).
- Nomes de assunto normalizados com `normalizeSubjectDisplayName`; sem assunto → "Sem assunto".
- Não confundir com "Desempenho por assunto" (`preview/page-client.tsx`, `SimuladoPdfReport.tsx`) — feature distinta de performance do aluno, não tocada.

---

## 6. SELEÇÃO EM MASSA

### 6.1 Seleção em massa de Questões

**Arquivos:**

- `app/questoes/page-client.tsx`
- `app/components/ui/SelectionGhostBar.tsx`
- `app/components/questions/QuestionActionModal.tsx`
- `app/api/admin/questions/bulk/route.ts`
- `app/api/admin/simulados/[id]/questions/route.ts`

**Funções esperadas:**

- Selecionar questão individual.
- Selecionar todas visíveis.
- Editar selecionadas em massa.
- Adicionar selecionadas ao simulado.
- Excluir selecionadas.
- Despublicar/enviar para rascunho.
- Atualizar tela imediatamente após salvar.

---

### 6.2 Seleção em massa na Importação / IA

**Arquivos:**

- `app/questoes/importar/page-client.tsx`
- `app/questoes/gerar-ia/page-client.tsx`
- `app/components/ui/SelectionGhostBar.tsx`

**Regra:**

- Manter padrão visual e comportamental da barra fantasma.

---

## 7. SIMULADOS

### 7.1 Listagem de Simulados

**Arquivos:**

- `app/simulados/page-client.tsx`
- `app/simulados/page.tsx`
- `app/simulados/components/SimuladoCard.tsx`
- `app/api/admin/simulados/route.ts`

**Regras:**

- Card deve ser clicável.
- Botões internos devem continuar funcionando.
- Botão `Incluir em Jornada` deve continuar disponível na listagem.
- Visual deve seguir interface escura de simulados quando aplicável.

---

### 7.2 Detalhe do Simulado

**Arquivos:**

- `app/simulados/[id]/page.tsx`
- `app/simulados/[id]/editar/page-client.tsx`
- `app/simulados/[id]/preview/page-client.tsx`
- `app/api/admin/simulados/[id]/route.ts`
- `app/api/admin/simulados/[id]/questions/route.ts`
- `app/api/admin/simulados/[id]/questions/reorder/route.ts`

**Regras:**

- Deve listar questões do simulado com renderização consistente.
- Botão `Gerenciar/Editar` não deve perder retorno ao detalhe quando combinado com Jornada.
- Reordenação deve preservar ordem correta.
- **Seletor de questões na edição (atualizado 2026-06-10):** cada card do modal **Selecionar questões** deve exibir, no rodapé do card, o histórico de simulados aos quais aquela questão já pertenceu/pertence. A informação deve ser discreta, em tamanho menor, usando os dados de `question.simulado_questions[].simulados` já carregados em `app/simulados/[id]/editar/page.tsx`. Não alterar botões, filtros, seleção, gabarito, tags ou renderização das alternativas para esse ajuste.
- **Filtro do seletor de questões (corrigido 2026-06-10):** o modal **Selecionar questões** deve usar a mesma lógica de assunto/disciplina do Banco de Questões: considerar tanto `questions.subject_id` quanto os vínculos em `question_subjects`. As questões já vinculadas ao simulado atual continuam visíveis no resultado dos filtros, marcadas como **Já vinculada**, porém não podem ser selecionadas novamente. Não voltar a filtrar a lista por `usedIds`, pois isso causa divergência entre `/questoes` e o seletor do simulado.

---

### 7.3 Preview do Simulado

**Arquivos:**

- `app/simulados/[id]/preview/page-client.tsx`
- `app/simulados/[id]/preview/page.tsx`
- `app/simulados/[id]/preview/SimuladoPdfReport.tsx`

**Regras:**

- Deve simular experiência do aluno.
- Alternativas devem seguir padrão visual de Questões/Revisar.
- Tesourinha deve funcionar.
- Feedback imediato deve respeitar configuração do simulado.
- Anti-cheat/visibilidade deve continuar funcionando.
- Resultado/PDF não devem quebrar ao alterar renderização de alternativas.

---

### 7.4 Execução do Simulado pelo Aluno

**Arquivos:**

- `app/meus-simulados/[id]/page-client.tsx`
- `app/meus-simulados/[id]/page.tsx`
- `app/api/student/simulados/[id]/route.ts`
- `app/api/student/simulados/[id]/attempts/route.ts`
- `app/api/student/simulados/[id]/attempts/[attemptId]/answers/route.ts`
- `app/api/student/simulados/[id]/attempts/[attemptId]/submit/route.ts`
- `app/api/student/simulados/[id]/attempts/[attemptId]/focus-violation/route.ts`

**Regras:**

- Alternativas devem seguir padrão visual comum.
- Tesourinha deve funcionar sem selecionar alternativa.
- Caderno de anotações deve estar visível durante a resolução.
- Anti-cheat não pode ser quebrado.
- Salvamento de resposta deve continuar funcionando.
- Finalização deve preservar cálculo de nota.

---

### 7.5 Resultado do Simulado

**Arquivos:**

- `app/meus-simulados/[id]/resultado/page-client.tsx`
- `app/meus-simulados/[id]/resultado/page.tsx`
- `app/api/student/simulados/[id]/resultado/route.ts`
- `app/lib/pdf/simulado-result-pdf.ts`

**Regras:**

- Resultado deve mostrar resposta do aluno e gabarito conforme configuração.
- PDF deve continuar refletindo acertos, erros, brancos e comentários.

---

## 8. CADERNO DE ANOTAÇÕES

**Função:** permitir que o aluno faça anotações durante o simulado e veja depois em Minhas Anotações, classificadas pelo simulado.

**Arquivos conhecidos/esperados:**

- `app/meus-simulados/[id]/page-client.tsx`
- possíveis rotas API de anotações, se presentes no projeto atual;
- futura página de `Minhas anotações`, se implementada.

**Regra oficial:**

- O caderno deve aparecer durante a resolução do simulado.
- Deve abrir sem interromper a prova.
- Deve salvar por aluno e por simulado.
- Deve ficar disponível posteriormente em área própria.

**Checklist:**

- [ ] Botão/ícone aparece durante o simulado.
- [ ] Abre modal/painel de anotação.
- [ ] Permite escrever.
- [ ] Salva.
- [ ] Não marca resposta.
- [ ] Não interfere no cronômetro.

---

## 9. JORNADAS

### 9.1 Listagem de Jornadas

**Arquivos:**

- `app/admin/jornadas/page-client.tsx`
- `app/admin/jornadas/page.tsx`
- `app/api/admin/jornadas/route.ts`

**Regras:**

- Card inteiro deve ser clicável.
- Botões internos devem preservar comportamento.
- Status deve respeitar `draft`, `published`, `archived`.
- Visual deve seguir interface escura de Jornada.

---

### 9.2 Detalhe da Jornada

**Arquivos:**

- `app/admin/jornadas/[id]/page-client.tsx`
- `app/admin/jornadas/[id]/page.tsx`
- `app/admin/jornadas/utils.ts`
- `app/admin/jornadas/types.ts`

**Funções:**

- hero premium;
- métricas superiores;
- simulados vinculados;
- dias de liberação;
- alunos matriculados;
- atribuir aluno;
- cancelar matrícula;
- adicionar dias;
- progresso geral;
- atividade recente;
- configurações;
- footer dark coerente.

**Regras:**

- Publicar Jornada não exige simulado vinculado, conforme decisão atual do projeto.
- Validações de publicação:
  - nome não vazio;
  - duração válida;
  - se houver data de prova, data efetiva não pode estar no passado.
- Duração deve ser configurada/exibida em dias quando essa for a decisão atual da sprint.
- Jornada pode ser Geral ou vinculada a concurso específico.

---

### 9.2.1 Duração × Janela de liberação (Sprint 2026-07-13)

**Regra central:** dois conceitos independentes.
- `jornadas.duration_days` → **validade da matrícula** (expiração / até quando o aluno acessa). NÃO participa mais da distribuição dos simulados.
- `jornadas.release_duration_days` (**novo**, migration `20260713150000_add_jornada_release_duration.sql`) → **janela de liberação** dos simulados, quando NÃO há data da prova. Sempre preenchido (backfill = `coalesce(duration_days, duration_months*30)`), NOT NULL, `> 0`.

**Cálculo (fonte única):** `calcReleaseSchedule` em `app/admin/jornadas/utils.ts` (usada pela atribuição `students/route.ts` e pelo recálculo em `[id]/route.ts` — a cópia local da atribuição foi removida). Intervalo = janela / (total_simulados − 1): 1º simulado no dia 0, último no último dia permitido; 1 simulado (ou janela ≤ 0) libera tudo na entrada.

**Data da prova é soberana:** com `exam_date`, a distribuição usa `exam_date − 7` (D-7) e ignora `release_duration_days` (campo desabilitado nos forms, com aviso). Entrada faltando < 7 dias → libera todos imediatamente.

**Validação:** sem data da prova, `release_duration_days <= duration_days − 7` (POST e PATCH; e no cliente nos dois forms). Com data da prova, a validação é ignorada.

**Recálculo:** ao alterar `exam_date` ou `release_duration_days` de jornada com alunos, o PATCH recalcula (síncrono) o `scheduled_release_at` **apenas** dos `student_jornada_simulados` com status `locked` de matrículas ativas; concluídos/iniciados/liberados são preservados (`recalcFutureSchedules`). Ao alterar `duration_days`, o PATCH recalcula o `expires_at` (validade da matrícula = `started_at + duration_days`) de todas as matrículas **ativas** (`recalcEnrollmentExpirations`) — sem isso, a mudança de duração não propagava para quem já estava matriculado (o `expires_at` fica congelado no valor da inserção).

**Manutenção:** todo cálculo de cronograma deve usar `calcReleaseSchedule`; nunca derivar distribuição de `duration_days`/`duration_months`. Cron (`release-job`) e e-mails usam o `scheduled_release_at` já gravado — não recalculam.

### 9.3 Criar / Editar Jornada

**Arquivos:**

- `app/admin/jornadas/nova/page-client.tsx`
- `app/admin/jornadas/[id]/editar/page-client.tsx`
- `app/admin/jornadas/[id]/simulados/*` quando existir
- `app/api/admin/jornadas/[id]/route.ts`
- `app/api/admin/jornadas/[id]/simulados/route.ts`
- `app/api/admin/jornadas/[id]/simulados/reorder/route.ts`

**Regras:**

- Ao salvar edição, voltar para a tela de ver Jornada.
- Permitir quantidade planejada de simulados.
- Cálculo das liberações deve usar quantidade planejada quando necessário.
- Se aluno entra faltando menos de 7 dias para a prova, liberar todos os simulados de uma vez.
- Reordenação de simulados da Jornada usa `PATCH /api/admin/jornadas/[id]/simulados/reorder` com IDs dos vínculos em `jornada_simulados`. Como existe `UNIQUE(jornada_id, order_number)`, a API deve atualizar em duas fases: primeiro mover todos para uma faixa provisória positiva e única, depois gravar `1..N`. Nunca atualizar trocas de posição diretamente em paralelo, pois isso pode gerar conflito temporário e a ordem não persistir.

**Tela `/admin/jornadas/[id]/editar` — regra visual atualizada em 2026-07-08:**

- A edição da Jornada usa `PageBackground`, `PageHeader`, `PremiumCard` e `PremiumInput` com `variant="jornada"`.
- A aba **Informações** deve usar cards, campos, seletores de tipo/categoria, alertas e botão de salvar no padrão dark premium.
- A aba **Simulados** deve usar cards dark para a lista reordenável, banco de simulados, busca, botões de incluir e botão de salvar ordem.
- Ao alterar a reordenação, manter a regra funcional de voltar para a tela de detalhe após salvar, sem alterar rotas/APIs.
- Não aplicar `PageBackground` light ou componentes sem variante dark nessa tela.

**Tela `/admin/jornadas/nova` — regra visual atualizada em 2026-06-09:**

- A criação da Jornada deve manter o visual premium dark com hero, stepper e card lateral de resumo.
- A alteração dessa tela deve ser considerada alteração de `Interface escura de Jornada`; portanto, ao mexer nela, testar também se o shell/footer dark permanece coerente.
- O fluxo funcional permanece: criar como rascunho, enviar os dados para `/api/admin/jornadas`, depois redirecionar para a edição para adicionar simulados.
- Campos obrigatórios e validações de frontend preservados: nome obrigatório, concurso obrigatório quando `scope_type = contest`, duração em dias maior que zero e quantidade planejada maior que zero.

---

### 9.4 Alunos na Jornada

**Arquivos:**

- `app/admin/jornadas/[id]/page-client.tsx`
- `app/admin/alunos/[id]/page-client.tsx`
- `app/api/admin/jornadas/[id]/students/route.ts`
- `app/api/admin/jornadas/[id]/students/[studentId]/route.ts`

**Regras:**

- Deve permitir atribuir aluno dentro da Jornada.
- Matrícula cancelada não bloqueia nova inserção: alunos com `student_jornadas.status = "cancelled"` voltam a aparecer nos fluxos de atribuição da mesma Jornada, e o `POST /api/admin/jornadas/[id]/students` deve reativar/recriar o cronograma dessa matrícula cancelada em vez de retornar duplicidade.
- Perfil do aluno deve permitir gerenciar Jornadas em modal único: visualizar matrículas atuais, remover/cancelar matrícula com confirmação e inserir/reinserir o aluno em Jornadas publicadas disponíveis.
- Perfil do aluno deve ter aba/seção de Jornadas.
- Dentro da Jornada do aluno, deve exibir:
  - data de entrada;
  - status da matrícula;
  - data de expiração;
  - datas previstas de liberação por simulado;
  - datas reais de liberação;
  - simulados resolvidos;
  - nota/desempenho;
  - simulados disponíveis, bloqueados, atrasados e pendentes.

---

### 9.4.1 Integridade central das contas de alunos — 2026-07-13

**Fonte de identidade:** o UUID compartilhado entre `auth.users`, `public.profiles` e `public.students`. E-mail, nome, CPF e telefone são atributos mutáveis; vínculos acadêmicos nunca são recriados por e-mail.

**Serviço central:** `lib/server/studentAccountService.ts` concentra criação/reconciliação, rollback compensatório, validação final de integridade, sincronização de e-mail e contrato sanitizado de erros. É usado por `POST /api/admin/students/create`, `POST /api/auth/confirm-registration`, `PATCH /api/admin/students/[id]` e pela validação anterior a `POST /api/admin/students/[id]/approve`.

**Contrato de erro:** `{ ok:false, code, message, field?, fields? }`. No cadastro público, a ausência de um ou vários campos obrigatórios é retornada em `fields`; a interface lista todos os campos ausentes, destaca-os simultaneamente e remove o destaque individual quando o aluno começa a corrigi-lo. Duplicidades informam explicitamente se o conflito envolve e-mail, CPF ou ambos, sem expor valores ou dados da conta existente. Erros brutos do Supabase/SQL não devem ser enviados ao frontend.

**Código incorreto no cadastro público:** `POST /api/auth/confirm-registration` responde explicitamente que o código está incorreto, cria e envia automaticamente um novo código de 6 dígitos, invalida o anterior somente após o envio e orienta a interface a limpar o campo (`000000` volta a ser apenas o placeholder). Reenvios automáticos repetidos respeitam intervalo mínimo de 60 segundos para evitar abuso de e-mail; durante o intervalo, o usuário deve usar o código mais recente recebido.

### Política central de senhas definitivas (2026-07-13)

- Fonte única: `lib/auth/passwordPolicy.ts`, módulo puro compartilhado por frontend e backend. Regras: 8–64 caracteres, maiúscula, minúscula, número, símbolo Unicode, ausência de três dígitos adjacentes crescentes/decrescentes, ausência de três caracteres idênticos consecutivos e ausência de nome, identificador do e-mail, CPF ou telefone normalizados.
- Componente visual: `app/components/auth/PasswordRequirements.tsx`. Exibe desde o início todas as regras com ícones e texto acessível; estados atendido, pendente e não permitido não dependem apenas de cor. Violações retornadas pelo servidor prevalecem sobre a avaliação local.
- Telas integradas: `/alterar-senha`, `/primeiro-acesso` e `/redefinir-senha`. O botão permanece desabilitado enquanto a política ou a confirmação não forem válidas. Mostrar/ocultar senha continua disponível para senha e confirmação.
- APIs com validação definitiva: `POST /api/auth/complete-password-change`, `POST /api/auth/first-access` e `POST /api/auth/reset-password`. O contexto pessoal é carregado pelo servidor por `lib/server/passwordPolicyContext.ts`, usando o UUID autenticado ou associado ao token; dados pessoais enviados pelo navegador não são usados como fonte de autorização/validação.
- `/redefinir-senha` não chama mais `supabase.auth.updateUser({ password })` diretamente; envia a sessão de recuperação ao endpoint próprio, que valida e atualiza o usuário no Auth Admin.
- `/redefinir-senha` inicializa a sessão antes de liberar o formulário: processa callback PKCE (`code`), `token_hash` de tipo `recovery`, retorno implícito no hash e o evento `PASSWORD_RECOVERY`; também recupera a sessão já persistida caso o cliente Supabase tenha consumido o callback antes do efeito da página. Após aceitar a sessão, remove os parâmetros sensíveis da URL.
- Senhas temporárias: `lib/utils/password.ts` é o gerador oficial. Usa `crypto.randomInt`, garante no mínimo 12 caracteres, inclui obrigatoriamente todas as classes e valida o resultado na política central. `app/lib/utils/password.ts` apenas reexporta a implementação oficial.
- Segurança: senha e confirmação não são gravadas em logs, atividades, banco próprio, URL ou resposta JSON. O reset administrativo deixou de retornar a senha temporária no JSON; o envio existente por e-mail foi preservado.
- No cadastro administrativo `/admin/alunos/[id]`, a **Zona de perigo** oferece a ação confirmada **Resetar senha** antes de desativar e excluir. `POST /api/admin/students/[id]/reset-password` invalida a senha atual com valor temporário criptograficamente seguro, marca `must_change_password`, envia um link de 24 horas para `/primeiro-acesso` e nunca retorna a senha ao navegador. Tokens desse reset carregam `preserve_account_status = true`: ao definir a nova senha, `POST /api/auth/first-access` preserva `students.status` e `profiles.is_active`, impedindo que recuperação de senha reative aluno bloqueado, inativo ou pendente.
- Antes de gerar um reset administrativo, todos os links `first_access` ainda abertos daquele aluno são invalidados. O e-mail de redefinição recebe assunto com data e hora da solicitação para evitar que clientes de e-mail agrupem o novo botão com mensagens antigas; somente o link do envio mais recente permanece utilizável.
- Reutilização: o Supabase Auth não oferece comparação segura com a senha anterior sem nova autenticação; não foi criado hash paralelo nem histórico em texto puro. As demais regras são obrigatórias. Não existe blacklist de senhas comuns nem expiração periódica.
- Fluxo de perfil: não há atualmente tela/modal de alteração voluntária de senha dentro do perfil. Qualquer fluxo futuro em que o usuário escolha senha deve usar o mesmo módulo e componente.
- Testes: `tests/password-policy/password-policy.spec.ts` cobre composição, limites, sequências, repetição Unicode, dados pessoais, exemplos de aceitação, gerador temporário, integração estática dos três backends/frontends e ausência de senha em respostas/logs.

### Recuperação de senha restrita a alunos aprovados (2026-07-13)

- `/esqueci-senha` não chama o Supabase Auth diretamente. A solicitação passa por `POST /api/auth/forgot-password`, que só envia o link quando `students.status = active`, `students.approved_at` está preenchido, `profiles.role = student` e `profiles.is_active = true`.
- Contas pendentes, inativas, inexistentes ou com perfil incompatível recebem a mesma resposta pública genérica e não recebem e-mail, evitando enumeração de contas e impedindo que a recuperação contorne a aprovação administrativa.
- O endpoint `POST /api/auth/reset-password` repete a verificação de aprovação antes de alterar a senha no Supabase Auth. Esse fluxo não ativa conta, não altera `students.status` e não modifica `profiles.must_change_password`.
- O redirecionamento do e-mail é sempre `${getPublicAppUrl()}/redefinir-senha`; nunca usa `window.location.origin`, origem da requisição ou fallback para localhost.
- Testes: `tests/password-recovery/password-recovery.spec.ts` cobre elegibilidade, mediação pelo servidor, resposta anti-enumeração, URL pública canônica e a segunda barreira antes da troca da senha.

**Rollback:** criações novas removem, de forma compensatória, confirmação criada pela operação, `students`, `profiles` e Auth quando profile/student ou a validação final falham. Contas preexistentes nunca entram nesse rollback de criação. Alteração de e-mail preserva o UUID, atualiza Auth e `students`, remove confirmações do e-mail anterior e reverte Auth se a persistência em `students` falhar.

**Banco:** `supabase/migrations/20260713090000_student_account_integrity.sql` adiciona unicidade normalizada de e-mail/CPF e views administrativas de diagnóstico. `scripts/sql/student-account-integrity-audit.sql` é somente leitura. `scripts/sql/student-account-integrity-cleanup.sql` é controlado, exclui admins, bloqueia histórico, não remove Auth diretamente e termina em `ROLLBACK` por padrão.

**Regra operacional:** migration e scripts não são executados automaticamente. Primeiro aplicar a migration em janela autorizada, executar a auditoria, revisar cada candidato, reparar UUIDs com histórico e somente então adaptar/autorizar a limpeza. A ausência histórica local da criação de `student_registration_confirmations` permanece uma divergência de baseline a resolver separadamente.

## 9.5 Rotas da área do aluno — pendentes de documentação completa

As rotas abaixo existem no projeto (visíveis no `git status`) mas ainda não têm seção própria neste índice. Documentar ao implementar ou alterar.

| Rota | Localização | Observação |
|---|---|---|
| `/minhas-jornadas` | `app/minhas-jornadas/` | Área do aluno para visualizar jornadas em que está matriculado. |
| `/primeiro-acesso` | `app/primeiro-acesso/` | Onboarding/boas-vindas no primeiro acesso do aluno. |
| `/r/[slug]` | `app/r/` | Shortlinks / redirecionamentos de URL curta. |

**Regra:** ao criar ou alterar qualquer dessas rotas, adicionar a respectiva seção neste índice antes de finalizar a entrega.

---

## 9.6 Modal animado "Como funciona" — Área do Aluno

**Função:** explicar visualmente, em formato de microanimação dentro de modal, a lógica da Área do Aluno: cadastro, inserção em Jornada, simulados dentro da Jornada, liberação gradativa, tela de resultados/diagnósticos e mensagem final da coruja.

**Arquivos envolvidos:**

- `app/components/StudentJourneyExplainerModal.tsx` — componente client do modal informativo, com janela branca premium/glassmorphism claro, exibição de uma imagem por tela, 6 telas manuais baseadas nas imagens `/images/comofunciona/001.png` até `/images/comofunciona/006.png`, navegação por bolinhas, contador discreto, botão lateral esquerdo para voltar, botão lateral direito para avançar e botão final de conclusão; visual premium seguindo o modelo aprovado: overlay escuro com blur, header refinado, modal grande claro com cantos generosos, imagem oficial exibida diretamente na área central sem molduras internas extras, setas laterais flutuantes, indicadores inferiores em cápsula e transição manual em fade/blur/scale premium.
- `app/components/AppShell.tsx` — mantém o estado `journeyExplainerOpen` apenas na área do aluno, renderiza o modal junto aos demais modais globais do aluno e controla a abertura automática nas primeiras 10 assinaturas de login do aluno, usando `localStorage` por `user.id` e `last_sign_in_at` para não repetir o modal na mesma sessão de login.
- `app/components/Header.tsx` — não exibe mais o item `Como funciona` no menu do aluno; o modal passa a ser aberto automaticamente pelo `AppShell`.

**Etapas oficiais da animação:**

1. Nossas corujas especialistas criam simulados realistas.
2. Os simulados são organizados na Jornada focada no concurso do aluno.
3. As corujas operacionais inserem o aluno no sistema e na Jornada.
4. Os simulados são liberados aos poucos e o aluno é avisado por email.
5. O aluno resolve o simulado, vê resultados, diagnóstico e, quando houver, correção em vídeo.
6. Mensagem final de boas-vindas, vitória e sabedoria da coruja.

**Regras de manutenção:**

- O modal é informativo; não altera dados, não chama API e não interfere no fluxo de simulados, Jornadas, matrícula, TopCoins ou Central de Ajuda.
- A abertura acontece automaticamente na Área do Aluno nas primeiras 10 vezes que o aluno faz login. Depois da 10ª abertura por login, o modal não deve abrir automaticamente. Não existe mais acesso pelo menu/header.
- Não aplicar este modal em rotas públicas, troca de senha, execução de simulado, resultado ou rotas administrativas sem autorização explícita.
- Manter linguagem curta e visual claro/clean. O modal deve funcionar como uma janela premium de onboarding: uma imagem/tela aparece por vez, sem textos duplicados fora da imagem, sem autoplay e sem coluna lateral com lista completa. O layout oficial usa overlay escuro com blur, grande painel claro com degradê sutil, header refinado, imagem oficial inteira sem corte vertical e sem molduras internas extras ao redor do slide, troca manual por fade premium com blur/scale suave, setas laterais circulares flutuantes e indicadores inferiores discretos.
- As imagens oficiais do fluxo devem ser referenciadas em `/images/comofunciona/001.png`, `/images/comofunciona/002.png`, `/images/comofunciona/003.png`, `/images/comofunciona/004.png`, `/images/comofunciona/005.png` e `/images/comofunciona/006.png`.
- Se a lógica de Jornada mudar, atualizar as 6 etapas do modal e esta seção do índice.

**Checklist:**

- [ ] Fazer login como aluno e confirmar que o modal abre automaticamente enquanto a contagem daquele aluno for menor ou igual a 10.
- [ ] Confirmar que o item `Como funciona` não aparece mais no menu do aluno.
- [ ] Confirmar que após 10 logins registrados para o aluno o modal não abre automaticamente.
- [ ] Confirmar que não há autoplay e que a troca de tela é manual.
- [ ] Confirmar clique manual nas bolinhas, no botão lateral esquerdo de voltar e no botão lateral direito de avançar, com transição em fade entre as imagens.
- [ ] Confirmar carregamento das imagens em `/images/comofunciona/001.png` até `/images/comofunciona/006.png`.
- [ ] Confirmar que a imagem de cada tela aparece inteira, sem cortar o rodapé/texto da própria imagem.
- [ ] Confirmar fechamento pelo X e pelo botão final `Entendi`.
- [ ] Confirmar que Central de Ajuda continua abrindo normalmente.
- [ ] Confirmar que admin não vê o botão/modal.

---

## 10. ALUNOS

### 10.–3 Busca de alunos na listagem administrativa (correção 2026-07-13)

**Arquivo:** `app/admin/alunos/page-client.tsx` (busca 100% client-side sobre `students: StudentRow[]` recebido do server component `page.tsx`; não há endpoint de busca).

**Função:** `normalizeSearchValue(value)` — pura, no escopo do módulo. Remove acentos (`NFD` + faixa combinante `̀–ͯ`), aplica minúsculas e remove todo caractere que não seja `[a-z0-9]` (pontos, hífens, barras, parênteses, espaços, `@`, `_`, etc.). Aceita `null`/`undefined`. Não altera dados nem texto exibido.

**Regra de manutenção:** a MESMA normalização é aplicada ao termo digitado E a cada campo comparado — **nome, e-mail, CPF e telefone** — via `includes()` entre valores normalizados. Nunca comparar termo normalizado com campo cru (era a causa do bug). Campos pesquisáveis novos devem passar por `normalizeSearchValue`.

**Preservado:** filtro por status (abas), ordenação (usa valores originais, não a normalização), paginação, contadores, reset de página ao mudar termo.

### 10.–1 Desativação e Exclusão Definitiva de Alunos (Sprint Cadastro 2026-07-11)

**Função:** duas ações administrativas distintas no perfil do aluno (`/admin/alunos/[id]`), com modais premium dark e regras de segurança no backend.

**Desativar aluno (reversível):**
- `students.status = "inactive"` + `profiles.is_active = false` via `PATCH /api/admin/students/[id]` (fluxo de status existente).
- **Semântica corrigida de `isActiveProfile`** em `app/api/admin/students/[id]/route.ts`: somente `active` → `profiles.is_active = true`; `pending`/`blocked`/`inactive` → `false`.
- Diferença de status: `blocked` = bloqueio administrativo/punitivo; `inactive` = conta desativada normalmente. Ambos impedem acesso.
- Guards atualizados para rejeitar `inactive`: `lib/server/supabaseStudentAuth.ts` (getStudentFromRequest — 20 rotas student), `app/lib/server/supabaseStudentAuth.ts` e `lib/server/authGuard.ts` (requireStudentPage). Sessão existente perde acesso a APIs e páginas server-side imediatamente.
- Reativação (status → `active`): reutiliza a mesma conta Auth, restaura `is_active = true`, sem novo usuário e sem tocar no histórico.
- Log em `student_activity_log` indica desativação administrativa; histórico, Jornadas, tentativas e resultados intactos.
- Modal premium âmbar "Desativar aluno?" — acionado pela Zona de perigo ou ao salvar status `inactive` no seletor.

**Excluir definitivamente (irreversível, só sem histórico):**
- `DELETE /api/admin/students/[id]` (mesmo arquivo de rota; `requireAdmin`).
- Verificação de dependências (contagem por `student_id`): `student_jornadas`, `simulado_attempts`, `simulado_results`, `simulado_feedbacks`, `student_simulado_notes`, `topcoin_earnings`, legadas `attempts` e `student_simulados`. Qualquer vínculo → **HTTP 409 `STUDENT_HAS_HISTORY`** com `dependencies[{type,count}]`, nada é excluído. `student_activity_log` e `simulado_result_change_logs` são metadados com ON DELETE CASCADE e não bloqueiam.
- Ordem segura (idempotente, UUID como identificador; e-mail só para limpar confirmações): 1) `student_registration_confirmations` (por `user_id` e e-mail); 2) `auth.admin.deleteUser` (**Auth primeiro** — falha aqui mantém students/profiles visíveis, nunca produz conta invisível); 3) `students` (cascades); 4) `profiles`; 5) reverificação final das três camadas — sucesso somente com tudo ausente.
- Proteções: UUID da URL validado, `profiles.role !== "student"` → 403, nunca exclui admin, sem exclusão em massa, erros técnicos apenas em log servidor.
- UI: "Zona de perigo" no perfil (separada das ações comuns) + modal vermelho com confirmação forte digitada **EXCLUIR**; em 409 exibe dependências e oferece "Desativar em vez disso"; sucesso redireciona para `/admin/alunos`.

**Contas incompletas (reconciliação) — `lib/server/studentAccountRepair.ts` (novo):**
- `findAuthUserByEmail` (paginação de `auth.admin.listUsers`), `authUserExists`, `reconcileIncompleteStudentAccount`.
- A busca por e-mail usa paginação em lote e, se o Supabase Auth rejeitar um lote por causa de um registro defeituoso, faz leitura isolada das posições daquele lote, ignora somente a posição ilegível e preserva a detecção das demais contas; a criação pelo Auth continua sendo a barreira final contra e-mail duplicado.
- Cenários: (A) inexistente → cria normal; (B) completo → 409; (C) Auth/profile órfão com role student → reconcilia com o MESMO UUID (nova senha temporária, `must_change_password = true`, cria `students`), sem segundo usuário — aplicado em `app/api/auth/confirm-registration/route.ts` (status `pending`) e `app/api/admin/students/create/route.ts`; (D) role ≠ student → 409, nunca converte admin; (E) `students` sem Auth → 409 `ACCOUNT_INCONSISTENT` + log (Auth não recria UUID) — detectado em register, confirm-registration e create; (F) CPF de outro UUID → 409 antes de reconciliar.
- Regras permanentes: nunca apagar apenas `students`; nunca deixar Auth/profile órfãos; nunca converter admin em student; reconciliação idempotente.

**Checklist de manutenção:** ao criar nova tabela com `student_id`, adicioná-la a `HISTORY_CHECKS` no DELETE; ao criar novo guard de aluno, rejeitar `blocked` e `inactive`; listagem `/admin/alunos` mantém aba "Inativos".

### 10.–2 Aprovação explícita do cadastro + e-mail de boas-vindas (Sprint Cadastro 2026-07-11)

**Regra permanente:** *o e-mail de boas-vindas é disparado pelo EVENTO de aprovação inicial do cadastro. Ele nunca deve ser disparado apenas porque o status do aluno mudou para `active`.*

**Eventos separados:** aprovação inicial (`pending → active`, envia boas-vindas) · desativação (`active → inactive`, sem e-mail) · reativação (`inactive → active`, sem e-mail, preserva `approved_at`) · bloqueio (sem e-mail) · alteração genérica de status (sem e-mail) · reenvio manual (ação consciente do admin, pode repetir).

**Endpoint de aprovação:** `POST /api/admin/students/[id]/approve` (`app/api/admin/students/[id]/approve/route.ts`) — `requireAdmin`, valida UUID e role student, **idempotente por update condicional** (`id = X AND status = 'pending' AND approved_at IS NULL`; requisição concorrente recebe 409 `STUDENT_ALREADY_APPROVED`). Preenche `students.approved_at`/`approved_by`, ativa `profiles.is_active`, loga `registration_approved` e chama a função central de e-mail. **Falha do Resend NÃO desfaz a aprovação**: retorna `{ ok: true, approved: true, email_sent: false, code: "STUDENT_APPROVED_EMAIL_FAILED" }` e permite reenvio manual.

**Função central:** `app/lib/server/sendStudentWelcomeEmail.ts` — única porta de envio do template institucional (`app/lib/email/studentWelcomeTemplate.ts`), com `source: "approval" | "manual_resend"`. Gera nova senha temporária, marca `must_change_password`, atualiza rastreamento (`welcome_email_attempted_at` sempre; `welcome_email_sent_at` só no primeiro sucesso; `welcome_email_error` sanitizado, limpo em novo sucesso) e loga `welcome_email_sent` / `welcome_email_resent` / `welcome_email_failed`. Usada pela aprovação e por `POST /api/admin/students/resend-welcome` (reescrita para usá-la; reenvio não altera status nem aprovação).

**PATCH genérico de status (`app/api/admin/students/[id]/route.ts`):** o antigo envio condicionado a `must_change_password` foi removido (era a causa do e-mail silenciosamente não enviado); `pending → active` genérico agora retorna 409 `USE_APPROVAL_ACTION`; `inactive → active` loga `student_reactivated` sem contato com o Resend. Sincronização oficial `isActiveProfile`: somente `active` → `profiles.is_active = true`.

**Campos (migration `20260711130000_students_approval_fields.sql`):** `students.approved_at` (só na primeira aprovação; nunca limpo), `approved_by` (FK profiles, SET NULL) e `welcome_email_attempted_at`. Reutilizados: `welcome_email_status`, `welcome_email_sent_at`, `welcome_email_error`. `student_activity_log.event_type` não tem constraint — novos tipos sem migration.

**UI (`app/admin/alunos/[id]/page-client.tsx` + `page.tsx`):** faixa premium âmbar "Este cadastro está aguardando aprovação." com botão **Aprovar cadastro** (visível quando `pending` e `approved_at` nulo); modal de aprovação (laranja/âmbar, "Aprovar e enviar email"); seletor de status intercepta `pending→active` (abre aprovação) e `inactive→active` (abre modal **Reativar aluno**, verde, sem e-mail); card Sistema exibe "Cadastro aprovado em" e o estado do e-mail (enviado/não enviado/falhou + botão de reenvio em falha).

**Testes em futuras alterações:** aprovação idempotente sob duplo clique; nenhuma chamada Resend em reativação/desativação/bloqueio; falha de e-mail mantém aprovação; reenvio não altera status; conta reconciliada não aprovada permanece `pending`.

### 10.0 Interface dark premium — Cadastro e perfil (implementada 2026-05-28, consolidada 2026-05-29)

**Função:** visual dark premium para cadastro e visualização/edição de aluno, idêntico ao padrão das telas de Questões e Revisar Questões.

**Rota única consolidada em 2026-05-29:** a rota `app/alunos/` foi eliminada. Toda a gestão de alunos está em `app/admin/alunos/`.

**Arquivos:**

- `app/admin/alunos/novo/page.tsx` — cadastro dark premium (`"use client"`)
- `app/admin/alunos/[id]/page-client.tsx` — perfil dark premium com jornadas + activity log
- `app/admin/alunos/[id]/page.tsx` — server component (4 queries paralelas: aluno + logs + jornadas + jornadas disponíveis)

**Padrão implementado:**

- Fundo: `bg-[#07111F]`
- Eyebrow laranja + título bold branco + descrição `text-white/45`
- Card: `rounded-[2rem] border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm` com glow laranja `from-orange-400/[0.07]`
- Header do card: ícone `bg-orange-500/15 ring-1 ring-orange-500/20 text-orange-400`
- Inputs: `h-12 rounded-2xl border-white/[0.08] bg-white/[0.04] text-white/80 focus:border-orange-500/50 focus:ring-orange-500/10`
- Selects: `appearance-none [color-scheme:dark]` + `<ChevronDown>` absolutamente posicionado
- Textareas: `resize-none pb-7` com contador `{length}/{maxLength}` no canto inferior direito
- Checkbox "Aluno ativo": card dark `border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.05]` com `accent-orange-500`
- Footer do form: ícone Shield + texto "Os dados estão protegidos..." à esquerda; botões à direita
- Notices (sucesso/aviso/duplicata/erro): dark glass com bordas coloridas `border-emerald/amber/orange/red-500/20`

**E-mail status card (perfil):**

- 4 estados: `sent` (emerald) · `sending` (sky) · `failed` (red) · `pending` (amber)
- Classes: `border-{color}-500/20 bg-{color}-500/[0.06]` + ícone `bg-{color}-500/15 text-{color}-400`

**Cards de visualização (modo leitura):**

- `DataRow` — label `text-xs uppercase text-white/35` + valor `text-sm text-white/75`
- Dados do aluno (ícone laranja) + Observações internas (ícone FileText branco/50) + Simulados atribuídos (ícone ClipboardList)

**Componentes locais (duplicados em cada arquivo — não extrair sem instrução):**

- `DarkField` — label + children
- `DarkInput` — input dark com `iconLeft?` e `error?`
- `DarkSelect` — select dark appearance-none + ChevronDown
- `DarkTextarea` — textarea dark com counter (somente quando `value` controlado)
- `DarkNotice` (em `novo/page.tsx`) — notice dark colorido

**Regras:**

- `novo/page.tsx` é `"use client"` (arquitetura anterior mantida — não alterar sem instrução).
- Textarea com counter requer estado controlado no componente pai.
- `[color-scheme:dark]` no select força o browser a usar modo escuro no dropdown nativo.

---

### 10.1 Listagem de alunos (dark premium — implementada 2026-05-29)

**Arquivos:**

- `app/admin/alunos/page.tsx` — server component: busca alunos e passa para o client
- `app/admin/alunos/page-client.tsx` — client component: UI interativa dark premium
- `app/admin/alunos/novo/page.tsx` — cadastro de novo aluno
- `app/api/admin/students/create/route.ts`
- `app/api/admin/students/[id]/route.ts`
- `app/api/admin/students/resend-welcome/route.ts`

**Padrão da interface (dark premium):**

- Fundo: `bg-[#07111F]`
- **4 Metric cards** (2+2 mobile, 4-col desktop): Total (sky) · Em Análise (amber) · Ativos (emerald) · Bloqueados (red)
  - Classe por cor: `text-{color}-400 bg-{color}-500/15 ring-{color}-500/20`
- **Tab bar**: Todos · Em análise · Ativos · Bloqueados · Inativos — tabs com contagem live via `useMemo`
  - Ativo: `border-orange-500/40 bg-orange-500/10 text-orange-400`
  - Inativo: `border-white/[0.07] bg-white/[0.03] text-white/50`
- **Search** + botão Filtros — filtra por nome, e-mail e CPF (dígitos) via `useMemo`
- **Tabela** dentro de card dark `rounded-[2rem]` com glow:
  - Coluna Aluno: avatar colorido com iniciais (`getAvatarColor(id)`, `getInitials(name)`) + nome + CPF
  - Coluna Status: badge dark com bolinhas (`bg-emerald-400` para ativo)
  - Coluna Cadastro: data absoluta + "há X dias" com `suppressHydrationWarning`
  - Ações: botão "Abrir ↗" (`ExternalLink`) + kebab `MoreVertical`
- **Paginação**: prev/next + page indicator (orange) + select "N por página" com `[color-scheme:dark]`
- `useEffect` reseta `currentPage` quando search, activeTab ou pageSize mudam

**Funções utilitárias (locais em page-client.tsx):**

- `getInitials(name)` — extrai 2 iniciais do nome
- `getAvatarColor(id)` — cor determinística por hash do id (8 cores)
- `formatAbsoluteDate(value)` — data no padrão pt-BR
- `formatRelativeDays(value)` — "há X dias" / "hoje"

**Regras:**

- Aluno pode ser criado manualmente.
- No cadastro administrativo, a API `app/api/admin/students/create/route.ts` gera uma senha temporária, cria o usuário no Supabase Auth com `email_confirm: true`, cria `profiles.must_change_password = true` e envia o e-mail institucional de boas-vindas com login, senha temporária e link para `/login` usando `studentWelcomeTemplate`.
- O e-mail de cadastro administrativo não deve depender de link de confirmação em `/cadastro/confirmar`; o primeiro acesso é feito por login + senha temporária.
- Status: `pending` (Em análise), `active` (Ativo), `blocked` (Bloqueado), `inactive` (Inativo).
- E-mail de boas-vindas no cadastro de aluno é diferente do e-mail de boas-vindas da Jornada.
- A `StudentRow` type é exportada de `page.tsx` e importada em `page-client.tsx`.

---

### 10.2 Perfil do aluno (dark premium — consolidado em 2026-05-29)

**Arquivos:**

- `app/admin/alunos/[id]/page.tsx` — server component com 4 queries paralelas
- `app/admin/alunos/[id]/page-client.tsx` — UI dark premium (versão mais completa, mantida)

**Recursos presentes:**

- Edição de dados cadastrais (nome, e-mail de acesso, telefone, CPF, concursos, observações)
- Visualização e alteração de status de acesso (pending/active/blocked/inactive)
- Jornadas inscritas com barra de progresso
- Modal "Gerenciar Jornadas" com visualização das matrículas atuais, remoção/cancelamento com confirmação e inserção/reinserção em Jornadas publicadas
- Histórico de atividades com timeline dark
- Informações do sistema (último acesso, datas, status de e-mail de boas-vindas)

**Atualização aplicada — edição segura do e-mail do aluno (2026-07-09):**

- O modo de edição em `/admin/alunos/[id]` passou a incluir o campo **E-mail de acesso** no card `Dados cadastrais`.
- O frontend normaliza o e-mail com `trim().toLowerCase()` antes do PATCH e bloqueia valor vazio ou formato inválido antes de enviar.
- A API `app/api/admin/students/[id]/route.ts` valida formato, bloqueia duplicidade em `students.email`, atualiza o Supabase Auth via `supabase.auth.admin.updateUserById(id, { email, email_confirm: true })` e depois atualiza `students.email`.
- Se a atualização em `students` falhar depois da alteração no Auth, a API tenta restaurar o e-mail anterior no Auth para reduzir risco de divergência entre autenticação e perfil.
- A alteração de e-mail entra no mesmo fluxo de logs já existente: `student_activity_log` com `event_type = "field_update"` e `system_activity_logs` via `logActivity`, usando o label `E-mail`.
- Não houve migration nova.

**Regras:**

- Deve permitir editar dados do aluno, incluindo o e-mail de acesso.
- Ao alterar e-mail, validar formato, impedir duplicidade e manter Supabase Auth e tabela `students` sincronizados.
- Deve mostrar Jornadas inscritas.
- Deve permitir gerenciar Jornadas do aluno: inserir, reinserir quando a matrícula anterior estiver cancelada e remover/cancelar uma matrícula com confirmação.
- Datas devem ser formatadas de forma segura, sem `Invalid time value`.
- Fluxo de primeiro acesso: o aluno entra em `/login` com a senha temporária; se `profiles.must_change_password = true`, `app/login/page.tsx` deve redirecionar para `/alterar-senha` antes de bloquear por `is_active = false`, e `app/components/AppShell.tsx` deve priorizar esse redirecionamento antes do redirecionamento padrão de rotas públicas.
- Após salvar a senha definitiva em `app/alterar-senha/page.tsx`, a API `app/api/auth/complete-password-change/route.ts` limpa `must_change_password`, ativa o perfil/aluno e a tela deve exibir uma confirmação intermediária clara de senha modificada com contagem regressiva animada de 5 segundos antes de encerrar a sessão e redirecionar para `/login`, para o aluno entrar novamente com a nova senha.

---

## 11. E-MAILS

### 11.0 URL pública canônica dos links de e-mail (Sprint Cadastro 2026-07-11)

**Regra permanente:** todo link inserido em e-mail usa exclusivamente `getPublicAppUrl()` de `lib/server/publicAppUrl.ts` — fonte única `NEXT_PUBLIC_APP_URL`, **sem fallback para a origem da request** (o antigo `getAppUrl(request)` fazia e-mails disparados de localhost apontarem para `http://localhost:3000/...`). Se a variável não estiver configurada, o helper lança erro explícito e o envio falha de forma registrada, em vez de entregar link inválido ao aluno. Arquivos que usam o helper: `approve`, `resend-welcome`, `create`, `resend-jornada-email`, `resend-simulado-release-email`, `jornadas/[id]/students`, `jornadas/release-job`, `student-jornadas/[...]/[...]`, e as duas versões de `sendFirstAccessEmail` (`lib/server/` e `app/lib/server/`, que perderam o parâmetro `request`). **Manutenção:** nunca reintroduzir `new URL(request.url).origin` em construção de links de e-mail; novos e-mails devem importar `getPublicAppUrl`. `NEXT_PUBLIC_APP_URL` deve estar definida em todos os ambientes (inclusive `.env.local`).

### 11.1 E-mail de cadastro do aluno

**Arquivos:**

- `app/lib/email/studentRegistrationTemplates.ts`
- `app/lib/email/studentWelcomeTemplate.ts`
- `app/api/admin/students/create/route.ts`
- `app/api/admin/students/resend-welcome/route.ts`

**Regra atualizada — primeiro acesso com senha temporária (2026-07-09):**

- O e-mail enviado no cadastro administrativo do aluno deve conter e-mail de login, senha temporária e botão/link para `/login`.
- A senha temporária é gerada por `generateTemporaryPassword()` e usada na criação do usuário no Supabase Auth.
- O aluno deve ser obrigado a trocar a senha porque `profiles.must_change_password` fica `true` até a conclusão em `/api/auth/complete-password-change`.
- Não usar o template de link de confirmação (`adminInviteConfirmationTemplate`) nesse fluxo administrativo de cadastro do aluno.

### 11.2 E-mail de Jornada / liberação de simulado

**Arquivos prováveis:**

- `app/api/admin/jornadas/[id]/students/route.ts`
- `app/api/admin/jornadas/release-job/route.ts`
- templates internos de e-mail, se existentes.

**Regras:**

- E-mail não deve bloquear operação principal.
- Deve ser assíncrono.
- Deve conter cronograma quando for e-mail de Jornada.
- E-mail de liberação de simulado deve conter simulado liberado e cronograma completo.

---

## 12. APIs CRÍTICAS

### Questões

- `app/api/admin/questions/route.ts`
- `app/api/admin/questions/[id]/route.ts`
- `app/api/admin/questions/[id]/answer/route.ts`
- `app/api/admin/questions/[id]/difficulty/route.ts`
- `app/api/admin/questions/bulk/route.ts`
- `app/api/admin/questions/check-duplicate/route.ts`
- `app/api/admin/questions/duplicates/route.ts`
- `app/api/admin/questions/explain/route.ts`
- `app/api/admin/questions/generate-ai/route.ts`
- `app/api/admin/questions/import/analyze-batch/route.ts`
- `app/api/admin/questions/import/analyze/route.ts`
- `app/api/admin/questions/import/save/route.ts`
- `app/api/admin/questions/review-comment/route.ts`

### Simulados

- `app/api/admin/simulados/route.ts`
- `app/api/admin/simulados/[id]/route.ts`
- `app/api/admin/simulados/[id]/questions/route.ts`
- `app/api/admin/simulados/[id]/questions/reorder/route.ts`
- `app/api/student/simulados/route.ts`
- `app/api/student/simulados/[id]/route.ts`
- `app/api/student/simulados/[id]/attempts/route.ts`
- `app/api/student/simulados/[id]/attempts/[attemptId]/answers/route.ts`
- `app/api/student/simulados/[id]/attempts/[attemptId]/submit/route.ts`
- `app/api/student/simulados/[id]/attempts/[attemptId]/focus-violation/route.ts`
- `app/api/student/simulados/[id]/resultado/route.ts`

### Jornadas

- `app/api/admin/jornadas/route.ts`
- `app/api/admin/jornadas/[id]/route.ts`
- `app/api/admin/jornadas/[id]/simulados/route.ts`
- `app/api/admin/jornadas/[id]/simulados/reorder/route.ts`
- `app/api/admin/jornadas/[id]/students/route.ts`
- `app/api/admin/jornadas/[id]/students/[studentId]/route.ts`
- `app/api/admin/jornadas/release-job/route.ts`

**E-mails e rastreabilidade (2026-07-13):**

- Ao inserir um aluno em uma Jornada, o sistema envia o e-mail de entrada na Jornada, aguarda 10 segundos e então envia um e-mail separado para cada simulado liberado imediatamente, inclusive o primeiro.
- Toda liberação posterior, automática ou manual, tenta enviar o e-mail próprio do simulado e só registra `release_email_sent_at` quando o provedor confirma o envio.
- O card **Sistema** do cadastro do aluno apresenta o envio da Jornada e dos simulados, com data de sucesso ou indicação de falha/não envio, usando `student_jornadas.welcome_email_*` e `student_jornada_simulados.release_email_*`.
- Na tela de detalhe da Jornada, o nome de cada aluno é um link para `/admin/alunos/[id]`.

---

## 13. COMPONENTES COMPARTILHADOS

### UI

- `app/components/ui/PageBackground.tsx`
- `app/components/ui/PageHeader.tsx`
- `app/components/ui/PremiumCard.tsx`
- `app/components/ui/PremiumButton.tsx`
- `app/components/ui/PremiumInput.tsx`
- `app/components/ui/PremiumSelect.tsx`
- `app/components/ui/PremiumModal.tsx`
- `app/components/ui/PremiumTable.tsx`
- `app/components/ui/MetricCard.tsx`
- `app/components/ui/StatusPill.tsx`
- `app/components/ui/SelectionGhostBar.tsx`
- `app/components/ui/PremiumLoadingOverlay.tsx`
- `app/components/ui/DraftRestoreModal.tsx` — usa `createPortal(content, document.body)` com mounted guard SSR-safe (2026-05-29)

### Questões

- `app/components/questions/RichTextEditor.tsx`
- `app/components/questions/SubjectMultiSelect.tsx` — suporta prop `dark` (2026-05-29)
- `app/components/questions/QuestionActionModal.tsx`
- `app/components/questions/NewQuestionModal.tsx`
- `app/components/questions/QuestionTemplatePicker.tsx`
- `app/components/questions/FindDuplicatesButton.tsx`
- `app/components/questions/ExplanationAuthorCard.tsx`
- `app/components/questions/StudentExplanationAuthorCard.tsx`




### 13.1 Normalização de nomes de Assuntos — exibição e persistência (atualizado em 2026-06-10)

**Função:** garantir que nomes de assuntos sejam exibidos com conectivos/preposições em minúsculo, sem depender de saneamento imediato do banco.

**Arquivos envolvidos:**

- `app/lib/utils/text.ts` — funções `normalizeEntityName`, `normalizeComparableName` e `normalizeDisplayName`.
- `app/assuntos/page-client.tsx` — cards, edição, mensagens e confirmações da página de Assuntos.
- `app/questoes/page-client.tsx` — chips/tags e dropdowns de assuntos no Banco de Questões, quando aplicável.
- `app/simulados/[id]/editar/page-client.tsx` — seletor de questões para simulado e filtros de assunto, quando aplicável.

**Regra oficial:**

- Persistência/cadastro usa `normalizeEntityName()`.
- Exibição em cards, chips, tags, mensagens e confirmações usa `normalizeDisplayName()`.
- `normalizeDisplayName()` corrige visualmente conectivos/preposições como `e`, `de`, `da`, `do`, `dos`, `das`, `em`, `para`, sem exigir alteração imediata no banco.
- Exemplo esperado: `Internet E Redes de Computadores` deve ser exibido como `Internet e Redes de Computadores`.
- Ao alterar qualquer tela que exiba assunto, procurar por renderizações diretas de `subject.name` ou `item.name` e substituir por `normalizeDisplayName(...)` quando o contexto for nome de assunto.

**Ponto confirmado:**

A tela `/assuntos` possuía mais de uma renderização do nome do assunto. O card fechado/truncado ainda exibia `item.name` diretamente, por isso continuava mostrando `Internet E Rede...` mesmo após correções em outras áreas.

**Checklist:**

- [ ] Card fechado de Assuntos mostra conectivos em minúsculo.
- [ ] Card expandido/edição mostra conectivos em minúsculo nas mensagens.
- [ ] Busca e detecção de duplicidade continuam funcionando por comparação normalizada.
- [ ] Chips/tags de Questões e seletor de Simulados mantêm a mesma regra de exibição.

**Normalização oficial de assuntos Microsoft (atualizado em 2026-06-01):**

- Assuntos canônicos do pacote Microsoft devem usar nomes completos:
  - `Windows` → `Microsoft Windows`
  - `Word` → `Microsoft Word`
  - `Excel` → `Microsoft Excel`
  - `PowerPoint` → `Microsoft PowerPoint`
- A normalização foi aplicada no cadastro individual de assuntos (`app/api/admin/subjects/route.ts`) e no cadastro em massa (`app/api/admin/subjects/bulk/route.ts`).
- O script de banco para sanear dados existentes fica em `RODAR-NO-SUPABASE/011_renomear_assuntos_microsoft.sql`.
- O script preserva vínculos em `questions.subject_id`, `question_subjects`, `questions.subject_ids` quando existir, e também cobre `exam_analysis_questions.subject_id`, `exam_analysis_questions.subject_ids` e `exam_analysis_questions.module_name` quando existirem.
- Prompts/fallbacks do Raio-X de prova foram ajustados para gerar `Microsoft Word`, `Microsoft Excel`, `Microsoft PowerPoint` e `Microsoft Windows` como assuntos principais.
- Não criar novamente assuntos curtos `Windows`, `Word`, `Excel` ou `PowerPoint`; se digitados, as rotas devem persistir automaticamente os nomes completos.

**`SubjectMultiSelect` — prop `dark`:**

- `dark={false}` (padrão): seletor nativo `<select>` + chips violet light — usado em páginas light (`nova`, `editar`, `importar`, `gerar-ia`).
- `dark={true}`: dropdown customizado dark premium com busca + checkmark + **chips violetas dark** — usado em `revisar` (linha 1716, contexto dark).
- O dropdown dark usa `z-[9999]` sem container de z-index — mesmo padrão de `SimpleSelectDropdown`.
- Busca aparece quando `subjects.length > 5`.
- Múltipla seleção via toggle. Chips removíveis com botão X.

**Padrão de tag de assunto (atualizado 2026-05-29):**

Tags de assunto usam estilo violeta em todo o sistema (mesma identidade visual da barra de resultado dos filtros).

| Contexto | Classes |
|---|---|
| Dark (cards escuros) | `rounded-full border border-violet-500/25 bg-violet-500/[0.10] px-3 py-1 text-xs font-bold text-violet-300` |
| Light (cards brancos) | `rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-600` |

Arquivos atualizados (2026-05-29):
- `questoes/page-client.tsx` — `darkCard.tags.subject` (novo token violeta dark)
- `questoes/revisar/page-client.tsx` — via `SubjectMultiSelect dark`
- `components/questions/SubjectMultiSelect.tsx` — chips violetas em ambos os modos
- `components/questions/QuestionDisplayCard.tsx` — inline violet light
- `simulados/[id]/editar/page-client.tsx` — inline violet light
- `simulados/[id]/preview/page-client.tsx` — inline violet light (2 locais)
- `meus-simulados/[id]/resultado/page-client.tsx` — inline violet light
- `questoes/[id]/variacoes/page-client.tsx` — inline violet light

**Regra:**

- Se uma função se repetir em 3 ou mais telas, considerar criar componente compartilhado antes de fazer novas correções isoladas.

---

## 14. REDUNDÂNCIAS E PONTOS DE PADRONIZAÇÃO IDENTIFICADOS

> Esta seção não significa que os arquivos devem ser apagados automaticamente. Significa que são pontos que exigem cuidado antes de qualquer refatoração.

### 14.1 Renderização de alternativas duplicada

**Situação:** alternativas são renderizadas separadamente em Questões, Revisar Questões, Editar Questão, Preview, Execução e Resultado.

**Risco:** corrigir tesourinha/letras/certo-errado em uma tela e esquecer outra.

**Direção futura:** criar componente compartilhado, por exemplo:

- `QuestionAlternativeList`
- `QuestionAlternativeOption`
- `QuestionStatementBlock`

---

### 14.2 Filtros de questões — lógica compartilhada (parcialmente resolvido)

**Situação:** filtros do Banco de Questões e Revisar Questões têm lógica parecida, mas arquivos separados.

**Atualização:** a função `questionMatchesFilters(question, opts)` foi adicionada em `app/questoes/page-client.tsx` (antes do componente principal) para centralizar o filtro no Banco de Questões. Ela é usada por `filteredQuestions`, `subjectCounts`, `disciplineCounts`, `boardCounts` e `availableYears`.

**Risco restante:** `app/questoes/revisar/page-client.tsx` ainda tem filtro próprio. Ao alterar regras de filtro, replicar na página de revisão também.

**Direção futura:** extrair `questionMatchesFilters` para `app/lib/questions/question-filters.ts` e importar nas duas telas.

---

### 14.3 RichTextEditor usado em muitas telas

**Situação:** `RichTextEditor` é usado em importar, gerar IA, nova questão, editar questão e revisar.

**Risco:** mudança no editor afetar várias áreas.

**Regra:** qualquer alteração em `RichTextEditor.tsx` exige teste em todas as telas que o usam.

**Props:**
- `dark` (bool, padrão `false`): aplica tema escuro na toolbar (botões e fundo translúcidos sobre dark background). Usar em qualquer página de tema dark.
- `compact` (bool, padrão `false`): posiciona a toolbar dentro do container em vez de acima. Usar em editores de alternativas e campos menores.

**Toolbar — padrão obrigatório (2026-05-30):**
A toolbar usa **apenas ícones, sem rótulos de texto**, em qualquer modo (compact ou não). Os `title` dos botões preservam a acessibilidade via tooltip. O `compact` prop não altera mais o visual dos botões — apenas altera a posição da toolbar (acima vs dentro do container).

---

### 14.4 Rotas duplicadas de simulados/admin

**Situação:** existem rotas em `api/admin/simulados` e `api/admin/simulated-tests`.

**Risco:** duas APIs semelhantes evoluírem diferente.

**Ação recomendada:** auditar antes de remover qualquer uma.

---

### 14.4.1 Overlays de fundo `fixed inset-0` cobrindo a sidebar global (corrigido 2026-06-11)

**Situação:** As páginas dark premium do módulo de Simulados renderizam dois `<div>` decorativos de fundo (gradiente radial + grid de pontos) logo no início do `<main>`. Em `app/simulados/[id]/editar/page-client.tsx` e em `app/simulados/components/SimuladoShell.tsx` (variant `dark`, usado por `/simulados/[id]`, `/simulados/novo`, `/meus-simulados`, `/minhas-anotacoes`), esses divs usavam `pointer-events-none fixed inset-0`.

**Causa raiz:** `position: fixed` posiciona o elemento relativo ao viewport, ignorando o `relative` do `<main>` pai. Como o primeiro gradiente termina em `linear-gradient(...,#03070D_100%)` (cor opaca, sem alpha), o div cobre a tela inteira — incluindo a sidebar de navegação à esquerda (`<aside>` do `Sidebar.tsx`, renderizada como irmã anterior no DOM dentro do `AppShell`) — pintando por cima dela com uma cor quase idêntica ao fundo da sidebar (`#03060B`), fazendo o menu lateral "desaparecer" visualmente (continua clicável, pois é `pointer-events-none`, mas fica invisível).

**Correção aplicada em 2026-06-11:** trocado `fixed inset-0` por `absolute inset-0` em ambos os arquivos — o `<main>` que os contém já tem `relative`, então o overlay passa a ficar contido dentro do próprio `<main>` (área à direita da sidebar), igual ao padrão já correto de `app/simulados/page-client.tsx` (que já usava `absolute inset-0`).

**Regra permanente:** overlays decorativos de fundo (`pointer-events-none ... inset-0`) dentro de páginas que vivem sob o `AppShell` devem usar `absolute inset-0` (contido pelo `relative` do `<main>` da própria página), nunca `fixed inset-0` — `fixed` escapa para o viewport inteiro e cobre a sidebar global.

---

### 14.5 Dropdowns absolutamente posicionados dentro de `overflow-hidden` — problema crítico de UX

**Situação:** Containers de filtro usavam `overflow-hidden` combinado com `rounded-*`. Dropdowns customizados (`position: absolute`, `z-[9999]`) dentro desse container ficavam invisíveis e com eventos de ponteiro bloqueados — o usuário não conseguia clicar em nenhum item nem fechar o dropdown.

**Causa raiz:** `overflow: hidden` em um ancestral remove *tanto* a renderização visual *quanto* os pointer-events de qualquer descendente posicionado absolutamente que ultrapasse a bounding box do ancestral.

**Correção aplicada em 2026-05-28:**

- `app/questoes/page-client.tsx` — removido `overflow-hidden` do container de filtros (`<div className="relative mb-6 rounded-[1.75rem]...">`).
- `app/questoes/revisar/page-client.tsx` — removido `overflow-hidden` do container de filtros (`<div className="mb-6 rounded-[2rem]...">`).

**Regras permanentes:**

> Nunca usar `overflow-hidden` em um container que envolve dropdowns customizados com `position: absolute`. O `border-radius` funciona sem `overflow-hidden` se o conteúdo interno não tiver fundo próprio que "vaze" para fora.

> **Stacking context e dropdowns customizados (regra definitiva — 2026-05-29):**
> `backdrop-blur-sm` (e qualquer `backdrop-filter`, `transform`, `opacity < 1`, `filter`, `will-change`) cria um novo stacking context. Dentro desse contexto, cada `<div className="relative z-[X]">` cria um sub-stacking context próprio. O `z-[9999]` do menu dropdown é avaliado *dentro* do stacking context do seu container pai (`z-40`), não globalmente — então um irmão com `z-50` aparece acima do dropdown (`z-40 < z-50`).
>
> **Regra:** Nunca usar `z-[X]` no wrapper imediato (`ref={containerRef}`) de um dropdown customizado. Usar apenas `relative` (sem z-index). O menu absoluto com `z-[9999]` passa a ser avaliado no stacking context do card pai, e `z-9999` bate todos os irmãos. Nunca usar `relative z-50` em filtros inline que contêm dropdowns (como Dificuldade). Corrigido em: `app/questoes/page-client.tsx` e `app/questoes/revisar/page-client.tsx` (2026-05-29).

**Padrão de click-outside obrigatório:**

Todo dropdown customizado absolutamente posicionado deve fechar ao clicar fora. Padrão:

```tsx
const containerRef = useRef<HTMLDivElement>(null);
useEffect(() => {
  if (!open) return;
  function handleOutside(e: MouseEvent) {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      setOpen(false);
    }
  }
  document.addEventListener("mousedown", handleOutside);
  return () => document.removeEventListener("mousedown", handleOutside);
}, [open]);
// No JSX: <div ref={containerRef} className="relative z-40">
```

**Arquivos monitorados (têm dropdowns customizados):**

- `app/questoes/page-client.tsx` — `SubjectFilterDropdown` (multi-select com busca).
- `app/questoes/revisar/page-client.tsx` — `FilterSubjectDropdown` (multi-select com busca, draftIds).

**Checklist ao criar novo dropdown absolutamente posicionado:**

- [ ] Container pai não tem `overflow-hidden`.
- [ ] Dropdown tem `z-[9999]` ou maior que qualquer elemento ao redor.
- [ ] Click-outside handler com `useRef` + `useEffect` + `document.addEventListener("mousedown")`.
- [ ] Dropdown fecha ao selecionar opção.
- [ ] Dropdown fecha ao pressionar Escape (recomendado).

---

### 14.6 Arquivos `.txt` de instrução dentro da pasta app

**Arquivos detectados:**

- `app/questoes/INSTRUCAO-page-client.tsx.txt`
- `app/questoes/importar/page-client-importar-questoes-novo.txt`
- `app/api/admin/questions/INSTRUCAO-route.ts.txt`
- `app/api/admin/questions/generate-ai/INSTRUCAO-route.ts.txt`

**Risco:** não parecem ser runtime, mas estão dentro de `app`.

**Ação recomendada:** mover para `docs/` em pacote específico, após autorização, para não misturar documentação com código.

---

## 15. CHECKLIST OBRIGATÓRIO POR TIPO DE ALTERAÇÃO

### 15.1 Alterou alternativa/tesourinha/certo-errado

Testar:

- [ ] `app/questoes/page-client.tsx`
- [ ] `app/questoes/revisar/page-client.tsx`
- [ ] `app/questoes/[id]/editar/page-client.tsx`
- [ ] `app/simulados/[id]/preview/page-client.tsx`
- [ ] `app/meus-simulados/[id]/page-client.tsx`
- [ ] `app/meus-simulados/[id]/resultado/page-client.tsx`

### 15.2 Alterou filtros de questões

Testar:

- [ ] Banco de Questões.
- [ ] Revisar Questões.
- [ ] Assuntos múltiplos.
- [ ] Contadores por assunto.
- [ ] Banca + assunto.
- [ ] Disciplina + assunto.
- [ ] Dificuldade + assunto.
- [ ] Busca textual + assunto.

### 15.3 Alterou seleção em massa

Testar:

- [ ] Selecionar uma.
- [ ] Selecionar várias.
- [ ] Limpar seleção.
- [ ] Editar em massa.
- [ ] Excluir.
- [ ] Enviar para simulado.
- [ ] Despublicar/enviar para rascunho.
- [ ] Tela atualiza depois de salvar.

### 15.4 Alterou card clicável

Testar:

- [ ] Clique no card abre detalhe.
- [ ] Botão editar não dispara clique do card.
- [ ] Botão arquivar/excluir não dispara clique do card.
- [ ] Botão incluir em Jornada não dispara clique do card.

### 15.5 Alterou Jornada

Testar:

- [ ] Listagem de Jornadas.
- [ ] Card clicável.
- [ ] Detalhe da Jornada.
- [ ] Publicar/Arquivar.
- [ ] Editar e voltar para detalhe.
- [ ] Atribuir aluno.
- [ ] Adicionar dias.
- [ ] Cancelar matrícula.
- [ ] Simulados vinculados e dias de liberação.
- [ ] Footer dark.

### 15.6 Criou ou alterou dropdown customizado absolutamente posicionado

Verificar:

- [ ] Container pai não tem `overflow-hidden`.
- [ ] Dropdown tem `z-[9999]` ou maior.
- [ ] Click-outside com `useRef` + `useEffect` + `document.addEventListener("mousedown")`.
- [ ] Dropdown fecha ao selecionar.
- [ ] Itens da lista são clicáveis (teste real no browser).
- [ ] Botão Aplicar/Fechar acessível sem scroll horizontal.

---

### 15.7 Alterou o Raio-X de Provas

Testar:

- [ ] Nova análise cria N questões para N blocos detectados.
- [ ] Afirmativas I/II/III permanecem no enunciado.
- [ ] Questões Certo/Errado não viram A/B.
- [ ] Revisão, publicação individual e em lote funcionam.
- [ ] Duplicatas detectadas ao carregar — badge "Já existe no banco" visível, botões Publicar/Enviar ocultos.
- [ ] `orgao` propagado como `contest_name` nas questões publicadas.
- [ ] Variações geradas, editadas, descartadas e publicadas corretamente.
- [ ] Clone gera sem salvar, permite revisar e só persiste no `finalize`.
- [ ] Relatório abre em `/relatorio` e PDF exporta corretamente.
- [ ] `docs/Sprint-raio-x.md` e este índice foram atualizados se houver mudança de comportamento.

---

### 15.8 Alterou AppShell/footer/sidebar

Testar:

- [ ] Página clara de Questões.
- [ ] Página escura de Jornada.
- [ ] Página escura de Simulados.
- [ ] Sidebar desktop.
- [ ] Sidebar mobile.
- [ ] Footer sem tonalidade externa diferente.

---

## 16. REGRA PARA FUTURAS ENTREGAS EM ZIP

A partir deste índice:

- Se modificar apenas código: enviar `app/` com arquivos modificados e `docs/INDICE_FUNCOES_SISTEMA.md` atualizado.
- Se modificar apenas documentação: enviar `docs/INDICE_FUNCOES_SISTEMA.md`.
- Se modificar SQL: enviar SQL separado em pasta própria, como `SQL/` ou `RODAR-NO-SUPABASE/`, nunca escondido dentro de `app`.
- Nunca incluir arquivos inteiros não modificados, salvo pedido explícito.

---

## 17. OBSERVAÇÃO SOBRE REFATORAÇÕES E EXCLUSÕES

Este arquivo identifica redundâncias, mas não autoriza exclusão automática de código.

Regra segura:

1. Primeiro mapear.
2. Depois escolher uma função.
3. Refatorar essa função em pacote próprio.
4. Validar todas as telas afetadas.
5. Atualizar este índice.

Exemplo correto:

- Pacote 1: padronizar renderização de alternativas.
- Pacote 2: padronizar filtros de questões.
- Pacote 3: padronizar cards clicáveis.
- Pacote 4: mover arquivos `.txt` de instrução para `docs/`.


**Ajuste aplicado em 2026-05-30 — fluxo editorial questão por questão:**

- `app/admin/raio-x-provas/nova/page-client.tsx` agora possui campo **Observações iniciais do professor** e overlay/tela premium de processamento com etapas, mini gráficos, barra de progresso e botão **Ver questões analisadas**.
- `app/admin/raio-x-provas/[id]/page-client.tsx` foi reorganizado em dois modos: **Revisar questões** e **Ver Raio-X final**.
- A revisão do Raio-X passou a exibir uma questão por vez, com navegação numerada, progresso, ações por questão e campo **Parecer do Professor**.
- O Raio-X final passou a ficar em um card editorial único e editável, preservando mapa de cobrança e métricas no mesmo bloco visual.
- Botão **Refazer análise** possui duas opções: **Refazer apenas o Raio-X** e **Refazer análise completa**.
- Nova rota `POST /api/admin/exam-analyses/[id]/reprocess` executa reprocessamento parcial ou completo.
- `app/api/admin/exam-analyses/[id]/questions/[questionId]/route.ts` passou a aceitar `teacher_opinion`.
- `RODAR-NO-SUPABASE/013_raio_x_fluxo_revisao_final.sql` adiciona `teacher_opinion` em `exam_analysis_questions`.
- Prompts do Raio-X não tratam mais de adiamentos/cancelamentos; qualquer contexto externo deve ser informado pelo professor nas observações.
- `app/questoes/importar/page-client.tsx` recebeu a opção pseudo-assunto **Prova completa** para iniciar importações de provas inteiras sem criar outra cara para o sistema.

### Atualização — Raio-X usando padrão visual do Importador com IA (2026-05-30)

- `app/admin/raio-x-provas/[id]/page-client.tsx` — o card de revisão de questão do Raio-X foi compactado e realinhado ao padrão visual do Importador com IA: cabeçalho com seleção e badges, barra de metadados Ano/Banca/Dificuldade/Tipo/Status, editor rico compartilhado `RichTextEditor`, alternativas em cards menores com botão circular de gabarito, classificação da IA em bloco compacto e ações no rodapé.
- O Raio-X continua usando o `RichTextEditor` compartilhado em `app/components/questions/RichTextEditor.tsx`, preservando HTML, marca-texto, imagens coladas, código HTML, texto simples e toolbar de formatação.
- A estrutura de revisão permanece em modo questão por questão, mas sem cards gigantes: enunciado com `minRows=3`, alternativas com `minRows=2` e classificação/parecer em bloco recolhível/compacto.

---

## 18. SPRINT RAIO-X DE PROVAS — EXPANSÃO E REFINAMENTO (2026-05-30 a 2026-06-01)

### 18.1 QuestionCard — redesign premium editorial (duas colunas)

**Arquivos:** `app/admin/raio-x-provas/[id]/page-client.tsx`

- `QuestionCard` completamente redesenhado com layout editorial de dois painéis (left/right grid)
- **Painel esquerdo:** Bloco 01 Enunciado (display/edit toggle), Bloco 03 Alternativas (linhas clicáveis), Bloco 05 Parecer do Professor
- **Painel direito:** Bloco 02 Metadados (exibição + modo editar), Bloco 04 Classificação da IA, Bloco 06 Ações rápidas
- Alternativas: click na letra = marcar gabarito; click no texto = toggle editor inline
- Barra de ações fixada no rodapé do card (Descartar, Variações, Publicar, Enviar)
- `isExpanded` removido — layout sempre mostra tudo; edição sob demanda
- Blocos numerados com badges coloridos com glow (01 laranja, 03 sky, 04 violet, 05 laranja)
- Metadados compactos (h-8, text-xs) dentro de seção colapsável
- Gabarito: corujinha (🦉) na alternativa correta em modo Certo/Errado; verde = Certo correto, vermelho = Errado correto
- `OWL_MARK` adicionado ao arquivo

**Regras:**
- Questões com status `pending_review` ou `published` mostram badge de status — botões Publicar/Enviar ficam ocultos para evitar duplicatas no banco
- `sendToBank` e `sendToBankWithModal` passam `temp_id: q.id` no payload para `import/save` (atualizado 2026-06-04)
- Após resposta da API, lê `saved_temp_ids` + `ignored_temp_ids` para determinar quais questões foram aceitas pelo banco (salvas ou já existentes como duplicata) → marca `status = "pending_review"/"published"` → oculta botões
- Questão em `ignored_temp_ids` (duplicata no banco) recebe o mesmo tratamento de "já enviada" — botões ocultados, modal exibe "já consta no banco"
- `sendToBankWithModal` retorna silenciosamente se status já é `pending_review` ou `published`
- Validação de assunto obrigatório antes de qualquer envio

### 18.2 RaioXFinalView — dashboard premium com gráficos interativos

**Arquivos:** `app/admin/raio-x-provas/[id]/page-client.tsx`

- Componente `RaioXFinalView` redesenhado completamente com recharts
- **4 KPI cards uniformes** (removido "Perfil da Prova"): Questões TI, Dificuldade Média, Assunto Dominante, Banca
- **Mapa da Prova:** `BarChart` horizontal recharts com cores e tooltip
- **Composição da Prova:** `PieChart` donut recharts com centro HTML overlay (não SVG text — evita corte no html2canvas)
- **Tabela "O que foi cobrado":** assunto + ícone emoji + questões + tags separadas por vírgula + perfil + stars de dificuldade
- **Insights da IA:** bullets gerados automaticamente dos dados reais
- **Relatório completo:** card com botão "Abrir relatório" (link para `/relatorio`) ou "Gerar relatório completo"
- **Considerações e ajuste da IA:** painel colapsável com textarea professor + comando IA
- `effectiveModules`: recalcula distribuição em tempo real usando `subject_id` do banco (assuntos atribuídos pelo professor) — não usa `module_name` da IA
- `BAR_COLORS`, `topicIcon()`: utilitários locais do componente
- Sem detecção de "formato antigo" — conteúdo sempre exibido normalmente
- **Dependência recharts:** `PieChart`, `Pie`, `Cell`, `BarChart`, `Bar`, `XAxis`, `YAxis`, `Tooltip`, `ResponsiveContainer`

**Regras:**
- `checkClassification()`: valida se questões têm `subject_id` antes de gerar Raio-X — abre modal de aviso se não classificadas
- Toda geração (relatório ou mapa) passa pela validação primeiro
- `effectiveModules` usa `subjects` prop para resolver nomes reais dos assuntos

### 18.3 Relatório completo — rota dedicada `/relatorio`

**Arquivos:**
- `app/admin/raio-x-provas/[id]/relatorio/page.tsx` — Server Component, busca `exam_analyses`, questões analisadas, assuntos atribuídos e monta `effectiveModules`, `questions`, totais, imagem e dificuldade média.
- `app/admin/raio-x-provas/[id]/relatorio/page-client.tsx` — Client Component da landing page premium do relatório final.
- `public/images/raio-x/bg-simulados1.png` — background do hero/capa com símbolo da coruja EstudoTOP.
- `public/images/raio-x/bg-simulados2.png` — background azul para dobras analíticas/listas.
- `public/images/raio-x/bg-simulados3.png` — background azul/laranja para conclusão e parecer.

**Funcionalidades:**
- Relatório final exibido como landing page premium dark, em container único com borda externa, fundo contínuo e dobras internas.
- Hero usa `bg-simulados1.png`, com título grande, subtítulo, identificação do concurso/banca/cargo e badges institucionais.
- KPIs principais: Questões de Informática, Assuntos abordados, Dificuldade média e Questões anuladas.
- Seção 01 exibe cards visuais compactos dos assuntos, no padrão do modelo de referência, sem poluir os cards com tags extensas.
- Seção 02 exibe Perfil da prova com Distribuição, Dificuldade geral, Diversidade temática e Nível de exigência. Não usar “cobrança teórica/prática” nem “cobrança predominante” como rótulo fixo.
- Tags consolidadas aparecem na leitura rápida, na dobra “O que foi cobrado dentro de cada assunto” e na lista final de questões, condensando assuntos, tópicos e `knowledge_points`. Pareceres do professor não entram como tag nessa dobra; eles são insumo editorial do Parecer EstudoTOP.
- Seção final lista visualmente as questões da prova com número, assunto, tags, dificuldade, gabarito e alternativas. A etiqueta “Sem imagem” não deve aparecer; mostrar apenas “Com imagem” quando houver imagem. Questões anuladas exibem marca d’água **ANULADA**.
- `editMode`: toggle para editar conteúdo (textarea com HTML/Markdown).
- `saveContent()`: PATCH `/api/admin/exam-analyses/[id]`.
- `regenerate()`: chama `/reprocess` com `mode: "report"`.
- `exportPdf()`: usa `captureAndDownloadPdf("report-document", filename)`; o PDF segue a captura do relatório, mas a prioridade visual atual é a landing page em tela.
- `id="report-document"` no container principal para captura via html2canvas.

### 18.4 Geração do relatório analítico — API e prompt

**Arquivo:** `app/api/admin/exam-analyses/[id]/reprocess/route.ts`

- Novo mode `"report"`: gera laudo analítico completo em Markdown
- `buildProvaData(analysis, modulesSummary, questions, teacherNotes, subjectMap)`:
  - Aceita `subjectMap: Record<string, string>` com nomes reais do banco
  - Agrupa questões por `subject_id → nome do banco` (não por `module_name` da IA)
  - Fallback para `module_name` quando sem atribuição manual
  - Campo `fonteDosAssuntos` informa à IA qual foi a fonte dos dados
- `generateDetailedReport(provaData, command)`: prompt completo de 10 seções, temperature 0.4, max_tokens 6000
  - **Proibições explícitas no prompt:** nunca usar "conceitual vs prático" como classificação
  - Tags + Parecer combinados em narrativa (não listados separadamente)
  - Seção 5 = "Estilo de cobrança da banca" (não "Natureza das questões")
  - Seção 10 = Conclusão com assuntos específicos, sem linguagem genérica
- `buildFallbackMarkdown(provaData)`: fallback sem API
- Busca `subjects` table para resolver `subject_id → nome` antes de chamar a IA
- Aceita `raw_content` no body para `mode: "full"` — atualiza o texto armazenado
- `DELETE` handler: exclui análise + questões

**Regras:**
- Sempre usar `mode: "report"` para o laudo completo; `mode: "summary"` recalcula dashboard
- `buildProvaData` prioriza assuntos do banco sobre módulos da IA
- Nunca usar `mode: "full"` sem confirmação do usuário (descarta questões)

### 18.5 Gerador PDF nativo — html2canvas + jsPDF

**Arquivo:** `app/lib/pdf/captureReportPdf.ts`

- `captureAndDownloadPdf(elementId, filename, onStart?, onEnd?)`:
  - Captura o elemento `#elementId` com html2canvas scale 2× — inclui gráficos SVG/recharts, cores, gradientes
  - Download automático sem janela de impressão
  - **Quebras de página DOM-based:** `collectBreakablePoints()` coleta as posições Y do fim de cada `p`, `h2`, `h3`, `li`, `tr` usando `getBoundingClientRect()` ANTES do html2canvas
  - `findBestBreak()` usa esses pontos reais para nunca quebrar no meio de um parágrafo
  - Janela de busca: 20% da altura da página A4
  - Cada fatia tem altura exata do conteúdo (não páginas com espaço em branco)
- **Usado em:**
  - `app/admin/raio-x-provas/[id]/relatorio/page-client.tsx` → `id="report-document"`
  - O PDF oficial do Raio-X deve permanecer concentrado na rota `/relatorio`; não recriar botão de PDF operacional no dashboard admin sem autorização.

**Dependências instaladas:** `html2canvas`, `jspdf`

**Regra:** sempre adicionar `id` único ao container que será capturado; sem `id` a captura falha.

### 18.6 Markdown renderer do relatório

**Arquivo:** `app/lib/markdownReport.ts`

- `isHtmlContent(content)`: detecta se o conteúdo é HTML antigo ou Markdown novo
- `markdownToHtml(md)`: converte Markdown → HTML estruturado (H1/H2/H3, tabelas, listas, bold, italic, HR)
- `renderReport(content)`: auto-detecta e renderiza o formato correto
- `REPORT_CSS`: CSS premium para o relatório (H1 com borda laranja, H2 com barra laranja, tabelas, p:empty hidden, espaçamentos compactos)

**Regras:**
- `p:empty { display: none }` é crítico para eliminar parágrafos vazios do Markdown
- Qualquer alteração visual do relatório deve passar por `REPORT_CSS`
- Importar apenas o necessário — `isHtmlContent` foi removido de alguns imports após unificação

### 18.7 Listagem do Raio-X — filtros e exclusão

**Arquivo:** `app/admin/raio-x-provas/page-client.tsx`, `app/admin/raio-x-provas/page.tsx`

- `FilterSelect`: combobox com input tipável + dropdown de sugestões (não `<select>`)
  - Filtra a tabela com correspondência parcial enquanto digita
  - Clique na sugestão preenche e fecha
  - X para limpar individualmente
- Filtros: Concurso, Cargo, Banca, Ano — gerados dos valores existentes no banco
- `buildFilterOptions(analyses)`: cria arrays únicos e ordenados para os filtros
- `FilterOptions` type exportado do `page.tsx`
- `deleteAnalysis(id)`: DELETE `/api/admin/exam-analyses/[id]`, remove do estado local
- Botão excluir: hover na linha → confirmação inline → confirmação → exclusão

**Colunas da tabela (atualizado 2026-06-04):**
- Prova · Banca/Ano · Questões · **~~Assunto Dominante (removida)~~** · Status · Criada em · Ações
- Coluna "Assunto Dominante" foi removida para que o badge de STATUS tenha espaço suficiente e não quebre em duas linhas. Status badge usa `whitespace-nowrap` para garantir exibição em uma linha.
- `colSpan` atualizado de 7 para 6 no estado vazio.
- `min-w-[860px]` → `min-w-[720px]` após remoção da coluna.

**Zebra striping (adicionado 2026-06-04):**
- Linhas alternadas usando índice do `map`: `idx % 2 === 0 ? "bg-[#0C1B2E]/60" : "bg-white/[0.02]"`.
- Linha par (base): `bg-[#0C1B2E]/60` — tom escuro azulado original.
- Linha ímpar (alternada): `bg-white/[0.02]` — overlay branco translúcido sutil, ligeiramente mais claro.
- Hover mantido em `hover:bg-white/[0.045]` para ambos os tipos de linha.

**Ordenação por coluna (adicionado 2026-06-04):**
- Estados: `sortCol: SortCol` e `sortDir: SortDir` (`"asc" | "desc"`), default `created_at desc`.
- `toggleSort(col)`: se mesma coluna, inverte direção; se nova coluna, seta asc.
- `sorted` useMemo: aplica `localeCompare("pt-BR")` para strings e comparação numérica/temporal para questões e datas.
- Colunas clicáveis: Prova, Banca/Ano, Questões, Status, Criada em.
- Ícone: `ArrowUpDown` (inativo), `ArrowUp` (asc ativo), `ArrowDown` (desc ativo) — laranja quando ativo.
- Coluna ativa: `text-orange-300` no label.

### 18.8 Edição de configurações da análise

**Arquivo:** `app/admin/raio-x-provas/[id]/page-client.tsx`

- Modal `editModal` com campos: Concurso, Cargo, Banca, Ano, Disciplina
- Preview do nome gerado automaticamente no padrão `RaioX - Prova - [Concurso] - [Cargo] - [Ano] - [Banca]`
- `saveMetadata()`: PATCH `/api/admin/exam-analyses/[id]` com todos os campos + título regenerado
- Botão "Editar dados" com ícone `Settings2` na barra de ações

### 18.9 Refazer com novo texto

**Arquivo:** `app/admin/raio-x-provas/[id]/page-client.tsx`

- Modal `refazerModal` com textarea para colar novo texto da prova
- Mostra os campos de configuração mantidos (Concurso, Cargo, Banca, Ano) em modo read-only
- `refazerComNovoTexto()`: POST `/reprocess` com `mode: "full"` e `raw_content` do novo texto
- API aceita `raw_content` no body e atualiza o campo armazenado
- Volta automaticamente ao modo "Revisar questões" após conclusão
- **Bug corrigido (2026-06-04) — questões faltantes no reprocessamento:** `refazerComNovoTexto` agora chama `/api/admin/exam-analyses/analyze` (mesmo endpoint da análise inicial) em vez de `/reprocess mode="full"`. Após a nova análise ser criada com sucesso, a análise antiga é deletada via `DELETE /api/admin/exam-analyses/:id` e o router navega para o novo ID (`data.id`). Isso garante idêntica qualidade de análise — todas as questões encontradas na análise inicial serão encontradas no reprocessamento.
- **Alinhamento do modal (2026-06-04):** `REFAZER_STEPS` reduzido de 7 para 6 etapas (removido "Descartando análise anterior"). Título/subtítulo alinhados: "Analisando a prova" / "RAIO-X DE PROVAS · IA EM AÇÃO". Adicionados: animação `progressPulse` no step ativo e barra de estatísticas (TEXTO/DETECTADAS/STATUS) idêntica ao modal da nova análise. Steps renumerados 0–5.

### 18.10 Novos cadastros — Concurso e Cargo com autocomplete

**Arquivos:**
- `app/admin/raio-x-provas/nova/page-client.tsx` — componente `EntitySearch`
- `app/admin/raio-x-provas/nova/page.tsx` — carrega `contests` e `positions` das novas tabelas
- `app/api/admin/exam-contests/route.ts` — GET (busca) + POST (cadastrar)
- `app/api/admin/exam-positions/route.ts` — GET (busca) + POST (cadastrar)
- `RODAR-NO-SUPABASE/015_exam_contests_positions.sql` — tabelas `exam_contests` e `exam_positions`

**Componente `EntitySearch`:** igual ao `BoardSearch` — busca digitando, dropdown de resultados, botão "Cadastrar [nome]" inline quando não encontrado

**Regra:** Concurso e Cargo ficam em tabelas dedicadas (`exam_contests`, `exam_positions`). O `getContests()` e `getPositions()` no `page.tsx` têm fallback para `exam_analyses` se as tabelas ainda não existirem (migration pendente).

### 18.11 RichTextEditor — prop `dark`, toolbar icons-only e melhorias (atualizado 2026-06-04)

**Arquivo:** `app/components/questions/RichTextEditor.tsx`

- Prop `dark?: boolean` (padrão false): aplica estilos escuros na toolbar (botões e fundo translúcidos)
- Toolbar sempre icons-only (sem labels de texto) em qualquer modo — mais compacta e estética
- Bug corrigido: `</span>` → `</mark>` não mais aplicado universalmente — apenas spans com `background-color` amarelo são convertidos para `<mark>`
- Marcador de imagem (`data-image-marker`): cor `#dc2626` (vermelho), tamanho `1.3em`, negrito — destaque visual para "Imagem associada para resolução da questão"
- Mesma atualização em `app/api/admin/exam-analyses/[id]/reprocess/route.ts` → `markImageHints()`
- **Sublinhado adicionado (2026-06-04):** botão `Underline` inserido entre Itálico e Marca-texto em `TextToolbar`. `applyCommand` aceita `"underline"`. Prop `onUnderline` adicionada ao `TextToolbar`.
- **Bug corrigido — campo em branco ao voltar do modo HTML (2026-06-04):** O `<div>` do editor agora é **sempre mantido no DOM** (não mais condicional). Em modo HTML, o div recebe `display: none` e `contentEditable={false}`. Ao voltar para o modo visual, `toggleHtmlMode` define `ref.current.innerHTML` diretamente antes de `setHtmlMode(false)`, eliminando a dependência de `pendingHtmlRef` para esse caso.

**Onde usar `dark={true}`:** qualquer page com fundo escuro (`bg-[#07111F]`, `bg-[#0D1B2A]`, etc.)

### 18.12 UX/UI — Raio-X compactado e renomeado

**Arquivo:** `app/admin/raio-x-provas/[id]/page-client.tsx`, `app/admin/raio-x-provas/page-client.tsx`

- Fundo: `#07111F` → `#0D1B2A` (azul-marinho suave, menos contraste)
- Cards: `#0B1424` → `#0C1E34`
- Títulos: `text-3xl/4xl font-black` → `text-xl/2xl font-bold`
- Labels uppercase: `tracking-[0.28em]` → `tracking-[0.12em]`
- Barra de ações compacta: botões `py-1.5` com ícones
- Notificação de feedback: toast fixo canto superior direito (`fixed right-5 top-5 max-w-xs`)
- Tab selector: ciano `bg-sky-300` → `bg-blue-600` (sem competir com o laranja)
- Botões renomeados com ícones sugestivos:
  - "Editar configurações" → "Editar dados" (`Settings2`)
  - "Refazer com novo texto" → "Inserir nova prova" (`ClipboardList`)
  - "Refazer análise" → "Reanalisar prova" (`BarChart3`)
  - "Regenerar relatório" → "Gerar relatório completo" (`FileText`)
  - "Recalcular dados" → "Atualizar mapa de cobrança" (`BarChart3`)
  - "Ver relatório completo" → "Abrir relatório" (`Eye`)

### 18.14 Migrations pendentes — estado atual (2026-06-01)

**ATENÇÃO:** Duas migrations precisam ser executadas manualmente no Supabase para desbloquear funcionalidades:

| Migration | Arquivo | Efeito se não rodar |
|---|---|---|
| **014** | `RODAR-NO-SUPABASE/014_raio_x_visual_status.sql` | Análise de prova falha com constraint error (`visual_analysis_status_check`). Workaround ativo no código: usa `"needs_review"` e `"not_required"` em vez dos novos valores |
| **015** | `RODAR-NO-SUPABASE/015_exam_contests_positions.sql` | Botões "Cadastrar concurso" e "Cadastrar cargo" falham silenciosamente. Agora mostram mensagem de erro explicativa |

**Workarounds ativos enquanto migrations não rodam:**
- `normalizeVisualAnalysisStatus()` em `reprocess/route.ts` retorna `"not_required"` / `"needs_review"` (valores da constraint antiga)
- `normalizeVisualStatus()` em `analyze/route.ts` faz o mesmo
- `EntitySearch.create()` em `nova/page-client.tsx` agora exibe o erro da API em vez de falhar silenciosamente
- Após rodar as migrations, atualizar as funções para usar os novos valores: `"none"`, `"review_required"`, `"pending"`

### 18.15 EntitySearch — feedback de erro no cadastro

**Arquivo:** `app/admin/raio-x-provas/nova/page-client.tsx`

- Adicionado estado `createError` ao `EntitySearch`
- Se o POST falhar (tabela inexistente, constraint, etc.), exibe mensagem de erro vermelha inline abaixo do botão
- Antes: falha silenciosa — usuário clicava e nada acontecia

### 18.13 Raio-X final — distribuição por assuntos do banco

**Arquivo:** `app/admin/raio-x-provas/[id]/page-client.tsx`

- `effectiveModules` (useMemo): recalcula distribuição dos tópicos usando `subject_id → nome do banco`
- Prioridade: `subject_id` atribuído pelo professor > `module_name` da IA
- Inclui `knowledge_points` de cada questão nos módulos calculados (campo `d.points`)
- Coluna "O que foi cobrado": exibe `knowledge_points` separados por vírgula, com primeira letra maiúscula
- Props adicionadas ao `RaioXFinalView`: `questions` (RaioXQuestion[]) e `subjects` (SubjectOption[])
- Fallback: se sem atribuições manuais, usa `modulesSummary` do banco normalmente

**Regra:** o Raio-X reflete SEMPRE os assuntos que o professor atribuiu, não os módulos detectados pela IA.

---

## 19. SPRINT EDITOR CENTRAL E PADRONIZAÇÃO UI (2026-06-01)

### 19.1 QuestionEditor — componente central de edição de questões

**Arquivo:** `app/components/questions/QuestionEditor.tsx`

**Objetivo:** extrair `ReviewQuestionCard` de `revisar/page-client.tsx` para um componente compartilhado. Qualquer mudança visual ou funcional no editor se propaga automaticamente para todas as páginas que o usam.

**Exportações do arquivo:**
- `default QuestionEditor` — componente principal
- `type Alternative` — tipo das alternativas
- `type Discipline`, `Subject`, `Board` — listas de seleção
- `type Question` — questão recebida do servidor
- `type EditableQuestion` — estado editável interno
- `type QuestionEditorProps` — props do componente
- `toEditableQuestion(q: Question): EditableQuestion` — conversor

**Props:**

| Prop | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `initialQuestion` | `Question` | ✅ | Questão recebida do servidor |
| `disciplines` | `Discipline[]` | ✅ | |
| `subjects` | `Subject[]` | ✅ | |
| `boards` | `Board[]` | ✅ | |
| `storageKey` | `string` | — | Chave do localStorage para draft. Padrão: `estudotop:draft:questoes:editor:{id}` |
| `onSaved` | `(msg: string) => void` | — | Callback após salvar |
| `onPublished` | `(id: string) => void` | — | Callback após publicar; recebe o id da questão |
| `onArchived` | `(id: string) => void` | — | Callback após descartar |
| `onError` | `(msg: string) => void` | — | Callback de erro |
| `queuedForPublication` | `boolean` | — | Toggle "Preparar para fila" |
| `onTogglePublicationQueue` | `(id: string) => void` | — | Acionado pelo toggle |
| `isSelected` | `boolean` | — | Checkbox de seleção |
| `onToggleSelect` | `() => void` | — | Acionado pelo checkbox |
| `index` | `number` | — | Número da questão (#01, #02...) no header |
| `onRegisterSave` | `fn` | — | Registro do save handler (para "Salvar todos" do revisar) |

**Comportamento interno:**
- Gerencia seu próprio estado (`useState<EditableQuestion>`)
- Save: `PATCH /api/admin/questions/:id` + `PATCH /api/admin/questions/review-comment`
- Campo `orgao`: carregado de `questions.orgao`, editável no editor central e sincronizado quando o valor chega do servidor em uma questão já montada no cliente.
- Publish: `PATCH status="published"`
- Archive: `PATCH /api/admin/questions/bulk` com `status="archived"`
- Validação: assunto, banca, ano, enunciado, gabarito, textos de alternativas
- Draft: `useLocalDraft` com debounce 900ms
- Gerar explicação IA: `POST /api/admin/questions/explain`

**Sub-componentes internos (não exportados):**
- `AlternativeEditor` — alternativa com tesourinha, corujinha, toggle expand/collapse, imagem
- `TrueFalseEditor` — botões Certo/Errado com corujinha
- `ImageUrlEditor` — input de URL + paste de imagem base64
- `ActionModal` — modal de confirmação dark (`bg-[#0B111C]`, `border-white/[0.08]`) — migrado de light-themed em 2026-06-04. Ícone usa tons dark: emerald para aprovar, red para descartar, orange para salvar.

**Páginas que usam `QuestionEditor`:**

| Página | storageKey | Observações |
|---|---|---|
| `questoes/revisar/page-client.tsx` | `estudotop:draft:questoes:revisar:{id}` | Passado via prop para manter compatibilidade com drafts antigos |
| `questoes/[id]/editar/page-client.tsx` | `estudotop:draft:questoes:editar:{id}` | Mantém chave original |
| Fase 4 planejada: `admin/raio-x-provas/[id]/page-client.tsx` | — | Aguardando implementação |
| Fase 5 planejada: `questoes/importar/page-client.tsx` | — | Apenas edição individual pós-análise |

**Regras de manutenção:**
- Qualquer mudança em visual de alternativas, tesourinha, corujinha, validação ou layout do editor deve ser feita EXCLUSIVAMENTE aqui.
- Não duplicar a lógica em páginas individuais.
- Se uma página precisar de comportamento diferente (ex: endpoint de save diferente), adicionar prop em vez de copiar o componente.

**Bug corrigido (2026-06-12) — alternativa com imagem colada (sem texto) bloqueava envio para revisão:** `stripHtml` remove tags `<img>` por completo, então uma alternativa cujo `text` contém apenas `<img>` (imagem colada via `RichTextEditor`, sem usar o campo `image_url`) era tratada como vazia por `validateBeforePersist`, disparando "Todas as alternativas/assertivas precisam ter texto ou imagem." mesmo com imagem visível. Adicionado helper `hasInlineImage(html)` (`/<img[^>]*>/i.test`) e usado em três pontos de `QuestionEditor.tsx`: (1) `validateBeforePersist` (linha ~617) — `!stripHtml(a.text).trim() && !hasInlineImage(a.text) && !a.image_url?.trim()`; (2) `hasText`/`hasContent` em `AlternativeEditor` (linha ~352) — afeta expand/collapse; (3) placeholder do estado colapsado (linha ~386) — mostra `[ imagem ]` em vez de `Vazia` quando há `<img>` inline.

---

### 19.2 Migração questoes/revisar para QuestionEditor

**Arquivo:** `app/questoes/revisar/page-client.tsx`

**O que mudou:**
- `ReviewQuestionCard` removido (era ~800 linhas)
- Sub-componentes removidos: `AlternativeEditor`, `TrueFalseEditor`, `ImageUrlEditor`, `ActionModal`, `stripHtml`
- Tipos removidos: `EditableQuestion`, `ActionModalState`
- Constantes removidas: `OWL_MARK`, `PROFESSOR_PREFIX`, `REVIEW_TEXT`
- Helpers removidos: `getQuestionCode`, `relabelAlternatives`, `getNextAlternativeLabel`, `trueFalseAlternatives`, `toEditableQuestion`
- Imports removidos: `ClipboardEvent`, ícones redundantes, `RichTextEditor`, `ExplanationAuthorCard`, `extractQuestionSubjectIds`, `isQuestionImagePending`, `DraftRestoreModal`, `useLocalDraft`
- `MemoizedReviewQuestionCard` → `MemoizedQuestionEditor = memo(QuestionEditor)`
- `SimpleSelectDropdown` (nos filtros) permanece — é uma cópia local usada nos filtros de topo, não no editor

**O que foi preservado:**
- Toda a lógica de filtros (busca, disciplina, banca, assuntos, dificuldade, status, ano, tipo)
- Seleção em massa e barra fantasma
- "Salvar todos" (`registerQuestionSave` / `onRegisterSave`)
- "Formar fila" e "Publicar fila"
- Paginação
- `renderDifficultyStars`, `normalizeFilterText`, `getQuestionSearchText` (usados nas estatísticas e filtros)

---

### 19.3 Migração questoes/[id]/editar para QuestionEditor

**Arquivos:**
- `app/questoes/[id]/editar/page-client.tsx` — reescrito (~120 linhas)
- `app/questoes/[id]/editar/page.tsx` — atualizado SELECT

**O que mudou em `page-client.tsx`:**
- Removidas: todas as variáveis de estado individuais (`questionType`, `disciplineId`, `subjectIds`, `statement`, etc.)
- Removidas: todas as funções de save/validate/publish/archive
- Removidos: todos os blocos JSX de edição (Classificação, Enunciado, Alternativas, Explicação)
- Mantidos: navegação Anterior/Próxima, barra de info da fila, `PageHeader`, `PageBackground`
- `onPublished`: navega para próxima questão da fila (`withQueueHref`)
- `onArchived`: navega para próxima questão da fila
- `onSaved`: exibe banner de sucesso no topo

**O que mudou em `page.tsx`:**
- SELECT expandido para incluir `review_comment` e `exam_boards:exam_board_id(id, name)`
- Necessário para que `toEditableQuestion` resolva corretamente `exam_board_id` e `review_comment`

---

### 19.4 SearchableSelect — componente centralizado de select com busca

**Arquivo:** `app/components/ui/SearchableSelect.tsx`

**Objetivo:** substituir `<select>` nativos e `SimpleSelectDropdown` por um combobox que permite digitar para filtrar e selecionar da lista.

**Props:**

| Prop | Tipo | Padrão |
|---|---|---|
| `label` | `string` | — |
| `value` | `string` | obrigatório |
| `onChange` | `(value: string) => void` | obrigatório |
| `options` | `{ value: string; label: string }[]` | obrigatório |
| `placeholder` | `string` | `"Selecione"` |
| `dark` | `boolean` | `false` |
| `className` | `string` | `""` |

**Temas:**
- `dark={true}`: fundo `#0D1B2E`, texto branco, selecionado laranja — usar em `QuestionEditor`, raio-x, páginas dark
- `dark={false}` (padrão): fundo branco, borda cinza, selecionado laranja suave — usar em `importar`, páginas light

**Comportamento:**
- Clique no botão → abre dropdown com input de busca focado automaticamente
- Digitar → filtra opções em tempo real (case-insensitive)
- Selecionar → fecha dropdown, atualiza valor, limpa busca
- Click fora → fecha dropdown, limpa busca
- Checkmark laranja na opção selecionada

**Onde já está em uso (atualizado 2026-06-04):**
- `app/questoes/revisar/page-client.tsx` — `SimpleSelectDropdown` local dos filtros (não migrado — filtros têm layout próprio)
- `app/components/questions/QuestionEditor.tsx` — Tipo, Disciplina, Banca
- `app/questoes/importar/page-client.tsx` — campo ASSUNTO por questão
- `app/admin/raio-x-provas/[id]/page-client.tsx` — "Assunto no banco" em `QuestionCard` (migrado de `<select>` nativo em 2026-06-04)
- `app/simulados/[id]/editar/page-client.tsx` — Assunto e Banca no painel de filtros + formulário de questão manual (migrados de `PremiumSelect` em 2026-06-04)

**Mapa completo de filtros de Assunto/Banca/Órgão (auditado 2026-06-04):**

| Página | Filtro | Componente | Busca? |
|---|---|---|---|
| `questoes/page-client.tsx` | Assunto | `SubjectFilterDropdown` local | ✅ |
| `questoes/page-client.tsx` | Banca | `BoardFilterDropdown` local | ✅ |
| `questoes/page-client.tsx` | Órgão | `OrgaoFilterDropdown` local | ✅ |
| `questoes/revisar/page-client.tsx` | Assunto | `FilterSubjectDropdown` local | ✅ |
| `questoes/revisar/page-client.tsx` | Banca | `BoardFilterDropdown` local | ✅ |
| `questoes/revisar/page-client.tsx` | Órgão | `OrgaoFilterDropdown` local | ✅ |
| `admin/raio-x-provas/[id]/page-client.tsx` | Assunto no banco (QuestionCard) | `SearchableSelect dark` | ✅ (corrigido 2026-06-04) |
| `simulados/[id]/editar/page-client.tsx` | Assunto (filtro banco) | `SearchableSelect` | ✅ (corrigido 2026-06-04) |
| `simulados/[id]/editar/page-client.tsx` | Banca (filtro banco) | `SearchableSelect` | ✅ (corrigido 2026-06-04) |
| `simulados/[id]/editar/page-client.tsx` | Assunto (form questão) | `SearchableSelect` | ✅ (corrigido 2026-06-04) |
| `simulados/[id]/editar/page-client.tsx` | Banca (form questão) | `SearchableSelect` | ✅ (corrigido 2026-06-04) |
| `questoes/importar/page-client.tsx` | Assunto por questão | `SearchableSelect` | ✅ |
| `components/questions/QuestionEditor.tsx` | Disciplina, Banca, Tipo | `SearchableSelect dark` | ✅ |

**Regra:** usar `SearchableSelect` em TODO select novo ou existente que tenha mais de 5 opções. Para 2-3 opções (ex: Tipo de questão), `SearchableSelect` também é válido pois oferece UX consistente.

---

### 19.5 Importar com IA — melhorias (2026-06-01)

**Arquivo:** `app/questoes/importar/page-client.tsx`

**Alterações visuais:**

**Barra de metadados por questão (dark bar):**
- Layout migrado de grid 5 colunas para `flex flex-wrap` com larguras fixas por campo
- ANO: 72px · BANCA: 160px · ASSUNTO: 180px (SearchableSelect) · DIFICULDADE: 120px · TIPO: 110px
- STATUS removido da barra (informação já exibida como badge no header do card)
- DIFICULDADE: `<select>` → botões de estrela clicáveis (mesmo padrão do `QuestionEditor`)
- ASSUNTO: `<select>` → `SearchableSelect` com lista filtrada por `filteredSubjects`
- TIPO: display estático → botão toggle clicável (alterna entre "Múltipla" e "Certo/Errado")

**Alternativas (seção expandida):**
- Layout migrado de vertical (label acima + editor abaixo) para horizontal (letra + editor ao lado)
- Letra exibida como badge circular (A, B, C...) em vez de "Alternativa A"
- Tesourinha: botão `<Scissors>` à esquerda, aparece no hover, risca a alternativa eliminada
- Corujinha: alternativa correta exibe `🦉` no badge
- Estado de eliminação: `eliminatedAltKeys: Set<string>` — chave: `${question.temp_id}-${altIndex}`

**Alterações funcionais:**

**Por-questão subject:**
- Tipo `ImportedQuestion` expandido: `subject_id?: string | null`, `subject_ids?: string[]`
- Estado `subjectSearches: Record<string, string>` removido (não mais necessário com `SearchableSelect`)
- Estado `eliminatedAltKeys: Set<string>` adicionado
- `applySubjectToQuestion(questionId, { id, name })`: aplica assunto individual por questão

**Bug corrigido — questões não saem após "Enviar para revisão":**
- Causa: verificação `!disciplineId || subjectIds.length === 0` bloqueava envio quando usuário definia assunto por questão sem assunto global
- Correção: aceita envio se QUALQUER das condições for verdadeira:
  - `hasGlobalSubject`: disciplina + `subjectIds.length > 0`
  - `allQuestionsHaveSubject`: todas as `allowedQuestions` têm `subject_ids` ou `subject_id`
- Payload do fetch atualizado: cada questão agora leva seu `subject_id`/`subject_ids` individuais, com fallback para o global

**`app/api/admin/questions/import/save/route.ts`:**
- Tipo `ImportedQuestion` local expandido: `subject_id?: string | null`, `subject_ids?: string[] | null`
- Validação: `allQuestionsHaveSubject` → aceita sem assunto global se cada questão tem o seu
- Insert: `subject_id: question.subject_id || subjectId` — por-questão tem prioridade sobre o global

---

### 19.6 StepPct — contador animado por etapa nos modais de processamento

**Onde está definido:**
- `app/admin/raio-x-provas/nova/page-client.tsx` — definido aqui (função local)
- `app/admin/raio-x-provas/[id]/page-client.tsx` — copiado aqui (função local)
- `app/components/questions/QuestionActionModal.tsx` — copiado aqui para modais de ação

**Comportamento:**
- `done=true` → "100%" verde
- `active=true` → anima de 0% até ~88% usando `setInterval` + incrementos aleatórios (1.5–5.5% a cada 90ms), para em 88% enquanto aguarda
- `pending` (nem active nem done) → "0%" cinza

**Regra:** todos os modais de processamento com etapas devem usar `StepPct` por etapa — nunca porcentagem fixa. Etapas usam propriedade `weight` para contribuição no progresso global (soma da barra horizontal), mas o display por etapa é sempre 0→100% individual via `StepPct`.

**`QuestionActionModal.tsx` atualizado:**
- `stepWeights?: number[]` adicionado a `QuestionActionModalState`
- `StepPct` definido acima de `QuestionActionModal`
- `<StepPct active={active} done={done} />` no final de cada linha de etapa

---

### 19.7 HtmlWithImageMarkers — insertListItemBreaks exportado

**Arquivo:** `app/components/ui/HtmlWithImageMarkers.tsx`

**Mudança:** `insertListItemBreaks` agora é exportada (`export function insertListItemBreaks`)

**Usado em:**
- `app/admin/raio-x-provas/[id]/page-client.tsx` — aplicado no valor inicial do `RichTextEditor` ao entrar em modo de edição do enunciado (garante que I –, II –, III – ficam em linhas separadas no editor)

**Regra:** sempre que um `RichTextEditor` exibir um enunciado que estava sendo mostrado por `HtmlWithImageMarkers`, aplicar `insertListItemBreaks()` no valor inicial do editor para garantir paridade visual entre display e edição.

---

### 19.8 Atualizações nas seções existentes do índice

**Seção 3.2 — Revisar Questões — atualizar arquivos principais:**
- `app/components/questions/QuestionEditor.tsx` **adicionado** como dependência central
- `app/questoes/revisar/page-client.tsx` agora usa `QuestionEditor` em vez de `ReviewQuestionCard` local
- `SimpleSelectDropdown` local permanece apenas para os **filtros de topo** (não afeta o editor)

**Seção 3.3 — Criar/Editar Questão — atualizar:**
- `app/questoes/[id]/editar/page-client.tsx` completamente reescrito — agora usa `QuestionEditor`
- `app/questoes/[id]/editar/page.tsx` atualizado — inclui `review_comment` e `exam_boards` no SELECT

**Seção 4.3 — Tesourinha — adicionar:**
- `app/questoes/importar/page-client.tsx` agora tem tesourinha na seção expandida de alternativas

**Seção 5.1 — Filtros — atualizar `SimpleSelectDropdown`:**
- `SimpleSelectDropdown` em `questoes/revisar/page-client.tsx` permanece nos **filtros de topo**
- O editor dentro dos cards (`QuestionEditor`) não usa mais `SimpleSelectDropdown` — usa `SearchableSelect`
- `SimpleSelectDropdown` em `questoes/page-client.tsx` permanece para os filtros inline daquela página

**Seção 13 — Componentes Compartilhados — adicionar:**
```
app/components/ui/SearchableSelect.tsx     — select com busca inline, dark/light, substitui SimpleSelectDropdown
app/components/questions/QuestionEditor.tsx — editor central de questões (fase 2 e 3 concluídas)
```

**Seção 14.1 — Renderização de alternativas duplicada — atualizar status:**
- ✅ **Parcialmente resolvido (2026-06-01):** `revisar/page-client.tsx` e `questoes/[id]/editar/page-client.tsx` agora delegam ao `QuestionEditor`, eliminando duplicação do editor.
- ⚠️ **Pendente:** `questoes/page-client.tsx` (InlineQuestionEditor), `simulados/[id]/preview`, `meus-simulados/[id]`, `questoes/importar` (alternativas do modo expandido) ainda têm renderização própria.

---

### 19.9 Checklist adicional — alterou QuestionEditor

Ao alterar `app/components/questions/QuestionEditor.tsx`:

- [ ] Testar em `/questoes/revisar`
- [ ] Testar em `/questoes/[id]/editar` (qualquer questão)
- [ ] Verificar que `AlternativeEditor`, `TrueFalseEditor`, `ImageUrlEditor` continuam funcionando
- [ ] Verificar que corujinha aparece na alternativa correta
- [ ] Verificar que tesourinha risca alternativa sem selecionar gabarito
- [ ] Verificar que assertivas C/E usam `TrueFalseEditor` (não alternativas A/B/C/D)
- [ ] Verificar que draft é salvo/restaurado corretamente
- [ ] Verificar que `SearchableSelect` (Tipo/Disciplina/Banca) abre e filtra corretamente

---

### 19.10 Checklist adicional — alterou SearchableSelect

Ao alterar `app/components/ui/SearchableSelect.tsx`:

- [ ] Testar tema dark (`dark={true}`) em `QuestionEditor` (Tipo, Disciplina, Banca)
- [ ] Testar tema light em `/questoes/importar` (ASSUNTO)
- [ ] Verificar que click-outside fecha o dropdown
- [ ] Verificar que busca filtra em tempo real
- [ ] Verificar que seleção fecha dropdown e atualiza o valor

### 19.20 Importar com IA — preservação do assunto padrão na análise em lote (2026-06-01)

**Arquivo alterado:** `app/questoes/importar/page-client.tsx`

**Problema corrigido:**
- Ao importar questões com um assunto real já selecionado em **Assuntos padrão**, as questões analisadas podiam aparecer com o campo **Redefinir assunto** no card individual.
- Esse comportamento deveria ocorrer apenas quando o usuário escolhesse o pseudo-assunto **Prova completa** ou quando realmente não houvesse assunto real definido.

**Regra atual:**
- Se `subjectIds` contém assuntos reais, cada questão retornada pela análise em lote herda esses assuntos no próprio objeto `ImportedQuestion` (`subject_id` e `subject_ids`).
- Se `subjectIds` contém somente `__prova_completa__`, a questão permanece sem assunto real e o card continua exibindo **Redefinir assunto**.
- Se a IA/endpoints retornarem assunto próprio por questão, esse assunto próprio prevalece sobre o padrão global.

**Funções/trechos impactados:**
- `realSubjectIds(ids)` — continua removendo `__prova_completa__`.
- `questionOwnSubjectIds(question)` — continua identificando assuntos reais já presentes na questão.
- `analyzeTextInBatches()` — agora normaliza cada questão recém-analisada com `defaultSubjectIdsForBatch` antes de inserir no estado `questions`.

**Arquivos relacionados consultados e não alterados:**
- `app/api/admin/questions/import/save/route.ts` — já aceita `subject_id`/`subject_ids` por questão e mantém fallback global.
- `app/components/questions/SubjectMultiSelect.tsx` — não alterado; o problema estava no estado recebido pelo componente, não no seletor.

### 19.11 Importar com IA — gabarito de Assertivas e rótulo de tipo (2026-06-01)

**Arquivos alterados:**
- `app/questoes/importar/page-client.tsx`
- `app/api/admin/questions/import/analyze-batch/route.ts`
- `app/api/admin/questions/import/save/route.ts`
- `app/components/questions/QuestionEditor.tsx`

**Problema corrigido:**
- Questões do tipo Certo/Errado eram detectadas corretamente na tela de importação, mas ao serem enviadas para revisão podiam chegar ao `QuestionEditor` com **Gabarito: Não informado**.
- Causa: algumas importações salvavam as assertivas com `label` igual a `Certo`/`Errado`, enquanto o editor central esperava `C`/`E` para reconstruir o estado de gabarito.

**Regra atual:**
- No banco, assertivas devem ser persistidas com labels normalizadas: `C` para Certo e `E` para Errado.
- O texto exibido continua sendo `Certo` e `Errado`.
- `QuestionEditor.trueFalseAlternatives()` agora aceita dados legados com label/texto `Certo`/`Errado`, além de `C`/`E`, para não perder o gabarito de questões já importadas.
- O parser de importação em lote (`analyze-batch`) também passou a gerar labels `C`/`E` ao detectar linhas de Certo/Errado.

**Rótulo visual no Importar com IA:**
- Na barra superior de cada questão importada, o tipo agora aparece como:
  - `Assertivas` quando `question_type === "true_false"`.
  - `Alternativas` quando `question_type === "multiple_choice"`.
- Na comparação de duplicidade, a seção de opções também usa `Assertivas` para questões Certo/Errado.

**Regra de manutenção:**
- Não voltar a salvar assertivas com label literal `Certo`/`Errado` em `question_alternatives.label`.
- Qualquer nova tela que edite Certo/Errado deve tratar `C`/`E` como labels técnicos e `Certo`/`Errado` como textos exibidos.

### 19.12 Importar com IA — detecção automática de Assertivas por duas opções (2026-06-02)

**Arquivos alterados:**
- `app/questoes/importar/page-client.tsx`
- `app/api/admin/questions/import/analyze-batch/route.ts`
- `app/api/admin/questions/import/analyze/route.ts`

**Regra atualizada:**
- No Importador com IA, sempre que uma questão analisada possuir exatamente **duas opções**, ela deve ser tratada automaticamente como `true_false` / **Assertivas**.
- Questões com três ou mais opções permanecem como `multiple_choice` / **Alternativas**.
- A regra foi aplicada no endpoint principal de análise em lote e também no endpoint legado de análise simples, além de uma normalização defensiva no frontend do importador.

**Regra de manutenção:**
- Não voltar a depender apenas do texto/label `Certo` e `Errado` para classificar uma questão como assertiva.
- O critério operacional do importador passa a ser: `alternatives.length === 2` → `question_type = "true_false"`.

### 19.13 Importar com IA — substituição controlada de duplicada do banco (2026-06-02)

**Arquivo alterado:**
- `app/questoes/importar/page-client.tsx`

**Função alterada:**
- Comparador de duplicidade aberto pelo botão **Ver comparação** no Importador com IA.

**Regra atualizada:**
- Quando a questão importada for duplicada de uma questão já existente no banco, o modal de comparação permite escolher:
  - **Manter questão do banco**: descarta a questão importada da prévia e preserva a questão existente.
  - **Manter importada e arquivar antiga**: chama `PATCH /api/admin/questions/bulk` com `status = "archived"` para a questão existente, remove o bloqueio de duplicidade da importada, mantém a importada no fluxo e já a seleciona para envio/publicação.
- A questão antiga não é apagada fisicamente. Ela é apenas arquivada para preservar histórico e rastreabilidade.
- Para duplicidade dentro do mesmo lote, o modal não arquiva nada no banco e mantém apenas as ações seguras de fechamento/descarte.

**Trechos impactados:**
- `CompareModalState` recebeu `duplicateQuestionId`.
- `openCompareModal()` passa a preservar o ID da questão do banco detectada como duplicada.
- `keepImportedAndArchiveExisting()` arquiva a questão existente via endpoint bulk e libera a importada.
- `CompareModal` recebeu ações separadas para manter existente ou manter importada arquivando a antiga.

**Regra de manutenção:**
- Não excluir fisicamente questões antigas durante substituição por importação.
- Não liberar automaticamente toda duplicada detectada; a decisão deve ser manual no comparador.
- A substituição controlada deve ser usada principalmente para trocar questões antigas sem `orgao` por versões importadas enriquecidas com `orgao`.

### 19.14 Órgão — preservação na revisão e filtro de pesquisa (2026-06-03)

**Arquivos alterados:**
- `app/questoes/revisar/page.tsx`
- `app/questoes/revisar/page-client.tsx`
- `app/questoes/page.tsx`
- `app/questoes/page-client.tsx`

**Problema corrigido:**
- O Importador com IA detectava e exibia o campo **Órgão** corretamente no card de importação, mas a questão chegava em `/questoes/revisar` sem o órgão preenchido visualmente.
- Causa: a página de revisão não selecionava `questions.orgao` no carregamento das questões pendentes/fila.

**Regra atual:**
- `questions.orgao` é carregado em `/questoes/revisar` e enviado ao `QuestionEditor`, preservando o órgão detectado no importador.
- O Banco de Questões (`/questoes`) também carrega `questions.orgao` para permitir busca/filtro por órgão.

**Filtro por Órgão:**
- Criado filtro multisseleção **Órgão** logo após **Banca** em:
  - `/questoes/revisar`
  - `/questoes`
- O filtro possui busca digitável, seleção múltipla, contagem por órgão e parâmetro de URL `?orgao=...`.
- O campo **Tipo de resposta** foi removido dos filtros dessas telas, conforme decisão da sprint.

**Regra de manutenção:**
- Sempre que uma tela listar ou editar questões e depender dos metadados completos, incluir `orgao` no SELECT de `questions`.
- O filtro por órgão deve ser textual com base em `questions.orgao`, sem criar tabela auxiliar de órgãos nesta fase.
- Não reintroduzir o filtro **Tipo de resposta** nas telas `/questoes` e `/questoes/revisar` sem nova decisão explícita.

### 19.17 Órgão — backfill e propagação em todos os fluxos de cópia (2026-06-09)

**Arquivos alterados:**
- `app/questoes/page-client.tsx` (`UseAsTemplateModal.save`)
- `app/admin/raio-x-provas/[id]/page-client.tsx` (3 pontos de envio ao banco)
- `app/api/admin/exam-analyses/[id]/clone/finalize/route.ts`
- `app/SQL-BACKFILL-ORGAO-QUESTOES.sql` _(novo)_

**Problema:**
- Ao enviar questões do Raio-X ao banco (individual, lote, variações), o `orgao` não era propagado.
- "Usar como modelo" não propagava `orgao` da questão original.
- Clones de prova (`clone/finalize`) não gravavam `orgao`.
- Questões já no banco (anteriores à correção) estão sem `orgao`.

**Correção aplicada:**
- `UseAsTemplateModal`: POST para `/api/admin/questions` agora inclui `orgao: question.orgao || null`.
- RaioX → envio individual e em lote: payload inclui `orgao: analysis.contest_name || null`.
- RaioX → `VariationReviewPanel`: variações enviadas ao banco incluem `orgao: analysis.contest_name || null`.
- `clone/finalize/route.ts`: insert em `questions` inclui `orgao: analysis.contest_name || null`.
- **Backfill SQL** (`SQL-BACKFILL-ORGAO-QUESTOES.sql`): atualiza questões existentes sem `orgao` cruzando `question_fingerprint` com fingerprint calculado do statement de `exam_analysis_questions`, herdando `contest_name` como `orgao`.

**Como rodar o backfill:**
1. Abra o Supabase → SQL Editor.
2. Cole e execute `app/SQL-BACKFILL-ORGAO-QUESTOES.sql`.
3. O script exibe contadores antes/depois nas mensagens de log.

**Regra de manutenção:**
- Todo fluxo que envia uma questão para o banco a partir de uma análise (Raio-X, clone, variação) deve incluir `orgao: analysis.contest_name || null` no payload.
- "Usar como modelo" preserva o `orgao` da questão original.

---

### 19.16 Órgão — exibição no card do Banco de Questões e edição correta (2026-06-08)

**Arquivos alterados:**
- `app/questoes/[id]/editar/page.tsx`
- `app/questoes/page-client.tsx`

**Problema corrigido:**
- A tela de edição individual (`/questoes/[id]/editar`) não incluía `orgao` no SELECT do Supabase, fazendo o campo aparecer vazio no `QuestionEditor` mesmo quando havia valor no banco.
- O card de questão no Banco de Questões (`/questoes`) não exibia `orgao` como chip/tag — apenas banca, ano e assunto eram mostrados.

**Correção aplicada:**
- `app/questoes/[id]/editar/page.tsx`: adicionado `orgao` ao SELECT da query principal da questão.
- `app/questoes/page-client.tsx`: adicionado chip `darkCard.tags.neutral` com o valor de `orgao` logo após o chip da banca, exibido apenas quando `question.orgao` é não-nulo.

**Regra de manutenção:**
- Toda query que busca uma questão individual para edição deve incluir `orgao` no SELECT.
- No card de questão (Banco de Questões), `orgao` fica entre banca e ano nos chips de metadados.
- A tela `/questoes/revisar` usa `QuestionEditor` que já renderiza o campo `orgao` como input editável — nenhuma mudança necessária lá além do SELECT já existente em `revisar/page.tsx`.

### 19.15 Importar com IA — envio idempotente para revisão (2026-06-03)

**Arquivos alterados:**
- `app/questoes/importar/page-client.tsx`
- `app/api/admin/questions/import/save/route.ts`

**Problema corrigido:**
- Durante a importação em lotes, o usuário podia enviar algumas questões para revisão antes de todos os lotes terminarem.
- Em alguns casos, questões já salvas no banco continuavam visíveis na tela. Ao reenviar, elas travavam o novo envio e impediam que questões novas, processadas depois, fossem enviadas.

**Regra atual:**
- O envio para revisão passou a ser tolerante a repetição.
- Questões que já haviam sido enviadas e ainda ficaram na tela são removidas da prévia sem bloquear as demais.
- O backend retorna listas por `temp_id`:
  - `saved_temp_ids`: questões salvas agora.
  - `ignored_temp_ids`: questões ignoradas por já existirem/duplicidade/sem condição de salvamento.
  - `failed_items`: questões que realmente falharam e devem permanecer na tela.
- O frontend remove da tela `saved_temp_ids + ignored_temp_ids` e mantém apenas falhas reais ou questões sem assunto real.
- Se houver envio parcial, o modal final usa tom de aviso, sem travar o lote inteiro.

**Regra de manutenção:**
- Não tratar duplicidade no backend como erro fatal do lote de importação.
- Não bloquear questões novas por causa de questões antigas já enviadas.
- Em novos ajustes do importador, preservar `temp_id` no payload até o endpoint `questions/import/save` para permitir limpeza precisa da tela.

### 19.21 Importar com IA — preservação de todos os blocos já detectados (2026-06-03)

**Arquivo alterado:**
- `app/api/admin/questions/import/analyze-batch/route.ts`

**Problema corrigido:**
- O frontend detectava corretamente todos os blocos de questões e enviava para análise em lotes de 5.
- O endpoint de análise em lote recebia `body.blocks`, mas aplicava novamente `coalesceContinuationBlocks()` sobre blocos que já tinham sido separados pelo importador.

**Bug corrigido (2026-06-04) — itens numerados "1) texto..." dentro do enunciado não eram mergeados:** A função `looksLikeQuestionContinuation` em `app/lib/utils/question-splitter.ts` não reconhecia itens no formato `1) Texto...` como continuação do bloco anterior. Questões com afirmativas numeradas (ex: "1) A lixeira representa...", "2) Não é possível...") eram divididas em blocos separados, resultando em questões incompletas no importador e no Raio-X. Corrigido adicionando o padrão `/^\s*[1-9]\d?\)\s+\S/` à lista de padrões de continuação. Esta correção afeta todos os pontos de uso: `questoes/importar`, `admin/raio-x-provas/nova`, `admin/raio-x-provas/[id]` (refazer), e `api/admin/exam-analyses/analyze`.

**Bug corrigido (2026-06-04) — afirmativas com algarismos romanos "I.texto..." sumiam do enunciado:**
Questões com afirmativas no formato "I.Navegadores funcionam exclusivamente...", "II.É correto afirmar..." (algarismo romano + ponto + texto longo) tinham as afirmativas omitidas do campo `statement` pela IA.

**Causa raiz dupla:**
1. **Splitter** (`question-splitter.ts`): Se por alguma razão o bloco fosse dividido, `looksLikeQuestionContinuation` não reconhecia "I.texto..." como continuação. Corrigido adicionando `/^\s*[IVXivx]{1,4}[.)]\s*\S{4,}/` — algarismo romano seguido de pelo menos 4 caracteres de texto.
2. **Prompt da IA** (`analyze/route.ts` — `analyzeBlockWithOpenAI`): O prompt dizia apenas "statement: HTML do enunciado sem as alternativas". A IA interpretava I., II., III. como alternativas. Corrigido com instrução explícita: afirmativas com romano + texto longo ficam no `statement`; apenas letras A, B, C, D, E são alternativas.
3. **Prompt do importador** (`analyze-batch/route.ts`): O prompt existente tratava "I.", "II.", "III." sozinhos como alternativas (correto para opções de resposta), mas não distinguia do caso "I.texto longo" (afirmativa no corpo). Adicionada regra: "I.Texto descritivo longo..." (com texto na mesma linha) fica no `statement`.

**Distinção oficial:**
- `I.Texto longo...` → AFIRMATIVA → fica no `statement`
- `I.` ou `I e II.` sozinhos → ALTERNATIVA de resposta → vai para `alternatives`
- Em alguns textos, essa recoalescência juntava blocos distintos e reduzia a quantidade analisada/exibida, por exemplo: 72 detectadas, 15/15 lotes processados, mas apenas 20 questões na tela.

**Regra atual:**
- Quando `analyze-batch` recebe `body.blocks` do frontend, cada item enviado já representa uma questão detectada e deve ser preservado como uma unidade individual.
- O endpoint deve apenas sanitizar cada bloco e remover vazios, sem juntar blocos novamente.
- `coalesceContinuationBlocks()` continua permitido apenas nos fluxos em que o backend precisa dividir texto bruto por conta própria, sem blocos explícitos vindos do frontend.

**Regra de manutenção:**
- Não aplicar merge/recoalescência sobre blocos explícitos enviados pelo frontend.
- Em ajustes futuros do importador em lote, manter a relação operacional: `N blocos enviados ao lote` → `N questões normalizadas retornadas`, salvo bloco vazio/ilegível.


### Atualização Raio-X Relatório Final — 2026-06-06

- `app/admin/raio-x-provas/[id]/relatorio/page-client.tsx` foi ajustado para a landing final do relatório Raio-X:
  - removida a etiqueta superior "Relatório final" da tela;
  - KPI "Questões com imagens" substituído por "Questões anuladas", calculado a partir de `exam_analysis_questions.is_annulled`;
  - seção 01 renomeada para **Assuntos cobrados na prova**;
  - seção repetitiva de conclusão foi removida da landing;
  - criada a dobra **O que foi cobrado dentro de cada assunto**, consolidando tags, tópicos e `knowledge_points` da IA e dos ajustes feitos pelo professor;
  - **Parecer EstudoTOP** passa a usar prioritariamente `analysis.teacher_notes`, preenchido na tela do Raio-X final em "Considerações do professor";
  - lista de questões passou a renderizar enunciado completo, alternativas e marca d'água **ANULADA** quando `is_annulled=true`.
- `app/admin/raio-x-provas/[id]/relatorio/page.tsx` permanece responsável por buscar as questões da análise e consolidar `effectiveModules`, `tags`, `knowledge_points`, assuntos do banco e ordem das questões.

**Regra nova:** não usar textos genéricos de "cobrança prática" no Raio-X de Informática. A prova é objetiva/teórica; quando for necessário qualificar o perfil, usar termos como distribuição, dificuldade, diversidade temática e nível de exigência.

### Atualização Raio-X Relatório Final — 2026-06-06 — parecer obrigatório e ajustes finos

- `app/admin/raio-x-provas/[id]/page-client.tsx` passa a exigir **Parecer EstudoTOP** antes de gerar/regenerar o relatório final. Se `teacher_notes` estiver vazio, o sistema bloqueia a geração e abre aviso para preencher o parecer.
- Questões marcadas como `is_annulled=true` não bloqueiam mais a validação de classificação antes da geração do relatório; elas entram no relatório como anuladas.
- A dobra “Parecer EstudoTOP” da tela admin ganhou campos estruturados: número de questões, assuntos cobrados, nível de dificuldade geral de 1 a 5, alertas e texto livre. O botão “Montar parecer-base” consolida esses dados em `teacher_notes`; o botão “Gerar texto do parecer com IA” usa o fluxo existente de consolidação para corrigir gramática, dar tom profissional e preservar o estilo do professor.
- `app/admin/raio-x-provas/[id]/relatorio/page-client.tsx`: cards da seção **Assuntos cobrados na prova** ficam centralizados quando houver menos cards que colunas disponíveis.
- A lista de questões no relatório não exibe mais a etiqueta **Sem imagem**; apenas exibe **Com imagem** quando `has_image=true`.
- A dobra “O que foi cobrado dentro de cada assunto” deve somar os dados coletados automaticamente pela IA com os ajustes manuais feitos pelo professor em cada questão, incluindo assunto do banco, tópico de cobrança, `knowledge_points` e tags consolidadas. Não exibir parecer da questão como tag nessa dobra.

**Regra nova:** não permitir avanço para o relatório final sem parecer do professor. O parecer é parte editorial obrigatória do produto entregue ao aluno/cliente.

**Ajuste aplicado em 2026-06-06 — Parecer EstudoTOP natural e editável no relatório:**

- `app/admin/raio-x-provas/[id]/page-client.tsx`: o botão **Montar parecer-base** deixou de concatenar campos em formato de formulário. Agora monta parágrafos naturais contendo concurso/cargo/banca, quantidade de questões, questões anuladas, tópicos cobrados, nível de dificuldade, alertas e análise livre do professor. O comando padrão para a IA foi ajustado para gerar um **Parecer EstudoTOP** em texto corrido, profissional, com parágrafos curtos, preservando o estilo direto do professor e sem inventar dados.
- `app/admin/raio-x-provas/[id]/page-client.tsx`: após **Gerar parecer final com IA**, o texto retornado passa a atualizar também `teacher_notes`, além de `final_summary_text`, para que a tela do relatório final utilize a versão editorial revisada e não o formulário-base.
- `app/admin/raio-x-provas/[id]/relatorio/page-client.tsx`: a seção **Parecer EstudoTOP** agora renderiza o texto em parágrafos e permite edição direta na própria tela final do relatório. O botão **Editar parecer** abre um textarea inline; ao salvar, o texto é persistido em `teacher_notes`, `final_summary_text` e `summary_text`, garantindo que tela e PDF usem a versão revisada pelo professor.

**Regra permanente do Parecer EstudoTOP:** o relatório final não deve exibir campos estruturados crus como “Número de questões analisadas”, “Assuntos cobrados” e “Parecer livre do professor” em sequência corrida. Esses campos servem apenas como insumo. O texto final deve ser natural, editorial, com parágrafos, e deve poder ser revisado pelo professor na própria tela do relatório.

### Atualização Raio-X Relatório Final — 2026-06-06 — rodapé premium e parecer mais editorial

- `app/admin/raio-x-provas/[id]/relatorio/page-client.tsx`: o rodapé simples do relatório foi substituído por uma dobra final premium, com composição visual escura, destaque motivacional, pilares de orientação e uso de arte de coruja institucional por meio de `public/images/raio-x/owl-footer.png`.
- `app/admin/raio-x-provas/[id]/relatorio/page-client.tsx`: a renderização do **Parecer EstudoTOP** foi refinada para fonte menor, espaçamento mais harmônico e parágrafos preservados. O texto do parecer não deve ser achatado em parágrafo único quando houver quebras salvas no editor.
- `public/images/raio-x/owl-footer.png`: arte usada exclusivamente na dobra final/fechamento premium do relatório.

**Regra permanente:** o Parecer EstudoTOP deve preservar quebras de parágrafo digitadas ou geradas pela IA, usando fonte editorial confortável e sem transformar o texto em bloco único. O rodapé do relatório deve funcionar como fechamento motivacional/institucional, não como um card simples de data.


### Atualização Raio-X Relatório Final — 2026-06-06 — fechamento com coruja, cards ajustados e link público

- `app/admin/raio-x-provas/[id]/relatorio/page-client.tsx`: os cards da seção **Assuntos cobrados na prova** passaram a exibir quantidade de questões em uma linha e percentual da prova em outra linha, evitando quebras visuais feias como “40% da / prova”.
- `app/admin/raio-x-provas/[id]/relatorio/page-client.tsx`: a etiqueta **Fechamento estratégico** foi removida da dobra final, preservando apenas o texto motivacional e os pilares do fechamento.
- `app/admin/raio-x-provas/[id]/relatorio/page-client.tsx`: a dobra final foi ajustada para exibir a coruja institucional à esquerda, ocupando o espaço vazio e reforçando o fechamento visual do relatório.
- `app/admin/raio-x-provas/[id]/relatorio/page-client.tsx`: a barra superior do relatório removeu os botões **Exportar PDF** e **Regenerar**. O botão **Copiar link** agora copia a URL atual do relatório (`window.location.href`) para que o endereço possa ser compartilhado.
- `public/images/raio-x/owl-footer.png`: imagem oficial da coruja usada no fechamento premium do relatório final.

**Regra permanente:** na página final do relatório, o topo deve ser voltado para compartilhamento e revisão editorial, não para regeneração/exportação. O PDF não deve voltar para a barra superior dessa tela sem decisão explícita. Os cards de assunto devem priorizar legibilidade, com quantidade e percentual separados.

### Atualização Raio-X Admin — 2026-06-06 — fluxo operacional simplificado e geração única

- `app/admin/raio-x-provas/[id]/page-client.tsx`: a tela operacional do Raio-X foi simplificada para reduzir botões redundantes de geração/reprocessamento.
- Removido da barra superior o botão **Reanalisar prova**, evitando exposição constante de reprocessamento técnico no fluxo principal.
- Na aba de revisão, ao chegar à última questão:
  - se ainda não houver relatório/Raio-X inicial (`finalSummary` vazio), aparece **Gerar Raio-X inicial**;
  - se o Raio-X já tiver sido gerado, aparece apenas **Ver Raio-X final**.
- Na aba **Ver Raio-X final**, os botões **Regenerar relatório completo** e **Atualizar mapa de cobrança** foram removidos do cabeçalho do card editorial.
- A tela passou a comunicar que, depois da geração inicial, alterações salvas nas questões, classificações e Parecer EstudoTOP são refletidas automaticamente no Raio-X e no relatório final, sem necessidade de regeneração manual.
- O bloco final **Relatório final do Raio-X** agora segue fluxo único:
  - antes da primeira geração: exibe **Gerar Raio-X inicial**;
  - após a primeira geração: exibe apenas **Abrir relatório final** e status **Gerado uma vez**.

**Regra permanente:** o fluxo normal do Raio-X deve ter geração inicial única. Depois disso, dados objetivos do relatório devem ser derivados das questões/classificações/parecer salvos, e não de botões repetidos de regeneração. Reprocessamento técnico só deve ser reintroduzido em área avançada ou mediante pedido explícito.
### Atualizacao Banco de Questoes - uso em simulados no card - 2026-06-08

- `app/questoes/page.tsx`: o SELECT principal do Banco de Questoes passou a carregar `simulado_questions (id, status, order_number, simulados:simulado_id (id, title, status))` para cada questao listada.
- `app/questoes/page-client.tsx`: o card da questao passou a exibir, na parte inferior antes dos botoes, a secao **Uso em simulados** com contagem e chips clicaveis para `/simulados/[id]`.
- Regra de negocio: o relatorio mostra apenas vinculos atuais existentes em `simulado_questions`. Quando a questao e removida de um simulado, a API `DELETE /api/admin/simulados/[id]/questions` apaga a linha de vinculo e esse simulado deixa de aparecer automaticamente.
- Checklist de manutencao: ao alterar o fluxo de adicionar/remover questoes de simulados, validar que `/questoes` continua refletindo somente os vinculos ativos.

### Atualizacao Edicao de Simulados - enviar questao para outro simulado e indice de acertos - 2026-06-08

- `app/simulados/[id]/editar/page-client.tsx`: cada card de questao vinculada ao simulado ganhou acao lateral **Enviar para outro simulado**. A acao abre modal na propria pagina, lista os outros simulados e usa `POST /api/admin/simulados/[id]/questions` para vincular a questao ao destino sem remove-la do simulado atual.
- `app/simulados/[id]/editar/page.tsx`: a pagina passou a agregar `simulado_answers` por `question_id`, preenchendo `correct_count`, `wrong_count`, `total_answered_count` e `accuracy_rate` nas questoes carregadas.
- `app/simulados/types.ts`: `BankQuestion` passou a aceitar `wrong_count` junto das demais metricas de desempenho.
- Regra de negocio: o indice de acertos/erros pertence a questao do banco e considera respostas registradas em simulados por `question_id`, nao apenas o simulado atualmente aberto.
- Checklist de manutencao: ao mudar o salvamento de respostas em `simulado_answers`, validar se o indice em `/simulados/[id]/editar` e no seletor de questoes continua refletindo acertos e erros reais.

### Atualizacao Raio-X - deteccao preventiva de duplicidade no banco - 2026-06-08

- `app/admin/raio-x-provas/[id]/page.tsx`: a pagina de detalhe do Raio-X passa a carregar bancas ativas (`exam_boards`) e envia-las ao client para resolver o `exam_board_id` usado na checagem de duplicidade.
- `app/admin/raio-x-provas/[id]/page-client.tsx`: ao abrir a revisão, questões originais ainda não enviadas consultam `/api/admin/questions/check-duplicate` com enunciado, alternativas, banca e ano. Duplicatas bloqueantes recebem `is_duplicate=true`, `duplicate_type="database"` e dados de similaridade.
- `app/admin/raio-x-provas/types.ts`: `RaioXQuestion` ganhou metadados opcionais de duplicidade (`is_duplicate`, `duplicate_type`, `duplicate_message`, `duplicate_of`).
- Comportamento visual: questão já existente no banco exibe aviso no card, badge "Já existe no banco" e oculta **Publicar** e **Enviar para revisão**, mantendo apenas ações seguras como **Descartar** e **Variações**.
- Regra de negócio: a duplicidade considera questões já existentes em `questions` com qualquer status, reutilizando a regra do endpoint `check-duplicate` e espelhando o bloqueio do importador de questões.
- Checklist de manutenção: ao alterar `/api/admin/questions/check-duplicate`, `/api/admin/questions/import/save` ou o card do Raio-X, validar que duplicatas continuam bloqueando envio antes do clique e também quando retornadas pela API.

### Atualizacao Raio-X Relatorio Final - topicos em lista e sem parecer nas tags - 2026-06-08

- `app/admin/raio-x-provas/[id]/relatorio/page.tsx`: a consolidacao de tags do relatorio deixou de incluir `teacher_opinion`/Parecer do Professor em `preparedQuestions.tags` e `effectiveModules.tags`.
- `app/admin/raio-x-provas/[id]/relatorio/page-client.tsx`: a secao **O que foi cobrado dentro de cada assunto** usa `TopicTagList`, renderizando tags em lista vertical com setas e separadores.
- Regra de negocio: o Parecer do Professor pode alimentar o texto editorial do Parecer EstudoTOP, mas nao deve aparecer como tag/lista de topicos nos cards do mapa de cobranca.

### Atualizacao Raio-X - status revisado sem regenerar relatorio - 2026-06-08

- `app/admin/raio-x-provas/[id]/page-client.tsx`: quando as questoes ativas estao classificadas/revisadas, o salvamento pode marcar `exam_analyses.status` como `reviewed` sem chamar novamente a geracao do Raio-X.
- O botao **Ver Raio-X final** tambem tenta recuperar o status para **Revisada** se a analise estiver em `review_pending` e cumprir os criterios de revisao.
- Regra de negocio: editar questoes depois da primeira geracao nao deve obrigar regeneracao manual. Para sair de **Aguardando revisao**, basta salvar/abrir o Raio-X final com as questoes ativas tendo assunto do banco e sem status `detected`; questoes anuladas nao bloqueiam.

### Atualização Edição de Simulados — seletor de questões com interface dark premium e filtros do Banco de Questões — 2026-06-09

- `app/simulados/[id]/editar/page-client.tsx`: o modal **Selecionar questões** passou a usar interface dark premium no mesmo padrão visual do Banco de Questões/Jornadas, com fundo preto/azul profundo, grid sutil, card de filtros glassmorphism, cards de questões dark e botão principal em gradiente laranja.
- `app/simulados/[id]/editar/page-client.tsx`: os filtros do seletor de questões foram atualizados para seguir a regra mais recente do Banco de Questões: grid alinhado em colunas iguais, busca textual, disciplina, banca com múltipla seleção, assunto com múltipla seleção, dificuldade com múltipla seleção e ano com múltipla seleção.
- `app/simulados/[id]/editar/page-client.tsx`: criado filtro **Tipo de questão**, com opções `Assertiva / Certo e Errado` e `Alternativa / Múltipla escolha`. A detecção considera `question_type === "true_false"` e também alternativas com labels/textos `Certo` e `Errado`.
- `app/simulados/[id]/editar/page-client.tsx`: os contadores de Banca e Assunto no modal respeitam os demais filtros aplicados, espelhando a lógica em cascata do Banco de Questões.
- `app/simulados/[id]/editar/page.tsx`: a busca de questões publicadas deixou de usar limite artificial de 400 registros e passou a carregar páginas de 1000 até obter todo o banco publicado.
- Regra permanente: qualquer ajuste futuro em filtros do Banco de Questões que altere múltipla seleção, contadores, busca HTML ou tipo de questão deve ser revisado também no seletor de questões de `app/simulados/[id]/editar/page-client.tsx`.
- Checklist de manutenção: ao alterar o modal **Selecionar questões**, validar busca, disciplina, múltiplas bancas, múltiplos assuntos, múltiplos anos, múltiplas dificuldades, filtro de tipo, contadores e vínculo final via `POST /api/admin/simulados/[id]/questions`.

### Atualização Edição de Simulados — seletor de questões compacto, recolhível e com modelo — 2026-06-10

- `app/simulados/[id]/editar/page-client.tsx`: o modal **Selecionar questões** ganhou botão **Mostrar/Ocultar filtros**, permitindo recolher a área de filtros para economizar espaço vertical durante a seleção.
- `app/simulados/[id]/editar/page-client.tsx`: os cards de questões dentro desse modal foram compactados com menor raio, menor padding, fonte menor no enunciado e alternativas mais enxutas. Essa redução é exclusiva do seletor de questões do simulado; não altera o Banco de Questões nem Revisar Questões.
- `app/simulados/[id]/editar/page-client.tsx`: cada questão do seletor ganhou ação **Usar como modelo**, reaproveitando o fluxo já existente de criação manual por modelo. Ao acionar, o sistema fecha o seletor e abre o modal de criação de questão pré-preenchido com a questão escolhida, mantendo a regra de ajustar banca para Estudo TOP e ano atual quando o modelo for editado.
- `app/simulados/page-client.tsx`: a tela **Consultar Simulados** deixou de usar camadas decorativas `fixed` no fundo e passou a usar camadas `absolute`, impedindo que o fundo da página cubra visualmente a sidebar.
- `app/assuntos/page-client.tsx`: a tela **Assuntos** passou a usar uma função local segura de `normalizeDisplayName`, evitando erro de runtime quando o bundle/hot reload não expõe a função importada de `app/lib/utils/text.ts`.
- Regra permanente: no seletor de questões de simulado, alterações de layout compacto devem ser locais ao modal. Não reduzir fonte/espaçamento do Banco de Questões, Revisar Questões, Preview ou Execução do aluno sem pedido explícito.
- Checklist de manutenção: ao alterar o seletor de questões, testar recolher/expandir filtros, selecionar questão, usar questão como modelo, adicionar selecionadas ao simulado e manter a sidebar visível em `/simulados`.

### Atualização Edição de Simulados — "Usar como modelo" cria questão já publicada — 2026-06-11

- `app/simulados/[id]/editar/page-client.tsx` (`ManualQuestionModal.create`): a questão criada via "Usar como modelo" no seletor de questões do simulado agora é salva com `status: "published"` (antes era `"pending_review"`). A vinculação automática ao simulado em edição é mantida.

### Atualização Edição de Simulados — modal "Criar questão manualmente" mais largo e com comentário ao final — 2026-06-11

- `app/simulados/[id]/editar/page-client.tsx` (`ManualQuestionModal`): o modal passou de `max-w-4xl` para `max-w-6xl`.
- `app/simulados/[id]/editar/page-client.tsx` (`ManualQuestionModal`): o campo "Enunciado" ganhou `min-h-56` (maior que o padrão `min-h-32` do `PremiumInput` textarea).
- `app/simulados/[id]/editar/page-client.tsx` (`ManualQuestionModal`): o campo "Comentário do professor" foi movido para depois das alternativas, ficando ao final do formulário (antes ficava entre Enunciado e as alternativas).

### Atualização Edição de Simulados — filtros realmente recolhíveis, rolagem natural e nomes de assuntos — 2026-06-10

- `app/simulados/[id]/editar/page-client.tsx`: o modal **Selecionar questões** foi ajustado para rolagem natural do conteúdo completo. O cabeçalho, a barra de seleção, os filtros e os cards de questões agora rolam juntos; a área de filtros não fica fixa enquanto a lista de questões rola separadamente.
- `app/simulados/[id]/editar/page-client.tsx`: o botão **Mostrar/Ocultar filtros** passa a recolher a barra de filtros com um estado compacto visível, evitando ocupar espaço vertical durante a seleção.
- `app/simulados/[id]/editar/page-client.tsx`: mantida a compactação local da tela de seleção de questões, com espaçamentos e fontes menores apenas nesse modal.
- `app/simulados/[id]/editar/page-client.tsx`: os nomes dos assuntos exibidos em filtros, chips/tags de questão e distribuição por assunto usam normalização local segura, preservando conectivos em minúsculo, por exemplo `Internet e Redes de Computadores`.
- `app/assuntos/page-client.tsx`: a normalização visual local deixou de depender de importação de `normalizeEntityName` para evitar inconsistências de bundle/hot reload e garantir que o card fechado da página `/assuntos` exiba conectivos em minúsculo.
- Regra permanente: no seletor de questões de simulado, não usar lista interna com `overflow-y-auto` separada dos filtros quando o requisito for que filtros rolem junto com os cards. Se for necessário comportamento sticky no futuro, deve ser solicitado explicitamente.

### Atualização Edição de Simulados — dropdowns de filtros com foco automático e camada correta — 2026-06-10

- `app/simulados/[id]/editar/page-client.tsx`: os filtros multi-seleção do modal **Selecionar questões** agora focam automaticamente o campo de busca interno ao abrir o dropdown. O usuário pode clicar no filtro e começar a digitar imediatamente, sem precisar clicar novamente dentro do campo de busca.
- `app/simulados/[id]/editar/page-client.tsx`: os dropdowns de filtros receberam z-index local elevado enquanto abertos, e o card de filtros passou a ter camada própria acima da lista de questões. Isso evita que o dropdown passe por trás dos cards de questões ou dos botões do card.
- Regra permanente: filtros customizados dentro do seletor de questões de simulado devem seguir o padrão do Banco de Questões: abrir, focar a busca automaticamente, permitir digitação imediata e manter o menu acima dos cards.
- Checklist de manutenção: ao alterar `DarkMultiDropdown` ou `DarkDropdownShell`, testar Banca, Assunto, Dificuldade e Ano no modal **Selecionar questões**, verificando foco automático, click-outside, tecla Escape e sobreposição correta sobre os cards.


### Atualização — Banco de Questões / seletor de questões — filtros e busca pós-edição — 2026-06-11

- `app/questoes/page.tsx`: a busca textual (`q`) deixou de restringir a consulta server-side por `code/statement`. A página passa a carregar o conjunto completo do status atual e aplica a busca no client via `questionMatchesFilters`. Isso evita o bug em que, após editar/salvar uma questão filtrada por código, uma nova busca só encontrava a questão depois de atualizar manualmente a página.
- Regra permanente: em `/questoes`, a URL pode preservar `q`, mas a base local de `questions` não deve virar apenas o subconjunto da busca anterior. A busca textual deve operar sobre a lista completa carregada para o status atual.
- `app/simulados/[id]/editar/page-client.tsx`: o card de filtros do modal **Selecionar questões** foi padronizado visualmente com o Banco de Questões: labels, tracking, cores, bordas, hover/focus, menu dos dropdowns e ordem da primeira linha (`Buscar questão`, `Disciplina`, `Assuntos`, `Banca`). A lógica de filtros não foi alterada neste ajuste.
- Checklist de manutenção: ao alterar classes visuais dos filtros de `/questoes`, revisar também o modal **Selecionar questões** em `/simulados/[id]/editar` para evitar desalinhamento de fonte, cor, label e estados de foco/hover.

### Atualizacao Seguranca Admin API - protecao de rotas administrativas - 2026-07-10

- `lib/server/authGuard.ts` permanece como fonte oficial de autenticacao administrativa para APIs via `requireAdmin(request)`. O helper exige token `Bearer`, valida o usuario no Supabase Auth, consulta `profiles` com `role = "admin"` e `is_active = true`, retornando `401` para ausencia/token invalido e `403` para perfil sem permissao.
- `proxy.ts` nao protege rotas `/api/**`; toda rota administrativa em `app/api/admin/**` deve chamar `requireAdmin` diretamente ou por helper intermediario antes de usar `createSupabaseAdminClient`, `supabase.auth.admin` ou qualquer operacao privilegiada.
- `app/api/admin/students/create/route.ts` e `app/api/admin/students/[id]/route.ts` agora exigem `requireAdmin` antes de ler payload, criar/editar aluno ou acionar operacoes `supabase.auth.admin`.
- `app/api/admin/jornadas/[id]/students/route.ts`, `app/api/admin/jornadas/[id]/students/[studentId]/route.ts` e `app/api/admin/jornadas/[id]/simulados/reorder/route.ts` agora exigem `requireAdmin` antes de matricula, cancelamento/pausa/reativacao/extensao e reordenacao administrativa.
- `lib/logging/admin-log-query.ts` agora aplica `requireAdmin` dentro de `listLogs`, protegendo os endpoints segmentados `app/api/admin/logs/activity`, `errors`, `security` e `sessions`.
- `app/api/admin/jornadas/release-job/route.ts` permanece como endpoint tecnico/cron protegido por `CRON_SECRET` via `verifyCronSecret`, com comparacao em tempo constante. Nao misturar esse fluxo com sessao de admin sem decisao explicita.

### Atualizacao Seguranca Student/Auth API - isolamento de aluno e primeiro acesso - 2026-07-10

- `lib/server/supabaseStudentAuth.ts` permanece como fonte oficial de autenticacao das APIs do aluno via `getStudentFromRequest(request)`. O helper exige token `Bearer`, valida o usuario no Supabase Auth e resolve o aluno pela tabela `students`.
- O helper agora rejeita alunos com `status = "pending"` ou `status = "blocked"` nas APIs `app/api/student/**`. `pending` fica restrito aos fluxos de cadastro/primeiro acesso/liberacao; `blocked` nao acessa conteudo protegido.
- `app/api/auth/complete-password-change/route.ts` agora valida que o usuario autenticado e um perfil `student`, possui `must_change_password = true`, existe em `students` e nao esta `blocked` antes de ativar perfil/aluno. A rota nao deve ser usada para reativar conta fora do fluxo de troca obrigatoria.
- `app/api/student/simulados/[id]/attempts/route.ts` agora usa `assertStudentCanStartSimulado` antes de criar ou retomar tentativa, garantindo que simulado vinculado a Jornada respeite matricula ativa, expiracao e status liberado mesmo quando o cliente omite `?jornada=...`.
- `app/api/student/simulados/[id]/attempts/[attemptId]/behavior/route.ts` valida que `simulado_question_id` informado em evento `scissors_used` pertence ao `question_order` da propria tentativa antes de persistir o uso.

## 20. TOPCOINS — EXIBIÇÃO E EXPLICAÇÃO AO ALUNO

**Regra de cálculo:** `app/lib/gamification/topcoins.ts` é a fonte única. A primeira tentativa tem valor-base igual ao total de questões; a segunda usa `ceil(total/2)`; da terceira em diante usa `ceil(total/3)`. O ganho final desconta os erros e nunca fica negativo.

**Componente informativo compartilhado:** `TopCoinValueInfo`, exportado por `app/components/gamification/TopCoinRewardModal.tsx`, exibe a pilha de moedas, o valor calculado e abre um `PremiumModal` explicando a moeda universal, a regra de ganho e as futuras vantagens na plataforma. O modal é montado por portal diretamente em `document.body`, fora da árvore e dos limites visuais do card de simulado; o clique no informativo não aciona a navegação do card.

**Telas:**

- `/meus-simulados`: todos os cards exibem o valor de TopCoins; quando ainda há tentativa, usa a próxima tentativa, e quando o limite terminou mantém a última tentativa contabilizada como referência.
- `/minhas-jornadas/[id]`: todos os cards de simulados exibem o mesmo componente e a mesma regra.
- `/meus-simulados/[id]`: o aviso anterior ao início é clicável e abre a explicação compartilhada.
- `/extrato-topcoins`: o hero explica o conceito, os fatores do cálculo e o uso futuro dos TopCoins.

**Segurança:** a informação é calculada a partir dos dados já autorizados das APIs do aluno; clicar no componente não chama API nem altera saldo, tentativa ou resultado.
