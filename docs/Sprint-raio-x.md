# Sprint Raio-X de Provas — Documentação Técnica, Funcional e Operacional

**Projeto:** EstudoTOP Simulados  
**Módulo:** Raio-X de Provas  
**Rota base:** `/admin/raio-x-provas`  
**Status:** implementado, em melhoria contínua e com documentação consolidada  
**Última atualização documental:** 2026-06-09  
**Objetivo deste documento:** servir como manual completo do módulo Raio-X, explicando finalidade, telas, APIs, banco de dados, regras de negócio, componentes, pontos de atenção e checklist de validação antes de qualquer alteração futura.

---

## 0. PRINCÍPIO DE MANUTENÇÃO DO MÓDULO

Antes de qualquer alteração no Raio-X de Provas, a manutenção deve seguir obrigatoriamente esta ordem:

1. Consultar `docs/INDICE_FUNCOES_SISTEMA.md`.
2. Identificar em quais telas, APIs, componentes e utilitários a função aparece.
3. Alterar somente os arquivos diretamente relacionados ao pedido.
4. Não aproveitar a tarefa para refatorar, redesenhar ou “melhorar” partes não solicitadas.
5. Validar sintaxe e fluxo lógico.
6. Atualizar este documento se o comportamento do Raio-X mudar.
7. Atualizar `docs/INDICE_FUNCOES_SISTEMA.md` se alguma função for criada, removida, movida, padronizada ou tiver dependências novas.

Regra prática:

> O Raio-X é um módulo editorial e operacional. Uma alteração visual ou funcional geralmente impacta revisão de questão, publicação no banco, relatório final e clones. Nunca tratar uma tela isoladamente sem verificar o fluxo completo.

---

## 1. VISÃO GERAL DO RAIO-X DE PROVAS

O Raio-X de Provas é o módulo de inteligência editorial do EstudoTOP Simulados. Ele permite transformar uma prova bruta de concurso em três produtos operacionais:

1. **Questões diagramadas e revisáveis**, prontas para correção pelo professor.
2. **Mapa analítico da prova**, mostrando assuntos, tópicos, dificuldade, perfil de cobrança e distribuição estatística.
3. **Relatório final em formato landing page**, com parecer estratégico do EstudoTOP e exportação em PDF.

Além disso, o módulo permite gerar:

- variações de questões individuais;
- clones completos da prova;
- simulados derivados da prova analisada;
- questões publicadas diretamente no banco.

A lógica central é:

```text
Texto bruto da prova
  → quebra em blocos de questões
  → análise por IA em lotes
  → revisão humana questão por questão
  → classificação editorial
  → publicação no banco / geração de relatório / geração de clones
```

---

## 2. O QUE O RAIO-X FAZ E O QUE ELE NÃO FAZ

### 2.1 O que o módulo faz

- Recebe texto bruto de uma prova.
- Normaliza metadados: concurso, cargo, banca, ano e disciplina.
- Usa IA para diagramar questões.
- Separa enunciado, alternativas, tipo de questão e gabarito sugerido.
- Detecta imagens indicadas no texto.
- Permite revisão manual completa.
- Permite vincular assuntos do banco às questões analisadas.
- Permite marcar questões anuladas.
- Permite descartar questões que não devem entrar no relatório nem no banco.
- Gera mapa de cobrança por assunto.
- Gera relatório final premium.
- Publica questões diretamente no banco.
- Gera variações de questões.
- Gera clones de prova como simulados em rascunho.

### 2.2 O que o módulo não faz atualmente

- Não faz upload direto de PDF como entrada principal.
- Não faz OCR nativo de imagem/PDF.
- Não deve enviar questões do Raio-X para fila de revisão: a regra atual é publicação direta.
- Não deve recriar botão de PDF do dashboard operacional; o PDF oficial fica na rota `/relatorio`.
- Não deve salvar clones no banco antes da aprovação final do professor.

---

## 3. ROTAS DO FRONTEND

| Rota | Arquivos | Função |
|---|---|---|
| `/admin/raio-x-provas` | `app/admin/raio-x-provas/page.tsx` + `page-client.tsx` | Listagem das análises, filtros, métricas, ordenação e exclusão. |
| `/admin/raio-x-provas/nova` | `app/admin/raio-x-provas/nova/page.tsx` + `page-client.tsx` | Criação de nova análise a partir de texto bruto. |
| `/admin/raio-x-provas/[id]` | `app/admin/raio-x-provas/[id]/page.tsx` + `page-client.tsx` | Tela principal: revisão das questões, Raio-X final, parecer, variações e clones. |
| `/admin/raio-x-provas/[id]/relatorio` | `app/admin/raio-x-provas/[id]/relatorio/page.tsx` + `page-client.tsx` | Landing page final do relatório e exportação PDF. |

---

## 4. ARQUIVOS PRINCIPAIS DO MÓDULO

### 4.1 Frontend administrativo

