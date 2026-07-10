# STATUS DO PROJETO — EstudoTOP Simulados

_Atualizado automaticamente pelo agente a cada implementação concluída._

---

## Sprint A — Cadastro de Aluno — ✅ Concluído

- [x] Tabela `students` com status `pending | active | blocked | inactive`
- [x] API `POST /api/admin/students/create` — cria conta Supabase Auth + perfil
- [x] API `POST /api/admin/students/resend-welcome` — reenvia e-mail
- [x] Páginas `/alunos`, `/alunos/novo`, `/alunos/[id]`
- [x] E-mail de boas-vindas ao cadastrar aluno
- [x] Migration `006_students.sql` aplicada

---


## Sprint E-mails — ✅ Implementado em 2026-06-12

- [x] Primeiro e-mail institucional do aluno atualizado para o assunto **"🦉 Você chegou!"**.
- [x] Template HTML claro/premium criado em `app/lib/email/studentWelcomeTemplate.ts`, com espaçamento confortável entre linhas e parágrafos.
- [x] Envio institucional de boas-vindas via Resend nas rotas de criação e reenvio de aluno.
- [x] `POST /api/admin/students/create` passa a enviar o e-mail institucional de boas-vindas ao cadastrar aluno.
- [x] `POST /api/admin/students/resend-welcome` passa a reenviar o e-mail institucional de boas-vindas.
- [x] Perfil do aluno em `/admin/alunos/[id]` recebeu botão **Reenviar boas-vindas** no card **Sistema**.
- [x] Índice de funções atualizado.

## Sprint B — Jornadas (Admin) — 🔄 Implementado, aguardando testes e ajustes finais

### Banco de dados

- [x] Migration `007_jornadas.sql` criada com as 4 tabelas
- [x] Tabela `jornadas` com status `draft | published | archived`, índices e trigger `updated_at`
- [x] Tabela `jornada_simulados` com unique `(jornada_id, simulado_id)` e `(jornada_id, order_number)`
- [x] Tabela `student_jornadas` com unique `(student_id, jornada_id)` e check `expires_at > started_at`
- [x] Tabela `student_jornada_simulados` com unique `(student_jornada_id, jornada_simulado_id)`
- [ ] **Migration aplicada no Supabase** ← pendente (arquivo criado, não aplicado)

### APIs

- [x] `GET/POST /api/admin/jornadas` — listar e criar jornada
- [x] `GET/PATCH/DELETE /api/admin/jornadas/[id]` — ler, publicar, arquivar, editar, excluir
- [x] `GET/POST/DELETE /api/admin/jornadas/[id]/simulados` — listar, vincular, remover simulado
- [x] `PATCH /api/admin/jornadas/[id]/simulados/reorder` — reordenar por drag-and-drop
- [x] `GET/POST /api/admin/jornadas/[id]/students` — listar alunos e atribuir aluno
- [x] `PATCH /api/admin/jornadas/[id]/students/[studentId]` — cancelar matrícula e adicionar dias
- [x] `GET /api/admin/jornadas/release-job` — job de liberação progressiva (endpoint HTTP)

### Funcionalidades — Checklist da Seção 14

- [x] Admin consegue criar, editar, publicar e arquivar uma Jornada
- [x] Admin consegue adicionar simulados à Jornada (incluir existente)
- [x] Admin consegue reordenar simulados via drag-and-drop (framer-motion `Reorder`)
- [x] Simulados têm botão "Incluir em Jornada" **na listagem** (`/simulados`)
- [ ] Simulados têm botão "Incluir em Jornada" **no detalhe** (`/simulados/[id]`) ← não implementado
- [x] Admin consegue atribuir aluno a uma Jornada publicada
- [x] Sistema calcula datas de liberação corretamente **sem `exam_date`** (`intervalo = meses×30 / total`)
- [x] Sistema calcula datas de liberação corretamente **com `exam_date`** (`intervalo = (exam_date - 7d - started_at) / total`)
- [x] E-mail de boas-vindas disparado assincronamente na atribuição (via Resend)
- [x] Job de liberação progressiva implementado e idempotente
- [x] E-mail de liberação disparado assincronamente quando simulado é liberado (via Resend)
- [x] Admin consegue cancelar matrícula de aluno
- [x] Admin consegue adicionar dias ao `expires_at` de uma matrícula
- [x] Admin vê progresso dos alunos na tela da Jornada (`completed / total`)
- [x] Validações de negócio implementadas nas APIs (publicar sem simulado, effective_end_date < hoje, aluno já matriculado, etc.)
- [ ] **Validações testadas** ← sem testes automatizados