| Arquivo | Responsabilidade |
|---|---|
| `app/admin/raio-x-provas/page.tsx` | Server component da listagem. Busca análises e opções para filtros. |
| `app/admin/raio-x-provas/page-client.tsx` | Interface da listagem: filtros, ordenação, tabela, métricas e exclusão. |
| `app/admin/raio-x-provas/nova/page.tsx` | Server component da nova análise. Carrega disciplinas, bancas, concursos e cargos. |
| `app/admin/raio-x-provas/nova/page-client.tsx` | Formulário de criação, autocomplete, validação, modal de processamento e chamada de análise. |
| `app/admin/raio-x-provas/[id]/page.tsx` | Server component do detalhe. Carrega análise, questões, disciplinas, assuntos, bancas, concursos e simulados clones. |
| `app/admin/raio-x-provas/[id]/page-client.tsx` | Coração do módulo. Contém revisão, Raio-X final, envio ao banco, variações, clones e parecer. |
| `app/admin/raio-x-provas/[id]/relatorio/page.tsx` | Server component do relatório final. |
| `app/admin/raio-x-provas/[id]/relatorio/page-client.tsx` | Landing page do relatório, infográficos, dobras e exportação PDF. |
| `app/admin/raio-x-provas/types.ts` | Tipos do módulo. |
| `app/admin/raio-x-provas/utils.ts` | Labels, status e helpers visuais. |

### 4.2 APIs do módulo

| Endpoint | Arquivo | Função |
|---|---|---|
| `POST /api/admin/exam-analyses/analyze` | `app/api/admin/exam-analyses/analyze/route.ts` | Cria análise, quebra texto em blocos, chama IA, salva questões e dashboard. |
| `GET/PATCH/DELETE /api/admin/exam-analyses/[id]` | `app/api/admin/exam-analyses/[id]/route.ts` | Lê, atualiza ou exclui análise. Também consolida resumo final quando necessário. |
| `POST /api/admin/exam-analyses/[id]/reprocess` | `app/api/admin/exam-analyses/[id]/reprocess/route.ts` | Reprocessa resumo, relatório ou análise completa. |
| `PATCH /api/admin/exam-analyses/[id]/questions/[questionId]` | `app/api/admin/exam-analyses/[id]/questions/[questionId]/route.ts` | Atualiza questão individual analisada. |
| `POST /api/admin/exam-analyses/[id]/questions/[questionId]/variations` | `app/api/admin/exam-analyses/[id]/questions/[questionId]/variations/route.ts` | Gera variações de uma questão analisada. |
| `POST /api/admin/exam-analyses/[id]/clone` | `app/api/admin/exam-analyses/[id]/clone/route.ts` | Gera clone completo da prova sem salvar no banco. |
| `POST /api/admin/exam-analyses/[id]/clone/variation` | `app/api/admin/exam-analyses/[id]/clone/variation/route.ts` | Gera variação individual dentro do painel de clone. |
| `POST /api/admin/exam-analyses/[id]/clone/finalize` | `app/api/admin/exam-analyses/[id]/clone/finalize/route.ts` | Salva questões aprovadas e cria simulado clone em rascunho. |
| `POST/DELETE /api/admin/exam-analyses/[id]/publish` | `app/api/admin/exam-analyses/[id]/publish/route.ts` | Publica ou remove link público do relatório/análise. |

### 4.3 Arquivos compartilhados impactados

| Arquivo | Relação com o Raio-X |
|---|---|
| `app/components/Sidebar.tsx` | Entrada de menu “Raio-X de Provas”. |
| `app/components/AppShell.tsx` | Inclui `/admin/raio-x-provas/**` nas rotas dark premium. |
| `app/components/questions/RichTextEditor.tsx` | Editor usado em enunciado, alternativas, parecer e variações. |
| `app/components/questions/SubjectMultiSelect.tsx` | Seleção de múltiplos assuntos nas questões e variações. |
| `app/components/ui/SelectionGhostBar.tsx` | Barra fantasma para ações em massa. |
| `app/components/questions/QuestionActionModal.tsx` | Modal de confirmação/progresso usado em ações do fluxo. |
| `app/lib/utils/question-splitter.ts` | Quebra o texto bruto em blocos de questões. |
| `app/lib/markdownReport.ts` | Renderização/apoio para conteúdo markdown do relatório. |
| `app/lib/pdf/raio-x-pdf.ts` | Legado/descontinuado para dashboard; não é o fluxo oficial atual. |

---

## 5. BANCO DE DADOS

### 5.1 Tabelas principais

| Tabela | Responsabilidade |
|---|---|
| `exam_analyses` | Cabeçalho da análise: título, concurso, cargo, banca, ano, disciplina, status, dashboard, resumo IA, parecer e relatório. |
| `exam_analysis_questions` | Questões diagramadas pela IA e revisadas pelo professor. |
| `exam_contests` | Concursos usados no autocomplete da nova análise. |
| `exam_positions` | Cargos usados no autocomplete da nova análise. |
| `exam_boards` | Bancas cadastradas, usadas na análise e no banco de questões. |
| `subjects` | Assuntos do banco vinculados às questões analisadas. |
| `questions` | Banco definitivo de questões publicado a partir do Raio-X. |
| `question_alternatives` | Alternativas das questões publicadas no banco. |
| `question_subjects` | Relação many-to-many de questões publicadas com assuntos. |
| `simulados` | Usado pelo fluxo de clone de prova para criar simulado em rascunho. |
| `simulado_questions` | Vínculo das questões aprovadas no clone com o simulado criado. |

### 5.2 Campos importantes de `exam_analyses`

| Campo | Uso |
|---|---|
| `title` | Nome automático da análise no padrão `RaioX - Prova - Concurso - Cargo - Ano - Banca`. |
| `contest_name` | Concurso da prova; também propagado como `orgao` nas questões publicadas. |
| `position_name` | Cargo da prova. |
| `board_name` / `board_id` | Banca textual e/ou vinculada ao cadastro de bancas. |
| `exam_year` | Ano da prova. |
| `discipline_id` / `discipline_name` | Disciplina analisada, com padrão atual para Informática/TI. |
| `raw_content` | Texto bruto original da prova. |
| `teacher_notes` | Observações iniciais e editoriais do professor. |
| `ai_summary_text` | Resumo original gerado pela IA. |
| `final_summary_text` | Resumo consolidado após considerações do professor. |
| `ai_adjustment_prompt` | Comando do professor para ajustar o resumo/relatório. |
| `dashboard` | JSON com estatísticas e mapa de cobrança. |
| `modules_summary` | Resumo por assunto/módulo. |
| `report_content` | Conteúdo markdown/html do relatório completo. |
| `status` | Estado da análise: `processing`, `review_pending`, `reviewed`, `failed`. |

### 5.3 Campos importantes de `exam_analysis_questions`

| Campo | Uso |
|---|---|
| `exam_analysis_id` | Vínculo com a análise. |
| `parent_question_id` | Vínculo de variações com a questão original. |
| `original_number` | Número sequencial exibido. Deve ser sempre 1, 2, 3... com base no array, não no retorno da IA. |
| `statement` | Enunciado em HTML. Deve preservar afirmativas e indicações de imagem. |
| `alternatives` | JSON de alternativas. |
| `answer_key` | Gabarito sugerido ou definido pelo professor. |
| `question_type` | `multiple_choice` ou `true_false`. |
| `is_annulled` | Indica questão anulada. Quando anulada, o gabarito é limpo. |
| `has_image` | Indica questão com imagem ou referência visual. |
| `visual_analysis_status` | Estado da análise visual: `none`, `pending`, `applied`, `review_required`, `failed`. |
| `discipline_id` | Disciplina associada. |
| `subject_id` | Assunto principal de compatibilidade. |
| `subject_ids` | Lista de múltiplos assuntos. |
| `module_name` | Assunto/módulo sugerido pela IA. |
| `subtopic_name` | Tópico de cobrança. |
| `knowledge_points` | Pontos cobrados/tags técnicas. |
| `teacher_opinion` | Parecer do professor sobre a questão. |
| `difficulty_level` | Dificuldade de 1 a 5. |
| `status` | `detected`, `confirmed`, `pending_review`, `published`, `discarded`, `variation`. |

---

## 6. STATUS OFICIAIS

### 6.1 Status da análise

| Status | Significado | Uso na interface |
|---|---|---|
| `processing` | Análise em processamento. | Estado temporário. |
| `review_pending` | Questões aguardam revisão. | Badge âmbar. |
| `reviewed` | Revisão concluída ou análise pronta para relatório. | Badge verde. |
| `failed` | Erro de análise. | Badge vermelho. |

### 6.2 Status da questão analisada

| Status | Significado |
|---|---|
| `detected` | Questão recém-detectada pela IA, ainda não revisada. |
| `confirmed` | Questão revisada e confirmada no Raio-X. |
| `published` | Questão publicada diretamente no banco. |
| `discarded` | Questão descartada da análise. |
| `variation` | Variação gerada temporariamente ou vinculada ao fluxo de variação. |
| `pending_review` | Estado antigo/compatibilidade. Regra atual: Raio-X não deve enviar para fila. |

### 6.3 Status visual de imagem

Valores oficiais de `visual_analysis_status`:

```text
none | pending | applied | review_required | failed
```

Regra permanente:

> Nunca usar `not_required` nem `needs_review`. Esses valores foram removidos pela migration de correção visual.

---

## 7. FLUXO DE NOVA ANÁLISE

### 7.1 Entrada de dados

A tela `/admin/raio-x-provas/nova` recebe:

- Concurso;
- Cargo;
- Banca;
- Ano;
- Disciplina;
- Observações iniciais do professor;
- Texto bruto da prova.

Concurso, cargo e banca usam busca/autocomplete. Quando concurso ou cargo não existem no banco, podem ser cadastrados inline pelas APIs de autocomplete. A banca usa a base `exam_boards`.

O título não é digitado manualmente. Ele é gerado automaticamente:

```text
RaioX - Prova - [Concurso] - [Cargo] - [Ano] - [Banca]
```

### 7.2 Normalização

A normalização ocorre em dois níveis:

1. **Frontend:** antes de enviar, a interface padroniza valores digitados para reduzir divergências de maiúsculas/minúsculas.
2. **Backend:** a API reforça a normalização antes de salvar a análise.