### Implementado após Sprint B

- [x] **Edição de dados do aluno** — campos nome, telefone, CPF, observações e concursos de interesse editáveis pelo admin em `/admin/alunos/[id]`
- [x] **Histórico de atividades** — tabela `student_activity_log` com timeline visual na página do aluno
- [x] **Log de edição de campos** — registra campo, valor anterior e novo valor
- [x] **Log de mudança de status** — registra transição de status do aluno
- [x] **Log de atribuição de jornada** — registra início, expiração e quantidade de simulados
- [x] **Log de cancelamento de jornada** — registra qual jornada foi cancelada
- [x] **Log de extensão de prazo** — registra prazo anterior, novo prazo e dias adicionados
- [x] **Log de conclusão de simulado** — registra acertos, percentual e tempo gasto
- [x] **Jornadas inscritas** — seção na página do aluno com progresso e barra percentual
- [x] Migration `008_student_activity_log.sql` criada e aplicada

### Pendências identificadas no Sprint B

- [ ] Botão "Incluir em Jornada" na página de detalhe do simulado (`/simulados/[id]`)
- [ ] Botão "Atribuir a Jornada" no perfil do aluno (`/admin/alunos/[id]`) — previsto na spec seção 3.1
- [ ] Recálculo de `scheduled_release_at` ao editar `exam_date` com alunos ativos — spec seção 2.4
- [ ] Reenvio manual de e-mail de boas-vindas da Jornada pelo admin — spec seção 5
- [ ] Migration aplicada no Supabase (production/staging)
- [ ] Cron job configurado para chamar `/api/admin/jornadas/release-job` periodicamente (Supabase Edge Function + pg_cron)

### Páginas implementadas

- [x] `/admin/jornadas` — listagem com filtros por status e busca por nome
- [x] `/admin/jornadas/nova` — formulário de criação com preview de `effective_end_date`
- [x] `/admin/jornadas/[id]` — detalhe com info, simulados e tabela de alunos com progresso
- [x] `/admin/jornadas/[id]/editar` — abas Informações + Simulados com drag-and-drop
- [x] Sidebar — grupo "Jornadas" com ícones MapPin e Pencil

---


### Ajuste do Sprint Raio-X de Provas — 2026-05-29

- [x] Nome da análise gerado automaticamente no padrão `RaioX - Prova - [Concurso] - [Cargo] - [Ano] - [Banca]`.
- [x] Campo manual de nome da análise removido da tela de nova análise.
- [x] Nova análise agora carrega bancas cadastradas de `exam_boards`.
- [x] Banca da análise passa a ser selecionada por busca na própria tela.
- [x] Caso a banca não exista, a tela permite cadastrar e selecionar usando `/api/admin/exam-boards`.
- [x] API de análise reforçada para sempre derivar o título no backend a partir dos metadados informados.


### Ajuste do Sprint Raio-X de Provas — 2026-05-30

- [x] Caixa de banca reduzida: busca + tag verde de selecionada + resultados + cadastrar banca.
- [x] Removido card marrom duplicado da banca selecionada.
- [x] Entrada da nova análise alterada para texto bruto no mesmo padrão do Importador com IA.
- [x] Editor compartilhado passou a destacar indicações de imagem e imagens com marca-texto/realce visual.
- [x] Nomenclatura visual alterada para Assunto principal e Tópico de cobrança.
- [x] Raio-X aprofundado para detalhar o que foi cobrado dentro de cada assunto de Informática/TI.
- [x] Rotas de IA do Raio-X passam a usar a mesma configuração de modelo da importação (`OPENAI_IMPORT_MODEL`, com fallback para `OPENAI_MODEL`).

## Sprint C — Jornadas (Aluno) — ⬜ Pendente

Depende de Sprint B concluído e migration aplicada.