Essa dupla proteção evita que a mesma banca, concurso ou cargo sejam salvos com variações como `vunesp`, `VUNESP`, `Vunesp`.

### 7.3 Validação antes de analisar

A análise não deve prosseguir se faltar:

- concurso;
- cargo;
- banca;
- ano;
- disciplina;
- texto bruto;
- blocos detectáveis de questão.

A tela usa `splitIntoQuestionBlocks()` no cliente para dar feedback preliminar. O backend executa sua própria quebra novamente e é a fonte real de verdade.

---

## 8. PROCESSAMENTO POR IA

### 8.1 Quebra em blocos

A função `splitIntoQuestionBlocks()` fica em:

```text
app/lib/utils/question-splitter.ts
```

Ela é usada para detectar blocos individuais de questão no texto bruto. A lógica deve preservar:

- enunciados longos;
- afirmativas I, II, III;
- listas numeradas;
- alternativas A, B, C, D, E;
- questões Certo/Errado;
- referências a imagens.

### 8.2 Regra crítica das afirmativas

Quando uma questão contém afirmativas como:

```text
I. Texto da primeira afirmativa...
II. Texto da segunda afirmativa...
III. Texto da terceira afirmativa...
```

essas afirmativas pertencem ao enunciado, não às alternativas. O prompt da IA e o pós-processamento devem manter tudo antes das alternativas A-E no campo `statement`.

### 8.3 Análise em lotes

A API principal é:

```text
app/api/admin/exam-analyses/analyze/route.ts
```

Fluxo interno:

1. Recebe os metadados e o texto bruto.
2. Normaliza metadados.
3. Executa `splitIntoQuestionBlocks()` no servidor.
4. Envia cada bloco individualmente à IA por `analyzeBlockWithOpenAI`.
5. Processa blocos em paralelo, em lotes controlados.
6. Gera o resumo estratégico da prova com base no texto completo.
7. Salva `exam_analyses`.
8. Salva `exam_analysis_questions`.
9. Retorna ID da análise criada.

Regra importante:

> Se foram detectados 14 blocos, o sistema deve tentar gerar 14 questões. O modelo não deve receber a prova inteira em uma chamada única para devolver uma lista parcial.

### 8.4 Modelo de IA

O modelo padrão é configurável por ambiente:

```text
OPENAI_IMPORT_MODEL
OPENAI_MODEL
```

O fallback usado no projeto é `gpt-4o-mini`.

---

## 9. TELA DE DETALHE: DOIS MODOS PRINCIPAIS

A rota `/admin/raio-x-provas/[id]` possui dois modos internos:

1. **Revisar questões** (`review`)
2. **Ver Raio-X final** (`raiox`)

O arquivo central é:

```text
app/admin/raio-x-provas/[id]/page-client.tsx
```

Esse arquivo concentra muitos recursos. Qualquer alteração nele deve ser feita com extremo cuidado.

---

## 10. MODO REVISAR QUESTÕES

### 10.1 Objetivo

Permitir que o professor revise cada questão analisada pela IA antes de publicar, descartar, anular, gerar variações ou usar no relatório.

### 10.2 Componentes e funções internas importantes

| Função/componente | Responsabilidade |
|---|---|
| `ReviewHeader` | Exibe métricas de revisão. |
| `QuestionNavigator` | Navegação sequencial 1..N. |
| `QuestionCard` | Card principal de revisão da questão. |
| `patchQuestion` | Persiste alterações de uma questão. |
| `persistQuestions` | Salva conjunto de questões. |
| `saveActiveQuestion` | Salva a questão ativa. |
| `discardQuestion` | Marca questão como descartada. |
| `sendToBank` | Publica questão ou lote no banco. Regra atual: publicação direta. |
| `sendToBankWithModal` | Envolve publicação com validações e modal. |
| `detectDatabaseDuplicates` | Verifica duplicatas no banco. |
| `checkClassification` | Bloqueia relatório sem classificação suficiente. |
| `checkTeacherOpinion` | Valida parecer do professor antes do relatório. |

### 10.3 Dados revisáveis no card

Cada questão permite revisar:

- enunciado;
- alternativas;
- gabarito;
- tipo de questão;
- ano;
- banca;
- disciplina;
- dificuldade;
- assunto principal;
- múltiplos assuntos;
- tópico de cobrança;
- pontos de conhecimento;
- parecer do professor;
- anulação;
- descarte.

### 10.4 Rodapé do card

O rodapé atual trabalha com quatro ações principais:

1. **Descartar** — marca a questão como `discarded`.
2. **Anular/Desanular** — alterna `is_annulled`; quando anula, limpa `answer_key`.
3. **Variações** — abre modal de variações da questão.
4. **Preparar para publicação** — seleciona a questão para publicação em lote.

A seleção em massa usa `SelectionGhostBar` e deve exibir apenas a ação coerente com o fluxo atual: **Publicar**.

### 10.5 Regra atual de publicação

Regra oficial:

> Questões do Raio-X não devem ir para fila de revisão. Elas são publicadas diretamente no banco com `status: "published"`.

Isso vale para:

- publicação individual;
- publicação em lote;
- variações enviadas ao banco;
- clone finalizado;
- questões derivadas do Raio-X.