Escopo previsto:
- [ ] Página `/minhas-jornadas` — lista as jornadas do aluno com progresso
- [ ] Página `/minhas-jornadas/[id]` — detalhe da jornada com simulados e status de liberação
- [ ] Integração com `/meus-simulados/[id]` — simulados acessados via jornada
- [ ] Estados visuais: `locked`, `locked_late`, `available`, `in_progress`, `completed`, `expired`
- [ ] Atualização de `student_jornada_simulados.status` conforme tentativas do aluno

---

## Sprint D — Google + Pagamento — ⬜ Fase 2 (futuro)

- [ ] OAuth Google com merge de conta por email
- [ ] Integração com gateway de pagamento
- [ ] Checkout e gestão de assinaturas/jornadas pagas

---

## Sprint E — Raio-X de Provas — 🔄 MVP implementado para teste

### Decisões aplicadas

- [x] Nome oficial: **Raio-X de Provas**
- [x] Item separado no menu lateral
- [x] MVP sem upload de PDF; entrada inicial por texto bruto, no mesmo padrão do Importador com IA
- [x] Preparado para múltiplas disciplinas no futuro; padrão atual: Informática/TI
- [x] Campos do cabeçalho: Concurso, Cargo, Ano e Banca
- [x] Questões fora da disciplina selecionada devem ser ignoradas pela IA
- [x] IA tenta sugerir gabarito, com edição manual pelo professor
- [x] Opção de marcar questão como anulada
- [x] Editor aceita imagens inline onde o professor colocar
- [x] Badge para questão com imagem/análise visual
- [x] Dashboard com Mapa de Cobrança por assunto principal, tópico de cobrança e conhecimentos cobrados
- [x] Questões exibidas em cards no padrão operacional do Importador com IA
- [x] Ações por questão: Enviar para revisão, Publicar, Descartar, Criar variações
- [x] Seleção em massa com barra fantasma
- [x] Seção final de Clones da Prova preparada como “Em breve”

### Arquivos criados/alterados

- [x] `RODAR-NO-SUPABASE/011_raio_x_provas.sql`
- [x] `app/admin/raio-x-provas/*`
- [x] `app/api/admin/exam-analyses/*`
- [x] `app/components/Sidebar.tsx`
- [x] `app/components/AppShell.tsx`
- [x] `docs/INDICE_FUNCOES_SISTEMA.md`

### Pendências de teste

- [ ] Rodar migration `011_raio_x_provas.sql` no Supabase
- [ ] **Rodar migration `014_raio_x_visual_status.sql`** — enquanto não rodar, análise de prova usa workaround com valores antigos da constraint
- [ ] **Rodar migration `015_exam_contests_positions.sql`** — enquanto não rodar, botão "Cadastrar cargo/concurso" exibe erro explicativo ao usuário
- [ ] Testar análise com `OPENAI_API_KEY` configurada
- [ ] Testar questão com imagem colada no editor
- [ ] Testar envio para revisão exigindo assunto selecionado
- [ ] Testar geração de variações por questão
- [ ] Implementar futuramente geração real de clones da prova

---

## Sprint Raio-X de Provas — atualização de fluxo de revisão — ✅ Implementado em 2026-05-30

- [x] Nova análise agora possui campo de observações iniciais do professor.
- [x] Tela de criação exibe processamento premium com etapas, barra de progresso e botão "Ver questões analisadas" ao concluir.
- [x] Tela de detalhe reorganizada em dois modos: "Revisar questões" e "Ver Raio-X final".
- [x] Revisão passou a exibir uma questão por vez, com navegação por questão e progresso.
- [x] Cada questão possui caixa editável de classificação: assunto no banco, assunto principal, tópico de cobrança, dificuldade, perfil da cobrança e parecer do professor.
- [x] Raio-X final fica em card único, com texto editável pelo professor.
- [x] Botão "Refazer análise" oferece duas opções: refazer apenas o Raio-X ou refazer análise completa.
- [x] Prompt do Raio-X não tenta mais falar sobre adiamentos/cancelamentos; usa apenas dados informados e observações do professor.
- [x] Importador com IA recebeu opção "Prova completa" nos assuntos padrão para uso em textos de prova inteira.
- [x] Migration `013_raio_x_fluxo_revisao_final.sql` criada para adicionar `teacher_opinion` às questões analisadas.


### Ajuste Raio-X — normalização, progresso e status visual — ✅ Implementado

- [x] Campo de banca ajustado para autocomplete compacto, sem card/listagem permanente.
- [x] Concurso, Cargo, Ano e Banca normalizados no frontend e reforçados no backend.
- [x] `visual_analysis_status` padronizado para `none | pending | applied | review_required | failed`.
- [x] Criado SQL `014_raio_x_visual_status.sql` para corrigir a constraint do Supabase e migrar valores antigos.
- [x] Tela de processamento do Raio-X agora exibe barras individuais por tarefa com percentual.
- [x] Em caso de erro, o processamento informa a etapa, mantém contexto e oferece **Tentar novamente** ou **Voltar para edição**.

---

## Atualização — Raio-X: excluir análise + filtros na listagem + autocomplete concurso/cargo + C/E premium — ✅ Implementado em 2026-05-30

- [x] `DELETE /api/admin/exam-analyses/[id]` — exclui análise e suas questões analisadas.
- [x] Botão "Excluir" na listagem: hover na linha, confirmação inline.
- [x] Botão "Excluir" no detalhe: topo direito, confirmação em linha antes de redirecionar.
- [x] Filtros na listagem (Concurso, Cargo, Banca, Ano): dropdowns gerados dos valores existentes; "Limpar filtros" quando ativo.
- [x] Nova análise: Concurso e Cargo usam `FieldSearch` (autocomplete com sugestões do banco, digitação livre aceita).
- [x] Alternativas C/E no QuestionCard do Raio-X: corujinha na correta, Certo correto = verde, Errado correto = vermelho; hover direcional por tipo.

---

## Atualização — Raio-X: card de questão alinhado ao Importador com IA — ✅ Implementado

- [x] Card de questão do Raio-X compactado.
- [x] Barra de metadados reorganizada no padrão Ano/Banca/Dificuldade/Tipo/Status.
- [x] Editor rico compartilhado mantido, com a mesma base do Importador com IA.
- [x] Alternativas reduzidas e com botão circular para marcação de gabarito.
- [x] Ações movidas para rodapé, reduzindo poluição visual no topo.
- [x] Classificação da IA e Parecer do Professor agrupados em bloco compacto.

---

## Atualização — Normalização de assuntos Microsoft — ✅ Implementado em 2026-06-01

- [x] Regra oficial definida: `Windows` → `Microsoft Windows`, `Word` → `Microsoft Word`, `Excel` → `Microsoft Excel`, `PowerPoint` → `Microsoft PowerPoint`.
- [x] Cadastro individual de assuntos normaliza automaticamente esses quatro nomes antes de salvar.
- [x] Cadastro em massa de assuntos normaliza automaticamente esses quatro nomes antes de salvar.
- [x] Placeholders da área de Assuntos foram ajustados para a nova nomenclatura.
- [x] Prompts e fallbacks do Raio-X de Provas foram ajustados para usar os nomes completos nos assuntos principais.
- [x] Criado SQL `011_renomear_assuntos_microsoft.sql` para renomear/mesclar assuntos existentes no banco e preservar vínculos das questões.
- [x] Índice do sistema atualizado em `docs/INDICE_FUNCOES_SISTEMA.md`.

### Pendência operacional

- [ ] Rodar `RODAR-NO-SUPABASE/011_renomear_assuntos_microsoft.sql` no Supabase antes de validar a nomenclatura antiga no banco real.

## Sprint — Importador com IA / Órgão da questão — 🔄 Preparado

- [x] Importador com IA passa a detectar `Órgão:` / `Orgao:` em textos colados de portais como QConcursos.
- [x] Card de importação passa a exibir e permitir edição do campo Órgão antes do envio para revisão.
- [x] Fluxo de salvamento da importação passa a persistir `questions.orgao`.
- [x] Editor central de questão passa a carregar, editar e salvar `orgao`.
- [ ] Rodar migration `012_questions_orgao.sql` no Supabase.
- [ ] Rodar, se desejado, o script destrutivo `013_descartar_questoes_inseridas_hoje.sql` para remover questões criadas hoje.

## Atualização — Banco de Questões: relatório de uso em simulados — ✅ Implementado em 2026-06-08