### 10.6 Duplicatas

A verificação de duplicatas ocorre em dois momentos:

**1. Preventiva — ao carregar a revisão (implementada 2026-06-08):**

Ao abrir a tela de revisão, o sistema consulta `/api/admin/questions/check-duplicate` automaticamente para todas as questões originais com status `detected`. Questões já existentes no banco são marcadas com `is_duplicate=true` antes de qualquer ação do professor. Isso evita que o professor revise e tente publicar uma questão que já está no banco.

**2. Explícita — antes da publicação:**

Antes da publicação manual, o frontend também consulta:

```text
/api/admin/questions/check-duplicate
```

A verificação considera em ambos os momentos:

- enunciado;
- alternativas;
- banca;
- ano;
- similaridade textual;
- registros já existentes no banco, independentemente do status.

Se a questão já existe no banco:

- o card deve exibir badge "Já existe no banco";
- botões de publicação devem ficar ocultos;
- o modal deve explicar que a questão já consta no banco;
- ações seguras (Descartar, Variações) continuam disponíveis.

### 10.7 Propagação de órgão

Ao publicar questão originada do Raio-X, o campo `orgao` deve receber:

```text
analysis.contest_name || null
```

Essa regra vale para:

- envio individual;
- envio em lote;
- variações;
- clones finalizados.

---

## 11. MODO VER RAIO-X FINAL

### 11.1 Objetivo

Transformar as questões revisadas em leitura estratégica da prova.

O Raio-X final mostra:

- KPIs;
- mapa de cobrança;
- distribuição por assunto;
- dificuldade média;
- questões anuladas;
- assuntos dominantes;
- tópicos cobrados dentro de cada assunto;
- parecer editorial do professor;
- geração do relatório final;
- criação de clone de prova.

### 11.2 Componente principal

O componente central é:

```tsx
RaioXFinalView
```

Ele fica em:

```text
app/admin/raio-x-provas/[id]/page-client.tsx
```

### 11.3 `effectiveModules`

O cálculo de `effectiveModules` deve priorizar assuntos revisados pelo professor:

1. Se a questão tem `subject_ids` ou `subject_id`, usar os nomes reais de `subjects`.
2. Se não tem assunto do banco, usar `module_name` sugerido pela IA.
3. Questões descartadas não entram no cálculo.

Regra:

> O relatório e o mapa de cobrança devem refletir a curadoria final do professor, não apenas a sugestão inicial da IA.

### 11.4 Empate de assunto dominante

Se dois ou mais assuntos tiverem a mesma quantidade de questões, o texto deve indicar empate. Não deve declarar um único dominante quando os percentuais são iguais.

### 11.5 Dobra “O que foi cobrado dentro de cada assunto”

Essa dobra deve mostrar, por assunto:

- número de questões;
- percentual;
- questões relacionadas;
- tópicos/tags cobrados;
- conhecimentos efetivamente exigidos.

Fontes permitidas:

- assunto do banco;
- `subtopic_name`;
- `knowledge_points`.

Regra:

> Não usar `teacher_opinion` como tag nessa dobra. O parecer do professor é insumo editorial, não tópico técnico.

---

## 12. PARECER ESTUDOTOP

### 12.1 Função

O Parecer EstudoTOP é a camada editorial humana do relatório. Ele deve orientar a leitura estratégica da prova.

Na tela final, o professor pode informar ou ajustar:

- número de questões;
- assuntos cobrados;
- dificuldade;
- alertas;
- texto livre de parecer.

### 12.2 Regras

- O relatório final não deve ser tratado como mero dashboard automático.
- O parecer do professor deve ser valorizado visualmente.
- A IA pode ajudar a consolidar, mas não deve substituir a curadoria humana.
- O relatório deve ser bloqueado ou alertado quando as questões ainda não estiverem classificadas.

---

## 13. RELATÓRIO FINAL / LANDING PAGE

### 13.1 Rota

```text
/admin/raio-x-provas/[id]/relatorio
```

Arquivos:

```text
app/admin/raio-x-provas/[id]/relatorio/page.tsx
app/admin/raio-x-provas/[id]/relatorio/page-client.tsx
```

### 13.2 Objetivo

Exibir o resultado final do Raio-X como uma landing page premium, pronta para leitura, apresentação e exportação em PDF.

### 13.3 Estrutura visual

O relatório usa backgrounds oficiais em:

```text
public/images/raio-x/
```

Constantes importantes no `page-client.tsx` do relatório:

```tsx
HERO_BG
SECTION_BLUE_BG
SECTION_ORANGE_BG
COLORS
```

### 13.4 Conteúdo esperado

O relatório final deve conter:

- hero com identidade visual do Raio-X;
- resumo executivo;
- dados da prova;
- KPIs;
- mapa de cobrança;
- assuntos cobrados;
- detalhamento por assunto;
- dificuldade;
- leitura estratégica;
- parecer EstudoTOP;
- conclusão.

### 13.5 Exportação PDF

A exportação do PDF deve ocorrer na rota `/relatorio`, capturando o conteúdo da landing.

Regra oficial:

> O PDF do Raio-X final pertence à rota `/admin/raio-x-provas/[id]/relatorio`. Não recriar PDF do dashboard operacional em `/admin/raio-x-provas/[id]` sem pedido explícito.

### 13.6 Funções auxiliares do relatório

| Função | Uso |
|---|---|
| `cleanText` | Remove sujeira textual para exibição. |
| `cleanBlockText` | Limpa blocos longos. |
| `clampText` | Limita textos em cards. |
| `difficultyLabel` | Converte nível numérico em label textual. |
| `difficultyTone` | Define tom visual da dificuldade. |
| `safeFileName` | Gera nome seguro para PDF. |
| `unique` | Remove duplicatas em listas. |
| `getQuestionTags` | Extrai tags de uma questão. |
| `moduleTags` | Consolida tags por assunto. |

---

## 14. VARIAÇÕES DE QUESTÕES

### 14.1 Fluxo

1. Professor clica em **Variações** no card da questão.
2. Define quantidade e fidelidade.
3. API gera variações com IA.
4. As variações aparecem em painel de revisão.
5. Professor edita, descarta ou publica.

### 14.2 Endpoint

```text
POST /api/admin/exam-analyses/[id]/questions/[questionId]/variations
```

Arquivo:

```text
app/api/admin/exam-analyses/[id]/questions/[questionId]/variations/route.ts
```

### 14.3 Componentes

| Componente | Função |
|---|---|
| `VariationModalView` | Modal inicial com quantidade e fidelidade. |
| `VariationReviewPanel` | Painel full-screen para revisar variações. |
| `VariationCard` | Card individual da variação. |
| `VariationSendProgressModal` | Modal de progresso ao publicar variações. |

### 14.4 Fidelidade

Opções do modal:

| Valor | Significado |
|---|---|
| 100% | Espelho estrutural, mudando contexto/texto. |
| 75% | Muito próxima. |
| 50% | Equilibrada. |
| 25% | Mais livre. |

### 14.5 Regras

- Variação não deve ser publicada sem revisão.
- Variação deve preservar assunto, banca, estilo e dificuldade, salvo ajuste intencional.
- Variação publicada deve ir direto para `questions` com status `published`.
- O campo `orgao` deve receber `analysis.contest_name`.
- `visual_analysis_status` de variações deve ser `none`, salvo se houver imagem adicionada posteriormente.

---

## 15. CLONE DE PROVA

### 15.1 Objetivo

Gerar um simulado novo, em rascunho, com questões originais criadas pela IA com base na prova analisada.

O clone não é uma cópia literal. Ele preserva:

- estrutura da prova;
- estilo da banca;
- assuntos cobrados;
- nível de cobrança;
- distribuição aproximada dos temas.

### 15.2 Arquivos

| Arquivo | Função |
|---|---|
| `app/api/admin/exam-analyses/[id]/clone/route.ts` | Gera questões do clone sem salvar. |
| `app/api/admin/exam-analyses/[id]/clone/variation/route.ts` | Gera variação individual dentro do clone. |
| `app/api/admin/exam-analyses/[id]/clone/finalize/route.ts` | Salva questões aprovadas e cria o simulado. |
| `app/admin/raio-x-provas/[id]/page-client.tsx` | UI completa do clone: modal, progresso, painel de revisão e finalização. |

### 15.3 Fluxo em duas fases

```text
Fase 1 — Gerar
  → IA cria questões
  → nada é salvo no banco
  → professor revisa no CloneReviewPanel

Fase 2 — Aprovar
  → professor clica Aprovar simulado
  → questões são salvas no banco
  → simulado é criado em rascunho
  → questões são vinculadas ao simulado
```

Regra central:

> Nenhuma questão de clone deve ser salva no banco antes da aprovação final do professor.

### 15.4 Componentes do clone

| Componente | Função |
|---|---|
| `CloneProvaModal` | Configura título, similaridade e dificuldade. |
| `CloneProgressModal` | Mostra progresso de geração. |
| `CloneReviewPanel` | Painel full-screen para revisar o simulado antes de salvar. |
| `CloneAlternativeEditor` | Editor de alternativas do clone. |

### 15.5 Opções do clone

| Campo | Valores | Padrão |
|---|---|---|
| Título | Texto livre | `Simulado - Clone (Concurso) - Cargo - Ano` |
| Similaridade | 100%, 75%, 50%, 25% | 75% |
| Ajuste de dificuldade | -2, -1, 0, +1, +2 | 0 |

### 15.6 Regras do clone

- O simulado gerado deve ficar com `status = draft`.
- As questões geradas devem ficar como rascunho/publicadas conforme regra operacional atual do fluxo de finalização.
- O clone não deve ser vinculado automaticamente a Jornada.
- A banca das questões geradas pode usar “Estudo TOP” como banca de autoria, conforme lógica atual da API.
- O `orgao` das questões salvas deve receber `analysis.contest_name || null`.
- O clone deve manter múltiplos assuntos quando definidos.

---

## 16. REPROCESSAMENTO

### 16.1 Endpoint

```text
POST /api/admin/exam-analyses/[id]/reprocess
```

Arquivo:

```text
app/api/admin/exam-analyses/[id]/reprocess/route.ts
```

### 16.2 Modos

| Modo | Função |
|---|---|
| `summary` | Regera/consolida resumo estratégico. |
| `report` | Gera relatório detalhado. |
| `full` | Reprocessa análise completa a partir do texto bruto. |

### 16.3 Inserir nova prova

Na tela `[id]`, o botão **Inserir nova prova** abre modal com texto bruto novo. O fluxo cria uma nova análise e remove/deixa de usar a anterior conforme implementação atual.

Regras:

- Usar o mesmo pipeline da análise inicial.
- Mostrar progresso premium.
- Não reaproveitar questões antigas como se fossem da nova prova.
- Preservar metadados da análise quando fizer sentido.

---

## 17. PUBLICAÇÃO E LINK PÚBLICO

### 17.1 Endpoint

```text
POST /api/admin/exam-analyses/[id]/publish
DELETE /api/admin/exam-analyses/[id]/publish
```

Arquivo:

```text
app/api/admin/exam-analyses/[id]/publish/route.ts
```

### 17.2 Função

Gerar ou remover token público da análise/relatório, permitindo cópia de link público quando o recurso estiver habilitado.

---

## 18. DESIGN E PADRÃO VISUAL

### 18.1 Tema operacional

As telas administrativas do Raio-X usam tema dark premium:

- fundo escuro;
- cards translúcidos;
- bordas suaves;
- glow laranja/azul;
- tipografia reduzida e organizada;
- ações em rodapé para evitar poluição visual.

### 18.2 Card de questão

Padrão visual:

```text
relative isolate
rounded-[2rem]
border border-white/[0.07]
bg-white/[0.03]
backdrop-blur-sm
shadow-xl shadow-black/30
```

Questão com imagem pode usar glow azul.

### 18.3 Regra visual permanente

> Não criar um terceiro padrão de card de questão para o Raio-X. O card deve seguir o padrão dark premium usado em Questões, Revisar Questões e Simulados.

---

## 19. REGRAS DE NEGÓCIO CONSOLIDADAS

1. A entrada atual do módulo é texto bruto, não PDF.
2. O título da análise é automático.
3. Concurso, Cargo, Banca e Ano são obrigatórios.
4. A disciplina padrão é Informática/TI, mas a estrutura permite expansão.
5. O backend sempre revalida e renormaliza dados.
6. A IA deve preservar afirmativas no enunciado.
7. A análise deve ser feita por blocos individuais.
8. `original_number` deve ser sequencial por posição.
9. Questões descartadas não entram no dashboard nem relatório.
10. Questões anuladas entram no relatório como anuladas, sem gabarito obrigatório.
11. Assuntos do banco têm prioridade sobre módulos sugeridos pela IA.
12. `teacher_opinion` não é tag técnica.
13. Questões do Raio-X são publicadas diretamente, não enviadas à fila.
14. O campo `orgao` é propagado a partir de `contest_name`.
15. Variações e clones exigem revisão antes da gravação/publicação final.
16. PDF oficial fica na rota `/relatorio`.
17. Não usar valores antigos de `visual_analysis_status`.
18. Não alterar recursos externos ao Raio-X sem necessidade explícita.

---

## 20. PONTOS DE RISCO

### 20.1 Arquivo grande

`app/admin/raio-x-provas/[id]/page-client.tsx` concentra muitos recursos. Alterações pequenas podem afetar:

- revisão de questão;
- publicação;
- variações;
- relatório;
- clone;
- seleção em massa;
- modais.

Antes de alterar, localizar exatamente a função afetada.

### 20.2 Duplicidade de renderização

A renderização de alternativas aparece em vários pontos:

- revisão de questão original;
- variações;
- clone;
- relatório;
- publicação no banco.

Mudanças em alternativas devem ser validadas em todos esses contextos.

### 20.3 Assuntos múltiplos

O sistema mantém `subject_id` para compatibilidade, mas a regra moderna usa `subject_ids`.

Regra:

> Ao atualizar assuntos, manter `subject_ids` como fonte principal e `subject_id` como primeiro item para compatibilidade.

### 20.4 Relatório final

Não confundir:

- dashboard operacional em `/admin/raio-x-provas/[id]`;
- relatório final em `/admin/raio-x-provas/[id]/relatorio`.

O PDF pertence ao segundo.

### 20.5 Clones

O clone possui lógica delicada de duas fases. Nunca salvar antes da aprovação final.

---

## 21. CHECKLIST DE VALIDAÇÃO

### 21.1 Nova análise

- [ ] Criar análise com Concurso, Cargo, Banca, Ano e Disciplina.
- [ ] Cadastrar concurso/cargo inline quando não existir.
- [ ] Selecionar banca existente.
- [ ] Cadastrar banca inline quando necessário.
- [ ] Colar texto bruto com múltiplas questões.
- [ ] Confirmar que N blocos detectados geram N questões.
- [ ] Confirmar que afirmativas I/II/III permanecem no enunciado.
- [ ] Confirmar que questão C/E não vira A/B.
- [ ] Confirmar que imagem indicada no texto gera marcação visual.