- [x] `/questoes` passa a carregar os vínculos atuais da questão em `simulado_questions`.
- [x] Card da questão exibe a seção **Uso em simulados** na parte inferior.
- [x] Simulados vinculados aparecem como chips clicáveis para `/simulados/[id]`.
- [x] Questões removidas de simulados não aparecem no relatório, pois a remoção apaga o vínculo em `simulado_questions`.
- [x] Índice atualizado em `docs/INDICE_FUNCOES_SISTEMA.md`.
- [x] Documentação de simulados atualizada em `docs/Sprint-simulados.md`.

## Atualização — Edição de Simulados: enviar questão para outro simulado + índice de acertos — ✅ Implementado em 2026-06-08

- [x] `/simulados/[id]/editar` ganhou ação por questão para enviar/vincular a questão a outro simulado sem sair da tela atual.
- [x] A ação mantém a questão no simulado original e usa o endpoint existente `POST /api/admin/simulados/[id]/questions`.
- [x] Cards de questões vinculadas e seletor do banco exibem índice real de acerto por questão.
- [x] O índice considera `simulado_answers` por `question_id`, com acertos, erros, total respondido e percentual.
- [x] Índice atualizado em `docs/INDICE_FUNCOES_SISTEMA.md`.
- [x] Documentação de simulados atualizada em `docs/Sprint-simulados.md`.

## Atualização — Raio-X: duplicidade preventiva no banco de questões — ✅ Implementado em 2026-06-08

- [x] `/admin/raio-x-provas/[id]` passa a checar duplicidade no banco antes do envio para revisão/publicação.
- [x] A checagem usa `/api/admin/questions/check-duplicate` e considera questões existentes em qualquer status.
- [x] Questões duplicadas mostram aviso no card e ocultam **Publicar** e **Enviar para revisão**.
- [x] O bloqueio posterior via `ignored_temp_ids` do salvamento foi mantido como segunda camada.
- [x] Índice atualizado em `docs/INDICE_FUNCOES_SISTEMA.md`.
- [x] Documentação do sprint atualizada em `docs/Sprint-raio-x.md`.

## Atualização — Raio-X Relatório: mapa de cobrança por tópico — ✅ Implementado em 2026-06-08

- [x] A seção **O que foi cobrado dentro de cada assunto** passou a exibir tags em lista com setas.
- [x] O Parecer do Professor deixou de aparecer como tag nos cards de tópico.
- [x] O parecer permanece como insumo editorial do Parecer EstudoTOP do relatório.
- [x] Índice e documentação do sprint atualizados.

## Atualização — Raio-X: recuperar status Revisada sem regenerar — ✅ Implementado em 2026-06-08

- [x] Análises com Raio-X já gerado podem voltar para **Revisada** ao salvar, sem regenerar relatório.
- [x] O botão **Ver Raio-X final** também recupera o status quando as questões ativas estão classificadas/revisadas.
- [x] Questões anuladas continuam sem bloquear a conclusão.
- [x] Índice e documentação do sprint atualizados.


## Atualização — Assuntos: normalização visual de conectivos — ✅ Implementado em 2026-06-10

- [x] Confirmado que a tela `/assuntos` possuía mais de uma renderização do nome do assunto.
- [x] O card fechado/truncado ainda usava `item.name` diretamente, por isso continuava exibindo `Internet E Rede...`.
- [x] Criada/reforçada a função `normalizeDisplayName()` em `app/lib/utils/text.ts` para exibição segura.
- [x] Cards, mensagens e confirmações da página `Assuntos` passaram a usar `normalizeDisplayName()` na exibição.
- [x] Índice atualizado em `docs/INDICE_FUNCOES_SISTEMA.md`.
- [x] Não houve alteração de banco de dados nem SQL.

## Atualização — Seletor de questões do Simulado: filtros recolhíveis, cards compactos e modelo — ✅ Implementado em 2026-06-10

- [x] Corrigido erro de runtime em `/assuntos`: `normalizeDisplayName is not a function`.
- [x] A página `/assuntos` agora usa normalização visual local segura para evitar falhas de bundle/hot reload.
- [x] O modal **Selecionar questões** em `/simulados/[id]/editar` ganhou botão para recolher/expandir filtros.
- [x] Os cards do seletor de questões foram compactados apenas nessa tela, com menor fonte e menor espaçamento para caber mais questões na área visível.
- [x] Cada questão do seletor ganhou ação **Usar como modelo**, reaproveitando o fluxo existente de criação manual por modelo.
- [x] A tela `/simulados` passou a manter a sidebar visível: as camadas decorativas do fundo foram alteradas de `fixed` para `absolute`.
- [x] Índice atualizado em `docs/INDICE_FUNCOES_SISTEMA.md`.
- [x] Não houve SQL nem alteração de banco.

### Ajuste — Seletor de questões do Simulado e Assuntos — 2026-06-10

- [x] Corrigida a rolagem do modal **Selecionar questões**: filtros e cards agora rolam juntos.
- [x] Barra de filtros do seletor agora recolhe de fato e mostra estado compacto.
- [x] Compactação visual do seletor mantida apenas nessa tela.
- [x] Nomes de assuntos no seletor e na página `/assuntos` passam por normalização local segura para exibir conectivos em minúsculo.

## Ajuste — Seletor de questões do Simulado: foco automático nos filtros e dropdown acima dos cards — ✅ Implementado em 2026-06-10

- [x] Filtros multi-seleção do modal **Selecionar questões** agora focam automaticamente o campo de busca ao abrir.
- [x] O usuário pode clicar no filtro e começar a digitar imediatamente, sem segundo clique no campo de busca.
- [x] Dropdowns dos filtros agora ficam acima dos cards de questões e dos botões do card, evitando sobreposição por trás.
- [x] Mantida a regra de compactação apenas nessa tela.
- [x] Não houve SQL nem alteração de banco.

## Sprint E-mails — correção do e-mail institucional de boas-vindas — ✅ Implementado em 2026-06-12

- [x] O reenvio manual em `/admin/alunos/[id]` agora usa o e-mail institucional **"🦉 Você chegou!"**.
- [x] O reenvio deixou de usar o fluxo de primeiro acesso/senha, evitando o envio do e-mail "Seu acesso foi liberado" com login/link indefinidos.
- [x] O template `studentWelcomeTemplate` foi redesenhado com fundo claro, interface clean, card branco, tipografia legível e espaçamento confortável entre parágrafos.
- [x] O cadastro administrativo de aluno também usa o mesmo template institucional de boas-vindas.
- [x] O status `welcome_email_status` passa a ser atualizado para `sent` após envio bem-sucedido e para `failed` em caso de erro.

## Sprint E-mails — reforço do template claro e reenvio institucional — ✅ Corrigido em 2026-06-12

- [x] `studentWelcomeTemplate` foi substituído por uma versão clara, sem qualquer bloco de primeiro acesso, login, senha, link ou botão de definição de senha.
- [x] O corpo do e-mail agora segue exatamente o texto institucional aprovado para o assunto **"🦉 Você chegou!"**.
- [x] `POST /api/admin/students/resend-welcome`, criação administrativa de aluno e helper `sendStudentWelcomeEmail` enviam o mesmo HTML claro e também uma versão `text/plain` do conteúdo.
- [x] O e-mail institucional possui marcador interno `ESTUDOTOP_WELCOME_CLEAN_V3` para diferenciar claramente o template novo de qualquer e-mail antigo em cache ou fluxo de primeiro acesso.

---

## Atualização — Categoria visual das Jornadas — ✅ Implementado em 2026-06-13

- [x] Campo de categoria incluído no modelo de Jornada.
- [x] Categorias oficiais: Área da Saúde, Policial, Tribunais e Administrativo.
- [x] Criação de Jornada permite selecionar a categoria com prévia visual.
- [x] Edição de Jornada permite alterar a categoria.
- [x] Cards da listagem usam a miniatura correspondente à categoria, sem alternância por índice.
- [x] Quatro imagens oficiais adicionadas em `public/jornadas/categories/`.
- [x] APIs de criação e edição validam os valores permitidos.
- [x] Índice funcional e documentação da Sprint Jornadas atualizados.
- [ ] Executar `app/supabase_migrations/011_jornadas_categoria.sql` no Supabase antes dos testes integrados.

---

## Atualização — Admin Simulados/Jornadas — 2026-06-17

- [x] Edição de questão aberta pelo Simulado em modo popup agora salva direto no banco e não exibe botão Publicar.
- [x] Perfil do aluno ganhou modal **Ver cronograma da jornada** dentro de Jornadas inscritas.
- [x] Modal do cronograma mostra datas previstas/reais, status e tentativas por simulado.
- [x] Admin pode liberar manualmente um simulado para um aluno sem alterar as datas dos demais.
- [x] Admin pode reverter liberação manual apenas se o aluno ainda não iniciou/concluiu o simulado.
- [x] Admin pode ajustar tentativas consumidas por aluno/simulado sem apagar histórico real.