### 21.2 Revisão

- [ ] Navegador mostra 1..N sem duplicidade.
- [ ] Editar enunciado e salvar.
- [ ] Editar alternativas e salvar.
- [ ] Alterar gabarito.
- [ ] Alterar dificuldade.
- [ ] Alterar assunto único e múltiplos assuntos.
- [ ] Marcar e desmarcar anulada.
- [ ] Descartar questão.
- [ ] Gerar variações.
- [ ] Selecionar para publicação em lote.

### 21.3 Publicação

- [ ] Publicar questão individual diretamente no banco.
- [ ] Publicar lote pela `SelectionGhostBar`.
- [ ] Bloquear publicação sem assunto.
- [ ] Detectar duplicata ao carregar revisão (badge "Já existe no banco" visível automaticamente).
- [ ] Confirmar que botões Publicar/Enviar ficam ocultos para questões marcadas como duplicatas.
- [ ] Confirmar `orgao = contest_name` na questão criada.
- [ ] Confirmar status `published` no banco.

### 21.4 Raio-X final

- [ ] Mapa usa assuntos do banco quando existem.
- [ ] Questões descartadas não entram nas métricas.
- [ ] Questões anuladas aparecem como anuladas.
- [ ] Empate de assunto dominante é descrito corretamente.
- [ ] Dobra “O que foi cobrado” não usa parecer como tag.
- [ ] Parecer EstudoTOP preenchido — se vazio, geração bloqueada com aviso (obrigatório).
- [ ] Parecer EstudoTOP pode ser editado/consolidado.
- [ ] Gerar relatório completo funciona.

### 21.5 Relatório

- [ ] Abrir `/relatorio`.
- [ ] Conferir hero, dobras, gráficos e cards.
- [ ] Conferir textos longos sem estouro visual.
- [ ] Exportar PDF.
- [ ] Confirmar que o PDF captura a landing, não o dashboard operacional.

### 21.6 Variações

- [ ] Gerar 1 variação.
- [ ] Gerar múltiplas variações.
- [ ] Editar variação antes de publicar.
- [ ] Descartar variação.
- [ ] Publicar variação diretamente.
- [ ] Confirmar assunto e órgão.

### 21.7 Clone de prova

- [ ] Abrir modal de clone.
- [ ] Alterar título.
- [ ] Alterar similaridade.
- [ ] Alterar dificuldade.
- [ ] Gerar clone sem salvar no banco.
- [ ] Revisar questões no `CloneReviewPanel`.
- [ ] Gerar variação dentro do clone.
- [ ] Adicionar questão manual.
- [ ] Adicionar questão com IA.
- [ ] Aprovar simulado.
- [ ] Confirmar simulado criado em rascunho.
- [ ] Confirmar questões vinculadas ao simulado.
- [ ] Confirmar `orgao` nas questões salvas.

---

## 22. HISTÓRICO CONSOLIDADO DE DECISÕES

### 2026-05-29

- Módulo Raio-X criado como item separado no menu.
- MVP definido sem upload de PDF.
- Entrada por texto bruto.
- Nome automático da análise.
- Ações por questão: publicar, descartar, variações.

### 2026-05-30

- Autocomplete compacto de banca.
- Concurso e Cargo com autocomplete/cadastro.
- Fluxo de revisão questão por questão.
- Modo “Revisar questões” e modo “Ver Raio-X final”.
- Observações iniciais do professor.
- Progresso premium de análise.
- Correção de `visual_analysis_status`.

### 2026-06-04

- Análise em blocos individuais para evitar retorno parcial da IA.
- `original_number` sempre sequencial.
- Correção de plural “questão/questões”.
- Gold standard visual dos cards dark.

### 2026-06-06

- Relatório final evoluído para landing page premium.
- PDF concentrado na rota `/relatorio`.
- Dashboard operacional deixa de ser o ponto principal de exportação PDF.

### 2026-06-07 e 2026-06-08

- Clone de prova implementado.
- Fluxo em duas fases: gerar sem salvar, revisar, aprovar e só então persistir.
- `CloneReviewPanel` redesenhado; suporta adicionar questão manual e questão com IA dentro do painel.
- Variações internas do clone adicionadas.
- Detecção preventiva de duplicatas ao carregar a revisão: questões já existentes no banco recebem `is_duplicate=true` automaticamente antes da primeira ação do professor; botões Publicar/Enviar ficam ocultos.

### 2026-06-09

- Publicação direta consolidada: Raio-X não envia para fila de revisão.
- Rodapé do card reorganizado.
- Toggle Anular/Desanular implementado no fluxo operacional.
- Propagação de `orgao` a partir de `analysis.contest_name` consolidada.

---

## 23. REGRA FINAL

Este documento descreve o comportamento esperado do módulo Raio-X. Se o código divergir deste documento, antes de corrigir qualquer coisa deve-se identificar se:

1. o código está errado;
2. a documentação ficou desatualizada;
3. houve decisão recente não documentada.

Depois da correção, atualizar obrigatoriamente:

- `docs/Sprint-raio-x.md`;
- `docs/INDICE_FUNCOES_SISTEMA.md`.