---

## Atualização — Padronização de modais de confirmação/aviso/sucesso — ✅ Implementado em 2026-06-22

- [x] Levantamento completo de todos os modais do sistema feito a partir de `docs/INDICE_FUNCOES_SISTEMA.md` (seção 20 — mapa de modais).
- [x] `PremiumModal` (`app/components/ui/PremiumModal.tsx`) passou a ser o componente central para modais de confirmação/aviso/sucesso/erro, com prop `theme` (`"dark"` ou `"light"`) para acompanhar o tema da tela onde é usado, prop `icon` para casos com ícone customizado e `dismissible` para esconder o botão de fechar quando a confirmação é obrigatória.
- [x] Migrados para usar o `PremiumModal` por dentro: `app/questoes/duplicatas/page-client.tsx` (limpeza de duplicatas), `app/assuntos/page-client.tsx` e `app/disciplinas/page-client.tsx` (ativar/inativar/excluir), `app/minhas-jornadas/[id]/page-client.tsx` (aviso de progressão) e `app/meus-simulados/[id]/page-client.tsx` (`FinishConfirm` e `FullScreenModal`, este preservando o ícone grande e a cor do botão por contexto de acerto/erro durante a prova).
- [x] Nenhuma assinatura de função local existente foi alterada — apenas a casca visual interna passou a reaproveitar o componente central.
- [x] Modais com barra de progresso/steps (`questoes/page-client.tsx`, `questoes/gerar-ia/page-client.tsx`), o `DarkOverlay` genérico (`admin/jornadas/[id]/page-client.tsx`) e os modais funcionais de formulário/cronograma (`admin/alunos/[id]/page-client.tsx`) foram deixados de fora desta rodada por decisão do usuário.
- [x] `tsc --noEmit` e `eslint` rodados nos arquivos alterados — sem novos erros introduzidos.
- [x] Índice atualizado em `docs/INDICE_FUNCOES_SISTEMA.md` (seção 20.1, 20.2, 20.3, 20.4 e nova 20.7).

---

## Sprint Resultados — Etapa 1 Parecer da Coruja — ✅ Implementado em 2026-06-24

- [x] Criado documento oficial `docs/Sprint-resultados.md` para centralizar todas as decisões pedagógicas, visuais e técnicas da Sprint Resultados.
- [x] Tela de resultado do aluno passou a usar a Etapa 1 com Coruja por faixa, título dinâmico, resultado numérico, parecer-base, sinais comportamentais e convite para continuar.
- [x] Adicionadas 5 corujas oficiais em `public/images/resultados/`, uma para cada faixa de aproveitamento.
- [x] Implementadas 5 faixas oficiais: 0–10%, 11–40%, 41–74%, 75–99% e 100%.
- [x] Implementados 25 pareceres-base aprovados, com 5 variações por faixa.
- [x] Sinais comportamentais entram depois do parecer-base e respeitam o limite de até 2 sinais positivos e até 2 pontos de atenção.
- [x] Eventos de inatividade superiores a 60 segundos passam a ser registrados durante a execução do simulado.
- [x] Uso da tesourinha passa a ser registrado por questão durante a execução do simulado.
- [x] API de resultado passa a retornar métricas comportamentais para alimentar o Parecer da Coruja.
- [x] Detalhe administrativo do simulado passa a exibir tempo médio de resolução junto da nota média.
- [x] Índice atualizado para apontar `docs/Sprint-resultados.md` como fonte oficial da Sprint Resultados.
- [ ] Executar `app/supabase_migrations/014_resultados_behavior_metrics.sql` no Supabase antes dos testes integrados.

### Ajuste — Jornada do aluno: cronograma e resultado — ✅ Implementado

- [x] Tabela **Liberações individuais** em `/minhas-jornadas/[id]` mantém os botões de simulados concluídos alinhados e com mesma largura.
- [x] Simulado concluído exibe **Resolvido** em verde e **Ver resultado** na mesma célula de status.
- [x] Cabeçalho e células do cronograma foram alinhados por coluna para melhorar organização visual.
- [x] Ajuste visual restrito à área do aluno, sem alteração de API, banco ou regra de liberação.

### Ajuste — Edição de Jornada em dark premium — ✅ Implementado em 2026-07-08

- [x] Tela `/admin/jornadas/[id]/editar` ajustada para manter o padrão dark premium de Jornadas.
- [x] Aba Informações convertida para componentes `variant="jornada"`.
- [x] Aba Simulados / alteração de ordem convertida para cards e botões dark premium.
- [x] Nenhuma regra de banco, API ou fluxo de reordenação foi alterada neste ajuste visual.



## Ajuste — Jornada Admin: estados dos simulados no detalhe — ✅ Implementado

- [x] Na tela de detalhe da Jornada, simulados futuros agora aparecem como **Programado**.
- [x] O estado **Bloqueado** deixou de ser usado na lista administrativa geral de simulados da Jornada, pois bloqueio depende da matrícula/progressão individual do aluno.
- [x] Arquivo alterado: `app/admin/jornadas/[id]/page-client.tsx`.

---

## Governança Técnica Oficial — ✅ Implantada em 2026-07-10

- [x] Criada a Constituição Técnica oficial do EstudoTOP Simulados.
- [x] Criada a Política de Git e Versionamento, contemplando os fluxos por ZIP, Codex e Claude Code.
- [x] Criada a Política de Banco de Dados e Migrations.
- [x] Definido `supabase/migrations/` como único diretório oficial para novas migrations.
- [x] Reconhecido o banco Supabase atual como fonte operacional da estrutura em funcionamento.
- [x] Criada a Política de Assets.
- [x] Definido `public/` como única estrutura oficial para assets usados em runtime.
- [x] Criada a Política de Desenvolvimento com as 10 etapas obrigatórias de toda Sprint.
- [x] Criada a Política de Documentação.
- [x] Criada a Política de Deploy.
- [x] Criados os checklists oficiais de Sprint e Deploy.
- [x] Atualizado `docs/INDICE_FUNCOES_SISTEMA.md` com a seção de Governança Técnica Oficial.
- [x] Estabelecido que documentos aprovados permanecem congelados e só mudam quando houver alteração permanente da regra correspondente.
- [x] Nenhuma migration foi criada, alterada ou executada nesta atualização documental.

### Documentos oficiais criados

- `docs/00-CONSTITUICAO-TECNICA.md`
- `docs/01-POLITICA-GIT.md`
- `docs/02-POLITICA-MIGRATIONS.md`
- `docs/03-POLITICA-ASSETS.md`
- `docs/04-POLITICA-DESENVOLVIMENTO.md`
- `docs/05-POLITICA-DOCUMENTACAO.md`
- `docs/06-POLITICA-DEPLOY.md`
- `docs/07-CHECKLIST-SPRINT.md`
- `docs/08-CHECKLIST-DEPLOY.md`

---

## Consolidação — Índices de performance do módulo de questões — ✅ Convertido em migration oficial em 2026-07-10

- [x] O SQL avulso `performance-indexes.sql` (raiz do projeto, órfão, sem referências no código ou documentação) foi convertido em migration oficial.
- [x] Migration criada: `supabase/migrations/20260710120000_add_question_performance_indexes.sql`.
- [x] Finalidade: índices de performance do módulo de questões — filtros da listagem administrativa (`/questoes`), classificação de dificuldade em lote (`classify-difficulty`) e detecção de duplicatas por fingerprint (`exam_board_id`, `question_fingerprint`).
- [x] Conferência somente-leitura em `pg_indexes` do banco operacional realizada antes da conversão: 5 índices já existem com nome e definição idênticos (mantidos com `if not exists`, no-op), 4 ainda não existem (`idx_questions_year`, `idx_questions_status_difficulty`, `idx_questions_no_difficulty`, `idx_questions_board_fingerprint`).
- [x] Índices omitidos por redundância comprovada: `idx_question_subjects_question_id` e `idx_question_subjects_subject_id` — o banco já possui os equivalentes `question_subjects_question_id_idx` e `question_subjects_subject_id_idx`.
- [x] `performance-indexes.sql` removido da raiz, sem cópia paralela.
- [ ] **A migration NÃO foi executada.** Sua execução no Supabase depende de autorização explícita (MIG-012). O banco não foi alterado.

